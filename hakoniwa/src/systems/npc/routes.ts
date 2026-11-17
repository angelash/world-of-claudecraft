// Cross-map errands on foot (PK-M1-18: `npc.goto` to another map, a follow objective whose
// guide leads the player through a town gate): while the player can see the person, they
// walk to the exit toward the destination, step through it onto the next map at the
// arrival place, and go on; once the player is elsewhere the rest of the way is snapped
// (offscreen people are not walked, builtin_ai.md 3.2). The route is a breadth-first search
// over the maps' exits, honouring each exit's requiresFlags. Deterministic.

import type { ContentMap, FlagValue } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { calendarAt, TICKS_PER_GAME_HOUR } from '../../core/time';
import { getEntity, mapById, orderMove, teleportEntity } from '../world';
import type { ExitDef } from '../world/types';
import { sortedNpcIds } from './brain/state';
import { FOLLOW_TICKS, TRACK_CAP } from './constants';
import { cardOf } from './personas';
import { locationById, placeRef, pointIn } from './places';
import type { DiaryKind, NpcState } from './types';

/** The first exit on the way from one map to another, or null when no open way exists. */
export function nextExit(
  content: Pick<ContentMap, 'maps'>,
  flags: Record<string, FlagValue>,
  from: string,
  to: string,
): ExitDef | null {
  if (from === to) return null;
  const open = (x: ExitDef) => !x.requiresFlags?.some((f) => !flags[f]);
  const first = new Map<string, ExitDef>();
  const queue: string[] = [from];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const m = queue.shift() as string;
    const exits = [...(mapById(content, m)?.exits ?? [])]
      .filter(open)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const x of exits) {
      if (seen.has(x.toMap)) continue;
      seen.add(x.toMap);
      first.set(x.toMap, m === from ? x : (first.get(m) as ExitDef));
      if (x.toMap === to) return first.get(to) ?? null;
      queue.push(x.toMap);
    }
  }
  return null;
}

/** Start walking toward another map; false when there is no way (the caller snaps). */
export function startTransit(
  ctx: SystemContext,
  st: NpcState,
  mapId: string,
  locId: string,
): boolean {
  const e = getEntity(ctx.world, st.entityId);
  if (!e) return false;
  const exit = nextExit(ctx.content, ctx.world.meta.flags, e.mapId, mapId);
  if (!exit) return false;
  st.transit = { mapId, locId, exitId: exit.id, since: ctx.tick };
  st.mapId = e.mapId;
  st.locId = '';
  if (!orderMove(ctx, e.id, exit.x + 0.5, exit.y + 0.5, 0.6))
    teleportEntity(ctx, e.id, e.mapId, exit.x + 0.5, exit.y + 0.5);
  return true;
}

/** How long a walk to the next gate may take before the rest of the way is snapped. */
export const TRANSIT_GIVE_UP = TICKS_PER_GAME_HOUR;

function track(st: NpcState, kind: DiaryKind, loc: string, hour: number): void {
  st.track.push({ hour, kind, loc });
  if (st.track.length > TRACK_CAP) st.track.splice(0, st.track.length - TRACK_CAP);
}

/** Put the person at the destination place (walk when the player sees it, snap otherwise). */
function arrive(ctx: SystemContext, st: NpcState): void {
  const t = st.transit;
  if (!t) return;
  const loc = locationById(ctx.content, t.mapId, t.locId);
  st.transit = null;
  if (!loc) return;
  st.mapId = t.mapId;
  st.locId = loc.id;
  const e = getEntity(ctx.world, st.entityId);
  if (!e) return;
  const pt = pointIn(loc, ctx.rng('npc.move'));
  const visible = t.mapId === ctx.world.slices.npc.playerMap;
  if (e.mapId !== t.mapId) teleportEntity(ctx, e.id, t.mapId, pt.x, pt.y);
  else if (!visible || !orderMove(ctx, e.id, pt.x, pt.y, 0.3))
    teleportEntity(ctx, e.id, t.mapId, pt.x, pt.y);
}

/** Advance every cross-map walk (on the follower cadence). */
export function stepTransits(ctx: SystemContext): void {
  if (ctx.tick % FOLLOW_TICKS !== 0) return;
  const slice = ctx.world.slices.npc;
  for (const id of sortedNpcIds(slice.npcs)) {
    const st = slice.npcs[id] as NpcState;
    const t = st.transit;
    if (!t) continue;
    const e = getEntity(ctx.world, st.entityId);
    if (!e || st.gone) {
      st.transit = null;
      continue;
    }
    // the player no longer sees the walk: the rest of the way is snapped
    if (e.mapId !== slice.playerMap) {
      arrive(ctx, st);
      continue;
    }
    if (e.mapId === t.mapId) {
      arrive(ctx, st);
      continue;
    }
    const exit = mapById(ctx.content, e.mapId)?.exits.find((x) => x.id === t.exitId);
    if (!exit) {
      arrive(ctx, st);
      continue;
    }
    const dx = e.x - (exit.x + 0.5);
    const dy = e.y - (exit.y + 0.5);
    if (Math.hypot(dx, dy) > 1.2) {
      // a walk that cannot reach the gate within the hour gives up and is snapped (a walk
      // loaded from a save without its start time starts the hour now)
      t.since ??= ctx.tick;
      if (ctx.tick - t.since > TRANSIT_GIVE_UP) arrive(ctx, st);
      else if (!e.move && !orderMove(ctx, e.id, exit.x + 0.5, exit.y + 0.5, 0.6)) arrive(ctx, st);
      continue;
    }
    // through the gate: the arrival place on the next map
    const arrival = exit.toLocation
      ? locationById(ctx.content, exit.toMap, exit.toLocation)
      : undefined;
    const x = arrival ? arrival.x + arrival.w / 2 : exit.toX;
    const y = arrival ? arrival.y + arrival.h / 2 : exit.toY;
    teleportEntity(ctx, e.id, exit.toMap, x, y);
    st.mapId = exit.toMap;
    const card = cardOf(slice, ctx.content, id);
    if (card)
      track(
        st,
        'leave',
        placeRef(card.map, exit.toMap, arrival?.id ?? ''),
        calendarAt(ctx.tick).hour,
      );
    if (exit.toMap === t.mapId) {
      arrive(ctx, st);
      continue;
    }
    const next = nextExit(ctx.content, ctx.world.meta.flags, exit.toMap, t.mapId);
    if (!next) {
      arrive(ctx, st);
      continue;
    }
    st.transit = { ...t, exitId: next.id, since: ctx.tick };
    orderMove(ctx, e.id, next.x + 0.5, next.y + 0.5, 0.6);
  }
}
