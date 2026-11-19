// Audio settings and accessibility (audio_direction.md 10.3, 10.4, 10.5; release_engineering.md
// 9.7; ux_and_onboarding.md 4.3, 18.4, 18.8). The stored shape lives in the sync settings part
// (src/client/app/settings_schema.ts checks every field): the five bus sliders and the
// background rule (`volume`), the audio options below (`audio`), sound captions (`subtitles`),
// reduce flashing and shaking (`accessibility.reduceFlashing`), the caption style
// (`accessibility.caption*`, with the text size and the colour mode; the caption painter reads
// it) and the rumble strength (`input.rumble`). `resolveAudioSettings` turns those into what
// the engine runs with; a missing or partial source falls back to the defaults field by field.
// Pure.

import { BUSES, type BusId, DEFAULT_VOLUMES, type MixSettings } from './bus_model';

/** Output: stereo, or mono (pans are centred before the fold, 10.4). */
export const AUDIO_OUTPUTS = ['stereo', 'mono'] as const;
export type AudioOutput = (typeof AUDIO_OUTPUTS)[number];

/** Dynamic range: full, or night (3:1 above -24 LUFS on the master bus, 8.1). */
export const DYNAMIC_RANGES = ['full', 'night'] as const;
export type DynamicRange = (typeof DYNAMIC_RANGES)[number];

/** The audio options of 10.3 that have no other home in the settings. */
export interface AudioOptions {
  output: AudioOutput;
  dynamicRange: DynamicRange;
  /** Off: fights keep the location track and only open its percussion (5.4). */
  combatMusic: boolean;
  /** Dialogue blips while text types out (7.7 sfx_ui_blip_*). */
  dialogueBlips: boolean;
  /** The model-waiting sound (5.10). */
  llmThinking: boolean;
  /** Reduce sudden loud sounds: an sfx limiter and -6 dB on cutscene hits and boss roars. */
  reduceLoud: boolean;
}

export function defaultAudioOptions(): AudioOptions {
  return {
    output: 'stereo',
    dynamicRange: 'full',
    combatMusic: true,
    dialogueBlips: true,
    llmThinking: true,
    reduceLoud: false,
  };
}

/** Caption modes (10.3: off, important only, all; default important). */
export type CaptionSetting = 'off' | 'important' | 'all';
/** Reduce flashing and shaking: follow the system "reduce motion" preference, on, off. */
export type FlashSetting = 'system' | 'on' | 'off';

/** The slice of the sync settings part the audio reads (every field optional). */
export interface AudioSettingsSource {
  volume?: Partial<Record<BusId, number>> & { background?: 'mute' | 'lower' | 'normal' };
  audio?: Partial<AudioOptions>;
  subtitles?: CaptionSetting;
  accessibility?: {
    reduceFlashing?: FlashSetting;
    colorMode?: string;
    textScale?: number;
    captionSize?: string;
    captionBackdrop?: number;
    captionPosition?: string;
    captionColors?: boolean;
  };
  input?: { rumble?: number };
}

/** Caption text px per size step at text size 1 (ux_and_onboarding.md 18.4 caption style). */
export const CAPTION_PX = { small: 13, standard: 15, large: 18, xlarge: 22 } as const;
/** No caption text is drawn smaller than this, whatever the steps (18.3 minimum size). */
export const CAPTION_MIN_PX = 12;

/** How the caption painter draws the lines (ux_and_onboarding.md 18.4). */
export interface CaptionStyle {
  /** text size in CSS px: the caption size step times the text size step */
  fontPx: number;
  /** backdrop opacity 0 to 1 (high contrast: always 1) */
  backdrop: number;
  position: 'bottom' | 'top';
  /** important lines keep their warm colour; off, every line has one colour */
  colors: boolean;
  /** the high-contrast colour mode: white text on a black backdrop */
  highContrast: boolean;
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontPx: CAPTION_PX.standard,
  backdrop: 0.75,
  position: 'bottom',
  colors: true,
  highContrast: false,
};

/** What owns the screen while captions show: the field, a conversation, or a cutscene. */
export type CaptionScreen = 'field' | 'dialogue' | 'scene';

/**
 * Where the caption box sits and how it stacks (ux_and_onboarding.md 18.4; UX-6: a caption
 * never covers what a player acts on).
 * - Field: bottom, above the bottom-centre stack (hotbar, light notices, hint bar; about
 *   200 px at text size 1, scaled with it); top, below the critical notifications (`.hk-notify-
 *   top` starts 84 px down and holds at most three cards). Under every window and popup and
 *   under the notifications (z 0: the notification areas carry z 1, src/client/access.css).
 * - Conversation: the dialogue panel and its busts own the lower half, and notifications wait
 *   until it ends (5.4), so the captions take the notification band at the top.
 * - Cutscene: the card and its choices own the lower part (up to 80vh from 7vh above the
 *   bottom), so the captions take the top edge, over the cutscene layer (z 50) and under the
 *   banner, the backlog, the guidance card and the confirm popup.
 */
export interface CaptionPlace {
  /** CSS for the box's top and bottom ('' leaves one unset) */
  top: string;
  bottom: string;
  z: number;
}

/** The caption box over the cutscene layer (`.hk-cut` is z 50; banner and backlog are 60). */
export const CAPTION_Z_SCENE = 55;

const scaled = (px: number): string => `calc(${px}px * var(--hk-text-scale, 1))`;

export function captionPlace(position: 'bottom' | 'top', screen: CaptionScreen): CaptionPlace {
  if (screen === 'scene') return { top: '2vh', bottom: '', z: CAPTION_Z_SCENE };
  if (screen === 'dialogue') return { top: scaled(84), bottom: '', z: 0 };
  return position === 'top'
    ? { top: scaled(84 + 140), bottom: '', z: 0 }
    : { top: '', bottom: scaled(212), z: 0 };
}

/** The caption style of the accessibility settings (a missing field takes its default). */
export function captionStyle(a: AudioSettingsSource['accessibility'] | undefined): CaptionStyle {
  const size = oneOf(
    Object.keys(CAPTION_PX) as (keyof typeof CAPTION_PX)[],
    a?.captionSize,
    'standard',
  );
  const scale =
    typeof a?.textScale === 'number' && Number.isFinite(a.textScale) && a.textScale > 0
      ? a.textScale
      : 1;
  const highContrast = a?.colorMode === 'high_contrast';
  const backdrop = level(a?.captionBackdrop, 75) / 100;
  return {
    fontPx: Math.max(CAPTION_MIN_PX, Math.round(CAPTION_PX[size] * scale)),
    backdrop: highContrast ? 1 : backdrop,
    position: oneOf(['bottom', 'top'] as const, a?.captionPosition, 'bottom'),
    colors: flag(a?.captionColors, true),
    highContrast,
  };
}

/** What the engine runs with. */
export interface AudioRuntimeSettings {
  mix: MixSettings;
  mono: boolean;
  night: boolean;
  combatMusic: boolean;
  dialogueBlips: boolean;
  llmThinking: boolean;
  reduceLoud: boolean;
  captions: CaptionSetting;
  /** Screen shake, hit-stop and rumble off (10.4); the hit-stop thud stays. */
  reduceFlashing: boolean;
  /** Rumble strength 0 to 1 (already 0 when reduceFlashing is on). */
  rumble: number;
  /** How the caption lines are drawn (the painter's input; the engine does not read it). */
  captionStyle: CaptionStyle;
}

/** What the page knows about its environment. */
export interface AudioEnvironment {
  /** prefers-reduced-motion: reduce */
  systemReducedMotion: boolean;
  /** The window has focus (the background rule applies otherwise). */
  focused: boolean;
}

const oneOf = <T extends string>(list: readonly T[], v: unknown, d: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d;

const level = (v: unknown, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : d;

const flag = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

/** Whether reduce flashing and shaking is on: the setting, or the system preference. */
export function flashReduced(setting: FlashSetting | undefined, systemReducedMotion: boolean) {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return systemReducedMotion;
}

export function resolveAudioSettings(
  src: AudioSettingsSource | null | undefined,
  env: AudioEnvironment,
): AudioRuntimeSettings {
  const s = src ?? {};
  const d = defaultAudioOptions();
  const a = s.audio ?? {};
  const volumes = Object.fromEntries(
    BUSES.map((b) => [b, level(s.volume?.[b], DEFAULT_VOLUMES[b])]),
  ) as Record<BusId, number>;
  const reduceFlashing = flashReduced(s.accessibility?.reduceFlashing, env.systemReducedMotion);
  return {
    mix: {
      volumes,
      background: oneOf(['mute', 'lower', 'normal'] as const, s.volume?.background, 'lower'),
      focused: env.focused,
    },
    mono: oneOf(AUDIO_OUTPUTS, a.output, d.output) === 'mono',
    night: oneOf(DYNAMIC_RANGES, a.dynamicRange, d.dynamicRange) === 'night',
    combatMusic: flag(a.combatMusic, d.combatMusic),
    dialogueBlips: flag(a.dialogueBlips, d.dialogueBlips),
    llmThinking: flag(a.llmThinking, d.llmThinking),
    reduceLoud: flag(a.reduceLoud, d.reduceLoud),
    captions: oneOf(['off', 'important', 'all'] as const, s.subtitles, 'important'),
    reduceFlashing,
    rumble: reduceFlashing ? 0 : level(s.input?.rumble, 70) / 100,
    captionStyle: captionStyle(s.accessibility),
  };
}

/** Whether a caption of this level shows under the caption setting (10.4). */
export function captionShown(levelOf: 'important' | 'all' | null, mode: CaptionSetting): boolean {
  if (!levelOf || mode === 'off') return false;
  return mode === 'all' || levelOf === 'important';
}
