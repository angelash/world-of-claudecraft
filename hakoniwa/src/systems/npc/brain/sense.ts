// What a brain senses around its actor: the player nearby, people nearby, others at the
// same place, the rumors it holds, its belief about the player. Reads only the actor's
// surroundings and its own slices of the social systems (builtin_ai.md 1.2).

import type { SystemContext } from '../../../core/system';
import { TICKS_PER_GAME_HOUR } from '../../../core/time';
import type { BeliefProfile, RumorHolding } from '../../cognition/types';
import { distance, entitiesNear, getEntity, playerEntity } from '../../world';
import type { Entity } from '../../world/types';
import { bumpNeed } from '../needs';
import { cardOf } from '../personas';
import { relationOf } from '../relations';
import { hasTrait } from '../traits';
import type { NpcState } from '../types';
import { noteRecent, since, sortedNpcIds } from './state';

/** A rumor counts as hot from this heat (builtin_ai 3.4 and 5.2). */
export const HOT_HEAT = 0.3;

export function entityOf(ctx: SystemContext, st: NpcState): Entity | undefined {
  const e = getEntity(ctx.world, st.entityId);
  return e?.alive ? e : undefined;
}

/** The player's entity when it stands on the actor's map within `range` tiles. */
export function playerWithin(ctx: SystemContext, st: NpcState, range: number): Entity | undefined {
  const e = entityOf(ctx, st);
  const p = playerEntity(ctx.world);
  if (!e || !p?.alive || p.hidden || p.mapId !== e.mapId) return undefined;
  return distance(e, p) <= range ? p : undefined;
}

/** Other people (named NPCs, residents, the player) within `range` tiles of the actor. */
export function peopleNear(ctx: SystemContext, st: NpcState, range: number): Entity[] {
  const e = entityOf(ctx, st);
  if (!e) return [];
  return entitiesNear(
    ctx.world,
    e.mapId,
    e.x,
    e.y,
    range,
    (x) => x.id !== e.id && (x.kind === 'npc' || x.kind === 'player'),
  );
}

/** Named NPCs (not residents) at the same place as the actor now, sorted by id. */
export function namedHere(ctx: SystemContext, st: NpcState): NpcState[] {
  const slice = ctx.world.slices.npc;
  const out: NpcState[] = [];
  for (const id of sortedNpcIds(slice.npcs)) {
    const o = slice.npcs[id] as NpcState;
    if (o === st || o.resident || o.gone || o.mapId !== st.mapId || o.locId !== st.locId) continue;
    out.push(o);
  }
  return out;
}

/** The rumors an NPC holds, hottest first (heat x credibility; ties by rumor id). */
export function holdingsByHeat(ctx: SystemContext, id: string): RumorHolding[] {
  const cog = ctx.world.slices.cognition;
  if (!cog) return [];
  const list = cog.holdings[id] ?? [];
  const w = (h: RumorHolding) => (cog.rumors[h.rumor]?.heat ?? 0) * h.cred;
  return [...list].sort((a, b) => w(b) - w(a) || (a.rumor < b.rumor ? -1 : 1));
}

/** The holder has a rumor at least this hot. */
export function holdsHot(ctx: SystemContext, id: string, heat = HOT_HEAT): boolean {
  const cog = ctx.world.slices.cognition;
  if (!cog) return false;
  return (cog.holdings[id] ?? []).some((h) => (cog.rumors[h.rumor]?.heat ?? 0) >= heat);
}

/** The actor's belief about the player (undefined before the first evidence). */
export function beliefAboutPlayer(ctx: SystemContext, id: string): BeliefProfile | undefined {
  return ctx.world.slices.cognition?.beliefs[id]?.player;
}

/** Relation of the actor toward the player. */
export function towardPlayer(ctx: SystemContext, id: string) {
  return relationOf(ctx.world.slices.npc, id, 'player');
}

/** Some named NPC of this map with the given functional role is present (not gone). */
export function roleOnMap(ctx: SystemContext, mapId: string, role: string): boolean {
  const slice = ctx.world.slices.npc;
  for (const p of ctx.content.npcs ?? []) {
    if (!p.roles?.includes(role as never)) continue;
    const o = slice.npcs[p.id];
    if (o && !o.gone && o.mapId === mapId) return true;
  }
  return false;
}

/** Hostile beasts this close make a person afraid (builtin_ai.md 3.3 safety: -30). */
export const THREAT_RADIUS = 8;

/** Sense a hostile beast near the person: the safety need falls and the threat is noted. */
export function senseThreat(ctx: SystemContext, st: NpcState): void {
  const e = entityOf(ctx, st);
  if (!e || st.resident) return;
  const near = entitiesNear(
    ctx.world,
    e.mapId,
    e.x,
    e.y,
    THREAT_RADIUS,
    (x) => x.kind === 'monster' && x.tags.includes('hostile'),
  );
  if (near.length === 0) return;
  if (since(st, 'threat', ctx.tick) > TICKS_PER_GAME_HOUR / 2) {
    const p = cardOf(ctx.world.slices.npc, ctx.content, st.id)?.persona;
    bumpNeed(st.needs, 'safety', -30, hasTrait(p, 'timid') ? 1.4 : 1);
  }
  noteRecent(st, 'threat', ctx.tick);
}
