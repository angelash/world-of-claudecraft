// Command-log segments and replay from anchors (release_engineering.md 13.6, PK-M0-17), on a
// short autoplayed run: 40 saves along the way drain the engine's replay log into
// `commands` segments, every save is an anchor, and a replay from an anchor plus the
// segments after it reaches the world the original run saved. The replay tool's command
// line (tools/replay/run.ts) runs once on a save directory on disk. The full-route version
// of this check is tests/playthrough/replay_segments.playthrough.test.ts.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Engine, LOG_HARD_FACTOR } from '../src/core/engine';
import {
  ContainerBackend,
  type LoadedSave,
  loadReplay,
  loadSlot,
  MANUAL_SLOTS,
  MemoryStorage,
  planReplay,
  RunSaver,
  readWorld,
  runReplay,
  type SlotId,
  stateHash,
  worldHash,
} from '../src/core/save';
import { NodeFsStorage } from '../src/core/save/fs_storage';
import { TICKS_PER_GAME_DAY } from '../src/core/time';
import { Autoplayer } from '../src/game/autoplay';
import { createGame } from '../src/game/create';

const SEED = 20261115;
const RUN_TICKS = 4000;
const EVERY = 95;
const VERSIONS = { gameVersion: 'test', contentVersion: 'c-test', renameVersion: 0, build: 'test' };

function backend(): ContainerBackend {
  return new ContainerBackend(new MemoryStorage(), {
    now: () => 0,
    writer: { id: 'w-test', name: 'test' },
  });
}

interface Recorded {
  engine: Engine;
  saves: { tick: number; slot: SlotId; drained: number; hash: number; state: number }[];
  /** commands drained by the final save */
  finalDrained: number;
  finalHash: number;
  finalState: number;
  loaded: LoadedSave;
  backend: ContainerBackend;
}

/** Autoplay RUN_TICKS ticks, saving every EVERY ticks (each save an anchor), then once more. */
async function record(): Promise<Recorded> {
  const store = backend();
  const engine = createGame({ seed: SEED, aiMode: 'off' });
  const saver = new RunSaver({
    backend: store,
    runId: 'r-5e9a0001',
    versions: VERSIONS,
    anchors: { everyTicks: 0, keep: 1000 },
  });
  const bot = new Autoplayer(engine, { route: 'release', log: () => {} });
  const saves: Recorded['saves'] = [];
  let next = EVERY;
  while (engine.tick < RUN_TICKS) {
    bot.run({ maxTicks: RUN_TICKS - engine.tick, until: (e) => e.tick >= next });
    if (engine.tick >= RUN_TICKS) break;
    while (next <= engine.tick) next += EVERY;
    const slot = MANUAL_SLOTS[saves.length % MANUAL_SLOTS.length] as SlotId;
    const drained = engine.world.log.length;
    const res = await saver.save(engine, {
      slot,
      savedAt: '2026-11-16T00:00:00.000Z',
      summary: { act: String(engine.world.meta.flags.act ?? ''), map: '' },
    });
    expect(res.ok).toBe(true);
    // The log in memory never holds more than the commands since the last save.
    expect(engine.world.log.length).toBe(0);
    expect(saver.pendingCommands).toBe(0);
    saves.push({
      tick: engine.tick,
      slot,
      drained,
      hash: worldHash(engine.world),
      state: stateHash(engine.world),
    });
  }
  const finalDrained = engine.world.log.length;
  const res = await saver.save(engine, {
    slot: 'quick',
    savedAt: '2026-11-16T00:00:00.000Z',
    summary: { act: '', map: '' },
  });
  expect(res.ok).toBe(true);
  const loaded = await loadSlot(store, 'quick');
  return {
    engine,
    saves,
    finalDrained,
    finalHash: worldHash(engine.world),
    finalState: stateHash(engine.world),
    loaded,
    backend: store,
  };
}

describe('command log segments and replay from anchors', () => {
  it('saves 40 times along a run and replays every segment and the end from anchors', async () => {
    const r = await record();
    expect(r.saves.length).toBeGreaterThanOrEqual(40);
    const header = r.loaded.header;
    expect(worldHash(r.loaded.world)).toBe(r.finalHash);
    // Every save became an anchor; the segments run on from tick 0 without a gap.
    expect(header.files.anchors.length).toBe(r.saves.length + 1);
    const segs = header.files.segments;
    expect(segs[0]?.fromTick).toBe(0);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]?.fromTick).toBe(segs[i - 1]?.toTick);
    }
    const total = segs.reduce((n, s) => n + s.count, 0);
    expect(total).toBe(r.saves.reduce((n, s) => n + s.drained, 0) + r.finalDrained);
    expect(total).toBeGreaterThan(40);

    const game = createGame({ seed: SEED, aiMode: 'off' });
    const anchors = header.files.anchors.map((a) => a.tick);
    // Every hop: anchor i to anchor i+1 reaches the world saved at i+1.
    for (let i = 0; i + 1 < anchors.length; i++) {
      const from = anchors[i] as number;
      const to = anchors[i + 1] as number;
      const plan = planReplay(header, from, to);
      const { world, commands, aiMode } = await loadReplay(r.backend, plan);
      const run = runReplay(world, game.content, game.systems, commands, to, { aiMode });
      const saved = r.saves.find((s) => s.tick === to);
      expect(run.hash, `hop ${from} -> ${to}`).toBe(saved?.hash ?? r.finalHash);
      expect(run.state, `hop ${from} -> ${to}`).toBe(saved?.state ?? r.finalState);
    }
    // Every fourth anchor (and the first) all the way to the end of the run.
    for (let i = 0; i < anchors.length; i += 4) {
      const plan = planReplay(header, anchors[i]);
      const { world, commands, aiMode } = await loadReplay(r.backend, plan);
      const run = runReplay(world, game.content, game.systems, commands, plan.toTick, { aiMode });
      expect(run.hash, `anchor ${anchors[i]} -> end`).toBe(r.finalHash);
      expect(run.state, `anchor ${anchors[i]} -> end`).toBe(r.finalState);
    }
  }, 120_000);

  it('saving does not change the run', async () => {
    const r = await record();
    const plain = createGame({ seed: SEED, aiMode: 'off' });
    const bot = new Autoplayer(plain, { route: 'release', log: () => {} });
    bot.run({ maxTicks: r.engine.tick });
    expect(plain.tick).toBe(r.engine.tick);
    expect(worldHash(plain.world)).toBe(r.finalHash);
    // The anchor snapshots are the worlds of the run at those ticks.
    const at = r.saves[10] as Recorded['saves'][number];
    const anchor = r.loaded.header.files.anchors.find((a) => a.tick === at.tick);
    expect(anchor).toBeDefined();
    const w = await readWorld(r.backend, 'quick', anchor?.sha256 ?? '');
    expect(worldHash(w)).toBe(at.hash);
  }, 120_000);
});

describe('the replay tool (tools/replay/run.ts)', () => {
  it('replays every segment of a save directory and fails on a tampered world', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hk-replay-tool-'));
    try {
      const store = new ContainerBackend(new NodeFsStorage(dir), {
        now: () => Date.now(),
        writer: { id: 'w-test', name: 'test' },
      });
      const engine = createGame({ seed: SEED, aiMode: 'off' });
      const saver = new RunSaver({
        backend: store,
        runId: 'r-5e9a0002',
        versions: VERSIONS,
        anchors: { everyTicks: 0, keep: 100 },
      });
      const bot = new Autoplayer(engine, { route: 'release', log: () => {} });
      for (const slot of ['manual_01', 'manual_02', 'quick'] as const) {
        bot.run({ maxTicks: 500 });
        const res = await saver.save(engine, {
          slot,
          savedAt: '2026-11-16T00:00:00.000Z',
          summary: { act: '', map: '' },
        });
        expect(res.ok).toBe(true);
      }
      const tool = (args: string[]) =>
        spawnSync(process.execPath, [join(__dirname, '..', 'tools', 'replay', 'run.ts'), ...args], {
          cwd: join(__dirname, '..'),
          encoding: 'utf8',
        });
      const ok = tool(['replay', '--dir', dir, '--slot', 'quick', '--hops', '--days']);
      const lines = ok.stdout.split('\n').filter((l) => / anchor \d+ -> \d+:/.test(l));
      expect(ok.status, ok.stdout + ok.stderr).toBe(0);
      expect(lines.length).toBe(2);
      expect(lines.every((l) => l.startsWith('same '))).toBe(true);
      expect(tool(['replay', '--dir', dir, '--slot', 'quick', '--shard', '2/2']).status).toBe(2);
      // A world changed behind the log's back does not replay.
      engine.world.meta.flags.tampered = true;
      engine.step(10);
      expect(
        (
          await saver.save(engine, {
            slot: 'quick',
            savedAt: '2026-11-16T00:00:00.000Z',
            summary: { act: '', map: '' },
          })
        ).ok,
      ).toBe(true);
      const bad = tool(['replay', '--dir', dir, '--slot', 'quick', '--hops']);
      expect(bad.status).toBe(1);
      expect(bad.stdout).toMatch(/^DIFFERENT anchor \d+ -> \d+:/m);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});

describe('engine replay log', () => {
  it('drains the log, flags it full at the limit and keeps the oldest until the hard cap', () => {
    const engine = createGame({ seed: 3, aiMode: 'off', logLimit: 4 });
    const move = (x: number) =>
      engine.queue('world.move_to', { entityId: 'player', x: 10 + x, y: 9.5 });
    for (let i = 0; i < 3; i++) {
      move(i);
      engine.step(1);
    }
    expect(engine.logFull).toBe(false);
    move(3);
    engine.step(1);
    expect(engine.logFull).toBe(true);
    const drained = engine.drainLog();
    expect(drained.map((e) => e.tick)).toEqual([1, 2, 3, 4]);
    expect(engine.world.log).toEqual([]);
    expect(engine.logFull).toBe(false);
    // With nobody draining, nothing is dropped until LOG_HARD_FACTOR times the limit.
    for (let i = 0; i < 4 * LOG_HARD_FACTOR + 3; i++) {
      move(i);
      engine.step(1);
    }
    expect(engine.world.log.length).toBe(4 * LOG_HARD_FACTOR);
    expect(engine.world.log[0]?.tick).toBe(engine.tick - 4 * LOG_HARD_FACTOR + 1);
  });

  it('replays from a snapshot whose inbox still holds commands without applying them twice', () => {
    const a = createGame({ seed: 9, aiMode: 'off' });
    a.queue('world.move_to', { entityId: 'player', x: 17.5, y: 9.5 });
    a.step(30);
    a.drainLog();
    // Queued but not applied yet: the snapshot carries it in the inbox, and the log
    // records it when it is applied on the next tick.
    a.queue('world.move_to', { entityId: 'player', x: 4.5, y: 4.5 });
    const snapshot = JSON.parse(JSON.stringify({ ...a.world, log: [] }));
    expect(snapshot.inbox.length).toBe(1);
    a.step(200);
    const log = a.drainLog();
    expect(log.length).toBe(1);
    const b = Engine.replayFrom(snapshot, a.content, a.systems, log);
    b.step(200);
    expect(worldHash(b.world)).toBe(worldHash(a.world));
    const applied = (e: Engine) =>
      e.world.recent.filter((ev) => ev.kind === 'command.result' && ev.tick === 31).length;
    expect(applied(a)).toBe(1);
    expect(applied(b)).toBe(1);
  });

  it('records the world hash at every game-day boundary of a replay', () => {
    // The kernel alone (no systems): only the day bookkeeping is under test here.
    const a = createGame({ seed: 4, aiMode: 'off', systems: [] });
    const start = JSON.parse(JSON.stringify(a.world));
    a.step(TICKS_PER_GAME_DAY + 50);
    const run = runReplay(start, a.content, a.systems, a.drainLog(), TICKS_PER_GAME_DAY + 50);
    expect(run.days.map((d) => d.tick)).toEqual([TICKS_PER_GAME_DAY]);
    expect(run.hash).toBe(worldHash(a.world));
  });
});
