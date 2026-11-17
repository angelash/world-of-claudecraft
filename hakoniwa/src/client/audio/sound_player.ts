// Sound player, the pure half (audio_direction.md 7.0, 8.3; release_engineering.md 9.4): the
// voice pool with its caps and priority preemption, the throttle and merge rules, footstep
// limits, and variant choice with its small pitch and gain jitter. Randomness is the client's
// presentation source (a seeded generator handed in), never the kernel's: it changes nothing
// in the world. Pure: the caller passes the clock.

import { VOICE_CAPS } from './bus_model';

/** A random source in [0, 1). */
export type Rng = () => number;

/** A small seeded generator (mulberry32) for presentation randomness. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type VoiceBus = 'music' | 'ambience' | 'sfx' | 'ui';

/** Voice caps (8.3): 64 in all; level 0 may exceed its bus and the total by 4. */
export const POOL_CAPS: Readonly<Record<VoiceBus, number>> = {
  music: VOICE_CAPS.music,
  ambience: VOICE_CAPS.ambience,
  sfx: VOICE_CAPS.sfx,
  ui: VOICE_CAPS.ui,
};
export const POOL_TOTAL = VOICE_CAPS.total;
export const PRIORITY_ZERO_EXTRA = VOICE_CAPS.priorityZeroExtra;
/** The same sound plays at most four times at once, never twice within 50 ms. */
export const SAME_ID_MAX = 4;
export const SAME_ID_GAP_MS = 50;
/** Hits on one target within 100 ms merge into the heaviest. */
export const MERGE_MS = 100;
/** Footsteps: one per entity, none beyond 20 m of the camera centre. */
export const FOOTSTEP_RANGE_M = 20;

export interface VoiceRequest {
  id: string;
  bus: VoiceBus;
  /** 0 never preempted to 5 ambient detail (8.3). */
  priority: number;
  /** Merge key: hits on the same target (`hit:<targetId>`), or none. */
  mergeKey?: string;
  /** Heaviness for merging (a crit outweighs a hit). */
  weight?: number;
  /** Footsteps: the walker; one at a time each. */
  footstepOf?: string;
  /** Distance from the camera centre in metres, for the footstep range. */
  distance?: number;
  /** Length of the sound; Infinity for a loop until stopped. */
  durationMs: number;
}

export interface Voice {
  voice: number;
  id: string;
  bus: VoiceBus;
  priority: number;
  startMs: number;
  endMs: number;
  mergeKey?: string;
  weight: number;
  footstepOf?: string;
}

export type Admission =
  | { ok: true; voice: number; evict: number[] }
  | { ok: false; reason: 'throttled' | 'merged' | 'full' | 'far' | 'busy' };

export class VoicePool {
  private voices: Voice[] = [];
  private nextVoice = 1;
  private lastStart = new Map<string, number>();

  active(): readonly Voice[] {
    return this.voices;
  }

  /** Drop voices whose sound has ended. */
  expire(nowMs: number): number[] {
    const gone = this.voices.filter((v) => v.endMs <= nowMs).map((v) => v.voice);
    if (gone.length > 0) this.voices = this.voices.filter((v) => v.endMs > nowMs);
    return gone;
  }

  release(voice: number): void {
    this.voices = this.voices.filter((v) => v.voice !== voice);
  }

  private count(bus?: VoiceBus): number {
    return bus ? this.voices.filter((v) => v.bus === bus).length : this.voices.length;
  }

  /** Ask for a voice; on success the caller plays it and stops the evicted ones. */
  admit(r: VoiceRequest, nowMs: number): Admission {
    this.expire(nowMs);
    if (r.footstepOf !== undefined) {
      if ((r.distance ?? 0) > FOOTSTEP_RANGE_M) return { ok: false, reason: 'far' };
      if (this.voices.some((v) => v.footstepOf === r.footstepOf))
        return { ok: false, reason: 'busy' };
    }
    const last = this.lastStart.get(r.id);
    if (last !== undefined && nowMs - last < SAME_ID_GAP_MS)
      return { ok: false, reason: 'throttled' };
    const same = this.voices.filter((v) => v.id === r.id);
    const evict: number[] = [];
    const weight = r.weight ?? 0;
    if (r.mergeKey) {
      const twin = this.voices.find(
        (v) => v.mergeKey === r.mergeKey && nowMs - v.startMs < MERGE_MS,
      );
      if (twin) {
        if (twin.weight >= weight) return { ok: false, reason: 'merged' };
        evict.push(twin.voice);
      }
    }
    const sameLive = same.filter((v) => !evict.includes(v.voice));
    if (sameLive.length >= SAME_ID_MAX) {
      // The oldest copy of the same sound gives way.
      const oldest = sameLive.sort((a, b) => a.startMs - b.startMs)[0];
      if (oldest) evict.push(oldest.voice);
    }
    const extra = r.priority === 0 ? PRIORITY_ZERO_EXTRA : 0;
    const busCap = POOL_CAPS[r.bus] + extra;
    const totalCap = POOL_TOTAL + extra;
    const live = (bus?: VoiceBus) =>
      this.voices.filter((v) => !evict.includes(v.voice) && (!bus || v.bus === bus)).length;
    while (live(r.bus) >= busCap || live() >= totalCap) {
      const busFull = live(r.bus) >= busCap;
      // Preempt the oldest voice whose priority is lower (a higher number) than the new one.
      const victim = this.voices
        .filter(
          (v) =>
            !evict.includes(v.voice) && v.priority > r.priority && (!busFull || v.bus === r.bus),
        )
        .sort((a, b) => a.startMs - b.startMs || b.priority - a.priority)[0];
      if (!victim) return { ok: false, reason: 'full' };
      evict.push(victim.voice);
    }
    this.voices = this.voices.filter((v) => !evict.includes(v.voice));
    const voice = this.nextVoice++;
    this.voices.push({
      voice,
      id: r.id,
      bus: r.bus,
      priority: r.priority,
      startMs: nowMs,
      endMs: nowMs + r.durationMs,
      ...(r.mergeKey ? { mergeKey: r.mergeKey } : {}),
      weight,
      ...(r.footstepOf !== undefined ? { footstepOf: r.footstepOf } : {}),
    });
    this.lastStart.set(r.id, nowMs);
    return { ok: true, voice, evict };
  }

  /** How many voices a bus holds (tests and the dev overlay). */
  size(bus?: VoiceBus): number {
    return this.count(bus);
  }
}

// ---------------------------------------------------------------------------
// Variants (7.0)

/** Pitch within plus or minus 3 %, gain within plus or minus 1.5 dB (not for interface sounds). */
export const PITCH_JITTER = 0.03;
export const GAIN_JITTER_DB = 1.5;

export class VariantPicker {
  private last = new Map<string, number>();

  /** A variant index 0..count-1, never the same as the last one for this id. */
  pick(id: string, count: number, rng: Rng): number {
    if (count <= 1) return 0;
    const prev = this.last.get(id);
    let i = Math.floor(rng() * (prev === undefined ? count : count - 1));
    if (prev !== undefined && i >= prev) i += 1;
    i = Math.min(count - 1, Math.max(0, i));
    this.last.set(id, i);
    return i;
  }
}

/** Playback rate and gain jitter for one start; interface and dialogue sounds play straight. */
export function jitter(bus: VoiceBus, rng: Rng): { rate: number; gainDb: number } {
  if (bus === 'ui' || bus === 'music') return { rate: 1, gainDb: 0 };
  return {
    rate: 1 + (rng() * 2 - 1) * PITCH_JITTER,
    gainDb: (rng() * 2 - 1) * GAIN_JITTER_DB,
  };
}
