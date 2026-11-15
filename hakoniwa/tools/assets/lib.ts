// File-system side of the asset tools: argument parsing, JSON and file listing helpers, and
// the prompt library view the tools match files against. The prompt library is read through
// tools/prompts/build.ts (buildAll for validation and the expected-asset manifest with prompt
// fingerprints; buildLibrary for template and style definitions), never re-implemented here.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAll,
  buildLibrary,
  type Library,
  type ManifestRow,
  type SpecFile,
  type TemplateFile,
} from '../prompts/build';
import type { ExpectedEntry } from './core/manifest';

export const HAKONIWA_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export interface Args {
  /** The assets/ directory. */
  root: string;
  /** The prompt library directory (assets/prompts by default). */
  prompts: string;
  flags: Map<string, string | true>;
  positional: string[];
}

export function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) flags.set(a.slice(2, eq), a.slice(eq + 1));
      else if (i + 1 < argv.length && !argv[i + 1]!.startsWith('--'))
        flags.set(a.slice(2), argv[++i]!);
      else flags.set(a.slice(2), true);
    } else positional.push(a);
  }
  const root = resolve(String(flags.get('root') ?? join(HAKONIWA_ROOT, 'assets')));
  const prompts = resolve(String(flags.get('prompts') ?? join(root, 'prompts')));
  return { root, prompts, flags, positional };
}

export function flag(args: Args, name: string): string | undefined {
  const v = args.flags.get(name);
  return typeof v === 'string' ? v : undefined;
}

export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export function writeBytes(path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

export function jsonText(value: unknown): string {
  return `${JSON.stringify(value, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v), 2)}\n`;
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Files under `root/sub`, as paths relative to `root` with forward slashes, sorted. */
export function listFiles(root: string, sub: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith('.')) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(root, p).split(sep).join('/'));
    }
  };
  walk(join(root, sub));
  return out;
}

export interface LibraryEntry extends ExpectedEntry {
  category: string;
  deps: string[];
  extra?: { zh?: string; en?: string };
}

export interface PromptLibrary {
  problems: string[];
  expected: Map<string, LibraryEntry>;
  templates: Library['templates'];
  styles: Library['styles'];
}

const libraryCache = new Map<string, { signature: string; lib: PromptLibrary }>();

/** Modification times of every library source file (the cache key of loadLibrary). */
function librarySignature(promptsDir: string): string {
  const files = ['templates.json', 'templates_audio.json'].map((n) => join(promptsDir, n));
  const specDir = join(promptsDir, 'specs');
  if (existsSync(specDir))
    for (const n of readdirSync(specDir).sort()) files.push(join(specDir, n));
  return files
    .map((f) => {
      if (!existsSync(f)) return f;
      const s = statSync(f);
      return `${f}:${s.mtimeMs}:${s.size}`;
    })
    .join('|');
}

/** The prompt library as the asset tools need it (expected entries keyed by id), cached per source state. */
export function loadLibrary(promptsDir: string): PromptLibrary {
  const signature = librarySignature(promptsDir);
  const hit = libraryCache.get(promptsDir);
  if (hit && hit.signature === signature) return hit.lib;
  const lib = readLibrary(promptsDir);
  libraryCache.set(promptsDir, { signature, lib });
  return lib;
}

function readLibrary(promptsDir: string): PromptLibrary {
  const built = buildAll(promptsDir);
  const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
  const templateFiles = ['templates.json', 'templates_audio.json']
    .filter((n) => existsSync(join(promptsDir, n)))
    .map((n) => ({ name: n, data: read<TemplateFile>(join(promptsDir, n)) }));
  const { library } = buildLibrary(templateFiles);
  const expected = new Map<string, LibraryEntry>();
  if (built.problems.length > 0)
    return {
      problems: built.problems,
      expected,
      templates: library.templates,
      styles: library.styles,
    };
  const items = new Map<string, SpecFile['items'][number]>();
  const specDir = join(promptsDir, 'specs');
  if (existsSync(specDir)) {
    for (const n of readdirSync(specDir)
      .filter((f) => f.endsWith('.json'))
      .sort()) {
      for (const it of read<SpecFile>(join(specDir, n)).items) items.set(it.id, it);
    }
  }
  const rows = JSON.parse(built.files.get('manifest.json') ?? '[]') as ManifestRow[];
  for (const r of rows) {
    const it = items.get(r.id);
    expected.set(r.id, {
      id: r.id,
      kind: r.kind,
      file: r.file,
      template: r.template,
      milestone: r.milestone,
      promptHash: r.promptHash,
      category: r.category,
      ...(it?.style ? { style: it.style } : {}),
      deps: it?.deps ?? [],
      ...(it?.extra ? { extra: it.extra } : {}),
    });
  }
  return { problems: [], expected, templates: library.templates, styles: library.styles };
}

export interface Logger {
  log: (line: string) => void;
  error: (line: string) => void;
}

export const consoleLogger: Logger = { log: (l) => console.log(l), error: (l) => console.error(l) };

/** True when this module is the process entry point. */
export function isMain(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return resolve(fileURLToPath(metaUrl)) === resolve(entry);
  } catch {
    return false;
  }
}

/** Local calendar date YYYY-MM-DD (registration date default). */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
