// Corruption recovery (release_engineering.md 5.6 and 10.4, PK-M0-18): one kind of damage
// per level lands on that level and recovers to the expected tick. A short autoplayed run
// saves into two slots of one run; each case damages a copy of its saves: a truncated
// header (level 1), a flipped byte (level 2), deleted snapshots (level 3: replay from an
// anchor, also stopping early when a segment is gone), deleted anchors (level 4: the
// candidates, one replayed forward along the broken slot's chain, one restored). The
// recovered save goes to a new slot flagged recovered, and every recovery is logged. The
// frozen corrupted files of tests/fixtures/saves/corrupt land on their levels too. Also
// the seed replay of an AI-off run (Engine.replay).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ContentMap } from '../src/core/contracts';
import { Engine } from '../src/core/engine';
import {
  ContainerBackend,
  chooseRecoverySlot,
  formatRecoveryLog,
  loadSlot,
  MemoryStorage,
  RENAME_VERSION,
  type RecoveryCandidate,
  type RecoveryLog,
  type RecoveryOptions,
  RunSaver,
  recoverableId,
  recoverFromCandidate,
  recoverSlot,
  type SlotHeader,
  type SlotId,
  type SlotRecord,
  serializeWorld,
  sha256Hex,
  stateHash,
  worldHash,
} from '../src/core/save';
import type { GameSystem } from '../src/core/system';
import { Autoplayer } from '../src/game/autoplay';
import { createGame } from '../src/game/create';

const SEED = 20261116;
const RUN = 'r-7e57ab1e';
const VERSIONS = {
  gameVersion: '0.1.0',
  contentVersion: 'c-test',
  renameVersion: RENAME_VERSION,
  build: 'test',
};
const EVERY = 300;
const SAVES = 8;
const CORRUPT = join(__dirname, 'fixtures', 'saves', 'corrupt');

interface Recorded {
  storage: MemoryStorage;
  hash: Map<number, number>;
  state: Map<number, number>;
  /** the run's world hash 200 ticks after its last save, with no input */
  after: number;
  game: { content: ContentMap; systems: readonly GameSystem[] };
}

let rec: Recorded;

/**
 * Autoplay, saving every EVERY ticks: the first three saves into manual_02, the rest into
 * manual_01 (one run, one chain). Anchors every 600 ticks, the latest two kept, so
 * manual_01 ends at 2400 with anchors 1500 and 2100, and the saves at 1200 and 1800 are
 * referenced by no header.
 */
beforeAll(async () => {
  const storage = new MemoryStorage({ now: () => 0 });
  const be = backendOn(storage);
  const game = createGame({ seed: SEED, aiMode: 'off' });
  const saver = new RunSaver({
    backend: be,
    runId: RUN,
    versions: VERSIONS,
    anchors: { everyTicks: 600, keep: 2 },
  });
  const bot = new Autoplayer(game, { route: 'release', log: () => {} });
  const hash = new Map<number, number>();
  const state = new Map<number, number>();
  for (let i = 1; i <= SAVES; i++) {
    // The autoplayer moves in strides; it stops short and the last ticks run without input.
    const target = i * EVERY;
    bot.run({ maxTicks: target - 100 - game.tick, until: (e) => e.tick >= target - 100 });
    expect(game.tick).toBeLessThanOrEqual(target);
    game.step(target - game.tick);
    expect(game.tick).toBe(i * EVERY);
    const res = await saver.save(game, {
      slot: i <= 3 ? 'manual_02' : 'manual_01',
      savedAt: `2026-11-16T00:00:0${i}.000Z`,
      summary: { act: String(game.world.meta.flags.act ?? ''), map: 'borderstone' },
    });
    if (!res.ok) throw new Error(res.reason);
    hash.set(game.tick, worldHash(game.world));
    state.set(game.tick, stateHash(game.world));
  }
  expect(game.world.log.length).toBe(0);
  game.step(200);
  rec = { storage, hash, state, after: worldHash(game.world), game };
}, 120_000);

function backendOn(storage: MemoryStorage): ContainerBackend {
  return new ContainerBackend(storage, {
    now: () => 0,
    writer: { id: 'w-test', name: 'test' },
    versions: VERSIONS,
  });
}

/** A copy of the recorded saves to damage. */
async function copy() {
  const storage = new MemoryStorage({ now: () => 0 });
  for (const p of rec.storage.paths())
    storage.poke(p, (rec.storage.peek(p) as Uint8Array).slice(), 0);
  const be = backendOn(storage);
  const records = await be.list();
  const slot = (s: SlotId) => records.find((r) => r.slot === s) as SlotRecord;
  const logs: RecoveryLog[] = [];
  const opts: RecoveryOptions = {
    game: rec.game,
    versions: VERSIONS,
    savedAt: '2026-11-17T00:00:00.000Z',
    log: (l) => logs.push(l),
  };
  const snap = (sha: string) => `runs/${RUN}/snap/${sha}.hks`;
  return {
    storage,
    be,
    cur: slot('manual_01').header as SlotHeader,
    prev: slot('manual_01').prev as SlotHeader,
    logs,
    opts,
    snap,
    dropSnapshotAt: (h: SlotHeader, tick: number) => {
      const sha =
        h.tick === tick
          ? h.files.snapshot.sha256
          : h.files.anchors.find((a) => a.tick === tick)?.sha256;
      if (!sha) throw new Error(`no snapshot at ${tick}`);
      storage.drop(snap(sha));
    },
  };
}

describe('the recorded run', () => {
  it('has the shape the cases rely on', async () => {
    const c = await copy();
    expect([c.cur.tick, c.prev.tick]).toEqual([2400, 2100]);
    expect(c.cur.files.anchors.map((a) => a.tick)).toEqual([1500, 2100]);
    const m2 = (await c.be.list()).find((r) => r.slot === 'manual_02') as SlotRecord;
    expect([m2.header?.tick, m2.prev?.tick]).toEqual([900, 600]);
    expect((await c.be.recoverables()).map((r) => r.tick).sort()).toEqual([1200, 1800]);
  });
});

describe('one kind of damage per level (5.6)', () => {
  it('level 1: a truncated header falls back to the previous generation', async () => {
    const c = await copy();
    c.storage.poke(
      'slots/manual_01.json',
      readFileSync(join(CORRUPT, 'header_truncated.json.part')),
    );
    const r = await recoverSlot(c.be, 'manual_01', c.opts);
    if (r.level !== 1) throw new Error(`level ${r.level}`);
    expect([r.loaded.header.tick, worldHash(r.loaded.world)]).toEqual([2100, rec.hash.get(2100)]);
    expect(c.logs.map((l) => [l.level, l.slot])).toEqual([[1, 'manual_01']]);
  });

  it('level 2: a flipped byte in the snapshot falls back to the previous snapshot', async () => {
    const c = await copy();
    const p = c.snap(c.cur.files.snapshot.sha256);
    const bytes = (c.storage.peek(p) as Uint8Array).slice();
    bytes[Math.floor(bytes.length / 2)] = (bytes[Math.floor(bytes.length / 2)] as number) ^ 0x40;
    c.storage.poke(p, bytes);
    const r = await recoverSlot(c.be, 'manual_01', c.opts);
    if (r.level !== 2) throw new Error(`level ${r.level}`);
    expect([r.loaded.header.tick, worldHash(r.loaded.world)]).toEqual([2100, rec.hash.get(2100)]);
    expect(c.logs.map((l) => l.level)).toEqual([2]);
  });

  it('level 3: deleted snapshots of both generations replay from the latest good anchor to the header tick', async () => {
    const c = await copy();
    c.dropSnapshotAt(c.cur, 2400);
    c.dropSnapshotAt(c.cur, 2100);
    const r = await recoverSlot(c.be, 'manual_01', c.opts);
    if (r.level !== 3) throw new Error(`level ${r.level}`);
    expect(r.span).toMatchObject({ fromTick: 1500, targetTick: 2400, reachedTick: 2400 });
    expect(r.span?.commands).toBeGreaterThan(0);
    // The files were missing rather than damaged: the cloud may still be syncing them.
    expect(r.loaded.cloudPending).toBe(true);
    expect(worldHash(r.loaded.world)).toBe(rec.hash.get(2400));
    expect(stateHash(r.loaded.world)).toBe(rec.state.get(2400));
    // A new slot, flagged recovered; the broken slot is left as it was.
    expect(r.slot).toBe('manual_03');
    expect(r.loaded.header).toMatchObject({ slot: 'manual_03', tick: 2400, runId: RUN });
    expect(r.loaded.header.flags.recovered).toBe(true);
    expect(r.loaded.header.files.anchors.map((a) => a.tick)).toEqual([2400]);
    const broken = (await c.be.list()).find((x) => x.slot === 'manual_01');
    expect(broken?.header?.headerSha256).toBe(c.cur.headerSha256);
    const again = await loadSlot(c.be, 'manual_03');
    expect(worldHash(again.world)).toBe(rec.hash.get(2400));
    // The engine has left replay and goes on live like the original run.
    expect(r.engine?.tick).toBe(2400);
    r.engine?.step(200);
    expect(worldHash(r.engine?.world as never)).toBe(rec.after);
    expect(c.logs).toEqual([
      expect.objectContaining({
        level: 3,
        slot: 'manual_01',
        target: 'manual_03',
        fromTick: 1500,
        reachedTick: 2400,
      }),
    ]);
    expect(formatRecoveryLog(c.logs[0] as RecoveryLog)).toMatch(
      /level 3, replayed 1500 -> 2400 of 2400, saved to manual_03/,
    );
  });

  it('waits for the cloud instead when asked and the files are only missing', async () => {
    const c = await copy();
    c.dropSnapshotAt(c.cur, 2400);
    c.dropSnapshotAt(c.cur, 2100);
    await expect(
      recoverSlot(c.be, 'manual_01', { ...c.opts, waitForCloud: true }),
    ).rejects.toMatchObject({
      problem: 'unreadable',
      cloudPending: true,
    });
    expect((await c.be.list()).map((r) => r.slot)).toEqual(['manual_01', 'manual_02']);
    expect(c.logs).toEqual([]);
  });

  it('level 3: with a command segment gone, the replay stops at the furthest tick it can reach', async () => {
    const c = await copy();
    c.dropSnapshotAt(c.cur, 2400);
    c.dropSnapshotAt(c.cur, 2100);
    const seg = c.cur.files.segments.find((s) => s.fromTick === 2100);
    expect(seg).toBeDefined();
    c.storage.drop(`runs/${RUN}/seg/${seg?.sha256}.hkg`);
    const r = await recoverSlot(c.be, 'manual_01', c.opts);
    if (r.level !== 3) throw new Error(`level ${r.level}`);
    expect(r.span).toMatchObject({ fromTick: 1500, targetTick: 2400, reachedTick: 2100 });
    expect([r.loaded.header.tick, worldHash(r.loaded.world)]).toEqual([2100, rec.hash.get(2100)]);
    expect(stateHash(r.loaded.world)).toBe(rec.state.get(2100));
  });

  it('level 4: with the anchors gone too, lists the candidates and recovers the picked ones', async () => {
    const c = await copy();
    for (const t of [2400, 2100, 1500]) c.dropSnapshotAt(c.cur, t);
    const r = await recoverSlot(c.be, 'manual_01', c.opts);
    if (r.level !== 4) throw new Error(`level ${r.level}`);
    // The other slot's snapshots lie on the broken slot's chain: they replay on to 2400.
    expect(r.candidates.map((x) => [x.source, x.tick, x.reachTick])).toEqual([
      ['slot', 900, 2400],
      ['slot', 600, 2400],
      ['slot', 300, 2400],
      ['volume', 1800, 1800],
      ['volume', 1200, 1200],
    ]);
    expect(c.logs.map((l) => [l.level, l.candidates])).toEqual([[4, 5]]);
    const first = await recoverFromCandidate(c.be, 'manual_01', r.candidates[0] as never, c.opts);
    expect(first.loaded.level).toBe(4);
    expect(first.span).toMatchObject({ fromTick: 900, reachedTick: 2400 });
    expect(worldHash(first.loaded.world)).toBe(rec.hash.get(2400));
    expect(stateHash(first.loaded.world)).toBe(rec.state.get(2400));
    expect(first.loaded.header).toMatchObject({ slot: 'manual_03', tick: 2400 });
    expect(first.loaded.header.flags.recovered).toBe(true);
    // An unreferenced snapshot is committed as it is.
    const vol = r.candidates.find((x) => x.tick === 1800);
    const second = await recoverFromCandidate(c.be, 'manual_01', vol as never, c.opts);
    expect([second.slot, second.engine, second.loaded.level]).toEqual(['manual_04', null, 4]);
    expect(worldHash(second.loaded.world)).toBe(rec.hash.get(1800));
    expect(second.loaded.header.flags.recovered).toBe(true);
    expect(c.logs.map((l) => [l.level, l.target ?? null])).toEqual([
      [4, null],
      [4, 'manual_03'],
      [4, 'manual_04'],
    ]);
  });

  it('places a recovered save in a free manual slot, else the oldest other autosave', () => {
    const h = (slot: SlotId, savedAt: string) =>
      ({ slot, header: { savedAt } as SlotHeader, prev: null }) as SlotRecord;
    expect(chooseRecoverySlot([h('manual_01', 'a')], 'manual_01', false)).toBe('manual_02');
    const full: SlotRecord[] = [
      ...Array.from({ length: 20 }, (_, i) =>
        h(`manual_${String(i + 1).padStart(2, '0')}` as SlotId, 'x'),
      ),
      h('auto_1', '2026-01-03'),
      h('auto_2', '2026-01-01'),
      h('auto_3', '2026-01-02'),
    ];
    expect(chooseRecoverySlot(full, 'auto_2', false)).toBe('auto_3');
    expect(chooseRecoverySlot(full, 'manual_01', false)).toBe('auto_2');
    expect(chooseRecoverySlot(full, 'ironman', true)).toBe('ironman');
  });
});

describe('recovery edge cases', () => {
  const REQ = {
    slot: 'manual_01' as const,
    savedAt: '2026-11-16T00:00:00.000Z',
    summary: { act: '', map: '' },
  };

  it('level 3: an unreadable segment before the anchor does not stop the replay', async () => {
    const c = await copy();
    c.dropSnapshotAt(c.cur, 2400);
    c.dropSnapshotAt(c.cur, 2100);
    const first = c.cur.files.segments.find((s) => s.kind === 'commands' && s.fromTick === 0);
    expect(first).toBeDefined();
    c.storage.drop(`runs/${RUN}/seg/${first?.sha256}.hkg`);
    const r = await recoverSlot(c.be, 'manual_01', c.opts);
    if (r.level !== 3) throw new Error(`level ${r.level}`);
    expect(r.span).toMatchObject({ fromTick: 1500, reachedTick: 2400 });
    expect(worldHash(r.loaded.world)).toBe(rec.hash.get(2400));
  });

  it('level 4: a picked snapshot that does not load is undone, leaving the target empty', async () => {
    const storage = new MemoryStorage({ now: () => 0 });
    const be = backendOn(storage);
    const e = Engine.create(2, {} as ContentMap, [], { aiMode: 'off' });
    const saver = new RunSaver({ backend: be, runId: RUN, versions: VERSIONS });
    e.step(5);
    const res = await saver.save(e, REQ);
    if (!res.ok) throw new Error(res.reason);
    // A snapshot whose head reads like a world but whose world does not validate.
    const file = JSON.parse(serializeWorld(e.world));
    file.world.ai.mode = 'dreaming';
    const bytes = new TextEncoder().encode(JSON.stringify(file));
    const sha = sha256Hex(bytes);
    storage.poke(`runs/${RUN}/snap/${sha}.hks`, bytes, 0);
    const candidate: RecoveryCandidate = {
      id: recoverableId(RUN, sha),
      runId: RUN,
      sha256: sha,
      tick: 5,
      act: '',
      source: 'volume',
      reachTick: 5,
    };
    const opts = {
      game: { content: {} as ContentMap, systems: [] },
      versions: VERSIONS,
      savedAt: 'x',
      log: () => {},
    };
    await expect(recoverFromCandidate(be, 'manual_01', candidate, opts)).rejects.toThrow(
      /does not load/,
    );
    expect((await be.list()).map((r) => r.slot)).toEqual(['manual_01']);
  });

  it('migrates anchors with the game systems as slice owners by default', async () => {
    const storage = new MemoryStorage({ now: () => 0 });
    const be = backendOn(storage);
    const probe: GameSystem & { idFields: { path: string; kind: string }[] } = {
      id: 'probe',
      order: 1,
      idFields: [{ path: 'list.*', kind: 'quest' }],
    };
    const e = Engine.create(2, {} as ContentMap, [probe], { aiMode: 'off' });
    (e.world.slices as unknown as Record<string, unknown>).probe = { list: ['a1_m01_fall'] };
    const saver = new RunSaver({
      backend: be,
      runId: RUN,
      versions: { ...VERSIONS, renameVersion: 0 },
      anchors: { everyTicks: 0, keep: 5 },
    });
    for (let i = 0; i < 3; i++) {
      e.queue('flag.set', { key: 'n', value: i });
      e.step(5);
      expect((await saver.save(e, REQ)).ok).toBe(true);
    }
    const recs = await be.list();
    for (const g of [recs[0]?.header, recs[0]?.prev] as SlotHeader[]) {
      storage.drop(`runs/${RUN}/snap/${g.files.snapshot.sha256}.hks`);
    }
    const r = await recoverSlot(be, 'manual_01', {
      game: { content: {} as ContentMap, systems: [probe] },
      versions: VERSIONS,
      savedAt: 'x',
      log: () => {},
    });
    if (r.level !== 3) throw new Error(`level ${r.level}`);
    expect((r.loaded.world.slices as unknown as Record<string, unknown>).probe).toEqual({
      list: ['q_a1_m01_fall'],
    });
    expect(r.loaded.world.meta.flags.n).toBe(2);
  });

  it('recovers a model run without asking the model again for the requests it answered', async () => {
    const asker: GameSystem = {
      id: 'asker',
      order: 1,
      tick(ctx) {
        if (ctx.tick % 10 === 8) {
          ctx.ai.request({
            agentId: 'asker',
            role: 'npc.daily',
            purpose: 'test',
            revision: 0,
            context: {},
            allowed: ['flag.set'],
            fallback: [],
            deadlineTicks: 1000,
          });
        }
      },
    };
    const storage = new MemoryStorage({ now: () => 0 });
    const be = backendOn(storage);
    const e = Engine.create(8, {} as ContentMap, [asker], { aiMode: 'external' });
    const saver = new RunSaver({
      backend: be,
      runId: RUN,
      versions: VERSIONS,
      anchors: { everyTicks: 40, keep: 3 },
    });
    const asked: { id: string; at: number }[] = [];
    for (let t = 1; t <= 120; t++) {
      e.step(1);
      for (const r of e.takeAiRequests()) asked.push({ id: r.id, at: e.tick });
      for (const a of asked.filter((x) => x.at === e.tick - 3)) {
        e.resolveAi(a.id, {
          type: 'proposal',
          commands: [
            {
              kind: 'flag.set',
              data: { key: `answer.${a.id}`, value: a.at },
              source: { type: 'player' },
            },
          ],
        });
      }
      if (t % 20 === 0) expect((await saver.save(e, REQ)).ok).toBe(true);
    }
    const stillPending = e.world.ai.pending.map((r) => r.id);
    expect(stillPending.length).toBeGreaterThan(0);
    const recs = await be.list();
    for (const g of [recs[0]?.header, recs[0]?.prev] as SlotHeader[]) {
      storage.drop(`runs/${RUN}/snap/${g.files.snapshot.sha256}.hks`);
    }
    const r = await recoverSlot(be, 'manual_01', {
      game: { content: {} as ContentMap, systems: [asker] },
      versions: VERSIONS,
      savedAt: 'x',
      log: () => {},
    });
    if (r.level !== 3) throw new Error(`level ${r.level}`);
    expect(r.span?.reachedTick).toBe(120);
    expect(r.span?.fromTick).toBeLessThan(100);
    expect(r.loaded.world.ai.mode).toBe('external');
    expect(r.loaded.world.ai.pending.map((x) => x.id)).toEqual(stillPending);
    for (const a of asked) {
      if (!stillPending.includes(a.id)) {
        expect(r.loaded.world.meta.flags[`answer.${a.id}`]).toBe(a.at);
      }
    }
    expect((r.engine as Engine).takeAiRequests().map((x) => x.id)).toEqual(stillPending);
  });

  it('never puts a recovered save over a newer save, and refuses the broken slot as target', async () => {
    const at = (slot: SlotId, h: Partial<SlotHeader>) =>
      ({ slot, header: h as SlotHeader, prev: null }) as SlotRecord;
    const v = { container: 1, renameVersion: 0, gameVersion: '' };
    const full: SlotRecord[] = [
      ...Array.from({ length: 20 }, (_, i) =>
        at(`manual_${String(i + 1).padStart(2, '0')}` as SlotId, {
          savedAt: 'x',
          worldVersion: 1,
          ...v,
        }),
      ),
      at('auto_1', { savedAt: '2026-01-01', worldVersion: 99, ...v }),
      at('auto_2', { savedAt: '2026-01-02', worldVersion: 1, ...v }),
    ];
    expect(chooseRecoverySlot(full, 'manual_01', false)).toBe('auto_3');
    const withAll = [...full, at('auto_3', { savedAt: '2026-01-03', worldVersion: 1, ...v })];
    expect(chooseRecoverySlot(withAll, 'manual_01', false)).toBe('auto_2');
    const c = await copy();
    for (const t of [2400, 2100]) c.dropSnapshotAt(c.cur, t);
    await expect(
      recoverSlot(c.be, 'manual_01', { ...c.opts, target: 'manual_01' }),
    ).rejects.toThrow(/broken slot/);
  });
});

describe('frozen corrupted saves (tests/fixtures/saves/corrupt)', () => {
  const CASES = (
    JSON.parse(readFileSync(join(CORRUPT, 'cases.json'), 'utf8')) as {
      cases: { file: string; target: string; problem: string; expect: number | 'newer' }[];
    }
  ).cases;

  async function twoGenerations() {
    const storage = new MemoryStorage({ now: () => 0 });
    const be = backendOn(storage);
    const e = Engine.create(1, {} as ContentMap, [], { aiMode: 'off' });
    const saver = new RunSaver({ backend: be, runId: RUN, versions: VERSIONS });
    const save = async (n: number) => {
      e.queue('flag.set', { key: 'n', value: n });
      e.step(5);
      const res = await saver.save(e, {
        slot: 'manual_01',
        savedAt: '2026-11-16T00:00:00.000Z',
        summary: { act: '', map: '' },
      });
      if (!res.ok) throw new Error(res.reason);
      return { header: res.header, hash: worldHash(e.world) };
    };
    const one = await save(1);
    const two = await save(2);
    return { storage, be, one, two };
  }

  for (const k of CASES) {
    it(`${k.file} (${k.problem}) as ${k.target}: ${k.expect === 'newer' ? 'refused as newer' : `level ${k.expect}`}`, async () => {
      const t = await twoGenerations();
      const bytes = new Uint8Array(readFileSync(join(CORRUPT, k.file)));
      const header = k.target === 'only_generation' ? null : t.two.header;
      if (k.target === 'header') t.storage.poke('slots/manual_01.json', bytes);
      else if (k.target === 'snapshot') {
        t.storage.poke(`runs/${RUN}/snap/${t.two.header.files.snapshot.sha256}.hks`, bytes);
      } else {
        const sha = sha256Hex(bytes);
        const slot = header ? 'manual_01' : 'manual_05';
        const res = await t.be.write({
          runId: RUN,
          slotId: slot,
          files: [{ kind: 'snapshot', sha256: sha, bytes }],
          header: {
            ...t.two.header,
            slot,
            files: { snapshot: { sha256: sha, bytes: bytes.length }, segments: [], anchors: [] },
          },
        });
        expect(res.ok).toBe(true);
        if (k.expect === 'newer') {
          // A newer world in the newest generation: the slot is refused, never fallen back.
          await expect(loadSlot(t.be, slot)).rejects.toMatchObject({ problem: 'newer' });
          return;
        }
      }
      const loaded = await loadSlot(t.be, 'manual_01');
      expect(loaded.level).toBe(k.expect);
      // Level 1 lands on the previous header (the first save), level 2 on the save
      // before the damaged generation.
      const want = k.target === 'generation' ? t.two.hash : t.one.hash;
      expect(worldHash(loaded.world)).toBe(want);
    });
  }
});

describe('the seed replay of an AI-off run (Engine.replay)', () => {
  // A system whose behaviour reads whether the AI is on, the way quest conditions read
  // `ai_enabled` (src/systems/quests/effects.ts), and that asks the AI with a fallback.
  const probe: GameSystem = {
    id: 'probe',
    order: 1,
    tick(ctx) {
      if (ctx.tick % 10 === 0) ctx.setFlag('ai_on', ctx.world.ai.mode !== 'off');
      if (ctx.tick === 3) {
        ctx.ai.request({
          agentId: 'probe',
          role: 'npc.daily',
          purpose: 'test',
          context: {} as never,
          allowed: ['flag.set'],
          fallback: [
            {
              kind: 'flag.set',
              data: { key: 'fallback', value: ctx.tick },
              source: { type: 'system', system: 'probe' },
            },
          ],
          deadlineTicks: 20,
        } as never);
      }
    },
  };

  it('replays like the run when told the run had the AI off', () => {
    const content = {} as ContentMap;
    const a = Engine.create(5, content, [probe], { aiMode: 'off' });
    a.queue('flag.set', { key: 'n', value: 1 });
    a.step(60);
    const off = Engine.replay(5, content, [probe], a.world.log, { aiMode: 'off' });
    off.step(60);
    expect(worldHash(off.world)).toBe(worldHash(a.world));
    expect(off.world.meta.flags.ai_on).toBe(false);
    // The default replay mode reads as "AI on" to such conditions.
    const replayMode = Engine.replay(5, content, [probe], a.world.log);
    replayMode.step(60);
    expect(replayMode.world.meta.flags.ai_on).toBe(true);
  });
});
