// Disk inputs of the content tools (the validators themselves are pure): the data files
// under data/ (without the tooling directories _staging/ and _batches/), the system and
// game sources for the flag index, the prompt library's asset ids, and the ValidationInput
// built from them (with the interface text), optionally with a staged batch applied. Runs under
// Vite's module runner (tools/content/validate.ts), because the content packs are
// assembled with import.meta.glob.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allPacks, buildContent } from '../../src/content';
import { ENDING_ROUTES } from '../../src/game/autoplay';
import { routeProblems } from '../../src/game/autoplay/routes';
import { createGame } from '../../src/game/create';
import { T } from '../../src/shared_ui/text';
import { loadLibrary } from '../assets/lib';
import { applyBatch, isToolingFile, overlayContent, type StagedBatch } from './catalog/batch';
import { flattenText } from './validators/names';
import type { ValidationInput } from './validators/types';

/** hakoniwa/ (this file lives in hakoniwa/tools/content/). */
export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

const rel = (from: string, p: string) => relative(from, p).split(sep).join('/');

function walk(dir: string, ext: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

/** Every content data file, keyed by path under data/ (tooling directories excluded). */
export function readDataFiles(root = ROOT): Map<string, unknown> {
  const dataRoot = join(root, 'data');
  const out = new Map<string, unknown>();
  for (const p of walk(dataRoot, '.json')) {
    const key = rel(dataRoot, p);
    if (isToolingFile(key)) continue;
    out.set(key, JSON.parse(readFileSync(p, 'utf8')));
  }
  return out;
}

/** System and game sources keyed by path under src/ (the editor's flag index input). */
export function readCodeSources(root = ROOT): Record<string, string> {
  const src = join(root, 'src');
  const out: Record<string, string> = {};
  for (const dir of ['systems', 'game'])
    for (const p of walk(join(src, dir), '.ts')) out[rel(src, p)] = readFileSync(p, 'utf8');
  return out;
}

/** Asset ids of the prompt library's requirement list, or undefined when it cannot load. */
export function readAssetIds(root = ROOT): Set<string> | undefined {
  try {
    const lib = loadLibrary(join(root, 'assets', 'prompts'));
    return new Set(lib.expected.keys());
  } catch {
    return undefined;
  }
}

export interface LoadOptions {
  milestone: number;
  root?: string;
  /** validate the data as if this staged batch were promoted */
  batch?: StagedBatch;
}

/** The full validation input from disk. */
export function loadValidationInput(opts: LoadOptions): ValidationInput {
  const root = opts.root ?? ROOT;
  const packs = allPacks();
  const base = buildContent(packs);
  const disk = readDataFiles(root);
  const content = opts.batch ? overlayContent(base, disk, opts.batch) : base;
  const files = opts.batch ? applyBatch(disk, opts.batch) : disk;
  return {
    content,
    packs,
    files,
    milestone: opts.milestone,
    codeSources: readCodeSources(root),
    initialFlags: { ...createGame({ aiMode: 'off', content }).world.meta.flags },
    assetIds: readAssetIds(root),
    uiText: flattenText(T),
    endingRoutes: [...ENDING_ROUTES],
    routeProblems: routeProblems(content),
  };
}
