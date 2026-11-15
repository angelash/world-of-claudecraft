// Location helpers for schedules: resolve '@home', '@work' and '@<kind>' placeholders
// against the persona's map, pick a point inside a place, find the place under a point.

import type { ContentMap } from '../../core/contracts';
import type { Rng } from '../../core/rng';
import { mapById } from '../world';
import type { LocationDef } from '../world/types';
import type { CardView } from './personas';

export function locationById(
  content: Pick<ContentMap, 'maps'>,
  mapId: string,
  locId: string,
): LocationDef | undefined {
  return mapById(content, mapId)?.locations.find((l) => l.id === locId);
}

/** First location of a kind on a map (content order is stable). */
export function locationOfKind(
  content: Pick<ContentMap, 'maps'>,
  mapId: string,
  kind: string,
): LocationDef | undefined {
  return mapById(content, mapId)?.locations.find((l) => l.kind === kind);
}

/** When a map has no place of a kind, try these kinds in order (towns differ). */
const KIND_FALLBACK: Record<string, string[]> = {
  plaza: ['safe', 'market'],
  well: ['plaza', 'safe', 'market'],
  creek: ['well', 'plaza', 'safe', 'market'],
  den: ['tavern'],
  bakery: ['shop', 'market'],
  church: ['safe'],
  orphanage: ['church'],
};

/** Resolve a schedule place reference for a card. */
export function resolvePlace(
  content: Pick<ContentMap, 'maps'>,
  card: Pick<CardView, 'map' | 'home' | 'work'>,
  at: string,
): LocationDef | undefined {
  if (at === '@home') return locationById(content, card.map, card.home);
  if (at === '@work') return locationById(content, card.map, card.work);
  if (at.startsWith('@')) {
    const kind = at.slice(1);
    for (const k of [kind, ...(KIND_FALLBACK[kind] ?? [])]) {
      const loc = locationOfKind(content, card.map, k);
      if (loc) return loc;
    }
    return undefined;
  }
  return locationById(content, card.map, at);
}

/** A point inside a location (tile centres), deterministic for the given stream. */
export function pointIn(loc: LocationDef, rng: Rng): { x: number; y: number } {
  return {
    x: loc.x + rng.int(0, Math.max(0, loc.w - 1)) + 0.5,
    y: loc.y + rng.int(0, Math.max(0, loc.h - 1)) + 0.5,
  };
}

export function centerOf(loc: LocationDef): { x: number; y: number } {
  return { x: loc.x + loc.w / 2, y: loc.y + loc.h / 2 };
}

export function inside(loc: LocationDef, x: number, y: number, margin = 0): boolean {
  return (
    x >= loc.x - margin &&
    x <= loc.x + loc.w + margin &&
    y >= loc.y - margin &&
    y <= loc.y + loc.h + margin
  );
}

/** Smallest location containing the point (null outside every place). */
export function locationAt(
  content: Pick<ContentMap, 'maps'>,
  mapId: string,
  x: number,
  y: number,
): LocationDef | null {
  const map = mapById(content, mapId);
  if (!map) return null;
  let best: LocationDef | null = null;
  for (const l of map.locations) {
    if (!inside(l, x, y)) continue;
    if (!best || l.w * l.h < best.w * best.h) best = l;
  }
  return best;
}
