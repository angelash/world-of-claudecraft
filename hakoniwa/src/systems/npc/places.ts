// Location helpers for schedules: resolve '@home', '@work' and '@<kind>' placeholders
// against the persona's map, `<map>:<place>` references to another map (cross-map
// schedules, map_briefs.md 1.10: hunters into the forest, miners to the shaft), pick a
// point inside a place, find the place under a point.

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

/** Separates the map from the place in a cross-map reference (`forest_edge:hunter_camp`). */
export const MAP_PLACE_SEPARATOR = ':';

/** A place reference split into its map (null for the persona's own map) and the place. */
export function splitPlaceRef(at: string): { mapId: string | null; place: string } {
  const i = at.indexOf(MAP_PLACE_SEPARATOR);
  if (i <= 0) return { mapId: null, place: at };
  return { mapId: at.slice(0, i), place: at.slice(i + 1) };
}

/** The reference of a place as seen from a home map: bare on it, `<map>:<id>` elsewhere. */
export function placeRef(homeMap: string, mapId: string, locId: string): string {
  return mapId === homeMap ? locId : `${mapId}${MAP_PLACE_SEPARATOR}${locId}`;
}

/** A resolved place: the map it is on and the location. */
export interface PlaceOnMap {
  mapId: string;
  loc: LocationDef;
}

/**
 * Resolve a schedule place reference for a card, with its map: '@home' and '@work' on the
 * card's map, '@<kind>' and a location id on the card's map or on the map a `<map>:`
 * prefix names ('@home' and '@work' take no prefix).
 */
export function resolvePlaceOn(
  content: Pick<ContentMap, 'maps'>,
  card: Pick<CardView, 'map' | 'home' | 'work'>,
  at: string,
): PlaceOnMap | undefined {
  const { mapId: other, place } = splitPlaceRef(at);
  const mapId = other ?? card.map;
  const on = (loc: LocationDef | undefined) => (loc ? { mapId, loc } : undefined);
  if (place === '@home' || place === '@work') {
    if (other !== null) return undefined;
    return on(locationById(content, mapId, place === '@home' ? card.home : card.work));
  }
  if (place.startsWith('@')) {
    const kind = place.slice(1);
    for (const k of [kind, ...(KIND_FALLBACK[kind] ?? [])]) {
      const loc = locationOfKind(content, mapId, k);
      if (loc) return { mapId, loc };
    }
    return undefined;
  }
  return on(locationById(content, mapId, place));
}

/** Resolve a schedule place reference for a card (the location only; see resolvePlaceOn). */
export function resolvePlace(
  content: Pick<ContentMap, 'maps'>,
  card: Pick<CardView, 'map' | 'home' | 'work'>,
  at: string,
): LocationDef | undefined {
  return resolvePlaceOn(content, card, at)?.loc;
}

/** The location a stored reference names, read from a home map (see placeRef). */
export function locationOfRef(
  content: Pick<ContentMap, 'maps'>,
  homeMap: string,
  ref: string,
): LocationDef | undefined {
  const { mapId, place } = splitPlaceRef(ref);
  return locationById(content, mapId ?? homeMap, place);
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
