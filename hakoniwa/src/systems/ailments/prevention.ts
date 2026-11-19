// Read active preventive aura data through combat's unit query. No content ids in rules.

import type { SystemContext } from '../../core/system';
import { unitOf } from '../combat';
import { auraDef } from '../combat/defs';
import { getEntity } from '../world';
import { gradeRate } from './formulas';

/** Positive exposure only; clean-place recovery and worn-pattern taint stay unchanged. */
export function exposureMultiplier(ctx: SystemContext, id: string, grade: number): number {
  const cfg = ctx.content.ailmentsConfig;
  if (!cfg || gradeRate(cfg, grade) <= 0) return 1;
  let result = 1;
  for (const a of unitOf(ctx.world, id)?.auras ?? []) {
    if (a.expires !== 0 && a.expires <= ctx.tick) continue;
    const p = auraDef(ctx.content, a.id)?.prevention?.exposure;
    if (p && (p.belowGrade === undefined || grade < p.belowGrade)) result *= p.multiplier;
  }
  return Math.max(0, Math.min(1, result));
}

/** Only spot onset is reduced. The existing child tag distinguishes the two age factors. */
export function spotRiskMultiplier(ctx: SystemContext, id: string): number {
  const child = getEntity(ctx.world, id)?.tags.includes('child') ?? false;
  let result = 1;
  for (const a of unitOf(ctx.world, id)?.auras ?? []) {
    if (a.expires !== 0 && a.expires <= ctx.tick) continue;
    const p = auraDef(ctx.content, a.id)?.prevention?.spot;
    if (p) result *= child ? p.child : p.adult;
  }
  return Math.max(0, Math.min(1, result));
}
