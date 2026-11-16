// Ironman saves (release_engineering.md 5.1 and 5.9, D-073): an ironman run has one slot,
// written only by the autosave triggers and on exit; the player never loads an older
// generation of it, except through corruption recovery (5.6), which works as for any run
// and marks the result recovered. The save writer (RunSaver) enforces the slot and trigger
// rules; the recovery path is the only way to an older snapshot of the run, so the
// "recoverable saves" list of 5.7 leaves ironman runs out (withoutIronmanRuns).

import type { Recoverable, SlotRecord } from './backend';
import type { SlotId } from './header';

/** What asked for a save. */
export type SaveTrigger = 'auto' | 'exit' | 'quick' | 'manual' | 'recovery';

/** The one slot of an ironman run. */
export const IRONMAN_SLOT: SlotId = 'ironman';

/** Triggers an ironman run saves on: the autosave points, exit, and recovery. */
export const IRONMAN_TRIGGERS: readonly SaveTrigger[] = ['auto', 'exit', 'recovery'];

/** Why a save breaks the slot rules of 5.9 (developer text), or null when it may go ahead. */
export function ironmanViolation(
  ironman: boolean,
  slot: SlotId,
  trigger: SaveTrigger | undefined,
): string | null {
  if (!ironman) {
    return slot === IRONMAN_SLOT ? 'only an ironman run saves to the ironman slot' : null;
  }
  if (slot !== IRONMAN_SLOT) return `an ironman run saves only to the ironman slot, not ${slot}`;
  if (trigger === undefined || !IRONMAN_TRIGGERS.includes(trigger)) {
    return `an ironman run saves only on autosave points and exit, not ${trigger ?? 'unnamed'} saves`;
  }
  return null;
}

/** Run ids of ironman runs: headers (either generation) flagged so, or in the ironman slot. */
export function ironmanRuns(records: readonly SlotRecord[]): Set<string> {
  const out = new Set<string>();
  for (const r of records) {
    for (const h of [r.header, r.prev]) {
      if (h && (h.flags.ironman || r.slot === IRONMAN_SLOT)) out.add(h.runId);
    }
  }
  return out;
}

/**
 * The recoverable saves a player may restore at will (5.7): an ironman run's older
 * snapshots are reachable only through corruption recovery (./recovery.ts).
 */
export function withoutIronmanRuns(
  list: readonly Recoverable[],
  records: readonly SlotRecord[],
): Recoverable[] {
  const runs = ironmanRuns(records);
  return list.filter((r) => !runs.has(r.runId));
}
