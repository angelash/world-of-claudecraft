// One brain step of a person: decide (./root.ts), apply the decision (movement, track,
// money, the npc.activity event), run a freshly chosen role action's side effect once, and
// keep the day's schedule log (alive metric 2: hours spent off the template). Also the
// staggered beats of L1 and L2 (builtin_ai.md 3.1 and 16: every 200 and 600 ticks,
// (tick + hash(id)) % period == 0) and the per-tick upkeep (followers, approaches,
// cross-map walks).

import type { SystemContext } from '../../../core/system';
import { calendarAt, TICKS_PER_GAME_HOUR } from '../../../core/time';
import { applyDecision } from '../actions';
import { NEED_CRITICAL } from '../constants';
import { ensureNeeds } from '../needs';
import { type CardView, cardOf } from '../personas';
import { resolvePlaceOn } from '../places';
import { scheduleOf, segmentAt } from '../schedule';
import type { NpcState } from '../types';
import { applyRoleEffect, patientOf } from './role_effects';
import { brainDecide, noteDecision } from './root';
import { senseThreat } from './sense';
import { beatPeriod, ensureBrain, onBeat, since, sortedNpcIds } from './state';

/** Decide and apply what the person does now. */
export function stepNpc(ctx: SystemContext, st: NpcState, card: CardView, beat = false): void {
  if (st.gone || st.talking || ctx.tick < st.freezeUntil || st.transit) return;
  const hour = calendarAt(ctx.tick).hour;
  const d = brainDecide(ctx, st, card, beat);
  const fresh = st.resident ? false : noteDecision(st, d, ctx.tick);
  const near = d.at === '@patient' ? patientOf(ctx, st)?.id : undefined;
  applyDecision(ctx, st, card, { act: d.act, at: d.at, note: d.note, near }, hour);
  // the effect runs once when the action is taken up, not on every beat it lasts
  if (fresh && d.effect) applyRoleEffect(ctx, st, d.effect);
}

/**
 * An approach on its way to the player, or a visit under way, holds the person through the
 * hourly step: the beats decide those layers (builtin_ai.md 3.1), and the hour must not walk
 * the person back half-way. A fresh threat breaks the hold.
 */
export function heldByBeat(ctx: SystemContext, st: NpcState): boolean {
  const b = st.brain;
  if (!b || st.resident || st.tier > 2) return false;
  if (since(st, 'threat', ctx.tick) <= TICKS_PER_GAME_HOUR / 2) return false;
  // a critical bodily need (or fear for one's life) breaks the hold too
  const n = ensureNeeds(st.needs);
  if (n.hunger < NEED_CRITICAL || n.energy < NEED_CRITICAL || n.safety < NEED_CRITICAL)
    return false;
  if (b.layer === 'initiative') return !!b.approach.pending;
  if (b.layer !== 'social') return false;
  const at = b.used[b.current];
  return at !== undefined && ctx.tick - at < beatPeriod(st.tier);
}

/** Run the beats due this tick (L1 every 200 ticks, L2 every 600, staggered by id). */
export function runBeats(ctx: SystemContext): void {
  const slice = ctx.world.slices.npc;
  for (const id of sortedNpcIds(slice.npcs)) {
    const st = slice.npcs[id] as NpcState;
    if (st.resident || st.gone || st.tier > 2) continue;
    if (!onBeat(ctx.tick, id, beatPeriod(st.tier))) continue;
    // a beast that turned up since the hour is felt on the beat (the emergency layer reads it)
    if (st.mapId === slice.playerMap) senseThreat(ctx, st);
    const card = cardOf(slice, ctx.content, id);
    if (card) stepNpc(ctx, st, card, true);
  }
}

/**
 * Log the hour that just ended for a named person (alive metric 2): an hour counts as off
 * the template when the activity or the place differs from the person's own template.
 */
export function logHour(ctx: SystemContext, st: NpcState, card: CardView, hour: number): void {
  if (st.resident || st.gone) return;
  const b = ensureBrain(st);
  const day = calendarAt(ctx.tick - 1).dayIndex;
  const log = b.dayLog;
  if (log.day !== day) {
    if (log.day >= 0 && log.hours > 0)
      log.last = {
        day: log.day,
        hours: log.hours,
        off: log.off,
        segs: log.segs ?? 0,
        offSegs: log.offSegs ?? 0,
      };
    b.dayLog = { day, hours: 0, off: 0, segs: 0, offSegs: 0, run: '', last: log.last };
  }
  const seg = segmentAt(scheduleOf(ctx.content, card), hour);
  const place = resolvePlaceOn(ctx.content, card, seg.at);
  const samePlace = !!place && place.mapId === st.mapId && place.loc.id === st.locId;
  const off = seg.act !== st.activity || !samePlace;
  const d = b.dayLog;
  d.hours += 1;
  if (off) d.off += 1;
  // a new executed segment begins whenever the activity, the place or its template fit change
  const run = `${st.activity}|${st.mapId}/${st.locId}|${off ? 1 : 0}`;
  if (run !== d.run) {
    d.run = run;
    d.segs = (d.segs ?? 0) + 1;
    if (off) d.offSegs = (d.offSegs ?? 0) + 1;
  }
}
