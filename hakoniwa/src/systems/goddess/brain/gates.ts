// The gates of a divine action (the G of catalog_goddess_interventions.md 5.0; catalog 2.5):
// a believer of hers to receive it, a real danger near her believers to warn of, a danger
// near the player for one in peril, a market, the player standing on the map, her token in
// the player's hands. The arbiter checks them for every act but the written ones; the dawn
// planner checks them before it scores. Reads the world only.

import type { SystemContext } from '../../../core/system';
import { countItem } from '../../inventory';
import { entitiesOnMap } from '../../world';
import type { ActionNeed, GoddessDef } from '../types';

/** Tiles within which a hostile creature is a real danger to someone. */
export const DANGER_RADIUS = 12;

/** The market whose maps include `mapId` (catalog 2.4: a market in her sight). */
export function marketOn(
  content: { markets?: readonly { id: string; mapIds?: readonly string[] }[] },
  mapId: string,
): string | undefined {
  return (content.markets ?? []).find((m) => m.mapIds?.includes(mapId))?.id;
}

/** Believers of a goddess on a map (her faith tags; priests count twice). */
export function believersOn(ctx: SystemContext, def: GoddessDef, mapId: string): number {
  let n = 0;
  const ents = ctx.world.slices.world.entities;
  for (const id of Object.keys(ents)) {
    const e = ents[id];
    if (!e || e.mapId !== mapId || !e.alive || e.hidden || e.kind === 'player') continue;
    if (e.tags.some((t) => def.faithTags.includes(t))) n += e.tags.includes('priest') ? 2 : 1;
  }
  return n;
}

/**
 * A hostile creature alive within DANGER_RADIUS of one of `near` on the map: a real danger
 * (catalog 2.5: an omen must answer one; builtin_ai 8.3: "真实危险靠近她的孩子").
 */
export function dangerNear(
  ctx: SystemContext,
  mapId: string,
  near: (e: { kind: string; tags: string[] }) => boolean,
): boolean {
  const ents = entitiesOnMap(ctx.world, mapId).filter((e) => e.alive && !e.hidden);
  const foes = ents.filter((e) => e.kind === 'monster' && e.tags.includes('hostile'));
  if (foes.length === 0) return false;
  return ents.some(
    (p) => near(p) && foes.some((f) => Math.hypot(f.x - p.x, f.y - p.y) <= DANGER_RADIUS),
  );
}

/** A real danger near her believers on the map. */
export function dangerOn(ctx: SystemContext, def: GoddessDef, mapId: string): boolean {
  return dangerNear(
    ctx,
    mapId,
    (e) => e.kind !== 'player' && e.tags.some((t) => def.faithTags.includes(t)),
  );
}

/** Whether a gate holds for an action of hers on a map. */
export function gateHolds(
  ctx: SystemContext,
  def: GoddessDef,
  need: ActionNeed,
  mapId: string,
): boolean {
  const playerMap = ctx.world.slices.world.entities[ctx.world.slices.world.playerId]?.mapId ?? '';
  switch (need) {
    case 'believer':
      return believersOn(ctx, def, mapId) > 0;
    case 'danger':
      return dangerOn(ctx, def, mapId);
    case 'peril':
      return mapId === playerMap && dangerNear(ctx, mapId, (e) => e.kind === 'player');
    case 'market':
      return marketOn(ctx.content, mapId) !== undefined;
    case 'player':
      return mapId === playerMap;
    case 'token':
      return !!def.token && countItem(ctx.world, ctx.world.slices.world.playerId, def.token) > 0;
  }
}
