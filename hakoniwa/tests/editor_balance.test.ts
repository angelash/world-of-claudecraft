// Balance lab: statistics helpers, combat duels on the real combat system, battlefield
// batches through warfare autoResolve, and the economy run, readings and gates.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { Engine } from '../src/core/engine';
import { runDuel, summarizeDuels } from '../src/editor/balance/combat_sim';
import {
  EconomyRun,
  type EconomySample,
  economyReadings,
  gateVerdicts,
  holderGrouper,
} from '../src/editor/balance/econ_sim';
import { parseForce, runBattles, summarizeBattles } from '../src/editor/balance/war_sim';
import { mean, percentile, rate, seedList } from '../src/editor/util/stats';
import { system as economySystem } from '../src/systems/economy';
import { system as inventorySystem } from '../src/systems/inventory';
import { system as modifiersSystem } from '../src/systems/modifiers';
import { system as worldSystem } from '../src/systems/world';

const content = buildContent();

describe('stats', () => {
  it('computes mean, nearest-rank percentiles, rates and seed lists', () => {
    expect(mean([])).toBe(0);
    expect(mean([1, 2, 3])).toBe(2);
    expect(percentile([5, 1, 4, 2, 3], 0.5)).toBe(3);
    expect(percentile([5, 1, 4, 2, 3], 0.9)).toBe(5);
    expect(percentile([], 0.9)).toBe(0);
    expect(rate(1, 4)).toBe(0.25);
    expect(rate(1, 0)).toBe(0);
    expect(seedList(10, 3)).toEqual([10, 11, 12]);
  });
});

describe('combat duels', () => {
  const spec = { level: 10, monsterId: 'dian_rat', useAbilities: true, maxSeconds: 90 };

  it('a level-10 warrior beats a low monster, and the result is deterministic per seed', () => {
    const a = runDuel(content, { ...spec, fighter: 'warrior' }, 7);
    expect(a.outcome).toBe('win');
    expect(a.seconds).toBeGreaterThan(0);
    expect(a.fighterDamage).toBeGreaterThan(0);
    expect(runDuel(content, { ...spec, fighter: 'warrior' }, 7)).toEqual(a);
  });

  it('runs the player as the fighter at a set level', () => {
    const r = runDuel(content, { ...spec, fighter: 'player', level: 20 }, 3);
    expect(['win', 'loss', 'timeout']).toContain(r.outcome);
    expect(r.error).toBeUndefined();
  });

  it('reports an unknown monster as an error, not a crash', () => {
    expect(runDuel(content, { ...spec, fighter: 'warrior', monsterId: 'no_such' }, 1).outcome).toBe(
      'error',
    );
  });

  it('summarises win rate, time to kill and damage per second', () => {
    const results = [
      {
        seed: 1,
        outcome: 'win' as const,
        seconds: 10,
        fighterDamage: 100,
        monsterDamage: 20,
        fighterHpFrac: 0.8,
      },
      {
        seed: 2,
        outcome: 'win' as const,
        seconds: 20,
        fighterDamage: 100,
        monsterDamage: 40,
        fighterHpFrac: 0.6,
      },
      {
        seed: 3,
        outcome: 'loss' as const,
        seconds: 5,
        fighterDamage: 10,
        monsterDamage: 50,
        fighterHpFrac: 0,
      },
      {
        seed: 4,
        outcome: 'error' as const,
        seconds: 0,
        fighterDamage: 0,
        monsterDamage: 0,
        fighterHpFrac: 0,
      },
    ];
    const s = summarizeDuels(results);
    expect(s.runs).toBe(4);
    expect(s.errors).toBe(1);
    expect(s.winRate).toBeCloseTo(2 / 3);
    expect(s.lossRate).toBeCloseTo(1 / 3);
    expect(s.ttkMean).toBe(15);
    expect(s.ttkP90).toBe(20);
    expect(s.dpsMean).toBeCloseTo((10 + 5 + 2) / 3);
    expect(s.hpLeftMean).toBeCloseTo(0.7);
  });
});

describe('battlefield batches', () => {
  it('parses forces as "type x count" lists or JSON', () => {
    expect(parseForce('militia x 40, hunters X 12\nspear_militia*5')).toEqual({
      ok: true,
      force: {
        regiments: [
          { typeId: 'militia', count: 40 },
          { typeId: 'hunters', count: 12 },
          { typeId: 'spear_militia', count: 5 },
        ],
      },
    });
    expect(parseForce('{"regiments": [{"typeId": "militia", "count": 3}]}').ok).toBe(true);
    expect(parseForce('militia forty').ok).toBe(false);
    expect(parseForce('').ok).toBe(false);
  });

  it('resolves a content scenario deterministically over seeds', () => {
    const id = content.battle_scenarios[0]?.id as string;
    const a = runBattles(content, { kind: 'scenario', scenarioId: id }, [1, 2]);
    const b = runBattles(content, { kind: 'scenario', scenarioId: id }, [1, 2]);
    expect(a).toHaveLength(2);
    expect(a).toEqual(b);
    const s = summarizeBattles(a);
    expect(s.winRate + s.lossRate + s.drawRate).toBeCloseTo(1);
    expect(runBattles(content, { kind: 'scenario', scenarioId: 'nope' }, [1])).toEqual([]);
  });

  it('a much larger force wins an open-field battle', () => {
    const results = runBattles(
      content,
      {
        kind: 'field',
        player: { regiments: [{ typeId: 'greywall_infantry', count: 120 }] },
        enemy: { regiments: [{ typeId: 'militia', count: 10 }] },
        terrain: 'plain',
      },
      seedList(1, 3),
    );
    const s = summarizeBattles(results);
    expect(s.winRate).toBe(1);
    expect(s.enemy.meanLossPct).toBeGreaterThan(s.player.meanLossPct);
  });
});

describe('economy', () => {
  it('samples prices and money once per (shortened) day', () => {
    const engine = Engine.create(
      3,
      content,
      [modifiersSystem, worldSystem, inventorySystem, economySystem],
      {
        aiMode: 'off',
      },
    );
    const run = new EconomyRun(engine, content, 3, 50);
    expect(run.samples).toHaveLength(1);
    while (!run.advance(40)) {
      // advance in slices smaller than a day
    }
    expect(run.samples.map((s) => s.day)).toEqual([0, 1, 2, 3]);
    expect(run.progress).toBe(1);
    expect(Object.keys(run.samples[0]?.prices ?? {}).length).toBeGreaterThan(0);
    const group = holderGrouper(engine.world, content);
    expect(group(engine.world.slices.world.playerId)).toBe('personal');
    expect(group(content.economy_config.company.ownerId)).toBe('company');
  });

  const day = (
    d: number,
    money: Record<string, number>,
    prod = { active: 0, blocked: 0 },
  ): EconomySample => ({
    day: d,
    prices: { 'm/bread': 10 + d },
    money,
    production: { ...prod, reasons: prod.blocked ? { 缺少原料: prod.blocked } : {} },
  });
  const groups = (o: string) =>
    o === 'player' ? 'personal' : o === 'company' ? 'company' : o === 'site' ? 'treasury' : 'npc';

  it('reads bankruptcy, P90 wealth growth, blockage and price drift', () => {
    const run1 = [
      day(0, { player: 100, company: 0, site: 50, npc1: 10 }, { active: 4, blocked: 0 }),
      day(1, { player: 200, company: 0, site: 40, npc1: 10 }, { active: 4, blocked: 2 }),
      day(2, { player: 900, company: 0, site: 20, npc1: 30 }, { active: 4, blocked: 1 }),
    ];
    const r = economyReadings([run1], groups);
    // The company never had money, so it cannot go bankrupt; the site still has 20.
    expect(r.bankruptcy).toMatchObject({ holders: 1, rate: 0, tailDays: 2 });
    const broke = [
      day(0, { site: 50, company: 30 }),
      day(1, { site: 0, company: 5 }),
      day(2, { site: -3, company: 0 }),
    ];
    const b = economyReadings([broke], groups).bankruptcy;
    expect(b).toMatchObject({ holders: 2, rate: 0.5, tailDays: 2 });
    expect(b.bankrupt).toEqual(['1:site']);
    expect(r.wealth.personal).toEqual({ p90: 9, n: 1 });
    expect(r.wealth.treasury).toEqual({ p90: 0.4, n: 1 });
    expect(r.wealth.company.n).toBe(0);
    expect(r.blockage.mean).toBeCloseTo(0.375);
    expect(r.blockage.p90).toBe(0.5);
    expect(r.blockage.reasons).toEqual({ 缺少原料: 3 });
    expect(r.prices[0]).toMatchObject({ key: 'm/bread', first: 10, last: 12, min: 10, max: 12 });
    expect(r.prices[0]?.drift).toBeCloseTo(0.2);
  });

  it('turns readings into gate verdicts against economy_and_trade.md 9.3', () => {
    const run = [
      day(0, { player: 100, site: 100 }),
      day(1, { player: 950, site: 500 }, { active: 2, blocked: 1 }),
    ];
    const gates = Object.fromEntries(
      gateVerdicts(economyReadings([run], groups)).map((g) => [g.id, g.verdict]),
    );
    expect(gates).toEqual({
      bankruptcy: 'pass',
      'wealth.personal': 'fail',
      'wealth.company': 'nodata',
      'wealth.treasury': 'pass',
      'blockage.mean': 'fail',
      'blockage.p90': 'fail',
    });
  });
});
