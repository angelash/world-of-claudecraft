// On-hit affixes of the mechanic field registry (combat_and_classes.md 11): a monster's
// auto-attack that lands rolls each affix its data names, in registry order, on the
// `combat.proc` stream (13.3: the same resolver as gear procs). Each lays a template aura of
// the data with the affix's own duration, periodic damage or magnitude (a magnitude scales
// the template's modifiers), or pushes the struck back. The stun affixes climb the proc
// ladder (9.2 `stun_proc`). The thieves (`pilfer`, `crystalEat`) take from the player's side
// and carry it until they die (returned at the kill, death.ts).

import type { SystemContext } from '../../../core/system';
import { holdingOf, type Parcel, parcelCount, spendMoney, takeItems } from '../../inventory';
import { getEntity, orderMove } from '../../world';
import { applyAura } from '../auras';
import { auraDef, monsterDef, secs } from '../defs';
import type { HitAffix } from '../mech_types';
import type { AuraDef, DrCategory, MonsterMechanics, Unit } from '../types';
import { isPartySide, liveUnit } from '../units';
import { fleePoint } from './life';

/** The template aura of each on-hit affix (catalog_abilities_talents.md 3.2, 6.2). */
export const HIT_AFFIXES: readonly {
  field: keyof MonsterMechanics;
  aura?: string;
  dr?: DrCategory;
}[] = [
  { field: 'soulrot', aura: 'aur_mon_dianrot' },
  { field: 'smolder', aura: 'aur_mon_smolder' },
  { field: 'mortalStrike', aura: 'aur_mon_mortalwound' },
  { field: 'concuss', aura: 'aur_mon_dazed', dr: 'stun_proc' },
  { field: 'stunOnHit', aura: 'aur_mon_dazed', dr: 'stun_proc' },
  { field: 'ensnare', aura: 'aur_mon_webbed' },
  { field: 'corrode', aura: 'aur_mon_corrode' },
  { field: 'blind', aura: 'aur_mon_blinded' },
  { field: 'demoralize', aura: 'aur_mon_demoralized' },
  { field: 'knockback' },
];

/** The size of a template's first modifier or slow (what an affix's `amount` scales). */
function templateSize(def: AuraDef): number {
  if (def.slow) return def.slow;
  for (const v of Object.values(def.mods ?? {})) if (v) return Math.abs(v);
  return 0;
}

/** Push the struck away from the striker (a knockback stops before a wall, 9.1). */
function knock(ctx: SystemContext, from: Unit, who: Unit, distance: number): void {
  const a = getEntity(ctx.world, from.id);
  const b = getEntity(ctx.world, who.id);
  if (!a || !b) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  orderMove(ctx, who.id, b.x + (dx / len) * distance, b.y + (dy / len) * distance, 0.2);
  who.cast = null;
}

function layAffix(
  ctx: SystemContext,
  u: Unit,
  t: Unit,
  aura: string,
  a: HitAffix,
  dr?: DrCategory,
): void {
  const def = auraDef(ctx.content, aura);
  if (!def) return;
  const size = templateSize(def);
  applyAura(ctx, t, aura, u, {
    ...(a.duration !== undefined ? { durationTicks: secs(a.duration) } : {}),
    ...(a.damage !== undefined && def.periodic ? { power: a.damage } : {}),
    ...(a.amount !== undefined && size > 0 ? { scale: a.amount / size } : {}),
    ...(dr ? { abilityDr: dr } : {}),
  });
}

/** Steal from the struck (11 `pilfer`): coin, a consumable or any stackable piece. */
function pilfer(ctx: SystemContext, u: Unit, t: Unit, m: MonsterMechanics): boolean {
  const p = m.pilfer;
  if (!p || !isPartySide(ctx.world, t)) return false;
  const holding = holdingOf(ctx.world, t.id);
  const amount = Math.max(1, p.amount ?? 1);
  let took: { money: number; items: Parcel[] } | null = null;
  if (p.take === 'coin') {
    const n = Math.min(amount, holding.money);
    if (n > 0 && spendMoney(ctx, t.id, n, 'pilfer')) took = { money: n, items: [] };
  } else {
    for (const itemId of Object.keys(holding.items).sort()) {
      const def = ctx.content.items?.find((i) => i.id === itemId);
      if (!def || (p.take === 'consumable' && def.kind !== 'consumable')) continue;
      if ((def.stack ?? 99) <= 1) continue;
      const parcel = takeItems(
        ctx,
        t.id,
        itemId,
        Math.min(amount, holding.items[itemId] ?? 0),
        'pilfer',
      );
      if (parcel && parcelCount(parcel) > 0) {
        took = { money: 0, items: [parcel] };
        break;
      }
    }
  }
  if (!took) return false;
  stash(u, t.id, took);
  const ue = getEntity(ctx.world, u.id);
  const te = getEntity(ctx.world, t.id);
  if (p.flee && u.ai && !u.ai.fled && ue && te) {
    u.ai.state = 'flee';
    u.ai.fled = true;
    u.ai.fleeUntil = ctx.tick + secs(5);
    const to = fleePoint(ctx, u, ue, te);
    orderMove(ctx, u.id, to.x, to.y, 0.5);
  }
  return true;
}

/** Eat a crystal from the struck's pack (11 `crystalEat`). */
function crystalEat(ctx: SystemContext, u: Unit, t: Unit, m: MonsterMechanics): void {
  const c = m.crystalEat;
  if (!c || !isPartySide(ctx.world, t)) return;
  const holding = holdingOf(ctx.world, t.id);
  const wanted = c.items ?? [];
  for (const itemId of wanted) {
    if ((holding.items[itemId] ?? 0) <= 0) continue;
    const parcel = takeItems(ctx, t.id, itemId, 1, 'crystal_eat');
    if (parcel && parcelCount(parcel) > 0) {
      stash(u, t.id, { money: 0, items: [parcel] });
      return;
    }
  }
}

function stash(u: Unit, ownerId: string, took: { money: number; items: Parcel[] }): void {
  const s = u.stolen ?? { ownerId, money: 0, items: [] };
  s.money += took.money;
  s.items.push(...took.items);
  u.stolen = s;
}

/** Roll a monster's on-hit affixes after an auto-attack that dealt damage. */
export function onHitAffixes(ctx: SystemContext, u: Unit, t: Unit): void {
  const m = monsterDef(ctx.content, u.monsterId)?.mechanics;
  if (!m) return;
  const rng = ctx.rng('combat.proc');
  for (const h of HIT_AFFIXES) {
    const a = m[h.field] as HitAffix | undefined;
    if (!a || !liveUnit(ctx.world, t.id)) continue;
    if (a.chance < 1 && rng.next() >= a.chance) continue;
    if (h.field === 'knockback') knock(ctx, u, t, a.distance ?? 2);
    else if (h.aura) layAffix(ctx, u, t, h.aura, a, h.dr);
  }
  const roll = (chance: number | undefined) => (chance ?? 1) >= 1 || rng.next() < (chance ?? 1);
  if (m.pilfer && roll(m.pilfer.chance)) pilfer(ctx, u, t, m);
  if (m.crystalEat && roll(m.crystalEat.chance)) crystalEat(ctx, u, t, m);
}
