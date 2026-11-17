// Doors system (千门回廊), phase 30: tracks every door's state (hidden, hinted, openable,
// opened, locked, closed), counts the events its keys ask for, records visits, opens
// story doors on their own, applies door effects to the player through the combat ports,
// and moves the hidden seal variables (power_system.md 9.5 to 9.7, decision D-031).

import { ok, reject } from '../../core';
import type { EventKind } from '../../core/contracts';
import type { EventHandler, GameSystem, SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { TICK_HZ } from '../../core/time';
import { removeItem } from '../inventory';
import { registerSkipHandler } from '../travel/skip_registry';
import { getEntity, mapById } from '../world';
import { applyDoorEffects, revertDoorEffects } from './effects';
import { countEvent, keysMet, revealed, visitTargets } from './keys';
import type { DoorDef, DoorStatus, KeyCond } from './types';

export type * from './types';
export * from './view';

const EVERY = 10;

/** Events door keys may count. Doors listens to all of them; counters filter by content. */
const COUNTABLE: EventKind[] = [
  'combat.kill',
  'combat.boss_defeated',
  'combat.presence_felt',
  'combat.player_returned',
  'combat.wave_cleared',
  'combat.level_up',
  'entity.died',
  'feat.performed',
  'item.used',
  'player.talked',
  'dialogue.option_chosen',
  'building.completed',
  'battle.ended',
  'world.map_changed',
  'door.opened',
  'feature.unlocked',
];

function doorDef(ctx: SystemContext, id: string): DoorDef | undefined {
  return (ctx.content.doors ?? []).find((d) => d.id === id);
}

function setState(ctx: SystemContext, id: string, to: DoorStatus): void {
  const rt = ctx.world.slices.doors.doors[id];
  if (!rt || rt.state === to) return;
  const from = rt.state;
  rt.state = to;
  rt.since = ctx.tick;
  ctx.emit('doors.state', { doorId: id, from, to });
}

function bump(ctx: SystemContext, key: string, delta: number, min = 0, max = 100): void {
  const cur = ctx.flag(key);
  const n = typeof cur === 'number' ? cur : 0;
  ctx.setFlag(key, Math.max(min, Math.min(max, n + delta)));
}

function consumeItems(ctx: SystemContext, keys: KeyCond[]): void {
  const pid = ctx.world.slices.world.playerId;
  for (const k of keys) {
    if (k.type === 'item' && k.consume) removeItem(ctx, pid, k.itemId, k.count ?? 1, 'door_key');
    else if (k.type === 'any') consumeItems(ctx, k.of);
  }
}

/** Open a door: effects, flag door.<id>, seal variables, exclusive locks, door.opened. */
export function openDoor(ctx: SystemContext, door: DoorDef): void {
  const slice = ctx.world.slices.doors;
  applyDoorEffects(ctx, door);
  consumeItems(ctx, door.keys);
  ctx.setFlag(`door.${door.id}`, true);
  bump(ctx, 'seal_looseness', door.sealLooseness);
  bump(ctx, 'seal_unrest', door.sealUnrest);
  bump(ctx, 'doors_opened', 1, 0, 1000);
  if (door.danger) bump(ctx, 'danger_doors_opened', 1, 0, 1000);
  setState(ctx, door.id, 'opened');
  const rt = slice.doors[door.id];
  if (rt) rt.openedTick = ctx.tick;
  for (const other of ctx.content.doors ?? []) {
    if (other.id === door.id) continue;
    const shared = other.exclusive?.some((g) => door.exclusive?.includes(g));
    const st = slice.doors[other.id]?.state;
    if (shared && st !== 'opened' && st !== 'closed') setState(ctx, other.id, 'locked');
  }
  ctx.emit('door.opened', { doorId: door.id, sealDelta: door.sealLooseness });
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
  const slice = ctx.world.slices.doors;
  for (const door of ctx.content.doors ?? []) {
    const rt = slice.doors[door.id];
    if (!rt || rt.state === 'opened' || rt.state === 'locked' || rt.state === 'closed') continue;
    let next: DoorStatus = keysMet(ctx.world, door)
      ? 'openable'
      : revealed(ctx.world, door)
        ? 'hinted'
        : 'hidden';
    if (next === 'hidden' && rt.state !== 'hidden') next = 'hinted';
    setState(ctx, door.id, next);
    if (next !== 'openable') continue;
    const waited = (ctx.tick - rt.since) / TICK_HZ;
    if (door.auto || (door.autoAfter !== undefined && waited >= door.autoAfter))
      openDoor(ctx, door);
  }
}

const on: { [K in EventKind]?: EventHandler<K> } = {};
for (const kind of COUNTABLE) {
  (on as Record<string, EventHandler<EventKind>>)[kind] = (ctx, ev) => {
    countEvent(ctx.world, ctx.content, ev.kind, ev.data as unknown as Record<string, unknown>);
  };
}

// A time skip's hour-coarse step (travel_and_exploration.md 7.5): the door states refresh
// once per step, as the periodic check would have.
registerSkipHandler('doors', (ctx) => {
  recordVisits(ctx);
  refreshDoors(ctx);
});

export const system: GameSystem = {
  id: 'doors',
  order: 30,

  init(ctx) {
    const doors: Record<string, { state: DoorStatus; since: number }> = {};
    for (const d of ctx.content.doors ?? []) doors[d.id] = { state: 'hidden', since: 0 };
    ctx.world.slices.doors = { doors, counters: {}, visited: {} };
  },

  tick(ctx) {
    if (ctx.tick % EVERY !== 5) return;
    recordVisits(ctx);
    refreshDoors(ctx);
  },

  commands: {
    'doors.open'(ctx, d) {
      const door = doorDef(ctx, d.doorId);
      const rt = ctx.world.slices.doors.doors[d.doorId];
      if (!door || !rt) return reject('no_door', tr('sys.doors.reject.no_door'));
      if (rt.state === 'opened') return reject('already_open', tr('sys.doors.reject.already_open'));
      if (rt.state === 'locked') return reject('locked', tr('sys.doors.reject.locked'));
      if (rt.state === 'closed') return reject('closed', tr('sys.doors.reject.closed'));
      if (!keysMet(ctx.world, door)) return reject('no_key', tr('sys.doors.reject.no_key'));
      openDoor(ctx, door);
      return ok();
    },
    'doors.close'(ctx, d) {
      const door = doorDef(ctx, d.doorId);
      const rt = ctx.world.slices.doors.doors[d.doorId];
      if (!door || !rt) return reject('no_door', tr('sys.doors.reject.no_door'));
      if (rt.state !== 'opened') return reject('not_open', tr('sys.doors.reject.not_open'));
      if (!door.closable) return reject('not_closable', tr('sys.doors.reject.not_closable'));
      revertDoorEffects(ctx, door);
      ctx.setFlag(`door.${door.id}`, false);
      const back = Math.floor(door.sealLooseness / 2);
      bump(ctx, 'seal_looseness', -back);
      setState(ctx, door.id, 'closed');
      ctx.emit('doors.closed', { doorId: door.id, sealDelta: -back });
      return ok();
    },
  },

  on,
};
