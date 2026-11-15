// Quests system (phase 80): quests and event chains, story flags, the reveal ledger,
// and act progression. NPCs offer quests through the dialogue options extension point;
// automatic quests start when their trigger holds. See
// docs/40_design/systems/quests_and_events.md.

import { ok, reject } from '../../core';
import type { GameSystem, SystemContext } from '../../core/system';
import { getEntity } from '../world';
import { openingAct, setAct } from './acts';
import { applyEffects } from './effects';
import './endings';
import type { LoreDef, TermDef } from '../goddess/types';
import {
  activeQuests,
  bump,
  checkStage,
  currentStage,
  finishQuest,
  offerable,
  questDef,
  scanAvailability,
  startQuest,
} from './progress';
import type { ActDef, QuestDef } from './types';

export * from './acts';
export * from './conditions';
export * from './effect_types';
export * from './effects';
export * from './endings';
export * from './lore';
export * from './progress';
export * from './speakers';
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

function isPlayerSide(ctx: SystemContext, id: string | undefined): boolean {
  if (!id) return false;
  if (id === ctx.world.slices.world.playerId) return true;
  const e = getEntity(ctx.world, id);
  return !!e && (e.kind === 'companion' || e.tags.includes('companion'));
}

function accept(ctx: SystemContext, questId: string): ReturnType<typeof ok> {
  const def = questDef(ctx.content, questId);
  if (!def) return reject('no_quest', '没有这个任务');
  if (ctx.world.slices.quests.quests[questId]) return reject('already', '这个任务已经接过了');
  if (!offerable(ctx, def.giver ?? '').some((d) => d.id === questId)) {
    return reject('unavailable', '现在还接不了这个任务');
  }
  startQuest(ctx, questId);
  if (def.giver) bump(ctx, (o) => o.type === 'talk' && o.npc === def.giver);
  return ok(`接受任务：${def.title}`);
}

function turnIn(ctx: SystemContext, questId: string): ReturnType<typeof ok> {
  const def = questDef(ctx.content, questId);
  const q = ctx.world.slices.quests.quests[questId];
  if (!def || !q) return reject('no_quest', '没有这个任务');
  if (q.status !== 'ready') return reject('not_ready', '任务还没有完成');
  finishQuest(ctx, def, q);
  return ok(`交付任务：${def.title}`);
}

function choose(
  ctx: SystemContext,
  questId: string,
  optionId: string,
  npc?: string,
): ReturnType<typeof ok> {
  const def = questDef(ctx.content, questId);
  const q = ctx.world.slices.quests.quests[questId];
  if (!def || !q || q.status !== 'active') return reject('no_quest', '没有进行中的这个任务');
  const stage = currentStage(def, q);
  if (!stage) return reject('no_stage', '任务没有可选的抉择');
  for (let i = 0; i < stage.objectives.length; i++) {
    const o = stage.objectives[i];
    if (o?.type !== 'choice' || q.met[i]) continue;
    if (o.npc && npc !== undefined && o.npc !== npc) continue;
    const opt = o.options.find((x) => x.id === optionId);
    if (!opt) continue;
    q.choices[String(i)] = optionId;
    q.met[i] = true;
    ctx.setFlag(`quest.${questId}.choice`, optionId);
    applyEffects(ctx, opt.effects);
    ctx.emit('quest.progress', { questId, objective: i, done: true });
    checkStage(ctx, def, q);
    return ok(opt.label);
  }
  return reject('no_option', '没有这个选项');
}

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
      ctx.setFlag('act_index', opening.index);
    }
  },

  tick(ctx) {
    const slice = ctx.world.slices.quests;
    const flagsMoved = slice.dirty;
    if (flagsMoved || ctx.tick % SCAN_EVERY === 0) scanAvailability(ctx);
    if (flagsMoved || ctx.tick % POLL_EVERY === 0) {
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
    'flag.changed'(ctx) {
      // Batched: availability and flag objectives are re-checked once on the next tick.
      ctx.world.slices.quests.dirty = true;
    },
    'entity.died'(ctx, e) {
      const d = e.data;
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
    'player.talked'(ctx, e) {
      const npc = e.data.npcRef ?? e.data.npcId;
      bump(ctx, (o) => o.type === 'talk' && (o.npc === npc || o.npc === e.data.npcId));
      const options: { id: string; label: string; hint?: string }[] = [];
      for (const def of offerable(ctx, npc)) {
        options.push({ id: `accept:${def.id}`, label: `接受任务：${def.title}`, hint: def.desc });
      }
      for (const id of ctx.world.slices.quests.order) {
        const q = ctx.world.slices.quests.quests[id];
        const def = questDef(ctx.content, id);
        if (q?.status === 'ready' && def?.turnIn === npc) {
          options.push({ id: `turnin:${id}`, label: `交付任务：${def.title}` });
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
            q.met[i] = true;
            ctx.emit('quest.progress', { questId: def.id, objective: i, done: true });
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
      for (const { def, q } of activeQuests(ctx)) checkStage(ctx, def, q);
    },
  },
};

export { setAct, startQuest };
