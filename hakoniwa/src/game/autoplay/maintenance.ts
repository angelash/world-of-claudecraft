// The existing 20% durability warning is a reason to visit a real, reachable smith.
// The inventory owns repair eligibility, its quote, materials and all state changes;
// this driver only walks there and submits the same command as the player.
import type { CommandMap, ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { inCombat } from '../../systems/combat/units';
import {
  canRepair,
  crafterSmith,
  holdingOf,
  LOW_DURABILITY,
  repairQuote,
  SERVICE_TAGS,
  SMITH_REACH,
  wornPieces,
} from '../../systems/inventory';
import { findPath, nearestWalkable, playerEntity } from '../../systems/world';
import { liveMap } from '../../systems/world/switches';
import type { Entity } from '../../systems/world/types';
import { attackers, friendlyIds } from './fight';
import { nextLeg } from './nav';

export interface MaintenanceHost {
  readonly world: World;
  readonly content: ContentMap;
  intent: { what: string };
  walkTo(mapId: string, x: number, y: number, radius?: number): 'here' | 'walking' | 'blocked';
  stopMoving(): void;
  send(cmd: { kind: 'inventory.repair'; data: CommandMap['inventory.repair'] }): void;
  recentlyRejected(kind: string, ticks: number): boolean;
}

export interface MaintenanceOptions {
  /** Recovery may use an already reachable service, without walking away to find one. */
  nearbyOnly?: boolean;
}

/** A rejected service is left alone for twenty seconds so story decisions can proceed. */
const REPAIR_RETRY = 400;

interface RepairVisit {
  smith: Entity;
  instanceId: string;
  hops: number;
  distance: number;
}

/** Read each ordinary exit's arrival, then verify that arrival can reach the smith. */
function smithRoute(
  bot: MaintenanceHost,
  player: Entity,
  smith: Entity,
): Pick<RepairVisit, 'hops' | 'distance'> | null {
  const { world, content } = bot;
  let point = { mapId: player.mapId, x: player.x, y: player.y };
  let hops = 0;
  let distance = Math.hypot(smith.x - player.x, smith.y - player.y);
  const seen = new Set<string>();
  while (point.mapId !== smith.mapId) {
    if (seen.has(point.mapId)) return null;
    seen.add(point.mapId);
    const leg = nextLeg(content.maps, world.meta.flags, point.mapId, smith.mapId, point);
    if (!leg) return null;
    if (hops === 0) distance = Math.hypot(leg.exit.x + 0.5 - point.x, leg.exit.y + 0.5 - point.y);
    const dest = content.maps.find((m) => m.id === leg.exit.toMap);
    if (!dest) return null;
    const loc = dest.locations.find((l) => l.id === leg.exit.toLocation);
    const arrival = nearestWalkable(
      liveMap(dest, world.meta.flags),
      loc ? loc.x + loc.w / 2 : leg.exit.toX,
      loc ? loc.y + loc.h / 2 : leg.exit.toY,
    );
    if (!arrival) return null;
    point = { mapId: dest.id, ...arrival };
    hops++;
  }
  const map = content.maps.find((m) => m.id === point.mapId);
  if (!map) return null;
  const path = findPath(liveMap(map, world.meta.flags), point, smith);
  const end = path?.at(-1) ?? point;
  if (!path || Math.hypot(end.x - smith.x, end.y - smith.y) > SMITH_REACH) return null;
  return { hops, distance };
}

/** An affordable worn piece, low or broken, and a smith who can actually mend it. */
function repairVisit(
  bot: MaintenanceHost,
  player: Entity,
  opts: MaintenanceOptions,
): RepairVisit | null {
  const { world, content } = bot;
  const h = holdingOf(world, player.id);
  for (const piece of wornPieces(world, content, player.id)) {
    const inst = piece.inst;
    const d = inst?.durability;
    if (!inst || !d || d.cur > d.max * LOW_DURABILITY) continue;
    const quote = repairQuote(piece.def, inst);
    if (!quote || quote.copper > h.money) continue;
    const mat = quote.material;
    if (mat && (h.items[mat.itemId] ?? 0) < mat.count) continue;
    const visits: RepairVisit[] = [];
    for (const smith of Object.values(world.slices.world.entities)) {
      if (
        smith.kind !== 'npc' ||
        !smith.alive ||
        smith.hidden ||
        !smith.tags.includes(SERVICE_TAGS[0])
      )
        continue;
      const distance = Math.hypot(smith.x - player.x, smith.y - player.y);
      if (opts.nearbyOnly && (smith.mapId !== player.mapId || distance > SMITH_REACH)) continue;
      const id = smith.ref ?? smith.id;
      if (!canRepair(piece.def, inst, { skill: 0, id, ...crafterSmith(content, id) })) continue;
      const route = opts.nearbyOnly ? { hops: 0, distance } : smithRoute(bot, player, smith);
      if (route) visits.push({ smith, instanceId: inst.instanceId, ...route });
    }
    visits.sort(
      (a, b) => a.hops - b.hops || a.distance - b.distance || a.smith.id.localeCompare(b.smith.id),
    );
    if (visits[0]) return visits[0];
  }
  return null;
}

/** Ticks to the next decision, or null when upkeep has no legal action now. */
export function maintainGear(bot: MaintenanceHost, opts: MaintenanceOptions = {}): number | null {
  const { world } = bot;
  const player = playerEntity(world);
  if (!player?.alive || world.slices.scenes?.current || world.slices.scenes?.queue.length)
    return null;
  if (
    [...friendlyIds(world)].some((id) => {
      const unit = world.slices.combat.units[id];
      return unit && (unit.downed || unit.hp <= 0 || inCombat(world, unit));
    }) ||
    attackers(world).length > 0 ||
    bot.recentlyRejected('inventory.repair', REPAIR_RETRY)
  )
    return null;
  const visit = repairVisit(bot, player, opts);
  if (!visit) return null;
  const { smith, instanceId } = visit;
  const arrived = opts.nearbyOnly ? 'here' : bot.walkTo(smith.mapId, smith.x, smith.y, SMITH_REACH);
  if (arrived === 'blocked') return null;
  bot.intent = { what: `repair worn gear at ${smith.ref ?? smith.id}` };
  if (arrived === 'walking') return 4;
  bot.stopMoving();
  bot.send({
    kind: 'inventory.repair',
    data: { ownerId: player.id, instanceId, smithId: smith.id },
  });
  return 2;
}
