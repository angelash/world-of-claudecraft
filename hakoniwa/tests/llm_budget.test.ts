// The budgeter (docs/50_tech/llm_providers.md 8.3 to 8.5, 16.2; ai_architecture.md 2.3.3,
// 9.4): hour, day and run windows in money and tokens; usage ratios to levels 0 to 9 with
// hysteresis; under randomized usage, settled plus in-flight reservations never pass a cap;
// a reservation over a tenth of the hourly cap drops a slot first, then declines; the day key
// and the save line id scope the day and run windows; test requests are never capped.

import { describe, expect, it } from 'vitest';
import { Budget, CAP_WINDOWS, type Cost } from '../src/ai/budget';
import { seededRandom } from '../src/ai/mocks/rng';
import { ScriptedTransport } from '../src/ai/mocks/scripted';
import { costWithCard, fallbackCardOf } from '../src/ai/pricing';
import { fakeClock, preset, probeSystem, routedRunner } from './fixtures/llm_config/fixtures';

const MIN = 60_000;

function scoped(t = 0) {
  const clock = fakeClock(t);
  const scope = { day: '2026-11-16', run: 'line_a' };
  return {
    clock,
    scope,
    dayKey: () => scope.day,
    runId: () => scope.run,
  };
}

const usd = (x: number): Cost => ({ usd: x, tokens: 0 });

describe('three windows, two measures', () => {
  it('slides the hour window and counts open reservations', () => {
    const { clock, dayKey, runId } = scoped();
    const b = new Budget({ caps: { hour: { usd: 1 } } }, clock, { dayKey, runId });
    b.reserve('a', 'k', usd(0.4));
    clock.t += 30 * MIN;
    b.reserve('b', 'k', usd(0.4));
    b.settle('a', usd(0.3));
    expect(b.used('hour').usd).toBeCloseTo(0.7, 9);
    expect(b.canAfford('k', usd(0.31))).toBe('hour');
    clock.t += 31 * MIN;
    // 'a' (settled) left the window; 'b' is still open and counts until settled.
    expect(b.used('hour').usd).toBeCloseTo(0.4, 9);
    clock.t += 60 * MIN;
    expect(b.used('hour').usd).toBeCloseTo(0.4, 9);
    b.settle('b', usd(0.2));
    expect(b.used('hour').usd).toBe(0);
  });

  it('caps tokens in the same way, and money caps skip unpriced models', () => {
    const { clock, dayKey, runId } = scoped();
    const b = new Budget({ caps: { hour: { usd: 1, tokens: 10_000 } } }, clock, { dayKey, runId });
    b.reserve('a', 'k', { tokens: 6000 });
    expect(b.canAfford('k', { tokens: 500 })).toBe('ok');
    expect(b.canAfford('k', { tokens: 4001 })).toBe('hour');
    expect(b.canAfford('k', { usd: 0.05, tokens: 4001 })).toBe('hour');
    // Without a price the money cap does not apply; the token cap still does.
    b.reserve('b', 'k', { tokens: 1000 });
    expect(b.used('hour')).toEqual({ usd: 0, tokens: 7000 });
    expect(b.windowUse('hour').ratio).toBeCloseTo(0.7, 9);
  });

  it('keeps a day total per local date and a run total per save line', () => {
    const { clock, scope, dayKey, runId } = scoped();
    const b = new Budget(
      { caps: { hour: { usd: 1 }, day: { usd: 2, tokens: 1e6 }, run: { usd: 3 } }, singleMax: 1 },
      clock,
      { dayKey, runId },
    );
    for (let i = 0; i < 4; i++) {
      b.reserve(`d${i}`, 'k', { usd: 0.45, tokens: 1000 });
      b.settle(`d${i}`, { usd: 0.45, tokens: 1000 });
      clock.t += 61 * MIN;
    }
    expect(b.used('hour').usd).toBe(0);
    expect(b.used('day').usd).toBeCloseTo(1.8, 9);
    expect(b.used('day').tokens).toBe(4000);
    expect(b.canAfford('k', usd(0.25))).toBe('day');
    // The day window (0.9) is the tightest.
    expect(b.level()).toBe(8);
    scope.day = '2026-11-17';
    expect(b.used('day').usd).toBe(0);
    expect(b.canAfford('k', usd(0.25))).toBe('ok');
    // The date change ends the day exhaustion at once: the run window (0.6) is left.
    expect(b.level()).toBe(2);
    b.reserve('e', 'k', usd(0.9));
    b.settle('e', usd(0.9));
    clock.t += 61 * MIN;
    expect(b.used('run').usd).toBeCloseTo(2.7, 9);
    expect(b.canAfford('k', usd(0.35))).toBe('run');
    // A new game starts a new line; loading the old line brings its total back.
    scope.run = 'line_b';
    expect(b.used('run').usd).toBe(0);
    expect(b.canAfford('k', usd(0.35))).toBe('ok');
    scope.run = 'line_a';
    expect(b.used('run').usd).toBeCloseTo(2.7, 9);
    expect(b.snapshot().runId).toBe('line_a');
  });

  it('seeds the day and run totals from the ledger', () => {
    const { clock, dayKey, runId } = scoped();
    const b = new Budget({ caps: { day: { usd: 2 }, run: { usd: 10 } } }, clock, { dayKey, runId });
    b.seed({
      day: { usd: 1.5, tokens: 100 },
      run: { usd: 7, tokens: 900 },
      hour: { usd: 0.4, tokens: 50 },
    });
    expect(b.used('day')).toEqual({ usd: 1.5, tokens: 100 });
    expect(b.used('run')).toEqual({ usd: 7, tokens: 900 });
    expect(b.used('hour')).toEqual({ usd: 0.4, tokens: 50 });
    expect(b.canAfford('k', usd(0.6))).toBe('day');
  });
});

describe('levels and hysteresis (8.5)', () => {
  it.each([
    [0.59, 0],
    [0.6, 2],
    [0.69, 2],
    [0.7, 4],
    [0.8, 6],
    [0.9, 8],
    [0.99, 8],
    [1, 9],
    [1.4, 9],
  ])('usage %s of the tightest window is level %s', (ratio, level) => {
    const { clock } = scoped();
    const b = new Budget({ caps: { hour: { usd: 100 }, day: { tokens: 1000 } } }, clock);
    b.reserve('a', 'k', { usd: 1, tokens: Math.round(ratio * 1000) });
    expect(b.level()).toBe(level);
    expect(b.snapshot().tightest).toBe('day');
  });

  it('rises at once and falls one rung per five calm minutes with a ten point margin', () => {
    const { clock } = scoped();
    const b = new Budget({ caps: { hour: { usd: 1 } } }, clock);
    b.reserve('a', 'k', usd(0.75));
    expect(b.level()).toBe(4);
    b.settle('a', usd(0.65));
    clock.t += 10 * MIN;
    // 0.65 is within ten points of the rung's 0.7 trigger: not calm.
    expect(b.level()).toBe(4);
    b.settle('a', usd(0.55));
    expect(b.level()).toBe(4);
    clock.t += 5 * MIN - 1;
    expect(b.level()).toBe(4);
    clock.t += 1;
    expect(b.level()).toBe(2);
    clock.t += 30 * MIN;
    // 0.55 is not ten points under level 2's 0.6 trigger.
    expect(b.level()).toBe(2);
    b.settle('a', usd(0.3));
    expect(b.level()).toBe(2);
    clock.t += 5 * MIN;
    expect(b.level()).toBe(0);
  });

  it('falls at once when the player raises the cap, and only then', () => {
    const { clock } = scoped();
    const b = new Budget({ caps: { hour: { usd: 1 } } }, clock);
    b.reserve('a', 'k', usd(1));
    expect(b.level()).toBe(9);
    // A share change (or any edit that raises no cap) keeps the hysteresis.
    b.setConfig({ caps: { hour: { usd: 1 } }, roleShares: { k: 0.5 } });
    b.settle('a', usd(0.1));
    expect(b.level()).toBe(9);
    b.setConfig({ caps: { hour: { usd: 4 } } });
    expect(b.level()).toBe(0);
  });

  it('keeps a zero money cap closed to priced calls only, and the legacy hour default', () => {
    const { clock } = scoped();
    const b = new Budget({ caps: { hour: { usd: 0, tokens: 10_000 } } }, clock);
    b.reserve('local', 'k', { usd: 0, tokens: 500 });
    expect(b.level()).toBe(0);
    expect(b.canAfford('k', { usd: 0, tokens: 500 })).toBe('ok');
    expect(b.canAfford('k', { usd: 0.01, tokens: 500 })).toBe('hour');
    const legacy = new Budget({ totalUsd: 5 }, clock);
    expect(legacy.snapshot().perHourUsd).toBe(1);
    expect(legacy.snapshot().windows.run.cap).toEqual({ usd: 5 });
  });
});

describe('the cap is hard (8.4)', () => {
  it('never lets settled plus in-flight reservations pass any cap under randomized usage', () => {
    const rng = seededRandom(20261116);
    const { clock, scope, dayKey, runId } = scoped();
    const caps = {
      hour: { usd: 2, tokens: 60_000 },
      day: { usd: 5, tokens: 150_000 },
      run: { usd: 9, tokens: 400_000 },
    };
    const keys = ['goddess', 'core_npc', 'ruler_general', 'present_npc+offstage_batch'];
    const shares = {
      goddess: 0.65,
      core_npc: 0.2,
      ruler_general: 0.1,
      'present_npc+offstage_batch': 0.05,
    };
    const b = new Budget({ caps, roleShares: shares }, clock, { dayKey, runId });
    const open = new Map<string, Cost>();
    let admitted = 0;
    let refused = 0;
    let n = 0;
    for (let step = 0; step < 6000; step++) {
      const x = rng.next();
      if (x < 0.5) {
        const cost: Cost = { tokens: rng.int(200, 9000) };
        if (rng.next() < 0.85) cost.usd = rng.next() * 0.25;
        // Reserved requests (skip shares) book under their own key.
        const reserved = rng.next() < 0.2;
        const key = reserved ? 'reserved' : (keys[rng.int(0, keys.length - 1)] as string);
        const verdict = b.canAfford(key, cost, { reserved });
        if (verdict === 'ok') {
          const id = `r${n++}`;
          b.reserve(id, key, cost);
          open.set(id, cost);
          admitted++;
        } else refused++;
      } else if (x < 0.85 && open.size > 0) {
        const ids = [...open.keys()];
        const id = ids[rng.int(0, ids.length - 1)] as string;
        const r = open.get(id) as Cost;
        // Real usage stays within the reservation (the whole output cap is reserved).
        const f = rng.next();
        if (rng.next() < 0.1) b.release(id);
        else
          b.settle(id, {
            usd: r.usd === undefined ? undefined : r.usd * f,
            tokens: Math.floor(r.tokens * f),
          });
        open.delete(id);
      } else if (x < 0.97) {
        clock.t += rng.int(0, 12) * MIN;
      } else if (x < 0.99) {
        scope.day = `day_${rng.int(0, 1_000_000)}`;
      } else {
        scope.run = `line_${rng.int(0, 3)}`;
      }
      for (const w of CAP_WINDOWS) {
        const u = b.used(w);
        expect(u.usd).toBeLessThanOrEqual(caps[w].usd + 1e-9);
        expect(u.tokens).toBeLessThanOrEqual(caps[w].tokens);
      }
      for (const [k, share] of Object.entries(shares)) {
        const u = b.used('hour', k);
        expect(u.usd).toBeLessThanOrEqual(caps.hour.usd * share + 1e-9);
        expect(u.tokens).toBeLessThanOrEqual(caps.hour.tokens * share + 1e-9);
      }
    }
    expect(admitted).toBeGreaterThan(500);
    expect(refused).toBeGreaterThan(200);
  });

  it('applies shares to non-reserved requests only, and never caps test requests', () => {
    const { clock } = scoped();
    const b = new Budget(
      { caps: { hour: { usd: 1, tokens: 10_000 } }, roleShares: { core_npc: 0.2 } },
      clock,
    );
    b.reserve('a', 'core_npc', { usd: 0.09, tokens: 900 });
    b.reserve('b', 'core_npc', { usd: 0.09, tokens: 900 });
    expect(b.canAfford('core_npc', { usd: 0.05, tokens: 10 })).toBe('role');
    expect(b.canAfford('core_npc', { usd: 0.05, tokens: 10 }, { reserved: true })).toBe('ok');
    expect(b.canAfford('core_npc', { usd: 0.01, tokens: 300 })).toBe('role');
    expect(b.canAfford('core_npc', { usd: 0.01, tokens: 100 })).toBe('ok');
    expect(b.canAfford('goddess', { usd: 0.05, tokens: 10 }, { share: 0.65 })).toBe('ok');
    // A test request: booked in every window, never refused (8.4).
    expect(b.canAfford('test', { usd: 5, tokens: 50_000 }, { source: 'test' })).toBe('ok');
    b.reserve('t', 'test', { usd: 0.5, tokens: 500 }, 'test');
    expect(b.used('hour').usd).toBeCloseTo(0.68, 9);
    expect(b.canAfford('goddess', { usd: 0.05, tokens: 10 })).toBe('ok');
  });

  it('flags a single reservation over a tenth of the hourly cap', () => {
    const { clock } = scoped();
    const b = new Budget({ caps: { hour: { usd: 1, tokens: 10_000 } } }, clock);
    expect(b.canAfford('k', { usd: 0.1, tokens: 1000 })).toBe('ok');
    expect(b.canAfford('k', { usd: 0.11, tokens: 10 })).toBe('single');
    expect(b.canAfford('k', { usd: 0.01, tokens: 1001 })).toBe('single');
    // A reservation that does not fit the window at all is a window verdict.
    expect(b.canAfford('k', { usd: 1.2, tokens: 10 })).toBe('hour');
  });
});

describe('reservations cover a server-side fallback (8.4, AQ-16)', () => {
  it('reserves at the fallback target price, so its settlement stays inside the reservation', async () => {
    const opus5 = {
      currency: 'USD' as const,
      input: 5,
      cacheRead: 0.5,
      cacheWrite5m: 6.25,
      cacheWrite1h: 10,
      output: 25,
    };
    expect(fallbackCardOf('claude-opus-5-5')).toEqual(opus5);
    expect(fallbackCardOf('claude-haiku-5-5')).toBeUndefined();
    const usage = {
      inputTokens: 1500,
      outputTokens: 3000,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    const transport = ScriptedTransport.always({
      ok: true,
      json: { commands: [{ kind: 'llmtest.act', data: '{"n":1}' }] },
      text: '',
      usage,
      servedModel: 'claude-opus-5',
      fallbackUsed: true,
      latencyMs: 0,
    });
    const s = preset({ preset: 'tiered', connectionId: 'conn_a' });
    const { engine, runner } = routedRunner(
      probeSystem([1], { role: 'goddess.dialogue' }),
      s,
      transport,
    );
    engine.step(1);
    await runner.whenIdle();
    const reserved = transport.calls[0]?.reserve.usd ?? 0;
    expect(reserved).toBeGreaterThan((3000 * 25) / 1e6);
    expect(runner.budget.totalUsd()).toBeCloseTo(costWithCard(opus5, usage), 12);
    expect(runner.budget.totalUsd()).toBeLessThanOrEqual(reserved);
  });
});

describe('single reservations too large in the runner (8.4)', () => {
  const answer = { json: { commands: [{ kind: 'llmtest.act', data: '{"n":3}' }] } };

  it('drops one slot first', async () => {
    const transport = ScriptedTransport.always(answer);
    const s = preset({ preset: 'tiered', connectionId: 'conn_a' });
    const caps = { ...s.caps, hour: { usd: 0.5 }, day: { usd: 5 } };
    const { engine, runner } = routedRunner(
      probeSystem([1], { role: 'goddess.dialogue' }),
      { ...s, caps },
      transport,
    );
    engine.step(1);
    await runner.whenIdle();
    expect(transport.calls.map((c) => [c.slot, c.model])).toEqual([['mid', 'claude-sonnet-5-5']]);
    expect(runner.audit.list()[0]?.route).toEqual({
      bindingRole: 'goddess',
      slot: 'mid',
      connectionId: 'conn_a',
      lowered: true,
    });
    expect(transport.calls[0]?.reserve.usd).toBeLessThanOrEqual(0.05);
  });

  it('declines when even the lowest slot is too large', async () => {
    const transport = ScriptedTransport.always(answer);
    const s = preset({ preset: 'tiered', connectionId: 'conn_a' });
    const caps = { ...s.caps, hour: { usd: 0.01 }, day: { usd: 5 } };
    const { engine, runner } = routedRunner(
      probeSystem([1], { role: 'goddess.dialogue' }),
      { ...s, caps },
      transport,
    );
    engine.step(1);
    await runner.whenIdle();
    expect(transport.calls).toHaveLength(0);
    expect(runner.audit.list()[0]?.reason).toBe('budget_single');
  });
});
