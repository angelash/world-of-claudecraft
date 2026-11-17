// Discovery and hints (thousand_doors.md 2.1, 3.2, 18): the corridor's segments grow with
// the acts and show their end-hall doors at the glimpse level; the prologue's two highest
// tendencies show their doors as a crack at the start of act 1 (even a later act's door,
// crack only); and the hint director picks the next door to hint by integer scores with
// the door id as the tie-break, so the same state always picks the same door. No
// randomness and no model: the text of every hint is the door's own written crack line
// (content text), so the no-model build hints exactly as the rules say (D-007, D-068).

import { contentText } from '../../core/content_key';
import type { ContentMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { calendarAt, TICK_HZ, TICKS_PER_GAME_DAY } from '../../core/time';
import type { World } from '../../core/world';
import { mapById } from '../world';
import { actNumber, anyProgress, keyPeople, walkKeys } from './keys';
import { ensureSlice } from './slice';
import { raiseHint } from './state';
import type { DoorDef, HintChannel, HintState } from './types';

/** One real minute at normal speed, in ticks (the unit of the drought, 17.4). */
export const REAL_MINUTE = TICK_HZ * 60;
/** The director gives at most this many hints per game day (18.3 rule 5). */
export const HINTS_PER_DAY = 2;
/** The hint log keeps this many entries (21.4). */
export const HINT_LOG_MAX = 200;
/** Drought of this many real minutes raises a hint by two levels; twice it, to the top. */
export const DROUGHT_RAISE = 120;

/** Segments the corridor has grown (2.1): 1 once it shows, then one per act from 2 to 6. */
export function grownSegments(world: World): number[] {
  const out: number[] = [];
  if (world.meta.flags['feature.door_corridor']) out.push(1);
  const act = actNumber(world.meta.flags.act);
  for (let s = 2; s <= 6; s++) if (act >= s) out.push(s);
  return out;
}

/** The prologue's tendencies (p_door_hints, a comma list of the two highest). */
export function prologueTendencies(world: World): Set<string> {
  const v = world.meta.flags.p_door_hints;
  if (typeof v !== 'string' || v === '') return new Set();
  return new Set(
    v
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== ''),
  );
}

function emitHint(ctx: SystemContext, door: DoorDef, channel: HintChannel, level: number): void {
  ctx.emit('doors.hint', {
    doorId: door.id,
    channel,
    level,
    text: contentText('doors', door, door.id, 'hint'),
  });
}

/**
 * The corridor grew (2.1): the end-hall doors of every grown segment show at the glimpse
 * level; once the corridor shows in act 1 (the first door, 8 row 1) the prologue's
 * tendencies show their doors as a crack (18.1).
 */
export function discover(ctx: SystemContext): void {
  const slice = ctx.world.slices.doors;
  const grown = new Set(grownSegments(ctx.world));
  for (const door of ctx.content.doors ?? []) {
    const rt = slice.doors[door.id];
    if (!door.hall || !rt || !grown.has(door.segment)) continue;
    if ((rt.hintLevel ?? 0) >= 2 && rt.state !== 'hidden') continue;
    raiseHint(ctx, door.id, 2);
  }
  if (actNumber(ctx.flag('act')) < 1 || !ctx.flag('feature.door_corridor')) return;
  const tendencies = prologueTendencies(ctx.world);
  if (tendencies.size === 0) return;
  for (const door of ctx.content.doors ?? []) {
    const rt = slice.doors[door.id];
    if (!door.tendency || !rt || !tendencies.has(door.tendency)) continue;
    if ((rt.hintLevel ?? 0) >= 1) continue;
    if (raiseHint(ctx, door.id, 1)) emitHint(ctx, door, 'tendency', 1);
  }
}

/** Maps within reach: the player's map and the maps its exits lead to. */
function nearbyMaps(world: World, content: ContentMap): Set<string> {
  const out = new Set<string>();
  const p = world.slices.world.entities[world.slices.world.playerId];
  if (!p) return out;
  out.add(p.mapId);
  for (const exit of mapById(content, p.mapId)?.exits ?? []) out.add(exit.toMap);
  return out;
}

/** Does a key of the door lie near (a place to visit, a person to see) (18.3 rule 2)? */
function keyNearby(world: World, door: DoorDef, near: Set<string>): boolean {
  if (near.size === 0) return false;
  const people = new Set<string>();
  let place = false;
  walkKeys(door.keys, '', (k) => {
    if (k.type === 'visit' && near.has(k.mapId)) place = true;
    for (const p of keyPeople(k)) people.add(p);
  });
  if (place) return true;
  if (people.size === 0) return false;
  for (const e of Object.values(world.slices.world.entities)) {
    if (e.ref && people.has(e.ref) && near.has(e.mapId)) return true;
  }
  return false;
}

/** Does the door have a key a rumour can point at: a place, a dungeon, a mentor or holder? */
function rumorable(door: DoorDef): boolean {
  let found = false;
  walkKeys(door.keys, '', (k) => {
    if (k.type === 'visit' || k.type === 'dungeon' || keyPeople(k).length > 0) found = true;
  });
  return found;
}

function hasPlaceKey(door: DoorDef): boolean {
  let found = false;
  walkKeys(door.keys, '', (k) => {
    if (k.type === 'visit' || k.type === 'dungeon') found = true;
  });
  return found;
}

export interface HintCandidate {
  doorId: string;
  score: number;
}

/**
 * Every door the director may hint (18.3 rule 1: of this act or earlier, not open, locked,
 * closed or openable), scored by rule 2 and ordered best first, ties by door id.
 */
export function hintCandidates(world: World, content: ContentMap): HintCandidate[] {
  const slice = world.slices.doors;
  const act = actNumber(world.meta.flags.act);
  const tendencies = prologueTendencies(world);
  const near = nearbyMaps(world, content);
  const drought = slice.drought ?? 0;
  const lastHinted = new Map<string, number>();
  for (const h of slice.hints?.log ?? []) lastHinted.set(h.doorId, h.tick);
  const out: HintCandidate[] = [];
  for (const door of content.doors ?? []) {
    const rt = slice.doors[door.id];
    if (!rt || door.act > act) continue;
    if (rt.state !== 'hidden' && rt.state !== 'hinted') continue;
    let score = 0;
    if (anyProgress(world, door, content)) score += 30;
    if (keyNearby(world, door, near)) score += 20;
    if (door.tendency && tendencies.has(door.tendency)) score += 10;
    score += 10 * Math.floor(drought / (30 * REAL_MINUTE));
    if (door.main) score += 15;
    if (door.forbidden) score -= 40;
    const last = lastHinted.get(door.id);
    if (last !== undefined) score += 5 * Math.floor((world.meta.tick - last) / TICKS_PER_GAME_DAY);
    out.push({ doorId: door.id, score });
  }
  return out.sort((a, b) => b.score - a.score || (a.doorId < b.doorId ? -1 : 1));
}

/** The level a hint lifts a door to (18.3 rule 4, the dream's cap of 18.1). */
export function hintLevelFor(
  current: number,
  droughtTicks: number,
  door: DoorDef,
  channel: HintChannel,
  sealStage: number,
): number {
  const minutes = droughtTicks / REAL_MINUTE;
  const place = hasPlaceKey(door);
  let target: number;
  if (minutes > DROUGHT_RAISE * 2) target = place ? 4 : 3;
  else if (minutes > DROUGHT_RAISE) target = current + 2;
  else target = current + 1;
  if (!place) target = Math.min(target, 3);
  if (channel === 'dream') target = Math.min(target, Math.max(1, Math.min(3, sealStage)));
  return Math.max(current, Math.min(4, target));
}

/** The calendar day of a tick (the day the rest of the game counts in). */
function dayOf(tick: number): number {
  return calendarAt(tick).dayIndex;
}

function rollDay(hints: HintState, tick: number): void {
  const day = dayOf(tick);
  if (hints.day !== day) {
    hints.day = day;
    hints.today = 0;
  }
}

/**
 * Give one hint through `channel`: the best-scored door whose level can still rise (Janu's
 * dream never pushes a forbidden door; a rumour only tells of a place or a person). Returns
 * the door hinted, or null when the day's hints are spent or nothing can rise.
 */
export function giveHint(ctx: SystemContext, channel: HintChannel): string | null {
  const slice = ensureSlice(ctx.world, ctx.content);
  const hints = slice.hints ?? { day: 0, today: 0, log: [] };
  slice.hints = hints;
  rollDay(hints, ctx.tick);
  if (hints.today >= HINTS_PER_DAY) return null;
  const doors = new Map((ctx.content.doors ?? []).map((d) => [d.id, d]));
  for (const c of hintCandidates(ctx.world, ctx.content)) {
    const door = doors.get(c.doorId);
    const rt = slice.doors[c.doorId];
    if (!door || !rt) continue;
    if (channel === 'dream' && door.forbidden) continue;
    if (channel === 'rumor' && !rumorable(door)) continue;
    const cur = rt.hintLevel ?? 0;
    const level = hintLevelFor(cur, slice.drought ?? 0, door, channel, slice.sealStage ?? 0);
    if (level <= cur) continue;
    raiseHint(ctx, door.id, level);
    hints.today += 1;
    hints.log.push({ doorId: door.id, tick: ctx.tick, channel, level });
    if (hints.log.length > HINT_LOG_MAX) hints.log.splice(0, hints.log.length - HINT_LOG_MAX);
    emitHint(ctx, door, channel, level);
    return door.id;
  }
  return null;
}

/** A night's sleep: from seal stage 1 Janu may show one door in a dream, once a night (18.1). */
export function onSlept(ctx: SystemContext): void {
  const slice = ensureSlice(ctx.world, ctx.content);
  if ((slice.sealStage ?? 0) < 1) return;
  const hints = slice.hints ?? { day: 0, today: 0, log: [] };
  slice.hints = hints;
  const day = dayOf(ctx.tick);
  if (hints.dreamDay === day) return;
  hints.dreamDay = day;
  giveHint(ctx, 'dream');
}

/**
 * A long drought with no hint today: a rumour of a door site or a mentor (18.3 rule 3),
 * tried once a game day.
 */
export function droughtHint(ctx: SystemContext): void {
  const slice = ensureSlice(ctx.world, ctx.content);
  if ((slice.drought ?? 0) < DROUGHT_RAISE * REAL_MINUTE) return;
  const hints = slice.hints ?? { day: 0, today: 0, log: [] };
  slice.hints = hints;
  rollDay(hints, ctx.tick);
  const day = dayOf(ctx.tick);
  if (hints.today > 0 || hints.rumorDay === day) return;
  hints.rumorDay = day;
  giveHint(ctx, 'rumor');
}
