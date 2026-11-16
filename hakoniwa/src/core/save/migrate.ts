// Loading a snapshot into this build (release_engineering.md 5.5): parse the world file,
// refuse a newer world or rename version, run the world migration chain from the file's
// own version, apply the rename table entries newer than the save's rename version, then
// validateWorld. Any failure throws, so the loader falls back to an older generation and
// nothing is written. Pure and deterministic: the same text gives the same world.

import { defaultRegistry } from '../registry';
import { WORLD_VERSION, type World } from '../world';
import type { SlotHeader } from './header';
import { MIGRATIONS, type RawWorld, upgradeWorld, type WorldMigration } from './migrations';
import {
  applyRenames,
  type FlagNames,
  RENAMES,
  type RenameReport,
  RenameSet,
  type RenameTable,
  type SliceIds,
} from './renames';
import { type SliceOwner, validateWorld } from './validate';

/** A save from a newer build (5.5): never read, never overwritten. */
export class NewerSaveError extends Error {
  constructor(
    readonly fields: readonly string[],
    message: string,
  ) {
    super(message);
    this.name = 'NewerSaveError';
  }
}

/** The snapshot did not migrate or did not validate (5.6 level 2). */
export class SaveMigrationError extends Error {
  constructor(
    readonly problems: readonly string[],
    message: string,
  ) {
    super(message);
    this.name = 'SaveMigrationError';
  }
}

export interface MigrationReport {
  worldVersion: { from: number; to: number };
  /** the chain steps run, e.g. `v1_to_v2` */
  steps: string[];
  renames: RenameReport;
}

export interface MigrateOptions {
  /** the rename table (default: data/registry/renames.json) */
  table?: RenameTable;
  /** the names a flag rename may land on (default: the variable registry) */
  names?: FlagNames;
  /** the game systems: their `validateSlice` and `idFields` */
  owners?: readonly SliceOwner[];
  /** the world migration chain (default: MIGRATIONS) */
  chain?: readonly WorldMigration[];
  /** told about every migrated snapshot (the load log) */
  onReport?: (report: MigrationReport) => void;
}

/** Turns a snapshot's text into a current world (the loader's hook). */
export type WorldMigrator = (text: string, header: SlotHeader) => World;

interface FileHead {
  format?: unknown;
  version?: unknown;
  world?: unknown;
}

function idFieldsOf(owners: readonly SliceOwner[]): SliceIds[] {
  return owners
    .filter((o) => o.idFields && o.idFields.length > 0)
    .map((o) => ({ slice: o.id, fields: o.idFields ?? [] }));
}

/**
 * Bring a snapshot's text to this build. `renameVersion` is the rename table version the
 * snapshot was written under (0 when unknown: renames apply idempotently).
 */
export function migrateSnapshot(
  text: string,
  renameVersion: number,
  opts: MigrateOptions = {},
  sets?: Map<number, RenameSet>,
): { world: World; report: MigrationReport } {
  let file: FileHead;
  try {
    file = JSON.parse(text) as FileHead;
  } catch {
    throw new SaveMigrationError(['bad json'], 'the snapshot is not JSON');
  }
  if (
    typeof file !== 'object' ||
    file === null ||
    file.format !== 'hakoniwa-save' ||
    typeof file.world !== 'object' ||
    file.world === null
  ) {
    throw new SaveMigrationError(['not a world file'], 'not a hakoniwa save');
  }
  const version = file.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SaveMigrationError(['bad version'], `bad world version ${String(version)}`);
  }
  if (version > WORLD_VERSION) {
    throw new NewerSaveError(
      ['worldVersion'],
      `world version ${version} is newer than ${WORLD_VERSION}`,
    );
  }
  const table = opts.table ?? RENAMES;
  if (!Number.isInteger(renameVersion) || renameVersion < 0) {
    throw new SaveMigrationError(['bad rename version'], `bad rename version ${renameVersion}`);
  }
  if (renameVersion > table.version) {
    throw new NewerSaveError(
      ['renameVersion'],
      `rename version ${renameVersion} is newer than ${table.version}`,
    );
  }
  let upgraded: { world: RawWorld; steps: string[] };
  try {
    upgraded = upgradeWorld(file.world as RawWorld, version, opts.chain ?? MIGRATIONS);
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    throw new SaveMigrationError([msg], `migration failed: ${msg}`);
  }
  const world = upgraded.world as unknown as World;
  const owners = opts.owners ?? [];
  // Structure first: the renames walk the flags and the event ring.
  const before = validateWorld(world, []);
  if (before.length > 0) {
    throw new SaveMigrationError(
      before,
      `the world does not validate: ${before.slice(0, 3).join('; ')}`,
    );
  }
  let set = sets?.get(renameVersion);
  if (!set) {
    set = new RenameSet(table, renameVersion, opts.names ?? defaultRegistry());
    sets?.set(renameVersion, set);
  }
  const renames = applyRenames(world, set, idFieldsOf(owners));
  const problems = validateWorld(world, owners);
  if (problems.length > 0) {
    throw new SaveMigrationError(
      problems,
      `the world does not validate: ${problems.slice(0, 3).join('; ')}`,
    );
  }
  if (!Array.isArray(world.log)) world.log = [];
  const report: MigrationReport = {
    worldVersion: { from: version, to: WORLD_VERSION },
    steps: upgraded.steps,
    renames,
  };
  opts.onReport?.(report);
  return { world, report };
}

/** A loader hook over migrateSnapshot (compiled rename sets are kept per version). */
export function createMigrator(opts: MigrateOptions = {}): WorldMigrator {
  const sets = new Map<number, RenameSet>();
  return (text, header) => migrateSnapshot(text, header.renameVersion, opts, sets).world;
}

let shared: WorldMigrator | undefined;

/** The default loader hook: the shipped chain and table, kernel checks only. */
export const defaultMigrator: WorldMigrator = (text, header) => {
  shared ??= createMigrator();
  return shared(text, header);
};

/**
 * Migrate a snapshot whose rename version is unknown (an anchor carried over from an older
 * build, a recoverable snapshot): every rename applies; on a current world they change
 * nothing.
 */
export const anchorMigrator = (text: string): World => {
  shared ??= createMigrator();
  return shared(text, { renameVersion: 0 } as SlotHeader);
};

/** The old strict loader (current world version only, no renames, no checks). */
export const strictMigrator: WorldMigrator = (text) => {
  const file = JSON.parse(text) as FileHead;
  if (file.format !== 'hakoniwa-save' || !file.world) throw new Error('not a hakoniwa save');
  if (file.version !== WORLD_VERSION) {
    throw new Error(`unsupported save version ${String(file.version)} (expected ${WORLD_VERSION})`);
  }
  return file.world as World;
};
