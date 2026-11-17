// Score model for the score-first music pilot: a loop is note data per part, each part
// belongs to one adaptive layer (audio_direction.md section 5.2), and helpers turn the
// score into MIDI per layer or for the whole mix. Pure, so tests can check the musical
// contract (loop length, motifs, ranges) without rendering audio.

import { type MidiNote, type MidiTrack, TICKS_PER_QUARTER, writeMidiFile } from './midi';

export interface ScoreNote {
  /** Quarter-note position from the start of the loop. */
  beat: number;
  dur: number;
  pitch: number;
  vel: number;
}

export interface ScoreControl {
  beat: number;
  controller: number;
  value: number;
}

export interface ScorePart {
  id: string;
  /** What the part stands for in the prompt library, e.g. "hurdy-gurdy drone". */
  role: string;
  layer: number;
  channel: number;
  program: number;
  bankMsb?: number;
  volume: number;
  pan: number;
  reverb: number;
  chorus?: number;
  notes: ScoreNote[];
  controls: ScoreControl[];
}

export interface Score {
  id: string;
  bpm: number;
  beatsPerBar: number;
  bars: number;
  keySharps: number;
  keyMinor: boolean;
  /** ACE-Step keyscale label, e.g. "G major". */
  keyscale: string;
  parts: ScorePart[];
}

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Scientific pitch name to MIDI number: "C4" is 60, "Eb1" is 27, "F#5" is 78. */
export function pitch(name: string): number {
  const match = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!match) throw new Error(`Bad pitch name: ${name}`);
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + NOTE_INDEX[match[1]] + accidental;
}

/** Absolute beat of a 1-based bar and a 0-based beat offset inside it. */
export function at(bar: number, beat = 0, beatsPerBar = 4): number {
  return (bar - 1) * beatsPerBar + beat;
}

/**
 * A run of notes played one after another from a start beat. Each step is
 * [pitch name or "r" for a rest, duration in beats] with an optional velocity.
 */
export function phrase(
  start: number,
  steps: ReadonlyArray<readonly [string, number, number?]>,
  vel = 80,
): ScoreNote[] {
  const notes: ScoreNote[] = [];
  let beat = start;
  for (const [name, dur, v] of steps) {
    if (name !== 'r') notes.push({ beat, dur, pitch: pitch(name), vel: v ?? vel });
    beat += dur;
  }
  return notes;
}

export function loopBeats(score: Score): number {
  return score.bars * score.beatsPerBar;
}

export function loopSeconds(score: Score): number {
  return (loopBeats(score) * 60) / score.bpm;
}

/** Deterministic small PRNG so humanized renders are reproducible. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash, used to give every part its own humanization stream. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface MidiOptions {
  /** Layers to include; all when omitted. */
  layers?: number[];
  /** How many times the loop is laid end to end (renders use 2 to capture the wrap). */
  repeats?: number;
  /** Silent bars after the last repeat so the reverb tail is rendered. */
  tailBars?: number;
  /** Timing and velocity humanization seed; no humanization when omitted. */
  humanizeSeed?: number;
}

export function scoreToMidi(score: Score, options: MidiOptions = {}): Uint8Array {
  const repeats = options.repeats ?? 1;
  const tailBars = options.tailBars ?? 0;
  const span = loopBeats(score);
  const parts = score.parts.filter((p) => !options.layers || options.layers.includes(p.layer));
  const tracks: MidiTrack[] = parts.map((part) => {
    // One generator per part, so a layer rendered alone has exactly the timing it has
    // inside the full mix and the stems stay sample aligned.
    const random =
      options.humanizeSeed === undefined
        ? null
        : mulberry32(options.humanizeSeed ^ hashString(part.id));
    const isDrum = part.channel === 9;
    const notes: MidiNote[] = [];
    const controls = [
      { tick: 0, controller: 7, value: part.volume },
      { tick: 0, controller: 10, value: part.pan },
      { tick: 0, controller: 91, value: part.reverb },
      { tick: 0, controller: 93, value: part.chorus ?? 0 },
    ];
    // Humanization is drawn once per note and reused on every repeat, so each pass of
    // the loop is identical and the rendered wrap point matches. Notes on the loop head
    // only ever move later, never before the cut.
    const feel = part.notes.map((note) => {
      const jitter = random ? (random() - 0.5) * (isDrum ? 0.012 : 0.03) : 0;
      const velJitter = random ? Math.round((random() - 0.5) * 10) : 0;
      return { shift: note.beat < 1e-9 ? Math.abs(jitter) : jitter, velJitter };
    });
    for (let r = 0; r < repeats; r++) {
      const offset = r * span;
      part.notes.forEach((note, index) => {
        const { shift, velJitter } = feel[index];
        const beat = Math.max(0, offset + note.beat + shift);
        notes.push({
          tick: beat * TICKS_PER_QUARTER,
          durationTicks: note.dur * TICKS_PER_QUARTER * (isDrum ? 1 : 0.97),
          pitch: note.pitch,
          velocity: note.vel + velJitter,
        });
      });
      for (const control of part.controls) {
        controls.push({
          tick: (offset + control.beat) * TICKS_PER_QUARTER,
          controller: control.controller,
          value: control.value,
        });
      }
    }
    return {
      name: `L${part.layer} ${part.role}`,
      channel: part.channel,
      program: isDrum ? undefined : part.program,
      bankMsb: part.bankMsb,
      notes,
      controls,
    };
  });
  return writeMidiFile({
    bpm: score.bpm,
    beatsPerBar: score.beatsPerBar,
    keySharps: score.keySharps,
    keyMinor: score.keyMinor,
    tracks,
    endTick: (repeats * span + tailBars * score.beatsPerBar) * TICKS_PER_QUARTER,
  });
}

/** Melodic intervals (semitones) between consecutive notes of a part, by onset order. */
export function intervalsOf(notes: ScoreNote[]): number[] {
  const sorted = [...notes].sort((a, b) => a.beat - b.beat);
  const out: number[] = [];
  for (let i = 1; i < sorted.length; i++) out.push(sorted[i].pitch - sorted[i - 1].pitch);
  return out;
}

/** Onset beats where an interval pattern starts in a part's melody. */
export function findIntervalPattern(notes: ScoreNote[], pattern: number[]): number[] {
  const sorted = [...notes].sort((a, b) => a.beat - b.beat);
  const steps = intervalsOf(sorted);
  const hits: number[] = [];
  for (let i = 0; i + pattern.length <= steps.length; i++) {
    if (pattern.every((value, k) => steps[i + k] === value)) hits.push(sorted[i].beat);
  }
  return hits;
}

/** Contract problems a loop score must not have; empty means the score is well formed. */
export function scoreProblems(score: Score): string[] {
  const problems: string[] = [];
  const span = loopBeats(score);
  const channels = new Map<number, string>();
  for (const part of score.parts) {
    const owner = channels.get(part.channel);
    if (owner) problems.push(`${part.id} shares channel ${part.channel} with ${owner}`);
    channels.set(part.channel, part.id);
    for (const note of part.notes) {
      if (note.beat < 0 || note.beat + note.dur > span + 1e-9) {
        problems.push(`${part.id} note at beat ${note.beat} leaves the loop`);
      }
      if (note.dur <= 0) problems.push(`${part.id} note at beat ${note.beat} has no length`);
      if (note.vel < 1 || note.vel > 127)
        problems.push(`${part.id} velocity ${note.vel} out of range`);
    }
  }
  return problems;
}
