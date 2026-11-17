// The NPC side of the quest model's movement objectives (quests_and_events.md 5; the gaps
// objectives.ts names for this package): the follow-the-player order (escort, rescue and
// accompany need the person to walk with the player: a plain NPC now does, not only a
// companion), the watchers of a stealth objective who emit `stealth.detected` when they see
// the player, and the quest-stage hook that starts both from the quest content. The
// release reads the quest's own flags (quest.<id> and quest.<id>.stage), never its slice.

import type { SystemContext } from '../../../core/system';
import { calendarAt, TICKS_PER_GAME_HOUR } from '../../../core/time';
import type { QuestDef } from '../../quests/types';
import {
  distance,
  entitiesNear,
  getEntity,
  orderMove,
  playerEntity,
  teleportEntity,
} from '../../world';
import { FOLLOW_TICKS, WATCH_RADIUS } from '../constants';
import { cardOf } from '../personas';
import { locationAt } from '../places';
import type { FollowOrder, NpcState, WatchZone } from '../types';
import { sortedNpcIds } from './state';
import { stepNpc } from './step';

/** Default and longest follow (game hours) and the distance kept from the player (tiles). */
export const FOLLOW_HOURS = 24;
export const FOLLOW_MAX_HOURS = 72;
export const FOLLOW_RANGE = 4;
/** A follower closer than this stays put; farther it walks up behind the player. */
export const FOLLOW_CLOSE = 2.2;

/** Start or end a follow order; false when the person cannot follow (absent, unknown). */
export function setFollow(
  ctx: SystemContext,
  npcId: string,
  on: boolean,
  opts: { hours?: number; range?: number; questId?: string; stage?: string } = {},
): boolean {
  const slice = ctx.world.slices.npc;
  const st = slice.npcs[npcId];
  const card = cardOf(slice, ctx.content, npcId);
  if (!st || !card || st.gone) return false;
  if (!on) {
    if (st.follow) {
      st.follow = null;
      stepNpc(ctx, st, card);
    }
    return true;
  }
  const hours = Math.max(1, Math.min(FOLLOW_MAX_HOURS, Math.round(opts.hours ?? FOLLOW_HOURS)));
  const order: FollowOrder = {
    until: ctx.tick + hours * TICKS_PER_GAME_HOUR,
    range: Math.max(1, Math.min(12, opts.range ?? FOLLOW_RANGE)),
  };
  if (opts.questId) order.questId = opts.questId;
  if (opts.stage) order.stage = opts.stage;
  st.follow = order;
  st.override = null;
  st.transit = null;
  return true;
}

/** The order no longer holds: expired, or its quest moved on. */
function released(ctx: SystemContext, f: FollowOrder | WatchZone): boolean {
  if ('until' in f && ctx.tick >= f.until) return true;
  if (!f.questId) return false;
  if (ctx.flag(`quest.${f.questId}`) !== 'active') return true;
  return !!f.stage && ctx.flag(`quest.${f.questId}.stage`) !== f.stage;
}

/** Keep every follower at the player's side (on the follower cadence). */
export function stepFollowers(ctx: SystemContext): void {
  if (ctx.tick % FOLLOW_TICKS !== 0) return;
  const slice = ctx.world.slices.npc;
  const player = playerEntity(ctx.world);
  for (const id of sortedNpcIds(slice.npcs)) {
    const st = slice.npcs[id] as NpcState;
    const f = st.follow;
    if (!f) continue;
    const card = cardOf(slice, ctx.content, id);
    if (st.gone || !card || released(ctx, f)) {
      st.follow = null;
      if (card && !st.gone) stepNpc(ctx, st, card);
      continue;
    }
    const e = getEntity(ctx.world, st.entityId);
    if (!e || !player || st.talking) continue;
    if (e.mapId !== player.mapId) {
      // through the gate with the player
      teleportEntity(ctx, e.id, player.mapId, player.x, player.y);
      st.mapId = player.mapId;
      st.locId = locationAt(ctx.content, player.mapId, player.x, player.y)?.id ?? '';
      continue;
    }
    st.locId = locationAt(ctx.content, e.mapId, e.x, e.y)?.id ?? st.locId;
    if (distance(e, player) <= FOLLOW_CLOSE) continue;
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const d = Math.hypot(dx, dy) || 1;
    const x = player.x + (dx / d) * 1.4;
    const y = player.y + (dy / d) * 1.4;
    if (!orderMove(ctx, e.id, x, y, 0.5)) orderMove(ctx, e.id, player.x, player.y, 1.4);
  }
}

// ---------------------------------------------------------------------------
// stealth watchers

/** Watch a map (or a place on it) for the sneaking player; `on: false` stops watching. */
export function setWatch(
  ctx: SystemContext,
  zone: { mapId: string; location?: string; questId?: string; stage?: string },
  on: boolean,
): void {
  const slice = ctx.world.slices.npc;
  if (!slice.watch) slice.watch = [];
  const list = slice.watch;
  const same = (z: WatchZone) =>
    z.mapId === zone.mapId && z.location === zone.location && z.questId === zone.questId;
  const i = list.findIndex(same);
  if (!on) {
    if (i >= 0) list.splice(i, 1);
    return;
  }
  if (i >= 0) return;
  const z: WatchZone = { mapId: zone.mapId, spotted: false };
  if (zone.location) z.location = zone.location;
  if (zone.questId) z.questId = zone.questId;
  if (zone.stage) z.stage = zone.stage;
  list.push(z);
}

/** Whether an entity keeps watch (awake people, guards, the hostile camp). */
function watcher(ctx: SystemContext, id: string): boolean {
  const e = getEntity(ctx.world, id);
  if (!e?.alive || e.hidden || e.kind === 'player' || e.kind === 'companion') return false;
  if (e.tags.includes('companion')) return false;
  if (e.kind === 'npc') {
    const st = e.ref ? ctx.world.slices.npc.npcs[e.ref] : undefined;
    return !st || (st.activity !== 'sleep' && !st.follow);
  }
  return e.tags.includes('hostile') || e.tags.includes('guard');
}

/**
 * Look out for the sneaking player (every 20 ticks): within a watch zone's map, the
 * nearest watcher sees the player for sure within 2 tiles and otherwise with a chance
 * falling to nothing at the watch radius (halved at night); a sighting emits
 * `stealth.detected` once per visit to the map.
 */
export function stepWatchers(ctx: SystemContext): void {
  const slice = ctx.world.slices.npc;
  const zones = slice.watch;
  if (!zones || zones.length === 0 || ctx.tick % 20 !== 0) return;
  for (let i = zones.length - 1; i >= 0; i--)
    if (released(ctx, zones[i] as WatchZone)) zones.splice(i, 1);
  const p = playerEntity(ctx.world);
  if (!p?.alive) return;
  const hour = calendarAt(ctx.tick).hour;
  const radius = hour >= 21 || hour < 6 ? WATCH_RADIUS / 2 : WATCH_RADIUS;
  for (const z of zones) {
    // the whole approach on the zone's map is watched, not only the place itself
    if (z.spotted || z.mapId !== p.mapId) continue;
    const near = entitiesNear(ctx.world, p.mapId, p.x, p.y, radius, (e) => watcher(ctx, e.id));
    const w = near[0];
    if (!w) continue;
    const d = distance(w, p);
    const chance = d <= 2 ? 1 : 0.4 * Math.max(0, (radius - d) / radius);
    if (!ctx.rng('npc.perception').chance(chance)) continue;
    z.spotted = true;
    ctx.emit('stealth.detected', {
      entityId: ctx.world.slices.world.playerId,
      by: w.id,
      mapId: p.mapId,
    });
  }
}

/** The player left a map: watchers of that map start fresh on the next visit. */
export function forgetSightings(ctx: SystemContext): void {
  for (const z of ctx.world.slices.npc.watch ?? []) z.spotted = false;
}

// ---------------------------------------------------------------------------
// quest hooks

function questDef(ctx: SystemContext, id: string): QuestDef | undefined {
  return (ctx.content.quests ?? []).find((q) => q.id === id);
}

/** A quest entered a stage: start the follow orders and watches its objectives need. */
export function onQuestStage(ctx: SystemContext, questId: string, index: number): void {
  const def = questDef(ctx, questId);
  const stage = def?.stages[index];
  if (!def || !stage) return;
  for (const o of stage.objectives) {
    if (o.type === 'escort' || o.type === 'accompany')
      setFollow(ctx, o.npc, true, {
        questId,
        stage: stage.id,
        range: o.type === 'accompany' ? o.range : undefined,
      });
    else if (o.type === 'stealth')
      setWatch(ctx, { mapId: o.mapId, location: o.location, questId, stage: stage.id }, true);
  }
}

/**
 * The player talked to someone: a captive of an active rescue objective with a destination
 * is freed (the quest counts the talk) and now walks with the player.
 */
export function onTalkedFor(ctx: SystemContext, npcRef: string): void {
  for (const def of ctx.content.quests ?? []) {
    if (ctx.flag(`quest.${def.id}`) !== 'active') continue;
    const stageId = ctx.flag(`quest.${def.id}.stage`);
    const stage = def.stages.find((s) => s.id === stageId);
    if (!stage) continue;
    for (const o of stage.objectives)
      if (o.type === 'rescue' && o.npc === npcRef && o.mapId)
        setFollow(ctx, npcRef, true, { questId: def.id, stage: stage.id });
  }
}
