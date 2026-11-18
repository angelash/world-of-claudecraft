// The regional sediment account and the dungeons' dispositions (goddess_gm.md 4.5;
// catalog_dungeons_bosses.md 1.2; PK-M1-50 leftovers, PK-M1-20): grades on the shared scale;
// destroying lifts the region one grade for a season and then falls back three tenths a
// season; purifying takes three tenths of the core pressure off; nurturing keeps the region
// a tenth lower each season; a region that rises a grade within a week stirs its dungeons.

import { describe, expect, it } from 'vitest';
import { Engine, ok } from '../src/core';
import type { GameSystem, SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../src/core/time';
import { system as dungeons, instanceOf } from '../src/systems/dungeons';
import { oneGradeUp, SEASON_DAYS, sedimentGrade } from '../src/systems/goddess';
import { NARRATIVE_SYSTEMS, narrativeContent } from './narrative_harness';

declare module '../src/core/contracts' {
  interface CommandMap {
    'pk20g.run': Record<string, never>;
  }
}

let job: ((ctx: SystemContext) => void) | null = null;
const probe: GameSystem = {
  id: 'zz_pk20_region',
  order: 999,
  commands: {
    'pk20g.run'(ctx) {
      job?.(ctx);
      job = null;
      return ok();
    },
  },
};

function inTick(g: Engine, fn: (ctx: SystemContext) => void): void {
  job = fn;
  g.queue('pk20g.run', {});
  g.step(1);
}

function game(): Engine {
  const g = Engine.create(3, narrativeContent(), [...NARRATIVE_SYSTEMS, dungeons, probe], {});
  g.queue('flag.set', { key: 'act', value: 'act1' });
  g.step(2);
  g.world.slices.scenes.current = null;
  g.world.slices.scenes.queue = [];
  return g;
}

/** The first dungeon record and the region its gate stands in. */
function firstDungeon(g: Engine): { id: string; region: string } {
  const d = g.content.dungeons[0];
  if (!d) throw new Error('no dungeon');
  return { id: d.id, region: d.gate.mapId };
}

describe('regional sediment grades', () => {
  it('maps values to the six grades on the shared scale', () => {
    expect([0, 4, 5, 29, 30, 99, 100, 299, 300, 799, 800].map(sedimentGrade)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5,
    ]);
    expect(oneGradeUp(0)).toBe(5);
    expect(oneGradeUp(40)).toBe(60);
    expect(oneGradeUp(900)).toBe(0);
  });
});

describe('dispositions move the region', () => {
  it('lifts a destroyed place’s region a grade for a season, then fades it', () => {
    const g = game();
    const { id, region } = firstDungeon(g);
    g.world.slices.goddess.sediment[region] = 40;
    inTick(g, (ctx) => ctx.emit('dungeon.collapsed', { id, kind: 'dungeon' }));
    expect(g.world.slices.goddess.sediment[region]).toBe(100);
    expect(g.world.meta.flags[`sediment.${region}`]).toBe(100);
    // a season later the lift falls back by three tenths of the lift, and again the next
    // season (by the same amount: 100, 82, 64)
    g.step(SEASON_DAYS * TICKS_PER_GAME_DAY + 2 * TICKS_PER_GAME_DAY);
    expect(g.world.slices.goddess.sediment[region]).toBeCloseTo(100 - 60 * 0.3, 5);
    g.step(SEASON_DAYS * TICKS_PER_GAME_DAY);
    expect(g.world.slices.goddess.sediment[region]).toBeCloseTo(64, 5);
  }, 600_000);

  it('takes three tenths of a purified dungeon’s core pressure off its region', () => {
    const g = game();
    const { id, region } = firstDungeon(g);
    let pressure = 0;
    inTick(g, (ctx) => {
      pressure = instanceOf(ctx, id)?.pressure ?? 0;
    });
    g.world.slices.goddess.sediment[region] = 500;
    inTick(g, (ctx) => ctx.emit('dungeon.purified', { id, kind: 'dungeon' }));
    expect(pressure).toBeGreaterThan(0);
    expect(g.world.slices.goddess.sediment[region]).toBeCloseTo(500 - 0.3 * pressure, 5);
  });

  it('keeps a nurtured place’s region a tenth lower each season', () => {
    const g = game();
    const { id, region } = firstDungeon(g);
    inTick(g, (ctx) => {
      const st = instanceOf(ctx, id);
      if (st) st.choice = 'nurture';
    });
    g.world.slices.goddess.sediment[region] = 100;
    g.step(TICKS_PER_GAME_DAY + TICKS_PER_GAME_HOUR);
    expect(g.world.slices.goddess.sediment[region]).toBeCloseTo(90, 5);
    // not again within the season
    g.step(10 * TICKS_PER_GAME_DAY);
    expect(g.world.slices.goddess.sediment[region]).toBeCloseTo(90, 5);
  }, 180_000);

  it('stirs the region’s dungeons when it rises a grade within a week', () => {
    const g = game();
    const { id, region } = firstDungeon(g);
    let before = 0;
    inTick(g, (ctx) => {
      before = instanceOf(ctx, id)?.activity ?? 0;
    });
    g.world.slices.goddess.sediment[region] = 4;
    g.step(TICKS_PER_GAME_HOUR + 1);
    const rises: string[] = [];
    g.onEvents((events) => {
      for (const e of events)
        if (e.kind === 'goddess.region_rise' && e.data.mapId === region) rises.push(e.data.mapId);
    });
    g.world.slices.goddess.sediment[region] = 6;
    g.step(TICKS_PER_GAME_HOUR + 1);
    expect(rises).toEqual([region]);
    expect(g.world.slices.dungeons?.instances[id]?.activity).toBe(before + 20);
    // the same grade again that week stirs nothing more
    g.step(TICKS_PER_GAME_HOUR * 2);
    expect(rises).toEqual([region]);
    // a rise that happened across the week boundary is still stirred (the new week carries
    // the grades the last one ended on)
    g.world.slices.goddess.sediment[region] = 35;
    g.step(TICKS_PER_GAME_DAY * 7);
    expect(rises).toEqual([region, region]);
    expect(g.world.slices.dungeons?.instances[id]?.activity).toBe(before + 40);
    // a jump of two grades stirs twice
    g.world.slices.goddess.sediment[region] = 400;
    g.step(TICKS_PER_GAME_HOUR + 1);
    expect(rises).toEqual([region, region, region, region]);
    expect(g.world.slices.dungeons?.instances[id]?.activity).toBe(before + 80);
  });
});
