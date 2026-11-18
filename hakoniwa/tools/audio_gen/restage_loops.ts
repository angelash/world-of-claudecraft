// Re-stage the loop candidates in the review desk's pool as import sources (loop_source.ts).
// Effect loops and ambience beds are rebuilt from the raw takes ComfyUI kept in its output
// folder: the seam start is chosen again on the same grid, confirmed with the import's own cut,
// and the file becomes the body plus crossfade material instead of a pre-baked body. Music loops
// whose take fails the import's seam check from its first sample are trimmed to the first bar
// (or beat) start that passes; a take that passes from its first sample keeps or gets back its
// full original. The pilot's score render is re-rendered (deterministic) and cut the same way for
// the mix and its layers. Every re-staged take is then run through the import's processAudio to
// report what the import will say. The manifest and the review log are never touched:
// re-adopting a re-staged take is the desk's job.
//
// Writes go to a scratch folder first and land in the pool only when every take of the entry
// succeeded; the first overwritten copy of every pool file and of candidates.json is kept in
// .local/audio_batch/restage_backup/<id>/.
//
//   node ../node_modules/tsx/dist/cli.mjs tools/audio_gen/restage_loops.ts
//     [--only id,id] [--milestone M1] [--dry-run]
//
// Report: .local/audio_batch/restage_report.json, merged by id (and a summary on stdout).

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AudioPlan } from '../assets/core/audio/plan';
import { processAudio } from '../assets/core/audio/process';
import type { Problem } from '../assets/core/reasons';
import { decodeAudio } from '../assets/ffmpeg';
import type { Candidate, CandidateSet } from '../assets/review/model';
import {
  AMBIENCE_BED_BODY_SEC,
  AMBIENCE_BED_GRID,
  allJobs,
  ambienceBedMethod,
  bedSource,
  EFFECT_LOOP_BODY_SEC,
  EFFECT_LOOP_GRID,
  effectLoopMethod,
  type Job,
  loopSettings,
  loopSourceMethod,
  musicMethod,
  writeLoopSource,
} from './batch';
import { COMFY_ROOT } from './comfy';
import { measureLoudness } from './ffmpeg';
import { type LoopSourceResult, loopSource, musicLoopSource } from './loop_source';
import { renderScore } from './render_score';
import { SCORES } from './scores';
import { loadTake, pairToStereo, RATE, scale } from './takes';
import { type PcmAudio, readWav, writeWav } from './wav';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS = join(ROOT, 'assets');
const POOL = join(ASSETS, '_candidates', 'audio');
const STATE_DIR = join(ROOT, '.local', 'audio_batch');
const SCRATCH = join(STATE_DIR, 'restage_work');
/** First-seen copy of every pool file (and candidates.json) this script overwrites. */
const BACKUP = join(STATE_DIR, 'restage_backup');
const REPORT = join(STATE_DIR, 'restage_report.json');
const COMFY_OUT = join(COMFY_ROOT, 'output');

type Action = 'restaged' | 'restored' | 'unchanged' | 'skipped';

interface CandidateReport {
  key: string;
  action: Action;
  reason?: string;
  seamStartSeconds?: number;
  seamLevelStepDb?: number;
  importProblems: string[];
}

interface EntryReport {
  id: string;
  milestone: string;
  template: string;
  candidates: CandidateReport[];
}

/** One planned pool write: a finished file in the scratch folder and where it goes. */
interface Staged {
  from: string;
  to: string;
}

function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

/**
 * The newest `count` takes of one ComfyUI output prefix, oldest first: files named
 * `<prefix><counter>.flac` (ComfyUI counts up on every run, so a rerun's takes come last).
 */
export function latestTakes(names: readonly string[], prefix: string, count: number): string[] {
  const numbered = names
    .filter((n) => n.startsWith(prefix) && /^\d+\.flac$/i.test(n.slice(prefix.length)))
    .map((n) => ({ n, k: Number.parseInt(n.slice(prefix.length), 10) }))
    .sort((a, b) => a.k - b.k);
  if (numbered.length < count)
    throw new Error(`only ${numbered.length} raw take(s) for ${prefix}, need ${count}`);
  return numbered.slice(numbered.length - count).map((x) => x.n);
}

const outputListing = new Map<string, string[]>();

/** Paths of the newest raw takes of a prefix in ComfyUI's output folder. */
function rawTakes(dir: string, prefix: string, count: number): string[] {
  let names = outputListing.get(dir);
  if (!names) {
    names = readdirSync(join(COMFY_OUT, dir));
    outputListing.set(dir, names);
  }
  return latestTakes(names, prefix, count).map((n) => join(COMFY_OUT, dir, n));
}

/** Load through a scratch copy, so no converted file lands beside the source. */
function loadCopy(path: string, channels: number): PcmAudio {
  mkdirSync(SCRATCH, { recursive: true });
  const copy = join(SCRATCH, `${basename(dirname(path))}__${basename(path)}`);
  copyFileSync(path, copy);
  const audio = loadTake(copy, channels);
  rmSync(copy, { force: true });
  rmSync(`${copy}.48k.wav`, { force: true });
  return audio;
}

function backupOf(poolFile: string): string {
  return join(BACKUP, basename(dirname(poolFile)), basename(poolFile));
}

/** Keep the pool file as it was before the first re-stage overwrote it. */
function backup(poolFile: string): void {
  const dest = backupOf(poolFile);
  if (existsSync(dest) || !existsSync(poolFile)) return;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(poolFile, dest);
}

function scratchFor(id: string, poolFile: string): string {
  const dir = join(SCRATCH, id);
  mkdirSync(dir, { recursive: true });
  return join(dir, basename(poolFile));
}

function round(v: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

/** What the import will say about a source: its processAudio problems as reason strings. */
function importProblems(file: string, plan: AudioPlan): string[] {
  const res = processAudio(decodeAudio(file, plan.sampleRate), plan.sampleRate, plan);
  return res.problems
    .filter((p: Problem) => !p.warning)
    .map((p: Problem) => `${p.code}/${p.check}: ${p.message}`);
}

function updateCandidate(
  c: Candidate,
  method: string,
  cut: LoopSourceResult,
  loud: { integrated: number; truePeak: number } | null,
): void {
  c.method = method;
  const { seamScore: _old, ...settings } = c.settings;
  c.settings = { ...settings, ...loopSettings(cut) };
  if (loud)
    c.metrics = { ...c.metrics, lufs: round(loud.integrated), truePeak: round(loud.truePeak) };
}

function mainFile(c: Candidate): string {
  const f = c.files.find((x) => x.role === 'main');
  if (!f) throw new Error(`candidate ${c.key} has no main file`);
  return join(ASSETS, f.path);
}

function report(c: Candidate, action: Action, cut: LoopSourceResult): CandidateReport {
  return {
    key: c.key,
    action,
    seamStartSeconds: round(cut.choice.start / RATE, 3),
    seamLevelStepDb: round(cut.choice.seam.levelStepDb),
    importProblems: [],
  };
}

/** Stage a loop source: the scratch file is verified with the import before it may land. */
function stageSource(
  job: Job,
  c: Candidate,
  cut: LoopSourceResult,
  method: string,
  staged: Staged[],
  dry: boolean,
): CandidateReport {
  const file = mainFile(c);
  const out = report(c, 'restaged', cut);
  if (dry) {
    updateCandidate(c, method, cut, null);
    return out;
  }
  const scratch = scratchFor(job.id, file);
  const loud = writeLoopSource(cut.source, `${scratch}.raw.wav`, scratch, job.plan);
  updateCandidate(c, method, cut, loud);
  out.importProblems = importProblems(scratch, job.plan);
  staged.push({ from: scratch, to: file });
  return out;
}

function restageBed(job: Job, set: CandidateSet, staged: Staged[], dry: boolean) {
  const isAmbience = job.template === 'ambience_bed';
  const pilot = set.source.includes('pilot');
  return set.candidates.map((c, i): CandidateReport => {
    let bed: PcmAudio;
    let what: string;
    if (pilot) {
      // Pilot beds: 09_amb_town_day_<mono|wide>_loop90.wav from 09_..._<mono|wide>_<n>.flac.
      const stem = basename(mainFile(c)).replace(/_loop\d+\.wav$/i, '');
      if (c.key === 'wide') {
        const [l, r] = rawTakes('hakoniwa_audio_pilot', `${stem}_`, 2);
        bed = pairToStereo(loadCopy(l as string, 1), loadCopy(r as string, 1));
        what = 'two 120 s takes as left and right';
      } else {
        const [one] = rawTakes('hakoniwa_audio_pilot', `${stem}_`, 1);
        bed = loadCopy(one as string, 2);
        what = 'one 120 s take (the model writes the same signal on both channels)';
      }
    } else if (isAmbience) {
      const setNo = Number(/(\d+)$/.exec(c.key)?.[1] ?? i + 1);
      const [l, r] = rawTakes('hakoniwa_audio_batch', `${job.id}_${setNo}_`, 2);
      bed = pairToStereo(loadCopy(l as string, 1), loadCopy(r as string, 1));
      what = 'two 120 s takes as left and right';
    } else {
      const takes = rawTakes('hakoniwa_audio_batch', `${job.id}_`, set.candidates.length);
      const index = Number(c.settings.batchIndex ?? i);
      bed = loadCopy(takes[index] as string, job.plan.channels);
      what = 'text to audio, 14 s take';
    }
    const cut = isAmbience
      ? bedSource(bed, job.plan, AMBIENCE_BED_BODY_SEC, AMBIENCE_BED_GRID)
      : bedSource(bed, job.plan, EFFECT_LOOP_BODY_SEC, EFFECT_LOOP_GRID);
    const method = pilot
      ? loopSourceMethod(what, cut, job.plan)
      : isAmbience
        ? ambienceBedMethod(cut, job.plan)
        : effectLoopMethod(cut, job.plan);
    return stageSource(job, c, cut, method, staged, dry);
  });
}

/** Settings a loop source adds to a candidate (batch.loopSettings), dropped on a restore. */
const LOOP_SETTING_KEYS = ['loopBodySeconds', 'seamStartSeconds', 'seamLevelStepDb', 'seamPasses'];

function restageMusic(job: Job, set: CandidateSet, staged: Staged[], dry: boolean) {
  return set.candidates.map((c): CandidateReport => {
    const file = mainFile(c);
    if (set.source.includes('pilot')) return restagePilotMusic(job, c, staged, dry);
    // A second run starts again from the full take, not from the source the first run cut.
    const full = existsSync(backupOf(file)) ? backupOf(file) : file;
    const cut = musicLoopSource(loadCopy(full, 2), job.plan);
    if (!cut || (cut.choice.start === 0 && cut.choice.passes)) {
      if (full !== file) {
        // Trimmed by an earlier run, but the full take passes now: put the full take back and
        // describe it as the batch does for a take the import cuts itself.
        const s = c.settings;
        c.method = musicMethod(
          Number(s.seconds),
          Number(s.bpm),
          String(s.keyscale),
          String(s.timesignature),
          null,
        );
        c.settings = Object.fromEntries(
          Object.entries(s).filter(([k]) => !LOOP_SETTING_KEYS.includes(k)),
        );
        const loud = measureLoudness(full);
        c.metrics = { ...c.metrics, lufs: round(loud.integrated), truePeak: round(loud.truePeak) };
        if (!dry) staged.push({ from: full, to: file });
        return {
          key: c.key,
          action: 'restored',
          reason: 'full take passes',
          importProblems: dry ? [] : importProblems(full, job.plan),
        };
      }
      return {
        key: c.key,
        action: 'unchanged',
        reason: cut ? 'passes from its first sample' : 'no stated loop body',
        importProblems: dry ? [] : importProblems(file, job.plan),
      };
    }
    const s = c.settings;
    const method = musicMethod(
      Number(s.seconds),
      Number(s.bpm),
      String(s.keyscale),
      String(s.timesignature),
      cut,
    );
    return stageSource(job, c, cut, method, staged, dry);
  });
}

/** The pilot's music: the score render (mix and layers) and the covers of its double render. */
function restagePilotMusic(
  job: Job,
  c: Candidate,
  staged: Staged[],
  dry: boolean,
): CandidateReport {
  const file = mainFile(c);
  if (c.key.startsWith('D_')) {
    return {
      key: c.key,
      action: 'skipped',
      reason: 'generated at exactly one loop body, nothing after it to crossfade; needs a new take',
      importProblems: dry ? [] : importProblems(file, job.plan),
    };
  }
  if (c.key === 'A_render') {
    const score = SCORES[job.id];
    if (!score) throw new Error(`no score for ${job.id}`);
    const render = renderScore(score);
    const gain = 10 ** (render.gainDb / 20);
    const rawOf = (name: string): PcmAudio =>
      scale(readWav(readFileSync(join(render.outDir, `_render_${name}.wav`))), gain);
    const cut = musicLoopSource(rawOf('full'), job.plan);
    if (!cut) throw new Error(`${job.id} states no loop body`);
    const method = `score render (full mix and its layers, one gain); loop source from ${round(cut.choice.start / RATE)} s on the tempo grid: the body plus 1.5 s crossfade material from the double render, the import bakes the loop`;
    const out = report(c, 'restaged', cut);
    if (dry) {
      updateCandidate(c, method, cut, null);
      return out;
    }
    const scratch = scratchFor(job.id, file);
    writeFileSync(scratch, writeWav(cut.source));
    staged.push({ from: scratch, to: file });
    for (const f of c.files.filter((x) => x.role === 'layer')) {
      const layerFile = join(ASSETS, f.path);
      const n = /_L(\d+)_/.exec(basename(layerFile))?.[1];
      if (!n) throw new Error(`cannot tell the layer of ${layerFile}`);
      const layerScratch = scratchFor(job.id, layerFile);
      writeFileSync(
        layerScratch,
        writeWav(loopSource(rawOf(`L${n}`), cut.choice.start, cut.body, cut.fade)),
      );
      staged.push({ from: layerScratch, to: layerFile });
    }
    updateCandidate(c, method, cut, measureLoudness(scratch));
    // The import cuts the layers at the mix's start, so the mix is what decides the seam.
    out.importProblems = importProblems(scratch, job.plan);
    return out;
  }
  // Covers B and C: 0k_music_..._seedN.wav from 0k_music_..._seedN_<n>.flac (render timeline).
  const stem = basename(file).replace(/\.wav$/i, '');
  const [raw] = rawTakes('hakoniwa_audio_pilot', `${stem}_`, 1);
  const cut = musicLoopSource(loadCopy(raw as string, 2), job.plan);
  if (!cut) throw new Error(`${job.id} states no loop body`);
  const method = `${c.method.split(';')[0]}; loop source from ${round(cut.choice.start / RATE)} s on the tempo grid: the body plus 1.5 s crossfade material, the import bakes the loop; one linear gain toward the target`;
  return stageSource(job, c, cut, method, staged, dry);
}

function readReport(): Map<string, EntryReport> {
  if (!existsSync(REPORT)) return new Map();
  const old = JSON.parse(readFileSync(REPORT, 'utf8')) as { report?: EntryReport[] };
  return new Map((old.report ?? []).map((r) => [r.id, r]));
}

function main(): void {
  const only = flag('only')?.split(',') ?? null;
  const milestone = flag('milestone');
  const dry = process.argv.includes('--dry-run');
  const jobs = allJobs().filter(
    (j) =>
      j.plan.loop &&
      (!only || only.includes(j.id)) &&
      (!milestone || j.milestone === milestone) &&
      existsSync(join(POOL, j.id, 'candidates.json')),
  );
  const merged = readReport();
  const ran: EntryReport[] = [];
  for (const job of jobs) {
    const setPath = join(POOL, job.id, 'candidates.json');
    const set = JSON.parse(readFileSync(setPath, 'utf8')) as CandidateSet;
    const staged: Staged[] = [];
    let candidates: CandidateReport[];
    try {
      candidates =
        job.plan.kind === 'music'
          ? restageMusic(job, set, staged, dry)
          : restageBed(job, set, staged, dry);
      if (!dry && staged.length > 0) {
        // Every take of the entry is ready: back up, then land the files and the set together.
        backup(setPath);
        for (const s of staged) {
          backup(s.to);
          copyFileSync(s.from, s.to);
        }
        writeFileSync(setPath, `${JSON.stringify(set, null, 2)}\n`);
      }
    } catch (err) {
      candidates = [
        {
          key: '*',
          action: 'skipped',
          reason: `nothing written: ${String((err as Error)?.message ?? err)}`,
          importProblems: [],
        },
      ];
    }
    rmSync(join(SCRATCH, job.id), { recursive: true, force: true });
    const entry = { id: job.id, milestone: job.milestone, template: job.template, candidates };
    ran.push(entry);
    if (!dry) merged.set(job.id, entry);
    const line = candidates
      .map(
        (c) =>
          `${c.key}=${c.action}${c.seamLevelStepDb !== undefined ? `(${c.seamLevelStepDb} dB)` : ''}${c.importProblems.length ? ` [${c.importProblems.length} problem(s)]` : ''}`,
      )
      .join(' ');
    console.log(`${job.milestone} ${job.id}: ${line}`);
  }
  mkdirSync(STATE_DIR, { recursive: true });
  if (!dry)
    writeFileSync(
      REPORT,
      `${JSON.stringify({ at: new Date().toISOString(), report: [...merged.values()] }, null, 2)}\n`,
    );
  const seamClean = (r: EntryReport) =>
    r.candidates.some(
      (c) =>
        (c.action === 'restaged' || c.action === 'unchanged' || c.action === 'restored') &&
        !c.importProblems.some((p) => p.startsWith('seam/')),
    );
  console.log(
    `${ran.length} loop entries, ${ran.filter((r) => r.candidates.some((c) => c.action === 'restaged')).length} re-staged, ${ran.filter(seamClean).length} with at least one take the import's seam check passes${dry ? ' (dry run, nothing written)' : `; report ${REPORT}`}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
