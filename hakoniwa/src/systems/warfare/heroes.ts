// Heroes as multipliers (D-012, warfare_rts.md 2.5 and 4): stat scaling, ability casts
// with the hard single-cast cap (a cast fells at most 20 percent of the target
// regiment's current count, overflow never carries), and morale pressure.

import { FORMATIONS, regimentRadius } from './combat_math';
import {
  active,
  dist,
  flash,
  heroById,
  type KernelData,
  onField,
  other,
  pushLog,
  regimentById,
  unitOf,
} from './data';
import type { BattleState, HeroSpec, HeroState, RegimentState, Team } from './types';

/** Morale lost per share of the regiment fallen (10 percent fallen = -3.5). */
export const MORALE_PER_LOSS_SHARE = 35;

/** One cast fells at most this share of a regiment's current count (D-012). */
export const CAST_KILL_CAP = 0.2;

export function heroFromSpec(spec: HeroSpec, team: Team, playerLevel: number): HeroState {
  const level =
    spec.level ?? (spec.ref === 'player' ? Math.max(playerLevel, spec.minLevel ?? 0) : 20);
  const maxHp = spec.hp ?? 200 + 60 * level;
  return {
    id: spec.id,
    name: spec.name,
    team,
    controller: spec.controller ?? (team === 'player' && spec.ref === 'player' ? 'player' : 'ai'),
    ref: spec.ref,
    x: spec.x,
    y: spec.y,
    hp: maxHp,
    maxHp,
    attack: spec.attack ?? 8 + 2.5 * level,
    auraRadius: spec.auraRadius ?? 5,
    aura: {
      damage: spec.aura?.damage ?? 0.1,
      defense: spec.aura?.defense ?? 0.05,
      morale: spec.aura?.morale ?? 5,
    },
    abilities: spec.abilities.map((id) => ({ id, readyAt: 0 })),
    down: false,
    order: null,
  };
}

/** Hero armor used when regiments strike a hero (level based). */
export function heroArmor(h: HeroState): number {
  return Math.round(h.maxHp / 2);
}

export function applyLosses(state: BattleState, r: RegimentState, fallen: number): void {
  if (fallen <= 0) return;
  const n = Math.min(r.count, fallen);
  r.count -= n;
  r.losses.push({ t: state.time, n });
  r.morale = Math.max(0, r.morale - (n / Math.max(1, r.maxCount)) * MORALE_PER_LOSS_SHARE);
  if (r.count <= 0) {
    r.count = 0;
    r.state = 'gone';
    r.order = null;
    r.path = [];
    pushLog(state, `${r.name}全军覆没`);
  }
}

/** Fell soldiers from a cast: perMan damage on `hits` soldiers, capped at 20 percent. */
export function castFell(
  state: BattleState,
  data: KernelData,
  r: RegimentState,
  perMan: number,
  hits: number,
): number {
  const u = unitOf(data, r.typeId);
  const cap = Math.floor(r.count * CAST_KILL_CAP);
  let fallen: number;
  if (perMan >= u.hp) {
    fallen = hits;
  } else {
    const acc = r.dmgAcc + perMan * hits;
    fallen = Math.floor(acc / u.hp);
    r.dmgAcc = acc - fallen * u.hp;
  }
  fallen = Math.max(0, Math.min(fallen, cap, r.count));
  // overflow never carries to the next soldier (sledgehammer on ants)
  if (r.dmgAcc >= u.hp) r.dmgAcc = u.hp * 0.99;
  applyLosses(state, r, fallen);
  return fallen;
}

function pressure(state: BattleState, team: Team, x: number, y: number): void {
  for (const r of state.regiments) {
    if (r.team === team && active(r) && Math.hypot(r.x - x, r.y - y) <= 4) {
      r.morale = Math.max(0, r.morale - 2);
    }
  }
}

export interface CastTarget {
  targetId?: string;
  x?: number;
  y?: number;
}

export interface CastResult {
  ok: boolean;
  reason?: string;
  felled: number;
}

export function castAbility(
  state: BattleState,
  data: KernelData,
  hero: HeroState,
  abilityId: string,
  target: CastTarget,
): CastResult {
  if (hero.down) return { ok: false, reason: '英雄已倒下', felled: 0 };
  const slot = hero.abilities.find((a) => a.id === abilityId);
  const def = data.abilities.get(abilityId);
  if (!slot || !def) return { ok: false, reason: '没有这个技能', felled: 0 };
  if (slot.readyAt > state.time) return { ok: false, reason: '技能还在冷却', felled: 0 };
  const foe = other(hero.team);
  let felled = 0;
  switch (def.kind) {
    case 'inspire': {
      const radius = def.radius ?? 6;
      for (const r of state.regiments) {
        if (r.team === hero.team && active(r) && dist(r, hero) <= radius) {
          r.morale = Math.min(100, r.morale + def.power);
        }
      }
      pushLog(state, `${hero.name}施放${def.name}，周围兵团士气大振`);
      break;
    }
    case 'rally': {
      const radius = def.radius ?? 6;
      let n = 0;
      for (const r of state.regiments) {
        if (r.team === hero.team && r.state === 'rout' && r.count > 0 && dist(r, hero) <= radius) {
          r.state = 'idle';
          r.morale = Math.max(r.morale, 30);
          r.order = null;
          r.path = [];
          n++;
        }
      }
      if (n === 0) return { ok: false, reason: '附近没有溃退的兵团', felled: 0 };
      pushLog(state, `${hero.name}重整了 ${n} 个溃退的兵团`);
      break;
    }
    case 'charge': {
      const r = target.targetId ? regimentById(state, target.targetId) : undefined;
      if (!r || r.team !== foe || !onField(r))
        return { ok: false, reason: '没有可冲锋的目标', felled: 0 };
      if (dist(r, hero) > def.range + regimentRadius(r.count)) {
        return { ok: false, reason: '目标太远', felled: 0 };
      }
      const ang = Math.atan2(hero.y - r.y, hero.x - r.x);
      const rr = regimentRadius(r.count) + 0.6;
      hero.x = r.x + Math.cos(ang) * rr;
      hero.y = r.y + Math.sin(ang) * rr;
      hero.path = [];
      felled = castFell(state, data, r, def.power + hero.attack, Math.min(r.count, 12));
      r.brokenUntil = state.time + 10;
      r.morale = Math.max(0, r.morale - 15 * FORMATIONS[r.formation].chargeShock);
      pressure(state, foe, r.x, r.y);
      pushLog(state, `${hero.name}冲锋，${r.name}阵型被冲散，倒下 ${felled} 人`);
      break;
    }
    case 'aoe': {
      const anchor = target.targetId ? regimentById(state, target.targetId) : undefined;
      const px = anchor ? anchor.x : target.x;
      const py = anchor ? anchor.y : target.y;
      if (px === undefined || py === undefined) return { ok: false, reason: '没有目标', felled: 0 };
      if (
        Math.hypot(px - hero.x, py - hero.y) >
        def.range + (anchor ? regimentRadius(anchor.count) : 0)
      ) {
        return { ok: false, reason: '目标太远', felled: 0 };
      }
      const radius = def.radius ?? 2;
      for (const r of state.regiments) {
        if (r.team !== foe || !onField(r)) continue;
        const rr = regimentRadius(r.count);
        const d = Math.hypot(r.x - px, r.y - py);
        if (d > radius + rr) continue;
        // soldiers inside the blast: density x covered area (circle overlap, approximated)
        const covered = Math.min(1, (radius * radius) / (rr * rr));
        const overlap = Math.max(0, Math.min(1, (radius + rr - d) / (2 * Math.min(radius, rr))));
        const hits = Math.min(
          r.count,
          Math.max(1, Math.round(r.count * covered * overlap * FORMATIONS[r.formation].aoeTaken)),
        );
        felled += castFell(state, data, r, def.power, hits);
        if (r === anchor) r.morale = Math.max(0, r.morale - 5);
      }
      pressure(state, foe, px, py);
      pushLog(state, `${hero.name}施放${def.name}，倒下 ${felled} 人`);
      break;
    }
    case 'strike': {
      const id = target.targetId ?? '';
      const h = heroById(state, id);
      if (h && h.team === foe && !h.down) {
        if (dist(h, hero) > def.range + 0.8) return { ok: false, reason: '目标太远', felled: 0 };
        damageHero(state, h, def.power);
        pushLog(state, `${hero.name}斩向${h.name}`);
        break;
      }
      const r = regimentById(state, id);
      if (!r || r.team !== foe || !onField(r))
        return { ok: false, reason: '没有可斩的目标', felled: 0 };
      if (dist(r, hero) > def.range + regimentRadius(r.count))
        return { ok: false, reason: '目标太远', felled: 0 };
      // single target: hits one soldier, overflow does not carry
      felled = castFell(state, data, r, def.power, 1);
      break;
    }
  }
  slot.readyAt = state.time + def.cooldown;
  flash(state, 'ability', hero.id, hero.team, { abilityId, targetId: target.targetId, felled });
  return { ok: true, felled };
}

export function damageHero(state: BattleState, h: HeroState, amount: number): void {
  if (h.down || amount <= 0) return;
  h.hp -= amount;
  if (h.hp > 0) return;
  h.hp = 0;
  h.down = true;
  h.order = null;
  h.path = [];
  pushLog(state, `${h.name}倒下了`);
  flash(state, 'hero_down', h.id, h.team);
  for (const r of state.regiments) {
    if (r.team !== h.team || !onField(r)) continue;
    if (h.ref === 'player') r.morale = Math.max(0, r.morale - 20);
    if (r.general === h.id && !r.leaderLost) {
      r.leaderLost = true;
      r.morale = Math.max(0, r.morale - 30);
    }
  }
}
