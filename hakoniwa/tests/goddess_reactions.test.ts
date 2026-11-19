// The goddesses' reaction table and the director's rule table (builtin_ai.md 8.7, 13.2 and
// 19 steps 8 and 9; catalog_goddess_interventions.md 6 and 10; PK-M1-20): the honorific per
// act (her pack's answer, her wordless sign, the per-day wake budget), witnessed feats, the
// coin, offerings and debts, revelations, the seal and the doors, the forbidden name, the
// dream another goddess notices; and the coverage report: across these scenarios every row of
// both tables fires and none is dead.

import { describe, expect, it } from 'vitest';
import { Engine, ok } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import type { GameSystem } from '../src/core/system';
import { calendarAt, TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR, tickAtDay } from '../src/core/time';
import { type CoverageRow, ruleCoverage } from '../src/systems/director';
import { addItem } from '../src/systems/inventory';
import { mapById, spawnEntity } from '../src/systems/world';
import { NARRATIVE_SYSTEMS, narrativeContent, otherTeamsStub } from './narrative_harness';

/**
 * The middle of a named place, read from the map data (never a literal: the maps move, see
 * PK-M1-35 and data/world/map_shifts.json). A map without that place gives its first one.
 */
function at(content: ContentMap, mapId: string, loc: string): { x: number; y: number } {
  const map = mapById(content, mapId);
  const l = map?.locations.find((x) => x.id === loc) ?? map?.locations[0];
  if (!l) throw new Error(`no places on ${mapId}`);
  return { x: l.x + Math.floor(l.w / 2), y: l.y + Math.floor(l.h / 2) };
}

declare module '../src/core/contracts' {
  interface CommandMap {
    'pk20r.give': { item: string; count?: number };
    'pk20r.believer': { tags: string[]; mapId: string };
    'pk20r.say': { text: string };
    'pk20r.seal': { stage: number };
  }
}

const probe: GameSystem = {
  id: 'zz_pk20_reactions',
  order: 999,
  commands: {
    'pk20r.give'(ctx, d) {
      addItem(ctx, 'player', d.item, d.count ?? 1, 'test');
      return ok();
    },
    'pk20r.believer'(ctx, d) {
      const p = ctx.world.slices.world.entities.player;
      spawnEntity(ctx, {
        kind: 'npc',
        name: '信徒',
        mapId: d.mapId,
        x: p?.x ?? 1,
        y: p?.y ?? 1,
        faction: 'town',
        appearance: { base: 'human', colors: ['#000000', '#000000', '#000000', '#000000'] },
        tags: ['npc', ...d.tags],
      });
      return ok();
    },
    'pk20r.say'(ctx, d) {
      ctx.emit('player.said', { text: d.text, mapId: 'borderstone' });
      return ok();
    },
    'pk20r.seal'(ctx, d) {
      // the doors system raises the seal stage (doors/seal.ts); here its event alone
      ctx.setFlag('seal_stage', d.stage);
      ctx.emit('seal.stage_up', { stage: d.stage, from: d.stage - 1 });
      return ok();
    },
  },
};

function game(
  act = 'act1',
  seed = 5,
  content: ContentMap = narrativeContent(),
  aiMode: 'off' | 'external' = 'off',
): Engine {
  const g = Engine.create(seed, content, [...NARRATIVE_SYSTEMS, otherTeamsStub, probe], {
    aiMode,
  });
  g.queue('flag.set', { key: 'act', value: act });
  g.queue('flag.set', { key: 'a1_wake_ruins', value: true });
  g.queue('world.teleport', {
    entityId: 'player',
    mapId: 'borderstone',
    ...at(g.content, 'borderstone', 'plaza'),
  });
  g.step(2);
  g.world.slices.scenes.current = null;
  g.world.slices.scenes.queue = [];
  return g;
}

function fired(g: Engine): string[] {
  return g.world.recent.flatMap((e) => (e.kind === 'goddess.reacted' ? [e.data.rowId] : []));
}

function narrations(g: Engine, from: number): unknown[] {
  return g.world.recent
    .slice(from)
    .flatMap((e) => (e.kind === 'dialogue.line' && e.data.kind === 'narrate' ? [e.data.text] : []));
}

const HONORIFIC = {
  merca: '交易与丰饶之司，梅尔卡·奥蕾拉。',
  valda: '争斗与淬炼之司，瓦尔妲·戈尔维克。',
  sylvie: '生命与循环之司，希尔薇·薇瑞丹。',
  moira: '记录与命运之司，莫伊拉·诺塔。',
  eluen: '光与秩序之司，艾琉恩·奥瑞莉亚。',
};

describe('the honorific (catalog 10, rows 01 and 02)', () => {
  it('wakes her with this act’s answer once a day, then her sign; raises her gaze', () => {
    const g = game('act1', 5, narrativeContent(), 'external');
    g.queue('pk20r.say', { text: HONORIFIC.merca });
    g.step(1);
    const wake = g.world.ai.pending.find(
      (r) => r.role === 'goddess.dialogue' && r.agentId === 'merca',
    );
    expect(wake?.fallback[0]?.data).toMatchObject({ goddessId: 'merca' });
    // a line of her act-1 honorific answer (the batch has two; the seeded draw picks one)
    const wakeKey = (wake?.fallback[0]?.data as { text?: { key?: string } } | undefined)?.text?.key;
    expect(wakeKey).toMatch(/^c\.line_packs\.ln_merca\.acts\.act1\.react_honorific\.\d+$/);
    expect(fired(g)).toEqual(['div_react_all_01']);
    const gaze = g.world.slices.goddess.goddesses.merca?.gaze ?? 0;
    expect(gaze).toBeGreaterThanOrEqual(15);
    // the same invoker the same day: her sign, a little more gaze
    const at = g.world.recent.length;
    g.queue('pk20r.say', { text: HONORIFIC.merca });
    g.step(1);
    expect(fired(g).at(-1)).toBe('div_react_all_02');
    expect(narrations(g, at)).toEqual([{ key: 'sys.goddess.narrate.silent.merca' }]);
    // the next day she wakes again
    g.step(tickAtDay(1, 0, 10) - g.tick);
    g.queue('pk20r.say', { text: HONORIFIC.merca });
    g.step(1);
    expect(fired(g).at(-1)).toBe('div_react_all_01');
  });

  it('answers with the act’s silence for those who do not speak yet', () => {
    const g = game();
    for (const id of ['valda', 'sylvie', 'moira'] as const) {
      const at = g.world.recent.length;
      g.queue('pk20r.say', { text: HONORIFIC[id] });
      g.step(1);
      expect(fired(g).at(-1)).toBe(`div_react_${id}_01`);
      const told = narrations(g, at);
      expect(told[0]).toEqual({ key: `sys.goddess.narrate.silent.${id}` });
      if (id === 'moira')
        expect((told[1] as { key?: string } | undefined)?.key).toMatch(
          /^c\.line_packs\.ln_moira\.slots\.react_quote\.\d+$/,
        );
    }
    // act-1 gaze caps hold (valda 10)
    expect(g.world.slices.goddess.goddesses.valda?.gaze).toBeLessThanOrEqual(10);
    // Eluen in act 2 answers with her light only (catalog 10.2: 旁白)
    const g2 = game('act2');
    const at = g2.world.recent.length;
    g2.queue('pk20r.say', { text: HONORIFIC.eluen });
    g2.step(1);
    expect(fired(g2).at(-1)).toBe('div_react_all_01');
    expect(narrations(g2, at)).toEqual([{ key: 'sys.goddess.narrate.silent.eluen' }]);
  });
});

describe('the rest of the act-1 table', () => {
  it('files a witnessed feat as believers’ exaggeration (Eluen, act 1) and as notable for the others', () => {
    const g = game();
    g.queue('pk20r.believer', { tags: ['priest', 'faction:church'], mapId: 'borderstone' });
    g.queue('pk20r.believer', { tags: ['merchant'], mapId: 'borderstone' });
    g.step(1);
    g.queue('stub.feat', { tier: 3 });
    g.step(1);
    const rows = fired(g);
    expect(rows).toContain('div_react_eluen_01');
    expect(rows).toContain('div_react_all_03');
  });

  it('turns her sight to the ruins when the seal moves, counts doors for the dreams, hears the forbidden name', () => {
    const g = game();
    g.queue('pk20r.seal', { stage: 2 });
    g.step(1);
    expect(fired(g)).toEqual(expect.arrayContaining(['div_react_eluen_16', 'div_react_janu_03']));
    expect(g.world.slices.goddess.brains?.eluen?.gaze?.mapId).toBe('seal_ruins');
    g.queue('stub.door', { doorId: 'door_test' });
    g.step(1);
    expect(fired(g)).toContain('div_react_janu_01');
    expect(g.world.slices.goddess.brains?.janu?.doorsSinceDream).toBe(1);
    g.queue('pk20r.say', { text: '雅努' });
    g.step(1);
    expect(fired(g)).toContain('div_react_janu_06');
  });
});

/** Hard fighting on the forest's edge: kills every 50 ticks, a death every 400. */
const slaughter: GameSystem = {
  id: 'zz_pk20_slaughter',
  order: 998,
  tick(ctx) {
    if (ctx.tick % 50 !== 0) return;
    ctx.emit('entity.died', {
      id: ctx.newId('m'),
      kind: 'monster',
      killerId: 'player',
      mapId: 'forest_edge',
      x: 1,
      y: 1,
    });
    if (ctx.tick % 400 === 0)
      ctx.emit('entity.died', { id: 'player', kind: 'player', mapId: 'forest_edge', x: 1, y: 1 });
    ctx.world.slices.quests.lastBeatTick = ctx.tick;
  },
};

/** Scenarios that between them fire every row of both tables. */
const SCENARIOS: Record<string, () => Engine> = {
  honorifics: () => {
    const g = game();
    for (const t of Object.values(HONORIFIC)) {
      g.queue('pk20r.say', { text: t });
      g.step(1);
    }
    g.queue('pk20r.say', { text: HONORIFIC.merca });
    g.step(1);
    return g;
  },
  feats: () => {
    const g = game();
    g.queue('pk20r.believer', { tags: ['priest', 'faction:church'], mapId: 'borderstone' });
    g.queue('pk20r.believer', { tags: ['merchant'], mapId: 'borderstone' });
    g.step(1);
    g.queue('stub.feat', { tier: 3 });
    g.step(1);
    return g;
  },
  coin: () => {
    const g = game();
    g.queue('flag.set', { key: 'p_merca_valuation', value: 'high' });
    g.queue('pk20r.give', { item: 'merca_coin' });
    g.queue('pk20r.give', { item: 'otherworld_sweets' });
    g.queue('pk20r.give', { item: 'magic_crystal' });
    g.step(1);
    g.queue('goddess.coin', {});
    g.queue('goddess.offer', { itemId: 'otherworld_sweets', want: 'blessing' });
    g.queue('goddess.offer', { itemId: 'magic_crystal', want: 'intel' });
    g.step(1);
    g.queue('flag.set', { key: 'merca_ledger', value: -20 });
    g.step(tickAtDay(1, 0, 5) - g.tick);
    g.queue('flag.set', { key: 'merca_ledger', value: 5 });
    g.step(tickAtDay(2, 0, 5) - g.tick);
    return g;
  },
  revelation: () => {
    const g = game('act4');
    g.queue('maker.revelation', { id: 'ash_full' });
    g.step(2);
    return g;
  },
  seal: () => {
    const g = game();
    g.queue('pk20r.seal', { stage: 2 });
    g.queue('stub.door', { doorId: 'door_test' });
    g.queue('pk20r.say', { text: '雅努' });
    g.step(2);
    return g;
  },
  dreams: () => {
    // Janu dreams into the player once three doors opened; Sylvie may notice (5%)
    const g = game('act1', 3);
    g.queue('flag.set', { key: 'seal_looseness', value: 20 });
    g.queue('flag.set', { key: 'a1_dream_door_woman', value: true });
    g.step(1);
    for (let day = 0; day < 240; day++) {
      if (g.world.slices.goddess.brains?.sylvie?.react.lastTick.div_react_sylvie_15 !== undefined)
        break;
      for (let i = 0; i < 3; i++) g.queue('stub.door', { doorId: `door_${day}_${i}` });
      g.step(TICKS_PER_GAME_DAY);
    }
    return g;
  },
  director: () => {
    // a quiet act 1: the open delivery, a coincidence, the must delivery of the tide's strike
    const g = game();
    g.queue('flag.set', { key: 'a1_martha_strike', value: true });
    g.step(TICKS_PER_GAME_DAY * 8);
    // a scene plays: the player is busy
    g.queue('scenes.start', { sceneId: 'cut_a1_dream' });
    g.step(TICKS_PER_GAME_HOUR + 1);
    g.world.slices.scenes.current = null;
    g.world.slices.scenes.queue = [];
    // into the window of the written coincidence (weeks 3 to 10)
    g.step(TICKS_PER_GAME_DAY * 40);
    return g;
  },
  coincidence: () => {
    // act 2: the meter opens a coincidence after a quiet stretch (act 1 keeps to its written one)
    const g = game('act2');
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: 'forest_edge',
      ...at(g.content, 'forest_edge', 'deer_spring'),
    });
    g.step(TICKS_PER_GAME_HOUR * 40);
    return g;
  },
  respite: () => {
    const g = Engine.create(12, narrativeContent(), [...NARRATIVE_SYSTEMS, slaughter], {});
    g.queue('flag.set', { key: 'act', value: 'act1' });
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: 'forest_edge',
      ...at(g.content, 'forest_edge', 'deer_spring'),
    });
    g.step(2);
    g.world.slices.scenes.current = null;
    g.world.slices.scenes.queue = [];
    g.step(TICKS_PER_GAME_HOUR * 24);
    return g;
  },
  events: () => {
    // two offered dynamic events of either direction (they stand in for the act's remaining
    // templates, PK-M1-33) while hard fighting drives the meter over its ceiling: the director
    // takes the respite one before the respite row would open (13.2 row 7)
    const c = narrativeContent();
    const base = c.dynamicEvents.find((e) => e.id === 'ev_a1_market_day');
    const item = c.directorMenu.find((i) => i.id === 'ev_a1_market_day');
    if (!base || !item) throw new Error('market day missing');
    const ids = ['ev_test_drizzle', 'ev_test_lull'];
    const content = {
      ...c,
      dynamicEvents: [...c.dynamicEvents, ...ids.map((id) => ({ ...base, id, maps: [] }))],
      directorMenu: [
        ...c.directorMenu,
        { ...item, id: ids[0] as string, kind: 'coincidence' as const, maps: [] },
        { ...item, id: ids[1] as string, kind: 'respite' as const, maps: [] },
      ],
      directorDeliveries: [],
    } as ContentMap;
    const g = Engine.create(12, content, [...NARRATIVE_SYSTEMS, slaughter], {});
    g.queue('flag.set', { key: 'act', value: 'act1' });
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: 'forest_edge',
      ...at(g.content, 'forest_edge', 'deer_spring'),
    });
    g.step(2);
    g.world.slices.scenes.current = null;
    g.world.slices.scenes.queue = [];
    g.step(TICKS_PER_GAME_HOUR * 24);
    return g;
  },
  comedy: () => {
    const g = game();
    // the cognition engine played a comedy bit on this map today (comedy.ts state)
    const day = calendarAt(g.tick).dayIndex;
    (g.world.slices as unknown as Record<string, unknown>).cognition = {
      comedy: { 'borderstone/crystal': { day, count: 1 } },
    };
    g.world.slices.director.delivered = ['dlv_a1_nameless_god', 'dlv_a1_martha_strike'];
    g.step(TICKS_PER_GAME_HOUR * 2);
    return g;
  },
};

describe('rule coverage (builtin_ai 19 steps 8 and 9)', () => {
  it('has no dead row, and every row fires in the scenarios', () => {
    const content = narrativeContent();
    const all = new Map<string, CoverageRow>();
    for (const [name, run] of Object.entries(SCENARIOS)) {
      const g = run();
      for (const r of ruleCoverage(g.world, g.content)) {
        const prev = all.get(r.row);
        all.set(r.row, prev ? { ...r, fired: prev.fired || r.fired } : r);
      }
      expect(name).toBeTruthy();
    }
    const rows = [...all.values()];
    // the report lists both tables in full
    expect(rows.filter((r) => r.table === 'goddessReactions').length).toBe(
      content.goddessReactions.length,
    );
    expect(rows.filter((r) => r.table === 'directorRules').length).toBe(
      content.directorRules.length,
    );
    expect(rows.filter((r) => r.dead !== '')).toEqual([]);
    expect(rows.filter((r) => !r.fired).map((r) => r.row)).toEqual([]);
  }, 600_000);

  it('reports a row the kernel can never raise as dead', () => {
    const c = narrativeContent();
    const rows = ruleCoverage(
      { slices: {} },
      {
        ...c,
        goddessReactions: [
          ...c.goddessReactions,
          {
            ...(c.goddessReactions[0] as (typeof c.goddessReactions)[number]),
            id: 'div_react_test_99',
            goddess: 'eluen',
            event: 'pitch.refused' as never,
          },
        ],
      },
    );
    expect(rows.find((r) => r.row === 'div_react_test_99')?.dead).toBe('event pitch.refused');
  });
});
