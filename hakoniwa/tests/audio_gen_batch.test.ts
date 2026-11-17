// The full audio batch (tools/audio_gen/batch.ts): every audio entry of the prompt library
// becomes one job with a route, the ACE-Step parameters parsed from the entry's sentence
// are valid choices, the motif seeds hold the motif table note for note inside the seed
// template's length, and the shared take helpers trim, pair and scale as documented.

import { describe, expect, it } from 'vitest';
import { allJobs, takeCount, variationSeconds } from '../tools/audio_gen/batch';
import {
  generationSeconds,
  keyscaleOf,
  statedSeconds,
  timeSignatureOf,
} from '../tools/audio_gen/music_params';
import { findIntervalPattern, scoreProblems } from '../tools/audio_gen/score';
import { MOTIF_SEEDS } from '../tools/audio_gen/scores/motif_seeds';
import { onsetFrame, pairToStereo, trimHit } from '../tools/audio_gen/takes';
import type { PcmAudio } from '../tools/audio_gen/wav';

const ACE_KEYS = /^(C|C#|Db|D|D#|Eb|E|F|F#|Gb|G|G#|Ab|A|A#|Bb|B) (major|minor)$/;

describe('music parameters from the entry sentence', () => {
  it('maps keys and church modes onto major or minor', () => {
    expect(keyscaleOf({ en: '104 BPM, four-four time, G major; loop body 32 bars' })).toBe(
      'G major',
    );
    expect(keyscaleOf({ en: 'E Dorian, about 76 BPM' })).toBe('E minor');
    expect(keyscaleOf({ en: 'A Mixolydian; 116 BPM' })).toBe('A major');
    expect(keyscaleOf({ en: 'F-sharp minor, slow' })).toBe('F# minor');
    expect(keyscaleOf({ en: 'B-flat major, march' })).toBe('Bb major');
    expect(keyscaleOf({ en: '60 BPM, centered on E, tonally ambiguous' })).toBe('E minor');
    expect(keyscaleOf({ en: '60 BPM, four-four time, atonal; loop body 16 bars' })).toBe('D minor');
    expect(keyscaleOf({ en: 'about 8 seconds, mainly in D so it sits with the motifs' })).toBe(
      'D major',
    );
    expect(keyscaleOf({ zh: '速度 70 BPM，升 C 小调' })).toBe('C# minor');
    expect(keyscaleOf({ en: 'free tempo, pure fifth' })).toBeNull();
  });

  it('maps meters onto the four ACE-Step choices and reads stated lengths', () => {
    expect(timeSignatureOf({ en: '88 BPM, three-four time' })).toBe('3');
    expect(timeSignatureOf({ en: 'six-eight time' })).toBe('6');
    expect(timeSignatureOf({ zh: '速度 90 BPM，12/8 拍' })).toBe('4');
    expect(timeSignatureOf({ en: 'no meter given' })).toBe('4');
    expect(statedSeconds({ en: 'about 85 seconds with a complete beginning' })).toBe(85);
    expect(statedSeconds({ zh: '时长约 12 秒' })).toBe(12);
  });

  it('generates 1.6 loop bodies for loops and keeps every length inside its template', () => {
    expect(generationSeconds('music_loop', 73.85, null, null)).toBe(118.16);
    expect(generationSeconds('music_loop', 200, null, null)).toBe(240);
    expect(generationSeconds('music_cue', null, 85, 240)).toBe(85);
    expect(generationSeconds('music_long', null, 330, 360)).toBe(330);
    expect(generationSeconds('music_stinger', null, 3, 15)).toBe(10);
    expect(generationSeconds('music_stinger', null, 12, 15)).toBe(14);
  });
});

describe('the batch jobs', () => {
  const jobs = allJobs();

  it('has one job per audio entry of the prompt library, ordered by milestone', () => {
    expect(jobs.length).toBe(1214);
    expect(new Set(jobs.map((j) => j.id)).size).toBe(1214);
    const milestones = jobs.map((j) => j.milestone);
    expect([...milestones].sort()).toEqual(milestones);
  });

  it('gives every music job a valid ACE-Step key and meter', () => {
    for (const j of jobs.filter((x) => x.plan.kind === 'music')) {
      expect(keyscaleOf(j.extra) ?? 'D major').toMatch(ACE_KEYS);
      expect(['2', '3', '4', '6']).toContain(timeSignatureOf(j.extra));
    }
  });

  it('asks for half again the variations of an effect, at least 4 and at most 10 takes', () => {
    expect(takeCount(1)).toBe(4);
    expect(takeCount(4)).toBe(6);
    expect(takeCount(6)).toBe(9);
    expect(takeCount(12)).toBe(10);
    const footsteps = jobs.find((j) => j.id === 'sfx_ft_dirt_walk');
    expect(footsteps?.plan.variants).toBe(6);
    expect(footsteps && variationSeconds(footsteps)).toBe(0.4);
  });
});

describe('motif seeds', () => {
  const byId = new Map(MOTIF_SEEDS.map((s) => [s.id, s]));

  it('covers the eight first-batch seeds and the faceless one, each well formed and short', () => {
    expect([...byId.keys()].sort()).toEqual(
      [
        'mus_stg_motif_dian',
        'mus_stg_motif_door',
        'mus_stg_motif_eluen',
        'mus_stg_motif_faceless',
        'mus_stg_motif_hero',
        'mus_stg_motif_merca',
        'mus_stg_motif_moira',
        'mus_stg_motif_sylvie',
        'mus_stg_motif_valda',
      ].sort(),
    );
    for (const s of MOTIF_SEEDS) {
      expect(scoreProblems(s)).toEqual([]);
      const end = Math.max(...s.parts.flatMap((p) => p.notes.map((n) => n.beat + n.dur)));
      // The seed template allows 16 seconds; one second is left for the decay.
      expect((end * 60) / s.bpm).toBeLessThanOrEqual(15);
    }
  });

  it('plays the hero motif twice and its faceless mirror twice, note for note', () => {
    const lead = (id: string) => byId.get(id)?.parts[0]?.notes ?? [];
    // D E A B A E: up 2, up 5, up 2, down 2, down 5.
    expect(findIntervalPattern(lead('mus_stg_motif_hero'), [2, 5, 2, -2, -5])).toHaveLength(2);
    // D C G F G C: the mirror, down 2, down 5, down 2, up 2, up 5.
    expect(findIntervalPattern(lead('mus_stg_motif_faceless'), [-2, -5, -2, 2, 5])).toHaveLength(2);
    // The palindrome D A D' A D, five equal steps the first time.
    const eluen = lead('mus_stg_motif_eluen');
    expect(findIntervalPattern(eluen, [7, 5, -5, -7])).toHaveLength(2);
    // The undercurrent alternates D and Eb only.
    expect(new Set(lead('mus_stg_motif_dian').map((n) => n.pitch % 12))).toEqual(new Set([2, 3]));
  });
});

describe('take helpers', () => {
  const RATE = 1000;
  const mono = (values: number[]): PcmAudio => ({
    sampleRate: RATE,
    channels: 1,
    samples: Float32Array.from(values),
  });

  it('trims a one-shot from just before its onset and sets the peak to -1.5 dBFS', () => {
    const values = [
      ...new Array(300).fill(0),
      ...new Array(200).fill(0.5),
      ...new Array(500).fill(0),
    ];
    const take = trimHit(mono(values), 0.3);
    expect(onsetFrame(mono(values), 0.025)).toBe(300);
    expect(take.samples.length).toBe(300);
    expect(Math.max(...take.samples)).toBeCloseTo(10 ** (-1.5 / 20), 5);
    expect(take.samples[take.samples.length - 1]).toBeLessThan(0.05);
  });

  it('pairs two mono beds into one stereo bed of the shorter length', () => {
    const st = pairToStereo(mono([1, 2, 3]), mono([4, 5]));
    expect([...st.samples]).toEqual([1, 4, 2, 5]);
    expect(st.channels).toBe(2);
  });
});
