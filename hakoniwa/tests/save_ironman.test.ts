// Ironman saves (release_engineering.md 5.1, 5.3 and 5.9, PK-M0-18): one slot per run,
// written only by autosave triggers and on exit; a refused save loses nothing; an anchor at
// every act change, kept beside the periodic ones; the run's older snapshots stay out of
// the recoverable-saves list; corruption recovery works and keeps the run ironman.

import { describe, expect, it } from 'vitest';
import type { ContentMap } from '../src/core/contracts';
import { Engine } from '../src/core/engine';
import {
  ContainerBackend,
  HOUR_MS,
  IRONMAN_SLOT,
  ironmanRuns,
  ironmanViolation,
  loadSlot,
  MemoryStorage,
  nextAnchors,
  RENAME_VERSION,
  RunSaver,
  recoverFromCandidate,
  recoverSlot,
  type SaveBackend,
  type SaveTrigger,
  type SlotHeader,
  type SlotId,
  withoutIronmanRuns,
  worldHash,
} from '../src/core/save';

const RUN = 'r-1a2b3c4d';
const OTHER = 'r-5e6f7a8b';
const VERSIONS = {
  gameVersion: '0.1.0',
  contentVersion: 'c-test',
  renameVersion: RENAME_VERSION,
  build: 'test',
};
const KERNEL = { content: {} as ContentMap, systems: [] };

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
  return { clock, storage, be };
}

function kernel(seed = 4): Engine {
  return Engine.create(seed, {} as ContentMap, [], { aiMode: 'off' });
}

function req(slot: SlotId, trigger?: SaveTrigger) {
  return {
    slot,
    trigger,
    savedAt: '2026-11-16T00:00:00.000Z',
    summary: { act: 'act1', map: 'borderstone' },
  };
}

function step(e: Engine, key: string, value: number | string, ticks = 5): void {
  e.queue('flag.set', { key, value });
  e.step(ticks);
}

describe('the slot and trigger rules', () => {
  it('lets an ironman run save only to its slot, only on autosave points, exit and recovery', () => {
    expect(ironmanViolation(true, IRONMAN_SLOT, 'auto')).toBeNull();
    expect(ironmanViolation(true, IRONMAN_SLOT, 'exit')).toBeNull();
    expect(ironmanViolation(true, IRONMAN_SLOT, 'recovery')).toBeNull();
    expect(ironmanViolation(true, IRONMAN_SLOT, 'manual')).toMatch(/autosave/);
    expect(ironmanViolation(true, IRONMAN_SLOT, 'quick')).toMatch(/autosave/);
    expect(ironmanViolation(true, IRONMAN_SLOT, undefined)).toMatch(/unnamed/);
    expect(ironmanViolation(true, 'manual_01', 'auto')).toMatch(/only to the ironman slot/);
    expect(ironmanViolation(true, 'quick', 'auto')).toMatch(/only to the ironman slot/);
    expect(ironmanViolation(false, IRONMAN_SLOT, 'auto')).toMatch(/only an ironman run/);
    expect(ironmanViolation(false, 'manual_01', undefined)).toBeNull();
  });

  it('refuses a breaking save before draining the log, so the next save keeps its commands', async () => {
    const { be } = setup();
    const e = kernel();
    const saver = new RunSaver({
      backend: be,
      runId: RUN,
      versions: VERSIONS,
      flags: { ironman: true },
    });
    step(e, 'n', 1);
    const logged = e.world.log.length;
    expect(logged).toBe(1);
    for (const r of [
      req('manual_01', 'auto'),
      req(IRONMAN_SLOT, 'manual'),
      req(IRONMAN_SLOT, 'quick'),
      req('quick'),
    ]) {
      expect(await saver.save(e, r)).toMatchObject({ ok: false, code: 'bad_request' });
    }
    expect([e.world.log.length, saver.pendingCommands]).toEqual([logged, 0]);
    const ok = await saver.save(e, req(IRONMAN_SLOT, 'auto'));
    if (!ok.ok) throw new Error(ok.reason);
    expect(ok.header.flags.ironman).toBe(true);
    expect(ok.header.files.segments.reduce((n, s) => n + s.count, 0)).toBe(1);
    expect((await be.list()).map((r) => r.slot)).toEqual([IRONMAN_SLOT]);
    // A normal run never writes the ironman slot.
    const normal = new RunSaver({ backend: be, runId: OTHER, versions: VERSIONS });
    expect(await normal.save(kernel(), req(IRONMAN_SLOT, 'auto'))).toMatchObject({
      ok: false,
      code: 'bad_request',
    });
  });

  it('carries the ironman flag into a loaded run, which keeps the rules', async () => {
    const { be } = setup();
    const e = kernel();
    const saver = new RunSaver({
      backend: be,
      runId: RUN,
      versions: VERSIONS,
      flags: { ironman: true },
    });
    step(e, 'n', 1);
    expect((await saver.save(e, req(IRONMAN_SLOT, 'exit'))).ok).toBe(true);
    const loaded = await loadSlot(be, IRONMAN_SLOT);
    const again = new RunSaver({
      backend: be,
      runId: RUN,
      versions: VERSIONS,
      from: loaded.header,
      fromMode: loaded.aiMode,
    });
    expect(again.ironman).toBe(true);
    expect(await again.save(e, req('manual_02', 'auto'))).toMatchObject({ ok: false });
    expect((await again.save(e, req(IRONMAN_SLOT, 'auto'))).ok).toBe(true);
  });
});

describe('one run per ironman slot, and its flags stay', () => {
  it('refuses another run over the ironman slot until the old run is deleted', async () => {
    const { be } = setup();
    const a = new RunSaver({
      backend: be,
      runId: RUN,
      versions: VERSIONS,
      flags: { ironman: true },
    });
    expect((await a.save(kernel(), req(IRONMAN_SLOT, 'auto'))).ok).toBe(true);
    const b = new RunSaver({
      backend: be,
      runId: OTHER,
      versions: VERSIONS,
      flags: { ironman: true },
    });
    const refused = await b.save(kernel(9), req(IRONMAN_SLOT, 'auto'));
    expect(refused).toMatchObject({ ok: false, code: 'bad_request' });
    expect((await be.list())[0]?.header?.runId).toBe(RUN);
    await be.delete({ slotId: IRONMAN_SLOT });
    expect((await b.save(kernel(9), req(IRONMAN_SLOT, 'auto'))).ok).toBe(true);
  });

  it('cannot switch a loaded ironman run off, and a recovered ironman run stays marked', async () => {
    const { be } = setup();
    const e = kernel();
    const first = new RunSaver({
      backend: be,
      runId: RUN,
      versions: VERSIONS,
      flags: { ironman: true },
    });
    const res = await first.save(e, {
      ...req(IRONMAN_SLOT, 'recovery'),
      flags: { recovered: true },
    });
    if (!res.ok) throw new Error(res.reason);
    const loaded = await loadSlot(be, IRONMAN_SLOT);
    const next = new RunSaver({
      backend: be,
      runId: RUN,
      versions: VERSIONS,
      from: loaded.header,
      fromMode: loaded.aiMode,
      flags: { ironman: false },
    });
    expect(next.ironman).toBe(true);
    step(e, 'n', 1);
    const again = await next.save(e, req(IRONMAN_SLOT, 'auto'));
    if (!again.ok) throw new Error(again.reason);
    expect(again.header.flags).toMatchObject({ ironman: true, recovered: true });
    // A header in the ironman slot is an ironman run's, whatever its flags say.
    const restored = { ...loaded.header, flags: { ...loaded.header.flags, ironman: false } };
    expect(
      new RunSaver({ backend: be, runId: RUN, versions: VERSIONS, from: restored }).ironman,
    ).toBe(true);
  });
});

describe('act-change anchors (5.3)', () => {
  it('anchors every act change of an ironman run and keeps those beside the periodic anchors', async () => {
    const { be } = setup();
    const e = kernel();
    const policy = { everyTicks: 1_000_000, keep: 1 };
    const saver = new RunSaver({
      backend: be,
      runId: RUN,
      versions: VERSIONS,
      flags: { ironman: true },
      anchors: policy,
    });
    let header: SlotHeader | null = null;
    const save = async () => {
      const res = await saver.save(e, req(IRONMAN_SLOT, 'auto'));
      if (!res.ok) throw new Error(res.reason);
      header = res.header;
      return res.header;
    };
    step(e, 'act', 'prologue');
    const first = await save();
    expect(first.files.anchors).toEqual([
      { tick: first.tick, sha256: first.files.snapshot.sha256 },
    ]);
    step(e, 'n', 1);
    expect((await save()).files.anchors.length).toBe(1);
    const ticks: [string, number][] = [];
    for (const act of ['act1', 'act2', 'act3']) {
      step(e, 'act', act);
      const h = await save();
      ticks.push([act, h.tick]);
      step(e, 'n', 2);
      await save();
    }
    const h = header as unknown as SlotHeader;
    expect(h.files.anchors.map((a) => [a.act ?? null, a.tick])).toEqual([
      [null, first.tick],
      ...ticks,
    ]);
    // After a load, the next act change is still anchored.
    const loaded = await loadSlot(be, IRONMAN_SLOT);
    const resumed = Engine.resume(loaded.world, {} as ContentMap, [], { aiMode: 'off' });
    const next = new RunSaver({
      backend: be,
      runId: RUN,
      versions: VERSIONS,
      from: loaded.header,
      fromMode: loaded.aiMode,
      anchors: policy,
    });
    step(resumed, 'act', 'act4');
    const res = await next.save(resumed, req(IRONMAN_SLOT, 'auto'));
    if (!res.ok) throw new Error(res.reason);
    expect(res.header.files.anchors.at(-1)).toMatchObject({ act: 'act4', tick: res.header.tick });
  });

  it('adds no act anchors to a normal run', async () => {
    const { be } = setup();
    const e = kernel();
    const saver = new RunSaver({
      backend: be,
      runId: RUN,
      versions: VERSIONS,
      anchors: { everyTicks: 1_000_000, keep: 4 },
    });
    step(e, 'act', 'act1');
    expect((await saver.save(e, req('manual_01'))).ok).toBe(true);
    step(e, 'act', 'act2');
    const res = await saver.save(e, req('manual_01'));
    if (!res.ok) throw new Error(res.reason);
    expect(res.header.files.anchors.length).toBe(1);
    expect(res.header.files.anchors.some((a) => a.act !== undefined)).toBe(false);
  });

  it('anchors an act change on the next save when its own save failed, and keeps act anchors across a chain restart', async () => {
    const { be } = setup();
    let failNext = false;
    const flaky: SaveBackend = {
      list: () => be.list(),
      read: (r) => be.read(r),
      delete: (r) => be.delete(r),
      recoverables: () => be.recoverables(),
      restore: (r) => be.restore(r),
      write: (r) => {
        if (!failNext) return be.write(r);
        failNext = false;
        return Promise.resolve({ ok: false, code: 'io', reason: 'disk busy' });
      },
    };
    const e = kernel();
    const saver = new RunSaver({
      backend: flaky,
      runId: RUN,
      versions: VERSIONS,
      flags: { ironman: true },
      anchors: { everyTicks: 1_000_000, keep: 1 },
    });
    const save = async (gap = false) => {
      const res = await saver.save(
        { world: e.world, drainLog: () => e.drainLog(), logGap: gap },
        req(IRONMAN_SLOT, 'auto'),
      );
      return res;
    };
    step(e, 'act', 'act1');
    expect((await save()).ok).toBe(true);
    step(e, 'act', 'act2');
    failNext = true;
    expect((await save()).ok).toBe(false);
    step(e, 'n', 1);
    const after = await save();
    if (!after.ok) throw new Error(after.reason);
    expect(after.header.files.anchors.map((a) => [a.act ?? null, a.tick])).toEqual([
      [null, 5],
      ['act2', after.header.tick],
    ]);
    // The engine dropped log entries: the chain restarts, the act anchor stays.
    step(e, 'act', 'act3');
    const restarted = await save(true);
    if (!restarted.ok) throw new Error(restarted.reason);
    expect(restarted.header.files.segments).toEqual([]);
    expect(restarted.header.files.anchors.map((a) => a.act ?? null)).toEqual(['act2', 'act3']);
  });

  it('trims only the periodic anchors', () => {
    const sha = (n: number) => n.toString(16).padStart(64, '0');
    let a = nextAnchors([], 10, sha(1), { everyTicks: 10, keep: 2 });
    a = nextAnchors(a, 15, sha(2), { everyTicks: 10, keep: 2 }, 'act1');
    a = nextAnchors(a, 20, sha(3), { everyTicks: 10, keep: 2 });
    a = nextAnchors(a, 30, sha(4), { everyTicks: 10, keep: 2 });
    a = nextAnchors(a, 40, sha(5), { everyTicks: 10, keep: 2 });
    expect(a.map((x) => [x.tick, x.act ?? null])).toEqual([
      [15, 'act1'],
      [30, null],
      [40, null],
    ]);
    // An act change on the tick of the last anchor tags it instead of doubling it.
    const tagged = nextAnchors(a, 40, sha(5), { everyTicks: 10, keep: 2 }, 'act2');
    expect(tagged.at(-1)).toEqual({ tick: 40, sha256: sha(5), act: 'act2' });
  });
});

describe('older snapshots of an ironman run', () => {
  async function run() {
    const s = setup();
    const e = kernel();
    const saver = new RunSaver({
      backend: s.be,
      runId: RUN,
      versions: VERSIONS,
      flags: { ironman: true },
      anchors: { everyTicks: 0, keep: 2 },
    });
    const hashes: number[] = [];
    for (let i = 1; i <= 4; i++) {
      step(e, 'n', i);
      const res = await saver.save(e, req(IRONMAN_SLOT, 'auto'));
      if (!res.ok) throw new Error(res.reason);
      hashes.push(worldHash(e.world));
    }
    // A normal run alongside.
    const other = new RunSaver({
      backend: s.be,
      runId: OTHER,
      versions: VERSIONS,
      anchors: { everyTicks: 0, keep: 1 },
    });
    const o = kernel(9);
    for (let i = 0; i < 3; i++) {
      step(o, 'm', i);
      expect((await other.save(o, req('manual_05'))).ok).toBe(true);
    }
    s.clock.t = 2 * HOUR_MS;
    await s.be.collect();
    return { ...s, e, hashes };
  }

  it('leaves them out of the recoverable saves a player restores at will', async () => {
    const r = await run();
    const records = await r.be.list();
    expect([...ironmanRuns(records)]).toEqual([RUN]);
    const all = await r.be.recoverables();
    expect(all.some((x) => x.runId === RUN)).toBe(true);
    const open = withoutIronmanRuns(all, records);
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((x) => x.runId === OTHER)).toBe(true);
  });

  it('recovers a corrupted ironman slot into the same slot, still ironman and flagged recovered', async () => {
    const r = await run();
    const logs: unknown[] = [];
    const opts = {
      game: KERNEL,
      versions: VERSIONS,
      savedAt: '2026-11-17T00:00:00.000Z',
      log: (l: unknown) => logs.push(l),
    };
    const records = await r.be.list();
    const h = records.find((x) => x.slot === IRONMAN_SLOT)?.header as SlotHeader;
    const prev = records.find((x) => x.slot === IRONMAN_SLOT)?.prev as SlotHeader;
    // Level 2: the previous generation, as for any run.
    const snap = (sha: string) => `runs/${RUN}/snap/${sha}.hks`;
    const bytes = (r.storage.peek(snap(h.files.snapshot.sha256)) as Uint8Array).slice();
    bytes[10] = (bytes[10] as number) ^ 0xff;
    r.storage.poke(snap(h.files.snapshot.sha256), bytes);
    const l2 = await recoverSlot(r.be, IRONMAN_SLOT, opts);
    expect(l2.level).toBe(2);
    // Level 3: both generations gone; the replay lands in the ironman slot itself.
    r.storage.drop(snap(prev.files.snapshot.sha256));
    const l3 = await recoverSlot(r.be, IRONMAN_SLOT, opts);
    if (l3.level !== 3) throw new Error(`level ${l3.level}`);
    expect(l3.slot).toBe(IRONMAN_SLOT);
    expect(l3.loaded.header.flags).toMatchObject({ ironman: true, recovered: true });
    expect(l3.span?.reachedTick).toBe(h.tick);
    expect(worldHash(l3.loaded.world)).toBe(r.hashes[3]);
    expect(logs.length).toBe(2);
  });

  it('restores a picked unreferenced snapshot of an ironman run with the ironman flag kept', async () => {
    const r = await run();
    const records = await r.be.list();
    const cur = records.find((x) => x.slot === IRONMAN_SLOT)?.header as SlotHeader;
    // Break the slot beyond anchors, then offer an older snapshot of the run from the trash.
    const snap = (sha: string) => `runs/${RUN}/snap/${sha}.hks`;
    const pick = (await r.be.recoverables()).find((x) => x.runId === RUN);
    expect(pick).toBeDefined();
    for (const g of [cur, records.find((x) => x.slot === IRONMAN_SLOT)?.prev as SlotHeader]) {
      r.storage.drop(snap(g.files.snapshot.sha256));
      for (const a of g.files.anchors)
        if (a.sha256 !== pick?.sha256) r.storage.drop(snap(a.sha256));
    }
    const opts = {
      game: KERNEL,
      versions: VERSIONS,
      savedAt: '2026-11-17T00:00:00.000Z',
      log: () => {},
    };
    const l4 = await recoverSlot(r.be, IRONMAN_SLOT, opts);
    if (l4.level !== 4) throw new Error(`level ${l4.level}`);
    const c = l4.candidates.find((x) => x.sha256 === pick?.sha256);
    expect(c?.source).toBe('trash');
    const done = await recoverFromCandidate(r.be, IRONMAN_SLOT, c as never, opts);
    expect(done.slot).toBe(IRONMAN_SLOT);
    expect(done.loaded.level).toBe(4);
    expect(done.loaded.header.flags).toMatchObject({ ironman: true, recovered: true });
    expect(done.loaded.world.meta.tick).toBe(pick?.tick);
  });
});
