import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { deserializeWorld, Engine, stateHash, worldHash } from '../src/core';
import { createGame } from '../src/game/create';
import { observePlaythrough } from './playthrough/diagnostics';

it('bounds playthrough logs and preserves the exact world in its failure checkpoint', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hakoniwa-playthrough-diagnostics-'));
  try {
    const live = createGame({ seed: 23, aiMode: 'off' });
    const control = createGame({ seed: 23, aiMode: 'off' });
    const observer = observePlaythrough(live, () => 'fixture', {
      directory,
      intervalTicks: 1,
      checkpointTicks: 1,
      maxRecords: 3,
    });
    for (let i = 0; i < 5; i++) {
      for (const engine of [live, control]) {
        engine.queue('world.stop', { entityId: engine.world.slices.world.playerId });
        engine.step(1);
      }
    }
    observer.finish('failed', { stuck: 'fixture' });
    expect(stateHash(live.world)).toBe(stateHash(control.world));
    expect(live.world.log).toEqual(control.world.log);
    const records = readFileSync(join(directory, 'progress.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(records).toHaveLength(3);
    expect(records.at(-1).reason).toBe('failed');
    const saved = deserializeWorld(readFileSync(join(directory, 'failed.hks'), 'utf8'));
    expect(stateHash(saved)).toBe(stateHash(live.world));
    expect(JSON.parse(readFileSync(join(directory, 'commands.json'), 'utf8'))).toEqual(
      live.world.log,
    );
    expect(JSON.parse(readFileSync(join(directory, 'result.json'), 'utf8'))).toMatchObject({
      status: 'failed',
      tick: 5,
      detail: { stuck: 'fixture' },
      checkpointTick: 5,
      previousCheckpointTick: 4,
      logGap: false,
    });
    // A checkpoint on the final tick still leaves a real, nonempty replay segment.
    const previous = deserializeWorld(readFileSync(join(directory, 'previous.hks'), 'utf8'));
    expect(previous.meta.tick).toBe(4);
    const replay = Engine.replayFrom(previous, live.content, live.systems, live.world.log, {
      aiMode: 'off',
    });
    replay.step(1);
    expect(worldHash(replay.world)).toBe(worldHash(live.world));
    expect(stateHash(replay.world)).toBe(stateHash(live.world));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
