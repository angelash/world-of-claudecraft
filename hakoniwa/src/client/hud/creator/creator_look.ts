// The spirit mirror's look (`ui_mode_creator`, ux_and_onboarding.md 3.4.3; prologue P4): the
// option tables of the four pages (body: sex and body template; face: eyes, mouth, skin;
// hair: style and colour; outfit: silhouette and palette), the look string the kernel keeps in
// `p_appearance` (so a save restores the mirror), and the paper-doll assembly: a look becomes
// an Appearance with the four key colours and a doll recipe of `art_doll_` ids
// (art_pipeline.md 3.3). Until those parts are approved art, the standee is the procedural
// placeholder of the same colours (src/client/assets/doll_compose.ts). Pure; Node-tested.

import type { Appearance, DollBody } from '../../../systems/world/types';

export const CREATOR_SEXES = ['f', 'm'] as const;
export const CREATOR_BODIES: readonly DollBody[] = ['h', 'hs', 'hb'];
/** Eye and mouth cells of the face sheet (doll_face: eight eyes, six mouths; four and three offered). */
export const CREATOR_EYES = ['soft', 'round', 'narrow', 'sharp'] as const;
export const CREATOR_MOUTHS = ['calm', 'smile', 'firm'] as const;
/** Skin tones (the six snapshots of the mirror, prologue.json n3_mirror). */
export const CREATOR_SKINS = ['#f1c9a5', '#eac4a0', '#f6d7bd', '#c99169', '#f3d2b8', '#8d5a3b'];
/** Hair styles: the `art_doll_head_hair_<style>` parts. */
export const CREATOR_HAIR = [
  'short',
  'crop',
  'side_part',
  'bob',
  'long_straight',
  'long_wavy',
  'ponytail_low',
  'curly_short',
  'bun',
  'modern_layered',
] as const;
export const CREATOR_HAIR_COLORS = [
  '#1f1b18',
  '#151214',
  '#4a2f1d',
  '#5b3a24',
  '#7a3a2a',
  '#d6b25e',
  '#a3abb2',
  '#2b2b2b',
];
/**
 * Outfits: the earth residents' clothes (`art_doll_res_<outfit>` strips, drawn on the standard
 * mannequin; the small and big bodies take `_hs` and `_hb` strips of their own, art_pipeline.md
 * 3.3: every outfit is drawn on the mannequin of its body).
 */
export const CREATOR_OUTFITS = ['earth_casual', 'earth_office'] as const;
/** Outfit palettes, [primary, secondary] (the snapshots' first two colours). */
export const CREATOR_PALETTES: readonly (readonly [string, string])[] = [
  ['#3a3f4b', '#6b7280'],
  ['#c9b38c', '#6b4f3a'],
  ['#8a8f96', '#2f3b4c'],
  ['#2f5d50', '#a47c52'],
  ['#e9edf0', '#2c3e57'],
  ['#7a2e3b', '#3a3236'],
];

export interface CreatorLook {
  sex: (typeof CREATOR_SEXES)[number];
  body: DollBody;
  eyes: number;
  mouth: number;
  skin: number;
  hair: (typeof CREATOR_HAIR)[number];
  hairColor: number;
  outfit: (typeof CREATOR_OUTFITS)[number];
  palette: number;
}

/** Every option row of the mirror, in page order. */
export const CREATOR_ROWS = [
  'sex',
  'body',
  'eyes',
  'mouth',
  'skin',
  'hair',
  'hairColor',
  'outfit',
  'palette',
] as const;
export type CreatorRow = (typeof CREATOR_ROWS)[number];

/** How many options a row has. */
export function rowSize(row: CreatorRow): number {
  switch (row) {
    case 'sex':
      return CREATOR_SEXES.length;
    case 'body':
      return CREATOR_BODIES.length;
    case 'eyes':
      return CREATOR_EYES.length;
    case 'mouth':
      return CREATOR_MOUTHS.length;
    case 'skin':
      return CREATOR_SKINS.length;
    case 'hair':
      return CREATOR_HAIR.length;
    case 'hairColor':
      return CREATOR_HAIR_COLORS.length;
    case 'outfit':
      return CREATOR_OUTFITS.length;
    case 'palette':
      return CREATOR_PALETTES.length;
  }
}

/** The option id of cell `i` of a row (its label key's last part); colours are numbered. */
export function optionId(row: CreatorRow, i: number): string {
  switch (row) {
    case 'sex':
      return CREATOR_SEXES[i] ?? '';
    case 'body':
      return CREATOR_BODIES[i] ?? '';
    case 'eyes':
      return CREATOR_EYES[i] ?? '';
    case 'mouth':
      return CREATOR_MOUTHS[i] ?? '';
    case 'hair':
      return CREATOR_HAIR[i] ?? '';
    case 'outfit':
      return CREATOR_OUTFITS[i] ?? '';
    default:
      return String(i);
  }
}

/** The option index a look has in a row. */
export function rowIndex(look: CreatorLook, row: CreatorRow): number {
  switch (row) {
    case 'sex':
      return CREATOR_SEXES.indexOf(look.sex);
    case 'body':
      return CREATOR_BODIES.indexOf(look.body);
    case 'hair':
      return CREATOR_HAIR.indexOf(look.hair);
    case 'outfit':
      return CREATOR_OUTFITS.indexOf(look.outfit);
    default:
      return look[row];
  }
}

/** The look with option `index` (wrapped into range) in a row. */
export function withRow(look: CreatorLook, row: CreatorRow, index: number): CreatorLook {
  const n = rowSize(row);
  const i = ((Math.floor(index) % n) + n) % n;
  switch (row) {
    case 'sex':
      return { ...look, sex: CREATOR_SEXES[i] ?? look.sex };
    case 'body':
      return { ...look, body: CREATOR_BODIES[i] ?? look.body };
    case 'hair':
      return { ...look, hair: CREATOR_HAIR[i] ?? look.hair };
    case 'outfit':
      return { ...look, outfit: CREATOR_OUTFITS[i] ?? look.outfit };
    default:
      return { ...look, [row]: i };
  }
}

export const DEFAULT_LOOK: CreatorLook = {
  sex: 'f',
  body: 'h',
  eyes: 0,
  mouth: 0,
  skin: 0,
  hair: 'short',
  hairColor: 0,
  outfit: 'earth_casual',
  palette: 0,
};

/** A look drawn at random (`rand` returns [0, 1); the mirror's "随机"). */
export function randomLook(rand: () => number): CreatorLook {
  let look = DEFAULT_LOOK;
  for (const row of CREATOR_ROWS) look = withRow(look, row, Math.floor(rand() * rowSize(row)));
  return look;
}

// ---------------------------------------------------------------------------
// The look string (registry p_appearance, text): `v1;sx=f;b=h;ey=0;mo=0;sk=0;ha=short;hc=0;
// ou=earth_casual;pa=0`. Short, flag-safe, and stable when options are appended to a table.

const CODES: Record<CreatorRow, string> = {
  sex: 'sx',
  body: 'b',
  eyes: 'ey',
  mouth: 'mo',
  skin: 'sk',
  hair: 'ha',
  hairColor: 'hc',
  outfit: 'ou',
  palette: 'pa',
};

const NAMED: ReadonlySet<CreatorRow> = new Set(['sex', 'body', 'hair', 'outfit']);

function optionName(look: CreatorLook, row: CreatorRow): string {
  return NAMED.has(row) ? String(look[row]) : String(rowIndex(look, row));
}

export function encodeLook(look: CreatorLook): string {
  return ['v1', ...CREATOR_ROWS.map((r) => `${CODES[r]}=${optionName(look, r)}`)].join(';');
}

/**
 * The look a string encodes, or null when it is no creator look. A field that names an option
 * the tables no longer have keeps the default (an old save never fails to open the mirror).
 */
export function decodeLook(text: string): CreatorLook | null {
  const parts = String(text ?? '').split(';');
  if (parts[0] !== 'v1') return null;
  const fields = new Map<string, string>();
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) fields.set(p.slice(0, eq), p.slice(eq + 1));
  }
  let look = DEFAULT_LOOK;
  for (const row of CREATOR_ROWS) {
    const v = fields.get(CODES[row]);
    if (v === undefined) continue;
    let index: number;
    if (row === 'sex') index = CREATOR_SEXES.indexOf(v as CreatorLook['sex']);
    else if (row === 'body') index = CREATOR_BODIES.indexOf(v as DollBody);
    else if (row === 'hair') index = CREATOR_HAIR.indexOf(v as CreatorLook['hair']);
    else if (row === 'outfit') index = CREATOR_OUTFITS.indexOf(v as CreatorLook['outfit']);
    else index = /^\d+$/.test(v) && Number(v) < rowSize(row) ? Number(v) : -1;
    if (index >= 0) look = withRow(look, row, index);
  }
  return look;
}

/**
 * The look to start the mirror from: the saved look string, else the closest look to the
 * player's appearance (a snapshot's colours, matched exactly where they appear in the tables).
 */
export function lookOf(saved: unknown, appearance?: Pick<Appearance, 'colors'>): CreatorLook {
  const decoded = typeof saved === 'string' ? decodeLook(saved) : null;
  if (decoded) return decoded;
  const c = (appearance?.colors ?? []).map((x) => String(x).toLowerCase());
  const at = (table: readonly string[], v: string | undefined) =>
    Math.max(0, v ? table.indexOf(v) : 0);
  const palette = CREATOR_PALETTES.findIndex(([a, b]) => a === c[0] && b === c[1]);
  return {
    ...DEFAULT_LOOK,
    palette: Math.max(0, palette),
    skin: at(CREATOR_SKINS, c[2]),
    hairColor: at(CREATOR_HAIR_COLORS, c[3]),
  };
}

// ---------------------------------------------------------------------------
// paper-doll assembly

/** The head base part of a body (art_pipeline.md 3.3, doll_head row 1). */
export function headPart(body: DollBody): string {
  return body === 'hs' ? 'art_doll_head_base_hs_halfling' : `art_doll_head_base_${body}`;
}

/** The outfit strip family of a body: the standard mannequin's, or the body's own. */
export function outfitPart(outfit: CreatorLook['outfit'], body: DollBody): string {
  return body === 'h' ? `art_doll_res_${outfit}` : `art_doll_res_${outfit}_${body}`;
}

/**
 * The Appearance a look wears: the key colours [outfit primary, outfit secondary, skin, hair]
 * the placeholder and the recolouring both read, and the doll recipe (mannequin body, outfit
 * strips, head base, hair). The face cells (eyes, mouth) are chosen by expression on the head
 * (3.3), so they live in the look string only.
 */
export function appearanceOf(look: CreatorLook): Pick<Appearance, 'base' | 'colors' | 'doll'> {
  const pal = CREATOR_PALETTES[look.palette] ?? CREATOR_PALETTES[0];
  return {
    base: 'human',
    colors: [
      pal?.[0] ?? '#3a3f4b',
      pal?.[1] ?? '#6b7280',
      CREATOR_SKINS[look.skin] ?? '#f1c9a5',
      CREATOR_HAIR_COLORS[look.hairColor] ?? '#1f1b18',
    ],
    doll: {
      body: look.body,
      outfit: outfitPart(look.outfit, look.body),
      head: headPart(look.body),
      hair: `art_doll_head_hair_${look.hair}`,
    },
  };
}

/** The result the mirror hands the kernel (`scenes.ui_done`; scenes/ui_results.ts checks it). */
export function creatorResult(look: CreatorLook): {
  appearance: Pick<Appearance, 'base' | 'colors' | 'doll'>;
  look: string;
} {
  return { appearance: appearanceOf(look), look: encodeLook(look) };
}
