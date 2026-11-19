// Arena objects are visible combat targets. Break a nearby stagger object while its
// boss is in the effect radius, using the same attacks as the player hotbar.
import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { interruptibleNow } from '../../systems/combat/boss';
import { MELEE_RANGE } from '../../systems/combat/defs';
import { deriveStats } from '../../systems/combat/stats';
import { getEntity, playerEntity } from '../../systems/world';
import { gapBetween } from './fight';

export function helpfulBreakable(world: World, content: ContentMap, bossId: string): string | null {
  const boss = world.slices.combat.units[bossId];
  const body = getEntity(world, bossId),
    player = playerEntity(world);
  if (!boss || !body || !player || boss.auras.some((a) => a.id === 'aur_st_stagger')) return null;
  const self = world.slices.combat.units[player.id];
  if (!self) return null;
  const weapon = deriveStats(world, content, self).weapon;
  const reach = weapon.range > 0 ? weapon.range : MELEE_RANGE;
  const interrupt =
    !!boss.cast && boss.cast.end > world.meta.tick && interruptibleNow(world, content, boss);
  if (!interrupt && gapBetween(player, body) > reach) return null;
  const monster = content.monsters.find((m) => m.id === boss.monsterId);
  for (const rec of Object.values(world.slices.combat.terrain ?? {}).sort(
    (a, b) =>
      Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y),
  )) {
    if (rec.bossId !== bossId || rec.role !== 'breakable' || rec.state !== 'intact') continue;
    const use = monster?.mechanics?.terrain?.find((t) => t.object === rec.object);
    const object = getEntity(world, rec.id);
    if (
      !object?.alive ||
      object.mapId !== player.mapId ||
      !use?.effect ||
      Array.isArray(use.effect)
    )
      continue;
    if (Math.hypot(body.x - rec.x, body.y - rec.y) > (use.radius ?? 2.5)) continue;
    if ((use.effect.stagger ?? 0) > 0 && gapBetween(player, object) <= 2.5) return object.id;
  }
  return null;
}
