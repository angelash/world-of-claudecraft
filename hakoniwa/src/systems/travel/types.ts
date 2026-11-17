// Travel system types: the time-skip kernel's slice, commands and events
// (travel_and_exploration.md 7 and 9.3). Region-map travel, fog, discovery and gates
// (PK-M1-17) extend this slice and these maps later.

import type { TextRef } from '../../core/text';

/** What a skip stands for: the rest rules it answers to and the summary it writes. */
export const SKIP_KINDS = ['wait', 'sleep', 'travel'] as const;
export type SkipKind = (typeof SKIP_KINDS)[number];

/**
 * Settlement tier (7.5): `short` runs every tick in off-screen mode (8 hours or less by
 * default), `long` steps the clock one game hour at a time through the skip handlers.
 */
export const SKIP_MODES = ['short', 'long'] as const;
export type SkipMode = (typeof SKIP_MODES)[number];

export type SkipOutcome = 'done' | 'interrupted' | 'cancelled';

/** One line of the skip summary (7.6): what happened, when, and on what. */
export interface SkipNote {
  tick: number;
  /** the world event kind that wrote the note (quest.completed, combat.wave_spawned, ...) */
  event: string;
  /** the content id or entity it concerns, when there is one */
  ref?: string;
}

/** A running skip. */
export interface SkipState {
  kind: SkipKind;
  mode: SkipMode;
  /** who skips (the player) */
  entityId: string;
  startTick: number;
  endTick: number;
  /** the next tick at which the hourly checks run (rest rules, night ambush) */
  checkTick: number;
  /** sleeping out in the field: the camp's ambush roll per hour (0 in towns and indoors) */
  ambush: number;
  notes: SkipNote[];
  /** notes past the summary cap, folded */
  more: number;
}

/** The last finished skip, for the summary card and the log. */
export interface SkipSummary {
  kind: SkipKind;
  mode: SkipMode;
  startTick: number;
  endTick: number;
  /** the tick the skip had planned to reach */
  plannedTick: number;
  outcome: SkipOutcome;
  reason?: TextRef;
  notes: SkipNote[];
  more: number;
}

export interface TravelSlice {
  skip: SkipState | null;
  last: SkipSummary | null;
}

declare module '../../core/contracts' {
  interface WorldSlices {
    travel: TravelSlice;
  }
  interface CommandMap {
    /** Wait in place 1 to 8 whole hours, or until a time of day at most 8 hours away (7.1). */
    'time.wait': { hours?: number; until?: { hour: number; minute?: number } };
    /** Sleep to the next 06:00 (7.1, 7.3). */
    'time.sleep': Record<string, never>;
    /**
     * The one kernel entry every skip turns into (7.5): `hours` of game time, standing for
     * `kind` (default wait), settled in `mode` (default: short up to 8 hours, else long).
     * A sleep always ends at the next 06:00; travel skips come from the travel system and
     * scripts, never from the player directly.
     */
    'time.skip': { hours?: number; kind?: SkipKind; mode?: SkipMode };
    /** Stop the running skip at the current tick (the skip overlay's cancel key, 8). */
    'time.cancel': Record<string, never>;
  }
  interface EventMap {
    'time.skip_started': {
      kind: SkipKind;
      mode: SkipMode;
      entityId: string;
      startTick: number;
      endTick: number;
    };
    /** A skip ended: completed, interrupted (with the reason) or cancelled; the summary (7.6). */
    'time.skipped': {
      kind: SkipKind;
      mode: SkipMode;
      entityId: string;
      outcome: SkipOutcome;
      /** game hours actually advanced */
      hours: number;
      reason?: TextRef;
      notes: SkipNote[];
      more: number;
    };
    /**
     * Any system may stop a running skip at this tick (7.4: a story beat, a deadline, a
     * messenger, a companion asking for the player, a territory crisis).
     */
    'time.interrupt': { reason: TextRef; ref?: string };
    /** A night ambush rolled while sleeping out in the field (7.4); the sleeper wakes. */
    'time.ambush': { entityId: string; mapId: string; x: number; y: number };
  }
}
