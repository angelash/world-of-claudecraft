// The brain inspector skeleton (builtin_ai.md 15, 19 step 4; PK-M0-26): any system can push
// a BrainTrace through SystemContext.brainTrace; the engine keeps it in memory (never
// saved) and the debug panel reads it back through Engine.recentTraces / traceActors. This
// tests the wiring end to end with a real Engine, and the pure display-line formatting of
// src/client/windows/brain_inspector.ts.

import { describe, expect, it } from 'vitest';
import { traceDisplayLines, traceLines } from '../src/client/windows/brain_inspector';
import { traceOfPick } from '../src/core/brain/trace';
import { pickBest, scoreAction } from '../src/core/brain/utility';
import type { ContentMap } from '../src/core/contracts';
import { Engine } from '../src/core/engine';
import type { GameSystem } from '../src/core/system';

/** A tiny system that records one trace per tick for a fixed actor. */
const probe: GameSystem = {
  id: 'zz_brain_probe',
  order: 999,
  tick(ctx) {
    const scored = ['walk', 'eat', 'sleep'].map((id, i) =>
      scoreAction({ id, weight: 3 - i, gates: [{ name: 'need', value: 1 }] }),
    );
    const pick = pickBest(scored, { band: 0, rng: ctx.rng('zz_brain_probe') });
    ctx.brainTrace(traceOfPick('ron', 'npc.life', ctx.tick, pick, 'npc.brain.ron'));
  },
};

const CONTENT = {} as ContentMap;

function game(seed = 1): Engine {
  return Engine.create(seed, CONTENT, [probe], { aiMode: 'off' });
}

describe('SystemContext.brainTrace and Engine trace reads', () => {
  it('records a trace an actor had none of before, and lists the actor', () => {
    const g = game();
    expect(g.traceActors()).toEqual([]);
    g.step(1);
    expect(g.traceActors()).toEqual(['ron']);
    expect(g.recentTraces('ron').length).toBe(1);
  });

  it('keeps the latest traces per actor as a ring (TraceBook, builtin_ai 2.6)', () => {
    const g = game();
    g.step(40);
    const traces = g.recentTraces('ron');
    expect(traces.length).toBe(32);
    expect(traces.at(-1)?.tick).toBe(
      traces[0] !== undefined ? (traces[0].tick as number) + 31 : -1,
    );
  });

  it('an actor with no trace yet reads back empty, not an error', () => {
    const g = game();
    expect(g.recentTraces('nobody')).toEqual([]);
  });

  it('traces never enter the world (not part of the save)', () => {
    const g = game();
    g.step(1);
    expect(JSON.stringify(g.world)).not.toContain('npc.life');
  });
});

describe('brain_inspector pure formatting', () => {
  it('formats a trace with its top candidates, newest first', () => {
    const scored = ['walk', 'eat'].map((id, i) =>
      scoreAction({ id, weight: 2 - i, gates: [{ name: 'need', value: 1 }] }),
    );
    const pick = pickBest(scored, { band: 0 });
    const a = traceOfPick('ron', 'npc.life', 10, pick, 'npc.brain.ron');
    const b = traceOfPick('ron', 'npc.life', 20, pick, 'npc.brain.ron');
    const lines = traceLines([a, b]);
    expect(lines.map((l) => l.tick)).toEqual([20, 10]);
    expect(lines[0]?.headline).toContain('npc.life');
    expect(lines[0]?.headline).toContain(String(pick.chosen?.id ?? ''));
    expect(lines[0]?.candidates.length).toBeGreaterThan(0);
    expect(lines[0]?.candidates[0]).toContain('walk');
  });

  it('flattens to a simple string list for the window', () => {
    const scored = [scoreAction({ id: 'walk', weight: 1, gates: [{ name: 'need', value: 1 }] })];
    const pick = pickBest(scored, { band: 0 });
    const trace = traceOfPick('ron', 'npc.life', 5, pick, 'npc.brain.ron');
    const lines = traceDisplayLines([trace]);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toContain('npc.life');
  });

  it('shows the idle baseline as (idle) rather than an empty chosen id', () => {
    const scored = [scoreAction({ id: 'walk', weight: 1, gates: [{ name: 'need', value: 0 }] })];
    const pick = pickBest(scored, { idleScore: 99 });
    const trace = traceOfPick('x', 'k', 0, pick);
    expect(traceLines([trace])[0]?.headline).toContain('(idle)');
  });
});
