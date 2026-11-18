// Loop sources for the asset import (tools/audio_gen/loop_source.ts): the cheap seam reading is
// bit for bit the import's own (dsp.seamOf on dsp.bakeLoop), the confirming cut is the import's
// (processAudio's loop branch), seam starts are chosen in the documented order, and the import
// cuts a handed-over source into a loop with no seam problem, where a loop pre-baked to one body
// fails with seam/loop_points. Also the fixed-gain rule for loop sources and the raw-take lookup
// of the re-stage tool.

import { describe, expect, it } from 'vitest';
import { bakeLoop, type Pcm, seamOf } from '../tools/assets/core/audio/dsp';
import { type AudioPlan, audioPlanOf } from '../tools/assets/core/audio/plan';
import { processAudio } from '../tools/assets/core/audio/process';
import { linearGainDb } from '../tools/audio_gen/ffmpeg';
import {
  barStarts,
  bedLoopSource,
  chooseLoopStart,
  importLoopCut,
  LOOP_SOURCE_MARGIN_SECONDS,
  loopSource,
  musicLoopSource,
  SEAM_LEVEL_STEP_LIMIT_DB,
  seamAt,
  seamPasses,
  soundsAt,
  toPlanar,
} from '../tools/audio_gen/loop_source';
import { quietSeamScores } from '../tools/audio_gen/loops';
import { latestTakes } from '../tools/audio_gen/restage_loops';
import type { PcmAudio } from '../tools/audio_gen/wav';

const FS = 48000;

/** Deterministic noise in [-1, 1). */
function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 31 - 1;
  };
}

/** Stereo noise whose level (linear gain) follows `level(t)` in seconds. */
function bed(seconds: number, level: (t: number) => number, seed = 7): PcmAudio {
  const n = Math.round(seconds * FS);
  const rnd = noise(seed);
  const samples = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const g = level(i / FS);
    samples[i * 2] = 0.2 * g * rnd();
    samples[i * 2 + 1] = 0.2 * g * rnd();
  }
  return { sampleRate: FS, channels: 2, samples };
}

const tpl = (loudness: string, truePeak: string) => ({
  duration: 'loop',
  channels: 'stereo',
  loudness,
  truePeak,
});
const ambiencePlan = (loopSec: number): AudioPlan =>
  audioPlanOf('ambience_bed', tpl('-26 LUFS', '-3 dBTP'), { zh: `循环体约 ${loopSec} 秒` });
const effectLoopPlan = (): AudioPlan =>
  audioPlanOf('effect_loop', tpl('-24 LUFS', '-1 dBTP'), { zh: '持续的魔法嗡鸣' });
const musicPlan = (bpm: number, bars: number): AudioPlan =>
  audioPlanOf('music_loop', tpl('-18 LUFS', '-1.5 dBTP'), {
    zh: `速度 ${bpm} BPM，4/4 拍；循环体 ${bars} 小节`,
  });

describe('seam reading', () => {
  const pcm = toPlanar(bed(12, (t) => (t < 5 ? 1 : 0.5), 3));
  it.each([
    ['power, short fade', 1000, 5 * FS, Math.round(0.2 * FS), 'power'],
    ['linear, fade longer than the half-second window', FS, 6 * FS, 2 * FS, 'linear'],
    ['fade reaching into the tail window', 0, Math.round(1.2 * FS), FS, 'power'],
    ['post-body material running past the end', 9 * FS, 2 * FS, 2 * FS, 'linear'],
    ['under one second (whole bake)', 0, Math.round(0.6 * FS), Math.round(0.1 * FS), 'power'],
  ] as const)('is bit for bit seamOf(bakeLoop(...)): %s', (_name, start, length, fade, shape) => {
    const want = seamOf(bakeLoop(pcm, start, length, fade, shape), FS);
    expect(seamAt(pcm, FS, start, length, fade, shape)).toEqual(want);
  });

  it('refuses a body that does not fit the PCM', () => {
    expect(() => seamAt(pcm, FS, 11 * FS, 2 * FS, FS, 'power')).toThrow(/does not fit/);
  });

  it('passes only under the 2 dB headroom and the jump share', () => {
    expect(SEAM_LEVEL_STEP_LIMIT_DB).toBe(2);
    expect(seamPasses({ levelStepDb: 1.9, jump: 0, typical: 0.01 })).toBe(true);
    expect(seamPasses({ levelStepDb: 2.1, jump: 0, typical: 0.01 })).toBe(false);
    expect(seamPasses({ levelStepDb: 0, jump: 0.05, typical: 0.01 })).toBe(false);
  });
});

describe("the import's cut", () => {
  it('matches processAudio for a stated body and for the longest-body rule', () => {
    for (const plan of [ambiencePlan(6), effectLoopPlan()]) {
      const source = toPlanar(bed(9, () => 1, 11));
      const cut = importLoopCut(source, FS, plan);
      const res = processAudio(source, FS, plan);
      const loopCut = res.processing.loopCut as { start: number; length: number };
      expect(cut.fits).toBe(true);
      expect(cut.start).toBe(loopCut.start);
      expect(cut.length).toBe(loopCut.length);
      const seam = res.processing.seam as { levelStepDb: number };
      expect(cut.seam?.levelStepDb).toBeCloseTo(seam.levelStepDb, 1);
    }
  });

  it('reports a source too short for the body plus crossfade', () => {
    const cut = importLoopCut(toPlanar(bed(7, () => 1)), FS, ambiencePlan(6));
    expect(cut.fits).toBe(false);
    expect(cut.seam).toBeNull();
  });
});

describe('choosing the seam start', () => {
  const plan = ambiencePlan(4);
  const take = toPlanar(bed(16, () => 1, 5));
  const body = 4 * FS;

  it('takes the passing candidate with the lowest rank, or the first in order', () => {
    const c = [
      { start: FS, rank: 3 },
      { start: 3 * FS, rank: 1 },
    ];
    expect(chooseLoopStart(take, FS, c, plan, body).start).toBe(3 * FS);
    expect(chooseLoopStart(take, FS, c, plan, body, true).start).toBe(FS);
  });

  it('skips a start in silence even when its rank is best', () => {
    // 20 ms of silence at the best-ranked start: longer than the margin, so the import would
    // begin the body past the material the source holds.
    const gappy = take.map((ch) => ch.slice());
    for (const ch of gappy) ch.fill(0, 2 * FS, 2 * FS + Math.round(0.02 * FS));
    expect(soundsAt(gappy, 2 * FS, 96, 0.001)).toBe(false);
    expect(soundsAt(gappy, 5 * FS, 96, 0.001)).toBe(true);
    const c = [
      { start: 2 * FS, rank: 0 },
      { start: 5 * FS, rank: 1 },
    ];
    expect(chooseLoopStart(gappy, FS, c, plan, body).start).toBe(5 * FS);
  });

  it('refuses a body other than the stated one, which the import would never cut', () => {
    expect(() => chooseLoopStart(take, FS, [{ start: 0 }], plan, body - FS)).toThrow(/stated/);
  });

  it('falls back to the smallest level step, marked as not passing, and throws with no room', () => {
    // Rising 3 dB a second: with a 200 ms crossfade every loop ends far louder than it starts.
    const rising = toPlanar(bed(16, (t) => 10 ** ((3 * t) / 20), 9));
    const choice = chooseLoopStart(
      rising,
      FS,
      [{ start: 0 }, { start: 4 * FS }],
      effectLoopPlan(),
      6 * FS,
    );
    expect(choice.passes).toBe(false);
    expect(choice.seam.levelStepDb).toBeGreaterThan(SEAM_LEVEL_STEP_LIMIT_DB);
    expect(() => chooseLoopStart(take, FS, [{ start: 14 * FS }], plan, body)).toThrow(/No seam/);
  });
});

describe('loop sources', () => {
  it('hold the body, the crossfade and the margin from the start, or throw when short', () => {
    const audio = bed(10, () => 1);
    const src = loopSource(audio, FS, 4 * FS, FS);
    expect(src.samples.length / 2).toBe(5 * FS + Math.round(LOOP_SOURCE_MARGIN_SECONDS * FS));
    expect(src.samples[0]).toBe(audio.samples[FS * 2]);
    expect(() => loopSource(audio, 6 * FS, 4 * FS, FS)).toThrow(/Not enough material/);
  });

  it('lists bar starts, or beat starts, that leave room for the body and crossfade', () => {
    const plan = musicPlan(120, 4); // 2 s bars, 8 s body
    expect(barStarts(12 * FS, FS, plan, 8 * FS, FS)).toEqual([0, 2 * FS]);
    expect(barStarts(12 * FS, FS, plan, 8 * FS, FS, 1)).toEqual([
      0,
      0.5 * FS,
      FS,
      1.5 * FS,
      2 * FS,
      2.5 * FS,
    ]);
  });

  it('a bed source passes the import, where a pre-baked one-body loop fails it', () => {
    const plan = ambiencePlan(6);
    // A steady bed with one loud event between 3 and 4 s: the seam must avoid it.
    const take = bed(16, (t) => (t >= 3 && t < 4 ? 6 : 1));
    const fade = Math.round((plan.fadeMs / 1000) * FS);
    const scores = quietSeamScores(take, 6 * FS, fade, FS / 20, FS / 4, FS / 2);
    const cut = bedLoopSource(take, plan, 90, scores);
    expect(cut.choice.passes).toBe(true);
    const res = processAudio(toPlanar(cut.source), FS, plan);
    expect(res.problems.filter((p) => p.code === 'seam')).toEqual([]);
    expect(res.loopEnd).toBe(cut.choice.cut.length);
    const oneBody = toPlanar(cut.source).map((c) => c.slice(0, 6 * FS));
    const old = processAudio(oneBody, FS, plan);
    expect(old.problems.map((p) => `${p.code}/${p.check}`)).toContain('seam/loop_points');
  });

  it('an effect loop with no stated body is confirmed at the length the import takes', () => {
    const plan = effectLoopPlan();
    expect(plan.loopSec).toBeNull();
    const take = bed(14, (t) => 1 + 0.5 * Math.sin(t * 3));
    const fade = Math.round((plan.fadeMs / 1000) * FS);
    const scores = quietSeamScores(take, 6 * FS, fade, FS / 20, FS / 10, FS / 2);
    const cut = bedLoopSource(take, plan, 6, scores);
    const res = processAudio(toPlanar(cut.source), FS, plan);
    // The import's body is the source minus its start and the crossfade: the 6 s body plus the
    // margin, which is the length the choice was confirmed at.
    expect(res.loopEnd).toBe(cut.choice.cut.length);
    expect(cut.choice.cut.length).toBeGreaterThan(6 * FS);
    expect(res.problems.filter((p) => p.code === 'seam')).toEqual([]);
  });

  it('a music take quiet where its first body ends starts at the first bar that passes', () => {
    const plan = musicPlan(120, 4); // 8 s body on 2 s bars
    const take = bed(16, (t) => (t >= 7 && t < 8 ? 0.2 : 1));
    const fromZero = processAudio(toPlanar(take), FS, plan);
    expect(fromZero.problems.map((p) => p.check)).toContain('loop_seam');
    const cut = musicLoopSource(take, plan);
    expect(cut?.choice.passes).toBe(true);
    expect(cut?.choice.start).toBe(2 * FS);
    const res = processAudio(toPlanar(cut?.source ?? take), FS, plan);
    expect(res.problems.filter((p) => p.code === 'seam')).toEqual([]);
  });

  it('a music take that passes from its first sample keeps its own start', () => {
    const cut = musicLoopSource(
      bed(16, () => 1),
      musicPlan(120, 4),
    );
    expect(cut?.choice.start).toBe(0);
    expect(cut?.choice.passes).toBe(true);
  });

  it('music with no stated body is handed over whole', () => {
    const plan = { ...musicPlan(120, 4), loopSec: null };
    expect(
      musicLoopSource(
        bed(4, () => 1),
        plan,
      ),
    ).toBeNull();
  });
});

describe('fixed gain for loop sources', () => {
  it('goes to the target unless that lifts the true peak over the ceiling, and 0 on silence', () => {
    expect(linearGainDb({ integrated: -30, truePeak: -12 }, -26, -3)).toBe(4);
    expect(linearGainDb({ integrated: -30, truePeak: -5 }, -26, -3)).toBe(2);
    expect(linearGainDb({ integrated: -20, truePeak: -6 }, -26, -3)).toBe(-6);
    expect(linearGainDb({ integrated: Number.NEGATIVE_INFINITY, truePeak: -90 }, -26, -3)).toBe(0);
  });
});

describe('raw takes of the re-stage', () => {
  it('picks the newest counters of exactly that prefix, oldest first', () => {
    const names = [
      'sfx_a_loop_00001.flac',
      'sfx_a_loop_00002.flac',
      'sfx_a_loop_00003.flac',
      'sfx_a_loop_00004.flac',
      'sfx_a_loop_big_00009.flac',
      'sfx_a_loop_00005.flac.48k.wav',
    ];
    expect(latestTakes(names, 'sfx_a_loop_', 3)).toEqual([
      'sfx_a_loop_00002.flac',
      'sfx_a_loop_00003.flac',
      'sfx_a_loop_00004.flac',
    ]);
    expect(() => latestTakes(names, 'sfx_a_loop_', 5)).toThrow(/only 4 raw take/);
  });
});

/** Keep the planar helper honest: channels de-interleave in order. */
describe('planar conversion', () => {
  it('splits interleaved frames into channels', () => {
    const p: Pcm = toPlanar({
      sampleRate: FS,
      channels: 2,
      samples: Float32Array.from([1, 2, 3, 4]),
    });
    expect([...(p[0] ?? [])]).toEqual([1, 3]);
    expect([...(p[1] ?? [])]).toEqual([2, 4]);
  });
});
