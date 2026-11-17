// Summons and pets (combat_and_classes.md 12.3; catalog_abilities_talents.md 4.5): a
// summon effect calls monsters at the caster's level on its side. An ally summoner keeps
// one live pet of a kind, and one of a pet group (a warlock keeps one fiend: calling another
// sends the first back into its pact). A pet whose data names an `ownerAura` puts it on its
// summoner while it is out (the blood pact of the colossus remnant: maximum health -15%);
// `sweepOwnerAuras` takes it off once the pet is gone, however it went.

import type { SystemContext } from '../../core/system';
import { getEntity } from '../world';
import { applyAura, removeAurasWhere } from './auras';
import { monsterDef } from './defs';
import { despawn, spawnMonster } from './spawning';
import { addThreat, engage } from './threat';
import type { Unit } from './types';
import { canAttack, liveUnit, unitOf } from './units';

/** Origin of an aura a pet puts on its summoner. */
const PET_ORIGIN = 'pet:';

/** Live pets of a summoner, sorted by id. */
export function petsOf(ctx: SystemContext, summonerId: string): Unit[] {
  const out: Unit[] = [];
  for (const id of Object.keys(ctx.world.slices.combat.units).sort()) {
    const u = ctx.world.slices.combat.units[id];
    if (u?.summonerId === summonerId && liveUnit(ctx.world, id)) out.push(u);
  }
  return out;
}

export function summonFor(
  ctx: SystemContext,
  caster: Unit,
  monsterId: string,
  count: number,
): void {
  const e = getEntity(ctx.world, caster.id);
  if (!e) return;
  const def = monsterDef(ctx.content, monsterId);
  if (caster.side === 'ally') {
    const pets = petsOf(ctx, caster.id);
    if (pets.some((p) => p.monsterId === monsterId)) return;
    const group = def?.mechanics?.petGroup;
    if (group) {
      for (const p of pets) {
        if (monsterDef(ctx.content, p.monsterId)?.mechanics?.petGroup === group) despawn(ctx, p.id);
      }
    }
  }
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(1, count)) * Math.PI * 2;
    const pet = spawnMonster(
      ctx,
      monsterId,
      e.mapId,
      e.x + Math.cos(angle),
      e.y + Math.sin(angle),
      {
        level: caster.level,
        side: caster.side,
        summonerId: caster.id,
      },
    );
    if (!pet) continue;
    const ownerAura = def?.mechanics?.ownerAura;
    if (ownerAura)
      applyAura(ctx, caster, ownerAura, caster, {
        permanent: true,
        origin: `${PET_ORIGIN}${pet.id}`,
      });
    const foe = unitOf(ctx.world, caster.target);
    if (foe && canAttack(ctx.world, pet, foe)) {
      addThreat(ctx, pet, foe.id, 1);
      engage(ctx, pet, foe);
      pet.target = foe.id;
      pet.autoAttack = true;
    }
    for (const [id, v] of Object.entries(caster.threat)) {
      if (v > 0) {
        addThreat(ctx, pet, id, v);
        const foeUnit = unitOf(ctx.world, id);
        if (foeUnit) engage(ctx, pet, foeUnit);
      }
    }
  }
}

/** Take a pet's aura off its summoner once the pet is no longer out (once a second). */
export function sweepOwnerAuras(ctx: SystemContext): void {
  for (const id of Object.keys(ctx.world.slices.combat.units).sort()) {
    const u = ctx.world.slices.combat.units[id];
    if (!u?.auras.some((a) => a.origin?.startsWith(PET_ORIGIN))) continue;
    removeAurasWhere(ctx, u, (a) => {
      if (!a.origin?.startsWith(PET_ORIGIN)) return false;
      return !liveUnit(ctx.world, a.origin.slice(PET_ORIGIN.length));
    });
  }
}
