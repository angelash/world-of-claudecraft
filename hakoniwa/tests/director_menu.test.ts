// The director's menu, its deliveries and its six-input meter in the world (builtin_ai.md
// 13; goddess_gm.md 8; catalog_goddess_interventions.md 2.8; PK-M1-20): the twelve written
// items, the 13.3 score, the social input read from the disputes' escalation flags, the must
// and the open reveal deliveries, the comedy throttle's background, the weather record and
// the beat delay's request.

import { describe, expect, it } from 'vitest';
import { Engine, ok } from '../src/core';
import type { GameSystem, SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../src/core/time';
import {
  applyMove,
  directorProblems,
  itemScore,
  REVEAL_GAP,
  tensionGap,
} from '../src/systems/director';
import { activeTags } from '../src/systems/modifiers';
import { NARRATIVE_SYSTEMS, narrativeContent } from './narrative_harness';

declare module '../src/core/contracts' {
  interface CommandMap {
    'pk20d.run': Record<string, never>;
  }
}

let job: ((ctx: SystemContext) => void) | null = null;
const probe: GameSystem = {
  id: 'zz_pk20_director',
  order: 999,
  commands: {
    'pk20d.run'(ctx) {
      job?.(ctx);
      job = null;
      return ok();
    },
  },
};

function inTick(g: Engine, fn: (ctx: SystemContext) => void): void {
  job = fn;
  g.queue('pk20d.run', {});
  g.step(1);
}

function game(seed = 11, mapId = 'forest_edge'): Engine {
  const g = Engine.create(seed, narrativeContent(), [...NARRATIVE_SYSTEMS, probe], {});
  g.queue('flag.set', { key: 'act', value: 'act1' });
  g.queue('flag.set', { key: 'a1_wake_ruins', value: true });
  g.queue('world.teleport', { entityId: 'player', mapId, x: 5, y: 29 });
  g.step(2);
  g.world.slices.scenes.current = null;
  g.world.slices.scenes.queue = [];
  return g;
}

describe('the menu (catalog 2.8)', () => {
  it('holds the twelve written items and loads clean', () => {
    const c = narrativeContent();
    const written = c.directorMenu.filter((i) => i.id.startsWith('div_dir_')).map((i) => i.id);
    expect(written.sort()).toEqual(
      [
        'div_dir_old_friend_passing',
        'div_dir_rumor_arrives',
        'div_dir_lost_and_found',
        'div_dir_misdelivered_papers',
        'div_dir_weather_turn',
        'div_dir_enemy_slip',
        'div_dir_stirring_woods',
        'div_dir_safe_camp',
        'div_dir_passing_merchant',
        'div_dir_campfire_talk',
        'div_dir_beat_delay',
        'div_dir_healer_passing',
      ].sort(),
    );
    expect(directorProblems(c)).toEqual([]);
    for (const i of c.directorMenu.filter((x) => x.id.startsWith('div_dir_')))
      expect(i.power >= 1 && i.power <= 3, i.id).toBe(true);
  });

  it('scores items by the gap, weight, freshness and fit of 13.3', () => {
    const band = { low: 30, high: 50 };
    expect(tensionGap('coincidence', 15, band)).toBe(0.5);
    expect(tensionGap('respite', 75, band)).toBe(0.5);
    expect(tensionGap('coincidence', 40, band)).toBe(0);
    const base = { gap: 0.5, prereq: 1, weight: 1, fresh: false, fit: false };
    expect(itemScore(base)).toBe(0.5);
    expect(itemScore({ ...base, fresh: true })).toBe(0.6);
    expect(itemScore({ ...base, fit: true })).toBe(0.65);
    expect(itemScore({ ...base, fresh: true, fit: true, weight: 1.2 })).toBeCloseTo(0.936);
  });

  it('lands the weather turn with its weather record, and asks the event kernel for the delay', () => {
    const g = game();
    const delays: unknown[] = [];
    g.onEvents((events) => {
      for (const e of events) if (e.kind === 'director.delay') delays.push(e.data);
    });
    inTick(g, (ctx) => {
      const menu = ctx.content.directorMenu;
      const rain = menu.find((i) => i.id === 'div_dir_weather_turn');
      const delay = menu.find((i) => i.id === 'div_dir_beat_delay');
      if (!rain || !delay) throw new Error('items missing');
      applyMove(ctx, 'coincidence', rain);
      applyMove(ctx, 'respite', delay);
    });
    expect(g.world.slices.world.weather).toBe('rain');
    expect(activeTags(g.world, 'weather', 'forest_edge')).toEqual(['rain']);
    expect(delays).toEqual([{ hours: 24, itemId: 'div_dir_beat_delay' }]);
    const threads = g.world.slices.goddess.ledger.filter((e) => e.origin === 'director');
    expect(threads.map((e) => e.seen)).toEqual([true, true]);
  });

  it('tells nothing while the comedy throttle put the map in the background', () => {
    const g = game();
    const day = Math.floor(g.tick / TICKS_PER_GAME_DAY);
    g.world.slices.director.background = { mapId: 'forest_edge', day };
    const at = g.world.recent.length;
    inTick(g, (ctx) => {
      const item = ctx.content.directorMenu.find((i) => i.id === 'div_dir_stirring_woods');
      if (item) applyMove(ctx, 'coincidence', item);
    });
    expect(g.world.recent.slice(at).some((e) => e.kind === 'dialogue.line')).toBe(false);
    expect(g.world.slices.goddess.ledger.at(-1)).toMatchObject({ origin: 'director', seen: false });
  });
});

describe('the meter and the deliveries in the world', () => {
  it('reads the disputes’ escalation as social tension', () => {
    const calm = game(4);
    const tense = game(4);
    for (const d of tense.content.disputes.filter((x) => x.act === 'act1'))
      tense.queue('flag.set', { key: `dispute.${d.id}.escalation`, value: 3 });
    calm.step(TICKS_PER_GAME_HOUR * 6);
    tense.step(TICKS_PER_GAME_HOUR * 6);
    expect(tense.world.slices.director.tension).toBeGreaterThan(
      calm.world.slices.director.tension + 10,
    );
  });

  it('hands over the open entry at once and the must entry when it falls due', () => {
    const g = game(6, 'borderstone');
    g.step(TICKS_PER_GAME_HOUR * 2);
    const d = g.world.slices.director;
    expect(d.delivered).toEqual(['dlv_a1_nameless_god']);
    const told = g.world.recent.filter(
      (e) =>
        e.kind === 'dialogue.line' &&
        typeof e.data.text === 'object' &&
        'key' in e.data.text &&
        e.data.text.key === 'c.director_deliveries.dlv_a1_nameless_god.narration',
    );
    expect(told.length).toBe(1);
    // the must entry unlocks with the strike and is due seven days later, gap or not
    g.queue('flag.set', { key: 'a1_martha_strike', value: true });
    g.step(TICKS_PER_GAME_HOUR * 2);
    expect(d.delivered).toEqual(['dlv_a1_nameless_god']);
    g.step(7 * TICKS_PER_GAME_DAY);
    expect(d.delivered).toEqual(['dlv_a1_nameless_god', 'dlv_a1_martha_strike']);
    expect(REVEAL_GAP).toBe(72000);
  });
});
