// What the accessibility settings write onto the page (ux_and_onboarding.md 18.2, 18.3, 18.8;
// art_pipeline.md 2.11, 2.12): the colour-vision mode, the text size, larger dialogue text and
// "reduce flashing and shaking". Every one of them only changes how things are drawn: a setting
// never hides or delays anything the player acts on (UX-6), so this model writes attributes,
// one text-size variable and one class, and nothing else.
//
// The document element carries:
//   data-color-mode   standard | red_green | blue_yellow | high_contrast (18.2)
//   data-text-size    small | standard | large | xlarge (18.3; the step is also a variable)
//   data-captions     off | important | all (18.4; the painter reads the style itself)
//   class hk-calm     reduce flashing and shaking is in force (18.8)
//   class hk-big-dlg  dialogue text one step larger (18.3)
//   --hk-text-scale   the text size step as a number, --hk-dlg-scale with the dialogue step
// src/client/access.css hangs the token overrides and the calm rules off those attributes.
// Pure; Node-tested. The thin DOM side is ./accessibility.ts.

import { flashReduced } from '../audio/audio_settings';
import type { Accessibility, CaptionMode, ColorMode, TextScale } from './settings_schema';

/** The text size steps of 18.3 by their stored scale. */
export const TEXT_SIZE_NAMES: Readonly<Record<string, string>> = {
  '0.9': 'small',
  '1': 'standard',
  '1.15': 'large',
  '1.3': 'xlarge',
};

/** One step larger for dialogue text (18.3: the dialogue switch adds a step). */
export const DIALOGUE_STEP = 1.15;

export interface AccessApply {
  colorMode: ColorMode;
  /** the text size step as a number (1 is the standard size) */
  textScale: TextScale;
  /** the name of the step, for `data-text-size` */
  textSize: string;
  /** the scale dialogue and cutscene text runs at (the step, one size larger when asked) */
  dialogueScale: number;
  /** reduce flashing and shaking is in force (the setting, or the system preference) */
  calm: boolean;
  largeDialogue: boolean;
  captions: CaptionMode;
}

/** What the page should carry for these settings. */
export function accessApply(
  a: Readonly<Accessibility>,
  captions: CaptionMode,
  systemReducedMotion: boolean,
): AccessApply {
  const scale = a.textScale;
  return {
    colorMode: a.colorMode,
    textScale: scale,
    textSize: TEXT_SIZE_NAMES[String(scale)] ?? 'standard',
    dialogueScale: a.largeDialogue ? round(scale * DIALOGUE_STEP) : scale,
    calm: flashReduced(a.reduceFlashing, systemReducedMotion),
    largeDialogue: a.largeDialogue,
    captions,
  };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** The attributes, classes and variables of an apply, as the painter writes them. */
export interface AccessWrites {
  attrs: Readonly<Record<string, string>>;
  vars: Readonly<Record<string, string>>;
  /** class name to whether it is on */
  classes: Readonly<Record<string, boolean>>;
}

export const CALM_CLASS = 'hk-calm';
export const BIG_DIALOGUE_CLASS = 'hk-big-dlg';

export function accessWrites(v: AccessApply): AccessWrites {
  return {
    attrs: {
      'data-color-mode': v.colorMode,
      'data-text-size': v.textSize,
      'data-captions': v.captions,
    },
    vars: {
      '--hk-text-scale': String(v.textScale),
      '--hk-dlg-scale': String(v.dialogueScale),
    },
    classes: { [CALM_CLASS]: v.calm, [BIG_DIALOGUE_CLASS]: v.largeDialogue },
  };
}

// ---------------------------------------------------------------------------
// Colour-vision token tables (18.2)

/** The semantic tokens the colour-vision modes replace (1.4). */
export type TokenId =
  | 'rel.self'
  | 'rel.friend'
  | 'rel.neutral'
  | 'rel.hostile'
  | 'warn.enemy'
  | 'warn.ally'
  | 'q.0'
  | 'q.1'
  | 'q.2'
  | 'q.3'
  | 'q.4'
  | 'q.5';

/** The shape that carries each token's meaning without its colour (18.2: always a shape too). */
export const TOKEN_SHAPES: Readonly<Record<TokenId, string>> = {
  'rel.self': 'ring_solid',
  'rel.friend': 'ring_double',
  'rel.neutral': 'ring_dashed',
  'rel.hostile': 'ring_gapped',
  'warn.enemy': 'hatch_diagonal',
  'warn.ally': 'hatch_dots',
  'q.0': 'dots_0',
  'q.1': 'dots_1',
  'q.2': 'dots_2',
  'q.3': 'dots_3',
  'q.4': 'dots_4',
  'q.5': 'dots_5',
};

/** The standard values of 1.4; a mode below lists only what it replaces (18.2). */
export const STANDARD_TOKENS: Readonly<Record<TokenId, string>> = {
  'rel.self': '#4fb3ff',
  'rel.friend': '#5ccb7a',
  'rel.neutral': '#e8d25a',
  'rel.hostile': '#e5534b',
  'warn.enemy': '#f06a3a',
  'warn.ally': '#3fc1b0',
  'q.0': '#9d9d9d',
  'q.1': '#f0ece4',
  'q.2': '#6ee05a',
  'q.3': '#5aa2ff',
  'q.4': '#c27aff',
  'q.5': '#ff9a3a',
};

/** 18.2 red-green: hostile pink-red, friendly cyan, warnings orange-yellow and blue. */
export const RED_GREEN_TOKENS: Partial<Record<TokenId, string>> = {
  'rel.hostile': '#d94fc1',
  'rel.friend': '#3fb6e8',
  'warn.enemy': '#f0a030',
  'warn.ally': '#4f7fe8',
  'q.2': '#8fc8f0',
  'q.4': '#f0b040',
};

/** 18.2 blue-yellow: neutral light grey, friendly warning teal, fine quality magenta. */
export const BLUE_YELLOW_TOKENS: Partial<Record<TokenId, string>> = {
  'rel.neutral': '#c8c8c8',
  'warn.ally': '#30c8a0',
  'q.3': '#c060b0',
};

/** The tokens of a mode: the standard table with the mode's replacements (high contrast keeps
 * the standard hues and raises the panels and borders, which is CSS, not a token). */
export function modeTokens(mode: ColorMode): Readonly<Record<TokenId, string>> {
  const over =
    mode === 'red_green'
      ? RED_GREEN_TOKENS
      : mode === 'blue_yellow'
        ? BLUE_YELLOW_TOKENS
        : undefined;
  return over ? { ...STANDARD_TOKENS, ...over } : STANDARD_TOKENS;
}

/** The CSS variable of a token (`rel.self` to `--hk-rel-self`). */
export function tokenVar(id: TokenId): string {
  return `--hk-${id.replace('.', '-')}`;
}

// ---------------------------------------------------------------------------
// Contrast (18.2: text 4.5:1, graphics 3:1, measured against the panel background)

/** The panel background a token is drawn on (1.4 night panel over the world). */
export const PANEL_BG = '#17141f';
/** The high-contrast panel background (18.2: panels are opaque). */
export const HIGH_CONTRAST_BG = '#000000';

/** sRGB relative luminance of a `#rrggbb` colour. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return Number.NaN;
  const n = Number.parseInt(m[1] as string, 16);
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel((n >> 16) & 0xff);
  const g = channel((n >> 8) & 0xff);
  const b = channel(n & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two `#rrggbb` colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  if (Number.isNaN(la) || Number.isNaN(lb)) return Number.NaN;
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
