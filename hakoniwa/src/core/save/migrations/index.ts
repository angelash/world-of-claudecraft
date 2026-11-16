// The world migration chain (release_engineering.md 5.5): one step per `worldVersion`
// increase, each a file `v<N>_to_v<N+1>.ts` exporting a pure `migrate(world, ctx)` and
// listed here in order. Steps only reshape data (default values for new fields, fields
// split or merged, keys renamed): no wall clock, no random draws; a default that needs
// randomness derives it from `ctx.seed`. Published steps are append-only: a fix to a step
// is a new version. Version 1 is the first world shape; development versions before the
// compatibility promise (M2) get no steps, so the chain is empty until the first change to
// the world after it.

import { WORLD_VERSION } from '../../world';

/** What a step may read besides the world. */
export interface MigrationContext {
  /** the world's seed (`meta.seed`), for any derived default */
  seed: number;
  /** the version the step starts from */
  from: number;
}

/** A world object between versions: the shape of version `from`, not yet the current one. */
export type RawWorld = Record<string, unknown>;

export interface WorldMigration {
  from: number;
  to: number;
  /** Reshape a version `from` world into version `to`, in place or as a new object. */
  migrate(world: RawWorld, ctx: MigrationContext): RawWorld | undefined;
}

/** The registered steps, oldest first. */
export const MIGRATIONS: readonly WorldMigration[] = [];

/** Problems of a chain: steps must go up one version at a time from 1 to `target`. */
export function checkChain(
  chain: readonly WorldMigration[],
  target: number = WORLD_VERSION,
): string[] {
  const out: string[] = [];
  chain.forEach((s, i) => {
    if (s.to !== s.from + 1) out.push(`step ${i} goes from ${s.from} to ${s.to}`);
    if (s.from !== i + 1) out.push(`step ${i} starts at ${s.from}, expected ${i + 1}`);
  });
  if (chain.length !== target - 1) {
    out.push(`the chain has ${chain.length} steps, version ${target} needs ${target - 1}`);
  }
  return out;
}

/**
 * Run a world of version `from` through the chain up to `target`, step by step, and set
 * `meta.version`. Throws when a step is missing or a step leaves no world.
 */
export function upgradeWorld(
  world: RawWorld,
  from: number,
  chain: readonly WorldMigration[] = MIGRATIONS,
  target: number = WORLD_VERSION,
): { world: RawWorld; steps: string[] } {
  if (!Number.isInteger(from) || from < 1) throw new Error(`bad world version ${from}`);
  if (from > target) throw new Error(`world version ${from} is newer than ${target}`);
  let w = world;
  const steps: string[] = [];
  for (let v = from; v < target; v++) {
    const step = chain.find((s) => s.from === v);
    if (!step || step.to !== v + 1) throw new Error(`no migration from world version ${v}`);
    const meta = w.meta as { seed?: unknown } | undefined;
    const seed = typeof meta?.seed === 'number' ? meta.seed : 0;
    const out = step.migrate(w, { seed, from: v });
    if (out !== undefined) w = out;
    if (typeof w !== 'object' || w === null) throw new Error(`migration from ${v} left no world`);
    steps.push(`v${v}_to_v${v + 1}`);
  }
  const meta = w.meta as { version?: number } | undefined;
  if (meta && typeof meta === 'object') meta.version = target;
  return { world: w, steps };
}
