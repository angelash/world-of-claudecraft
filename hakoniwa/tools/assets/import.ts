// npm run assets:import: steps 2 to 10, 12 and 13 of the import pipeline (art_pipeline.md 13)
// for every registered original, plus the audio branch (audio_direction.md 9 and 11). Writes
// assets/processed/<category>/<id>.png and .json for art, assets/processed/audio/<outDir>/
// <id>[_NN].ogg and <id>.json for audio, and a contact sheet with its index under
// .local/contact/. Results already made from the same original by the same import version are
// skipped unless --all is given.
//
//   npm run assets:import [-- --all] [--id <id>[,<id>...]] [--no-contact] [--root <assets dir>]
//
// Status: a record in review that fails an automatic check becomes rework with the reason
// codes; a record the import itself sent to rework returns to review once it passes. Other
// statuses are never changed here (reprocessing keeps the review status, 13).

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gainDb, limitTruePeak } from './core/audio/dsp';
import { loudnessFor, measureLoudness, truePeakEnvelope } from './core/audio/loudness';
import { type AudioMeta, checkAudio, newAudioMeta } from './core/audio/meta';
import { parseOgg } from './core/audio/ogg';
import { type AudioPlan, type AudioTemplateLike, audioPlanOf } from './core/audio/plan';
import { processAudio } from './core/audio/process';
import { type ContactRow, changedShare, contactIndex, contactPages } from './core/contact';
import type { Img } from './core/image';
import { type ManifestRecord, manifestJson } from './core/manifest';
import { type ArtMeta, IMPORT_VERSION, metaPathOf, processedPathOf } from './core/meta';
import { processArt } from './core/pipeline';
import { decodePng, encodePng } from './core/png';
import { type Problem, problem, reasonOf } from './core/reasons';
import { decodeAudio, encodeOgg, ffmpegPath } from './ffmpeg';
import {
  type Args,
  consoleLogger,
  flag,
  isMain,
  jsonText,
  type Logger,
  loadLibrary,
  parseArgs,
  readJson,
  writeBytes,
  writeText,
} from './lib';

/** New status after an automatic import or check; null when unchanged. */
export function nextStatus(
  rec: ManifestRecord,
  problems: readonly Problem[],
  previousAuto: string | null,
): { status: ManifestRecord['status']; reason: string } | null {
  const reason = reasonOf(problems);
  if (rec.status === 'review' && reason !== '') return { status: 'rework', reason };
  if (
    rec.status === 'rework' &&
    reason === '' &&
    previousAuto !== null &&
    rec.reason === previousAuto
  )
    return { status: 'review', reason: '' };
  if (
    rec.status === 'rework' &&
    reason !== '' &&
    previousAuto !== null &&
    rec.reason === previousAuto &&
    reason !== rec.reason
  ) {
    return { status: 'rework', reason };
  }
  return null;
}

/**
 * The generator's implicit label for a processed file: the original's own AIGC entries copied
 * verbatim (same key, same value), or the record's label when the original carries none (a
 * converted file whose label was copied into the record by hand).
 */
export function labelChunks(
  source: Record<string, string>,
  recordLabel: string,
): Record<string, string> {
  const own = Object.fromEntries(Object.entries(source).filter(([k]) => /aigc/i.test(k)));
  if (Object.keys(own).length > 0) return own;
  if (recordLabel === 'none') return {};
  // The record keeps "KEY=value; KEY2=value2" (register.aigcLabelOf): restore the pairs.
  const out: Record<string, string> = {};
  for (const part of recordLabel.split('; ')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return Object.keys(out).length > 0 ? out : { AIGC: recordLabel };
}

/** Processed files that exist for a record (its metadata, image or sound files). */
export function processedFilesOf(root: string, rec: ManifestRecord): string[] {
  const metaRel = metaPathOf(rec.file);
  const meta = readJson<{ files?: string[] } | null>(join(root, metaRel), null);
  const files = [
    metaRel,
    ...(rec.kind === 'art' ? [processedPathOf(rec.file)] : (meta?.files ?? [])),
  ];
  return files.filter((f) => existsSync(join(root, f)));
}

function idFilter(args: Args): Set<string> | null {
  const v = flag(args, 'id');
  return v ? new Set(v.split(',').map((s) => s.trim())) : null;
}

export async function run(argv: string[], log: Logger = consoleLogger): Promise<number> {
  const args = parseArgs(argv);
  const lib = loadLibrary(args.prompts);
  if (lib.problems.length > 0) {
    for (const p of lib.problems) log.error(p);
    return 1;
  }
  const manifestPath = join(args.root, 'manifest.json');
  const records = readJson<ManifestRecord[]>(manifestPath, []);
  const only = idFilter(args);
  const all = args.flags.has('all');
  const contact: ContactRow[] = [];
  let changed = false;
  let processed = 0;
  let failing = 0;
  let skipped = 0;
  for (const rec of records) {
    if (only && !only.has(rec.id)) continue;
    if (rec.status === 'rejected' || rec.status === 'retired') {
      // Rejected and retired originals are not loaded by the game: drop their processed results.
      for (const f of processedFilesOf(args.root, rec)) {
        rmSync(join(args.root, f), { force: true });
        log.log(`${rec.id}: removed ${f} (${rec.status})`);
      }
      continue;
    }
    const src = join(args.root, rec.file);
    if (!existsSync(src)) {
      log.error(`${rec.id}: original ${rec.file} is missing`);
      failing++;
      continue;
    }
    const metaPath = join(args.root, metaPathOf(rec.file));
    const prevMeta = readJson<((ArtMeta | AudioMeta) & { autoReason?: string }) | null>(
      metaPath,
      null,
    );
    const fresh =
      prevMeta &&
      prevMeta.importVersion === IMPORT_VERSION &&
      prevMeta.source.sha256 === rec.sha256;
    if (fresh && !all) {
      skipped++;
      continue;
    }
    const tdef = lib.templates[rec.template];
    if (!tdef) {
      log.error(`${rec.id}: unknown template ${rec.template}`);
      failing++;
      continue;
    }
    let problems: Problem[];
    try {
      if (rec.kind === 'art') {
        const bytes = new Uint8Array(readFileSync(src));
        const png = decodePng(bytes);
        const style = rec.style || null;
        const res = processArt({
          id: rec.id,
          template: rec.template,
          templateDef: tdef,
          style,
          styleAnchors: style ? (lib.styles[style]?.palette ?? null) : null,
          src: png,
          sourceFile: rec.file,
          sourceSha256: rec.sha256,
          aigcLabel: rec.aigcLabel,
          deps: lib.expected.get(rec.id)?.deps ?? [],
        });
        problems = res.problems;
        const meta = { ...res.meta, autoReason: reasonOf(problems) };
        let previous: Img | null = null;
        const outPng = join(args.root, processedPathOf(rec.file));
        if (res.img) {
          if (existsSync(outPng)) {
            try {
              previous = decodePng(new Uint8Array(readFileSync(outPng)));
            } catch {
              previous = null;
            }
          }
          const text: Record<string, string> = {
            'hakoniwa:id': rec.id,
            'hakoniwa:import': IMPORT_VERSION,
          };
          Object.assign(text, labelChunks(png.text, rec.aigcLabel));
          writeBytes(outPng, encodePng(res.img, text));
        }
        writeText(metaPath, jsonText(meta));
        contact.push({
          id: rec.id,
          source: png,
          processed: res.img,
          problems,
          ...(previous && res.img ? { changed: changedShare(previous, res.img) } : {}),
        });
      } else {
        if (!ffmpegPath()) {
          log.error(
            `${rec.id}: the audio branch needs ffmpeg (root ffmpeg-static or HAKONIWA_FFMPEG); skipped`,
          );
          failing++;
          continue;
        }
        problems = importAudio(
          args,
          rec,
          tdef as AudioTemplateLike,
          lib.expected.get(rec.id)?.extra,
          (prevMeta as AudioMeta | null)?.files ?? [],
        );
      }
    } catch (e) {
      // One unreadable original must not stop the batch (or lose the other status changes).
      problems = [
        problem(
          rec.kind === 'art' ? 'quality' : 'format',
          'import_error',
          `import failed: ${(e as Error).message}`,
        ),
      ];
    }
    processed++;
    const fails = problems.filter((p) => !p.warning);
    if (fails.length > 0) failing++;
    for (const p of problems)
      log.log(`${p.warning ? 'note' : 'fail'} [${p.code}] ${rec.id}: ${p.message}`);
    const next = nextStatus(rec, problems, prevMeta?.autoReason ?? null);
    if (next) {
      rec.status = next.status;
      rec.reason = next.reason;
      changed = true;
    }
  }
  if (changed) writeText(manifestPath, manifestJson(records));
  if (contact.length > 0 && !args.flags.has('no-contact')) {
    const dir = flag(args, 'contact') ?? join(args.root, '..', '.local', 'contact');
    const rows = all ? [...contact].sort((a, b) => (b.changed ?? 0) - (a.changed ?? 0)) : contact;
    // Pages of bounded height (a full reprocess has thousands of rows); one index per page.
    const pages = contactPages(rows);
    const title = all ? '联系表（重新处理，按变化从大到小）' : '联系表';
    const names = pages.map((_, i) =>
      pages.length === 1 ? 'contact' : `contact_${String(i + 1).padStart(2, '0')}`,
    );
    pages.forEach((p, i) => {
      writeBytes(join(dir, `${names[i]}.png`), encodePng(p.img));
      writeText(
        join(dir, `${names[i]}.md`),
        contactIndex(p.rows, pages.length === 1 ? title : `${title} ${i + 1}/${pages.length}`),
      );
    });
    log.log(`contact sheet: ${pages.length} page(s) in ${dir}`);
  }
  log.log(`${processed} processed, ${skipped} up to date, ${failing} with problems`);
  return failing > 0 ? 1 : 0;
}

/** The audio branch for one record; returns the problems and writes the processed files. */
function importAudio(
  args: Args,
  rec: ManifestRecord,
  tdef: AudioTemplateLike,
  extra: { zh?: string; en?: string } | undefined,
  previousFiles: readonly string[],
): Problem[] {
  const plan = audioPlanOf(rec.template, tdef, extra, rec.id);
  const src = join(args.root, rec.file);
  const pcm = decodeAudio(src, plan.sampleRate);
  let sourceComments: Record<string, string> = {};
  try {
    const c = parseOgg(new Uint8Array(readFileSync(src))).comments;
    sourceComments = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.join('; ')]));
  } catch {
    // a non-Ogg original (converted later): the record's label is used
  }
  const res = processAudio(pcm, plan.sampleRate, plan);
  const meta = newAudioMeta(rec.id, plan, { file: rec.file, sha256: rec.sha256 }, rec.aigcLabel);
  const base = processedPathOf(rec.file).replace(/\.ogg$/, '');
  let headers: { file: string; info: ReturnType<typeof parseOgg> | null; error?: string }[] = [];
  let lufs = Number.NEGATIVE_INFINITY;
  let peak = Number.NEGATIVE_INFINITY;
  // Encode, measure the encoded files again (11.4) and re-process when the codec moved the
  // loudness or overshot the true-peak ceiling: the gain closes the loudness gap and the
  // limiter's ceiling drops by the overshoot; at most three passes.
  let extraDb = 0;
  let ceiling = plan.truePeakMax - 0.2;
  let applied = { extraDb: 0, ceiling };
  const passes: {
    extraDb: number;
    ceiling: number;
    lufs: number | null;
    truePeak: number | null;
  }[] = [];
  for (let pass = 0; pass < 3; pass++) {
    const encoded = encodeOutputs(args, rec, plan, res, base, sourceComments, extraDb, ceiling);
    applied = { extraDb, ceiling };
    headers = encoded.headers;
    lufs = encoded.lufs;
    peak = encoded.peak;
    meta.files = encoded.files;
    passes.push({
      extraDb: Number(extraDb.toFixed(2)),
      ceiling: Number(ceiling.toFixed(2)),
      lufs: finiteOrNull(lufs),
      truePeak: finiteOrNull(peak),
    });
    if (!Number.isFinite(lufs) || !Number.isFinite(peak)) break;
    const loudGap = Math.abs(plan.targetLufs - lufs) > 0.3 ? plan.targetLufs - lufs : 0;
    const overshoot = peak - (plan.truePeakMax - 0.05);
    if (Math.abs(loudGap) < 0.05 && overshoot <= 0) break;
    extraDb += loudGap;
    if (overshoot > 0) ceiling -= overshoot + 0.1;
  }
  // Variant files of an earlier import that this one no longer writes.
  for (const f of previousFiles)
    if (!meta.files.includes(f)) rmSync(join(args.root, f), { force: true });
  meta.durationSec = Number(
    (Math.max(...res.outputs.map((o) => o.pcm[0]?.length ?? 0)) / plan.sampleRate).toFixed(3),
  );
  meta.loopStart = res.loopStart;
  meta.loopEnd = res.loopEnd;
  meta.variants =
    res.outputs.length > 1 ? res.outputs.length : plan.variants > 1 ? res.outputs.length : 1;
  meta.lufs = finiteOrNull(lufs);
  meta.truePeak = finiteOrNull(peak);
  meta.processing = {
    ...res.processing,
    gainDb: Number((res.gainDb + applied.extraDb).toFixed(2)),
    ceilingDb: Number(applied.ceiling.toFixed(2)),
    beforeEncode: { lufs: res.lufs, truePeak: res.truePeak },
    encodePasses: passes,
  };
  const problems = [
    ...res.problems.filter((p) => p.check !== 'loudness' && p.check !== 'true_peak'),
    ...checkAudio(meta, headers, plan),
  ];
  meta.problems = problems;
  writeText(
    join(args.root, metaPathOf(rec.file)),
    jsonText({ ...meta, autoReason: reasonOf(problems) }),
  );
  return problems;
}

function finiteOrNull(v: number): number | null {
  return Number.isFinite(v) ? Number(v.toFixed(2)) : null;
}

/** Encode every output with an extra gain; returns the files, headers and encoded measurements. */
function encodeOutputs(
  args: Args,
  rec: ManifestRecord,
  plan: AudioPlan,
  res: ReturnType<typeof processAudio>,
  base: string,
  sourceComments: Record<string, string>,
  extraDb: number,
  ceilingDb: number,
): {
  files: string[];
  headers: { file: string; info: ReturnType<typeof parseOgg> | null; error?: string }[];
  lufs: number;
  peak: number;
} {
  const files: string[] = [];
  const headers: { file: string; info: ReturnType<typeof parseOgg> | null; error?: string }[] = [];
  let lufs = Number.NEGATIVE_INFINITY;
  let peak = Number.NEGATIVE_INFINITY;
  for (const o of res.outputs) {
    const pcm = o.pcm.map((c) => c.slice());
    if (extraDb !== 0) gainDb(pcm, extraDb);
    limitTruePeak(pcm, plan.sampleRate, ceilingDb, truePeakEnvelope);
    const rel = `${base}${o.suffix}.ogg`;
    const comments: Record<string, string> = {
      HAKONIWA_ID: rec.id,
      HAKONIWA_IMPORT: IMPORT_VERSION,
    };
    if (res.loopStart !== null && res.loopEnd !== null) {
      comments.LOOPSTART = String(res.loopStart);
      comments.LOOPLENGTH = String(res.loopEnd - res.loopStart);
    }
    Object.assign(comments, labelChunks(sourceComments, rec.aigcLabel));
    const quality =
      (plan.kind === 'sfx' || plan.kind === 'ui') && (o.pcm[0]?.length ?? 0) < plan.sampleRate * 0.3
        ? 5
        : plan.quality;
    const out = join(args.root, rel);
    mkdirSync(dirname(out), { recursive: true });
    encodeOgg(pcm, plan.sampleRate, out, quality, comments);
    files.push(rel);
    try {
      headers.push({ file: rel, info: parseOgg(new Uint8Array(readFileSync(out))) });
    } catch (e) {
      headers.push({ file: rel, info: null, error: (e as Error).message });
    }
    const l = measureLoudness(decodeAudio(out, plan.sampleRate, plan.channels), plan.sampleRate);
    lufs = Math.max(lufs, loudnessFor(l, plan.measure));
    peak = Math.max(peak, l.truePeak);
  }
  return { files, headers, lufs, peak };
}

if (isMain(import.meta.url)) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
