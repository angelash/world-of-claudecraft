// Ailments system (phase 35, PK-M1-51): taint, the taint sicknesses and the injuries on every
// body (progression_and_pacing.md 9, 10; combat_and_classes.md 9.4). Every game hour each
// tracked body spends the hour at the canon sediment where it stands (sedimentAt: a hot spot
// over the map level); at the dawn check (06:00, which is also when a sleeper wakes) the day's
// exposure and wear go on and one roll on the named stream `sed.daily` decides the next
// stage. Injuries run on their own clocks and heal on the hour. The story hooks (the town's
// sediment track and the children's cases, act1_borderstone.md 7.2) settle when a flag
// moves. A time skip changes nothing here: the world's skip step sends every hour and dawn
// it covers, and the skip handler settles the story hooks once per step. Rules only: a
// model never gives or takes a sickness.

import { ok, reject } from '../../core';
import type { CommandSource } from '../../core/contracts';
import type { GameSystem, SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { registerSkipHandler } from '../travel/skip_registry';
import {
  addTaint,
  ailmentsConfig,
  cureStage,
  dawnCheck,
  healInjury,
  injure,
  injuryAllowed,
  itemUsed,
  sampleHour,
  settleInjuries,
  TAINT_FLAG,
  taintFlagWritten,
} from './body';
import { ailmentsSlice, emptyAilmentsSlice, validateAilmentsSlice } from './slice';
import { settleStory, storyFlags } from './story';
import { INJURY_KINDS } from './types';

export * from './body';
export * from './formulas';
export * from './slice';
export * from './story';
export * from './types';
export * from './view';

export const SYSTEM_ID = 'ailments';

/** Sicknesses and wounds come from the rules and the story, never from a proposal. */
const ALLOWED = new Set<CommandSource['type']>(['system', 'script']);

const notAllowed = () => reject('not_allowed', tr('sys.ailments.reject.not_allowed'));

/** The body a command names: the player when it names none. */
function target(ctx: SystemContext, entityId: string | undefined): string | null {
  const id = entityId ?? ctx.world.slices.world.playerId;
  return id && ctx.world.slices.world.entities[id] ? id : null;
}

/** A flag the story hooks read moved: they settle on the next tick. */
function markDirty(ctx: SystemContext, key: string): void {
  const s = ctx.world.slices.ailments;
  if (s && !s.dirty && storyFlags(ctx.content).has(key)) s.dirty = true;
}

registerSkipHandler(SYSTEM_ID, settleStory);

export const system: GameSystem & { validateSlice: typeof validateAilmentsSlice } = {
  id: SYSTEM_ID,
  order: 35,
  validateSlice: validateAilmentsSlice,

  init(ctx) {
    ctx.world.slices.ailments = emptyAilmentsSlice();
  },

  tick: settleStory,

  commands: {
    'ailments.taint'(ctx, d, source) {
      if (!ALLOWED.has(source.type)) return notAllowed();
      const id = target(ctx, d.entityId);
      if (!id) return reject('no_body', tr('sys.ailments.reject.no_body'));
      if (!ailmentsConfig(ctx)) return reject('no_rules', tr('sys.ailments.reject.no_rules'));
      if (typeof d.amount !== 'number' || !Number.isFinite(d.amount))
        return reject('bad_amount', tr('sys.ailments.reject.bad_amount'));
      addTaint(ctx, id, d.amount);
      return ok();
    },
    'ailments.cure'(ctx, d, source) {
      if (!ALLOWED.has(source.type)) return notAllowed();
      const id = target(ctx, d.entityId);
      if (!id) return reject('no_body', tr('sys.ailments.reject.no_body'));
      const stages = d.stages ?? 1;
      if (typeof stages !== 'number' || !Number.isFinite(stages) || stages < 1)
        return reject('bad_amount', tr('sys.ailments.reject.bad_amount'));
      if (!cureStage(ctx, id, stages))
        return reject('not_sick', tr('sys.ailments.reject.not_sick'));
      return ok();
    },
    'ailments.injure'(ctx, d, source) {
      if (!ALLOWED.has(source.type)) return notAllowed();
      const id = target(ctx, d.entityId);
      if (!id) return reject('no_body', tr('sys.ailments.reject.no_body'));
      if (!INJURY_KINDS.includes(d.kind) || !injuryAllowed(ctx, id, d.kind))
        return reject('bad_kind', tr('sys.ailments.reject.bad_kind'));
      if (d.days !== undefined && !(Number.isFinite(d.days) && d.days >= 0))
        return reject('bad_amount', tr('sys.ailments.reject.bad_amount'));
      if (!injure(ctx, id, d.kind, d.days))
        return reject('bad_kind', tr('sys.ailments.reject.bad_kind'));
      return ok();
    },
    'ailments.heal'(ctx, d, source) {
      if (!ALLOWED.has(source.type)) return notAllowed();
      const id = target(ctx, d.entityId);
      if (!id) return reject('no_body', tr('sys.ailments.reject.no_body'));
      if (d.kind !== undefined && !INJURY_KINDS.includes(d.kind))
        return reject('bad_kind', tr('sys.ailments.reject.bad_kind'));
      if (healInjury(ctx, id, d.kind) === 0)
        return reject('not_hurt', tr('sys.ailments.reject.not_hurt'));
      return ok();
    },
  },

  on: {
    'world.hour'(ctx, e) {
      const cfg = ailmentsConfig(ctx);
      if (!cfg) return;
      ailmentsSlice(ctx.world);
      sampleHour(ctx);
      settleInjuries(ctx);
      if (e.data.hour === cfg.checkHour) dawnCheck(ctx);
    },
    'flag.changed'(ctx, e) {
      if (e.data.key === TAINT_FLAG) taintFlagWritten(ctx, e.data.value);
      markDirty(ctx, e.data.key);
    },
    'item.used'(ctx, e) {
      // the taint and sickness effects of consumables (catalog_consumables_magitools.md 2.9)
      itemUsed(ctx, e.data);
    },
    'combat.player_returned'(ctx) {
      // remade in the court: every injury is gone, the taint stays (10.2, 9.4)
      healInjury(ctx, ctx.world.slices.world.playerId);
    },
  },
};
