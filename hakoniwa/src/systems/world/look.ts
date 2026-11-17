// The look layer of a map document (art_pipeline.md 5.1 and 5.2): which style pack paints
// it, per-location building looks, and decor that is drawn but never blocks. The kernel
// never reads these fields; they exist here so content validation and the renderer share
// one vocabulary. Changing a look never changes gameplay.

import { BLOCKING_TILES, type TileKind } from './types';

/**
 * Style packs (art_pipeline.md 1.4): one per landscape family, the same ids as the `styles`
 * of assets/prompts/templates.json. The first six paint the built maps; the national packs
 * (holy_see_white to sleepscale_snow) arrive with act 4, forge_deep with the rust ridge mine,
 * door_corridor with the corridor of doors and earth_modern with the prologue's Earth scenes.
 */
export const STYLE_IDS = [
  'lothar_plain',
  'valen_city',
  'wild_forest',
  'sealed_ruins',
  'ash_waste',
  'divine_court',
  'holy_see_white',
  'grantia_ochre',
  'mercato_coast',
  'silva_canopy',
  'windfang_steppe',
  'night_basalt',
  'sleepscale_snow',
  'forge_deep',
  'door_corridor',
  'earth_modern',
] as const;
export type StyleId = (typeof STYLE_IDS)[number];

/**
 * Region to its default style pack: the atlas regions of data/world/atlas_regions.json
 * (their `style`, or the `stylePlan` of a region whose pack arrives later; the continent
 * has none). Maps name their atlas region (MapDef.region, map_briefs.md 1.3) and write
 * `style` only where they differ from it. tests/look_layer.test.ts keeps this table equal
 * to the atlas data.
 */
export const REGION_STYLE: Readonly<Record<string, StyleId>> = {
  divine_realm: 'divine_court',
  court_gap: 'divine_court',
  earth: 'earth_modern',
  edgestone_area: 'lothar_plain',
  valen_valley: 'valen_city',
  lotha_realm: 'lothar_plain',
  ashen_waste: 'ash_waste',
  holy_see: 'holy_see_white',
  grantia: 'grantia_ochre',
  mercato: 'mercato_coast',
  silva: 'silva_canopy',
  windfang: 'windfang_steppe',
  nightrealm: 'night_basalt',
  sleepscale: 'sleepscale_snow',
};

/**
 * Roof geometry (art_pipeline.md 1.7 and 2.6): gable, hip and flat for the first acts; dome
 * (white-stone domes), cone (round felt tents) and spire (bell and basalt towers) for the
 * national packs of act 4.
 */
export const ROOF_SHAPES = ['gable', 'hip', 'flat', 'dome', 'cone', 'spire'] as const;
export type RoofShape = (typeof ROOF_SHAPES)[number];

export const ROOFINGS = ['tile', 'slate', 'shingle', 'thatch', 'gold_leaf', 'scorched'] as const;
export type Roofing = (typeof ROOFINGS)[number];

export const WALL_MATERIALS = [
  'timber_plaster',
  'whitewash',
  'stone',
  'brick',
  'plank',
  'log',
  'palisade',
  'ruin_stone',
  'marble',
  'basalt',
] as const;
export type WallMaterial = (typeof WALL_MATERIALS)[number];

export const SIGN_KINDS = [
  'none',
  'mug',
  'anvil',
  'scales',
  'book',
  'cross',
  'herb',
  'shield',
  'bread',
  'wheel',
  'horseshoe',
] as const;
export type SignKind = (typeof SIGN_KINDS)[number];

/** Per-location building look override; every field is optional (the style pack fills the rest). */
export interface BuildingLookOverride {
  roof?: RoofShape;
  roofing?: Roofing;
  /** [base, dark, light] as #rrggbb */
  roofColors?: string[];
  wall?: WallMaterial;
  /** wall height in metres (1 tile = 1 m) */
  wallHeight?: number;
  sign?: SignKind;
  chimney?: boolean;
}

export const DECOR_KINDS = [
  'lamp',
  'well',
  'barrel',
  'crate',
  'sign',
  'fence',
  'stall',
  'bench',
  'banner',
  'brazier',
  'statue',
  'grave',
  'haystack',
  'cart',
  // map_briefs.md 1.10: boundary and forbidding stones, door frames (variant 1 a fallen
  // arch), ground marks (chalk, blood, holy scars), dry wells, smashed shrines, landmark
  // trees (the pact oak) and mine lamps
  'standing_stone',
  'doorframe',
  'ground_mark',
  'dry_well',
  'shrine_ruin',
  'landmark_tree',
  'mine_lamp',
] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];

/**
 * The light a lit decor kind gives (art_pipeline.md 2.7; scene_flow.md 1 reads the radii
 * for its lighting cover): height of the flame in metres, radius in tiles, colour, and
 * whether it is lit only at night (lamps, mine lamps) or always (braziers).
 */
export interface DecorLight {
  h: number;
  radius: number;
  color: number;
  night: boolean;
}

export const DECOR_LIGHTS: Readonly<Partial<Record<DecorKind, DecorLight>>> = {
  lamp: { h: 2.4, radius: 4.2, color: 0xffc878, night: true },
  brazier: { h: 0.9, radius: 3.4, color: 0xff9a48, night: false },
  mine_lamp: { h: 1.6, radius: 3, color: 0xffb860, night: true },
};

/** Decor that emits light when lit (the kinds of DECOR_LIGHTS). */
export const LIGHT_DECOR: ReadonlySet<DecorKind> = new Set(
  Object.keys(DECOR_LIGHTS) as DecorKind[],
);

/** Decor that stands on a tree tile and replaces that tile's tree (map_briefs.md 12, row 13). */
export const TREE_DECOR: ReadonlySet<DecorKind> = new Set<DecorKind>(['landmark_tree']);

export interface DecorDef {
  kind: DecorKind;
  /** tile coordinates of the foot (centre of the tile when integer + 0.5) */
  x: number;
  y: number;
  variant?: number;
}

/** The look-layer fields a MapDef may carry (merged into MapDef in ./types). */
export interface MapLook {
  style?: StyleId;
  looks?: Record<string, BuildingLookOverride>;
  decor?: DecorDef[];
}

export function isStyleId(s: string): s is StyleId {
  return (STYLE_IDS as readonly string[]).includes(s);
}

/** The style pack a map is painted with: its own `style`, else its region's, else the plain. */
export function styleOf(map: { style?: string; region?: string; indoor?: boolean }): StyleId {
  if (map.style && isStyleId(map.style)) return map.style;
  const byRegion =
    map.region && Object.hasOwn(REGION_STYLE, map.region) ? REGION_STYLE[map.region] : undefined;
  if (byRegion) return byRegion;
  return map.indoor ? 'sealed_ruins' : 'lothar_plain';
}

/**
 * Problems in a map's look layer (content validation). Pure. Decor is drawn but never
 * blocks, so it must stand where a person could stand: its foot tile is walkable, and it
 * is neither a door (it would sit in the doorway) nor an exit (it would hide the way out).
 * The landmark tree is the exception: it stands on a tree tile and replaces that tree.
 * The spatial layer (rows, legend) and the exits are read for that; a character missing
 * from the legend counts as void, as in the walkability grid.
 */
export function lookProblems(map: {
  id: string;
  width: number;
  height: number;
  rows: readonly string[];
  legend: Readonly<Record<string, TileKind>>;
  exits: readonly { id: string; x: number; y: number }[];
  locations: { id: string }[];
  style?: string;
  looks?: Record<string, BuildingLookOverride>;
  decor?: DecorDef[];
}): string[] {
  const out: string[] = [];
  // An empty style (a cleared editor field) means "use the region's pack".
  if (map.style !== undefined && map.style !== '' && !isStyleId(map.style))
    out.push(`map ${map.id}: unknown style pack '${map.style}'`);
  const locs = new Set(map.locations.map((l) => l.id));
  for (const [id, look] of Object.entries(map.looks ?? {})) {
    if (!locs.has(id)) out.push(`map ${map.id}: look for unknown location '${id}'`);
    if (look.roof && !(ROOF_SHAPES as readonly string[]).includes(look.roof))
      out.push(`map ${map.id}: look ${id} unknown roof '${look.roof}'`);
    if (look.roofing && !(ROOFINGS as readonly string[]).includes(look.roofing))
      out.push(`map ${map.id}: look ${id} unknown roofing '${look.roofing}'`);
    if (look.wall && !(WALL_MATERIALS as readonly string[]).includes(look.wall))
      out.push(`map ${map.id}: look ${id} unknown wall '${look.wall}'`);
    if (look.sign && !(SIGN_KINDS as readonly string[]).includes(look.sign))
      out.push(`map ${map.id}: look ${id} unknown sign '${look.sign}'`);
    if (look.wallHeight !== undefined && !(look.wallHeight >= 1 && look.wallHeight <= 12))
      out.push(`map ${map.id}: look ${id} wallHeight ${look.wallHeight} outside 1..12`);
    for (const c of look.roofColors ?? [])
      if (!/^#[0-9a-fA-F]{6}$/.test(c)) out.push(`map ${map.id}: look ${id} bad colour '${c}'`);
  }
  const exitAt = new Map<string, string>();
  for (const e of map.exits) exitAt.set(`${Math.floor(e.x)},${Math.floor(e.y)}`, e.id);
  (map.decor ?? []).forEach((d, i) => {
    if (!(DECOR_KINDS as readonly string[]).includes(d.kind))
      out.push(`map ${map.id}: decor ${i} unknown kind '${d.kind}'`);
    if (!(d.x >= 0 && d.x < map.width && d.y >= 0 && d.y < map.height)) {
      out.push(`map ${map.id}: decor ${i} (${d.x},${d.y}) outside the map`);
      return;
    }
    const tx = Math.floor(d.x);
    const ty = Math.floor(d.y);
    const ch = map.rows[ty]?.[tx];
    const tile: TileKind =
      ch !== undefined && Object.hasOwn(map.legend, ch) ? (map.legend[ch] as TileKind) : 'void';
    if (TREE_DECOR.has(d.kind)) {
      if (tile !== 'tree')
        out.push(`map ${map.id}: decor ${i} (${d.x},${d.y}) ${d.kind} must stand on a tree tile`);
    } else if (BLOCKING_TILES.has(tile))
      out.push(`map ${map.id}: decor ${i} (${d.x},${d.y}) on a blocking ${tile} tile`);
    else if (tile === 'door') out.push(`map ${map.id}: decor ${i} (${d.x},${d.y}) on a door tile`);
    const exit = exitAt.get(`${tx},${ty}`);
    if (exit !== undefined)
      out.push(`map ${map.id}: decor ${i} (${d.x},${d.y}) on the tile of exit '${exit}'`);
  });
  return out;
}
