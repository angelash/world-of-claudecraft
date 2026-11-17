// The motif seeds (audio_direction.md 2.2 and 4.12): each motif played twice by its own
// instrument, the second time slightly slower and softer, about 14 seconds at 80 BPM, mostly
// dry, a natural decay at the end. Written note for note from the motif table (written in
// D there and here), so every later cue can quote or overlay the exact motif (11.8).
// GM programs stand in for the instruments the table names.

import { phrase, type Score, type ScoreNote, type ScorePart } from '../score';

const BPM = 80;
const SLOWER = 1.12;
const SOFTER = 16;

type Step = readonly [string, number, number?];

/** The phrase, a rest, then the phrase again stretched and softer. */
function twice(steps: readonly Step[], gap: number, vel: number): ScoreNote[] {
  const first = phrase(0, steps, vel);
  const length = steps.reduce((n, [, d]) => n + d, 0);
  const second = phrase(
    length + gap,
    steps.map(([p, d, v]) => [p, d * SLOWER, (v ?? vel) - SOFTER] as const),
    vel - SOFTER,
  );
  return [...first, ...second];
}

function part(
  id: string,
  role: string,
  channel: number,
  program: number,
  notes: ScoreNote[],
  extra: Partial<ScorePart> = {},
): ScorePart {
  return {
    id,
    role,
    layer: 1,
    channel,
    program,
    volume: 100,
    pan: 64,
    reverb: 24,
    notes,
    controls: [],
    ...extra,
  };
}

function seed(
  id: string,
  keyscale: string,
  minor: boolean,
  parts: ScorePart[],
  beatsPerBar = 4,
  bpm = BPM,
): Score {
  const end = Math.max(...parts.flatMap((p) => p.notes.map((n) => n.beat + n.dur)));
  return {
    id,
    bpm,
    beatsPerBar,
    bars: Math.ceil(end / beatsPerBar),
    keySharps: minor ? -1 : 2,
    keyMinor: minor,
    keyscale,
    parts,
  };
}

// Unwritten Page: D E A, B A E; eighth eighth quarter, quarter eighth half; stops on E.
const HERO: Step[] = [
  ['D4', 0.5],
  ['E4', 0.5],
  ['A4', 1],
  ['B4', 1],
  ['A4', 0.5],
  ['E4', 2],
];

// Faceless: the hero motif upside down in D minor, same rhythm, ending on C.
const FACELESS: Step[] = [
  ['D4', 0.5],
  ['C4', 0.5],
  ['G3', 1],
  ['F3', 1],
  ['G3', 0.5],
  ['C4', 2],
];

export const MOTIF_SEEDS: Score[] = [
  seed('mus_stg_motif_hero', 'D major', false, [
    part('lute', 'solo lute', 0, 24, twice(HERO, 2.5, 92)),
  ]),
  seed('mus_stg_motif_door', 'D major', false, [
    // F# E F# rocking, up to high D, down to C# and A, the last note held.
    part(
      'music_box',
      'music box',
      0,
      10,
      twice(
        [
          ['F#5', 1],
          ['E5', 1],
          ['F#5', 1],
          ['D6', 1],
          ['C#6', 1],
          ['A5', 3],
        ],
        1,
        88,
      ),
    ),
  ]),
  seed('mus_stg_motif_eluen', 'D major', false, [
    // D A high-D A D, five equal quarters, a palindrome; a small bell marks the centre.
    part(
      'organ',
      'organ',
      0,
      19,
      twice(
        [
          ['D4', 1],
          ['A4', 1],
          ['D5', 1],
          ['A4', 1],
          ['D4', 2],
        ],
        2,
        86,
      ),
      { reverb: 40 },
    ),
    part('bell', 'small bell', 1, 14, [
      { beat: 2, dur: 2, pitch: 86, vel: 70 },
      { beat: 8 + 2 * SLOWER, dur: 2, pitch: 86, vel: 56 },
    ]),
  ]),
  seed('mus_stg_motif_valda', 'D minor', true, [
    // D D Eb D, C D (Phrygian), short-short-long then short-long; a horn rips upward.
    part(
      'trombone',
      'trombone',
      0,
      57,
      twice(
        [
          ['D3', 0.5],
          ['D3', 0.5],
          ['Eb3', 1],
          ['D3', 1],
          ['C3', 0.5],
          ['D3', 1.5],
        ],
        2,
        100,
      ),
    ),
    part('horn', 'horn rip', 1, 60, [
      ...['A3', 'D4', 'F4', 'A4', 'D5'].map((p, i) => ({
        beat: 5 + i * 0.125,
        dur: i === 4 ? 1 : 0.125,
        pitch: pitchOf(p),
        vel: 70 + i * 6,
      })),
      ...['A3', 'D4', 'F4', 'A4', 'D5'].map((p, i) => ({
        beat: 6.5 + 4.5 * SLOWER + 0.06 + i * 0.14,
        dur: i === 4 ? 1 : 0.14,
        pitch: pitchOf(p),
        vel: 56 + i * 6,
      })),
    ]),
    part(
      'war_drum',
      'war drum',
      9,
      0,
      [0, 1, 2, 3.5].flatMap((b) => [
        { beat: b, dur: 0.25, pitch: 41, vel: 96 },
        { beat: 6.5 + b * SLOWER, dur: 0.25, pitch: 41, vel: 80 },
      ]),
    ),
  ]),
  seed(
    'mus_stg_motif_merca',
    'D major',
    false,
    [
      // A D F# A, B A F# D: staccato eighths in three-four; glockenspiel on the outer notes.
      part(
        'mandolin',
        'staccato mandolin',
        0,
        25,
        twice(
          [
            ['A4', 0.5, 96],
            ['D5', 0.5],
            ['F#5', 0.5],
            ['A5', 0.5],
            ['B5', 0.5, 92],
            ['A5', 0.5],
            ['F#5', 0.5],
            ['D5', 1],
          ],
          2,
          84,
        ).map((n) => ({ ...n, dur: Math.min(n.dur, 0.3) })),
      ),
      part('glockenspiel', 'glockenspiel', 1, 9, [
        { beat: 0, dur: 0.5, pitch: 81, vel: 70 },
        { beat: 3.5, dur: 1, pitch: 86, vel: 66 },
        { beat: 6.5, dur: 0.5, pitch: 81, vel: 56 },
        { beat: 6.5 + 3.5 * SLOWER, dur: 1, pitch: 86, vel: 52 },
      ]),
    ],
    3,
  ),
  seed(
    'mus_stg_motif_sylvie',
    'D minor',
    true,
    (() => {
      // A F# E D, two beats of rest, D E F (natural, minor); the repeat ends on F# (major).
      const first = phrase(
        0,
        [
          ['A4', 1],
          ['F#4', 1],
          ['E4', 1],
          ['D4', 2],
          ['r', 2],
          ['D4', 1],
          ['E4', 1],
          ['F4', 2.5],
        ],
        84,
      );
      const second = phrase(
        12,
        [
          ['A4', 1 * SLOWER],
          ['F#4', 1 * SLOWER],
          ['E4', 1 * SLOWER],
          ['D4', 2 * SLOWER],
          ['r', 2 * SLOWER],
          ['D4', 1 * SLOWER],
          ['E4', 1 * SLOWER],
          ['F#4', 2.5 * SLOWER],
        ],
        68,
      );
      return [part('flute', 'breathy wooden flute', 0, 75, [...first, ...second], { reverb: 36 })];
    })(),
    4,
    100,
  ),
  seed('mus_stg_motif_moira', 'D minor', true, [
    // D F A G F E as a circular arpeggio, then E rising to F like a question.
    part(
      'harpsichord',
      'harpsichord',
      0,
      6,
      twice(
        [
          ['D4', 0.5],
          ['F4', 0.5],
          ['A4', 0.5],
          ['G4', 0.5],
          ['F4', 0.5],
          ['E4', 0.5],
          ['E4', 0.5],
          ['F4', 2],
        ],
        2,
        90,
      ),
    ),
  ]),
  seed('mus_stg_motif_dian', 'D minor', true, [
    // D and Eb in the low register, every two beats, four times, swelling like breath.
    part(
      'sub_bass',
      'sub-bass',
      0,
      43,
      twice(
        [
          ['D2', 2],
          ['Eb2', 2],
          ['D2', 2],
          ['Eb2', 2],
        ],
        1,
        90,
      ),
      { volume: 110, reverb: 30 },
    ),
    part(
      'bowed_metal',
      'bowed metal sheet',
      1,
      92,
      twice(
        [
          ['D3', 2],
          ['Eb3', 2],
          ['D3', 2],
          ['Eb3', 2],
        ],
        1,
        70,
      ),
      { volume: 80, reverb: 60 },
    ),
  ]),
  seed('mus_stg_motif_faceless', 'D minor', true, [
    // Two electric pianos with heavy chorus for the slightly detuned sound.
    part('epiano', 'detuned electric piano', 0, 4, twice(FACELESS, 2.5, 90), { chorus: 110 }),
    part('epiano_2', 'detuned electric piano (second voice)', 1, 5, twice(FACELESS, 2.5, 62), {
      chorus: 127,
      pan: 80,
    }),
  ]),
];

function pitchOf(name: string): number {
  return phrase(0, [[name, 1]])[0]?.pitch ?? 60;
}

export const MOTIF_BPM = BPM;
