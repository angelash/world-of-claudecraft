// Left items swallowed by the dungeon (catalog_dungeons_bosses.md 1.1, the last row of the
// activity table): what the player left behind on falling in a dungeon lies there for seven
// game days, then the dungeon swallows it (out in the wild the same clock gives it to the
// finder). The left pack itself (遗落包) belongs to the combat and inventory systems; this
// runtime sees it only through the narrow port below, registered by the system that owns
// the packs: the left items lying in the world, and a way to take one away. Without a
// registered port nothing is swallowed. A dungeon that collapses swallows at once what lies
// inside it; a purified one no longer swallows anything.

import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import type { World } from '../../core/world';
import { dungeonConfig, floorAt } from './layout';
import { instanceOf, standing } from './state';
import type { LeftItem } from './types';

/** How the dungeon runtime reaches the left packs (registered by their owner). */
export interface LeftItemPort {
  /** the left items lying in the world now, any map */
  items(world: World): readonly LeftItem[];
  /** the dungeon swallows the item: take it away; false when it was gone already */
  swallow(ctx: SystemContext, id: string): boolean;
}

let port: LeftItemPort | null = null;

/** Register (or clear, with null) the port of the left packs. One port; the last wins. */
export function registerLeftItemPort(p: LeftItemPort | null): void {
  port = p;
}

/** The registered port, if any. */
export function leftItemPort(): LeftItemPort | null {
  return port;
}

type Content = SystemContext['content'];

/** The items in id order (code unit order: the same on every host). */
function byId(items: readonly LeftItem[]): LeftItem[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The dungeon an item lies in (a standing one), or undefined outside every dungeon. */
function dungeonAt(world: World, content: Content, item: LeftItem) {
  return floorAt(content, item.mapId, item.x, item.y, (d) => standing(world, content, d));
}

/**
 * The tick a dungeon will swallow the item at, or null when it lies outside every standing
 * dungeon (where the pack keeps its own clock).
 */
export function swallowTick(world: World, content: Content, item: LeftItem): number | null {
  const cfg = dungeonConfig(content);
  if (!cfg || !dungeonAt(world, content, item)) return null;
  return item.since + cfg.leftItemDays * TICKS_PER_GAME_DAY;
}

function swallow(ctx: SystemContext, p: LeftItemPort, item: LeftItem, dungeonId: string): void {
  if (!p.swallow(ctx, item.id)) return;
  const st = instanceOf(ctx, dungeonId);
  if (st) st.swallowed++;
  ctx.emit('dungeon.swallowed', { dungeonId, itemId: item.id, mapId: item.mapId });
}

/** Swallow every left item that has lain its days in a dungeon. */
export function swallowDue(ctx: SystemContext): void {
  const p = port;
  if (!p) return;
  for (const item of byId(p.items(ctx.world))) {
    const due = swallowTick(ctx.world, ctx.content, item);
    if (due === null || ctx.tick < due) continue;
    const hit = dungeonAt(ctx.world, ctx.content, item);
    if (hit) swallow(ctx, p, item, hit.dungeon.id);
  }
}

/** The dungeon caved in: everything left inside it is gone at once. */
export function swallowAllIn(ctx: SystemContext, dungeonId: string): void {
  const p = port;
  if (!p) return;
  for (const item of byId(p.items(ctx.world))) {
    const hit = floorAt(ctx.content, item.mapId, item.x, item.y, (d) => d.id === dungeonId);
    if (hit) swallow(ctx, p, item, dungeonId);
  }
}
