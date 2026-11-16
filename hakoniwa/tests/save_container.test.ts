// The save container (release_engineering.md 5 and 10.4, PK-M0-16): SHA-256 and encoding,
// the slot header, the write order and its power-cut safety, collection and the trash,
// recoverable saves and the cloud-conflict simulation, the previous-generation fallback,
// the run saver's segment chain, the node:fs byte store, an act 6 world (fixture) read
// and written within the 5.8 budget, and the client's slot service on top.

import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  atSafePoint,
  ClientSaves,
  LEGACY_INDEX_KEY,
  LEGACY_MOVED_KEY,
  LEGACY_PREFIX,
  loadErrorText,
  MemoryStore,
  saveErrorText,
} from '../src/client/hud/save_slots';
import { buildContent } from '../src/content';
import type { ContentMap } from '../src/core/contracts';
import { Engine, LOG_HARD_FACTOR } from '../src/core/engine';
import {
  CONTAINER_VERSION,
  ContainerBackend,
  canonicalJson,
  DAY_MS,
  decodeSaveBytes,
  deserializeWorld,
  gzipCodec,
  HOUR_MS,
  headerHash,
  isoTime,
  joinSegments,
  loadReplay,
  loadSlot,
  MemoryStorage,
  nextAnchors,
  parseHeader,
  planReplay,
  RunSaver,
  readSegments,
  readWorld,
  runReplay,
  type SaveBackend,
  SaveLoadError,
  type SaveStorage,
  type SlotId,
  serializeWorld,
  sha256Hex,
  sha256Text,
  snapshotInfo,
  stateHash,
  strictMigrator,
  utf8Codec,
  worldHash,
} from '../src/core/save';
import { NodeFsStorage } from '../src/core/save/fs_storage';
import type { GameSystem } from '../src/core/system';
import type { World } from '../src/core/world';
import { createGame } from '../src/game/create';
import { playerEntity } from '../src/systems/world';

const CONTENT: ContentMap = buildContent();
const MB = 1024 * 1024;
const RUN = 'r-0123abcd';
const VERSIONS = {
  gameVersion: '0.1.0',
  contentVersion: 'c-test',
  renameVersion: 0,
  build: 'test',
};
const FIXTURE = join(__dirname, 'fixtures', 'save_container', 'act6_release.hks');

const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'hk-saves-'));
  temps.push(d);
  return d;
}

class Clock {
  t = 0;
  readonly now = () => this.t;
}

function container(
  storage: SaveStorage,
  clock: Clock,
  writer = { id: 'w-test', name: '测试机' },
): ContainerBackend {
  return new ContainerBackend(storage, { now: clock.now, writer, versions: VERSIONS });
}

/** A kernel-only engine (no systems): cheap worlds whose hash follows the flags. */
function kernel(seed = 1): Engine {
  return Engine.create(seed, CONTENT, [], { aiMode: 'off' });
}

/** Queue a logged player command and step, so the world and the log both change. */
function act(engine: Engine, key: string, value: number, ticks = 5): void {
  engine.queue('flag.set', { key, value });
  engine.step(ticks);
}

function req(slot: SlotId, savedAt = '2026-11-16T00:00:00.000Z') {
  return { slot, savedAt, summary: { act: 'act1', map: 'borderstone', mapName: '界石镇' } };
}

function saver(
  backend: SaveBackend,
  extra: Partial<ConstructorParameters<typeof RunSaver>[0]> = {},
) {
  return new RunSaver({ backend, runId: RUN, versions: VERSIONS, ...extra });
}

const label = (p: string) =>
  p
    .replace(/[0-9a-f]{64}/, 'H')
    .replace(/^runs\/r-[0-9a-f]+\//, '')
    .replace(/^trash\/\d+\/runs\/r-[0-9a-f]+\//, 'trash/');

// ---------------------------------------------------------------------------

describe('hashing, encoding and the slot header', () => {
  it('computes SHA-256 like node:crypto', () => {
    expect(sha256Text('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Text('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Text('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    for (const n of [1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 1000, 100_003]) {
      const b = new Uint8Array(randomBytes(n));
      expect(sha256Hex(b), `${n} bytes`).toBe(createHash('sha256').update(b).digest('hex'));
    }
  });

  it('round-trips text through gzip and reads either encoding', async () => {
    const text = JSON.stringify({ a: '箱庭纪', n: [1, 2, 3] }).repeat(200);
    const gz = await gzipCodec.encode(text);
    expect(gz[0]).toBe(0x1f);
    expect(gz.length).toBeLessThan(text.length / 4);
    expect(await decodeSaveBytes(gz)).toBe(text);
    expect(await decodeSaveBytes(await utf8Codec.encode(text))).toBe(text);
    const broken = gz.slice(0, gz.length >> 1);
    await expect(decodeSaveBytes(broken)).rejects.toThrow();
  });

  it('writes ISO times without reading a clock', () => {
    for (const ms of [0, 951782400000, 1709251199999, Date.UTC(2026, 10, 16, 3, 4, 5, 6)]) {
      expect(isoTime(ms)).toBe(new Date(ms).toISOString());
    }
  });

  it('seals headers over canonical JSON and rejects tampering and newer containers', async () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}',
    );
    const be = container(new MemoryStorage(), new Clock());
    const e = kernel();
    act(e, 'n', 1);
    const res = await saver(be).save(e, req('manual_01'));
    if (!res.ok) throw new Error(res.reason);
    const h = res.header;
    expect(h.container).toBe(CONTAINER_VERSION);
    expect(h.generation).toBe(1);
    expect(h.writerName).toBe('测试机');
    expect(headerHash(h)).toBe(h.headerSha256);
    expect(parseHeader(JSON.stringify(h))).toEqual({ ok: true, header: h });
    expect(parseHeader('{nope')).toEqual({ ok: false, problem: 'bad_json' });
    expect(parseHeader(JSON.stringify({ ...h, tick: h.tick + 1 }))).toEqual({
      ok: false,
      problem: 'bad_hash',
    });
    expect(parseHeader(JSON.stringify({ ...h, slot: 'manual_99' }))).toEqual({
      ok: false,
      problem: 'bad_shape',
    });
    const newer = { ...h, container: CONTAINER_VERSION + 1 };
    newer.headerSha256 = headerHash(newer);
    expect(parseHeader(JSON.stringify(newer))).toEqual({ ok: false, problem: 'newer_container' });
  });
});

// ---------------------------------------------------------------------------

describe('container write order and power cuts', () => {
  it('writes segments, then the snapshot, then the previous header, then the header', async () => {
    const storage = new MemoryStorage();
    const be = container(storage, new Clock());
    const e = kernel();
    const s = saver(be);
    act(e, 'n', 1);
    expect((await s.save(e, req('manual_01'))).ok).toBe(true);
    act(e, 'n', 2);
    const from = storage.journal.length;
    const res = await s.save(e, req('manual_01'));
    expect(res.ok && res.header.generation).toBe(2);
    expect(storage.journal.slice(from).map((j) => `${j.op} ${label(j.to ?? j.path)}`)).toEqual([
      'write seg/H.hkg.tmp',
      'rename seg/H.hkg',
      'write snap/H.hks.tmp',
      'rename snap/H.hks',
      'write slots/manual_01.prev.json.tmp',
      'rename slots/manual_01.prev.json',
      'write slots/manual_01.json.tmp',
      'rename slots/manual_01.json',
    ]);
    // Same world again: the snapshot already exists under its hash and is not rewritten.
    const again = storage.journal.length;
    expect((await s.save(e, req('manual_02'))).ok).toBe(true);
    expect(storage.journal.slice(again).map((j) => `${j.op} ${label(j.to ?? j.path)}`)).toEqual([
      'write slots/manual_02.json.tmp',
      'rename slots/manual_02.json',
    ]);
  });

  /**
   * One save into manual_01 with the power cut at its k-th mutating operation (none when
   * k is undefined), then a reboot. With `broken`, the slot's current generation has a
   * corrupt snapshot (level 2) and the previous one is the good generation to keep.
   */
  async function cutScenario(k: number | undefined, broken: boolean) {
    const clock = new Clock();
    const storage = new MemoryStorage({ now: clock.now });
    const be = container(storage, clock);
    const e = kernel();
    const s = saver(be);
    act(e, 'n', 1);
    expect((await s.save(e, req('manual_01'))).ok).toBe(true);
    const oldHash = worldHash(e.world);
    if (broken) {
      act(e, 'n', 9);
      const res = await s.save(e, req('manual_01'));
      if (!res.ok) throw new Error(res.reason);
      const snap = `runs/${RUN}/snap/${res.header.files.snapshot.sha256}.hks`;
      const bytes = (storage.peek(snap) as Uint8Array).slice();
      bytes[30] = (bytes[30] as number) ^ 0xff;
      storage.poke(snap, bytes);
    }
    // Garbage for the collection after the commit: a deleted slot's files, now old.
    act(e, 'junk', 1);
    expect((await s.save(e, req('manual_02'))).ok).toBe(true);
    await be.delete({ slotId: 'manual_02' });
    clock.t = 2 * HOUR_MS;
    act(e, 'n', 2);
    const newHash = worldHash(e.world);
    const before = storage.ops;
    if (k !== undefined) storage.cutPowerAt(k);
    const res = await s.save(e, req('manual_01')).catch((err) => ({ ok: false, err }));
    const journal = storage.journal.slice(before);
    storage.powerOn();
    // Reboot: a new container over whatever reached the disk.
    const rebooted = container(storage, clock);
    const loaded = await loadSlot(rebooted, 'manual_01');
    return { res, journal, oldHash, newHash, loaded, storage, rebooted, clock };
  }

  for (const broken of [false, true]) {
    const what = broken ? 'whose current generation is broken' : 'with a healthy slot';
    it(`reboots into the previous or the new generation after a cut at every step, ${what}`, async () => {
      const clean = await cutScenario(undefined, broken);
      expect(clean.res.ok).toBe(true);
      const commit = clean.journal.findIndex((j) => j.to === 'slots/manual_01.json') + 1;
      // A broken current generation is not copied over the good previous one.
      expect(commit).toBe(broken ? 6 : 8);
      expect(clean.journal.some((j) => j.to === 'slots/manual_01.prev.json')).toBe(!broken);
      // The collection after the commit moved the deleted slot's files to the trash.
      expect(clean.journal.length).toBeGreaterThan(commit);
      expect(clean.journal.slice(commit).every((j) => j.op === 'rename')).toBe(true);
      for (let k = 1; k <= clean.journal.length; k++) {
        const r = await cutScenario(k, broken);
        // A cut before the header rename fails the save; after it, only collection stopped.
        expect(r.res.ok, `cut at ${k}`).toBe(k > commit);
        const want = k <= commit ? r.oldHash : r.newHash;
        expect(worldHash(r.loaded.world), `cut at ${k}`).toBe(want);
        expect(r.loaded.level, `cut at ${k}`).toBe(k <= commit && broken ? 2 : 0);
        // The game restarts from that save and saves again; an hour on, collection clears
        // whatever the cut left behind.
        const resumed = Engine.resume(r.loaded.world, CONTENT, [], { aiMode: 'off' });
        act(resumed, 'n', 3);
        r.clock.t += 2 * HOUR_MS;
        const next = await saver(r.rebooted, { from: r.loaded.header }).save(
          resumed,
          req('manual_01'),
        );
        expect(next.ok, `cut at ${k}`).toBe(true);
        expect(r.storage.paths().filter((p) => p.endsWith('.tmp'))).toEqual([]);
        const after = await loadSlot(r.rebooted, 'manual_01');
        expect(worldHash(after.world)).toBe(worldHash(resumed.world));
        // Its fallback is the generation the game restarted from, whole.
        const prev = (await r.rebooted.list()).find((x) => x.slot === 'manual_01')?.prev;
        expect(prev?.tick, `cut at ${k}`).toBe(r.loaded.header.tick);
        const back = await readWorld(r.rebooted, 'manual_01', prev?.files.snapshot.sha256 ?? '');
        expect(worldHash(back), `cut at ${k}`).toBe(want);
      }
    });
  }

  it('keeps a slot readable when the power fails while deleting it', async () => {
    const storage = new MemoryStorage();
    const be = container(storage, new Clock());
    const e = kernel();
    const s = saver(be);
    act(e, 'n', 1);
    expect((await s.save(e, req('manual_01'))).ok).toBe(true);
    act(e, 'n', 2);
    expect((await s.save(e, req('manual_01'))).ok).toBe(true);
    storage.cutPowerAt(2);
    await expect(be.delete({ slotId: 'manual_01' })).rejects.toThrow();
    storage.powerOn();
    const rebooted = container(storage, new Clock());
    const loaded = await loadSlot(rebooted, 'manual_01');
    expect([loaded.level, worldHash(loaded.world)]).toEqual([0, worldHash(e.world)]);
  });

  it('rejects a write whose bytes do not hash to their name or whose files are missing', async () => {
    const be = container(new MemoryStorage(), new Clock());
    const e = kernel();
    act(e, 'n', 1);
    const good = await saver(be).save(e, req('manual_01'));
    if (!good.ok) throw new Error(good.reason);
    const header = { ...good.header, slot: 'manual_03' as const };
    const bytes = new TextEncoder().encode('not the snapshot');
    const bad = await be.write({
      runId: RUN,
      slotId: 'manual_03',
      files: [{ kind: 'snapshot', sha256: header.files.snapshot.sha256, bytes }],
      header,
    });
    expect(bad).toMatchObject({ ok: false, code: 'hash_mismatch' });
    const missing = await be.write({
      runId: RUN,
      slotId: 'manual_03',
      files: [],
      header: {
        ...header,
        files: { ...header.files, snapshot: { sha256: 'a'.repeat(64), bytes: 1 } },
      },
    });
    expect(missing).toMatchObject({ ok: false, code: 'missing_file' });
    expect((await be.list()).map((r) => r.slot)).toEqual(['manual_01']);
    // Reads are limited to the files the slot's headers name.
    const other = await be.read({ slotId: 'manual_01', hashes: ['b'.repeat(64)] });
    expect(other).toMatchObject({ ok: false, code: 'not_referenced' });
  });
});

// ---------------------------------------------------------------------------

describe('collection, trash and recoverable saves', () => {
  it('trashes unreferenced files after an hour and deletes them after 14 days', async () => {
    const clock = new Clock();
    const storage = new MemoryStorage({ now: clock.now });
    const be = container(storage, clock);
    const e = kernel();
    const s = saver(be);
    const hashes: number[] = [];
    for (let i = 1; i <= 4; i++) {
      act(e, 'n', i);
      expect((await s.save(e, req('manual_01'))).ok).toBe(true);
      hashes.push(worldHash(e.world));
    }
    // Generation 1 is the run's anchor, 4 is current and 3 previous: generation 2's
    // snapshot is named by no header...
    expect(await be.collect()).toMatchObject({ trashed: 0 });
    clock.t = HOUR_MS;
    const report = await be.collect();
    expect(report.trashed).toBe(1);
    expect(
      storage
        .paths()
        .filter((p) => p.startsWith('trash/'))
        .map(label),
    ).toEqual(['trash/snap/H.hks']);
    // ... and is a recoverable save until the trash is emptied.
    const recs = await be.recoverables();
    expect(recs.map((r) => [r.tick, r.inTrash])).toEqual([[10, true]]);
    clock.t = HOUR_MS + 14 * DAY_MS;
    expect((await be.collect()).deleted).toBe(1);
    expect(await be.recoverables()).toEqual([]);
    // Segments stay: every header names the whole chain.
    expect(storage.paths().filter((p) => p.includes('/seg/')).length).toBe(4);
    // Deleting a slot removes its headers; its files go the same way.
    await be.delete({ slotId: 'manual_01' });
    expect(await be.list()).toEqual([]);
    clock.t += HOUR_MS;
    await be.collect();
    expect(storage.paths().filter((p) => p.startsWith('runs/'))).toEqual([]);
    expect((await be.recoverables()).map((r) => r.tick).sort((a, b) => a - b)).toEqual([5, 15, 20]);
  });

  it('restores a recoverable snapshot into a slot, flagged recovered', async () => {
    const clock = new Clock();
    const be = container(new MemoryStorage({ now: clock.now }), clock);
    const e = kernel();
    act(e, 'n', 1);
    const s = saver(be);
    expect((await s.save(e, req('manual_01'))).ok).toBe(true);
    const lost = worldHash(e.world);
    await be.delete({ slotId: 'manual_01' });
    clock.t = 2 * HOUR_MS;
    await be.collect();
    const [rec] = await be.recoverables();
    expect(rec?.inTrash).toBe(true);
    const res = await be.restore({ candidateId: rec?.id ?? '', slotId: 'manual_05' });
    expect(res.ok && res.header.flags.recovered).toBe(true);
    expect(res.ok && res.header.savedAt).toBe(isoTime(2 * HOUR_MS));
    const loaded = await loadSlot(be, 'manual_05');
    expect(worldHash(loaded.world)).toBe(lost);
    expect(await be.recoverables()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

/** Copy every content-addressed file one machine has and the other lacks (cloud sync). */
function syncFiles(from: MemoryStorage, to: MemoryStorage): void {
  for (const p of from.paths()) {
    if (!p.startsWith('runs/') || to.peek(p)) continue;
    to.poke(p, from.peek(p) as Uint8Array);
  }
}

function copyFile(from: MemoryStorage, to: MemoryStorage, path: string): void {
  const b = from.peek(path);
  if (b) to.poke(path, b);
  else to.drop(path);
}

describe('cloud conflicts and partial sync (5.7)', () => {
  it('keeps the losing side of a slot-header conflict as a recoverable save', async () => {
    const clock = new Clock();
    const homeDisk = new MemoryStorage({ now: clock.now });
    const awayDisk = new MemoryStorage({ now: clock.now });
    const home = container(homeDisk, clock, { id: 'w-home', name: '家里' });
    const away = container(awayDisk, clock, { id: 'w-away', name: '公司' });
    // Generation 1 written at home and synced away.
    const eh = kernel();
    act(eh, 'n', 1);
    const sh = saver(home);
    expect((await sh.save(eh, req('manual_01'))).ok).toBe(true);
    syncFiles(homeDisk, awayDisk);
    copyFile(homeDisk, awayDisk, 'slots/manual_01.json');
    // Both machines play on from it and save the same slot.
    const fromAway = await loadSlot(away, 'manual_01');
    const ea = Engine.resume(fromAway.world, CONTENT, [], { aiMode: 'off' });
    const sa = saver(away, { from: fromAway.header });
    act(eh, 'home', 7);
    act(ea, 'away', 9);
    expect((await sh.save(eh, req('manual_01'))).ok).toBe(true);
    expect((await sa.save(ea, req('manual_01'))).ok).toBe(true);
    const homeWorld = worldHash(eh.world);
    // Sync: files never clash; the slot header does, and the player keeps the cloud's.
    syncFiles(homeDisk, awayDisk);
    syncFiles(awayDisk, homeDisk);
    copyFile(awayDisk, homeDisk, 'slots/manual_01.json');
    copyFile(awayDisk, homeDisk, 'slots/manual_01.prev.json');
    const now = await loadSlot(home, 'manual_01');
    expect(worldHash(now.world)).toBe(worldHash(ea.world));
    expect(now.header.writerName).toBe('公司');
    expect(now.level).toBe(0);
    // Home's own generation 2 is still on disk and listed, even after collection.
    clock.t = 2 * HOUR_MS;
    await home.collect();
    const recs = await home.recoverables();
    expect(recs.length).toBe(1);
    expect(recs[0]?.tick).toBe(eh.tick);
    const restored = await home.restore({ candidateId: recs[0]?.id ?? '', slotId: 'manual_02' });
    expect(restored.ok).toBe(true);
    expect(worldHash((await loadSlot(home, 'manual_02')).world)).toBe(homeWorld);
  });

  it('falls back to the previous generation while a synced header waits for its files', async () => {
    const clock = new Clock();
    const homeDisk = new MemoryStorage({ now: clock.now });
    const awayDisk = new MemoryStorage({ now: clock.now });
    const home = container(homeDisk, clock);
    const away = container(awayDisk, clock);
    const e = kernel();
    const s = saver(home);
    act(e, 'n', 1);
    expect((await s.save(e, req('manual_01'))).ok).toBe(true);
    const gen1 = worldHash(e.world);
    syncFiles(homeDisk, awayDisk);
    act(e, 'n', 2);
    expect((await s.save(e, req('manual_01'))).ok).toBe(true);
    // Both headers reach the other machine before generation 2's files do.
    copyFile(homeDisk, awayDisk, 'slots/manual_01.json');
    copyFile(homeDisk, awayDisk, 'slots/manual_01.prev.json');
    const waiting = await loadSlot(away, 'manual_01');
    expect(waiting.cloudPending).toBe(true);
    expect(waiting.level).toBe(2);
    expect(worldHash(waiting.world)).toBe(gen1);
    syncFiles(homeDisk, awayDisk);
    const synced = await loadSlot(away, 'manual_01');
    expect(synced.level).toBe(0);
    expect(worldHash(synced.world)).toBe(worldHash(e.world));
  });
});

// ---------------------------------------------------------------------------

describe('corrupt slots (5.6 levels 1 and 2)', () => {
  async function twoGenerations() {
    const storage = new MemoryStorage();
    const be = container(storage, new Clock());
    const e = kernel();
    const s = saver(be);
    act(e, 'n', 1);
    expect((await s.save(e, req('manual_01'))).ok).toBe(true);
    const gen1 = worldHash(e.world);
    act(e, 'n', 2);
    const res = await s.save(e, req('manual_01'));
    if (!res.ok) throw new Error(res.reason);
    return { storage, be, gen1, header: res.header };
  }

  it('uses the previous header when the current one is garbage or tampered with', async () => {
    const a = await twoGenerations();
    a.storage.poke('slots/manual_01.json', new Uint8Array([0x7b, 0x01, 0x02]));
    expect((await a.be.list())[0]?.problem).toBe('bad_json');
    const l1 = await loadSlot(a.be, 'manual_01');
    expect([l1.level, worldHash(l1.world)]).toEqual([1, a.gen1]);
    const b = await twoGenerations();
    b.storage.poke(
      'slots/manual_01.json',
      new TextEncoder().encode(JSON.stringify({ ...b.header, tick: 1 })),
    );
    expect((await b.be.list())[0]?.problem).toBe('bad_hash');
    expect((await loadSlot(b.be, 'manual_01')).level).toBe(1);
  });

  it('uses the previous snapshot when the current one fails its hash, else gives up', async () => {
    const a = await twoGenerations();
    const snap = `runs/${RUN}/snap/${a.header.files.snapshot.sha256}.hks`;
    const bytes = (a.storage.peek(snap) as Uint8Array).slice();
    bytes[20] = (bytes[20] as number) ^ 0xff;
    a.storage.poke(snap, bytes);
    const l2 = await loadSlot(a.be, 'manual_01');
    expect([l2.level, l2.cloudPending, worldHash(l2.world)]).toEqual([2, false, a.gen1]);
    a.storage.drop('slots/manual_01.prev.json');
    await expect(loadSlot(a.be, 'manual_01')).rejects.toBeInstanceOf(SaveLoadError);
    await expect(loadSlot(a.be, 'manual_09')).rejects.toMatchObject({ problem: 'empty' });
  });
});

// ---------------------------------------------------------------------------

describe('run saver: the commands segment chain', () => {
  it('keeps drained commands when a save fails and writes them with the next one', async () => {
    const real = container(new MemoryStorage(), new Clock());
    let fail = true;
    const flaky: SaveBackend = {
      list: () => real.list(),
      read: (r) => real.read(r),
      delete: (r) => real.delete(r),
      recoverables: () => real.recoverables(),
      restore: (r) => real.restore(r),
      write: async (r) =>
        fail ? { ok: false, code: 'io', reason: 'disk unplugged' } : real.write(r),
    };
    const e = kernel();
    const s = saver(flaky);
    act(e, 'a', 1);
    act(e, 'b', 2);
    expect((await s.save(e, req('manual_01'))).ok).toBe(false);
    expect(e.world.log).toEqual([]);
    expect(s.pendingCommands).toBe(2);
    act(e, 'c', 3);
    fail = false;
    const res = await s.save(e, req('manual_01'));
    expect(res.ok).toBe(true);
    expect(s.pendingCommands).toBe(0);
    if (!res.ok) return;
    expect(res.header.files.segments.map((g) => [g.fromTick, g.toTick, g.count])).toEqual([
      [0, 15, 3],
    ]);
  });

  it('chains saves started before the previous one finished without gaps or repeats', async () => {
    const be = container(new MemoryStorage(), new Clock());
    const e = kernel();
    const s = saver(be);
    const pending = [];
    for (let i = 0; i < 6; i++) {
      act(e, 'n', i);
      pending.push(s.save(e, req(i % 2 ? 'manual_01' : 'manual_02')));
      if (i === 2) act(e, 'quiet', 0, 7);
    }
    expect(s.writing).toBe(true);
    const results = await Promise.all(pending);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(s.writing).toBe(false);
    const last = (await loadSlot(be, 'manual_01')).header;
    const segs = await readSegments(be, 'manual_01', last.files.segments);
    const all = joinSegments(segs);
    expect(all.map((c) => (c.command.data as { key: string }).key)).toEqual([
      'n',
      'n',
      'n',
      'quiet',
      'n',
      'n',
      'n',
    ]);
  });

  it('merges the segments not merged yet once there are too many, and still replays', async () => {
    const be = container(new MemoryStorage(), new Clock());
    const e = kernel();
    const start = JSON.parse(JSON.stringify(e.world)) as World;
    const s = saver(be, { mergeAbove: 3, anchors: { everyTicks: 0, keep: 100 } });
    const firstMerged: string[] = [];
    for (let i = 0; i < 8; i++) {
      act(e, 'n', i);
      expect((await s.save(e, req('manual_01'))).ok).toBe(true);
      // More than mergeAbove before a save: merged then.
      expect(s.committed.segments.length).toBeLessThanOrEqual(4);
      const m = s.committed.segments.find((g) => g.merged);
      if (m) firstMerged.push(m.sha256);
    }
    // Saves 1 to 4 make four segments; save 5 merges them; save 8 merges 5 to 7 only.
    expect(s.committed.segments.map((g) => [g.count, g.merged === true])).toEqual([
      [4, true],
      [3, true],
      [1, false],
    ]);
    expect(new Set(firstMerged).size).toBe(1);
    const header = (await loadSlot(be, 'manual_01')).header;
    const segs = await readSegments(be, 'manual_01', header.files.segments);
    expect(segs[0]?.meta.fromTick).toBe(0);
    expect(joinSegments(segs).map((c) => c.tick)).toEqual([1, 6, 11, 16, 21, 26, 31, 36]);
    const plan = planReplay(header);
    const { world, commands } = await loadReplay(be, plan);
    expect(worldHash(world)).not.toBe(worldHash(start));
    expect(runReplay(world, CONTENT, [], commands, header.tick).hash).toBe(worldHash(e.world));
  });

  it('adds an anchor every 7 game days and keeps the latest 4', () => {
    const day = 28800;
    let anchors = nextAnchors([], 100, 'a'.repeat(64), { everyTicks: 7 * day, keep: 4 });
    expect(anchors.map((a) => a.tick)).toEqual([100]);
    anchors = nextAnchors(anchors, 100 + 6 * day, 'b'.repeat(64), { everyTicks: 7 * day, keep: 4 });
    expect(anchors.length).toBe(1);
    for (let i = 1; i <= 5; i++) {
      anchors = nextAnchors(anchors, 100 + 7 * day * i, `${i}`.repeat(64), {
        everyTicks: 7 * day,
        keep: 4,
      });
    }
    expect(anchors.map((a) => (a.tick - 100) / day)).toEqual([14, 21, 28, 35]);
  });

  it('continues the chain of a loaded slot on a new branch', async () => {
    const be = container(new MemoryStorage(), new Clock());
    const e = kernel();
    const s = saver(be, { anchors: { everyTicks: 0, keep: 100 } });
    act(e, 'n', 1);
    expect((await s.save(e, req('manual_01'))).ok).toBe(true);
    act(e, 'n', 2);
    expect((await s.save(e, req('manual_02'))).ok).toBe(true);
    // Load the first save and play differently from there.
    const loaded = await loadSlot(be, 'manual_01');
    const branch = Engine.resume(loaded.world, CONTENT, [], { aiMode: 'off' });
    const sb = saver(be, { from: loaded.header, anchors: { everyTicks: 0, keep: 100 } });
    act(branch, 'other', 5);
    const res = await sb.save(branch, req('manual_03'));
    if (!res.ok) throw new Error(res.reason);
    expect(res.header.runId).toBe(RUN);
    expect(res.header.files.segments.map((g) => [g.fromTick, g.toTick])).toEqual([
      [0, 5],
      [5, 10],
    ]);
    const segs = await readSegments(be, 'manual_03', res.header.files.segments);
    expect(joinSegments(segs).map((c) => (c.command.data as { key: string }).key)).toEqual([
      'n',
      'other',
    ]);
    const { world, commands } = await loadReplay(be, planReplay(res.header));
    expect(runReplay(world, CONTENT, [], commands, res.header.tick).hash).toBe(
      worldHash(branch.world),
    );
  });
});

// ---------------------------------------------------------------------------

describe('versions, rescue and limits', () => {
  it('refuses to load or overwrite a save from a newer version and keeps its files', async () => {
    const clock = new Clock();
    const storage = new MemoryStorage({ now: clock.now });
    const be = container(storage, clock);
    const e = kernel();
    act(e, 'n', 1);
    const res = await saver(be).save(e, req('manual_01'));
    if (!res.ok) throw new Error(res.reason);
    const newer = { ...res.header, container: CONTAINER_VERSION + 1, extra: { v: 2 } };
    newer.headerSha256 = headerHash(newer);
    storage.poke('slots/manual_01.json', new TextEncoder().encode(JSON.stringify(newer)));
    expect((await be.list())[0]?.problem).toBe('newer_container');
    await expect(loadSlot(be, 'manual_01')).rejects.toMatchObject({ problem: 'newer' });
    act(e, 'n', 2);
    const over = await saver(be).save(e, req('manual_01'));
    expect(over).toMatchObject({ ok: false, code: 'newer_version' });
    // Its files are marked through the header this build cannot read.
    clock.t = 30 * DAY_MS;
    await be.collect();
    expect(
      storage
        .paths()
        .filter((p) => p.startsWith('runs/'))
        .map(label),
    ).toEqual(['seg/H.hkg', 'snap/H.hks']);
    // A newer world version is refused the same way.
    const world2 = { ...res.header, worldVersion: res.header.worldVersion + 1 };
    world2.headerSha256 = headerHash(world2);
    storage.poke('slots/manual_01.json', new TextEncoder().encode(JSON.stringify(world2)));
    await expect(loadSlot(be, 'manual_01')).rejects.toMatchObject({ problem: 'newer' });
  });

  it('brings a trashed file back when a header names it again', async () => {
    const clock = new Clock();
    const homeDisk = new MemoryStorage({ now: clock.now });
    const home = container(homeDisk, clock);
    const e = kernel();
    act(e, 'n', 1);
    const res = await saver(home).save(e, req('manual_01'));
    if (!res.ok) throw new Error(res.reason);
    const header = homeDisk.peek('slots/manual_01.json') as Uint8Array;
    await home.delete({ slotId: 'manual_01' });
    clock.t = 2 * HOUR_MS;
    expect((await home.collect()).trashed).toBe(2);
    // The header comes back (a cloud sync): collection rescues its files...
    homeDisk.poke('slots/manual_01.json', header);
    expect((await home.collect()).rescued).toBe(2);
    expect(worldHash((await loadSlot(home, 'manual_01')).world)).toBe(worldHash(e.world));
    // ... and so does a read, before any collection runs.
    await home.delete({ slotId: 'manual_01' });
    clock.t += 2 * HOUR_MS;
    await home.collect();
    homeDisk.poke('slots/manual_01.json', header);
    expect(worldHash((await loadSlot(home, 'manual_01')).world)).toBe(worldHash(e.world));
    expect(homeDisk.paths().filter((p) => p.startsWith('trash/')).length).toBe(1);
  });

  it('keeps fresh files an hour and trashed files 14 days, to the millisecond', async () => {
    const clock = new Clock();
    const storage = new MemoryStorage({ now: clock.now });
    const be = container(storage, clock);
    const e = kernel();
    act(e, 'n', 1);
    expect((await saver(be).save(e, req('manual_01'))).ok).toBe(true);
    await be.delete({ slotId: 'manual_01' });
    clock.t = HOUR_MS - 1;
    expect((await be.collect()).trashed).toBe(0);
    clock.t = HOUR_MS;
    expect((await be.collect()).trashed).toBe(2);
    clock.t = HOUR_MS + 14 * DAY_MS - 1;
    expect((await be.collect()).deleted).toBe(0);
    clock.t = HOUR_MS + 14 * DAY_MS;
    expect((await be.collect()).deleted).toBe(2);
    expect(storage.paths()).toEqual([]);
  });

  it('reads the tick, version and act of a snapshot from its start only', async () => {
    const e = kernel();
    act(e, 'act', 3);
    e.world.meta.flags.act = 'act4';
    const bytes = await gzipCodec.encode(serializeWorld(e.world));
    expect(await snapshotInfo(bytes)).toEqual({ tick: e.tick, version: 1, act: 'act4' });
    expect(await snapshotInfo(new TextEncoder().encode('{"format":"other"}'))).toBeNull();
    expect(await snapshotInfo(bytes.slice(0, 10))).toBeNull();
  });
});

describe('the chain restarts when it can no longer replay', () => {
  it('starts over at the save after the engine dropped log entries', async () => {
    const be = container(new MemoryStorage(), new Clock());
    const e = Engine.create(1, CONTENT, [], { aiMode: 'off', logLimit: 2 });
    const s = saver(be, { anchors: { everyTicks: 0, keep: 100 } });
    act(e, 'a', 1);
    expect((await s.save(e, req('manual_01'))).ok).toBe(true);
    for (let i = 0; i < 2 * LOG_HARD_FACTOR + 3; i++) act(e, 'b', i, 1);
    expect(e.logGap).toBe(true);
    const res = await s.save(e, req('manual_01'));
    if (!res.ok) throw new Error(res.reason);
    expect(e.logGap).toBe(false);
    expect(res.header.files.segments).toEqual([]);
    expect(res.header.files.anchors).toEqual([
      { tick: e.tick, sha256: res.header.files.snapshot.sha256 },
    ]);
    act(e, 'c', 1);
    const next = await s.save(e, req('manual_01'));
    expect(next.ok && next.header.files.segments.map((g) => [g.fromTick, g.count])).toEqual([
      [res.header.tick, 1],
    ]);
  });

  it('starts over at the loaded snapshot when the AI mode changed with the load', async () => {
    const be = container(new MemoryStorage(), new Clock());
    const e = kernel();
    act(e, 'a', 1);
    act(e, 'b', 2);
    expect((await saver(be).save(e, req('manual_01'))).ok).toBe(true);
    const loaded = await loadSlot(be, 'manual_01');
    expect(loaded.aiMode).toBe('off');
    const resumed = Engine.resume(loaded.world, CONTENT, [], { aiMode: 'external' });
    const s = saver(be, { from: loaded.header, fromMode: loaded.aiMode });
    act(resumed, 'c', 3);
    const res = await s.save(resumed, req('manual_02'));
    if (!res.ok) throw new Error(res.reason);
    expect(res.header.files.anchors[0]).toEqual({
      tick: loaded.header.tick,
      sha256: loaded.header.files.snapshot.sha256,
    });
    expect(res.header.files.segments.map((g) => [g.fromTick, g.aiMode])).toEqual([
      [loaded.header.tick, 'external'],
    ]);
    // Same mode: the chain simply continues.
    const same = saver(be, { from: loaded.header, fromMode: 'off' });
    const again = Engine.resume((await loadSlot(be, 'manual_01')).world, CONTENT, [], {
      aiMode: 'off',
    });
    act(again, 'd', 4);
    const res2 = await same.save(again, req('manual_03'));
    expect(res2.ok && res2.header.files.segments.length).toBe(2);
  });

  it('starts over at the snapshot when a file of the chain has gone missing', async () => {
    const storage = new MemoryStorage();
    const be = container(storage, new Clock());
    const e = kernel();
    const s = saver(be);
    act(e, 'a', 1);
    const first = await s.save(e, req('manual_01'));
    if (!first.ok) throw new Error(first.reason);
    storage.drop(`runs/${RUN}/seg/${first.header.files.segments[0]?.sha256}.hkg`);
    act(e, 'b', 2);
    const res = await s.save(e, req('manual_02'));
    if (!res.ok) throw new Error(res.reason);
    expect(res.header.files.segments).toEqual([]);
    expect(res.header.files.anchors.map((a) => a.tick)).toEqual([e.tick]);
    act(e, 'c', 3);
    const next = await s.save(e, req('manual_02'));
    expect(next.ok && next.header.files.segments.map((g) => g.fromTick)).toEqual([res.header.tick]);
  });
});

/** A system that asks the AI layer every 10 ticks; its fallback writes the flag 'who'. */
const asker: GameSystem = {
  id: 'zz_asker',
  order: 999,
  tick(ctx) {
    if (ctx.tick % 10 !== 9) return;
    ctx.ai.request({
      agentId: 'asker',
      role: 'test',
      purpose: 'order',
      revision: ctx.tick,
      context: {},
      allowed: ['flag.set'],
      fallback: [
        {
          kind: 'flag.set',
          data: { key: 'who', value: 'fallback' },
          source: { type: 'system', system: 'asker' },
        },
      ],
      deadlineTicks: 5,
    });
  },
};

describe('replay from a snapshot (Engine.replayFrom)', () => {
  it('keeps a player command ahead of a fallback on the same tick, as the live run had it', () => {
    const a = Engine.create(2, CONTENT, [asker], { aiMode: 'off' });
    a.step(9);
    const start = JSON.parse(JSON.stringify({ ...a.world, log: [] })) as World;
    // Tick 10 applies the player's command, then the fallback of the tick 9 request.
    a.queue('flag.set', { key: 'who', value: 'player' });
    a.step(1);
    expect(a.world.meta.flags.who).toBe('fallback');
    a.step(20);
    const log = a.drainLog();
    expect(log.map((l) => l.command.source.type)).toContain('fallback');
    const b = Engine.replayFrom(start, CONTENT, [asker], log);
    b.step(21);
    expect(worldHash(b.world)).toBe(worldHash(a.world));
    expect(stateHash(b.world)).toBe(stateHash(a.world));
    // A replaying engine logs nothing; after endReplay it logs again.
    expect(b.world.log).toEqual([]);
    b.endReplay();
    b.queue('flag.set', { key: 'later', value: 1 });
    b.step(1);
    expect(b.world.log.map((l) => l.command.data)).toEqual([{ key: 'later', value: 1 }]);
  });
});

describe('node:fs byte store', () => {
  it('runs the container on disk: write, read back, collect and refuse unsafe paths', async () => {
    const dir = tempDir();
    const clock = new Clock();
    const disk = new NodeFsStorage(dir);
    const be = container(disk, clock);
    const e = kernel();
    const s = saver(be);
    act(e, 'n', 1);
    expect((await s.save(e, req('manual_01'))).ok).toBe(true);
    act(e, 'n', 2);
    expect((await s.save(e, req('manual_01'))).ok).toBe(true);
    act(e, 'n', 3);
    expect((await s.save(e, req('manual_01'))).ok).toBe(true);
    act(e, 'n', 4);
    expect((await s.save(e, req('manual_01'))).ok).toBe(true);
    const files = await disk.list('slots');
    expect(files).toEqual(['slots/manual_01.json', 'slots/manual_01.prev.json']);
    expect(worldHash((await loadSlot(be, 'manual_01')).world)).toBe(worldHash(e.world));
    // fs mtimes are real, so collect against a clock well past them.
    const later = new Clock();
    later.t = Date.now() + 2 * HOUR_MS;
    const real = container(disk, later);
    expect((await real.collect()).trashed).toBe(1);
    expect((await disk.list('trash')).length).toBe(1);
    expect((await real.recoverables()).length).toBe(1);
    await expect(disk.read('../escape')).rejects.toThrow(/unsafe/);
    await expect(disk.write('slots\\x.json', new Uint8Array(1))).rejects.toThrow(/unsafe/);
    expect(await disk.read('slots/none.json')).toBeNull();
    expect(await disk.stat('slots/none.json')).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('an act 6 world (fixture)', () => {
  it('is written and read back whole, within the 5.8 size budget', async () => {
    const bytes = new Uint8Array(readFileSync(FIXTURE));
    expect(bytes.length).toBeLessThan(MB);
    const text = await decodeSaveBytes(bytes);
    expect(text.length).toBeLessThanOrEqual(12 * MB);
    const world = deserializeWorld(text);
    expect(world.meta.flags.act).toBe('act6');
    const want = worldHash(world);
    const wantJson = serializeWorld(world);
    for (const storage of [new MemoryStorage(), new NodeFsStorage(tempDir())]) {
      const be = container(storage, new Clock());
      const s = saver(be);
      const t0 = performance.now();
      const res = await s.save({ world, drainLog: () => [] }, req('manual_01'));
      const ms = performance.now() - t0;
      if (!res.ok) throw new Error(res.reason);
      expect(res.header.tick).toBe(world.meta.tick);
      expect(res.header.files.snapshot.bytes).toBeLessThanOrEqual(2.5 * MB);
      expect(ms).toBeLessThan(10_000);
      // The container round trip itself: this fixture predates the variable registry, so
      // the default loader would migrate its names (tests/save_migration.test.ts).
      const loaded = await loadSlot(be, 'manual_01', strictMigrator);
      expect(worldHash(loaded.world)).toBe(want);
      expect(serializeWorld(loaded.world)).toBe(wantJson);
    }
  });
});

// ---------------------------------------------------------------------------

describe('client save slots', () => {
  function client(backend: SaveBackend, legacy?: MemoryStore) {
    let n = 0;
    let t = 0;
    return new ClientSaves({
      backend,
      now: () => Date.UTC(2026, 10, 16) + 1000 * t++,
      newRunId: () => `r-cafe${String(++n).padStart(4, '0')}`,
      versions: { gameVersion: '0.1.0', renameVersion: 0, build: 'test' },
      legacy,
    });
  }

  it('moves the first round key-value saves into the container once', async () => {
    const kv = new MemoryStore();
    const e = kernel();
    act(e, 'n', 1);
    kv.setItem(`${LEGACY_PREFIX}2`, serializeWorld(e.world));
    kv.setItem(`${LEGACY_PREFIX}quick`, serializeWorld(e.world));
    const bad = JSON.parse(serializeWorld(e.world));
    bad.version = 999;
    kv.setItem(`${LEGACY_PREFIX}5`, JSON.stringify(bad));
    kv.setItem(
      LEGACY_INDEX_KEY,
      JSON.stringify({ '2': { savedAt: '2026-11-01T08:00:00.000Z', mapName: '界石镇' } }),
    );
    const be = container(new MemoryStorage(), new Clock());
    const saves = client(be, kv);
    await saves.open();
    expect(Object.keys(saves.list()).sort()).toEqual(['manual_02', 'quick']);
    expect(saves.meta('manual_02')).toMatchObject({
      savedAt: '2026-11-01T08:00:00.000Z',
      mapName: '界石镇',
    });
    expect(kv.getItem(`${LEGACY_PREFIX}2`)).toBeNull();
    expect(kv.getItem(`${LEGACY_PREFIX}5`)).not.toBeNull();
    expect(kv.getItem(LEGACY_INDEX_KEY)).not.toBeNull();
    expect(kv.getItem(LEGACY_MOVED_KEY)).toBe('1');
    expect(worldHash((await saves.load('manual_02')).world)).toBe(worldHash(e.world));
    // Each moved save is its own run.
    const runs = new Set((await be.list()).map((r) => r.header?.runId));
    expect(runs.size).toBe(2);
    // A second start does not move anything again.
    kv.setItem(`${LEGACY_PREFIX}3`, serializeWorld(e.world));
    const again = client(be, kv);
    await again.open();
    expect(Object.keys(again.list()).sort()).toEqual(['manual_02', 'quick']);
  });

  it('rotates the autosave ring and continues the run of a loaded save', async () => {
    const be = container(new MemoryStorage(), new Clock());
    const saves = client(be);
    await saves.open();
    const e = kernel();
    saves.attach(e);
    const run = saves.runId;
    const info = { mapId: 'borderstone', mapName: '界石镇' };
    for (let i = 0; i < 4; i++) {
      act(e, 'n', i);
      await saves.autosave(info);
    }
    expect(Object.keys(saves.list()).sort()).toEqual(['auto_1', 'auto_2', 'auto_3']);
    // The fourth autosave replaced the oldest, auto_1.
    expect(saves.meta('auto_1')?.tick).toBe(e.tick);
    expect(saves.nextAutoSlot()).toBe('auto_2');
    const loaded = await saves.load('auto_2');
    const resumed = Engine.resume(loaded.world, CONTENT, [], { aiMode: 'off' });
    saves.attach(resumed, loaded);
    expect(saves.runId).toBe(run);
    act(resumed, 'later', 1);
    const meta = await saves.save('manual_01', info);
    expect(meta.writerName).toBe('测试机');
    const header = (await be.list()).find((r) => r.slot === 'manual_01')?.header;
    expect(header?.runId).toBe(run);
    expect(header?.files.segments.at(-1)?.fromTick).toBe(loaded.header.tick);
    saves.detach();
    await expect(saves.save('manual_02', info)).rejects.toThrow();
  });

  it('leaves the old saves in place when the backend does not outlive the page', async () => {
    const kv = new MemoryStore();
    const e = kernel();
    kv.setItem(`${LEGACY_PREFIX}1`, serializeWorld(e.world));
    const saves = new ClientSaves({
      backend: container(new MemoryStorage(), new Clock()),
      now: () => 0,
      newRunId: () => 'r-aaaa0001',
      versions: { gameVersion: '0.1.0', renameVersion: 0, build: 'test' },
      legacy: kv,
      durable: false,
    });
    await saves.open();
    expect(saves.durable).toBe(false);
    expect(saves.list()).toEqual({});
    expect(kv.getItem(`${LEGACY_PREFIX}1`)).not.toBeNull();
    expect(kv.getItem(LEGACY_MOVED_KEY)).toBeNull();
  });

  it('moves an old save into a free manual slot when its own slot is taken', async () => {
    const be = container(new MemoryStorage(), new Clock());
    const e = kernel();
    act(e, 'n', 1);
    expect((await saver(be).save(e, req('manual_01'))).ok).toBe(true);
    const kv = new MemoryStore();
    const old = kernel(5);
    kv.setItem(`${LEGACY_PREFIX}1`, serializeWorld(old.world));
    const saves = client(be, kv);
    await saves.open();
    expect(Object.keys(saves.list()).sort()).toEqual(['manual_01', 'manual_02']);
    expect(worldHash((await saves.load('manual_02')).world)).toBe(worldHash(old.world));
    expect(kv.getItem(LEGACY_MOVED_KEY)).toBe('1');
  });

  it('reads a save started just before a load, and words failures for the player', async () => {
    const be = container(new MemoryStorage(), new Clock());
    const saves = client(be);
    await saves.open();
    const e = kernel();
    saves.attach(e);
    act(e, 'n', 1);
    const saving = saves.save('quick', { mapId: '', mapName: '' });
    const loaded = await saves.load('quick');
    expect(worldHash(loaded.world)).toBe(worldHash(e.world));
    await saving;
    expect(saveErrorText({ code: 'quota' })).toBe('存储空间不足');
    expect(saveErrorText(new Error('disk'))).toBe('上一份存档完好');
    expect(loadErrorText(await saves.load('manual_07').catch((err) => err))).toBe('还没有存档');
    expect(loadErrorText(new Error('x'))).toBe('这个存档已损坏，无法读取');
  });

  it('autosaves when the replay log is full, draining it into a segment', async () => {
    const be = container(new MemoryStorage(), new Clock());
    const saves = client(be);
    await saves.open();
    const e = Engine.create(1, CONTENT, [], { aiMode: 'off', logLimit: 3 });
    saves.attach(e);
    for (let i = 0; i < 3; i++) act(e, 'n', i, 1);
    expect(e.logFull).toBe(true);
    const meta = await saves.autosave({ mapId: '', mapName: '' });
    expect(meta.slot).toBe('auto_1');
    expect(e.logFull).toBe(false);
    expect(e.world.log).toEqual([]);
    const header = (await be.list())[0]?.header;
    expect(header?.files.segments.map((g) => g.count)).toEqual([3]);
  });

  it('takes an autosave only at a safe point: not in combat, a scene or a write', () => {
    const game = createGame({ seed: 1, content: CONTENT, aiMode: 'off' });
    const w = game.world;
    const calm = { inScene: false, writing: false };
    expect(atSafePoint(w, calm)).toBe(true);
    expect(atSafePoint(w, { inScene: true, writing: false })).toBe(false);
    expect(atSafePoint(w, { inScene: false, writing: true })).toBe(false);
    const unit = w.slices.combat.units[playerEntity(w)?.id ?? ''];
    expect(unit).toBeDefined();
    if (unit) unit.combatUntil = w.meta.tick + 100;
    expect(atSafePoint(w, calm)).toBe(false);
  });
});
