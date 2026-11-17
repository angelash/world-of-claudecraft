// Deeds, titles and the pillar (catalog_deeds_titles.md 1.3 to 1.5, 2.2 to 2.4, 2.8): when
// a deed holds, granting it, the titles it and the world name you by, and the deeds the
// player carves on the pillar of the inner court. Deeds and titles change how you are
// recorded and called, never a number (2.8): granting writes the mirrors `deed.<id>` and
// `title.<id>` and emits `deed.granted` (the doors read deeds as history keys, the client
// maps them to achievements), nothing else.

import type { ContentMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { evaluate } from '../quests/conditions';
import type {
  CodexBook,
  DeedDef,
  Grade,
  RecordsConfig,
  RecordsSlice,
  Resolve,
  StatTrigger,
  TitleDef,
} from './types';
import { GRADES } from './types';

/** The value of a records counter (`kills`, `kills.<monster>`, `codex.<tab>`). */
export function statValue(codex: CodexBook, key: string): number {
  if (key === 'kills') {
    let n = 0;
    for (const r of Object.values(codex.monsters)) n += r.count;
    return n;
  }
  if (key.startsWith('kills.')) return codex.monsters[key.slice(6)]?.count ?? 0;
  if (key.startsWith('codex.')) {
    const tab = codex[key.slice(6) as keyof CodexBook];
    return tab ? Object.keys(tab).length : 0;
  }
  return 0;
}

const statHolds = (codex: CodexBook, s: StatTrigger | undefined): boolean =>
  !s || statValue(codex, s.key) >= s.min;

/** True when every trigger field of a deed holds (manual deeds: the gate of the grant). */
export function deedTriggerHolds(def: DeedDef, s: RecordsSlice, resolve: Resolve): boolean {
  if (def.when && !evaluate(def.when, resolve)) return false;
  if (!statHolds(s.codex, def.stat)) return false;
  if (def.held && !def.held.every((id) => s.codex.items[id] !== undefined)) return false;
  if (def.met && !def.met.every((id) => s.codex.people[id] !== undefined)) return false;
  return true;
}

/** A deed the settle grants by itself (not manual, with a trigger). */
export function isAutoDeed(def: DeedDef): boolean {
  return !def.manual && !!(def.when || def.stat || def.held || def.met);
}

/** The deed is a branch deed whose branch is closed this cycle, and it is not earned. */
export function branchMissing(
  def: DeedDef,
  s: RecordsSlice | undefined,
  resolve: Resolve,
): boolean {
  if (!def.branch || s?.deeds[def.id]) return false;
  return evaluate(def.branch.when, resolve);
}

export const gradeRank = (g: Grade): number => GRADES.indexOf(g);

export function titleDef(content: ContentMap, id: string): TitleDef | undefined {
  return (content.titles ?? []).find((t) => t.id === id);
}

export function deedDef(content: ContentMap, id: string): DeedDef | undefined {
  return (content.deeds ?? []).find((d) => d.id === id);
}

/** Record a title as held; false when it was already granted (held or lost). */
export function grantTitle(
  ctx: SystemContext,
  s: RecordsSlice,
  def: TitleDef,
  deedId?: string,
): boolean {
  if (s.titles[def.id]) return false;
  s.titles[def.id] = deedId ? { tick: ctx.tick, deed: deedId } : { tick: ctx.tick };
  ctx.setFlag(`title.${def.id}`, true);
  ctx.emit('title.granted', { titleId: def.id, deedId: deedId ?? null });
  return true;
}

/** Stop wearing whatever is worn. */
export function unwear(ctx: SystemContext, s: RecordsSlice): void {
  if (s.worn === null) return;
  s.worn = null;
  ctx.setFlag('player.title', 'none');
  ctx.emit('title.worn', { titleId: null });
}

/** Mark a held title lost (superseded, revoked, faded); a worn one comes off. */
export function loseTitle(ctx: SystemContext, s: RecordsSlice, def: TitleDef): boolean {
  const r = s.titles[def.id];
  if (!r || r.lost !== undefined) return false;
  r.lost = ctx.tick;
  ctx.setFlag(`title.${def.id}.lost`, true);
  if (s.worn === def.id) unwear(ctx, s);
  ctx.emit('title.lost', { titleId: def.id });
  return true;
}

/** Record a deed as earned, with its reward title; false when it was already earned. */
export function grantDeed(
  ctx: SystemContext,
  s: RecordsSlice,
  def: DeedDef,
  grade: Grade = def.grade ?? 'claimed',
): boolean {
  if (s.deeds[def.id]) return false;
  s.deeds[def.id] = { tick: ctx.tick, grade };
  ctx.setFlag(`deed.${def.id}`, true);
  ctx.emit('deed.granted', { deedId: def.id, grade, fame: def.fame });
  const reward = def.reward?.title ? titleDef(ctx.content, def.reward.title) : undefined;
  if (reward) grantTitle(ctx, s, reward, def.id);
  return true;
}

/** One settle pass over the deeds and titles; true when anything changed. */
export function settleBook(ctx: SystemContext, s: RecordsSlice, resolve: Resolve): boolean {
  let changed = false;
  for (const def of ctx.content.deeds ?? []) {
    if (s.deeds[def.id] || !isAutoDeed(def)) continue;
    if (deedTriggerHolds(def, s, resolve)) changed = grantDeed(ctx, s, def) || changed;
  }
  for (const def of ctx.content.titles ?? []) {
    const held = s.titles[def.id];
    if (!held) {
      if (def.grant && evaluate(def.grant.when, resolve))
        changed = grantTitle(ctx, s, def) || changed;
    } else if (held.lost === undefined && def.lose && evaluate(def.lose.when, resolve)) {
      changed = loseTitle(ctx, s, def) || changed;
    }
  }
  return changed;
}

/** Pillar slots open now: 0 while the pillar is locked, else the largest tier that holds. */
export function pillarSlots(config: RecordsConfig | undefined, resolve: Resolve): number {
  if (!config) return 0;
  if (config.pillar.requires && !evaluate(config.pillar.requires, resolve)) return 0;
  let n = 0;
  for (const t of config.pillar.tiers)
    if (!t.when || evaluate(t.when, resolve)) n = Math.max(n, t.slots);
  return n;
}

/**
 * Bring the mirrors in line with the slice (the slice is the record). A content rename
 * moves a deed, title or letter id in the slice (`idFields`) while the old flag name still
 * fits the family pattern and is not rewritten, so the first settle of a loaded world
 * writes the mirrors of the new ids. A no-op on a world that never left memory.
 */
export function syncMirrors(ctx: SystemContext, s: RecordsSlice): void {
  const flags = ctx.world.meta.flags;
  for (const id of Object.keys(s.deeds))
    if (flags[`deed.${id}`] !== true) ctx.setFlag(`deed.${id}`, true);
  for (const [id, r] of Object.entries(s.titles)) {
    if (flags[`title.${id}`] !== true) ctx.setFlag(`title.${id}`, true);
    if (r.lost !== undefined && flags[`title.${id}.lost`] !== true)
      ctx.setFlag(`title.${id}.lost`, true);
  }
  // `player.title` reads `none` when unwritten (its registry default)
  const worn = s.worn ?? 'none';
  if ((flags['player.title'] ?? 'none') !== worn) ctx.setFlag('player.title', worn);
  for (const [id, r] of Object.entries(s.letters)) {
    if (flags[`letter.${id}`] !== r.state) ctx.setFlag(`letter.${id}`, r.state);
    if (r.reply && flags[`letter.${id}.reply`] !== r.reply)
      ctx.setFlag(`letter.${id}.reply`, r.reply);
  }
}
