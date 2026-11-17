// Bounded per-persona memory (npc_society_ai.md 5): entries keyed by persona id and
// world time, with source and credibility; daily deterministic consolidation keeps the
// important and the recent and folds the rest into a one-line digest.

import type { SystemContext } from '../../core/system';
import { clipText, joinText, type KeyText, type TextParam, tr } from '../../core/text';
import { calendarAt } from '../../core/time';
import { DIGEST_CAP, MEMORY_CAP, MEMORY_KEEP_IMPORTANT, MEMORY_KEEP_RECENT } from './constants';
import type { MemoryEntry, MemorySource, Mind } from './types';

export interface MemoryInput {
  text: TextParam;
  /** the short phrase of the {memory} fill slot (builtin_ai.md 5.3) */
  short?: TextParam;
  src: MemorySource;
  cred?: number;
  about?: string;
  imp?: number;
  tag?: string;
}

const DEFAULT_CRED: Record<MemorySource, number> = {
  seen: 1,
  self: 1,
  heard: 0.5,
  inferred: 0.3,
};

/** Port: record a memory for a named persona (no-op for L4 residents). */
export function addMemory(ctx: SystemContext, npcId: string, input: MemoryInput): void {
  const mind = ctx.world.slices.npc.minds[npcId];
  if (!mind) return;
  pushMemory(mind, {
    tick: ctx.tick,
    day: calendarAt(ctx.tick).dayIndex,
    text: clipText(input.text, 120),
    short: input.short === undefined ? undefined : clipText(input.short, 40),
    src: input.src,
    cred: Math.max(0, Math.min(1, input.cred ?? DEFAULT_CRED[input.src])),
    about: input.about,
    imp: Math.max(0, Math.min(1, input.imp ?? 0.3)),
    tag: input.tag,
  });
}

export function pushMemory(mind: Mind, entry: MemoryEntry): void {
  mind.mem.push(entry);
  if (mind.mem.length <= MEMORY_CAP) return;
  // over the cap within a day: drop the least important, oldest first
  let worst = 0;
  for (let i = 1; i < mind.mem.length - 1; i++) {
    const a = mind.mem[i] as MemoryEntry;
    const b = mind.mem[worst] as MemoryEntry;
    if (a.imp < b.imp) worst = i;
  }
  mind.mem.splice(worst, 1);
  mind.folded += 1;
}

/** Display name of a memory source (a fresh TextRef each call: it ends up in world state). */
function srcName(src: MemorySource): KeyText {
  switch (src) {
    case 'seen':
      return tr('sys.npc.memory.src.seen');
    case 'heard':
      return tr('sys.npc.memory.src.heard');
    case 'inferred':
      return tr('sys.npc.memory.src.inferred');
    default:
      return tr('sys.npc.memory.src.self');
  }
}

/**
 * Daily consolidation: keep the most important entries and the most recent ones, fold
 * the rest into a digest line for that day ("省略不等于没发生").
 */
export function consolidateMemory(mind: Mind, day: number): void {
  if (mind.mem.length <= MEMORY_KEEP_IMPORTANT + MEMORY_KEEP_RECENT) return;
  const recent = new Set(mind.mem.slice(-MEMORY_KEEP_RECENT));
  const ranked = mind.mem
    .filter((m) => !recent.has(m))
    .map((m, i) => ({ m, i }))
    .sort((a, b) => b.m.imp - a.m.imp || b.i - a.i);
  const keep = new Set(ranked.slice(0, MEMORY_KEEP_IMPORTANT).map((r) => r.m));
  const dropped = mind.mem.filter((m) => !keep.has(m) && !recent.has(m));
  if (dropped.length === 0) return;
  const bySrc: Partial<Record<MemorySource, number>> = {};
  for (const m of dropped) bySrc[m.src] = (bySrc[m.src] ?? 0) + 1;
  const parts = (Object.keys(bySrc) as MemorySource[]).map((s) =>
    tr('sys.npc.memory.digest_part', { src: srcName(s), n: bySrc[s] as number }),
  );
  mind.digest.push(
    tr('sys.npc.memory.digest', {
      day,
      count: dropped.length,
      parts: joinText('comma', parts),
    }),
  );
  if (mind.digest.length > DIGEST_CAP) mind.digest.splice(0, mind.digest.length - DIGEST_CAP);
  mind.folded += dropped.length;
  mind.mem = mind.mem.filter((m) => keep.has(m) || recent.has(m));
}

/** Human-readable time (year, season, day, hh:mm), rendered from the tick by the client. */
export function timeLabel(tick: number): KeyText {
  return tr('sys.npc.time.at', { tick });
}

/** Recent memories as prompt or UI lines, newest last, optionally about one subject. */
export function memoryLines(mind: Mind | undefined, limit = 6, about?: string): KeyText[] {
  if (!mind) return [];
  const list = about ? mind.mem.filter((m) => m.about === about) : mind.mem;
  return list.slice(-limit).map((m) =>
    tr('sys.npc.memory.line', {
      time: timeLabel(m.tick),
      src: srcName(m.src),
      cred: m.src === 'heard' && m.cred < 0.5 ? tr('sys.npc.memory.low_cred') : '',
      text: m.text,
    }),
  );
}
