// Replay consistency of an autoplayed run: the command log of the run, replayed with
// Engine.replay on a fresh world of the same seed, reaches the same world hash.

import { describe, expect, it } from 'vitest';
import { Engine, worldHash } from '../../src/core';
import { playthrough, SEED } from './harness';

describe('no-model playthrough: replay', () => {
  it('replays the logged commands of the prologue and act 1 to the same world', () => {
    const { engine } = playthrough('release', {
      stop: (e) => e.world.meta.flags.act === 'act2',
      logLimit: 10_000_000,
    });
    expect(engine.world.meta.flags.act).toBe('act2');
    const tick = engine.tick;
    const original = worldHash(engine.world);
    expect(engine.world.log.length).toBeGreaterThan(100);
    const replay = Engine.replay(SEED, engine.content, engine.systems, engine.world.log, {
      logLimit: 10_000_000,
    });
    replay.step(tick);
    expect(replay.tick).toBe(tick);
    expect(replay.world.meta.flags.act).toBe('act2');
    expect(worldHash(replay.world)).toBe(original);
  });
});
