// Doors system (千门回廊, thousand_doors.md): tracks every door's state (hidden, hinted,
// openable, opened, locked, closed) and hint level, counts the events its keys ask for,
// records visits, grows the corridor's segments, opens story doors on their own, applies
// door effects through the combat ports, and keeps the door costs: the door rank (4), the
// seal points and stage with seal_unrest (6.4), blockage (6.2) and door fatigue (6.3).
// The opening settles in the fixed order of 3.5.

import { ok, reject } from '../../core';
import type { EventKind } from '../../core/contracts';
import type { EventHandler, GameSystem, SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { TICK_HZ } from '../../core/time';
import { removeItem } from '../inventory';
import { registerSkipHandler } from '../travel/skip_registry';
import { getEntity, mapById } from '../world';
import { costFlagWritten, playerReturned, settleFatigue, taintChanged } from './costs';
import { applyDoorEffects, revertDoorEffects } from './effects';
import { applyExclusion, liftActLocks } from './exclusive';
import { discover, droughtHint, onSlept } from './hints';
import { actNumber, consumedItems, countEvent, keysMet, readDoor, visitTargets } from './keys';
import { contentCurve, rankFromPoints, rankValueOf } from './rank';
import { sealFlagWritten, sealOnClose, sealOnOpen, unrestOnOpen, updateStage } from './seal';
import { advanceSequences } from './sequence';
import { ensureDoorEntries, ensureSlice, freshSlice } from './slice';
import { setState } from './state';
import { COUNTABLE_EVENTS, type DoorDef, type DoorStatus } from './types';

export type * from './types';
export * from './view';

const EVERY = 10;

/** Events door keys may count. Doors listens to all of them; counters filter by content. */
const COUNTABLE: readonly EventKind[] = COUNTABLE_EVENTS;

function doorDef(ctx: SystemContext, id: string): DoorDef | undefined {
  return (ctx.content.doors ?? []).find((d) => d.id === id);
}

function bump(ctx: SystemContext, key: string, delta: number, min = 0, max = 1000): void {
  const cur = ctx.flag(key);
  const n = typeof cur === 'number' ? cur : 0;
  ctx.setFlag(key, Math.max(min, Math.min(max, n + delta)));
}

/** Add a door's rank value and recompute the rank (only an opening moves it, 4.1). */
function advanceRank(ctx: SystemContext, door: DoorDef): void {
  const slice = ensureSlice(ctx.world, ctx.content);
  const from = slice.rank ?? 1;
  slice.rankPoints = (slice.rankPoints ?? 0) + rankValueOf(door);
  const to = rankFromPoints(contentCurve(ctx.content), slice.rankPoints);
  slice.rank = to;
  if (to !== from || ctx.flag('door_rank') !== to) ctx.setFlag('door_rank', to);
  if (to !== from) ctx.emit('doors.rank_up', { rank: to, from });
}

/** Close an opened door (3.6): powers taken back, part of the seal settles; never reopens. */
export function closeDoor(ctx: SystemContext, door: DoorDef): void {
  revertDoorEffects(ctx, door);
  ctx.setFlag(`door.${door.id}`, false);
  const delta = sealOnClose(ctx, door);
  setState(ctx, door.id, 'closed');
  ctx.emit('doors.closed', { doorId: door.id, sealDelta: delta });
}

/** Open a door, settling in the order of thousand_doors.md 3.5. */
export function openDoor(ctx: SystemContext, door: DoorDef): void {
  const slice = ensureSlice(ctx.world, ctx.content);
  const pid = ctx.world.slices.world.playerId;
  // 1. the item keys that go into the door
  for (const used of consumedItems(ctx.world, door, ctx.content))
    removeItem(ctx, pid, used.itemId, used.count, 'door_key');
  // 2. effects, 3. the door flag
  applyDoorEffects(ctx, door);
  ctx.setFlag(`door.${door.id}`, true);
  setState(ctx, door.id, 'opened');
  const rt = slice.doors[door.id];
  if (rt) rt.openedTick = ctx.tick;
  // 4. the seal and seal_unrest
  const sealDelta = sealOnOpen(ctx, door);
  unrestOnOpen(ctx, door);
  // 5. the counts
  bump(ctx, 'doors_opened', 1);
  if (door.forbidden) {
    bump(ctx, 'danger_doors_opened', 1);
    if (actNumber(ctx.flag('act')) === 3) bump(ctx, 'danger_doors_act3', 1);
  }
  // 6. the door rank
  advanceRank(ctx, door);
  // 7. exclusion
  applyExclusion(ctx, door, { setState, close: closeDoor });
  // 8. the fact, 9. the drought clock
  ctx.emit('door.opened', { doorId: door.id, sealDelta });
  slice.lastOpenTick = ctx.tick;
  slice.drought = 0;
}

function recordVisits(ctx: SystemContext): void {
  const slice = ctx.world.slices.doors;
  const p = getEntity(ctx.world, ctx.world.slices.world.playerId);
  if (!p) return;
  slice.visited[`map:${p.mapId}`] = true;
  const map = mapById(ctx.content, p.mapId);
  if (!map) return;
  for (const t of visitTargets(ctx.content)) {
    if (t.mapId !== p.mapId || !t.location) continue;
    const key = `loc:${t.mapId}/${t.location}`;
    if (slice.visited[key]) continue;
    const l = map.locations.find((x) => x.id === t.location);
    if (l && p.x >= l.x && p.x <= l.x + l.w && p.y >= l.y && p.y <= l.y + l.h)
      slice.visited[key] = true;
  }
}

/** Re-evaluate every door; open story doors whose keys are met. */
export function refreshDoors(ctx: SystemContext): void {
  const slice = ensureSlice(ctx.world, ctx.content);
  advanceSequences(ctx.world, ctx.content);
  discover(ctx);
  for (const door of ctx.content.doors ?? []) {
    const rt = slice.doors[door.id];
    if (!rt || rt.state === 'opened' || rt.state === 'locked' || rt.state === 'closed') continue;
    const read = readDoor(ctx.world, door, ctx.content);
    let next: DoorStatus = read.met ? 'openable' : read.shown ? 'hinted' : 'hidden';
    if (next === 'hidden' && rt.state !== 'hidden') next = 'hinted';
    // its own keys under way show the door's look (glimpse); a bare hint flag a crack (3.2)
    if (read.shown) {
      const level = read.byKeys ? 2 : 1;
      if ((rt.hintLevel ?? 0) < level) rt.hintLevel = level;
    }
    setState(ctx, door.id, next);
    if (next !== 'openable') continue;
    const waited = (ctx.tick - rt.since) / TICK_HZ;
    if (door.auto || (door.autoAfter !== undefined && waited >= door.autoAfter))
      openDoor(ctx, door);
  }
}

function onFlag(ctx: SystemContext, key: string, value: unknown, previous: unknown): void {
  // a sequence step may have just been met (its order matters, 5.1)
  advanceSequences(ctx.world, ctx.content);
  switch (key) {
    case 'act':
      updateStage(ctx);
      liftActLocks(ctx, setState);
      discover(ctx);
      return;
    case 'p_door_hints':
    case 'feature.door_corridor':
      discover(ctx);
      return;
    case 'seal_looseness':
    case 'seal_points':
      sealFlagWritten(ctx, key);
      return;
    case 'player.taint':
      taintChanged(ctx, value, previous);
      return;
    case 'blockage':
    case 'door_fatigue':
      costFlagWritten(ctx, key);
      return;
    default:
      return;
  }
}

const on: { [K in EventKind]?: EventHandler<K> } = {
  'flag.changed': (ctx, ev) => onFlag(ctx, ev.data.key, ev.data.value, ev.data.previous),
  'time.skipped': (ctx, ev) => {
    if (ev.data.kind === 'sleep' && ev.data.outcome === 'done') onSlept(ctx);
  },
};
for (const kind of COUNTABLE) {
  (on as Record<string, EventHandler<EventKind>>)[kind] = (ctx, ev) => {
    countEvent(ctx.world, ctx.content, ev.kind, ev.data as unknown as Record<string, unknown>);
    advanceSequences(ctx.world, ctx.content);
    if (ev.kind === 'combat.player_returned') playerReturned(ctx);
  };
}

// A time skip's hour-coarse step (travel_and_exploration.md 7.5): the door states refresh
// and the fatigue wears off once per step, as the periodic check would have; a skip is no
// drought (17.4 counts live play only).
registerSkipHandler('doors', (ctx) => {
  ensureDoorEntries(ctx.world, ctx.content);
  recordVisits(ctx);
  settleFatigue(ctx);
  refreshDoors(ctx);
});

export const system: GameSystem = {
  id: 'doors',
  order: 30,

  init(ctx) {
    ctx.world.slices.doors = freshSlice(ctx.content);
  },

  tick(ctx) {
    if (ctx.tick % EVERY !== 5) return;
    const slice = ensureSlice(ctx.world, ctx.content);
    ensureDoorEntries(ctx.world, ctx.content);
    slice.drought = (slice.drought ?? 0) + EVERY;
    // a save from before the door rank and the seal stage: write their mirrors once
    if ((slice.rankPoints ?? 0) > 0 && ctx.flag('door_rank') !== slice.rank)
      ctx.setFlag('door_rank', slice.rank ?? 1);
    updateStage(ctx);
    settleFatigue(ctx);
    recordVisits(ctx);
    refreshDoors(ctx);
    droughtHint(ctx);
  },

  commands: {
    'doors.open'(ctx, d) {
      const door = doorDef(ctx, d.doorId);
      const rt = ctx.world.slices.doors.doors[d.doorId];
      if (!door || !rt) return reject('no_door', tr('sys.doors.reject.no_door'));
      if (rt.state === 'opened') return reject('already_open', tr('sys.doors.reject.already_open'));
      if (rt.state === 'locked') return reject('locked', tr('sys.doors.reject.locked'));
      if (rt.state === 'closed') return reject('closed', tr('sys.doors.reject.closed'));
      if (!keysMet(ctx.world, door, ctx.content))
        return reject('no_key', tr('sys.doors.reject.no_key'));
      openDoor(ctx, door);
      return ok();
    },
    'doors.close'(ctx, d) {
      const door = doorDef(ctx, d.doorId);
      const rt = ctx.world.slices.doors.doors[d.doorId];
      if (!door || !rt) return reject('no_door', tr('sys.doors.reject.no_door'));
      if (rt.state !== 'opened') return reject('not_open', tr('sys.doors.reject.not_open'));
      if (!door.closable) return reject('not_closable', tr('sys.doors.reject.not_closable'));
      closeDoor(ctx, door);
      return ok();
    },
  },

  on,
};
