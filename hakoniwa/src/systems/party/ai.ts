// Companion brain: follow the player in formation, assist (attack the player's target or
// whatever is hitting the party), heal the most wounded member (healers), taunt enemies
// off allies (tanks), and obey the party order (follow, assist, passive, stay). Downed
// companions get back up beside the player once the fighting stops.

import type { SystemContext } from '../../core/system';
import {
  applyAuraTo,
  canAttack,
  castAs,
  liveUnit,
  pickAbility,
  reviveUnit,
  setAutoAttack,
  unitOf,
} from '../combat';
import { secs } from '../combat/defs';
import type { AiUse, Unit } from '../combat/types';
import { entitiesNear, getEntity, orderMove, teleportEntity } from '../world';
import type { Entity } from '../world/types';
import type { CompanionDef, Member } from './types';

const SKIP: AiUse[] = ['cc'];
const REVIVE_AFTER = secs(15);
const RANGED_ROLES = new Set(['ranged', 'caster', 'healer']);

/** Formation slot behind the player for the n-th companion. */
function slot(pe: Entity, n: number): { x: number; y: number } {
  const angle = pe.facing + Math.PI + (n - 1) * 0.9 - 0.45;
  const r = 1.6 + Math.floor(n / 3) * 0.8;
  return { x: pe.x + Math.cos(angle) * r, y: pe.y + Math.sin(angle) * r };
}

function partyUnits(ctx: SystemContext, members: Member[]): Unit[] {
  const out: Unit[] = [];
  const p = liveUnit(ctx.world, ctx.world.slices.world.playerId);
  if (p) out.push(p[0]);
  for (const m of members) {
    const pair = liveUnit(ctx.world, m.entityId);
    if (pair) out.push(pair[0]);
  }
  return out;
}

function walk(
  ctx: SystemContext,
  m: Member,
  id: string,
  x: number,
  y: number,
  arrive: number,
): void {
  if (ctx.tick < m.pathAt) return;
  m.pathAt = ctx.tick + 10;
  orderMove(ctx, id, x, y, arrive);
}

/** Enemies near `e` whose current target is one of `ids`, nearest first. */
function attackersOf(
  ctx: SystemContext,
  u: Unit,
  e: Entity,
  ids: Set<string>,
  radius: number,
): Unit[] {
  const out: Unit[] = [];
  for (const near of entitiesNear(ctx.world, e.mapId, e.x, e.y, radius)) {
    const foe = unitOf(ctx.world, near.id);
    if (!foe?.target || !ids.has(foe.target) || !canAttack(ctx.world, u, foe)) continue;
    // a duelist is its duel partner's alone (combat duel.ts)
    if (foe.duel && foe.duel !== u.duel) continue;
    out.push(foe);
  }
  return out;
}

function chooseTarget(
  ctx: SystemContext,
  m: Member,
  u: Unit,
  e: Entity,
  party: Unit[],
): Unit | null {
  const player = liveUnit(ctx.world, ctx.world.slices.world.playerId);
  if (m.order === 'follow') {
    return attackersOf(ctx, u, e, new Set([u.id]), 8)[0] ?? null;
  }
  if (player) {
    const [pu] = player;
    const pt = unitOf(ctx.world, pu.target);
    const engaged = pu.autoAttack || !!pu.cast || pu.combatUntil > ctx.tick;
    const free = !pt?.duel || pt.duel === u.duel;
    if (pt && free && engaged && canAttack(ctx.world, u, pt) && liveUnit(ctx.world, pt.id))
      return pt;
  }
  return attackersOf(ctx, u, e, new Set(party.map((p) => p.id)), 12)[0] ?? null;
}

export function tickMember(
  ctx: SystemContext,
  def: CompanionDef,
  m: Member,
  n: number,
  members: Member[],
): void {
  const playerId = ctx.world.slices.world.playerId;
  const player = liveUnit(ctx.world, playerId);
  const mine = liveUnit(ctx.world, m.entityId);
  const u = unitOf(ctx.world, m.entityId);
  const e = getEntity(ctx.world, m.entityId);
  if (!u || !e) return;
  if (!mine) {
    const pe = getEntity(ctx.world, playerId);
    const pu = unitOf(ctx.world, playerId);
    if (
      u.downed &&
      pe &&
      pu &&
      ctx.tick - m.downedTick >= REVIVE_AFTER &&
      pu.combatUntil <= ctx.tick
    ) {
      const s = slot(pe, n);
      teleportEntity(ctx, u.id, pe.mapId, s.x, s.y);
      reviveUnit(ctx, u, 0.5);
      applyAuraTo(ctx, u.id, 'aur_st_downed_weak');
    }
    return;
  }
  if (!player) return;
  const [, pe] = player;
  if (e.mapId !== pe.mapId) {
    const s = slot(pe, n);
    teleportEntity(ctx, u.id, pe.mapId, s.x, s.y);
    return;
  }
  if (u.cast) return;
  if (m.order === 'passive') {
    if (u.autoAttack) setAutoAttack(ctx, u.id, false);
    const s = slot(pe, n);
    if (Math.hypot(e.x - s.x, e.y - s.y) > 2.5) walk(ctx, m, u.id, s.x, s.y, 0.6);
    return;
  }
  const party = partyUnits(ctx, members);
  const skip = [...SKIP];
  const fighting = party.some((p) => p.combatUntil > ctx.tick);
  if (def.role === 'healer' || !fighting) {
    const support = pickAbility(ctx, u, null, { allies: party, skip });
    if (support && !def.avoid?.includes(support.abilityId)) {
      castAs(ctx, u.id, support.abilityId, support.targetId);
      if (u.cast) return;
    }
  }
  if (def.role === 'tank') {
    const others = new Set(party.filter((p) => p !== u).map((p) => p.id));
    for (const foe of attackersOf(ctx, u, e, others, 8)) {
      const taunt = pickAbility(ctx, u, foe, { allies: party, skip });
      if (taunt && taunt.targetId === foe.id) {
        const r = castAs(ctx, u.id, taunt.abilityId, foe.id);
        if (r.ok) break;
      }
    }
  }
  const target = chooseTarget(ctx, m, u, e, party);
  if (!target) {
    if (u.autoAttack) setAutoAttack(ctx, u.id, false);
    if (m.order !== 'stay') {
      const s = slot(pe, n);
      if (Math.hypot(e.x - s.x, e.y - s.y) > 2.5) walk(ctx, m, u.id, s.x, s.y, 0.6);
    }
    return;
  }
  if (!u.autoAttack || u.target !== target.id) setAutoAttack(ctx, u.id, true, target.id);
  const pick = pickAbility(ctx, u, target, { allies: party, skip });
  if (pick && !def.avoid?.includes(pick.abilityId))
    castAs(ctx, u.id, pick.abilityId, pick.targetId);
  if (u.cast || m.order === 'stay') return;
  const te = getEntity(ctx.world, target.id);
  if (!te) return;
  const reach = RANGED_ROLES.has(def.role) ? 6 : e.radius + te.radius + 0.8;
  if (Math.hypot(te.x - e.x, te.y - e.y) > reach)
    walk(ctx, m, u.id, te.x, te.y, Math.max(0.5, reach * 0.8));
}
