// Where the player stands, as the party's chatter and care read it (travel_and_exploration.md
// 7.1 to 7.3; companions_and_party.md 8.4, 11.3): a camp with its fire, a bed (an inn, a
// tagged bed, the home on a private map), a place a gravely hurt companion rests at (the
// private inner court, or a clinic), and night. The same location kinds and tags as the
// travel system's rest rules; read straight from the map data (no travel import). Pure.

import type { SystemContext } from '../../core/system';
import { calendarAt } from '../../core/time';
import { mapById, playerEntity } from '../world';
import type { LocationDef } from '../world/types';

/** Night hours (travel_and_exploration.md 7.1: sleep from 18:00 to 06:00). */
export const NIGHT_FROM_HOUR = 18;
export const NIGHT_TO_HOUR = 6;
/** Location kinds of a camp with its fire. */
const CAMP_KINDS: ReadonlySet<string> = new Set(['camp', 'safe']);
/** Location kinds with a bed anyone may take. */
const INN_KINDS: ReadonlySet<string> = new Set(['tavern']);
const BED_TAG = 'bed';
/** Location kinds where a gravely hurt companion rests when the court is not open (11.3). */
const CLINIC_KINDS: ReadonlySet<string> = new Set(['clinic']);

/** The atlas role of a map ('hub', 'field', 'dungeon', 'private', ...). */
export function roleOf(ctx: Pick<SystemContext, 'content'>, mapId: string): string | undefined {
  return ctx.content.atlas_maps?.find((m) => m.id === mapId)?.role;
}

/** The locations the player stands in, with the map's id and role. */
export function playerPlaces(
  ctx: Pick<SystemContext, 'world' | 'content'>,
): { mapId: string; role: string | undefined; here: LocationDef[] } | null {
  const p = playerEntity(ctx.world);
  const map = p ? mapById(ctx.content, p.mapId) : undefined;
  if (!p || !map) return null;
  const here = map.locations.filter(
    (l) => p.x >= l.x && p.x <= l.x + l.w && p.y >= l.y && p.y <= l.y + l.h,
  );
  return { mapId: p.mapId, role: roleOf(ctx, p.mapId), here };
}

/** The player stands at a camp with its fire. */
export function atCampFire(ctx: Pick<SystemContext, 'world' | 'content'>): boolean {
  return !!playerPlaces(ctx)?.here.some((l) => CAMP_KINDS.has(l.kind));
}

/** The player stands at a bed: an inn, a tagged bed, the home on a private map. */
export function atBed(ctx: Pick<SystemContext, 'world' | 'content'>): boolean {
  const at = playerPlaces(ctx);
  if (!at) return false;
  return at.here.some(
    (l) =>
      INN_KINDS.has(l.kind) ||
      (l.tags ?? []).includes(BED_TAG) ||
      (at.role === 'private' && l.kind === 'home'),
  );
}

/** The player stands where the gravely hurt rest: the private court, or a clinic (11.3). */
export function atRestPlace(ctx: Pick<SystemContext, 'world' | 'content'>): boolean {
  const at = playerPlaces(ctx);
  if (!at) return false;
  return at.role === 'private' || at.here.some((l) => CLINIC_KINDS.has(l.kind));
}

export function isNight(tick: number): boolean {
  const h = calendarAt(tick).hour;
  return h >= NIGHT_FROM_HOUR || h < NIGHT_TO_HOUR;
}

/** The game day a night belongs to (a night past midnight belongs to the day it began). */
export function nightOf(tick: number): number {
  const cal = calendarAt(tick);
  return cal.hour < NIGHT_TO_HOUR ? cal.dayIndex - 1 : cal.dayIndex;
}
