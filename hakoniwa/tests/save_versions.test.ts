// The five version numbers of a save (release_engineering.md 5.3, 5.5 and 10.4,
// PK-M0-18): written end to end into every header, and forward incompatibility: a save
// whose container, world, rename or game version is above this build's is refused for
// reading (load and recovery alike) and its slot is never overwritten, its files kept.

import { describe, expect, it } from 'vitest';
import type { ContentMap } from '../src/core/contracts';
import { Engine } from '../src/core/engine';
import {
  buildVersions,
  CONTAINER_VERSION,
  ContainerBackend,
  compareGameVersions,
  DAY_MS,
  headerHash,
  loadSlot,
  MemoryStorage,
  migrateSnapshot,
  NewerSaveError,
  newerFields,
  RENAME_VERSION,
  RunSaver,
  recoverableId,
  recoverSlot,
  type SlotHeader,
  serializeWorld,
  sha256Hex,
} from '../src/core/save';
import { WORLD_VERSION } from '../src/core/world';

const RUN = 'r-0123abcd';
const VERSIONS = {
  gameVersion: '1.2.3',
  contentVersion: 'c-3f9a12e0',
  renameVersion: RENAME_VERSION,
  build: 'a1b2c3d',
};
const encoder = new TextEncoder();

class Clock {
  t = 0;
  readonly now = () => this.t;
}

function setup() {
  const clock = new Clock();
  const storage = new MemoryStorage({ now: clock.now });
  const be = new ContainerBackend(storage, {
    now: clock.now,
    writer: { id: 'w-test', name: 'test' },
    versions: VERSIONS,
  });
  const e = Engine.create(3, {} as ContentMap, [], { aiMode: 'off' });
  const saver = new RunSaver({ backend: be, runId: RUN, versions: VERSIONS });
  return { clock, storage, be, e, saver };
}

const req = {
  slot: 'manual_01' as const,
  savedAt: '2026-11-16T00:00:00.000Z',
  summary: { act: 'act1', map: 'borderstone' },
};

async function save(s: ReturnType<typeof setup>, value: number): Promise<SlotHeader> {
  s.e.queue('flag.set', { key: 'n', value });
  s.e.step(5);
  const res = await s.saver.save(s.e, req);
  if (!res.ok) throw new Error(res.reason);
  return res.header;
}

function reseal(h: SlotHeader, patch: Partial<SlotHeader>): SlotHeader {
  const out = { ...h, ...patch } as SlotHeader;
  out.headerSha256 = headerHash(out);
  return out;
}

describe('the five version numbers', () => {
  it('are written into every header: container and world from the kernel, the rest from the build', async () => {
    const s = setup();
    const h = await save(s, 1);
    expect({
      container: h.container,
      worldVersion: h.worldVersion,
      gameVersion: h.gameVersion,
      contentVersion: h.contentVersion,
      renameVersion: h.renameVersion,
      build: h.build,
    }).toEqual({
      container: CONTAINER_VERSION,
      worldVersion: WORLD_VERSION,
      gameVersion: '1.2.3',
      contentVersion: 'c-3f9a12e0',
      renameVersion: RENAME_VERSION,
      build: 'a1b2c3d',
    });
    expect(buildVersions('1.2.3')).toEqual({
      container: CONTAINER_VERSION,
      worldVersion: WORLD_VERSION,
      renameVersion: RENAME_VERSION,
      gameVersion: '1.2.3',
    });
  });

  it('compares game versions by major, minor and patch, ignoring what it cannot parse', () => {
    expect(compareGameVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareGameVersions('1.2.10', '1.2.9')).toBe(1);
    expect(compareGameVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareGameVersions('0.9.0', '1.0.0')).toBe(-1);
    // A pre-release comes before its release; identifiers numeric before text.
    expect(compareGameVersions('1.0.0-beta.2', '1.0.0')).toBe(-1);
    expect(compareGameVersions('1.0.0', '1.0.0-rc.1')).toBe(1);
    expect(compareGameVersions('1.0.0-rc.10', '1.0.0-rc.9')).toBe(1);
    expect(compareGameVersions('1.0.0-rc.1', '1.0.0-rc')).toBe(1);
    expect(compareGameVersions('1.0.0-1', '1.0.0-alpha')).toBe(-1);
    expect(compareGameVersions('1.0.0+build.7', '1.0.0')).toBe(0);
    expect(compareGameVersions('dev', '1.0.0')).toBeNull();
    const h = {
      container: 1,
      worldVersion: WORLD_VERSION,
      renameVersion: RENAME_VERSION,
      gameVersion: '2.0.0',
    };
    expect(newerFields(h, buildVersions('1.2.3'))).toEqual(['gameVersion']);
    expect(newerFields(h, buildVersions())).toEqual([]);
    expect(
      newerFields(
        {
          container: 9,
          worldVersion: WORLD_VERSION + 1,
          renameVersion: RENAME_VERSION + 1,
          gameVersion: 'x',
        },
        buildVersions('1.2.3'),
      ),
    ).toEqual(['container', 'worldVersion', 'renameVersion']);
  });
});

describe('forward incompatibility (a save from a newer version)', () => {
  const BUMPS: [string, (h: SlotHeader) => Partial<SlotHeader>][] = [
    ['container', (h) => ({ container: h.container + 1 })],
    ['worldVersion', (h) => ({ worldVersion: h.worldVersion + 1 })],
    ['renameVersion', (h) => ({ renameVersion: h.renameVersion + 1 })],
    ['gameVersion', () => ({ gameVersion: '1.3.0' })],
  ];

  for (const [field, bump] of BUMPS) {
    it(`refuses to read a newer ${field} and never overwrites it`, async () => {
      const s = setup();
      await save(s, 1);
      const cur = await save(s, 2);
      const newer = reseal(cur, bump(cur));
      const bytes = encoder.encode(JSON.stringify(newer));
      s.storage.poke('slots/manual_01.json', bytes);
      const prevBytes = s.storage.peek('slots/manual_01.prev.json');
      const opts = { gameVersion: VERSIONS.gameVersion };
      await expect(loadSlot(s.be, 'manual_01', undefined, opts)).rejects.toMatchObject({
        problem: 'newer',
      });
      await expect(
        recoverSlot(s.be, 'manual_01', {
          game: { content: {} as ContentMap, systems: [] },
          versions: VERSIONS,
          savedAt: req.savedAt,
          load: opts,
          log: () => {},
        }),
      ).rejects.toMatchObject({ problem: 'newer' });
      // Saving over it is refused, before anything is written.
      const over = await s.saver.save(s.e, req);
      expect(over).toMatchObject({ ok: false, code: 'newer_version' });
      expect(s.storage.peek('slots/manual_01.json')).toEqual(bytes);
      expect(s.storage.peek('slots/manual_01.prev.json')).toEqual(prevBytes);
      // Its files are kept by collection.
      s.clock.t = 30 * DAY_MS;
      await s.be.collect();
      const snap = `runs/${RUN}/snap/${cur.files.snapshot.sha256}.hks`;
      expect(s.storage.peek(snap)).toBeDefined();
    });
  }

  it('refuses a newer previous generation behind a broken current one', async () => {
    const s = setup();
    await save(s, 1);
    const cur = await save(s, 2);
    const prev = JSON.parse(
      new TextDecoder().decode(s.storage.peek('slots/manual_01.prev.json')),
    ) as SlotHeader;
    s.storage.poke(
      'slots/manual_01.prev.json',
      encoder.encode(JSON.stringify(reseal(prev, { worldVersion: WORLD_VERSION + 1 }))),
    );
    s.storage.poke('slots/manual_01.json', encoder.encode('{"trunc'));
    await expect(loadSlot(s.be, 'manual_01')).rejects.toMatchObject({ problem: 'newer' });
    expect(cur.generation).toBe(2);
  });

  it('refuses a newer header even when this build cannot parse its shape', async () => {
    const s = setup();
    await save(s, 1);
    const cur = await save(s, 2);
    // A newer build changed the header shape (and so its hash input).
    const reshaped = { ...cur, worldVersion: WORLD_VERSION + 1, files: { layout: 'v2' } };
    const bytes = encoder.encode(JSON.stringify(reshaped));
    s.storage.poke('slots/manual_01.json', bytes);
    expect((await s.be.list())[0]?.problem).toBe('newer_container');
    await expect(loadSlot(s.be, 'manual_01')).rejects.toMatchObject({ problem: 'newer' });
    expect(await s.saver.save(s.e, req)).toMatchObject({ ok: false, code: 'newer_version' });
    expect(s.storage.peek('slots/manual_01.json')).toEqual(bytes);
    // A newer game version alone in an unreadable header: never overwritten either.
    const game = { ...cur, gameVersion: '9.0.0', files: { layout: 'v2' } };
    const gameBytes = encoder.encode(JSON.stringify(game));
    s.storage.poke('slots/manual_01.json', gameBytes);
    expect((await s.be.list())[0]?.problem).toBe('bad_shape');
    expect(await s.saver.save(s.e, req)).toMatchObject({ ok: false, code: 'newer_version' });
    expect(s.storage.peek('slots/manual_01.json')).toEqual(gameBytes);
  });

  it('refuses a snapshot whose world or rename version is newer, and a restore of one', async () => {
    const s = setup();
    const file = JSON.parse(serializeWorld(s.e.world));
    file.version = WORLD_VERSION + 1;
    file.world.meta.version = WORLD_VERSION + 1;
    const newerText = JSON.stringify(file);
    expect(() => migrateSnapshot(newerText, 0)).toThrow(NewerSaveError);
    expect(() => migrateSnapshot(serializeWorld(s.e.world), RENAME_VERSION + 1)).toThrow(
      NewerSaveError,
    );
    // Only generation of a slot: the snapshot says newer, so the slot is newer.
    const bytes = encoder.encode(newerText);
    const sha = sha256Hex(bytes);
    const draft = {
      ...(await save(s, 1)),
    };
    const res = await s.be.write({
      runId: RUN,
      slotId: 'manual_02',
      files: [{ kind: 'snapshot', sha256: sha, bytes }],
      header: {
        ...draft,
        slot: 'manual_02',
        files: { snapshot: { sha256: sha, bytes: bytes.length }, segments: [], anchors: [] },
      },
    });
    expect(res.ok).toBe(true);
    await expect(loadSlot(s.be, 'manual_02')).rejects.toMatchObject({ problem: 'newer' });
    // An unreferenced newer snapshot cannot be restored into a slot.
    await s.be.delete({ slotId: 'manual_02' });
    const restored = await s.be.restore({
      candidateId: recoverableId(RUN, sha),
      slotId: 'manual_03',
    });
    expect(restored).toMatchObject({ ok: false, code: 'newer_version' });
  });

  it('stamps a restored snapshot with rename version 0, so every rename applies on load', async () => {
    const s = setup();
    s.e.queue('flag.set', { key: 'prologue.answers', value: 'E1' });
    s.e.step(3);
    const text = serializeWorld(s.e.world);
    const bytes = encoder.encode(text);
    const sha = sha256Hex(bytes);
    const first = await save(s, 1);
    const w = await s.be.write({
      runId: RUN,
      slotId: 'manual_02',
      files: [{ kind: 'snapshot', sha256: sha, bytes }],
      header: {
        ...first,
        slot: 'manual_02',
        files: { snapshot: { sha256: sha, bytes: bytes.length }, segments: [], anchors: [] },
      },
    });
    expect(w.ok).toBe(true);
    await s.be.delete({ slotId: 'manual_02' });
    const restored = await s.be.restore({
      candidateId: recoverableId(RUN, sha),
      slotId: 'manual_03',
    });
    if (!restored.ok) throw new Error(restored.reason);
    expect([restored.header.renameVersion, restored.header.flags.recovered]).toEqual([0, true]);
    const loaded = await loadSlot(s.be, 'manual_03');
    expect(loaded.world.meta.flags.p_answers).toBe('E1');
    expect(loaded.world.meta.flags['prologue.answers']).toBeUndefined();
  });
});
