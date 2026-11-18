// Goddess GM system (phase 70): power and faith, sight of the player, the divine action
// arbiter, the goddess brain (the dawn planner, schemes, the reaction table: builtin_ai.md
// 8), the scripted divine acts (catalog_goddess_interventions.md 4), honorific wake-ups,
// offerings through Merca's coin (9 and 10), the Maker's revelations, the miracle ledger
// (E34), and the regional sediment account the dungeons' dispositions move.
// See docs/40_design/systems/goddess_gm.md.

import { type CommandSource, type FlagValue, ok, reject } from '../../core';
import type { GameSystem, SystemContext } from '../../core/system';
import { rawText, type TextParam, tr } from '../../core/text';
import { calendarAt, isNight } from '../../core/time';
import { MODIFIER_TARGETS, type ModifierTarget } from '../modifiers';
import { actIndex } from '../quests/conditions';
import { sanitizeText } from '../quests/lore';
import {
  currentAct,
  displayName,
  executeAct,
  type GoddessActCommand,
  toolsActive,
  trusted,
  validateAct,
} from './actions';
import type { DivineBeatDef } from './beats';
import { beatActed, directorLanded, openBeatActs, stepBeats } from './beats';
import { bookSpend, proposalOverBudget } from './brain/budget';
import { goddessLine } from './brain/lines';
import type { BrainContent, GoddessBrainConfig, GoddessPersona } from './brain/persona';
import { personaOf } from './brain/persona';
import type { ReactRow } from './brain/reactions';
import type { SchemeDef } from './brain/schemes';
import { advanceSchemes, stepRefused } from './brain/schemes';
import { brainOf } from './brain/state';
import {
  ledgerDay,
  makeOffering,
  type OfferingHooks,
  type OfferingRules,
  useCoin,
} from './offerings';
import { dailyPlans, goddessContext } from './planning';
import { onCollapsed, onPurified, riseStep, seasonStep } from './region';
import { goddessByRole } from './roster';
import { decaySight, goddessDef, newGoddessState, refreshGaze } from './state';
import type {
  DivineActionDef,
  GoddessDef,
  InterventionOrigin,
  MakerDef,
  RevelationDef,
} from './types';
import {
  adHocRevelation,
  issueRevelation,
  onDoorOpened,
  onFeat,
  onPlayerSaid,
  onSealStage,
  reactTo,
} from './wake';

export * from './actions';
export * from './beats';
export * from './brain';
export * from './metrics';
export * from './offerings';
export * from './planning';
export * from './region';
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
    /** the goddess brain's persona tables (data/goddess/brain/personas.json) */
    goddessPersonas: GoddessPersona[];
    /** the goddess brain's constants (data/goddess/brain/config.json, one row) */
    goddessBrain: GoddessBrainConfig[];
    /** schemes div_plan_* (data/goddess/brain/schemes.json) */
    goddessSchemes: SchemeDef[];
    /** reaction rows div_react_* (data/goddess/brain/reactions.json) */
    goddessReactions: ReactRow[];
    /** scripted divine acts div_beat_* (data/goddess/beats.json) */
    divineBeats: DivineBeatDef[];
    /** offering points and return gifts (data/goddess/offerings.json, one row) */
    offeringRules: OfferingRules[];
  }
  interface EventMap {
    'goddess.acted': {
      goddessId: string;
      action: string;
      mapId: string;
      public: boolean;
      breach: boolean;
      /** the miracle ledger entry ('' for an act outside the ledger: her gaze) */
      miracleId: string;
      /** the player could perceive it (alive metric 8) */
      seen?: boolean;
      origin?: InterventionOrigin;
      targetId?: string;
      /** the power it cost */
      power?: number;
    };
    'goddess.woken': { goddessId: string; reason: string };
    'goddess.revelation': { id: string; text: string; literal: string };
    /** a scheme was adopted, done or aborted (builtin_ai 8.4) */
    'goddess.scheme': { goddessId: string; scheme: string; state: 'adopted' | 'done' | 'aborted' };
    /** a reaction row fired (builtin_ai 8.7) */
    'goddess.reacted': { goddessId: string; rowId: string; event: string };
    /** a private note of hers (no world effect; the debug panel and her record) */
    'goddess.memo': { goddessId: string; note: string };
    /** a scripted divine act opened, landed or closed unlanded (catalog 4) */
    'goddess.beat': { beatId: string; code: string; state: 'open' | 'done' | 'missed' };
    /** a region rose a sediment grade within a week (its dungeons stir) */
    'goddess.region_rise': { mapId: string };
  }
  interface CommandMap {
    'goddess.act': GoddessActCommand;
    'goddess.say': { goddessId: string; text: TextParam; revision?: number; listenerId?: string };
    'goddess.offer': { itemId: string; want: 'blessing' | 'intel' };
    /** the player uses the coin to reach the goddess with the offering role */
    'goddess.coin': Record<string, never>;
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

/** Channels the Maker's ad-hoc rule may use (every channel but the combat difficulty items). */
const REVELATION_TARGETS: readonly ModifierTarget[] = MODIFIER_TARGETS.filter(
  (t) => t !== 'combat',
);

export const HOSTILITY_BUDGET = 2;

/** Chance that Sylvie notices another's dream in the player (catalog 2.7): acts 1 and 2, then. */
export const DREAM_DETECT = { early: 0.05, late: 0.1 } as const;

const SRC = { type: 'system', system: 'goddess' } as const;

const OFFERING_HOOKS: OfferingHooks = {
  react(ctx, event, goddess, facts) {
    reactTo(ctx, event, [goddess], facts);
  },
};

/** Janu's night round (catalog 2.7, 5.6): one dream for so many doors opened. */
function nightRound(ctx: SystemContext): void {
  if (!isNight(calendarAt(ctx.tick))) return;
  const act = currentAct(ctx);
  for (const def of [...ctx.content.goddesses].sort((a, b) => a.id.localeCompare(b.id))) {
    const p = personaOf(ctx.content as BrainContent, def.id);
    const per = p?.night?.doorsPerDream[act];
    const s = ctx.world.slices.goddess.goddesses[def.id];
    if (!p?.night || per === undefined || !s || !toolsActive(ctx, def, s)) continue;
    const brain = brainOf(ctx.world.slices.goddess, def.id);
    if ((brain.doorsSinceDream ?? 0) < per) continue;
    const a = ctx.content.divineActions.find((x) => x.id === p.night?.action);
    const lines = a?.lines?.[def.id] ?? [];
    if (lines.length === 0) continue;
    const cmd: GoddessActCommand = {
      goddessId: def.id,
      action: p.night.action,
      revision: s.revision,
      params: { text: ctx.rng('goddess.plan').pick(lines) },
      origin: 'plan',
    };
    if (validateAct(ctx, cmd, SRC)) continue;
    ctx.ai.request({
      agentId: def.id,
      role: 'janu.night',
      purpose: 'night_dream',
      revision: s.revision,
      context: goddessContext(ctx, def, s, tr('sys.goddess.prompt.night')),
      allowed: ['goddess.act'],
      fallback: [{ kind: 'goddess.act', data: cmd, source: SRC }],
      deadlineTicks: 200,
      priority: 2,
    });
  }
}

/** Her greeting through the coin (after the first manifestation). */
function coinGreeting(ctx: SystemContext, merca: GoddessDef): TextParam | null {
  return goddessLine(ctx, merca.id, 'greet.neutral.coin');
}

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
      // an act the dawn plan puts later in the day waits on her agenda (checked now, and
      // again when it runs)
      // a model's proposal is held to her act budget and end reserve like her dawn plan
      if (source.type === 'ai') {
        const pm = d.params ?? {};
        const scripted = openBeatActs(ctx, d.goddessId).some(
          (b) =>
            b.action === d.action &&
            (!b.mapId || b.mapId === pm.mapId) &&
            (!b.targetId || b.targetId === pm.targetId),
        );
        if (proposalOverBudget(ctx, d, scripted))
          return reject('budget', tr('sys.goddess.reject.budget'));
      }
      if (d.at !== undefined && d.at > ctx.tick && trusted(source)) {
        const bad = validateAct(ctx, d, source);
        if (bad) return reject(bad.code, bad.reason);
        const brain = brainOf(ctx.world.slices.goddess, d.goddessId);
        brain.agenda ??= [];
        brain.agenda.push({ at: d.at, cmd: { ...d } });
        return ok(tr('sys.goddess.info.scheduled'));
      }
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
      // the built-in fallback may carry her pack line as a text key (D-077); a model and a
      // player only ever give words
      if (trusted(source) && d.text !== null && typeof d.text === 'object') {
        ctx.emit('dialogue.line', {
          speakerId: def.id,
          speakerName: displayName(ctx, def),
          text: d.text,
          listenerId: d.listenerId,
          kind: 'divine',
        });
        return ok();
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
      const res = makeOffering(ctx, d, OFFERING_HOOKS);
      if ('code' in res) return reject(res.code, res.reason);
      return ok(
        tr(
          res.gifted
            ? 'sys.goddess.info.offering_received'
            : res.noIntel
              ? 'sys.goddess.info.offering_no_intel'
              : 'sys.goddess.info.offering_kept',
        ),
      );
    },
    'goddess.coin'(ctx) {
      const bad = useCoin(ctx, OFFERING_HOOKS, coinGreeting);
      return bad ? reject(bad.code, bad.reason) : ok();
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
      if (d.modifier && !REVELATION_TARGETS.includes(d.modifier.target)) {
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
      ledgerDay(ctx, OFFERING_HOOKS);
      seasonStep(ctx);
      dailyPlans(ctx);
      nightRound(ctx);
    },
    'world.hour'(ctx) {
      runAgenda(ctx);
      stepBeats(ctx);
      riseStep(ctx);
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
      // a beat watching this flag lands at once (the prologue's scripted acts, the dream)
      if (
        (ctx.content.divineBeats ?? []).some((b) => 'flag' in b.open && b.open.flag === e.data.key)
      )
        stepBeats(ctx);
    },
    'goddess.acted'(ctx, e) {
      const d = e.data;
      advanceSchemes(ctx, d.goddessId, { action: d.action, mapId: d.mapId });
      const scripted = beatActed(ctx, d.goddessId, d.action, d.mapId, d.origin, d.targetId);
      // her own choices book their power against the act budget (builtin_ai 8.4)
      if ((d.origin === 'plan' || d.origin === 'scheme') && !scripted && d.power)
        bookSpend(ctx, d.goddessId, d.power);
      const p = personaOf(ctx.content as BrainContent, d.goddessId);
      // her night dream reached the player: the door count starts again, and Sylvie may
      // notice another's dream in the player (catalog 2.7, her reaction row 15)
      if (p?.night?.action === d.action && d.seen) {
        brainOf(ctx.world.slices.goddess, d.goddessId).doorsSinceDream = 0;
        dreamSeen(ctx);
      }
    },
    'door.opened'(ctx) {
      onDoorOpened(ctx);
    },
    'seal.stage_up'(ctx) {
      onSealStage(ctx);
    },
    'director.move'(ctx, e) {
      directorLanded(ctx, e.data.itemId);
    },
    'dungeon.collapsed'(ctx, e) {
      onCollapsed(ctx, e.data.id);
    },
    'dungeon.purified'(ctx, e) {
      onPurified(ctx, e.data.id);
    },
    'goddess.beat'(ctx, e) {
      // the first dream at the door (DB-A1-05) is a dream in the player too
      if (e.data.state !== 'done') return;
      const b = (ctx.content.divineBeats ?? []).find((x) => x.id === e.data.beatId);
      if (b?.dreamInPlayer) dreamSeen(ctx);
    },
  },
};

/** Run the planned acts whose hour has come (her revision may have moved: run as her own). */
function runAgenda(ctx: SystemContext): void {
  for (const id of Object.keys(ctx.world.slices.goddess.brains ?? {}).sort()) {
    const brain = brainOf(ctx.world.slices.goddess, id);
    if (!brain.agenda?.length) continue;
    const due = brain.agenda.filter((x) => x.at <= ctx.tick);
    brain.agenda = brain.agenda.filter((x) => x.at > ctx.tick);
    for (const x of due) {
      const s = ctx.world.slices.goddess.goddesses[id];
      if (!s) continue;
      const res = executeAct(ctx, { ...x.cmd, at: undefined, revision: s.revision }, SRC);
      // a scheme step refused when its hour came: the scheme replans at her next dawn
      if (!res.ok && x.cmd.origin === 'scheme') stepRefused(ctx, id, x.cmd.action, x.cmd.scheme);
    }
  }
}

/** Whether the life-and-cycle goddess notices another's dream in the player (catalog 2.7). */
function dreamSeen(ctx: SystemContext): void {
  const idx = actIndex(currentAct(ctx));
  const chance = idx >= 3 ? DREAM_DETECT.late : DREAM_DETECT.early;
  const watchers = (ctx.content.goddessReactions ?? [])
    .filter((r) => r.event === 'player.dream_seen' && r.goddess !== '*')
    .map((r) => r.goddess);
  for (const g of [...new Set(watchers)].sort()) {
    if (!ctx.rng('goddess.detect').chance(chance)) continue;
    reactTo(ctx, 'player.dream_seen', [g], {});
  }
}

export { goddessByRole };
