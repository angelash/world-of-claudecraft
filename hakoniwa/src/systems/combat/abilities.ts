// Ability use: validation (known, crowd control, cast in progress, global cooldown,
// cooldown, resource, requirements, target, range), cast bars with movement
// interruption, and effect execution. Shared by the player, companions, guards and
// monsters; rule AI picks abilities in ai_common.ts.

import type { ContentMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { type KeyText, tr } from '../../core/text';
import type { World } from '../../core/world';
import { entitiesNear, getEntity, haltEntity, isWalkable, teleportEntity, walkMap } from '../world';
import { purifyHit } from './affixes/purify';
import { DESPERATE_HEAL, desperatePct } from './affixes/timed';
import { applyAura, dispel, hasAura } from './auras';
import { abilityHitShield, interruptibleNow, markOf, shieldImmune, startMarks } from './boss';
import { immuneToForcedMove } from './control';
import { healUnit, resolveHit } from './damage';
import {
  abilityDef,
  auraDef,
  ENERGY_GCD_TICKS,
  GCD_TICKS,
  MELEE_RANGE,
  scaled,
  secs,
} from './defs';
import { meleeMissChance, spellHitChance } from './formulas';
import { injureOnHit } from './injuries';
import { crossFeed, poolDriven } from './pools';
import { hitPresentation } from './presentation';
import { onRack } from './rack';
import { type Derived, deriveStats, isDisabled } from './stats';
import { summonFor } from './summons';
import { cancelWarnings, leadTicks, settleCast, warnAbility } from './telegraph';
import { addThreat, engage, markCombat, taunt } from './threat';
import type { AbilityDef, EffectDef, ResourceKind, School, Unit } from './types';
import { canAttack, isFriendlyPair, knownAbilities, liveUnit, unitOf } from './units';

/** Options of an ability use: a scripted boss cast skips the list, the bar and the clocks. */
export interface UseOpts {
  force?: boolean;
}

/** Options of effects landing without their own targeting (a warning settling, 10.3). */
export interface EffectOpts {
  /** no hit roll: the area decided who is struck */
  noRoll?: boolean;
  /** damage and healing multiplier (a shared stack mark, a first half) */
  mult?: number;
}

/** The chance a unit's spells miscast (sediment fever, combat 9.4): the strongest aura's. */
export function miscastChance(content: ContentMap, u: Unit): number {
  let best = 0;
  for (const a of u.auras) best = Math.max(best, auraDef(content, a.id)?.miscast ?? 0);
  return best;
}

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

/** A weapon strike: some damage effect adds a weapon swing (disarm forbids it, 9.1). */
export function needsWeapon(def: AbilityDef): boolean {
  return def.effects.some((f) => f.type === 'damage' && !!f.weapon);
}

/** Whether a cast of this ability can be interrupted (8.1; the cast bar border, 18). */
export function interruptible(def: AbilityDef | undefined): boolean {
  return !def?.uninterruptible;
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
  opts: UseOpts = {},
): Check {
  const def = abilityDef(content, abilityId);
  if (!def) return { ok: false, code: 'no_ability', reason: tr('sys.combat.reject.no_ability') };
  if (!liveUnit(world, caster.id))
    return { ok: false, code: 'dead', reason: tr('sys.combat.reject.dead') };
  if (!opts.force && !knownAbilities(content, caster).includes(abilityId)) {
    return { ok: false, code: 'unknown', reason: tr('sys.combat.reject.unknown') };
  }
  if (!opts.force && !onRack(caster, abilityId))
    return { ok: false, code: 'not_racked', reason: tr('sys.combat.reject.not_racked') };
  const d = deriveStats(world, content, caster);
  if (isDisabled(d))
    return { ok: false, code: 'disabled', reason: tr('sys.combat.reject.disabled') };
  if (d.cc.silence && (def.school ?? 'physical') !== 'physical') {
    return { ok: false, code: 'silenced', reason: tr('sys.combat.reject.silenced') };
  }
  if (d.cc.disarm && needsWeapon(def))
    return { ok: false, code: 'disarmed', reason: tr('sys.combat.reject.disarmed') };
  if (d.twoHandLocked && needsWeapon(def))
    return { ok: false, code: 'maimed', reason: tr('sys.combat.reject.maimed') };
  if (caster.cast) return { ok: false, code: 'busy', reason: tr('sys.combat.reject.busy') };
  const tick = world.meta.tick;
  if (!opts.force && def.gcd !== false && caster.gcd > tick)
    return { ok: false, code: 'gcd', reason: tr('sys.combat.reject.gcd') };
  if (!opts.force && (caster.cds[abilityId] ?? 0) > tick)
    return { ok: false, code: 'cooldown', reason: tr('sys.combat.reject.cooldown') };
  const cost = abilityCost(def, d);
  if (def.resource && cost > 0 && !poolDriven(world, caster, def.resource)) {
    return {
      ok: false,
      code: 'pool_idle',
      reason: tr('sys.combat.reject.pool_idle', { resource: resourceName(def.resource) }),
    };
  }
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
  opts: UseOpts = {},
): Check {
  const check = checkAbility(ctx.world, ctx.content, caster, abilityId, targetId, opts);
  if (!check.ok) return check;
  const { def, target } = check;
  const e = getEntity(ctx.world, caster.id);
  // a ground warning (10.3): the area locks now and the effects wait for the lead
  const tg = def.telegraph;
  const mark = markOf(ctx, caster, def.id);
  let warned = false;
  if (mark) {
    if (startMarks(ctx, caster, def, mark) === 0) return capFull();
  } else if (tg) {
    if (!warnAbility(ctx, caster, def, aimOf(ctx, caster, target, targetId))) return capFull();
    warned = tg.shape.kind !== 'pulse';
  }
  if (def.gcd !== false) {
    caster.gcd = ctx.tick + (def.resource === 'energy' ? ENERGY_GCD_TICKS : GCD_TICKS);
  }
  if (isOffensive(def) && target !== caster) caster.target = target.id;
  if (mark || (tg && !warned)) {
    // marks and pulse zones are laid at once; their hits come from the warnings
    spend(ctx, caster, def);
    if (isOffensive(def)) markCombat(ctx, caster);
    ctx.emit('combat.cast', { casterId: caster.id, abilityId, targetId: target.id, op: 'finish' });
    return check;
  }
  if (warned && e) {
    // the warned cast lasts the whole lead: no haste shortens a warning
    haltEntity(ctx, e.id);
    caster.cast = {
      abilityId,
      targetId: target.id,
      start: ctx.tick,
      end: ctx.tick + leadTicks(ctx, def),
      x: e.x,
      y: e.y,
      warned: true,
    };
    ctx.emit('combat.cast', {
      casterId: caster.id,
      abilityId,
      targetId: target.id,
      op: 'start',
      interruptible: interruptibleNow(ctx.world, ctx.content, caster),
    });
    return check;
  }
  if ((def.castTime ?? 0) > 0 && e) {
    const d = deriveStats(ctx.world, ctx.content, caster);
    const haste = 1 + Math.max(-0.5, d.stats.haste / 100);
    if (caster.side !== 'ally' || e.kind !== 'player') haltEntity(ctx, e.id);
    const end =
      ctx.tick + Math.max(1, Math.round((secs(def.castTime ?? 0) * d.intervalMult) / haste));
    caster.cast = { abilityId, targetId: target.id, start: ctx.tick, end, x: e.x, y: e.y };
    if (def.channel) {
      const every = Math.max(1, Math.floor((end - ctx.tick) / Math.max(1, def.channel.ticks)));
      caster.cast.channel = { every, next: ctx.tick + every, n: 0 };
    }
    ctx.emit('combat.cast', {
      casterId: caster.id,
      abilityId,
      targetId: target.id,
      op: 'start',
      interruptible: interruptibleNow(ctx.world, ctx.content, caster),
      ...(def.channel ? { channel: true } : {}),
    });
    return check;
  }
  execute(ctx, caster, def, target);
  return check;
}

/** Outcomes of a hit that did not land (a shield may still have soaked one that did). */
const MISSED: ReadonlySet<string> = new Set(['miss', 'dodge', 'parry', 'resist', 'immune']);

/**
 * Where a warning aims (10.3 `at: target`, cone and line facing): the checked target, or for
 * an area ability the caster's chosen or current foe; none when it has no foe.
 */
function aimOf(
  ctx: SystemContext,
  caster: Unit,
  target: Unit,
  targetId: string | null | undefined,
): Unit | null {
  if (target !== caster) return target;
  const foe = unitOf(ctx.world, targetId ?? caster.target);
  return foe && liveUnit(ctx.world, foe.id) && canAttack(ctx.world, caster, foe) ? foe : null;
}

function capFull(): Check {
  return { ok: false, code: 'warn_cap', reason: tr('sys.combat.reject.warn_cap') };
}

/**
 * Channel an ability on any entity (the door drain on a door-marked child, 10.8): the
 * holder needs no combat unit; its pulses land only on a unit, the events go out regardless.
 */
export function startChannelOn(
  ctx: SystemContext,
  caster: Unit,
  abilityId: string,
  entityId: string,
): boolean {
  const def = abilityDef(ctx.content, abilityId);
  const e = getEntity(ctx.world, caster.id);
  if (!def?.channel || !e || caster.cast || !liveUnit(ctx.world, caster.id)) return false;
  if (isDisabled(deriveStats(ctx.world, ctx.content, caster))) return false;
  if ((caster.cds[abilityId] ?? 0) > ctx.tick) return false;
  const end = ctx.tick + Math.max(1, secs(def.castTime ?? 1));
  const every = Math.max(1, Math.floor((end - ctx.tick) / Math.max(1, def.channel.ticks)));
  haltEntity(ctx, e.id);
  caster.cast = {
    abilityId,
    targetId: entityId,
    start: ctx.tick,
    end,
    x: e.x,
    y: e.y,
    channel: { every, next: ctx.tick + every, n: 0 },
  };
  ctx.emit('combat.cast', {
    casterId: caster.id,
    abilityId,
    targetId: entityId,
    op: 'start',
    interruptible: interruptibleNow(ctx.world, ctx.content, caster),
    channel: true,
  });
  return true;
}

export function interruptCast(ctx: SystemContext, u: Unit): void {
  if (!u.cast) return;
  const c = u.cast;
  u.cast = null;
  ctx.emit('combat.cast', {
    casterId: u.id,
    abilityId: c.abilityId,
    targetId: c.targetId ?? undefined,
    op: 'interrupted',
  });
  if (c.warned) cancelWarnings(ctx, u.id);
  // an interrupted monster cast or channel goes on cooldown, it does not start over (10.4)
  const def = abilityDef(ctx.content, c.abilityId);
  if ((c.channel || u.monsterId) && def?.cooldown) u.cds[def.id] = ctx.tick + secs(def.cooldown);
}

/** One pulse of a channel: the effects on the target unit (if any), stronger by the ramp. */
function channelPulse(ctx: SystemContext, u: Unit, def: AbilityDef): void {
  const c = u.cast;
  if (!c?.channel) return;
  c.channel.n++;
  c.channel.next += c.channel.every;
  const t = unitOf(ctx.world, c.targetId);
  ctx.emit('combat.channel', {
    casterId: u.id,
    abilityId: def.id,
    ...(c.targetId ? { targetId: c.targetId } : {}),
    n: c.channel.n,
  });
  if (!t || !liveUnit(ctx.world, t.id)) return;
  const mult = 1 + (def.channel?.ramp ?? 0) * (c.channel.n - 1);
  effectsOn(ctx, u, def, t, { mult });
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
  // a warned cast's area is locked: the caster may be moved and the warning still lands
  if (!cast.warned && Math.hypot(e.x - cast.x, e.y - cast.y) > 0.15) {
    interruptCast(ctx, u);
    return;
  }
  const def = abilityDef(ctx.content, cast.abilityId);
  if (cast.channel && def && ctx.tick >= cast.channel.next && ctx.tick < cast.end)
    channelPulse(ctx, u, def);
  if (ctx.tick < cast.end) return;
  if (!def) {
    u.cast = null;
    return;
  }
  if (cast.warned) {
    // the warning lands on its locked cells, whoever stands there now (10.3)
    u.cast = null;
    finishWarned(ctx, u, def, cast.targetId);
    return;
  }
  if (cast.channel) {
    // the last pulse lands with the end of the channel
    if (cast.channel.n < (def.channel?.ticks ?? 0)) channelPulse(ctx, u, def);
    u.cast = null;
    spend(ctx, u, def);
    ctx.emit('combat.cast', {
      casterId: u.id,
      abilityId: def.id,
      ...(cast.targetId ? { targetId: cast.targetId } : {}),
      op: 'finish',
    });
    return;
  }
  u.cast = null;
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

function spend(ctx: SystemContext, u: Unit, def: AbilityDef, cooldown = true): void {
  const d = deriveStats(ctx.world, ctx.content, u);
  const cost = abilityCost(def, d);
  if (def.resource && cost > 0) {
    u.res[def.resource] = Math.max(0, (u.res[def.resource] ?? 0) - cost);
    if (def.resource === 'mana') u.manaSpentAt = ctx.tick;
    crossFeed(ctx.world, u, d, def.resource, cost);
  }
  if (!cooldown || !def.cooldown) return;
  // a door-granted skill takes the door-skill cooldown modifier (a maimed player, 10.2)
  const door = u.abilities.includes(def.id) ? Math.max(0, 1 + d.mods.doorSkillCooldown) : 1;
  u.cds[def.id] = ctx.tick + secs(def.cooldown * door);
}

/** A warned cast finished: its warnings settle, its self effects land once. */
function finishWarned(ctx: SystemContext, u: Unit, def: AbilityDef, targetId: string | null): void {
  spend(ctx, u, def);
  for (const f of def.effects)
    if (f.type === 'aura' && f.to === 'self') applyAura(ctx, u, f.aura, u);
  settleCast(ctx, u, def.id);
  if (isOffensive(def)) markCombat(ctx, u);
  ctx.emit('combat.cast', {
    casterId: u.id,
    abilityId: def.id,
    ...(targetId ? { targetId } : {}),
    op: 'finish',
  });
}

/**
 * The sediment fever (combat 9.4): a mana spell miscasts with the aura's chance, rolled on
 * `combat.proc` only while such an aura is on: the cast is interrupted and its mana lost.
 */
function miscasts(ctx: SystemContext, u: Unit, def: AbilityDef): boolean {
  if (def.resource !== 'mana' || (def.school ?? 'physical') === 'physical') return false;
  const chance = miscastChance(ctx.content, u);
  if (chance <= 0 || (chance < 1 && ctx.rng('combat.proc').next() >= chance)) return false;
  spend(ctx, u, def, false);
  ctx.emit('combat.cast', {
    casterId: u.id,
    abilityId: def.id,
    op: 'interrupted',
    reason: 'miscast',
  });
  return true;
}

/**
 * Effects landing on one target outside the ability's own targeting (a warning settling, a
 * channel pulse): every effect but the self auras, the hit roll skipped on request.
 */
export function effectsOn(
  ctx: SystemContext,
  caster: Unit,
  def: AbilityDef,
  t: Unit,
  opts: EffectOpts = {},
): void {
  const d = deriveStats(ctx.world, ctx.content, caster);
  const enemy = canAttack(ctx.world, caster, t);
  for (const f of def.effects) {
    if (f.type === 'aura' && f.to === 'self') continue;
    if (!liveUnit(ctx.world, t.id) && f.type !== 'aura') continue;
    runEffect(ctx, caster, def, f, t, d, caster.combo, enemy, true, opts);
  }
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
function lands(
  ctx: SystemContext,
  caster: Unit,
  target: Unit,
  school: School,
  def: AbilityDef,
): boolean {
  const r = ctx.rng('combat.hit').next();
  const ok =
    school === 'physical'
      ? r >= meleeMissChance(caster.level, target.level)
      : r < spellHitChance(caster.level, target.level);
  if (!ok) {
    const sd = deriveStats(ctx.world, ctx.content, caster);
    const td = deriveStats(ctx.world, ctx.content, target);
    const kind = school !== 'physical' ? 'spell' : (def.range ?? 0) > 2 ? 'ranged' : 'melee';
    ctx.emit('combat.damage', {
      sourceId: caster.id,
      targetId: target.id,
      abilityId: def.id,
      amount: 0,
      absorbed: 0,
      school,
      outcome: school === 'physical' ? 'miss' : 'resist',
      ...hitPresentation(ctx.world, ctx.content, caster, sd, target, td, kind, def.id),
    });
  }
  engage(ctx, target, caster);
  addThreat(ctx, target, caster.id, 10);
  return ok;
}

function execute(ctx: SystemContext, caster: Unit, def: AbilityDef, target: Unit): void {
  if (miscasts(ctx, caster, def)) return;
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
      landed = lands(ctx, caster, t, school, def);
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
  opts: EffectOpts = {},
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
      amount *= opts.mult ?? 1;
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
        noRoll: opts.noRoll,
      });
      if (r.dealt > 0 || !MISSED.has(r.outcome) || shieldImmune(ctx, t)) {
        abilityHitShield(ctx, t, def.id, caster);
        injureOnHit(ctx, caster, def, t);
      }
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
      // the desperate heal restores the share its caster's data names (11 `desperateHeal`)
      const pct = def.id === DESPERATE_HEAL ? desperatePct(ctx, caster, f.pct) : f.pct;
      healUnit(ctx, caster, t, max * pct, { abilityId: def.id, canCrit: false });
      return;
    }
    case 'aura':
      if (enemy && !landed) return;
      // a debuff that lands is a hit of its ability: a shield it names breaks (10.4
      // `breakBy: ability`; Yeyu's ravens on the colossus's ash shell, PK-M1-21)
      if (enemy) abilityHitShield(ctx, t, def.id, caster);
      applyAura(ctx, t, f.aura, caster, {
        powerMult: f.perComboMult ? 1 + f.perComboMult * Math.max(0, combo - 1) : 1,
        school: def.school ?? 'physical',
        abilityDr: def.dr,
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
      if (enemy && t.cast && interruptibleNow(ctx.world, ctx.content, t)) {
        interruptCast(ctx, t);
        // the school lockout is part of the interrupt: bosses take it, the ladders skip it
        applyAura(ctx, t, 'aur_mon_schoollock', caster, {
          durationTicks: secs(f.lockout),
          lockout: true,
        });
      }
      return;
    case 'dispel':
      dispel(ctx, t, f.kind, f.count ?? 1, f.types);
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
    case 'purify':
      if (enemy) purifyHit(ctx, caster, t);
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
  // great-dungeon and surge bosses shrug off forced movement (9.3)
  if (immuneToForcedMove(ctx.content, who)) return;
  const a = getEntity(ctx.world, from.id);
  const b = getEntity(ctx.world, who.id);
  // the live map: a knockback stops at a closed switch tile area
  const map = b ? walkMap(ctx, b.mapId) : undefined;
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
