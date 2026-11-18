// Full audio generation into the candidate pool (assets/README.md 3.4): every audio entry of
// the prompt library gets takes in assets/_candidates/audio/<id>/ for review in the editor's
// review desk. Resumable: finished ids are skipped, state in .local/audio_batch/state.json.
//
//   node ../node_modules/tsx/dist/cli.mjs tools/audio_gen/batch.ts
//     [--milestone M1] [--kind sfx|ui|ambience|music] [--only id,id] [--limit n]
//     [--dry-run] [--force]
//
// Routes (docs/10_research/open_share/local_audio_generation.md):
//   effects and interface sounds  Stable Audio 3 Small-SFX, 1.5 times the variation count
//                                 (at least 4), each take trimmed to its hit; loops cut to a
//                                 4 to 8 second body at the quietest seam
//   ambience beds                 two 120-second takes as left and right (the model is mono),
//                                 two sets, cut to the loop body at the quietest seam
//   ambience points               like effects
//   music                         ACE-Step 1.5 text to music, two seeds, with the entry's
//                                 tempo, key, meter and length; motif seeds are written as
//                                 scores (scores/motif_seeds.ts) plus one ACE-Step cover
// Order: M1, M2, M3; inside a milestone effects and ambience first (fast), then music.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AudioPlan, audioPlanOf } from '../assets/core/audio/plan';
import type { ManifestRecord } from '../assets/core/manifest';
import { loadLibrary, today } from '../assets/lib';
import type { Candidate, CandidateSet } from '../assets/review/model';
import {
  aceCoverGraph,
  aceDecodeNode,
  aceText2MusicGraph,
  type JobResult,
  MODELS,
  runGraph,
  stableAudioGraph,
  stageInput,
} from './comfy';
import { type LoudnessReading, measureLoudness, normalizeLoudness } from './ffmpeg';
import { crossfadeLoop, findQuietSeam } from './loops';
import { generationSeconds, keyscaleOf, statedSeconds, timeSignatureOf } from './music_params';
import { renderOneShot } from './render_score';
import { hashString } from './score';
import { MOTIF_SEEDS } from './scores/motif_seeds';
import { loadTake, pairToStereo, RATE, trimHit } from './takes';
import { writeWav } from './wav';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS = join(ROOT, 'assets');
const POOL = join(ASSETS, '_candidates', 'audio');
const STATE_DIR = join(ROOT, '.local', 'audio_batch');
const WORK = join(STATE_DIR, 'work');
const STATE_FILE = join(STATE_DIR, 'state.json');
const LOG_FILE = join(STATE_DIR, 'batch.log');
const SOURCE = 'tools/audio_gen/batch.ts';

const ACE_VERSION = 'ACE-Step 1.5 turbo (Comfy-Org/ACE-Step-1.5 371bb168), ComfyUI 0.34.0';
const SFX_VERSION = 'Stable Audio 3 Small-SFX (Comfy-Org/stable-audio-3 75aad883), ComfyUI 0.34.0';
const SCORE_VERSION = 'FluidSynth 2.6.2, GeneralUser GS 2.0.3';

interface Bilingual {
  zh?: string;
  en?: string;
}

interface SpecItem {
  id: string;
  template: string;
  style?: string;
  subject: Bilingual;
  extra?: Bilingual;
}

interface Templates {
  negative: { en: string };
  styles: Record<string, { en: string }>;
  templates: Record<
    string,
    {
      duration?: string | number;
      loop?: boolean;
      channels?: string;
      loudness?: string;
      truePeak?: string;
    }
  >;
}

export interface Job {
  id: string;
  milestone: string;
  template: string;
  plan: AudioPlan;
  subject: string;
  style: string;
  extra: Bilingual;
}

interface BatchState {
  done: Record<string, { at: string; takes: number; seconds: number }>;
  failed: Record<string, { at: string; error: string }>;
}

const KIND_ORDER = { sfx: 0, ui: 0, ambience: 1, music: 2 } as const;

function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback;
}

function log(line: string): void {
  const stamped = `${new Date().toISOString()} ${line}`;
  console.log(stamped);
  mkdirSync(STATE_DIR, { recursive: true });
  appendFileSync(LOG_FILE, `${stamped}\n`);
}

/** Every audio entry of the prompt library as a job, in batch order. */
export function allJobs(): Job[] {
  const promptsDir = join(ASSETS, 'prompts');
  const lib = loadLibrary(promptsDir);
  const t = readJson<Templates>(join(promptsDir, 'templates_audio.json'), {
    negative: { en: '' },
    styles: {},
    templates: {},
  });
  const items = new Map<string, SpecItem>();
  for (const f of ['audio_music.json', 'audio_ambience.json', 'audio_sfx.json']) {
    for (const it of readJson<{ items: SpecItem[] }>(join(promptsDir, 'specs', f), { items: [] })
      .items) {
      items.set(it.id, it);
    }
  }
  const jobs: Job[] = [];
  for (const e of lib.expected.values()) {
    if (e.kind !== 'audio') continue;
    const it = items.get(e.id);
    const tpl = t.templates[e.template];
    if (!it || !tpl) continue;
    jobs.push({
      id: e.id,
      milestone: e.milestone,
      template: e.template,
      plan: audioPlanOf(e.template, tpl, it.extra, e.id),
      subject: it.subject.en ?? '',
      style: (it.style && t.styles[it.style]?.en) || '',
      extra: it.extra ?? {},
    });
  }
  return jobs.sort(
    (a, b) =>
      a.milestone.localeCompare(b.milestone) ||
      KIND_ORDER[a.plan.kind] - KIND_ORDER[b.plan.kind] ||
      a.id.localeCompare(b.id),
  );
}

/** Seconds of one variation ("each variation about 0.6 seconds"), else the stated length. */
export function variationSeconds(job: Job): number {
  const m = /each variation about (\d+(?:\.\d+)?) seconds/i.exec(job.extra.en ?? '');
  if (m) return Number(m[1]);
  return statedSeconds(job.extra) ?? Math.max(1, (job.plan.maxDurationSec ?? 4) / 2);
}

/** How many effect takes to generate: half again the variations, at least 4, at most 10. */
export function takeCount(variants: number): number {
  return Math.min(10, Math.max(4, Math.ceil(variants * 1.5)));
}

function seedOf(id: string, k: number): number {
  return (hashString(id) % 1_000_000_000) + k;
}

function jobFields(job: JobResult): Record<string, number> {
  return { generationSeconds: Math.round(job.seconds * 10) / 10, peakGpuMiB: job.peakGpuMiB };
}

function candidate(
  base: Partial<Candidate> &
    Pick<Candidate, 'key' | 'label' | 'group' | 'method' | 'tool' | 'toolVersion' | 'files'>,
): Candidate {
  return {
    models: [],
    seed: '',
    prompt: '',
    promptLang: 'en',
    generatedAt: today(),
    settings: {},
    metrics: {},
    note: '',
    ...base,
  };
}

function poolPath(id: string, name: string): { abs: string; rel: string } {
  return { abs: join(POOL, id, name), rel: `_candidates/audio/${id}/${name}` };
}

function writeSet(job: Job, candidates: Candidate[]): void {
  const sequence = job.plan.variants > 1 && !job.plan.loop && job.plan.kind !== 'music';
  const set: CandidateSet = {
    assetId: job.id,
    kind: 'audio',
    createdAt: today(),
    source: SOURCE,
    adoptMode: sequence ? 'sequence' : 'single',
    adoptCount: sequence ? job.plan.variants : 0,
    candidates,
  };
  writeFileSync(join(POOL, job.id, 'candidates.json'), `${JSON.stringify(set, null, 2)}\n`);
}

async function effectJob(job: Job): Promise<Candidate[]> {
  const d = variationSeconds(job);
  const count = takeCount(job.plan.variants);
  const seconds = Math.min(20, Math.max(2, Math.round((d * 1.6 + 1) * 10) / 10));
  const prompt = `${job.subject}. ${job.style}. One single isolated sound, clean, close and dry, natural decay to silence, no music, no voice. Length: ${Math.max(1, Math.ceil(d))} seconds`;
  const seed = seedOf(job.id, 1);
  const run = await runGraph(
    stableAudioGraph({
      prompt,
      negative: '',
      seconds,
      batch: count,
      seed,
      outputPrefix: `hakoniwa_audio_batch/${job.id}`,
    }),
    join(WORK, job.id),
  );
  const maxLen = Math.max(d * 1.5, d + 0.3);
  return run.files.map((file, i) => {
    const take = trimHit(loadTake(file, job.plan.channels), maxLen);
    const name = `take_${String(i + 1).padStart(2, '0')}.wav`;
    const p = poolPath(job.id, name);
    writeFileSync(p.abs, writeWav(take));
    return candidate({
      key: `t${i + 1}`,
      label: `第 ${i + 1} 条`,
      group: 'A',
      method: `text to audio, batch of ${count}, trimmed to the hit (at most ${Math.round(maxLen * 100) / 100} s), peak -1.5 dBFS`,
      tool: 'stable_audio_3_small_sfx',
      toolVersion: SFX_VERSION,
      models: [MODELS.sfxCheckpoint, MODELS.sfxTextEncoder],
      seed: `${seed}#${i}`,
      prompt,
      settings: { seconds, batch: count, batchIndex: i, steps: 8, cfg: 1, sampler: 'lcm' },
      metrics: jobFields(run),
      files: [{ role: 'main', label: `t${i + 1}`, path: p.rel }],
    });
  });
}

async function effectLoopJob(job: Job): Promise<Candidate[]> {
  const body = Math.round(Math.min(8, Math.max(4, job.plan.loopSec ?? 6)) * RATE);
  const fade = Math.round(0.2 * RATE);
  const prompt = `${job.subject}. ${job.style}. Continuous steady texture with no distinct start or end and no sudden events, no music, no voice. Length: 14 seconds`;
  const seed = seedOf(job.id, 1);
  const run = await runGraph(
    stableAudioGraph({
      prompt,
      negative: '',
      seconds: 14,
      batch: 3,
      seed,
      outputPrefix: `hakoniwa_audio_batch/${job.id}`,
    }),
    join(WORK, job.id),
  );
  return run.files.map((file, i) => {
    const bed = loadTake(file, job.plan.channels);
    const seam = findQuietSeam(
      bed,
      body,
      fade,
      Math.round(0.05 * RATE),
      Math.round(0.1 * RATE),
      Math.round(0.5 * RATE),
    );
    const raw = join(WORK, job.id, `loop_${i + 1}.wav`);
    writeFileSync(raw, writeWav(crossfadeLoop(bed, seam.start, body, fade)));
    const p = poolPath(job.id, `loop_${String(i + 1).padStart(2, '0')}.wav`);
    const reading = normalizeLoudness(
      raw,
      p.abs,
      job.plan.targetLufs,
      job.plan.truePeakMax,
      job.plan.channels,
    );
    return candidate({
      key: `l${i + 1}`,
      label: `循环第 ${i + 1} 条`,
      group: 'A',
      method: `text to audio, ${body / RATE} s loop body at the quietest seam, 200 ms crossfade, ${job.plan.targetLufs} LUFS`,
      tool: 'stable_audio_3_small_sfx',
      toolVersion: SFX_VERSION,
      models: [MODELS.sfxCheckpoint, MODELS.sfxTextEncoder],
      seed: `${seed}#${i}`,
      prompt,
      settings: { seconds: 14, batch: 3, batchIndex: i, seamStartSeconds: seam.start / RATE },
      metrics: { ...jobFields(run), lufs: reading.integrated, truePeak: reading.truePeak },
      files: [{ role: 'main', label: `l${i + 1}`, path: p.rel }],
    });
  });
}

async function ambienceBedJob(job: Job): Promise<Candidate[]> {
  const bodySec = Math.min(110, Math.max(30, job.plan.loopSec ?? 90));
  const body = Math.round(bodySec * RATE);
  const fade = 2 * RATE;
  const prompt = `${job.subject}. ${job.style}. Continuous ambience with the same density throughout, realistic field recording, no music, no intelligible speech. Length: 120 seconds`;
  const out: Candidate[] = [];
  for (const set of [1, 2]) {
    const seed = seedOf(job.id, set);
    const run = await runGraph(
      stableAudioGraph({
        prompt,
        negative: '',
        seconds: 120,
        batch: 2,
        seed,
        outputPrefix: `hakoniwa_audio_batch/${job.id}_${set}`,
      }),
      join(WORK, job.id, `set${set}`),
    );
    if (run.files.length < 2)
      throw new Error(`ambience set ${set} returned ${run.files.length} takes`);
    const bed = pairToStereo(
      loadTake(run.files[0] as string, 1),
      loadTake(run.files[1] as string, 1),
    );
    const seam = findQuietSeam(
      bed,
      body,
      fade,
      Math.round(0.05 * RATE),
      Math.round(0.25 * RATE),
      2 * RATE,
    );
    const raw = join(WORK, job.id, `bed_${set}.wav`);
    writeFileSync(raw, writeWav(crossfadeLoop(bed, seam.start, body, fade)));
    const p = poolPath(job.id, `bed_${set}.wav`);
    const reading = normalizeLoudness(raw, p.abs, job.plan.targetLufs, job.plan.truePeakMax, 2);
    out.push(
      candidate({
        key: `w${set}`,
        label: `宽立体声第 ${set} 版（两次生成分放左右声道）`,
        group: 'A',
        method: `two 120 s takes as left and right, ${bodySec} s loop body at the quietest seam, 2 s crossfade, ${job.plan.targetLufs} LUFS`,
        tool: 'stable_audio_3_small_sfx',
        toolVersion: SFX_VERSION,
        models: [MODELS.sfxCheckpoint, MODELS.sfxTextEncoder],
        seed: String(seed),
        prompt,
        settings: {
          seconds: 120,
          batch: 2,
          seamStartSeconds: seam.start / RATE,
          seamScore: Math.round(seam.score * 100) / 100,
        },
        metrics: { ...jobFields(run), lufs: reading.integrated, truePeak: reading.truePeak },
        files: [{ role: 'main', label: `w${set}`, path: p.rel }],
      }),
    );
  }
  return out;
}

function musicCaption(job: Job): string {
  return [job.style, job.subject, job.extra.en ?? '', 'instrumental, no lyrics, no singing']
    .filter(Boolean)
    .join('. ');
}

/**
 * Loudness-normalize a take into the pool, or return null when it is (almost) silent, which
 * the normalizer cannot measure.
 */
function normalizeAudible(
  input: string,
  output: string,
  plan: AudioPlan,
  channels: number,
): LoudnessReading | null {
  const first = measureLoudness(input);
  if (!Number.isFinite(first.integrated) || first.integrated < -50) return null;
  return normalizeLoudness(input, output, plan.targetLufs, plan.truePeakMax, channels);
}

async function aceTextJob(job: Job): Promise<Candidate[]> {
  const seconds = generationSeconds(
    job.template,
    job.plan.loopSec,
    statedSeconds(job.extra),
    job.plan.maxDurationSec,
  );
  const bpm = Math.round(job.plan.bpm ?? 90);
  const keyscale = keyscaleOf(job.extra) ?? 'D major';
  const timesignature = timeSignatureOf(job.extra);
  const caption = musicCaption(job);
  const out: Candidate[] = [];
  for (const k of [1, 2]) {
    const p = poolPath(job.id, `ace_s${k}.flac`);
    // A take can come back silent (seen on short stingers): try the next seeds before failing.
    let seed = 0;
    let run: JobResult | null = null;
    let reading: LoudnessReading | null = null;
    for (const attempt of [0, 10, 20]) {
      seed = seedOf(job.id, k + attempt);
      run = await runGraph(
        aceText2MusicGraph({
          caption,
          seconds,
          bpm,
          keyscale,
          timesignature,
          seed,
          outputPrefix: `hakoniwa_audio_batch/${job.id}_s${k}`,
        }),
        join(WORK, job.id, `s${k}_${attempt}`),
      );
      reading = normalizeAudible(run.files[0] as string, p.abs, job.plan, 2);
      if (reading) break;
    }
    if (!run || !reading) throw new Error(`three silent takes for seed slot ${k}`);
    out.push(
      candidate({
        key: `ace${k}`,
        label: `ACE-Step 只用提示词生成，第 ${k} 版`,
        group: 'D',
        method: `text to music, ${seconds} s at ${bpm} BPM, ${keyscale}, ${timesignature} beats; loop seams are cut on import`,
        tool: 'ace_step_15',
        toolVersion: ACE_VERSION,
        models: [MODELS.aceDit, MODELS.aceTextEncoder, MODELS.aceLm, MODELS.aceVae],
        seed: String(seed),
        prompt: caption,
        settings: {
          seconds,
          bpm,
          keyscale,
          timesignature,
          steps: 8,
          cfg: 1,
          sampler: 'euler',
          shift: 3,
          lmCodes: true,
          decode: aceDecodeNode(seconds).class_type,
        },
        metrics: { ...jobFields(run), lufs: reading.integrated, truePeak: reading.truePeak },
        files: [{ role: 'main', label: `ace${k}`, path: p.rel }],
      }),
    );
  }
  return out;
}

async function motifJob(job: Job): Promise<Candidate[]> {
  const score = MOTIF_SEEDS.find((s) => s.id === job.id);
  if (!score) return aceTextJob(job);
  const render = poolPath(job.id, 'score_render.wav');
  const r = renderOneShot(
    score,
    render.abs,
    job.plan.maxDurationSec ?? 16,
    job.plan.targetLufs,
    join(WORK, job.id),
  );
  const out: Candidate[] = [
    candidate({
      key: 'score',
      label: '乐谱直出（按动机表逐音写成）',
      group: 'A',
      method:
        'score render: the motif table note for note, played twice, the second time slower and softer',
      tool: 'score_render_fluidsynth',
      toolVersion: SCORE_VERSION,
      prompt: `score: tools/audio_gen/scores/motif_seeds.ts (${job.id})`,
      settings: { bpm: score.bpm, seconds: r.seconds },
      metrics: { lufs: r.lufs, truePeak: r.truePeak },
      files: [{ role: 'main', label: 'score', path: render.rel }],
    }),
  ];
  const caption = musicCaption(job);
  const seed = seedOf(job.id, 1);
  const input = stageInput(render.abs, `hakoniwa_audio_batch/${job.id}`);
  const run = await runGraph(
    aceCoverGraph(
      {
        caption,
        seconds: Math.round(r.seconds * 100) / 100,
        bpm: score.bpm,
        keyscale: score.keyscale,
        timesignature: score.beatsPerBar === 3 ? '3' : '4',
        seed,
        outputPrefix: `hakoniwa_audio_batch/${job.id}_cover`,
      },
      input,
      1,
    ),
    join(WORK, job.id, 'cover'),
  );
  const cover = poolPath(job.id, 'ace_cover.flac');
  const reading = normalizeLoudness(
    run.files[0] as string,
    cover.abs,
    job.plan.targetLufs,
    job.plan.truePeakMax,
    2,
  );
  out.push(
    candidate({
      key: 'cover',
      label: 'ACE-Step 翻奏乐谱直出（从噪声起，只取旋律与结构）',
      group: 'B',
      method: 'cover of the score render, semantic hints only',
      tool: 'ace_step_15',
      toolVersion: ACE_VERSION,
      models: [MODELS.aceDit, MODELS.aceTextEncoder, MODELS.aceLm, MODELS.aceVae],
      seed: String(seed),
      prompt: caption,
      settings: { seconds: r.seconds, bpm: score.bpm, keyscale: score.keyscale, denoise: 1 },
      metrics: { ...jobFields(run), lufs: reading.integrated, truePeak: reading.truePeak },
      files: [{ role: 'main', label: 'cover', path: cover.rel }],
    }),
  );
  return out;
}

async function runJob(job: Job): Promise<Candidate[]> {
  if (job.plan.kind === 'music')
    return job.template === 'music_motif' ? motifJob(job) : aceTextJob(job);
  if (job.template === 'ambience_bed') return ambienceBedJob(job);
  if (job.plan.loop) return effectLoopJob(job);
  return effectJob(job);
}

function describe(job: Job): string {
  if (job.plan.kind === 'music') {
    if (job.template === 'music_motif') return 'score render plus one ACE-Step cover';
    const seconds = generationSeconds(
      job.template,
      job.plan.loopSec,
      statedSeconds(job.extra),
      job.plan.maxDurationSec,
    );
    return `ACE-Step x2, ${seconds} s, ${Math.round(job.plan.bpm ?? 90)} BPM, ${keyscaleOf(job.extra) ?? 'D major (default)'}, ${timeSignatureOf(job.extra)}`;
  }
  if (job.template === 'ambience_bed')
    return `Stable Audio 2 sets x 2 takes of 120 s, loop body ${Math.min(110, Math.max(30, job.plan.loopSec ?? 90))} s`;
  if (job.plan.loop) return 'Stable Audio 3 takes of 14 s, 4 to 8 s loop';
  return `Stable Audio ${takeCount(job.plan.variants)} takes, ${variationSeconds(job)} s each, ${job.plan.variants} variation(s)`;
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const milestone = flag('milestone');
  const kind = flag('kind');
  const only = flag('only')
    ?.split(',')
    .map((s) => s.trim());
  const limit = Number(flag('limit') ?? Number.POSITIVE_INFINITY);
  const dry = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  const records = readJson<ManifestRecord[]>(join(ASSETS, 'manifest.json'), []);
  const recorded = new Set(records.map((r) => r.id));
  const state = readJson<BatchState>(STATE_FILE, { done: {}, failed: {} });
  const jobs = allJobs().filter(
    (j) =>
      (!milestone || j.milestone === milestone) &&
      (!kind || j.plan.kind === kind) &&
      (!only || only.includes(j.id)) &&
      (force || (!recorded.has(j.id) && !existsSync(join(POOL, j.id, 'candidates.json')))),
  );
  const todo = jobs.slice(0, limit);
  log(`batch: ${todo.length} of ${jobs.length} pending jobs${dry ? ' (dry run)' : ''}`);
  if (dry) {
    for (const j of todo) console.log(`${j.milestone} ${j.template} ${j.id}: ${describe(j)}`);
    return;
  }
  mkdirSync(WORK, { recursive: true });
  let n = 0;
  for (const job of todo) {
    n++;
    const started = Date.now();
    rmSync(join(POOL, job.id), { recursive: true, force: true });
    mkdirSync(join(POOL, job.id), { recursive: true });
    try {
      const candidates = await runJob(job);
      writeSet(job, candidates);
      const seconds = Math.round((Date.now() - started) / 100) / 10;
      state.done[job.id] = { at: new Date().toISOString(), takes: candidates.length, seconds };
      delete state.failed[job.id];
      log(
        `[${n}/${todo.length}] ${job.milestone} ${job.id}: ${candidates.length} takes in ${seconds} s`,
      );
    } catch (err) {
      rmSync(join(POOL, job.id), { recursive: true, force: true });
      state.failed[job.id] = {
        at: new Date().toISOString(),
        error: String((err as Error)?.message ?? err).slice(0, 500),
      };
      log(
        `[${n}/${todo.length}] ${job.milestone} ${job.id}: FAILED ${state.failed[job.id]?.error}`,
      );
    }
    writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
    rmSync(join(WORK, job.id), { recursive: true, force: true });
  }
  const failed = Object.keys(state.failed).length;
  log(`batch finished: ${Object.keys(state.done).length} done in total, ${failed} failed`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
