// Balance lab, economy: run a headless game for some game days, sample once per day the
// market prices (priceQuote over marketList), every inventory owner's money, and the
// state of production buildings, then give approximate readings for the three gates of
// docs/40_design/systems/economy_and_trade.md 9.3: bankruptcy rate, P90 wealth growth,
// production blockage rate. There is no player behaviour model here, so the readings
// describe the world left to itself; they are approximations for review. Pure: no DOM.

import type { ContentMap } from '../../core/contracts';
import type { Engine } from '../../core/engine';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import type { World } from '../../core/world';
import { marketList, priceQuote } from '../../systems/economy';
import { mean, percentile, rate } from '../util/stats';

export interface EconomySample {
  day: number;
  /** "marketId/itemId" -> buy price per unit (copper) */
  prices: Record<string, number>;
  /** inventory owner -> money (copper) */
  money: Record<string, number>;
  /** production buildings working and blocked today */
  production: { active: number; blocked: number; reasons: Record<string, number> };
}

export function samplePrices(world: World, content: ContentMap): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of marketList(world, content)) {
    const def = content.markets.find((x) => x.id === m.id);
    for (const g of def?.goods ?? []) {
      const q = priceQuote(world, content, m.id, g.itemId, 'buy', 1);
      if (q) out[`${m.id}/${g.itemId}`] = q.unit;
    }
  }
  return out;
}

export function sampleMoney(world: World): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [owner, h] of Object.entries(world.slices.inventory?.owners ?? {}))
    out[owner] = h.money;
  return out;
}

/** A producing building counts as blocked while it carries a stop note. */
export function sampleProduction(world: World, content: ContentMap): EconomySample['production'] {
  const producing = new Set(
    (content.city_buildings ?? [])
      .filter((d) => d.produces && Object.keys(d.produces).length)
      .map((d) => d.id),
  );
  let active = 0;
  let blocked = 0;
  const reasons: Record<string, number> = {};
  for (const site of Object.values(world.slices.city?.sites ?? {})) {
    if (!site.active) continue;
    for (const b of site.buildings) {
      if (b.status !== 'active' || !producing.has(b.defId)) continue;
      active++;
      if (b.note) {
        blocked++;
        const key = b.note.replace(/：.*$/, '');
        reasons[key] = (reasons[key] ?? 0) + 1;
      }
    }
  }
  return { active, blocked, reasons };
}

export function sample(world: World, content: ContentMap, day: number): EconomySample {
  return {
    day,
    prices: samplePrices(world, content),
    money: sampleMoney(world),
    production: sampleProduction(world, content),
  };
}

/** Steps an engine for a number of game days in chunks, sampling at each day boundary. */
export class EconomyRun {
  readonly samples: EconomySample[] = [];
  private readonly endTick: number;

  constructor(
    readonly engine: Engine,
    readonly content: ContentMap,
    readonly days: number,
    private readonly ticksPerDay = TICKS_PER_GAME_DAY,
  ) {
    this.endTick = engine.tick + Math.max(1, Math.floor(days)) * ticksPerDay;
    this.samples.push(sample(engine.world, content, 0));
  }

  get done(): boolean {
    return this.engine.tick >= this.endTick;
  }

  /** 0..1 */
  get progress(): number {
    const total = this.days * this.ticksPerDay;
    return total > 0 ? 1 - (this.endTick - this.engine.tick) / total : 1;
  }

  /** Run up to maxTicks; returns true when finished. */
  advance(maxTicks: number): boolean {
    let budget = maxTicks;
    while (budget > 0 && !this.done) {
      const toBoundary = this.ticksPerDay - (this.engine.tick % this.ticksPerDay);
      const n = Math.min(budget, toBoundary, this.endTick - this.engine.tick);
      this.engine.step(n);
      budget -= n;
      if (this.engine.tick % this.ticksPerDay === 0) {
        const day = this.samples.length;
        this.samples.push(sample(this.engine.world, this.content, day));
      }
    }
    return this.done;
  }
}

export type HolderGroup = 'personal' | 'company' | 'treasury' | 'npc';

export interface EconomyReadings {
  /** holders that started with money and stayed at or below zero for the whole tail window */
  bankruptcy: { rate: number; holders: number; bankrupt: string[]; tailDays: number };
  /** P90 of end / start money per group, holders with start > 0 */
  wealth: Record<HolderGroup, { p90: number; n: number }>;
  /** blocked / active producing building-days */
  blockage: { mean: number; p90: number; days: number; reasons: Record<string, number> };
  /** per price series: first, last, min, max, drift (last / first - 1) */
  prices: { key: string; first: number; last: number; min: number; max: number; drift: number }[];
}

/**
 * Readings over one or more runs (one sample list per seed). Bankruptcy uses a tail
 * window of the last 30 sampled days (or every day after the start, when fewer), for
 * companies and treasuries that started with money.
 */
export function economyReadings(
  runs: readonly (readonly EconomySample[])[],
  groupOf: (owner: string) => HolderGroup,
): EconomyReadings {
  const groups: Record<HolderGroup, number[]> = {
    personal: [],
    company: [],
    treasury: [],
    npc: [],
  };
  const bankrupt: string[] = [];
  let holders = 0;
  let tailDays = 0;
  const dayRates: number[] = [];
  const reasons: Record<string, number> = {};
  const series = new Map<string, number[]>();
  runs.forEach((samples, runIndex) => {
    const first = samples[0];
    const last = samples[samples.length - 1];
    if (!first || !last) return;
    for (const [owner, start] of Object.entries(first.money)) {
      const end = last.money[owner];
      if (end === undefined || start <= 0) continue;
      groups[groupOf(owner)].push(end / start);
    }
    // Only holders that started with money can go bankrupt (an unfounded company or an
    // inactive settlement has nothing to lose); the tail excludes the starting day.
    const tail = samples.slice(1).slice(-30);
    tailDays = tail.length;
    for (const [owner, start] of Object.entries(first.money)) {
      const g = groupOf(owner);
      if ((g !== 'company' && g !== 'treasury') || start <= 0) continue;
      holders++;
      if (tail.length > 0 && tail.every((s) => (s.money[owner] ?? 0) <= 0)) {
        bankrupt.push(`${runIndex + 1}:${owner}`);
      }
    }
    for (const s of samples.slice(1)) {
      if (s.production.active > 0) dayRates.push(s.production.blocked / s.production.active);
      for (const [r, n] of Object.entries(s.production.reasons)) reasons[r] = (reasons[r] ?? 0) + n;
    }
    if (runIndex === 0) {
      for (const s of samples) {
        for (const [k, v] of Object.entries(s.prices)) {
          let list = series.get(k);
          if (!list) {
            list = [];
            series.set(k, list);
          }
          list.push(v);
        }
      }
    }
  });
  const wealth = {} as EconomyReadings['wealth'];
  for (const g of Object.keys(groups) as HolderGroup[]) {
    wealth[g] = { p90: percentile(groups[g], 0.9), n: groups[g].length };
  }
  const prices = [...series.entries()]
    .map(([key, list]) => {
      const f = list[0] ?? 0;
      const l = list[list.length - 1] ?? 0;
      return {
        key,
        first: f,
        last: l,
        min: Math.min(...list),
        max: Math.max(...list),
        drift: f > 0 ? l / f - 1 : 0,
      };
    })
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift) || a.key.localeCompare(b.key));
  return {
    bankruptcy: { rate: rate(bankrupt.length, holders), holders, bankrupt, tailDays },
    wealth,
    blockage: {
      mean: mean(dayRates),
      p90: percentile(dayRates, 0.9),
      days: dayRates.length,
      reasons,
    },
    prices,
  };
}

/** Classify inventory owners: the player, the company owner id, site stock owners, others. */
export function holderGrouper(world: World, content: ContentMap): (owner: string) => HolderGroup {
  const playerId = world.slices.world.playerId;
  const company = content.economy_config?.company?.ownerId;
  const treasuries = new Set((content.city_sites ?? []).map((s) => s.stockOwner));
  return (owner) => {
    if (owner === playerId) return 'personal';
    if (owner === company) return 'company';
    if (treasuries.has(owner)) return 'treasury';
    return 'npc';
  };
}

/** Gate values of economy_and_trade.md 9.3 (initial values, to be tuned there). */
export const ECONOMY_GATES = {
  bankruptcyMax: 0.03,
  wealthP90Max: { personal: 8, company: 12, treasury: 6 } as Record<
    Exclude<HolderGroup, 'npc'>,
    number
  >,
  blockageMeanMax: 0.25,
  blockageP90Max: 0.4,
};

export type GateVerdict = 'pass' | 'fail' | 'nodata';

export interface GateRow {
  id: string;
  value: number;
  limit: number;
  verdict: GateVerdict;
}

/** Each gate with its reading, its limit and pass, fail or no data. */
export function gateVerdicts(r: EconomyReadings): GateRow[] {
  const row = (id: string, value: number, limit: number, has: boolean): GateRow => ({
    id,
    value,
    limit,
    verdict: !has ? 'nodata' : value <= limit ? 'pass' : 'fail',
  });
  const g = ECONOMY_GATES;
  return [
    row('bankruptcy', r.bankruptcy.rate, g.bankruptcyMax, r.bankruptcy.holders > 0),
    ...(['personal', 'company', 'treasury'] as const).map((k) =>
      row(`wealth.${k}`, r.wealth[k].p90, g.wealthP90Max[k], r.wealth[k].n > 0),
    ),
    row('blockage.mean', r.blockage.mean, g.blockageMeanMax, r.blockage.days > 0),
    row('blockage.p90', r.blockage.p90, g.blockageP90Max, r.blockage.days > 0),
  ];
}

/** Price series for one key across a run's samples. */
export function priceSeries(samples: readonly EconomySample[], key: string): number[] {
  return samples.map((s) => s.prices[key] ?? Number.NaN);
}
