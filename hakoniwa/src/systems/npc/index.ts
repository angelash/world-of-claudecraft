// NPC system (phase 40): persona cards, schedules, needs, tiered reasoning (D-009),
// daily plans, NPC-to-NPC chat, relations, memory and the L3 batch diary. Rule
// fallbacks keep the town alive with no model (D-010).
// See docs/40_design/systems/npc_society_ai.md.

import { ok, reject } from '../../core';
import type { CommandSource } from '../../core/contracts';
import type { GameSystem, SystemContext } from '../../core/system';
import { commandText, type TextParam, tr } from '../../core/text';
import { calendarAt, TICKS_PER_GAME_HOUR } from '../../core/time';
import { referencedVars } from '../quests/conditions';
import { playerEntity } from '../world';
import { applyDecision, decideHour, passHour, settleMoney } from './actions';
import { runChats } from './chat';
import { CHAT_TICKS, DAWN_HOUR } from './constants';
import { applyDiary, requestDiaries } from './diary';
import { consolidateMemory } from './memory';
import { cardOf, npcEntityId, personaById } from './personas';
import { locationById, resolvePlace } from './places';
import { applyPlan, requestDailyPlans } from './plan';
import { resumeFrozen } from './ports';
import { decayRelations } from './relations';
import { ACT_NAMES } from './schedule';
import { spawnAll, syncPresence } from './spawn';
import './skip';
import { recomputeTiers } from './tiers';
import { ACTIVITIES, type NpcState, type PlanState } from './types';

export * from './memory';
export * from './personas';
export * from './ports';
export * from './queries';
export * from './relations';
export * from './types';
export { ACT_NAMES };

const relevantFlagCache = new WeakMap<object, Set<string>>();

/** Flags that can change who is present (requiresFlags and hideWhen keys). */
function presenceFlags(ctx: SystemContext): Set<string> {
  let set = relevantFlagCache.get(ctx.content);
  if (!set) {
    set = new Set<string>();
    for (const p of ctx.content.npcs ?? []) {
      for (const f of p.requiresFlags ?? []) set.add(f);
      for (const c of p.hideWhen ?? []) for (const v of referencedVars(c)) set.add(v);
    }
    relevantFlagCache.set(ctx.content, set);
  }
  return set;
}

function sourceKind(src: CommandSource): PlanState['source'] | null {
  if (src.type === 'ai') return 'ai';
  if (src.type === 'fallback') return 'fallback';
  if (src.type === 'system' || src.type === 'script') return 'script';
  return null;
}

/** A spoken line: the model's string (whitespace folded, capped at 60), or a line as text. */
function sayText(v: TextParam, fromModel: boolean): TextParam {
  return commandText(v, fromModel, (s) => s.replace(/\s+/g, ' ').trim().slice(0, 60), 60);
}

function onHour(ctx: SystemContext, hour: number): void {
  const slice = ctx.world.slices.npc;
  const ids = Object.keys(slice.npcs).sort();
  for (const id of ids) {
    const st = slice.npcs[id] as NpcState;
    const card = cardOf(slice, ctx.content, id);
    if (!card || st.gone) continue;
    passHour(st, card);
  }
  recomputeTiers(ctx);
  for (const id of ids) {
    const st = slice.npcs[id] as NpcState;
    if (st.gone || st.talking || ctx.tick < st.freezeUntil) continue;
    const card = cardOf(slice, ctx.content, id);
    if (!card) continue;
    applyDecision(ctx, st, card, decideHour(ctx, st, card, hour), hour);
  }
  if (hour === DAWN_HOUR) {
    requestDailyPlans(ctx);
  }
}

function onDay(ctx: SystemContext, dayIndex: number): void {
  const slice = ctx.world.slices.npc;
  settleMoney(ctx);
  requestDiaries(ctx, dayIndex - 1);
  for (const id of Object.keys(slice.npcs).sort()) {
    const st = slice.npcs[id] as NpcState;
    st.track = [];
    st.heat = Math.round(st.heat * 0.8 * 1000) / 1000;
    const mind = slice.minds[id];
    if (!mind) continue;
    consolidateMemory(mind, dayIndex - 1);
    decayRelations(mind);
  }
}

export const system: GameSystem = {
  id: 'npc',
  order: 40,

  init(ctx) {
    ctx.world.slices.npc = {
      npcs: {},
      minds: {},
      residents: {},
      diary: {},
      playerMap: playerEntity(ctx.world)?.mapId ?? '',
    };
    spawnAll(ctx);
    recomputeTiers(ctx);
  },

  tick(ctx) {
    if (ctx.tick % CHAT_TICKS === 0) runChats(ctx);
    if (ctx.tick % 20 === 0) resumeFrozen(ctx);
  },

  on: {
    'world.hour'(ctx, e) {
      onHour(ctx, e.data.hour);
    },
    'world.day'(ctx, e) {
      onDay(ctx, e.data.dayIndex);
    },
    'world.map_changed'(ctx, e) {
      if (e.data.id === ctx.world.slices.world.playerId) recomputeTiers(ctx);
    },
    'flag.changed'(ctx, e) {
      const k = e.data.key;
      if (k.startsWith('companion.') || presenceFlags(ctx).has(k)) syncPresence(ctx);
      if (k.startsWith('ai.focus.')) recomputeTiers(ctx);
    },
    'entity.died'(ctx, e) {
      const ref = e.data.ref;
      const st = ref ? ctx.world.slices.npc.npcs[ref] : undefined;
      if (st && e.data.id === st.entityId) {
        st.gone = 'dead';
        st.talking = false;
      }
    },
  },

  commands: {
    'npc.plan'(ctx, d, src) {
      const kind = sourceKind(src);
      if (!kind) return reject('not_allowed', tr('sys.npc.reject.plan_not_allowed'));
      const why = applyPlan(ctx, d, kind);
      return why ? reject('bad_plan', why) : ok();
    },
    'npc.say'(ctx, d, src) {
      if (src.type === 'player') return reject('not_allowed', tr('sys.npc.reject.say_not_allowed'));
      const slice = ctx.world.slices.npc;
      const st = slice.npcs[d.npcId];
      if (!st || st.gone) return reject('no_npc', tr('sys.npc.reject.no_npc'));
      if (d.revision !== st.sayRev) return reject('stale', tr('sys.npc.reject.stale_say'));
      const text = sayText(d.text, src.type === 'ai');
      if (!text) return reject('empty', tr('sys.npc.reject.empty_say'));
      const name = cardOf(slice, ctx.content, d.npcId)?.name ?? d.npcId;
      ctx.emit('dialogue.line', {
        speakerId: st.entityId,
        speakerName: name,
        text,
        listenerId: d.toId ? npcEntityId(d.toId) : undefined,
        kind: 'say',
      });
      return ok();
    },
    'npc.diary_batch'(ctx, d, src) {
      if (src.type === 'player')
        return reject('not_allowed', tr('sys.npc.reject.diary_not_allowed'));
      const why = applyDiary(ctx, d.mapId, d.day, d.revision, d.entries, src.type);
      return why ? reject('bad_diary', why) : ok();
    },
    'npc.goto'(ctx, d, src) {
      if (src.type === 'player')
        return reject('not_allowed', tr('sys.npc.reject.goto_not_allowed'));
      const slice = ctx.world.slices.npc;
      const st = slice.npcs[d.npcId];
      const card = cardOf(slice, ctx.content, d.npcId);
      if (!st || !card || st.gone) return reject('no_npc', tr('sys.npc.reject.no_npc'));
      const loc = resolvePlace(ctx.content, card, d.locationId);
      if (!loc) return reject('no_place', tr('sys.npc.reject.no_place'));
      const act = d.act ?? 'wander';
      if (!ACTIVITIES.includes(act)) return reject('bad_act', tr('sys.npc.reject.bad_act'));
      const hours = Math.max(1, Math.min(24, Math.round(d.hours)));
      st.override = { until: ctx.tick + hours * TICKS_PER_GAME_HOUR, at: loc.id, act };
      const hour = calendarAt(ctx.tick).hour;
      if (!st.talking) applyDecision(ctx, st, card, decideHour(ctx, st, card, hour), hour);
      return ok();
    },
  },
};

/** Persona-level lookup re-exported for other systems' convenience. */
export { locationById, personaById };
