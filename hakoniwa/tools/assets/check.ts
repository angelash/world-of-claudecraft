// npm run assets:check: every automatic check over the committed asset state (art_pipeline.md
// 6.6 and 13 step 12; audio_direction.md 10.6 and 11.1 step 6):
// - tools.json and manifest.json fields, tool registration and commercial use;
// - records and files correspond both ways under art/ and audio/, and hashes match;
// - every live record has a current processed result (same original, same import version);
// - processed art passes the step 12 checks again (catches hand-edited results);
// - processed audio: Ogg headers (sample rate, channels, length), loop points, loudness and
//   true peak against the template;
// - processed files without a record;
// - records whose prompt changed since generation (re-review list, not a failure).
// Failures print "[reason] id: message" and set exit code 1. With --mark, records in review
// that fail are set to rework with the reason codes (assets/prompts/README.md 8).
//
//   npm run assets:check [-- --mark] [--no-hash] [--measure] [--root <assets dir>]

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loudnessFor, measureLoudness } from './core/audio/loudness';
import { type AudioMeta, checkAudio } from './core/audio/meta';
import { parseOgg } from './core/audio/ogg';
import { type AudioTemplateLike, audioPlanOf } from './core/audio/plan';
import { checkProcessed } from './core/checks';
import { importVersionFor } from './core/import_versions';
import {
  type ManifestRecord,
  manifestJson,
  promptChanged,
  reconcile,
  type ToolRecord,
  validateManifest,
  validateTools,
} from './core/manifest';
import { type ArtMeta, metaPathOf, processedPathOf } from './core/meta';
import { paletteFor } from './core/pipeline';
import { decodePng } from './core/png';
import { type Problem, problem, reasonOf } from './core/reasons';
import { importSpecFor, isReference, type TemplateLike } from './core/template_specs';
import { uiGlyphPalette } from './core/ui_glyph';
import { decodeAudio, ffmpegPath } from './ffmpeg';
import {
  consoleLogger,
  isMain,
  type Logger,
  listFiles,
  loadLibrary,
  parseArgs,
  readJson,
  sha256,
  writeText,
} from './lib';

/** Checks a reviewer cannot overrule: file format, palette membership, sizes, loudness. */
const HARD_CHECKS = new Set([
  'size',
  'frame_count',
  'palette_membership',
  'pure_black',
  'alpha_binary',
  'color_cap',
  'processed_file',
  'import_error',
  'files',
  'ogg',
  'sample_rate',
  'channels',
  'duration',
  'loop_points',
  'loop_length',
  'loudness',
  'true_peak',
]);

/** Audio checks that checkAudio re-runs on the processed files (not replayed from the import). */
const AUDIO_FILE_CHECKS = new Set([
  'files',
  'ogg',
  'sample_rate',
  'channels',
  'duration',
  'loop_points',
  'loop_length',
  'loudness',
  'true_peak',
]);

export interface CheckReport {
  errors: string[];
  problems: { id: string; problem: Problem }[];
  stale: string[];
  promptChanged: string[];
}

export async function run(argv: string[], log: Logger = consoleLogger): Promise<number> {
  const args = parseArgs(argv);
  const report: CheckReport = { errors: [], problems: [], stale: [], promptChanged: [] };
  const lib = loadLibrary(args.prompts);
  if (lib.problems.length > 0)
    report.errors.push(...lib.problems.map((p) => `prompt library: ${p}`));
  const tools = readJson<ToolRecord[]>(join(args.root, 'tools.json'), []);
  const manifestPath = join(args.root, 'manifest.json');
  if (!existsSync(manifestPath)) report.errors.push(`no manifest.json in ${args.root}`);
  const records = readJson<ManifestRecord[]>(manifestPath, []);
  report.errors.push(...validateTools(tools));
  report.errors.push(...validateManifest(records, { tools, expected: lib.expected }));
  // Two-way record and file correspondence.
  const files = [...listFiles(args.root, 'art'), ...listFiles(args.root, 'audio')].map((path) => ({
    path,
    ...(args.flags.has('no-hash')
      ? {}
      : { sha256: sha256(new Uint8Array(readFileSync(join(args.root, path)))) }),
  }));
  const rec = reconcile(records, files);
  for (const f of rec.missingFiles) report.errors.push(`${f}: registered but the file is missing`);
  for (const f of rec.unregistered)
    report.errors.push(`${f}: file without a manifest record (npm run assets:register)`);
  for (const f of rec.hashMismatch)
    report.errors.push(`${f}: file changed since registration (sha256 differs)`);
  report.promptChanged = promptChanged(records, lib.expected);
  // Processed results.
  const expectedProcessed = new Set<string>();
  for (const r of records) {
    if (r.status === 'rejected' || r.status === 'retired') continue;
    const tdef = lib.templates[r.template];
    if (!tdef) continue;
    const metaRel = metaPathOf(r.file);
    expectedProcessed.add(metaRel);
    const meta = readJson<(ArtMeta | AudioMeta) | null>(join(args.root, metaRel), null);
    if (!meta) {
      report.stale.push(`${r.id}: no processed result (npm run assets:import)`);
      continue;
    }
    if (meta.importVersion !== importVersionFor(r.kind) || meta.source.sha256 !== r.sha256) {
      report.stale.push(
        `${r.id}: processed with import ${meta.importVersion} from another original; rerun npm run assets:import`,
      );
    }
    // A reviewer's approval settles the heuristic checks (outline, seam, jitter, ...): on an
    // approved record they become notes; technical invariants and loudness stay failures.
    const add = (p: Problem): void => {
      const settled = r.status === 'approved' && !HARD_CHECKS.has(p.check);
      report.problems.push({ id: r.id, problem: settled ? { ...p, warning: true } : p });
    };
    if (r.kind === 'art') {
      if (isReference(tdef as TemplateLike)) continue;
      const pngRel = processedPathOf(r.file);
      expectedProcessed.add(pngRel);
      const art = meta as ArtMeta;
      for (const p of art.problems ?? []) add(p);
      if (!existsSync(join(args.root, pngRel))) {
        add(problem('frames', 'processed_file', `${pngRel} is missing`));
        continue;
      }
      let img: ReturnType<typeof decodePng>;
      try {
        img = decodePng(new Uint8Array(readFileSync(join(args.root, pngRel))));
      } catch (e) {
        add(problem('quality', 'processed_file', `${pngRel}: ${(e as Error).message}`));
        continue;
      }
      const spec = importSpecFor(
        r.template,
        tdef as TemplateLike,
        r.id,
        lib.expected.get(r.id)?.deps ?? [],
      );
      const style = r.style || null;
      const palette =
        spec.palette === 'ui'
          ? uiGlyphPalette(r.id)
          : spec.palette === 'vfx' || spec.palette === 'two'
            ? null
            : paletteFor(spec, style, style ? lib.styles[style]?.palette : null);
      for (const p of checkProcessed(img, art, { spec, palette, assetId: r.id })) {
        if (!(art.problems ?? []).some((q) => q.check === p.check && q.message === p.message))
          add(p);
      }
    } else {
      const audio = meta as AudioMeta;
      const plan = audioPlanOf(
        r.template,
        tdef as AudioTemplateLike,
        lib.expected.get(r.id)?.extra,
        r.id,
      );
      // Import-time findings that only the PCM shows (loop seam, limiting, silence, variants).
      for (const p of audio.problems ?? []) if (!AUDIO_FILE_CHECKS.has(p.check)) add(p);
      const headers = audio.files.map((f) => {
        expectedProcessed.add(f);
        const p = join(args.root, f);
        if (!existsSync(p)) return { file: f, info: null, error: 'missing' };
        try {
          return { file: f, info: parseOgg(new Uint8Array(readFileSync(p))) };
        } catch (e) {
          return { file: f, info: null, error: (e as Error).message };
        }
      });
      let measured = audio;
      if (args.flags.has('measure') && ffmpegPath()) {
        // Re-measure the processed files instead of trusting the recorded values.
        let lufs = Number.NEGATIVE_INFINITY;
        let peak = Number.NEGATIVE_INFINITY;
        for (const h of headers) {
          if (!h.info) continue;
          const l = measureLoudness(
            decodeAudio(join(args.root, h.file), plan.sampleRate, plan.channels),
            plan.sampleRate,
          );
          lufs = Math.max(lufs, loudnessFor(l, plan.measure));
          peak = Math.max(peak, l.truePeak);
        }
        measured = {
          ...audio,
          lufs: Number.isFinite(lufs) ? lufs : null,
          truePeak: Number.isFinite(peak) ? peak : null,
        };
      }
      for (const p of checkAudio(measured, headers, plan)) add(p);
    }
  }
  for (const f of listFiles(args.root, 'processed')) {
    if (!expectedProcessed.has(f))
      report.errors.push(`${f}: processed file without a live manifest record`);
  }
  // Report.
  for (const e of report.errors) log.error(`error ${e}`);
  for (const s of report.stale) log.error(`stale ${s}`);
  for (const { id, problem: p } of report.problems)
    log[p.warning ? 'log' : 'error'](
      `${p.warning ? 'note' : 'fail'} [${p.code}] ${id}: ${p.message}`,
    );
  if (report.promptChanged.length > 0) {
    log.log(`prompt changed since generation (re-review): ${report.promptChanged.join(', ')}`);
  }
  const failing = report.problems.filter((p) => !p.problem.warning);
  if (args.flags.has('mark') && failing.length > 0) {
    let marked = 0;
    for (const r of records) {
      if (r.status !== 'review') continue;
      const reason = reasonOf(failing.filter((p) => p.id === r.id).map((p) => p.problem));
      if (reason === '') continue;
      r.status = 'rework';
      r.reason = reason;
      marked++;
    }
    if (marked > 0) writeText(manifestPath, manifestJson(records));
    log.log(`${marked} record(s) marked rework`);
  }
  const ok = report.errors.length === 0 && report.stale.length === 0 && failing.length === 0;
  log.log(
    `${records.length} record(s), ${report.errors.length} error(s), ${report.stale.length} stale, ${failing.length} failing check(s): ${ok ? 'ok' : 'not ok'}`,
  );
  return ok ? 0 : 1;
}

if (isMain(import.meta.url)) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
