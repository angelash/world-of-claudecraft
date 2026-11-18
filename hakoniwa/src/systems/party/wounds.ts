// Going down, getting back up, grave injury and the spring (companions_and_party.md 7.6,
// 11; D-073). A companion whose health runs out goes down (combat keeps it down and counts
// the downs of the fight). It gets back up beside the player once nobody in the party has
// fought for 15 seconds, with the downed weakness (combat adds the light wound). It leaves
// gravely hurt instead (11.2) when the blow that felled it overflowed by half its health
// or more, on its second down of one fight (not on the story difficulty), when the fight
// ends in defeat while it is down (the player went through the door, or fled the map), or
// when the story or a crystallised body says so. Gravely hurt it rests 2 game days (1 to
// 4; U-10) out of the world. Under ironman the same falls are deaths outside the
// companion's protection (11.4): the soul waits at the spring, then is gone. A beast
// companion dies in either mode.

import type { SystemContext } from '../../core/system';
import { calendarAt, TICKS_PER_GAME_DAY } from '../../core/time';
import { applyAuraTo, difficultyMods, reviveUnit, unitOf } from '../combat';
import { secs } from '../combat/defs';
import { deriveStats } from '../combat/stats';
import type { Unit } from '../combat/types';
import { applyDeathWear } from '../inventory';
import { playerEntity, teleportEntity } from '../world';
import { companionDef, holds, partyConfig } from './config';
import { ironmanOn } from './ironman';
import { enterParty, fieldMembers, sortedMembers, standBy, stateOf } from './roster';
import type { Member, WoundCause } from './types';

/** The downed weakness put on a companion that gets back up (7.6). */
export const DOWNED_WEAK = 'aur_st_downed_weak';

/** Remember the health of every member in the field at this party tick (the fatal blow). */
export function snapHealth(ctx: SystemContext): void {
  for (const m of fieldMembers(ctx.world)) {
    const u = unitOf(ctx.world, m.entityId);
    if (!u) continue;
    m.hpSeen = [m.hpSeen?.[1] ?? u.hp, u.hp];
  }
}

/** A hit landed on a member: add it to this tick's damage. */
export function noteHit(ctx: SystemContext, m: Member, amount: number): void {
  const prev = m.hitTick && m.hitTick[0] === ctx.tick ? m.hitTick[1] : 0;
  m.hitTick = [ctx.tick, prev + amount];
}

/** The player and the members on the player's map. */
function sideIds(ctx: SystemContext): string[] {
  const p = playerEntity(ctx.world);
  const ids = [ctx.world.slices.world.playerId];
  for (const m of fieldMembers(ctx.world))
    if (ctx.world.slices.world.entities[m.entityId]?.mapId === p?.mapId) ids.push(m.entityId);
  return ids;
}

/** Whether a fight is going on for the party (anyone on its side still fighting). */
export function partyFighting(ctx: SystemContext): boolean {
  const ids = sideIds(ctx);
  return ids.some((id) => {
    const u = unitOf(ctx.world, id);
    return !!u && u.combatUntil > ctx.tick;
  });
}

/** The last tick anyone in the party was fighting. */
function fightEnded(ctx: SystemContext): number {
  let last = 0;
  for (const id of sideIds(ctx)) {
    const u = unitOf(ctx.world, id);
    if (u) last = Math.max(last, u.combatUntil);
  }
  return last;
}

/** Whether ironman protection covers the member now (11.4). */
function armored(ctx: SystemContext, m: Member): boolean {
  const def = companionDef(ctx.content, m.id);
  if (!def?.armor) return false;
  return !def.armor.when || !holds(ctx, def.armor.when);
}

/** Rest days of a grave injury (11.3): base, a fatal blow +1, each recent one +1, 1 to 4. */
export function restDays(ctx: SystemContext, m: Member, cause: WoundCause): number {
  const r = partyConfig(ctx.content).rest;
  const span = r.repeatWindowDays * TICKS_PER_GAME_DAY;
  const recent = (m.wounds ?? []).filter((t) => ctx.tick - t < span).length;
  const days = r.baseDays + (cause === 'fatal' ? r.fatalDays : 0) + recent * r.repeatDays;
  return Math.max(r.minDays, Math.min(r.maxDays, days));
}

/** The member falls for good for now: grave injury, or death under ironman or as a beast. */
export function fall(ctx: SystemContext, m: Member, cause: WoundCause): void {
  const s = stateOf(m);
  if (m.temp || (s !== 'party' && s !== 'waiting')) return;
  const ironman = ironmanOn(ctx.world);
  if (m.pet?.kind === 'half' || (ironman && !armored(ctx, m))) die(ctx, m, cause);
  else wound(ctx, m, cause);
}

function wound(ctx: SystemContext, m: Member, cause: WoundCause): void {
  const days = restDays(ctx, m, cause);
  const span = partyConfig(ctx.content).rest.repeatWindowDays * TICKS_PER_GAME_DAY;
  m.wounds = [...(m.wounds ?? []).filter((t) => ctx.tick - t < span), ctx.tick];
  // the gear takes the knock of a grave injury (5.1: -10%)
  if (m.entityId) applyDeathWear(ctx, m.entityId);
  standBy(ctx, m, 'resting');
  m.restUntil = ctx.tick + days * TICKS_PER_GAME_DAY;
  if (!m.pet) {
    const back = calendarAt(m.restUntil).dayIndex;
    if (ctx.flag(`companion.${m.id}.injured_until`) !== back)
      ctx.setFlag(`companion.${m.id}.injured_until`, back);
  }
  ctx.emit('party.wounded', { companionId: m.id, cause, until: m.restUntil, days });
}

function die(ctx: SystemContext, m: Member, cause: WoundCause): void {
  const sp = partyConfig(ctx.content).spring;
  const days =
    m.pet?.kind === 'half'
      ? sp.petDays
      : m.pet || companionDef(ctx.content, m.id)?.servant
        ? sp.servantDays
        : sp.days;
  standBy(ctx, m, 'spring');
  m.springUntil = ctx.tick + days * TICKS_PER_GAME_DAY;
  ctx.emit('party.died', { companionId: m.id, cause, until: m.springUntil });
}

/** A member's entity went down (entity.died): a fatal blow or a second down sends it off. */
export function onDown(ctx: SystemContext, m: Member): void {
  m.downedTick = ctx.tick;
  const u = unitOf(ctx.world, m.entityId);
  if (!u) return;
  const cfg = partyConfig(ctx.content);
  const max = deriveStats(ctx.world, ctx.content, u).maxHp;
  const before = m.hpSeen?.[0] ?? max;
  const taken = m.hitTick && m.hitTick[0] === ctx.tick ? m.hitTick[1] : 0;
  if (taken - before >= cfg.fatalShare * max) {
    fall(ctx, m, 'fatal');
    return;
  }
  if ((u.downs ?? 0) >= 2 && difficultyMods(ctx.world).secondDownIsInjury)
    fall(ctx, m, 'second_down');
}

/** The fight ended in defeat (the player fell, or fled the map): the downed are gravely hurt. */
export function onDefeat(ctx: SystemContext): void {
  for (const m of fieldMembers(ctx.world)) {
    if (unitOf(ctx.world, m.entityId)?.downed) fall(ctx, m, 'defeat');
  }
}

/** Formation slot behind the player for the n-th companion. */
export function slotNear(pe: { x: number; y: number; facing: number }, n: number, spread = 1) {
  const angle = pe.facing + Math.PI + (n - 1) * 0.9 - 0.45;
  const r = (1.6 + Math.floor(n / 3) * 0.8) * spread;
  return { x: pe.x + Math.cos(angle) * r, y: pe.y + Math.sin(angle) * r };
}

/** A downed member gets back up beside the player once the party has been calm 15 seconds. */
export function tryGetUp(ctx: SystemContext, m: Member, u: Unit, n: number): void {
  if (!u.downed) return;
  const pe = playerEntity(ctx.world);
  if (!pe?.alive) return;
  const cfg = partyConfig(ctx.content);
  if (partyFighting(ctx)) return;
  const calmFrom = Math.max(fightEnded(ctx), m.downedTick);
  if (ctx.tick - calmFrom < secs(cfg.getUpSec)) return;
  const s = slotNear(pe, n);
  teleportEntity(ctx, u.id, pe.mapId, s.x, s.y);
  reviveUnit(ctx, u, cfg.getUpHp);
  applyAuraTo(ctx, u.id, DOWNED_WEAK);
  // the next blow measures from the health it got up with (the fatal-blow overflow)
  m.hpSeen = [u.hp, u.hp];
}

/** Rest and spring clocks (checked once a second). */
export function tickClocks(ctx: SystemContext): void {
  for (const m of sortedMembers(ctx.world)) {
    const s = stateOf(m);
    if (s === 'resting' && m.restUntil !== undefined && ctx.tick >= m.restUntil) {
      delete m.restUntil;
      standBy(ctx, m, 'standby');
      ctx.emit('party.recovered', { companionId: m.id });
      enterParty(ctx, m);
    } else if (s === 'spring' && m.springUntil !== undefined && ctx.tick >= m.springUntil) {
      delete m.springUntil;
      if (m.pet) {
        delete ctx.world.slices.party.members[m.id];
        ctx.emit('party.left', { companionId: m.id });
        continue;
      }
      standBy(ctx, m, 'dead');
      if (!ctx.flag(`companion.${m.id}.lost`)) ctx.setFlag(`companion.${m.id}.lost`, true);
    }
  }
}
