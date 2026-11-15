// Per-tick aura work: periodic damage and healing (dots and hots), pulses that hit
// enemies around the bearer (consecration), and expiry.

import type { SystemContext } from '../../core/system';
import { entitiesNear, getEntity } from '../world';
import { expireAuras } from './auras';
import { healUnit, resolveHit } from './damage';
import { auraDef, secs } from './defs';
import type { Unit } from './types';
import { canAttack, liveUnit, unitOf } from './units';

export function tickAuras(ctx: SystemContext, u: Unit): void {
  if (u.auras.length === 0) return;
  for (const a of [...u.auras]) {
    if (a.next === undefined || a.next > ctx.tick) continue;
    const def = auraDef(ctx.content, a.id);
    if (!def) continue;
    const every = def.periodic?.every ?? def.pulse?.every ?? 1;
    a.next = ctx.tick + Math.max(1, secs(every));
    if (!liveUnit(ctx.world, u.id)) return;
    const source = unitOf(ctx.world, a.sourceId) ?? u;
    const amount = (a.power ?? 0) * a.stacks;
    if (def.periodic?.damage) {
      resolveHit(ctx, {
        source,
        target: u,
        amount,
        school: def.periodic.school ?? 'physical',
        kind: 'periodic',
        abilityId: a.id,
      });
    } else if (def.periodic?.heal) {
      healUnit(ctx, source, u, amount, { abilityId: a.id, canCrit: false });
    } else if (def.pulse) {
      const e = getEntity(ctx.world, u.id);
      if (!e) continue;
      for (const near of entitiesNear(ctx.world, e.mapId, e.x, e.y, def.pulse.radius)) {
        const victim = unitOf(ctx.world, near.id);
        if (!victim || !canAttack(ctx.world, u, victim)) continue;
        resolveHit(ctx, {
          source: u,
          target: victim,
          amount: a.power ?? 0,
          school: def.pulse.school ?? 'physical',
          kind: 'spell',
          abilityId: a.id,
        });
      }
    }
  }
  expireAuras(ctx, u);
}
