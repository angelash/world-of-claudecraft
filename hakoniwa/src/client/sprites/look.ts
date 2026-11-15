// Normalise a world Appearance (base, colors, scale) into a SpriteLook: a canonical
// archetype, a palette of slot ramps, and a stable cache key. Unknown bases fall back
// deterministically. Pure.

import type { Appearance } from '../../systems/world/types';
import { parseHex, shadeRamp } from './palette';
import type { Rgb } from './pixels';
import { SLOT, type SlotPalette } from './shape';

export const ARCHETYPES = [
  'human',
  'elf',
  'dwarf',
  'halfling',
  'beastkin',
  'demon',
  'undead',
  'slime',
  'wolf',
  'bird',
  'golem',
  'spirit',
  'goddess',
  'object',
] as const;

export type Archetype = (typeof ARCHETYPES)[number];

/** Bases other systems may write, mapped onto the archetype that draws them. */
const ALIASES: Record<string, Archetype> = {
  beast: 'beastkin',
  wolfkin: 'beastkin',
  foxkin: 'beastkin',
  catkin: 'beastkin',
  orc: 'demon',
  ogre: 'demon',
  imp: 'demon',
  skeleton: 'undead',
  zombie: 'undead',
  ghoul: 'undead',
  ghost: 'spirit',
  wisp: 'spirit',
  fairy: 'spirit',
  elemental: 'spirit',
  boar: 'wolf',
  bear: 'wolf',
  deer: 'wolf',
  dog: 'wolf',
  fox: 'wolf',
  hound: 'wolf',
  crow: 'bird',
  raven: 'bird',
  bat: 'bird',
  owl: 'bird',
  construct: 'golem',
  statue: 'golem',
  ooze: 'slime',
  jelly: 'slime',
  god: 'goddess',
  deity: 'goddess',
  prop: 'object',
  sign: 'object',
  chest: 'object',
  item: 'object',
};

export function resolveArchetype(base: string | undefined): Archetype {
  const b = (base ?? '').trim().toLowerCase();
  if ((ARCHETYPES as readonly string[]).includes(b)) return b as Archetype;
  return ALIASES[b] ?? 'human';
}

export type BodyTemplate = 'H' | 'HS' | 'HL' | 'Q' | 'F' | 'B' | 'O';

/** Body template of art_pipeline.md 3.2 (B = blob, O = object). */
export function bodyTemplate(a: Archetype): BodyTemplate {
  switch (a) {
    case 'dwarf':
    case 'halfling':
      return 'HS';
    case 'golem':
      return 'HL';
    case 'wolf':
      return 'Q';
    case 'bird':
      return 'F';
    case 'slime':
    case 'spirit':
      return 'B';
    case 'object':
      return 'O';
    default:
      return 'H';
  }
}

export interface SpriteLook {
  archetype: Archetype;
  /** integer-friendly size multiplier; more pixels, never runtime scaling */
  scale: number;
  primary: Rgb;
  secondary: Rgb;
  skin: Rgb;
  hair: Rgb;
  glow: Rgb;
  glyph?: string;
  /** stable cache key */
  key: string;
}

const DEFAULTS: Record<Archetype, [Rgb, Rgb, Rgb, Rgb]> = {
  human: [0x3b4a6b, 0xc9b38a, 0xf1c9a5, 0x4a3426],
  elf: [0x3f6b4a, 0xd8cfa0, 0xf4d8bc, 0xe0c878],
  dwarf: [0x7a4a2e, 0x5a5f6a, 0xe8b894, 0xa0522d],
  halfling: [0x6b8a3a, 0x8a6a48, 0xf0c8a0, 0x7a4a26],
  beastkin: [0x6a4a3a, 0xb89a72, 0xf0c8a0, 0x9a6a3a],
  demon: [0x4a2a3a, 0x8a2a2a, 0xc87a7a, 0x2a1a2a],
  undead: [0x4a4a3e, 0x6a6458, 0x9fb39a, 0x3a3a34],
  slime: [0x5aaa6a, 0x3a7a4a, 0xd0ffd8, 0x2a4a30],
  wolf: [0x6a6a72, 0xb8b8bc, 0x3a3a40, 0x2a2a30],
  bird: [0x2a2a38, 0x4a4a5a, 0xe2b04a, 0x1a1a24],
  golem: [0x7a7468, 0x5a7a4a, 0x9a9488, 0x4a463e],
  spirit: [0x8ad0ff, 0xd8f0ff, 0xffffff, 0x3a6a9a],
  goddess: [0xf4ecd8, 0xd8b45a, 0xf8e0c8, 0xf0e0b0],
  object: [0x8a6a48, 0x5a4030, 0xb8a888, 0x3a2a1e],
};

const GLOW: Record<Archetype, Rgb> = {
  human: 0xffe9a0,
  elf: 0xd8ffb0,
  dwarf: 0xffd080,
  halfling: 0xffe9a0,
  beastkin: 0xffe9a0,
  demon: 0xff6a4a,
  undead: 0x9cff8a,
  slime: 0xe8fff0,
  wolf: 0xffe060,
  bird: 0xffd060,
  golem: 0x7fd8ff,
  spirit: 0xf0faff,
  goddess: 0xfff3c0,
  object: 0xffe0a0,
};

export function clampScale(scale: number | undefined): number {
  if (scale === undefined || !Number.isFinite(scale)) return 1;
  return Math.max(0.5, Math.min(4, Math.round(scale * 4) / 4));
}

export function lookFromAppearance(a: Appearance): SpriteLook {
  const archetype = resolveArchetype(a.base);
  const def = DEFAULTS[archetype];
  const c = a.colors ?? [];
  const primary = parseHex(c[0], def[0]);
  const secondary = parseHex(c[1], def[1]);
  const skin = parseHex(c[2], def[2]);
  const hair = parseHex(c[3], def[3]);
  const scale = clampScale(a.scale);
  const glow = archetype === 'spirit' ? mixToward(primary, 0xffffff, 0.6) : GLOW[archetype];
  const glyph = a.glyph ? Array.from(a.glyph)[0] : undefined;
  const key = [archetype, scale, primary, secondary, skin, hair].map(String).join(':');
  return { archetype, scale, primary, secondary, skin, hair, glow, glyph, key };
}

function mixToward(a: Rgb, b: Rgb, t: number): Rgb {
  const r = Math.round(((a >> 16) & 0xff) * (1 - t) + ((b >> 16) & 0xff) * t);
  const g = Math.round(((a >> 8) & 0xff) * (1 - t) + ((b >> 8) & 0xff) * t);
  const bl = Math.round((a & 0xff) * (1 - t) + (b & 0xff) * t);
  return (r << 16) | (g << 8) | bl;
}

const FIXED = {
  eye: 0x2b2433,
  metal: 0xb8c0cc,
  leather: 0x6b4a32,
  white: 0xf4f1e8,
  bone: 0xd9cfb4,
  accent: 0xe2b04a,
};

const rampCache = new Map<Rgb, Rgb[]>();
function ramp(rgb: Rgb): Rgb[] {
  let r = rampCache.get(rgb);
  if (!r) {
    r = shadeRamp(rgb);
    rampCache.set(rgb, r);
  }
  return r;
}

/** Ramps for every slot of a look. */
export function paletteFor(look: SpriteLook): SlotPalette {
  return {
    [SLOT.PRIMARY]: ramp(look.primary),
    [SLOT.SECONDARY]: ramp(look.secondary),
    [SLOT.SKIN]: ramp(look.skin),
    [SLOT.HAIR]: ramp(look.hair),
    [SLOT.EYE]: ramp(FIXED.eye),
    [SLOT.METAL]: ramp(FIXED.metal),
    [SLOT.LEATHER]: ramp(FIXED.leather),
    [SLOT.WHITE]: ramp(FIXED.white),
    [SLOT.BONE]: ramp(FIXED.bone),
    [SLOT.ACCENT]: ramp(FIXED.accent),
  };
}

/**
 * Look for a world entity. Monsters written with the generic base 'beast' (rats, boars,
 * spiders, drakes) are four-legged creatures; residents with 'beast' are beastkin.
 */
export function lookFromEntity(e: { appearance: Appearance; kind: string }): SpriteLook {
  const a = e.appearance;
  if (e.kind === 'monster' && (a.base ?? '').trim().toLowerCase() === 'beast') {
    return lookFromAppearance({ ...a, base: 'wolf' });
  }
  return lookFromAppearance(a);
}
