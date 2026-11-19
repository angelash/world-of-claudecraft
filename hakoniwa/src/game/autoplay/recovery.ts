// Recovery routes read the same hostile alert circles as the player's rest UI.
// An entrance is useful only when its destination gives the party room to recover.
import type { RestView } from '../../systems/travel/rest';
import { hostileInReach } from '../../systems/travel/rest';
import { findPath, isWalkable, nearestWalkable } from '../../systems/world/grid';
import { liveMap } from '../../systems/world/switches';
import type { Entity, ExitDef, MapDef, Waypoint } from '../../systems/world/types';
import { reachableExits } from './nav';

/** Draw an encountered melee boss away from its guards without crossing its leash. */
export function bossLurePoint(
  view: RestView,
  map: MapDef,
  player: Entity,
  boss: Entity,
  exit: ExitDef,
): Waypoint | null {
  const unit = view.world.slices.combat.units[boss.id];
  const monster = view.content.monsters.find((m) => m.id === unit?.monsterId);
  const path = findPath(liveMap(map, view.world.meta.flags), player, {
    x: exit.x + 0.5,
    y: exit.y + 0.5,
  });
  const distance = Math.max(4, (monster?.leash ?? 18) * 0.65);
  return path?.find((p) => Math.hypot(p.x - boss.x, p.y - boss.y) >= distance) ?? null;
}

export function safeRecoveryExits(view: RestView, map: MapDef, player: Entity): ExitDef[] {
  return reachableExits(map, view.world.meta.flags, player).filter((exit) => {
    const dest = view.content.maps.find((m) => m.id === exit.toMap);
    if (!dest) return false;
    const loc = dest.locations.find((l) => l.id === exit.toLocation);
    const arrival = nearestWalkable(
      liveMap(dest, view.world.meta.flags),
      loc ? loc.x + loc.w / 2 : exit.toX,
      loc ? loc.y + loc.h / 2 : exit.toY,
    );
    return !!arrival && !hostileInReach(view, { ...player, mapId: dest.id, ...arrival });
  });
}

/** The nearest reachable tile outside hostile alert circles, at most twelve tiles away. */
export function localRecoveryPoint(view: RestView, map: MapDef, player: Entity): Waypoint | null {
  const live = liveMap(map, view.world.meta.flags);
  const cx = Math.floor(player.x),
    cy = Math.floor(player.y);
  for (let radius = 1; radius <= 12; radius++) {
    const candidates: Waypoint[] = [];
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const point = { x: cx + dx + 0.5, y: cy + dy + 0.5 };
        if (isWalkable(live, point.x, point.y) && !hostileInReach(view, { ...player, ...point }))
          candidates.push(point);
      }
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y),
    );
    for (const point of candidates) if (findPath(live, player, point)) return point;
  }
  return null;
}
