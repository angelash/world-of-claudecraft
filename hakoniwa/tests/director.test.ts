import { describe, expect, it } from 'vitest';
import { Engine, tr, worldHash } from '../src/core';
import type { GameSystem } from '../src/core/system';
import { TICKS_PER_GAME_HOUR } from '../src/core/time';
import { t } from '../src/shared_ui/i18n';
import { bandFor, decide, rawTension, smooth } from '../src/systems/director';

const BANDS = narrativeContent().directorActs.find((a) => a.act === 'act1')?.bands;

import { activeModifiers } from '../src/systems/modifiers';
import { NARRATIVE_SYSTEMS, narrativeContent } from './narrative_harness';

function quietGame(seed = 11, extra: GameSystem[] = [], act = 'act1'): Engine {
  const g = Engine.create(seed, narrativeContent(), [...NARRATIVE_SYSTEMS, ...extra], {});
  // skip the prologue: an act with no scene playing
  g.queue('flag.set', { key: 'act', value: act });
  g.queue('world.teleport', { entityId: 'player', mapId: 'forest_edge', x: 5, y: 29 });
  g.step(2);
  g.world.slices.scenes.current = null;
  g.world.slices.scenes.queue = [];
  return g;
}

describe('tension meter (pure)', () => {
  it('rises with combat and falls with stagnation', () => {
    const calm = rawTension({ kills: 0, deaths: 0, threats: 0, gaze: 0, hoursSinceBeat: 48 });
    const hard = rawTension({ kills: 12, deaths: 1, threats: 2, gaze: 60, hoursSinceBeat: 0 });
    expect(calm).toBe(0);
    // combat 0.25 + threat 0.15 + stagnation 0.20 (goddess_gm.md 8.2 weights)
    expect(hard).toBe(60);
    // the other three inputs: disputes at escalation 3, resources, divine pressure
    const all = rawTension({
      kills: 12,
      deaths: 1,
      threats: 2,
      gaze: 60,
      hoursSinceBeat: 0,
      escalation: 3,
      resource: 1,
      divinePower: 50,
    });
    expect(all).toBe(100);
    expect(
      rawTension({ kills: 0, deaths: 0, threats: 0, gaze: 0, hoursSinceBeat: 48, escalation: 3 }),
    ).toBe(20);
    expect(
      rawTension({ kills: 0, deaths: 0, threats: 0, gaze: 0, hoursSinceBeat: 48, resource: 1 }),
    ).toBe(10);
    expect(
      rawTension({ kills: 0, deaths: 0, threats: 0, gaze: 0, hoursSinceBeat: 48, divinePower: 25 }),
    ).toBe(5);
    expect(smooth(0, 100)).toBe(35);
    expect(bandFor('act1')).toEqual({ low: 20, high: 65 });
    expect(bandFor('act1', 'landing', false, BANDS)).toEqual({ low: 30, high: 50 });
    expect(bandFor('act1', 'dark', false, BANDS)).toEqual({ low: 50, high: 75 });
    expect(bandFor('act1', 'climax', false, BANDS)).toEqual({ low: 75, high: 95 });
    expect(bandFor('act1', 'pullback', true, BANDS)).toEqual({ low: 25, high: 60 });
  });

  it('opens a coincidence after a long quiet stretch and a respite after a hard one', () => {
    expect(decide(20, 0, 30, 0)).toBe('coincidence');
    expect(decide(19, 0, 30, 0)).toBeNull();
    expect(decide(20, 0, 25, 0)).toBeNull();
    expect(decide(20, 0, 25, 0, 1)).toBe('coincidence');
    expect(decide(0, 10, 0, 12)).toBe('respite');
    expect(decide(0, 10, 0, 6)).toBeNull();
  });
});

describe('director in the world', () => {
  it('stays silent in the prologue and while a scene plays', () => {
    const g = Engine.create(1, narrativeContent(), NARRATIVE_SYSTEMS, {});
    g.step(TICKS_PER_GAME_HOUR * 30);
    expect(g.world.slices.director.history.length).toBe(0);
  });

  it('arranges a coincidence when the story stalls, as a fate thread in the ledger', () => {
    // act 2: the meter may open coincidences (act 1 has only its written one)
    const g = quietGame(11, [], 'act2');
    g.step(TICKS_PER_GAME_HOUR * 40);
    const h = g.world.slices.director.history;
    expect(h.some((x) => x.move === 'coincidence')).toBe(true);
    expect(Number(g.world.meta.flags.fate_threads)).toBeGreaterThan(0);
    const moira = g.world.slices.goddess.ledger.filter(
      (e) => e.goddess === 'moira' && e.action === 'coincidence',
    );
    expect(moira.length).toBeGreaterThan(0);
    expect(moira.every((e) => e.power >= 1 && e.power <= 5 && !e.public)).toBe(true);
    // the ledger note is a text key naming the fate goddess, the move and the menu item
    const note = moira[0]?.note;
    expect(note).toMatchObject({
      key: 'sys.director.note.arranged',
      params: { move: tr('sys.director.move.coincidence') },
    });
    expect(t(note)).toMatch(/安排的巧合：/);
    expect(g.world.recent.some((e) => e.kind === 'director.move')).toBe(true);
  });

  it('opens no coincidence of its own in act 1 (act1_borderstone.md 7.5)', () => {
    const g = quietGame();
    g.step(TICKS_PER_GAME_HOUR * 60);
    const own = g.world.slices.director.history.filter(
      (x) => x.move === 'coincidence' && x.item !== 'div_dir_rumor_arrives',
    );
    expect(own).toEqual([]);
    expect(g.world.slices.director.freeCoincidences?.act1 ?? 0).toBe(0);
  });

  it('gives a respite after sustained hard fighting and never touches combat results', () => {
    const slaughter: GameSystem = {
      id: 'zz_slaughter',
      order: 998,
      tick(ctx) {
        if (ctx.tick % 50 === 0) {
          ctx.emit('entity.died', {
            id: ctx.newId('m'),
            kind: 'monster',
            killerId: 'player',
            mapId: 'forest_edge',
            x: 1,
            y: 1,
          });
          if (ctx.tick % 400 === 0)
            ctx.emit('entity.died', {
              id: 'player',
              kind: 'player',
              mapId: 'forest_edge',
              x: 1,
              y: 1,
            });
          ctx.world.slices.quests.lastBeatTick = ctx.tick;
        }
      },
    };
    const g = quietGame(12, [slaughter]);
    g.step(TICKS_PER_GAME_HOUR * 24);
    // act week 1 is the landing beat (30 to 50)
    expect(g.world.slices.director.tension).toBeGreaterThan(
      bandFor('act1', 'landing', false, BANDS).high,
    );
    const h = g.world.slices.director.history;
    expect(h.some((x) => x.move === 'respite')).toBe(true);
    const calming = activeModifiers(g.world, 'monster', 'forest_edge').filter(
      (m) => m.source === 'director',
    );
    expect(calming.every((m) => (m.factor ?? 1) <= 1)).toBe(true);
  });

  it('is deterministic for the same seed', () => {
    const a = quietGame(21);
    const b = quietGame(21);
    a.step(TICKS_PER_GAME_HOUR * 60);
    b.step(TICKS_PER_GAME_HOUR * 60);
    expect(a.world.slices.director.history).toEqual(b.world.slices.director.history);
    expect(worldHash(a.world)).toBe(worldHash(b.world));
  });
});
