// Quest progress: starting, objective bookkeeping, stage transitions, turn-in and
// completion. Objectives advance from events (kills, talks, buildings, battles, doors,
// scenes, trades, gathering, crafting, duels) and from a periodic poll (flags, items,
// position, time, level, clues, people's places); the model's objective kinds and their
// failures are in objectives.ts, the closing outcomes (failed, expired, by_other) in
// outcomes.ts.

import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../../core/time';
import { countItem, removeItem } from '../inventory';
import { playerEntity } from '../world';
import { currentActId } from './act_order';
import { applyEffects, conditionHolds } from './effects';
import { questDefOf } from './instances';
import { matchesQuestNpc } from './npc_matches';
import {
  atPlace,
  FAILED,
  objectiveNeed,
  type PollResult,
  pollModelObjective,
  startStageObjectives,
} from './objectives';
import { failQuest, settleOutcomes } from './outcomes';
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

/**
 * Start a quest, a content quest or a run-time instance (instances.ts); no-op when it was
 * ever started. Returns true when it started.
 */
export function startQuest(ctx: SystemContext, id: string): boolean {
  const slice = ctx.world.slices.quests;
  const def = questDefOf(ctx, id);
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

/**
 * Forget the progress of these quests (PK-M1-34, for "re-choose the opening": the scenes
 * system clears the opening's flags, and the quests those flags stood for must go back to
 * unstarted, or the log keeps the stages of the run that was dropped). The flag is the
 * scenes system's to clear; this only drops the progress record and its order entry.
 */
export function resetQuests(ctx: SystemContext, ids: readonly string[]): string[] {
  const slice = ctx.world.slices.quests;
  const gone: string[] = [];
  for (const id of ids) {
    if (!slice.quests[id]) continue;
    delete slice.quests[id];
    gone.push(id);
  }
  if (gone.length === 0) return gone;
  slice.order = slice.order.filter((id) => !gone.includes(id));
  // the scenes the restart forgot are not seen for the quests either (a `scene` objective of a
  // reset quest must wait for the replay, not complete at once)
  const seen = ctx.world.slices.scenes?.seen;
  if (seen) slice.scenesSeen = slice.scenesSeen.filter((id) => seen.includes(id));
  markDirty(ctx);
  return gone;
}

/** Enter a stage by index (the next one, or a failure branch's target). */
export function enterStage(ctx: SystemContext, def: QuestDef, q: QuestProgress, idx: number): void {
  const stage = def.stages[idx];
  q.stage = idx;
  q.stageStartTick = ctx.tick;
  q.accrued = ctx.tick;
  q.counts = stage ? stage.objectives.map(() => 0) : [];
  q.met = stage ? stage.objectives.map(() => false) : [];
  if (q.clues) delete q.clues;
  if (!stage) {
    stageDone(ctx, def, q);
    return;
  }
  // the current stage's code, for the line variants of the progress slot (registry 8.7)
  ctx.setFlag(`quest.${def.id}.stage`, stage.id);
  ctx.emit('quest.stage', { questId: def.id, stage: idx, desc: stage.desc });
  applyEffects(ctx, stage.onEnter);
  startStageObjectives(ctx, stage);
  // A scene objective whose scene was already seen counts at once.
  stage.objectives.forEach((o, i) => {
    if (o.type === 'scene' && ctx.world.slices.quests.scenesSeen.includes(o.scene))
      markMet(ctx, def, q, i);
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

/**
 * Record that an objective is met: the flag, the progress event and its solution path
 * (quest.<id>.path, the latest path taken; registry 8.7).
 */
export function markMet(ctx: SystemContext, def: QuestDef, q: QuestProgress, i: number): void {
  if (q.met[i]) return;
  q.met[i] = true;
  ctx.emit('quest.progress', { questId: def.id, objective: i, done: true });
  metEffects(ctx, def, q, i);
}

/** An objective was just met: its solution path and its own world writes (effects). */
export function metEffects(ctx: SystemContext, def: QuestDef, q: QuestProgress, i: number): void {
  const o = currentStage(def, q)?.objectives[i];
  if (o?.path) setPath(ctx, def, q, o.path);
  if (o?.effects) applyEffects(ctx, o.effects);
}

/** Write the solution path taken (quest.<id>.path). */
export function setPath(ctx: SystemContext, def: QuestDef, q: QuestProgress, path: string): void {
  q.path = path;
  ctx.setFlag(`quest.${def.id}.path`, path);
}

/** Polled satisfaction of an objective (event-driven ones keep their own flag). */
function polled(
  ctx: SystemContext,
  def: QuestDef,
  q: QuestProgress,
  o: Objective,
  i: number,
): boolean | PollResult {
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
    case 'reach':
      return atPlace(ctx, playerEntity(ctx.world), o.mapId, o.location);
    case 'scene':
      return ctx.world.slices.quests.scenesSeen.includes(o.scene);
    default:
      return pollModelObjective(ctx, def, q, o, i);
  }
}

/** Re-evaluate the current stage; completes it when every required objective holds. */
export function checkStage(ctx: SystemContext, def: QuestDef, q: QuestProgress): void {
  if (q.status !== 'active') return;
  const stage = currentStage(def, q);
  if (!stage) return;
  let all = true;
  let any = false;
  let failed = -1;
  stage.objectives.forEach((o, i) => {
    if (!q.met[i]) {
      const r = polled(ctx, def, q, o, i);
      if (r === true || r === 'met') markMet(ctx, def, q, i);
      else if (r === 'fail') {
        // an optional objective only drops out; a required one fails the stage (below)
        if (o.optional) objectiveFailed(ctx, def, q, i);
        else if (failed < 0) failed = i;
      }
    }
    if (q.met[i]) any = true;
    if (!q.met[i] && !o.optional) all = false;
  });
  const complete = stage.complete === 'any' ? any : all;
  if (!complete) {
    if (failed >= 0) objectiveFailed(ctx, def, q, failed);
    return;
  }
  stage.objectives.forEach((o) => {
    if (o.type === 'collect' && o.consume) {
      removeItem(ctx, ctx.world.slices.world.playerId, o.item, o.count, 'quest');
    }
  });
  applyEffects(ctx, stage.onComplete);
  stageDone(ctx, def, q);
}

/**
 * An objective failed (an escortee died, the player was seen, the guide was lost): an
 * optional one drops out (unmet, no longer polled); a required one applies the stage's
 * onFail and moves the quest to the stage's failure branch (failTo), or fails it forward
 * (quests_and_events.md 3.5).
 */
export function objectiveFailed(
  ctx: SystemContext,
  def: QuestDef,
  q: QuestProgress,
  i: number,
): void {
  if (q.status !== 'active') return;
  const stage = currentStage(def, q);
  const o = stage?.objectives[i];
  if (!stage || !o || q.met[i] || q.counts[i] === FAILED) return;
  ctx.emit('quest.progress', { questId: def.id, objective: i, done: false });
  if (o.optional) {
    q.counts[i] = FAILED;
    return;
  }
  applyEffects(ctx, stage.onFail);
  if (q.status !== 'active') return;
  const to = stage.failTo ? def.stages.findIndex((s) => s.id === stage.failTo) : -1;
  if (to >= 0) {
    enterStage(ctx, def, q, to);
    return;
  }
  failQuest(ctx, def, q);
}

/** Active quests with their definitions, in start order. */
export function activeQuests(ctx: SystemContext): { def: QuestDef; q: QuestProgress }[] {
  const slice = ctx.world.slices.quests;
  const out: { def: QuestDef; q: QuestProgress }[] = [];
  for (const id of slice.order) {
    const q = slice.quests[id];
    const def = questDefOf(ctx, id);
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
      const need = objectiveNeed(o);
      q.counts[i] = (q.counts[i] ?? 0) + amount;
      const done = (q.counts[i] ?? 0) >= need;
      ctx.emit('quest.progress', { questId: def.id, objective: i, done });
      if (done) {
        q.met[i] = true;
        metEffects(ctx, def, q, i);
      }
      changed = true;
    });
    if (changed) checkStage(ctx, def, q);
  }
}

/**
 * Whether a quest's week window is open: always without a window; otherwise only while
 * the world is in the quest's own act and act_week is inside the window.
 */
export function windowOpen(ctx: SystemContext, def: QuestDef): boolean {
  const w = def.weekWindow;
  if (!w) return true;
  if (currentActId(ctx) !== def.act) return false;
  const week = Number(ctx.flag('act_week') ?? 0);
  return week >= (w.from ?? 1) && (w.to === undefined || week <= w.to);
}

/** Whether a quest that was never started could start now (window open, trigger holds). */
export function available(ctx: SystemContext, def: QuestDef): boolean {
  return windowOpen(ctx, def) && conditionHolds(ctx, def.trigger);
}

/**
 * Settle the closing outcomes (by_other, expiry, failure; outcomes.ts), then start every
 * automatic quest whose trigger holds (giverless quests).
 */
export function scanAvailability(ctx: SystemContext): void {
  const slice = ctx.world.slices.quests;
  slice.dirty = false;
  settleOutcomes(ctx);
  for (const def of ctx.content.quests) {
    if (slice.quests[def.id] || def.giver) continue;
    if (available(ctx, def)) startQuest(ctx, def.id);
  }
}

/** Quests an NPC could offer right now (not started, window open, trigger holds). */
export function offerable(ctx: SystemContext, npc: string): QuestDef[] {
  const slice = ctx.world.slices.quests;
  return ctx.content.quests.filter(
    (d) =>
      d.giver !== undefined &&
      matchesQuestNpc(ctx.content, d.giver, npc) &&
      !slice.quests[d.id] &&
      available(ctx, d),
  );
}
