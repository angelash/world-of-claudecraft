// Repetition suppression (builtin_ai.md 7.7): the line-history ledger of a speaker-player
// pair, pruned to the newest LINE_HISTORY_CAP keys and saved (bark windows stay transient,
// kept by the caller outside this ledger). Pure data and pure functions, no clock.

/** Per speaker-and-listener ledger: text key to the game day it last fired. */
export interface LineHistory {
  lastSaid: Record<string, number>;
  /** keys in the order they were said, oldest first (for the cap and the oldest-first widen) */
  order: string[];
}

export function newLineHistory(): LineHistory {
  return { lastSaid: {}, order: [] };
}

/** Keys kept per speaker-and-listener pair (builtin_ai 7.7). */
export const LINE_HISTORY_CAP = 64;

/** Record that `key` was said on `dayIndex`; prunes the oldest entry past the cap. */
export function recordLine(history: LineHistory, key: string, dayIndex: number): void {
  if (history.lastSaid[key] === undefined) history.order.push(key);
  else history.order = [...history.order.filter((k) => k !== key), key];
  history.lastSaid[key] = dayIndex;
  while (history.order.length > LINE_HISTORY_CAP) {
    const dropped = history.order.shift();
    if (dropped !== undefined) delete history.lastSaid[dropped];
  }
}

/** True when `key` fired within `windowDays` of `dayIndex` (0 disables suppression). */
export function lineLookedAt(
  history: LineHistory,
  key: string,
  dayIndex: number,
  windowDays: number,
): boolean {
  if (windowDays <= 0) return false;
  const last = history.lastSaid[key];
  return last !== undefined && dayIndex - last < windowDays;
}

/** Oldest-first suppressed keys of a candidate set, for widening the window one at a time. */
export function oldestSuppressed(
  history: LineHistory,
  keys: readonly string[],
  dayIndex: number,
  windowDays: number,
): string[] {
  const set = new Set(keys);
  return history.order.filter((k) => set.has(k) && lineLookedAt(history, k, dayIndex, windowDays));
}
