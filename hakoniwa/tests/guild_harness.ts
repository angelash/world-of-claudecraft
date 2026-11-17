// Test harness for the guild system (PK-M1-47): the narrative systems plus the guild, the
// other teams' stand-in (kills, talks), a probe that gives money and items, and an hour
// strider for long waits (the long tier of a time skip, so a week passes in 168 steps).

import { Engine, ok } from '../src/core';
import type {
  AnyWorldEvent,
  CommandKind,
  CommandMap,
  CommandSource,
  ContentMap,
  EventKind,
  EventMap,
  FlagValue,
} from '../src/core/contracts';
import type { GameSystem } from '../src/core/system';
import { calendarAt, TICKS_PER_GAME_HOUR } from '../src/core/time';
import type { World } from '../src/core/world';
import { boardDef, commissionDef, system as guild, post } from '../src/systems/guild';
import type { GuildSlice } from '../src/systems/guild/types';
import { addItem, addMoney } from '../src/systems/inventory';
import { attachSkipHandlers } from '../src/systems/travel/skip_registry';
import { NARRATIVE_SYSTEMS, narrativeContent, otherTeamsStub } from './narrative_harness';

declare module '../src/core/contracts' {
  interface CommandMap {
    'gh.money': { amount: number };
    'gh.item': { item: string; count: number };
    'gh.post': { templateId: string; board: string };
    'gh.emit': { kind: string; data: unknown };
  }
}

const probe: GameSystem = {
  id: 'zz_guild_probe',
  order: 5,
  commands: {
    'gh.money'(ctx, d) {
      addMoney(ctx, ctx.world.slices.world.playerId, d.amount, 'test');
      return ok();
    },
    'gh.item'(ctx, d) {
      addItem(ctx, ctx.world.slices.world.playerId, d.item, d.count, 'test');
      return ok();
    },
    'gh.emit'(ctx, d) {
      ctx.emit(d.kind as EventKind, d.data as EventMap[EventKind]);
      return ok();
    },
    'gh.post'(ctx, d) {
      const board = boardDef(ctx, d.board);
      const t = commissionDef(ctx.content, d.templateId);
      if (board && t) post(ctx, board, t);
      return ok();
    },
  },
};

const stride = { on: false };
const strider: GameSystem = {
  id: 'zz_guild_stride',
  order: 1,
  clock(world) {
    if (!stride.on) return null;
    const t = world.meta.tick;
    return { stride: TICKS_PER_GAME_HOUR - (t % TICKS_PER_GAME_HOUR), hold: null };
  },
};

export const BASE: ContentMap = narrativeContent();

export interface G {
  g: Engine;
  events: AnyWorldEvent[];
}

/** A game in act 1 (the act clock starts at once) with the guild running. */
export function guildGame(
  opts: { seed?: number; content?: ContentMap; act?: string; extra?: GameSystem[] } = {},
): G {
  stride.on = false;
  const systems = attachSkipHandlers([
    ...NARRATIVE_SYSTEMS,
    guild,
    otherTeamsStub,
    probe,
    strider,
    ...(opts.extra ?? []),
  ]);
  const g = Engine.create(opts.seed ?? 4747, opts.content ?? BASE, systems, { aiMode: 'off' });
  const events: AnyWorldEvent[] = [];
  g.onEvents((evs) => events.push(...evs));
  g.queue('flag.set', { key: 'act', value: opts.act ?? 'act1' });
  g.step(2);
  return { g, events };
}

/** Resume a saved world (a JSON copy) with the same systems. */
export function resumeGuildGame(world: World, content: ContentMap = BASE): G {
  stride.on = false;
  const systems = attachSkipHandlers([...NARRATIVE_SYSTEMS, guild, otherTeamsStub, probe, strider]);
  const g = Engine.resume(world, content, systems, { aiMode: 'off' });
  const events: AnyWorldEvent[] = [];
  g.onEvents((evs) => events.push(...evs));
  g.step(2);
  return { g, events };
}

export const flags = (g: Engine): Record<string, FlagValue> => g.world.meta.flags;
export const gs = (g: Engine): GuildSlice => g.world.slices.guild;
export const today = (g: Engine): number => calendarAt(g.world.meta.tick).dayIndex;

/** Advance whole game hours on the hour strider (step counts ticks; each step is an hour). */
export function hours(t: G, n: number): void {
  stride.on = true;
  t.g.step(n * TICKS_PER_GAME_HOUR);
  stride.on = false;
  t.g.step(1);
}

/** Advance to the start of the next calendar week (Monday 00:00) and one hour into it. */
export function nextWeek(t: G): void {
  const cal = calendarAt(t.g.world.meta.tick);
  const left = (7 - cal.weekday) * 24 + (24 - cal.hour);
  hours(t, left + 1);
}

export function set(t: G, key: string, value: FlagValue): void {
  t.g.queue('flag.set', { key, value });
  t.g.step(2);
}

/** Put the player in front of a board (inside its place). */
export function goToBoard(t: G, boardId: string): void {
  const board = t.g.content.guildBoards.find((b) => b.id === boardId);
  const map = t.g.content.maps.find((m) => m.id === board?.mapId);
  const loc = map?.locations.find((l) => l.id === board?.location);
  if (!board || !map) throw new Error(`no board ${boardId}`);
  t.g.queue('world.teleport', {
    entityId: t.g.world.slices.world.playerId,
    mapId: map.id,
    x: loc ? loc.x + loc.w / 2 : 3,
    y: loc ? loc.y + loc.h / 2 : 3,
  });
  t.g.step(2);
}

/** Put the player on a map, away from any board. */
export function goTo(t: G, mapId: string): void {
  t.g.queue('world.teleport', { entityId: t.g.world.slices.world.playerId, mapId, x: 3, y: 3 });
  t.g.step(2);
}

export function money(t: G, amount: number): void {
  t.g.queue('gh.money', { amount });
  t.g.step(1);
}

export function kill(t: G, ref: string, mapId: string, n = 1): void {
  for (let i = 0; i < n; i++) t.g.queue('stub.kill', { ref, kind: 'monster', mapId });
  t.g.step(2);
}

export function talk(t: G, npc: string): void {
  t.g.queue('stub.talk', { npc });
  t.g.step(2);
}

/** Run a command (the player's by default) and return its result. */
export function cmd<K extends CommandKind>(
  t: G,
  kind: K,
  data: CommandMap[K],
  source?: CommandSource,
): { ok: boolean; code?: string } {
  const before = t.events.length;
  t.g.queue(kind, data, source);
  t.g.step(2);
  const res = t.events
    .slice(before)
    .find((e) => e.kind === 'command.result' && e.data.kind === kind);
  return res && res.kind === 'command.result'
    ? { ok: res.data.ok, code: res.data.code }
    : { ok: false };
}

export function playerMoney(t: G): number {
  const ws = t.g.world.slices.world;
  return t.g.world.slices.inventory.owners[ws.playerId]?.money ?? 0;
}

export function emit<K extends EventKind>(t: G, kind: K, data: EventMap[K]): void {
  t.g.queue('gh.emit', { kind, data });
  t.g.step(2);
}

/** A bare cognition slice, so the rumor engine and the comedy gate run without the NPC systems. */
export function withCognition(t: G): void {
  (t.g.world.slices as { cognition?: unknown }).cognition = {
    beliefs: {},
    rumors: {},
    holdings: {},
    crowd: {},
    appraisals: [],
    comedy: {},
    comedyStreak: {},
    recentFeats: {},
  };
}
