// Save and load. The world is plain data, so a save is its JSON plus a version check.
// Version migrations land here as the world shape evolves (architecture.md 4.7).

import { WORLD_VERSION, type World } from './world';

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
