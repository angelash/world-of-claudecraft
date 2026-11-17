// mus_town_borderstone_day: Borderstone by day (audio_direction.md section 4.3).
// 104 BPM, 4/4, G major, a 32-bar loop body (about 74 seconds), style m_lotha_folk.
// Layers as listed for the cue: L1 hurdy-gurdy drone and lute, L2 frame drum and
// pizzicato pulse, L3 recorder melody with the low half-step undercurrent.
//
// Form: A (bars 1 to 8), A' (9 to 16), B (17 to 24, Mixolydian F, lower and colder),
// A'' (25 to 32, the hero motif an octave up). Bar 32 sits on D so the loop falls
// back into bar 1 as a dominant to tonic step.
//
// Motifs (section 2.2, written in D there, transposed to G here):
// - Unwritten Page (hero): G A D, E D A, eighth eighth quarter, quarter eighth half;
//   it stops on A, the second degree, and never lands on the tonic.
// - Undercurrent (dian): D and Eb low in the bass (D2), changing every two beats; low
//   enough to sit under the town, high enough that small speakers still carry it.
// GM programs stand in for the period instruments; the AI cover pass re-voices them.

import {
  at,
  phrase,
  type Score,
  type ScoreControl,
  type ScoreNote,
  type ScorePart,
} from '../score';

const BEATS = 4;

type Chord = 'G' | 'C' | 'D' | 'Em' | 'Am' | 'F';

/** One chord per bar, bars 1 to 32. */
export const PROGRESSION: Chord[] = [
  // A
  'G',
  'G',
  'C',
  'G',
  'Em',
  'C',
  'Am',
  'D',
  // A'
  'G',
  'G',
  'C',
  'G',
  'Em',
  'C',
  'D',
  'G',
  // B (Mixolydian bVII in bar 22)
  'Em',
  'Em',
  'C',
  'D',
  'Em',
  'F',
  'C',
  'D',
  // A''
  'G',
  'G',
  'C',
  'G',
  'Em',
  'C',
  'D',
  'D',
];

/** Lute voicings, low to high: bass, then four upper chord tones. */
const LUTE_VOICING: Record<Chord, number[]> = {
  G: [43, 50, 55, 59, 62],
  C: [48, 52, 55, 60, 64],
  D: [50, 57, 62, 66, 69],
  Em: [40, 47, 52, 55, 59],
  Am: [45, 52, 57, 60, 64],
  F: [41, 48, 53, 57, 60],
};

/** Pizzicato root and fifth, around octave 3. */
const PIZZ_ROOT_FIFTH: Record<Chord, [number, number]> = {
  G: [43, 50],
  C: [48, 55],
  D: [50, 57],
  Em: [52, 47],
  Am: [45, 52],
  F: [41, 48],
};

const inB = (bar: number) => bar >= 17 && bar <= 24;

function hurdyGurdyDrone(): ScorePart {
  const notes: ScoreNote[] = [];
  const controls: ScoreControl[] = [];
  // A bow change every two bars; the open fifth G and D holds under every chord.
  for (let bar = 1; bar <= 32; bar += 2) {
    const start = at(bar);
    for (const p of [43, 50]) notes.push({ beat: start, dur: 2 * BEATS, pitch: p, vel: 58 });
    controls.push({ beat: start, controller: 11, value: 78 });
    controls.push({ beat: start + 3, controller: 11, value: 96 });
    controls.push({ beat: start + 6, controller: 11, value: 84 });
  }
  return {
    id: 'drone',
    role: 'hurdy-gurdy drone',
    layer: 1,
    channel: 0,
    program: 110, // Fiddle: a bowed string drone for the hurdy-gurdy wheel
    volume: 64,
    pan: 64,
    reverb: 50,
    notes,
    controls,
  };
}

function lute(): ScorePart {
  const notes: ScoreNote[] = [];
  // Eighth-note picking order over the five voicing slots.
  const order = [0, 2, 3, 4, 1, 3, 4, 2];
  for (let bar = 1; bar <= 32; bar++) {
    const chord = LUTE_VOICING[PROGRESSION[bar - 1]];
    const soft = inB(bar) ? 8 : 0;
    order.forEach((slot, i) => {
      const beat = at(bar, i * 0.5);
      const isBass = i === 0 || i === 4;
      notes.push({
        beat,
        dur: isBass ? 2 : 1,
        pitch: chord[slot],
        vel: (isBass ? (i === 0 ? 80 : 70) : 60 + (i % 2 === 0 ? 4 : 0)) - soft,
      });
    });
  }
  // Bar 32 climbs into the loop head instead of repeating the pattern top.
  const lastBar = notes.filter((n) => n.beat >= at(32, 2));
  for (const n of lastBar) notes.splice(notes.indexOf(n), 1);
  notes.push(
    ...phrase(
      at(32, 2),
      [
        ['A3', 0.5],
        ['C4', 0.5],
        ['D4', 0.5],
        ['F#4', 0.5],
      ],
      66,
    ),
  );
  return {
    id: 'lute',
    role: 'lute',
    layer: 1,
    channel: 1,
    program: 24, // Nylon guitar standing in for the lute
    volume: 100,
    pan: 44,
    reverb: 45,
    notes,
    controls: [],
  };
}

function frameDrumAndSpoons(): ScorePart {
  const DUM = 45; // low tom: the frame drum's open centre stroke
  const TAK = 37; // side stick: the rim stroke
  const SPOON = 76; // high wood block: wooden spoons
  const notes: ScoreNote[] = [];
  const hit = (beat: number, p: number, vel: number) =>
    notes.push({ beat, dur: 0.25, pitch: p, vel });
  for (let bar = 1; bar <= 32; bar++) {
    const b = at(bar);
    if (inB(bar)) {
      // Half-time in the cold section.
      hit(b, DUM, 82);
      hit(b + 2, TAK, 62);
      for (const q of [1, 3]) hit(b + q, SPOON, 40);
    } else {
      hit(b, DUM, 90);
      hit(b + 1, TAK, 64);
      hit(b + 2, DUM, 80);
      hit(b + 2.5, DUM, 58);
      hit(b + 3, TAK, 70);
      hit(b + 3.75, TAK, 38);
      for (const e of [0.5, 1.5, 2.5, 3.5]) hit(b + e, SPOON, 46 + (e === 2.5 ? 6 : 0));
    }
  }
  // Fills: out of the cold section (bar 24) and back to the loop head (bar 32).
  for (const bar of [24, 32]) {
    const b = at(bar);
    for (let i = notes.length - 1; i >= 0; i--) {
      if (notes[i].beat >= b + 2 && notes[i].beat < b + 4) notes.splice(i, 1);
    }
    [2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75].forEach((s, i) => {
      hit(b + s, i % 3 === 0 ? DUM : TAK, 50 + i * 5);
    });
  }
  return {
    id: 'frame_drum',
    role: 'frame drum and wooden spoons',
    layer: 2,
    channel: 9,
    program: 0,
    volume: 92,
    pan: 58,
    reverb: 30,
    notes,
    controls: [],
  };
}

function pizzicatoPulse(): ScorePart {
  const notes: ScoreNote[] = [];
  for (let bar = 1; bar <= 32; bar++) {
    const [root, fifth] = PIZZ_ROOT_FIFTH[PROGRESSION[bar - 1]];
    if (inB(bar)) {
      notes.push({ beat: at(bar), dur: 1, pitch: root, vel: 64 });
      notes.push({ beat: at(bar, 2), dur: 1, pitch: fifth, vel: 56 });
    } else {
      [root, fifth, root + 12, fifth].forEach((p, q) => {
        notes.push({ beat: at(bar, q), dur: 0.5, pitch: p, vel: q === 0 ? 74 : 60 });
      });
    }
  }
  return {
    id: 'pizzicato',
    role: 'pizzicato pulse',
    layer: 2,
    channel: 2,
    program: 45, // Pizzicato strings
    volume: 78,
    pan: 80,
    reverb: 40,
    notes,
    controls: [],
  };
}

/** The recorder line. Every statement of the hero motif stops on A. */
export function recorderMelody(): ScoreNote[] {
  return [
    // A: bars 1 to 8
    ...phrase(at(1), [
      ['G4', 0.5],
      ['A4', 0.5],
      ['D5', 1],
      ['E5', 1],
      ['D5', 0.5],
      ['A4', 2],
      ['r', 1],
      ['B4', 0.5],
      ['C5', 0.5],
    ]),
    ...phrase(at(3), [
      ['E5', 1.5],
      ['D5', 0.5],
      ['C5', 1],
      ['E5', 1],
    ]),
    ...phrase(at(4), [
      ['D5', 2],
      ['B4', 1],
      ['G4', 1],
    ]),
    ...phrase(at(5), [
      ['E5', 0.5],
      ['F#5', 0.5],
      ['G5', 1],
      ['B5', 1],
      ['A5', 0.5],
      ['G5', 0.5],
    ]),
    ...phrase(at(6), [
      ['E5', 2],
      ['G5', 1],
      ['E5', 1],
    ]),
    ...phrase(at(7), [
      ['C5', 1],
      ['E5', 1],
      ['A5', 1],
      ['G5', 0.5],
      ['E5', 0.5],
    ]),
    ...phrase(at(8), [
      ['F#5', 2],
      ['D5', 1],
      ['A4', 1],
    ]),
    // A': bars 9 to 16
    ...phrase(at(9), [
      ['G4', 0.5],
      ['A4', 0.5],
      ['D5', 1],
      ['E5', 1],
      ['D5', 0.5],
      ['A4', 2],
      ['r', 0.5],
      ['B4', 0.5],
      ['C5', 0.5],
      ['D5', 1],
    ]),
    ...phrase(at(11), [
      ['E5', 1],
      ['G5', 1],
      ['E5', 0.5],
      ['D5', 0.5],
      ['C5', 1],
    ]),
    ...phrase(at(12), [
      ['D5', 1.5],
      ['B4', 0.5],
      ['G4', 2],
    ]),
    ...phrase(at(13), [
      ['B4', 0.5],
      ['C5', 0.5],
      ['E5', 1],
      ['F#5', 1],
      ['E5', 0.5],
      ['B4', 0.5],
    ]),
    ...phrase(at(14), [
      ['C5', 1],
      ['E5', 1],
      ['G5', 2],
    ]),
    ...phrase(at(15), [
      ['F#5', 1],
      ['E5', 0.5],
      ['D5', 0.5],
      ['A4', 1],
      ['D5', 1],
    ]),
    ...phrase(at(16), [['B4', 3]]),
    // B: bars 17 to 24, low and breathy, the F natural in bar 22
    ...phrase(
      at(17),
      [
        ['E4', 2],
        ['G4', 1],
        ['B4', 1],
      ],
      72,
    ),
    ...phrase(
      at(18),
      [
        ['A4', 1.5],
        ['G4', 0.5],
        ['E4', 2],
      ],
      70,
    ),
    ...phrase(
      at(19),
      [
        ['G4', 1],
        ['C5', 1],
        ['E5', 1.5],
        ['D5', 0.5],
      ],
      74,
    ),
    ...phrase(
      at(20),
      [
        ['D5', 2],
        ['A4', 2],
      ],
      72,
    ),
    ...phrase(
      at(21),
      [
        ['B4', 1.5],
        ['A4', 0.5],
        ['G4', 1],
        ['E4', 1],
      ],
      70,
    ),
    ...phrase(
      at(22),
      [
        ['F4', 1],
        ['A4', 1],
        ['C5', 2],
      ],
      72,
    ),
    ...phrase(
      at(23),
      [
        ['E5', 1.5],
        ['D5', 0.5],
        ['C5', 1],
        ['G4', 1],
      ],
      74,
    ),
    ...phrase(
      at(24),
      [
        ['A4', 2],
        ['F#4', 1],
        ['A4', 1],
      ],
      76,
    ),
    // A'': bars 25 to 32, the hero motif an octave up
    ...phrase(
      at(25),
      [
        ['G5', 0.5],
        ['A5', 0.5],
        ['D6', 1],
        ['E6', 1],
        ['D6', 0.5],
        ['A5', 2],
        ['r', 0.5],
        ['G5', 0.5],
        ['F#5', 0.5],
        ['E5', 1],
      ],
      86,
    ),
    ...phrase(
      at(27),
      [
        ['E5', 1],
        ['G5', 1],
        ['C6', 1.5],
        ['B5', 0.5],
      ],
      84,
    ),
    ...phrase(
      at(28),
      [
        ['B5', 2],
        ['G5', 1],
        ['D5', 1],
      ],
      82,
    ),
    ...phrase(
      at(29),
      [
        ['E5', 0.5],
        ['F#5', 0.5],
        ['G5', 1],
        ['B5', 1],
        ['A5', 0.5],
        ['G5', 0.5],
      ],
      82,
    ),
    ...phrase(
      at(30),
      [
        ['E5', 2],
        ['C5', 1],
        ['E5', 1],
      ],
      80,
    ),
    ...phrase(
      at(31),
      [
        ['D5', 1],
        ['F#5', 1],
        ['A5', 1],
        ['F#5', 0.5],
        ['E5', 0.5],
      ],
      80,
    ),
    ...phrase(
      at(32),
      [
        ['D5', 2],
        ['A4', 1],
      ],
      78,
    ),
  ];
}

function recorder(): ScorePart {
  return {
    id: 'recorder',
    role: 'recorder melody',
    layer: 3,
    channel: 3,
    program: 74, // Recorder
    volume: 96,
    pan: 78,
    reverb: 60,
    notes: recorderMelody(),
    controls: [],
  };
}

/** The undercurrent: D and Eb alternating every two beats, swelling like breath. */
export function undercurrentNotes(low: number): ScoreNote[] {
  const notes: ScoreNote[] = [];
  for (let beat = 0; beat < 32 * BEATS; beat += 2) {
    notes.push({ beat, dur: 2, pitch: (beat / 2) % 2 === 0 ? low : low + 1, vel: 52 });
  }
  return notes;
}

function breathing(): ScoreControl[] {
  const controls: ScoreControl[] = [];
  for (let beat = 0; beat < 32 * BEATS; beat += 2) {
    // Stronger in the cold section.
    const peak = beat >= at(17) && beat < at(25) ? 108 : 88;
    controls.push({ beat, controller: 11, value: 56 });
    controls.push({ beat: beat + 1, controller: 11, value: peak });
    controls.push({ beat: beat + 1.75, controller: 11, value: 60 });
  }
  return controls;
}

function undercurrentBass(): ScorePart {
  return {
    id: 'undercurrent_bass',
    role: 'sub-bass undercurrent',
    layer: 3,
    channel: 4,
    program: 43, // Contrabass
    volume: 104,
    pan: 64,
    reverb: 30,
    notes: undercurrentNotes(38), // D2 and Eb2
    controls: breathing(),
  };
}

function undercurrentBowedMetal(): ScorePart {
  return {
    id: 'undercurrent_bowed',
    role: 'bowed metal undercurrent',
    layer: 3,
    channel: 5,
    program: 92, // Pad 5 (bowed)
    volume: 70,
    pan: 64,
    reverb: 70,
    notes: undercurrentNotes(38), // D2 and Eb2, doubling the bass in a bowed-glass colour
    controls: breathing(),
  };
}

export const SCORE: Score = {
  id: 'mus_town_borderstone_day',
  bpm: 104,
  beatsPerBar: BEATS,
  bars: 32,
  keySharps: 1,
  keyMinor: false,
  keyscale: 'G major',
  parts: [
    hurdyGurdyDrone(),
    lute(),
    frameDrumAndSpoons(),
    pizzicatoPulse(),
    recorder(),
    undercurrentBass(),
    undercurrentBowedMetal(),
  ],
};
