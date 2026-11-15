// The world atlas (docs/40_design/world/world_map.md): the registry of built and planned
// maps, regions and routes, and its pure validator atlasProblems. A small fixture pins every
// rule both ways (valid, then one decisive mutation per rule); the real content must pass.

import { describe, expect, it } from 'vitest';
import { allSchemas, buildContent, validateContent } from '../src/content';
import { pack as inventoryPack } from '../src/content/packs/inventory';
import { pack as strategyPack } from '../src/content/packs/strategy';
import { pack as warfarePack } from '../src/content/packs/warfare';
import { pack as worldPack } from '../src/content/packs/world';
import {
  type AtlasInput,
  type AtlasMapDef,
  type AtlasRegionDef,
  type AtlasRouteDef,
  atlasProblems,
} from '../src/systems/world/atlas';

// ---------------------------------------------------------------------------
// Fixture: a realm with the prologue hall, one region with a town, a cave, a battle and a
// planned field that act 2 reaches over the world map (provinces p1 and p2 are linked).

interface Fixture {
  regions: AtlasRegionDef[];
  maps: AtlasMapDef[];
  routes: AtlasRouteDef[];
  contentMaps: {
    id: string;
    width: number;
    height: number;
    exits: { id: string; toMap: string }[];
  }[];
  provinces?: { id: string; region: string }[];
  links?: { a: string; b: string }[];
  scenarios?: { id: string; width: number; height: number }[];
}

function fixture(): Fixture {
  return {
    regions: [
      { id: 'land', name: '大陆', tier: 'continent', acts: [2] },
      {
        id: 'home',
        name: '家乡',
        tier: 'region',
        parent: 'land',
        slgRegion: 'r1',
        acts: [1, 2],
        style: 'lothar_plain',
        sediment: [1, 3],
      },
      {
        id: 'void',
        name: '神域',
        tier: 'realm',
        acts: [0],
        style: 'divine_court',
        sediment: [0, 0],
      },
    ],
    maps: [
      {
        id: 'hall',
        code: 'P0',
        name: '候见厅',
        tier: 'scene',
        role: 'stage',
        status: 'built',
        region: 'void',
        acts: [0],
        hubOf: [0],
        sediment: 0,
        size: [4, 4],
      },
      {
        id: 'town',
        code: 'A1',
        name: '镇',
        tier: 'tile',
        role: 'hub',
        status: 'built',
        region: 'home',
        province: 'p1',
        acts: [1, 2],
        hubOf: [1, 2],
        sediment: 1,
        size: [10, 8],
      },
      {
        id: 'cave',
        code: 'A2',
        name: '洞',
        tier: 'scene',
        role: 'dungeon',
        status: 'built',
        region: 'home',
        province: 'p1',
        acts: [1, 2],
        style: 'sealed_ruins',
        sediment: 3,
        size: [6, 6],
      },
      {
        id: 'field',
        code: 'A3',
        name: '野',
        tier: 'tile',
        role: 'field',
        status: 'planned',
        region: 'home',
        province: 'p2',
        acts: [2],
        sediment: 2,
        size: [96, 96],
      },
      {
        id: 'fight',
        code: 'A1-1',
        name: '战',
        tier: 'scene',
        role: 'battle',
        status: 'scenario',
        region: 'home',
        acts: [1],
        sediment: 1,
        size: [8, 5],
        scenario: 'war1',
      },
    ],
    routes: [
      {
        id: 'down',
        from: 'town',
        to: 'cave',
        layer: 'tile',
        kind: 'passage',
        acts: [1, 2],
        fromExit: 'down',
        toExit: 'up',
        status: 'built',
      },
      {
        id: 'call',
        from: 'town',
        to: 'fight',
        layer: 'event',
        kind: 'battle',
        acts: [1],
        status: 'built',
      },
    ],
    contentMaps: [
      { id: 'town', width: 10, height: 8, exits: [{ id: 'down', toMap: 'cave' }] },
      { id: 'cave', width: 6, height: 6, exits: [{ id: 'up', toMap: 'town' }] },
      { id: 'hall', width: 4, height: 4, exits: [] },
      { id: 'testfield', width: 20, height: 12, exits: [] },
    ],
    provinces: [
      { id: 'p1', region: 'r1' },
      { id: 'p2', region: 'r1' },
    ],
    links: [{ a: 'p1', b: 'p2' }],
    scenarios: [{ id: 'war1', width: 8, height: 5 }],
  };
}

const run = (f: Fixture): string[] => atlasProblems(f as AtlasInput);
const mapOf = (f: Fixture, id: string): AtlasMapDef =>
  f.maps.find((m) => m.id === id) as AtlasMapDef;
const routeOf = (f: Fixture, id: string): AtlasRouteDef =>
  f.routes.find((r) => r.id === id) as AtlasRouteDef;
const regionOf = (f: Fixture, id: string): AtlasRegionDef =>
  f.regions.find((r) => r.id === id) as AtlasRegionDef;

/** Problems after one mutation of a fresh fixture. */
function after(mutate: (f: Fixture) => void): string[] {
  const f = fixture();
  mutate(f);
  return run(f);
}

describe('atlasProblems on the fixture', () => {
  it('accepts the valid fixture, with testfield exempt', () => {
    expect(run(fixture())).toEqual([]);
  });

  describe('built entries match the content maps one to one', () => {
    it('flags a content map without an entry', () => {
      expect(
        after((f) => f.contentMaps.push({ id: 'orphan', width: 3, height: 3, exits: [] })),
      ).toContain('atlas: content map orphan has no atlas entry');
    });
    it('flags a built entry that no content map backs', () => {
      expect(after((f) => f.contentMaps.splice(2, 1))).toContain(
        'atlas_map hall: marked built but no content map has this id',
      );
    });
    it('flags a content map whose entry is still planned', () => {
      expect(
        after((f) => f.contentMaps.push({ id: 'field', width: 96, height: 96, exits: [] })),
      ).toContain('atlas_map field: exists in content but is marked planned');
    });
    it('flags a built size that differs from the map', () => {
      expect(after((f) => (mapOf(f, 'cave').size = [7, 6]))).toContain(
        'atlas_map cave: size 7x6 != map 6x6',
      );
    });
    it('skips the content checks when no content maps are given', () => {
      expect(
        after((f) => {
          mapOf(f, 'cave').size = [7, 6];
          (f as { contentMaps?: unknown }).contentMaps = undefined;
        }),
      ).toEqual([]);
    });
  });

  describe('every exit of a built map is cited by a route', () => {
    it('flags an exit no route cites', () => {
      expect(after((f) => f.contentMaps[0]?.exits.push({ id: 'side', toMap: 'hall' }))).toContain(
        'atlas: exit town.side -> hall is not cited by any atlas route',
      );
    });
    it('flags a cited exit that does not exist', () => {
      const p = after((f) => (routeOf(f, 'down').fromExit = 'nope'));
      expect(p).toContain('atlas_route down: from exit town.nope does not exist');
      expect(p).toContain('atlas: exit town.down -> cave is not cited by any atlas route');
    });
    it('flags a cited exit that leads somewhere else', () => {
      expect(
        after((f) => {
          const cave = f.contentMaps[1];
          if (cave) cave.exits = [{ id: 'up', toMap: 'hall' }];
        }),
      ).toContain('atlas_route down: to exit cave.up leads to hall');
    });
    it('does not let a one-way route cover the way back', () => {
      expect(after((f) => (routeOf(f, 'down').oneWay = true))).toContain(
        'atlas: exit cave.up -> town is not cited by any atlas route',
      );
    });
    it('requires a built tile route to cite both exits', () => {
      const p = after((f) => {
        routeOf(f, 'down').toExit = undefined;
      });
      expect(p).toContain('atlas_route down: a built two-way route must cite the way back');
    });
    it('refuses exits on a route whose end is not built', () => {
      expect(
        after((f) =>
          f.routes.push({
            id: 'odd',
            from: 'town',
            to: 'field',
            layer: 'tile',
            kind: 'road',
            acts: [2],
            fromExit: 'down',
            status: 'planned',
          }),
        ),
      ).toContain('atlas_route odd: cites exits but an end is not a built map');
    });
  });

  describe('style packs', () => {
    it('flags an unknown pack on a map and on a region', () => {
      const p = after((f) => {
        mapOf(f, 'cave').style = 'pastel' as never;
        regionOf(f, 'void').style = 'gilded' as never;
      });
      expect(p).toContain("atlas_map cave: unknown style pack 'pastel'");
      expect(p).toContain("atlas_region void: unknown style pack 'gilded'");
    });
    it('needs a pack or a planned pack on the map or its region', () => {
      const p = after((f) => {
        regionOf(f, 'home').style = undefined;
      });
      expect(p).toContain(
        'atlas_map town: no style pack and no planned one, on the map or its region',
      );
      expect(p).not.toContain(
        'atlas_map cave: no style pack and no planned one, on the map or its region',
      );
      expect(
        after((f) => {
          regionOf(f, 'home').style = undefined;
          regionOf(f, 'home').stylePlan = 'home_plan';
        }),
      ).toEqual([]);
    });
  });

  describe('references exist', () => {
    it('flags an unknown region, map, parent, province and scenario', () => {
      expect(after((f) => (mapOf(f, 'field').region = 'nowhere'))).toContain(
        "atlas_map field: unknown region 'nowhere'",
      );
      expect(after((f) => (routeOf(f, 'down').to = 'ghost'))).toContain(
        "atlas_route down: unknown map 'ghost'",
      );
      expect(after((f) => (regionOf(f, 'home').parent = 'moon'))).toContain(
        "atlas_region home: unknown parent region 'moon'",
      );
      expect(after((f) => (mapOf(f, 'field').province = 'p9'))).toContain(
        "atlas_map field: unknown province 'p9'",
      );
      expect(after((f) => (mapOf(f, 'fight').scenario = 'war9'))).toContain(
        "atlas_map fight: unknown battle scenario 'war9'",
      );
      expect(after((f) => (regionOf(f, 'home').slgRegion = 'r9'))).toContain(
        "atlas_region home: unknown continent region 'r9'",
      );
    });
    it('flags a province that lies in another continent region', () => {
      expect(
        after(
          (f) =>
            (f.provinces = [
              { id: 'p1', region: 'r1' },
              { id: 'p2', region: 'r2' },
            ]),
        ),
      ).toContain('atlas_map field: province p2 lies in r2, region home is r1');
    });
    it('flags a battle grid whose size differs from the scenario', () => {
      expect(after((f) => (mapOf(f, 'fight').size = [9, 5]))).toContain(
        'atlas_map fight: size 9x5 != scenario 8x5',
      );
    });
    it('keeps scenario ids on scenario entries only', () => {
      expect(after((f) => (mapOf(f, 'fight').status = 'planned'))).toContain(
        'atlas_map fight: scenario id on a planned entry',
      );
      expect(after((f) => (mapOf(f, 'cave').status = 'scenario'))).toContain(
        'atlas_map cave: only a battle can be a scenario entry',
      );
    });
  });

  describe('codes', () => {
    it('flags a duplicate code', () => {
      expect(after((f) => (mapOf(f, 'field').code = 'A1'))).toContain(
        'atlas_map field: code A1 already used by town',
      );
    });
    it('flags a malformed code or covered code', () => {
      expect(after((f) => (mapOf(f, 'field').code = 'Z9'))).toContain(
        "atlas_map field: bad code 'Z9'",
      );
      expect(after((f) => (mapOf(f, 'field').covers = ['A3', 'B 4']))).toContain(
        "atlas_map field: bad covered code 'B 4'",
      );
    });
  });

  describe('every act is reachable from its hub', () => {
    it('flags a map no route reaches', () => {
      expect(
        after((f) =>
          f.maps.push({
            ...(mapOf(f, 'field') as AtlasMapDef),
            id: 'lost',
            code: 'A4',
            tier: 'scene',
            acts: [1],
          }),
        ),
      ).toContain('atlas act 1: lost unreachable from hub town');
    });
    it('follows one-way routes in their direction only', () => {
      const pit = (f: Fixture, from: string, to: string) => {
        f.maps.push({
          ...(mapOf(f, 'cave') as AtlasMapDef),
          id: 'pit',
          code: 'A5',
          status: 'planned',
          acts: [1],
        });
        f.routes.push({
          id: 'drop',
          from,
          to,
          layer: 'tile',
          kind: 'passage',
          acts: [1],
          oneWay: true,
          status: 'planned',
        });
      };
      expect(after((f) => pit(f, 'pit', 'town'))).toContain(
        'atlas act 1: pit unreachable from hub town',
      );
      expect(after((f) => pit(f, 'town', 'pit'))).toEqual([]);
    });
    it('needs exactly one hub per act', () => {
      expect(after((f) => (mapOf(f, 'town').hubOf = [2]))).toContain(
        'atlas act 1: expected one hub, found 0',
      );
      expect(after((f) => (mapOf(f, 'cave').hubOf = [1]))).toContain(
        'atlas act 1: expected one hub, found 2',
      );
    });
    it('reaches tiles over the world map only in its acts and along province links', () => {
      expect(after((f) => (regionOf(f, 'land').acts = [1]))).toContain(
        'atlas act 2: field unreachable from hub town',
      );
      expect(after((f) => (f.links = []))).toContain(
        'atlas act 2: field unreachable from hub town',
      );
      // Without the link table every province-bearing tile shares one world node.
      expect(after((f) => (f.links = undefined))).toEqual([]);
    });
    it('does not enter scenes from the world map', () => {
      expect(
        after((f) => {
          mapOf(f, 'field').tier = 'scene';
        }),
      ).toContain('atlas act 2: field unreachable from hub town');
    });
  });

  describe('routes and acts', () => {
    it('keeps a route inside the acts of both ends', () => {
      expect(after((f) => (routeOf(f, 'call').acts = [1, 2]))).toContain(
        'atlas_route call: open in act 2 but fight is not',
      );
    });
    it('keeps a map inside its region acts and its hub acts inside its own', () => {
      expect(after((f) => (mapOf(f, 'cave').acts = [0, 1, 2]))).toContain(
        'atlas_map cave: act 0 not in region home',
      );
      expect(after((f) => (mapOf(f, 'cave').hubOf = [3]))).toContain(
        'atlas_map cave: hub of act 3 but not playable in it',
      );
      expect(after((f) => (mapOf(f, 'cave').acts = [1, 1, 9]))).toEqual(
        expect.arrayContaining([
          'atlas_map cave: act 1 listed twice',
          'atlas_map cave: act 9 outside 0..7',
        ]),
      );
    });
    it('allows only the kinds of a layer', () => {
      expect(after((f) => (routeOf(f, 'down').kind = 'gate'))).toContain(
        "atlas_route down: kind 'gate' not allowed on layer tile",
      );
    });
    it('needs km and a travel time on a region leg', () => {
      const p = after((f) =>
        f.routes.push({
          id: 'leg',
          from: 'town',
          to: 'field',
          layer: 'region',
          kind: 'road',
          acts: [2],
          status: 'planned',
        }),
      );
      expect(p).toContain('atlas_route leg: a region leg needs its km');
      expect(p).toContain('atlas_route leg: a region leg needs a travel time');
    });
    it('flags unknown event tags and travel modes', () => {
      const p = after((f) => {
        const r = routeOf(f, 'down');
        r.events = ['dragons' as never];
        r.hours = { walk: 1, fly: 2 } as never;
      });
      expect(p).toContain("atlas_route down: unknown event tag 'dragons'");
      expect(p).toContain("atlas_route down: unknown travel mode 'fly'");
    });
    it('enters battles by event routes only', () => {
      expect(after((f) => (routeOf(f, 'call').to = 'cave'))).toContain(
        'atlas_route call: an event route must lead to a battle',
      );
      expect(
        after((f) => {
          const r = routeOf(f, 'call');
          r.layer = 'tile';
          r.kind = 'road';
        }),
      ).toContain('atlas_route call: a battle is entered by an event route');
    });
  });

  describe('regions and grades', () => {
    it('needs exactly one continent and a continent parent for regions', () => {
      expect(
        after((f) => f.regions.push({ id: 'land2', name: '另一片', tier: 'continent', acts: [2] })),
      ).toContain('atlas: expected exactly one continent region, found 2');
      expect(after((f) => (regionOf(f, 'home').parent = undefined))).toContain(
        'atlas_region home: a region needs the continent as parent',
      );
    });
    it('keeps a map sediment inside its region band and on the 0..5 scale', () => {
      expect(after((f) => (mapOf(f, 'field').sediment = 4))).toContain(
        'atlas_map field: sediment 4 outside region band [1, 3]',
      );
      expect(after((f) => (mapOf(f, 'field').sediment = 7))).toContain(
        'atlas_map field: sediment 7 outside 0..5',
      );
    });
  });
});

// ---------------------------------------------------------------------------
// The real content.

const content = buildContent();

describe('the real atlas', () => {
  it('passes the validator with every cross check on', () => {
    expect(
      atlasProblems({
        regions: content.atlas_regions,
        maps: content.atlas_maps,
        routes: content.atlas_routes,
        contentMaps: content.maps,
        provinces: content.slg_provinces,
        links: content.slg_links,
        scenarios: content.battle_scenarios,
      }),
    ).toEqual([]);
    expect(validateContent(content).filter((p) => p.startsWith('atlas'))).toEqual([]);
  });

  it('lists exactly the built maps of the first round, testfield excepted', () => {
    const built = content.atlas_maps.filter((m) => m.status === 'built');
    expect(Object.fromEntries(built.map((m) => [m.id, m.code]))).toEqual({
      divine_court: 'P0',
      inner_court: 'X1',
      borderstone: 'A1',
      seal_ruins: 'A3',
      seal_ruins_depths: 'A4',
      forest_edge: 'A6',
      ash_waste: 'A9',
      old_outpost: 'A10',
      wallenburg: 'B1',
      wallenburg_sewers: 'B6',
    });
    expect(content.atlas_maps.some((m) => m.id === 'testfield')).toBe(false);
  });

  it('links each battle grid to its scenario', () => {
    const grids = content.atlas_maps.filter((m) => m.status === 'scenario');
    expect(Object.fromEntries(grids.map((m) => [m.id, m.scenario]))).toEqual({
      wallenburg_harbor_battle: 'act2_city_defense',
      bonefield_battle: 'act3_bone_field',
      frostridge_battle: 'act3_north_raid',
      reedbridge_battle: 'act3_ash_line',
      ashen_final_battle: 'act5_final_war',
    });
  });

  it('names one hub for every act from the prologue to the epilogue', () => {
    const hubs: Record<number, string> = {};
    for (const m of content.atlas_maps) for (const a of m.hubOf ?? []) hubs[a] = m.id;
    expect(hubs).toEqual({
      0: 'divine_court',
      1: 'borderstone',
      2: 'wallenburg',
      3: 'borderstone',
      4: 'borderstone',
      5: 'borderstone',
      6: 'divine_court',
      7: 'maker_room',
    });
  });

  it('keeps the world pack valid in partial builds without story maps', () => {
    const packs = [inventoryPack, strategyPack, warfarePack, worldPack];
    expect(worldPack.validate?.(buildContent(packs))).toEqual([]);
  });

  it('declares every atlas field in the editor schemas', () => {
    const schemas = allSchemas().filter((s) => s.table.startsWith('atlas_'));
    expect(schemas.map((s) => [s.table, s.file])).toEqual([
      ['atlas_regions', 'world/atlas_regions.json'],
      ['atlas_maps', 'world/atlas_maps.json'],
      ['atlas_routes', 'world/atlas_routes.json'],
    ]);
    for (const s of schemas) {
      const keys = new Set(s.fields.map((f) => f.key));
      const rows = (content as unknown as Record<string, Record<string, unknown>[]>)[s.table] ?? [];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows)
        for (const k of Object.keys(row)) expect(keys.has(k), `${s.table}.${k}`).toBe(true);
    }
  });
});
