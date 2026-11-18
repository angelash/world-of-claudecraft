// Purification in combat (combat_and_classes.md 10.7 `purify`, 11 `purifyTo`): the purify
// effect of an ability (the borrowed-form door's cleansing and the like) on a monster:
// - a boss whose data resolves by `purify` is settled that way (when its `when` holds);
// - a beast whose data names `purifyTo` is turned back into that kind through the world's
//   ports: the old body leaves, the kind it came from stands where it stood, neutral; no
//   kill experience (it is a resolution, not a kill), and `combat.purified` reports it.

import type { SystemContext } from '../../../core/system';
import { getEntity } from '../../world';
import { resolutionHolds, resolveBoss } from '../boss/resolve';
import { monsterDef } from '../defs';
import { despawn, spawnMonster } from '../spawning';
import { deriveStats } from '../stats';
import type { Unit } from '../types';

export function purifyHit(ctx: SystemContext, caster: Unit, t: Unit): boolean {
  const def = monsterDef(ctx.content, t.monsterId);
  const e = getEntity(ctx.world, t.id);
  if (!def || !e) return false;
  const way = def.mechanics?.resolve?.find((r) => r.way === 'purify');
  if (way) {
    const max = deriveStats(ctx.world, ctx.content, t).maxHp;
    if (typeof way.when === 'string' || 'belowPct' in way.when || 'atSec' in way.when)
      if (!resolutionHolds(ctx, t, way, max)) return false;
    resolveBoss(ctx, t, way, caster);
    return true;
  }
  const to = def.mechanics?.purifyTo;
  if (!to || !monsterDef(ctx.content, to)) return false;
  const at = { mapId: e.mapId, x: e.x, y: e.y };
  despawn(ctx, t.id);
  const back = spawnMonster(ctx, to, at.mapId, at.x, at.y, { side: 'neutral', level: t.level });
  ctx.emit('combat.purified', {
    entityId: t.id,
    from: def.id,
    to,
    newId: back?.id ?? '',
  });
  return true;
}
