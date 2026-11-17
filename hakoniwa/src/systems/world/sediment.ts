// Sediment levels of maps and places (map_briefs.md 1.2, D-039): maps and locations store
// the canon level (0 clear to 5 abyssal, 6 critical), which logic, the settlement and the
// bestiary read as is; the renderer converts it to its 0 to 7 haze scale here, so one
// formula serves both renderers. A location may carry a local hot spot that overrides the
// map's level inside its rectangle. Pure; no world state.

import type { LocationDef } from './types';

/** Highest canon grade (abyssal); the atlas holds maps to 0..5. */
export const SEDIMENT_MAX_GRADE = 5;
/** The critical level, stored as 6 (a local hot spot such as the ancient sediment lake). */
export const SEDIMENT_CRITICAL = 6;
/** Top of the render scale the haze and vignette are drawn on. */
export const SEDIMENT_RENDER_MAX = 7;

/** Whether a stored level is a whole number in 0..6. */
export function isSedimentLevel(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 0 && (n as number) <= SEDIMENT_CRITICAL;
}

/**
 * The render level of a canon level: round(level x 7 / 6), halves up (0, 1, 2, 4, 5, 6, 7
 * for 0 to 6). Three and above jump a step so a player sees at once that the place is
 * dense. Out-of-range input is clamped to 0..6 first.
 */
export function renderSedimentLevel(canon: number): number {
  const c = Math.max(0, Math.min(SEDIMENT_CRITICAL, Number.isFinite(canon) ? canon : 0));
  return Math.floor((c * SEDIMENT_RENDER_MAX) / SEDIMENT_CRITICAL + 0.5);
}

/** Whether the point lies in the location's rectangle (tile units, right and bottom open). */
function inRect(l: LocationDef, x: number, y: number): boolean {
  return x >= l.x && x < l.x + l.w && y >= l.y && y < l.y + l.h;
}

/**
 * The canon sediment level at a point: the smallest location holding the point that
 * declares its own `sediment`, else the map's level (0 when the map declares none).
 * Ties keep the earlier location, so content order decides.
 */
export function sedimentAt(
  map: { sediment?: number; locations: readonly LocationDef[] },
  x: number,
  y: number,
): number {
  let best: LocationDef | null = null;
  for (const l of map.locations) {
    if (l.sediment === undefined || !inRect(l, x, y)) continue;
    if (!best || l.w * l.h < best.w * best.h) best = l;
  }
  return best ? (best.sediment as number) : (map.sediment ?? 0);
}

/** Problems with a map's sediment fields (content validation). Pure. */
export function sedimentProblems(map: {
  id: string;
  sediment?: number;
  locations: readonly LocationDef[];
}): string[] {
  const out: string[] = [];
  if (map.sediment !== undefined && !isSedimentLevel(map.sediment))
    out.push(
      `map ${map.id}: sediment ${map.sediment} is not a canon level 0..${SEDIMENT_CRITICAL}`,
    );
  for (const l of map.locations)
    if (l.sediment !== undefined && !isSedimentLevel(l.sediment))
      out.push(
        `map ${map.id}: location ${l.id} sediment ${l.sediment} is not a canon level 0..${SEDIMENT_CRITICAL}`,
      );
  return out;
}
