// The doors slice and its fields added by PK-M1-14 (door rank, seal points and stage,
// blockage, fatigue, revival stacks, hints, the drought). A fresh world gets them at init;
// a save from before carries only doors, counters and visited, so the first touch fills
// the rest from what the save already holds (opened doors give the rank, the seal flags
// give the points), deterministically and without a save migration.

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { contentCurve, rankFromPoints, rankValueOf } from './rank';
import type { DoorsSlice } from './types';

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * A save from before the act locks kept a door locked by an act-lock group (X2) for good;
 * give it the act from which it returns, as an act lock set now would have.
 */
function retrofitActLocks(s: DoorsSlice, content: ContentMap): void {
  const doors = content.doors ?? [];
  for (const d of doors) {
    const rt = s.doors[d.id];
    if (rt?.state !== 'locked' || rt.lockedUntil !== undefined) continue;
    for (const e of d.exclusive ?? []) {
      if (e.mode !== 'actLock' || e.act === undefined) continue;
      const opener = doors.some(
        (o) =>
          o.id !== d.id &&
          s.doors[o.id]?.state === 'opened' &&
          (o.exclusive ?? []).some((x) => x.group === e.group),
      );
      if (opener) rt.lockedUntil = e.until ?? e.act + 1;
    }
  }
}

/** A runtime entry for every content door the slice does not hold yet (a newer content batch). */
export function ensureDoorEntries(world: World, content: ContentMap): void {
  const doors = world.slices.doors.doors;
  for (const d of content.doors ?? [])
    if (!doors[d.id]) doors[d.id] = { state: 'hidden', since: 0 };
}

/** A fresh slice: every door unseen, rank 1, nothing loosened. */
export function freshSlice(content: ContentMap): DoorsSlice {
  const doors: DoorsSlice['doors'] = {};
  for (const d of content.doors ?? []) doors[d.id] = { state: 'hidden', since: 0 };
  return {
    doors,
    counters: {},
    visited: {},
    rankPoints: 0,
    rank: 1,
    sealPoints: 0,
    sealStage: 0,
    blockage: 0,
    taintCarry: 0,
    fatigue: 0,
    fatigueAt: 0,
    revive: { deaths: [], stacks: 0 },
    hints: { day: 0, today: 0, log: [] },
    drought: 0,
    lastOpenTick: 0,
  };
}

/** The doors slice with every field present (fills a pre-PK-M1-14 save in place). */
export function ensureSlice(world: World, content: ContentMap): DoorsSlice {
  const s = world.slices.doors;
  if (s.rankPoints === undefined) {
    retrofitActLocks(s, content);
    let points = 0;
    for (const d of content.doors ?? []) {
      if (s.doors[d.id]?.state === 'opened' || s.doors[d.id]?.state === 'closed')
        points += rankValueOf(d);
    }
    s.rankPoints = points;
    s.rank = rankFromPoints(contentCurve(content), points);
  }
  if (s.rank === undefined) s.rank = rankFromPoints(contentCurve(content), s.rankPoints);
  if (s.sealPoints === undefined) {
    const f = world.meta.flags;
    s.sealPoints =
      f.seal_points !== undefined ? num(f.seal_points) : Math.round(num(f.seal_looseness) * 2);
  }
  if (s.sealStage === undefined) s.sealStage = num(world.meta.flags.seal_stage);
  if (s.blockage === undefined) s.blockage = num(world.meta.flags.blockage) * 10;
  if (s.taintCarry === undefined) s.taintCarry = 0;
  if (s.fatigue === undefined) s.fatigue = num(world.meta.flags.door_fatigue);
  if (s.fatigueAt === undefined) s.fatigueAt = world.meta.tick;
  if (s.revive === undefined) s.revive = { deaths: [], stacks: 0 };
  if (s.hints === undefined) s.hints = { day: 0, today: 0, log: [] };
  if (s.drought === undefined) s.drought = 0;
  if (s.lastOpenTick === undefined) s.lastOpenTick = 0;
  return s;
}
