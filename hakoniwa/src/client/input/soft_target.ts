// Soft targeting (ux_and_onboarding.md 16.4; combat_and_classes.md 2.3, D-072): with no hard
// target, the nearest attackable enemy inside a cone in front of the player (60 degrees by
// default, 40 or 90 in the settings) and within 25 m is the soft target; an enemy attacking
// the player wins over a nearer one. A hard target is dropped past 40 m or when it dies.
// Gameplay neutral: the candidates pass the same filter as the enemies Tab cycles through
// (the combat system's enemiesNear: alive, attackable, hostile, on the map), out to 25 m, so
// the aid only picks what the player could click by hand. Pure.

/** Cone widths the settings offer (degrees, the whole cone). */
export const SOFT_CONES = [40, 60, 90] as const;
export type SoftCone = (typeof SOFT_CONES)[number];

/** Candidate range and the hard-target leash (metres = tiles, combat_and_classes.md 1). */
export const SOFT_RANGE = 25;
export const HARD_LEASH = 40;

export interface SoftCandidate {
  id: string;
  x: number;
  y: number;
  /** the enemy is attacking the player (it wins the cone over nearer ones) */
  attacking: boolean;
}

export interface SoftOrigin {
  x: number;
  y: number;
  /** facing in radians, map axes (atan2 of the last movement, world/types.ts Entity.facing) */
  facing: number;
}

/** Angle between two headings, 0..PI. */
export function angleGap(a: number, b: number): number {
  const d = Math.abs(((a - b) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

/**
 * The soft target: the candidates inside the cone and range, attackers of the player first,
 * then the nearest, then the smaller id (a stable order). Null when none qualifies.
 */
export function pickSoftTarget(
  from: SoftOrigin,
  candidates: readonly SoftCandidate[],
  cone: number = 60,
  range: number = SOFT_RANGE,
): string | null {
  const half = ((cone / 2) * Math.PI) / 180;
  let best: { id: string; d: number; attacking: boolean } | null = null;
  for (const c of candidates) {
    const dx = c.x - from.x;
    const dy = c.y - from.y;
    const d = Math.hypot(dx, dy);
    if (d > range) continue;
    // standing on top of it counts as in front
    if (d > 0.5 && angleGap(Math.atan2(dy, dx), from.facing) > half) continue;
    if (
      !best ||
      (c.attacking && !best.attacking) ||
      (c.attacking === best.attacking && (d < best.d || (d === best.d && c.id < best.id)))
    ) {
      best = { id: c.id, d, attacking: c.attacking };
    }
  }
  return best?.id ?? null;
}

/** True when a hard target must be dropped (16.4: past the leash, gone, or dead). */
export function hardTargetLost(
  from: { x: number; y: number; mapId: string },
  target: { x: number; y: number; mapId: string; alive: boolean } | undefined,
  leash: number = HARD_LEASH,
): boolean {
  if (!target?.alive || target.mapId !== from.mapId) return true;
  return Math.hypot(target.x - from.x, target.y - from.y) > leash;
}

/**
 * Cycle through candidates (RB next, LB previous; 16.4): ordered by distance (the camera
 * follows the player, so the one nearest the screen centre comes first), then id; wraps.
 */
export function cycleTarget(
  from: { x: number; y: number },
  candidates: readonly SoftCandidate[],
  current: string | null,
  dir: 1 | -1,
): string | null {
  const list = candidates
    .map((c) => ({ id: c.id, d: Math.hypot(c.x - from.x, c.y - from.y) }))
    .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
  if (list.length === 0) return null;
  const i = current ? list.findIndex((c) => c.id === current) : -1;
  const next = i < 0 ? (dir === 1 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
  return (list[next] as { id: string }).id;
}
