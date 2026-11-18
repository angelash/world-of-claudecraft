// Tide system (PK-M1-52, phase 78, after the director and before the quests whose act clock
// writes the start flag at dusk): the written tide nights of act1_borderstone.md 8 (night.ts
// over the pure rules of rules.ts) and the overflows and full nests that turn into monster
// tides (surges.ts). See docs/70_packets/pk_m1_52_tide_night/.
//
// The seam for the NPC brain and the model path (builtin_ai.md 5.8, npc_society_ai.md 9):
// each phase picks every actor's row from the action table filtered by state; a chooser
// (the NPC brain, a model proposal) may name another legal row through `tide.act`, which
// holds from the next phase while the state still allows it. The kernel never takes an
// out-of-bounds row, and never a pick from the player.

import { ok, reject } from '../../core';
import type { GameSystem, SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { TICKS_PER_GAME_HOUR } from '../../core/time';
import type { World } from '../../core/world';
import { conditionHolds, registerCompute } from '../quests/effects';
import { registerSkipHandler } from '../travel/skip_registry';
import {
  creditOf,
  maybeBegin,
  nightDef,
  onDoorSeek,
  runningNight,
  settleLateChildren,
  skipNight,
  tickNight,
} from './night';
import { legalRows } from './rules';
import { emptyTideSlice, readTide, TIDE_ID_FIELDS, validateTideSlice } from './slice';
import { onNestStage, onOverflow } from './surges';
import type { NightState, NightSummary, PhaseResult, TideNightDef, TideSurgeDef } from './types';

export * from './night';
export * from './rules';
export * from './slice';
export * from './surges';
export * from './types';

declare module '../../core/contracts' {
  interface WorldSlices {
    tide: import('./types').TideSlice;
  }
  interface ContentMap {
    tideNights: TideNightDef[];
    tideSurges: TideSurgeDef[];
  }
  interface CommandMap {
    /** a chooser picks an actor's legal row of the action table (never the player) */
    'tide.act': { actor: string; row: string };
  }
  interface EventMap {
    /** a phase of a written tide night began (the stage variable is written too) */
    'tide.phase': { night: string; phase: string; stage: number };
    /** a phase's lines were settled (8.6) */
    'tide.settled': {
      night: string;
      phase: string;
      lines: { line: string; defence: number; pressure: number; gap: number; deaths: number }[];
    };
    /** a named person died or was badly hurt on the night */
    'tide.fate': {
      night: string;
      npc: string;
      fate: 'dead' | 'injured';
      phase: string;
      cause: string;
    };
    /** a building behind a line was damaged (8.6 rule 4) */
    'tide.damaged': { night: string; line: string; place: string; phase: string };
    /** the striker cut the surge (8.5) */
    'tide.strike': { night: string; line: string; gap: number };
    /** the mob rises in this phase (8.4 Bertha; the mob scene plays) */
    'tide.mob': { night: string; phase: string };
    /** a child goes alone after the prisoner (8.4: Cassian refuses, Noi goes) */
    'tide.rescue_attempt': { night: string; phase: string };
    /** dawn: the night is settled (8.6, 8.7) */
    'tide.ended': {
      night: string;
      civilians: number;
      dead: string[];
      survival: string;
      credit: string;
      /** the first tellers of the winning version (the rumor's seeds) */
      tellers: string[];
    };
    /** a shut-out front's people hold the night against the town (8.6) */
    'tide.grievance': { night: string; group: string; amount: number };
    /** an overflow or a full nest turned into a monster tide (or rested on its cooldown) */
    'tide.surge': {
      rule: string;
      source: string;
      toMap: string;
      /** the waves started */
      waves: string[];
      /** waves whose signal still stands from an earlier tide (combat has not cleared it) */
      blocked: string[];
      /** the region rests on its cooldown: nothing came */
      rested: boolean;
    };
  }
}

export const SYSTEM_ID = 'tide';

/** What the client and the debug panel read of the night (plain data). */
export interface TideView {
  night: string;
  phase: string;
  stage: number;
  weakest?: string;
  struck?: boolean;
  results: PhaseResult[];
  summary?: NightSummary;
}

/** The running or last night, for the client (PK-M1-23 and PK-M1-57 present it). */
export function tideView(
  world: World,
  content: { tideNights?: TideNightDef[] },
): TideView | undefined {
  const st: NightState | null | undefined = readTide(world)?.night;
  const def = st ? nightDef(content, st.id) : undefined;
  if (!st || !def) return undefined;
  const ph = def.phases[st.phase];
  return {
    night: st.id,
    phase: ph?.id ?? '',
    stage: ph?.stage ?? 0,
    weakest: st.weakest,
    struck: st.struck,
    results: st.results.map((r) => ({ phase: r.phase, lines: r.lines.map((l) => ({ ...l })) })),
    summary: st.summary ? { ...st.summary } : undefined,
  };
}

/**
 * The registry's compute tide_attribution (world_state_registry.md 2.9; the dawn scene
 * calls it): the credit of the last night settled again from its witnesses (their trust
 * when the colossus fell) and the striker's cut, with the conditions as they are now (a
 * grasped core may have raised the church's suspicion). The night writes it itself when
 * the surge breaks loose; this keeps the summary in step when the scene asks again.
 */
function attribution(ctx: SystemContext): void {
  const st = readTide(ctx.world)?.night;
  const def = st ? nightDef(ctx.content, st.id) : undefined;
  if (!st || !def) return;
  const v = creditOf(ctx, def, st);
  if (!v) return;
  ctx.setFlag(def.vars.credit, v.id);
  if (st.summary) {
    st.summary.credit = v.id;
    st.summary.tellers = [...v.tellers];
  }
}

registerCompute('tide_attribution', attribution);

registerSkipHandler(SYSTEM_ID, (ctx, step) => {
  maybeBegin(ctx);
  skipNight(ctx, step.from, step.to);
  settleLateChildren(ctx);
});

const notAllowed = () => reject('not_allowed', tr('sys.tide.reject.not_allowed'));

export const system: GameSystem & {
  validateSlice: typeof validateTideSlice;
  idFields: typeof TIDE_ID_FIELDS;
} = {
  id: SYSTEM_ID,
  order: 78,
  validateSlice: validateTideSlice,
  idFields: TIDE_ID_FIELDS,

  init(ctx) {
    ctx.world.slices.tide = emptyTideSlice();
  },

  tick(ctx) {
    maybeBegin(ctx);
    tickNight(ctx);
    // a child's deadline after the night is looked at once a game hour
    if (ctx.tick % TICKS_PER_GAME_HOUR === 0) settleLateChildren(ctx);
  },

  commands: {
    'tide.act'(ctx, d, source) {
      // the people of the town decide for themselves; the player acts on the lines
      if (source.type === 'player') return notAllowed();
      const run = runningNight(ctx);
      if (!run) return reject('no_night', tr('sys.tide.reject.no_night'));
      const actor = run.def.actors.find((a) => a.id === d.actor);
      if (!actor) return reject('unknown', tr('sys.tide.reject.unknown'));
      const legal = legalRows(actor, (expr) => conditionHolds(ctx, expr));
      if (!legal.some((r) => r.id === d.row))
        return reject('bad_row', tr('sys.tide.reject.bad_row'));
      run.st.chosen[actor.id] = d.row;
      return ok();
    },
  },

  on: {
    'flag.changed'(ctx, e) {
      const s = readTide(ctx.world);
      if (s?.night && !s.night.ended) s.night.dirty = true;
      // the start flag at dusk: the night begins on the tick it is written
      for (const n of ctx.content.tideNights ?? []) {
        if (e.data.key === n.start && e.data.value) {
          maybeBegin(ctx);
          break;
        }
      }
    },
    'act.week'(ctx) {
      settleLateChildren(ctx);
    },
    'combat.door_seek'(ctx, e) {
      onDoorSeek(ctx, e.data.reason);
    },
    'dungeon.overflow'(ctx, e) {
      onOverflow(ctx, e.data.dungeonId, e.data.toMap);
    },
    'dungeon.nest_stage'(ctx, e) {
      onNestStage(ctx, e.data.nestId, e.data.stage);
    },
  },
};
