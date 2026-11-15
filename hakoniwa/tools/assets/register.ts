// npm run assets:register: step 1 of the import pipeline (art_pipeline.md 13; assets/README.md
// 3.1). Scans assets/art/ and assets/audio/ for files without a record (or whose bytes changed),
// matches each to its prompt entry by name and folder, and writes a `review` record with the
// tool, dates, seed, references, prompt fingerprint, file hash and implicit AIGC label.
// Audio segment folders (assets/audio/<outDir>/<id>/) are joined into one original first.
//
//   npm run assets:register -- --tool xiaojiu --tool-version v3 [--date 2026-11-20] [--seed 42]
//     [--refs a,b] [--lang en] [--converted] [--notes "..."] [--dry-run] [--root <assets dir>]
//
// Missing --tool or --tool-version are asked for on an interactive terminal.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseOgg } from './core/audio/ogg';
import {
  type ManifestRecord,
  manifestJson,
  type ToolRecord,
  upsertRecord,
  validateTools,
} from './core/manifest';
import { readPngText } from './core/png';
import { aigcLabelOf, matchFile, newRecord } from './core/register';
import { decodeAudio, encodeOgg, ffmpegPath } from './ffmpeg';
import {
  type Args,
  consoleLogger,
  flag,
  isMain,
  type Logger,
  listFiles,
  loadLibrary,
  parseArgs,
  readJson,
  sha256,
  today,
  writeText,
} from './lib';

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Join an audio segment folder into one original (segments in name order, 1 s of silence between). */
function joinSegments(root: string, dir: string, outFile: string, log: Logger): boolean {
  const files = readdirSync(join(root, dir))
    .filter((n) => /\.(ogg|wav|mp3|flac)$/i.test(n))
    .sort();
  if (files.length === 0) return false;
  if (!ffmpegPath()) {
    log.error(`${dir}/: joining segments needs ffmpeg; skipped`);
    return false;
  }
  const parts = files.map((f) => decodeAudio(join(root, dir, f), 48000));
  const ch = Math.max(...parts.map((p) => p.length));
  const gap = 48000;
  const total = parts.reduce((s, p) => s + (p[0]?.length ?? 0), 0) + gap * (parts.length - 1);
  const out = Array.from({ length: ch }, () => new Float32Array(total));
  let o = 0;
  parts.forEach((p, i) => {
    for (let c = 0; c < ch; c++) out[c]!.set(p[Math.min(c, p.length - 1)]!, o);
    o += (p[0]?.length ?? 0) + (i < parts.length - 1 ? gap : 0);
  });
  // Originals are kept at q8 when converted (audio_direction.md 9.1).
  const labels = files.map((f) => {
    try {
      return /\.ogg$/i.test(f)
        ? aigcLabelOf(parseOgg(new Uint8Array(readFileSync(join(root, dir, f)))).comments)
        : 'none';
    } catch {
      return 'none';
    }
  });
  const real = labels.filter((l) => l !== 'none');
  encodeOgg(out, 48000, join(root, outFile), 8, {
    HAKONIWA_SEGMENTS: files.join(','),
    ...(real.length > 0 ? { AIGC: real.join(' | ') } : {}),
  });
  const name = dir.split('/').pop()!;
  let parked = join(root, '_rejected', 'segments', name);
  for (let k = 2; existsSync(parked); k++)
    parked = join(root, '_rejected', 'segments', `${name}_${k}`);
  mkdirSync(join(parked, '..'), { recursive: true });
  renameSync(join(root, dir), parked);
  log.log(
    `joined ${files.length} segment(s) into ${outFile}; segments moved to _rejected/segments/`,
  );
  return true;
}

/** A Git LFS pointer file (the original was not fetched). */
export function isLfsPointer(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 64)).toString('latin1');
  return head.startsWith('version https://git-lfs.github.com/spec/');
}

function labelOf(path: string, bytes: Uint8Array): string {
  try {
    if (path.endsWith('.png')) return aigcLabelOf(readPngText(bytes));
    if (path.endsWith('.ogg')) return aigcLabelOf(parseOgg(bytes).comments);
  } catch {
    // unreadable metadata: no label
  }
  return 'none';
}

export async function run(argv: string[], log: Logger = consoleLogger): Promise<number> {
  const args: Args = parseArgs(argv);
  const lib = loadLibrary(args.prompts);
  if (lib.problems.length > 0) {
    for (const p of lib.problems) log.error(p);
    log.error('the prompt library has problems; fix them (npm run prompts) before registering');
    return 1;
  }
  const manifestPath = join(args.root, 'manifest.json');
  let records = readJson<ManifestRecord[]>(manifestPath, []);
  const tools = readJson<ToolRecord[]>(join(args.root, 'tools.json'), []);
  const toolProblems = validateTools(tools);
  if (toolProblems.length > 0) {
    for (const p of toolProblems) log.error(p);
    return 1;
  }
  // Audio segment folders first (a dry run only lists them).
  const segmentDirs: string[] = [];
  const walk = (dir: string): void => {
    const abs = join(args.root, dir);
    if (!existsSync(abs)) return;
    for (const name of readdirSync(abs).sort()) {
      const rel = `${dir}/${name}`;
      if (!statSync(join(args.root, rel)).isDirectory()) continue;
      const e = lib.expected.get(name);
      if (e && e.kind === 'audio') {
        segmentDirs.push(rel);
        if (args.flags.has('dry-run')) log.log(`would join the segments in ${rel}/ into ${e.file}`);
        else joinSegments(args.root, rel, e.file, log);
      } else walk(rel);
    }
  };
  walk('audio');
  const byFile = new Map(records.map((r) => [r.file, r]));
  const files = [...listFiles(args.root, 'art'), ...listFiles(args.root, 'audio')].filter(
    (p) => !segmentDirs.some((d) => p.startsWith(`${d}/`)),
  );
  const todo: { path: string; bytes: Uint8Array; hash: string }[] = [];
  let failed = 0;
  for (const path of files) {
    const bytes = new Uint8Array(readFileSync(join(args.root, path)));
    if (isLfsPointer(bytes)) {
      log.error(`refused ${path}: a Git LFS pointer, not the file; run git lfs pull first`);
      failed++;
      continue;
    }
    const hash = sha256(bytes);
    const rec = byFile.get(path);
    if (rec && rec.sha256 === hash) continue;
    if (
      rec &&
      (rec.status === 'approved' || rec.status === 'retired') &&
      !args.flags.has('replace')
    ) {
      log.error(
        `refused ${path}: its ${rec.status} record has another hash; pass --replace to register the new file`,
      );
      failed++;
      continue;
    }
    todo.push({ path, bytes, hash });
  }
  if (todo.length === 0) {
    log.log(failed > 0 ? `nothing registered, ${failed} refused` : 'nothing new to register');
    return failed > 0 ? 1 : 0;
  }
  let tool = flag(args, 'tool');
  let toolVersion = flag(args, 'tool-version');
  const interactive = process.stdin.isTTY && !args.flags.has('yes');
  if (!tool && interactive)
    tool = await ask(
      `generator tool id (${tools.map((t) => t.id).join(', ') || 'register one in tools.json first'}): `,
    );
  if (!toolVersion && interactive)
    toolVersion = (await ask(`tool or model version [${today()}]: `)) || today();
  const toolRec = tools.find((t) => t.id === tool);
  if (!tool || !toolRec) {
    log.error(
      `unknown tool "${tool ?? ''}": register it in tools.json (assets/README.md 3.2) and pass --tool`,
    );
    return 1;
  }
  if (!toolRec.commercialUse) {
    log.error(
      `tool ${toolRec.id} does not allow commercial use; its output may not enter the game`,
    );
    return 1;
  }
  const generatedAt = flag(args, 'date') ?? today();
  let added = 0;
  for (const f of todo) {
    const m = matchFile(f.path, lib.expected);
    if (!m.ok) {
      log.error(`refused ${m.error}`);
      failed++;
      continue;
    }
    if ((m.entry.kind === 'image' ? 'image' : 'audio') !== toolRec.kind) {
      log.error(`refused ${f.path}: tool ${toolRec.id} is a ${toolRec.kind} tool`);
      failed++;
      continue;
    }
    const prev = byFile.get(f.path);
    const refs = flag(args, 'refs');
    const rec = newRecord(m.entry, {
      tool: toolRec.id,
      toolVersion: toolVersion ?? generatedAt,
      seed: flag(args, 'seed'),
      refs: refs
        ? refs
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : (lib.expected.get(m.entry.id)?.deps ?? []),
      generatedAt,
      sha256: f.hash,
      aigcLabel: labelOf(f.path, f.bytes),
      converted: args.flags.has('converted'),
      promptLang: flag(args, 'lang') === 'en' ? 'en' : 'zh',
      notes:
        flag(args, 'notes') ?? (prev ? `replaces the file registered on ${prev.generatedAt}` : ''),
    });
    records = upsertRecord(records, rec);
    added++;
    log.log(
      `${prev ? 'replaced' : 'registered'} ${rec.id} (${rec.file}, label ${rec.aigcLabel === 'none' ? 'none' : 'found'})`,
    );
  }
  if (added > 0 && !args.flags.has('dry-run')) writeText(manifestPath, manifestJson(records));
  log.log(`${added} registered, ${failed} refused`);
  return failed > 0 ? 1 : 0;
}

if (isMain(import.meta.url)) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
