// PK-M0-17 acceptance (release_engineering.md 13.6: a complete route, saved 40 times) on
// the full rule_merca route, prologue to epilogue through act 6: the shorter of the two
// ending routes since the PK-M0-29 rescale (about 1.78 million ticks against 2.37 million
// for the true ending, which release.playthrough.test.ts plays). The autoplayer plays
// from the prologue to the ending while the game saves 40 and more times into a save
// directory on disk (the desktop layout, node:fs). Every save drains the
// engine's replay log into a commands segment and is an anchor. Then every segment is
// replayed from its anchor, and one long replay runs from a middle anchor to the end;
// each must reach the world the run saved (world hash and full state hash). The replays
// run in this process, on the code the run was played with, so edits to the sources
// during the long run cannot skew them. The act 6 save is also read back whole (PK-M0-16,
// 5.8 budget). The replay tool's command line is covered by tests/replay_segments.test.ts.

import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Engine } from '../../src/core/engine';
import {
  ContainerBackend,
  loadReplay,
  loadSlot,
  MANUAL_SLOTS,
  planReplay,
  RunSaver,
  runIdFromBytes,
  runReplay,
  type SlotHeader,
  type SlotId,
  stateHash,
  worldHash,
} from '../../src/core/save';
import { NodeFsStorage } from '../../src/core/save/fs_storage';
import { Autoplayer, type AutoplayResult } from '../../src/game/autoplay';
import { createGame, resumeGame } from '../../src/game/create';
import { ACT_ORDER, CHEATS, SEED } from './harness';

/** Ticks between saves: 46 saves on the route (measured), room above the 40 of 13.6. */
const EVERY = 40_000;
const ROUTE = 'rule_merca';
const MB = 1024 * 1024;
const VERSIONS = { gameVersion: 'test', contentVersion: 'c-test', renameVersion: 0, build: 'test' };
/**
 * Time limit of the recording and of each replay. Measured alone on the shared M0 machine
 * (five other node processes at full load): the recording took 27.7 minutes and the two
 * replays 36.2 minutes together, 64 minutes for the file; 45 minutes each leaves room for
 * the load without hiding a run that is stuck (the autoplayer reports a stall itself).
 */
const LIMIT = 45 * 60 * 1000;

interface Save {
  tick: number;
  slot: SlotId;
  hash: number;
  state: number;
  /** commands in the log just before the save drained it */
  drained: number;
}

let dir = '';
let engine: Engine;
let backend: ContainerBackend;
let result: AutoplayResult;
const saves: Save[] = [];
let header: SlotHeader;
let act6: { tick: number; hash: number; loadedHash: number; bytes: number; text: number } | null =
  null;
let act6Resumed = false;

/** Replay from the anchor at `from` to `to`; the hashes there, and what the run saved. */
async function replay(from: number, to: number) {
  const plan = planReplay(header, from, to);
  const { world, commands, aiMode } = await loadReplay(backend, plan);
  const run = runReplay(world, engine.content, engine.systems, commands, to, { aiMode });
  const saved = saves.find((s) => s.tick === to);
  const line = `anchor ${from} -> ${to}: ${commands.length} commands`;
  return { run, saved, line };
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'hk-replay-segments-'));
  backend = new ContainerBackend(new NodeFsStorage(dir), {
    now: () => Date.now(),
    writer: { id: 'w-playthrough', name: 'playthrough' },
  });
  engine = createGame({ seed: SEED, aiMode: 'off' });
  const saver = new RunSaver({
    backend,
    runId: runIdFromBytes(randomBytes(8)),
    versions: VERSIONS,
    // Every save is an anchor, so any of them can start a replay.
    anchors: { everyTicks: 0, keep: 1000 },
  });
  const bot = new Autoplayer(engine, { route: ROUTE, log: () => {} });
  const save = async (slot: SlotId) => {
    const drained = engine.world.log.length;
    const res = await saver.save(engine, {
      slot,
      savedAt: new Date().toISOString(),
      summary: { act: String(engine.world.meta.flags.act ?? ''), map: '' },
    });
    if (!res.ok) throw new Error(`save at ${engine.tick}: ${res.reason}`);
    // The log in memory holds only the commands since the last save.
    expect(engine.world.log.length).toBe(0);
    expect(saver.pendingCommands).toBe(0);
    saves.push({
      tick: engine.tick,
      slot,
      hash: worldHash(engine.world),
      state: stateHash(engine.world),
      drained,
    });
    console.log(
      `[replay_segments] save ${saves.length} ${slot} tick ${engine.tick} ` +
        `act ${engine.world.meta.flags.act} commands ${drained}`,
    );
    return res.header;
  };
  let next = EVERY;
  for (;;) {
    result = bot.run({
      until: (e) => e.tick >= next || (!act6 && e.world.meta.flags.act === 'act6'),
    });
    if (result.finished || result.stuck) break;
    if (!act6 && engine.world.meta.flags.act === 'act6') {
      // The act 6 save, read back whole.
      const h = await save('auto_1');
      const loaded = await loadSlot(backend, 'auto_1');
      act6 = {
        tick: engine.tick,
        hash: worldHash(engine.world),
        loadedHash: worldHash(loaded.world),
        bytes: h.files.snapshot.bytes,
        text: JSON.stringify(loaded.world).length,
      };
      // A loaded act 6 world runs on.
      const resumed = resumeGame(loaded.world, { aiMode: 'off', content: engine.content });
      resumed.step(2000);
      act6Resumed = resumed.tick === engine.tick + 2000;
      continue;
    }
    while (next <= engine.tick) next += EVERY;
    await save(MANUAL_SLOTS[saves.length % MANUAL_SLOTS.length] as SlotId);
  }
  header = await save('quick');
  console.log(
    `[replay_segments] ${saves.length} saves, ending=${result.ending} tick=${engine.tick} ` +
      `segments=${header.files.segments.length} anchors=${header.files.anchors.length}`,
  );
}, LIMIT);

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('command log segments over the full route (PK-M0-17)', () => {
  it('finishes the route while saving 40 times and more, draining the log each time', () => {
    expect(result.stuck).toBeUndefined();
    expect(result.finished).toBe(true);
    expect(result.ending).toBe(ROUTE);
    expect(result.acts.map((a) => a.act)).toEqual(ACT_ORDER);
    for (const kind of CHEATS) expect(result.commands[kind] ?? 0, kind).toBe(0);
    expect(saves.length).toBeGreaterThanOrEqual(40);
    expect(header.files.anchors.length).toBe(new Set(saves.map((s) => s.tick)).size);
    const segs = header.files.segments;
    expect(segs[0]?.fromTick).toBe(0);
    for (let i = 1; i < segs.length; i++) expect(segs[i]?.fromTick).toBe(segs[i - 1]?.toTick);
    // Every command logged during the run is in exactly one segment.
    expect(segs.reduce((n, s) => n + s.count, 0)).toBe(saves.reduce((n, s) => n + s.drained, 0));
    expect(segs.every((s) => s.aiMode === 'off')).toBe(true);
  });

  it('reads the act 6 save back whole, within the 5.8 budget', () => {
    expect(act6).not.toBeNull();
    expect(act6?.loadedHash).toBe(act6?.hash);
    expect(act6?.bytes ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(2.5 * MB);
    expect(act6?.text ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(12 * MB);
    expect(act6Resumed).toBe(true);
  });

  it(
    'replays every segment from its anchor to the next save',
    async () => {
      const anchors = header.files.anchors.map((a) => a.tick).sort((a, b) => a - b);
      const lines: string[] = [];
      for (let i = 0; i + 1 < anchors.length; i++) {
        const { run, saved, line } = await replay(anchors[i] as number, anchors[i + 1] as number);
        lines.push(
          `${run.hash === saved?.hash && run.state === saved?.state ? 'same' : 'DIFFERENT'} ${line}`,
        );
      }
      console.log(`[replay_segments] hops\n${lines.join('\n')}`);
      expect(lines.length).toBe(anchors.length - 1);
      expect(lines.filter((l) => !l.startsWith('same '))).toEqual([]);
    },
    LIMIT,
  );

  it(
    'replays from a middle anchor to the end',
    async () => {
      const anchors = header.files.anchors.map((a) => a.tick).sort((a, b) => a - b);
      const middle = anchors[Math.floor(anchors.length / 2)] as number;
      const { run, saved, line } = await replay(middle, header.tick);
      console.log(`[replay_segments] ${line}`);
      expect(run.hash).toBe(saved?.hash);
      expect(run.state).toBe(saved?.state);
      expect(run.days.length).toBeGreaterThan(10);
    },
    LIMIT,
  );
});
