// The world atlas (docs/40_design/world/world_map.md): the design registry of every built
// and planned tile map and scene, the regions they belong to and the routes between them.
// It sits above the map documents: a map document says what one map looks like, the atlas
// says where it is, which act opens it and how a traveller gets there. The kernel does not
// read it yet; content validation does (atlasProblems), so the registry cannot drift away
// from the built maps, their exits, the style packs and the continent provinces.

import { isStyleId, type StyleId } from './look';

/** Region tiers: the continent (world map), a region with its region map, a realm outside the world. */
export const ATLAS_REGION_TIERS = ['continent', 'region', 'realm'] as const;
export type AtlasRegionTier = (typeof ATLAS_REGION_TIERS)[number];

/** Map tiers: a seamless walkable tile, or a scene loaded on its own (interior, dungeon floor, battle). */
export const ATLAS_TIERS = ['tile', 'scene'] as const;
export type AtlasTier = (typeof ATLAS_TIERS)[number];

export const ATLAS_ROLES = ['hub', 'field', 'dungeon', 'battle', 'private', 'stage'] as const;
export type AtlasRole = (typeof ATLAS_ROLES)[number];

/** built: a MapDef in content.maps; scenario: a battle_scenarios grid; planned: not made yet. */
export const ATLAS_STATUSES = ['built', 'scenario', 'planned'] as const;
export type AtlasStatus = (typeof ATLAS_STATUSES)[number];

/**
 * Route layers. tile: walked through a map exit; region: travelled on a region map with the
 * clock advanced by the travel table; door: a door ability (inner court, gate sites, the
 * ring of doors); event: entered by a story or battle trigger (a battle grid).
 */
export const ROUTE_LAYERS = ['tile', 'region', 'door', 'event'] as const;
export type RouteLayer = (typeof ROUTE_LAYERS)[number];

export const ROUTE_KINDS = [
  'road',
  'trail',
  'river',
  'waste',
  'pass',
  'passage',
  'gate',
  'battle',
] as const;
export type RouteKind = (typeof ROUTE_KINDS)[number];

/** Which route kinds each layer allows. */
export const ROUTE_KINDS_BY_LAYER: Readonly<Record<RouteLayer, readonly RouteKind[]>> = {
  tile: ['road', 'trail', 'river', 'waste', 'passage'],
  region: ['road', 'trail', 'river', 'waste', 'pass'],
  door: ['gate'],
  event: ['battle'],
};

/** En-route event pools a region-map leg can roll (geography.md 7.2). */
export const ROUTE_EVENT_TAGS = [
  'bandits',
  'monsters',
  'undead',
  'ashstorm',
  'caravan',
  'refugees',
  'patrol',
  'church_patrol',
  'pilgrims',
  'army',
  'rumor',
  'smugglers',
  'weather',
] as const;
export type RouteEventTag = (typeof ROUTE_EVENT_TAGS)[number];

/** Travel modes of the travel table, in game hours of clock advance (one day = 24). */
export const TRAVEL_MODES = ['walk', 'ride', 'caravan', 'boat', 'boatBack'] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

/** Acts: 0 prologue, 1 to 6 the acts, 7 the epilogue (data/quests/acts.json index). */
export const ATLAS_LAST_ACT = 7;

/** Sediment grade of power_system.md 7.2: 0 (clear) to 5 (abyssal). */
export const ATLAS_MAX_SEDIMENT = 5;

/** Content maps that are not part of the world and need no atlas entry. */
export const ATLAS_EXEMPT_MAPS: ReadonlySet<string> = new Set(['testfield']);

/**
 * Map codes: P (prologue and the divine realm), X (private realm), A to F by act series
 * (A to C from geography.md 7.4; D, E, F for acts 4, 5 and 6 with the epilogue), and a
 * numbered sub entry after a hyphen (B6-1 is the first sub entry under B6).
 */
export const ATLAS_CODE_PATTERN = /^(?:P|X|[A-F])\d+(?:-\d+)?$/;

export interface AtlasRegionDef {
  id: string;
  name: string;
  tier: AtlasRegionTier;
  /** the continent a region belongs to */
  parent?: string;
  /** region name in geography.md 2.2 */
  geo?: string;
  /** the ProvinceDef.region value of data/strategy/map.json this region lies in */
  slgRegion?: string;
  /** acts in which the region is in play; for the continent, the acts the world map is open */
  acts: number[];
  /** default style pack of its maps */
  style?: StyleId;
  /** proposed style pack id for regions whose pack does not exist yet */
  stylePlan?: string;
  /** canonical sediment band [low, high] */
  sediment?: [number, number];
  note?: string;
}

export interface AtlasMapDef {
  /** the MapDef id for built maps; the reserved id for planned ones */
  id: string;
  code: string;
  /** geography.md 7.4 codes this entry realises when it merges several */
  covers?: string[];
  name: string;
  tier: AtlasTier;
  role: AtlasRole;
  status: AtlasStatus;
  /** atlas region id */
  region: string;
  /** continent province (data/strategy/map.json) the map lies in */
  province?: string;
  /** acts in which the map is part of the playable world, revisits included */
  acts: number[];
  /** acts for which this map is the hub every other map of the act must be reachable from */
  hubOf?: number[];
  style?: StyleId;
  stylePlan?: string;
  /** canonical sediment grade 0 to 5 */
  sediment: number;
  /** level band [low, high] */
  levels?: [number, number];
  /** [width, height] in tiles: actual for built and scenario entries, suggested for planned */
  size: [number, number];
  /** battle_scenarios id for scenario entries */
  scenario?: string;
  /** off the main path */
  optional?: boolean;
  /** canon sources, for traceability */
  source?: string;
  note?: string;
}

export type TravelHours = Partial<Record<TravelMode, number>>;

export interface AtlasRouteDef {
  id: string;
  from: string;
  to: string;
  layer: RouteLayer;
  kind: RouteKind;
  /** canon road or passage name */
  road?: string;
  km?: number;
  hours?: TravelHours;
  /** acts in which the route is open */
  acts: number[];
  /** travel only from `from` to `to` */
  oneWay?: boolean;
  /** exit id on the `from` map that realises this route (built maps) */
  fromExit?: string;
  /** exit id on the `to` map leading back */
  toExit?: string;
  status: 'built' | 'planned';
  /** opening condition in design words */
  opens?: string;
  requiresFlags?: string[];
  events?: RouteEventTag[];
  note?: string;
}

declare module '../../core/contracts' {
  interface ContentMap {
    atlas_regions: AtlasRegionDef[];
    atlas_maps: AtlasMapDef[];
    atlas_routes: AtlasRouteDef[];
  }
}

/** What atlasProblems checks against. Optional inputs switch their cross checks on. */
export interface AtlasInput {
  regions: readonly AtlasRegionDef[];
  maps: readonly AtlasMapDef[];
  routes: readonly AtlasRouteDef[];
  /** the built content maps; omitted for partial content builds that carry no story maps */
  contentMaps?: readonly {
    id: string;
    width: number;
    height: number;
    exits: readonly { id: string; toMap: string }[];
  }[];
  /** continent provinces (slg_provinces) */
  provinces?: readonly { id: string; region: string }[];
  /** continent province links (slg_links) */
  links?: readonly { a: string; b: string }[];
  /** battle grids (battle_scenarios) */
  scenarios?: readonly { id: string; width: number; height: number }[];
}

const has = (list: readonly string[], v: unknown): boolean =>
  typeof v === 'string' && list.includes(v);

function actProblems(who: string, acts: unknown): string[] {
  if (!Array.isArray(acts) || acts.length === 0) return [`${who}: acts must list at least one act`];
  const out: string[] = [];
  const seen = new Set<number>();
  for (const a of acts) {
    if (!Number.isInteger(a) || a < 0 || a > ATLAS_LAST_ACT)
      out.push(`${who}: act ${a} outside 0..${ATLAS_LAST_ACT}`);
    else if (seen.has(a)) out.push(`${who}: act ${a} listed twice`);
    seen.add(a);
  }
  return out;
}

const validGrade = (n: unknown): boolean =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) <= ATLAS_MAX_SEDIMENT;

/** Problems in the atlas (content validation). Pure; empty means valid. */
export function atlasProblems(input: AtlasInput): string[] {
  const out: string[] = [];
  const regions = new Map(input.regions.map((r) => [r.id, r]));
  const maps = new Map(input.maps.map((m) => [m.id, m]));
  const provinces = input.provinces ? new Map(input.provinces.map((p) => [p.id, p])) : undefined;
  const slgRegions = input.provinces ? new Set(input.provinces.map((p) => p.region)) : undefined;

  // Regions.
  const continents = input.regions.filter((r) => r.tier === 'continent');
  if (continents.length !== 1)
    out.push(`atlas: expected exactly one continent region, found ${continents.length}`);
  for (const r of input.regions) {
    const who = `atlas_region ${r.id}`;
    if (!has(ATLAS_REGION_TIERS, r.tier)) out.push(`${who}: unknown tier '${r.tier}'`);
    out.push(...actProblems(who, r.acts));
    if (r.parent !== undefined) {
      const p = regions.get(r.parent);
      if (!p) out.push(`${who}: unknown parent region '${r.parent}'`);
      else if (p.tier !== 'continent')
        out.push(`${who}: parent '${r.parent}' is not the continent`);
    }
    if (r.tier === 'region' && r.parent === undefined)
      out.push(`${who}: a region needs the continent as parent`);
    if (r.tier !== 'region' && r.parent !== undefined)
      out.push(`${who}: only a region has a parent`);
    if (r.style !== undefined && !isStyleId(r.style))
      out.push(`${who}: unknown style pack '${r.style}'`);
    if (r.sediment !== undefined) {
      const [lo, hi] = r.sediment;
      if (!validGrade(lo) || !validGrade(hi) || lo > hi)
        out.push(`${who}: sediment band [${lo}, ${hi}] invalid`);
    }
    if (r.slgRegion !== undefined && slgRegions && !slgRegions.has(r.slgRegion))
      out.push(`${who}: unknown continent region '${r.slgRegion}'`);
  }

  // Maps.
  const codes = new Map<string, string>();
  for (const m of input.maps) {
    const who = `atlas_map ${m.id}`;
    if (!has(ATLAS_TIERS, m.tier)) out.push(`${who}: unknown tier '${m.tier}'`);
    if (!has(ATLAS_ROLES, m.role)) out.push(`${who}: unknown role '${m.role}'`);
    if (!has(ATLAS_STATUSES, m.status)) out.push(`${who}: unknown status '${m.status}'`);
    if (typeof m.code !== 'string' || !ATLAS_CODE_PATTERN.test(m.code))
      out.push(`${who}: bad code '${m.code}'`);
    else {
      const prev = codes.get(m.code);
      if (prev) out.push(`${who}: code ${m.code} already used by ${prev}`);
      else codes.set(m.code, m.id);
    }
    for (const c of m.covers ?? [])
      if (!ATLAS_CODE_PATTERN.test(c)) out.push(`${who}: bad covered code '${c}'`);
    out.push(...actProblems(who, m.acts));
    const acts = new Set(m.acts);
    for (const a of m.hubOf ?? [])
      if (!acts.has(a)) out.push(`${who}: hub of act ${a} but not playable in it`);
    const region = regions.get(m.region);
    if (!region) out.push(`${who}: unknown region '${m.region}'`);
    else {
      if (region.tier === 'continent') out.push(`${who}: region '${m.region}' is the continent`);
      const regionActs = new Set(region.acts);
      for (const a of m.acts)
        if (!regionActs.has(a)) out.push(`${who}: act ${a} not in region ${region.id}`);
      if (region.sediment && validGrade(m.sediment)) {
        const [lo, hi] = region.sediment;
        if (m.sediment < lo || m.sediment > hi)
          out.push(`${who}: sediment ${m.sediment} outside region band [${lo}, ${hi}]`);
      }
    }
    if (m.style !== undefined && !isStyleId(m.style))
      out.push(`${who}: unknown style pack '${m.style}'`);
    if (!m.style && !m.stylePlan && !region?.style && !region?.stylePlan)
      out.push(`${who}: no style pack and no planned one, on the map or its region`);
    if (!validGrade(m.sediment))
      out.push(`${who}: sediment ${m.sediment} outside 0..${ATLAS_MAX_SEDIMENT}`);
    if (m.levels !== undefined) {
      const [lo, hi] = m.levels;
      if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 1 || hi > 70 || lo > hi)
        out.push(`${who}: level band [${lo}, ${hi}] invalid`);
    }
    const [w, h] = Array.isArray(m.size) ? m.size : [Number.NaN, Number.NaN];
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1)
      out.push(`${who}: size must be two positive whole numbers`);
    if (m.role === 'battle' && m.tier !== 'scene') out.push(`${who}: a battle must be a scene`);
    if (m.status === 'scenario') {
      if (m.role !== 'battle') out.push(`${who}: only a battle can be a scenario entry`);
      if (!m.scenario) out.push(`${who}: scenario entry without a scenario id`);
    } else if (m.scenario !== undefined) out.push(`${who}: scenario id on a ${m.status} entry`);
    if (m.scenario && input.scenarios) {
      const s = input.scenarios.find((x) => x.id === m.scenario);
      if (!s) out.push(`${who}: unknown battle scenario '${m.scenario}'`);
      else if (s.width !== w || s.height !== h)
        out.push(`${who}: size ${w}x${h} != scenario ${s.width}x${s.height}`);
    }
    if (m.province !== undefined && provinces) {
      const p = provinces.get(m.province);
      if (!p) out.push(`${who}: unknown province '${m.province}'`);
      else if (region?.slgRegion && p.region !== region.slgRegion)
        out.push(
          `${who}: province ${m.province} lies in ${p.region}, region ${m.region} is ${region.slgRegion}`,
        );
    }
  }

  // Built entries against the content maps, both ways, with sizes.
  if (input.contentMaps) {
    const content = new Map(input.contentMaps.map((c) => [c.id, c]));
    for (const c of input.contentMaps) {
      if (ATLAS_EXEMPT_MAPS.has(c.id)) continue;
      const m = maps.get(c.id);
      if (!m) out.push(`atlas: content map ${c.id} has no atlas entry`);
      else if (m.status !== 'built')
        out.push(`atlas_map ${c.id}: exists in content but is marked ${m.status}`);
    }
    for (const m of input.maps) {
      if (m.status !== 'built') continue;
      const c = content.get(m.id);
      if (!c) out.push(`atlas_map ${m.id}: marked built but no content map has this id`);
      else if (Array.isArray(m.size) && (m.size[0] !== c.width || m.size[1] !== c.height))
        out.push(`atlas_map ${m.id}: size ${m.size[0]}x${m.size[1]} != map ${c.width}x${c.height}`);
    }
    // Every exit of every built map is cited by a route.
    for (const c of input.contentMaps) {
      if (ATLAS_EXEMPT_MAPS.has(c.id)) continue;
      for (const x of c.exits) {
        const cited = input.routes.some(
          (r) =>
            (r.from === c.id && r.to === x.toMap && r.fromExit === x.id) ||
            (r.to === c.id && r.from === x.toMap && !r.oneWay && r.toExit === x.id),
        );
        if (!cited)
          out.push(`atlas: exit ${c.id}.${x.id} -> ${x.toMap} is not cited by any atlas route`);
      }
    }
    // Every cited exit exists and points at the other end.
    for (const r of input.routes) {
      const check = (mapId: string, exitId: string | undefined, other: string, side: string) => {
        if (exitId === undefined) return;
        const c = content.get(mapId);
        const x = c?.exits.find((e) => e.id === exitId);
        if (!x) out.push(`atlas_route ${r.id}: ${side} exit ${mapId}.${exitId} does not exist`);
        else if (x.toMap !== other)
          out.push(`atlas_route ${r.id}: ${side} exit ${mapId}.${exitId} leads to ${x.toMap}`);
      };
      check(r.from, r.fromExit, r.to, 'from');
      check(r.to, r.toExit, r.from, 'to');
    }
  }

  // Routes.
  for (const r of input.routes) {
    const who = `atlas_route ${r.id}`;
    const a = maps.get(r.from);
    const b = maps.get(r.to);
    if (!a) out.push(`${who}: unknown map '${r.from}'`);
    if (!b) out.push(`${who}: unknown map '${r.to}'`);
    if (r.from === r.to) out.push(`${who}: leads from a map to itself`);
    if (!has(ROUTE_LAYERS, r.layer)) out.push(`${who}: unknown layer '${r.layer}'`);
    else if (!ROUTE_KINDS_BY_LAYER[r.layer].includes(r.kind))
      out.push(`${who}: kind '${r.kind}' not allowed on layer ${r.layer}`);
    out.push(...actProblems(who, r.acts));
    for (const act of r.acts ?? []) {
      if (a && !a.acts.includes(act)) out.push(`${who}: open in act ${act} but ${a.id} is not`);
      if (b && !b.acts.includes(act)) out.push(`${who}: open in act ${act} but ${b.id} is not`);
    }
    for (const [mode, v] of Object.entries(r.hours ?? {})) {
      if (!has(TRAVEL_MODES, mode)) out.push(`${who}: unknown travel mode '${mode}'`);
      if (!(typeof v === 'number' && v > 0)) out.push(`${who}: ${mode} hours must be positive`);
    }
    if (r.km !== undefined && !(r.km > 0)) out.push(`${who}: km must be positive`);
    if (r.layer === 'region') {
      if (!(typeof r.km === 'number' && r.km > 0)) out.push(`${who}: a region leg needs its km`);
      if (!Object.values(r.hours ?? {}).some((v) => typeof v === 'number' && v > 0))
        out.push(`${who}: a region leg needs a travel time`);
    }
    for (const e of r.events ?? [])
      if (!has(ROUTE_EVENT_TAGS, e)) out.push(`${who}: unknown event tag '${e}'`);
    if (r.layer === 'event' && b && b.role !== 'battle')
      out.push(`${who}: an event route must lead to a battle`);
    if (b?.role === 'battle' && r.layer !== 'event')
      out.push(`${who}: a battle is entered by an event route`);
    if (r.status !== 'built' && r.status !== 'planned')
      out.push(`${who}: unknown status '${r.status}'`);
    if (r.status === 'built' && (r.layer === 'tile' || r.layer === 'region')) {
      if (!r.fromExit) out.push(`${who}: a built ${r.layer} route must cite its exit`);
      if (!r.oneWay && !r.toExit) out.push(`${who}: a built two-way route must cite the way back`);
    }
    if ((r.fromExit || r.toExit) && (a?.status !== 'built' || b?.status !== 'built'))
      out.push(`${who}: cites exits but an end is not a built map`);
  }

  out.push(...reachProblems(input));
  return out;
}

/** Every act's maps are reachable from that act's single hub. */
function reachProblems(input: AtlasInput): string[] {
  const out: string[] = [];
  const continent = input.regions.find((r) => r.tier === 'continent');
  const worldActs = new Set(continent?.acts ?? []);
  const acts = new Set<number>();
  for (const m of input.maps) for (const a of m.acts ?? []) acts.add(a);
  const linkAdj = new Map<string, string[]>();
  for (const l of input.links ?? []) {
    linkAdj.set(l.a, [...(linkAdj.get(l.a) ?? []), l.b]);
    linkAdj.set(l.b, [...(linkAdj.get(l.b) ?? []), l.a]);
  }
  for (const act of [...acts].sort((x, y) => x - y)) {
    const inAct = input.maps.filter((m) => m.acts?.includes(act));
    const hubs = inAct.filter((m) => m.hubOf?.includes(act));
    if (hubs.length !== 1) {
      out.push(`atlas act ${act}: expected one hub, found ${hubs.length}`);
      continue;
    }
    // Nodes: map ids, plus 'province:<id>' (or one 'world' node) when the world map is open.
    const adj = new Map<string, string[]>();
    const link = (x: string, y: string, oneWay = false) => {
      adj.set(x, [...(adj.get(x) ?? []), y]);
      if (!oneWay) adj.set(y, [...(adj.get(y) ?? []), x]);
    };
    const ids = new Set(inAct.map((m) => m.id));
    for (const r of input.routes)
      if (r.acts?.includes(act) && ids.has(r.from) && ids.has(r.to)) link(r.from, r.to, r.oneWay);
    if (worldActs.has(act)) {
      for (const m of inAct)
        if (m.tier === 'tile' && m.province)
          link(m.id, input.links ? `province:${m.province}` : 'world');
      for (const [p, next] of linkAdj)
        for (const q of next) link(`province:${p}`, `province:${q}`, true);
    }
    const hub = hubs[0] as AtlasMapDef;
    const seen = new Set<string>([hub.id]);
    const queue = [hub.id];
    while (queue.length > 0) {
      const at = queue.shift() as string;
      for (const n of adj.get(at) ?? [])
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
    }
    for (const m of inAct)
      if (!seen.has(m.id)) out.push(`atlas act ${act}: ${m.id} unreachable from hub ${hub.id}`);
  }
  return out;
}
