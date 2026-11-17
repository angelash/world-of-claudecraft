// The Web Audio graph (audio_direction.md 8.2 to 8.4, 9.4, 10.2; release_engineering.md 9.1):
// the only module of the subsystem that touches an audio context. It builds the five buses
// (master, music, ambience, sfx with its sound groups, interface), the master chain (night
// compression, the -1 dBTP limiter, the mono fold), the reverb zone (impulse responses
// generated at run time from the zone's parameters, crossfaded over 1 s), and applies the
// engine's operations: music decks of sample-aligned layers that only switch by gain (the
// decks have their own duck under a phrase, so the phrase itself is not lowered), beds, voices
// with gain, pan and low-pass, and the decoding of processed files. A one-shot whose file is
// not decoded yet is skipped the first time and decoded for the next (9.6); a loop waits for
// its decode; a file that fails to load stays silent for the session. Decoded files are kept
// within the 9.4 budgets (music 256 MB, ambience 64 MB, effects 160 MB), least recently used
// first out. Any failure inside the graph is caught: the game never stops for audio. The
// context is created on the first user input (the autoplay rule); when none can be created
// there is no bus and the engine runs silent.

import type { AudioOp } from './audio_engine';
import type { AudioEntry } from './audio_manifest';
import type { BusId, BusState, MasterChain } from './bus_model';
import type { MusicCommand } from './music_player';
import { seededRng } from './sound_player';
import { REVERB_PRESETS, REVERB_RAMP_MS, type ReverbZone } from './spatializer';

export interface WebAudioOptions {
  /** URL prefix of assets/ (the processed files are relative to it). */
  base: string;
  /** Developer log (English). */
  log?: (message: string) => void;
}

type VoiceBusId = Exclude<BusId, 'master'>;

const dbGain = (db: number): number => (Number.isFinite(db) ? 10 ** (db / 20) : 0);
const OPEN_HZ = 20000;
const SFX_GROUPS = ['combat', 'world', 'army', 'divine', 'cine'] as const;

/** Decoded-audio budgets in bytes (9.4). */
export const DECODE_BUDGET = {
  music: 256 * 1024 * 1024,
  ambience: 64 * 1024 * 1024,
  sfx: 160 * 1024 * 1024,
} as const;
type BudgetClass = keyof typeof DECODE_BUDGET;

/** The budget a processed file counts against, by its folder (processed/audio/<outDir>/). */
export function budgetOf(file: string): BudgetClass {
  if (/\/music\//.test(file)) return 'music';
  if (/\/ambience\//.test(file)) return 'ambience';
  return 'sfx';
}

interface BusNodes {
  input: GainNode;
  lowpass: BiquadFilterNode;
  shelf: BiquadFilterNode;
  limiter?: DynamicsCompressorNode;
}

interface Deck {
  gain: GainNode;
  filter: BiquadFilterNode;
  stems: GainNode[];
  sources: AudioBufferSourceNode[];
  layers: number[];
  files: string[];
  stopped: boolean;
}

interface Voice {
  src: AudioBufferSourceNode | null;
  gain: GainNode;
  file: string;
  stopped: boolean;
}

interface Bed {
  src: AudioBufferSourceNode | null;
  gain: GainNode;
  filter: BiquadFilterNode;
  file: string;
  /** The level the bed should reach (updates while the file still loads land here). */
  targetDb: number;
  lowpassHz: number | null;
  rampMs: number;
  stopped: boolean;
}

interface Decoded {
  buf: AudioBuffer;
  bytes: number;
  usedAt: number;
}

export class WebAudioBus {
  private readonly master: GainNode;
  private readonly night: DynamicsCompressorNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly fold: GainNode;
  private readonly buses: Record<VoiceBusId, BusNodes>;
  /** The decks' own gain under a phrase (the phrase goes to the music bus beside it). */
  private readonly deckDuck: GainNode;
  private readonly groups = new Map<string, GainNode>();
  private readonly reverbSend: GainNode;
  private readonly reverbs: { conv: ConvolverNode; ret: GainNode }[];
  private reverbSlot = 0;
  private readonly irCache = new Map<ReverbZone, AudioBuffer>();
  private readonly decoded = new Map<string, Decoded>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private readonly failed = new Set<string>();
  private readonly decks = new Map<number, Deck>();
  private readonly voices = new Map<number, Voice>();
  private readonly beds = new Map<string, Bed>();
  private disposed = false;

  /** A bus on a new context, or null when the page has no audio (no device, no API). */
  static create(opts: WebAudioOptions): WebAudioBus | null {
    const g = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctor) return null;
    try {
      return new WebAudioBus(new Ctor({ latencyHint: 'interactive' }), opts);
    } catch (err) {
      opts.log?.(`[audio] no audio context, running silent: ${String(err)}`);
      return null;
    }
  }

  private constructor(
    private readonly ctx: AudioContext,
    private readonly opts: WebAudioOptions,
  ) {
    const c = ctx;
    this.master = c.createGain();
    this.night = c.createDynamicsCompressor();
    this.neutral(this.night);
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.2;
    this.fold = c.createGain();
    this.master.connect(this.night);
    this.night.connect(this.limiter);
    this.limiter.connect(this.fold);
    this.fold.connect(c.destination);
    const bus = (withLimiter: boolean): BusNodes => {
      const input = c.createGain();
      const lowpass = c.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = OPEN_HZ;
      const shelf = c.createBiquadFilter();
      shelf.type = 'highshelf';
      shelf.frequency.value = 6000;
      shelf.gain.value = 0;
      input.connect(lowpass);
      lowpass.connect(shelf);
      if (!withLimiter) {
        shelf.connect(this.master);
        return { input, lowpass, shelf };
      }
      const limiter = c.createDynamicsCompressor();
      this.neutral(limiter);
      shelf.connect(limiter);
      limiter.connect(this.master);
      return { input, lowpass, shelf, limiter };
    };
    this.buses = { music: bus(false), ambience: bus(false), sfx: bus(true), ui: bus(false) };
    this.deckDuck = c.createGain();
    this.deckDuck.connect(this.buses.music.input);
    for (const g of SFX_GROUPS) {
      const node = c.createGain();
      node.connect(this.buses.sfx.input);
      this.groups.set(g, node);
    }
    this.reverbSend = c.createGain();
    this.reverbs = [0, 1].map(() => {
      const conv = c.createConvolver();
      const ret = c.createGain();
      ret.gain.value = 0;
      this.reverbSend.connect(conv);
      conv.connect(ret);
      // The tail joins the world group, so it follows the effects volume and the pause.
      ret.connect(this.groups.get('world') ?? this.buses.sfx.input);
      return { conv, ret };
    });
  }

  private neutral(comp: DynamicsCompressorNode): void {
    comp.threshold.value = 0;
    comp.knee.value = 0;
    comp.ratio.value = 1;
  }

  /** The audio clock in seconds. */
  now(): number {
    return this.ctx.currentTime;
  }

  /** Start the context after a user gesture (the autoplay rule). */
  resume(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  dispose(): void {
    this.disposed = true;
    void this.ctx.close().catch(() => {});
  }

  /** Route the output to a device (10.3, desktop); silently kept on the default elsewhere. */
  setDevice(id: string | null): void {
    const ctx = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (typeof ctx.setSinkId !== 'function') return;
    void ctx.setSinkId(id ?? '').catch((err) => {
      this.opts.log?.(`[audio] output device ${String(id)} refused: ${String(err)}`);
    });
  }

  /** Apply the engine's operations; `nowSec` is the audio clock the engine planned with. */
  apply(ops: readonly AudioOp[], nowSec: number): void {
    if (this.disposed) return;
    for (const op of ops) {
      try {
        this.one(op, nowSec);
      } catch (err) {
        this.opts.log?.(`[audio] ${op.op} failed: ${String(err)}`);
      }
    }
  }

  /** Audio-context time of a planned time, never in the past. */
  private when(atSec: number, nowSec: number): number {
    return this.ctx.currentTime + Math.max(0, atSec - nowSec);
  }

  private one(op: AudioOp, nowSec: number): void {
    switch (op.op) {
      case 'bus':
        this.setBuses(op.mix, op.chain, op.deckDb);
        return;
      case 'music':
        this.music(op.cmd, op.entry, nowSec);
        return;
      case 'play':
        this.play(op);
        return;
      case 'stop':
        this.stopVoice(op.voice, op.fadeMs);
        return;
      case 'bed':
        this.bed(op.id, op.file, op.gainDb, op.lowpassHz, op.rampMs);
        return;
      case 'bedStop':
        this.bedStop(op.id, op.fadeMs);
        return;
      case 'reverb':
        this.setReverb(op.zone);
        return;
      case 'preload':
        for (const f of op.files) void this.load(f);
        return;
      case 'rumble':
        return;
    }
  }

  /** Run a callback that comes back later (a decode) without letting it throw. */
  private guard(what: string, fn: () => void): void {
    try {
      if (!this.disposed) fn();
    } catch (err) {
      this.opts.log?.(`[audio] ${what} failed: ${String(err)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Buses

  /** Hold a parameter where it stands at `at`, then ramp it to `target` over `seconds`. */
  private rampAt(p: AudioParam, target: number, at: number, seconds: number): void {
    const hold = (p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam })
      .cancelAndHoldAtTime;
    if (typeof hold === 'function') hold.call(p, at);
    else {
      p.cancelScheduledValues(at);
      p.setValueAtTime(p.value, at);
    }
    p.linearRampToValueAtTime(target, at + Math.max(0.01, seconds));
  }

  private ramp(p: AudioParam, target: number, seconds: number): void {
    this.rampAt(p, target, this.ctx.currentTime, seconds);
  }

  private setBuses(mix: Record<BusId, BusState>, chain: MasterChain, deckDb: number): void {
    this.ramp(this.master.gain, dbGain(mix.master.db), 0.2);
    for (const id of ['music', 'ambience', 'sfx', 'ui'] as const) {
      const st = mix[id];
      const b = this.buses[id];
      const target = dbGain(st.db);
      // Ducks press and let go at their own pace (8.2: by default 0.2 s down, 1 s back).
      const down = target < b.input.gain.value;
      const ms = down ? (st.attackMs ?? 200) : (st.releaseMs ?? 1000);
      this.ramp(b.input.gain, target, ms / 1000);
      this.ramp(b.lowpass.frequency, st.lowpassHz ?? OPEN_HZ, 0.3);
      if (st.highCutHz) b.shelf.frequency.value = st.highCutHz;
      this.ramp(b.shelf.gain, st.highCutHz ? -12 : 0, 0.3);
    }
    const duck = dbGain(deckDb);
    this.ramp(this.deckDuck.gain, duck, duck < this.deckDuck.gain.value ? 0.2 : 1);
    const sfx = mix.sfx;
    const paused = !!sfx.paused;
    for (const [g, node] of this.groups) {
      const groupDb = sfx.groupDb?.[g] ?? 0;
      // The pause menu stops the world's sounds; the cutscene's own group plays on.
      const target = paused && g !== 'cine' ? 0 : dbGain(groupDb);
      this.ramp(node.gain, target, 0.3);
    }
    if (chain.night) {
      this.night.threshold.value = chain.night.thresholdDb;
      this.night.ratio.value = chain.night.ratio;
      this.night.knee.value = 6;
    } else this.neutral(this.night);
    const lim = this.buses.sfx.limiter;
    if (lim) {
      if (chain.sfxLimiterDb !== null) {
        lim.threshold.value = chain.sfxLimiterDb;
        lim.ratio.value = 20;
        lim.attack.value = 0.002;
        lim.release.value = 0.15;
      } else this.neutral(lim);
    }
    // Mono: fold to one channel ('speakers' down-mix), the destination copies it to both sides.
    this.fold.channelCount = chain.mono ? 1 : 2;
    this.fold.channelCountMode = 'explicit';
    this.fold.channelInterpretation = 'speakers';
  }

  // -------------------------------------------------------------------------
  // Loading and the decode budget

  private buffer(file: string): AudioBuffer | null {
    const d = this.decoded.get(file);
    if (!d) return null;
    d.usedAt = this.ctx.currentTime;
    return d.buf;
  }

  private load(file: string): Promise<AudioBuffer | null> {
    const have = this.buffer(file);
    if (have) return Promise.resolve(have);
    if (this.failed.has(file)) return Promise.resolve(null);
    const pending = this.loading.get(file);
    if (pending) return pending;
    const p = (async () => {
      try {
        const res = await fetch(`${this.opts.base}${file}`);
        if (!res.ok) throw new Error(`${res.status}`);
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.decoded.set(file, {
          buf,
          bytes: buf.length * buf.numberOfChannels * 4,
          usedAt: this.ctx.currentTime,
        });
        this.trim(budgetOf(file));
        return buf;
      } catch (err) {
        this.failed.add(file);
        this.opts.log?.(`[audio] ${file} did not load, it stays silent: ${String(err)}`);
        return null;
      } finally {
        this.loading.delete(file);
      }
    })();
    this.loading.set(file, p);
    return p;
  }

  /** Files something still plays from. */
  private inUse(): Set<string> {
    const out = new Set<string>();
    for (const d of this.decks.values()) for (const f of d.files) out.add(f);
    for (const b of this.beds.values()) out.add(b.file);
    for (const v of this.voices.values()) out.add(v.file);
    return out;
  }

  /** Release least recently used files over a class's budget (9.4); playing files stay. */
  private trim(cls: BudgetClass): void {
    const mine = [...this.decoded.entries()].filter(([f]) => budgetOf(f) === cls);
    let total = mine.reduce((s, [, d]) => s + d.bytes, 0);
    if (total <= DECODE_BUDGET[cls]) return;
    const busy = this.inUse();
    for (const [f, d] of mine.sort((a, b) => a[1].usedAt - b[1].usedAt)) {
      if (total <= DECODE_BUDGET[cls]) break;
      if (busy.has(f)) continue;
      this.decoded.delete(f);
      total -= d.bytes;
    }
  }

  // -------------------------------------------------------------------------
  // Music

  private music(cmd: MusicCommand, entry: AudioEntry | undefined, nowSec: number): void {
    const c = this.ctx;
    switch (cmd.op) {
      case 'start': {
        if (!entry) return;
        const gain = c.createGain();
        const filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = cmd.lowpassHz ?? OPEN_HZ;
        gain.connect(filter);
        filter.connect(this.deckDuck);
        const files = entry.layered ? entry.files : entry.files.slice(0, 1);
        const deck: Deck = {
          gain,
          filter,
          stems: [],
          sources: [],
          layers: cmd.layers,
          files,
          stopped: false,
        };
        this.decks.set(cmd.deck, deck);
        const at = this.when(cmd.atSec, nowSec);
        gain.gain.setValueAtTime(0, c.currentTime);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(1, at + Math.max(0.01, cmd.fadeInMs / 1000));
        void Promise.all(files.map((f) => this.load(f))).then((bufs) =>
          this.guard('music start', () => {
            if (deck.stopped) return;
            // Late buffers start where the track would be by now, every layer on one clock.
            const startAt = Math.max(at, c.currentTime + 0.02);
            bufs.forEach((buf, i) => {
              if (!buf) return;
              const src = c.createBufferSource();
              src.buffer = buf;
              src.loop = entry.loop;
              if (entry.loop) {
                src.loopStart = entry.loopStartSec;
                src.loopEnd = Math.min(buf.duration, entry.loopEndSec);
              }
              const stem = c.createGain();
              stem.gain.value = dbGain(deck.layers[i] ?? Number.NEGATIVE_INFINITY);
              src.connect(stem);
              stem.connect(gain);
              const len = Math.max(0.001, buf.duration);
              const offset = (cmd.offsetSec + (startAt - at)) % len;
              src.start(startAt, offset);
              deck.stems[i] = stem;
              deck.sources.push(src);
            });
          }),
        );
        return;
      }
      case 'stop': {
        const d = this.decks.get(cmd.deck);
        if (!d) return;
        d.stopped = true;
        const at = this.when(cmd.atSec, nowSec);
        const end = at + Math.max(0.01, cmd.fadeOutMs / 1000);
        this.rampAt(d.gain.gain, 0, at, cmd.fadeOutMs / 1000);
        for (const s of d.sources) s.stop(end + 0.05);
        const last = d.sources[d.sources.length - 1];
        const release = () => {
          try {
            d.filter.disconnect();
          } catch {
            // already gone
          }
        };
        if (last) last.onended = release;
        else release();
        this.decks.delete(cmd.deck);
        return;
      }
      case 'layers': {
        const d = this.decks.get(cmd.deck);
        if (!d) return;
        d.layers = cmd.layers;
        const at = this.when(cmd.atSec, nowSec);
        d.stems.forEach((g, i) => {
          if (!g) return;
          this.rampAt(
            g.gain,
            dbGain(cmd.layers[i] ?? Number.NEGATIVE_INFINITY),
            at,
            cmd.rampMs / 1000,
          );
        });
        return;
      }
      case 'filter': {
        const d = this.decks.get(cmd.deck);
        if (!d) return;
        const at = this.when(cmd.atSec, nowSec);
        this.rampAt(d.filter.frequency, cmd.lowpassHz ?? OPEN_HZ, at, cmd.rampMs / 1000);
        return;
      }
      case 'stinger': {
        const file = entry?.files[0];
        if (!file) return;
        const at = this.when(cmd.atSec, nowSec);
        void this.load(file).then((buf) =>
          this.guard('stinger', () => {
            // A phrase that arrives more than a second late is dropped, not played out of place.
            if (!buf || c.currentTime > at + 1) return;
            const src = c.createBufferSource();
            src.buffer = buf;
            src.connect(this.buses.music.input);
            src.onended = () => src.disconnect();
            src.start(Math.max(at, c.currentTime));
          }),
        );
        return;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Voices and beds

  private play(op: Extract<AudioOp, { op: 'play' }>): void {
    const buf = this.buffer(op.file);
    if (!buf && !op.loop) {
      // Not decoded yet: silent this time, ready the next (9.6).
      void this.load(op.file);
      return;
    }
    const c = this.ctx;
    const gain = c.createGain();
    gain.gain.value = dbGain(op.gainDb);
    let tail: AudioNode = gain;
    if (op.lowpassHz !== null) {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = op.lowpassHz;
      tail.connect(lp);
      tail = lp;
    }
    const pan = c.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, op.pan));
    tail.connect(pan);
    const target =
      op.bus === 'sfx'
        ? (this.groups.get(op.group ?? 'world') ?? this.buses.sfx.input)
        : this.buses[op.bus].input;
    pan.connect(target);
    if (op.wet) pan.connect(this.reverbSend);
    const voice: Voice = { src: null, gain, file: op.file, stopped: false };
    this.voices.set(op.voice, voice);
    const start = (b: AudioBuffer, delaySec: number) => {
      const src = c.createBufferSource();
      src.buffer = b;
      src.loop = op.loop;
      src.playbackRate.value = op.rate;
      src.connect(gain);
      src.onended = () => {
        try {
          pan.disconnect();
        } catch {
          // already gone
        }
        if (this.voices.get(op.voice) === voice) this.voices.delete(op.voice);
      };
      src.start(c.currentTime + Math.max(0, delaySec));
      voice.src = src;
    };
    if (buf) start(buf, op.delayMs / 1000);
    // A loop is held by the world (a heartbeat): it waits for its decode instead of a miss.
    else
      void this.load(op.file).then((b) =>
        this.guard('loop start', () => {
          if (b && !voice.stopped) start(b, 0);
        }),
      );
  }

  private stopVoice(voice: number, fadeMs: number): void {
    const v = this.voices.get(voice);
    if (!v) return;
    v.stopped = true;
    const t = this.ctx.currentTime;
    this.rampAt(v.gain.gain, 0, t, fadeMs / 1000);
    v.src?.stop(t + Math.max(0.01, fadeMs / 1000) + 0.02);
    this.voices.delete(voice);
  }

  private bed(id: string, file: string, gainDb: number, lowpassHz: number | null, rampMs: number) {
    const c = this.ctx;
    const have = this.beds.get(id);
    if (have && !have.stopped) {
      have.targetDb = gainDb;
      have.lowpassHz = lowpassHz;
      have.rampMs = rampMs;
      if (have.src) {
        this.ramp(have.gain.gain, dbGain(gainDb), rampMs / 1000);
        this.ramp(have.filter.frequency, lowpassHz ?? OPEN_HZ, rampMs / 1000);
      }
      return;
    }
    const gain = c.createGain();
    gain.gain.value = 0;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpassHz ?? OPEN_HZ;
    gain.connect(filter);
    filter.connect(this.buses.ambience.input);
    const bed: Bed = {
      src: null,
      gain,
      filter,
      file,
      targetDb: gainDb,
      lowpassHz,
      rampMs,
      stopped: false,
    };
    this.beds.set(id, bed);
    void this.load(file).then((buf) =>
      this.guard('bed start', () => {
        if (!buf || bed.stopped) return;
        const src = c.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(gain);
        src.onended = () => {
          try {
            filter.disconnect();
          } catch {
            // already gone
          }
        };
        // Beds start at a varied point so two maps sharing a bed do not restart it audibly.
        src.start(c.currentTime, (c.currentTime * 7.3) % Math.max(0.001, buf.duration));
        bed.src = src;
        // The level asked for last, also when it changed while the file loaded.
        this.ramp(gain.gain, dbGain(bed.targetDb), bed.rampMs / 1000);
        this.ramp(filter.frequency, bed.lowpassHz ?? OPEN_HZ, 0.05);
      }),
    );
  }

  private bedStop(id: string, fadeMs: number): void {
    const b = this.beds.get(id);
    if (!b) return;
    b.stopped = true;
    this.beds.delete(id);
    const end = this.ctx.currentTime + Math.max(0.01, fadeMs / 1000);
    this.ramp(b.gain.gain, 0, fadeMs / 1000);
    if (b.src) b.src.stop(end + 0.05);
    else {
      try {
        b.filter.disconnect();
      } catch {
        // already gone
      }
    }
  }

  // -------------------------------------------------------------------------
  // Reverb (8.4)

  private impulse(zone: ReverbZone): AudioBuffer {
    const have = this.irCache.get(zone);
    if (have) return have;
    const p = REVERB_PRESETS[zone];
    const rate = this.ctx.sampleRate;
    const pre = Math.round((p.preDelayMs / 1000) * rate);
    const len = pre + Math.round(Math.min(5, p.decaySec) * rate);
    const buf = this.ctx.createBuffer(2, Math.max(1, len), rate);
    // Seeded noise, so a zone always sounds the same; RT60 decay with one-pole damping.
    const rnd = seededRng(p.decaySec * 1000 + zone.length);
    const k = Math.exp((-2 * Math.PI * p.lowpassHz) / rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / rate;
        const env = Math.exp((-6.91 * t) / p.decaySec);
        const n = (rnd() * 2 - 1) * env;
        lp = (1 - k) * n + k * lp;
        d[i] = lp;
      }
    }
    this.irCache.set(zone, buf);
    return buf;
  }

  private setReverb(zone: ReverbZone): void {
    const next = this.reverbs[1 - this.reverbSlot];
    const prev = this.reverbs[this.reverbSlot];
    if (!next || !prev) return;
    next.conv.buffer = this.impulse(zone);
    const s = REVERB_RAMP_MS / 1000;
    this.ramp(next.ret.gain, dbGain(REVERB_PRESETS[zone].wetDb), s);
    this.ramp(prev.ret.gain, 0, s);
    this.reverbSlot = 1 - this.reverbSlot;
  }
}
