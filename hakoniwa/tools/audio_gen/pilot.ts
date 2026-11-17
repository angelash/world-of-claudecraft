// PT-07 audio pilot on the local ComfyUI (PK-M0-11 audio part): one music cue, one
// combat effect and one ambience bed, each generated locally so they can be compared
// by ear before the generation route in D-080 is settled.
//
//   node ../node_modules/tsx/dist/cli.mjs tools/audio_gen/pilot.ts [--only music|sfx|amb]
//
// Music (mus_town_borderstone_day), all at -18 LUFS:
//   A  the score rendered directly with a General MIDI SoundFont (exact loop and stems)
//   B  ACE-Step cover of that render from noise (semantic hints only), two seeds
//   C  ACE-Step cover starting from the render at denoise 0.7 and 0.55
//   D  ACE-Step text to music from the prompt library entry alone, two seeds
// Effects (sfx_hit_slash_flesh): eight Stable Audio 3 Small-SFX takes, trimmed to the hit.
// Ambience (amb_town_day): two 120-second beds cut to a 90-second loop at the quietest seam.
//
// Prompts come from the prompt library (assets/prompts/specs/*.json and
// templates_audio.json), so the pilot exercises the same entries a production batch uses.
// Output: .local/audio_pilot/listen/ (numbered files, README.md, records.json).

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aceCoverGraph,
  aceText2MusicGraph,
  type JobResult,
  MODELS,
  runGraph,
  type SfxSettings,
  stableAudioGraph,
  stageInput,
} from './comfy';
import { measureLoudness, normalizeLoudness } from './ffmpeg';
import { crossfadeLoop, cutLoopFromDoubleRender, findQuietSeam } from './loops';
import { renderScore } from './render_score';
import { loopSeconds } from './score';
import { SCORES } from './scores';
import { loadTake, pairToStereo, trimHit } from './takes';
import { frameCount, type PcmAudio, readWav, writeWav } from './wav';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PILOT = join(ROOT, '.local', 'audio_pilot');
const LISTEN = join(PILOT, 'listen');
const WORK = join(PILOT, 'work');
const RATE = 48000;
const MANIFEST = 'E:/AI/deployment/20261117/audio-models/model-download-manifest.json';

interface Bilingual {
  zh: string;
  en: string;
}
interface SpecItem {
  id: string;
  template: string;
  style: string;
  subject: Bilingual;
  extra?: Bilingual;
}

function specItem(file: string, id: string): SpecItem {
  const spec = JSON.parse(readFileSync(join(ROOT, 'assets', 'prompts', 'specs', file), 'utf8')) as {
    items: SpecItem[];
  };
  const item = spec.items.find((i) => i.id === id);
  if (!item) throw new Error(`${id} not in ${file}`);
  return item;
}

const TEMPLATES = JSON.parse(
  readFileSync(join(ROOT, 'assets', 'prompts', 'templates_audio.json'), 'utf8'),
) as {
  negative: Bilingual;
  styles: Record<string, { en: string }>;
};

function styleEn(item: SpecItem): string {
  const style = TEMPLATES.styles[item.style];
  if (!style) throw new Error(`Unknown style ${item.style}`);
  return style.en;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function modelHashes(): Record<string, string> {
  if (!existsSync(MANIFEST)) return {};
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
    files: Array<{ filename: string; sha256: string }>;
  };
  return Object.fromEntries(manifest.files.map((f) => [f.filename, f.sha256]));
}

interface PilotRecord {
  file: string;
  assetId: string;
  method: string;
  tool: string;
  models: string[];
  seed?: number;
  settings: Record<string, unknown>;
  prompt?: string;
  promptSha256?: string;
  generationSeconds?: number;
  peakGpuMiB?: number;
  loudness?: { lufs: number; truePeak: number };
  note?: string;
}

const records: PilotRecord[] = [];

function finishMusic(
  audio: PcmAudio,
  name: string,
): { path: string; lufs: number; truePeak: number } {
  const raw = join(WORK, `${name}.raw.wav`);
  writeFileSync(raw, writeWav(audio));
  const out = join(LISTEN, `${name}.wav`);
  const reading = normalizeLoudness(raw, out, -18, -1.5);
  return { path: out, lufs: reading.integrated, truePeak: reading.truePeak };
}

function jobFields(job: JobResult): Pick<PilotRecord, 'generationSeconds' | 'peakGpuMiB'> {
  return { generationSeconds: Math.round(job.seconds * 10) / 10, peakGpuMiB: job.peakGpuMiB };
}

async function music(): Promise<void> {
  const score = SCORES.mus_town_borderstone_day;
  const item = specItem('audio_music.json', score.id);
  const caption = [
    styleEn(item),
    item.subject.en,
    `${score.bpm} BPM, ${score.beatsPerBar}/4, ${score.keyscale}`,
    'instrumental, acoustic folk ensemble, warm natural room recording',
  ].join('. ');
  const render = renderScore(score);
  const loopFrames = render.loopFrames;
  const sourceSeconds = frameCount(readWav(readFileSync(render.coverSource))) / RATE;

  // A: the direct render and its stems.
  const stemNames: Record<string, string> = {
    full: '01_music_A_score_render_full',
    L1: '01_music_A_score_render_L1_drone_lute',
    L2: '01_music_A_score_render_L2_drum_pizzicato',
    L3: '01_music_A_score_render_L3_recorder_undercurrent',
  };
  for (const [key, name] of Object.entries(stemNames)) {
    const audio = readWav(readFileSync(render.loops[key]));
    const out = join(LISTEN, `${name}.wav`);
    writeFileSync(out, writeWav(audio));
    const reading = measureLoudness(out);
    records.push({
      file: `${name}.wav`,
      assetId: score.id,
      method:
        key === 'full'
          ? 'score render (full mix)'
          : `score render (stem ${key}, same gain as the mix)`,
      tool: 'FluidSynth 2.6.2 + GeneralUser GS 2.0.3',
      models: [],
      settings: {
        bpm: score.bpm,
        bars: score.bars,
        loopSeconds: loopSeconds(score),
        seamFadeMs: 20,
      },
      loudness: { lufs: reading.integrated, truePeak: reading.truePeak },
    });
  }

  const input = stageInput(render.coverSource);
  const base = {
    caption,
    seconds: Math.round(sourceSeconds * 100) / 100,
    bpm: score.bpm,
    keyscale: score.keyscale,
    timesignature: '4' as const,
  };
  const aceModels = [MODELS.aceDit, MODELS.aceTextEncoder, MODELS.aceLm, MODELS.aceVae];

  const covers: Array<{ name: string; seed: number; denoise: number; label: string }> = [
    {
      name: '02_music_B_cover_from_noise_seed1',
      seed: 1104,
      denoise: 1,
      label: 'cover, semantic hints only',
    },
    {
      name: '03_music_B_cover_from_noise_seed2',
      seed: 2208,
      denoise: 1,
      label: 'cover, semantic hints only',
    },
    {
      name: '04_music_C_cover_from_render_d070',
      seed: 1104,
      denoise: 0.7,
      label: 'cover from the render, denoise 0.7',
    },
    {
      name: '05_music_C_cover_from_render_d055',
      seed: 1104,
      denoise: 0.55,
      label: 'cover from the render, denoise 0.55',
    },
  ];
  for (const c of covers) {
    const job = await runGraph(
      aceCoverGraph(
        { ...base, seed: c.seed, outputPrefix: `hakoniwa_audio_pilot/${c.name}` },
        input,
        c.denoise,
      ),
      join(WORK, c.name),
    );
    const audio = loadTake(job.files[0], 2);
    // The cover keeps the render's timeline, so the same bar grid cuts the loop.
    const loop = cutLoopFromDoubleRender(audio, loopFrames, Math.round(0.05 * RATE), 'power');
    const done = finishMusic(loop, c.name);
    records.push({
      file: `${c.name}.wav`,
      assetId: score.id,
      method: c.label,
      tool: 'ComfyUI 0.34.0, ACE-Step 1.5 turbo',
      models: aceModels,
      seed: c.seed,
      settings: {
        ...base,
        caption: undefined,
        steps: 8,
        cfg: 1,
        sampler: 'euler',
        shift: 3,
        denoise: c.denoise,
        seamFadeMs: 50,
      },
      prompt: caption,
      promptSha256: sha256(caption),
      ...jobFields(job),
      loudness: { lufs: done.lufs, truePeak: done.truePeak },
    });
    console.log(`music ${c.name}: ${job.seconds.toFixed(1)} s, peak ${job.peakGpuMiB} MiB`);
  }

  for (const [name, seed] of [
    ['06_music_D_text_only_seed1', 1104],
    ['07_music_D_text_only_seed2', 2208],
  ] as const) {
    const job = await runGraph(
      aceText2MusicGraph({
        ...base,
        seconds: Math.round(loopSeconds(score) * 100) / 100,
        seed,
        outputPrefix: `hakoniwa_audio_pilot/${name}`,
      }),
      join(WORK, name),
    );
    const done = finishMusic(loadTake(job.files[0], 2), name);
    records.push({
      file: `${name}.wav`,
      assetId: score.id,
      method: 'text to music from the prompt library entry, no loop cut, no stems',
      tool: 'ComfyUI 0.34.0, ACE-Step 1.5 turbo',
      models: aceModels,
      seed,
      settings: {
        bpm: score.bpm,
        keyscale: score.keyscale,
        seconds: loopSeconds(score),
        steps: 8,
        cfg: 1,
        lmCodes: true,
      },
      prompt: caption,
      promptSha256: sha256(caption),
      ...jobFields(job),
      loudness: { lufs: done.lufs, truePeak: done.truePeak },
    });
    console.log(`music ${name}: ${job.seconds.toFixed(1)} s, peak ${job.peakGpuMiB} MiB`);
  }
}

async function sfx(): Promise<void> {
  const item = specItem('audio_sfx.json', 'sfx_hit_slash_flesh');
  // A: the library entry as written. B: the same event rewritten for the model, with the
  // body and low end spelled out, because A's takes came out bright and thin.
  const variants = [
    {
      key: 'A',
      prompt: `${item.subject.en}, ${styleEn(item)}, one single isolated hit, sharp attack in the first milliseconds, short natural decay to silence, no music, no voice. Length: 2 seconds`,
      note: 'prompt library entry as written',
    },
    {
      key: 'B',
      prompt:
        'A heavy blade chopping into raw meat: one dull, wet, meaty thud with a thick low-mid body and a short crunchy crack of bone, close-miked and dry, realistic combat foley, no whoosh, no metallic ring, no music, no voice. Length: 1 seconds',
      note: 'rewritten for the model: body and low end spelled out',
    },
  ];
  for (const variant of variants) {
    const settings: SfxSettings = {
      prompt: variant.prompt,
      negative: TEMPLATES.negative.en,
      seconds: 2,
      batch: 8,
      seed: 70712,
      outputPrefix: `hakoniwa_audio_pilot/sfx_hit_slash_flesh_${variant.key}`,
    };
    const job = await runGraph(
      stableAudioGraph(settings),
      join(WORK, `sfx_hit_slash_flesh_${variant.key}`),
    );
    console.log(
      `sfx ${variant.key}: ${job.files.length} files, ${job.seconds.toFixed(1)} s, peak ${job.peakGpuMiB} MiB`,
    );
    const takes = job.files.map((f) => trimHit(loadTake(f, 1), 0.6));
    const gap = new Float32Array(RATE);
    const parts: Float32Array[] = [];
    takes.forEach((take, i) => {
      const name = `08_sfx_hit_slash_flesh_${variant.key}_take${i + 1}`;
      writeFileSync(join(LISTEN, `${name}.wav`), writeWav(take));
      parts.push(take.samples, gap);
      records.push({
        file: `${name}.wav`,
        assetId: item.id,
        method: 'text to audio, batch take, trimmed to 0.6 s from onset, peak -1.5 dBFS',
        tool: 'ComfyUI 0.34.0, Stable Audio 3 Small-SFX',
        models: [MODELS.sfxCheckpoint, MODELS.sfxTextEncoder],
        seed: settings.seed,
        settings: { seconds: 2, batch: 8, batchIndex: i, steps: 8, cfg: 1, sampler: 'lcm' },
        prompt: variant.prompt,
        promptSha256: sha256(variant.prompt),
        ...jobFields(job),
        note: variant.note,
      });
    });
    const joined = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      joined.set(p, o);
      o += p.length;
    }
    writeFileSync(
      join(LISTEN, `08_sfx_hit_slash_flesh_${variant.key}_all_takes.wav`),
      writeWav({ sampleRate: RATE, channels: 1, samples: joined }),
    );
  }
}

async function ambience(): Promise<void> {
  const item = specItem('audio_ambience.json', 'amb_town_day');
  const prompt = `${item.subject.en}, ${styleEn(item)}, continuous daytime ambience with the same density throughout, no music, no intelligible speech. Length: 120 seconds`;
  // Small-SFX writes two identical channels (measured side level about -52 dB below
  // mid). "mono" keeps one take as is; "wide" puts two different takes of the same
  // prompt on the left and right, the way a spaced pair of microphones would hear a town.
  for (const variant of [
    { name: '09_amb_town_day_mono', seed: 81731, batch: 1 },
    { name: '09_amb_town_day_wide', seed: 92842, batch: 2 },
  ]) {
    const settings: SfxSettings = {
      prompt,
      negative: TEMPLATES.negative.en,
      seconds: 120,
      batch: variant.batch,
      seed: variant.seed,
      outputPrefix: `hakoniwa_audio_pilot/${variant.name}`,
    };
    const job = await runGraph(stableAudioGraph(settings), join(WORK, variant.name));
    const bed =
      variant.batch === 2
        ? pairToStereo(loadTake(job.files[0], 1), loadTake(job.files[1], 1))
        : loadTake(job.files[0], 2);
    const body = 90 * RATE;
    const fade = 2 * RATE;
    const seam = findQuietSeam(
      bed,
      body,
      fade,
      Math.round(0.05 * RATE),
      Math.round(0.25 * RATE),
      2 * RATE,
    );
    const loop = crossfadeLoop(bed, seam.start, body, fade);
    const raw = join(WORK, `${variant.name}.loop.wav`);
    writeFileSync(raw, writeWav(loop));
    const reading = normalizeLoudness(raw, join(LISTEN, `${variant.name}_loop90.wav`), -26, -3, 2);
    records.push({
      file: `${variant.name}_loop90.wav`,
      assetId: item.id,
      method:
        variant.batch === 2
          ? 'two 120 s takes as left and right, 90 s loop at the quietest seam, 2 s equal-power crossfade, -26 LUFS'
          : '120 s take (model output is dual mono), 90 s loop at the quietest seam, 2 s equal-power crossfade, -26 LUFS',
      tool: 'ComfyUI 0.34.0, Stable Audio 3 Small-SFX',
      models: [MODELS.sfxCheckpoint, MODELS.sfxTextEncoder],
      seed: variant.seed,
      settings: {
        seconds: 120,
        batch: variant.batch,
        steps: 8,
        cfg: 1,
        sampler: 'lcm',
        seamStartSeconds: seam.start / RATE,
        seamScore: Number(seam.score.toFixed(2)),
      },
      prompt,
      promptSha256: sha256(prompt),
      ...jobFields(job),
      loudness: { lufs: reading.integrated, truePeak: reading.truePeak },
    });
    console.log(
      `ambience ${variant.name}: ${job.seconds.toFixed(1)} s, peak ${job.peakGpuMiB} MiB, seam at ${(seam.start / RATE).toFixed(2)} s`,
    );
  }
}

/** Listening-set file prefixes per pilot group, used to rerun one group alone. */
const GROUP_PREFIXES: Record<string, string[]> = {
  music: ['01_', '02_', '03_', '04_', '05_', '06_', '07_'],
  sfx: ['08_'],
  amb: ['09_'],
};

const GUIDE = `# 箱庭纪音频试做（PT-07，本机生成）

由 \`tools/audio_gen/pilot.ts\` 生成，生成参数逐条在 \`records.json\`。用能单曲循环的播放器听，
循环接缝才听得出来。

## 音乐：mus_town_borderstone_day（边石镇白天，104 BPM，G 大调，32 小节循环）

01 到 05 都已按小节网格裁成 73.85 秒的循环体，响度统一为 -18 LUFS，可以直接对比。

| 文件 | 做法 | 听什么 |
| --- | --- | --- |
| 01_music_A_score_render_full | 乐谱直出（General MIDI 音色库） | 旋律、和声、结构是否成立；这是后面几版的"骨架" |
| 01_..._L1 / L2 / L3 | 同一乐谱的三层分轨，与整曲同一增益 | L1 单独放能不能成立；L3 的暗流（D 与降 E 每两拍来回）是否太强或太弱 |
| 02、03 | ACE-Step 翻奏，从噪声起，只用乐谱的旋律与结构 | 音色质感；主角动机（第 1、9、25 小节）还认不认得出 |
| 04 | ACE-Step 翻奏，从小样起，改动 0.7 | 介于翻奏与小样之间 |
| 05 | ACE-Step 翻奏，从小样起，改动 0.55 | 最接近小样，音色提升最少 |
| 06、07 | 只用提示词库的条目生成（现计划的做法） | 没有乐谱约束时的效果；没有循环裁切，也没有分层 |

## 音效：sfx_hit_slash_flesh（刃口切入血肉）

两组提示词各 8 个候选，已从起音裁到 0.6 秒，峰值 -1.5 dBFS；\`all_takes\` 把同组 8 个连在一起
（间隔 1 秒），方便连听挑选。

| 组 | 提示词 | 听什么 |
| --- | --- | --- |
| 08_..._A | 提示词库条目原文 | 频谱测得偏亮（能量多在 2 kHz 以上），可能更像"切"而不是"砍进肉里" |
| 08_..._B | 改写版：写明闷响、低中频厚度、骨头脆响，不要风声和金属声 | 是否更接近"湿润的闷响带骨头共鸣"；若 B 明显更好，说明提示词库的音效条目需要按模型习惯改写 |

## 环境声：amb_town_day（小镇白天）

从 120 秒的生成里挑最安静的位置裁成 90 秒循环，接缝 2 秒交叉，响度 -26 LUFS（环境声比音乐低
8 dB，是设计里的混音目标）。

| 文件 | 做法 | 听什么 |
| --- | --- | --- |
| 09_amb_town_day_mono | 一次生成。实测这个模型输出的是左右相同的单声道 | 内容像不像北境小镇白天；整体偏暗（2 kHz 以上能量很少） |
| 09_amb_town_day_wide | 同一提示词的两次生成分别放在左右声道，像两支分开摆的话筒 | 空间感是否明显更好，左右是否"各说各的"而显得不自然 |
`;

async function main(): Promise<void> {
  const only = process.argv.includes('--only')
    ? process.argv[process.argv.indexOf('--only') + 1]
    : null;
  if (only && !GROUP_PREFIXES[only]) throw new Error(`--only takes music, sfx or amb, not ${only}`);
  const recordPath = join(LISTEN, 'records.json');
  if (only && existsSync(recordPath)) {
    // Keep the other groups' records; this run replaces its own group.
    const previous = JSON.parse(readFileSync(recordPath, 'utf8')) as { records: PilotRecord[] };
    const mine = GROUP_PREFIXES[only];
    records.push(...previous.records.filter((r) => !mine.some((p) => r.file.startsWith(p))));
  } else if (!only) {
    rmSync(LISTEN, { recursive: true, force: true });
  }
  mkdirSync(LISTEN, { recursive: true });
  mkdirSync(WORK, { recursive: true });
  if (!only || only === 'music') await music();
  if (!only || only === 'sfx') await sfx();
  if (!only || only === 'amb') await ambience();
  records.sort((a, b) => a.file.localeCompare(b.file));
  writeFileSync(
    recordPath,
    `${JSON.stringify({ generatedOn: new Date().toISOString(), modelSha256: modelHashes(), records }, null, 2)}\n`,
  );
  writeFileSync(join(LISTEN, 'README.md'), GUIDE);
  console.log(`wrote ${records.length} records to ${recordPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
