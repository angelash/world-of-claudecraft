// Executing the day (npc_society_ai.md 4.1 and 7.3): pick the activity for an hour
// from the plan or schedule plus need overrides, move there (walk on the player's map,
// snap elsewhere), book wages and purchases, and settle money once a day.

import type { SystemContext } from '../../core/system';
import { calendarAt } from '../../core/time';
import { addMoney, holdingOf } from '../inventory';
import { getEntity, orderMove, teleportEntity } from '../world';
import type { LocationDef } from '../world/types';
import { DEFAULT_WAGE, MEAL_HOME, MEAL_TAVERN, TRACK_CAP } from './constants';
import { needOverride, stepNeeds } from './needs';
import { type CardView, npcEntityId, personaIndex } from './personas';
import { locationById, pointIn, resolvePlace } from './places';
import { scheduleOf, segmentAt } from './schedule';
import type { Activity, DiaryKind, NpcState, ScheduleSegment } from './types';

export interface Decision {
  act: Activity;
  at: string;
  note?: string;
}

/** Spendable money: inventory balance plus today's unsettled wages and costs. */
export function spendable(ctx: SystemContext, st: NpcState): number {
  let spent = 0;
  for (const v of Object.values(st.spent)) spent += v;
  return holdingOf(ctx.world, st.entityId).money + st.earned - spent;
}

export function devotionOf(card: CardView): number {
  return card.persona?.devotion ?? 0.3;
}

/** What the NPC should be doing at this hour. */
export function decideHour(
  ctx: SystemContext,
  st: NpcState,
  card: CardView,
  hour: number,
): Decision {
  if (st.override && ctx.tick < st.override.until) {
    return { act: st.override.act, at: st.override.at, note: '有事在身' };
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

export function pushTrack(
  st: NpcState,
  hour: number,
  kind: DiaryKind,
  loc: string,
  other?: string,
) {
  st.track.push({ hour, kind, loc, with: other });
  if (st.track.length > TRACK_CAP) {
    // keep the more telling entries: drop the oldest routine work entry first
    const i = st.track.findIndex((t) => t.kind === 'work' || t.kind === 'chat');
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
  const loc =
    resolvePlace(ctx.content, card, d.at) ??
    locationById(ctx.content, card.map, card.home) ??
    undefined;
  if (!loc) return;
  const changed = loc.id !== st.locId || d.act !== st.activity;
  st.activity = d.act;
  st.note = d.note;
  if (!changed) return;
  st.locId = loc.id;
  const visible = st.mapId === ctx.world.slices.npc.playerMap;
  moveInto(ctx, st, loc, visible);
  const kind = TRACK_KIND[d.act];
  if (kind) pushTrack(st, hour, kind, loc.id);
  if (d.act === 'eat') {
    const atHome = loc.id === card.home;
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

/** One game hour passes for this NPC: needs move with the activity, wages accrue. */
export function passHour(st: NpcState, card: CardView): void {
  stepNeeds(st.needs, card.needs, st.activity);
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
