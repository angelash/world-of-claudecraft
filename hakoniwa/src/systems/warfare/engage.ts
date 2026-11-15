// One kernel step of contact resolution (warfare_rts.md 2.2, 2.5): every regiment picks
// one target in melee contact or in range, expected damage is computed from the state
// at the start of the step, then applied all at once (order independent). Heroes strike
// adjacent regiments; at most 6 soldiers of a regiment can reach a hero.

import { Rng } from '../../core/rng';
import {
  aspectOf,
  engagedSlots,
  expectedDamage,
  fatigueDamageFactor,
  HERO_CONTACT_SLOTS,
  isRanged,
  moraleDamageFactor,
  regimentRadius,
} from './combat_math';
import { active, dist, type KernelData, onField, unitOf } from './data';
import { applyLosses, damageHero, heroArmor } from './heroes';
import { lineClear, TERRAIN, terrainAt } from './terrain';
import type { BattleState, HeroState, RegimentState, Team, UnitTypeDef } from './types';

export const HERO_RADIUS = 0.4;

export function contactRange(a: RegimentState, b: RegimentState): number {
  return regimentRadius(a.count) + regimentRadius(b.count) + 0.3;
}

/** Melee contact needs reach and no wall, water or building between the two. */
export function meleeContact(
  state: BattleState,
  a: { x: number; y: number },
  b: { x: number; y: number },
  reach: number,
): boolean {
  return dist(a, b) <= reach && lineClear(state, a, b);
}

export function shootRange(state: BattleState, u: UnitTypeDef, r: RegimentState): number {
  const high = TERRAIN[terrainAt(state, r.x, r.y)].high;
  return u.range * (high ? 1.2 : 1);
}

interface Hit {
  dmg: number;
  aspect: 'front' | 'flank' | 'rear';
}

function auraSums(
  state: BattleState,
  team: Team,
  x: number,
  y: number,
): { dmg: number; def: number } {
  let dmg = 0;
  let def = 0;
  for (const h of state.heroes) {
    if (h.down || h.team !== team) continue;
    if (Math.hypot(h.x - x, h.y - y) <= h.auraRadius) {
      dmg += h.aura.damage;
      def += h.aura.defense;
    }
  }
  return { dmg: Math.min(0.3, dmg), def: Math.min(0.3, def) };
}

const HERO_UNIT_BASE: Omit<UnitTypeDef, 'armor' | 'level'> = {
  id: 'hero',
  name: '英雄',
  race: 'human',
  role: 'shock',
  quality: 'elite',
  hp: 1000,
  armorType: 'medium',
  dmgMin: 1,
  dmgMax: 1,
  dmgType: 'slash',
  attackInterval: 1.5,
  range: 1,
  hitBase: 0.95,
  dodgeBase: 0.12,
  speed: 3,
  morale: 100,
  formations: ['line'],
  cost: 0,
  upkeep: 0,
  desc: '',
};

function heroAsUnit(h: HeroState): UnitTypeDef {
  return { ...HERO_UNIT_BASE, armor: heroArmor(h), level: 20 };
}

export function nearestEnemyRegiment(
  state: BattleState,
  from: { x: number; y: number },
  team: Team,
  filter?: (r: RegimentState) => boolean,
): RegimentState | undefined {
  let best: RegimentState | undefined;
  let bd = Number.POSITIVE_INFINITY;
  for (const r of state.regiments) {
    if (r.team === team || !onField(r)) continue;
    if (filter && !filter(r)) continue;
    const d = dist(r, from);
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return best;
}

/** Resolve one step of combat. `dt` is the kernel interval in battle seconds. */
export function resolveContacts(state: BattleState, data: KernelData, dt: number): void {
  const rng = new Rng(state.rng);
  const regHits = new Map<string, Hit[]>();
  const heroHits = new Map<string, number>();
  for (const r of state.regiments) r.busy = false;

  for (const a of state.regiments) {
    if (!active(a)) continue;
    const ua = unitOf(data, a.typeId);
    const ra = regimentRadius(a.count);
    // melee contacts first
    let target: RegimentState | undefined;
    let heroTarget: HeroState | undefined;
    let bestD = Number.POSITIVE_INFINITY;
    const orderedId = a.order?.kind === 'attack' ? a.order.targetId : undefined;
    for (const b of state.regiments) {
      if (b.team === a.team || !onField(b)) continue;
      const d = dist(a, b);
      if (!meleeContact(state, a, b, contactRange(a, b))) continue;
      const score = b.id === orderedId ? -1 : d;
      if (score < bestD) {
        bestD = score;
        target = b;
      }
    }
    for (const h of state.heroes) {
      if (h.team === a.team || h.down) continue;
      const d = dist(a, h);
      if (!meleeContact(state, a, h, ra + HERO_RADIUS + 0.3)) continue;
      const score = h.id === orderedId ? -1 : d;
      if (score < bestD) {
        bestD = score;
        heroTarget = h;
        target = undefined;
      }
    }
    let ranged = false;
    if (!target && !heroTarget && isRanged(ua) && a.state !== 'march') {
      const reach = shootRange(state, ua, a);
      bestD = Number.POSITIVE_INFINITY;
      for (const b of state.regiments) {
        if (b.team === a.team || !onField(b)) continue;
        const d = dist(a, b) - regimentRadius(b.count);
        if (d > reach) continue;
        const score = b.id === orderedId ? -1 : d;
        if (score < bestD) {
          bestD = score;
          target = b;
        }
      }
      if (!target) {
        for (const h of state.heroes) {
          if (h.team === a.team || h.down) continue;
          const d = dist(a, h);
          if (d > reach) continue;
          if (d < bestD) {
            bestD = d;
            heroTarget = h;
          }
        }
      }
      ranged = !!(target || heroTarget);
    }
    if (!target && !heroTarget) continue;

    const aura = auraSums(state, a.team, a.x, a.y);
    const self =
      moraleDamageFactor(a.morale) *
      fatigueDamageFactor(a.fatigue) *
      (1 + aura.dmg) *
      (ranged && TERRAIN[terrainAt(state, a.x, a.y)].high ? 1.1 : 1);
    const variance = rng.range(0.9, 1.1);
    a.busy = true;

    if (target) {
      const ub = unitOf(data, target.typeId);
      const aspect = aspectOf(target, a.x, a.y);
      const tInfo = TERRAIN[terrainAt(state, target.x, target.y)];
      const defAura = auraSums(state, target.team, target.x, target.y);
      const retreating =
        target.state === 'rout' || (target.order?.kind === 'retreat' && target.state === 'march');
      const situational =
        self *
        (ranged ? tInfo.rangedTaken : tInfo.meleeTaken) *
        (1 - defAura.def) *
        (retreating ? 1.3 : 1) *
        variance;
      const engaged = ranged
        ? Math.max(1, Math.ceil(a.count * 0.8))
        : Math.min(
            engagedSlots(a.count, a.formation, a.brokenUntil > state.time),
            Math.max(2, Math.ceil(target.count * 0.8)),
          );
      const dmg = expectedDamage({
        attacker: ua,
        defender: ub,
        engaged,
        interval: dt,
        attackerFormation: a.formation,
        defenderFormation: target.formation,
        aspect,
        ranged,
        situational,
      });
      const list = regHits.get(target.id) ?? [];
      list.push({ dmg, aspect });
      regHits.set(target.id, list);
      a.targetId = target.id;
      a.facing = Math.atan2(target.y - a.y, target.x - a.x);
      if (!ranged) target.busy = true;
    } else if (heroTarget) {
      const hu = heroAsUnit(heroTarget);
      const defAura = auraSums(state, heroTarget.team, heroTarget.x, heroTarget.y);
      const engaged = ranged
        ? Math.min(Math.ceil(a.count * 0.5), 10)
        : Math.min(a.count, HERO_CONTACT_SLOTS);
      const dmg = expectedDamage({
        attacker: ua,
        defender: hu,
        engaged,
        interval: dt,
        attackerFormation: a.formation,
        defenderFormation: 'line',
        aspect: 'front',
        ranged,
        situational: self * (1 - defAura.def) * variance,
      });
      heroHits.set(heroTarget.id, (heroHits.get(heroTarget.id) ?? 0) + dmg);
      a.targetId = heroTarget.id;
      a.facing = Math.atan2(heroTarget.y - a.y, heroTarget.x - a.x);
    }
  }

  // heroes strike the nearest adjacent enemy regiment
  for (const h of state.heroes) {
    if (h.down) continue;
    let best: RegimentState | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const r of state.regiments) {
      if (r.team === h.team || !onField(r)) continue;
      const d = dist(r, h);
      if (d < bd && meleeContact(state, r, h, regimentRadius(r.count) + HERO_RADIUS + 0.6)) {
        bd = d;
        best = r;
      }
    }
    if (!best) continue;
    const list = regHits.get(best.id) ?? [];
    list.push({ dmg: h.attack * dt, aspect: aspectOf(best, h.x, h.y) });
    regHits.set(best.id, list);
    best.busy = true;
  }

  // apply
  for (const r of state.regiments) {
    const hits = regHits.get(r.id);
    if (!hits || !onField(r)) continue;
    const u = unitOf(data, r.typeId);
    let total = 0;
    let flank = 0;
    let rear = 0;
    for (const h of hits) {
      total += h.dmg;
      if (h.aspect === 'flank') flank++;
      else if (h.aspect === 'rear') rear++;
    }
    r.busy = true;
    r.dmgAcc += total;
    const fallen = Math.min(r.count, Math.floor(r.dmgAcc / u.hp));
    r.dmgAcc -= fallen * u.hp;
    applyLosses(state, r, fallen);
    // flank -10, rear -20 spread over ten seconds of sustained pressure
    if (rear > 0) r.morale = Math.max(0, r.morale - 2 * dt);
    else if (flank > 0) r.morale = Math.max(0, r.morale - 1 * dt);
  }
  for (const h of state.heroes) {
    const dmg = heroHits.get(h.id);
    if (dmg) damageHero(state, h, dmg);
  }
}
