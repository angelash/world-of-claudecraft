// The quests system's subscriptions for the objective kinds of the quest model (PK-M1-58):
// talks (deliver, persuade, rescue), deaths (escortee, captive, guide, companion, duel
// opponent), the player's map changes (a new stealth approach), trades, gathering,
// crafting, duels and detection, and the time spent together (accompany). Kept out of the
// system file so index.ts stays the thin coordinator of the quests system.

import type { EventMap } from '../../core/contracts';
import type { GameSystem, SystemContext } from '../../core/system';
import { isPartySide, unitOf } from '../combat';
import { countItem } from '../inventory';
import { sortedMembers } from '../party/roster';
import { getEntity } from '../world';
import { conditionHolds } from './effects';
import {
  accrueTogether,
  deathFails,
  duelCounts,
  FAILED,
  onPersuade,
  onTalk,
  tradeAmount,
} from './objectives';
import { activeQuests, bump, checkStage, currentStage, markMet, objectiveFailed } from './progress';
import type { Objective, QuestDef, QuestProgress } from './types';

/** Returns true when it changed the objective (then the stage is re-checked). */
type Visit = (def: QuestDef, q: QuestProgress, o: Objective, i: number) => boolean;

/** Visit the open objectives of the active quests' current stages, then re-check them. */
function eachOpen(ctx: SystemContext, visit: Visit): void {
  for (const { def, q } of activeQuests(ctx)) {
    const stage = currentStage(def, q);
    if (!stage) continue;
    const stageAt = q.stage;
    let changed = false;
    stage.objectives.forEach((o, i) => {
      if (q.status !== 'active' || q.stage !== stageAt || q.met[i] || q.counts[i] === FAILED)
        return;
      if (visit(def, q, o, i)) changed = true;
    });
    if (changed && q.status === 'active') checkStage(ctx, def, q);
  }
}

/** The player or one of their companions. */
export function isPlayerSide(ctx: SystemContext, id: string | undefined): boolean {
  if (!id) return false;
  if (id === ctx.world.slices.world.playerId) return true;
  const e = getEntity(ctx.world, id);
  return !!e && (e.kind === 'companion' || e.tags.includes('companion'));
}

/**
 * The player talked to `npc` (a person's content id); `optionalOnly` visits only the optional
 * objectives (an optional hand-in counts before the talk closes its stage).
 */
export function talkObjectives(ctx: SystemContext, npc: string, optionalOnly = false): void {
  eachOpen(ctx, (def, q, o, i) => {
    if (optionalOnly && !o.optional) return false;
    const r = onTalk(ctx, q, o, i, npc);
    if (r === 'met') markMet(ctx, def, q, i);
    return r !== 'none';
  });
}

/**
 * The open persuade objectives on `npc` (a person's content id): the quest, the objective
 * and its threshold, for the dialogue's persuasion option (PK-M1-19). A query: no writes.
 */
export function openPersuasions(
  ctx: SystemContext,
  npc: string,
): { questId: string; index: number; when: string }[] {
  const out: { questId: string; index: number; when: string }[] = [];
  for (const { def, q } of activeQuests(ctx)) {
    const stage = currentStage(def, q);
    stage?.objectives.forEach((o, i) => {
      if (o.type !== 'persuade' || o.npc !== npc) return;
      if (q.met[i] || q.counts[i] === FAILED) return;
      out.push({ questId: def.id, index: i, when: o.when });
    });
  }
  return out;
}

/** The player persuaded `npc` in a conversation: thresholds that hold now are met. */
export function persuadeObjectives(ctx: SystemContext, npc: string): void {
  eachOpen(ctx, (def, q, o, i) => {
    if (!onPersuade(ctx, o, npc)) return false;
    markMet(ctx, def, q, i);
    return true;
  });
}

/**
 * An entity died: the objectives that hang on that person fail. A companion's death event
 * is its going down in a fight (combat revives it), so it fails nothing; a companion lost
 * for good shows in companion.<id>.state, which the poll reads (objectives.ts personGone).
 */
export function deathObjectives(ctx: SystemContext, d: EventMap['entity.died']): void {
  if (d.kind === 'companion') return;
  const byPlayer = isPlayerSide(ctx, d.killerId);
  eachOpen(ctx, (def, q, o, i) => {
    if (!deathFails(o, d.ref, byPlayer)) return false;
    objectiveFailed(ctx, def, q, i);
    return true;
  });
}

/** The player changed maps: a spoiled stealth approach may start over. */
export function mapChangedObjectives(ctx: SystemContext): void {
  eachOpen(ctx, (_def, q, o, i) => {
    if (o.type !== 'stealth' || q.counts[i] !== 1) return false;
    q.counts[i] = 0;
    return true;
  });
}

/** Add up the time spent together for accompany objectives (tick polls and skip steps). */
export function accrueObjectives(ctx: SystemContext): void {
  for (const { def, q } of activeQuests(ctx)) {
    const stage = currentStage(def, q);
    if (stage && accrueTogether(ctx, q, stage)) checkStage(ctx, def, q);
  }
}

/** Subscriptions to the events only the model's objectives listen to. */
export const objectiveSubscriptions: NonNullable<GameSystem['on']> = {
  'economy.traded'(ctx, e) {
    if (e.data.ownerId !== ctx.world.slices.world.playerId) return;
    const amount = Math.max(0, e.data.qty);
    if (amount > 0) bump(ctx, (o) => tradeAmount(o, e.data) > 0, amount);
  },
  'gather.done'(ctx, e) {
    const d = e.data;
    if (!isPlayerSide(ctx, d.entityId) || d.count <= 0) return;
    bump(
      ctx,
      (o) =>
        o.type === 'gather' && (!o.item || o.item === d.itemId) && (!o.node || o.node === d.nodeId),
      d.count,
    );
  },
  'craft.done'(ctx, e) {
    const d = e.data;
    if (!isPlayerSide(ctx, d.entityId) || d.count <= 0) return;
    const recipe = ctx.content.recipes?.find((r) => r.id === d.recipeId);
    bump(
      ctx,
      (o) =>
        o.type === 'craft' &&
        (!o.item || o.item === d.itemId) &&
        (!o.recipe || o.recipe === d.recipeId) &&
        (!o.profession || recipe?.profession === o.profession) &&
        (!o.families || (!!recipe?.family && o.families.includes(recipe.family))) &&
        (o.quality === undefined || (d.quality ?? 0) >= o.quality) &&
        (!o.masterwork || d.masterwork === true) &&
        (!o.signedInput || d.signedInputs === true) &&
        conditionHolds(ctx, o.when),
      d.count,
    );
  },
  'item.used'(ctx, e) {
    const d = e.data;
    if (d.ownerId !== ctx.world.slices.world.playerId || d.early) return;
    bump(ctx, (o) => {
      if (o.type !== 'use' || (o.item && o.item !== d.itemId)) return false;
      if (o.effect && o.effect !== d.effect) return false;
      if (o.targetRef && getEntity(ctx.world, d.targetId ?? '')?.ref !== o.targetRef) return false;
      if (o.pet)
        return sortedMembers(ctx.world).some(
          (m) => m.pet?.kind === 'half' && m.entityId === d.targetId && m.state !== 'dead',
        );
      return true;
    });
  },
  'party.joined'(ctx) {
    for (const { def, q } of activeQuests(ctx)) checkStage(ctx, def, q);
  },
  'party.fed'(ctx, e) {
    bump(
      ctx,
      (o) => o.type === 'feed' && (!o.companions || o.companions.includes(e.data.companionId)),
    );
  },
  'combat.purified'(ctx, e) {
    const caster = unitOf(ctx.world, e.data.casterId);
    if (!caster || !isPartySide(ctx.world, caster)) return;
    bump(ctx, (o) => o.type === 'purify' && o.monster === e.data.from);
  },
  'guild.commission_done'(ctx, e) {
    const t = ctx.content.commissions?.find((x) => x.id === e.data.templateId);
    if (!t) return;
    bump(
      ctx,
      (o) =>
        o.type === 'commission' &&
        (!o.kind || o.kind === t.kind) &&
        (!o.carrying || countItem(ctx.world, ctx.world.slices.world.playerId, o.carrying) > 0),
    );
  },
  'duel.ended'(ctx, e) {
    bump(ctx, (o) => duelCounts(o, e.data));
  },
  'stealth.detected'(ctx, e) {
    if (e.data.entityId !== ctx.world.slices.world.playerId) return;
    eachOpen(ctx, (def, q, o, i) => {
      if (o.type !== 'stealth') return false;
      if (o.retry === false) objectiveFailed(ctx, def, q, i);
      else q.counts[i] = 1;
      return true;
    });
  },
};
