// Bounded per-persona memory (npc_society_ai.md 5): entries keyed by persona id and
// world time, with source and credibility; daily deterministic consolidation keeps the
// important and the recent and folds the rest into a one-line digest.

import type { SystemContext } from '../../core/system';
import { calendarAt } from '../../core/time';
import { DIGEST_CAP, MEMORY_CAP, MEMORY_KEEP_IMPORTANT, MEMORY_KEEP_RECENT } from './constants';
import type { MemoryEntry, MemorySource, Mind } from './types';

export interface MemoryInput {
  text: string;
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
    text: input.text.slice(0, 120),
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

const SRC_NAME: Record<MemorySource, string> = {
  seen: '亲见',
  heard: '听说',
  inferred: '推测',
  self: '自己',
};

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
  const parts = (Object.keys(bySrc) as MemorySource[]).map((s) => `${SRC_NAME[s]} ${bySrc[s]} 条`);
  mind.digest.push(
    `第 ${day} 日前的琐事 ${dropped.length} 条（${parts.join('，')}），省略不等于没发生`,
  );
  if (mind.digest.length > DIGEST_CAP) mind.digest.splice(0, mind.digest.length - DIGEST_CAP);
  mind.folded += dropped.length;
  mind.mem = mind.mem.filter((m) => keep.has(m) || recent.has(m));
}

/** Human-readable time like "998 年春 第 3 日 08:40". */
export function timeLabel(tick: number): string {
  const c = calendarAt(tick);
  const season = ['春', '夏', '秋', '冬'][c.season] ?? '春';
  const hh = String(c.hour).padStart(2, '0');
  const mm = String(c.minute).padStart(2, '0');
  return `${c.year} 年${season} 第 ${c.day} 日 ${hh}:${mm}`;
}

/** Recent memories as prompt or UI lines, newest last, optionally about one subject. */
export function memoryLines(mind: Mind | undefined, limit = 6, about?: string): string[] {
  if (!mind) return [];
  const list = about ? mind.mem.filter((m) => m.about === about) : mind.mem;
  return list.slice(-limit).map((m) => {
    const credNote = m.src === 'heard' && m.cred < 0.5 ? '，不太可信' : '';
    return `${timeLabel(m.tick)}（${SRC_NAME[m.src]}${credNote}）${m.text}`;
  });
}
