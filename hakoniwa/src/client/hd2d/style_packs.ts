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

// The national and special packs (act 4 on, the rust ridge mine, the corridor of doors and
// the Earth prologue). Colours come from each pack's anchor palette in
// assets/prompts/templates.json; dome, cone and spire roofs mark the white domes, the felt
// tents and the bell and basalt towers (art_pipeline.md 1.7). Their own wall and roof
// materials (felt, rammed earth) come with the packs' maps; until then the closest existing
// material stands in.

const HOLY_SEE_WHITE: StylePack = {
  ...LOTHAR_PLAIN,
  id: 'holy_see_white',
  ground: {
    ...BASE_GROUND,
    grass: [0x6b7a3a, 0x7a8a46, 0x8c9a52, 0xa9b878],
    road: [0xb9b3a6, 0xc8c2b4, 0xddd8cc, 0x8a8478],
    stone: [0xb9b3a6, 0xcdc8bc, 0xddd8cc, 0xf2efe6],
  },
  outside: 0x20242a,
  buildings: {
    home: building(
      ['whitewash', 'marble'],
      2.8,
      'hip',
      ['tile', 'slate'],
      [0xb5643a, 0x8a8478, 0xc9a646],
      'none',
      true,
    ),
    shop: building(['whitewash'], 3.0, 'hip', ['tile'], [0xb5643a, 0x8a8478], 'scales', false),
    workshop: building(['stone'], 2.8, 'gable', ['tile'], [0x8a8478], 'anvil', true),
    tavern: building(['whitewash', 'stone'], 3.2, 'hip', ['tile'], [0xb5643a], 'mug', true),
    guild: building(['marble'], 3.6, 'hip', ['slate'], [0x5a6e8c], 'shield', false),
    temple: building(['marble'], 5.2, 'dome', ['gold_leaf'], [0xc9a646, 0xe6d08a], 'cross', false),
    office: building(['marble'], 4.0, 'dome', ['slate'], [0x5a6e8c, 0xddd8cc], 'none', false),
    keep: building(['marble', 'stone'], 6.5, 'spire', ['slate'], [0x5a6e8c], 'none', false),
  },
  freeWall: 'marble',
  freeWallHeight: 2.6,
  trees: { leaves: [0x6b7a3a, 0x8c9a52, 0xa9b878], trunk: 0x8a8478, shapes: [0, 2] },
  rock: 0xb9b3a6,
  light: { ...TEMPERATE, day: { ...TEMPERATE.day, sun: 0xfff8e8, sunIntensity: 2.3 } },
  film: {
    saturation: 1.05,
    lift: 0.08,
    warm: 0.09,
    teal: 0.03,
    contrast: 1.0,
    vignette: 0.24,
    grain: 0.03,
  },
  windowGlow: 0xe6d08a,
};

const GRANTIA_OCHRE: StylePack = {
  ...LOTHAR_PLAIN,
  id: 'grantia_ochre',
  ground: {
    ...BASE_GROUND,
    grass: [0x7a7a3a, 0x8a8a44, 0x9e9a4e, 0xd8b45a],
    dirt: [0x7a6a4a, 0x8a7652, 0xa08a5e, 0xb89a68],
    road: [0x8e9298, 0xa4a8ac, 0xb8bcc0, 0x6a6e74],
    crop: [0x5a4632, 0x7a6a4a, 0xd8b45a, 0xe8cf86],
  },
  outside: 0x1e1a18,
  buildings: {
    home: building(['brick'], 2.8, 'hip', ['tile'], [0xa85a3a, 0x8a3a26], 'none', true),
    shop: building(['brick'], 3.0, 'hip', ['tile'], [0x8a3a26, 0xc8784a], 'scales', false),
    workshop: building(['brick', 'stone'], 2.8, 'flat', ['tile'], [0x6a6e74], 'anvil', true),
    tavern: building(['brick'], 3.2, 'hip', ['tile'], [0xa85a3a], 'mug', true),
    guild: building(
      ['stone', 'brick'],
      3.8,
      'hip',
      ['slate'],
      [0x3a3e44, 0x6a6e74],
      'shield',
      false,
    ),
    temple: building(['stone'], 4.6, 'gable', ['tile'], [0x8a3a26], 'cross', false),
    office: building(['stone'], 4.0, 'flat', ['slate'], [0x6a6e74], 'none', false),
    keep: building(['stone', 'brick'], 6.0, 'flat', ['slate'], [0x3a3e44], 'shield', false),
  },
  materials: { ...MATERIALS, brick: [0xa85a3a, 0x7a3a26, 0xc8784a, 0x5a4632] },
  freeWall: 'brick',
  freeWallHeight: 3.0,
  trees: { leaves: [0x7a8a3a, 0x6a7a34], trunk: 0x5a4632, shapes: [2, 0] },
  rock: 0x8e9298,
  film: { ...LOTHAR_PLAIN.film, saturation: 1.06, warm: 0.1, teal: 0.04 },
  windowGlow: 0xffd08a,
};

const MERCATO_COAST: StylePack = {
  ...LOTHAR_PLAIN,
  id: 'mercato_coast',
  ground: {
    ...BASE_GROUND,
    road: [0x8a7a5a, 0xa08e6a, 0xb8a47c, 0x6b4f1d],
    stone: [0x9a958a, 0xb0aa9c, 0xc8c0b0, 0xf0e6d0],
    sand: [0xc8b888, 0xd8c89a, 0xf0e6d0, 0xa89868],
    water: [0x1e4a6e, 0x2e6e9a, 0x5aa0c8, 0xa8d4e6],
    deep_water: [0x14304a, 0x1e4a6e, 0x2e6e9a, 0x5aa0c8],
  },
  outside: 0x14202a,
  buildings: {
    home: building(
      ['whitewash', 'stone'],
      2.8,
      'hip',
      ['tile'],
      [0xb5643a, 0xd4895a],
      'none',
      true,
    ),
    shop: building(['whitewash'], 3.0, 'hip', ['tile'], [0xb5643a, 0xd4895a], 'scales', false),
    workshop: building(['brick', 'stone'], 3.0, 'gable', ['tile'], [0xb5643a], 'anvil', true),
    tavern: building(['whitewash', 'plank'], 3.2, 'hip', ['tile'], [0xd4895a], 'mug', true),
    guild: building(['stone', 'whitewash'], 3.8, 'hip', ['tile'], [0xb5643a], 'scales', false),
    temple: building(['marble'], 4.6, 'dome', ['tile'], [0xb5643a], 'cross', false),
    office: building(['stone'], 4.0, 'hip', ['tile'], [0xb5643a, 0xc9a227], 'scales', false),
    keep: building(['stone'], 6.0, 'hip', ['slate'], [0x3a3e44], 'shield', false),
  },
  freeWall: 'stone',
  freeWallHeight: 2.6,
  trees: { leaves: [0x5a8a4a, 0x4a7a3a], trunk: 0x6b4f1d, shapes: [0, 2] },
  rock: 0x8a7a5a,
  light: { ...TEMPERATE, day: { ...TEMPERATE.day, sky: 0xd0e8ff } },
  film: { ...LOTHAR_PLAIN.film, saturation: 1.1, teal: 0.08, warm: 0.07 },
  windowGlow: 0xffd58a,
};

const SILVA_CANOPY: StylePack = {
  ...WILD_FOREST,
  id: 'silva_canopy',
  ground: {
    ...BASE_GROUND,
    grass: [0x2e5a3a, 0x3a6a40, 0x4a7a4a, 0x7aa06a],
    dirt: [0x5a4a3a, 0x6a5a46, 0x7a6a52, 0x8a7a62],
  },
  outside: 0x0e1a14,
  buildings: {
    home: building(
      ['plank', 'log'],
      2.6,
      'gable',
      ['shingle'],
      [0x5a6a5a, 0x4a5a4a],
      'none',
      false,
    ),
    shop: building(['plank'], 2.8, 'gable', ['shingle'], [0x5a6a5a], 'scales', false),
    workshop: building(['log'], 2.8, 'gable', ['shingle'], [0x4a5a4a], 'anvil', false),
    tavern: building(['plank'], 3.0, 'gable', ['shingle'], [0x6a7a5a], 'mug', false),
    guild: building(['plank', 'log'], 3.2, 'cone', ['shingle'], [0x4a6a5a], 'shield', false),
    temple: building(['plank'], 4.2, 'spire', ['shingle'], [0xa8b4bc, 0x7aa06a], 'none', false),
    office: building(['plank'], 3.4, 'cone', ['shingle'], [0x5a6a5a], 'none', false),
    keep: building(['log'], 5.0, 'spire', ['shingle'], [0x4a5a4a], 'none', false),
  },
  freeWall: 'plank',
  freeWallHeight: 2.0,
  trees: { leaves: [0x2e5a3a, 0x4a7a4a, 0x1e3a2a], trunk: 0xa8b4bc, shapes: [2, 1, 2] },
  rock: 0x6a7a74,
  film: { ...WILD_FOREST.film, saturation: 1.02, teal: 0.1, lift: 0.08 },
  windowGlow: 0xc8e0a0,
};

const WINDFANG_STEPPE: StylePack = {
  ...LOTHAR_PLAIN,
  id: 'windfang_steppe',
  ground: {
    ...BASE_GROUND,
    grass: [0x8a8a4a, 0xa8945a, 0xc8b46a, 0xe0d08e],
    dirt: [0x8a6a4a, 0x9a7a56, 0xa88a62, 0x6a5440],
    road: [0x9a7a56, 0xa88a62, 0xc8b46a, 0x8a6a4a],
  },
  outside: 0x1e1c16,
  buildings: {
    home: building(
      ['whitewash'],
      2.2,
      'cone',
      ['thatch'],
      [0xb83a2a, 0xd86a4a, 0xe8dcc4],
      'none',
      false,
    ),
    shop: building(['whitewash'], 2.4, 'cone', ['thatch'], [0xd86a4a, 0xe8dcc4], 'scales', false),
    workshop: building(['plank'], 2.4, 'cone', ['thatch'], [0x8a6a4a], 'anvil', false),
    tavern: building(['whitewash'], 2.6, 'cone', ['thatch'], [0xb83a2a], 'mug', false),
    guild: building(['log'], 3.0, 'cone', ['thatch'], [0xb83a2a, 0x8a6a4a], 'shield', false),
    temple: building(['log', 'stone'], 3.6, 'cone', ['thatch'], [0xe8dcc4], 'none', false),
    office: building(['log'], 3.2, 'cone', ['thatch'], [0xb83a2a], 'none', false),
    keep: building(['stone', 'log'], 4.6, 'hip', ['shingle'], [0x6a6460], 'shield', false),
  },
  freeWall: 'palisade',
  freeWallHeight: 1.8,
  trees: { leaves: [0x7a8a4a, 0x8a944e], trunk: 0x6a5440, shapes: [2, 3] },
  rock: 0x6a6460,
  light: {
    ...TEMPERATE,
    day: { ...TEMPERATE.day, sky: 0xb8d8ff, sunIntensity: 2.2 },
  },
  film: { ...LOTHAR_PLAIN.film, saturation: 1.1, warm: 0.08, teal: 0.05 },
  windowGlow: 0xffd58a,
};

const NIGHT_BASALT: StylePack = {
  ...LOTHAR_PLAIN,
  id: 'night_basalt',
  ground: {
    ...BASE_GROUND,
    grass: [0x3a3a34, 0x45453c, 0x525246, 0x5e5e50],
    dirt: [0x2e2a2c, 0x3a3536, 0x45403e, 0x5e5652],
    road: [0x45403e, 0x524c4a, 0x5e5652, 0x2e2a2c],
    stone: [0x2e2a2c, 0x3a3536, 0x45403e, 0x5e5652],
    water: [0x4a8a88, 0x6aa8a6, 0x8ac8c4, 0xc8e8e4],
  },
  outside: 0x0e0c10,
  buildings: {
    home: building(['basalt'], 2.8, 'gable', ['slate'], [0x2e2a2c, 0x5a1a16], 'none', true),
    shop: building(['basalt'], 3.0, 'gable', ['slate'], [0x5a1a16], 'scales', false),
    workshop: building(['basalt'], 2.8, 'flat', ['scorched'], [0x2e2a2c], 'anvil', true),
    tavern: building(['basalt'], 3.2, 'gable', ['tile'], [0x8a2a22], 'mug', true),
    guild: building(['basalt'], 3.8, 'hip', ['slate'], [0x2e2a2c], 'shield', false),
    temple: building(['basalt'], 5.2, 'spire', ['slate'], [0x2e2a2c, 0x5a1a16], 'none', false),
    office: building(['basalt'], 4.2, 'hip', ['slate'], [0x45403e], 'none', false),
    keep: building(['basalt'], 7.0, 'spire', ['slate'], [0x1c1a1a], 'shield', false),
  },
  freeWall: 'basalt',
  freeWallHeight: 3.0,
  trees: { leaves: [0x3a3634, 0x2e2a2c], trunk: 0x1c1a1a, shapes: [3, 1] },
  rock: 0x45403e,
  light: {
    ...TEMPERATE,
    day: {
      ...TEMPERATE.day,
      sun: 0xffd8c0,
      sunIntensity: 1.6,
      sky: 0x8a7a80,
      tint: 0xf0e0e0,
      shade: 0xc0b0c8,
    },
    night: { ...TEMPERATE.night, sky: 0x3a2a34, ground: 0x1c1416, tint: 0xa898a8, shade: 0x7a6a80 },
  },
  film: {
    saturation: 0.92,
    lift: 0.06,
    warm: 0.1,
    teal: 0.06,
    contrast: 1.12,
    vignette: 0.45,
    grain: 0.05,
  },
  windowGlow: 0xff7a3a,
};

const SLEEPSCALE_SNOW: StylePack = {
  ...LOTHAR_PLAIN,
  id: 'sleepscale_snow',
  ground: {
    ...BASE_GROUND,
    grass: [0x5a7a5a, 0x6a8a6a, 0x7a9a7a, 0x8aaa8a],
    dirt: [0x5a6670, 0x6a7680, 0x7a8690, 0x8a96a0],
    stone: [0x8a9aa8, 0xa0aeba, 0xb8c4ce, 0x5a6670],
    snow: [0xc8d4dc, 0xd8e8f4, 0xf6fafc, 0xffffff],
  },
  outside: 0x101820,
  buildings: {
    home: building(
      ['log', 'stone'],
      2.6,
      'gable',
      ['slate', 'shingle'],
      [0x4a6a8a, 0x5a6670],
      'none',
      true,
    ),
    shop: building(['stone', 'log'], 2.8, 'gable', ['slate'], [0x4a6a8a], 'scales', true),
    workshop: building(['stone'], 2.8, 'gable', ['slate'], [0x5a6670], 'anvil', true),
    tavern: building(['stone', 'log'], 3.0, 'gable', ['slate'], [0x3a4048], 'mug', true),
    guild: building(['stone'], 3.4, 'hip', ['slate'], [0x2a3e52], 'shield', true),
    temple: building(['stone'], 4.2, 'spire', ['slate'], [0x4a6a8a], 'none', false),
    office: building(['stone'], 3.6, 'hip', ['slate'], [0x3a4048], 'none', true),
    keep: building(['stone'], 6.0, 'spire', ['slate'], [0x2a3e52], 'shield', false),
  },
  freeWall: 'stone',
  freeWallHeight: 2.4,
  trees: { leaves: [0x3a5a4a, 0x2e4a3e], trunk: 0x3a4048, shapes: [1, 1, 3] },
  rock: 0x8a9aa8,
  light: {
    ...TEMPERATE,
    day: {
      ...TEMPERATE.day,
      sun: 0xf4f8ff,
      sunIntensity: 2.0,
      sky: 0xd8e8ff,
      tint: 0xf4f8ff,
      shade: 0xd8e4f4,
    },
  },
  film: { ...LOTHAR_PLAIN.film, saturation: 0.96, teal: 0.1, warm: 0.03, lift: 0.07 },
  windowGlow: 0xffd58a,
};

const FORGE_DEEP: StylePack = {
  ...SEALED_RUINS,
  id: 'forge_deep',
  ground: {
    ...BASE_GROUND,
    floor: [0x4a3e36, 0x5a4c42, 0x6a5a4e, 0x7a6a5c],
    stone: [0x3a322c, 0x4a3e36, 0x5a4c42, 0x6a5a4e],
    dirt: [0x2a221e, 0x3a2e28, 0x4a3e36, 0x5a4c42],
  },
  outside: 0x100c0a,
  buildings: {
    ...LOTHAR_PLAIN.buildings,
    home: building(['stone'], 2.6, 'flat', ['slate'], [0x4a3e36], 'none', true),
    workshop: building(['stone', 'brick'], 3.0, 'flat', ['slate'], [0x5a6268], 'anvil', true),
  },
  freeWall: 'stone',
  freeWallHeight: 2.6,
  indoorWallHeight: 1.8,
  trees: { leaves: [0x3a4a3a], trunk: 0x2a221e, shapes: [3] },
  rock: 0x4a3e36,
  light: {
    ...TEMPERATE,
    indoor: {
      sun: 0xffc070,
      sunIntensity: 0.4,
      sky: 0xd8a070,
      ground: 0x3a2a20,
      hemiIntensity: 1.1,
      tint: 0xfff0dc,
      shade: 0xc8a890,
    },
  },
  film: {
    saturation: 1.0,
    lift: 0.05,
    warm: 0.14,
    teal: 0.04,
    contrast: 1.08,
    vignette: 0.42,
    grain: 0.05,
  },
  windowGlow: 0xffc070,
};

const DOOR_CORRIDOR: StylePack = {
  ...SEALED_RUINS,
  id: 'door_corridor',
  ground: {
    ...BASE_GROUND,
    floor: [0x16161e, 0x24242e, 0x2e2e3a, 0x3a3a46],
    stone: [0x24242e, 0x2e2e3a, 0x3a3a46, 0x4a4458],
  },
  outside: 0x08080c,
  materials: { ...MATERIALS, ruin_stone: [0x3a3a46, 0x24242e, 0x5a5a68, 0x8a7448] },
  freeWall: 'ruin_stone',
  freeWallHeight: 2.4,
  trees: { leaves: [0x3a3a46], trunk: 0x24242e, shapes: [3] },
  rock: 0x3a3a46,
  light: {
    ...TEMPERATE,
    indoor: {
      sun: 0xf0d890,
      sunIntensity: 0.25,
      sky: 0x5a5a68,
      ground: 0x16161e,
      hemiIntensity: 0.9,
      tint: 0xd8d8e8,
      shade: 0x9090b0,
    },
  },
  film: {
    saturation: 0.85,
    lift: 0.04,
    warm: 0.06,
    teal: 0.08,
    contrast: 1.1,
    vignette: 0.5,
    grain: 0.04,
  },
  windowGlow: 0xf0d890,
};

const EARTH_MODERN: StylePack = {
  ...LOTHAR_PLAIN,
  id: 'earth_modern',
  ground: {
    ...BASE_GROUND,
    floor: [0xb8bcc4, 0xc8ccd2, 0xd8dce0, 0x7a808c],
    road: [0x2a2e38, 0x343844, 0x3e4250, 0x4a5060],
    stone: [0x7a808c, 0x8a909a, 0xb8bcc4, 0x4a5060],
    grass: [0x2e3a2e, 0x3a4a3a, 0x4a5a4a, 0x5a6a5a],
  },
  outside: 0x14161c,
  buildings: {
    home: building(['whitewash', 'brick'], 2.8, 'flat', ['slate'], [0x4a5060], 'none', false),
    shop: building(['whitewash'], 3.0, 'flat', ['slate'], [0x7a808c], 'none', false),
    workshop: building(['brick'], 3.0, 'flat', ['slate'], [0x4a5060], 'none', false),
    tavern: building(['whitewash'], 3.0, 'flat', ['slate'], [0x4a5060], 'none', false),
    guild: building(['whitewash'], 3.4, 'flat', ['slate'], [0x7a808c], 'none', false),
    temple: building(['whitewash'], 3.6, 'gable', ['slate'], [0x4a5060], 'none', false),
    office: building(['whitewash'], 3.8, 'flat', ['slate'], [0x4a5060], 'none', false),
    keep: building(['whitewash'], 6.0, 'flat', ['slate'], [0x2a2e38], 'none', false),
  },
  freeWall: 'whitewash',
  freeWallHeight: 2.6,
  trees: { leaves: [0x3a4a3a, 0x2e3a2e], trunk: 0x4a3e32, shapes: [0] },
  rock: 0x7a808c,
  light: {
    ...TEMPERATE,
    indoor: {
      sun: 0xe8f4ff,
      sunIntensity: 0.4,
      sky: 0xe8f0f4,
      ground: 0x4a5060,
      hemiIntensity: 1.3,
      tint: 0xf0f8ff,
      shade: 0xc8d8e8,
    },
  },
  film: {
    saturation: 0.9,
    lift: 0.05,
    warm: 0.02,
    teal: 0.1,
    contrast: 1.04,
    vignette: 0.3,
    grain: 0.04,
  },
  windowGlow: 0xe8f4ff,
};

export const STYLE_PACKS: Readonly<Record<StyleId, StylePack>> = {
  lothar_plain: LOTHAR_PLAIN,
  valen_city: VALEN_CITY,
  wild_forest: WILD_FOREST,
  sealed_ruins: SEALED_RUINS,
  ash_waste: ASH_WASTE,
  divine_court: DIVINE_COURT,
  holy_see_white: HOLY_SEE_WHITE,
  grantia_ochre: GRANTIA_OCHRE,
  mercato_coast: MERCATO_COAST,
  silva_canopy: SILVA_CANOPY,
  windfang_steppe: WINDFANG_STEPPE,
  night_basalt: NIGHT_BASALT,
  sleepscale_snow: SLEEPSCALE_SNOW,
  forge_deep: FORGE_DEEP,
  door_corridor: DOOR_CORRIDOR,
  earth_modern: EARTH_MODERN,
};

export function stylePackFor(map: Pick<MapDef, 'style' | 'region' | 'indoor'>): StylePack {
  return STYLE_PACKS[styleOf(map)];
}

export function materialColors(pack: StylePack, m: WallMaterial): MaterialColors {
  return pack.materials[m] ?? MATERIALS[m];
}

/** Roofs a chimney can stand on; domes, tents and spires carry none. */
const CHIMNEY_ROOFS: ReadonlySet<RoofShape> = new Set<RoofShape>(['gable', 'hip', 'flat']);

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
    chimney:
      CHIMNEY_ROOFS.has(override?.roof ?? st.roof) &&
      (override?.chimney ?? (st.chimney && seed % 3 !== 0)),
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
