// The player's visit to a dungeon (catalog_dungeons_bosses.md 1.1, 1.4): entering, moving
// between floors and leaving. The runtime reads where the player stands, so a visit starts
// however the player got in (a map exit, a door, the entry command, a story teleport) and
// ends however they got out (walking out, the leave command, dying and waking behind the
// door, a collapse). The entry command stands at the gate and checks the party cap; a walk
// in through a map exit is not stopped, it is marked over the cap (map exits are the world
// system's, and the party has no way yet to leave a companion outside). The deepest floor
// reached is mirrored to `dg.<id>.depth`.

import type { SystemContext } from '../../core/system';
import { isInParty } from '../party/view';
import { teleportPlayer } from '../quests/effects';
import { playerEntity } from '../world';
import { dungeonConfig, type FloorHit, floorAt, inRect, locationOf, partyCap } from './layout';
import { dungeonsSlice } from './slice';
import { instanceOf, mirrorDungeon, standing } from './state';
import type { DungeonDef, PlaceRef, RunVia } from './types';

/** Companions in the party now (the player not counted). */
export function partySize(ctx: Pick<SystemContext, 'world' | 'content'>): number {
  return (ctx.content.companions ?? []).filter((c) => isInParty(ctx.world, c.id)).length;
}

/** The standing dungeon floor the player is on, if any. */
export function playerFloor(ctx: SystemContext): FloorHit | undefined {
  const p = playerEntity(ctx.world);
  if (!p) return undefined;
  return floorAt(ctx.content, p.mapId, p.x, p.y, (d) => standing(ctx.world, ctx.content, d));
}

function reachDepth(ctx: SystemContext, hit: FloorHit): void {
  const st = instanceOf(ctx, hit.dungeon.id);
  if (!st || hit.floor.depth <= st.depth) return;
  st.depth = hit.floor.depth;
  mirrorDungeon(ctx, hit.dungeon.id, st);
}

/**
 * Bring the visit in line with where the player stands: end it when they are out (or in
 * another dungeon), start one when they are in, and move it when the floor changed.
 */
export function track(ctx: SystemContext, via: RunVia): void {
  const s = dungeonsSlice(ctx.world);
  const hit = playerFloor(ctx);
  const run = s.run;
  if (run && hit?.dungeon.id !== run.dungeon) {
    s.run = null;
    ctx.emit('dungeon.left', { dungeonId: run.dungeon, floorId: run.floor, via });
  }
  if (!hit) return;
  const cfg = dungeonConfig(ctx.content);
  if (!s.run) {
    const st = instanceOf(ctx, hit.dungeon.id);
    const cap = cfg ? partyCap(cfg, hit.dungeon, st?.pressure) : 0;
    const party = partySize(ctx);
    s.run = {
      dungeon: hit.dungeon.id,
      floor: hit.floor.id,
      enteredTick: ctx.tick,
      via,
      overCap: party > cap,
    };
    if (st) st.entries++;
    ctx.emit('dungeon.entered', {
      dungeonId: hit.dungeon.id,
      floorId: hit.floor.id,
      depth: hit.floor.depth,
      via,
      party,
      cap,
      overCap: party > cap,
    });
    reachDepth(ctx, hit);
    return;
  }
  if (s.run.floor !== hit.floor.id) {
    const from = s.run.floor;
    s.run.floor = hit.floor.id;
    ctx.emit('dungeon.floor_changed', {
      dungeonId: hit.dungeon.id,
      from,
      to: hit.floor.id,
      depth: hit.floor.depth,
    });
    reachDepth(ctx, hit);
  }
}

/** Put the player at the dungeon's arrival place and start the visit. */
export function enterDungeon(ctx: SystemContext, def: DungeonDef): boolean {
  if (!teleportPlayer(ctx, def.entry.mapId, def.entry.location)) return false;
  track(ctx, 'command');
  return true;
}

/** Put the player outside at the gate and end the visit. */
export function leaveDungeon(ctx: SystemContext, def: DungeonDef, via: RunVia): boolean {
  if (!teleportPlayer(ctx, def.gate.mapId, def.gate.location)) return false;
  track(ctx, via);
  return true;
}

/** Tiles around a gate or nest rectangle that still count as standing at it. */
export const GATE_MARGIN = 2;

/** Whether the player stands at a place (its location rectangle, a step around it). */
export function atPlace(ctx: SystemContext, place: PlaceRef): boolean {
  const p = playerEntity(ctx.world);
  const l = locationOf(
    ctx.content.maps.find((m) => m.id === place.mapId),
    place.location,
  );
  return !!p && !!l && p.mapId === place.mapId && inRect(l, p.x, p.y, GATE_MARGIN);
}
