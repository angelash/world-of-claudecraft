// The guild slice: creation, the load-time backfill and the save check (release_engineering.md
// 5.5). Saves written before this system existed carry no `guild` slice; it is created on
// first use, empty, and the boards fill at their next check, so a loaded game goes on as if
// the guild had always stood there with nothing posted yet.

import type { IdField } from '../../core/save/renames';
import type { World } from '../../core/world';
import { isRank } from './ranks';
import type { EventsState, GuildSlice, PostingState } from './types';

export function emptyEvents(): EventsState {
  return {
    pending: [],
    active: [],
    log: [],
    last: {},
    count: {},
    tide: {},
    severe: {},
    rolled: -1,
    dropped: {},
  };
}

export function emptyGuildSlice(): GuildSlice {
  return {
    member: null,
    boards: {},
    postings: {},
    serial: {},
    week: -1,
    weekly: {},
    total: {},
    cooldown: {},
    firstDone: [],
    ledger: { cut: 0, paid: 0 },
    events: emptyEvents(),
    dirty: true,
  };
}

/** The slice for writing, created on first use (a save from before this system). */
export function guildSlice(world: World): GuildSlice {
  const w = world as World & { slices: { guild?: GuildSlice } };
  if (!w.slices.guild) w.slices.guild = emptyGuildSlice();
  return w.slices.guild;
}

/** The slice for reading, or undefined when the guild never ran (never creates it). */
export function readGuild(world: { slices: object }): GuildSlice | undefined {
  return (world.slices as { guild?: GuildSlice }).guild;
}

/** Where the slice keeps content ids, for the rename table (5.5 `idFields`). */
export const GUILD_ID_FIELDS: readonly IdField[] = [
  { path: 'postings.*.template', kind: 'commission' },
  { path: 'postings.*.board', kind: 'board' },
  { path: 'postings.*.giver', kind: 'npc' },
  { path: 'postings.*.recipient', kind: 'npc' },
  { path: 'postings.*.target', kind: 'monster' },
  { path: 'postings.*.item', kind: 'item' },
  { path: 'postings.*.place.mapId', kind: 'map' },
  { path: 'boards.@keys', kind: 'board' },
  { path: 'weekly.@keys', kind: 'commission', merge: 'sum' },
  { path: 'total.@keys', kind: 'commission', merge: 'sum' },
  { path: 'cooldown.@keys', kind: 'commission' },
  { path: 'firstDone.*', kind: 'commission' },
  { path: 'events.last.@keys', kind: 'event' },
  { path: 'events.count.@keys', kind: 'event', merge: 'sum' },
  { path: 'events.dropped.@keys', kind: 'event', merge: 'sum' },
  { path: 'events.pending.*.template', kind: 'event' },
  { path: 'events.active.*.template', kind: 'event' },
  { path: 'events.log.*.template', kind: 'event' },
];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min = Number.MIN_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min;
const STATES = new Set<PostingState>([
  'posted',
  'accepted',
  'done',
  'failed',
  'expired',
  'withdrawn',
]);

function numbers(v: unknown, at: string, out: string[], min = 0): void {
  if (!isObj(v)) {
    out.push(`${at} is not an object`);
    return;
  }
  for (const [k, n] of Object.entries(v)) if (!isInt(n, min)) out.push(`${at}.${k} is not a count`);
}

/** The save check of the slice: the problems found, empty when it is sound. */
export function validateGuildSlice(slice: unknown): string[] {
  const out: string[] = [];
  // a save from before the guild existed: the slice is created on first use
  if (slice === undefined) return out;
  if (!isObj(slice)) return ['guild is not an object'];
  const s = slice as Record<string, unknown>;
  if (s.member !== null) {
    const m = s.member;
    if (!isObj(m)) out.push('guild.member is not a record');
    else {
      if (!isRank(m.rank)) out.push('guild.member.rank is unknown');
      if (!isInt(m.registeredTick, 0)) out.push('guild.member.registeredTick is not a tick');
      numbers(m.done, 'guild.member.done', out);
      if (!isInt(m.defaults, 0)) out.push('guild.member.defaults is not a count');
      if (!isInt(m.merit, 0)) out.push('guild.member.merit is not a count');
      if (!Array.isArray(m.history)) out.push('guild.member.history is not a list');
    }
  }
  if (!isObj(s.postings)) out.push('guild.postings is not an object');
  else
    for (const [id, p] of Object.entries(s.postings)) {
      if (!isObj(p) || p.id !== id) {
        out.push(`guild.postings.${id} is not a posting`);
        continue;
      }
      if (!STATES.has(p.state as PostingState)) out.push(`guild.postings.${id}.state is unknown`);
      if (!isRank(p.rank)) out.push(`guild.postings.${id}.rank is unknown`);
      if (typeof p.template !== 'string') out.push(`guild.postings.${id}.template is missing`);
      if (!isInt(p.reward, 0)) out.push(`guild.postings.${id}.reward is not copper`);
    }
  if (!isObj(s.boards)) out.push('guild.boards is not an object');
  numbers(s.serial, 'guild.serial', out);
  numbers(s.weekly, 'guild.weekly', out);
  numbers(s.total, 'guild.total', out);
  numbers(s.cooldown, 'guild.cooldown', out, -1);
  if (!isInt(s.week, -1)) out.push('guild.week is not a week');
  if (!Array.isArray(s.firstDone)) out.push('guild.firstDone is not a list');
  const e = s.events;
  if (!isObj(e)) out.push('guild.events is missing');
  else {
    for (const k of ['pending', 'active', 'log'] as const)
      if (!Array.isArray(e[k])) out.push(`guild.events.${k} is not a list`);
    for (const k of ['last', 'count', 'tide', 'severe', 'dropped'] as const)
      numbers(e[k], `guild.events.${k}`, out, -1);
    if (!isInt(e.rolled, -1)) out.push('guild.events.rolled is not a day');
  }
  return out;
}
