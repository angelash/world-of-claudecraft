// The world is one serializable plain object: meta, random streams, id counters,
// command queues, AI requests, per-system slices, a ring of recent events, and the
// replay log. Systems write only their own slice. See docs/50_tech/architecture.md 4.3.

import type { AiMode, AiState } from './ai_port';
import type { AnyCommand, AnyWorldEvent, FlagValue, WorldSlices } from './contracts';
import type { RngState } from './rng';

export const WORLD_VERSION = 1;

export interface WorldMeta {
  version: number;
  seed: number;
  tick: number;
  /** event sequence counter */
  seq: number;
  /** story flags and world-state variables (see docs/30_story/reveal_ledger.md 0.4) */
  flags: Record<string, FlagValue>;
}

export interface LoggedCommand {
  tick: number;
  command: AnyCommand;
}

export interface World {
  meta: WorldMeta;
  rng: Record<string, RngState>;
  ids: Record<string, number>;
  /** Commands from outside the kernel (player, AI, fallback, script), applied first next tick. */
  inbox: AnyCommand[];
  /** Commands dispatched by systems, applied after the inbox next tick. */
  queue: AnyCommand[];
  ai: AiState;
  slices: WorldSlices;
  recent: AnyWorldEvent[];
  log: LoggedCommand[];
}

export function createWorld(seed: number, aiMode: AiMode): World {
  return {
    meta: { version: WORLD_VERSION, seed: seed | 0, tick: 0, seq: 0, flags: {} },
    rng: {},
    ids: {},
    inbox: [],
    queue: [],
    ai: { mode: aiMode, nextId: 1, pending: [] },
    slices: {} as WorldSlices,
    recent: [],
    log: [],
  };
}
