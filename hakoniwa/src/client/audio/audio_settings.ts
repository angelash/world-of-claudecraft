// Audio settings and accessibility (audio_direction.md 10.3, 10.4, 10.5; release_engineering.md
// 9.7; ux_and_onboarding.md 4.3, 18.4, 18.8). The stored shape lives in the sync settings part
// (src/client/app/settings_schema.ts checks every field): the five bus sliders and the
// background rule (`volume`), the audio options below (`audio`), sound captions (`subtitles`),
// reduce flashing and shaking (`accessibility.reduceFlashing`) and the rumble strength
// (`input.rumble`). `resolveAudioSettings` turns those into what the engine runs with; a
// missing or partial source falls back to the defaults field by field. Pure.

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
  accessibility?: { reduceFlashing?: FlashSetting };
  input?: { rumble?: number };
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
  };
}

/** Whether a caption of this level shows under the caption setting (10.4). */
export function captionShown(levelOf: 'important' | 'all' | null, mode: CaptionSetting): boolean {
  if (!levelOf || mode === 'off') return false;
  return mode === 'all' || levelOf === 'important';
}
