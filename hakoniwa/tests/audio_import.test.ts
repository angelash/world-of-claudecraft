// The audio branch of the import pipeline and the audio event table (audio_direction.md 8 to 11;
// release_engineering.md 9): Ogg Vorbis header reading on code-built minimal Ogg files, BS.1770
// loudness and true peak on generated signals, the per-entry plan, variant splitting, loop
// baking and normalisation, the checks `assets:check` runs (loudness, true peak, loop points),
// data/audio/cues.json against the prompt library, and the director and bus state machines.
// With the root ffmpeg available, one sound also goes through register, import and check.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AudioDirector,
  COMBAT_TRACKS,
  type CueTable,
  combatTierOf,
  type DirectorInput,
  defaultMixSettings,
  effectiveDb,
  type Hostile,
  locationLayers,
  mixBuses,
  resolveCues,
  sliderToDb,
  soundsOf,
  validateCueTable,
} from '../src/client/audio';
import { run as runCheck } from '../tools/assets/check';
import { lengthOf, seamOf } from '../tools/assets/core/audio/dsp';
import { loudnessFor, measureLoudness } from '../tools/assets/core/audio/loudness';
import { type AudioMeta, checkAudio, newAudioMeta } from '../tools/assets/core/audio/meta';
import { buildOggSkeleton, parseOgg } from '../tools/assets/core/audio/ogg';
import { audioPlanOf, parseExtra } from '../tools/assets/core/audio/plan';
import { processAudio } from '../tools/assets/core/audio/process';
import { type ManifestRecord, manifestJson, type ToolRecord } from '../tools/assets/core/manifest';
import { metaPathOf, processedPathOf } from '../tools/assets/core/meta';
import { encodeOgg, ffmpegPath } from '../tools/assets/ffmpeg';
import { run as runImport } from '../tools/assets/import';
import { jsonText, type Logger, loadLibrary } from '../tools/assets/lib';
import { run as runRegister } from '../tools/assets/register';
import { lcg } from './art_fixtures';

const FS = 48000;
const ASSETS = join(__dirname, '..', 'assets');
const PROMPTS = join(ASSETS, 'prompts');
const AUDIO_TEMPLATES = JSON.parse(readFileSync(join(PROMPTS, 'templates_audio.json'), 'utf8'))
  .templates as Record<string, Record<string, unknown>>;
const lib = loadLibrary(PROMPTS);

function sine(freq: number, amp: number, sec: number, phase = 0): Float32Array {
  const a = new Float32Array(Math.round(FS * sec));
  for (let i = 0; i < a.length; i++) a[i] = amp * Math.sin((2 * Math.PI * freq * i) / FS + phase);
  return a;
}

const dbAmp = (db: number): number => 10 ** (db / 20);

/** Decaying noise bursts separated by `gap` seconds of silence (a variant sheet). */
function bursts(count: number, sec: number, gap: number, seed = 5): Float32Array {
  const rnd = lcg(seed);
  const n = Math.round(FS * (count * sec + (count - 1) * gap + 0.3));
  const a = new Float32Array(n);
  for (let k = 0; k < count; k++) {
    const start = Math.round(FS * (0.2 + k * (sec + gap)));
    const len = Math.round(FS * sec);
    for (let i = 0; i < len; i++) a[start + i] = (rnd() * 2 - 1) * 0.6 * Math.exp((-5 * i) / len);
  }
  return a;
}

/** Decaying tone bursts (a hit with body): encodes faithfully, unlike white noise. */
function toneBursts(count: number, sec: number, gap: number): Float32Array {
  const n = Math.round(FS * (count * sec + (count - 1) * gap + 0.3));
  const a = new Float32Array(n);
  for (let k = 0; k < count; k++) {
    const start = Math.round(FS * (0.2 + k * (sec + gap)));
    const len = Math.round(FS * sec);
    const f = 220 * (1 + k * 0.1);
    for (let i = 0; i < len; i++) {
      const t = i / FS;
      const env = Math.min(1, i / (FS * 0.003)) * Math.exp((-4 * i) / len);
      a[start + i] =
        env * (0.5 * Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(2 * Math.PI * 3 * f * t));
    }
  }
  return a;
}

/** A cyclic musical bed: chord tones with a per-beat pulse, `sec` long. */
function music(sec: number, bpm: number): Float32Array[] {
  const n = Math.round(FS * sec);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  const beat = (60 / bpm) * FS;
  for (let i = 0; i < n; i++) {
    const env = 0.6 + 0.4 * Math.exp(-((i % beat) / beat) * 4);
    const t = i / FS;
    const v =
      env *
      (0.2 * Math.sin(2 * Math.PI * 220 * t) +
        0.15 * Math.sin(2 * Math.PI * 277.18 * t) +
        0.1 * Math.sin(2 * Math.PI * 329.63 * t));
    l[i] = v;
    r[i] = v * 0.9;
  }
  return [l, r];
}

describe('Ogg Vorbis headers', () => {
  it('reads sample rate, channels, comments and length from a minimal Ogg file', () => {
    const bytes = buildOggSkeleton({
      sampleRate: 48000,
      channels: 2,
      totalSamples: 96000,
      comments: { LOOPSTART: '0', LOOPLENGTH: '96000', AIGC: '{"Label":"1"}' },
    });
    const info = parseOgg(bytes);
    expect(info).toMatchObject({
      sampleRate: 48000,
      channels: 2,
      totalSamples: 96000,
      durationSec: 2,
      crcErrors: 0,
    });
    expect(info.comments.LOOPLENGTH).toEqual(['96000']);
    expect(info.comments.AIGC).toEqual(['{"Label":"1"}']);
  });

  it('counts CRC failures and rejects streams that are not Vorbis', () => {
    const bytes = buildOggSkeleton({ sampleRate: 44100, channels: 1, totalSamples: 10 });
    bytes[bytes.length - 3]! ^= 0xff;
    expect(parseOgg(bytes).crcErrors).toBe(1);
    const notVorbis = buildOggSkeleton({ sampleRate: 48000, channels: 1, totalSamples: 10 });
    notVorbis[28 + 1] = 0x58; // corrupt the "vorbis" magic of the identification packet
    expect(() => parseOgg(notVorbis)).toThrow(/Vorbis/);
  });

  it('reads comments longer than one lacing segment and refuses truncated files', () => {
    const long = 'x'.repeat(1000);
    const bytes = buildOggSkeleton({
      sampleRate: 48000,
      channels: 2,
      totalSamples: 480,
      comments: { AIGC: long },
    });
    expect(parseOgg(bytes).comments.AIGC).toEqual([long]);
    expect(() => parseOgg(bytes.subarray(0, bytes.length - 10))).toThrow(/truncated/);
  });
});

describe('loudness and true peak (BS.1770-4, EBU Tech 3341)', () => {
  it('stereo 1 kHz sines at -23 and -33 dBFS measure -23 and -33 LUFS', () => {
    for (const level of [-23, -33]) {
      const l = measureLoudness([sine(997, dbAmp(level), 20), sine(997, dbAmp(level), 20)], FS);
      expect(l.integrated).toBeCloseTo(level, 1);
      expect(l.momentaryMax).toBeCloseTo(level, 1);
      expect(l.shortTermMax).toBeCloseTo(level, 1);
    }
  });

  it('gates silence out of the integrated value', () => {
    const tone = sine(997, dbAmp(-20), 10);
    const withSilence = new Float32Array(FS * 30);
    withSilence.set(tone, FS * 10);
    // Blocks that straddle the tone edges pass the relative gate and pull the value down a little.
    expect(measureLoudness([withSilence, withSilence], FS).integrated).toBeCloseTo(-20, 0);
  });

  it('finds the inter-sample peak a sample meter misses', () => {
    const l = measureLoudness([sine(12000, 1, 1, Math.PI / 4)], FS);
    expect(l.samplePeak).toBeCloseTo(-3.01, 1);
    expect(Math.abs(l.truePeak)).toBeLessThan(0.3);
  });
});

describe('audio plan per entry', () => {
  it('reads the tempo grid, layers and loop body of a music loop', () => {
    const extra = lib.expected.get('mus_town_borderstone_day')?.extra;
    const plan = audioPlanOf('music_loop', AUDIO_TEMPLATES.music_loop!, extra);
    expect(plan).toMatchObject({
      kind: 'music',
      bus: 'music',
      channels: 2,
      loop: true,
      measure: 'I',
      targetLufs: -18,
      truePeakMax: -1.5,
      bpm: 104,
      beatsPerBar: 4,
      loopBars: 32,
      stems: 3,
    });
    expect(plan.loopSec).toBeCloseTo((60 / 104) * 4 * 32, 6);
  });

  it('counts compound meters in dotted beats (6/8 is two beats a bar)', () => {
    const plan = audioPlanOf(
      'music_loop',
      AUDIO_TEMPLATES.music_loop!,
      lib.expected.get('mus_god_moira')?.extra,
    );
    expect(plan.beatsPerBar).toBe(2);
    expect(plan.loopSec).toBeCloseTo(80, 6);
    // A grid that contradicts the stated seconds yields to them.
    expect(
      audioPlanOf('music_loop', AUDIO_TEMPLATES.music_loop!, {
        zh: '速度 60 BPM，4/4 拍；循环体 10 小节，约 20 秒',
      }).loopSec,
    ).toBe(20);
  });

  it('puts dialogue blips 6 LU under the other interface sounds', () => {
    expect(
      audioPlanOf('effect_ui', AUDIO_TEMPLATES.effect_ui!, undefined, 'sfx_ui_blip_eluen')
        .targetLufs,
    ).toBe(-26);
    expect(
      audioPlanOf('effect_ui', AUDIO_TEMPLATES.effect_ui!, undefined, 'sfx_ui_click').targetLufs,
    ).toBe(-20);
  });

  it('reads variants and the momentary target of an effect, and the loop range of a bed', () => {
    const sfx = audioPlanOf(
      'effect_combat',
      AUDIO_TEMPLATES.effect_combat!,
      lib.expected.get('sfx_hit_slash_flesh')?.extra,
    );
    expect(sfx).toMatchObject({
      kind: 'sfx',
      group: 'combat',
      channels: 1,
      loop: false,
      measure: 'M',
      targetLufs: -14,
      truePeakMax: -1,
      variants: 4,
      maxDurationSec: 3,
    });
    const bed = audioPlanOf(
      'ambience_bed',
      AUDIO_TEMPLATES.ambience_bed!,
      lib.expected.get('amb_town_day')?.extra,
    );
    expect(bed).toMatchObject({
      kind: 'ambience',
      loop: true,
      measure: 'I',
      targetLufs: -26,
      truePeakMax: -3,
      loopRange: [60, 120],
      loopSec: 90,
    });
    expect(
      parseExtra({ zh: '每个变体时长约 0.4 秒；在同一个文件里依次给出 6 个变体' }).variants,
    ).toBe(6);
  });
});

describe('processing on decoded PCM', () => {
  it('splits effect variants, trims the attack into the first 10 ms, and normalises under the ceiling', () => {
    const plan = audioPlanOf('effect_combat', AUDIO_TEMPLATES.effect_combat!, {
      zh: '在同一个文件里依次给出 4 个变体',
    });
    const res = processAudio([bursts(4, 0.5, 1)], FS, plan);
    expect(res.problems).toEqual([]);
    expect(res.outputs.map((o) => o.suffix)).toEqual(['_01', '_02', '_03', '_04']);
    for (const o of res.outputs) {
      const c = o.pcm[0]!;
      let first = 0;
      while (first < c.length && Math.abs(c[first]!) < 0.01) first++;
      expect(first).toBeLessThan(FS * 0.01);
      expect(lengthOf(o.pcm) / FS).toBeLessThan(plan.maxDurationSec!);
    }
    expect(Math.abs(res.lufs! - plan.targetLufs)).toBeLessThanOrEqual(1);
    expect(res.truePeak!).toBeLessThanOrEqual(plan.truePeakMax);
  });

  it('a variant count that disagrees with the entry is format', () => {
    const plan = audioPlanOf('effect_combat', AUDIO_TEMPLATES.effect_combat!, {
      zh: '在同一个文件里依次给出 4 个变体',
    });
    expect(processAudio([bursts(3, 0.5, 1)], FS, plan).problems.map((p) => p.check)).toContain(
      'variants',
    );
  });

  it('cuts a music loop on the tempo grid and bakes a seamless wrap', () => {
    const plan = audioPlanOf('music_loop', AUDIO_TEMPLATES.music_loop!, {
      zh: '速度 120 BPM，4/4 拍；循环体 4 小节，约 8 秒；分层 3',
    });
    // Half a second of silence before the music: the cut starts at the music's first sample.
    const [l, r] = music(12, 120);
    const pad = (c: Float32Array) => {
      const out = new Float32Array(c.length + FS / 2);
      out.set(c, FS / 2);
      return out;
    };
    const res = processAudio([pad(l!), pad(r!)], FS, plan);
    const cut = res.processing.loopCut as { start: number; length: number };
    expect(Math.abs(cut.start - FS / 2)).toBeLessThanOrEqual(Math.round(FS * 0.002) + 1);
    expect(cut.length).toBe(8 * FS);
    expect([res.loopStart, res.loopEnd]).toEqual([0, 8 * FS]);
    expect(res.outputs[0]!.pcm[0]!.length).toBe(8 * FS);
    expect(res.problems).toEqual([]);
    const seam = seamOf(res.outputs[0]!.pcm, FS);
    expect(seam.levelStepDb).toBeLessThan(3);
    expect(Math.abs(res.lufs! - -18)).toBeLessThanOrEqual(1);
    expect(res.processing.stems).toMatch(/processed as one layer/);
  });

  it('a loop with no stated body takes the longest body the source allows', () => {
    const plan = audioPlanOf('effect_loop', AUDIO_TEMPLATES.effect_loop!);
    for (const seed of [1, 2, 3, 4, 5]) {
      const rnd = lcg(seed);
      const x = new Float32Array(FS * 7);
      for (let i = 0; i < x.length; i++) x[i] = (rnd() * 2 - 1) * 0.2;
      const res = processAudio([x], FS, plan);
      expect(
        res.problems.filter((p) => p.check === 'loop_points'),
        `seed ${seed}`,
      ).toEqual([]);
      expect(res.loopEnd).toBeGreaterThan(FS * 6);
    }
  });

  it('a single effect with a pause inside stays one sound', () => {
    const plan = audioPlanOf('effect_door', AUDIO_TEMPLATES.effect_door!);
    const res = processAudio([toneBursts(2, 0.5, 1), toneBursts(2, 0.5, 1)], FS, plan);
    expect(res.outputs.map((o) => o.suffix)).toEqual(['']);
    expect(res.outputs[0]!.pcm[0]!.length / FS).toBeGreaterThan(1.9);
  });

  it('a transient hit reaches its target through the true-peak limiter', () => {
    const plan = audioPlanOf('effect_combat', AUDIO_TEMPLATES.effect_combat!);
    const hit = new Float32Array(FS);
    const rnd = lcg(21);
    for (let i = 0; i < FS * 0.4; i++)
      hit[i] = (rnd() * 2 - 1) * 0.8 * Math.exp((-12 * i) / (FS * 0.4));
    const res = processAudio([hit], FS, plan);
    expect(res.problems).toEqual([]);
    expect(Math.abs(res.lufs! - -14)).toBeLessThanOrEqual(1);
    expect(res.truePeak!).toBeLessThanOrEqual(-1);
    expect((res.processing.loudness as { limiterDb: number }).limiterDb).toBeGreaterThan(0);
  });

  it('a source shorter than its loop body is reported as seam', () => {
    const plan = audioPlanOf('music_loop', AUDIO_TEMPLATES.music_loop!, {
      zh: '速度 120 BPM，4/4 拍；循环体 4 小节',
    });
    expect(
      processAudio(music(7, 120), FS, plan).problems.map((p) => [p.code, p.check]),
    ).toContainEqual(['seam', 'loop_points']);
  });

  it('a click over near silence would need crushing limits: loudness', () => {
    const plan = audioPlanOf('music_cue', AUDIO_TEMPLATES.music_cue!);
    const x = sine(220, 0.001, 6);
    x[FS] = 0.9;
    const res = processAudio([x, x.slice()], FS, plan);
    expect(res.problems.find((p) => p.check === 'limiting')?.code).toBe('loudness');
  });
});

describe('assets:check rules for processed audio', () => {
  const loopPlan = audioPlanOf('music_loop', AUDIO_TEMPLATES.music_loop!, {
    zh: '速度 120 BPM，4/4 拍；循环体 4 小节',
  });
  const good = (): AudioMeta => ({
    ...newAudioMeta(
      'mus_x',
      loopPlan,
      { file: 'audio/music/mus_x.ogg', sha256: 'a'.repeat(64) },
      'none',
    ),
    files: ['processed/audio/music/mus_x.ogg'],
    loopStart: 0,
    loopEnd: 8 * FS,
    lufs: -18.2,
    truePeak: -2,
  });
  const header = (over: Partial<Parameters<typeof buildOggSkeleton>[0]> = {}) => [
    {
      file: 'processed/audio/music/mus_x.ogg',
      info: parseOgg(
        buildOggSkeleton({
          sampleRate: FS,
          channels: 2,
          totalSamples: 8 * FS,
          comments: { LOOPSTART: '0', LOOPLENGTH: String(8 * FS) },
          ...over,
        }),
      ),
    },
  ];

  it('passes a conforming loop', () => {
    expect(checkAudio(good(), header(), loopPlan)).toEqual([]);
  });

  it('reports loudness, true peak, loop points, sample rate and channels', () => {
    const at = (meta: AudioMeta, h = header()) =>
      checkAudio(meta, h, loopPlan).map((p) => `${p.code}:${p.check}`);
    expect(at({ ...good(), lufs: -11 })).toEqual(['loudness:loudness']);
    expect(at({ ...good(), truePeak: -0.4 })).toEqual(['loudness:true_peak']);
    expect(at({ ...good(), loopStart: null, loopEnd: null })).toEqual(['seam:loop_points']);
    expect(
      at(good(), header({ comments: { LOOPSTART: '10', LOOPLENGTH: String(8 * FS) } })),
    ).toEqual(['seam:loop_points']);
    expect(
      at(
        { ...good(), loopEnd: 9 * FS },
        header({ comments: { LOOPSTART: '0', LOOPLENGTH: String(9 * FS) } }),
      ),
    ).toContain('seam:loop_points');
    expect(at(good(), header({ sampleRate: 44100 }))).toContain('format:sample_rate');
    expect(at(good(), header({ channels: 1 }))).toContain('format:channels');
  });
});

describe('assets:check on a bad audio sample (command line)', { timeout: 60_000 }, () => {
  const root = join(mkdtempSync(join(tmpdir(), 'hk-audio-')), 'assets');
  afterAll(() => rmSync(join(root, '..'), { recursive: true, force: true }));

  it('names the loudness, true-peak and loop-point problems', async () => {
    const entry = lib.expected.get('mus_town_borderstone_day')!;
    const original = buildOggSkeleton({ sampleRate: FS, channels: 2, totalSamples: 110 * FS });
    const write = (rel: string, data: Uint8Array | string) => {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), data);
    };
    const tool: ToolRecord = {
      id: 'xj_audio',
      name: '小九 AI 音频',
      usedVersions: ['v1'],
      termsUrl: 'https://example.invalid/terms',
      termsCheckedAt: '2026-11-10',
      commercialUse: true,
      outputRights: '归用户',
      aigcLabel: 'Vorbis 注释',
      kind: 'audio',
    };
    write('tools.json', `${JSON.stringify([tool], null, 2)}\n`);
    write(entry.file, original);
    const { createHash } = await import('node:crypto');
    const rec: ManifestRecord = {
      id: entry.id,
      kind: 'audio',
      file: entry.file,
      template: entry.template,
      style: entry.style ?? '',
      promptHash: entry.promptHash,
      promptLang: 'zh',
      tool: 'xj_audio',
      toolVersion: 'v1',
      seed: '',
      refs: [],
      generatedAt: '2026-11-20',
      sha256: createHash('sha256').update(original).digest('hex'),
      aigcLabel: 'none',
      converted: false,
      status: 'review',
      reason: '',
      reviewer: '',
      reviewedAt: '',
      milestone: entry.milestone,
      notes: '',
    };
    write('manifest.json', manifestJson([rec]));
    const plan = audioPlanOf(entry.template, AUDIO_TEMPLATES[entry.template]!, entry.extra);
    const loopLen = Math.round(plan.loopSec! * FS);
    const processed = processedPathOf(entry.file);
    write(
      processed,
      buildOggSkeleton({
        sampleRate: FS,
        channels: 2,
        totalSamples: loopLen,
        comments: { LOOPSTART: '0', LOOPLENGTH: String(loopLen - 100) },
      }),
    );
    const meta: AudioMeta = {
      ...newAudioMeta(entry.id, plan, { file: entry.file, sha256: rec.sha256 }, 'none'),
      files: [processed],
      loopStart: 0,
      loopEnd: loopLen,
      lufs: -12.5,
      truePeak: -0.2,
    };
    write(metaPathOf(entry.file), jsonText(meta));
    const lines: string[] = [];
    const log: Logger = { log: (l) => lines.push(l), error: (l) => lines.push(l) };
    expect(await runCheck(['--root', root, '--prompts', PROMPTS, '--mark'], log)).toBe(1);
    const out = lines.join('\n');
    expect(out).toMatch(
      /fail \[loudness\] mus_town_borderstone_day: integrated loudness -12.5 LUFS, target -18 LUFS/,
    );
    expect(out).toMatch(
      /fail \[loudness\] mus_town_borderstone_day: true peak -0.20 dBTP over the -1.5 dBTP ceiling/,
    );
    expect(out).toMatch(/fail \[seam\] mus_town_borderstone_day: .*LOOPSTART \/ LOOPLENGTH/);
    const after = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as ManifestRecord[];
    expect(after[0]).toMatchObject({ status: 'rework', reason: 'loudness,seam' });
  });
});

describe.skipIf(!ffmpegPath())(
  'the audio branch end to end with ffmpeg',
  { timeout: 240_000 },
  () => {
    const root = join(mkdtempSync(join(tmpdir(), 'hk-audio-ff-')), 'assets');
    beforeAll(() => {
      const tool: ToolRecord = {
        id: 'xj_audio',
        name: '小九 AI 音频',
        usedVersions: ['v1'],
        termsUrl: 'https://example.invalid/terms',
        termsCheckedAt: '2026-11-10',
        commercialUse: true,
        outputRights: '归用户',
        aigcLabel: 'Vorbis 注释',
        kind: 'audio',
      };
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, 'tools.json'), `${JSON.stringify([tool], null, 2)}\n`);
      writeFileSync(join(root, 'manifest.json'), '[]\n');
    });
    afterAll(() => rmSync(join(root, '..'), { recursive: true, force: true }));

    it('registers, imports (split, normalise, encode, re-measure) and passes the check, deterministically', async () => {
      const entry = lib.expected.get('sfx_hit_slash_flesh')!;
      mkdirSync(dirname(join(root, entry.file)), { recursive: true });
      encodeOgg([toneBursts(4, 0.6, 1)], FS, join(root, entry.file), 8, {
        AIGC: '{"Label":"1","ProduceID":"a-7"}',
      });
      const lines: string[] = [];
      const log: Logger = { log: (l) => lines.push(l), error: (l) => lines.push(l) };
      const base = ['--root', root, '--prompts', PROMPTS, '--no-contact', '--yes'];
      expect(
        await runRegister(
          [...base, '--tool', 'xj_audio', '--tool-version', 'v1', '--date', '2026-11-20'],
          log,
        ),
      ).toBe(0);
      const reg = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as ManifestRecord[];
      expect(reg[0]!.aigcLabel).toBe('AIGC={"Label":"1","ProduceID":"a-7"}');
      expect(await runImport(base, log)).toBe(0);
      const meta = JSON.parse(
        readFileSync(join(root, metaPathOf(entry.file)), 'utf8'),
      ) as AudioMeta;
      expect(meta.files).toHaveLength(4);
      expect(meta).toMatchObject({
        kind: 'sfx',
        bus: 'sfx',
        group: 'combat',
        channels: 'mono',
        variants: 4,
        loop: false,
      });
      expect(Math.abs(meta.lufs! - -14)).toBeLessThanOrEqual(1);
      expect(meta.truePeak!).toBeLessThanOrEqual(-1 + 0.05);
      const first = parseOgg(new Uint8Array(readFileSync(join(root, meta.files[0]!))));
      expect(first).toMatchObject({ sampleRate: 48000, channels: 1 });
      expect(first.comments.AIGC).toEqual(['{"Label":"1","ProduceID":"a-7"}']);
      expect(await runCheck([...base, '--measure'], log)).toBe(0);
      const bytes = readFileSync(join(root, meta.files[0]!));
      expect(await runImport([...base, '--all'], log)).toBe(0);
      expect(readFileSync(join(root, meta.files[0]!)).equals(bytes)).toBe(true);
      const l = measureLoudness([sine(997, dbAmp(-20), 1)], FS);
      expect(loudnessFor(l, 'M')).toBeCloseTo(-23, 0);
    });

    it('joins a folder of single-variant segments into one original with 1 s gaps (9.2)', async () => {
      const entry = lib.expected.get('sfx_hit_slash_leather')!;
      const dir = entry.file.replace(/\.ogg$/, '');
      mkdirSync(join(root, dir), { recursive: true });
      for (const k of [1, 2, 3])
        encodeOgg([toneBursts(1, 0.5, 0)], FS, join(root, dir, `part_${k}.ogg`), 8, {});
      const lines: string[] = [];
      const log: Logger = { log: (l) => lines.push(l), error: (l) => lines.push(l) };
      const base = ['--root', root, '--prompts', PROMPTS, '--no-contact', '--yes'];
      expect(
        await runRegister(
          [...base, '--tool', 'xj_audio', '--tool-version', 'v1', '--date', '2026-11-20'],
          log,
        ),
      ).toBe(0);
      expect(lines.join('\n')).toMatch(/joined 3 segment\(s\)/);
      const info = parseOgg(new Uint8Array(readFileSync(join(root, entry.file))));
      expect(info.comments.HAKONIWA_SEGMENTS).toEqual(['part_1.ogg,part_2.ogg,part_3.ogg']);
      expect(info.durationSec).toBeCloseTo(3 * 0.8 + 2, 1);
      const reg = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as ManifestRecord[];
      expect(reg.map((r) => r.id)).toContain('sfx_hit_slash_leather');
    });
  },
);

describe('audio event table data/audio/cues.json', () => {
  const table = JSON.parse(
    readFileSync(join(__dirname, '..', 'data', 'audio', 'cues.json'), 'utf8'),
  ) as CueTable;
  const known = new Set([...lib.expected.keys()].filter((id) => /^(sfx|mus|amb)_/.test(id)));

  it('is valid and every reachable sound id is a prompt-library entry', () => {
    expect(validateCueTable(table, known)).toEqual([]);
    const all = table.cues.flatMap((c) => soundsOf(c, table.fields));
    expect(all.length).toBeGreaterThan(150);
  });

  it('covers the 7.16 selection rules: hit by damage type and material, crit layer, player priority', () => {
    const hits = resolveCues(table, {
      event: 'combat.damage',
      fields: {
        attack: 'melee',
        outcome: 'crit',
        damage: 'slash',
        material: 'plate',
        tick: false,
        involvesPlayer: true,
      },
    });
    expect(hits.map((h) => [h.cue, h.sound, h.priority])).toEqual([
      ['melee_hit', 'sfx_hit_slash_plate', 1],
      ['crit_physical', 'sfx_feel_crit_physical', 1],
    ]);
    const other = resolveCues(table, {
      event: 'combat.damage',
      fields: {
        attack: 'melee',
        outcome: 'hit',
        damage: 'blunt',
        material: 'bone',
        tick: false,
        involvesPlayer: false,
      },
    });
    expect(other.map((h) => [h.sound, h.priority])).toEqual([['sfx_hit_blunt_bone', 3]]);
    const tick = resolveCues(table, {
      event: 'combat.damage',
      fields: { attack: 'spell', outcome: 'hit', tick: true, dot: 'burn', school: 'fire' },
    });
    expect(tick.map((h) => h.sound)).toEqual(['sfx_st_burn_tick']);
    const aggro = resolveCues(table, { event: 'combat.aggro', fields: {} });
    expect(aggro[0]).toMatchObject({
      sound: 'sfx_mon_aggro',
      caption: 'audio.cap.sfx_mon_aggro',
      captionLevel: 'important',
      priority: 2,
    });
    const block = resolveCues(table, {
      event: 'combat.damage',
      fields: { outcome: 'block', attack: 'melee' },
    });
    expect(block.map((h) => h.sound)).toEqual(['sfx_def_block_wood']);
    const lvl = resolveCues(table, { event: 'player.level_up', fields: {} });
    expect(lvl[0]).toMatchObject({ bus: 'music', stinger: true, sound: 'mus_stg_level_up' });
  });

  it('validation catches undeclared fields, values outside a domain, bad captions and missing sounds', () => {
    const bad = {
      version: 1,
      fields: { outcome: ['hit'] },
      cues: [
        {
          id: 'a',
          event: 'combat.damage',
          when: { outcome: 'graze' },
          sound: 'sfx_x',
          bus: 'sfx',
          priority: 1,
        },
        {
          id: 'b',
          event: 'combat.damage',
          when: { color: 'red' },
          sound: 'sfx_x',
          select: { pattern: 'sfx_{a}', vars: {} },
          bus: 'sfx',
          priority: 9,
        },
        {
          id: 'c',
          event: 'nope',
          sound: 'sfx_y',
          bus: 'sfx',
          caption: 'cap.c',
          stinger: true,
          priority: 2,
        },
        {
          id: 'c',
          event: 'a.b',
          sound: 'sfx_zzz_missing',
          bus: 'ui',
          group: 'combat',
          priority: 2,
        },
      ],
    };
    const out = validateCueTable(bad, new Set(['sfx_x', 'sfx_y'])).join('\n');
    for (const re of [
      /outside its domain/,
      /not declared/,
      /exactly one of/,
      /priority must be 0 to 5/,
      /event must look like/,
      /caption must be/,
      /stingers play on the music bus/,
      /duplicate id/,
      /not in the prompt library/,
      /only sfx cues have a group/,
    ]) {
      expect(out).toMatch(re);
    }
  });
});

describe('audio director state machine', () => {
  const town = {
    mapId: 'borderstone',
    region: 'borderstone',
    music: 'mus_town_borderstone_day',
    musicNight: 'mus_town_borderstone_night',
    ambience: ['amb_town_day'],
    town: true,
  };
  const wilds = {
    mapId: 'forest_edge',
    region: 'borderstone',
    music: 'mus_reg_forest_edge',
    musicNight: null,
    ambience: ['amb_forest_day'],
    town: false,
  };
  const far = {
    mapId: 'ash_waste',
    region: 'ash_waste',
    music: 'mus_reg_ash_outer',
    musicNight: null,
    ambience: [],
    town: false,
  };
  const base = (over: Partial<DirectorInput> = {}): DirectorInput => ({
    nowMs: 0,
    location: town,
    night: false,
    view: 'personal',
    cutscene: null,
    boss: null,
    combat: { hostiles: [], playerLevel: 10, wave: false },
    divine: null,
    dream: false,
    tension: { aware: false, sediment: 0, wild: false, flag: 0 },
    dialogueOpen: false,
    paused: false,
    combatMusic: true,
    ...over,
  });
  const foe = (over: Partial<Hostile> = {}): Hostile => ({
    level: 10,
    rank: 'normal',
    engaged: true,
    presence: 0,
    ...over,
  });

  it('picks combat tiers by 5.4', () => {
    expect(combatTierOf([foe({ level: 6 })], 10, false)).toBe('T0');
    expect(combatTierOf([foe({ level: 6 }), foe({ level: 6 })], 10, false)).toBe('T1');
    expect(combatTierOf([foe({ level: 9 })], 10, false)).toBe('T1');
    expect(combatTierOf([foe({ rank: 'elite' })], 10, false)).toBe('T2');
    expect(combatTierOf([foe({ presence: 1 })], 10, false)).toBe('T3');
    expect(combatTierOf([foe()], 10, true)).toBe('wave');
    expect(combatTierOf([foe({ engaged: false })], 10, false)).toBeNull();
  });

  it('follows the context priority of 5.1', () => {
    const d = new AudioDirector();
    expect(d.update(base()).music.id).toBe('mus_town_borderstone_day');
    expect(d.update(base({ dream: true })).context).toBe('dream');
    expect(d.update(base({ dream: true, divine: { music: 'mus_god_eluen' } })).context).toBe(
      'divine',
    );
    expect(
      d.update(
        base({
          divine: { music: 'mus_god_eluen' },
          combat: { hostiles: [foe(), foe()], playerLevel: 10, wave: false },
        }),
      ).context,
    ).toBe('combat');
    expect(
      d.update(
        base({
          boss: { music: 'mus_boss_raven' },
          combat: { hostiles: [foe()], playerLevel: 10, wave: false },
        }),
      ).context,
    ).toBe('boss');
    expect(
      d.update(
        base({
          cutscene: { music: 'mus_cue_x', silence: false },
          boss: { music: 'mus_boss_raven' },
        }),
      ).context,
    ).toBe('cutscene');
    const v = new AudioDirector();
    expect(v.update(base({ view: 'city' })).music.id).toBe('mus_city_build');
  });

  it('only raises the combat tier and leaves combat 4 s after the last engaged hostile', () => {
    const d = new AudioDirector();
    d.update(base());
    let out = d.update(
      base({
        nowMs: 100,
        combat: { hostiles: [foe({ rank: 'elite' })], playerLevel: 10, wave: false },
      }),
    );
    expect([out.combatTier, out.music.id, out.transition?.kind]).toEqual([
      'T2',
      COMBAT_TRACKS.T2,
      'cut_in',
    ]);
    out = d.update(
      base({ nowMs: 200, combat: { hostiles: [foe(), foe()], playerLevel: 10, wave: false } }),
    );
    expect(out.combatTier).toBe('T2');
    out = d.update(
      base({
        nowMs: 300,
        combat: { hostiles: [foe({ presence: 1 })], playerLevel: 10, wave: false },
      }),
    );
    expect([out.combatTier, out.transition]).toEqual([
      'T3',
      { kind: 'crossfade', ms: 1500, align: 'beat' },
    ]);
    out = d.update(base({ nowMs: 4200 }));
    expect(out.context).toBe('combat');
    out = d.update(base({ nowMs: 4300 }));
    expect([out.context, out.combatTier, out.transition?.kind]).toEqual([
      'location',
      null,
      'phrase_return',
    ]);
  });

  it('keeps the location track for small fights with percussion up 2 dB', () => {
    const d = new AudioDirector();
    const out = d.update(
      base({ combat: { hostiles: [foe({ level: 5 })], playerLevel: 10, wave: false } }),
    );
    expect([out.context, out.combatTier, out.music.layers[1]]).toEqual(['location', 'T0', 2]);
  });

  it('recomputes tension every 2 s and maps it to layers (5.5, 5.6)', () => {
    expect(locationLayers(0, false).layers).toEqual([0, 0, Number.NEGATIVE_INFINITY]);
    expect(locationLayers(1, false).layers).toEqual([0, 0, 0]);
    expect(locationLayers(2, true)).toEqual({
      layers: [0, Number.NEGATIVE_INFINITY, -4],
      lowpassHz: 8000,
    });
    const d = new AudioDirector();
    expect(d.update(base({ location: wilds })).tension).toBe(0);
    const tense = { aware: true, sediment: 3, wild: true, flag: 0 as const };
    expect(d.update(base({ nowMs: 1000, location: wilds, tension: tense })).tension).toBe(0);
    const out = d.update(base({ nowMs: 2000, location: wilds, tension: tense }));
    expect(out.tension).toBe(2);
    expect(out.ambience).toContain('amb_dian_low');
    const t = new AudioDirector();
    expect(
      t.update(base({ tension: { aware: true, sediment: 3, wild: false, flag: 1 } })).music.id,
    ).toBe('mus_cue_intrigue');
  });

  it('chooses the 5.3 transitions', () => {
    const d = new AudioDirector();
    d.update(base({ location: wilds }));
    expect(
      d.update(base({ location: { ...wilds, mapId: 'forest_deep', music: 'mus_reg_forest_deep' } }))
        .transition,
    ).toEqual({ kind: 'crossfade', ms: 3000, align: 'bar' });
    expect(d.update(base({ location: far })).transition).toEqual({
      kind: 'fade_gap',
      ms: 5000,
      align: 'none',
      gapMs: 1000,
    });
    const n = new AudioDirector();
    n.update(base());
    // Day and night versions: the night track starts where the day track is (aligned).
    expect(n.update(base({ night: true })).transition).toEqual({
      kind: 'crossfade',
      ms: 8000,
      align: 'bar',
      aligned: true,
    });
    const b = new AudioDirector();
    b.update(base());
    expect(b.update(base({ boss: { music: 'mus_boss_raven' } })).transition?.kind).toBe(
      'after_roar',
    );
    expect(b.update(base({ bossVictory: true })).transition).toMatchObject({
      kind: 'victory',
      stinger: 'mus_stg_victory',
    });
  });

  it('raises the ducks of 8.2', () => {
    const d = new AudioDirector();
    expect(d.update(base({ dialogueOpen: true, paused: true })).ducks).toEqual([
      'dialogue',
      'pause',
    ]);
    expect(d.update(base({ cutscene: { music: null, silence: true } }))).toMatchObject({
      ducks: ['scripted_silence'],
      music: { id: null },
    });
    expect(
      d.update(
        base({
          combat: {
            hostiles: [foe({ engaged: false, presence: 1 })],
            playerLevel: 10,
            wave: false,
          },
        }),
      ),
    ).toMatchObject({
      // One presence step outside a fight thins the track to L1 (5.5); no bus duck yet.
      ducks: [],
      music: { layers: [0, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY] },
    });
    const two = { hostiles: [foe({ engaged: false, presence: 2 })], playerLevel: 10, wave: false };
    expect(d.update(base({ combat: two })).ducks).toEqual(['presence']);
    // A goddess on screen: her theme plays undimmed, the world is lowered.
    const g = d.update(base({ divine: { music: 'mus_god_eluen' } }));
    expect([g.context, g.ducks]).toEqual(['divine', ['oracle_theme']]);
  });

  it('ends the fight when the boss falls: victory phrase, then the location track', () => {
    const d = new AudioDirector();
    d.update(base());
    const fight = { hostiles: [foe({ rank: 'boss' })], playerLevel: 10, wave: false };
    d.update(base({ nowMs: 100, boss: { music: 'mus_boss_raven' }, combat: fight }));
    const out = d.update(
      base({
        nowMs: 200,
        bossVictory: true,
        combat: { hostiles: [], playerLevel: 10, wave: false },
      }),
    );
    expect([out.context, out.combatTier, out.music.id]).toEqual([
      'location',
      null,
      'mus_town_borderstone_day',
    ]);
    expect(out.transition).toMatchObject({ kind: 'victory', stinger: 'mus_stg_victory' });
  });

  it('keeps the battlefield track through fighting and opens its percussion', () => {
    const d = new AudioDirector();
    const calm = d.update(base({ view: 'battlefield' }));
    expect([calm.context, calm.music.layers[1]]).toEqual(['battlefield', Number.NEGATIVE_INFINITY]);
    const fighting = d.update(
      base({
        view: 'battlefield',
        combat: { hostiles: [foe(), foe()], playerLevel: 10, wave: false },
      }),
    );
    expect([fighting.context, fighting.music.id, fighting.music.layers[1]]).toEqual([
      'battlefield',
      'mus_rts_skirmish',
      0,
    ]);
  });

  it('keeps the low dian bed at tension 3 in the wild', () => {
    const d = new AudioDirector();
    const out = d.update(
      base({
        location: wilds,
        tension: { aware: true, sediment: 3, wild: true, flag: 0 },
        night: true,
      }),
    );
    expect(out.tension).toBe(3);
    expect(out.ambience).toContain('amb_dian_low');
  });
});

describe('bus model', () => {
  it('maps sliders on the 10.3 curve with the default volumes', () => {
    expect(sliderToDb(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(sliderToDb(1)).toBeCloseTo(-50, 6);
    expect(sliderToDb(100)).toBe(0);
    expect(defaultMixSettings().volumes).toEqual({
      master: 100,
      music: 70,
      ambience: 80,
      sfx: 90,
      ui: 70,
    });
  });

  it('applies the deepest duck per bus, filters, background lowering and the world pause', () => {
    const s = {
      ...defaultMixSettings(),
      volumes: { master: 100, music: 100, ambience: 100, sfx: 100, ui: 100 },
    };
    const mix = mixBuses(s, ['dialogue', 'stinger', 'pause']);
    expect(mix.music).toMatchObject({ db: -6, lowpassHz: 800 });
    expect(mix.ambience.db).toBe(-9);
    expect(mix.sfx.paused).toBe(true);
    expect(mix.ui.db).toBe(0);
    expect(mixBuses({ ...s, focused: false }, []).master.db).toBe(-12);
    expect(mixBuses({ ...s, focused: false, background: 'mute' }, []).master.db).toBe(
      Number.NEGATIVE_INFINITY,
    );
    expect(mixBuses(s, ['scripted_silence']).music.db).toBe(Number.NEGATIVE_INFINITY);
    // The cutscene lowers world sounds, never its own group.
    const cut = mixBuses(s, ['cutscene']);
    expect([cut.sfx.db, cut.sfx.groupDb]).toEqual([0, { world: -12 }]);
    expect(effectiveDb(cut, 'sfx', 'world')).toBe(-12);
    expect(effectiveDb(cut, 'sfx', 'cine')).toBe(0);
    expect(mixBuses(s, ['oracle_theme']).music.db).toBe(0);
  });
});
