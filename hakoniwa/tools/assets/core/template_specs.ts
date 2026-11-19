// Import rules per template (art_pipeline.md 1.3, 1.5, 3.2, 3.4, 11): what templates.json does
// not say about a template but the import needs: asset class, palette, outline policy, anchor,
// body size, the frame layout (which cell is which animation frame, direction and duration)
// and the extra checks (seamless edges, ordered dither, fading last frame).
//
// Canvas, in-game size, grid and background come from the template definition itself, so the
// prompt library stays the single source for those.

import { cutscenePropIsCentered } from './cutscene_contracts';
import { vfxColorCapFor, vfxFillsCell, vfxKeepsFinalLight, vfxMovesInCell } from './vfx_contracts';

export type AssetClass =
  | 'reference'
  | 'standee'
  | 'part'
  | 'portrait'
  | 'texture'
  | 'strip'
  | 'decal'
  | 'facade'
  | 'backdrop'
  | 'flat'
  | 'icon'
  | 'vfx'
  | 'overlay'
  | 'ornament'
  | 'map'
  | 'key_art';

export type PaletteKind = 'creature' | 'style' | 'ui' | 'vfx' | 'gray' | 'two' | 'none';
export type Keying = 'magenta' | 'black' | 'none';
export type OutlinePolicy = 'standee' | 'portrait' | 'none';
export type AnchorKind = 'foot' | 'flying' | 'neck' | 'center' | 'none';
export type CellNeed = 'req' | 'opt' | 'blank';

export interface CellDef {
  anim: string;
  dir: string;
  /** Frame index inside the animation. */
  i: number;
  /** Frame duration in milliseconds; null when the frame advances by distance or follows a mount. */
  ms: number | null;
  need: CellNeed;
}

export interface AnimInfo {
  name: string;
  loop: boolean;
  /** Stay on the last frame (death). */
  hold: boolean;
  /** Tiles travelled per frame for distance-driven cycles (walk 0.32, run 0.5). */
  stepTiles?: number;
}

export interface ImportSpec {
  template: string;
  cls: AssetClass;
  canvas: [number, number];
  /** In-game size of one cell (or of the single image); null for reference-only templates. */
  final: [number, number] | null;
  grid: [number, number];
  keying: Keying;
  palette: PaletteKind;
  maxColors?: number;
  outline: OutlinePolicy;
  anchor: AnchorKind;
  /** Anchor inside a final cell (pixels). */
  anchorPx?: [number, number];
  /** Humanoid body height in pixels: target and allowed range (1.3, 3.2). */
  body?: { target: number; min: number; max: number };
  /** Creature size: allowed largest content dimension in pixels. */
  sizeRange?: [number, number];
  /** Rows (or cols) are display directions; `left` is mirrored from `right` unless drawn. */
  dirAxis: 'rows' | 'cols' | 'sheet' | 'none';
  cells: CellDef[][];
  anims: AnimInfo[];
  /** Animations that play in place, where torso drift between frames is jitter (13 step 8). */
  inPlace: string[];
  /** Animations whose height measures the body (standing poses). */
  standing: string[];
  seamless?: 'both' | 'x';
  dither?: boolean;
  fadeLastFrame?: boolean;
  /** Large bodies brighten the outline on the lit (upper-left) side (1.5). */
  big?: boolean;
  /** Key art: process at the pixel grid, then upscale by an integer factor. */
  pixelGrid?: [number, number];
  upscale?: number;
  /** Full-bleed cells are resampled whole (no content fitting). */
  fullBleed?: boolean;
}

export interface TemplateLike {
  canvas?: string;
  final?: string;
  grid?: string;
  background?: string;
}

function dims(s: string | undefined, what: string): [number, number] {
  const m = /^(\d+)x(\d+)$/.exec((s ?? '').trim());
  if (!m) throw new Error(`bad ${what} "${s}"`);
  return [Number(m[1]), Number(m[2])];
}

type Seg = [name: string, from: number, count: number, ms: number[] | number | null];

function segCells(cols: number, dir: string, segs: Seg[]): CellDef[] {
  const row: CellDef[] = [];
  for (let c = 0; c < cols; c++) row.push({ anim: '', dir, i: 0, ms: null, need: 'blank' });
  for (const [name, from, count, ms] of segs) {
    for (let k = 0; k < count; k++) {
      const d = Array.isArray(ms) ? (ms[k] ?? ms[ms.length - 1] ?? null) : ms;
      row[from + k] = { anim: name, dir, i: k, ms: d, need: 'req' };
    }
  }
  return row;
}

/** Rows are directions, every row holds the same animation segments. */
function dirRows(cols: number, dirs: string[], segs: Seg[]): CellDef[][] {
  return dirs.map((d) => segCells(cols, d, segs));
}

/** Each row holds its own animation segments; one direction per sheet. */
function rowAnims(cols: number, rows: Seg[][]): CellDef[][] {
  return rows.map((segs) => segCells(cols, 'sheet', segs));
}

/** Row-major sequence of named groups; null names are blank cells. */
function sequence(
  cols: number,
  rows: number,
  groups: [string | null, number, number | null][],
  dir = 'front',
): CellDef[][] {
  const flat: CellDef[] = [];
  for (const [name, count, ms] of groups) {
    for (let k = 0; k < count; k++) {
      flat.push(
        name === null
          ? { anim: '', dir, i: 0, ms: null, need: 'blank' }
          : { anim: name, dir, i: k, ms, need: 'req' },
      );
    }
  }
  const out: CellDef[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: CellDef[] = [];
    for (let c = 0; c < cols; c++)
      row.push(flat[r * cols + c] ?? { anim: '', dir, i: 0, ms: null, need: 'blank' });
    out.push(row);
  }
  return out;
}

/** Columns are directions, rows are named layers or states. */
function dirCols(dirs: string[], rowNames: string[], optionalRows: number[] = []): CellDef[][] {
  return rowNames.map((name, r) =>
    dirs.map((d) => ({
      anim: name,
      dir: d,
      i: 0,
      ms: null,
      need: optionalRows.includes(r) ? ('opt' as const) : ('req' as const),
    })),
  );
}

function single(name = 'main'): CellDef[][] {
  return [[{ anim: name, dir: 'front', i: 0, ms: null, need: 'req' }]];
}

const CHR_DIRS = ['down', 'right', 'up'];
const L = { loop: true, hold: false };
const ONCE = { loop: false, hold: false };
const HOLD = { loop: false, hold: true };

interface Rule {
  cls: AssetClass;
  palette: PaletteKind;
  maxColors?: number;
  outline: OutlinePolicy;
  anchor: AnchorKind;
  cells: (cols: number, rows: number) => CellDef[][];
  anims?: AnimInfo[];
  inPlace?: string[];
  standing?: string[];
  dirAxis?: ImportSpec['dirAxis'];
  seamless?: 'both' | 'x';
  dither?: boolean;
  fadeLastFrame?: boolean;
  sizeRange?: [number, number];
  humanoid?: boolean;
  big?: boolean;
  pixelGrid?: [number, number];
  upscale?: number;
  fullBleed?: boolean;
}

const chr = (segs: Seg[], anims: AnimInfo[], inPlace: string[], standing: string[]): Rule => ({
  cls: 'standee',
  palette: 'creature',
  maxColors: 32,
  outline: 'standee',
  anchor: 'foot',
  dirAxis: 'rows',
  humanoid: true,
  cells: (cols) => dirRows(cols, CHR_DIRS, segs),
  anims,
  inPlace,
  standing,
});

const MON_ROWS: Seg[][] = [
  [['idle', 0, 4, 220]],
  [['move', 0, 6, null]],
  [['attack', 0, 4, [80, 70, 90, 120]]],
  [
    ['hit', 0, 2, [80, 120]],
    ['death', 2, 4, [100, 120, 140, 160]],
  ],
];
const MON_ANIMS: AnimInfo[] = [
  { name: 'idle', ...L },
  { name: 'move', ...L, stepTiles: 0.4 },
  { name: 'attack', ...ONCE },
  { name: 'hit', ...ONCE },
  { name: 'death', ...HOLD },
];

const mon = (size: [number, number], extra: Partial<Rule> = {}): Rule => ({
  cls: 'standee',
  palette: 'creature',
  maxColors: 32,
  outline: 'standee',
  anchor: 'foot',
  dirAxis: 'sheet',
  cells: (cols) => rowAnims(cols, MON_ROWS),
  anims: MON_ANIMS,
  inPlace: ['idle'],
  standing: ['idle'],
  sizeRange: size,
  ...extra,
});

const variants = (n: number, names?: string[]) => (cols: number, rows: number) =>
  sequence(
    cols,
    rows,
    (names ?? Array.from({ length: n }, (_, i) => `v${i + 1}`)).map(
      (nm) => [nm, 1, null] as [string, number, null],
    ),
  );

const prop = (): Rule => ({
  cls: 'standee',
  palette: 'style',
  outline: 'standee',
  anchor: 'foot',
  cells: variants(4),
  standing: [],
});

const icon = (palette: PaletteKind, keyed: boolean): Rule => ({
  cls: 'icon',
  palette,
  maxColors: palette === 'creature' ? 32 : undefined,
  outline: keyed ? 'standee' : 'none',
  anchor: 'center',
  cells: () => single(),
});

const FACADE = [
  'door_closed',
  'door_open',
  'window_day',
  'window_night',
  'window_small',
  'window_round',
  'sign_a',
  'sign_b',
  'awning',
  'chimney',
  'balcony',
  'flower_box',
  'lamp_off',
  'lamp_on',
  'lintel',
  'gable',
];

const RULES: Record<string, Rule> = {
  chr_idle: chr([['idle', 0, 4, 220]], [{ name: 'idle', ...L }], ['idle'], ['idle']),
  chr_walk: chr(
    [['walk', 0, 6, null]],
    [{ name: 'walk', ...L, stepTiles: 0.32 }],
    ['walk'],
    ['walk'],
  ),
  chr_run: chr([['run', 0, 6, null]], [{ name: 'run', ...L, stepTiles: 0.5 }], ['run'], ['run']),
  chr_attack_melee: chr(
    [['melee', 0, 4, [80, 70, 90, 120]]],
    [{ name: 'melee', ...ONCE }],
    [],
    ['melee'],
  ),
  chr_attack_thrust: chr(
    [['thrust', 0, 5, [80, 90, 70, 100, 120]]],
    [{ name: 'thrust', ...ONCE }],
    [],
    ['thrust'],
  ),
  chr_attack_ranged: chr(
    [['shoot', 0, 6, [120, 140, 100, 60, 100, 120]]],
    [{ name: 'shoot', ...ONCE }],
    [],
    ['shoot'],
  ),
  chr_cast: chr(
    [
      ['cast', 0, 4, 150],
      ['cast_release', 4, 4, [80, 60, 100, 140]],
    ],
    [
      { name: 'cast', ...L },
      { name: 'cast_release', ...ONCE },
    ],
    ['cast'],
    ['cast', 'cast_release'],
  ),
  chr_hit: chr(
    [
      ['hit', 0, 2, [80, 120]],
      ['block', 2, 2, [80, 160]],
      ['dodge', 4, 2, [70, 130]],
    ],
    [
      { name: 'hit', ...ONCE },
      { name: 'block', ...ONCE },
      { name: 'dodge', ...ONCE },
    ],
    [],
    ['hit', 'block'],
  ),
  chr_death: chr([['death', 0, 4, [100, 120, 140, 160]]], [{ name: 'death', ...HOLD }], [], []),
  chr_combat_idle: chr(
    [
      ['combat_idle', 0, 4, 200],
      ['stun', 4, 4, 160],
    ],
    [
      { name: 'combat_idle', ...L },
      { name: 'stun', ...L },
    ],
    ['combat_idle', 'stun'],
    ['combat_idle', 'stun'],
  ),
  chr_life_a: chr(
    [
      ['sit', 0, 2, 450],
      ['lie', 2, 2, 450],
      ['work', 4, 2, 450],
      ['carry', 6, 2, 450],
    ],
    ['sit', 'lie', 'work', 'carry'].map((name) => ({ name, ...L })),
    [],
    ['carry'],
  ),
  chr_life_b: chr(
    [
      ['pray', 0, 2, 450],
      ['talk', 2, 2, 450],
      ['eat', 4, 2, 450],
      ['read', 6, 2, 450],
    ],
    ['pray', 'talk', 'eat', 'read'].map((name) => ({ name, ...L })),
    [],
    ['talk'],
  ),
  chr_emote: {
    ...chr([], [], [], []),
    dirAxis: 'none',
    cells: (cols, rows) =>
      sequence(
        cols,
        rows,
        ['nod', 'shake', 'wave', 'bow', 'cheer', 'slump', 'angry', 'startle'].map(
          (n) => [n, 2, 250] as [string, number, number],
        ),
        'down',
      ),
    anims: ['nod', 'shake', 'wave', 'bow', 'cheer', 'slump', 'angry', 'startle'].map((name) => ({
      name,
      ...ONCE,
    })),
    standing: ['nod', 'wave', 'cheer'],
  },
  chr_signature: chr(
    [['signature', 0, 4, 220]],
    [{ name: 'signature', ...L }],
    ['signature'],
    ['signature'],
  ),
  chr_ride: chr(
    [
      ['ride_idle', 0, 2, 300],
      ['ride', 2, 4, null],
    ],
    [
      { name: 'ride_idle', ...L },
      { name: 'ride', ...L },
    ],
    [],
    [],
  ),
  doll_head: {
    cls: 'part',
    palette: 'creature',
    maxColors: 32,
    outline: 'standee',
    anchor: 'neck',
    dirAxis: 'cols',
    cells: () => dirCols(['down', 'right', 'up', 'left'], ['front', 'back'], [1]),
  },
  doll_face: {
    cls: 'part',
    palette: 'creature',
    maxColors: 32,
    outline: 'none',
    anchor: 'center',
    cells: (cols, rows) =>
      sequence(cols, rows, [
        ...[
          'eyes_open',
          'eyes_half',
          'eyes_closed',
          'eyes_bright',
          'eyes_smile',
          'eyes_pain',
          'eyes_wide',
          'eyes_down',
        ].map((n) => [n, 1, null] as [string, number, null]),
        ...[
          'mouth_none',
          'mouth_dot',
          'mouth_open',
          'mouth_smile',
          'mouth_round',
          'mouth_twist',
        ].map((n) => [n, 1, null] as [string, number, null]),
        [null, 2, null],
      ]),
  },
  doll_held: {
    cls: 'part',
    palette: 'creature',
    maxColors: 32,
    outline: 'standee',
    anchor: 'center',
    cells: variants(8, ['a000', 'a045', 'a090', 'a135', 'a180', 'a225', 'a270', 'a315']),
  },
  doll_back: {
    cls: 'part',
    palette: 'creature',
    maxColors: 32,
    outline: 'standee',
    anchor: 'none',
    dirAxis: 'cols',
    cells: () => dirCols(['down', 'right', 'up'], ['rest', 'sway']),
  },
  por_main: {
    cls: 'portrait',
    palette: 'creature',
    maxColors: 32,
    outline: 'portrait',
    anchor: 'center',
    cells: variants(8, [
      'neutral',
      'smile',
      'grin',
      'angry',
      'sad',
      'surprised',
      'thinking',
      'signature',
    ]),
  },
  por_npc: {
    cls: 'portrait',
    palette: 'creature',
    maxColors: 32,
    outline: 'portrait',
    anchor: 'center',
    cells: variants(4, ['neutral', 'happy', 'angry', 'worried']),
  },
  bust_base: {
    cls: 'portrait',
    palette: 'creature',
    maxColors: 48,
    outline: 'portrait',
    anchor: 'none',
    cells: () => single(),
  },
  bust_expr: {
    cls: 'portrait',
    palette: 'creature',
    maxColors: 48,
    outline: 'portrait',
    anchor: 'none',
    cells: variants(6, ['smile', 'angry', 'sad', 'surprised', 'thinking', 'signature']),
  },
  mon_small: mon([12, 46]),
  mon_medium: mon([20, 62]),
  mon_multileg: mon([20, 62]),
  mon_serpentine: mon([20, 62]),
  mon_amorphous: mon([16, 62]),
  mon_flying: mon([16, 62], { anchor: 'flying' }),
  mon_large: mon([36, 94], { big: true }),
  mon_drake: mon([36, 94], { big: true }),
  mon_huge: mon([56, 126], { big: true }),
  boss_sheet: {
    cls: 'standee',
    palette: 'creature',
    maxColors: 32,
    outline: 'standee',
    anchor: 'foot',
    dirAxis: 'sheet',
    big: true,
    sizeRange: [56, 126],
    cells: (cols) =>
      rowAnims(cols, [
        [['idle', 0, 6, 220]],
        [['move', 0, 6, null]],
        [['attack_a', 0, 8, 90]],
        [['attack_b', 0, 8, 90]],
        [['special', 0, 8, 100]],
        [
          ['hit', 0, 2, [80, 120]],
          ['death', 2, 6, 120],
        ],
      ]),
    anims: [
      { name: 'idle', ...L },
      { name: 'move', ...L, stepTiles: 0.4 },
      { name: 'attack_a', ...ONCE },
      { name: 'attack_b', ...ONCE },
      { name: 'special', ...ONCE },
      { name: 'hit', ...ONCE },
      { name: 'death', ...HOLD },
    ],
    inPlace: ['idle'],
    standing: ['idle'],
  },
  boss_parts: {
    cls: 'standee',
    palette: 'creature',
    maxColors: 32,
    outline: 'standee',
    anchor: 'none',
    big: true,
    cells: () => single('parts'),
  },
  boss_card: {
    cls: 'portrait',
    palette: 'creature',
    maxColors: 48,
    outline: 'portrait',
    anchor: 'none',
    cells: () => single(),
  },
  pet_mount: {
    ...mon([20, 62]),
    cells: (cols) =>
      rowAnims(cols, [[['idle', 0, 4, 220]], [['walk', 0, 6, null]], [['run', 0, 6, null]]]),
    anims: [
      { name: 'idle', ...L },
      { name: 'walk', ...L, stepTiles: 0.32 },
      { name: 'run', ...L, stepTiles: 0.5 },
    ],
  },
  pet_mount_large: {
    ...mon([36, 94], { big: true }),
    cells: (cols) =>
      rowAnims(cols, [[['idle', 0, 4, 220]], [['walk', 0, 6, null]], [['run', 0, 6, null]]]),
    anims: [
      { name: 'idle', ...L },
      { name: 'walk', ...L, stepTiles: 0.32 },
      { name: 'run', ...L, stepTiles: 0.5 },
    ],
  },
  unit_sheet: {
    ...mon([12, 46]),
    cells: (cols) =>
      rowAnims(cols, [
        [['march', 0, 4, null]],
        [['attack', 0, 4, [80, 70, 90, 120]]],
        [
          ['idle', 0, 2, 220],
          ['hit', 2, 2, [80, 120]],
        ],
        [['death', 0, 4, [100, 120, 140, 160]]],
      ]),
    anims: [
      { name: 'march', ...L, stepTiles: 0.32 },
      { name: 'attack', ...ONCE },
      { name: 'idle', ...L },
      { name: 'hit', ...ONCE },
      { name: 'death', ...HOLD },
    ],
  },
  unit_sheet_large: {
    ...mon([20, 62]),
    cells: (cols) =>
      rowAnims(cols, [
        [['march', 0, 4, null]],
        [['attack', 0, 4, [80, 70, 90, 120]]],
        [
          ['idle', 0, 2, 220],
          ['hit', 2, 2, [80, 120]],
        ],
        [['death', 0, 4, [100, 120, 140, 160]]],
      ]),
    anims: [
      { name: 'march', ...L, stepTiles: 0.32 },
      { name: 'attack', ...ONCE },
      { name: 'idle', ...L },
      { name: 'hit', ...ONCE },
      { name: 'death', ...HOLD },
    ],
  },
  tile_ground: {
    cls: 'texture',
    palette: 'style',
    outline: 'none',
    anchor: 'none',
    cells: () => single(),
    seamless: 'both',
    dither: true,
    fullBleed: true,
  },
  tile_detail: {
    cls: 'decal',
    palette: 'style',
    outline: 'none',
    anchor: 'center',
    cells: variants(
      16,
      Array.from({ length: 16 }, (_, i) => `decal_${String(i + 1).padStart(2, '0')}`),
    ),
  },
  bld_wall: {
    cls: 'texture',
    palette: 'style',
    outline: 'none',
    anchor: 'none',
    cells: () => single(),
    seamless: 'both',
    dither: true,
    fullBleed: true,
  },
  bld_roof: {
    cls: 'texture',
    palette: 'style',
    outline: 'none',
    anchor: 'none',
    cells: () => single(),
    seamless: 'both',
    dither: true,
    fullBleed: true,
  },
  bld_trim: {
    cls: 'strip',
    palette: 'style',
    outline: 'none',
    anchor: 'none',
    cells: variants(4, ['base', 'coping', 'eave', 'barge']),
    seamless: 'x',
    fullBleed: true,
  },
  bld_facade: {
    cls: 'facade',
    palette: 'style',
    outline: 'none',
    anchor: 'foot',
    cells: variants(16, FACADE),
  },
  bld_landmark: {
    cls: 'standee',
    palette: 'style',
    outline: 'standee',
    anchor: 'foot',
    big: true,
    cells: () => single(),
  },
  prop_small: prop(),
  prop_medium: prop(),
  prop_large: { ...prop(), big: true },
  prop_huge: { ...prop(), big: true, cells: () => single() },
  prop_node: { ...prop(), cells: variants(3, ['full', 'half', 'empty']) },
  bg_layer: {
    cls: 'backdrop',
    palette: 'style',
    outline: 'none',
    anchor: 'none',
    cells: () => single(),
    seamless: 'x',
    fullBleed: true,
  },
  bg_cg: {
    cls: 'flat',
    palette: 'style',
    outline: 'none',
    anchor: 'none',
    cells: () => single(),
    fullBleed: true,
  },
  ui_screen: {
    cls: 'flat',
    palette: 'style',
    outline: 'none',
    anchor: 'none',
    cells: () => single(),
    fullBleed: true,
  },
  ico_item: icon('creature', true),
  ico_building: icon('creature', true),
  ico_unit: icon('creature', true),
  ico_skill: { ...icon('creature', false), fullBleed: true },
  ico_aura: { ...icon('creature', false), fullBleed: true },
  ico_door: icon('creature', true),
  ico_deed: icon('creature', true),
  ico_achievement: icon('creature', true),
  ico_ui: icon('ui', true),
  ico_marker: icon('ui', true),
  vfx_small: {
    cls: 'vfx',
    palette: 'vfx',
    maxColors: 4,
    outline: 'none',
    anchor: 'center',
    cells: variantsTimed(8, 'play', 70),
    anims: [{ name: 'play', ...ONCE }],
    fadeLastFrame: true,
  },
  vfx_medium: {
    cls: 'vfx',
    palette: 'vfx',
    maxColors: 5,
    outline: 'none',
    anchor: 'center',
    cells: variantsTimed(8, 'play', 70),
    anims: [{ name: 'play', ...ONCE }],
    fadeLastFrame: true,
  },
  vfx_large: {
    cls: 'vfx',
    palette: 'vfx',
    maxColors: 6,
    outline: 'none',
    anchor: 'center',
    cells: variantsTimed(8, 'play', 70),
    anims: [{ name: 'play', ...ONCE }],
    fadeLastFrame: true,
  },
  vfx_projectile: {
    cls: 'vfx',
    palette: 'vfx',
    maxColors: 4,
    outline: 'none',
    anchor: 'center',
    cells: variantsTimed(4, 'loop', 80),
    anims: [{ name: 'loop', ...L }],
  },
  vfx_loop: {
    cls: 'vfx',
    palette: 'vfx',
    maxColors: 4,
    outline: 'none',
    anchor: 'center',
    cells: variantsTimed(8, 'loop', 100),
    anims: [{ name: 'loop', ...L }],
  },
  vfx_overlay: {
    cls: 'overlay',
    palette: 'gray',
    outline: 'none',
    anchor: 'none',
    cells: () => single(),
    seamless: 'both',
    fullBleed: true,
  },
  ui_card: {
    cls: 'flat',
    palette: 'none',
    outline: 'none',
    anchor: 'none',
    cells: () => single(),
    fullBleed: true,
  },
  ui_ornament: {
    cls: 'ornament',
    palette: 'two',
    outline: 'none',
    anchor: 'none',
    cells: () => single(),
  },
  ui_frame: {
    cls: 'ornament',
    palette: 'two',
    outline: 'none',
    anchor: 'none',
    cells: () => single(),
    fullBleed: true,
  },
  map_world: {
    cls: 'map',
    palette: 'none',
    outline: 'none',
    anchor: 'none',
    cells: () => single(),
    fullBleed: true,
  },
  map_region: {
    cls: 'map',
    palette: 'none',
    outline: 'none',
    anchor: 'none',
    cells: () => single(),
    fullBleed: true,
  },
  key_art_wide: {
    cls: 'key_art',
    palette: 'style',
    outline: 'none',
    anchor: 'none',
    cells: () => single(),
    fullBleed: true,
    pixelGrid: [960, 540],
    upscale: 4,
  },
  key_art_tall: {
    cls: 'key_art',
    palette: 'style',
    outline: 'none',
    anchor: 'none',
    cells: () => single(),
    fullBleed: true,
    pixelGrid: [300, 450],
    upscale: 2,
  },
  key_capsule: {
    cls: 'key_art',
    palette: 'style',
    outline: 'none',
    anchor: 'none',
    cells: () => single(),
    fullBleed: true,
    pixelGrid: [460, 215],
    upscale: 2,
  },
  key_emblem: {
    cls: 'key_art',
    palette: 'creature',
    outline: 'standee',
    anchor: 'center',
    cells: () => single(),
    pixelGrid: [256, 256],
    upscale: 2,
  },
};

function variantsTimed(n: number, name: string, ms: number) {
  return (cols: number, rows: number) => sequence(cols, rows, [[name, n, ms]]);
}

/** Templates whose output is only a reference image (final "ref"). */
export function isReference(t: TemplateLike): boolean {
  return (t.final ?? '').trim() === 'ref';
}

/** Body template of a humanoid sheet: small (hs) and big (hb) mannequins carry it in the id. */
/**
 * Body template of a humanoid sheet (3.2): the mannequin's own strips carry it in the id
 * (art_doll_mannequin_hs_idle); outfit strips inherit it from the mannequin strip they are
 * drawn over (their prompt dependency). Anything else is the standard H body.
 */
export function bodyOf(assetId: string, deps: readonly string[] = []): 'h' | 'hs' | 'hb' {
  for (const id of [assetId, ...deps]) {
    if (/_hs(_|$)/.test(id)) return 'hs';
    if (/_hb(_|$)/.test(id)) return 'hb';
  }
  return 'h';
}

const BODY = {
  h: { target: 28, min: 27, max: 30, anchor: [24, 44] as [number, number] },
  hs: { target: 21, min: 20, max: 22, anchor: [24, 44] as [number, number] },
  hb: { target: 34, min: 33, max: 35, anchor: [24, 46] as [number, number] },
};

export function knownTemplate(template: string): boolean {
  return template in RULES;
}

/** The full import spec of one asset (template rule plus the template's own geometry). */
export function importSpecFor(
  template: string,
  t: TemplateLike,
  assetId: string,
  deps: readonly string[] = [],
): ImportSpec {
  const canvas = dims(t.canvas, 'canvas');
  const grid = dims(t.grid ?? '1x1', 'grid');
  const bg = (t.background ?? '').trim().toLowerCase();
  if (isReference(t)) {
    return {
      template,
      cls: 'reference',
      canvas,
      final: null,
      grid,
      keying: 'none',
      palette: 'none',
      outline: 'none',
      anchor: 'none',
      dirAxis: 'none',
      cells: sequence(grid[0], grid[1], [['ref', grid[0] * grid[1], null]]),
      anims: [],
      inPlace: [],
      standing: [],
    };
  }
  const rule = RULES[template];
  if (!rule) throw new Error(`no import rule for template ${template}`);
  const final = dims(t.final, 'final size');
  const keying: Keying = bg === '#ff00ff' ? 'magenta' : bg === '#000000' ? 'black' : 'none';
  const cells = rule.cells(grid[0], grid[1]);
  if (cells.length !== grid[1] || cells.some((r) => r.length !== grid[0])) {
    throw new Error(`frame layout of ${template} does not match its ${grid[0]}x${grid[1]} grid`);
  }
  const spec: ImportSpec = {
    template,
    cls: rule.cls,
    canvas,
    final,
    grid,
    keying,
    palette: rule.palette,
    maxColors:
      rule.palette === 'vfx' ? (vfxColorCapFor(assetId) ?? rule.maxColors) : rule.maxColors,
    outline: rule.outline,
    anchor: template === 'prop_huge' && cutscenePropIsCentered(assetId) ? 'center' : rule.anchor,
    dirAxis: rule.dirAxis ?? 'none',
    cells,
    anims: rule.anims ?? [],
    inPlace: rule.inPlace ?? [],
    standing: rule.standing ?? [],
    seamless: rule.seamless,
    dither: rule.dither,
    fadeLastFrame: rule.fadeLastFrame,
    sizeRange: rule.sizeRange,
    big: rule.big,
    pixelGrid: rule.pixelGrid,
    upscale: rule.upscale,
    fullBleed: rule.fullBleed,
  };
  if (rule.humanoid) {
    const b = BODY[bodyOf(assetId, deps)];
    spec.body = { target: b.target, min: b.min, max: b.max };
    spec.anchorPx = b.anchor;
  } else if (spec.anchor === 'foot' || spec.anchor === 'flying') {
    // Creatures: bottom center, 4 px above the cell floor (3.2); props sit on the floor.
    const lift = rule.cls === 'standee' && rule.palette === 'creature' ? 4 : 1;
    spec.anchorPx = [Math.floor(final[0] / 2), final[1] - lift];
  } else if (spec.anchor === 'neck') {
    spec.anchorPx = [Math.floor(final[0] / 2), final[1] - 1];
  } else if (spec.anchor === 'center') {
    spec.anchorPx = [Math.floor(final[0] / 2), Math.floor(final[1] / 2)];
  } else if (template === 'doll_back') {
    // Back parts keep their place in the body's frame; the body's foot anchor is recorded.
    spec.anchorPx = [Math.floor(final[0] / 2), final[1] - 4];
  }
  if (template === 'mon_flying') spec.inPlace = [];
  if (spec.cls === 'vfx' && vfxKeepsFinalLight(assetId)) {
    spec.fadeLastFrame = false;
    spec.anims = spec.anims.map((anim) => ({ ...anim, hold: true }));
  }
  if (spec.cls === 'vfx' && vfxFillsCell(assetId)) spec.fullBleed = true;
  if (spec.cls === 'vfx' && vfxMovesInCell(assetId)) spec.anchor = 'none';
  return spec;
}

/** Frame cells in row-major order with their grid position (blank cells excluded). */
export function frameCells(spec: ImportSpec): { col: number; row: number; def: CellDef }[] {
  const out: { col: number; row: number; def: CellDef }[] = [];
  spec.cells.forEach((row, r) => {
    row.forEach((def, c) => {
      if (def.need !== 'blank') out.push({ col: c, row: r, def });
    });
  });
  return out;
}

/** Direction of a one-direction sheet from its id suffix (_d, _r, _u); 'front' otherwise. */
export function sheetDirection(assetId: string): string {
  if (assetId.endsWith('_d')) return 'down';
  if (assetId.endsWith('_r')) return 'right';
  if (assetId.endsWith('_u')) return 'up';
  return 'front';
}
