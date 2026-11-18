// Spawning, dying and world rules of the mechanic field registry (combat_and_classes.md 11;
// catalog_bestiary.md 9): what a monster's data asks of the kernel when it spawns, when it
// dies, and of the world around it.
// - spawn: `nightOnly` (only at night, or a daylight aura), `weatherSpawn` (only in that
//   weather), `thorns` (a thorns aura), `rumorScale` (the named beasts grow with the rumour
//   level the cognition system registers as a monster modifier `rumor:<id>`: 6% a level up
//   to 30% by default for rares, as one static aura at spawn), `ambushEmerge` (it lies in
//   wait, untargetable, until a foe comes within its radius; the first blow after is
//   stronger);
// - death: what a thief carried goes back to its owner, `deathThroes` (a circle warning on
//   the corpse), `ashPuddle` (a slowing pulse zone on the corpse), `packFrenzy` (its kin
//   within 3 tiles take a stack), `corpseRise` (on ground of enough sediment the body may
//   rise as another monster when the corpse goes);
// - the world: `cropBlight` (a production modifier on its map while it lives, renewed every
//   game hour), `lureFlee` (it flees to the densest sediment near it), `caravanRaid` (pack
//   animals and carts, tagged `caravan`, first), and the movement traits the world reads.
// Rolls go on `combat.spawn` (the rise) and nowhere else.

import type { SystemContext } from '../../../core/system';
import { tr } from '../../../core/text';
import { calendarAt, isNight, TICKS_PER_GAME_HOUR } from '../../../core/time';
import { addMoney, putItems } from '../../inventory';
import { applyModifiers, registerModifier } from '../../modifiers';
import { currentWeather, entitiesNear, getEntity, mapById, setTag } from '../../world';
import { sedimentAt } from '../../world/sediment';
import type { Entity } from '../../world/types';
import { applyAura } from '../auras';
import { auraDef, monsterDef, scaled, secs } from '../defs';
import { combatMod } from '../difficulty';
import { MIN_FIRST_PULSE, MIN_LEAD, warn } from '../telegraph';
import type { MonsterDef, Unit } from '../types';
import { canAttack, liveUnit, unitOf } from '../units';
import { SLOW_AURA, templateSlow } from './timed';

/** The template auras of these rules (catalog_abilities_talents.md 3.2). */
export const THORNS_AURA = 'aur_mon_thorns';
export const RUMOR_AURA = 'aur_mon_rumor';
export const PACK_AURA = 'aur_mon_packfrenzy';
/** One rumour level's share of the rumour aura's template (6%). */
const RUMOR_STEP = 0.06;
/** Rares grow with rumour by default (11 `rumorScale`). */
const RARE_RUMOR = { perLevel: 0.06, max: 0.3 };
/** Kin within this many tiles take the pack frenzy (11). */
const PACK_RADIUS = 3;
/** The ground of a rising corpse is at least this sediment by default (积澱). */
const RISE_SEDIMENT = 2;
/** The tag of pack animals and carts (11 `caravanRaid`). */
export const CARAVAN_TAG = 'caravan';
/** The tag of an ambusher lying in wait (11 `ambushEmerge`). */
export const AMBUSH_TAG = 'ambush';

/** Whether a monster may spawn now (11 `nightOnly` spawn mode, `weatherSpawn`). */
export function spawnAllowed(ctx: SystemContext, def: MonsterDef): boolean {
  const m = def.mechanics;
  if (m?.nightOnly?.mode === 'spawn' && !isNight(calendarAt(ctx.tick))) return false;
  if (m?.weatherSpawn && currentWeather(ctx.world) !== m.weatherSpawn) return false;
  return true;
}

/** What a fresh monster carries from its data's registry fields. */
export function onSpawned(ctx: SystemContext, u: Unit, def: MonsterDef): void {
  const m = def.mechanics;
  if (m?.thorns) applyAura(ctx, u, THORNS_AURA, u, { permanent: true, thorns: m.thorns.amount });
  const rumor = m?.rumorScale ?? (def.rank === 'rare' ? RARE_RUMOR : undefined);
  if (rumor) {
    const level = applyModifiers(ctx.world, 'monster', `rumor:${def.id}`, 0);
    const bonus = Math.min(rumor.max, Math.max(0, level) * rumor.perLevel);
    if (bonus > 0) applyAura(ctx, u, RUMOR_AURA, u, { permanent: true, scale: bonus / RUMOR_STEP });
  }
  if (m?.nightOnly?.mode === 'weaken' && m.nightOnly.aura && !isNight(calendarAt(ctx.tick)))
    applyAura(ctx, u, m.nightOnly.aura, u, { permanent: true });
  if (m?.ambushEmerge) {
    u.ambush = m.ambushEmerge.firstHitMult;
    u.attackable = false;
    setTag(ctx, u.id, AMBUSH_TAG, true);
  }
}

/** An ambusher in wait springs once a foe comes within its radius. Returns the foe. */
export function ambushWatch(ctx: SystemContext, u: Unit, e: Entity): Unit | null {
  const a = monsterDef(ctx.content, u.monsterId)?.mechanics?.ambushEmerge;
  if (!a || u.attackable) return null;
  for (const near of entitiesNear(ctx.world, e.mapId, e.x, e.y, a.radius)) {
    const o = unitOf(ctx.world, near.id);
    if (!o || o.terrain || !canAttack(ctx.world, u, o)) continue;
    if (Math.hypot(near.x - e.x, near.y - e.y) > a.radius) continue;
    u.attackable = true;
    setTag(ctx, u.id, AMBUSH_TAG, false);
    return o;
  }
  return null;
}

/** The first blow of an ambusher that sprang: its multiplier, once. */
export function ambushMult(u: Unit): number {
  if (u.ambush === undefined || !u.attackable) return 1;
  const k = u.ambush;
  delete u.ambush;
  return k;
}

/** A monster died: give back what it stole, then its death rules. */
export function onDied(ctx: SystemContext, u: Unit, e: Entity): void {
  const def = monsterDef(ctx.content, u.monsterId);
  const m = def?.mechanics;
  if (u.stolen) {
    const s = u.stolen;
    delete u.stolen;
    for (const p of s.items) putItems(ctx, s.ownerId, p, 'pilfer_return');
    if (s.money > 0) addMoney(ctx, s.ownerId, s.money, 'pilfer_return');
  }
  if (!m) return;
  const lead = (sec: number) =>
    Math.max(1, secs(Math.max(MIN_LEAD.normal, sec) * combatMod(ctx.world, 'telegraph_lead')));
  if (m.deathThroes)
    warn(ctx, u, null, {
      source: 'affix:deathThroes',
      shape: { kind: 'circle', radius: m.deathThroes.radius, at: 'point' },
      tier: 'normal',
      leadTicks: lead(m.deathThroes.delay ?? 0),
      damage: scaled(m.deathThroes.damage, u.level, 0),
      school: 'fire',
      at: { x: e.x, y: e.y },
      mapId: e.mapId,
    });
  if (m.ashPuddle)
    warn(ctx, u, null, {
      source: 'affix:ashPuddle',
      shape: {
        kind: 'pulse',
        radius: m.ashPuddle.radius,
        every: 1,
        duration: m.ashPuddle.duration,
        firstDelay: MIN_FIRST_PULSE,
        at: 'point',
      },
      tier: 'normal',
      leadTicks: lead(MIN_FIRST_PULSE),
      aura: SLOW_AURA,
      auraSec: 2,
      auraScale: m.ashPuddle.slow / templateSlow(ctx),
      at: { x: e.x, y: e.y },
      mapId: e.mapId,
    });
  if (m.corpseRise && def) {
    const map = mapById(ctx.content, e.mapId);
    const ground = map ? sedimentAt(map, e.x, e.y) : 0;
    const chance = m.corpseRise.chance;
    if (
      ground >= (m.corpseRise.minSediment ?? RISE_SEDIMENT) &&
      chance > 0 &&
      (chance >= 1 || ctx.rng('combat.spawn').next() < chance)
    )
      u.rise = m.corpseRise.into;
  }
  // kin nearby take the loss as fury (11 `packFrenzy`)
  for (const near of entitiesNear(ctx.world, e.mapId, e.x, e.y, PACK_RADIUS)) {
    const o = unitOf(ctx.world, near.id);
    if (!o || o === u || o.monsterId !== u.monsterId || !liveUnit(ctx.world, o.id)) continue;
    const pf = monsterDef(ctx.content, o.monsterId)?.mechanics?.packFrenzy;
    if (!pf) continue;
    const held = o.auras.find((a) => a.id === PACK_AURA)?.stacks ?? 0;
    if ((held + 1) * pf.amount > pf.max + 1e-9) continue;
    const step = auraDef(ctx.content, PACK_AURA)?.mods?.damageDealt ?? 0.1;
    applyAura(ctx, o, PACK_AURA, o, { stacks: held + 1, scale: pf.amount / step });
  }
}

/** Where a fleeing monster runs: the densest sediment near it (`lureFlee`), else away. */
export function fleePoint(
  ctx: SystemContext,
  u: Unit,
  e: Entity,
  from: Entity,
): { x: number; y: number } {
  const dx = e.x - from.x;
  const dy = e.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const away = { x: e.x + (dx / len) * 6, y: e.y + (dy / len) * 6 };
  if (!monsterDef(ctx.content, u.monsterId)?.mechanics?.lureFlee) return away;
  const map = mapById(ctx.content, e.mapId);
  if (!map) return away;
  let best = { ...away, s: sedimentAt(map, away.x, away.y), d: 6 };
  for (const l of map.locations) {
    if (l.sediment === undefined) continue;
    const c = { x: l.x + l.w / 2, y: l.y + l.h / 2 };
    const d = Math.hypot(c.x - e.x, c.y - e.y);
    if (d > 12) continue;
    if (l.sediment > best.s || (l.sediment === best.s && d < best.d))
      best = { ...c, s: l.sediment, d };
  }
  return { x: best.x, y: best.y };
}

/** A caravan target within the radius, for raiders (11 `caravanRaid`). */
export function caravanTarget(ctx: SystemContext, u: Unit, e: Entity, radius: number): Unit | null {
  if (!monsterDef(ctx.content, u.monsterId)?.mechanics?.caravanRaid) return null;
  for (const near of entitiesNear(ctx.world, e.mapId, e.x, e.y, radius)) {
    if (!near.tags.includes(CARAVAN_TAG)) continue;
    const o = unitOf(ctx.world, near.id);
    if (o && canAttack(ctx.world, u, o)) return o;
  }
  return null;
}

/**
 * Once a game hour: every map with a living crop-blighter carries a production modifier
 * (D-013) of its strongest blight, renewed for the next hour (11 `cropBlight`).
 */
export function renewBlight(ctx: SystemContext): void {
  const worst = new Map<string, number>();
  for (const id of Object.keys(ctx.world.slices.combat.units).sort()) {
    const u = ctx.world.slices.combat.units[id];
    const rate = monsterDef(ctx.content, u?.monsterId ?? null)?.mechanics?.cropBlight?.rate;
    const e = u ? getEntity(ctx.world, u.id) : undefined;
    if (!u || !rate || !e?.alive) continue;
    worst.set(e.mapId, Math.max(worst.get(e.mapId) ?? 0, rate));
  }
  for (const [mapId, rate] of [...worst].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    registerModifier(ctx, {
      target: 'production',
      key: mapId,
      factor: Math.max(0, 1 - rate),
      untilTick: ctx.tick + TICKS_PER_GAME_HOUR + 1,
      source: 'combat',
      visibility: 'hidden',
      note: tr('sys.combat.modifier.crop_blight'),
      stackGroup: 'crop_blight',
    });
  }
}

/** The movement traits the world's pathing reads (11 `phasesThroughObstacles`, `canSwim`). */
export function movementTraits(
  content: SystemContext['content'],
  monsterId: string | null,
): { phases: boolean; swims: boolean } {
  const m = monsterDef(content, monsterId)?.mechanics;
  return { phases: !!m?.phasesThroughObstacles, swims: !!m?.canSwim };
}
