// The world file: the world is plain data, so a snapshot is its JSON plus a version check.
// It is the payload of a container snapshot (./container.ts) and of the editor's world
// export. The migration chain of release_engineering.md 5.5 plugs into run_saver.ts.

import { WORLD_VERSION, type World } from '../world';

export interface SaveFile {
  format: 'hakoniwa-save';
  version: number;
  savedAtTick: number;
  world: World;
}

/**
 * Serialize a world for a save slot. The replay log (every external command since the
 * start) is omitted by default: saves are snapshots, and replays are produced from a
 * full in-memory run, not from a save (architecture.md 4.7).
 */
export function serializeWorld(world: World, opts: { includeLog?: boolean } = {}): string {
  const file: SaveFile = {
    format: 'hakoniwa-save',
    version: WORLD_VERSION,
    savedAtTick: world.meta.tick,
    world: opts.includeLog ? world : { ...world, log: [] },
  };
  return JSON.stringify(file);
}

export function deserializeWorld(text: string): World {
  const file = JSON.parse(text) as Partial<SaveFile>;
  if (file.format !== 'hakoniwa-save' || !file.world) throw new Error('not a hakoniwa save');
  if (file.version !== WORLD_VERSION) {
    throw new Error(`unsupported save version ${file.version} (expected ${WORLD_VERSION})`);
  }
  return file.world;
}

/**
 * Stable 32-bit hash of the whole simulation state between ticks: meta, slices, random
 * streams, id counters, the system command queue and the AI requests. Stricter than
 * worldHash; a replay must match it too. Leaves out the inbox (a replay takes queued
 * commands from the log), the log and the recent-event ring.
 */
export function stateHash(world: World): number {
  return fnv(
    JSON.stringify([
      world.meta,
      world.slices,
      world.rng,
      world.ids,
      world.queue,
      world.ai.nextId,
      world.ai.pending,
    ]),
  );
}

function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stable 32-bit hash of the world JSON, used by determinism tests. */
export function worldHash(world: World): number {
  const text = JSON.stringify(world.slices) + JSON.stringify(world.meta);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
