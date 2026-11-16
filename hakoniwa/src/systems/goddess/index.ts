// Goddess GM system (phase 70): power and faith, sight of the player, the divine action
// arbiter, daily planning with the model (or the utility fallback), honorific wake-ups,
// offerings through Merca's coin, the Maker's revelations, and the miracle ledger (E34).
// See docs/40_design/systems/goddess_gm.md.

import { type CommandSource, type FlagValue, ok, reject } from '../../core';
import type { GameSystem } from '../../core/system';
import { rawText, tr } from '../../core/text';
import type { ModifierTarget } from '../modifiers';
import { sanitizeText } from '../quests/lore';
import { displayName, executeAct, type GoddessActCommand } from './actions';
import { dailyPlans } from './planning';
import { decaySight, goddessDef, newGoddessState, refreshGaze } from './state';
import type { DivineActionDef, GoddessDef, MakerDef, RevelationDef } from './types';
import { adHocRevelation, issueRevelation, makeOffering, onFeat, onPlayerSaid } from './wake';

export * from './actions';
export * from './planning';
export * from './roster';
export * from './state';
export * from './types';
export * from './view';
export * from './wake';

export interface MercaIntelDef {
  id: string;
  /** reveal-ledger condition under which she will sell it */
  when: string;
  text: string;
}

declare module '../../core/contracts' {
  interface WorldSlices {
    goddess: import('./types').GoddessSlice;
  }
  interface ContentMap {
    goddesses: GoddessDef[];
    divineActions: DivineActionDef[];
    revelations: RevelationDef[];
    mercaIntel: MercaIntelDef[];
    maker: MakerDef[];
  }
  interface EventMap {
    'goddess.acted': {
      goddessId: string;
      action: string;
      mapId: string;
      public: boolean;
      breach: boolean;
      miracleId: string;
    };
    'goddess.woken': { goddessId: string; reason: string };
    'goddess.revelation': { id: string; text: string; literal: string };
  }
  interface CommandMap {
    'goddess.act': GoddessActCommand;
    'goddess.say': { goddessId: string; text: string; revision?: number; listenerId?: string };
    'goddess.offer': { itemId: string; want: 'blessing' | 'intel' };
    'maker.revelation': {
      /** a revelation from the content table, or an ad-hoc one */
      id?: string;
      text?: string;
      literal?: string;
      modifier?: {
        target: ModifierTarget;
        key: string;
        factor?: number;
        add?: number;
        days: number;
      };
      flag?: { key: string; value: FlagValue };
    };
  }
}

const MODIFIER_TARGETS: readonly ModifierTarget[] = [
  'price',
  'harvest',
  'production',
  'monster',
  'faith',
  'morale',
  'sediment',
  'xp',
  'travel',
];

export const HOSTILITY_BUDGET = 2;

export const system: GameSystem = {
  id: 'goddess',
  order: 70,

  init(ctx) {
    const goddesses: Record<string, ReturnType<typeof newGoddessState>> = {};
    for (const def of ctx.content.goddesses ?? []) goddesses[def.id] = newGoddessState(def);
    ctx.world.slices.goddess = {
      goddesses,
      ledger: [],
      breaches: [],
      sediment: {},
      revelations: [],
      hostilityBudget: HOSTILITY_BUDGET,
    };
  },

  commands: {
    'goddess.act'(ctx, d, source) {
      return executeAct(ctx, d, source);
    },
    'goddess.say'(ctx, d, source: CommandSource) {
      const def = goddessDef(ctx.content, d.goddessId);
      const s = ctx.world.slices.goddess.goddesses[d.goddessId];
      if (!def || !s) return reject('no_goddess', tr('sys.goddess.reject.no_goddess.act'));
      if (s.departed) return reject('departed', tr('sys.goddess.reject.departed'));
      if (source.type === 'ai' && d.revision !== undefined && d.revision !== s.revision) {
        return reject('stale', tr('sys.goddess.reject.stale.say'));
      }
      const said = typeof d.text === 'string' ? d.text : '';
      const text = sanitizeText(said.slice(0, 300), ctx.world, ctx.content).trim();
      if (!text) return reject('empty', tr('sys.goddess.reject.empty'));
      ctx.emit('dialogue.line', {
        speakerId: def.id,
        speakerName: displayName(ctx, def),
        // the model's words are kept as raw text in their language (D-087)
        text: source.type === 'ai' ? rawText(text) : text,
        listenerId: d.listenerId,
        kind: 'divine',
      });
      return ok();
    },
    'goddess.offer'(ctx, d) {
      const bad = makeOffering(ctx, d);
      return bad ? reject(bad.code, bad.reason) : ok(tr('sys.goddess.info.offering_received'));
    },
    'maker.revelation'(ctx, d) {
      if (d.id) {
        const rev = ctx.content.revelations.find((r) => r.id === d.id);
        if (!rev) return reject('no_revelation', tr('sys.goddess.reject.no_revelation'));
        if (ctx.world.slices.goddess.revelations.some((r) => r.id === d.id)) {
          return reject('already', tr('sys.goddess.reject.already'));
        }
        issueRevelation(ctx, rev);
        return ok();
      }
      const text = String(d.text ?? '').trim();
      if (!text) return reject('no_text', tr('sys.goddess.reject.no_text.revelation'));
      if (text.length > 40) return reject('too_long', tr('sys.goddess.reject.too_long'));
      if (d.modifier && !MODIFIER_TARGETS.includes(d.modifier.target)) {
        return reject('bad_modifier', tr('sys.goddess.reject.bad_modifier'));
      }
      if (d.modifier && !(d.modifier.days > 0))
        return reject('bad_days', tr('sys.goddess.reject.bad_days'));
      if (!d.modifier && !d.flag) return reject('no_rule', tr('sys.goddess.reject.no_rule'));
      adHocRevelation(ctx, { text, literal: d.literal, modifier: d.modifier, flag: d.flag });
      return ok();
    },
  },

  on: {
    'world.day'(ctx) {
      for (const def of ctx.content.goddesses ?? []) {
        const s = ctx.world.slices.goddess.goddesses[def.id];
        if (!s || s.departed) continue;
        s.power += def.power.daily;
        s.score = Math.round(
          Object.values(s.faith).reduce((a, b) => a + b, 0) * 100 + s.relation / 10,
        );
        ctx.setFlag(`goddess.${def.id}.score`, s.score);
      }
      decaySight(ctx, ctx.content);
      dailyPlans(ctx);
    },
    'feat.performed'(ctx, e) {
      if (e.data.actorId !== ctx.world.slices.world.playerId) return;
      onFeat(ctx, e.data.tier, e.data.mapId, e.data.x, e.data.y);
    },
    'player.said'(ctx, e) {
      onPlayerSaid(ctx, e.data.text);
    },
    'flag.changed'(ctx, e) {
      if (e.data.key === 'act') {
        for (const def of ctx.content.goddesses ?? []) refreshGaze(ctx, ctx.content, def.id);
      }
    },
  },
};
