// The replay tool (release_engineering.md 13.6), loaded by run.ts through Vite so the game
// content (import.meta.glob) builds under Node.
//
//   replay  --dir <saves dir> --slot <slot> [--anchor <tick> | --all | --hops]
//           [--to <tick>] [--shard <i>/<n>] [--days]
//     Read a slot from a save directory (the desktop layout of 5.2), take an anchor (the
//     earliest by default, the latest at or before --anchor), replay the command segments
//     after it with the model off up to --to (default: the slot's tick), and compare the
//     world hash and the full state hash with the snapshot saved at that tick (the slot's
//     own, or an anchor's).
//     --all replays every anchor to the end; --hops every anchor to the next one (each
//     segment checked once); --shard keeps every n-th job so processes can split the work.
//     --days prints the hash at every game-day boundary. Exit code 1 when any differs.
//
//   record  --dir <saves dir> [--route release] [--seed N] [--every <ticks>] [--until <act>]
//           [--max-ticks N] [--fixture <file>]
//     Play a no-model route with the autoplayer, saving every --every ticks into rotating
//     manual slots (every save is an anchor) and once more at the end into `quick`.
//     --fixture also copies the last snapshot file there (a test fixture).

import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Engine } from '../../src/core/engine';
import {
  ContainerBackend,
  filePath,
  isSlotId,
  loadReplay,
  loadSlot,
  MANUAL_SLOTS,
  planReplay,
  RunSaver,
  readWorld,
  runIdFromBytes,
  runReplay,
  type SlotId,
  stateHash,
  worldHash,
} from '../../src/core/save';
import { NodeFsStorage } from '../../src/core/save/fs_storage';
import { Autoplayer, type EndingRoute } from '../../src/game/autoplay';
import { createGame } from '../../src/game/create';

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): { cmd: string; args: Args } {
  const [cmd = 'help', ...rest] = argv;
  const args: Args = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string;
    if (!a.startsWith('--')) continue;
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[a.slice(2)] = next;
      i++;
    } else {
      args[a.slice(2)] = true;
    }
  }
  return { cmd, args };
}

function backendAt(dir: string): ContainerBackend {
  return new ContainerBackend(new NodeFsStorage(resolve(dir)), {
    now: () => Date.now(),
    writer: { id: 'w-replay', name: 'replay tool' },
    // The tool never collects; reading may only bring a trashed file a slot names back.
    autoCollect: false,
  });
}

const VERSIONS = { gameVersion: 'tool', contentVersion: '', renameVersion: 0, build: 'replay' };

export async function main(argv: string[]): Promise<number> {
  const { cmd, args } = parseArgs(argv);
  if (cmd === 'replay') return replay(args);
  if (cmd === 'record') return record(args);
  console.log(
    'usage: node tools/replay/run.ts replay --dir <saves> --slot <slot> [--anchor <tick> | --all | --hops] [--to <tick>] [--shard i/n] [--days]\n' +
      '       node tools/replay/run.ts record --dir <saves> [--route release] [--seed N] [--every <ticks>] [--until <act>] [--max-ticks N] [--fixture <file>]',
  );
  return cmd === 'help' ? 0 : 2;
}

async function replay(args: Args): Promise<number> {
  const dir = String(args.dir ?? '');
  const slot = String(args.slot ?? '');
  if (!dir || !isSlotId(slot)) {
    console.error('replay needs --dir and a valid --slot');
    return 2;
  }
  const backend = backendAt(dir);
  const loaded = await loadSlot(backend, slot);
  const header = loaded.header;
  const game = createGame({ seed: loaded.world.meta.seed, aiMode: 'off' });
  const anchors = header.files.anchors.map((a) => a.tick).sort((a, b) => a - b);
  const to = args.to === undefined ? header.tick : Number(args.to);
  let jobs: { from: number | undefined; to: number }[];
  if (args.hops) {
    jobs = anchors
      .map((a, i) => ({ from: a, to: anchors[i + 1] ?? header.tick }))
      .filter((j) => j.to > j.from);
  } else if (args.all) {
    jobs = anchors.filter((a) => a <= to).map((a) => ({ from: a, to }));
  } else {
    jobs = [{ from: args.anchor === undefined ? undefined : Number(args.anchor), to }];
  }
  if (args.shard !== undefined) {
    const m = /^(\d+)\/(\d+)$/.exec(String(args.shard));
    const i = Number(m?.[1]);
    const n = Number(m?.[2]);
    if (!m || n < 1 || i >= n) {
      console.error('--shard takes <i>/<n> with 0 <= i < n');
      return 2;
    }
    jobs = jobs.filter((_, k) => k % n === i);
  }
  type Target = { hash: number; state: number };
  const targets = new Map<number, Target>([
    [header.tick, { hash: worldHash(loaded.world), state: stateHash(loaded.world) }],
  ]);
  const targetAt = async (tick: number): Promise<Target | null> => {
    const known = targets.get(tick);
    if (known) return known;
    const anchor = header.files.anchors.find((a) => a.tick === tick);
    if (!anchor) return null;
    const w = await readWorld(backend, header.slot, anchor.sha256);
    const t = { hash: worldHash(w), state: stateHash(w) };
    targets.set(tick, t);
    return t;
  };
  if (loaded.level > 0) console.log(`note: slot ${slot} read from its previous generation`);
  let bad = 0;
  for (const job of jobs) {
    const plan = planReplay(header, job.from, job.to);
    const { world, commands, aiMode } = await loadReplay(backend, plan);
    const target = await targetAt(plan.toTick);
    const t0 = performance.now();
    const run = runReplay(world, game.content, game.systems, commands, plan.toTick, { aiMode });
    const ms = Math.round(performance.now() - t0);
    if (args.days) {
      for (const d of run.days) console.log(`day ${d.day} tick ${d.tick} hash ${hex(d.hash)}`);
    }
    const same = target !== null && run.hash === target.hash && run.state === target.state;
    const verdict = target === null ? 'reached' : same ? 'same' : 'DIFFERENT';
    if (verdict === 'DIFFERENT') bad++;
    const vs = target === null ? '' : ` vs saved ${hex(target.hash)} state ${hex(target.state)}`;
    console.log(
      `${verdict} anchor ${plan.anchor.tick} -> ${plan.toTick}: ${commands.length} commands, ` +
        `hash ${hex(run.hash)} state ${hex(run.state)}${vs} (${ms} ms)`,
    );
  }
  return bad === 0 ? 0 : 1;
}

async function record(args: Args): Promise<number> {
  const dir = String(args.dir ?? '');
  if (!dir) {
    console.error('record needs --dir');
    return 2;
  }
  mkdirSync(resolve(dir), { recursive: true });
  const backend = backendAt(dir);
  const route = String(args.route ?? 'release') as EndingRoute;
  const seed = Number(args.seed ?? 20261115);
  const every = Number(args.every ?? 50_000);
  const until = typeof args.until === 'string' ? args.until : undefined;
  const engine = createGame({ seed, aiMode: 'off' });
  const saver = new RunSaver({
    backend,
    runId: runIdFromBytes(randomBytes(8)),
    versions: VERSIONS,
    anchors: { everyTicks: 0, keep: 1000 },
  });
  const bot = new Autoplayer(engine, { route, log: () => {} });
  let next = every;
  let n = 0;
  const writes: Promise<string | null>[] = [];
  const t0 = performance.now();
  const result = bot.run({
    maxTicks: args['max-ticks'] === undefined ? undefined : Number(args['max-ticks']),
    until: (e) => {
      if (until && e.world.meta.flags.act === until) return true;
      if (e.tick >= next) {
        next += every;
        const slot = MANUAL_SLOTS[n++ % MANUAL_SLOTS.length] as SlotId;
        writes.push(save(saver, e, slot));
      }
      return false;
    },
  });
  const last = await save(saver, engine, 'quick');
  const failed = (await Promise.all(writes)).filter((w) => w === null).length + (last ? 0 : 1);
  console.log(
    `recorded ${n + 1} saves to ${dir}: ending=${result.ending} tick=${engine.tick} ` +
      `(${Math.round(performance.now() - t0)} ms)`,
  );
  if (typeof args.fixture === 'string' && last) {
    const src = join(resolve(dir), ...filePath(saver.runId, 'snapshot', last).split('/'));
    mkdirSync(dirname(resolve(args.fixture)), { recursive: true });
    copyFileSync(src, resolve(args.fixture));
    console.log(`fixture ${args.fixture} <- ${src}`);
  }
  return failed === 0 ? 0 : 1;
}

/** Save and report; the saver queues writes, so the game loop never waits. */
async function save(saver: RunSaver, engine: Engine, slot: SlotId): Promise<string | null> {
  const res = await saver.save(engine, {
    slot,
    savedAt: new Date().toISOString(),
    summary: { act: String(engine.world.meta.flags.act ?? ''), map: '' },
  });
  if (!res.ok) {
    console.error(`save to ${slot} failed: ${res.reason}`);
    return null;
  }
  return res.header.files.snapshot.sha256;
}

function hex(n: number): string {
  return n.toString(16).padStart(8, '0');
}
