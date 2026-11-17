// Executing the day (npc_society_ai.md 4.1 and 7.3): pick the activity for an hour
// from the plan or schedule plus need overrides, move there (walk on the player's map,
// snap elsewhere, and snap onto another map for a cross-map place: the person appears at
// the place when the player is there), book wages and purchases, and settle money once a
// day. Named NPCs decide through the brain (./brain/step.ts); the plain decision here is
// the nameless residents' and the brain's own last resort.

import type { SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { calendarAt } from '../../core/time';
import { addMoney, holdingOf } from '../inventory';
import { getEntity, orderMove, playerEntity, teleportEntity } from '../world';
import type { LocationDef } from '../world/types';
import { DEFAULT_WAGE, MEAL_HOME, MEAL_TAVERN, TRACK_CAP } from './constants';
import { type HourContext, needOverride, stepNeeds } from './needs';
import { type CardView, npcEntityId, personaIndex } from './personas';
import {
  locationAt,
  locationById,
  type PlaceOnMap,
  placeRef,
  pointIn,
  resolvePlaceOn,
} from './places';
import { startTransit } from './routes';
import { coversHour, scheduleOf, segmentAt } from './schedule';
import type { Activity, DiaryKind, NpcState, ScheduleSegment, TrackItem } from './types';
import { devotionOf, spendable } from './wallet';

export { devotionOf, spendable };

export interface Decision {
  act: Activity;
  /** a schedule place reference, or a brain special place (@here, @player, @patient, @crowd) */
  at: string;
  note?: TextParam;
  /** the person a special place names (the patient), when the brain resolved one */
  near?: string;
}

/** What the NPC should be doing at this hour (the plain schedule with need overrides). */
export function decideHour(
  ctx: SystemContext,
  st: NpcState,
  card: CardView,
  hour: number,
): Decision {
  if (st.override && ctx.tick < st.override.until) {
    return { act: st.override.act, at: st.override.at, note: tr('sys.npc.note.busy') };
  }
  st.override = null;
  const day = calendarAt(ctx.tick).dayIndex;
  const segments: readonly ScheduleSegment[] =
    st.plan && st.plan.day === day ? st.plan.slots : scheduleOf(ctx.content, card);
  const seg = segmentAt(segments, hour);
  const ov = needOverride(st.needs, seg, devotionOf(card), spendable(ctx, st));
  return ov ?? { act: seg.act, at: seg.at, note: seg.note };
}

const TRACK_KIND: Partial<Record<Activity, DiaryKind>> = {
  work: 'work',
  pray: 'pray',
  shop: 'trade',
};

/** Note a talk with the player in the person's day track (the diary weighs it high). */
export function trackPlayerTalk(ctx: SystemContext, st: NpcState): void {
  const card = personaIndex(ctx.content).get(st.id);
  if (!card || st.resident) return;
  pushTrack(
    st,
    calendarAt(ctx.tick).hour,
    'chat',
    placeRef(card.map, st.mapId, st.locId),
    undefined,
    'player',
  );
}

export function pushTrack(
  st: NpcState,
  hour: number,
  kind: DiaryKind,
  loc: string,
  other?: string,
  otherId?: string,
) {
  const item: TrackItem = { hour, kind, loc };
  if (other !== undefined) item.with = other;
  if (otherId !== undefined) item.withId = otherId;
  st.track.push(item);
  if (st.track.length > TRACK_CAP) {
    // keep the more telling entries: drop the oldest routine work or chat entry first (a
    // talk with the player is never routine: the diary weighs it high)
    const i = st.track.findIndex(
      (t) => (t.kind === 'work' || t.kind === 'chat') && t.withId !== 'player',
    );
    st.track.splice(Math.max(i, 0), 1);
  }
}

/** Entity id of whoever sells at a place (innkeeper, merchant, baker), if any. */
function payeeAt(ctx: SystemContext, mapId: string, locId: string): string {
  for (const p of personaIndex(ctx.content).values()) {
    if (p.map !== mapId || p.work !== locId) continue;
    if (p.tags.includes('innkeeper') || p.tags.includes('merchant') || p.tags.includes('baker')) {
      const st = ctx.world.slices.npc.npcs[p.id];
      if (st && !st.gone) return npcEntityId(p.id);
    }
  }
  return '';
}

function book(st: NpcState, payee: string, amount: number) {
  st.spent[payee] = (st.spent[payee] ?? 0) + amount;
}

/** Move the NPC's entity into a place: walk when the player can see it, snap otherwise. */
export function moveInto(ctx: SystemContext, st: NpcState, loc: LocationDef, walk: boolean): void {
  const e = getEntity(ctx.world, st.entityId);
  if (!e) return;
  const pt = pointIn(loc, ctx.rng('npc.move'));
  if (e.mapId !== st.mapId) {
    teleportEntity(ctx, e.id, st.mapId, pt.x, pt.y);
    return;
  }
  if (walk && orderMove(ctx, e.id, pt.x, pt.y, 0.3)) return;
  teleportEntity(ctx, e.id, st.mapId, pt.x, pt.y);
}

/** Start an activity at the current hour (only acts when something changed). */
export function applyDecision(
  ctx: SystemContext,
  st: NpcState,
  card: CardView,
  d: Decision,
  hour: number,
): void {
  const home = locationById(ctx.content, card.map, card.home);
  const target =
    specialPlace(ctx, st, d) ??
    resolvePlaceOn(ctx.content, card, d.at) ??
    (home ? { mapId: card.map, loc: home } : undefined);
  if (!target) return;
  const { loc } = target;
  const changed = loc.id !== st.locId || target.mapId !== st.mapId || d.act !== st.activity;
  st.activity = d.act;
  setNote(st, d.note);
  // walking up to the player follows a moving target: re-aim on every decision
  if (d.at === '@player') walkToPlayer(ctx, st);
  if (!changed) return;
  // a place on another map, seen by the player: walk the exits (a cross-map errand)
  const e = getEntity(ctx.world, st.entityId);
  const playerMap = ctx.world.slices.npc.playerMap;
  if (e && e.mapId === playerMap && target.mapId !== e.mapId && d.at !== '@player') {
    if (startTransit(ctx, st, target.mapId, loc.id)) return;
  }
  st.transit = null;
  st.locId = loc.id;
  st.mapId = target.mapId;
  const visible = st.mapId === playerMap;
  if (d.at !== '@player') moveInto(ctx, st, loc, visible);
  const kind = TRACK_KIND[d.act];
  if (kind) pushTrack(st, hour, kind, placeRef(card.map, target.mapId, loc.id));
  if (d.act === 'eat') {
    const atHome = target.mapId === card.map && loc.id === card.home;
    book(st, atHome ? '' : payeeAt(ctx, st.mapId, loc.id), atHome ? MEAL_HOME : MEAL_TAVERN);
  } else if (d.act === 'shop') {
    book(st, payeeAt(ctx, st.mapId, loc.id), 5);
  } else if (d.act === 'pray' && card.persona) {
    const dev = card.persona.devotion ?? 0.3;
    if (dev >= 0.3)
      ctx.emit('npc.prayed', {
        npcId: st.id,
        goddess: card.persona.goddess,
        devotion: dev,
        mapId: st.mapId,
      });
  }
  if (visible) {
    ctx.emit('npc.activity', {
      npcId: st.id,
      entityId: st.entityId,
      activity: d.act,
      locationId: loc.id,
      mapId: st.mapId,
      note: d.note,
    });
  }
}

/**
 * Set the activity note. An absent note is no key at all (never an undefined value): a save
 * drops undefined keys, so keeping them would let a loaded world order its keys differently
 * from the run that never stopped (worldHash compares the JSON).
 */
export function setNote(st: NpcState, note: TextParam | undefined): void {
  if (note === undefined) delete st.note;
  else st.note = note;
}

/** One game hour passes for this NPC: needs move with the activity, wages accrue. */
export function passHour(st: NpcState, card: CardView, hour: HourContext = {}): void {
  stepNeeds(st.needs, card.needs, st.activity, hour);
  if (st.activity === 'work') st.earned += card.persona?.wage ?? DEFAULT_WAGE;
}

/** Daily settlement: one money change per NPC and one per payee (keeps the event log calm). */
export function settleMoney(ctx: SystemContext): void {
  const slice = ctx.world.slices.npc;
  const income: Record<string, number> = {};
  for (const id of Object.keys(slice.npcs).sort()) {
    const st = slice.npcs[id] as NpcState;
    let cost = 0;
    for (const [payee, v] of Object.entries(st.spent)) {
      cost += v;
      if (payee) income[payee] = (income[payee] ?? 0) + v;
    }
    const balance = holdingOf(ctx.world, st.entityId).money;
    const net = Math.max(-balance, st.earned - cost);
    if (net !== 0) addMoney(ctx, st.entityId, net, 'npc.daily_life');
    st.earned = 0;
    st.spent = {};
  }
  for (const payee of Object.keys(income).sort()) {
    addMoney(ctx, payee, income[payee] as number, 'npc.sales');
  }
}

/**
 * A brain special place (builtin_ai.md 4.3): '@here' stays, '@player' is where the player
 * stands (the person walks up), '@patient' the place of the person `near` names, '@crowd'
 * the busiest place of the map. Null for ordinary schedule references.
 */
function specialPlace(ctx: SystemContext, st: NpcState, d: Decision): PlaceOnMap | undefined {
  const here = locationById(ctx.content, st.mapId, st.locId);
  switch (d.at) {
    case '@here':
      return here ? { mapId: st.mapId, loc: here } : undefined;
    case '@player': {
      const p = playerEntity(ctx.world);
      if (!p || p.mapId !== st.mapId) return here ? { mapId: st.mapId, loc: here } : undefined;
      const loc = locationAt(ctx.content, p.mapId, p.x, p.y) ?? here;
      return loc ? { mapId: st.mapId, loc } : undefined;
    }
    case '@patient': {
      const o = d.near ? ctx.world.slices.npc.npcs[d.near] : undefined;
      const loc = o ? locationById(ctx.content, o.mapId, o.locId) : undefined;
      if (o && loc && o.mapId === st.mapId) return { mapId: o.mapId, loc };
      return here ? { mapId: st.mapId, loc: here } : undefined;
    }
    case '@crowd': {
      const counts = new Map<string, number>();
      for (const o of Object.values(ctx.world.slices.npc.npcs))
        if (!o.gone && o.mapId === st.mapId && o.locId)
          counts.set(o.locId, (counts.get(o.locId) ?? 0) + 1);
      let best = '';
      let n = -1;
      for (const [id, c] of [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
        if (c > n) {
          best = id;
          n = c;
        }
      const loc = best ? locationById(ctx.content, st.mapId, best) : undefined;
      return loc ? { mapId: st.mapId, loc } : here ? { mapId: st.mapId, loc: here } : undefined;
    }
    default:
      return undefined;
  }
}

/** Walk up to the player (a step short of them), on the player's map only. */
export function walkToPlayer(ctx: SystemContext, st: NpcState): void {
  const p = playerEntity(ctx.world);
  const e = getEntity(ctx.world, st.entityId);
  if (!p || !e || e.mapId !== p.mapId) return;
  const dx = e.x - p.x;
  const dy = e.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= 1.6) return;
  const x = p.x + (dx / d) * 1.2;
  const y = p.y + (dy / d) * 1.2;
  if (!orderMove(ctx, e.id, x, y, 0.6)) orderMove(ctx, e.id, p.x, p.y, 1.2);
}

/** Whether the person's template says work at this hour. */
export function scheduledWork(ctx: SystemContext, card: CardView, hour: number): boolean {
  return scheduleOf(ctx.content, card).some((s) => s.act === 'work' && coversHour(s, hour));
}
