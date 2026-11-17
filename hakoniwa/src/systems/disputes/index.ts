// Disputes system (PK-M1-46, phase 82, after the quests system whose act clock applies the
// chains' weekly default development): the dispute runner of runner.ts, every tick that
// has something to look at and on every hour-coarse skip step. See
// docs/40_design/systems/npc_society_ai.md 9 and docs/70_packets/pk_m1_46_disputes/.
//
// The seam for the NPC brain (PK-M1-18) and the model path (npc.decision_point):
// - the event dispute.decision_opened names the NPC, the legal options and the deadline;
// - openDecisions lists the open points (per actor), decisionMenu gives the legal menu with
//   the rule inputs and utilities (decisionUtility scores persona-derived inputs the same
//   way, builtin_ai.md 5.8);
// - the command disputes.decide answers a point before its deadline (never from the
//   player); without an answer the rule fallback decides at the deadline.

import { ok, reject } from '../../core';
import { contentRef } from '../../core/content_key';
import type { GameSystem, SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { conditionHolds } from '../quests/effects';
import { registerSkipHandler } from '../travel/skip_registry';
import {
  chooseOption,
  disputeDef,
  disputesSlice,
  emptyDisputesSlice,
  needsStep,
  stepDisputes,
} from './runner';
import type { DisputeDef, DisputesSlice, OpenDecision } from './types';
import { decisionUtility, legalOptions, type OptionInputs, optionInputs } from './utility';

export * from './outcomes';
export * from './runner';
export * from './types';
export * from './utility';

declare module '../../core/contracts' {
  interface WorldSlices {
    disputes: DisputesSlice;
  }
  interface ContentMap {
    disputes: DisputeDef[];
  }
  interface CommandMap {
    /** a chooser (NPC brain, model proposal) answers an open decision point */
    'disputes.decide': { disputeId: string; pointId: string; optionId: string };
  }
}

export const SYSTEM_ID = 'disputes';

/** The open decision points, in opening order; with `actor`, only those naming that NPC. */
export function openDecisions(
  world: { slices: { disputes?: DisputesSlice } },
  actor?: string,
): OpenDecision[] {
  const open = world.slices.disputes?.open ?? [];
  return open.filter((o) => actor === undefined || o.actor === actor).map((o) => ({ ...o }));
}

/** One legal option of an open point, with the rule inputs and utility of the fallback. */
export interface MenuOption {
  id: string;
  /** the option's label as a content text reference */
  label: TextParam;
  fixed: boolean;
  inputs: OptionInputs;
  utility: number;
}

/** The legal menu of an open point now (empty when the point is not open). */
export function decisionMenu(ctx: SystemContext, disputeId: string, pointId: string): MenuOption[] {
  const def = disputeDef(ctx.content, disputeId);
  const p = def?.decisions.find((d) => d.id === pointId);
  const open = (ctx.world.slices.disputes?.open ?? []).some(
    (o) => o.dispute === disputeId && o.point === pointId,
  );
  if (!def || !p || !open) return [];
  const holds = (when: string) => conditionHolds(ctx, when);
  return legalOptions(p, holds).map((o) => {
    const inputs = optionInputs(o, holds);
    return {
      id: o.id,
      label: contentRef('disputes', def.id, `decisions.${p.id}.options.${o.id}.label`),
      fixed: !!o.fixed,
      inputs,
      utility: decisionUtility(o.id, inputs).score,
    };
  });
}

registerSkipHandler(SYSTEM_ID, (ctx) => stepDisputes(ctx));

export const system: GameSystem = {
  id: SYSTEM_ID,
  order: 82,

  init(ctx) {
    ctx.world.slices.disputes = emptyDisputesSlice();
  },

  tick(ctx) {
    if (needsStep(ctx)) stepDisputes(ctx);
  },

  commands: {
    'disputes.decide'(ctx, d, source) {
      // the people of the world decide for themselves; the player acts through the nodes
      if (source.type === 'player')
        return reject('not_allowed', tr('sys.disputes.reject.not_allowed'));
      const res = chooseOption(ctx, d.disputeId, d.pointId, d.optionId);
      if (res === 'no_decision')
        return reject('no_decision', tr('sys.disputes.reject.no_decision'));
      if (res === 'bad_option') return reject('bad_option', tr('sys.disputes.reject.bad_option'));
      return ok();
    },
  },

  on: {
    'flag.changed'(ctx) {
      // batched: the conditions are looked at again on the next tick
      disputesSlice(ctx.world).dirty = true;
    },
  },
};
