// Ability use: validation (known, crowd control, cast in progress, global cooldown,
// cooldown, resource, requirements, target, range), cast bars with movement
// interruption, and effect execution. Shared by the player, companions, guards and
// monsters; rule AI picks abilities in ai_common.ts.

import type { ContentMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { type KeyText, tr } from '../../core/text';
import type { World } from '../../core/world';
import { entitiesNear, getEntity, haltEntity, isWalkable, mapById, teleportEntity } from '../world';
import { applyAura, dispel, hasAura } from './auras';
import { healUnit, resolveHit } from './damage';
import { abilityDef, ENERGY_GCD_TICKS, GCD_TICKS, MELEE_RANGE, scaled, secs } from './defs';
import { meleeMissChance, spellHitChance } from './formulas';
import { spawnMonster } from './spawning';
import { type Derived, deriveStats, isDisabled } from './stats';
import { addThreat, engage, markCombat, taunt } from './threat';
import type { AbilityDef, EffectDef, ResourceKind, School, Unit } from './types';
import { canAttack, isFriendlyPair, knownAbilities, liveUnit, unitOf } from './units';

export type Check =
  | { ok: true; def: AbilityDef; target: Unit; cost: number }
  | { ok: false; code: string; reason: KeyText };

/** Display name of a resource pool, as a fresh text key. */
export function resourceName(kind: ResourceKind): KeyText {
  return tr(`sys.combat.resource.${kind}`);
}

export function abilityCost(def: AbilityDef, d: Derived): number {
  if (def.costPct && def.resource === 'mana') return Math.round((d.maxRes.mana ?? 0) * def.costPct);
  return def.cost ?? 0;
}

/** Distance between two bodies, edge to edge, in tiles. */
export function gap(world: World, aId: string, bId: string): number {
  const a = getEntity(world, aId);
  const b = getEntity(world, bId);
  if (!a || !b || a.mapId !== b.mapId) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius);
}

/** Effective reach of an ability (melee abilities use the melee reach). */
export function reachOf(def: AbilityDef): number {
  const r = def.range ?? 0;
  return r <= 1.5 ? Math.max(r, MELEE_RANGE) : r;
}

function isOffensive(def: AbilityDef): boolean {
  return def.target === 'enemy' || def.target === 'enemy_area' || def.target === 'area';
}

export function checkAbility(
  world: World,
  content: ContentMap,
  caster: Unit,
  abilityId: string,
  targetId?: string | null,
): Check {
  const def = abilityDef(content, abilityId);
  if (!def) return { ok: false, code: 'no_ability', reason: tr('sys.combat.reject.no_ability') };
  if (!liveUnit(world, caster.id))
    return { ok: false, code: 'dead', reason: tr('sys.combat.reject.dead') };
  if (!knownAbilities(content, caster).includes(abilityId)) {
    return { ok: false, code: 'unknown', reason: tr('sys.combat.reject.unknown') };
  }
  const d = deriveStats(world, content, caster);
  if (isDisabled(d))
    return { ok: false, code: 'disabled', reason: tr('sys.combat.reject.disabled') };
  if (d.cc.silence && (def.school ?? 'physical') !== 'physical') {
    return { ok: false, code: 'silenced', reason: tr('sys.combat.reject.silenced') };
  }
  if (caster.cast) return { ok: false, code: 'busy', reason: tr('sys.combat.reject.busy') };
  const tick = world.meta.tick;
  if (def.gcd !== false && caster.gcd > tick)
    return { ok: false, code: 'gcd', reason: tr('sys.combat.reject.gcd') };
  if ((caster.cds[abilityId] ?? 0) > tick)
    return { ok: false, code: 'cooldown', reason: tr('sys.combat.reject.cooldown') };
  const cost = abilityCost(def, d);
  if (def.resource && cost > 0) {
    const have = caster.res[def.resource];
    if (have === undefined) {
      return {
        ok: false,
        code: 'no_pool',
        reason: tr('sys.combat.reject.no_pool', { resource: resourceName(def.resource) }),
      };
    }
    if (have < cost) {
      return {
        ok: false,
        code: 'no_resource',
        reason: tr('sys.combat.reject.no_resource', { resource: resourceName(def.resource) }),
      };
    }
  }
  const req = def.requires;
  if (req?.combo && caster.combo < req.combo) {
    return { ok: false, code: 'no_combo', reason: tr('sys.combat.reject.no_combo') };
  }
  if (req?.selfHpBelow !== undefined && caster.hp > d.maxHp * req.selfHpBelow) {
    return { ok: false, code: 'not_yet', reason: tr('sys.combat.reject.not_yet.self_hp') };
  }

  let target: Unit | undefined = caster;
  if (def.target === 'enemy' || def.target === 'enemy_area') {
    target = unitOf(world, targetId ?? caster.target);
    if (!target || !canAttack(world, caster, target)) {
      return { ok: false, code: 'bad_target', reason: tr('sys.combat.reject.bad_target.enemy') };
    }
  } else if (def.target === 'ally' || def.target === 'ally_area') {
    const want = unitOf(world, targetId ?? caster.target);
    target = want && isFriendlyPair(caster, want) && liveUnit(world, want.id) ? want : caster;
  }
  if (target !== caster) {
    const g = gap(world, caster.id, target.id);
    if (!Number.isFinite(g))
      return { ok: false, code: 'bad_target', reason: tr('sys.combat.reject.bad_target.absent') };
    if (g > reachOf(def))
      return { ok: false, code: 'out_of_range', reason: tr('sys.combat.reject.out_of_range') };
    if (def.minRange && g < def.minRange)
      return { ok: false, code: 'too_close', reason: tr('sys.combat.reject.too_close') };
  }
  if (req?.targetHpBelow !== undefined) {
    const td = deriveStats(world, content, target);
    if (target.hp > td.maxHp * req.targetHpBelow) {
      return { ok: false, code: 'not_yet', reason: tr('sys.combat.reject.not_yet.target_hp') };
    }
  }
  if (req?.targetLacksAura && hasAura(target, req.targetLacksAura)) {
    return { ok: false, code: 'not_yet', reason: tr('sys.combat.reject.not_yet.target_aura') };
  }
  return { ok: true, def, target, cost };
}

/** Use an ability now (instant) or start its cast bar. */
export function useAbility(
  ctx: SystemContext,
  caster: Unit,
  abilityId: string,
  targetId?: string | null,
): Check {
  const check = checkAbility(ctx.world, ctx.content, caster, abilityId, targetId);
  if (!check.ok) return check;
  const { def, target } = check;
  if (def.gcd !== false) {
    caster.gcd = ctx.tick + (def.resource === 'energy' ? ENERGY_GCD_TICKS : GCD_TICKS);
  }
  if (isOffensive(def) && target !== caster) caster.target = target.id;
  const e = getEntity(ctx.world, caster.id);
  if ((def.castTime ?? 0) > 0 && e) {
    const d = deriveStats(ctx.world, ctx.content, caster);
    const haste = 1 + Math.max(-0.5, d.stats.haste / 100);
    if (caster.side !== 'ally' || e.kind !== 'player') haltEntity(ctx, e.id);
    caster.cast = {
      abilityId,
      targetId: target.id,
      start: ctx.tick,
      end: ctx.tick + Math.max(1, Math.round(secs(def.castTime ?? 0) / haste)),
      x: e.x,
      y: e.y,
    };
    ctx.emit('combat.cast', { casterId: caster.id, abilityId, targetId: target.id, op: 'start' });
    return check;
  }
  execute(ctx, caster, def, target);
  return check;
}

export function interruptCast(ctx: SystemContext, u: Unit): void {
  if (!u.cast) return;
  ctx.emit('combat.cast', {
    casterId: u.id,
    abilityId: u.cast.abilityId,
    targetId: u.cast.targetId ?? undefined,
    op: 'interrupted',
  });
  u.cast = null;
}

/** Advance a cast bar: movement cancels it, completion re-validates and fires. */
export function tickCast(ctx: SystemContext, u: Unit): void {
  const cast = u.cast;
  if (!cast) return;
  const e = getEntity(ctx.world, u.id);
  if (!e?.alive) {
    u.cast = null;
    return;
  }
  if (Math.hypot(e.x - cast.x, e.y - cast.y) > 0.15) {
    interruptCast(ctx, u);
    return;
  }
  if (ctx.tick < cast.end) return;
  const def = abilityDef(ctx.content, cast.abilityId);
  u.cast = null;
  if (!def) return;
  let target: Unit | undefined = unitOf(ctx.world, cast.targetId);
  const live = target ? liveUnit(ctx.world, target.id) : undefined;
  if (!target || !live) {
    if (isOffensive(def) && def.target !== 'area') return;
    target = u;
  }
  if (target !== u && gap(ctx.world, u.id, target.id) > reachOf(def) * 1.25) {
    ctx.emit('combat.cast', {
      casterId: u.id,
      abilityId: def.id,
      targetId: target.id,
      op: 'interrupted',
    });
    return;
  }
  if (isOffensive(def) && target !== u && !canAttack(ctx.world, u, target)) return;
  const d = deriveStats(ctx.world, ctx.content, u);
  const cost = abilityCost(def, d);
  if (def.resource && cost > 0 && (u.res[def.resource] ?? 0) < cost) return;
  execute(ctx, u, def, target);
}

function spend(ctx: SystemContext, u: Unit, def: AbilityDef): void {
  const d = deriveStats(ctx.world, ctx.content, u);
  const cost = abilityCost(def, d);
  if (def.resource && cost > 0) {
    u.res[def.resource] = Math.max(0, (u.res[def.resource] ?? 0) - cost);
    if (def.resource === 'mana') u.manaSpentAt = ctx.tick;
  }
  if (def.cooldown) u.cds[def.id] = ctx.tick + secs(def.cooldown);
}

function targetsFor(ctx: SystemContext, caster: Unit, def: AbilityDef, target: Unit): Unit[] {
  const world = ctx.world;
  const pick = (centre: Unit, radius: number, enemies: boolean): Unit[] => {
    const ce = getEntity(world, centre.id);
    if (!ce) return [];
    const out: Unit[] = [];
    for (const ent of entitiesNear(world, ce.mapId, ce.x, ce.y, radius)) {
      const u = unitOf(world, ent.id);
      if (!u || !liveUnit(world, u.id)) continue;
      if (enemies ? canAttack(world, caster, u) : isFriendlyPair(caster, u)) out.push(u);
    }
    return out.slice(0, def.maxTargets ?? 10);
  };
  switch (def.target) {
    case 'area':
      return pick(caster, def.radius ?? 3, true);
    case 'enemy_area': {
      const rest = pick(target, def.radius ?? 2, true).filter((u) => u !== target);
      return [target, ...rest].slice(0, def.maxTargets ?? 10);
    }
    case 'party':
      return pick(caster, def.radius ?? 10, false);
    case 'ally_area': {
      const rest = pick(target, def.radius ?? 4, false).filter((u) => u !== target);
      return [target, ...rest].slice(0, def.maxTargets ?? 10);
    }
    default:
      return [target];
  }
}

function swingRoll(ctx: SystemContext, _u: Unit, d: Derived): number {
  const w = d.weapon;
  const roll = ctx.rng('combat.dmg').range(w.min, Math.max(w.min, w.max));
  return w.flat ? roll : roll + (d.stats.ap / 14) * w.speed;
}

/** Roll whether a pure debuff lands on an enemy (spell hit, or melee miss for physical). */
function lands(ctx: SystemContext, caster: Unit, target: Unit, school: School): boolean {
  const r = ctx.rng('combat.hit').next();
  const ok =
    school === 'physical'
      ? r >= meleeMissChance(caster.level, target.level)
      : r < spellHitChance(caster.level, target.level);
  if (!ok) {
    ctx.emit('combat.damage', {
      sourceId: caster.id,
      targetId: target.id,
      amount: 0,
      absorbed: 0,
      school,
      outcome: school === 'physical' ? 'miss' : 'resist',
    });
  }
  engage(ctx, target, caster);
  addThreat(ctx, target, caster.id, 10);
  return ok;
}

function execute(ctx: SystemContext, caster: Unit, def: AbilityDef, target: Unit): void {
  spend(ctx, caster, def);
  const d = deriveStats(ctx.world, ctx.content, caster);
  const combo = caster.combo;
  const usesCombo = def.effects.some(
    (f) => (f.type === 'damage' && f.perCombo) || (f.type === 'aura' && f.perComboMult),
  );
  const school: School = def.school ?? 'physical';
  const hasDamage = def.effects.some((f) => f.type === 'damage');
  const selfDone = new Set<number>();
  for (const t of targetsFor(ctx, caster, def, target)) {
    const enemy = canAttack(ctx.world, caster, t);
    let landed = true;
    if (enemy && !hasDamage && def.effects.some((f) => f.type === 'aura' && f.to !== 'self')) {
      landed = lands(ctx, caster, t, school);
    }
    def.effects.forEach((f, i) => {
      if (!liveUnit(ctx.world, t.id) && f.type !== 'aura') return;
      if (f.type === 'aura' && f.to === 'self') {
        if (selfDone.has(i)) return;
        selfDone.add(i);
        applyAura(ctx, caster, f.aura, caster);
        return;
      }
      const res = runEffect(ctx, caster, def, f, t, d, combo, enemy, landed);
      if (res === 'missed') landed = false;
    });
  }
  if (usesCombo) caster.combo = 0;
  if (isOffensive(def)) markCombat(ctx, caster);
  if (def.say) {
    const e = getEntity(ctx.world, caster.id);
    if (e)
      ctx.emit('dialogue.line', {
        speakerId: caster.id,
        speakerName: e.name,
        text: def.say,
        kind: 'say',
      });
  }
  ctx.emit('combat.cast', {
    casterId: caster.id,
    abilityId: def.id,
    targetId: target.id,
    op: 'finish',
  });
}

function runEffect(
  ctx: SystemContext,
  caster: Unit,
  def: AbilityDef,
  f: EffectDef,
  t: Unit,
  d: Derived,
  combo: number,
  enemy: boolean,
  landed: boolean,
): 'missed' | undefined {
  switch (f.type) {
    case 'damage': {
      if (!enemy) return;
      const school = f.school ?? def.school ?? 'physical';
      const power =
        (f.power ?? (school === 'physical' ? 'ap' : 'sp')) === 'ap' ? d.stats.ap : d.stats.sp;
      let amount = scaled(f.amount, caster.level, power);
      if (f.weapon) amount += swingRoll(ctx, caster, d) * f.weapon;
      if (f.perCombo) amount += scaled(f.perCombo, caster.level, 0) * combo;
      const ranged = (def.range ?? 0) > 2;
      const kind = school === 'physical' ? (ranged ? 'ranged' : 'melee') : 'spell';
      const r = resolveHit(ctx, {
        source: caster,
        target: t,
        amount,
        school,
        kind,
        abilityId: def.id,
        threatMult: f.threat,
        leech: f.leech,
      });
      if (
        r.outcome === 'miss' ||
        r.outcome === 'dodge' ||
        r.outcome === 'parry' ||
        r.outcome === 'resist'
      ) {
        return 'missed';
      }
      return;
    }
    case 'heal':
      if (!enemy)
        healUnit(ctx, caster, t, scaled(f.amount, caster.level, d.stats.sp), { abilityId: def.id });
      return;
    case 'heal_pct': {
      if (enemy) return;
      const max = deriveStats(ctx.world, ctx.content, t).maxHp;
      healUnit(ctx, caster, t, max * f.pct, { abilityId: def.id, canCrit: false });
      return;
    }
    case 'aura':
      if (enemy && !landed) return;
      applyAura(ctx, t, f.aura, caster, {
        powerMult: f.perComboMult ? 1 + f.perComboMult * Math.max(0, combo - 1) : 1,
      });
      if (enemy) {
        engage(ctx, t, caster);
        addThreat(ctx, t, caster.id, 5);
      }
      return;
    case 'resource': {
      const max = d.maxRes[f.resource];
      if (max !== undefined)
        caster.res[f.resource] = Math.min(max, (caster.res[f.resource] ?? 0) + f.amount);
      return;
    }
    case 'hp_to_mana': {
      const amt = scaled(f.amount, caster.level, d.stats.sp);
      if (caster.res.mana === undefined) return;
      caster.hp = Math.max(1, caster.hp - amt);
      caster.res.mana = Math.min(d.maxRes.mana ?? 0, caster.res.mana + amt);
      return;
    }
    case 'combo':
      caster.combo = Math.min(5, caster.combo + f.amount);
      return;
    case 'taunt':
      if (enemy && landed) taunt(ctx, t, caster);
      return;
    case 'interrupt':
      if (enemy && t.cast) {
        interruptCast(ctx, t);
        applyAura(ctx, t, 'interrupted', caster, { durationTicks: secs(f.lockout) });
      }
      return;
    case 'dispel':
      dispel(ctx, t, f.kind, f.count ?? 1);
      return;
    case 'charge':
      if (enemy) moveBeside(ctx, caster, t);
      return;
    case 'knockback':
      if (enemy && landed) push(ctx, caster, t, f.distance);
      return;
    case 'summon':
      summonFor(ctx, caster, f.monster, f.count);
      return;
    case 'threat':
      if (enemy) addThreat(ctx, t, caster.id, scaled(f.amount, caster.level, 0));
      return;
  }
}

function moveBeside(ctx: SystemContext, mover: Unit, to: Unit): void {
  const a = getEntity(ctx.world, mover.id);
  const b = getEntity(ctx.world, to.id);
  if (!a || !b || a.mapId !== b.mapId) return;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const len = Math.hypot(dx, dy) || 1;
  const dist = a.radius + b.radius + 0.2;
  teleportEntity(ctx, mover.id, a.mapId, b.x + (dx / len) * dist, b.y + (dy / len) * dist);
  const brain = mover.ai;
  if (brain) brain.pathAt = 0;
}

function push(ctx: SystemContext, from: Unit, who: Unit, distance: number): void {
  const a = getEntity(ctx.world, from.id);
  const b = getEntity(ctx.world, who.id);
  const map = b ? mapById(ctx.content, b.mapId) : undefined;
  if (!a || !b || !map) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let x = b.x;
  let y = b.y;
  for (let s = 0.25; s <= distance; s += 0.25) {
    const nx = b.x + (dx / len) * s;
    const ny = b.y + (dy / len) * s;
    if (!isWalkable(map, nx, ny)) break;
    x = nx;
    y = ny;
  }
  if (x !== b.x || y !== b.y) teleportEntity(ctx, who.id, b.mapId, x, y);
  who.cast = null;
}

function summonFor(ctx: SystemContext, caster: Unit, monsterId: string, count: number): void {
  const e = getEntity(ctx.world, caster.id);
  if (!e) return;
  if (caster.side === 'ally') {
    for (const u of Object.values(ctx.world.slices.combat.units)) {
      if (u.summonerId === caster.id && u.monsterId === monsterId) {
        const pe = getEntity(ctx.world, u.id);
        if (pe?.alive) return;
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
