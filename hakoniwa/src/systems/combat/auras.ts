// Auras: buffs, debuffs, crowd control, shields and passives. One instance per aura id
// on a unit (per applier for `perSource` periodic effects, 8.2); reapplying refreshes the
// duration and adds a stack up to maxStacks. A control aura goes through control.ts first
// (immunity, the diminishing-returns ladder, the rank factor and duration modifiers, 9.2
// and 9.3); a refused one is reported as `resisted`. Dispels take the newest first (9.5);
// damage breaks incapacitation and may break fear (9.7). Periodic effects and pulses tick
// in aura_tick.ts.

import type { SystemContext } from '../../core/system';
import { haltEntity } from '../world';
import { controlKind, resolveControl } from './control';
import { auraDef, scaled, secs } from './defs';
import { fearBreakChance } from './formulas';
import { deriveStats } from './stats';
import type { Aura, AuraDef, CcKind, DispelType, DrCategory, School, Unit } from './types';
import { clampPools, syncSpeed } from './units';

const HARD_CC: ReadonlySet<CcKind> = new Set<CcKind>(['stun', 'fear', 'incapacitate', 'root']);

export function hasAura(u: Unit, id: string): boolean {
  return u.auras.some((a) => a.id === id);
}

export function auraOn(u: Unit, id: string): Aura | undefined {
  return u.auras.find((a) => a.id === id);
}

export interface ApplyOpts {
  /** multiplies periodic power, absorbs and thorns (combo finishers) */
  powerMult?: number;
  origin?: string;
  permanent?: boolean;
  /** overrides the content duration */
  durationTicks?: number;
  /** school of the ability behind a control (the axis factor, 3.7) */
  school?: School;
  /** the ladder an ability names for its control (9.2) */
  abilityDr?: DrCategory;
  /** a control outside the ladders (interrupt lockouts, 9.2) */
  noDr?: boolean;
  /** a state the system applies at its stated length (presence, 3.5): no rank factor */
  noRankScale?: boolean;
  /** set the stack count instead of adding one (levels of one state, 3.5) */
  stacks?: number;
  /** strength of the instance's slow and modifiers (a resisted field, 3.5) */
  scale?: number;
  /**
   * The school lockout of an interrupt (9.1, 9.3): it lands on bosses too and outside the
   * ladders (an interrupt is not a control a boss is immune to).
   */
  lockout?: boolean;
  /** no `resisted` event when the control part is refused (a field refreshed every second) */
  silent?: boolean;
  /**
   * A state, not a control (10.4: a boss's stagger from terrain or a broken shield): it lands
   * through every immunity and outside the ladders, like a lockout.
   */
  state?: boolean;
  /** the periodic amount per tick, the absorb and the thorns, as given (registry affixes, 11) */
  power?: number;
  absorb?: number;
  thorns?: number;
}

/** Whether an aura does anything besides its slow (a slow-immune target keeps the rest). */
function beyondSlow(def: AuraDef): boolean {
  return (
    !!def.periodic ||
    !!def.pulse ||
    !!def.absorb ||
    !!def.thorns ||
    !!def.stats ||
    !!def.statsPerLevel ||
    !!def.mods ||
    !!def.byStacks?.some((e) => !!e.mods)
  );
}

function nextSeq(ctx: SystemContext): number {
  const slice = ctx.world.slices.combat;
  slice.auraSeq = (slice.auraSeq ?? 0) + 1;
  return slice.auraSeq;
}

/** Apply or refresh an aura. Returns false when the aura is unknown, refused or resisted. */
export function applyAura(
  ctx: SystemContext,
  target: Unit,
  auraId: string,
  source: Unit | null,
  opts: ApplyOpts = {},
): boolean {
  const def = auraDef(ctx.content, auraId);
  if (!def) return false;
  if (def.kind === 'debuff' && (target.ai?.state === 'evade' || target.ai?.state === 'yielded')) {
    return false;
  }
  const src = source ?? target;
  const permanent = opts.permanent || def.duration <= 0;
  let durationTicks = opts.durationTicks !== undefined ? opts.durationTicks : secs(def.duration);
  const kind = controlKind(def);
  // a control goes through immunity and the ladders, also one a unit lays on itself
  let ccOff = false;
  let drLanded = 0;
  if (kind && !opts.lockout && !opts.state && (src !== target || def.kind === 'debuff')) {
    const sd0 = deriveStats(ctx.world, ctx.content, src);
    const td0 = deriveStats(ctx.world, ctx.content, target);
    const verdict = resolveControl(ctx.world, ctx.content, def, target, src, {
      baseTicks: durationTicks,
      modSum: sd0.mods.ccDurationDone + td0.mods.ccDurationTaken,
      school: opts.school,
      abilityDr: opts.abilityDr,
      noDr: opts.noDr,
      noRankScale: opts.noRankScale,
    });
    if (!verdict.ok) {
      if (!opts.silent)
        ctx.emit('combat.aura', {
          targetId: target.id,
          auraId,
          sourceId: src.id,
          op: 'resisted',
          stacks: 0,
          reason: verdict.reason,
        });
      // a slow is one part of its aura: a slow-immune target takes the rest (the cold of a
      // blizzard still bites)
      if (kind === 'slow' && verdict.reason === 'immune' && beyondSlow(def)) ccOff = true;
      else return false;
    } else {
      if (!permanent && kind !== 'slow') durationTicks = verdict.ticks;
      drLanded = verdict.stage;
    }
  }
  const lvl = src.level;
  const sd = deriveStats(ctx.world, ctx.content, src);
  const school = def.periodic?.school ?? def.pulse?.school ?? 'physical';
  const powerStat = school === 'physical' ? sd.stats.ap : sd.stats.sp;
  const mult = opts.powerMult ?? 1;
  const expires = permanent ? 0 : ctx.tick + durationTicks;
  let power: number | undefined;
  if (def.periodic) {
    const amt = def.periodic.damage
      ? scaled(def.periodic.damage, lvl, powerStat) * (1 + sd.mods.damageDealt)
      : scaled(def.periodic.heal, lvl, sd.stats.sp) * (1 + sd.mods.healingDone);
    power = Math.max(1, amt * mult);
  } else if (def.pulse) {
    power = Math.max(
      1,
      scaled(def.pulse.damage, lvl, powerStat) * (1 + sd.mods.damageDealt) * mult,
    );
  }
  if (opts.power !== undefined && power !== undefined) power = Math.max(1, opts.power);
  const absorb =
    opts.absorb !== undefined
      ? Math.max(1, Math.round(opts.absorb))
      : def.absorb
        ? Math.round(scaled(def.absorb, lvl, sd.stats.sp) * mult)
        : undefined;
  const thorns =
    opts.thorns !== undefined
      ? Math.max(1, opts.thorns)
      : def.thorns
        ? Math.max(1, scaled(def.thorns, lvl, 0) * mult)
        : undefined;
  const every = def.periodic?.every ?? def.pulse?.every;
  const perSource = !!def.perSource && !!def.periodic;
  const existing = target.auras.find(
    (a) => a.id === auraId && (!perSource || a.sourceId === src.id),
  );
  const maxStacks = def.maxStacks ?? 1;
  if (existing) {
    existing.expires = expires;
    existing.stacks =
      opts.stacks !== undefined
        ? Math.max(1, Math.min(maxStacks, opts.stacks))
        : Math.min(maxStacks, existing.stacks + 1);
    existing.sourceId = src.id;
    existing.lvl = lvl;
    existing.seq = nextSeq(ctx);
    if (opts.scale !== undefined && opts.scale !== 1) existing.scale = opts.scale;
    else delete existing.scale;
    if (opts.origin) existing.origin = opts.origin;
    if (ccOff) existing.ccOff = true;
    else delete existing.ccOff;
    if (drLanded > 0) existing.dr = drLanded;
    else delete existing.dr;
    if (power !== undefined) existing.power = power;
    if (absorb !== undefined) existing.absorb = absorb;
    if (thorns !== undefined) existing.thorns = thorns;
    ctx.emit('combat.aura', {
      targetId: target.id,
      auraId,
      sourceId: src.id,
      op: 'refreshed',
      stacks: existing.stacks,
    });
  } else {
    const stacks = opts.stacks !== undefined ? Math.max(1, Math.min(maxStacks, opts.stacks)) : 1;
    const a: Aura = { id: auraId, sourceId: src.id, expires, stacks, lvl, seq: nextSeq(ctx) };
    if (every) a.next = ctx.tick + secs(every);
    if (power !== undefined) a.power = power;
    if (absorb !== undefined) a.absorb = absorb;
    if (thorns !== undefined) a.thorns = thorns;
    if (opts.origin) a.origin = opts.origin;
    if (opts.scale !== undefined && opts.scale !== 1) a.scale = opts.scale;
    if (ccOff) a.ccOff = true;
    if (drLanded > 0) a.dr = drLanded;
    target.auras.push(a);
    ctx.emit('combat.aura', {
      targetId: target.id,
      auraId,
      sourceId: src.id,
      op: 'applied',
      stacks,
    });
  }
  if (def.cc && HARD_CC.has(def.cc) && !ccOff) {
    haltEntity(ctx, target.id);
    if (def.cc !== 'root') target.cast = null;
  }
  afterChange(ctx, target);
  return true;
}

function afterChange(ctx: SystemContext, u: Unit): void {
  syncSpeed(ctx, u);
  clampPools(ctx.world, ctx.content, u);
}

/** Remove auras matching a predicate; emits a removal event for each. */
export function removeAurasWhere(
  ctx: SystemContext,
  u: Unit,
  pred: (a: Aura, def: AuraDef | undefined) => boolean,
): number {
  const keep: Aura[] = [];
  const gone: Aura[] = [];
  for (const a of u.auras) {
    if (pred(a, auraDef(ctx.content, a.id))) gone.push(a);
    else keep.push(a);
  }
  if (gone.length === 0) return 0;
  u.auras = keep;
  for (const a of gone) {
    ctx.emit('combat.aura', {
      targetId: u.id,
      auraId: a.id,
      sourceId: a.sourceId,
      op: 'removed',
      stacks: 0,
    });
  }
  afterChange(ctx, u);
  return gone.length;
}

export function removeAura(ctx: SystemContext, u: Unit, auraId: string): boolean {
  return removeAurasWhere(ctx, u, (a) => a.id === auraId) > 0;
}

/** Drop expired auras (per tick). */
export function expireAuras(ctx: SystemContext, u: Unit): void {
  if (u.auras.length === 0) return;
  if (!u.auras.some((a) => a.expires > 0 && a.expires <= ctx.tick)) return;
  removeAurasWhere(ctx, u, (a) => a.expires > 0 && a.expires <= ctx.tick);
}

/**
 * Damage on a unit (9.7): it wakes the sleeper and breaks every incapacitation and every
 * aura marked break-on-damage; each fear breaks with chance damage / (0.1 x max health),
 * rolled on the `combat.proc` stream only while a fear is on the unit.
 */
export function breakOnDamage(ctx: SystemContext, u: Unit, dealt = 1): void {
  if (u.auras.length === 0 || dealt <= 0) return;
  let fearDefs = 0;
  let breaks = 0;
  for (const a of u.auras) {
    const def = auraDef(ctx.content, a.id);
    if (!def) continue;
    if (def.breakOnDamage || def.cc === 'incapacitate') breaks++;
    else if (def.cc === 'fear') fearDefs++;
  }
  if (breaks > 0)
    removeAurasWhere(
      ctx,
      u,
      (_a, def) => !!def && (!!def.breakOnDamage || def.cc === 'incapacitate'),
    );
  if (fearDefs === 0) return;
  const max = deriveStats(ctx.world, ctx.content, u).maxHp;
  const gone = new Set<string>();
  for (const a of [...u.auras].sort(
    (x, y) => (x.seq ?? 0) - (y.seq ?? 0) || x.id.localeCompare(y.id),
  )) {
    const def = auraDef(ctx.content, a.id);
    if (def?.cc !== 'fear') continue;
    const chance = fearBreakChance(dealt, max, def.breakChanceScale ?? 0.1);
    if (chance >= 1 || ctx.rng('combat.proc').next() < chance) gone.add(`${a.id}>${a.sourceId}`);
  }
  if (gone.size > 0) removeAurasWhere(ctx, u, (a) => gone.has(`${a.id}>${a.sourceId}`));
}

/** Soak damage with absorb shields (oldest first). Returns the absorbed amount. */
export function soakAbsorb(ctx: SystemContext, u: Unit, amount: number): number {
  let left = amount;
  let absorbed = 0;
  let emptied = false;
  for (const a of u.auras) {
    if (left <= 0) break;
    if (!a.absorb || a.absorb <= 0) continue;
    const take = Math.min(a.absorb, left);
    a.absorb -= take;
    left -= take;
    absorbed += take;
    if (a.absorb <= 0) emptied = true;
  }
  if (emptied) removeAurasWhere(ctx, u, (a) => a.absorb !== undefined && a.absorb <= 0);
  return absorbed;
}

/**
 * Remove up to `count` auras of a kind, the most recently applied first (9.5; the same
 * board gives the same result, no dice). With `types` only auras of those dispel
 * categories go; without, every timed aura not marked undispellable (the older data).
 */
export function dispel(
  ctx: SystemContext,
  u: Unit,
  kind: 'buff' | 'debuff',
  count: number,
  types?: readonly DispelType[],
): number {
  const order = u.auras
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (y.a.seq ?? y.i) - (x.a.seq ?? x.i) || y.i - x.i);
  const take = new Set<Aura>();
  for (const { a } of order) {
    if (take.size >= count) break;
    const def = auraDef(ctx.content, a.id);
    if (!def || def.kind !== kind || a.expires === 0) continue;
    if (types) {
      if (!def.dispelType || !types.includes(def.dispelType)) continue;
    } else if (def.dispellable === false) continue;
    take.add(a);
  }
  if (take.size === 0) return 0;
  return removeAurasWhere(ctx, u, (a) => take.has(a));
}

/** Remove every aura granted by an origin (closing a door). */
export function removeByOrigin(ctx: SystemContext, u: Unit, origin: string): number {
  return removeAurasWhere(ctx, u, (a) => a.origin === origin);
}
