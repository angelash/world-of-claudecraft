// The story hooks of the ailments system (act1_borderstone.md 7.1, 7.2): sediment tracks,
// world variables that move by the act week (the town's sediment `a1_town_dian`: 15 in the
// first week, +8 a week while the north spring runs, +3 once the seep culvert is blocked,
// 0 once the spring is boarded), and scripted cases, named sufferers whose sickness the
// story fixes (the children). A case's stage shows on `sed_case.<case>` for quests, scenes
// and barks to read; who dies, and when, stays with the story. Every name of a variable,
// a case and a condition comes from data/ailments/.

import type { ContentMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { evaluate, flagResolver, referencedVars } from '../quests/conditions';
import { ailmentsSlice } from './slice';
import { CASE_STAGES, type CaseDef, type CaseStage, type TrackDef } from './types';

/** The act week flag the tracks count by (world_state_registry.md 8.1). */
export const WEEK_FLAG = 'act_week';
/** The mirror family of the cases (world_state_registry.md 8.6). */
export const CASE_PREFIX = 'sed_case.';

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** The change of a track for a week that starts now: the first rule that holds, or the base. */
export function weeklyChange(def: TrackDef, holds: (when: string) => boolean): number {
  for (const r of def.rules ?? []) if (holds(r.when)) return r.weekly;
  return def.weekly;
}

/**
 * Settle every running track up to the current act week: on its first week it starts at
 * `start` (unless something wrote the variable already), then each new week adds its
 * change, kept inside min..max. External writes (a quest's -20) stay, the weeks build on them.
 */
export function settleTracks(ctx: SystemContext): void {
  const defs = ctx.content.sedimentTracks ?? [];
  if (defs.length === 0) return;
  const week = num(ctx.flag(WEEK_FLAG)) ?? 0;
  if (week < 1) return;
  const s = ailmentsSlice(ctx.world);
  for (const def of defs) {
    const resolve = flagResolver(ctx.world.meta.flags);
    if (!evaluate(def.when, resolve)) continue;
    const last = s.tracks[def.id];
    const lo = def.min ?? 0;
    const hi = def.max ?? 100;
    if (last === undefined || week < last) {
      if (last === undefined && num(ctx.flag(def.var)) === undefined)
        ctx.setFlag(def.var, Math.max(lo, Math.min(hi, def.start)));
      s.tracks[def.id] = week;
      continue;
    }
    for (let w = last + 1; w <= week; w++) {
      const holds = (when: string) => evaluate(when, flagResolver(ctx.world.meta.flags));
      const now = num(ctx.flag(def.var)) ?? 0;
      const next = Math.max(lo, Math.min(hi, now + weeklyChange(def, holds)));
      if (next !== now) ctx.setFlag(def.var, next);
    }
    s.tracks[def.id] = week;
  }
}

const order = (c: CaseStage) => CASE_STAGES.indexOf(c);

/**
 * The stage a case moves to now: the furthest step that holds and lies past the current
 * stage, then cured if it is ill and its cure holds (a cure counts only once the case fell
 * ill, and in the same pass it falls ill). Never back.
 */
export function caseStageNow(
  def: CaseDef,
  current: CaseStage,
  holds: (when: string) => boolean,
): CaseStage {
  if (current === 'cured') return current;
  let out = current;
  for (const step of def.steps)
    if (order(step.stage) > order(out) && holds(step.when)) out = step.stage;
  if (out !== 'none' && def.cure && holds(def.cure.when)) return 'cured';
  return out;
}

/** Move every case whose conditions changed; the stage shows on `sed_case.<case>`. */
export function settleCases(ctx: SystemContext): void {
  const defs = ctx.content.sedCases ?? [];
  if (defs.length === 0) return;
  const s = ailmentsSlice(ctx.world);
  const holds = (when: string) => evaluate(when, flagResolver(ctx.world.meta.flags));
  for (const def of defs) {
    const from = s.cases[def.id] ?? 'none';
    const stage = caseStageNow(def, from, holds);
    if (stage === from) continue;
    s.cases[def.id] = stage;
    ctx.setFlag(`${CASE_PREFIX}${def.id}`, stage);
    ctx.emit('ailments.case', { caseId: def.id, stage, from });
  }
}

const watched = new WeakMap<object, Set<string>>();

/**
 * The flags the story hooks read: the act and its week, every variable a track keeps and
 * every name in a track's or a case's conditions. Only a change of one of them settles the
 * hooks again (computed once per content).
 */
export function storyFlags(content: ContentMap): Set<string> {
  const key = content as object;
  let out = watched.get(key);
  if (out) return out;
  out = new Set<string>(['act', WEEK_FLAG]);
  const add = (src: string | undefined) => {
    if (src) for (const v of referencedVars(src)) out?.add(v);
  };
  for (const t of content.sedimentTracks ?? []) {
    out.add(t.var);
    add(t.when);
    for (const r of t.rules ?? []) add(r.when);
  }
  for (const c of content.sedCases ?? []) {
    for (const s of c.steps) add(s.when);
    add(c.cure?.when);
  }
  watched.set(key, out);
  return out;
}

/** Settle the tracks, then the cases that read them, when a flag moved. */
export function settleStory(ctx: SystemContext): void {
  const s = ailmentsSlice(ctx.world);
  if (!s.dirty) return;
  s.dirty = false;
  settleTracks(ctx);
  settleCases(ctx);
}
