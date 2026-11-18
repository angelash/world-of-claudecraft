// Temporary companions (escort, rescue and accompany objectives; quest model 5): a person
// with a companion card who walks with the player for a quest stage before joining (Shiya
// and Ron in act 1) fights at the player's side for that stage. Their legs are the NPC
// system's follow order (src/systems/npc/brain/quest_orders.ts), started from the same
// quest stage; the party drives the skills of the combat unit the person already has (a
// person without one only walks along). The tie ends when the quest leaves that stage. They
// hold no companion place and no bond; recruiting the person later makes them a companion
// in the usual way.

import type { SystemContext } from '../../core/system';
import { setAutoAttack, unitOf } from '../combat';
import type { QuestDef } from '../quests/types';
import { companionDef, partyConfig } from './config';
import type { Member } from './types';

function npcEntity(ctx: SystemContext, ref: string): string | undefined {
  for (const id of Object.keys(ctx.world.slices.world.entities).sort()) {
    const e = ctx.world.slices.world.entities[id];
    if (e && e.ref === ref && e.kind === 'npc' && e.alive && !e.hidden) return id;
  }
  return undefined;
}

/** Take a person along for a quest stage; false when there is no one to take. */
export function adoptTemp(
  ctx: SystemContext,
  ref: string,
  questId: string,
  stage: string,
): boolean {
  const slice = ctx.world.slices.party;
  if (slice.members[ref]) return false;
  const def = companionDef(ctx.content, ref);
  if (!def) return false;
  const entityId = npcEntity(ctx, ref);
  if (!entityId) return false;
  const m: Member = {
    id: ref,
    entityId,
    order: 'assist',
    state: 'party',
    bond: 0,
    reached: [],
    told: [],
    joinedTick: ctx.tick,
    downedTick: 0,
    pathAt: 0,
    temp: { questId, stage },
  };
  slice.members[ref] = m;
  ctx.emit('party.state', { companionId: ref, from: 'standby', to: 'party' });
  return true;
}

/** End a temporary tie (the stage moved on, the person was recruited or is gone). */
export function releaseTemp(ctx: SystemContext, m: Member): void {
  if (!m.temp) return;
  const u = unitOf(ctx.world, m.entityId);
  if (u?.autoAttack) setAutoAttack(ctx, m.entityId, false);
  delete ctx.world.slices.party.members[m.id];
  ctx.emit('party.state', { companionId: m.id, from: 'party', to: 'standby' });
}

function questDef(ctx: SystemContext, id: string): QuestDef | undefined {
  return (ctx.content.quests ?? []).find((q) => q.id === id);
}

/** A quest entered a stage: take along the people its walking objectives name. */
export function onQuestStage(ctx: SystemContext, questId: string, index: number): void {
  const stage = questDef(ctx, questId)?.stages[index];
  if (!stage) return;
  const kinds = partyConfig(ctx.content).tempObjectives;
  for (const o of stage.objectives) {
    if (!kinds.includes(o.type) || !('npc' in o) || typeof o.npc !== 'string') continue;
    // a captive with a destination walks along once freed (the talk), not before
    if (o.type === 'rescue' && 'mapId' in o && o.mapId) continue;
    adoptTemp(ctx, o.npc, questId, stage.id);
  }
}

/** The player talked to someone: a freed captive of an active rescue walks along. */
export function onTalked(ctx: SystemContext, ref: string): void {
  if (!partyConfig(ctx.content).tempObjectives.includes('rescue')) return;
  for (const def of ctx.content.quests ?? []) {
    if (ctx.flag(`quest.${def.id}`) !== 'active') continue;
    const stageId = ctx.flag(`quest.${def.id}.stage`);
    const stage = def.stages.find((s) => s.id === stageId);
    if (!stage) continue;
    for (const o of stage.objectives)
      if (o.type === 'rescue' && o.npc === ref) adoptTemp(ctx, ref, def.id, stage.id);
  }
}

/** Ties whose stage is over, or whose person is gone, end (checked once a second). */
export function settleTemps(ctx: SystemContext): void {
  for (const id of Object.keys(ctx.world.slices.party.members).sort()) {
    const m = ctx.world.slices.party.members[id];
    if (!m?.temp) continue;
    const e = ctx.world.slices.world.entities[m.entityId];
    const active = ctx.flag(`quest.${m.temp.questId}`) === 'active';
    const same = ctx.flag(`quest.${m.temp.questId}.stage`) === m.temp.stage;
    if (!e?.alive || !active || !same) releaseTemp(ctx, m);
  }
}
