// Map flow metrics (map_briefs.md 1.4 and 15, scene_flow.md 1 and 5): the first-contact
// distance from the entrances to the nearest alert circle, the gap between a safe place and
// the nearest alert circle, and a multi-act map's resident levels under each act's flags.
// The metric functions are pinned on a small hand-made map; then every built map gets one
// case. A first-round map that misses a target carries a waiver here that pins its measured
// value, names the change that clears it and the package doing it (map_briefs.md 12); when a
// map improves, its case fails until the waiver is removed.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { LEVEL_BANDS } from '../src/systems/combat/progression';
import {
  actFlags,
  alertCircles,
  entrances,
  FLOW_TARGETS,
  firstContact,
  flowTemplate,
  isAtlasExempt,
  type MapDef,
  type MonsterStats,
  residentSpawns,
  residentTopLevel,
  safeMargin,
  walkDistances,
} from '../src/systems/world';

// ---------------------------------------------------------------------------
// The metric functions on a hand-made map.

// 12 x 5: an entrance on the west, a wall with one gap, a camp, a wolf spawn in the east.
const FIELD: MapDef = {
  id: 'metric_field',
  name: '度量野地',
  region: 'edgestone_area',
  width: 12,
  height: 5,
  rows: ['............', '.....#......', '.....#......', '.....#......', '............'],
  legend: { '.': 'grass', '#': 'wall' },
  locations: [{ id: 'camp', name: '营地', kind: 'safe', x: 1, y: 1, w: 2, h: 2 }],
  spawns: [
    { id: 'wolves', kind: 'monster', ref: 'wolf', x: 10.5, y: 2.5, radius: 1 },
    {
      id: 'late_bears',
      kind: 'monster',
      ref: 'bear',
      x: 8.5,
      y: 0.5,
      requiresFlags: ['act.2.entered'],
    },
    {
      id: 'early_rats',
      kind: 'monster',
      ref: 'rat',
      x: 1.5,
      y: 4.5,
      requiresFlags: ['!act.2.entered'],
      level: [8, 9],
    },
  ],
  exits: [],
};
const STATS: Record<string, MonsterStats> = {
  wolf: { minLevel: 4, maxLevel: 6, aggroRadius: 2 },
  bear: { minLevel: 12, maxLevel: 14, aggroRadius: 3 },
  rat: { minLevel: 1, maxLevel: 2, aggroRadius: 1 },
};
const stats = (id: string) => STATS[id];

describe('the metric functions', () => {
  it('walks eight ways without cutting corners, a diagonal step 1.414 m', () => {
    const d = walkDistances(FIELD, [{ x: 0.5, y: 2.5 }]);
    const at = (x: number, y: number) => d[y * FIELD.width + x] as number;
    expect(at(0, 2)).toBe(0);
    expect(at(4, 2)).toBe(4);
    expect(at(1, 1)).toBeCloseTo(Math.SQRT2, 9);
    // the wall at column 5 (rows 1 to 3) is passed at row 0 or row 4, and no diagonal step
    // cuts its corner: (0,2) to (2,0) diagonally, along row 0 to (6,0), down to (6,2)
    expect(at(6, 2)).toBeCloseTo(6 + 2 * Math.SQRT2, 9);
    expect(at(5, 2)).toBe(Number.POSITIVE_INFINITY);
  });

  it('reads resident spawns under act flags, negated groups giving way to later acts', () => {
    expect(residentSpawns(FIELD, actFlags(1)).map((s) => s.id)).toEqual(['wolves', 'early_rats']);
    expect(residentSpawns(FIELD, actFlags(2)).map((s) => s.id)).toEqual(['wolves', 'late_bears']);
    expect(actFlags(3)).toEqual({
      'act.1.entered': true,
      'act.2.entered': true,
      'act.3.entered': true,
    });
  });

  it('sizes alert circles from the wander and aggro radii, levels from the spawn or the bestiary', () => {
    expect(alertCircles(FIELD, actFlags(1), stats)).toEqual([
      { spawnId: 'wolves', x: 10.5, y: 2.5, r: 3, levels: [4, 6] },
      { spawnId: 'early_rats', x: 1.5, y: 4.5, r: 2, levels: [8, 9] },
    ]);
    expect(residentTopLevel(FIELD, 1, stats)).toBe(9);
    expect(residentTopLevel(FIELD, 2, stats)).toBe(14);
    // a spawn of an unknown monster is left out
    expect(alertCircles(FIELD, actFlags(1), () => undefined)).toEqual([]);
  });

  it('measures first contact as the walk to the first tile inside a circle', () => {
    const start = [{ x: 0.5, y: 2.5 }];
    const wolves = alertCircles(FIELD, actFlags(2), stats).filter((c) => c.spawnId === 'wolves');
    // past the wall's north end the wolf circle (radius 3 around 10.5, 2.5) first takes in
    // (8, 0): two diagonals, six steps east
    expect(firstContact(FIELD, start, wolves)).toBeCloseTo(4 + 2 * Math.SQRT2 + 2, 9);
    expect(firstContact(FIELD, start, [])).toBe(Number.POSITIVE_INFINITY);
    // the act 1 rats sit by the entrance
    expect(firstContact(FIELD, start, alertCircles(FIELD, actFlags(1), stats))).toBeCloseTo(1, 9);
  });

  it('measures the gap between a safe rectangle and the nearest circle, negative on overlap', () => {
    const camp = FIELD.locations[0] as MapDef['locations'][number];
    const act1 = alertCircles(FIELD, actFlags(1), stats);
    // the rats at (1.5, 4.5) radius 2: the camp ends at y = 3, so 1.5 - 2
    expect(safeMargin(camp, act1)).toBeCloseTo(-0.5, 9);
    const act2 = alertCircles(FIELD, actFlags(2), stats);
    // the act 2 bears (8.5, 0.5) radius 4 are nearer than the wolves
    expect(safeMargin(camp, act2)).toBeCloseTo(Math.hypot(8.5 - 3, 1 - 0.5) - 4, 9);
    expect(safeMargin(camp, [])).toBe(Number.POSITIVE_INFINITY);
  });

  it('finds the entrances where other maps land, by arrival location or coordinates', () => {
    const town: MapDef = {
      ...FIELD,
      id: 'metric_town',
      locations: [],
      spawns: [],
      exits: [
        { id: 'a', x: 0, y: 0, toMap: 'metric_field', toX: 7.5, toY: 3.5, label: 'a' },
        {
          id: 'b',
          x: 1,
          y: 0,
          toMap: 'metric_field',
          toX: 0,
          toY: 0,
          toLocation: 'camp',
          label: 'b',
        },
      ],
    };
    expect(entrances([FIELD, town], FIELD)).toEqual([
      { x: 7.5, y: 3.5 },
      { x: 2.5, y: 2.5 },
    ]);
    expect(entrances([FIELD], FIELD)).toEqual([]);
  });

  it('maps atlas roles to the flow templates', () => {
    expect(['hub', 'dungeon', 'field', 'battle', 'private', 'stage'].map(flowTemplate)).toEqual([
      'T-H',
      'T-D',
      'T-F',
      'T-B',
      'T-S',
      'T-S',
    ]);
    expect(FLOW_TARGETS).toEqual({ firstContact: 8, safeMargin: 3, levelOverBand: 2 });
  });
});

// ---------------------------------------------------------------------------
// The built maps.

/**
 * Measured shortfalls of the first-round maps not rebuilt yet (map_briefs.md 1.11). Each
 * pins the value the map measures today and names the change of map_briefs.md 12 that
 * clears it. `safe: 'none'` is a dungeon floor without a safe platform yet. The act 1 maps
 * of PK-M1-35 (seal_ruins, seal_ruins_depths, forest_edge, ash_waste) met their templates
 * and lost their waivers.
 */
interface Waiver {
  firstContact?: number;
  safe?: number | 'none';
  /** act to the resident top level that exceeds the band */
  levels?: Record<number, number>;
  why: string;
}
const WAIVERS: Record<string, Waiver> = {
  wallenburg_sewers: {
    firstContact: 3,
    safe: -0.33,
    why: 'map_briefs 12 row 5: rat groups at SpawnDef.level 16 to 18, ws_rat_hall_n and ws_drowned_n moved; B6, PK-M2-19',
  },
};

const content = buildContent();
const monster = (id: string): MonsterStats | undefined => content.monsters.find((m) => m.id === id);
const built = content.maps.filter((m) => !isAtlasExempt(m));

describe('the built maps meet their flow template (map_briefs.md 15 rule 2)', () => {
  it('measures every built map (the M1 maps of PK-M1-35 and the act 2 pair), and every waiver names a built map', () => {
    expect(built.map((m) => m.id).sort()).toEqual([
      'ash_waste',
      'borderstone',
      'borderstone_north',
      'brokenspan_post',
      'dg_old_mine',
      'divine_court',
      'door_corridor',
      'dream_doorway',
      'earth_hospital',
      'earth_house',
      'earth_store',
      'earth_train',
      'forest_edge',
      'gap_void',
      'inner_court',
      'ironhemlock_deep',
      'old_outpost',
      'rustridge_mine',
      'seal_ruins',
      'seal_ruins_depths',
      'wallenburg',
      'wallenburg_sewers',
    ]);
    for (const id of Object.keys(WAIVERS))
      expect(
        built.some((m) => m.id === id),
        id,
      ).toBe(true);
  });

  for (const map of built) {
    const entry = content.atlas_maps.find((a) => a.id === map.id);
    const template = flowTemplate(entry?.role ?? 'stage');
    it(`${map.id} (${template})`, () => {
      expect(entry, map.id).toBeDefined();
      const waiver = WAIVERS[map.id];
      const starts = entrances(content.maps, map);
      for (const act of entry?.acts ?? []) {
        const circles = alertCircles(map, actFlags(act), monster);
        const who = `${map.id} act ${act}`;
        // a field or a dungeon floor: the safety belt at the entrance, a safe place
        if (template === 'T-F' || template === 'T-D') {
          // no entrance or no monster would read as an endless safety belt
          expect(starts.length, `${who} entrances`).toBeGreaterThan(0);
          expect(circles.length, `${who} resident monsters`).toBeGreaterThan(0);
          const fc = firstContact(map, starts, circles);
          if (waiver?.firstContact !== undefined) {
            expect(fc, `${who} first contact (waived)`).toBeCloseTo(waiver.firstContact, 1);
            expect(fc, `${who} waiver still needed`).toBeLessThan(FLOW_TARGETS.firstContact);
          } else
            expect(fc, `${who} first contact`).toBeGreaterThanOrEqual(FLOW_TARGETS.firstContact);
          const safes = map.locations.filter((l) => l.kind === 'safe');
          if (waiver?.safe === 'none') {
            // the floor has no safe platform yet
            expect(safes, `${who} safe place (waived)`).toEqual([]);
          } else {
            expect(safes.length, `${who} safe place`).toBeGreaterThan(0);
            const margin = Math.min(...safes.map((l) => safeMargin(l, circles)));
            if (waiver?.safe !== undefined) {
              expect(margin, `${who} safe margin (waived)`).toBeCloseTo(waiver.safe, 1);
              expect(margin, `${who} waiver still needed`).toBeLessThan(FLOW_TARGETS.safeMargin);
            } else
              expect(margin, `${who} safe margin`).toBeGreaterThanOrEqual(FLOW_TARGETS.safeMargin);
          }
        } else {
          // towns, the antechamber and the inner court keep no resident monsters
          expect(circles, `${who} resident monsters`).toEqual([]);
        }
        // a multi-act map: the resident levels of an act stay within its band plus two
        const band = LEVEL_BANDS[act];
        if (!band) continue;
        const top = residentTopLevel(map, act, monster);
        const cap = band[1] + FLOW_TARGETS.levelOverBand;
        const waived = waiver?.levels?.[act];
        if (waived !== undefined) {
          expect(top, `${who} resident top level (waived)`).toBe(waived);
          expect(top, `${who} waiver still needed`).toBeGreaterThan(cap);
        } else expect(top, `${who} resident top level`).toBeLessThanOrEqual(cap);
      }
    });
  }
});
