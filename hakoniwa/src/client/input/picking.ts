// Picking and proximity queries for input: which entity is under the pointer, which
// exit is in reach, and the next target for Tab cycling. Pure; Node-tested.

import type { Entity, ExitDef, MapDef } from '../../systems/world/types';
import type { HitBox } from '../render/renderer';

/** Front-most box containing the point (largest depth key wins). */
export function pickEntity(boxes: readonly HitBox[], sx: number, sy: number): string | null {
  let best: HitBox | null = null;
  for (const b of boxes) {
    if (sx < b.x || sx > b.x + b.w || sy < b.y || sy > b.y + b.h) continue;
    if (!best || b.sortY > best.sortY || (b.sortY === best.sortY && b.id > best.id)) best = b;
  }
  return best?.id ?? null;
}

/** Same reach the world system enforces for world.use_exit. */
export const EXIT_REACH = 1.8;

export function nearestExit(
  map: MapDef,
  pos: { x: number; y: number },
  reach = EXIT_REACH,
): ExitDef | null {
  let best: ExitDef | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const ex of map.exits) {
    const d = Math.hypot(ex.x + 0.5 - pos.x, ex.y + 0.5 - pos.y);
    if (d <= reach && d < bestD) {
      best = ex;
      bestD = d;
    }
  }
  return best;
}

/** Whether every flag an exit requires is set (mirrors the world system's check). */
export function exitOpen(ex: ExitDef, flagOn: (key: string) => boolean): boolean {
  return !ex.requiresFlags?.some((f) => !flagOn(f));
}

/**
 * Tab targeting: living, visible entities within range sorted by distance; returns the
 * one after `current` (wrapping), or the nearest when nothing is selected.
 */
export function nextTarget(
  candidates: readonly Pick<Entity, 'id' | 'x' | 'y' | 'alive' | 'hidden' | 'kind'>[],
  from: { x: number; y: number },
  current: string | null,
  selfId: string,
  range = 12,
): string | null {
  const list = candidates
    .filter((e) => e.id !== selfId && e.alive && !e.hidden && e.kind !== 'object')
    .map((e) => ({ id: e.id, d: Math.hypot(e.x - from.x, e.y - from.y) }))
    .filter((e) => e.d <= range)
    .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
  if (list.length === 0) return null;
  const idx = current ? list.findIndex((e) => e.id === current) : -1;
  return (list[(idx + 1) % list.length] as { id: string }).id;
}
