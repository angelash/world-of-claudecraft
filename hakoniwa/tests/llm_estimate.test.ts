// The spend estimator (docs/50_tech/llm_providers.md 8.1, 8.2, 8.3, 16.2; ai_architecture.md
// 10.1 to 10.6): per real hour for every Anthropic preset in acts one, two and four within
// 0.01 US dollars of the 8.2 table; per game day, the one-off scenes and the full-run figure
// match the design tables; the token table; suggested caps; calibration by exponential
// smoothing.

import { describe, expect, it } from 'vitest';
import type { BindingRole } from '../src/ai/contracts';
import {
  callCostUsd,
  estimateHourly,
  estimateRun,
  estimateScene,
  measuredUsdPerHour,
  noteMeasured,
  roundUpCap,
  smooth,
  startCalibration,
  suggestCaps,
} from '../src/ai/llm_config/estimate';
import type { LlmSettings } from '../src/ai/llm_config/settings';
import { anthropicConn, compatConn, localConn, preset } from './fixtures/llm_config/fixtures';

const single = (model: string) => preset({ preset: 'single', connectionId: 'conn_a', model });
const tiered = (tilt: 'standard' | 'generous' | 'frugal') =>
  preset({ preset: 'tiered', connectionId: 'conn_a', tilt });

/** Standard tiered with the low slot on a local service (the 8.2 custom example). */
function standardWithLocalLow(): LlmSettings {
  const s = preset({ preset: 'tiered', connectionId: 'conn_a' }, anthropicConn(), localConn());
  return {
    ...s,
    preset: 'custom',
    slots: { ...s.slots, low: { connectionId: 'conn_local', model: 'qwen3:8b' } },
  };
}

const PRESETS: [string, () => LlmSettings, number[]][] = [
  ['off', () => preset({ preset: 'off' }), [0, 0, 0]],
  ['single claude-haiku-5-5', () => single('claude-haiku-5-5'), [0.38, 0.58, 0.81]],
  ['single claude-sonnet-5-5', () => single('claude-sonnet-5-5'), [7.31, 11.28, 15.62]],
  ['tiered frugal', () => tiered('frugal'), [0.54, 0.82, 1.22]],
  ['tiered standard', () => tiered('standard'), [2.4, 3.21, 4.45]],
  ['tiered generous', () => tiered('generous'), [7.55, 10.36, 14.39]],
  ['custom standard with a local low slot', standardWithLocalLow, [2.13, 2.76, 3.82]],
  [
    'local',
    () =>
      preset(
        {
          preset: 'local',
          connectionId: 'conn_local',
          models: { high: 'qwen3:14b', low: 'qwen3:8b' },
        },
        localConn(),
      ),
    [0, 0, 0],
  ],
];

/** Per game day, ai_architecture.md 10.5. */
const PER_DAY: [string, () => LlmSettings, number[]][] = [
  ['tiered generous', () => tiered('generous'), [3.02, 4.14, 5.75]],
  ['tiered standard', () => tiered('standard'), [0.96, 1.28, 1.78]],
  ['tiered frugal', () => tiered('frugal'), [0.22, 0.33, 0.49]],
  ['single claude-haiku-5-5', () => single('claude-haiku-5-5'), [0.15, 0.23, 0.32]],
  ['single claude-sonnet-5-5', () => single('claude-sonnet-5-5'), [2.93, 4.51, 6.25]],
];

/** A table value given to `unit`: the estimate rounds to it. */
function rounds(est: number, table: number, unit: number): void {
  expect(Math.abs(est - table)).toBeLessThanOrEqual(unit / 2);
}

describe('per real hour and per game day (8.2; ai_architecture.md 10.5)', () => {
  it.each(PRESETS)(
    '%s matches the table within 0.01 dollars in acts 1, 2 and 4',
    (_n, make, want) => {
      const s = make();
      [1, 2, 4].forEach((act, i) => {
        const est = estimateHourly(s, { act }).usdPerHour;
        expect(Math.abs(est - (want[i] as number))).toBeLessThanOrEqual(0.01);
      });
    },
  );

  it.each(PER_DAY)('%s per game day matches within 0.01 dollars', (_n, make, want) => {
    [1, 2, 4].forEach((act, i) => {
      const est = estimateHourly(make(), { act }).usdPerGameDay;
      expect(Math.abs(est - (want[i] as number))).toBeLessThanOrEqual(0.01);
    });
  });

  it('runs acts three and five at the act four volume, and scales with the game speed', () => {
    const s = tiered('standard');
    const four = estimateHourly(s, { act: 4 }).usdPerHour;
    expect(estimateHourly(s, { act: 3 }).usdPerHour).toBe(four);
    expect(estimateHourly(s, { act: 5 }).usdPerHour).toBe(four);
    expect(estimateHourly(s, { act: 1, speed: 2 }).usdPerHour).toBeCloseTo(
      2 * estimateHourly(s, { act: 1 }).usdPerHour,
      9,
    );
  });
});

describe('one-off scenes and the full run (8.2)', () => {
  it.each([
    ['claude-opus-5-5', 3.5, 0.1, 6, 1, 0.9, 0.1],
    ['claude-sonnet-5-5', 1.8, 0.1, 3, 1, 0.4, 0.1],
    ['claude-haiku-5-5', 0.09, 0.01, 0.16, 0.01, 0.02, 0.01],
  ])('%s: prologue, one trial, one revelation', (model, pro, pu, trial, tu, rev, ru) => {
    const s = single(model);
    rounds(estimateScene(s, 'prologue') as number, pro, pu);
    rounds(estimateScene(s, 'trial') as number, trial, tu);
    rounds(estimateScene(s, 'revelation') as number, rev, ru);
  });

  it('uses the highest configured slot for the scenes: frugal runs them on mid', () => {
    rounds(estimateScene(tiered('frugal'), 'prologue') as number, 1.8, 0.1);
    rounds(estimateScene(tiered('standard'), 'prologue') as number, 3.5, 0.1);
    expect(estimateScene(preset({ preset: 'off' }), 'trial')).toBe(0);
  });

  it.each([
    ['single claude-haiku-5-5', () => single('claude-haiku-5-5'), 40, 1],
    ['tiered frugal', () => tiered('frugal'), 78, 1],
    ['custom standard with a local low slot', standardWithLocalLow, 230, 10],
    ['tiered standard', () => tiered('standard'), 260, 10],
    ['tiered generous', () => tiered('generous'), 740, 10],
    ['single claude-sonnet-5-5', () => single('claude-sonnet-5-5'), 770, 10],
  ])('%s: the full run matches the table', (_n, make, want, unit) => {
    rounds(estimateRun(make()).usd, want, unit);
  });
});

describe('tokens per real hour (8.2)', () => {
  it.each([
    [1, 1.37, 2.36, 0.35],
    [2, 2.12, 3.54, 0.54],
    [4, 3.0, 4.95, 0.75],
  ])('act %s: uncached %sM, cached %sM, output %sM', (act, miss, hit, out) => {
    const t = estimateHourly(preset({ preset: 'off' }), { act }).designTokens;
    expect(Math.abs(t.uncached / 1e6 - miss)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(t.cached / 1e6 - hit)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(t.output / 1e6 - out)).toBeLessThanOrEqual(0.01);
  });

  it('splits the volume by binding role like the 8.2 notes', () => {
    const want: Record<number, Partial<Record<BindingRole, [number, number]>>> = {
      1: {
        goddess: [0.9, 90],
        core_npc: [2.3, 190],
        present_npc: [0.4, 50],
        offstage_batch: [0.1, 20],
      },
      4: {
        goddess: [1.4, 130],
        core_npc: [5.0, 390],
        present_npc: [0.7, 80],
        offstage_batch: [0.6, 120],
        ruler_general: [0.3, 30],
      },
    };
    for (const [act, roles] of Object.entries(want)) {
      const est = estimateHourly(single('claude-haiku-5-5'), { act: Number(act) });
      for (const [role, [input, output]] of Object.entries(roles)) {
        const r = est.byRole[role as BindingRole];
        expect(Math.abs(r.inputTokensPerHour / 1e6 - input)).toBeLessThanOrEqual(0.06);
        expect(Math.abs(r.outputTokensPerHour / 1e3 - output)).toBeLessThanOrEqual(6);
      }
    }
    // Only routed requests count toward the routed volume.
    const local = preset(
      {
        preset: 'local',
        connectionId: 'conn_local',
        models: { high: 'qwen3:14b', low: 'qwen3:8b' },
      },
      localConn(),
    );
    const est = estimateHourly(local, { act: 1 });
    expect(est.byRole.goddess.inputTokensPerHour).toBe(0);
    expect(est.byRole.core_npc.inputTokensPerHour).toBeGreaterThan(2e6);
  });
});

describe('price cards (ai_architecture.md 10.1)', () => {
  it('drops the cache-write surcharge without write prices and converts CNY', () => {
    const shape = { input: 10_000, hit: 0.6, output: 800, w: 1.8 };
    const noWrites = { currency: 'USD' as const, input: 1, cacheRead: 0.2, output: 4 };
    expect(callCostUsd(noWrites, shape)).toBeCloseTo(callCostUsd(noWrites, { ...shape, w: 1 }), 12);
    expect(callCostUsd(noWrites, shape)).toBeCloseTo((4000 * 1 + 6000 * 0.2 + 800 * 4) / 1e6, 12);
    const cny = { ...noWrites, currency: 'CNY' as const };
    expect(callCostUsd(cny, shape, 7)).toBeCloseTo(callCostUsd(noWrites, shape) / 7, 12);
  });

  it('estimates before a key, consent or caps exist, at the player exchange rate', () => {
    const s = tiered('standard');
    const bare: LlmSettings = {
      ...s,
      connections: [anthropicConn('conn_a', { keyState: 'none' })],
      consentedConnectionIds: [],
      caps: { hour: {}, day: {}, displayCurrency: 'USD' },
    };
    expect(estimateHourly(bare, { act: 1 }).usdPerHour).toBeCloseTo(
      estimateHourly(s, { act: 1 }).usdPerHour,
      12,
    );
    const cnyCard = { currency: 'CNY' as const, input: 1, cacheRead: 0.1, output: 2 };
    const priced = preset(
      { preset: 'single', connectionId: 'conn_compat', model: 'chat-small' },
      compatConn('conn_compat', [{ model: 'chat-small', price: cnyCard }]),
    );
    const at7 = estimateHourly({ ...priced, caps: { ...priced.caps, fxCnyPerUsd: 7 } }, { act: 1 });
    const at14 = estimateHourly(
      { ...priced, caps: { ...priced.caps, fxCnyPerUsd: 14 } },
      { act: 1 },
    );
    expect(at7.usdPerHour).toBeCloseTo(2 * at14.usdPerHour, 12);
  });

  it('flags roles on unpriced compatible models and counts only their tokens', () => {
    const s = preset(
      { preset: 'single', connectionId: 'conn_compat', model: 'chat-small' },
      compatConn(),
    );
    const est = estimateHourly(s, { act: 1 });
    expect(est.usdPerHour).toBe(0);
    expect(est.byRole.core_npc.unpriced).toBe(true);
    expect(est.routedTokens.input).toBeGreaterThan(3e6);
    const priced = preset(
      { preset: 'single', connectionId: 'conn_compat', model: 'chat-small' },
      compatConn('conn_compat', [
        { model: 'chat-small', price: { currency: 'CNY', input: 1, cacheRead: 0.1, output: 2 } },
      ]),
    );
    const p = estimateHourly(priced, { act: 1 });
    expect(p.byRole.core_npc.unpriced).toBe(false);
    expect(p.usdPerHour).toBeGreaterThan(0);
  });
});

describe('suggested caps and calibration (8.1, 8.3)', () => {
  it('suggests 1.5 times the hour estimate on the cap steps, three hours a day, 1.2 times the run', () => {
    expect([0.3, 0.5, 2.1, 3.61, 50, 51].map(roundUpCap)).toEqual([0.5, 0.5, 3, 5, 50, 60]);
    const s = tiered('standard');
    const caps = suggestCaps(s, { act: 1 });
    expect(caps.hourUsd).toBe(5);
    expect(caps.dayUsd).toBe(15);
    expect(caps.runUsd).toBeCloseTo(estimateRun(s).usd * 1.2, 9);
    // The calibrated measurement wins when it is higher.
    expect(suggestCaps(s, { act: 1, measuredUsdPerHour: 4 }).hourUsd).toBe(8);
    expect(suggestCaps(preset({ preset: 'off' }), { act: 1 }).hourUsd).toBe(0);
  });

  it('smooths measured spend per role with weight 0.3 and shows it after the warm-up', () => {
    expect(smooth(undefined, 2)).toBe(2);
    expect(smooth(2, 4)).toBeCloseTo(2.6, 12);
    let cal = startCalibration(0);
    cal = noteMeasured(cal, { goddess: 1, core_npc: 0.5 });
    cal = noteMeasured(cal, { goddess: 2, core_npc: Number.NaN });
    expect(cal.byRole.goddess).toBeCloseTo(1.3, 12);
    expect(cal.byRole.core_npc).toBe(0.5);
    expect(cal.samples).toBe(2);
    expect(measuredUsdPerHour(cal, 29 * 60_000)).toBeUndefined();
    expect(measuredUsdPerHour(cal, 30 * 60_000)).toBeCloseTo(1.8, 12);
  });
});
