// NPC system (phase 40): persona cards, schedules, needs, tiered reasoning (D-009),
// daily plans, NPC-to-NPC chat, relations, memory and the L3 batch diary. Rule
// fallbacks keep the town alive with no model (D-010).
// See docs/40_design/systems/npc_society_ai.md.

import { ok, reject } from '../../core';
import type { CommandSource } from '../../core/contracts';
import type { GameSystem, SystemContext } from '../../core/system';
import { commandText, type TextParam, tr } from '../../core/text';
import { TICKS_PER_GAME_HOUR } from '../../core/time';
import { referencedVars } from '../quests/conditions';
import { playerEntity } from '../world';
import { passHour, scheduledWork, settleMoney, trackPlayerTalk } from './actions';
import {
  endSpringPeriods,
  forgetSightings,
  heldByBeat,
  isCapturedFlag,
  logHour,
  mirrorHostile,
  onBeliefChanged,
  onDecided,
  onDecisionOpened,
  onDeedFor,
  onIdentityExposed,
  onPersonDied,
  onQuestStage,
  onTalkedFor,
  remember,
  runBeats,
  senseThreat,
  setFollow,
  setWatch,
  sortedNpcIds,
  stepFollowers,
  stepNpc,
  stepWatchers,
  upkeepApproaches,
} from './brain';
import { runChats } from './chat';
import { CHAT_TICKS, DAWN_HOUR, FOLLOW_TICKS } from './constants';
import { applyDiary, requestDiaries } from './diary';
import { consolidateMemory } from './memory';
import { moneyNeed } from './needs';
import { cardOf, npcEntityId, personaById } from './personas';
import { locationById, MAP_PLACE_SEPARATOR, placeRef, resolvePlaceOn } from './places';
import { applyPlan, requestDailyPlans } from './plan';
import { resumeFrozen } from './ports';
import { decayRelations, relationOf } from './relations';
import { stepTransits } from './routes';
import { ACT_NAMES } from './schedule';
import { spawnAll, syncPresence } from './spawn';
import './skip';
import { recomputeTiers } from './tiers';
import { ACTIVITIES, type NpcState, type PlanState } from './types';
import { devotionOf, spendable } from './wallet';

export {
  brainDecide,
  noteOffense,
  setFollow,
  setWatch,
  stepNpc,
  takeOpener,
} from './brain';
export * from './memory';
export * from './personas';
export * from './ports';
export * from './queries';
export * from './relations';
export * from './traits';
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
      set.add(`npc.${p.id}.captured`);
      set.add(`npc.${p.id}.dead`);
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
  const ids = sortedNpcIds(slice.npcs);
  const ended = (hour + 23) % 24;
  for (const id of ids) {
    const st = slice.npcs[id] as NpcState;
    const card = cardOf(slice, ctx.content, id);
    if (!card || st.gone) continue;
    logHour(ctx, st, card, ended);
    passHour(st, card, {
      scheduledWork: !st.resident && scheduledWork(ctx, card, ended),
      devotion: devotionOf(card),
    });
    if (!st.resident) st.needs.money = Math.round(moneyNeed(spendable(ctx, st)) * 100) / 100;
    if (!st.resident && st.mapId === slice.playerMap) senseThreat(ctx, st);
  }
  recomputeTiers(ctx);
  for (const id of ids) {
    const st = slice.npcs[id] as NpcState;
    const card = cardOf(slice, ctx.content, id);
    if (card && !heldByBeat(ctx, st)) stepNpc(ctx, st, card);
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
  endSpringPeriods(ctx);
}

/** A named person died: the absence variables, and those close to them mourn (5.3). */
function onDeath(ctx: SystemContext, id: string): void {
  const slice = ctx.world.slices.npc;
  onPersonDied(ctx, id);
  const name = cardOf(slice, ctx.content, id)?.name ?? id;
  for (const other of Object.keys(slice.minds).sort()) {
    if (other === id || slice.npcs[other]?.gone) continue;
    if (relationOf(slice, other, id).like < 50) continue;
    remember(ctx, other, 'mourning', { who: name }, { about: id });
    const o = slice.npcs[other];
    if (o?.brain) o.brain.recent.mourning = ctx.tick;
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
    runBeats(ctx);
    stepFollowers(ctx);
    stepTransits(ctx);
    if (ctx.tick % FOLLOW_TICKS === 0) upkeepApproaches(ctx);
    stepWatchers(ctx);
  },

  on: {
    'world.hour'(ctx, e) {
      onHour(ctx, e.data.hour);
    },
    'world.day'(ctx, e) {
      onDay(ctx, e.data.dayIndex);
    },
    'world.map_changed'(ctx, e) {
      if (e.data.id !== ctx.world.slices.world.playerId) return;
      recomputeTiers(ctx);
      forgetSightings(ctx);
    },
    'flag.changed'(ctx, e) {
      const k = e.data.key;
      if (k.startsWith('companion.') || isCapturedFlag(k) || presenceFlags(ctx).has(k))
        syncPresence(ctx);
      if (k.startsWith('ai.focus.')) recomputeTiers(ctx);
    },
    'entity.died'(ctx, e) {
      const ref = e.data.ref;
      const st = ref ? ctx.world.slices.npc.npcs[ref] : undefined;
      if (st && e.data.id === st.entityId) {
        st.gone = 'dead';
        st.talking = false;
        st.follow = null;
        if (!st.resident) onDeath(ctx, ref as string);
      }
    },
    'dispute.decision_opened'(ctx, e) {
      onDecisionOpened(ctx, e.data);
    },
    'dispute.decided'(ctx, e) {
      onDecided(ctx, e.data);
    },
    'cognition.belief_changed'(ctx, e) {
      onBeliefChanged(ctx, e.data);
    },
    'npc.relation_changed'(ctx, e) {
      if (e.data.to === 'player') mirrorHostile(ctx, e.data.from);
    },
    'feat.performed'(ctx, e) {
      const d = e.data;
      if (d.actorId !== ctx.world.slices.world.playerId || !d.targetRef) return;
      if (d.kind === 'rescue' || d.kind === 'heal') onDeedFor(ctx, d.targetRef, d.kind);
    },
    'identity.exposed'(ctx, e) {
      onIdentityExposed(ctx, e.data);
    },
    'quest.stage'(ctx, e) {
      onQuestStage(ctx, e.data.questId, e.data.stage);
    },
    'player.talked'(ctx, e) {
      if (!e.data.npcRef) return;
      onTalkedFor(ctx, e.data.npcRef);
      const st = ctx.world.slices.npc.npcs[e.data.npcRef];
      if (st) trackPlayerTalk(ctx, st);
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
      // a place on another map is named by its map (a cross-map errand)
      const ref =
        d.mapId && d.mapId !== card.map
          ? `${d.mapId}${MAP_PLACE_SEPARATOR}${d.locationId}`
          : d.locationId;
      const place = resolvePlaceOn(ctx.content, card, ref);
      if (!place) return reject('no_place', tr('sys.npc.reject.no_place'));
      const act = d.act ?? 'wander';
      if (!ACTIVITIES.includes(act)) return reject('bad_act', tr('sys.npc.reject.bad_act'));
      const hours = Math.max(1, Math.min(24, Math.round(d.hours)));
      const at = placeRef(card.map, place.mapId, place.loc.id);
      st.override = { until: ctx.tick + hours * TICKS_PER_GAME_HOUR, at, act };
      st.follow = null;
      if (!st.talking) {
        st.transit = null;
        stepNpc(ctx, st, card);
      }
      return ok();
    },
    'npc.follow'(ctx, d, src) {
      if (src.type === 'player')
        return reject('not_allowed', tr('sys.npc.reject.follow_not_allowed'));
      return setFollow(ctx, d.npcId, d.on, d)
        ? ok()
        : reject('no_npc', tr('sys.npc.reject.no_npc'));
    },
    'npc.watch'(ctx, d, src) {
      if (src.type === 'player')
        return reject('not_allowed', tr('sys.npc.reject.watch_not_allowed'));
      setWatch(ctx, d, d.on);
      return ok();
    },
  },
};

/** Persona-level lookup re-exported for other systems' convenience. */
export { locationById, personaById };
