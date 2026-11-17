// Door rank (门阶, thousand_doors.md 4): rank = max(1, floor(2 * P^0.75)) where P is the sum
// of the rank values of the doors opened, capped at 99. The kernel never takes a float
// power at run time: it reads the thresholds of data/doors/rank_curve.json, which
// tools/doors/rank_curve.ts writes from the integer form of the formula below and the
// content validator compares entry by entry (21.6 rule 8). Only opening a door moves it.

import type { ContentMap } from '../../core/contracts';
import type { DoorDef } from './types';

export const MAX_RANK = 99;

/**
 * The rank-value sum that reaches rank r: the least integer P with 2 * P^0.75 >= r, that is
 * 16 * P^3 >= r^4 (exact in integers, no float power).
 */
export function rankThreshold(r: number): number {
  if (r <= 1) return 0;
  const target = r ** 4;
  let p = Math.max(0, Math.floor((r / 2) ** (4 / 3)) - 2);
  while (16 * p ** 3 < target) p++;
  return p;
}

/** Thresholds of ranks 1 to 99, the content of data/doors/rank_curve.json. */
export function rankCurve(): number[] {
  const out: number[] = [];
  for (let r = 1; r <= MAX_RANK; r++) out.push(rankThreshold(r));
  return out;
}

/** The rank for a rank-value sum, read from the curve (thresholds of ranks 1 to 99). */
export function rankFromPoints(curve: readonly number[], points: number): number {
  let rank = 1;
  for (let i = 1; i < curve.length && i < MAX_RANK; i++) {
    const need = curve[i];
    if (need === undefined || points < need) break;
    rank = i + 1;
  }
  return rank;
}

/** The curve the content ships, else the formula's own (tests with partial packs). */
export function contentCurve(content: ContentMap): readonly number[] {
  const c = content.door_rank_curve?.thresholds;
  return Array.isArray(c) && c.length > 0 ? c : DEFAULT_CURVE;
}

const DEFAULT_CURVE = rankCurve();

/** A door's rank value (4.2): written in the data, 0 to 2. */
export function rankValueOf(door: DoorDef): number {
  const v = door.rankValue;
  return typeof v === 'number' && v >= 0 ? Math.min(2, Math.floor(v)) : 1;
}
