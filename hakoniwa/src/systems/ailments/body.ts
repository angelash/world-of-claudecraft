// The body side of the ailments system: the hourly exposure sample, the dawn check, the
// state auras, the injuries and the player's flag mirrors (progression_and_pacing.md 9, 10;
// combat_and_classes.md 9.4). Sickness and injury auras are permanent passives keyed by an
// origin of this system, so a death (which drops only timed auras) keeps them and a cure
// takes exactly them off. The player's taint shows on `player.taint` (rounded down); the
// doors turn its rises into blockage (thousand_doors.md 6.2), and the player's
// crystallisation adds blockage directly through the doors' blockage port (9.4).

import type { SystemContext } from '../../core/system';
import { calendarAt, TICKS_PER_GAME_DAY } from '../../core/time';
import type { World } from '../../core/world';
import { addPassive, removePassives, unitOf } from '../combat';
import { addBlockage } from '../doors/costs';
import { equippedDefs, sedResist } from '../inventory';
import { getEntity, mapById, sedimentAt, tagValue } from '../world';
import {
  bodyAuraStage,
  type CureSpec,
  clampTaint,
  crystalBlockage,
  cureBody,
  cureSteps,
  stageDef,
  stepBody,
} from './formulas';
import { ailmentsSlice, bodyOf, isIdle, readAilments } from './slice';
import {
  type AilmentsConfig,
  INJURY_KINDS,
  type InjuryDef,
  type InjuryKind,
  type PlayerInjury,
  type SedStage,
  type Sufferer,
  WEAR_GRADES,
  type WearGrade,
} from './types';

/** The random stream of the dawn check (progression_and_pacing.md 9.2). */
export const SED_STREAM = 'sed.daily';
/** The random stream of the injuries (the relapse with a backlash, 10.1). */
export const INJURY_STREAM = 'sed.injury';
/** The player's mirrors (world_state_registry.md 8.1). */
export const TAINT_FLAG = 'player.taint';
export const STAGE_FLAG = 'player.sed_stage';
export const INJURY_FLAG = 'player.injury';
/** Aura origins of this system on a unit. */
const SED_ORIGIN = 'ailments.sed';
const injuryOrigin = (kind: InjuryKind) => `ailments.injury.${kind}`;

export function ailmentsConfig(ctx: { content: { ailmentsConfig?: AilmentsConfig } }) {
  return ctx.content.ailmentsConfig;
}

function playerId(world: World): string {
  return world.slices.world.playerId;
}

function today(ctx: SystemContext): number {
  return calendarAt(ctx.tick).dayIndex;
}

// ---------------------------------------------------------------------------
// reads

/** A body's taint (0 when it has none). */
export function taintOf(world: { slices: object }, entityId: string): number {
  return readAilments(world)?.bodies[entityId]?.taint ?? 0;
}

/** A body's sickness stage. */
export function stageOf(world: { slices: object }, entityId: string): SedStage {
  return readAilments(world)?.bodies[entityId]?.stage ?? 'none';
}

/** The injuries a body carries. */
export function injuriesOf(world: { slices: object }, entityId: string): InjuryKind[] {
  return (readAilments(world)?.bodies[entityId]?.injuries ?? []).map((i) => i.kind);
}

function injuryDef(cfg: AilmentsConfig, kind: InjuryKind): InjuryDef | undefined {
  return cfg.injuries.find((d) => d.id === kind);
}

/** The value `player.injury` shows for a set of injuries: a limb above a minor wound. */
export function playerInjuryValue(cfg: AilmentsConfig, kinds: readonly InjuryKind[]): PlayerInjury {
  let out: PlayerInjury = 'none';
  for (const k of kinds) {
    const v = injuryDef(cfg, k)?.player;
    if (v === 'limb') return 'limb';
    if (v === 'minor') out = 'minor';
  }
  return out;
}

/**
 * What the body wears that touches its taint (catalog_equipment.md 1.5, 2.6): the grades of
 * its unpurified patterned pieces, and the best resistance of its purified ones (the
 * inventory's `sedResist`). The inventory hands the pieces with their instance grain
 * already applied (`sed.grade`, `sed.purified`), so grain that grows on a worn piece counts.
 */
export function wornPattern(
  world: World,
  content: SystemContext['content'],
  id: string,
): { worn: WearGrade[]; resist: number } {
  const out = { worn: [] as WearGrade[], resist: 0 };
  if (!world.slices.inventory || !content.items) return out;
  for (const def of equippedDefs(world, content, id)) {
    const sed = (def as { sed?: { grade?: unknown; purified?: unknown } }).sed;
    const grade = sed?.grade as WearGrade;
    if (!sed || !WEAR_GRADES.includes(grade)) continue;
    if (sed.purified === true) out.resist = Math.max(out.resist, sedResist(def));
    else out.worn.push(grade);
  }
  return out;
}

// ---------------------------------------------------------------------------
// mirrors and auras

/** Write the player's mirrors when they changed (never writes a default that was unset). */
function mirrorPlayer(ctx: SystemContext, cfg: AilmentsConfig, body: Sufferer): void {
  const taint = Math.floor(body.taint);
  const t = ctx.flag(TAINT_FLAG);
  if ((typeof t === 'number' ? t : 0) !== taint) ctx.setFlag(TAINT_FLAG, taint);
  const s = ctx.flag(STAGE_FLAG);
  if ((s ?? 'none') !== body.stage) ctx.setFlag(STAGE_FLAG, body.stage);
  const inj = playerInjuryValue(
    cfg,
    body.injuries.map((i) => i.kind),
  );
  const f = ctx.flag(INJURY_FLAG);
  if ((f ?? 'none') !== inj) ctx.setFlag(INJURY_FLAG, inj);
}

function mirror(ctx: SystemContext, cfg: AilmentsConfig, id: string, body: Sufferer): void {
  if (id === playerId(ctx.world)) mirrorPlayer(ctx, cfg, body);
}

/** The sickness aura the body should wear, if any. */
function sedAura(cfg: AilmentsConfig, id: string, ctx: SystemContext, stage: SedStage) {
  const shown = bodyAuraStage(cfg, stage, id === playerId(ctx.world));
  return shown === 'none' ? undefined : stageDef(cfg, shown)?.aura;
}

/** Put the body's sickness aura on (and any other one off). */
function setSedAura(ctx: SystemContext, cfg: AilmentsConfig, id: string, stage: SedStage): void {
  removePassives(ctx, id, SED_ORIGIN);
  const aura = sedAura(cfg, id, ctx, stage);
  if (aura) addPassive(ctx, id, aura, SED_ORIGIN);
}

/** Put back a state aura the unit lost (a unit made anew); no change when it is there. */
function ensureAuras(ctx: SystemContext, cfg: AilmentsConfig, id: string, body: Sufferer): void {
  const unit = unitOf(ctx.world, id);
  if (!unit) return;
  const aura = sedAura(cfg, id, ctx, body.stage);
  if (aura && !unit.auras.some((a) => a.id === aura)) addPassive(ctx, id, aura, SED_ORIGIN);
  for (const inj of body.injuries) {
    const def = injuryDef(cfg, inj.kind);
    if (def && !unit.auras.some((a) => a.id === def.aura))
      addPassive(ctx, id, def.aura, injuryOrigin(inj.kind));
  }
}

// ---------------------------------------------------------------------------
// the clock

/** One hour went by: every body on a map spends it at the sediment where it stands. */
export function sampleHour(ctx: SystemContext): void {
  const cfg = ailmentsConfig(ctx);
  if (!cfg) return;
  const pid = playerId(ctx.world);
  if (pid && getEntity(ctx.world, pid)) bodyOf(ctx.world, pid);
  const s = ailmentsSlice(ctx.world);
  for (const id of Object.keys(s.bodies).sort()) {
    const e = getEntity(ctx.world, id);
    const body = s.bodies[id];
    // the dead spend no hours in the world (the player is in the corridor until remade)
    if (!e || !e.alive || !body) continue;
    const map = mapById(ctx.content, e.mapId);
    const g = map ? sedimentAt(map, e.x, e.y) : 0;
    body.hours[g] = (body.hours[g] ?? 0) + 1;
  }
}

/** Injuries whose time ran out heal (checked every hour). */
export function settleInjuries(ctx: SystemContext): void {
  const cfg = ailmentsConfig(ctx);
  const s = readAilments(ctx.world);
  if (!cfg || !s) return;
  for (const id of Object.keys(s.bodies).sort()) {
    const body = s.bodies[id] as Sufferer;
    const due = body.injuries.filter((i) => i.until > 0 && ctx.tick >= i.until);
    for (const inj of due) healInjury(ctx, id, inj.kind);
  }
}

/**
 * The dawn check (9.2): once per game day at the check hour, for every body in the slice,
 * in id order. A body other than the player's that is down or dead rolls nothing that day;
 * healthy bodies other than the player's, and those whose entity is gone, are dropped.
 */
export function dawnCheck(ctx: SystemContext): void {
  const cfg = ailmentsConfig(ctx);
  if (!cfg) return;
  const s = ailmentsSlice(ctx.world);
  const day = today(ctx);
  if (s.checked === day) return;
  s.checked = day;
  const pid = playerId(ctx.world);
  for (const id of Object.keys(s.bodies).sort()) {
    const body = s.bodies[id] as Sufferer;
    const e = getEntity(ctx.world, id);
    if (id !== pid && !e) {
      delete s.bodies[id];
      continue;
    }
    if (id !== pid && !e?.alive) continue;
    const tier = Number(e ? (tagValue(e, 'tier') ?? 0) : 0);
    const frail = !!e && e.tags.some((t) => cfg.frail.tags.includes(t));
    const { worn, resist } = wornPattern(ctx.world, ctx.content, id);
    const result = stepBody(cfg, body, { day, worn, resist, tier, frail }, () =>
      ctx.rng(SED_STREAM).next(),
    );
    if (result.stage !== result.from) {
      setSedAura(ctx, cfg, id, body.stage);
      ctx.emit('ailments.stage', {
        entityId: id,
        stage: body.stage,
        from: result.from,
        cause: result.onset ? 'onset' : 'self_heal',
      });
    }
    ensureAuras(ctx, cfg, id, body);
    if (id === pid) {
      const blockage = crystalBlockage(cfg, result);
      if (blockage > 0) addBlockage(ctx, blockage);
    } else if (body.stage === 'crystal' && day - body.since === cfg.crystalDays) {
      // a mortal's or a companion's end is due (9.3); its owner (npc, party) settles it
      ctx.emit('ailments.crystal_due', { entityId: id, days: cfg.crystalDays });
    }
    mirror(ctx, cfg, id, body);
    ctx.emit('ailments.daily', {
      entityId: id,
      taint: body.taint,
      delta: result.delta,
      stage: body.stage,
    });
    // a healthy body is not tracked any more (the player's stays)
    if (id !== pid && isIdle(body)) delete s.bodies[id];
  }
}

// ---------------------------------------------------------------------------
// ports (other systems, scripts and items)

/** Add taint to a body (a negative amount takes it away); returns the new taint. */
export function addTaint(ctx: SystemContext, entityId: string, amount: number): number {
  const cfg = ailmentsConfig(ctx);
  if (!cfg || !Number.isFinite(amount) || !getEntity(ctx.world, entityId)) return 0;
  const body = bodyOf(ctx.world, entityId);
  body.taint = clampTaint(cfg, body.taint + amount);
  mirror(ctx, cfg, entityId, body);
  return body.taint;
}

/** Bring a body's sickness down by `stages` (a cure, consumables 3.6); false when not sick. */
export function cureStage(ctx: SystemContext, entityId: string, stages = 1): boolean {
  const cfg = ailmentsConfig(ctx);
  const body = readAilments(ctx.world)?.bodies[entityId];
  if (!cfg || !body || body.stage === 'none' || !(stages >= 1)) return false;
  const from = cureBody(body, stages, today(ctx));
  setSedAura(ctx, cfg, entityId, body.stage);
  ctx.emit('ailments.stage', { entityId, stage: body.stage, from, cause: 'cure' });
  mirror(ctx, cfg, entityId, body);
  return true;
}

/**
 * A consumable was used (catalog_consumables_magitools.md 2.4, 2.9, 3.6): the item's
 * `use.taint` goes on whatever its effect (a crystal potion's dose, a tainted meal); the
 * `taint` effect adds its amount; the `sed_cure` effect adds its amount (the taint column)
 * and treats the stages its `use.sed` names. The item fields are read from its definition.
 * A cure taken before its group's timer ran out (`early`) does nothing but poison a little:
 * `earlyTaint` and no more (the first stage of 药毒, catalog 2.1 `cd_sed`).
 */
export function itemUsed(
  ctx: SystemContext,
  d: {
    ownerId: string;
    targetId?: string;
    itemId: string;
    effect: string;
    amount?: number;
    early?: boolean;
    sedTier?: 1 | 2 | 3;
  },
): void {
  const cfg = ailmentsConfig(ctx);
  const id = d.targetId ?? d.ownerId;
  if (!cfg || !getEntity(ctx.world, id)) return;
  if (d.early) {
    addTaint(ctx, id, cfg.earlyTaint);
    return;
  }
  const use = (ctx.content.items ?? []).find((i) => i.id === d.itemId)?.use as
    | { taint?: unknown; sed?: CureSpec }
    | undefined;
  if (typeof use?.taint === 'number') addTaint(ctx, id, use.taint);
  // a portion from a tainted stack: light +1, mid +3, heavy +8 (catalog 2.4)
  if (d.sedTier) addTaint(ctx, id, cfg.portionTaint?.[d.sedTier - 1] ?? 0);
  if (d.effect === 'taint') addTaint(ctx, id, d.amount ?? 0);
  else if (d.effect === 'sed_cure') {
    if (d.amount) addTaint(ctx, id, d.amount);
    const stage = readAilments(ctx.world)?.bodies[id]?.stage ?? 'none';
    const steps = cureSteps(use?.sed, stage);
    if (steps > 0) cureStage(ctx, id, steps);
  }
}

/**
 * The injuries a body may carry: the player only the light wound and the maimed limbs
 * (progression_and_pacing.md 10.2), anyone else all of them.
 */
export function injuryAllowed(ctx: SystemContext, entityId: string, kind: InjuryKind): boolean {
  const cfg = ailmentsConfig(ctx);
  const def = cfg && injuryDef(cfg, kind);
  if (!def) return false;
  return entityId !== playerId(ctx.world) || def.player !== undefined;
}

/**
 * Give a body an injury (10.1): its aura goes on and it lasts its data days (or `days`; 0
 * until treated). The same kind again restarts the longer of the two clocks.
 */
export function injure(
  ctx: SystemContext,
  entityId: string,
  kind: InjuryKind,
  days?: number,
): boolean {
  const cfg = ailmentsConfig(ctx);
  const def = cfg && injuryDef(cfg, kind);
  if (!cfg || !def || !getEntity(ctx.world, entityId)) return false;
  if (!injuryAllowed(ctx, entityId, kind)) return false;
  const length = days ?? def.days;
  const until = length > 0 ? ctx.tick + Math.round(length * TICKS_PER_GAME_DAY) : 0;
  const body = bodyOf(ctx.world, entityId);
  const held = body.injuries.find((i) => i.kind === kind);
  if (held) {
    held.until = held.until === 0 || until === 0 ? 0 : Math.max(held.until, until);
  } else {
    body.injuries.push({ kind, since: ctx.tick, until });
    body.injuries.sort((a, b) => INJURY_KINDS.indexOf(a.kind) - INJURY_KINDS.indexOf(b.kind));
    addPassive(ctx, entityId, def.aura, injuryOrigin(kind));
    ctx.emit('ailments.injury', { entityId, kind, op: 'added' });
    // a tempering backlash breaks an old wound open three times in ten (10.1)
    if (kind === 'backlash' && ctx.rng(INJURY_STREAM).chance(cfg.relapseChance))
      injure(ctx, entityId, 'relapse');
  }
  mirror(ctx, cfg, entityId, body);
  return true;
}

/** Heal one kind of injury, or all of them (a death the player is remade from, 10.2). */
export function healInjury(ctx: SystemContext, entityId: string, kind?: InjuryKind): number {
  const cfg = ailmentsConfig(ctx);
  const body = readAilments(ctx.world)?.bodies[entityId];
  if (!cfg || !body) return 0;
  const gone = body.injuries.filter((i) => kind === undefined || i.kind === kind);
  if (gone.length === 0) return 0;
  body.injuries = body.injuries.filter((i) => !gone.includes(i));
  for (const inj of gone) {
    removePassives(ctx, entityId, injuryOrigin(inj.kind));
    ctx.emit('ailments.injury', { entityId, kind: inj.kind, op: 'healed' });
  }
  mirror(ctx, cfg, entityId, body);
  return gone.length;
}

/**
 * Someone wrote `player.taint` (a script, a debug command): the body takes the written
 * value, unless it is what the mirror already shows.
 */
export function taintFlagWritten(ctx: SystemContext, value: unknown): void {
  const cfg = ailmentsConfig(ctx);
  const pid = playerId(ctx.world);
  if (!cfg || !pid || typeof value !== 'number' || !Number.isFinite(value)) return;
  // a change event a later write of the same tick has overtaken is stale
  if (ctx.flag(TAINT_FLAG) !== value) return;
  const body = bodyOf(ctx.world, pid);
  if (Math.floor(body.taint) === value) return;
  body.taint = clampTaint(cfg, value);
}
