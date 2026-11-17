// The audio engine (audio_direction.md 5 to 10; release_engineering.md 9): the pure
// orchestrator of the subsystem. Each frame it takes what the world probe saw (./audio_world.ts)
// and the session's overrides (cutscene track, goddess theme, dream, the eavesdrop tier), runs
// the director, the music scheduler, the stinger gate, the ambience mixer and its details, the
// voice pool, the spatializer, the caption board and the rumble table, and queues audio
// operations for the Web Audio side (./audio_bus.ts). It never touches an audio context and
// never reads the world itself, so it runs (and is tested) in Node; with no audio device the
// operations are dropped and the game runs silent while captions and rumble still work. Only
// ids with an approved processed result are played (./audio_manifest.ts); any other id is
// skipped without a sound (9.2), and its caption still shows. Music is scheduled on the audio
// clock when there is one (9.5), on the frame clock otherwise. Pure: the caller passes the
// clocks and a seeded random source.

import {
  type AmbienceBedDef,
  type AmbiencePointDef,
  type AmbienceTable,
  bedsAt,
  mixAmbience,
  PointScheduler,
} from './ambience_mixer';
import {
  AudioDirector,
  type DirectorInput,
  type DirectorOutput,
  type LocationAudio,
  type MusicWeather,
} from './audio_director';
import { type AudioEntry, AudioIndex, mapPack } from './audio_manifest';
import type { AudioRuntimeSettings } from './audio_settings';
import {
  type BusId,
  type BusState,
  type DuckTrigger,
  type MasterChain,
  masterChain,
  mixBuses,
  REDUCE_LOUD_CUT_DB,
} from './bus_model';
import { CaptionBoard, type CaptionLine } from './captions';
import { type CueHit, type CueTable, resolveCues, type Trigger } from './cue_map';
import type { SelectionTable } from './hit_select';
import {
  LEAD_SEC,
  type MusicCommand,
  MusicScheduler,
  nextLine,
  type StingerClass,
  StingerGate,
  type TrackGrid,
} from './music_player';
import { type RumbleEvent, type RumbleStep, rumbleSteps } from './rumble';
import { jitter, type Rng, VariantPicker, type VoiceBus, VoicePool } from './sound_player';
import {
  LISTEN_MIX,
  type Listener,
  type ListenTier,
  type Placement,
  place,
  type ReverbZone,
  type SourcePlace,
} from './spatializer';

/** The data tables of data/audio/. */
export interface AudioTables {
  cues: CueTable;
  ambience: AmbienceTable;
  selection: SelectionTable;
}

/** A trigger with where it happened and what else it means. */
export interface AudioTrigger extends Trigger {
  /** Where the sound comes from; absent: not placed (interface, the player's own state). */
  at?: SourcePlace;
  /** The struck target, for merging hits within 100 ms (8.3). */
  targetId?: string;
  /** The walker, for footsteps (one per entity, 20 m range). */
  footstepOf?: string;
  /** Start this many milliseconds late (the hit after its swing, 7.16 sync). */
  delayMs?: number;
  /** Shift in semitones (big or small bodies, old monsters, 7.16). */
  pitch?: number;
  /** A pad rumble that goes with it (10.5). */
  rumble?: RumbleEvent;
}

/** What one frame of the world sounds like (the probe's view of the world). */
export interface AudioFrame {
  nowMs: number;
  /** The audio clock in seconds when an output runs (9.5); absent: the frame clock is used. */
  audioSec?: number;
  /** Map id, for the per-map pack and the details' schedule. */
  mapId: string | null;
  location: LocationAudio | null;
  night: boolean;
  hour: number;
  weather: MusicWeather;
  outdoor: boolean;
  combat: DirectorInput['combat'];
  tension: DirectorInput['tension'];
  boss: DirectorInput['boss'];
  /** The boss fight just ended in a victory. */
  bossVictory?: boolean;
  /** Time was just skipped (sleep, waiting). */
  timeSkipped?: boolean;
  paused: boolean;
  inScene: boolean;
  dialogueOpen: boolean;
  /** Beds and details the map registers (atlas `ambience`, `ambiencePoints`). */
  beds: readonly AmbienceBedDef[];
  points: readonly AmbiencePointDef[];
  reverb: ReverbZone;
  sediment: number;
  activeDungeon: boolean;
  interiorKind: string | null;
  listener: Listener | null;
  /** Cue ids of looping sounds the world still holds (the presence heartbeat). */
  sustain: readonly string[];
  /** The presence the player feels now (the pad pulses with the heartbeat, 10.5). */
  presence?: 'low' | 'high' | null;
  /** Voice families of the monsters on the map (their sounds are decoded ahead, 9.4). */
  voices?: readonly string[];
  /** A player-facing model request is pending (5.10); ignored once modelWait drives it. */
  aiWaiting: boolean;
}

/** Session overrides (the public API of ./index.ts sets them). */
export interface AudioOverrides {
  cutscene: { music: string | null; silence: boolean; layers?: number } | null;
  divine: string | null;
  dream: boolean;
  listen: ListenTier | null;
}

export type AudioOp =
  | {
      op: 'bus';
      mix: Record<BusId, BusState>;
      chain: MasterChain;
      /** The music decks' own duck under a phrase (5.7): the phrase itself is not lowered. */
      deckDb: number;
    }
  | { op: 'music'; cmd: MusicCommand; entry?: AudioEntry }
  | {
      op: 'play';
      voice: number;
      id: string;
      file: string;
      bus: VoiceBus;
      group: string | null;
      gainDb: number;
      pan: number;
      lowpassHz: number | null;
      rate: number;
      loop: boolean;
      delayMs: number;
      /** Mono placed effects feed the reverb zone. */
      wet: boolean;
    }
  | { op: 'stop'; voice: number; fadeMs: number }
  | {
      op: 'bed';
      id: string;
      file: string;
      gainDb: number;
      lowpassHz: number | null;
      rampMs: number;
    }
  | { op: 'bedStop'; id: string; fadeMs: number }
  | { op: 'reverb'; zone: ReverbZone }
  | { op: 'preload'; files: string[] }
  | { op: 'rumble'; steps: RumbleStep[] };

/** The model-waiting sound starts only after 600 ms without a reply (5.10). */
export const LLM_WAIT_MS = 600;
export const LLM_FADE_MS = 200;
/** A looping sound the world stops holding fades after this long. */
export const SUSTAIN_GRACE_MS = 1000;
/** Beds change gain over 1 s (the indoor change of 6.1); new beds fade in over 2 s. */
export const BED_RAMP_MS = 1000;
export const BED_FADE_MS = 2000;
/** A boss roar ducks the music and ambience for 1.5 s (8.2). */
export const ROAR_DUCK_MS = 1500;
/** The goddess theme returns to the previous track 3 s after she leaves (5.1). */
export const DIVINE_HOLD_MS = 3000;
/** The phrase duck on the music decks (5.7). */
export const STINGER_DUCK_DB = -6;
/** The pad's heartbeat pulse by felt presence (one or two beats a second, 7.1). */
const PULSE_MS: Readonly<Record<'low' | 'high', number>> = { low: 1000, high: 667 };

const OFF = Number.NEGATIVE_INFINITY;

interface LoopVoice {
  voice: number;
  id: string;
  lastMs: number;
  /** Held by the session (a written loop) instead of the world's sustain list. */
  manual: boolean;
}

interface PlayOptions {
  bus: VoiceBus;
  group: string | null;
  priority: number;
  placement: Placement | null;
  extraDb: number;
  delayMs: number;
  mergeKey?: string;
  weight?: number;
  footstepOf?: string;
  distance?: number;
  pitch?: number;
  /** A voice behind the curtain: follows the eavesdrop tier. */
  listen?: boolean;
}

export class AudioEngine {
  private index: AudioIndex;
  private settings: AudioRuntimeSettings;
  private readonly director = new AudioDirector();
  private music = new MusicScheduler();
  private readonly stingers = new StingerGate();
  private pool = new VoicePool();
  private readonly variants = new VariantPicker();
  private readonly points = new PointScheduler();
  readonly captions = new CaptionBoard();
  private ops: AudioOp[] = [];
  private beds = new Map<string, { gainDb: number; lowpassHz: number | null }>();
  private loops = new Map<string, LoopVoice>();
  private lastBus = '';
  private lastDucks: DuckTrigger[] = [];
  private reverb: ReverbZone | null = null;
  private mapId: string | null = null;
  private lastFrame: AudioFrame | null = null;
  private preloadedVoices = new Set<string>();
  private stingerUntilMs = Number.NEGATIVE_INFINITY;
  private roarEndMs = Number.NEGATIVE_INFINITY;
  private roarDuckUntilMs = Number.NEGATIVE_INFINITY;
  private nextPulseMs = Number.NEGATIVE_INFINITY;
  private waitingSinceMs: number | null = null;
  private thinking = false;
  private externalWait = false;
  private divineHeld: string | null = null;
  private divineUntilMs = Number.NEGATIVE_INFINITY;
  private inCombat = false;
  private listener: Listener | null = null;
  private nowMs = 0;
  private nowSec = 0;
  private lastOut: DirectorOutput | null = null;
  readonly overrides: AudioOverrides = { cutscene: null, divine: null, dream: false, listen: null };

  constructor(
    private readonly tables: AudioTables,
    settings: AudioRuntimeSettings,
    private readonly rng: Rng,
    index: AudioIndex = new AudioIndex(),
  ) {
    this.settings = settings;
    this.index = index;
  }

  /** The playable sounds (the loader replaces the empty index once the manifest is read). */
  setIndex(index: AudioIndex): void {
    // Beds of the old index stop; the next frame starts them again from the new one.
    for (const id of this.beds.keys()) this.ops.push({ op: 'bedStop', id, fadeMs: 500 });
    this.beds.clear();
    this.index = index;
    this.preloadedVoices.clear();
    this.queuePreload(this.lastFrame, true);
  }

  setSettings(s: AudioRuntimeSettings): void {
    this.settings = s;
  }

  get runtimeSettings(): AudioRuntimeSettings {
    return this.settings;
  }

  /** The director's last answer (dev overlay and tests). */
  state(): DirectorOutput | null {
    return this.lastOut;
  }

  /** Operations queued since the last drain, for the Web Audio side. */
  drain(): AudioOp[] {
    const out = this.ops;
    this.ops = [];
    return out;
  }

  /** The caption lines on screen now. */
  captionLines(nowMs: number): readonly CaptionLine[] {
    return this.captions.active(nowMs);
  }

  private readonly grid = (id: string): TrackGrid | null => {
    const e = this.index.get(id);
    if (!e) return null;
    return {
      id,
      lengthSec: e.loop ? e.loopEndSec - e.loopStartSec : e.durationSec,
      loop: e.loop,
      bpm: e.bpm,
      beatsPerBar: e.beatsPerBar,
      stems: e.layered ? e.files.length : 1,
    };
  };

  /** The audio clock of an engine time (ms on the frame clock). */
  private audioAt(ms: number): number {
    return this.nowSec + (ms - this.nowMs) / 1000;
  }

  /**
   * Decode ahead (9.4): the map's tracks, beds and details on entry; with `shared`, also the
   * interface sounds and every loop (a loop must not wait for its first decode).
   */
  private queuePreload(frame: AudioFrame | null, shared: boolean): void {
    const extra = shared
      ? this.index.ids().filter((id) => {
          const e = this.index.get(id);
          return !!e && (e.bus === 'ui' || (e.loop && e.kind === 'sfx'));
        })
      : [];
    const ids = frame
      ? mapPack(
          this.index,
          {
            music: frame.location?.music,
            musicNight: frame.location?.musicNight,
            ambience: frame.beds,
            ambiencePoints: frame.points,
          },
          extra,
        )
      : extra;
    const files = ids.flatMap((id) => this.index.get(id)?.files ?? []);
    if (files.length > 0) this.ops.push({ op: 'preload', files });
  }

  /** The monster families on the map: their attack, death and aggro sounds (9.4). */
  private preloadVoices(voices: readonly string[]): void {
    const fresh = voices.filter((v) => !this.preloadedVoices.has(v));
    if (fresh.length === 0) return;
    for (const v of fresh) this.preloadedVoices.add(v);
    const files = this.index
      .ids()
      .filter((id) => fresh.some((v) => id.startsWith(`sfx_mon_${v}_`)))
      .flatMap((id) => this.index.get(id)?.files ?? []);
    if (files.length > 0) this.ops.push({ op: 'preload', files });
  }

  // -------------------------------------------------------------------------
  // Frame

  /**
   * Take the frame's clocks and listener. The facade calls it before the frame's triggers, so
   * a roar fired this frame is known when the director switches to the boss track.
   */
  begin(f: AudioFrame): void {
    this.nowMs = f.nowMs;
    this.nowSec = f.audioSec ?? f.nowMs / 1000;
    this.listener = f.listener;
    for (const v of this.pool.expire(f.nowMs)) this.forgetLoopVoice(v);
    const firstFrame = this.lastFrame === null;
    this.lastFrame = f;
    if (f.mapId !== this.mapId) {
      this.mapId = f.mapId;
      this.points.reset();
      this.queuePreload(f, firstFrame);
    }
    if (f.voices) this.preloadVoices(f.voices);
  }

  update(f: AudioFrame): void {
    if (this.nowMs !== f.nowMs || this.lastFrame !== f) this.begin(f);
    const now = f.nowMs;
    const o = this.overrides;
    // Her theme stays 3 s after she leaves, then the previous track returns (5.1).
    if (o.divine) {
      this.divineHeld = o.divine;
      this.divineUntilMs = Number.POSITIVE_INFINITY;
    } else if (this.divineHeld && this.divineUntilMs === Number.POSITIVE_INFINITY) {
      this.divineUntilMs = now + DIVINE_HOLD_MS;
    }
    if (!o.divine && now >= this.divineUntilMs) this.divineHeld = null;
    const input: DirectorInput = {
      nowMs: now,
      location: f.location,
      night: f.night,
      view: 'personal',
      cutscene: o.cutscene,
      boss: f.boss,
      bossVictory: f.bossVictory,
      timeSkipped: f.timeSkipped,
      combat: f.combat,
      divine: this.divineHeld ? { music: this.divineHeld } : null,
      dream: o.dream,
      tension: f.tension,
      dialogueOpen: f.dialogueOpen,
      paused: f.paused,
      combatMusic: this.settings.combatMusic,
      // Indoors (a building on an outdoor map) the weather does not reach the music either.
      weather: f.outdoor && f.interiorKind === null ? f.weather : 'clear',
    };
    const out = this.director.update(input);
    this.lastOut = out;
    this.inCombat = out.combatTier !== null;
    // The eavesdrop tier: far from the curtain the antechamber track keeps L2 closed (P5).
    const tier = o.listen;
    if (tier && out.context === 'location' && !LISTEN_MIX[tier].musicL2)
      out.music.layers = out.music.layers.map((v, i) => (i === 1 ? OFF : v));
    // Music.
    const cmds = this.music.update({
      nowSec: this.nowSec,
      plan: out.music,
      transition: out.transition,
      grid: this.grid,
      roarEndsAtSec: this.roarEndMs > now ? this.audioAt(this.roarEndMs) : null,
    });
    for (const cmd of cmds) this.pushMusic(cmd, now);
    for (const id of this.stingers.tick(now, this.inCombat)) this.playStingerNow(id, now);
    // Ambience.
    this.updateBeds(f, out.ambience);
    this.updatePoints(f);
    if (f.reverb !== this.reverb) {
      this.reverb = f.reverb;
      this.ops.push({ op: 'reverb', zone: f.reverb });
    }
    // Loops the world holds, the pad's heartbeat, and the model-waiting sound.
    this.updateLoops(f);
    if (f.presence && now >= this.nextPulseMs) {
      this.nextPulseMs = now + PULSE_MS[f.presence];
      this.rumble('presence_pulse');
    }
    if (!this.externalWait) this.updateWaiting(f.aiWaiting, now);
    else if (this.waitingSinceMs !== null) this.updateWaiting(true, now);
    // Buses last: they read the ducks this frame raised.
    const ducks: DuckTrigger[] = [...out.ducks];
    if (f.inScene && !o.cutscene && !ducks.includes('cutscene')) ducks.push('cutscene');
    if (now < this.roarDuckUntilMs) ducks.push('boss_roar');
    this.lastDucks = ducks;
    this.pushBus();
  }

  /** The bus state now (also when only the settings or the window focus changed). */
  pushBus(): void {
    const mix = mixBuses(this.settings.mix, this.lastDucks);
    const chain = masterChain(this.settings);
    const deckDb = this.nowMs < this.stingerUntilMs ? STINGER_DUCK_DB : 0;
    const key = JSON.stringify([mix, chain, deckDb]);
    if (key === this.lastBus) return;
    this.lastBus = key;
    this.ops.push({ op: 'bus', mix, chain, deckDb });
  }

  private pushMusic(cmd: MusicCommand, now: number): void {
    if (cmd.op === 'start') {
      const entry = this.index.get(cmd.id);
      if (entry) this.ops.push({ op: 'music', cmd, entry });
      return;
    }
    if (cmd.op === 'stinger') {
      this.stingers.played(cmd.id, now);
      this.stingerOp(cmd.id, cmd.atSec, now);
      return;
    }
    this.ops.push({ op: 'music', cmd });
  }

  private stingerOp(id: string, atSec: number, now: number): void {
    const entry = this.index.get(id);
    if (!entry) return;
    this.ops.push({ op: 'music', cmd: { op: 'stinger', id, atSec }, entry });
    const endMs = now + (atSec - this.nowSec + entry.durationSec) * 1000;
    this.stingerUntilMs = Math.max(this.stingerUntilMs, endMs);
  }

  /** A stinger the gate let through: on the next beat, in a fight on the next bar line (5.7). */
  private playStingerNow(id: string, now: number): void {
    const cur = this.music.current();
    const atSec = cur
      ? nextLine(cur, this.nowSec, this.inCombat ? 'bar' : 'beat')
      : this.nowSec + LEAD_SEC;
    this.stingerOp(id, atSec, now);
  }

  private updateBeds(f: AudioFrame, extra: readonly string[]): void {
    const registered = bedsAt(f.beds, f.night);
    const mix = mixAmbience(
      {
        beds: f.beds,
        extra: extra.filter((id) => !registered.includes(id)),
        night: f.night,
        outdoor: f.outdoor,
        weather: f.weather,
        sediment: f.sediment,
        activeDungeon: f.activeDungeon,
        interiorKind: f.interiorKind,
      },
      this.tables.ambience,
    );
    const want = new Map<string, { gainDb: number; lowpassHz: number | null; file: string }>();
    for (const b of mix) {
      const e = this.index.get(b.id);
      const file = e?.files[0];
      if (!e?.loop || !file) continue;
      want.set(b.id, { gainDb: b.gainDb, lowpassHz: b.lowpassHz, file });
    }
    for (const id of [...this.beds.keys()])
      if (!want.has(id)) {
        this.ops.push({ op: 'bedStop', id, fadeMs: BED_FADE_MS });
        this.beds.delete(id);
      }
    for (const [id, w] of want) {
      const had = this.beds.get(id);
      if (had && had.gainDb === w.gainDb && had.lowpassHz === w.lowpassHz) continue;
      this.ops.push({
        op: 'bed',
        id,
        file: w.file,
        gainDb: w.gainDb,
        lowpassHz: w.lowpassHz,
        rampMs: had ? BED_RAMP_MS : BED_FADE_MS,
      });
      this.beds.set(id, { gainDb: w.gainDb, lowpassHz: w.lowpassHz });
    }
  }

  private updatePoints(f: AudioFrame): void {
    if (!f.listener || f.paused) return;
    const weatherPoints = f.outdoor ? (this.tables.ambience.weatherPoints[f.weather] ?? []) : [];
    const pool = [...f.points, ...weatherPoints];
    if (pool.length === 0) return;
    const shot = this.points.update(f.nowMs, pool, f.hour, this.rng);
    if (!shot) return;
    // Details are outdoors: indoors the listener's building occludes them (8.4).
    const at = { x: f.listener.x + shot.dx, y: f.listener.y + shot.dy, threat: true, zone: null };
    const placement = place(at, f.listener, this.settings.mono);
    const cap = this.tables.ambience.captions[shot.id];
    if (cap)
      this.captions.push(
        { key: cap.key, level: cap.level, direction: placement.direction },
        this.settings.captions,
        f.nowMs,
      );
    this.playEntry(shot.id, {
      bus: 'ambience',
      group: null,
      priority: 5,
      placement,
      extraDb: 0,
      delayMs: 0,
    });
  }

  private updateLoops(f: AudioFrame): void {
    for (const [key, l] of [...this.loops]) {
      if (l.manual || key === 'llm_thinking') continue;
      if (f.sustain.includes(key)) l.lastMs = f.nowMs;
      if (f.nowMs - l.lastMs > SUSTAIN_GRACE_MS) this.endLoop(key, 500);
    }
  }

  private endLoop(key: string, fadeMs: number): void {
    const l = this.loops.get(key);
    if (!l) return;
    this.ops.push({ op: 'stop', voice: l.voice, fadeMs });
    this.pool.release(l.voice);
    this.loops.delete(key);
  }

  /** The waiting sound (5.10): after 600 ms of waiting; the reply or error sound ends it. */
  private updateWaiting(waiting: boolean, now: number): void {
    const on = waiting && this.settings.llmThinking;
    if (on) {
      if (this.waitingSinceMs === null) this.waitingSinceMs = now;
      if (!this.thinking && now - this.waitingSinceMs >= LLM_WAIT_MS) {
        this.thinking = true;
        this.trigger({ event: 'client.llm_waiting', fields: {} });
      }
      return;
    }
    this.endWait('client.llm_reply');
  }

  private endWait(sound: 'client.llm_reply' | 'client.llm_error' | null): void {
    this.waitingSinceMs = null;
    const marked = this.thinking;
    this.thinking = false;
    this.endLoop('llm_thinking', LLM_FADE_MS);
    // The reply sound only follows a wait the waiting sound marked; an error always sounds.
    if (sound === 'client.llm_error' || (sound && marked))
      this.trigger({ event: sound, fields: {} });
  }

  /**
   * The dialogue's model request (5.10, D-079): 'start' when a player-facing request goes out,
   * 'reply' when its first sentence streams in, 'error' when the connection fails. Once called,
   * it replaces the frame's pending-request guess.
   */
  modelWait(phase: 'start' | 'reply' | 'error'): void {
    this.externalWait = true;
    if (phase === 'start') {
      if (this.waitingSinceMs === null) this.waitingSinceMs = this.nowMs;
      return;
    }
    this.endWait(phase === 'reply' ? 'client.llm_reply' : 'client.llm_error');
  }

  private forgetLoopVoice(voice: number): void {
    for (const [k, l] of this.loops) if (l.voice === voice) this.loops.delete(k);
  }

  // -------------------------------------------------------------------------
  // Triggers

  /** A kernel event, an animation key frame or a client trigger. */
  trigger(t: AudioTrigger): void {
    if (t.rumble) this.rumble(t.rumble);
    for (const hit of resolveCues(this.tables.cues, t)) this.fire(hit, t);
  }

  private fire(hit: CueHit, t: AudioTrigger): void {
    const now = this.nowMs;
    const l = this.listener;
    const placement = t.at && l ? place(t.at, l, this.settings.mono) : null;
    if (hit.caption)
      this.captions.push(
        {
          key: hit.caption,
          level: hit.captionLevel ?? 'all',
          direction: placement?.direction ?? null,
        },
        this.settings.captions,
        now,
      );
    if (hit.stinger) {
      this.offerStinger(hit.sound, hit.stingerClass, hit.queue, now);
      return;
    }
    if (hit.sound.startsWith('sfx_ui_blip') && !this.settings.dialogueBlips) return;
    if (placement && !placement.audible) return;
    const voice = this.playEntry(hit.sound, {
      bus: hit.bus,
      group: hit.group,
      priority: hit.priority,
      placement,
      extraDb: hit.loud && this.settings.reduceLoud ? REDUCE_LOUD_CUT_DB : 0,
      delayMs: t.delayMs ?? 0,
      mergeKey: t.targetId ? `hit:${t.targetId}:${hit.cue}` : undefined,
      weight: t.fields.outcome === 'crit' ? 2 : t.fields.weight === 'heavy' ? 1.5 : 1,
      footstepOf: t.footstepOf,
      distance: t.at && l ? Math.hypot(t.at.x - l.x, t.at.y - l.y) : 0,
      pitch: t.pitch,
    });
    const entry = this.index.get(hit.sound);
    if (voice === null || !entry) return;
    if (entry.loop) {
      const prev = this.loops.get(hit.cue);
      if (prev && prev.voice !== voice) this.endLoop(hit.cue, 300);
      this.loops.set(hit.cue, { voice, id: hit.sound, lastMs: now, manual: false });
    }
    // The boss track enters when the roar ends (5.3); the roar ducks for 1.5 s (8.2).
    if (t.event === 'combat.boss_engaged') {
      this.roarEndMs = now + entry.durationSec * 1000;
      this.roarDuckUntilMs = now + ROAR_DUCK_MS;
    }
  }

  private offerStinger(id: string, cls: StingerClass, queue: boolean, now: number): void {
    // A phrase without an approved file is silent and does not hold the gate (9.2).
    if (!this.index.has(id)) return;
    const verdict = this.stingers.offer({ id, cls, queue }, now, this.inCombat);
    if (verdict === 'play') this.playStingerNow(id, now);
  }

  /** Start one sound; returns its voice, or null when it does not play. */
  private playEntry(id: string, o: PlayOptions): number | null {
    const entry = this.index.get(id);
    if (!entry) return null;
    // A loop already sounding for the same id keeps going.
    for (const l of this.loops.values()) if (l.id === id) return l.voice;
    const admit = this.pool.admit(
      {
        id,
        bus: o.bus,
        priority: o.priority,
        mergeKey: o.mergeKey,
        weight: o.weight,
        footstepOf: o.footstepOf,
        distance: o.distance,
        durationMs: entry.loop ? Number.POSITIVE_INFINITY : entry.durationSec * 1000 + o.delayMs,
      },
      this.nowMs,
    );
    if (!admit.ok) return null;
    for (const v of admit.evict) {
      this.ops.push({ op: 'stop', voice: v, fadeMs: 60 });
      this.forgetLoopVoice(v);
    }
    const variant = entry.layered ? 0 : this.variants.pick(id, entry.files.length, this.rng);
    const j = jitter(o.bus, this.rng);
    const p = o.placement;
    // Mono sounds are placed; stereo ones keep their image and only take the distance (8.4).
    const mono = entry.channels === 'mono';
    const tier = o.listen && this.overrides.listen ? LISTEN_MIX[this.overrides.listen] : null;
    const rate = j.rate * 2 ** ((o.pitch ?? 0) / 12);
    this.ops.push({
      op: 'play',
      voice: admit.voice,
      id,
      file: entry.files[variant] as string,
      bus: o.bus,
      group: o.group,
      gainDb: (p ? p.gainDb : 0) + j.gainDb + o.extraDb + (tier ? tier.gainDb : 0),
      pan: p && mono ? p.pan : 0,
      lowpassHz: tier?.lowpassHz ?? (p && mono ? p.lowpassHz : null),
      rate,
      loop: entry.loop,
      delayMs: o.delayMs,
      wet: !!p && mono && o.bus === 'sfx',
    });
    return admit.voice;
  }

  private rumble(ev: RumbleEvent): void {
    const steps = rumbleSteps(ev, this.settings.rumble, this.settings.reduceFlashing);
    if (steps.length > 0) this.ops.push({ op: 'rumble', steps });
  }

  // -------------------------------------------------------------------------
  // The public API's direct calls

  /** A written sound (cutscene effects, interface sounds): plays when it has a file. */
  playSound(
    id: string,
    opts: {
      bus?: VoiceBus;
      group?: string | null;
      priority?: number;
      at?: SourcePlace;
      caption?: string | null;
      captionLevel?: 'important' | 'all';
      loud?: boolean;
      /** A voice behind the curtain (follows the eavesdrop tier). */
      voice?: boolean;
    } = {},
  ): void {
    const now = this.nowMs;
    const l = this.listener;
    const placement = opts.at && l ? place(opts.at, l, this.settings.mono) : null;
    if (opts.caption)
      this.captions.push(
        {
          key: opts.caption,
          level: opts.captionLevel ?? 'all',
          direction: placement?.direction ?? null,
        },
        this.settings.captions,
        now,
      );
    if (placement && !placement.audible) return;
    if (id.startsWith('sfx_ui_blip') && !this.settings.dialogueBlips) return;
    const entry = this.index.get(id);
    if (!entry) return;
    const voice = this.playEntry(id, {
      bus: opts.bus ?? entry.bus,
      group: opts.group ?? entry.group,
      priority: opts.priority ?? entry.priority ?? 3,
      placement,
      extraDb: opts.loud && this.settings.reduceLoud ? REDUCE_LOUD_CUT_DB : 0,
      delayMs: 0,
      listen: opts.voice ?? id.startsWith('sfx_ui_blip'),
    });
    // A written loop plays until stopSound (or the end of the session).
    if (voice !== null && entry.loop)
      this.loops.set(`sound:${id}`, { voice, id, lastMs: now, manual: true });
  }

  /** Stop a written sound started with playSound (its loop, or a long one-shot). */
  stopSound(id: string, fadeMs = 300): void {
    this.endLoop(`sound:${id}`, fadeMs);
    for (const v of this.pool.active())
      if (v.id === id) {
        this.ops.push({ op: 'stop', voice: v.voice, fadeMs });
        this.pool.release(v.voice);
      }
  }

  /** A music phrase through the 5.7 gate (act cards, comedy twists, written cutscene phrases). */
  playStinger(id: string, cls: StingerClass = 'story', queue = false): void {
    this.offerStinger(id, cls, queue, this.nowMs);
  }

  /** A pad rumble outside the cue table (a boss stomp from the cutscene player). */
  rumbleNow(ev: RumbleEvent): void {
    this.rumble(ev);
  }

  /**
   * The output was created (the first user input) or replaced: nothing it plays is known, so
   * the next frame starts the music, the beds, the reverb and the bus state afresh.
   */
  resync(): void {
    this.music = new MusicScheduler();
    this.pool = new VoicePool();
    this.beds.clear();
    this.loops.clear();
    this.lastBus = '';
    this.reverb = null;
    this.queuePreload(this.lastFrame, true);
  }

  /** Stop everything (the session ends). */
  stopAll(): void {
    for (const cmd of this.music.stopAll(this.nowSec)) this.ops.push({ op: 'music', cmd });
    for (const id of this.beds.keys()) this.ops.push({ op: 'bedStop', id, fadeMs: 500 });
    this.beds.clear();
    for (const v of this.pool.active()) this.ops.push({ op: 'stop', voice: v.voice, fadeMs: 300 });
    for (const v of [...this.pool.active()]) this.pool.release(v.voice);
    this.loops.clear();
    this.captions.clear();
  }
}
