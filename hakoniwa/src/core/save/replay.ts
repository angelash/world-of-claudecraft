// Replay from a save (release_engineering.md 13.6 and 5.6 level 3): an anchor snapshot plus
// the `commands` segments after it, re-applied by Engine.replayFrom with the model off,
// up to a target tick. Records the world hash at every game-day boundary on the way; the
// replay tool (tools/replay/run.ts) and the tests compare the end against the slot's own
// snapshot.

import type { AiMode } from '../ai_port';
import type { ContentMap } from '../contracts';
import { Engine, type EngineOptions } from '../engine';
import type { GameSystem } from '../system';
import { TICKS_PER_GAME_DAY } from '../time';
import type { LoggedCommand, World } from '../world';
import type { SaveBackend } from './backend';
import type { AnchorRef, SegmentRef, SlotHeader, SlotId } from './header';
import { readSegments, readWorld } from './run_saver';
import { joinSegments } from './segments';
import { stateHash, worldHash } from './world_file';

export interface ReplayPlan {
  slot: SlotId;
  anchor: AnchorRef;
  /** the commands segments covering (anchor.tick, toTick] */
  segments: SegmentRef[];
  toTick: number;
}

/**
 * Choose an anchor of a header (the latest at or before `anchorTick`, else the earliest)
 * and the segments that carry its run on to `toTick` (default: the header's tick).
 */
export function planReplay(header: SlotHeader, anchorTick?: number, toTick?: number): ReplayPlan {
  const anchors = [...header.files.anchors].sort((a, b) => a.tick - b.tick);
  if (anchors.length === 0) throw new Error(`slot ${header.slot} has no anchors`);
  let anchor = anchors[0] as AnchorRef;
  if (anchorTick !== undefined) {
    const at = anchors.filter((a) => a.tick <= anchorTick);
    if (at.length === 0) throw new Error(`no anchor at or before tick ${anchorTick}`);
    anchor = at[at.length - 1] as AnchorRef;
  }
  const end = toTick ?? header.tick;
  if (end < anchor.tick || end > header.tick) {
    throw new Error(`cannot replay from tick ${anchor.tick} to ${end} (slot at ${header.tick})`);
  }
  const commands = header.files.segments.filter((s) => s.kind === 'commands');
  const segments = commands.filter((s) => s.toTick > anchor.tick && s.fromTick < end);
  const start = segments[0]?.fromTick;
  if (start !== undefined && start > anchor.tick) {
    throw new Error(`the command segments start at tick ${start}, after the anchor`);
  }
  return { slot: header.slot, anchor, segments, toTick: end };
}

/**
 * The anchor world, the commands after it, read through a slot, and the AI mode they were
 * played under (the segments' own record; the anchor's when there are none). Refuses a
 * span whose AI mode changes: replay from an anchor after the change.
 */
export async function loadReplay(
  backend: SaveBackend,
  plan: ReplayPlan,
): Promise<{ world: World; commands: LoggedCommand[]; aiMode: AiMode }> {
  const world = await readWorld(backend, plan.slot, plan.anchor.sha256);
  const modes = new Set(plan.segments.map((s) => s.aiMode).filter((m) => m !== undefined));
  if (modes.size > 1) {
    throw new Error('the AI mode changes within this replay; start from a later anchor');
  }
  const aiMode = [...modes][0] ?? world.ai.mode;
  const commands = joinSegments(await readSegments(backend, plan.slot, plan.segments)).filter(
    (e) => e.tick > plan.anchor.tick && e.tick <= plan.toTick,
  );
  return { world, commands, aiMode };
}

export interface DayHash {
  /** whole game days since the start */
  day: number;
  tick: number;
  hash: number;
}

export interface ReplayRun {
  engine: Engine;
  days: DayHash[];
  /** worldHash at the end */
  hash: number;
  /** stateHash at the end */
  state: number;
}

/**
 * Replay a snapshot plus later commands to `toTick`, hashing every day boundary. Pass the
 * AI mode loadReplay found as `opts.aiMode`. The world is taken over by the replay.
 */
export function runReplay(
  world: World,
  content: ContentMap,
  systems: readonly GameSystem[],
  commands: readonly LoggedCommand[],
  toTick: number,
  opts: EngineOptions = {},
): ReplayRun {
  const engine = Engine.replayFrom(world, content, systems, commands, opts);
  const days: DayHash[] = [];
  while (engine.tick < toTick) {
    const nextDay = (Math.floor(engine.tick / TICKS_PER_GAME_DAY) + 1) * TICKS_PER_GAME_DAY;
    const stop = Math.min(nextDay, toTick);
    engine.step(stop - engine.tick);
    if (engine.tick % TICKS_PER_GAME_DAY === 0) {
      days.push({
        day: engine.tick / TICKS_PER_GAME_DAY,
        tick: engine.tick,
        hash: worldHash(engine.world),
      });
    }
  }
  return { engine, days, hash: worldHash(engine.world), state: stateHash(engine.world) };
}
