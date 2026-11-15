// Quest progress: starting, objective bookkeeping, stage transitions, turn-in and
// completion. Objectives advance from events (kills, talks, buildings, battles, doors,
// scenes) and from a periodic poll (flags, items, position, time, level).

import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../../core/time';
import { countItem, removeItem } from '../inventory';
import { playerEntity } from '../world';
import { applyEffects, conditionHolds } from './effects';
import type { Objective, QuestDef, QuestProgress, QuestStage } from './types';

export function questDef(content: { quests: QuestDef[] }, id: string): QuestDef | undefined {
  return content.quests.find((q) => q.id === id);
}

export function currentStage(def: QuestDef, q: QuestProgress): QuestStage | undefined {
  return def.stages[q.stage];
}

function markDirty(ctx: SystemContext): void {
  ctx.world.slices.quests.dirty = true;
}

/** Start a quest (no-op when it was ever started). Returns true when it started. */
export function startQuest(ctx: SystemContext, id: string): boolean {
  const slice = ctx.world.slices.quests;
  const def = questDef(ctx.content, id);
  if (!def || slice.quests[id]) return false;
  const q: QuestProgress = {
    id,
    status: 'active',
    stage: 0,
    counts: [],
    met: [],
    stageStartTick: ctx.tick,
    startedTick: ctx.tick,
    choices: {},
  };
  slice.quests[id] = q;
  slice.order.push(id);
  ctx.setFlag(`quest.${id}`, 'active');
  ctx.emit('quest.started', { questId: id, title: def.title });
  applyEffects(ctx, def.onStart);
  enterStage(ctx, def, q, 0);
  markDirty(ctx);
  return true;
}

function enterStage(ctx: SystemContext, def: QuestDef, q: QuestProgress, idx: number): void {
  const stage = def.stages[idx];
  q.stage = idx;
  q.stageStartTick = ctx.tick;
  q.counts = stage ? stage.objectives.map(() => 0) : [];
  q.met = stage ? stage.objectives.map(() => false) : [];
  if (!stage) {
    stageDone(ctx, def, q);
    return;
  }
  ctx.emit('quest.stage', { questId: def.id, stage: idx, desc: stage.desc });
  applyEffects(ctx, stage.onEnter);
  // A scene objective whose scene was already seen counts at once.
  stage.objectives.forEach((o, i) => {
    if (o.type === 'scene' && ctx.world.slices.quests.scenesSeen.includes(o.scene)) q.met[i] = true;
  });
  checkStage(ctx, def, q);
}

function stageDone(ctx: SystemContext, def: QuestDef, q: QuestProgress): void {
  if (q.stage + 1 < def.stages.length) {
    enterStage(ctx, def, q, q.stage + 1);
    return;
  }
  if (def.turnIn) {
    q.status = 'ready';
    ctx.setFlag(`quest.${def.id}`, 'ready');
    ctx.emit('quest.ready', { questId: def.id, turnIn: def.turnIn });
    return;
  }
  finishQuest(ctx, def, q);
}

export function finishQuest(ctx: SystemContext, def: QuestDef, q: QuestProgress): void {
  if (q.status === 'done') return;
  q.status = 'done';
  q.doneTick = ctx.tick;
  ctx.world.slices.quests.lastBeatTick = ctx.tick;
  ctx.setFlag(`quest.${def.id}`, 'done');
  ctx.emit('quest.completed', { questId: def.id, title: def.title, kind: def.kind });
  applyEffects(ctx, def.rewards);
  markDirty(ctx);
}

/** Polled satisfaction of an objective (event-driven ones keep their own flag). */
function polled(ctx: SystemContext, q: QuestProgress, o: Objective, i: number): boolean {
  if (o.orWhen && conditionHolds(ctx, o.orWhen)) return true;
  if (q.met[i]) return true;
  switch (o.type) {
    case 'flag':
      return conditionHolds(ctx, o.when);
    case 'collect':
      return countItem(ctx.world, ctx.world.slices.world.playerId, o.item) >= o.count;
    case 'level':
      return ctx.world.slices.quests.level >= o.level;
    case 'door':
      return ctx.world.slices.quests.doors.includes(o.doorId) || !!ctx.flag(`door.${o.doorId}`);
    case 'wait': {
      const ticks = (o.days ?? 0) * TICKS_PER_GAME_DAY + (o.hours ?? 0) * TICKS_PER_GAME_HOUR;
      return ctx.tick - q.stageStartTick >= ticks;
    }
    case 'reach': {
      const p = playerEntity(ctx.world);
      if (!p || p.mapId !== o.mapId) return false;
      if (!o.location) return true;
      const map = ctx.content.maps.find((m) => m.id === o.mapId);
      const loc = map?.locations.find((l) => l.id === o.location);
      if (!loc) return true;
      return (
        p.x >= loc.x - 1 && p.x <= loc.x + loc.w + 1 && p.y >= loc.y - 1 && p.y <= loc.y + loc.h + 1
      );
    }
    case 'scene':
      return ctx.world.slices.quests.scenesSeen.includes(o.scene);
    default:
      return false;
  }
}

/** Re-evaluate the current stage; completes it when every required objective holds. */
export function checkStage(ctx: SystemContext, def: QuestDef, q: QuestProgress): void {
  if (q.status !== 'active') return;
  const stage = currentStage(def, q);
  if (!stage) return;
  let all = true;
  let any = false;
  stage.objectives.forEach((o, i) => {
    if (!q.met[i] && polled(ctx, q, o, i)) {
      q.met[i] = true;
      ctx.emit('quest.progress', { questId: def.id, objective: i, done: true });
    }
    if (q.met[i]) any = true;
    if (!q.met[i] && !o.optional) all = false;
  });
  if (stage.complete === 'any' ? !any : !all) return;
  stage.objectives.forEach((o) => {
    if (o.type === 'collect' && o.consume) {
      removeItem(ctx, ctx.world.slices.world.playerId, o.item, o.count, 'quest');
    }
  });
  applyEffects(ctx, stage.onComplete);
  stageDone(ctx, def, q);
}

/** Active quests with their definitions, in start order. */
export function activeQuests(ctx: SystemContext): { def: QuestDef; q: QuestProgress }[] {
  const slice = ctx.world.slices.quests;
  const out: { def: QuestDef; q: QuestProgress }[] = [];
  for (const id of slice.order) {
    const q = slice.quests[id];
    const def = questDef(ctx.content, id);
    if (q && def && q.status === 'active') out.push({ def, q });
  }
  return out;
}

/** Count an event toward matching objectives of the current stages. */
export function bump(ctx: SystemContext, match: (o: Objective) => boolean, amount = 1): void {
  for (const { def, q } of activeQuests(ctx)) {
    const stage = currentStage(def, q);
    if (!stage) continue;
    let changed = false;
    stage.objectives.forEach((o, i) => {
      if (q.met[i] || !match(o)) return;
      const need = 'count' in o && typeof o.count === 'number' ? o.count : 1;
      q.counts[i] = (q.counts[i] ?? 0) + amount;
      ctx.emit('quest.progress', { questId: def.id, objective: i, done: q.counts[i] >= need });
      if ((q.counts[i] ?? 0) >= need) q.met[i] = true;
      changed = true;
    });
    if (changed) checkStage(ctx, def, q);
  }
}

/** Start every automatic quest whose trigger holds (giverless quests). */
export function scanAvailability(ctx: SystemContext): void {
  const slice = ctx.world.slices.quests;
  slice.dirty = false;
  for (const def of ctx.content.quests) {
    if (slice.quests[def.id] || def.giver) continue;
    if (conditionHolds(ctx, def.trigger)) startQuest(ctx, def.id);
  }
}

/** Quests an NPC could offer right now (not started, trigger holds). */
export function offerable(ctx: SystemContext, npc: string): QuestDef[] {
  const slice = ctx.world.slices.quests;
  return ctx.content.quests.filter(
    (d) => d.giver === npc && !slice.quests[d.id] && conditionHolds(ctx, d.trigger),
  );
}
