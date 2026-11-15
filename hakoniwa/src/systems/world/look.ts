// The look layer of a map document (art_pipeline.md 5.1 and 5.2): which style pack paints
// it, per-location building looks, and decor that is drawn but never blocks. The kernel
// never reads these fields; they exist here so content validation and the renderer share
// one vocabulary. Changing a look never changes gameplay.

import { BLOCKING_TILES, type TileKind } from './types';

/** Style packs (art_pipeline.md 1.4): one per landscape family. */
export const STYLE_IDS = [
  'lothar_plain',
  'valen_city',
  'wild_forest',
  'sealed_ruins',
  'ash_waste',
  'divine_court',
] as const;
export type StyleId = (typeof STYLE_IDS)[number];

/** Map region (docs/20_world/geography.md) to its default style pack. */
export const REGION_STYLE: Readonly<Record<string, StyleId>> = {
  borderstone_region: 'lothar_plain',
  lotha_north: 'lothar_plain',
  lothar_north: 'lothar_plain',
  valen_valley: 'valen_city',
  wallenburg: 'valen_city',
  borderstone_wilds: 'wild_forest',
  ash_waste: 'ash_waste',
  court_gap: 'divine_court',
  divine_court: 'divine_court',
  divine: 'divine_court',
};

export const ROOF_SHAPES = ['gable', 'hip', 'flat'] as const;
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
] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];

/** Decor that emits light when lit (lamps at night, braziers always). */
export const LIGHT_DECOR: ReadonlySet<DecorKind> = new Set<DecorKind>(['lamp', 'brazier']);

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
    if (BLOCKING_TILES.has(tile))
      out.push(`map ${map.id}: decor ${i} (${d.x},${d.y}) on a blocking ${tile} tile`);
    else if (tile === 'door') out.push(`map ${map.id}: decor ${i} (${d.x},${d.y}) on a door tile`);
    const exit = exitAt.get(`${tx},${ty}`);
    if (exit !== undefined)
      out.push(`map ${map.id}: decor ${i} (${d.x},${d.y}) on the tile of exit '${exit}'`);
  });
  return out;
}
