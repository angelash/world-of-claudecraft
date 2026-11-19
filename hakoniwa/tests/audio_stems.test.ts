// Layered music in the import branch (audio_direction.md 5.2, 9.2, 11.2 to 11.4): the stem
// folder's layout (merged layers, or the separator's six stems with a layer map), the 11.3
// separation checks, and the processing that cuts the loop and sets the loudness on the mix and
// applies the very same cut and gain to every layer, so the layers stay aligned and still sum
// to the normalised mix.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lengthOf, type Pcm } from '../tools/assets/core/audio/dsp';
import { measureLoudness } from '../tools/assets/core/audio/loudness';
import { checkAudio, newAudioMeta } from '../tools/assets/core/audio/meta';
import { type AudioTemplateLike, audioPlanOf } from '../tools/assets/core/audio/plan';
import {
  defaultLayerMap,
  measureLayers,
  processLayers,
  residualDb,
  separationProblems,
  stemFolderOf,
  stemLayout,
  sumPcm,
} from '../tools/assets/core/audio/stems';

const FS = 48000;
const TEMPLATES = JSON.parse(
  readFileSync(join(__dirname, '..', 'assets', 'prompts', 'templates_audio.json'), 'utf8'),
).templates as Record<string, AudioTemplateLike>;
const plan = audioPlanOf('music_loop', TEMPLATES.music_loop as AudioTemplateLike, {
  zh: '速度 120 BPM，4/4 拍；循环体 4 小节，约 8 秒；分层 3',
});

/** A cyclic stereo layer: a tone with a beat envelope (bpm 120), at a level. */
function layer(sec: number, freq: number, amp: number, pulse: boolean): Pcm {
  const n = Math.round(FS * sec);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  const beat = (60 / 120) * FS;
  for (let i = 0; i < n; i++) {
    const env = pulse ? 0.5 + 0.5 * Math.exp(-((i % beat) / beat) * 6) : 1;
    const v = amp * env * Math.sin((2 * Math.PI * freq * i) / FS);
    l[i] = v;
    r[i] = v * 0.95;
  }
  return [l, r];
}

const bed = () => layer(12, 110, 0.25, false);
const drums = () => layer(12, 80, 0.2, true);
const melody = () => layer(12, 440, 0.12, false);

describe('stem folder layout (11.3)', () => {
  it('reads merged layers, or merges the six separator stems by map or default', () => {
    expect(stemFolderOf('assets/audio/music/mus_a.ogg')).toBe('assets/audio/music/mus_a.stems');
    expect(stemLayout(['s1.wav', 's2.ogg', 's3.flac'], 3)).toEqual({
      layers: [['s1.wav'], ['s2.ogg'], ['s3.flac']],
    });
    const six = ['drums.wav', 'bass.wav', 'vocals.wav', 'piano.wav', 'guitar.wav', 'other.wav'];
    expect(stemLayout(six, 3)).toEqual({
      layers: [['bass.wav', 'other.wav'], ['drums.wav'], ['piano.wav', 'guitar.wav', 'vocals.wav']],
    });
    expect(
      stemLayout(six, 2, {
        layers: [
          ['piano', 'other'],
          ['drums', 'bass'],
        ],
      }),
    ).toEqual({
      layers: [
        ['piano.wav', 'other.wav'],
        ['drums.wav', 'bass.wav'],
      ],
    });
    expect(defaultLayerMap(6)).toBeNull();
    const bad = (r: ReturnType<typeof stemLayout>) => ('problem' in r ? r.problem.message : '');
    expect(bad(stemLayout(['s1.wav', 's3.wav'], 3))).toMatch(/some merged layers/);
    expect(bad(stemLayout(six, 6))).toMatch(/no default merge for 6 layers/);
    expect(bad(stemLayout(six, 3, { layers: [['bass']] }))).toMatch(/must list 3 layers/);
    expect(bad(stemLayout(six, 2, { layers: [['bass'], ['bass']] }))).toMatch(/used twice/);
    expect(bad(stemLayout(['drums.wav'], 3))).toMatch(/none of its stems/);
  });
});

describe('separation checks (11.3)', () => {
  it('passes layers that sum to the mix with a self-standing L1', () => {
    const layers = [bed(), drums(), melody()];
    const mix = sumPcm(layers);
    expect(residualDb(mix, layers)).toBe(Number.NEGATIVE_INFINITY);
    expect(separationProblems(mix, layers, FS)).toEqual([]);
  });

  it('names a residual over -30 dB, an L1 that is only a tail, and a length mismatch', () => {
    const layers = [bed(), drums(), melody()];
    const mix = sumPcm([...layers, layer(12, 660, 0.1, false)]);
    expect(
      separationProblems(mix, layers, FS)
        .map((p) => p.message)
        .join(' '),
    ).toMatch(/differ from the mix by/);
    const faint = [layer(12, 110, 0.001, false), drums(), melody()];
    expect(
      separationProblems(sumPcm(faint), faint, FS)
        .map((p) => p.message)
        .join(' '),
    ).toMatch(/L1 is .* LU against the mix/);
    const short = [bed(), layer(11, 80, 0.2, true), melody()];
    expect(separationProblems(sumPcm([bed(), drums(), melody()]), short, FS)[0]?.message).toMatch(
      /layer L2 is 11.00 s/,
    );
  });
});

describe('processing a layered entry (5.2, 11.2, 11.4)', () => {
  it('cuts one loop for all layers, sets the mix loudness, keeps the layer ratios', () => {
    const layers = [bed(), drums(), melody()];
    const mix = sumPcm(layers);
    const res = processLayers(mix, layers, FS, plan);
    expect(res.problems).toEqual([]);
    expect(res.stems).toBe(3);
    expect(res.outputs.map((o) => o.suffix)).toEqual(['_s1', '_s2', '_s3']);
    expect([res.loopStart, res.loopEnd]).toEqual([0, 8 * FS]);
    for (const o of res.outputs) expect(lengthOf(o.pcm)).toBe(8 * FS);
    // The layers together are the normalised mix: -18 LUFS within 1 LU.
    const sum = measureLayers(
      res.outputs.map((o) => o.pcm),
      FS,
      'I',
    );
    expect(Math.abs(sum.lufs - -18)).toBeLessThanOrEqual(1);
    expect(Math.abs((res.lufs ?? 0) - sum.lufs)).toBeLessThan(0.3);
    // One gain for all: the bed-to-melody ratio is what it was before.
    const ratio = (a: Pcm, b: Pcm) =>
      measureLoudness(a, FS).integrated - measureLoudness(b, FS).integrated;
    const before = ratio(layers[0] as Pcm, layers[2] as Pcm);
    const after = ratio(res.outputs[0]?.pcm as Pcm, res.outputs[2]?.pcm as Pcm);
    expect(Math.abs(after - before)).toBeLessThan(0.2);
    expect(res.processing.loudness).toMatchObject({
      appliedTo: 'mix, the same gain on every layer',
    });
  });

  it('reports a layer count that differs from the entry', () => {
    const layers = [bed(), sumPcm([drums(), melody()])];
    const res = processLayers(sumPcm(layers), layers, FS, plan);
    expect(res.problems.map((p) => p.message)).toContain('2 layer(s) found, the entry asks for 3');
  });

  it('the check wants one file per layer, all of one length', () => {
    const meta = newAudioMeta('mus_a', plan, { file: 'audio/music/mus_a.ogg', sha256: 'x' }, '');
    meta.stems = 3;
    meta.files = ['a_s1.ogg', 'a_s2.ogg'];
    meta.loopStart = 0;
    meta.loopEnd = 8 * FS;
    meta.lufs = -18;
    meta.truePeak = -3;
    const header = (n: number) => ({
      file: 'f',
      info: {
        sampleRate: FS,
        channels: 2,
        totalSamples: n,
        durationSec: n / FS,
        crcErrors: 0,
        comments: { LOOPSTART: ['0'], LOOPLENGTH: [String(8 * FS)] },
      },
    });
    const probs = checkAudio(meta, [header(8 * FS), header(8 * FS - 10)] as never, plan);
    expect(probs.map((p) => p.message)).toEqual(
      expect.arrayContaining([
        '2 layer file(s), the entry asks for 3 layers',
        'layer files differ in length: they must stay aligned',
      ]),
    );
  });
});
