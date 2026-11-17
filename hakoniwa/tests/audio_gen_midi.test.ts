// The score-first music pilot (tools/audio_gen): the MIDI writer produces valid files,
// the Borderstone day score keeps the contract audio_direction.md sets for the cue
// (32-bar loop at 104 BPM, three layers, hero motif stopping on the second degree,
// the D and Eb undercurrent every two beats), stems render with the same timing as the
// mix, and the loop cutters leave no step at the seam.

import { describe, expect, it } from 'vitest';
import { crossfadeLoop, cutLoopFromDoubleRender, findQuietSeam } from '../tools/audio_gen/loops';
import { encodeVlq, TICKS_PER_QUARTER, writeMidiFile } from '../tools/audio_gen/midi';
import {
  findIntervalPattern,
  loopSeconds,
  pitch,
  scoreProblems,
  scoreToMidi,
} from '../tools/audio_gen/score';
import { SCORE } from '../tools/audio_gen/scores/mus_town_borderstone_day';
import type { PcmAudio } from '../tools/audio_gen/wav';

interface ParsedNote {
  track: string;
  tick: number;
  pitch: number;
  velocity: number;
}

/** Minimal SMF reader: header fields, track names and note-on events. */
function parseMidi(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  expect(tag(0)).toBe('MThd');
  const format = view.getUint16(8);
  const trackCount = view.getUint16(10);
  const division = view.getUint16(12);
  let offset = 14;
  const notes: ParsedNote[] = [];
  const names: string[] = [];
  for (let t = 0; t < trackCount; t++) {
    expect(tag(offset)).toBe('MTrk');
    const length = view.getUint32(offset + 4);
    let p = offset + 8;
    const end = p + length;
    let tick = 0;
    let running = 0;
    let name = '';
    const readVlq = () => {
      let value = 0;
      for (;;) {
        const b = bytes[p++];
        value = (value << 7) | (b & 0x7f);
        if (!(b & 0x80)) return value;
      }
    };
    while (p < end) {
      tick += readVlq();
      let status = bytes[p];
      if (status & 0x80) p++;
      else status = running;
      if (status === 0xff) {
        const type = bytes[p++];
        const len = readVlq();
        if (type === 0x03) name = new TextDecoder().decode(bytes.subarray(p, p + len));
        p += len;
        continue;
      }
      running = status;
      const kind = status & 0xf0;
      if (kind === 0xc0 || kind === 0xd0) {
        p += 1;
      } else {
        const a = bytes[p++];
        const b = bytes[p++];
        if (kind === 0x90 && b > 0) notes.push({ track: name, tick, pitch: a, velocity: b });
      }
    }
    expect(p).toBe(end);
    names.push(name);
    offset = end;
  }
  expect(offset).toBe(bytes.length);
  return { format, trackCount, division, notes, names };
}

describe('MIDI writer', () => {
  it('encodes variable-length quantities', () => {
    expect(encodeVlq(0)).toEqual([0x00]);
    expect(encodeVlq(0x7f)).toEqual([0x7f]);
    expect(encodeVlq(0x80)).toEqual([0x81, 0x00]);
    expect(encodeVlq(0x3fff)).toEqual([0xff, 0x7f]);
    expect(encodeVlq(0x200000)).toEqual([0x81, 0x80, 0x80, 0x00]);
    expect(() => encodeVlq(-1)).toThrow();
  });

  it('writes a format 1 file with a conductor track and well-formed chunks', () => {
    const bytes = writeMidiFile({
      bpm: 120,
      beatsPerBar: 4,
      keySharps: 1,
      keyMinor: false,
      tracks: [
        {
          name: 'lead',
          channel: 0,
          program: 74,
          notes: [{ tick: 0, durationTicks: 480, pitch: 67, velocity: 90 }],
          controls: [{ tick: 0, controller: 7, value: 100 }],
        },
      ],
    });
    const parsed = parseMidi(bytes);
    expect(parsed.format).toBe(1);
    expect(parsed.trackCount).toBe(2);
    expect(parsed.division).toBe(TICKS_PER_QUARTER);
    expect(parsed.names).toEqual(['conductor', 'lead']);
    expect(parsed.notes).toEqual([{ track: 'lead', tick: 0, pitch: 67, velocity: 90 }]);
  });

  it('parses pitch names', () => {
    expect(pitch('C4')).toBe(60);
    expect(pitch('Eb1')).toBe(27);
    expect(pitch('F#5')).toBe(78);
    expect(() => pitch('H2')).toThrow();
  });
});

describe('mus_town_borderstone_day score', () => {
  const part = (id: string) => {
    const found = SCORE.parts.find((p) => p.id === id);
    if (!found) throw new Error(`missing part ${id}`);
    return found;
  };

  it('is a well-formed 32-bar loop of about 74 seconds at 104 BPM in G major', () => {
    expect(scoreProblems(SCORE)).toEqual([]);
    expect(SCORE.bpm).toBe(104);
    expect(SCORE.bars).toBe(32);
    expect(SCORE.keyscale).toBe('G major');
    expect(loopSeconds(SCORE)).toBeCloseTo(73.846, 2);
  });

  it('keeps the three layers of the cue', () => {
    const byLayer = (layer: number) =>
      SCORE.parts
        .filter((p) => p.layer === layer)
        .map((p) => p.id)
        .sort();
    expect(byLayer(1)).toEqual(['drone', 'lute']);
    expect(byLayer(2)).toEqual(['frame_drum', 'pizzicato']);
    expect(byLayer(3)).toEqual(['recorder', 'undercurrent_bass', 'undercurrent_bowed']);
  });

  it('states the hero motif in bars 1, 9 and 25 and always stops on A', () => {
    const melody = part('recorder').notes;
    // G A D E D A in G: up 2, up 5, up 2, down 2, down 5.
    const hits = findIntervalPattern(melody, [2, 5, 2, -2, -5]);
    expect(hits).toEqual([0, 32, 96]);
    const sorted = [...melody].sort((a, b) => a.beat - b.beat);
    for (const start of hits) {
      const index = sorted.findIndex((n) => n.beat === start);
      const last = sorted[index + 5];
      expect(last.pitch % 12).toBe(9); // A: the second degree, never the tonic
      expect(last.dur).toBe(2); // the held half note of the motif rhythm
    }
  });

  it('runs the undercurrent as D and Eb every two beats through the whole loop', () => {
    for (const id of ['undercurrent_bass', 'undercurrent_bowed']) {
      const notes = [...part(id).notes].sort((a, b) => a.beat - b.beat);
      expect(notes).toHaveLength(64);
      notes.forEach((n, i) => {
        expect(n.beat).toBe(i * 2);
        expect(n.dur).toBe(2);
        expect(n.pitch % 12).toBe(i % 2 === 0 ? 2 : 3);
      });
    }
  });

  it('renders a stem with exactly the timing it has in the full mix', () => {
    const options = { repeats: 2, tailBars: 2, humanizeSeed: 7 };
    const full = parseMidi(scoreToMidi(SCORE, options)).notes.filter((n) =>
      n.track.startsWith('L3'),
    );
    const stem = parseMidi(scoreToMidi(SCORE, { ...options, layers: [3] })).notes;
    expect(stem.length).toBe(full.length);
    expect(stem).toEqual(full);
  });

  it('repeats the loop identically so the rendered wrap matches', () => {
    const notes = parseMidi(scoreToMidi(SCORE, { repeats: 2, humanizeSeed: 7 })).notes;
    const span = SCORE.bars * SCORE.beatsPerBar * TICKS_PER_QUARTER;
    const first = notes.filter((n) => n.tick < span);
    const second = notes.filter((n) => n.tick >= span).map((n) => ({ ...n, tick: n.tick - span }));
    expect(second).toEqual(first);
    expect(first.every((n) => n.tick >= 0)).toBe(true);
  });
});

describe('loop cutters', () => {
  const RATE = 1000;
  const tone = (frames: number, freq: number, channels = 1): PcmAudio => {
    const samples = new Float32Array(frames * channels);
    for (let f = 0; f < frames; f++) {
      for (let c = 0; c < channels; c++)
        samples[f * channels + c] = Math.sin((2 * Math.PI * freq * f) / RATE);
    }
    return { sampleRate: RATE, channels, samples };
  };

  it('cuts the second pass of a double render and joins its end to its head', () => {
    const loopFrames = 400;
    // A tone whose period does not divide the loop: the raw cut would step at the seam.
    const audio = tone(2 * loopFrames + 50, 7.3);
    const body = cutLoopFromDoubleRender(audio, loopFrames, 40);
    expect(body.samples.length).toBe(loopFrames);
    const step = Math.abs(body.samples[0] - body.samples[loopFrames - 1]);
    const typical = Math.abs(audio.samples[loopFrames] - audio.samples[loopFrames - 1]);
    expect(step).toBeLessThanOrEqual(typical + 1e-6);
  });

  it('picks a seam away from a loud event and crossfades the head', () => {
    const frames = 3000;
    const bed = tone(frames, 3, 2);
    for (let i = 0; i < bed.samples.length; i++) bed.samples[i] *= 0.1;
    // A loud event near the start of the bed.
    for (let f = 200; f < 260; f++) bed.samples[f * 2] = bed.samples[f * 2 + 1] = 0.9;
    const seam = findQuietSeam(bed, 2000, 100, 20, 10);
    expect(seam.start === 0 || seam.start > 260).toBe(true);
    expect(seam.start + 2000 + 100 <= frames).toBe(true);
    const loop = crossfadeLoop(bed, seam.start, 2000, 100);
    expect(loop.samples.length).toBe(2000 * 2);
    // The head starts as the material right after the body.
    expect(loop.samples[0]).toBeCloseTo(bed.samples[(seam.start + 2000) * 2], 6);
  });
});
