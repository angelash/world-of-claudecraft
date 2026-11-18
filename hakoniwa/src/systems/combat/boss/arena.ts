// Sealed arenas (combat_and_classes.md 10.1 `arena.seal`; catalog_dungeons_bosses.md 1.6
// `oathLock`): a boss whose data seals its arena does so at the pull. While the seal holds
// the boss is never leashed and does not flee, and `arenaSealed` tells the other systems
// (the doors' return charm, the map exits, the interface) that nobody of the fight may leave.
// The seal opens when the boss falls, yields or resolves, or resets (a wipe sends it home).

import type { SystemContext } from '../../../core/system';
import type { World } from '../../../core/world';
import { getEntity } from '../../world';
import { monsterDef } from '../defs';
import type { Unit } from '../types';
import { fightOf, mechOf } from './fight';

/** Whether a boss's data seals its arena (`arena.seal`, or the oath lock). */
export function seals(
  ctx: { content: SystemContext['content'] },
  u: Pick<Unit, 'monsterId'>,
): boolean {
  const m = mechOf(ctx, u)?.m;
  return !!m?.arena?.seal || !!m?.oathLock;
}

/** Seal the arena at the pull. */
export function sealArena(ctx: SystemContext, u: Unit): void {
  const mm = mechOf(ctx, u);
  if (!mm || !seals(ctx, u)) return;
  const fight = fightOf(ctx, u);
  if (fight.sealed) return;
  fight.sealed = true;
  ctx.emit('combat.arena', { entityId: u.id, bossId: mm.mon.id, op: 'sealed' });
}

/** Open the arena again. */
export function openArena(ctx: SystemContext, u: Unit): void {
  const fight = u.boss;
  const mm = mechOf(ctx, u);
  if (!fight?.sealed || !mm) return;
  delete fight.sealed;
  ctx.emit('combat.arena', { entityId: u.id, bossId: mm.mon.id, op: 'opened' });
}

/**
 * The sealed boss fight holding a map, if any: the boss unit id. A unit on that map cannot
 * leave by exits or the return charm while it holds (the readers are the world and the doors).
 */
export function arenaSealed(world: World, mapId: string): string | null {
  for (const id of Object.keys(world.slices.combat.units).sort()) {
    const u = world.slices.combat.units[id];
    if (!u?.boss?.sealed) continue;
    const e = getEntity(world, id);
    if (e?.mapId === mapId && e.alive) return id;
  }
  return null;
}

/** Whether the oath lock forbids this monster to flee. */
export function oathBound(content: SystemContext['content'], u: Unit): boolean {
  return !!monsterDef(content, u.monsterId)?.mechanics?.oathLock;
}
