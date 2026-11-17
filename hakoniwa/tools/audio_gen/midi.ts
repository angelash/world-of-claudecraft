// Dependency-free Standard MIDI File (format 1) writer for the score-first music pilot
// (docs/40_design/audio_direction.md section 11). A score is note data in TypeScript; this
// module turns it into bytes a DAW, FluidSynth, or any MIDI tool can open.
//
// Only what the scores need: tempo, time and key signature, track names, program and bank
// changes, control changes, and notes. Unit tested in tests/audio_gen_midi.test.ts.

export const TICKS_PER_QUARTER = 480;

export interface MidiNote {
  tick: number;
  durationTicks: number;
  pitch: number;
  velocity: number;
}

export interface MidiControl {
  tick: number;
  controller: number;
  value: number;
}

export interface MidiTrack {
  name: string;
  channel: number;
  program?: number;
  bankMsb?: number;
  notes: MidiNote[];
  controls: MidiControl[];
}

export interface MidiFileSpec {
  bpm: number;
  beatsPerBar: number;
  /** Key signature: sharps positive, flats negative. */
  keySharps: number;
  keyMinor: boolean;
  tracks: MidiTrack[];
  /** Extends every track to at least this tick so renderers keep the reverb tail. */
  endTick?: number;
}

/** Variable-length quantity encoding used for delta times and meta lengths. */
export function encodeVlq(value: number): number[] {
  if (!Number.isInteger(value) || value < 0 || value > 0x0fffffff) {
    throw new Error(`VLQ out of range: ${value}`);
  }
  const bytes = [value & 0x7f];
  let rest = value >>> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  return bytes;
}

interface RawEvent {
  tick: number;
  /** Sort order inside one tick: meta and setup first, note-offs before note-ons. */
  order: number;
  bytes: number[];
}

function clamp7(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value)));
}

function textMeta(type: number, text: string): number[] {
  const data = [...new TextEncoder().encode(text)];
  return [0xff, type, ...encodeVlq(data.length), ...data];
}

function trackChunk(events: RawEvent[], endTick: number): number[] {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const body: number[] = [];
  let last = 0;
  for (const event of events) {
    body.push(...encodeVlq(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  body.push(...encodeVlq(Math.max(0, endTick - last)), 0xff, 0x2f, 0x00);
  const length = body.length;
  return [
    0x4d,
    0x54,
    0x72,
    0x6b,
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...body,
  ];
}

function conductorTrack(spec: MidiFileSpec, endTick: number): number[] {
  const microsPerQuarter = Math.round(60_000_000 / spec.bpm);
  const denominatorPower = 2; // quarter-note beats
  const events: RawEvent[] = [
    { tick: 0, order: 0, bytes: textMeta(0x03, 'conductor') },
    {
      tick: 0,
      order: 1,
      bytes: [
        0xff,
        0x51,
        0x03,
        (microsPerQuarter >>> 16) & 0xff,
        (microsPerQuarter >>> 8) & 0xff,
        microsPerQuarter & 0xff,
      ],
    },
    { tick: 0, order: 2, bytes: [0xff, 0x58, 0x04, spec.beatsPerBar, denominatorPower, 24, 8] },
    {
      tick: 0,
      order: 3,
      bytes: [0xff, 0x59, 0x02, spec.keySharps & 0xff, spec.keyMinor ? 1 : 0],
    },
  ];
  return trackChunk(events, endTick);
}

function instrumentTrack(track: MidiTrack, endTick: number): number[] {
  const ch = track.channel;
  if (!Number.isInteger(ch) || ch < 0 || ch > 15) throw new Error(`Bad MIDI channel: ${ch}`);
  const events: RawEvent[] = [{ tick: 0, order: 0, bytes: textMeta(0x03, track.name) }];
  if (track.bankMsb !== undefined) {
    events.push({ tick: 0, order: 1, bytes: [0xb0 | ch, 0, clamp7(track.bankMsb)] });
  }
  if (track.program !== undefined) {
    events.push({ tick: 0, order: 2, bytes: [0xc0 | ch, clamp7(track.program)] });
  }
  for (const control of track.controls) {
    events.push({
      tick: Math.max(0, Math.round(control.tick)),
      order: 3,
      bytes: [0xb0 | ch, clamp7(control.controller), clamp7(control.value)],
    });
  }
  for (const note of track.notes) {
    const on = Math.max(0, Math.round(note.tick));
    const off = Math.max(on + 1, Math.round(note.tick + note.durationTicks));
    events.push({
      tick: on,
      order: 5,
      bytes: [0x90 | ch, clamp7(note.pitch), clamp7(note.velocity) || 1],
    });
    events.push({ tick: off, order: 4, bytes: [0x80 | ch, clamp7(note.pitch), 0] });
  }
  return trackChunk(events, endTick);
}

/** Serialize a format 1 file: one conductor track plus one track per instrument. */
export function writeMidiFile(spec: MidiFileSpec): Uint8Array {
  let lastTick = spec.endTick ?? 0;
  for (const track of spec.tracks) {
    for (const note of track.notes)
      lastTick = Math.max(lastTick, Math.round(note.tick + note.durationTicks));
    for (const control of track.controls) lastTick = Math.max(lastTick, Math.round(control.tick));
  }
  const trackCount = spec.tracks.length + 1;
  const header = [
    0x4d,
    0x54,
    0x68,
    0x64,
    0,
    0,
    0,
    6,
    0,
    1,
    (trackCount >>> 8) & 0xff,
    trackCount & 0xff,
    (TICKS_PER_QUARTER >>> 8) & 0xff,
    TICKS_PER_QUARTER & 0xff,
  ];
  const bytes = [...header, ...conductorTrack(spec, lastTick)];
  for (const track of spec.tracks) bytes.push(...instrumentTrack(track, lastTick));
  return Uint8Array.from(bytes);
}
