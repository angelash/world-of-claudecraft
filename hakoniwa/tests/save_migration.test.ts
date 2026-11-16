// Save migration (release_engineering.md 5.5 and 10.4, PK-M0-18): the world migration
// chain, step by step and chained; the frozen samples in tests/fixtures/saves/ (every
// world version, one per act, plus saves written before the variable registry), each
// migrated, validated, matched against its golden hash and played on for 2000 ticks;
// validateWorld; a failed migration falls back without writing; round trips; and the
// save chain restarting when a save from another build is loaded.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { ContentMap } from '../src/core/contracts';
import { Engine } from '../src/core/engine';
import {
  ContainerBackend,
  checkChain,
  createMigrator,
  type IdField,
  loadReplay,
  loadSlot,
  MemoryStorage,
  MIGRATIONS,
  migrateSnapshot,
  planReplay,
  type RawWorld,
  RENAME_VERSION,
  RunSaver,
  runReplay,
  SaveMigrationError,
  type SliceOwner,
  serializeWorld,
  stateHash,
  upgradeWorld,
  validateWorld,
  type WorldMigration,
  worldHash,
} from '../src/core/save';
import { WORLD_VERSION, type World } from '../src/core/world';
import { createGame, resumeGame } from '../src/game/create';

const FIXTURES = join(__dirname, 'fixtures', 'saves');
const VERSIONS = {
  gameVersion: '0.1.0',
  contentVersion: 'c-test',
  renameVersion: RENAME_VERSION,
  build: 'test',
};

/**
 * The quest ids of the quests slice, as src/systems/quests should declare them
 * (`idFields`, release_engineering.md 5.5): the saves written before the registry hold
 * the old quest data ids there.
 */
const QUEST_ID_FIELDS: IdField[] = [
  { path: 'quests.@keys', kind: 'quest' },
  { path: 'quests.*.id', kind: 'quest' },
  { path: 'order.*', kind: 'quest' },
];
const OWNERS: SliceOwner[] = [{ id: 'quests', idFields: QUEST_ID_FIELDS }];

interface Sample {
  file: string;
  worldVersion: number;
  renameVersion: number;
  act: string;
  tick: number;
  seed: number;
  route: string;
  note?: string;
  /** worldHash after migration (hex) */
  hash: string;
  /** stateHash after migration (hex) */
  state: string;
}

const MANIFEST = JSON.parse(readFileSync(join(FIXTURES, 'manifest.json'), 'utf8')) as {
  samples: Sample[];
};

const hex = (n: number) => n.toString(16).padStart(8, '0');

function text(file: string): string {
  return gunzipSync(readFileSync(join(FIXTURES, file))).toString('utf8');
}

function kernel(seed = 1): Engine {
  return Engine.create(seed, {} as ContentMap, [], { aiMode: 'off' });
}

function backend(storage = new MemoryStorage()): ContainerBackend {
  return new ContainerBackend(storage, {
    now: () => 0,
    writer: { id: 'w-test', name: 'test' },
    versions: VERSIONS,
  });
}

function req(slot: 'quick' | 'manual_01' | 'manual_02') {
  return { slot, savedAt: '2026-11-16T00:00:00.000Z', summary: { act: '', map: '' } };
}

// ---------------------------------------------------------------------------

describe('the world migration chain', () => {
  // A chain of three versions, as the shipped one will grow: v1 adds a field with a
  // seed-derived default, v2 renames a slice field.
  const CHAIN: WorldMigration[] = [
    {
      from: 1,
      to: 2,
      migrate(w, ctx) {
        const slices = w.slices as Record<string, Record<string, unknown>>;
        slices.probe = { ...(slices.probe ?? {}), luck: ctx.seed % 7 };
        return undefined;
      },
    },
    {
      from: 2,
      to: 3,
      migrate(w) {
        const slices = w.slices as Record<string, Record<string, unknown>>;
        const probe = slices.probe as Record<string, unknown>;
        return { ...w, slices: { ...slices, probe: { fortune: probe.luck, count: probe.n } } };
      },
    },
  ];

  function v1(): RawWorld {
    const w = JSON.parse(JSON.stringify(kernel(23).world)) as RawWorld;
    (w.slices as Record<string, unknown>).probe = { n: 4 };
    return w;
  }

  it('runs each step on its own and the whole chain from the oldest version', () => {
    const one = upgradeWorld(v1(), 1, CHAIN, 2);
    expect(one.steps).toEqual(['v1_to_v2']);
    expect((one.world.slices as Record<string, unknown>).probe).toEqual({ n: 4, luck: 23 % 7 });
    expect((one.world.meta as { version: number }).version).toBe(2);
    const two = upgradeWorld(one.world, 2, CHAIN, 3);
    expect(two.steps).toEqual(['v2_to_v3']);
    const all = upgradeWorld(v1(), 1, CHAIN, 3);
    expect(all.steps).toEqual(['v1_to_v2', 'v2_to_v3']);
    expect((all.world.slices as Record<string, unknown>).probe).toEqual({ fortune: 2, count: 4 });
    expect(all.world).toEqual(two.world);
    // A current world goes through untouched.
    const cur = v1();
    expect(upgradeWorld(cur, 3, CHAIN, 3)).toEqual({ world: cur, steps: [] });
  });

  it('refuses a gap, a newer world and a bad version, and checks the chain shape', () => {
    expect(() => upgradeWorld(v1(), 1, [CHAIN[1] as WorldMigration], 3)).toThrow(
      /no migration from world version 1/,
    );
    expect(() => upgradeWorld(v1(), 4, CHAIN, 3)).toThrow(/newer/);
    expect(() => upgradeWorld(v1(), 0, CHAIN, 3)).toThrow(/bad world version/);
    expect(checkChain(CHAIN, 3)).toEqual([]);
    expect(checkChain(CHAIN, 4)[0]).toMatch(/needs 3/);
    expect(checkChain([CHAIN[1] as WorldMigration], 2).length).toBeGreaterThan(0);
  });

  it('ships one step per world version, each in its own append-only file', () => {
    expect(checkChain(MIGRATIONS, WORLD_VERSION)).toEqual([]);
    const files = readdirSync(join(__dirname, '..', 'src', 'core', 'save', 'migrations'))
      .filter((f) => f !== 'index.ts')
      .sort();
    expect(files).toEqual(MIGRATIONS.map((m) => `v${m.from}_to_v${m.to}.ts`).sort());
  });
});

// ---------------------------------------------------------------------------

describe('frozen samples (tests/fixtures/saves)', () => {
  it('has a sample of every world version and every sample in the manifest', () => {
    for (let v = 1; v <= WORLD_VERSION; v++) {
      expect(MANIFEST.samples.some((s) => s.worldVersion === v)).toBe(true);
    }
    const listed = new Set(MANIFEST.samples.map((s) => s.file));
    for (const dir of readdirSync(FIXTURES).filter((d) => /^v\d+$/.test(d))) {
      for (const f of readdirSync(join(FIXTURES, dir)))
        expect(listed.has(`${dir}/${f}`)).toBe(true);
    }
    // One per act of the current version, and saves from before the registry.
    const acts = new Set(
      MANIFEST.samples.filter((s) => s.renameVersion === RENAME_VERSION).map((s) => s.act),
    );
    for (const a of ['prologue', 'act1', 'act2', 'act3', 'act4', 'act5', 'act6']) {
      expect(acts.has(a), a).toBe(true);
    }
    expect(MANIFEST.samples.some((s) => s.renameVersion === 0)).toBe(true);
  });

  for (const s of MANIFEST.samples) {
    it(`${s.file}: migrates to its golden hash, validates and plays on 2000 ticks`, () => {
      const raw = text(s.file);
      const head = JSON.parse(raw) as { version: number; world: World };
      expect(head.version).toBe(s.worldVersion);
      expect([head.world.meta.tick, head.world.meta.flags.act]).toEqual([s.tick, s.act]);
      const { world, report } = migrateSnapshot(raw, s.renameVersion, { owners: OWNERS });
      expect(report.worldVersion).toEqual({ from: s.worldVersion, to: WORLD_VERSION });
      expect(validateWorld(world, OWNERS)).toEqual([]);
      expect([hex(worldHash(world)), hex(stateHash(world))], 'migration golden').toEqual([
        s.hash,
        s.state,
      ]);
      if (s.renameVersion < RENAME_VERSION) {
        expect(report.renames.flags).toBeGreaterThan(0);
        // No old quest id survives in the flags or the quests slice.
        const old = Object.keys(
          (
            JSON.parse(
              readFileSync(join(__dirname, '..', 'data', 'registry', 'vars.json'), 'utf8'),
            ) as {
              questIds: Record<string, string>;
            }
          ).questIds,
        );
        const flags = Object.keys(world.meta.flags);
        const quests = JSON.stringify((world.slices as unknown as Record<string, unknown>).quests);
        for (const q of old) {
          expect(
            flags.some((k) => k.split('.').includes(q)),
            q,
          ).toBe(false);
          expect(quests.includes(`"${q}"`), q).toBe(false);
        }
      } else {
        expect([report.renames.flags, report.renames.ids]).toEqual([0, 0]);
        // Every rename over a current world changes nothing (anchors and restored
        // snapshots of unknown rename version are migrated that way).
        const full = migrateSnapshot(raw, 0, { owners: OWNERS });
        expect([
          full.report.renames.flags,
          full.report.renames.values,
          full.report.renames.ids,
        ]).toEqual([0, 0, 0]);
        expect(worldHash(full.world)).toBe(worldHash(world));
      }
      const engine = resumeGame(world, { seed: s.seed, aiMode: 'off' });
      engine.step(2000);
      expect(engine.tick).toBe(s.tick + 2000);
      expect(validateWorld(engine.world)).toEqual([]);
    }, 180_000);
  }

  it('loads an old sample through the container under its saved rename version', async () => {
    const s = MANIFEST.samples.find((x) => x.renameVersion === 0) as Sample;
    const head = JSON.parse(text(s.file)) as { world: World };
    const be = backend();
    const saver = new RunSaver({
      backend: be,
      runId: 'r-0123abcd',
      versions: { ...VERSIONS, renameVersion: 0 },
    });
    const res = await saver.save({ world: head.world, drainLog: () => [] }, req('manual_01'));
    if (!res.ok) throw new Error(res.reason);
    expect(res.header.renameVersion).toBe(0);
    const loaded = await loadSlot(be, 'manual_01', createMigrator({ owners: OWNERS }));
    expect(hex(worldHash(loaded.world))).toBe(s.hash);
  });
});

// ---------------------------------------------------------------------------

describe('validateWorld', () => {
  const good = () => JSON.parse(JSON.stringify(kernel(3).world)) as World;

  it('accepts a sound world and names each broken part', () => {
    expect(validateWorld(good())).toEqual([]);
    type Mut = {
      meta: Record<string, unknown> & { flags: Record<string, unknown> };
      rng: Record<string, unknown>;
      ids: Record<string, unknown>;
      ai: Record<string, unknown>;
      [k: string]: unknown;
    };
    const cases: [string, (w: Mut) => void, RegExp][] = [
      ['version', (w) => (w.meta.version = 99), /meta.version/],
      ['tick', (w) => (w.meta.tick = -1), /meta.tick/],
      ['flag value', (w) => (w.meta.flags.x = { a: 1 }), /flag x/],
      ['rng', (w) => (w.rng.s = { s: 'x' }), /rng s/],
      ['ids', (w) => (w.ids.p = 1.5), /ids p/],
      ['inbox', (w) => (w.inbox = [{ kind: 'x' }]), /inbox\[0\]/],
      ['queue', (w) => (w.queue = 3), /queue is not/],
      ['ai mode', (w) => (w.ai.mode = 'dreaming'), /ai.mode/],
      ['ai request', (w) => (w.ai.pending = [{ id: 'a' }]), /ai.pending\[0\]/],
      ['slices', (w) => Reflect.deleteProperty(w, 'slices'), /slices is missing/],
      ['recent', (w) => (w.recent = [{ kind: 'x' }]), /recent\[0\]/],
      ['meta', (w) => Reflect.deleteProperty(w, 'meta'), /meta is missing/],
    ];
    for (const [what, mutate, re] of cases) {
      const w = good() as unknown as Mut;
      mutate(w);
      const problems = validateWorld(w);
      expect(
        problems.some((p) => re.test(p)),
        what,
      ).toBe(true);
    }
    expect(validateWorld(null)).toEqual(['the world is not an object']);
  });

  it("runs each system's validateSlice, prefixed with its slice, and survives a throwing one", () => {
    const w = good();
    (w.slices as unknown as Record<string, unknown>).probe = { n: -1 };
    const owners: SliceOwner[] = [
      { id: 'probe', validateSlice: (s) => ((s as { n: number }).n < 0 ? ['n below 0'] : []) },
      {
        id: 'boom',
        validateSlice: () => {
          throw new Error('bad shape');
        },
      },
      { id: 'quiet' },
    ];
    expect(validateWorld(w, owners)).toEqual([
      'slices.probe: n below 0',
      'slices.boom: check threw: bad shape',
    ]);
  });
});

describe('a failed migration falls back and writes nothing', () => {
  it('loads the previous generation when the current one fails validateSlice or the kernel checks', async () => {
    const storage = new MemoryStorage();
    const be = backend(storage);
    const e = kernel(5);
    const probe = (n: number) => {
      (e.world.slices as unknown as Record<string, unknown>).probe = { n };
    };
    const saver = new RunSaver({ backend: be, runId: 'r-0123abcd', versions: VERSIONS });
    probe(1);
    e.step(5);
    expect((await saver.save(e, req('manual_01'))).ok).toBe(true);
    const gen1 = worldHash(e.world);
    probe(-5);
    e.step(5);
    expect((await saver.save(e, req('manual_01'))).ok).toBe(true);
    const before = storage.paths().map((p) => [p, storage.peek(p)?.length]);
    // A system that refuses a negative counter in its slice.
    const owners: SliceOwner[] = [
      { id: 'probe', validateSlice: (sl) => ((sl as { n: number }).n < 0 ? ['n below 0'] : []) },
    ];
    const loaded = await loadSlot(be, 'manual_01', createMigrator({ owners }));
    expect([loaded.level, worldHash(loaded.world)]).toEqual([2, gen1]);
    // A world that breaks the kernel checks falls back the same way.
    const plain = createMigrator();
    const kernelFail = (t: string, h: Parameters<typeof plain>[1]) =>
      plain(h.generation === 2 ? t.replace('"tick":', '"tick":"x","was":') : t, h);
    const l2 = await loadSlot(be, 'manual_01', kernelFail);
    expect([l2.level, worldHash(l2.world)]).toEqual([2, gen1]);
    expect(storage.paths().map((p) => [p, storage.peek(p)?.length])).toEqual(before);
  });

  it('reports a world that does not validate with its problems', () => {
    const file = JSON.parse(serializeWorld(kernel().world));
    file.world.ai.mode = 'dreaming';
    expect(() => migrateSnapshot(JSON.stringify(file), RENAME_VERSION)).toThrow(SaveMigrationError);
    try {
      migrateSnapshot(JSON.stringify(file), RENAME_VERSION);
    } catch (err) {
      expect((err as SaveMigrationError).problems).toContain('ai.mode is dreaming');
    }
    expect(() => migrateSnapshot('{', 0)).toThrow(/not JSON/);
    expect(() => migrateSnapshot('{"format":"other"}', 0)).toThrow(/not a hakoniwa save/);
  });
});

// ---------------------------------------------------------------------------

describe('round trips', () => {
  it('writes and reads a current save with the same hash, and loading then playing on matches the run', async () => {
    const SEED = 314;
    const a = createGame({ seed: SEED, aiMode: 'off' });
    a.queue('world.move_to', { entityId: 'player', x: 14.5, y: 9.5 });
    a.step(120);
    const be = backend();
    const saver = new RunSaver({ backend: be, runId: 'r-0123abcd', versions: VERSIONS });
    expect((await saver.save(a, req('quick'))).ok).toBe(true);
    const loaded = await loadSlot(be, 'quick');
    expect(worldHash(loaded.world)).toBe(worldHash(a.world));
    expect(stateHash(loaded.world)).toBe(stateHash(a.world));
    const b = resumeGame(loaded.world, { aiMode: 'off' });
    a.step(300);
    b.step(300);
    expect(worldHash(b.world)).toBe(worldHash(a.world));
  });
});

describe('a save loaded from another build starts a new replay chain', () => {
  it('anchors at the loaded snapshot, which replays through the migrations', async () => {
    const be = backend();
    const e = kernel(9);
    const old = new RunSaver({
      backend: be,
      runId: 'r-0123abcd',
      versions: { ...VERSIONS, renameVersion: 0, contentVersion: 'c-old' },
      anchors: { everyTicks: 0, keep: 10 },
    });
    // The old build wrote a flag under a spelling the registry now calls an alias.
    e.queue('flag.set', { key: 'prologue.answers', value: 'E1' });
    e.step(4);
    const first = await old.save(e, req('manual_01'));
    if (!first.ok) throw new Error(first.reason);
    e.queue('flag.set', { key: 'n', value: 2 });
    e.step(4);
    const second = await old.save(e, req('manual_01'));
    if (!second.ok) throw new Error(second.reason);
    expect(second.header.files.segments.length).toBe(2);
    const loaded = await loadSlot(be, 'manual_01');
    expect(loaded.world.meta.flags.p_answers).toBe('E1');
    const game = Engine.resume(loaded.world, {} as ContentMap, [], { aiMode: 'off' });
    const saver = new RunSaver({
      backend: be,
      runId: 'r-0123abcd',
      versions: VERSIONS,
      from: loaded.header,
      fromMode: loaded.aiMode,
    });
    game.queue('flag.set', { key: 'n', value: 3 });
    game.step(4);
    const res = await saver.save(game, req('manual_02'));
    if (!res.ok) throw new Error(res.reason);
    // The old build's segments are dropped; the chain starts at the loaded snapshot.
    expect(res.header.files.anchors[0]).toEqual({
      tick: loaded.header.tick,
      sha256: loaded.header.files.snapshot.sha256,
    });
    expect(res.header.files.segments.map((s) => s.fromTick)).toEqual([loaded.header.tick]);
    const plan = planReplay(res.header, loaded.header.tick);
    const r = await loadReplay(be, plan);
    expect(r.world.meta.flags.p_answers).toBe('E1');
    const run = runReplay(r.world, {} as ContentMap, [], r.commands, res.header.tick, {
      aiMode: r.aiMode,
    });
    expect(run.hash).toBe(worldHash(game.world));
  });
});
