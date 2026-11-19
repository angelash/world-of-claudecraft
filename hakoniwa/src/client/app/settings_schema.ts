// The settings model (docs/50_tech/release_engineering.md 5.2, 13.10; D-088): two parts,
// `sync` (keys, contextual key and pad overrides, input options, language, accessibility,
// sound captions, volume and the audio options; follows the cloud) and
// `local` (quality, camera view, window, GPU preference, frame cap, install id, the audio
// output device and the `llm` partition; stays on this machine). Each part carries a version and migrates step by step
// like saves do; a part from a newer version is read best-effort and never written back.
// Every known field is checked on its own: a bad value falls back to its default and the
// other fields stay. Unknown top-level fields are kept (a newer build may add a field without
// a version bump), unknown fields inside a known structure are dropped (2.3).
//
// The `llm` partition is owned by the model settings (src/ai/llm_config/): here it is only
// required to be a plain object and is otherwise kept as it is; the desktop main process
// checks it field by field with validateSettings (desktop/settings.ts).
//
// Pure (no DOM, no clock): the renderer's SettingsStore (./settings_store.ts) and the
// desktop main process (desktop/settings.ts) run the same checks.

import {
  AUDIO_OUTPUTS,
  type AudioOptions,
  DYNAMIC_RANGES,
  defaultAudioOptions,
} from '../audio/audio_settings';
import { BUSES, type BusId, DEFAULT_VOLUMES } from '../audio/bus_model';
import { QUALITY_IDS, type QualityId } from '../hd2d/quality';
import { PITCH_MAX, PITCH_MIN, ZOOM_STEPS } from '../hd2d/view';
import {
  CHORD_CODE,
  type ContextKeyOverrides,
  DEFAULT_CONTEXT_KEYMAP,
  defaultBinding,
  INPUT_CONTEXTS,
  isForbiddenChord,
  type KeyChord,
  LOCKED_SLOTS,
  parseSlotKey,
  type SlotOverride,
} from '../input/contexts';
import {
  defaultInputSettings,
  GLYPH_SETTINGS,
  INPUT_RANGES,
  type InputSettings,
  SOFT_CONES,
} from '../input/input_settings';
import { type Action, DEFAULT_KEYMAP } from '../input/keymap';
import {
  DEFAULT_PAD_KEYMAP,
  isPadChord,
  isValidPadOverride,
  type PadChord,
  type PadKeyOverrides,
  type PadSlotOverride,
} from '../input/pad_bindings';

export type SettingsPart = 'sync' | 'local';
export const SETTINGS_PARTS: readonly SettingsPart[] = ['sync', 'local'];

/** Current format version of each part; raise it together with a MIGRATIONS step. */
export const SETTINGS_VERSION: Readonly<Record<SettingsPart, number>> = { sync: 1, local: 1 };

/** Interface languages (D-077): Simplified Chinese at 1.0, the other two in 1.x updates. */
export const LANGUAGES = ['zh-Hans', 'zh-Hant', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Colour vision modes (ux_and_onboarding.md 18.2). */
export const COLOR_MODES = ['standard', 'red_green', 'blue_yellow', 'high_contrast'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

/** Text size steps (18.3). */
export const TEXT_SCALES = [0.9, 1, 1.15, 1.3] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

/** Reduce flashing and shaking: follow the system preference, always on, always off (9.7). */
export const FLASH_MODES = ['system', 'on', 'off'] as const;
export type FlashMode = (typeof FLASH_MODES)[number];

/** Sound captions (18.4, 9.7). */
export const CAPTION_MODES = ['off', 'important', 'all'] as const;
export type CaptionMode = (typeof CAPTION_MODES)[number];

/** Caption text size (18.4 caption style; the text size step multiplies it). */
export const CAPTION_SIZES = ['small', 'standard', 'large', 'xlarge'] as const;
export type CaptionSize = (typeof CAPTION_SIZES)[number];

/** Caption backdrop opacity in percent (18.4 caption style). */
export const CAPTION_BACKDROPS = [0, 50, 75, 100] as const;
export type CaptionBackdrop = (typeof CAPTION_BACKDROPS)[number];

/** Where the caption lines sit on the screen (18.4 caption style). */
export const CAPTION_POSITIONS = ['bottom', 'top'] as const;
export type CaptionPosition = (typeof CAPTION_POSITIONS)[number];

/**
 * Text speed of dialogue and cutscenes (ux_and_onboarding.md 4.5, catalog_cutscenes.md 13.2):
 * characters per second, or the whole line at once.
 */
export const TEXT_SPEEDS = [30, 60, 'instant'] as const;
export type TextSpeed = (typeof TEXT_SPEEDS)[number];

/** Guidance levels (ux_and_onboarding.md 17.3). */
export const GUIDANCE_LEVELS = ['full', 'brief', 'off'] as const;
export type GuidanceLevel = (typeof GUIDANCE_LEVELS)[number];

/** Volume while the window is in the background (9.7). */
export const BACKGROUND_AUDIO = ['mute', 'lower', 'normal'] as const;
export type BackgroundAudio = (typeof BACKGROUND_AUDIO)[number];

export const WINDOW_MODES = ['fullscreen', 'windowed'] as const;
export type WindowMode = (typeof WINDOW_MODES)[number];

/** GPU preference (2.7): ask for the high-performance GPU, or let the system choose. */
export const GPU_PREFERENCES = ['high_performance', 'system'] as const;
export type GpuPreference = (typeof GPU_PREFERENCES)[number];

/** Frame caps (2.7): 30, 60 or the display refresh rate. */
export const FRAME_CAPS = [30, 60, 'display'] as const;
export type FrameCapSetting = (typeof FRAME_CAPS)[number];

/** At most this many key overrides are kept. */
export const MAX_KEY_OVERRIDES = 128;
/** At most this many contextual overrides are kept: one per slot of the contextual key map. */
export const MAX_CONTEXT_KEY_OVERRIDES = INPUT_CONTEXTS.reduce(
  (n, c) => n + Object.keys(DEFAULT_CONTEXT_KEYMAP[c]).length * 2,
  0,
);
/** At most this many pad overrides are kept: one per slot of the pad key map. */
export const MAX_PAD_KEY_OVERRIDES = INPUT_CONTEXTS.reduce(
  (n, c) => n + Object.keys(DEFAULT_PAD_KEYMAP[c]).length * 2,
  0,
);
const KEY_CODE = /^[A-Za-z][A-Za-z0-9]{0,31}$/;
const INSTALL_ID = /^[0-9a-f]{16,32}$/;
/** Window positions and sizes are kept within these bounds (screen pixels). */
const MAX_COORD = 100_000;
const MIN_SIZE = 100;
const MAX_SIZE = 16_384;

/** Every action the default key map binds; an override may only name one of these. */
export const KEY_ACTIONS: ReadonlySet<Action> = new Set(
  Object.values(DEFAULT_KEYMAP).map((b) => b.action),
);

export interface KeyOverride {
  action: Action;
  /** Hotbar slot 1 to 9; required with the hotbar action, absent otherwise. */
  slot?: number;
}

export interface Accessibility {
  colorMode: ColorMode;
  textScale: TextScale;
  /** Dialogue text one step larger than the text size (18.3). */
  largeDialogue: boolean;
  reduceFlashing: FlashMode;
  /** Every hold becomes press once to start, again to stop (18.5). */
  holdToToggle: boolean;
  /** Caption style (18.4): text size, backdrop opacity, position, coloured important lines. */
  captionSize: CaptionSize;
  captionBackdrop: CaptionBackdrop;
  captionPosition: CaptionPosition;
  captionColors: boolean;
}

export type Volume = Record<BusId, number> & { background: BackgroundAudio };

/**
 * The gameplay page's reading settings (ux_and_onboarding.md 4.5): text speed and auto advance
 * for dialogue and cutscenes, and the guidance level (17.3). The guidance level is kept here
 * until the tutorial store keeps it in the save's client segment (17.8, PK-M1-23); the new game
 * page writes it.
 */
export interface GameplaySettings {
  textSpeed: TextSpeed;
  autoAdvance: boolean;
  guidance: GuidanceLevel;
}

export interface SyncSettings {
  version: number;
  /** Changes to the default key map by KeyboardEvent.code; null unbinds a default key. */
  keys: Record<string, KeyOverride | null>;
  /**
   * Changes to the contextual key map (ux_and_onboarding.md 16.6) by `<context>.<action>.<slot>`
   * (src/client/input/contexts.ts); null clears a default slot. Shared by every save (rule 7).
   */
  contextKeys: ContextKeyOverrides;
  /**
   * Changes to the gamepad bindings (16.6 rule 5) by `<context>.<action>.<slot>`
   * (src/client/input/pad_bindings.ts); only button slots that are not locked.
   */
  padKeys: PadKeyOverrides;
  /** Gamepad and targeting options (ux_and_onboarding.md 4.4; input_settings.ts). */
  input: InputSettings;
  language: Language;
  accessibility: Accessibility;
  subtitles: CaptionMode;
  /** Bus sliders 0 to 100 and the background rule. */
  volume: Volume;
  /** Text speed, auto advance and the guidance level (4.5). */
  gameplay: GameplaySettings;
  /** Output, dynamic range and the audio switches of audio_direction.md 10.3 (PK-M1-06). */
  audio: AudioOptions;
}

/** The HD-2D camera (art_pipeline.md 1.2); the session clamps it again for its renderer. */
export interface StoredView {
  stepIndex: number;
  pitch: number;
  yaw: number;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Written by the desktop shell only (the page never sets it; see desktop/settings.ts). */
export interface WindowSettings {
  /** null until the player picks one: packaged builds then start fullscreen (2.7). */
  mode: WindowMode | null;
  /** Normal (not maximized, not fullscreen) bounds of the last windowed session. */
  bounds: WindowBounds | null;
  maximized: boolean;
}

export interface LocalSettings {
  version: number;
  /** This installation completed or explicitly skipped the first-run pages. */
  onboardingDone: boolean;
  quality: QualityId;
  /** null until the player moves the camera: the session picks a size-based default. */
  view: StoredView | null;
  window: WindowSettings;
  gpu: GpuPreference;
  frameCap: FrameCapSetting;
  /** Random id of this installation (13.10); the desktop save writer id is derived from it. */
  installId: string | null;
  /** Audio output device id (desktop, audio_direction.md 10.3); null is the system default. */
  audioDevice: string | null;
  /** The model settings partition (llm_providers.md 4.7); absent until first written. */
  llm?: Record<string, unknown>;
}

export interface PartValues {
  sync: SyncSettings;
  local: LocalSettings;
}

export type SyncPatch = Partial<Omit<SyncSettings, 'version'>>;
export type LocalPatch = Partial<Omit<LocalSettings, 'version'>>;
export interface PartPatch {
  sync: SyncPatch;
  local: LocalPatch;
}

// ---------------------------------------------------------------------------
// Field checks: each answers the checked value, or undefined when the value is not valid.

type Parse<T> = (v: unknown) => T | undefined;

interface Field<T> {
  def: () => T;
  parse: Parse<T>;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const oneOf =
  <T>(values: readonly T[]): Parse<T> =>
  (v) =>
    (values as readonly unknown[]).includes(v) ? (v as T) : undefined;

const bool: Parse<boolean> = (v) => (typeof v === 'boolean' ? v : undefined);

const intIn =
  (min: number, max: number): Parse<number> =>
  (v) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;

const finiteIn =
  (min: number, max: number, maxExclusive = false): Parse<number> =>
  (v) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && (maxExclusive ? v < max : v <= max)
      ? v
      : undefined;

const nullable =
  <T>(inner: Parse<T>): Parse<T | null> =>
  (v) =>
    v === null ? null : inner(v);

/**
 * A structure checked field by field: a bad sub-field takes its default (recorded as an
 * issue), unknown sub-fields are dropped; a value that is not an object is invalid.
 */
function struct<T extends object>(
  fields: { [K in keyof T]: Field<T[K]> },
  issues?: (sub: string) => void,
): Parse<T> {
  return (v) => {
    if (!isPlainObject(v)) return undefined;
    const out = {} as T;
    for (const key of Object.keys(fields) as (keyof T & string)[]) {
      const f = fields[key];
      if (!(key in v) || v[key] === undefined) {
        out[key] = f.def();
        continue;
      }
      const parsed = f.parse(v[key]);
      if (parsed === undefined) {
        out[key] = f.def();
        issues?.(key);
      } else out[key] = parsed;
    }
    return out;
  };
}

/** A structure whose every sub-field must be valid (window bounds, the camera view). */
function exact<T extends object>(fields: { [K in keyof T]: Parse<T[K]> }): Parse<T> {
  return (v) => {
    if (!isPlainObject(v)) return undefined;
    const out = {} as T;
    for (const key of Object.keys(fields) as (keyof T & string)[]) {
      const parsed = fields[key](v[key]);
      if (parsed === undefined) return undefined;
      out[key] = parsed;
    }
    return out;
  };
}

function parseKeyOverride(v: unknown): KeyOverride | null | undefined {
  if (v === null) return null;
  if (!isPlainObject(v)) return undefined;
  const action = v.action;
  if (typeof action !== 'string' || !KEY_ACTIONS.has(action as Action)) return undefined;
  if (action === 'hotbar') {
    const slot = intIn(1, 9)(v.slot);
    return slot === undefined ? undefined : { action, slot };
  }
  return v.slot === undefined ? { action: action as Action } : undefined;
}

function parseChord(v: unknown): KeyChord | undefined {
  if (!isPlainObject(v) || typeof v.code !== 'string' || !CHORD_CODE.test(v.code)) return undefined;
  const out: KeyChord = { code: v.code };
  for (const mod of ['shift', 'ctrl', 'alt'] as const) {
    if (v[mod] === undefined || v[mod] === false) continue;
    if (v[mod] !== true) return undefined;
    out[mod] = true;
  }
  for (const key of Object.keys(v))
    if (!['code', 'shift', 'ctrl', 'alt'].includes(key)) return undefined;
  return out;
}

/**
 * Contextual key overrides: an entry must name a slot of the contextual key map that is not
 * locked and hold a chord (not Alt+F4) or null; bad entries are dropped one by one, at most
 * MAX_CONTEXT_KEY_OVERRIDES kept (enough to override every slot).
 */
function parseContextKeys(issue: (sub: string) => void): Parse<ContextKeyOverrides> {
  return (v) => {
    if (!isPlainObject(v)) return undefined;
    const out: Record<string, SlotOverride> = {};
    let n = 0;
    for (const [key, raw] of Object.entries(v)) {
      const slot = parseSlotKey(key);
      const known = !!slot && !!defaultBinding(slot.context, slot.action);
      const chord = raw === null ? null : parseChord(raw);
      const parsed =
        !known || n >= MAX_CONTEXT_KEY_OVERRIDES || LOCKED_SLOTS.has(key)
          ? undefined
          : chord && isForbiddenChord(chord)
            ? undefined
            : chord;
      if (parsed === undefined) {
        issue(slot ? key : '?');
        continue;
      }
      out[key] = parsed;
      n++;
    }
    return out;
  };
}

function parsePadChord(v: unknown): PadChord | undefined {
  if (!isPadChord(v)) return undefined;
  const out: PadChord = { button: v.button };
  if (v.hold) out.hold = true;
  if (v.with) out.with = v.with;
  return out;
}

/**
 * Pad overrides: an entry must name a rebindable button slot of the pad key map (not locked,
 * not a stick, ring, nav or hotbar entry) and hold a chord or null (a hotbar layer: a plain
 * button off the cluster, never null); bad entries are dropped
 * one by one, at most MAX_PAD_KEY_OVERRIDES kept.
 */
function parsePadKeys(issue: (sub: string) => void): Parse<PadKeyOverrides> {
  return (v) => {
    if (!isPlainObject(v)) return undefined;
    const out: Record<string, PadSlotOverride> = {};
    let n = 0;
    for (const [key, raw] of Object.entries(v)) {
      const slot = parseSlotKey(key);
      const chord = raw === null ? null : parsePadChord(raw);
      const ok =
        !!slot &&
        n < MAX_PAD_KEY_OVERRIDES &&
        chord !== undefined &&
        isValidPadOverride(slot.context, slot.action, slot.slot, chord);
      if (!ok || chord === undefined) {
        issue(slot ? key : '?');
        continue;
      }
      out[key] = chord;
      n++;
    }
    return out;
  };
}

/** Key overrides: bad entries are dropped one by one, at most MAX_KEY_OVERRIDES kept. */
function parseKeys(issue: (sub: string) => void): Parse<Record<string, KeyOverride | null>> {
  return (v) => {
    if (!isPlainObject(v)) return undefined;
    const out: Record<string, KeyOverride | null> = {};
    let n = 0;
    for (const [code, raw] of Object.entries(v)) {
      const parsed = KEY_CODE.test(code) ? parseKeyOverride(raw) : undefined;
      if (parsed === undefined || n >= MAX_KEY_OVERRIDES) {
        issue(KEY_CODE.test(code) ? code : '?');
        continue;
      }
      out[code] = parsed;
      n++;
    }
    return out;
  };
}

const volumeLevel: Field<number> = { def: () => 100, parse: intIn(0, 100) };

function volumeFields(): { [K in keyof Volume]: Field<Volume[K]> } {
  const buses = Object.fromEntries(
    BUSES.map((bus) => [bus, { ...volumeLevel, def: () => DEFAULT_VOLUMES[bus] }]),
  ) as Record<BusId, Field<number>>;
  return {
    ...buses,
    background: { def: () => 'lower' as BackgroundAudio, parse: oneOf(BACKGROUND_AUDIO) },
  };
}

const parseView: Parse<StoredView> = exact<StoredView>({
  stepIndex: intIn(0, ZOOM_STEPS.length - 1),
  pitch: finiteIn(PITCH_MIN, PITCH_MAX),
  // 360 is the same heading as 0; wrapYaw can produce it for a tiny negative angle.
  yaw: finiteIn(0, 360),
});

const parseBounds: Parse<WindowBounds> = exact<WindowBounds>({
  x: intIn(-MAX_COORD, MAX_COORD),
  y: intIn(-MAX_COORD, MAX_COORD),
  width: intIn(MIN_SIZE, MAX_SIZE),
  height: intIn(MIN_SIZE, MAX_SIZE),
});

const parseInstallId: Parse<string> = (v) =>
  typeof v === 'string' && INSTALL_ID.test(v) ? v : undefined;

/** An output device id as the browser reports it (MediaDeviceInfo.deviceId). */
const parseAudioDevice: Parse<string> = (v) =>
  typeof v === 'string' && v.length > 0 && v.length <= 256 ? v : undefined;

const parseLlm: Parse<Record<string, unknown>> = (v) => (isPlainObject(v) ? v : undefined);

type Fields<T> = { [K in keyof T]-?: Field<Exclude<T[K], undefined>> };

/** The fields of each part (version excluded), with defaults and checks. */
function partFields(
  part: SettingsPart,
  issue: (path: string) => void,
): Fields<Omit<SyncSettings, 'version'>> | Fields<Omit<LocalSettings, 'version'>> {
  if (part === 'sync') {
    const sync: Fields<Omit<SyncSettings, 'version'>> = {
      keys: { def: () => ({}), parse: parseKeys((s) => issue(`keys.${s}`)) },
      contextKeys: {
        def: () => ({}),
        parse: parseContextKeys((s) => issue(`contextKeys.${s}`)),
      },
      padKeys: {
        def: () => ({}),
        parse: parsePadKeys((s) => issue(`padKeys.${s}`)),
      },
      input: {
        def: defaultInputSettings,
        parse: struct<InputSettings>(inputFields(), (s) => issue(`input.${s}`)),
      },
      language: { def: () => 'zh-Hans', parse: oneOf(LANGUAGES) },
      accessibility: {
        def: defaultAccessibility,
        parse: struct<Accessibility>(
          {
            colorMode: { def: () => 'standard', parse: oneOf(COLOR_MODES) },
            textScale: { def: () => 1, parse: oneOf(TEXT_SCALES) },
            largeDialogue: { def: () => false, parse: bool },
            reduceFlashing: { def: () => 'system', parse: oneOf(FLASH_MODES) },
            holdToToggle: { def: () => false, parse: bool },
            captionSize: { def: () => 'standard', parse: oneOf(CAPTION_SIZES) },
            captionBackdrop: { def: () => 75, parse: oneOf(CAPTION_BACKDROPS) },
            captionPosition: { def: () => 'bottom', parse: oneOf(CAPTION_POSITIONS) },
            captionColors: { def: () => true, parse: bool },
          },
          (s) => issue(`accessibility.${s}`),
        ),
      },
      subtitles: { def: () => 'important', parse: oneOf(CAPTION_MODES) },
      volume: {
        def: defaultVolume,
        parse: struct<Volume>(volumeFields(), (s) => issue(`volume.${s}`)),
      },
      gameplay: {
        def: defaultGameplay,
        parse: struct<GameplaySettings>(
          {
            textSpeed: { def: () => 30, parse: oneOf(TEXT_SPEEDS) },
            autoAdvance: { def: () => false, parse: bool },
            guidance: { def: () => 'full', parse: oneOf(GUIDANCE_LEVELS) },
          },
          (s) => issue(`gameplay.${s}`),
        ),
      },
      audio: {
        def: defaultAudioOptions,
        parse: struct<AudioOptions>(
          {
            output: { def: () => 'stereo', parse: oneOf(AUDIO_OUTPUTS) },
            dynamicRange: { def: () => 'full', parse: oneOf(DYNAMIC_RANGES) },
            combatMusic: { def: () => true, parse: bool },
            dialogueBlips: { def: () => true, parse: bool },
            llmThinking: { def: () => true, parse: bool },
            reduceLoud: { def: () => false, parse: bool },
          },
          (s) => issue(`audio.${s}`),
        ),
      },
    };
    return sync;
  }
  const local: Fields<Omit<LocalSettings, 'version'>> = {
    quality: { def: () => 'auto', parse: oneOf(QUALITY_IDS) },
    view: { def: () => null, parse: nullable(parseView) },
    window: {
      def: defaultWindow,
      parse: struct<WindowSettings>(
        {
          mode: { def: () => null, parse: nullable(oneOf(WINDOW_MODES)) },
          bounds: { def: () => null, parse: nullable(parseBounds) },
          maximized: { def: () => false, parse: bool },
        },
        (s) => issue(`window.${s}`),
      ),
    },
    gpu: { def: () => 'high_performance', parse: oneOf(GPU_PREFERENCES) },
    frameCap: { def: () => 60, parse: oneOf(FRAME_CAPS) },
    installId: { def: () => null, parse: nullable(parseInstallId) },
    audioDevice: { def: () => null, parse: nullable(parseAudioDevice) },
    onboardingDone: { def: () => false, parse: bool },
    llm: { def: () => ({}), parse: parseLlm },
  };
  return local;
}

function inputFields(): { [K in keyof InputSettings]: Field<InputSettings[K]> } {
  const d = defaultInputSettings();
  const r = INPUT_RANGES;
  return {
    padDeadInner: { def: () => d.padDeadInner, parse: finiteIn(...r.padDeadInner) },
    padDeadOuter: { def: () => d.padDeadOuter, parse: finiteIn(...r.padDeadOuter) },
    cameraSensitivity: {
      def: () => d.cameraSensitivity,
      parse: finiteIn(...r.cameraSensitivity),
    },
    invertPitch: { def: () => d.invertPitch, parse: bool },
    softLock: { def: () => d.softLock, parse: bool },
    softLockKbm: { def: () => d.softLockKbm, parse: bool },
    softCone: { def: () => d.softCone, parse: oneOf(SOFT_CONES) },
    lockOnCast: { def: () => d.lockOnCast, parse: bool },
    rumble: { def: () => d.rumble, parse: intIn(...r.rumble) },
    swapConfirmBack: { def: () => d.swapConfirmBack, parse: bool },
    glyphs: { def: () => d.glyphs, parse: oneOf(GLYPH_SETTINGS) },
    holdSeconds: { def: () => d.holdSeconds, parse: finiteIn(...r.holdSeconds) },
  };
}

export function defaultAccessibility(): Accessibility {
  return {
    colorMode: 'standard',
    textScale: 1,
    largeDialogue: false,
    reduceFlashing: 'system',
    holdToToggle: false,
    captionSize: 'standard',
    captionBackdrop: 75,
    captionPosition: 'bottom',
    captionColors: true,
  };
}

function defaultVolume(): Volume {
  return { ...DEFAULT_VOLUMES, background: 'lower' };
}

export function defaultGameplay(): GameplaySettings {
  return { textSpeed: 30, autoAdvance: false, guidance: 'full' };
}

function defaultWindow(): WindowSettings {
  return { mode: null, bounds: null, maximized: false };
}

/** Fields that are left out of a part until something writes them. */
const OPTIONAL_FIELDS: ReadonlySet<string> = new Set(['llm']);

export function defaultSettings<P extends SettingsPart>(part: P): PartValues[P] {
  const fields = partFields(part, () => {}) as Record<string, Field<unknown>>;
  const out: Record<string, unknown> = { version: SETTINGS_VERSION[part] };
  for (const [key, f] of Object.entries(fields)) {
    if (!OPTIONAL_FIELDS.has(key)) out[key] = f.def();
  }
  return out as unknown as PartValues[P];
}

// ---------------------------------------------------------------------------
// Versions and migration.

/** One step: a part of version N in, the same part in version N + 1 layout out. */
export type SettingsMigration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migration steps per part, keyed by the version they upgrade from. Version 0 is a part
 * written without a version (the first browser builds kept the model settings in the local
 * part that way); its fields already have the version 1 layout.
 */
export const MIGRATIONS: Readonly<
  Record<SettingsPart, Readonly<Record<number, SettingsMigration>>>
> = {
  sync: { 0: (raw) => raw },
  local: { 0: (raw) => raw },
};

/** The stored version of a part: a positive integer, or 0 when missing or malformed. */
export function storedVersion(raw: Record<string, unknown>): number {
  const v = raw.version;
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : 0;
}

export interface NormalizeOptions {
  /** Migration steps (tests pass their own); default MIGRATIONS. */
  migrations?: Readonly<Record<SettingsPart, Readonly<Record<number, SettingsMigration>>>>;
  /** Target version; default SETTINGS_VERSION. */
  versions?: Readonly<Record<SettingsPart, number>>;
}

export interface Normalized<P extends SettingsPart> {
  /** Every known field, checked (defaults where missing or bad). */
  values: PartValues[P];
  /** Unknown top-level fields, kept as stored. */
  extra: Record<string, unknown>;
  /** The version read: 'none' when nothing was stored (or it was not an object). */
  from: number | 'none';
  /** The part comes from a newer version: use it, never write it back. */
  readOnly: boolean;
  /** Dotted paths of bad values that fell back to their defaults. */
  issues: string[];
  /** For a read-only part: the stored object exactly as read. */
  raw: Record<string, unknown> | null;
}

/** Read a stored part: migrate it to the current version and check every field. */
export function normalizeSettings<P extends SettingsPart>(
  part: P,
  raw: unknown,
  opts: NormalizeOptions = {},
): Normalized<P> {
  const target = (opts.versions ?? SETTINGS_VERSION)[part];
  if (!isPlainObject(raw)) {
    const values = defaultSettings(part);
    (values as { version: number }).version = target;
    return { values, extra: {}, from: 'none', readOnly: false, issues: [], raw: null };
  }
  const from = storedVersion(raw);
  const readOnly = from > target;
  let body: Record<string, unknown> = raw;
  if (!readOnly) {
    const steps = (opts.migrations ?? MIGRATIONS)[part];
    for (let v = from; v < target; v++) {
      const step = steps[v];
      if (!step) throw new Error(`no settings migration for ${part} from version ${v}`);
      body = step({ ...body });
    }
  }
  const issues: string[] = [];
  const fields = partFields(part, (path) => issues.push(path)) as Record<string, Field<unknown>>;
  const out: Record<string, unknown> = { version: readOnly ? from : target };
  const extra: Record<string, unknown> = {};
  for (const [key, f] of Object.entries(fields)) {
    if (!(key in body) || body[key] === undefined) {
      if (!OPTIONAL_FIELDS.has(key)) out[key] = f.def();
      continue;
    }
    const parsed = f.parse(body[key]);
    if (parsed === undefined) {
      issues.push(key);
      if (!OPTIONAL_FIELDS.has(key)) out[key] = f.def();
    } else out[key] = parsed;
  }
  // Fields of the other part never ride along: local data must not reach the cloud copy.
  const otherFields = Object.keys(partFields(part === 'sync' ? 'local' : 'sync', () => {}));
  for (const [key, value] of Object.entries(body)) {
    if (key === 'version' || key in fields || value === undefined) continue;
    if (otherFields.includes(key)) {
      issues.push(key);
      continue;
    }
    extra[key] = value;
  }
  return {
    values: out as unknown as PartValues[P],
    extra,
    from,
    readOnly,
    issues,
    raw: readOnly ? raw : null,
  };
}

/**
 * Check the fields of a patch strictly: answers the checked patch, or the first bad field
 * (a bad value anywhere inside a structure refuses that field too).
 */
export function checkPatch<P extends SettingsPart>(
  part: P,
  patch: PartPatch[P],
): { ok: true; patch: PartPatch[P] } | { ok: false; field: string } {
  const nested: string[] = [];
  const fields = partFields(part, (path) => nested.push(path)) as Record<string, Field<unknown>>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const f = fields[key];
    if (!f) return { ok: false, field: key };
    const parsed = f.parse(value);
    if (parsed === undefined) return { ok: false, field: key };
    if (nested.length > 0) return { ok: false, field: nested[0] as string };
    out[key] = parsed;
  }
  return { ok: true, patch: out as PartPatch[P] };
}

/** The object to store for a part: unknown fields first, then every known field. */
export function storedForm<P extends SettingsPart>(n: {
  values: PartValues[P];
  extra: Record<string, unknown>;
  readOnly?: boolean;
  raw?: Record<string, unknown> | null;
}): Record<string, unknown> {
  if (n.readOnly && n.raw) return n.raw;
  return JSON.parse(JSON.stringify({ ...n.extra, ...n.values })) as Record<string, unknown>;
}
