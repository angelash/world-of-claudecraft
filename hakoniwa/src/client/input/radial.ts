// Radial menus, `ui_hud_wheel` (ux_and_onboarding.md 16.5): up to 8 sectors a page (a ring
// with more puts "more" on the eighth sector and the rest on later pages), picked by pointing
// a stick or the mouse; releasing the opening button picks the highlighted sector, and a
// release with nothing highlighted (the stick back in the centre) cancels. With hold-to-
// toggle (18.5) the ring stays open after the release and A picks, B cancels. While a ring is
// open in a fight the world runs at 0.3x (16.5). Pure: sector contents come from the caller.

import type { RingId } from './pad_bindings';

export const RING_PAGE = 8;
/** World speed while a ring is open in personal combat (16.5). */
export const RING_TIME_SCALE = 0.3;
/** A stick past this (rescaled) points at a sector; under the low mark it points nowhere. */
export const RING_POINT_ON = 0.5;
export const RING_POINT_OFF = 0.25;
/** Mouse distance from the ring centre (CSS px) that points at a sector. */
export const RING_POINTER_PX = 40;

export interface RingSector {
  id: string;
  label: string;
  /** shown but not pickable (an empty consumable slot, a locked window) */
  disabled?: boolean;
}

/** The sector id that turns the page. */
export const MORE_SECTOR = '__more';

export interface RadialState {
  ring: RingId;
  /** every sector (all pages) */
  sectors: readonly RingSector[];
  page: number;
  /** index into the current page, or null */
  highlight: number | null;
  /** what opened it: released, it picks (unless sticky) */
  opener: string;
  sticky: boolean;
}

export function openRing(
  ring: RingId,
  sectors: readonly RingSector[],
  opener: string,
  sticky: boolean,
): RadialState {
  return { ring, sectors, page: 0, highlight: null, opener, sticky };
}

export function pageCount(sectors: readonly RingSector[]): number {
  return sectors.length <= RING_PAGE ? 1 : Math.ceil(sectors.length / (RING_PAGE - 1));
}

/** The sectors shown on `page`: 8 at most, the last one "more" while pages remain. */
export function pageSectors(
  sectors: readonly RingSector[],
  page: number,
  moreLabel: string,
): RingSector[] {
  if (sectors.length <= RING_PAGE) return [...sectors];
  const per = RING_PAGE - 1;
  const pages = pageCount(sectors);
  const p = ((page % pages) + pages) % pages;
  const slice = sectors.slice(p * per, p * per + per);
  return [...slice, { id: MORE_SECTOR, label: moreLabel }];
}

/**
 * The sector a direction points at: sector 0 is straight up, then clockwise. `x`, `y` are
 * screen axes (+y down). Null when the vector is too short.
 */
export function sectorAt(x: number, y: number, count: number, min: number): number | null {
  if (count <= 0 || Math.hypot(x, y) < min) return null;
  // clockwise angle from up, 0..2PI
  const a = (Math.atan2(x, -y) + 2 * Math.PI) % (2 * Math.PI);
  const width = (2 * Math.PI) / count;
  return Math.round(a / width) % count;
}

/** Point with a stick (rescaled vector): highlight follows it, the centre clears it. */
export function pointStick(s: RadialState, x: number, y: number, moreLabel: string): RadialState {
  const count = pageSectors(s.sectors, s.page, moreLabel).length;
  const m = Math.hypot(x, y);
  if (m < RING_POINT_OFF) return s.highlight === null ? s : { ...s, highlight: null };
  if (m < RING_POINT_ON) return s;
  const h = sectorAt(x, y, count, RING_POINT_ON);
  return h === s.highlight ? s : { ...s, highlight: h };
}

/** Point with the mouse, relative to the ring centre in CSS px. */
export function pointMouse(s: RadialState, dx: number, dy: number, moreLabel: string): RadialState {
  const count = pageSectors(s.sectors, s.page, moreLabel).length;
  const h = sectorAt(dx, dy, count, RING_POINTER_PX);
  return h === s.highlight ? s : { ...s, highlight: h };
}

export function turnPage(s: RadialState, delta: number): RadialState {
  const pages = pageCount(s.sectors);
  if (pages <= 1) return s;
  return { ...s, page: (((s.page + delta) % pages) + pages) % pages, highlight: null };
}

export type RingPick =
  | { type: 'pick'; id: string }
  | { type: 'page'; state: RadialState }
  | { type: 'cancel' }
  | { type: 'none' };

/** Pick the highlighted sector: an id, the next page, nothing (disabled), or cancel. */
export function pickRing(s: RadialState, moreLabel: string): RingPick {
  if (s.highlight === null) return { type: 'cancel' };
  const sector = pageSectors(s.sectors, s.page, moreLabel)[s.highlight];
  if (!sector) return { type: 'cancel' };
  if (sector.id === MORE_SECTOR) return { type: 'page', state: turnPage(s, 1) };
  if (sector.disabled) return { type: 'none' };
  return { type: 'pick', id: sector.id };
}
