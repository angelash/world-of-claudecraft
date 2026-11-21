// The CG archive (cg_and_video.md 5): the seam check judges a join against the motion around
// it, and the generation record keeps what was sent and made for every keyframe and segment.

import { describe, expect, it } from 'vitest';
import { generationRecord, type RunState } from '../tools/cg_gen/records';
import {
  frameDiffs,
  SEAM_LIMIT,
  SEAM_MIN_STEP,
  seamReadings,
  seamVisible,
} from '../tools/cg_gen/seams';
import type { Storyboard } from '../tools/cg_gen/storyboard';

describe('seam check', () => {
  it('measures each frame against the one before', () => {
    const raw = new Uint8Array([0, 0, 10, 20, 10, 20]);
    expect(frameDiffs(raw, 2)).toEqual([0, 15, 0]);
  });

  it('judges a join against the median motion of the frames around it', () => {
    const diffs = [0, 1, 1, 1, 1, 1, 1, 9, 1, 1, 1, 1, 1, 1];
    const [r] = seamReadings(diffs, [7]);
    expect(r).toEqual({ frame: 7, step: 9, local: 1, ratio: 9 });
    expect(seamVisible(r)).toBe(true);
  });

  it('needs both a large ratio and a visible step', () => {
    // a still shot: a tiny step is a large ratio but not a seam
    expect(seamVisible({ frame: 1, step: SEAM_MIN_STEP - 0.5, local: 0.1, ratio: 20 })).toBe(false);
    // busy motion: a large step that matches its surroundings is not a seam
    expect(seamVisible({ frame: 1, step: 20, local: 10, ratio: 2 })).toBe(false);
    expect(
      seamVisible({ frame: 1, step: SEAM_MIN_STEP + 1, local: 1, ratio: SEAM_LIMIT + 1 }),
    ).toBe(true);
  });

  it('treats near stillness as a floor of motion and skips joins off the film', () => {
    const diffs = [0, 0, 0, 0, 2, 0, 0, 0];
    const [r] = seamReadings(diffs, [4, 0, 99]);
    expect(seamReadings(diffs, [4, 0, 99])).toHaveLength(1);
    expect(r.ratio).toBeCloseTo(2 / 0.3);
  });
});

const board: Storyboard = {
  id: 'film_x',
  title: 'x',
  seed: 1,
  size: [512, 288],
  keyframeSize: [1024, 576],
  shots: [
    {
      id: 's01_a',
      style: 'void',
      segments: 2,
      cut: true,
      keyframes: { '0': { prompt: 'a' }, '2': { prompt: 'b', edit: 's01_a@0', refs: ['style:x'] } },
      motion: ['m0', 'm1'],
    },
    {
      id: 's02_b',
      style: 'void',
      segments: 1,
      cut: true,
      keyframes: { '0': { prompt: '', image: 'art/x.png' } },
      motion: ['m'],
    },
  ],
  cgs: [{ id: 'cg_x', shots: ['s02_b'] }],
};

const state: RunState = {
  keyframes: {
    's01_a@0': { file: 'k0.png', seconds: 20.04, seed: 11 },
    's01_a@2': { file: 'k2.png', seconds: 31, seed: 12 },
    's02_b@0': { file: 'k3.png', seconds: 0.2, seed: 13 },
  },
  segments: {
    's01_a#0': { video: 'a0.mp4', last: 'a0.png', seconds: 126.4, seed: 21 },
    's01_a#1': { video: 'a1.mp4', last: 'a1.png', seconds: 150, seed: 22 },
  },
  takes: { 's01_a#1': 2 },
};

describe('generation record', () => {
  const record = generationRecord(
    board,
    state,
    {
      prompt: (key) => `sent ${key}`,
      file: (path) => (path === 'gone.mp4' ? null : { sha256: `h:${path}`, bytes: 3 }),
      show: (path) => `shown/${path}`,
    },
    {
      recordedAt: '2026-11-21',
      models: { segments: { frames: 73 } },
      outputs: [
        { id: 'film_x', kind: 'film', path: 'film.mp4', shots: ['s01_a', 's02_b'] },
        { id: 'cg_x', kind: 'cg', path: 'gone.mp4', shots: ['s02_b'] },
      ],
      seams: [
        { frame: 73, step: 4, local: 1, ratio: 4 },
        { frame: 145, step: 1, local: 1, ratio: 1 },
      ],
      seamLimit: SEAM_LIMIT,
    },
  );

  it('keeps every keyframe in drawing order with what was sent and made', () => {
    expect(record.keyframes.map((k) => [k.key, k.seed, k.edit, k.prompt])).toEqual([
      ['s01_a@0', 11, null, 'sent s01_a@0'],
      ['s01_a@2', 12, 's01_a@0', 'sent s01_a@2'],
      // an image keyframe was not drawn from a prompt
      ['s02_b@0', 13, null, null],
    ]);
    expect(record.keyframes[1].refs).toEqual(['style:x']);
    expect(record.keyframes[0].file).toEqual({
      path: 'shown/k0.png',
      sha256: 'h:k0.png',
      bytes: 3,
    });
  });

  it('keeps only the segments made, with where each started and ended and its take', () => {
    expect(record.segments.map((s) => [s.key, s.first, s.last, s.take, s.seed])).toEqual([
      ['s01_a#0', 's01_a@0', null, 0, 21],
      ['s01_a#1', 's01_a#0 last frame', 's01_a@2', 2, 22],
    ]);
  });

  it('records outputs with their length, a missing file as null, and the seam readings', () => {
    expect(record.outputs.map((o) => [o.id, o.seconds, o.file?.sha256 ?? null])).toEqual([
      ['film_x', 9.083, 'h:film.mp4'],
      ['cg_x', 3.042, null],
    ]);
    expect(record.seams?.joins).toBe(2);
    expect(record.seams?.visible).toBe(1);
    expect(record.seams?.worst[0].frame).toBe(73);
    expect(record.totals).toMatchObject({ keyframes: 3, segments: 2, segmentSeconds: 276.4 });
  });
});
