// The ailments slice: creation, the load-time backfill and the save check (release_engineering
// .md 5.5). A save from before this system has no `ailments` slice; it is made on first use,
// every body healthy, so a loaded game goes on as if no one had been exposed yet.

import type { World } from '../../core/world';
import { freshBody, GRADES } from './formulas';
import {
  type AilmentsSlice,
  CASE_STAGES,
  type CaseStage,
  INJURY_KINDS,
  type InjuryKind,
  SED_STAGES,
  type SedStage,
  type Sufferer,
} from './types';

export function emptyAilmentsSlice(): AilmentsSlice {
  return { bodies: {}, tracks: {}, cases: {}, checked: -1, dirty: true };
}

/** The slice for writing, made on first use. */
export function ailmentsSlice(world: World): AilmentsSlice {
  const w = world as World & { slices: { ailments?: AilmentsSlice } };
  if (!w.slices.ailments) w.slices.ailments = emptyAilmentsSlice();
  return w.slices.ailments;
}

/** The slice for reading, or undefined when the system never ran (never makes it). */
export function readAilments(world: { slices: object }): AilmentsSlice | undefined {
  return (world.slices as { ailments?: AilmentsSlice }).ailments;
}

/** A body's state for writing, made healthy on first use. */
export function bodyOf(world: World, entityId: string): Sufferer {
  const s = ailmentsSlice(world);
  let b = s.bodies[entityId];
  if (!b) {
    b = freshBody();
    s.bodies[entityId] = b;
  }
  return b;
}

/**
 * Take a body out of the slice while its entity is out of the world (a companion standing by
 * at the inn or resting; the party, PK-M1-15). Its owner keeps the record and puts it back
 * with putBody when the entity returns, so no dawn check drops it and nothing counts twice.
 */
export function takeBody(world: World, entityId: string): Sufferer | undefined {
  const s = readAilments(world);
  const b = s?.bodies[entityId];
  if (s && b) delete s.bodies[entityId];
  return b;
}

/** Put a kept body back for an entity in the world again (its auras return at the dawn check). */
export function putBody(world: World, entityId: string, body: Sufferer): void {
  ailmentsSlice(world).bodies[entityId] = body;
}

/** A healthy body nothing is tracking any more (the player's is always kept). */
export function isIdle(b: Sufferer): boolean {
  return (
    b.taint <= 0 && b.stage === 'none' && b.injuries.length === 0 && b.hours.every((h) => h === 0)
  );
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, min = Number.MIN_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min;

/** The save check of the slice: the problems found, empty when it is sound. */
export function validateAilmentsSlice(slice: unknown): string[] {
  const out: string[] = [];
  if (slice === undefined) return out;
  if (!isObj(slice)) return ['ailments is not an object'];
  const s = slice as Record<string, unknown>;
  if (!isObj(s.bodies)) out.push('ailments.bodies is not an object');
  else
    for (const [id, b] of Object.entries(s.bodies)) {
      const at = `ailments.bodies.${id}`;
      if (!isObj(b)) {
        out.push(`${at} is not a body`);
        continue;
      }
      if (!isNum(b.taint) || b.taint < 0) out.push(`${at}.taint is not a taint`);
      if (!SED_STAGES.includes(b.stage as SedStage)) out.push(`${at}.stage is unknown`);
      if (!isInt(b.since, -1)) out.push(`${at}.since is not a day`);
      if (!isInt(b.low, -1)) out.push(`${at}.low is not a day`);
      if (!Array.isArray(b.hours) || b.hours.length !== GRADES || !b.hours.every(isNum))
        out.push(`${at}.hours is not an hour count per grade`);
      if (!Array.isArray(b.injuries)) out.push(`${at}.injuries is not a list`);
      else
        for (const [i, inj] of b.injuries.entries()) {
          if (
            !isObj(inj) ||
            !INJURY_KINDS.includes(inj.kind as InjuryKind) ||
            !isInt(inj.since, 0) ||
            !isInt(inj.until, 0)
          )
            out.push(`${at}.injuries.${i} is not an injury`);
        }
    }
  if (!isObj(s.tracks)) out.push('ailments.tracks is not an object');
  else
    for (const [id, w] of Object.entries(s.tracks))
      if (!isInt(w, 0)) out.push(`ailments.tracks.${id} is not a week`);
  if (!isObj(s.cases)) out.push('ailments.cases is not an object');
  else
    for (const [id, c] of Object.entries(s.cases))
      if (!CASE_STAGES.includes(c as CaseStage)) out.push(`ailments.cases.${id} is unknown`);
  if (!isInt(s.checked, -1)) out.push('ailments.checked is not a day');
  if (typeof s.dirty !== 'boolean') out.push('ailments.dirty is not a boolean');
  return out;
}
