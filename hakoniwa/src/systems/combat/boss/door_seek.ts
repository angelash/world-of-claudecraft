// Door seeking (combat_and_classes.md 10.8; act1_borderstone.md 10.4): the sediment colossus
// chases the biggest door in range. The player within `range` (20 tiles) is the biggest door;
// failing that, the nearest holder of the `fallbackTag` (the door-marked children) in range;
// failing both, threat as usual. Within 3 tiles of a holder it channels its `channel`
// ability on the holder (the door drain: interruptible, stronger the longer it runs); an
// interrupt, or the player stepping within 6 tiles, turns it back on the player. Whether a
// child's mark shows is the scene's business: the kernel only emits the channel and its
// pulses, and `combat.door_seek` on every change of target.

import type { SystemContext } from '../../../core/system';
import { entitiesOnMap, getEntity, playerEntity } from '../../world';
import type { Entity } from '../../world/types';
import { interruptCast, startChannelOn } from '../abilities';
import type { Unit } from '../types';
import { canAttack, liveUnit, unitOf } from '../units';
import { fightOf, mechOf } from './fight';

/** A holder this close is drained (10.8). */
export const DRAIN_REACH = 3;
/** The player this close breaks the drain (10.8). */
export const DRAIN_BREAK = 6;

export type SeekPick =
  | { kind: 'player'; unit: Unit }
  | { kind: 'mark'; entity: Entity }
  | { kind: 'threat' };

function nearestHolder(
  ctx: SystemContext,
  e: Entity,
  tag: string,
  range: number,
): Entity | undefined {
  let best: Entity | undefined;
  let bestD = Number.POSITIVE_INFINITY;
  for (const o of entitiesOnMap(ctx.world, e.mapId)) {
    if (o.id === e.id || !o.alive || o.hidden || !o.tags.includes(tag)) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d > range) continue;
    if (d < bestD || (d === bestD && best && o.id < best.id)) {
      best = o;
      bestD = d;
    }
  }
  return best;
}

/** The door a seeker wants now; null when the monster does not seek doors. */
export function doorSeekPick(ctx: SystemContext, u: Unit, e: Entity): SeekPick | null {
  const m = mechOf(ctx, u)?.m;
  const ds = m?.doorSeek;
  // `targeting: threat` turns the seeking off for a record that keeps the field
  if (!ds || (m?.targeting ?? 'doorSeek') !== 'doorSeek') return null;
  const pe = playerEntity(ctx.world);
  const pu = pe ? unitOf(ctx.world, pe.id) : undefined;
  const playerHere =
    pe && pu && pe.mapId === e.mapId && liveUnit(ctx.world, pu.id) && canAttack(ctx.world, u, pu);
  const dist = pe ? Math.hypot(pe.x - e.x, pe.y - e.y) : Number.POSITIVE_INFINITY;
  // a drain in progress holds until it is broken or the player comes close
  const c = u.cast;
  if (c && c.abilityId === ds.channel && c.targetId) {
    if (playerHere && pu && dist <= DRAIN_BREAK) {
      interruptCast(ctx, u);
      return { kind: 'player', unit: pu };
    }
    const held = getEntity(ctx.world, c.targetId);
    if (held?.alive) return { kind: 'mark', entity: held };
  }
  if (playerHere && pu && dist <= ds.range) return { kind: 'player', unit: pu };
  // a drain on its cooldown has nothing to do at a holder: back to the table
  const spent = !!ds.channel && (u.cds[ds.channel] ?? 0) > ctx.tick;
  const holder = spent ? undefined : nearestHolder(ctx, e, ds.fallbackTag, ds.range);
  if (holder) return { kind: 'mark', entity: holder };
  return { kind: 'threat' };
}

/** Report a change of door (`combat.door_seek`). */
export function noteSeek(ctx: SystemContext, u: Unit, pick: SeekPick): void {
  const fight = fightOf(ctx, u);
  const id = pick.kind === 'player' ? pick.unit.id : pick.kind === 'mark' ? pick.entity.id : null;
  const key = id ?? '';
  if (fight.seek === key) return;
  fight.seek = key;
  ctx.emit('combat.door_seek', {
    entityId: u.id,
    targetId: id,
    reason: pick.kind === 'mark' ? 'mark' : pick.kind,
  });
}

/**
 * Work a marked holder: walk up to it, then drain it. Returns true while the holder keeps
 * the seeker busy (the caller walks it there when this asks).
 */
export function drainHolder(
  ctx: SystemContext,
  u: Unit,
  e: Entity,
  holder: Entity,
  walk: (x: number, y: number, arrive: number) => void,
): void {
  const ds = mechOf(ctx, u)?.m.doorSeek;
  if (!ds) return;
  u.autoAttack = false;
  if (u.cast) return;
  const d = Math.hypot(holder.x - e.x, holder.y - e.y);
  if (d > DRAIN_REACH) {
    walk(holder.x, holder.y, DRAIN_REACH * 0.8);
    return;
  }
  if (ds.channel) startChannelOn(ctx, u, ds.channel, holder.id);
}
