// The codex ledger (ux_and_onboarding.md 6.3.2): who you met, what your side killed, what
// you held, read, collected and watched, learned from the facts other systems already
// emit (`player.talked`, `combat.kill`, `inventory.changed`, the mirrors `read.<item>`,
// `col.<collection>.done` and `scene.<scene>.seen`), plus the codex notes of the content
// (what you know about a subject and how you know it), discovered once their subject is.
// Only what was met is listed: the codex has no silhouettes and no denominators.

import type { ContentMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import type { World } from '../../core/world';
import { holdingOf } from '../inventory';
import { evaluate } from '../quests/conditions';
import { getEntity } from '../world';
import type { CodexTab, RecordsSlice, Resolve } from './types';
import { watchOf } from './watch';

/** The flag mirrors that discover a codex subject: prefix, suffix, tab. */
const FLAG_SOURCES: readonly { prefix: string; suffix: string; tab: CodexTab }[] = [
  { prefix: 'read.', suffix: '', tab: 'books' },
  { prefix: 'col.', suffix: '.done', tab: 'collections' },
  { prefix: 'scene.', suffix: '.seen', tab: 'memories' },
];

/**
 * Note a meeting with a codex subject: the first one discovers it (`codex.discovered`), later
 * ones move `last` and add to `count`. Returns true when the subject is new.
 */
export function discover(
  ctx: SystemContext,
  s: RecordsSlice,
  tab: CodexTab,
  subject: string,
  opts: { count?: number; map?: string } = {},
): boolean {
  const book = s.codex[tab];
  const add = opts.count ?? 1;
  const r = book[subject];
  if (r) {
    r.last = ctx.tick;
    r.count += add;
    if (opts.map) r.map = opts.map;
    if (tab === 'monsters' && watchOf(ctx.content).kills) s.dirty = true;
    return false;
  }
  book[subject] = opts.map
    ? { first: ctx.tick, last: ctx.tick, count: add, map: opts.map }
    : { first: ctx.tick, last: ctx.tick, count: add };
  s.dirty = true;
  ctx.emit('codex.discovered', { tab, subject });
  return true;
}

/** The codex subject a flag mirror names when it turns true, or null. */
export function flagSubject(key: string): { tab: CodexTab; subject: string } | null {
  for (const f of FLAG_SOURCES) {
    if (!key.startsWith(f.prefix) || !key.endsWith(f.suffix)) continue;
    const subject = key.slice(f.prefix.length, key.length - f.suffix.length);
    if (subject !== '' && !subject.includes('.')) return { tab: f.tab, subject };
  }
  return null;
}

/**
 * The codex of a save from before this system, from what its world already shows: the
 * books read, the collections done and the scenes seen (their mirrors), and the items the
 * player holds now. Meetings and kills before the save left no trace and stay unknown.
 */
export function backfillCodex(world: World, s: RecordsSlice): void {
  const tick = world.meta.tick;
  const note = (tab: CodexTab, subject: string, count: number) => {
    if (!s.codex[tab][subject]) s.codex[tab][subject] = { first: tick, last: tick, count };
  };
  for (const [key, value] of Object.entries(world.meta.flags)) {
    if (value !== true) continue;
    const hit = flagSubject(key);
    if (hit) note(hit.tab, hit.subject, 1);
  }
  const player = world.slices.world?.playerId;
  if (player && world.slices.inventory) {
    for (const [item, n] of Object.entries(holdingOf(world, player).items))
      if (n > 0) note('items', item, n);
  }
}

const persons = new WeakMap<object, ReadonlySet<string>>();

/** Named persons of the content (npcs and companions): the people the codex lists. */
export function isNamedPerson(content: ContentMap, id: string): boolean {
  let set = persons.get(content);
  if (!set) {
    set = new Set([...(content.npcs ?? []), ...(content.companions ?? [])].map((p) => p.id));
    persons.set(content, set);
  }
  return set.has(id);
}

/** The player or one of the player's companions. */
export function isPlayerSide(ctx: SystemContext, id: string | undefined): boolean {
  if (!id) return false;
  const w = ctx.world.slices.world;
  if (!w) return false;
  if (id === w.playerId) return true;
  const e = getEntity(ctx.world, id);
  return !!e && (e.kind === 'companion' || e.tags.includes('companion'));
}

/** The map the player stands on, if there is a player. */
export function playerMap(ctx: SystemContext): string | undefined {
  const w = ctx.world.slices.world;
  return w ? w.entities[w.playerId]?.mapId : undefined;
}

/** One settle pass over the codex notes; true when a note was discovered. */
export function settleNotes(ctx: SystemContext, s: RecordsSlice, resolve: Resolve): boolean {
  let changed = false;
  for (const e of ctx.content.codexEntries ?? []) {
    if (s.notes[e.id] !== undefined) continue;
    if (!s.codex[e.tab][e.subject]) continue;
    if (e.when && !evaluate(e.when, resolve)) continue;
    s.notes[e.id] = ctx.tick;
    ctx.emit('codex.noted', { entryId: e.id, tab: e.tab, subject: e.subject });
    changed = true;
  }
  return changed;
}
