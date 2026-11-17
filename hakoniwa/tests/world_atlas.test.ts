// The world atlas (docs/40_design/world/world_map.md): the registry of built and planned
// maps, regions and routes, and its pure validator atlasProblems. A small fixture pins every
// rule both ways (valid, then one decisive mutation per rule); the real content must pass.

import { describe, expect, it } from 'vitest';
import { allSchemas, buildContent, validateContent } from '../src/content';
import { pack as inventoryPack } from '../src/content/packs/inventory';
import { pack as strategyPack } from '../src/content/packs/strategy';
import { pack as warfarePack } from '../src/content/packs/warfare';
import { pack as worldPack } from '../src/content/packs/world';
import { isAtlasExempt, styleOf } from '../src/systems/world';
import {
  type AtlasContentMap,
  type AtlasInput,
  type AtlasMapDef,
  type AtlasRegionDef,
  type AtlasRouteDef,
  atlasProblems,
  isCutsceneStage,
} from '../src/systems/world/atlas';

// ---------------------------------------------------------------------------
// Fixture: a realm with the prologue hall, one region with a town, a cave, a battle and a
// planned field that act 2 reaches over the world map (provinces p1 and p2 are linked).

interface Fixture {
  regions: AtlasRegionDef[];
  maps: AtlasMapDef[];
  routes: AtlasRouteDef[];
  contentMaps: (AtlasContentMap & { exits: { id: string; toMap: string }[] })[];
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
        battleSky: 'art_bg_battle_war1',
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
      {
        id: 'town',
        region: 'home',
        sediment: 1,
        style: 'lothar_plain',
        width: 10,
        height: 8,
        exits: [{ id: 'down', toMap: 'cave' }],
      },
      {
        id: 'cave',
        region: 'home',
        sediment: 3,
        style: 'sealed_ruins',
        width: 6,
        height: 6,
        exits: [{ id: 'up', toMap: 'town' }],
      },
      {
        id: 'hall',
        region: 'void',
        sediment: 0,
        indoor: true,
        style: 'divine_court',
        width: 4,
        height: 4,
        exits: [],
      },
      { id: 'testfield', region: 'test', width: 20, height: 12, exits: [], atlasExempt: true },
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
        after((f) =>
          f.contentMaps.push({ id: 'orphan', region: 'home', width: 3, height: 3, exits: [] }),
        ),
      ).toContain('atlas: content map orphan has no atlas entry');
    });
    it('flags a built entry that no content map backs', () => {
      expect(after((f) => f.contentMaps.splice(2, 1))).toContain(
        'atlas_map hall: marked built but no content map has this id',
      );
    });
    it('flags a content map whose entry is still planned', () => {
      expect(
        after((f) =>
          f.contentMaps.push({ id: 'field', region: 'home', width: 96, height: 96, exits: [] }),
        ),
      ).toContain('atlas_map field: exists in content but is marked planned');
    });
    it('holds the map document to the entry: region, sediment, style pack (map_briefs 15)', () => {
      const cave = (f: Fixture) => f.contentMaps.find((c) => c.id === 'cave') as AtlasContentMap;
      expect(after((f) => ((cave(f) as { region: string }).region = 'borderstone_wilds'))).toEqual([
        "atlas_map cave: map region 'borderstone_wilds' != atlas region 'home'",
      ]);
      expect(after((f) => ((cave(f) as { sediment?: number }).sediment = 4))).toEqual([
        'atlas_map cave: map sediment 4 != atlas sediment 3',
      ]);
      expect(after((f) => ((cave(f) as { sediment?: number }).sediment = undefined))).toEqual([
        'atlas_map cave: map sediment undefined != atlas sediment 3',
      ]);
      // the cave's entry names sealed_ruins: a map without it paints its region's pack
      expect(after((f) => ((cave(f) as { style?: string }).style = undefined))).toEqual([
        "atlas_map cave: map is painted with 'lothar_plain', atlas wants 'sealed_ruins'",
      ]);
      // an entry without a style holds the map to its region's pack
      expect(after((f) => ((f.contentMaps[0] as { style?: string }).style = 'ash_waste'))).toEqual([
        "atlas_map town: map is painted with 'ash_waste', atlas wants 'lothar_plain'",
      ]);
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

  describe('sky packs and battle far layers (map_briefs 1.7)', () => {
    it('accepts an outdoor pack or a special sky and flags anything else', () => {
      expect(after((f) => (mapOf(f, 'field').sky = 'valen_city'))).toEqual([]);
      expect(after((f) => (mapOf(f, 'hall').sky = 'earth_night_city'))).toEqual([]);
      expect(after((f) => (mapOf(f, 'cave').sky = 'sealed_ruins' as never))).toEqual([
        "atlas_map cave: unknown sky pack 'sealed_ruins'",
      ]);
    });
    it('needs an art_bg_battle_ far layer on every battle and a well-formed one anywhere', () => {
      expect(after((f) => (mapOf(f, 'fight').battleSky = undefined))).toEqual([
        'atlas_map fight: a battle map needs its battleSky',
      ]);
      expect(after((f) => (mapOf(f, 'fight').battleSky = 'art_bg_war1'))).toEqual([
        "atlas_map fight: battleSky 'art_bg_war1' is not an art_bg_battle_ asset id",
      ]);
      // a ring node's map carries one for its node battle
      expect(after((f) => (mapOf(f, 'field').battleSky = 'art_bg_battle_ring_r09'))).toEqual([]);
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
    it('skips cutscene stages: no hub, no route, entered by a cutscene teleport only', () => {
      const stage = (f: Fixture) =>
        f.maps.push({
          ...(mapOf(f, 'hall') as AtlasMapDef),
          id: 'dream',
          code: 'X4',
          status: 'planned',
          hubOf: undefined,
          acts: [0],
        });
      expect(after(stage)).toEqual([]);
      // a stage a route touches is a place like any other and must be reachable
      expect(
        after((f) => {
          stage(f);
          f.maps.push({
            ...(mapOf(f, 'hall') as AtlasMapDef),
            id: 'nook',
            code: 'P9',
            status: 'planned',
            hubOf: undefined,
            acts: [0],
          });
          f.routes.push({
            id: 'peek',
            from: 'dream',
            to: 'nook',
            layer: 'tile',
            kind: 'passage',
            acts: [0],
            status: 'planned',
          });
        }),
      ).toEqual([
        'atlas act 0: dream unreachable from hub hall',
        'atlas act 0: nook unreachable from hub hall',
      ]);
      // any other role is held to reachability
      expect(
        after((f) => {
          stage(f);
          mapOf(f, 'dream').role = 'private';
        }),
      ).toEqual(['atlas act 0: dream unreachable from hub hall']);
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

  it('keeps every built map document on its entry: region, sediment and style pack', () => {
    const regions = new Map(content.atlas_regions.map((r) => [r.id, r]));
    for (const m of content.maps) {
      if (isAtlasExempt(m)) continue;
      const entry = content.atlas_maps.find((a) => a.id === m.id) as AtlasMapDef;
      expect(m.region, m.id).toBe(entry.region);
      expect(m.sediment, m.id).toBe(entry.sediment);
      expect(styleOf(m), m.id).toBe(entry.style ?? regions.get(entry.region)?.style);
    }
    // the ten built maps on atlas regions (map_briefs.md 1.3), canon sediment (1.2)
    const of = (id: string) => content.maps.find((m) => m.id === id);
    expect(
      Object.fromEntries(
        content.maps.filter((m) => !isAtlasExempt(m)).map((m) => [m.id, [m.region, m.sediment]]),
      ),
    ).toEqual({
      divine_court: ['divine_realm', 0],
      inner_court: ['court_gap', 0],
      borderstone: ['edgestone_area', 1],
      forest_edge: ['edgestone_area', 1],
      old_outpost: ['edgestone_area', 1],
      seal_ruins: ['ashen_waste', 2],
      seal_ruins_depths: ['ashen_waste', 3],
      ash_waste: ['ashen_waste', 2],
      wallenburg: ['valen_valley', 1],
      wallenburg_sewers: ['valen_valley', 3],
    });
    expect(of('forest_edge')?.style).toBe('wild_forest');
  });

  it('registers the cutscene stages and the twenty-two map_briefs 9.1 entries', () => {
    const codes = (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, content.atlas_maps.find((m) => m.id === id)?.code]));
    const stages = content.atlas_maps.filter((m) => isCutsceneStage(m, content.atlas_routes));
    expect(stages.map((m) => m.code).sort()).toEqual(['P1', 'P2', 'P3', 'P4', 'X2', 'X3', 'X4']);
    expect(
      codes([
        'boundary_cairn_battle',
        'rustridge_deep',
        'gate_station_ruins_se',
        'gate_station_ruins_w',
        'gate_station_ruins_ne',
        'gatepicker_camp_east',
        'redgravel_pit',
        'wreck_bay',
        'abyss_lord_wreck',
        'withered_ring',
        'ancestor_barrow',
        'windfang_rock_battle',
        'fallen_hero_tomb',
        'horncrown_ruins',
        'edgetrial_caves',
        'kingwomb_abyss',
        'root_abyss',
        'deep_forge',
        'valen_fields_battle',
        'rootcourt_battle',
        'borderstone_rear_battle',
        'dg_old_mine',
      ]),
    ).toEqual({
      boundary_cairn_battle: 'A1-1',
      rustridge_deep: 'A5-1',
      gate_station_ruins_se: 'C9-4',
      gate_station_ruins_w: 'C9-5',
      gate_station_ruins_ne: 'C9-6',
      gatepicker_camp_east: 'C9-7',
      redgravel_pit: 'D1-2',
      wreck_bay: 'D3-2',
      abyss_lord_wreck: 'D3-3',
      withered_ring: 'D4-2',
      ancestor_barrow: 'D5-1',
      windfang_rock_battle: 'D5-2',
      fallen_hero_tomb: 'D6-1',
      horncrown_ruins: 'D8-1',
      edgetrial_caves: 'D8-2',
      kingwomb_abyss: 'D8-3',
      root_abyss: 'E4-1',
      deep_forge: 'E5-1',
      valen_fields_battle: 'A10-1',
      rootcourt_battle: 'E4-2',
      borderstone_rear_battle: 'A1-2',
      dg_old_mine: 'A5-2',
    });
    // 67 entries of the world map plus the 22 registered ones
    expect(content.atlas_maps).toHaveLength(89);
    expect(content.atlas_regions.find((r) => r.id === 'earth')).toMatchObject({
      tier: 'realm',
      acts: [0, 7],
      style: 'earth_modern',
    });
    expect(content.atlas_regions.find((r) => r.id === 'court_gap')?.acts).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it('pins every field of the registered entries and the cutscene stages', () => {
    const row = (m: AtlasMapDef) =>
      [
        m.code,
        m.tier,
        m.role,
        m.region,
        m.province ?? '-',
        m.acts.join(','),
        m.style ?? '-',
        m.sediment,
        (m.levels ?? []).join('-') || '-',
        m.size.join('x'),
        m.optional ? 'opt' : 'req',
      ].join(' ');
    const want: Record<string, string> = {
      boundary_cairn_battle:
        'A1-1 scene battle edgestone_area ash_border 4 wild_forest 2 45-48 56x36 req',
      rustridge_deep:
        'A5-1 scene dungeon edgestone_area ash_border 3,4,5 forge_deep 3 34-40 64x64 opt',
      gate_station_ruins_se:
        'C9-4 scene dungeon ashen_waste ash_middle 3,4,5 ash_waste 3 35-40 48x48 req',
      gate_station_ruins_w:
        'C9-5 scene dungeon ashen_waste ash_middle 3,4,5 ash_waste 3 35-40 48x48 req',
      gate_station_ruins_ne:
        'C9-6 scene dungeon ashen_waste ash_middle 3,4,5 ash_waste 3 35-40 48x48 req',
      gatepicker_camp_east:
        'C9-7 scene dungeon ashen_waste ash_middle 3,4,5 ash_waste 3 35-40 64x64 opt',
      redgravel_pit: 'D1-2 scene dungeon grantia redgravel 4,5 - 2 45-55 48x48 opt',
      wreck_bay: 'D3-2 scene dungeon mercato goldbay 4,5 - 3 46-50 96x64 opt',
      abyss_lord_wreck: 'D3-3 scene dungeon mercato goldbay 5 sealed_ruins 3 58-60 128x96 opt',
      withered_ring: 'D4-2 scene dungeon silva ringwood 5 - 3 55-58 96x96 opt',
      ancestor_barrow:
        'D5-1 scene dungeon windfang windfang_rock 4,5 sealed_ruins 3 47-51 96x96 req',
      windfang_rock_battle: 'D5-2 scene battle windfang windfang_rock 4 - 1 48-52 64x40 opt',
      fallen_hero_tomb: 'D6-1 scene dungeon sleepscale vaulttouch 5 sealed_ruins 4 57-60 64x64 opt',
      horncrown_ruins: 'D8-1 scene dungeon nightrealm duskcrown 4,5 - 4 50-54 96x96 opt',
      edgetrial_caves: 'D8-2 scene dungeon nightrealm edgetrial 4,5 - 3 48-54 64x96 opt',
      kingwomb_abyss: 'D8-3 scene dungeon nightrealm duskcrown 5 - 4 56-60 96x128 opt',
      root_abyss: 'E4-1 scene dungeon silva ringwood 4,5 - 3 50-54 96x96 opt',
      deep_forge: 'E5-1 scene dungeon mercato redanvil 4,5 forge_deep 3 48-52 96x96 opt',
      valen_fields_battle: 'A10-1 scene battle valen_valley - 3 lothar_plain 1 43-45 56x36 req',
      rootcourt_battle: 'E4-2 scene battle silva ringwood 4 - 2 47-50 48x36 req',
      borderstone_rear_battle: 'A1-2 scene battle edgestone_area ash_border 5 - 2 55-58 48x32 req',
      dg_old_mine: 'A5-2 scene dungeon edgestone_area ash_border 1 forge_deep 2 6-12 48x48 req',
      earth_train: 'P1 scene stage earth - 0,7 earth_modern 0 - 24x8 req',
      earth_store: 'P2 scene stage earth - 0,7 earth_modern 0 - 16x12 req',
      earth_hospital: 'P3 scene stage earth - 0,7 earth_modern 0 - 24x8 req',
      earth_house: 'P4 scene stage earth - 0,7 earth_modern 0 - 12x10 req',
      gap_void: 'X2 scene stage court_gap - 0,5,6,7 door_corridor 0 - 16x16 req',
      door_corridor: 'X3 scene stage court_gap - 1,2,3,4,5,6,7 door_corridor 0 - 64x16 req',
      dream_doorway: 'X4 scene stage court_gap - 1,2,3,4,5 door_corridor 0 - 16x12 req',
    };
    const got = Object.fromEntries(
      Object.keys(want).map((id) => [
        id,
        row(content.atlas_maps.find((m) => m.id === id) as AtlasMapDef),
      ]),
    );
    expect(got).toEqual(want);
  });

  it('pins the ends, layer, kind, acts and legs of every new route', () => {
    const row = (r: AtlasRouteDef) =>
      [
        `${r.from}>${r.to}`,
        r.layer,
        r.kind,
        r.acts.join(','),
        r.km ?? '-',
        JSON.stringify(r.hours ?? {}).replace(/"/g, ''),
      ].join(' ');
    const want: Record<string, string> = {
      borderstone_north_trail: 'borderstone>borderstone_north tile trail 1,2,3,4,5 3 {walk:0.7}',
      rustridge_old_mine: 'rustridge_mine>dg_old_mine tile passage 1 - {}',
      rustridge_deep_rift: 'rustridge_mine>rustridge_deep tile passage 3,4,5 - {}',
      rustridge_new_shaft: 'borderstone_north>rustridge_deep tile passage 3,4,5 - {}',
      castle_well_shaft: 'wallenburg>broken_door_hall tile passage 2,3,4,5 - {}',
      orien_bridge_north: 'orien_banks>orien_isle tile road 3,4,5 - {}',
      orien_bridge_south: 'orien_banks>orien_isle tile road 3,4,5 - {}',
      lightway_north:
        'gatefront_south>orien_banks region road 3,4,5 240 {walk:240,ride:132,caravan:288}',
      glass_plain_gate_station_se: 'glass_plain>gate_station_ruins_se tile waste 3,4,5 - {}',
      glass_plain_gate_station_ne: 'glass_plain>gate_station_ruins_ne tile waste 3,4,5 - {}',
      ash_sea_gate_station_w: 'ash_sea>gate_station_ruins_w tile waste 3,4,5 - {}',
      glass_plain_gatepicker_camp_east: 'glass_plain>gatepicker_camp_east tile waste 3,4,5 - {}',
      goldbay_wreck_bay: 'goldbay>wreck_bay tile trail 4,5 - {}',
      goldbay_deep_dive: 'goldbay>abyss_lord_wreck region river 5 300 {boat:72}',
      grantis_redgravel_road: 'grantis>redgravel_pit region road 4,5 100 {walk:96,ride:48}',
      worldtree_root_descent: 'world_tree>root_abyss tile passage 4,5 - {}',
      ringwood_withered_path: 'ringwood_court>withered_ring region trail 5 60 {walk:72}',
      rootcourt_battle_call: 'world_tree>rootcourt_battle event battle 4 - {}',
      windfang_barrow_steps: 'windfang_rock>ancestor_barrow tile passage 4,5 - {}',
      windfang_rock_battle_call: 'windfang_rock>windfang_rock_battle event battle 4 - {}',
      vaulttouch_north_descent: 'seven_seats>fallen_hero_tomb region pass 5 40 {walk:48}',
      duskcrown_horncrown_road: 'duskcrown>horncrown_ruins region road 4,5 50 {walk:48,ride:24}',
      duskcrown_edgetrial_road: 'duskcrown>edgetrial_caves region road 4,5 125 {walk:120,ride:60}',
      duskcrown_kingwomb_road: 'duskcrown>kingwomb_abyss region trail 5 70 {walk:72,ride:36}',
      ring_crater_rim: 'thousand_gates_ring>main_gate_crater tile waste 4 - {}',
      redanvil_forge_descent: 'redanvil>deep_forge tile passage 4,5 - {}',
      boundary_cairn_battle_call: 'borderstone>boundary_cairn_battle event battle 4 - {}',
      borderstone_rear_battle_call: 'borderstone>borderstone_rear_battle event battle 5 - {}',
      valen_fields_battle_call: 'old_outpost>valen_fields_battle event battle 3 - {}',
    };
    const got = Object.fromEntries(
      Object.keys(want).map((id) => [
        id,
        row(content.atlas_routes.find((r) => r.id === id) as AtlasRouteDef),
      ]),
    );
    expect(got).toEqual(want);
  });

  it('carries the new routes of map_briefs 9.1 and 13.3 with their legs', () => {
    const r = (id: string) => content.atlas_routes.find((x) => x.id === id);
    for (const id of [
      'borderstone_north_trail',
      'rustridge_old_mine',
      'rustridge_deep_rift',
      'rustridge_new_shaft',
      'castle_well_shaft',
      'orien_bridge_north',
      'orien_bridge_south',
      'glass_plain_gate_station_se',
      'glass_plain_gate_station_ne',
      'ash_sea_gate_station_w',
      'glass_plain_gatepicker_camp_east',
      'goldbay_wreck_bay',
      'windfang_barrow_steps',
      'worldtree_root_descent',
      'redanvil_forge_descent',
      'boundary_cairn_battle_call',
      'windfang_rock_battle_call',
      'valen_fields_battle_call',
      'rootcourt_battle_call',
      'borderstone_rear_battle_call',
      'ring_crater_rim',
    ])
      expect(r(id), id).toBeDefined();
    expect(r('orien_bridges')).toBeUndefined();
    expect(r('valen_river')?.hours).toEqual({ boat: 96, boatBack: 192 });
    expect(r('lightway_north')).toMatchObject({ from: 'gatefront_south', km: 240 });
    expect(r('lightway_north')?.hours).toEqual({ walk: 240, ride: 132, caravan: 288 });
    expect(r('borderstone_north_trail')).toMatchObject({ km: 3, hours: { walk: 0.7 } });
    const legs = Object.fromEntries(
      [
        'grantis_redgravel_road',
        'goldbay_deep_dive',
        'ringwood_withered_path',
        'vaulttouch_north_descent',
        'duskcrown_horncrown_road',
        'duskcrown_edgetrial_road',
        'duskcrown_kingwomb_road',
      ].map((id) => [id, [r(id)?.layer, r(id)?.km]]),
    );
    expect(legs).toEqual({
      grantis_redgravel_road: ['region', 100],
      goldbay_deep_dive: ['region', 300],
      ringwood_withered_path: ['region', 60],
      vaulttouch_north_descent: ['region', 40],
      duskcrown_horncrown_road: ['region', 50],
      duskcrown_edgetrial_road: ['region', 125],
      duskcrown_kingwomb_road: ['region', 70],
    });
    // the crater opens its rim in act 4 through the outer rings
    expect(content.atlas_maps.find((m) => m.id === 'main_gate_crater')?.acts).toEqual([4, 5]);
    expect(r('ring_crater_rim')).toMatchObject({ from: 'thousand_gates_ring', acts: [4] });
  });

  it('names a battle far layer for every battle and the five above-ground ring nodes', () => {
    const skies = Object.fromEntries(
      content.atlas_maps.filter((m) => m.battleSky).map((m) => [m.id, m.battleSky]),
    );
    for (const m of content.atlas_maps.filter((x) => x.role === 'battle'))
      expect(skies[m.id], m.id).toMatch(/^art_bg_battle_/);
    expect(
      ['main_gate_crater', 'world_tree', 'windfang_rock', 'duskcrown', 'seven_seats'].map(
        (id) => skies[id],
      ),
    ).toEqual([
      'art_bg_battle_ring_r01',
      'art_bg_battle_ring_r02',
      'art_bg_battle_ring_r04',
      'art_bg_battle_ring_r05',
      'art_bg_battle_ring_r07',
    ]);
    // the underground nodes show no sky
    expect(skies.redanvil).toBeUndefined();
    expect(skies.broken_door_hall).toBeUndefined();
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
