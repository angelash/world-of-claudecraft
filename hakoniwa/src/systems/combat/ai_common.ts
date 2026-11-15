// Rule-based ability choice shared by monsters, companions and guards. Each ability
// declares an `ai` use; this module checks the situational condition for that use and
// returns the first usable ability by priority. Deterministic: no randomness here.

import type { SystemContext } from '../../core/system';
import { entitiesNear, getEntity } from '../world';
import { checkAbility } from './abilities';
import { hasAura } from './auras';
import { abilityDef } from './defs';
import { deriveStats } from './stats';
import type { AbilityDef, AiUse, Unit } from './types';
import { canAttack, isFriendlyPair, knownAbilities, liveUnit, unitOf } from './units';

export interface PickOpts {
  /** friendly units to consider for heals and buffs (defaults to self) */
  allies?: Unit[];
  /** uses this caller never wants (companions skip crowd control and summons) */
  skip?: AiUse[];
}

export interface Pick {
  abilityId: string;
  targetId?: string;
}

function hpFrac(ctx: SystemContext, u: Unit): number {
  const max = deriveStats(ctx.world, ctx.content, u).maxHp;
  return max > 0 ? u.hp / max : 1;
}

function firstAura(def: AbilityDef): string | undefined {
  for (const f of def.effects) if (f.type === 'aura') return f.aura;
  return undefined;
}

function enemiesAround(ctx: SystemContext, u: Unit, centreId: string, radius: number): number {
  const e = getEntity(ctx.world, centreId);
  if (!e) return 0;
  let n = 0;
  for (const near of entitiesNear(ctx.world, e.mapId, e.x, e.y, radius)) {
    const other = unitOf(ctx.world, near.id);
    if (other && canAttack(ctx.world, u, other)) n++;
  }
  return n;
}

export function pickAbility(
  ctx: SystemContext,
  u: Unit,
  target: Unit | null,
  opts: PickOpts = {},
): Pick | null {
  const world = ctx.world;
  const skip = new Set(opts.skip ?? []);
  const allies = (opts.allies ?? [u]).filter((a) => liveUnit(world, a.id) && isFriendlyPair(u, a));
  if (!allies.includes(u)) allies.push(u);
  const defs = knownAbilities(ctx.content, u)
    .map((id) => abilityDef(ctx.content, id))
    .filter((d): d is AbilityDef => !!d && d.ai !== 'never' && !skip.has(d.ai ?? 'filler'))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id));
  const liveTarget =
    target && liveUnit(world, target.id) && canAttack(world, u, target) ? target : null;
  const selfFrac = hpFrac(ctx, u);
  const lowest = [...allies].sort(
    (a, b) => hpFrac(ctx, a) - hpFrac(ctx, b) || a.id.localeCompare(b.id),
  );
  for (const def of defs) {
    const use = def.ai ?? 'filler';
    const aura = firstAura(def);
    let targetId: string | undefined;
    switch (use) {
      case 'heal':
      case 'hot':
      case 'shield':
      case 'emergency': {
        const limit =
          use === 'emergency' ? 0.25 : use === 'heal' ? 0.7 : use === 'hot' ? 0.85 : 0.9;
        const who = lowest.find(
          (a) => hpFrac(ctx, a) < limit && (!aura || use === 'heal' || !hasAura(a, aura)),
        );
        if (!who) continue;
        targetId = who.id;
        break;
      }
      case 'buff':
        if (aura && hasAura(u, aura)) continue;
        if (def.requires?.combo && !liveTarget) continue;
        break;
      case 'defensive':
        if (selfFrac >= 0.4) continue;
        break;
      case 'mana': {
        const max = deriveStats(world, ctx.content, u).maxRes.mana ?? 0;
        if (max <= 0 || (u.res.mana ?? 0) / max > 0.3 || selfFrac < 0.6) continue;
        break;
      }
      case 'summon': {
        const mine = Object.values(world.slices.combat.units).some(
          (o) => o.summonerId === u.id && !!liveUnit(world, o.id),
        );
        if (mine) continue;
        break;
      }
      case 'taunt':
        if (!liveTarget || liveTarget.target === u.id) continue;
        targetId = liveTarget.id;
        break;
      case 'interrupt':
        if (!liveTarget?.cast) continue;
        targetId = liveTarget.id;
        break;
      case 'execute':
        if (!liveTarget || hpFrac(ctx, liveTarget) >= 0.2) continue;
        targetId = liveTarget.id;
        break;
      case 'finisher':
        if (!liveTarget || u.combo < 1) continue;
        if (u.combo < 3 && hpFrac(ctx, liveTarget) >= 0.25) continue;
        targetId = liveTarget.id;
        break;
      case 'dot':
      case 'debuff':
        if (!liveTarget || (aura && hasAura(liveTarget, aura))) continue;
        targetId = liveTarget.id;
        break;
      case 'aoe': {
        if (!liveTarget) continue;
        const centre = def.target === 'enemy_area' ? liveTarget.id : u.id;
        const need = u.side === 'enemy' ? 1 : 2;
        if (enemiesAround(ctx, u, centre, def.radius ?? 3) < need) continue;
        if (def.target === 'enemy_area') targetId = liveTarget.id;
        break;
      }
      case 'cc':
        if (!liveTarget || (aura && hasAura(liveTarget, aura))) continue;
        if (def.target === 'enemy' || def.target === 'enemy_area') targetId = liveTarget.id;
        break;
      default:
        if (!liveTarget) continue;
        if (def.target === 'enemy' || def.target === 'enemy_area') targetId = liveTarget.id;
        break;
    }
    if (def.target === 'area' && !liveTarget) continue;
    const check = checkAbility(world, ctx.content, u, def.id, targetId);
    if (check.ok) return { abilityId: def.id, targetId };
  }
  return null;
}
