// What a fired item, enchant or set trigger does in combat (combat_and_classes.md 13.3): the
// inventory system decides that a trigger fires and resolves its amount (`item.proc`); combat
// applies it. `aura` puts the aura on the holder or the target (an aura key names the aura
// of that key with the aura prefix, catalog_abilities_talents.md 3.3); `dmg` strikes the
// target for a fixed amount (no power coefficient; physical rolls the melee table, the rest
// the spell table, each with
// its own crit); `chain` strikes the target and then jumps to the nearest enemies within 3
// tiles not struck yet; `cleanse` removes the holder's newest dispellable debuff. Damage
// from a trigger is marked `fromProc` and triggers nothing further (a kill still does).
// The set auras of worn sets stay on the holder as passives (`gearAuras`).

import type { EventMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { gearAuras, type ProcEffect } from '../inventory';
import { entitiesNear, getEntity } from '../world';
import { applyAura, dispel, removeAurasWhere } from './auras';
import { resolveHit } from './damage';
import { auraDef } from './defs';
import type { School, Unit } from './types';
import { canAttack, liveUnit, unitOf } from './units';

/** How far a chain jumps from the last target (13.3). */
export const CHAIN_RADIUS = 3;
/** Origin of the set auras a unit wears. */
const GEAR_ORIGIN = 'gear';

/** The aura of an aura key: `ember_door` is `aur_ember_door`. */
export function auraOfKey(key: string): string {
  return key.startsWith('aur_') ? key : `aur_${key}`;
}

function strike(
  ctx: SystemContext,
  owner: Unit,
  target: Unit,
  school: School,
  amount: number,
  sourceId: string,
): void {
  if (!canAttack(ctx.world, owner, target)) return;
  resolveHit(ctx, {
    source: owner,
    target,
    amount,
    school,
    kind: school === 'physical' ? 'melee' : 'spell',
    abilityId: sourceId,
    fromProc: true,
  });
}

/** The nearest enemies of `owner` around `from`, not in `done`, by distance then id. */
function nextHops(ctx: SystemContext, owner: Unit, from: Unit, done: Set<string>): Unit[] {
  const fe = getEntity(ctx.world, from.id);
  if (!fe) return [];
  return entitiesNear(ctx.world, fe.mapId, fe.x, fe.y, CHAIN_RADIUS)
    .map((e) => unitOf(ctx.world, e.id))
    .filter((u): u is Unit => !!u && !done.has(u.id) && canAttack(ctx.world, owner, u));
}

/** Apply a fired trigger (the inventory's `item.proc`). */
export function onItemProc(ctx: SystemContext, d: EventMap['item.proc']): void {
  const owner = liveUnit(ctx.world, d.ownerId)?.[0];
  if (!owner) return;
  const target = d.targetId ? liveUnit(ctx.world, d.targetId)?.[0] : undefined;
  const e: ProcEffect = d.effect;
  const sourceId = d.itemId ?? d.sourceId;
  switch (e.kind) {
    case 'aura': {
      const id = auraOfKey(e.aura);
      if (!auraDef(ctx.content, id)) return;
      if (e.at === 'self') applyAura(ctx, owner, id, owner);
      else if (target) applyAura(ctx, target, id, owner);
      return;
    }
    case 'dmg':
      if (target) strike(ctx, owner, target, e.school, e.amount, sourceId);
      return;
    case 'chain': {
      if (!target) return;
      const done = new Set<string>([target.id]);
      strike(ctx, owner, target, e.school, e.amount, sourceId);
      let from = target;
      for (let i = 0; i < e.jumps; i++) {
        const next = nextHops(ctx, owner, from, done)[0];
        if (!next) break;
        done.add(next.id);
        strike(ctx, owner, next, e.school, e.amount, sourceId);
        from = next;
      }
      return;
    }
    case 'cleanse':
      dispel(ctx, owner, 'debuff', 1);
      return;
    default:
      // slow, dot, hot and stack wait for their trigger auras; sed belongs to the sediment
      // system and morale to the battle layer (13.3)
      return;
  }
}

/** Keep the set auras of the worn sets on a unit, and only those (once a second, on equip). */
export function syncGearAuras(ctx: SystemContext, u: Unit): void {
  const want = new Set(
    gearAuras(ctx.world, ctx.content, u.id)
      .map(auraOfKey)
      .filter((id) => !!auraDef(ctx.content, id)),
  );
  const have = new Set(u.auras.filter((a) => a.origin === GEAR_ORIGIN).map((a) => a.id));
  if (have.size > 0 && [...have].some((id) => !want.has(id)))
    removeAurasWhere(ctx, u, (a) => a.origin === GEAR_ORIGIN && !want.has(a.id));
  for (const id of [...want].sort()) {
    if (!have.has(id)) applyAura(ctx, u, id, u, { permanent: true, origin: GEAR_ORIGIN });
  }
}
