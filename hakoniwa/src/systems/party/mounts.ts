// Mounts (catalog_creatures_mounts.md 10; travel_and_exploration.md 2.4). A mount is an item
// the player holds (the donkey `mnt_donkey`, bought at the post station); the party rides
// one of them. Travel reads the ridden mount: its day's travel scales the riding legs, the
// party goes at its slowest member, and a donkey stops at sediment grade 3. Selling or
// losing the animal ends the ride.

import type { ContentMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import type { World } from '../../core/world';
import { countItem } from '../inventory';
import type { MountDef } from './types';

export function mountDef(content: ContentMap, id: string): MountDef | undefined {
  return (content.mounts ?? []).find((m) => m.id === id);
}

/** Ride a mount the player holds, or none. Returns a reject code or null. */
export function ride(ctx: SystemContext, mountId: string | null): string | null {
  const slice = ctx.world.slices.party;
  if (mountId === null) {
    if (slice.mount === undefined) return null;
    delete slice.mount;
    ctx.emit('party.mount', { mountId: null });
    return null;
  }
  if (!mountDef(ctx.content, mountId)) return 'no_mount';
  if (countItem(ctx.world, ctx.world.slices.world.playerId, mountId) <= 0) return 'missing';
  if (slice.mount === mountId) return null;
  slice.mount = mountId;
  ctx.emit('party.mount', { mountId });
  return null;
}

/** The mount the party rides (still held), or null. */
export function activeMount(world: World, content: ContentMap): MountDef | null {
  const id = world.slices.party?.mount;
  if (!id || countItem(world, world.slices.world.playerId, id) <= 0) return null;
  return mountDef(content, id) ?? null;
}

/** Whether the ridden mount stops at this canon sediment grade (the donkey at 3). */
export function mountStops(world: World, content: ContentMap, grade: number): boolean {
  const m = activeMount(world, content);
  return !!m && m.stopsAtSediment !== null && grade >= m.stopsAtSediment;
}

/** The party's day's travel when riding: the mount's, or null on foot. */
export function rideDayKm(world: World, content: ContentMap): number | null {
  return activeMount(world, content)?.dayKm ?? null;
}

/** The player gave the animal away or sold it: the ride ends. */
export function mountItemChanged(ctx: SystemContext, ownerId: string, itemId: string): void {
  const slice = ctx.world.slices.party;
  if (ownerId !== ctx.world.slices.world.playerId || slice.mount !== itemId) return;
  if (countItem(ctx.world, ownerId, itemId) > 0) return;
  delete slice.mount;
  ctx.emit('party.mount', { mountId: null });
}
