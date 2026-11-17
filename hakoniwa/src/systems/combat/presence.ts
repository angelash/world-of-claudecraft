// Presence fields (威压, combat_and_classes.md 3.5; power_system.md 3.5). Every unit presses
// on lower ranks of other sides within its presence radius (data `presence`, 6 tiles when
// unwritten): one rank below is uneasy (cast and swing interval +5%), two ranks below are
// pressed (speed -15%, interval +10%), three ranks below are struck senseless for 3 seconds
// on first entering the field and pressed after, four or more for 5 seconds and pressed
// harder after (speed -25%, interval +15%). The first-entry stun fires once per encounter
// whoever bears it: it re-arms once the victim is out of every field and out of combat. The
// victim's presence resistance (companions at its side, will, drink; capped at 0.6) shrinks
// every field effect and the stun. A veiled bearer (the restraint door) radiates nothing.
// Emits combat.presence_felt for the player and companions from two ranks of difference
// (the Tide-sight door's key), at most once per 30 seconds per bearer.

import type { SystemContext } from '../../core/system';
import { getEntity, haltEntity } from '../world';
import type { Entity } from '../world/types';
import { applyAura } from './auras';
import { auraDef, secs } from './defs';
import { PRESENCE_RESIST_CAP } from './formulas';
import { type Derived, deriveStats } from './stats';
import type { Unit } from './types';
import { inCombat, isPartySide, liveUnit } from './units';

const REARM = secs(30);
/** Presence radius of a unit whose data names none (2.2). */
export const DEFAULT_PRESENCE = 6;
/** A companion of the same side within this many tiles steadies a unit (3.5). */
const COMPANION_RADIUS = 6;
const COMPANION_RESIST = 0.25;
/** Will resists up to this much: spirit / (20 x level) (3.5). */
const WILL_CAP = 0.15;

/** The state auras of the field (catalog_abilities_talents.md 7.2). */
const UNEASE = 'aur_st_presence_unease';
const PRESSURE = 'aur_st_presence_pressure';
const PARALYSIS = 'aur_st_presence_paralysis';
/** The field state lingers this long after its last refresh (the field ticks every second). */
const FIELD_TICKS = secs(2);

function companionNear(ctx: SystemContext, u: Unit, e: Entity): boolean {
  for (const other of Object.values(ctx.world.slices.combat.units)) {
    if (other === u || other.side !== u.side || other.side === 'neutral') continue;
    const oe = getEntity(ctx.world, other.id);
    if (!oe?.alive || oe.hidden || other.downed || oe.mapId !== e.mapId) continue;
    if (Math.hypot(oe.x - e.x, oe.y - e.y) <= COMPANION_RADIUS) return true;
  }
  return false;
}

/**
 * A unit's presence resistance (3.5): 0.25 with a living unit of its side within 6 tiles,
 * will up to 0.15 (spirit / (20 x level)), and auras that carry one (drink up to 0.15);
 * the sum is capped at 0.6.
 */
export function presenceResistOf(ctx: SystemContext, u: Unit, d?: Derived): number {
  const e = getEntity(ctx.world, u.id);
  if (!e) return 0;
  const stats = d ?? deriveStats(ctx.world, ctx.content, u);
  let r = companionNear(ctx, u, e) ? COMPANION_RESIST : 0;
  r += Math.min(WILL_CAP, Math.max(0, stats.stats.spi) / (20 * Math.max(1, u.level)));
  for (const a of u.auras) {
    const pr = auraDef(ctx.content, a.id)?.presenceResist;
    if (pr) r += Math.min(pr.max, pr.perStack * a.stacks);
  }
  return Math.min(PRESENCE_RESIST_CAP, r);
}

/** The radius a unit's presence reaches, or 0 when it radiates none. */
export function presenceRadius(u: Unit): number {
  if (u.presenceMode === 'veiled') return 0;
  return u.presence ?? DEFAULT_PRESENCE;
}

interface Body {
  u: Unit;
  e: Entity;
}

/** Live units on the maps where the player or a companion stands, by map. */
function bodiesByMap(ctx: SystemContext): Map<string, Body[]> {
  const maps = new Set<string>();
  for (const e of Object.values(ctx.world.slices.world.entities)) {
    if (e.kind === 'player' || e.kind === 'companion') maps.add(e.mapId);
  }
  const out = new Map<string, Body[]>();
  for (const id of Object.keys(ctx.world.slices.combat.units).sort()) {
    const pair = liveUnit(ctx.world, id);
    if (!pair || !maps.has(pair[1].mapId)) continue;
    const list = out.get(pair[1].mapId) ?? [];
    list.push({ u: pair[0], e: pair[1] });
    out.set(pair[1].mapId, list);
  }
  return out;
}

/** One presence pass (once a second, and once per time-skip step). */
export function tickPresence(ctx: SystemContext): void {
  const slice = ctx.world.slices.combat;
  const struck = slice.presenceStruck ?? {};
  const inField = new Set<string>();
  // the presence_felt re-arm times only matter for 30 seconds
  for (const key of Object.keys(slice.presence)) {
    if (ctx.tick - (slice.presence[key] ?? 0) >= REARM) delete slice.presence[key];
  }
  for (const bodies of bodiesByMap(ctx).values()) {
    for (const victim of bodies) {
      const u = victim.u;
      if (u.ai?.state === 'evade' || u.ai?.state === 'yielded') continue;
      // every bearer pressing on this unit; the field state takes the largest gap
      const bearers: { u: Unit; gap: number }[] = [];
      for (const bearer of bodies) {
        if (bearer.u === u || bearer.u.side === u.side) continue;
        const gap = bearer.u.tier - u.tier;
        if (gap < 1) continue;
        const bs = bearer.u.ai?.state;
        if (bs === 'yielded' || bs === 'evade') continue;
        const radius = presenceRadius(bearer.u);
        if (radius <= 0) continue;
        if (Math.hypot(victim.e.x - bearer.e.x, victim.e.y - bearer.e.y) > radius) continue;
        bearers.push({ u: bearer.u, gap });
        inField.add(u.id);
      }
      if (bearers.length > 0) pressOn(ctx, u, bearers, struck);
    }
  }
  // the first-entry stun re-arms once the victim left every field and the fight
  for (const key of Object.keys(struck).sort()) {
    if (inField.has(key)) continue;
    const victim = slice.units[key];
    if (!victim || !inCombat(ctx.world, victim)) delete struck[key];
  }
  if (Object.keys(struck).length > 0) slice.presenceStruck = struck;
  else delete slice.presenceStruck;
}

function pressOn(
  ctx: SystemContext,
  u: Unit,
  bearers: { u: Unit; gap: number }[],
  struck: Record<string, true>,
): void {
  const slice = ctx.world.slices.combat;
  const keep = 1 - presenceResistOf(ctx, u);
  // the strongest bearer (largest gap, then lowest id) sets the lasting field state
  const top = [...bearers].sort((a, b) => b.gap - a.gap || a.u.id.localeCompare(b.u.id))[0];
  if (!top) return;
  const field = { durationTicks: FIELD_TICKS, noRankScale: true, scale: keep, silent: true };
  if (top.gap === 1) applyAura(ctx, u, UNEASE, top.u, field);
  else applyAura(ctx, u, PRESSURE, top.u, { ...field, stacks: top.gap >= 4 ? 2 : 1 });
  // the first entry into a field three or more ranks up: one stun per encounter
  if (top.gap >= 3 && !struck[u.id]) {
    struck[u.id] = true;
    const seconds = top.gap >= 4 ? 5 : 3;
    const stun = Math.max(1, Math.round(secs(seconds) * keep));
    if (applyAura(ctx, u, PARALYSIS, top.u, { durationTicks: stun, noRankScale: true }))
      haltEntity(ctx, u.id);
  }
  if (!isPartySide(ctx.world, u)) return;
  for (const b of bearers) {
    const key = `${u.id}>${b.u.id}`;
    if (b.gap < 2) continue;
    const last = slice.presence[key];
    if (last !== undefined && ctx.tick - last < REARM) continue;
    slice.presence[key] = ctx.tick;
    ctx.emit('combat.presence_felt', { entityId: u.id, sourceId: b.u.id, gap: b.gap });
  }
}
