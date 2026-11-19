// The world picture's semantic colours by colour-vision mode (ux_and_onboarding.md 18.2;
// art_pipeline.md 4.1, 4.6): the selection rings under figures, the ground warnings, the
// overhead name colours, the minimap and map-window dots. The DOM interface reads the same
// colours as CSS tokens (src/client/access.css, `--hk-rel-*`, `--hk-warn-*`); the canvas
// painters cannot read CSS, so they read this table through `activePalette()`, set once by the
// session (`setColourMode`) beside src/client/app/accessibility.ts. Only the hues move: the
// shapes that carry the same meaning stay (the hostile ring's four gaps, the threat ring's thin
// outer line, the cast bar's shield border; warnings keep their outline and growing fill), and
// nothing is hidden (UX-6). The high-contrast mode keeps the standard hues (it changes panels,
// which is CSS). Pure; Node-tested.

/** The colour-vision modes (the settings' `accessibility.colorMode`). */
export type PaletteMode = 'standard' | 'red_green' | 'blue_yellow' | 'high_contrast';

export interface WarningColors {
  edge: string;
  fill: string;
  core: string;
}

export interface WorldPalette {
  mode: PaletteMode;
  /** selection ring colours (0xRRGGBB) by ring style */
  rings: {
    self: number;
    hostile: number;
    friendly: number;
    neutral: number;
    hover: number;
    threat: number;
  };
  /** overhead name colours by relation, and the name of an enemy attacking the player */
  names: { self: string; hostile: string; friendly: string; neutral: string; threat: string };
  /** ground warnings (4.6): hostile and friendly casts */
  warnings: { hostile: WarningColors; friendly: WarningColors };
  /** minimap and map-window dots by relation, plus exits and danger markers */
  dots: {
    self: string;
    hostile: string;
    friendly: string;
    neutral: string;
    exit: string;
    danger: string;
  };
}

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

function rgba(color: number, a: number): string {
  return `rgba(${(color >> 16) & 0xff},${(color >> 8) & 0xff},${color & 0xff},${a})`;
}

function warning(edge: number): WarningColors {
  return { edge: hex(edge), fill: rgba(edge, 0.22), core: rgba(edge, 0.38) };
}

/** The standard colours (the values the painters had before the modes). */
export const STANDARD_PALETTE: WorldPalette = {
  mode: 'standard',
  rings: {
    self: 0xf0e6c8,
    hostile: 0xe0503c,
    friendly: 0x6cd06a,
    neutral: 0xe8c84a,
    hover: 0xffffff,
    threat: 0xff3a2a,
  },
  names: {
    self: '#f4ecd4',
    hostile: '#ff8a78',
    friendly: '#b8f0a8',
    neutral: '#f4e08a',
    threat: '#ff4a3a',
  },
  warnings: {
    hostile: { edge: '#ff5a2e', fill: 'rgba(255,90,46,0.22)', core: 'rgba(255,120,60,0.38)' },
    friendly: { edge: '#3ad0b8', fill: 'rgba(58,208,184,0.18)', core: 'rgba(58,208,184,0.32)' },
  },
  dots: {
    self: '#ffffff',
    hostile: '#ff5a48',
    friendly: '#7ee07a',
    neutral: '#f0d050',
    exit: '#f2c94c',
    danger: '#ff5a48',
  },
};

/**
 * 18.2 red-green: hostile pink-red `#D94FC1`, friendly cyan `#3FB6E8`, the enemy's warnings
 * orange-yellow `#F0A030`, the friendly ones blue `#4F7FE8`. The threat ring and name stay a
 * step brighter than the hostile hue, so an attacker still stands out from other enemies.
 */
export const RED_GREEN_PALETTE: WorldPalette = {
  mode: 'red_green',
  rings: {
    ...STANDARD_PALETTE.rings,
    hostile: 0xd94fc1,
    friendly: 0x3fb6e8,
    threat: 0xff6ae0,
  },
  names: {
    ...STANDARD_PALETTE.names,
    hostile: '#f08ae0',
    friendly: '#9ad8f4',
    threat: '#ff6ae0',
  },
  warnings: { hostile: warning(0xf0a030), friendly: warning(0x4f7fe8) },
  dots: {
    ...STANDARD_PALETTE.dots,
    hostile: '#d94fc1',
    friendly: '#3fb6e8',
    danger: '#d94fc1',
  },
};

/** 18.2 blue-yellow: neutral light grey `#C8C8C8`, the friendly warnings teal `#30C8A0`. */
export const BLUE_YELLOW_PALETTE: WorldPalette = {
  mode: 'blue_yellow',
  rings: { ...STANDARD_PALETTE.rings, neutral: 0xc8c8c8 },
  names: { ...STANDARD_PALETTE.names, neutral: '#c8c8c8' },
  warnings: { ...STANDARD_PALETTE.warnings, friendly: warning(0x30c8a0) },
  dots: { ...STANDARD_PALETTE.dots, neutral: '#c8c8c8' },
};

/** The palette of a mode (high contrast keeps the standard hues). */
export function paletteFor(mode: PaletteMode): WorldPalette {
  if (mode === 'red_green') return RED_GREEN_PALETTE;
  if (mode === 'blue_yellow') return BLUE_YELLOW_PALETTE;
  return mode === 'high_contrast' ? { ...STANDARD_PALETTE, mode } : STANDARD_PALETTE;
}

let active: WorldPalette = STANDARD_PALETTE;
let version = 0;

/**
 * Set the colour-vision mode the world painters draw with (the session calls it at start and
 * whenever the settings change). Answers whether it changed: the caller redraws the world
 * then (cached ring materials are keyed by `paletteVersion()`).
 */
export function setColourMode(mode: PaletteMode): boolean {
  if (active.mode === mode) return false;
  active = paletteFor(mode);
  version++;
  return true;
}

/** The palette the world painters draw with now. */
export function activePalette(): WorldPalette {
  return active;
}

/** Changes whenever the mode changes: caches of coloured marks key on it. */
export function paletteVersion(): number {
  return version;
}

// ---------------------------------------------------------------------------
// Reduce flashing and shaking in the world picture (ux_and_onboarding.md 18.8)

let calm = false;

/**
 * Set "reduce flashing and shaking" for the world painters (the setting, or the system
 * preference under "follow the system"; src/client/app/access_apply_model.ts decides it). With
 * it on, storm lightning does not flash and weather particles are thinned; no warning, name or
 * mark changes. Answers whether it changed (the caller redraws the world then).
 */
export function setWorldCalm(on: boolean): boolean {
  if (calm === on) return false;
  calm = on;
  return true;
}

/** Whether the world painters drop flashes and thin their particles now. */
export function worldCalm(): boolean {
  return calm;
}
