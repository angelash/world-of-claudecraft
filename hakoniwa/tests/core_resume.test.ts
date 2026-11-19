// Owner migrations run before the first resumed input, without rerunning fresh-world
// initializers. Normal saves, factory resumes and snapshot replays keep the full state.
import { describe, expect, it } from 'vitest';
import { Engine, ok } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import { deserializeWorld, serializeWorld, stateHash } from '../src/core/save';
import type { GameSystem } from '../src/core/system';
import { createGame, resumeGame } from '../src/game/create';
import { UnregisteredFlagError } from '../src/game/flag_guard';

declare module '../src/core/contracts' {
  interface WorldSlices {
    zz_resume_test: { value: number };
  }
  interface CommandMap {
    'resume_test.add': { amount: number };
  }
}

const CONTENT = {} as ContentMap;
const SCRIPT = { type: 'script', script: 'resume_test' } as const;

function owner() {
  const calls = { init: 0, resume: 0 };
  const system: GameSystem = {
    id: 'zz_resume_test',
    order: 5,
    init(ctx) {
      calls.init++;
      ctx.world.slices.zz_resume_test = { value: 0 };
    },
    resume(ctx) {
      calls.resume++;
      ctx.world.slices.zz_resume_test ??= { value: 0 };
    },
    tick(ctx) {
      ctx.world.slices.zz_resume_test.value += ctx.rng('resume_test').int(1, 3);
    },
    commands: {
      'resume_test.add'(ctx, data) {
        ctx.world.slices.zz_resume_test.value += data.amount;
        return ok();
      },
    },
  };
  return { system, calls };
}

describe('owner resume lifecycle', () => {
  it('runs resume once before queued input, keeps saved data and does not rerun init', () => {
    const { system, calls } = owner();
    const live = Engine.create(27, CONTENT, [system]);
    live.world.slices.zz_resume_test.value = 41;
    live.queue('resume_test.add', { amount: 100 }, SCRIPT);
    const loaded = deserializeWorld(serializeWorld(live.world));
    const resumed = Engine.resume(loaded, CONTENT, [system]);
    expect(calls).toEqual({ init: 1, resume: 1 });
    expect(resumed.tick).toBe(0);
    expect(resumed.world.slices.zz_resume_test.value).toBe(41);
    live.step(5);
    resumed.step(5);
    expect(calls).toEqual({ init: 1, resume: 1 });
    expect(stateHash(resumed.world)).toBe(stateHash(live.world));
  });

  it('factory resume backfills a missing owner slice before its queued command', () => {
    const { system, calls } = owner();
    const live = createGame({ seed: 27, content: CONTENT, systems: [system] });
    live.queue('resume_test.add', { amount: 100 }, SCRIPT);
    const loaded = deserializeWorld(serializeWorld(live.world));
    delete (loaded.slices as { zz_resume_test?: unknown }).zz_resume_test;
    const resumed = resumeGame(loaded, { content: CONTENT, systems: [system] });
    expect(resumed.world.slices.zz_resume_test.value).toBe(0);
    expect(calls).toEqual({ init: 1, resume: 1 });
    resumed.step(1);
    expect(resumed.world.slices.zz_resume_test.value).toBeGreaterThanOrEqual(101);
  });

  it('snapshot replay and factory resume preserve the complete deterministic state', () => {
    const { system, calls } = owner();
    const live = createGame({ seed: 31, aiMode: 'off', content: CONTENT, systems: [system] });
    live.queue('resume_test.add', { amount: 13 }, SCRIPT);
    live.step(3);
    const snapshot = serializeWorld(live.world);
    live.queue('resume_test.add', { amount: 29 }, SCRIPT);
    live.step(7);
    const replay = Engine.replayFrom(
      deserializeWorld(snapshot),
      CONTENT,
      live.systems,
      live.world.log,
      { aiMode: 'off' },
    );
    replay.step(7);
    const factory = resumeGame(deserializeWorld(snapshot), {
      content: CONTENT,
      systems: [system],
      aiMode: 'off',
    });
    factory.queue('resume_test.add', { amount: 29 }, SCRIPT);
    factory.step(7);
    expect(calls).toEqual({ init: 1, resume: 2 });
    expect(stateHash(replay.world)).toBe(stateHash(live.world));
    expect(stateHash(factory.world)).toBe(stateHash(live.world));
  });

  it('guards owner resume flag writes with the same policy as other system handlers', () => {
    const { system } = owner();
    const live = createGame({ content: CONTENT, systems: [system] });
    const bad: GameSystem = {
      id: 'bad_resume',
      order: 1,
      resume(ctx) {
        ctx.setFlag('resume_test.unregistered', true);
      },
    };
    expect(() =>
      resumeGame(deserializeWorld(serializeWorld(live.world)), {
        content: CONTENT,
        systems: [bad],
        flagPolicy: 'throw',
      }),
    ).toThrow(UnregisteredFlagError);
  });
});
