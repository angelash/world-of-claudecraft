// Quests system (phase 80): quests and event chains, story flags, the reveal ledger,
// and act progression. NPCs offer quests through the dialogue options extension point;
// automatic quests start when their trigger holds. See
// docs/40_design/systems/quests_and_events.md.

import { ok, reject } from '../../core';
import type { GameSystem, SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { registerSkipHandler } from '../travel/skip_registry';
import { getEntity } from '../world';
import { advanceActClock } from './act_clock';
import { openingAct, setAct } from './acts';
import { applyEffects } from './effects';
import './endings';
import type { LoreDef, TermDef } from '../goddess/types';
import { questDefOf, questTitle } from './instances';
import {
  accrueObjectives,
  deathObjectives,
  isPlayerSide,
  mapChangedObjectives,
  objectiveSubscriptions,
  persuadeObjectives,
  talkObjectives,
} from './objective_events';
import {
  activeQuests,
  bump,
  checkStage,
  currentStage,
  finishQuest,
  markMet,
  offerable,
  scanAvailability,
  setPath,
  startQuest,
} from './progress';
import { topicUnlockedQuests } from './topic_unlocks';
import type { ActDef, QuestDef } from './types';

export * from './act_clock';
export * from './acts';
export * from './calendar_terms';
export * from './conditions';
export * from './disputes';
export * from './effect_types';
export * from './effects';
export * from './endings';
export * from './instances';
export * from './lore';
export * from './objective_events';
export * from './objectives';
export * from './outcomes';
export * from './progress';
export * from './speakers';
export * from './topic_unlocks';
export * from './types';
export * from './view';

declare module '../../core/contracts' {
  interface WorldSlices {
    quests: import('./types').QuestsSlice;
  }
  interface ContentMap {
    quests: QuestDef[];
    acts: ActDef[];
    lore: LoreDef[];
    terms: TermDef[];
  }
  interface EventMap {
    'quest.started': { questId: string; title: string };
    'quest.stage': { questId: string; stage: number; desc: string };
    'quest.progress': { questId: string; objective: number; done: boolean };
    'quest.ready': { questId: string; turnIn: string };
    'quest.completed': { questId: string; title: string; kind: string };
  }
  interface CommandMap {
    /** accept a quest offered by an NPC (also reachable through the dialogue menu) */
    'quests.accept': { questId: string };
    /** turn in a quest that is ready */
    'quests.turn_in': { questId: string };
    /** answer a choice objective */
    'quests.choose': { questId: string; optionId: string };
  }
}

export const SYSTEM_ID = 'quests';

/** Objective poll period (ticks) and availability rescan period. */
const POLL_EVERY = 10;
const SCAN_EVERY = 100;

function accept(ctx: SystemContext, questId: string): ReturnType<typeof ok> {
  const def = questDefOf(ctx, questId);
  if (!def) return reject('no_quest', tr('sys.quests.reject.no_quest.missing'));
  if (ctx.world.slices.quests.quests[questId])
    return reject('already', tr('sys.quests.reject.already'));
  if (!offerable(ctx, def.giver ?? '').some((d) => d.id === questId)) {
    return reject('unavailable', tr('sys.quests.reject.unavailable'));
  }
  startQuest(ctx, questId);
  if (def.giver) bump(ctx, (o) => o.type === 'talk' && o.npc === def.giver);
  return ok(tr('sys.quests.label.accept', { title: def.title }));
}

function turnIn(ctx: SystemContext, questId: string): ReturnType<typeof ok> {
  const def = questDefOf(ctx, questId);
  const q = ctx.world.slices.quests.quests[questId];
  if (!def || !q) return reject('no_quest', tr('sys.quests.reject.no_quest.missing'));
  if (q.status !== 'ready') return reject('not_ready', tr('sys.quests.reject.not_ready'));
  finishQuest(ctx, def, q);
  return ok(tr('sys.quests.label.turn_in', { title: questTitle(def) }));
}

function choose(
  ctx: SystemContext,
  questId: string,
  optionId: string,
  npc?: string,
): ReturnType<typeof ok> {
  const def = questDefOf(ctx, questId);
  const q = ctx.world.slices.quests.quests[questId];
  if (!def || !q || q.status !== 'active')
    return reject('no_quest', tr('sys.quests.reject.no_quest.active'));
  const stage = currentStage(def, q);
  if (!stage) return reject('no_stage', tr('sys.quests.reject.no_stage'));
  for (let i = 0; i < stage.objectives.length; i++) {
    const o = stage.objectives[i];
    if (o?.type !== 'choice' || q.met[i]) continue;
    if (o.npc && npc !== undefined && o.npc !== npc) continue;
    const opt = o.options.find((x) => x.id === optionId);
    if (!opt) continue;
    q.choices[String(i)] = optionId;
    q.met[i] = true;
    ctx.setFlag(`quest.${questId}.choice`, optionId);
    if (opt.path) setPath(ctx, def, q, opt.path);
    applyEffects(ctx, opt.effects);
    applyEffects(ctx, o.effects);
    ctx.emit('quest.progress', { questId, objective: i, done: true });
    checkStage(ctx, def, q);
    return ok(opt.label);
  }
  return reject('no_option', tr('sys.quests.reject.no_option'));
}

// A time skip's hour-coarse step (travel_and_exploration.md 7.5, "任务"): the act clock
// settles the week starts and dusks the step crossed, then quest timers (wait objectives)
// and polled conditions settle once per step, as the polls would have.
registerSkipHandler(SYSTEM_ID, (ctx) => {
  advanceActClock(ctx);
  accrueObjectives(ctx);
  scanAvailability(ctx);
  for (const { def, q } of activeQuests(ctx)) checkStage(ctx, def, q);
});

export const system: GameSystem = {
  id: SYSTEM_ID,
  order: 80,

  init(ctx) {
    ctx.world.slices.quests = {
      quests: {},
      order: [],
      dirty: true,
      level: 1,
      built: {},
      doors: [],
      scenesSeen: [],
      lastBeatTick: 0,
    };
    const opening = openingAct(ctx.content);
    if (ctx.flag('act') === undefined && opening) {
      ctx.setFlag('act', opening.id);
    }
  },

  tick(ctx) {
    advanceActClock(ctx);
    const slice = ctx.world.slices.quests;
    const flagsMoved = slice.dirty;
    if (flagsMoved || ctx.tick % SCAN_EVERY === 0) scanAvailability(ctx);
    if (flagsMoved || ctx.tick % POLL_EVERY === 0) {
      accrueObjectives(ctx);
      for (const { def, q } of activeQuests(ctx)) checkStage(ctx, def, q);
    }
  },

  commands: {
    'quests.accept'(ctx, d) {
      return accept(ctx, d.questId);
    },
    'quests.turn_in'(ctx, d) {
      return turnIn(ctx, d.questId);
    },
    'quests.choose'(ctx, d) {
      return choose(ctx, d.questId, d.optionId);
    },
  },

  on: {
    ...objectiveSubscriptions,
    'flag.changed'(ctx) {
      // Batched: availability and flag objectives are re-checked once on the next tick.
      ctx.world.slices.quests.dirty = true;
    },
    'entity.died'(ctx, e) {
      const d = e.data;
      deathObjectives(ctx, d);
      const boss = (getEntity(ctx.world, d.id)?.tags ?? []).includes('boss');
      if (!boss && !isPlayerSide(ctx, d.killerId)) return;
      bump(ctx, (o) => {
        if (o.type !== 'kill') return false;
        if (o.mapId && o.mapId !== d.mapId) return false;
        if (o.ref && o.ref !== d.ref) return false;
        if (o.refs && !(d.ref && o.refs.includes(d.ref))) return false;
        if (!o.ref && !o.refs && (o.kind ?? 'monster') !== d.kind) return false;
        return true;
      });
    },
    'dialogue.topic'(ctx, e) {
      // a quest topic answered by its giver leads into the quest (topic_unlocks.ts)
      if (e.data.outcome !== 'answer') return;
      for (const id of topicUnlockedQuests(ctx, e.data.npcRef, e.data.topicId)) accept(ctx, id);
    },
    'dialogue.persuaded'(ctx, e) {
      // a persuasion in a conversation (PK-M1-19): the persuade objectives on this person
      // whose threshold holds are met; a failed attempt meets nothing
      if (e.data.ok) persuadeObjectives(ctx, e.data.npcRef);
    },
    'player.talked'(ctx, e) {
      const npc = e.data.npcRef ?? e.data.npcId;
      // an optional hand-in to the person counts before the talk itself closes its stage
      talkObjectives(ctx, npc, true);
      bump(ctx, (o) => o.type === 'talk' && (o.npc === npc || o.npc === e.data.npcId));
      talkObjectives(ctx, npc);
      const options: { id: string; label: TextParam; hint?: TextParam }[] = [];
      for (const def of offerable(ctx, npc)) {
        options.push({
          id: `accept:${def.id}`,
          label: tr('sys.quests.label.accept', { title: def.title }),
          hint: def.desc,
        });
      }
      for (const id of ctx.world.slices.quests.order) {
        const q = ctx.world.slices.quests.quests[id];
        const def = questDefOf(ctx, id);
        if (q?.status === 'ready' && def?.turnIn === npc) {
          options.push({
            id: `turnin:${id}`,
            label: tr('sys.quests.label.turn_in', { title: questTitle(def) }),
          });
        }
      }
      for (const { def, q } of activeQuests(ctx)) {
        const stage = currentStage(def, q);
        stage?.objectives.forEach((o, i) => {
          if (o.type !== 'choice' || o.npc !== npc || q.met[i]) return;
          for (const opt of o.options)
            options.push({ id: `choice:${def.id}:${opt.id}`, label: opt.label });
        });
      }
      if (options.length) {
        ctx.emit('dialogue.options_offered', { npcId: e.data.npcId, system: SYSTEM_ID, options });
      }
    },
    'dialogue.option_chosen'(ctx, e) {
      if (e.data.system !== SYSTEM_ID) return;
      const [kind, questId, optionId] = e.data.optionId.split(':');
      if (!questId) return;
      const npcEntity = getEntity(ctx.world, e.data.npcId);
      const npc = npcEntity?.ref ?? e.data.npcId;
      let res: ReturnType<typeof ok> | null = null;
      if (kind === 'accept') res = accept(ctx, questId);
      else if (kind === 'turnin') res = turnIn(ctx, questId);
      else if (kind === 'choice' && optionId) res = choose(ctx, questId, optionId, npc);
      if (res && !res.ok) {
        ctx.emit('command.result', {
          kind: 'quests.dialogue',
          ok: false,
          code: res.code,
          reason: res.reason,
          source: { type: 'system', system: SYSTEM_ID },
        });
      }
    },
    'building.completed'(ctx, e) {
      const slice = ctx.world.slices.quests;
      slice.built[e.data.defId] = (slice.built[e.data.defId] ?? 0) + 1;
      bump(ctx, (o) => o.type === 'build' && (!o.defId || o.defId === e.data.defId));
    },
    'battle.ended'(ctx, e) {
      const scenario = e.data.scenario ?? '';
      for (const { def, q } of activeQuests(ctx)) {
        const stage = currentStage(def, q);
        stage?.objectives.forEach((o, i) => {
          if (o.type !== 'battle' || o.scenario !== scenario || q.met[i]) return;
          if (e.data.victor === 'player') {
            markMet(ctx, def, q, i);
          } else {
            applyEffects(ctx, o.onLose);
            ctx.setFlag('war.pending', scenario);
          }
        });
        checkStage(ctx, def, q);
      }
    },
    'door.opened'(ctx, e) {
      const slice = ctx.world.slices.quests;
      if (!slice.doors.includes(e.data.doorId)) slice.doors.push(e.data.doorId);
      ctx.world.slices.quests.lastBeatTick = ctx.tick;
      bump(ctx, (o) => o.type === 'door' && o.doorId === e.data.doorId);
    },
    'player.level_up'(ctx, e) {
      ctx.world.slices.quests.level = Math.max(ctx.world.slices.quests.level, e.data.level);
      for (const { def, q } of activeQuests(ctx)) checkStage(ctx, def, q);
    },
    'scene.ended'(ctx, e) {
      const slice = ctx.world.slices.quests;
      if (!slice.scenesSeen.includes(e.data.sceneId)) slice.scenesSeen.push(e.data.sceneId);
      slice.lastBeatTick = ctx.tick;
      bump(ctx, (o) => o.type === 'scene' && o.scene === e.data.sceneId);
    },
    'world.map_changed'(ctx, e) {
      if (e.data.id !== ctx.world.slices.world.playerId) return;
      mapChangedObjectives(ctx);
      for (const { def, q } of activeQuests(ctx)) checkStage(ctx, def, q);
    },
  },
};

export { setAct, startQuest };
