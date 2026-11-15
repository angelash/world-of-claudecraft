// Rule-layer generals (warfare_rts.md 7): a utility plan per team (the fallback when no
// model answers), the plan's per-regiment orders every two battle seconds, and hero
// skill use. Same rules as the player: no hidden numbers, no fog peeking beyond the field.

import { BACKLINE, CAVALRY, isRanged, regimentRadius } from './combat_math';
import { active, dist, type KernelData, onField, other, unitOf } from './data';
import { nearestEnemyRegiment } from './engage';
import { castAbility } from './heroes';
import { teamStrength } from './objectives';
import type { BattleState, HeroState, PlanId, RegimentState, Team } from './types';

export const PLAN_NAMES: Record<PlanId, string> = {
  advance: '正面推进',
  flank: '两翼包抄',
  breakthrough: '中央突破',
  hold: '坚守待援',
  protect: '保护目标',
  decapitate: '斩首',
};

export function chooseUtilityPlan(state: BattleState, team: Team, data: KernelData): PlanId {
  const own = teamStrength(state, data, team);
  const foe = teamStrength(state, data, other(team));
  const ratio = own / Math.max(1, foe);
  const traits = state.generals[team]?.traits ?? [];
  const holds = state.objectives.some(
    (o) => o.team === team && o.kind === 'hold' && o.status === 'active',
  );
  if (holds) return ratio > 2.5 ? 'advance' : 'protect';
  if (ratio < 0.7) return 'hold';
  if (traits.includes('谨慎') && ratio < 1.2) return 'hold';
  if (traits.includes('勇猛')) return 'breakthrough';
  const mine = state.regiments.filter((r) => r.team === team && active(r));
  const cav = mine.filter((r) => CAVALRY.has(unitOf(data, r.typeId).role)).length;
  if (mine.length > 0 && cav / mine.length >= 0.25 && ratio >= 0.9) return 'flank';
  const foeHeroes = state.heroes.some((h) => h.team !== team && !h.down);
  if (traits.includes('狡诈') && foeHeroes) return 'decapitate';
  return 'advance';
}

function holdZoneCenter(
  state: BattleState,
  team: Team,
  from: { x: number; y: number },
): { x: number; y: number } | undefined {
  let best: { x: number; y: number } | undefined;
  let bd = Number.POSITIVE_INFINITY;
  for (const o of state.objectives) {
    if (o.team !== team || o.kind !== 'hold' || o.status !== 'active' || !o.zone) continue;
    const c = { x: o.zone.x + o.zone.w / 2, y: o.zone.y + o.zone.h / 2 };
    const d = dist(c, from);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

function pickTarget(
  state: BattleState,
  r: RegimentState,
  claims: Map<string, number>,
  filter?: (t: RegimentState) => boolean,
): RegimentState | undefined {
  let best: RegimentState | undefined;
  let bs = Number.POSITIVE_INFINITY;
  for (const t of state.regiments) {
    if (t.team === r.team || !onField(t) || t.state === 'rout') continue;
    if (filter && !filter(t)) continue;
    const s = dist(r, t) + 3 * (claims.get(t.id) ?? 0);
    if (s < bs) {
      bs = s;
      best = t;
    }
  }
  return best;
}

function attack(r: RegimentState, t: RegimentState, claims: Map<string, number>): void {
  if (r.order?.kind !== 'attack' || r.order.targetId !== t.id) {
    r.order = { kind: 'attack', targetId: t.id };
    r.path = [];
  }
  claims.set(t.id, (claims.get(t.id) ?? 0) + 1);
}

function holdAt(r: RegimentState, x: number, y: number): void {
  if (r.order?.kind === 'hold' && Math.hypot(r.order.x - x, r.order.y - y) < 0.5) return;
  r.order = { kind: 'hold', x, y };
  r.path = [];
}

/** Assign orders to AI-driven regiments of a team (all of them when `all`). */
export function runTeamAi(state: BattleState, team: Team, data: KernelData, all: boolean): void {
  const plan = state.plans[team]?.planId ?? 'advance';
  const claims = new Map<string, number>();
  const mine = state.regiments.filter(
    (r) => r.team === team && active(r) && (all || r.controller === 'ai'),
  );
  mine.forEach((r, idx) => {
    const u = unitOf(data, r.typeId);
    const ranged = isRanged(u);
    const fast = u.speed >= 2.2;
    if (plan === 'protect' || plan === 'hold') {
      const ang = (idx / Math.max(1, mine.length)) * Math.PI * 2;
      const center = holdZoneCenter(state, team, r);
      const base = center ?? { x: r.x, y: r.y };
      const ring = center ? 1.5 + regimentRadius(r.count) : 0;
      const hx = base.x + Math.cos(ang) * ring;
      const hy = base.y + Math.sin(ang) * ring;
      const threat = nearestEnemyRegiment(state, { x: hx, y: hy }, team, (t) => t.state !== 'rout');
      const react = ranged ? u.range + 1 : plan === 'hold' ? 4 : 5;
      if (threat && dist(threat, { x: hx, y: hy }) <= react + regimentRadius(threat.count)) {
        attack(r, threat, claims);
      } else if (fast && plan === 'hold' && threat && !center) {
        holdAt(r, r.x, r.y);
      } else {
        holdAt(r, hx, hy);
      }
      return;
    }
    let t: RegimentState | undefined;
    if (plan === 'flank' && fast) {
      t = pickTarget(state, r, claims, (x) => BACKLINE.has(unitOf(data, x.typeId).role));
    } else if (plan === 'breakthrough' && (u.role === 'shock' || CAVALRY.has(u.role))) {
      t = state.regiments
        .filter((x) => x.team !== team && active(x))
        .sort((a, b) => a.morale - b.morale || a.id.localeCompare(b.id))[0];
    }
    if (plan === 'decapitate' && fast) {
      const h = state.heroes
        .filter((x) => x.team !== team && !x.down)
        .sort((a, b) => dist(a, r) - dist(b, r) || a.id.localeCompare(b.id))[0];
      if (h) {
        if (r.order?.kind !== 'attack' || r.order.targetId !== h.id) {
          r.order = { kind: 'attack', targetId: h.id };
          r.path = [];
        }
        return;
      }
    }
    t = t ?? pickTarget(state, r, claims);
    if (t) attack(r, t, claims);
    else holdAt(r, r.x, r.y);
  });
}

function bestEnemyInRange(
  state: BattleState,
  h: HeroState,
  range: number,
): RegimentState | undefined {
  let best: RegimentState | undefined;
  for (const r of state.regiments) {
    if (r.team === h.team || !active(r)) continue;
    if (dist(r, h) > range + regimentRadius(r.count)) continue;
    if (!best || r.count > best.count || (r.count === best.count && r.id < best.id)) best = r;
  }
  return best;
}

/** AI hero: one ability per pass when useful, then close in on the nearest enemy. */
export function runHeroAi(state: BattleState, h: HeroState, data: KernelData): void {
  if (h.down) return;
  for (const slot of h.abilities) {
    if (slot.readyAt > state.time) continue;
    const def = data.abilities.get(slot.id);
    if (!def) continue;
    let cast = false;
    if (def.kind === 'inspire') {
      const near = state.regiments.filter(
        (r) => r.team === h.team && active(r) && dist(r, h) <= (def.radius ?? 6),
      );
      if (near.some((r) => r.busy || r.morale < 40))
        cast = castAbility(state, data, h, def.id, {}).ok;
    } else if (def.kind === 'rally') {
      const routed = state.regiments.some(
        (r) =>
          r.team === h.team && r.state === 'rout' && r.count > 0 && dist(r, h) <= (def.radius ?? 6),
      );
      if (routed) cast = castAbility(state, data, h, def.id, {}).ok;
    } else if (def.kind === 'strike') {
      const foeHero = state.heroes.find(
        (x) => x.team !== h.team && !x.down && dist(x, h) <= def.range + 0.8,
      );
      if (foeHero) cast = castAbility(state, data, h, def.id, { targetId: foeHero.id }).ok;
    } else {
      const t = bestEnemyInRange(state, h, def.range);
      if (t && t.count >= 5) cast = castAbility(state, data, h, def.id, { targetId: t.id }).ok;
    }
    if (cast) break;
  }
  if (h.controller === 'player' && state.mode === 'manual') return;
  const setGoal = (gx: number, gy: number) => {
    if (Math.hypot(gx - h.x, gy - h.y) < 0.5) {
      h.order = null;
      return;
    }
    if (!h.order || Math.hypot(h.order.x - gx, h.order.y - gy) > 1) {
      h.order = { kind: 'move', x: gx, y: gy };
      h.path = [];
    }
  };
  // badly hurt heroes fall back toward their own retreat point
  if (h.hp < h.maxHp * 0.3) {
    const home = state.retreat[h.team];
    setGoal(home.x, home.y);
    return;
  }
  const foe = nearestEnemyRegiment(state, h, h.team, (r) => r.state !== 'rout');
  if (!foe) {
    h.order = null;
    return;
  }
  const melee = h.abilities.some((a) => {
    const k = data.abilities.get(a.id)?.kind;
    return k === 'charge' || k === 'strike';
  });
  const anchor = state.regiments
    .filter((r) => r.team === h.team && active(r))
    .sort((a, b) => dist(a, foe) - dist(b, foe) || a.id.localeCompare(b.id))[0];
  if (anchor) {
    // fight beside the front regiment (melee kit) or stay just behind it (support)
    const ang = Math.atan2(foe.y - anchor.y, foe.x - anchor.x);
    const off = melee && h.hp > h.maxHp * 0.6 ? regimentRadius(anchor.count) + 0.6 : -1.5;
    setGoal(anchor.x + Math.cos(ang) * off, anchor.y + Math.sin(ang) * off);
    return;
  }
  const want = regimentRadius(foe.count) + 0.8;
  const ang = Math.atan2(h.y - foe.y, h.x - foe.x);
  setGoal(foe.x + Math.cos(ang) * want, foe.y + Math.sin(ang) * want);
}
