// Presence fields (威压, power_system.md 3.5). Beings with a presence radius press on
// lower ranks of other sides nearby: two ranks below are slowed and shaken while they
// stay close; three or more ranks below are frozen for a moment, then the bearer lets
// them be for a while (the gatekeeper's single glance). Emits combat.presence_felt, a
// door key for the Tide-sight door (staying conscious under overwhelming pressure).

import type { SystemContext } from '../../core/system';
import { entitiesNear, getEntity, haltEntity } from '../world';
import { applyAura } from './auras';
import { secs } from './defs';
import { liveUnit, unitOf } from './units';

const REARM = secs(30);

export function tickPresence(ctx: SystemContext): void {
  const slice = ctx.world.slices.combat;
  for (const id of Object.keys(slice.units).sort()) {
    const bearer = slice.units[id];
    if (!bearer?.presence || !liveUnit(ctx.world, id)) continue;
    if (bearer.ai?.state === 'yielded' || bearer.ai?.state === 'evade') continue;
    const e = getEntity(ctx.world, id);
    if (!e) continue;
    for (const near of entitiesNear(ctx.world, e.mapId, e.x, e.y, bearer.presence)) {
      const u = unitOf(ctx.world, near.id);
      if (!u || u === bearer || u.side === bearer.side) continue;
      const gap = bearer.tier - u.tier;
      if (gap < 2) continue;
      const key = `${u.id}>${bearer.id}`;
      const last = slice.presence[key];
      const fresh = last === undefined || ctx.tick - last >= REARM;
      if (gap >= 3) {
        if (!fresh) continue;
        applyAura(ctx, u, 'aur_st_presence_paralysis', bearer, { durationTicks: secs(3) });
        haltEntity(ctx, near.id);
      } else {
        applyAura(ctx, u, 'aur_st_presence_pressure', bearer, { durationTicks: secs(2) });
        if (!fresh) continue;
      }
      slice.presence[key] = ctx.tick;
      ctx.emit('combat.presence_felt', { entityId: u.id, sourceId: bearer.id, gap });
    }
  }
}
