// Marks (combat_and_classes.md 10.5): when a boss uses an ability its data names in `marks`,
// it marks `count` of its foes instead of striking at once: each mark is a circle warning
// that follows its carrier for `delay` seconds (times the difficulty's lead) and then lands
// the ability's effects round the carrier. A spread mark strikes everyone in the radius in
// full (so scatter); a stack mark shares the hit among everyone in the radius (so gather);
// a chase mark also turns the boss on its carrier for the delay (lead it away). The marked
// are chosen without dice: the farthest foes first, then by id. `needsOrder` rides on the
// event for the companions' brains (PK-M1-15), which act on it only when the player orders.

import type { SystemContext } from '../../../core/system';
import { entitiesOnMap, getEntity } from '../../world';
import { secs } from '../defs';
import { combatMod } from '../difficulty';
import type { MarkDef } from '../mech_types';
import { warn } from '../telegraph';
import type { AbilityDef, Unit } from '../types';
import { isHostilePair, liveUnit, unitOf } from '../units';
import { mechOf } from './fight';

/** Marks only reach foes this close (tiles). */
const MARK_REACH = 30;

/** The mark a boss lays with this ability, if its data names one. */
export function markOf(ctx: SystemContext, u: Unit, abilityId: string): MarkDef | undefined {
  return mechOf(ctx, u)?.m.marks?.find((k) => k.ability === abilityId);
}

/** The foes to mark: the farthest first, then by id (no dice). */
function marked(ctx: SystemContext, u: Unit, count: number): Unit[] {
  const ue = getEntity(ctx.world, u.id);
  if (!ue) return [];
  const out: { u: Unit; d: number }[] = [];
  for (const e of entitiesOnMap(ctx.world, ue.mapId)) {
    const o = unitOf(ctx.world, e.id);
    if (!o || o.terrain || !o.attackable || !liveUnit(ctx.world, o.id) || !isHostilePair(u, o))
      continue;
    const d = Math.hypot(e.x - ue.x, e.y - ue.y);
    if (d <= MARK_REACH) out.push({ u: o, d });
  }
  out.sort((a, b) => b.d - a.d || (a.u.id < b.u.id ? -1 : a.u.id > b.u.id ? 1 : 0));
  return out.slice(0, Math.max(1, count)).map((x) => x.u);
}

/** Lay the marks of a mark ability; returns how many were laid. */
export function startMarks(ctx: SystemContext, u: Unit, def: AbilityDef, mark: MarkDef): number {
  const lead = Math.max(1, secs(mark.delay * combatMod(ctx.world, 'telegraph_lead')));
  let n = 0;
  for (const t of marked(ctx, u, mark.count)) {
    const ids = warn(ctx, u, t, {
      ability: def,
      shape: { kind: 'circle', radius: mark.radius, at: 'target' },
      tier: def.telegraph?.tier ?? 'heavy',
      leadTicks: lead,
      follow: t.id,
      mark: { kind: mark.kind, targetId: t.id, radius: mark.radius },
      ...(mark.needsOrder ? { needsOrder: true } : {}),
    });
    if (!ids) break;
    n++;
    if (mark.kind === 'chase') u.forced = { id: t.id, until: ctx.tick + lead };
  }
  return n;
}
