// Style packs (art_pipeline.md 1.4 and 5.2): every colour and appearance a map is painted
// with comes from one pack per landscape family, so the ground, building shells, roofs,
// trees, the time-of-day light and the film grade agree with each other. A map picks its
// pack through the look layer (`MapDef.style`, else its region); the pack never changes
// gameplay. Building looks are chosen per location kind from the pack's candidates by a
// stable hash of the location id, and a map's `looks` may override any field. Pure.

import {
  type BuildingLookOverride,
  type Roofing,
  type RoofShape,
  type SignKind,
  type StyleId,
  styleOf,
  type WallMaterial,
} from '../../systems/world/look';
import type { LocationDef, MapDef, TileKind } from '../../systems/world/types';
import { DEFAULT_GROUND_RAMPS, type PropColors } from '../render/tile_art';
import { hashString, type Rgb } from '../sprites/pixels';

export type Ramp4 = readonly [Rgb, Rgb, Rgb, Rgb];
export type GroundRamps = Partial<Record<TileKind, Ramp4>>;

/** Building families a location kind maps to. */
export type BuildingCategory =
  | 'home'
  | 'shop'
  | 'workshop'
  | 'tavern'
  | 'guild'
  | 'temple'
  | 'office'
  | 'keep';

export interface BuildingStyle {
  walls: readonly WallMaterial[];
  /** metres */
  wallHeight: number;
  roof: RoofShape;
  roofings: readonly Roofing[];
  /** roof base colours; dark and light shades are derived */
  roofColors: readonly Rgb[];
  doorColors: readonly Rgb[];
  sign: SignKind;
  chimney: boolean;
}

/** Wall material colours: [base, dark (mortar, beams), light (highlights), trim (cap, frames)]. */
export type MaterialColors = readonly [Rgb, Rgb, Rgb, Rgb];

export interface LightState {
  sun: Rgb;
  sunIntensity: number;
  sky: Rgb;
  ground: Rgb;
  hemiIntensity: number;
  /** grade: multiply on the whole image and multiply on its dark half */
  tint: Rgb;
  shade: Rgb;
}

export interface LightPalette {
  day: LightState;
  golden: LightState;
  twilight: LightState;
  night: LightState;
  indoor: LightState;
}

/** The film look baked into the grade pass. */
export interface FilmLook {
  saturation: number;
  /** lift of the darks toward the shade colour, 0..0.2 */
  lift: number;
  /** warm highlights, 0..0.2 */
  warm: number;
  /** teal shadows, 0..0.2 */
  teal: number;
  contrast: number;
  vignette: number;
  grain: number;
}

export interface TreeStyle {
  leaves: readonly Rgb[];
  trunk: Rgb;
  /** 0 round crown, 1 conifer, 2 broad crown, 3 bare */
  shapes: readonly number[];
}

export interface StylePack {
  id: StyleId;
  ground: GroundRamps;
  /** colour beyond the map edge */
  outside: Rgb;
  buildings: Readonly<Record<BuildingCategory, BuildingStyle>>;
  materials: Readonly<Partial<Record<WallMaterial, MaterialColors>>>;
  /** walls that belong to no building (town walls, ruins, indoor maps) */
  freeWall: WallMaterial;
  freeWallHeight: number;
  /** indoor maps draw every wall as a cutaway this high */
  indoorWallHeight: number;
  trees: TreeStyle;
  rock: Rgb;
  light: LightPalette;
  film: FilmLook;
  /** window glow colour at night */
  windowGlow: Rgb;
}

const CATEGORY_OF: Readonly<Record<string, BuildingCategory>> = {
  home: 'home',
  house: 'home',
  orphanage: 'home',
  den: 'home',
  shop: 'shop',
  store: 'shop',
  bakery: 'shop',
  station: 'shop',
  bank: 'shop',
  clinic: 'shop',
  work: 'workshop',
  smithy: 'workshop',
  mill: 'workshop',
  warehouse: 'workshop',
  tavern: 'tavern',
  inn: 'tavern',
  guild: 'guild',
  barracks: 'guild',
  school: 'guild',
  church: 'temple',
  chapel: 'temple',
  temple: 'temple',
  office: 'office',
  hall: 'office',
  academy: 'office',
  manor: 'office',
  castle: 'keep',
  tower: 'keep',
};

export function buildingCategory(kind: string): BuildingCategory {
  return Object.hasOwn(CATEGORY_OF, kind) ? (CATEGORY_OF[kind] as BuildingCategory) : 'home';
}

/** Signs by location kind (the category default applies when absent). */
const SIGN_OF: Readonly<Record<string, SignKind>> = {
  tavern: 'mug',
  inn: 'mug',
  smithy: 'anvil',
  shop: 'scales',
  store: 'scales',
  bank: 'scales',
  clinic: 'herb',
  church: 'cross',
  chapel: 'cross',
  temple: 'cross',
  guild: 'shield',
  barracks: 'shield',
  academy: 'book',
  school: 'book',
  bakery: 'bread',
  mill: 'wheel',
  station: 'horseshoe',
};

// Shared light keys: a temperate sky. Packs that differ override whole states.
const TEMPERATE: LightPalette = {
  day: {
    sun: 0xfff4e0,
    sunIntensity: 2.1,
    sky: 0xcfe2ff,
    ground: 0x8a7a5a,
    hemiIntensity: 1.25,
    tint: 0xffffff,
    shade: 0xe8f0ff,
  },
  golden: {
    sun: 0xffc27a,
    sunIntensity: 1.7,
    sky: 0xf0c8a0,
    ground: 0x7a5a3a,
    hemiIntensity: 1.0,
    tint: 0xfff0dc,
    shade: 0xd8c8e8,
  },
  twilight: {
    sun: 0x9aa8ff,
    sunIntensity: 0.6,
    sky: 0x8492d0,
    ground: 0x3a3450,
    hemiIntensity: 1.0,
    tint: 0xd0d6f4,
    shade: 0xa4b0e4,
  },
  night: {
    sun: 0x8a9ad8,
    sunIntensity: 0.4,
    sky: 0x5a6aa8,
    ground: 0x262a44,
    hemiIntensity: 0.95,
    tint: 0xaab6e6,
    shade: 0x7e8cc8,
  },
  indoor: {
    sun: 0xfff0dc,
    sunIntensity: 0.35,
    sky: 0xf4e8d8,
    ground: 0x5a4a3a,
    hemiIntensity: 1.25,
    tint: 0xfff4e4,
    shade: 0xd8d0e0,
  },
};

const BASE_GROUND: GroundRamps = DEFAULT_GROUND_RAMPS as GroundRamps;

const MATERIALS: Readonly<Record<WallMaterial, MaterialColors>> = {
  timber_plaster: [0xe6dcc4, 0x5a3e28, 0xf4ecd8, 0x4a3222],
  whitewash: [0xece6d8, 0xb8b0a0, 0xfaf6ec, 0x7a6a58],
  stone: [0x9a958a, 0x6a665e, 0xb8b3a6, 0x5a564e],
  brick: [0xa8583e, 0x6e3a2a, 0xc0704e, 0x5a463a],
  plank: [0x9a7448, 0x5e4228, 0xb08a58, 0x4a3420],
  log: [0x8a6440, 0x5a3e24, 0xa47c50, 0x3e2a18],
  palisade: [0x7e5a36, 0x4e3620, 0x98724a, 0x3a2816],
  ruin_stone: [0x6e7270, 0x464a4a, 0x8a8e8a, 0x3a4040],
  marble: [0xeeeae2, 0xc8c0b0, 0xffffff, 0xc8a04a],
  basalt: [0x45403e, 0x2a2624, 0x5e5652, 0x8a3a24],
};

function building(
  walls: readonly WallMaterial[],
  wallHeight: number,
  roof: RoofShape,
  roofings: readonly Roofing[],
  roofColors: readonly Rgb[],
  sign: SignKind,
  chimney: boolean,
  doorColors: readonly Rgb[] = [0x6e4626, 0x4a5a3a, 0x7a3a2a, 0x3e4a6a],
): BuildingStyle {
  return { walls, wallHeight, roof, roofings, roofColors, doorColors, sign, chimney };
}

const LOTHAR_PLAIN: StylePack = {
  id: 'lothar_plain',
  ground: BASE_GROUND,
  outside: 0x1a2418,
  buildings: {
    home: building(
      ['timber_plaster', 'whitewash', 'log'],
      2.6,
      'gable',
      ['tile', 'thatch', 'shingle'],
      [0xa8543a, 0xb4823a, 0x8a4a32, 0x6e6a3a],
      'none',
      true,
    ),
    shop: building(
      ['timber_plaster', 'plank'],
      2.8,
      'gable',
      ['tile', 'shingle'],
      [0xa8543a, 0x4e6a8a, 0xb4823a],
      'scales',
      false,
    ),
    workshop: building(
      ['plank', 'stone'],
      2.8,
      'gable',
      ['shingle'],
      [0x5e5048, 0x6e4a32],
      'anvil',
      true,
    ),
    tavern: building(
      ['timber_plaster', 'brick'],
      3.2,
      'gable',
      ['tile'],
      [0x9a3e2e, 0xa8543a],
      'mug',
      true,
    ),
    guild: building(
      ['stone', 'timber_plaster'],
      3.2,
      'hip',
      ['slate'],
      [0x4a5a7a, 0x56657a],
      'shield',
      false,
    ),
    temple: building(
      ['stone', 'whitewash'],
      4.2,
      'gable',
      ['slate'],
      [0x56657a, 0x6a7088],
      'cross',
      false,
    ),
    office: building(
      ['stone', 'brick'],
      3.4,
      'hip',
      ['slate', 'tile'],
      [0x4e5a6e, 0x8a4a32],
      'none',
      true,
    ),
    keep: building(['stone'], 6, 'hip', ['slate'], [0x4a5262], 'shield', false),
  },
  materials: MATERIALS,
  freeWall: 'palisade',
  freeWallHeight: 2.2,
  indoorWallHeight: 1.6,
  trees: { leaves: [0x4a8040, 0x3d6b3a, 0x5a8a3a], trunk: 0x6b4a32, shapes: [0, 1, 2] },
  rock: 0x8a8780,
  light: TEMPERATE,
  film: {
    saturation: 1.12,
    lift: 0.05,
    warm: 0.07,
    teal: 0.06,
    contrast: 1.06,
    vignette: 0.28,
    grain: 0.035,
  },
  windowGlow: 0xffd58a,
};

const VALEN_CITY: StylePack = {
  ...LOTHAR_PLAIN,
  id: 'valen_city',
  ground: {
    ...BASE_GROUND,
    road: [0x7e7a72, 0x96918a, 0xaaa59c, 0x6a665e],
    stone: [0x66686e, 0x80838a, 0x989ba2, 0xb0b2b8],
    dirt: [0x6e5a46, 0x826c56, 0x96806a, 0xa89684],
  },
  outside: 0x1c1e24,
  buildings: {
    home: building(
      ['brick', 'timber_plaster', 'stone'],
      3.0,
      'gable',
      ['slate', 'tile'],
      [0x56657a, 0x4a4e5e, 0x8a4a32],
      'none',
      true,
    ),
    shop: building(
      ['brick', 'stone'],
      3.2,
      'gable',
      ['slate'],
      [0x4e5a6e, 0x56657a, 0x7a4a3a],
      'scales',
      false,
    ),
    workshop: building(['brick'], 3.0, 'gable', ['slate'], [0x4a4a52, 0x5a4a44], 'anvil', true),
    tavern: building(
      ['brick', 'timber_plaster'],
      3.4,
      'gable',
      ['tile'],
      [0x8a3e30, 0x7a4a3a],
      'mug',
      true,
    ),
    guild: building(['stone'], 3.8, 'hip', ['slate'], [0x3e4a66, 0x4a5a7a], 'shield', false),
    temple: building(
      ['stone', 'marble'],
      5.2,
      'gable',
      ['slate'],
      [0x56657a, 0x5e6680],
      'cross',
      false,
    ),
    office: building(['stone'], 4.0, 'hip', ['slate'], [0x3e4a5e, 0x4e5a6e], 'none', true),
    keep: building(['stone'], 6.0, 'hip', ['slate'], [0x3a4252, 0x464e60], 'shield', false),
  },
  freeWall: 'stone',
  freeWallHeight: 3.0,
  film: { ...LOTHAR_PLAIN.film, saturation: 1.04, teal: 0.08, warm: 0.05 },
};

const WILD_FOREST: StylePack = {
  ...LOTHAR_PLAIN,
  id: 'wild_forest',
  ground: {
    ...BASE_GROUND,
    grass: [0x3a6430, 0x46723a, 0x548444, 0x6a9a50],
    dirt: [0x5e4630, 0x70563c, 0x846a4c, 0x9a866c],
  },
  outside: 0x121c10,
  freeWall: 'ruin_stone',
  freeWallHeight: 1.8,
  trees: { leaves: [0x3a6a34, 0x2e5a30, 0x4a7a3a], trunk: 0x5a3e2a, shapes: [1, 0, 1, 2] },
  film: { ...LOTHAR_PLAIN.film, saturation: 1.08, teal: 0.09, lift: 0.06 },
};

const SEALED_RUINS: StylePack = {
  ...LOTHAR_PLAIN,
  id: 'sealed_ruins',
  ground: {
    ...BASE_GROUND,
    floor: [0x46484a, 0x56585a, 0x64666a, 0x74787a],
    stone: [0x4a4c50, 0x5a5c62, 0x6a6e72, 0x7e8286],
    dirt: [0x4a4038, 0x5a4e44, 0x6a5e52, 0x7a6e62],
  },
  outside: 0x0c0c12,
  freeWall: 'ruin_stone',
  freeWallHeight: 2.2,
  indoorWallHeight: 1.7,
  light: {
    ...TEMPERATE,
    indoor: {
      sun: 0x9aa8c8,
      sunIntensity: 0.3,
      sky: 0x8a94b0,
      ground: 0x2a2a34,
      hemiIntensity: 1.1,
      tint: 0xd8dcf0,
      shade: 0xa0a8d0,
    },
  },
  film: { ...LOTHAR_PLAIN.film, saturation: 0.92, teal: 0.12, warm: 0.03, vignette: 0.4 },
  windowGlow: 0xffc070,
};

const ASH_WASTE: StylePack = {
  ...LOTHAR_PLAIN,
  id: 'ash_waste',
  ground: {
    ...BASE_GROUND,
    dirt: [0x4e423a, 0x5e5046, 0x6e6054, 0x7e7064],
    sand: [0x7a6a5a, 0x8a7a68, 0x9a8a76, 0x6a5a4c],
  },
  outside: 0x1a1210,
  buildings: {
    ...LOTHAR_PLAIN.buildings,
    home: building(['basalt', 'plank'], 2.4, 'flat', ['scorched'], [0x4a3a34], 'none', false),
    workshop: building(['basalt'], 2.6, 'flat', ['scorched'], [0x3e3230], 'anvil', true),
  },
  freeWall: 'basalt',
  freeWallHeight: 2.0,
  trees: { leaves: [0x5a5048, 0x4a4240], trunk: 0x3a2e28, shapes: [3, 3, 2] },
  rock: 0x5a524c,
  light: {
    ...TEMPERATE,
    day: {
      ...TEMPERATE.day,
      sun: 0xffd8b0,
      sky: 0xc8a898,
      ground: 0x5a3a2a,
      tint: 0xfff0e4,
      shade: 0xe0c8c0,
    },
    golden: { ...TEMPERATE.golden, sun: 0xff9a5a, sky: 0xc87a5a },
    night: { ...TEMPERATE.night, sky: 0x5a3a48, ground: 0x2a1818, tint: 0xb898a8, shade: 0x8a6a80 },
  },
  film: {
    saturation: 0.88,
    lift: 0.07,
    warm: 0.12,
    teal: 0.04,
    contrast: 1.1,
    vignette: 0.42,
    grain: 0.05,
  },
  windowGlow: 0xff9a4a,
};

const DIVINE_COURT: StylePack = {
  ...LOTHAR_PLAIN,
  id: 'divine_court',
  ground: {
    ...BASE_GROUND,
    floor: [0xd8d0c0, 0xe8e2d4, 0xf4f0e6, 0xd0b070],
    stone: [0xc8c4bc, 0xdcd8d0, 0xeeeae2, 0xc8a04a],
    grass: [0x6a9a5a, 0x7aac66, 0x8cbc74, 0xa8d088],
  },
  outside: 0x2a2438,
  buildings: {
    ...LOTHAR_PLAIN.buildings,
    home: building(['marble'], 3.0, 'hip', ['gold_leaf'], [0xc8a04a], 'none', false),
    temple: building(['marble'], 5.0, 'hip', ['gold_leaf'], [0xd0a84e], 'none', false),
  },
  freeWall: 'marble',
  freeWallHeight: 2.6,
  indoorWallHeight: 1.4,
  trees: { leaves: [0x7ab868, 0x8ac87a], trunk: 0xc8b8a0, shapes: [0, 2] },
  rock: 0xd8d4cc,
  light: {
    ...TEMPERATE,
    indoor: {
      sun: 0xfff4d8,
      sunIntensity: 0.9,
      sky: 0xfff8ec,
      ground: 0xc8b898,
      hemiIntensity: 1.35,
      tint: 0xfff8ec,
      shade: 0xf0e0f0,
    },
  },
  film: {
    saturation: 1.0,
    lift: 0.1,
    warm: 0.1,
    teal: 0.02,
    contrast: 0.96,
    vignette: 0.22,
    grain: 0.02,
  },
  windowGlow: 0xfff0c0,
};

export const STYLE_PACKS: Readonly<Record<StyleId, StylePack>> = {
  lothar_plain: LOTHAR_PLAIN,
  valen_city: VALEN_CITY,
  wild_forest: WILD_FOREST,
  sealed_ruins: SEALED_RUINS,
  ash_waste: ASH_WASTE,
  divine_court: DIVINE_COURT,
};

export function stylePackFor(map: Pick<MapDef, 'style' | 'region' | 'indoor'>): StylePack {
  return STYLE_PACKS[styleOf(map)];
}

export function materialColors(pack: StylePack, m: WallMaterial): MaterialColors {
  return pack.materials[m] ?? MATERIALS[m];
}

/** A building's resolved look: the pack's candidates picked by a stable hash, then overrides. */
export interface ResolvedLook {
  category: BuildingCategory;
  wall: WallMaterial;
  wallHeight: number;
  roof: RoofShape;
  roofing: Roofing;
  /** [base, dark, light] */
  roofColors: readonly [Rgb, Rgb, Rgb];
  doorColor: Rgb;
  sign: SignKind;
  chimney: boolean;
}

function pick<T>(list: readonly T[], seed: number, salt: number): T {
  return list[(seed + salt * 7919) % list.length] as T;
}

function shade(c: Rgb, k: number): Rgb {
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (ch((c >> 16) & 0xff) << 16) | (ch((c >> 8) & 0xff) << 8) | ch(c & 0xff);
}

function parseHex(s: string): Rgb | null {
  return /^#[0-9a-fA-F]{6}$/.test(s) ? Number.parseInt(s.slice(1), 16) : null;
}

export function resolveLook(
  pack: StylePack,
  loc: Pick<LocationDef, 'id' | 'kind'>,
  override: BuildingLookOverride | undefined,
): ResolvedLook {
  const category = buildingCategory(loc.kind);
  const st = pack.buildings[category];
  const seed = hashString(loc.id);
  const base = override?.roofColors?.[0] ? parseHex(override.roofColors[0]) : null;
  const roofBase = base ?? pick(st.roofColors, seed, 1);
  const dark = override?.roofColors?.[1] ? parseHex(override.roofColors[1]) : null;
  const light = override?.roofColors?.[2] ? parseHex(override.roofColors[2]) : null;
  return {
    category,
    wall: override?.wall ?? pick(st.walls, seed, 2),
    wallHeight: override?.wallHeight ?? st.wallHeight,
    roof: override?.roof ?? st.roof,
    roofing: override?.roofing ?? pick(st.roofings, seed, 3),
    roofColors: [roofBase, dark ?? shade(roofBase, 0.68), light ?? shade(roofBase, 1.22)],
    doorColor: pick(st.doorColors, seed, 4),
    sign:
      override?.sign ??
      (Object.hasOwn(SIGN_OF, loc.kind) ? SIGN_OF[loc.kind] : undefined) ??
      st.sign,
    chimney: override?.chimney ?? (st.chimney && seed % 3 !== 0),
  };
}

const propColorCache = new WeakMap<StylePack, PropColors>();

/** The tree and rock colours of a pack, as one stable object (sprite caches key on it). */
export function propColorsOf(pack: StylePack): PropColors {
  let c = propColorCache.get(pack);
  if (!c) {
    c = {
      leaves: pack.trees.leaves,
      trunk: pack.trees.trunk,
      shapes: pack.trees.shapes,
      rock: pack.rock,
    };
    propColorCache.set(pack, c);
  }
  return c;
}
