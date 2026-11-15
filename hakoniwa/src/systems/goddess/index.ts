// Goddess GM system (phase 70): power and faith, sight of the player, the divine action
// arbiter, daily planning with the model (or the utility fallback), honorific wake-ups,
// offerings through Merca's coin, the Maker's revelations, and the miracle ledger (E34).
// See docs/40_design/systems/goddess_gm.md.

import { type CommandSource, type FlagValue, ok, reject } from '../../core';
import type { GameSystem } from '../../core/system';
import type { ModifierTarget } from '../modifiers';
import { sanitizeText } from '../quests/lore';
import { displayName, executeAct, type GoddessActCommand } from './actions';
import { dailyPlans } from './planning';
import { decaySight, goddessDef, newGoddessState, refreshGaze } from './state';
import type { DivineActionDef, GoddessDef, MakerDef, RevelationDef } from './types';
import { adHocRevelation, issueRevelation, makeOffering, onFeat, onPlayerSaid } from './wake';

export * from './actions';
export * from './planning';
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
      if (!def || !s) return reject('no_goddess', '没有这位司掌者');
      if (s.departed) return reject('departed', '她已经离开了');
      if (source.type === 'ai' && d.revision !== undefined && d.revision !== s.revision) {
        return reject('stale', '局势已经变了，这句话来得太迟');
      }
      const text = sanitizeText(String(d.text ?? '').slice(0, 300), ctx.world, ctx.content).trim();
      if (!text) return reject('empty', '没有内容');
      ctx.emit('dialogue.line', {
        speakerId: def.id,
        speakerName: displayName(ctx, def),
        text,
        listenerId: d.listenerId,
        kind: 'divine',
      });
      return ok();
    },
    'goddess.offer'(ctx, d) {
      const bad = makeOffering(ctx, d);
      return bad ? reject(bad.code, bad.reason) : ok('供品已收下');
    },
    'maker.revelation'(ctx, d) {
      if (d.id) {
        const rev = ctx.content.revelations.find((r) => r.id === d.id);
        if (!rev) return reject('no_revelation', '没有这条天启');
        if (ctx.world.slices.goddess.revelations.some((r) => r.id === d.id)) {
          return reject('already', '这条天启已经显现过了');
        }
        issueRevelation(ctx, rev);
        return ok();
      }
      const text = String(d.text ?? '').trim();
      if (!text) return reject('no_text', '天启需要碑文');
      if (text.length > 40) return reject('too_long', '天启只有一到两句');
      if (d.modifier && !MODIFIER_TARGETS.includes(d.modifier.target)) {
        return reject('bad_modifier', '天启的规则变更必须是登记过的修正项类型');
      }
      if (d.modifier && !(d.modifier.days > 0)) return reject('bad_days', '规则变更需要期限');
      if (!d.modifier && !d.flag) return reject('no_rule', '天启必须对应一条可验证的规则变更');
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
