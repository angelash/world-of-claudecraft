import { describe, expect, it } from 'vitest';
import { buildContent, validateContent } from '../src/content';
import { Engine, ok, worldHash } from '../src/core';
import type { GameSystem } from '../src/core/system';
import { tr } from '../src/core/text';
import { TICKS_PER_GAME_HOUR, tickAtDay } from '../src/core/time';
import { createGame } from '../src/game/create';
import { findPath, mapById, playerEntity } from '../src/systems/world';

declare module '../src/core/contracts' {
  interface CommandMap {
    'test.roll': { n: number };
  }
  interface EventMap {
    'test.rolled': { value: number };
  }
}

/** A tiny system that consumes randomness and asks the AI layer for decisions. */
const probe: GameSystem = {
  id: 'zz_probe',
  order: 999,
  tick(ctx) {
    if (ctx.tick % 50 === 0) {
      ctx.ai.request({
        agentId: 'probe',
        role: 'test',
        purpose: 'roll',
        revision: ctx.tick,
        context: {},
        allowed: ['test.roll'],
        fallback: [
          { kind: 'test.roll', data: { n: 6 }, source: { type: 'system', system: 'probe' } },
        ],
        deadlineTicks: 10,
      });
    }
  },
  commands: {
    'test.roll'(ctx, d) {
      ctx.emit('test.rolled', { value: ctx.rng('probe').int(1, d.n) });
      return ok();
    },
  },
};

function run(seed: number, withAi: boolean) {
  const game = createGame({ seed });
  const engine = Engine.create(seed, game.content, [...game.systems, probe], {
    aiMode: withAi ? 'external' : 'off',
  });
  engine.queue('world.move_to', { entityId: 'player', x: 17.5, y: 9.5 });
  engine.step(30);
  engine.queue('test.roll', { n: 20 });
  for (let i = 0; i < 400; i++) {
    engine.step(1);
    for (const r of engine.takeAiRequests()) {
      engine.resolveAi(r.id, {
        type: 'proposal',
        commands: [{ kind: 'test.roll', data: { n: 100 }, source: { type: 'player' } }],
      });
    }
  }
  return engine;
}

describe('kernel', () => {
  it('is deterministic for the same seed and inputs', () => {
    expect(worldHash(run(7, false).world)).toBe(worldHash(run(7, false).world));
    expect(worldHash(run(7, false).world)).not.toBe(worldHash(run(8, false).world));
  });

  it('replays a run (including AI proposals) from its command log without the AI', () => {
    const original = run(11, true);
    const replay = Engine.replay(11, original.content, original.systems, original.world.log);
    replay.step(original.tick);
    expect(worldHash(replay.world)).toBe(worldHash(original.world));
  });

  it('runs AI fallbacks on the next tick when the AI is off', () => {
    const engine = run(3, false);
    const resolved = engine.world.recent.filter((e) => e.kind === 'ai.resolved');
    expect(resolved.length).toBeGreaterThan(0);
    expect(resolved.every((e) => e.kind === 'ai.resolved' && e.data.outcome === 'fallback')).toBe(
      true,
    );
    expect(engine.world.ai.pending.length).toBe(0);
  });

  it('applies player movement through pathfinding around walls', () => {
    const engine = run(5, false);
    const p = playerEntity(engine.world);
    expect(p).toBeDefined();
    expect(Math.hypot((p?.x ?? 0) - 17.5, (p?.y ?? 0) - 9.5)).toBeLessThan(0.5);
  });

  it('finds no path into a sealed room and a path around water', () => {
    const map = mapById(buildContent(), 'testfield');
    if (!map) throw new Error('missing test map');
    expect(findPath(map, { x: 2.5, y: 1.5 }, { x: 18.5, y: 3.5 })).not.toBeNull();
    expect(findPath(map, { x: 2.5, y: 1.5 }, { x: 8.5, y: 8.5 })).not.toBeNull();
  });

  it('emits hour and day events on the calendar', () => {
    const engine = createGame({ seed: 1 });
    engine.step(TICKS_PER_GAME_HOUR + 1);
    expect(engine.world.recent.some((e) => e.kind === 'world.hour')).toBe(true);
    engine.step(tickAtDay(1, 0, 1) - engine.tick);
    expect(engine.world.recent.some((e) => e.kind === 'world.day')).toBe(true);
  });

  it('rejects unknown commands with a readable reason', () => {
    const engine = createGame({ seed: 1 });
    engine.queue('world.use_exit', { entityId: 'player', exitId: 'nowhere' });
    engine.step(1);
    const res = engine.world.recent.find((e) => e.kind === 'command.result');
    expect(res && res.kind === 'command.result' && res.data.ok).toBe(false);
    expect(res?.kind === 'command.result' && res.data.reason).toEqual(
      tr('sys.world.reject.no_exit'),
    );
  });
});

describe('content', () => {
  it('validates every pack', () => {
    expect(validateContent(buildContent())).toEqual([]);
  });
});
