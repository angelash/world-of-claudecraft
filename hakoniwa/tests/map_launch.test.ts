// The launch checks of the prologue and act 1 maps (docs/40_design/world/map_briefs.md 14
// and 15; PK-M1-35): the nineteen M1 maps and the old mine sub-scene are built at their brief
// sizes; every exit, spawn, arrival and safe place is reachable on foot; the switch tiles
// close and open the ways the briefs say; the discovery points add up to the act 1 table of
// travel_and_exploration.md 6.3; the local sediment hot spots stand where the briefs put
// them; the earth stages carry the door's corners; the act 1 dungeons sit on these maps; and
// the shift table of the extended maps (1.11 rule 5) moves the frozen saves onto walkable
// ground. The flow template metrics are in tests/map_metrics.test.ts, the look layer in
// tests/look_layer.test.ts and the atlas in tests/world_atlas.test.ts.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import shiftData from '../data/world/map_shifts.json';
import { buildContent } from '../src/content';
import { floorAt } from '../src/systems/dungeons/layout';
import {
  actFlags,
  alertCircles,
  entrances,
  FLOW_TARGETS,
  firstContact,
  isWalkableTile,
  type LocationDef,
  liveMap,
  type MapDef,
  sedimentAt,
  walkDistances,
} from '../src/systems/world';
import { atlasProblems } from '../src/systems/world/atlas';

const content = buildContent();
const map = (id: string): MapDef => {
  const m = content.maps.find((x) => x.id === id);
  if (!m) throw new Error(`no map ${id}`);
  return m;
};
const at = (m: MapDef, id: string): LocationDef => {
  const l = m.locations.find((x) => x.id === id);
  if (!l) throw new Error(`no location ${m.id}.${id}`);
  return l;
};
const centre = (l: LocationDef) => ({ x: l.x + l.w / 2, y: l.y + l.h / 2 });

/** map_briefs.md 14: the M1 maps (code, width, height), and the old mine sub-scene. */
const M1: Record<string, [string, number, number]> = {
  divine_court: ['P0', 32, 24],
  earth_train: ['P1', 24, 8],
  earth_store: ['P2', 16, 12],
  earth_hospital: ['P3', 24, 8],
  earth_house: ['P4', 12, 10],
  inner_court: ['X1', 48, 40],
  gap_void: ['X2', 16, 16],
  door_corridor: ['X3', 64, 16],
  dream_doorway: ['X4', 16, 12],
  borderstone: ['A1', 96, 80],
  borderstone_north: ['A2', 128, 96],
  seal_ruins: ['A3', 64, 48],
  seal_ruins_depths: ['A4', 48, 40],
  rustridge_mine: ['A5', 64, 64],
  forest_edge: ['A6', 112, 80],
  ironhemlock_deep: ['A7', 128, 128],
  brokenspan_post: ['A8', 128, 96],
  ash_waste: ['A9', 128, 112],
  old_outpost: ['A10', 96, 80],
  dg_old_mine: ['A5-2', 48, 48],
};
const M1_IDS = Object.keys(M1);

describe('the nineteen M1 maps and the old mine are built (map_briefs.md 14, 15 rule 1)', () => {
  it('builds each at its brief size, marked built in the atlas with that size', () => {
    for (const [id, [code, w, h]] of Object.entries(M1)) {
      const m = map(id);
      const entry = content.atlas_maps.find((a) => a.id === id);
      expect([m.width, m.height, m.rows.length], id).toEqual([w, h, h]);
      expect(
        m.rows.every((r) => r.length === w),
        id,
      ).toBe(true);
      expect([entry?.code, entry?.status, entry?.size], id).toEqual([code, 'built', [w, h]]);
    }
    expect(M1_IDS.filter((id) => !id.startsWith('dg_'))).toHaveLength(19);
  });

  it('passes the atlas cross checks with no problem naming one of them', () => {
    const problems = atlasProblems({
      regions: content.atlas_regions,
      maps: content.atlas_maps,
      routes: content.atlas_routes,
      contentMaps: content.maps,
      provinces: content.slg_provinces,
      links: content.slg_links,
      scenarios: content.battle_scenarios,
    });
    expect(problems.filter((p) => M1_IDS.some((id) => p.includes(id)))).toEqual([]);
  });
});

/** Locations nobody walks into, by design (an object on a wall, a layer, a ring not yet open). */
const NOT_WALKED: Record<string, string[]> = {
  divine_court: ['long_table'],
  earth_train: ['window'],
  earth_store: ['freezer'],
  earth_hospital: ['nurse_station', 'exit_sign'],
  earth_house: ['wardrobe', 'window'],
  // the Drunk Moon cellar is an indoor layer: only the entry command leads in (dg_moon_cellar)
  borderstone: [
    'moon_cellar',
    'moon_cellar_landing',
    'moon_cellar_barrels',
    'moon_cellar_chest',
    'moon_cellar_long_box',
  ],
  // the court's outer misty ring opens with the court's growth (M2)
  inner_court: ['court_corridor_edge'],
  // the dry well and the smashed shrine stay rock until placement keeps builders off ruins
  // (map_briefs.md 12 row 11 asks for both in one change; the placement rule is the city's)
  old_outpost: ['dry_well', 'smashed_shrine'],
};

/** Where a walk on a map starts: the arrivals from other maps, the stage starts, the spawn. */
function starts(m: MapDef): { x: number; y: number }[] {
  const out = entrances(content.maps, m);
  for (const l of m.locations)
    if (l.tags?.includes('stage_start') || l.kind === 'wake_point' || l.id === 'court_arrival')
      out.push(centre(l));
  for (const s of content.worldStarts) if (s.mapId === m.id) out.push({ x: s.x, y: s.y });
  if (out.length === 0) out.push(centre(m.locations[0] as LocationDef));
  return out;
}

describe('every exit, spawn and named place is reachable on foot (map_briefs.md 1.11 rule 4)', () => {
  for (const id of M1_IDS) {
    it(id, () => {
      const m = map(id);
      const d = walkDistances(m, starts(m));
      const reached = (x: number, y: number) =>
        Number.isFinite(d[Math.floor(y) * m.width + Math.floor(x)] as number);
      for (const e of m.exits) expect(reached(e.x, e.y), `exit ${e.id}`).toBe(true);
      // a spawn inside an indoor layer (the cellar) is reached by the entry command, not on foot
      const indoor = (NOT_WALKED[id] ?? []).map((lid) => at(m, lid));
      const inside = (x: number, y: number) =>
        indoor.some((l) => x >= l.x && x < l.x + l.w && y >= l.y && y < l.y + l.h);
      for (const s of m.spawns)
        if (!inside(s.x, s.y)) expect(reached(s.x, s.y), `spawn ${s.id}`).toBe(true);
      const unreached = m.locations
        .filter((l) => {
          for (let y = l.y; y < l.y + l.h; y++)
            for (let x = l.x; x < l.x + l.w; x++) if (reached(x, y)) return false;
          return true;
        })
        .map((l) => l.id);
      expect(unreached, 'locations nobody walks into').toEqual(NOT_WALKED[id] ?? []);
      // every arrival stands on walkable ground two or three tiles in from the exit that
      // leads back (1.11 rule 2; one-way shortcuts land wherever their brief says)
      for (const other of content.maps) {
        for (const x of other.exits) {
          if (x.toMap !== id || !x.toLocation) continue;
          const oneWay = content.atlas_routes.some(
            (r) => r.from === other.id && r.to === id && r.fromExit === x.id && r.oneWay,
          );
          const l = at(m, x.toLocation);
          const c = centre(l);
          expect(isWalkableTile(m, Math.floor(c.x), Math.floor(c.y)), l.id).toBe(true);
          const back = m.exits.filter((e) => e.toMap === other.id);
          if (oneWay || back.length === 0) continue;
          const d = Math.min(...back.map((e) => Math.hypot(c.x - (e.x + 0.5), c.y - (e.y + 0.5))));
          expect(d, `${id}.${l.id} from its exit`).toBeLessThanOrEqual(3.5);
        }
      }
    });
  }
});

describe('switch tiles close and open the ways the briefs say (map_briefs.md 1.10, 12 row 2)', () => {
  const reachable = (m: MapDef, from: { x: number; y: number }, to: { x: number; y: number }) =>
    Number.isFinite(
      walkDistances(m, [from])[Math.floor(to.y) * m.width + Math.floor(to.x)] as number,
    );

  it('keeps the ruins gate hall shut until the rock fall is cleared; the shaft leads out', () => {
    const ruins = map('seal_ruins');
    const wake = centre(at(ruins, 'wake_point'));
    const shaft = centre(at(ruins, 'shaft_top'));
    const gate = ruins.exits.find((e) => e.toMap === 'borderstone_north');
    expect(gate).toBeDefined();
    const out = { x: (gate?.x ?? 0) + 0.5, y: (gate?.y ?? 0) + 0.5 };
    const shut = liveMap(ruins, {});
    expect(shut).not.toBe(ruins);
    expect(reachable(shut, wake, out), 'first visit: no way out by the main gate').toBe(false);
    expect(reachable(shut, wake, shaft), 'first visit: the outer court is cut off').toBe(false);
    expect(reachable(shut, shaft, out), 'the shaft top lies outside the rock fall').toBe(true);
    const open = liveMap(ruins, { a1_ruins_gate_cleared: true });
    expect(reachable(open, wake, out), 'cleared: the main gate is a way out').toBe(true);
    // the way down to the depths is open either way
    const down = ruins.exits.find((e) => e.toMap === 'seal_ruins_depths');
    expect(reachable(shut, wake, { x: (down?.x ?? 0) + 0.5, y: (down?.y ?? 0) + 0.5 })).toBe(true);
  });

  it('opens the mine collapse after the one night (a1_mine_cleared)', () => {
    const mine = map('rustridge_mine');
    const from = centre(at(mine, 'mine_antechamber'));
    const stairs = mine.exits.find((e) => e.toMap === 'dg_old_mine');
    const to = { x: (stairs?.x ?? 0) + 0.5, y: (stairs?.y ?? 0) + 0.5 };
    expect(reachable(liveMap(mine, {}), from, to)).toBe(false);
    expect(reachable(liveMap(mine, { a1_mine_cleared: true }), from, to)).toBe(true);
  });

  it('keeps the hollow stone rift sealed until act 3', () => {
    const old = map('dg_old_mine');
    const rift = centre(at(old, 'hollow_rift'));
    const nest = centre(at(old, 'mother_nest'));
    expect(reachable(liveMap(old, {}), nest, rift)).toBe(false);
    expect(reachable(liveMap(old, { 'act.3.entered': true }), nest, rift)).toBe(true);
  });

  it('wakes the player out of reach of the first monsters (no alert circle within 8 m)', () => {
    const ruins = map('seal_ruins');
    const live = liveMap(ruins, {});
    const wake = centre(at(ruins, 'wake_point'));
    const monster = (ref: string) => content.monsters.find((x) => x.id === ref);
    const circles = alertCircles(ruins, actFlags(1), (ref) => monster(ref));
    expect(circles.length).toBeGreaterThan(0);
    expect(firstContact(live, [wake], circles)).toBeGreaterThanOrEqual(FLOW_TARGETS.firstContact);
    // aggro reads distance, not walls: no circle reaches into the eight metres either
    for (const c of circles)
      expect(Math.hypot(c.x - wake.x, c.y - wake.y) - c.r, c.spawnId).toBeGreaterThanOrEqual(
        FLOW_TARGETS.firstContact,
      );
  });

  it('opens the ruins gate hall once Ash is met, so the ruins never shut for good', () => {
    const ruins = map('seal_ruins');
    const wake = centre(at(ruins, 'wake_point'));
    const gate = ruins.exits.find((e) => e.toMap === 'borderstone_north');
    const out = { x: (gate?.x ?? 0) + 0.5, y: (gate?.y ?? 0) + 0.5 };
    expect(reachable(liveMap(ruins, { a1_ash_met: true }), out, wake)).toBe(true);
    // the old mine stairs open with the one-night quest, and the exit says so too
    const mine = map('rustridge_mine');
    const stairs = mine.exits.find((e) => e.toMap === 'dg_old_mine');
    expect(stairs?.requiresFlags).toEqual(['quest.q_a1_m06_mine']);
    const from = centre(at(mine, 'mine_antechamber'));
    const to = { x: (stairs?.x ?? 0) + 0.5, y: (stairs?.y ?? 0) + 0.5 };
    expect(reachable(liveMap(mine, { 'quest.q_a1_m06_mine': 'active' }), from, to)).toBe(true);
    expect(reachable(liveMap(mine, { 'quest.q_a1_m06_mine': 'done' }), from, to)).toBe(true);
  });

  it('lets the shaft and the vent shaft out only after their bosses', () => {
    const depths = map('seal_ruins_depths');
    const vent = map('dg_old_mine');
    expect(depths.exits.find((e) => e.id === 'to_shaft_top')?.requiresFlags).toEqual([
      'boss.guardian_raven.defeated',
    ]);
    expect(vent.exits.find((e) => e.id === 'to_mine_vent')?.requiresFlags).toEqual([
      'boss.crystal_mother.defeated',
    ]);
    // after the raven the climb out comes first, so a route out of the depths takes the shaft
    expect(depths.exits[0]?.id).toBe('to_shaft_top');
  });
});

type DiscoveryKind = 'map' | 'landmark' | 'vista' | 'secret';
interface Discovery {
  kind: DiscoveryKind;
  act?: number;
}
const discoveryOf = (l: LocationDef): Discovery | undefined =>
  (l as LocationDef & { discovery?: Discovery }).discovery;

describe('discovery points (map_briefs.md 1.5, 15 rule 5; travel_and_exploration.md 6.2, 6.3)', () => {
  const firstAct = (id: string) =>
    Math.min(...(content.atlas_maps.find((a) => a.id === id)?.acts ?? [0]));

  it('marks only the four map kinds, on act maps, never on divine, private or stage maps', () => {
    for (const m of content.maps) {
      const points = m.locations.filter((l) => discoveryOf(l));
      const role = content.atlas_maps.find((a) => a.id === m.id)?.role;
      if (role === 'stage' || role === 'private' || role === 'battle')
        expect(
          points.map((l) => l.id),
          m.id,
        ).toEqual([]);
      for (const l of points) {
        const d = discoveryOf(l) as Discovery;
        expect(['map', 'landmark', 'vista', 'secret'], `${m.id}.${l.id}`).toContain(d.kind);
        if (d.act !== undefined) expect(d.act, `${m.id}.${l.id}`).toBeGreaterThan(firstAct(m.id));
      }
      // one map point per map at most
      expect(points.filter((l) => discoveryOf(l)?.kind === 'map').length, m.id).toBeLessThanOrEqual(
        1,
      );
    }
  });

  it('adds up to the act table of travel_and_exploration.md 6.3 for act 1', () => {
    const tally: Record<number, Record<DiscoveryKind, number>> = {};
    for (const id of M1_IDS) {
      for (const l of map(id).locations) {
        const d = discoveryOf(l);
        if (!d) continue;
        const act = d.act ?? firstAct(id);
        tally[act] ??= { map: 0, landmark: 0, vista: 0, secret: 0 };
        (tally[act] as Record<DiscoveryKind, number>)[d.kind]++;
      }
    }
    expect(tally[1]).toEqual({ map: 10, landmark: 29, vista: 3, secret: 7 });
    // the act 1 maps' points that open later (the grey hamlets, the ashwood, the hill spring,
    // the rim crest and the restored tower in act 2; the hollow stone rift in act 3)
    expect(tally[2]).toEqual({ map: 0, landmark: 4, vista: 2, secret: 1 });
    expect(tally[3]).toEqual({ map: 0, landmark: 0, vista: 0, secret: 1 });
  });
});

describe('local sediment hot spots (map_briefs.md 1.2 and the act 1 briefs)', () => {
  it('pins every hot spot of the M1 maps', () => {
    const spots: Record<string, number> = {};
    for (const id of M1_IDS)
      for (const l of map(id).locations)
        if (l.sediment !== undefined) spots[`${id}.${l.id}`] = l.sediment;
    expect(spots).toEqual({
      'borderstone.north_spring': 2,
      // the west field's old granary holds the furrow rat queen's nest (PK-M1-30; nests need two)
      'borderstone.old_granary': 2,
      'borderstone_north.south_of_line': 1,
      'seal_ruins.sigil_hall': 2,
      'seal_ruins.corridor': 3,
      'seal_ruins.ash_stairs': 3,
      'forest_edge.deep_woods': 2,
      'ironhemlock_deep.glowcap_grove': 3,
      'ash_waste.crystal_gully': 3,
      'ash_waste.ashwood_heart': 3,
      'dg_old_mine.crystal_vein': 3,
    });
  });

  it('reads the hot spot where it lies and the map grade elsewhere (sedimentAt)', () => {
    const town = map('borderstone');
    const spring = centre(at(town, 'north_spring'));
    expect(sedimentAt(town, spring.x, spring.y)).toBe(2);
    expect(sedimentAt(town, ...xy(centre(at(town, 'plaza'))))).toBe(1);
    const ruins = map('seal_ruins');
    // the wake point lies in the sigil hall: the hall's own grade wins over the corridor's
    expect(sedimentAt(ruins, ...xy(centre(at(ruins, 'wake_point'))))).toBe(2);
    expect(sedimentAt(ruins, 22.5, 17.5)).toBe(3);
    const north = map('borderstone_north');
    expect(sedimentAt(north, 64.5, 20.5)).toBe(2);
    expect(sedimentAt(north, 64.5, 80.5)).toBe(1);
  });
});
const xy = (p: { x: number; y: number }): [number, number] => [p.x, p.y];

describe('the earth stages carry the door and its corners (prologue P2; PK-M1-54)', () => {
  /** the start, the door's first place and the brief's start-to-door distance in metres */
  const STAGES: Record<string, [string, string, number]> = {
    earth_train: ['seat', 'car_door', 3],
    earth_store: ['counter', 'freezer', 8],
    earth_hospital: ['chairs', 'exit_sign', 4],
    earth_house: ['old_chair', 'wardrobe', 5],
  };
  for (const [id, [start, door, metres]] of Object.entries(STAGES)) {
    it(id, () => {
      const m = map(id);
      const tagged = (tag: string) => m.locations.filter((l) => l.tags?.includes(tag));
      expect(tagged('stage_door').map((l) => l.id)).toEqual([door]);
      const corners = [0, 1, 2, 3].map((n) => tagged(`door_corner:${n}`).map((l) => l.id));
      expect(corners.every((c) => c.length === 1)).toBe(true);
      expect(corners[0]).toEqual([door]);
      expect(tagged('stage_start').map((l) => l.id)).toContain(start);
      const a = centre(at(m, start));
      const b = centre(at(m, door));
      expect(Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - metres), 'start to door').toBeLessThan(
        1.5,
      );
      expect(m.exits).toEqual([]);
      expect(m.spawns).toEqual([]);
    });
  }
});

describe('the act 1 dungeons sit on these maps (catalog_dungeons_bosses.md 3.1)', () => {
  const dungeon = (id: string) => content.dungeons?.find((d) => d.id === id);

  it('puts the ruins gate on the stair slope below them', () => {
    expect(dungeon('dg_seal_ruins')?.gate).toEqual({
      mapId: 'borderstone_north',
      location: 'gate_seal_ruins',
    });
  });

  it('lays the old mine over the mine gallery and the old workings below the collapse', () => {
    const mine = map('rustridge_mine');
    const old = map('dg_old_mine');
    expect(
      floorAt(content, 'rustridge_mine', ...xy(centre(at(mine, 'gallery_head'))))?.floor.id,
    ).toBe('upper');
    expect(floorAt(content, 'rustridge_mine', ...xy(centre(at(mine, 'mine_antechamber'))))).toBe(
      undefined,
    );
    const lower = floorAt(content, 'dg_old_mine', ...xy(centre(at(old, 'mother_nest'))));
    expect([lower?.dungeon.id, lower?.floor.id, lower?.floor.boss]).toEqual([
      'dg_old_mine',
      'lower',
      'crystal_mother',
    ]);
  });

  it('keeps the Drunk Moon cellar as an indoor layer of the town, entered from the inn', () => {
    const town = map('borderstone');
    const cellar = at(town, 'moon_cellar');
    const hit = floorAt(content, 'borderstone', ...xy(centre(cellar)));
    expect([hit?.dungeon.id, hit?.floor.id]).toEqual(['dg_moon_cellar', 'cellar']);
    expect(floorAt(content, 'borderstone', ...xy(centre(at(town, 'plaza'))))).toBe(undefined);
    // the cellar stairs stand inside the inn, the cellar itself is off the town's walks
    const stairs = centre(at(town, 'moon_cellar_stairs'));
    const inn = at(town, 'drunk_moon');
    expect(
      stairs.x >= inn.x &&
        stairs.x <= inn.x + inn.w &&
        stairs.y >= inn.y &&
        stairs.y <= inn.y + inn.h,
    ).toBe(true);
    const walks = walkDistances(town, entrances(content.maps, town));
    const c = centre(cellar);
    expect(walks[Math.floor(c.y) * town.width + Math.floor(c.x)]).toBe(Number.POSITIVE_INFINITY);
  });
});

interface Shift {
  mapId: string;
  from: [number, number];
  to: [number, number];
  dx: number;
  dy: number;
  anchors: Record<string, [number, number, number, number]>;
}
const SHIFTS = (shiftData as unknown as { shifts: Shift[] }).shifts;

describe('the extended maps keep their old ground under a shift (map_briefs.md 1.11)', () => {
  it('lists the eight extended maps with their brief shifts, and the anchors moved by them', () => {
    expect(Object.fromEntries(SHIFTS.map((s) => [s.mapId, [s.dx, s.dy]]))).toEqual({
      divine_court: [4, 4],
      inner_court: [12, 10],
      borderstone: [20, 18],
      seal_ruins: [14, 8],
      seal_ruins_depths: [9, 8],
      forest_edge: [0, 24],
      ash_waste: [40, 72],
      old_outpost: [24, 20],
    });
    for (const s of SHIFTS) {
      const m = map(s.mapId);
      expect([m.width, m.height], s.mapId).toEqual(s.to);
      expect(s.to[0] >= s.from[0] + s.dx && s.to[1] >= s.from[1] + s.dy, s.mapId).toBe(true);
      for (const [id, [x, y, w, h]] of Object.entries(s.anchors)) {
        const l = at(m, id);
        expect([l.x, l.y, l.w, l.h], `${s.mapId}.${id}`).toEqual([x + s.dx, y + s.dy, w, h]);
      }
    }
  });

  it('moves every entity of the frozen saves onto walkable ground of the extended maps', () => {
    const dir = join(__dirname, 'fixtures', 'saves', 'v1');
    const byMap = new Map(SHIFTS.map((s) => [s.mapId, s]));
    let moved = 0;
    for (const f of ['prologue', 'act1', 'act2', 'act3', 'act4', 'act5', 'act6']) {
      const file = JSON.parse(gunzipSync(readFileSync(join(dir, `${f}.hks`))).toString('utf8')) as {
        world: {
          slices: { world: { entities: Record<string, { mapId: string; x: number; y: number }> } };
        };
      };
      for (const [id, e] of Object.entries(file.world.slices.world.entities)) {
        const s = byMap.get(e.mapId);
        if (!s) continue;
        const m = map(e.mapId);
        const x = Math.floor(e.x + s.dx);
        const y = Math.floor(e.y + s.dy);
        expect(isWalkableTile(m, x, y), `${f}: ${id} on ${e.mapId} (${e.x}, ${e.y})`).toBe(true);
        moved++;
      }
    }
    expect(moved).toBeGreaterThan(300);
  });
});

describe('the brief ids the content packages read stay put', () => {
  it('keeps the arrivals other maps and the dungeon records name', () => {
    const want: Record<string, string[]> = {
      borderstone: [
        'gate_seal_ruins',
        'gate_borderstone_north_w',
        'gate_forest_edge',
        'gate_old_outpost',
        'gate_wallenburg',
      ],
      borderstone_north: [
        'gate_borderstone',
        'gate_borderstone_w',
        'gate_seal_ruins',
        'gate_rustridge_mine',
        'gate_brokenspan_post',
      ],
      seal_ruins: ['gate_borderstone', 'gate_seal_ruins_depths', 'shaft_top', 'wake_point'],
      forest_edge: ['gate_borderstone', 'gate_ironhemlock_deep'],
      ash_waste: ['gate_old_outpost', 'gate_brokenspan_post'],
    };
    for (const [id, locs] of Object.entries(want))
      for (const l of locs) expect(at(map(id), l).id).toBe(l);
  });
});
