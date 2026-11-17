// src/client/audio/: the client audio subsystem (audio_direction.md 10.1; release_engineering.md
// 9). Audio only reads the world through the client's GameView and the kernel events; it never
// calls a kernel command or changes an outcome, and it runs silently when no audio device
// exists or an id has no approved file (no placeholder sound, 9.2). Local notes: README.md.
//
// Pure cores (CLIENT_PURE_CORES): audio_director (what should play), music_player (decks, beat
// grid, transitions, stingers), ambience_mixer (beds and details), sound_player (voice pool,
// preemption, throttle, variants), spatializer (pan, distance, depth, occlusion, reverb zones,
// the eavesdrop tiers), audio_manifest (the playable index and its checks), audio_settings
// (settings and accessibility), cue_map (events to sound ids), hit_select (the combat 8.3
// selection fields), captions, rumble, bus_model (the five buses and ducking), audio_world
// (the probe that reads the world) and audio_engine (the orchestrator). DOM side: audio_bus
// (the only Web Audio module), audio_loader, caption_painter and haptics.
//
// The API other packages call is `GameAudio` below (created by the session): the cutscene
// player sets the shot list's track, starting layers and silences and plays written sounds and
// phrases; dialogue painters play blips; the session feeds frames and kernel events.

import ambienceTable from '../../../data/audio/ambience.json';
import cueTable from '../../../data/audio/cues.json';
import selectionTable from '../../../data/audio/selection.json';
import type { AnyWorldEvent } from '../../core/contracts';
import type { AtlasMapDef } from '../../systems/world/atlas';
import type { GameView } from '../view/game_view';
import type { AmbienceTable } from './ambience_mixer';
import { AudioEngine, type AudioOp, type AudioTables } from './audio_engine';
import type { AudioIndex } from './audio_manifest';
import {
  type AudioRuntimeSettings,
  type AudioSettingsSource,
  resolveAudioSettings,
} from './audio_settings';
import { type SessionAudioState, WorldProbe } from './audio_world';
import { CaptionPainter } from './caption_painter';
import type { CueTable } from './cue_map';
import { playRumble } from './haptics';
import type { SelectionTable } from './hit_select';
import type { StingerClass } from './music_player';
import type { RumbleEvent } from './rumble';
import { seededRng, type VoiceBus } from './sound_player';
import type { ListenTier, SourcePlace } from './spatializer';

export {
  type AmbienceTable,
  mixAmbience,
  PointScheduler,
  validateAmbienceTable,
} from './ambience_mixer';
export {
  AudioDirector,
  bossLayers,
  COMBAT_EXIT_MS,
  COMBAT_TRACKS,
  type CombatTier,
  combatTierOf,
  DEFAULT_VIEW_MUSIC,
  type DirectorInput,
  type DirectorOutput,
  type Hostile,
  type LocationAudio,
  locationLayers,
  type MapView,
  type MusicContext,
  type MusicPlan,
  type MusicWeather,
  openLayers,
  TENSION_PERIOD_MS,
  type Transition,
  tensionOf,
} from './audio_director';
export {
  AudioEngine,
  type AudioFrame,
  type AudioOp,
  type AudioOverrides,
  type AudioTables,
  type AudioTrigger,
} from './audio_engine';
export {
  type AudioEntry,
  AudioIndex,
  approvedAudio,
  audioMetaProblems,
  buildAudioIndex,
  mapPack,
} from './audio_manifest';
export {
  type AudioOptions,
  type AudioRuntimeSettings,
  type AudioSettingsSource,
  captionShown,
  defaultAudioOptions,
  flashReduced,
  resolveAudioSettings,
} from './audio_settings';
export { type SessionAudioState, WorldProbe } from './audio_world';
export {
  BUSES,
  type BusId,
  type BusState,
  DEFAULT_VOLUMES,
  DUCKS,
  type Duck,
  type DuckTrigger,
  defaultMixSettings,
  effectiveDb,
  type MasterChain,
  type MixSettings,
  masterChain,
  mixBuses,
  sliderToDb,
  VOICE_CAPS,
} from './bus_model';
export { CaptionBoard, type CaptionLine, captionId } from './captions';
export {
  type Cue,
  type CueHit,
  type CueTable,
  type CueValue,
  resolveCues,
  soundFor,
  soundsOf,
  type Trigger,
  validateCueTable,
} from './cue_map';
export {
  type Combatant,
  type HitSelection,
  hitCueFields,
  type SelectionTable,
  selectHit,
  validateSelectionTable,
} from './hit_select';
export { MusicScheduler, type StingerClass, StingerGate } from './music_player';
export { RUMBLE_TABLE, type RumbleEvent, rumbleSteps } from './rumble';
export { VoicePool } from './sound_player';
export { type ListenTier, listenTierOf, place, quieterTier, REVERB_ZONES } from './spatializer';

/** The data tables of data/audio/, typed. */
export const AUDIO_TABLES: AudioTables = {
  cues: cueTable as unknown as CueTable,
  ambience: ambienceTable as unknown as AmbienceTable,
  selection: selectionTable as unknown as SelectionTable,
};

/** The Web Audio side, as the facade drives it (./audio_bus.ts; a fake in tests). */
export interface AudioOutput {
  apply(ops: readonly AudioOp[], nowSec: number): void;
  resume(): void;
  /** Route to an output device (null: the system default), where the platform allows it. */
  setDevice?(id: string | null): void;
  /** The audio clock in seconds (the music is scheduled on it, 9.5). */
  now?(): number;
  dispose(): void;
}

/**
 * The subsystem's API. Every call is safe at any time, with or without an audio device, with
 * or without approved files; ids without a file are silent and their captions still show.
 */
export interface GameAudio {
  /** Call from a user gesture: starts audio output (the browser's autoplay rule). */
  unlock(): void;
  /** Once per animation frame, after the world stepped. */
  frame(state: SessionAudioState): void;
  /** The kernel's events of a step (subscribe with engine.onEvents). */
  events(evs: readonly AnyWorldEvent[], nowMs: number): void;
  /**
   * The cutscene player's shot list (audio_direction.md 5.9): a track id (or null), how many
   * layers start open (from L1), or a written silence; null when the cutscene ends.
   */
  setCutscene(cue: { music: string | null; layers?: number; silence?: boolean } | null): void;
  /** A goddess on stage: her theme (mus_god_*), or null when she leaves (5.1, 8.2). */
  setDivine(music: string | null): void;
  /** Inside a dream: the dream track takes over (5.1). */
  setDream(on: boolean): void;
  /** The prologue's eavesdropping distance (P5): far, mid or near; null when it ends. */
  setListenTier(tier: ListenTier | null): void;
  /**
   * A written sound: cutscene effects (`group: 'cine'`), interface sounds, dialogue blips
   * (`sfx_ui_blip_*`, which follow the blip setting and the eavesdrop tier). `at` places it
   * on the map; `caption` is an `audio.cap.<id>` key; `loud` marks a sudden heavy hit.
   */
  playSound(
    id: string,
    opts?: {
      bus?: VoiceBus;
      group?: string | null;
      priority?: number;
      at?: SourcePlace;
      caption?: string | null;
      captionLevel?: 'important' | 'all';
      loud?: boolean;
      voice?: boolean;
    },
  ): void;
  /** Stop a written sound started with playSound (a loop, or a long one-shot). */
  stopSound(id: string, fadeMs?: number): void;
  /** A music phrase (mus_stg_*) through the 5.7 gate: act cards, comedy twists. */
  playStinger(id: string, cls?: StingerClass, queue?: boolean): void;
  /**
   * The dialogue's model request (5.10): 'start' when a player-facing request goes out, 'reply'
   * when its first sentence streams in, 'error' when the connection fails. Once called, it
   * replaces the guess from pending requests while a dialogue is open.
   */
  modelWait(phase: 'start' | 'reply' | 'error'): void;
  /** A pad rumble the cue table does not cover (a boss stomp in a cutscene). */
  rumble(ev: RumbleEvent): void;
  /**
   * The settings or the window focus changed: applied at once, also while no frame runs (a
   * hidden tab stops the animation frames; the background rule must still hold, 10.3).
   */
  settingsChanged(): void;
  /** What the engine runs with now. */
  settings(): AudioRuntimeSettings;
  dispose(): void;
}

export interface GameAudioOptions {
  view: GameView;
  /** Where the caption painter attaches. */
  root: HTMLElement | null;
  atlas: readonly AtlasMapDef[];
  /** The sync settings part (or the slice of it the audio reads). */
  settings: () => AudioSettingsSource | null | undefined;
  /** Creates the output on unlock; null when the page has no audio. */
  output?: () => AudioOutput | null;
  /** Reads the playable index (development builds: the manifest and processed metadata). */
  loadIndex?: () => Promise<{ index: AudioIndex; problems: string[] }>;
  /** The output device id (local settings, desktop); null is the system default. */
  device?: () => string | null;
  /** Window focus and the system's reduce-motion preference. */
  environment?: () => { focused: boolean; systemReducedMotion: boolean };
  /** Pad rumble output; default the Gamepad API. */
  rumbleOut?: (steps: Parameters<typeof playRumble>[0]) => void;
  /** Seed of the presentation randomness (variants, details). */
  seed?: number;
  /** Developer log (English). */
  log?: (message: string) => void;
}

/** Build the subsystem. It works without an output (silent) and without a painter (no captions drawn). */
export function createGameAudio(opts: GameAudioOptions): GameAudio {
  const env = opts.environment ?? (() => ({ focused: true, systemReducedMotion: false }));
  const resolve = () => resolveAudioSettings(opts.settings() ?? null, env());
  let current = resolve();
  let settingsKey = JSON.stringify(current);
  // The settings object the store hands out is replaced on every write: resolve only then.
  let lastSource: unknown = opts.settings();
  let lastEnv = JSON.stringify(env());
  const engine = new AudioEngine(AUDIO_TABLES, current, seededRng(opts.seed ?? 1));
  const probe = new WorldProbe(opts.view, AUDIO_TABLES, opts.atlas);
  const painter = opts.root ? new CaptionPainter(opts.root) : null;
  const rumbleOut = opts.rumbleOut ?? playRumble;
  let output: AudioOutput | null = null;
  let device: string | null = null;
  let unlocked = false;
  let disposed = false;
  let nowMs = 0;

  const refresh = (force = false): void => {
    const want = opts.device?.() ?? null;
    if (output && want !== device) {
      device = want;
      output.setDevice?.(want);
    }
    const source = opts.settings();
    const envKey = JSON.stringify(env());
    if (!force && source === lastSource && envKey === lastEnv) return;
    lastSource = source;
    lastEnv = envKey;
    const next = resolve();
    const key = JSON.stringify(next);
    if (key === settingsKey) return;
    settingsKey = key;
    current = next;
    engine.setSettings(next);
  };

  /** The audio clock now (the frame clock when no output runs). */
  const clockSec = (): number => output?.now?.() ?? nowMs / 1000;

  const flush = (): void => {
    const ops = engine.drain();
    if (ops.length === 0) return;
    const steps = ops.flatMap((o) => (o.op === 'rumble' ? o.steps : []));
    if (steps.length > 0) rumbleOut(steps);
    output?.apply(ops, clockSec());
  };

  if (opts.loadIndex) {
    opts
      .loadIndex()
      .then(({ index, problems }) => {
        if (disposed) return;
        for (const p of problems) opts.log?.(`[audio] ${p}`);
        engine.setIndex(index);
      })
      .catch((err) => opts.log?.(`[audio] no audio index: ${String(err)}`));
  }

  return {
    unlock() {
      if (disposed) return;
      if (!unlocked) {
        unlocked = true;
        output = opts.output?.() ?? null;
        if (output) {
          engine.resync();
          device = opts.device?.() ?? null;
          if (device) output.setDevice?.(device);
        }
      }
      output?.resume();
    },
    frame(state) {
      if (disposed) return;
      nowMs = state.nowMs;
      refresh();
      const { frame, triggers } = probe.frame(state);
      if (output) frame.audioSec = clockSec();
      // Triggers first: a roar fired this frame holds the boss track until it ends (5.3).
      engine.begin(frame);
      for (const t of triggers) engine.trigger(t);
      engine.update(frame);
      flush();
      painter?.paint(engine.captionLines(nowMs), engine.captions.stamp(nowMs));
    },
    events(evs, at) {
      if (disposed) return;
      for (const t of probe.events(evs, at)) engine.trigger(t);
    },
    setCutscene(cue) {
      engine.overrides.cutscene = cue
        ? { music: cue.music, silence: !!cue.silence, layers: cue.layers }
        : null;
    },
    setDivine(music) {
      engine.overrides.divine = music;
    },
    setDream(on) {
      engine.overrides.dream = on;
    },
    setListenTier(tier) {
      engine.overrides.listen = tier;
    },
    playSound(id, o) {
      engine.playSound(id, o);
    },
    stopSound(id, fadeMs) {
      engine.stopSound(id, fadeMs);
    },
    playStinger(id, cls, queue) {
      engine.playStinger(id, cls, queue);
    },
    modelWait(phase) {
      engine.modelWait(phase);
    },
    rumble(ev) {
      engine.rumbleNow(ev);
    },
    settingsChanged() {
      if (disposed) return;
      refresh(true);
      engine.pushBus();
      flush();
    },
    settings() {
      return current;
    },
    dispose() {
      if (disposed) return;
      engine.stopAll();
      flush();
      disposed = true;
      painter?.dispose();
      output?.dispose();
      output = null;
    },
  };
}
