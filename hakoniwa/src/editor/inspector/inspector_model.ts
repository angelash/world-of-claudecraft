// World inspector model: run-speed pacing, bounded event buffers, entity and event
// filters, flag input parsing, calendar text, and the determinism checks (two fresh
// runs with the same seed and inputs, and a replay of the live command log).
// Pure: no DOM. The engine factory is injected so tests run it in Node.

import type { AnyWorldEvent, CommandSource, ContentMap, FlagValue } from '../../core/contracts';
import { Engine } from '../../core/engine';
import { worldHash } from '../../core/save';
import type { GameSystem } from '../../core/system';
import { type Calendar, TICK_HZ } from '../../core/time';
import type { LoggedCommand } from '../../core/world';
import { renderTextDeep } from '../../shared_ui/i18n';
import type { Entity } from '../../systems/world/types';
import { fmt, SEASONS, T } from '../text';

export const SPEEDS = [1, 2, 4, 10, 25, 50, 100] as const;

/** Commands the inspector sends are logged as an editor script (they replay). */
export const EDITOR_SOURCE: CommandSource = { type: 'script', script: 'editor.inspector' };

/**
 * Whole ticks to run for a frame at a speed multiplier, carrying the fraction. Capped,
 * so a slow frame (or a background tab) never tries to catch up thousands of ticks.
 */
export function ticksForFrame(
  elapsedMs: number,
  speed: number,
  carry: number,
  maxTicks = 2000,
): { ticks: number; carry: number } {
  const exact = carry + (Math.max(0, elapsedMs) / 1000) * TICK_HZ * speed;
  const ticks = Math.floor(exact);
  if (ticks > maxTicks) return { ticks: maxTicks, carry: 0 };
  return { ticks, carry: exact - ticks };
}

/** Fixed-capacity buffer keeping the newest items. */
export class Ring<T> {
  private items: T[] = [];
  private pushed = 0;

  constructor(readonly capacity: number) {}

  push(...items: readonly T[]): void {
    this.pushed += items.length;
    this.items.push(...items);
    if (this.items.length > this.capacity) {
      this.items.splice(0, this.items.length - this.capacity);
    }
  }

  /** Oldest first. */
  toArray(): T[] {
    return [...this.items];
  }

  get size(): number {
    return this.items.length;
  }

  /** Items ever pushed (including dropped ones). */
  get total(): number {
    return this.pushed;
  }

  clear(): void {
    this.items = [];
  }
}

export interface EntityFilter {
  mapId?: string;
  kind?: string;
  text?: string;
}

export function filterEntities(entities: Iterable<Entity>, f: EntityFilter): Entity[] {
  const q = (f.text ?? '').trim().toLowerCase();
  const out: Entity[] = [];
  for (const e of entities) {
    if (f.mapId && e.mapId !== f.mapId) continue;
    if (f.kind && e.kind !== f.kind) continue;
    if (q) {
      const hay = [e.id, e.name, e.ref ?? '', ...e.tags].join(' ').toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push(e);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function eventMatches(ev: AnyWorldEvent, kind: string, text: string): boolean {
  if (kind && ev.kind !== kind) return false;
  const q = text.trim().toLowerCase();
  if (!q) return true;
  // kernel text is TextRefs: search the rendered words, as the event list shows them
  return `${ev.kind} ${JSON.stringify(renderTextDeep(ev.data))}`.toLowerCase().includes(q);
}

/** Newest-first events matching a filter, at most `limit`. */
export function selectEvents(
  events: readonly AnyWorldEvent[],
  kind: string,
  text: string,
  limit: number,
): AnyWorldEvent[] {
  const out: AnyWorldEvent[] = [];
  for (let i = events.length - 1; i >= 0 && out.length < limit; i--) {
    const ev = events[i] as AnyWorldEvent;
    if (eventMatches(ev, kind, text)) out.push(ev);
  }
  return out;
}

export type FlagType = 'number' | 'boolean' | 'string';

export function flagType(v: FlagValue): FlagType {
  return typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string';
}

export function parseFlagInput(
  raw: string,
  type: FlagType,
): { ok: true; value: FlagValue } | { ok: false; error: string } {
  const text = raw.trim();
  if (type === 'number') {
    const n = Number(text);
    return text !== '' && Number.isFinite(n)
      ? { ok: true, value: n }
      : { ok: false, error: T.field.badNumber };
  }
  if (type === 'boolean') {
    if (text === 'true') return { ok: true, value: true };
    if (text === 'false') return { ok: true, value: false };
    return { ok: false, error: T.field.badBoolean };
  }
  return { ok: true, value: raw };
}

/** Flags sorted by key. */
export function flagRows(flags: Record<string, FlagValue>): { key: string; value: FlagValue }[] {
  return Object.keys(flags)
    .sort()
    .map((key) => ({ key, value: flags[key] as FlagValue }));
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatCalendar(cal: Calendar): string {
  return fmt(T.inspector.calendarFmt, {
    year: cal.year,
    season: SEASONS[cal.season] ?? String(cal.season),
    day: cal.day,
    hh: pad2(cal.hour),
    mm: pad2(cal.minute),
  });
}

export function sourceLabel(src: CommandSource): string {
  switch (src.type) {
    case 'player':
      return T.inspector.sourcePlayer;
    case 'ai':
      return `${T.inspector.sourceAi} ${src.agentId}`;
    case 'fallback':
      return `${T.inspector.sourceFallback} ${src.agentId}`;
    case 'system':
      return `${T.inspector.sourceSystem} ${src.system}`;
    case 'script':
      return `${T.inspector.sourceScript} ${src.script}`;
  }
}

/** Parse a command typed into the inspector: {"kind": "...", "data": {...}}. */
export function parseCommandText(
  text: string,
): { ok: true; kind: string; data: unknown } | { ok: false; error: string } {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : T.inspector.commandBad };
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return { ok: false, error: T.inspector.commandBad };
  }
  const o = v as Record<string, unknown>;
  if (typeof o.kind !== 'string' || !o.kind) return { ok: false, error: T.inspector.commandBad };
  return { ok: true, kind: o.kind, data: o.data ?? {} };
}

// ---------------------------------------------------------------------------
// Determinism

/** Player and script commands from a log: the inputs a fresh 'off' run needs. */
export function externalInputs(log: readonly LoggedCommand[]): LoggedCommand[] {
  return log.filter(
    (l) => l.command.source.type === 'player' || l.command.source.type === 'script',
  );
}

/** Step an engine to `ticks`, feeding each input into the inbox right before its tick. */
export function runWithInputs(
  engine: Engine,
  ticks: number,
  inputs: readonly LoggedCommand[],
): number {
  const sorted = inputs
    .map((l, i) => ({ l, i }))
    .sort((a, b) => a.l.tick - b.l.tick || a.i - b.i)
    .map((x) => x.l);
  let next = 0;
  while (engine.tick < ticks) {
    const tick = engine.tick + 1;
    while (next < sorted.length && (sorted[next] as LoggedCommand).tick <= tick) {
      engine.world.inbox.push((sorted[next] as LoggedCommand).command);
      next++;
    }
    engine.step(1);
  }
  return worldHash(engine.world);
}

export interface TwiceResult {
  ticks: number;
  hashA: number;
  hashB: number;
  same: boolean;
}

/** Two fresh worlds from one seed, the same inputs, the same tick count. */
export function runTwice(
  make: (seed: number) => Engine,
  seed: number,
  ticks: number,
  inputs: readonly LoggedCommand[],
): TwiceResult {
  const hashA = runWithInputs(make(seed), ticks, inputs);
  const hashB = runWithInputs(make(seed), ticks, inputs);
  return { ticks, hashA, hashB, same: hashA === hashB };
}

/** Replay a full command log from the seed (no model calls) and hash at `ticks`. */
export function replayHash(
  seed: number,
  content: ContentMap,
  systems: readonly GameSystem[],
  log: readonly LoggedCommand[],
  ticks: number,
): number {
  const engine = Engine.replay(seed, content, systems, log);
  engine.step(ticks);
  return worldHash(engine.world);
}

export function hashText(h: number): string {
  return h.toString(16).padStart(8, '0');
}
