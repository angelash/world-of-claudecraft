// Normalise a world Appearance (base, colors, scale) into a SpriteLook: a canonical
// archetype, a palette of slot ramps, and a stable cache key. Unknown bases fall back
// deterministically. A look also carries its art body (the imported template family its
// AI art uses, art_pipeline.md 3.2) and the asset references the asset resolver reads
// (src/client/assets/); the archetype and the key only describe the procedural
// placeholder, so they never change when art arrives. Pure.

import type { Appearance, AppearanceVariant, DollRecipe } from '../../systems/world/types';
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

/**
 * Bases other systems may write, mapped onto the archetype that draws them. Creature bodies
 * without a drawing of their own (rats, spiders, worms, drakes) are drawn as the four-legged
 * creature, as the generic 'beast' monsters were in the first round (art_pipeline.md 3.8);
 * their own silhouettes come from their art.
 */
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
  shade: 'spirit',
  wisp: 'spirit',
  fairy: 'spirit',
  elemental: 'spirit',
  boar: 'wolf',
  bear: 'wolf',
  rat: 'wolf',
  hare: 'wolf',
  spider: 'wolf',
  centipede: 'wolf',
  beetle: 'wolf',
  crab: 'wolf',
  scorpion: 'wolf',
  worm: 'wolf',
  leech: 'wolf',
  snake: 'wolf',
  eel: 'wolf',
  drake: 'wolf',
  wyrm: 'wolf',
  deer: 'wolf',
  elk: 'wolf',
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

/**
 * Art body of a look (art_pipeline.md 3.2): the template family its AI art is drawn on. People
 * use the paper-doll mannequins (h, hs, hb; main characters draw their own strips on the same
 * frame), creatures one mon_* template each, objects are props.
 */
export const BODY_TYPES = [
  'h',
  'hs',
  'hb',
  'small',
  'medium',
  'large',
  'multileg',
  'serpentine',
  'flying',
  'amorphous',
  'drake',
  'object',
] as const;
export type BodyType = (typeof BODY_TYPES)[number];

/** Creature bodies (one sheet per display direction, art_pipeline.md 3.8). */
export const CREATURE_BODIES: ReadonlySet<BodyType> = new Set<BodyType>([
  'small',
  'medium',
  'large',
  'multileg',
  'serpentine',
  'flying',
  'amorphous',
  'drake',
]);

/**
 * Import template of each creature body (art_pipeline.md 3.2 and 11) for ordinary monsters;
 * bosses draw on boss_sheet and mounts on pet_mount whatever their body.
 */
export const BODY_TEMPLATE: Readonly<Partial<Record<BodyType, string>>> = {
  small: 'mon_small',
  medium: 'mon_medium',
  large: 'mon_large',
  multileg: 'mon_multileg',
  serpentine: 'mon_serpentine',
  flying: 'mon_flying',
  amorphous: 'mon_amorphous',
  drake: 'mon_drake',
};

/** Body aliases a base may name directly (monsters.json writes the creature ones). */
const BODY_OF_BASE: Readonly<Record<string, BodyType>> = {
  rat: 'small',
  hare: 'small',
  fox: 'small',
  wolf: 'medium',
  boar: 'medium',
  deer: 'medium',
  // a moose stands a head over the deer and draws on the large creature sheet
  elk: 'large',
  dog: 'medium',
  hound: 'medium',
  bear: 'large',
  spider: 'multileg',
  centipede: 'multileg',
  beetle: 'multileg',
  crab: 'multileg',
  scorpion: 'multileg',
  worm: 'serpentine',
  leech: 'serpentine',
  snake: 'serpentine',
  eel: 'serpentine',
  drake: 'drake',
  wyrm: 'drake',
  // a hulking elemental mass and a two-legged shade take creature sheets of their size
  elemental: 'large',
  shade: 'medium',
  ogre: 'hb',
  // a contract imp is a small creature on the mon_small sheet of its summoned kin
  imp: 'small',
};

/** Body of an archetype when the base names no body of its own. */
function archetypeBody(a: Archetype, kind: string): BodyType {
  switch (a) {
    case 'dwarf':
    case 'halfling':
      return 'hs';
    case 'wolf':
      return 'medium';
    case 'bird':
      return 'flying';
    case 'slime':
    case 'spirit':
      return 'amorphous';
    case 'golem':
      return 'large';
    case 'object':
      return 'object';
    case 'undead':
      // Undead monsters (bones, ghouls) use creature sheets; an undead person is a person.
      return kind === 'monster' ? 'medium' : 'h';
    default:
      return 'h';
  }
}

/** The art body of an appearance on an entity of `kind` (art_pipeline.md 3.2 and 3.8). */
export function bodyOf(base: string | undefined, kind: string): BodyType {
  const b = (base ?? '').trim().toLowerCase();
  if (Object.hasOwn(BODY_OF_BASE, b)) return BODY_OF_BASE[b] as BodyType;
  if (kind === 'monster' && b === 'beast') return 'medium';
  return archetypeBody(resolveArchetype(b), kind);
}

/** Asset references of a look, copied from its Appearance (art_pipeline.md 3.1). */
export interface LookArt {
  sheet?: string;
  doll?: DollRecipe;
  portrait?: string;
  bust?: string;
  variants?: Readonly<Record<string, AppearanceVariant>>;
  /** content id whose creature sheets the look uses (a monster's id) */
  subject?: string;
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
  /** stable cache key of the procedural placeholder */
  key: string;
  /** art body: which template family the look's AI art uses */
  body: BodyType;
  /** asset references, when the appearance names any or the entity has creature sheets */
  art?: LookArt;
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
  const body = bodyOf(a.base, 'npc');
  const art = artOf(a, undefined);
  return {
    archetype,
    scale,
    primary,
    secondary,
    skin,
    hair,
    glow,
    glyph,
    key,
    body,
    ...(art ? { art } : {}),
  };
}

function artOf(a: Appearance, subject: string | undefined): LookArt | undefined {
  const art: LookArt = {};
  if (a.sheet) art.sheet = a.sheet;
  if (a.doll) art.doll = a.doll;
  if (a.portrait) art.portrait = a.portrait;
  if (a.bust) art.bust = a.bust;
  if (a.variants && Object.keys(a.variants).length > 0) art.variants = a.variants;
  if (subject) art.subject = subject;
  return Object.keys(art).length > 0 ? art : undefined;
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
 * Look for a world entity, by art body (art_pipeline.md 3.2 and 3.8). Creature bodies take
 * creature sheets named after the entity's content id (`ref`) and draw as their placeholder
 * archetype (every creature body without a drawing of its own is the four-legged creature);
 * people keep their archetype and take a frame sheet or a paper doll; objects are props. A
 * monster still written with the generic base 'beast' is a medium four-legged creature, while
 * a resident written 'beast' is beastkin.
 */
export function lookFromEntity(e: {
  appearance: Appearance;
  kind: string;
  ref?: string;
}): SpriteLook {
  const a = e.appearance;
  const body = bodyOf(a.base, e.kind);
  if (CREATURE_BODIES.has(body)) {
    const generic = e.kind === 'monster' && (a.base ?? '').trim().toLowerCase() === 'beast';
    const look = lookFromAppearance(generic ? { ...a, base: 'wolf' } : a);
    const art = artOf(a, e.ref);
    return { ...look, body, ...(art ? { art } : {}) };
  }
  return { ...lookFromAppearance(a), body };
}
