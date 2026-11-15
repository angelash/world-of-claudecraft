// Open-source reference mirrors for the RTS, SLG and city-building research
// (docs/10_research/open_source/README.md). Each entry in manifest.json is a
// read-only study copy: a blobless, shallow, sparse checkout pinned to the commit
// the research read, placed OUTSIDE this repository so GPL code and untrusted
// files never reach the repo, its scanners or its builds. Nothing inside a mirror
// is ever executed; git LFS smudging is disabled.
//
//   node tools/refs/fetch_refs.ts --dir D:/hakoniwa_refs [--tier must|optional|all]
//        [--only id,id] [--update] [--latest] [--dry-run] [--list]
//
// The directory may also come from HAKONIWA_REFS_DIR. The pure parts (manifest
// validation, target resolution, git step planning) are unit tested in
// tests/refs_manifest.test.ts.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type RefTier = 'must' | 'optional';

export interface RefEntry {
  id: string;
  name: string;
  /** Anchor in the open-share source index, or null for a supplement outside it. */
  indexAnchor: string | null;
  repo: string;
  commit: string;
  commitDate: string;
  codeLicense: string;
  assetLicense: string;
  language: string;
  tier: RefTier;
  /** Cone-mode directories to materialize; root-level files are always included. */
  sparsePaths: string[];
  topics: string[];
  /** Research document under docs/10_research/open_source/ that covers the entry. */
  doc: string;
  summary: string;
}

export interface RefManifest {
  version: 1;
  researched: string;
  entries: RefEntry[];
}

const ID = /^[a-z0-9_]+$/;
const SHA = /^[0-9a-f]{40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ANCHOR = /^(native|web|library|tool|mobile|engine|source|ai)-[a-z0-9-]+$/;
// Inner spaces and '&' occur in real data folders (Unciv "Civ V - Gods & Kings"); git
// receives argv entries without a shell, so they need no quoting.
const SEGMENT = /^[A-Za-z0-9_](?:[A-Za-z0-9_.+ &-]*[A-Za-z0-9_.+&-])?$/;
const DOC = /^[a-z0-9_]+\.md$/;
const TIERS: readonly string[] = ['must', 'optional'];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** A cone path is a relative directory: no leading slash, no empty, dot or dot-dot segment. */
export function isSafeSparsePath(p: string): boolean {
  if (p === '' || p.length > 200 || p.startsWith('/') || p.endsWith('/')) return false;
  return p.split('/').every((s) => s !== '.' && s !== '..' && SEGMENT.test(s));
}

/** Every problem found in a parsed manifest; an empty list means it is valid. */
export function validateManifest(data: unknown): string[] {
  const problems: string[] = [];
  if (typeof data !== 'object' || data === null) return ['manifest is not an object'];
  const m = data as Record<string, unknown>;
  if (m.version !== 1) problems.push('version must be 1');
  if (typeof m.researched !== 'string' || !DATE.test(m.researched)) {
    problems.push('researched must be YYYY-MM-DD');
  }
  if (!Array.isArray(m.entries) || m.entries.length === 0) {
    problems.push('entries must be a non-empty array');
    return problems;
  }
  const seen = new Set<string>();
  m.entries.forEach((raw, i) => {
    const at = `entries[${i}]`;
    if (typeof raw !== 'object' || raw === null) {
      problems.push(`${at} is not an object`);
      return;
    }
    const e = raw as Record<string, unknown>;
    const id = typeof e.id === 'string' ? e.id : '';
    const where = id ? `${at} (${id})` : at;
    if (!ID.test(id)) problems.push(`${where}: id must match ${ID}`);
    else if (seen.has(id)) problems.push(`${where}: duplicate id`);
    seen.add(id);
    for (const key of ['name', 'codeLicense', 'assetLicense', 'language', 'summary'] as const) {
      if (typeof e[key] !== 'string' || (e[key] as string).trim() === '') {
        problems.push(`${where}: ${key} must be a non-empty string`);
      }
    }
    if (
      e.indexAnchor !== null &&
      (typeof e.indexAnchor !== 'string' || !ANCHOR.test(e.indexAnchor))
    ) {
      problems.push(`${where}: indexAnchor must be null or an index anchor like native-139`);
    }
    if (
      typeof e.repo !== 'string' ||
      !/^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9._~/-]+$/.test(e.repo)
    ) {
      problems.push(`${where}: repo must be an https URL`);
    }
    if (typeof e.commit !== 'string' || !SHA.test(e.commit)) {
      problems.push(`${where}: commit must be a full 40-hex sha`);
    }
    if (typeof e.commitDate !== 'string' || !DATE.test(e.commitDate)) {
      problems.push(`${where}: commitDate must be YYYY-MM-DD`);
    }
    if (typeof e.tier !== 'string' || !TIERS.includes(e.tier)) {
      problems.push(`${where}: tier must be one of ${TIERS.join(', ')}`);
    }
    if (!isStringArray(e.sparsePaths)) {
      problems.push(`${where}: sparsePaths must be a string array`);
    } else {
      for (const p of e.sparsePaths) {
        if (!isSafeSparsePath(p))
          problems.push(`${where}: unsafe sparse path ${JSON.stringify(p)}`);
      }
    }
    if (!isStringArray(e.topics) || e.topics.length === 0) {
      problems.push(`${where}: topics must be a non-empty string array`);
    }
    if (typeof e.doc !== 'string' || !DOC.test(e.doc)) {
      problems.push(`${where}: doc must be a research file name like rts.md`);
    }
  });
  return problems;
}

export type TargetResult = { ok: true; dir: string } | { ok: false; reason: string };

/** Resolve the mirror root; it must be given and must lie outside the repository. */
export function resolveRefsDir(
  given: string | undefined,
  repoRoot: string,
  cwd: string,
): TargetResult {
  if (!given || given.trim() === '') return { ok: false, reason: 'missing_dir' };
  const dir = resolve(cwd, given);
  const rel = relative(resolve(repoRoot), dir);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    return { ok: false, reason: 'inside_repo' };
  }
  return { ok: true, dir };
}

export interface PlanOptions {
  /** The mirror directory already holds a git checkout. */
  exists: boolean;
  /** Track the default branch tip instead of the pinned commit. */
  latest: boolean;
}

/**
 * The git argument lists that create or move one mirror. A fresh mirror is a
 * shallow blobless clone with no checkout; the cone is set before any blob is
 * fetched, then the pinned commit is fetched and checked out, so only the listed
 * directories (and root files such as LICENSE) are ever downloaded.
 */
export function planGitSteps(entry: RefEntry, target: string, opts: PlanOptions): string[][] {
  const steps: string[][] = [];
  if (!opts.exists) {
    steps.push([
      '-c',
      'core.longpaths=true',
      'clone',
      '--quiet',
      '--config',
      'core.longpaths=true',
      '--filter=blob:none',
      '--depth',
      '1',
      '--no-checkout',
      '--sparse',
      entry.repo,
      target,
    ]);
  }
  steps.push(['-C', target, 'sparse-checkout', 'set', '--cone', ...entry.sparsePaths]);
  if (opts.latest) {
    steps.push(['-C', target, 'fetch', '--quiet', '--depth', '1', '--filter=blob:none', 'origin']);
    steps.push(['-C', target, 'reset', '--quiet', '--hard', 'FETCH_HEAD']);
  } else {
    steps.push([
      '-C',
      target,
      'fetch',
      '--quiet',
      '--depth',
      '1',
      '--filter=blob:none',
      'origin',
      entry.commit,
    ]);
    steps.push(['-C', target, 'reset', '--quiet', '--hard', entry.commit]);
  }
  return steps;
}

export interface CliOptions {
  dir: string | undefined;
  tier: 'must' | 'optional' | 'all';
  only: string[];
  update: boolean;
  latest: boolean;
  dryRun: boolean;
  list: boolean;
}

export function parseArgs(
  argv: readonly string[],
  env: Record<string, string | undefined>,
): CliOptions {
  const opts: CliOptions = {
    dir: env.HAKONIWA_REFS_DIR,
    tier: 'all',
    only: [],
    update: false,
    latest: false,
    dryRun: false,
    list: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') opts.dir = argv[++i];
    else if (a === '--tier') {
      const t = argv[++i];
      if (t !== 'must' && t !== 'optional' && t !== 'all') throw new Error(`bad --tier ${t}`);
      opts.tier = t;
    } else if (a === '--only') opts.only = (argv[++i] ?? '').split(',').filter((s) => s !== '');
    else if (a === '--update') opts.update = true;
    else if (a === '--latest') opts.latest = opts.update = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--list') opts.list = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return opts;
}

export function selectEntries(manifest: RefManifest, opts: CliOptions): RefEntry[] {
  return manifest.entries.filter(
    (e) =>
      (opts.tier === 'all' || e.tier === opts.tier) &&
      (opts.only.length === 0 || opts.only.includes(e.id)),
  );
}

function git(args: string[]): string {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1', GIT_TERMINAL_PROMPT: '0' },
  }).trim();
}

function main(): number {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '../../..');
  const manifest = JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8')) as RefManifest;
  const problems = validateManifest(manifest);
  if (problems.length > 0) {
    for (const p of problems) console.error(`manifest: ${p}`);
    return 2;
  }
  const opts = parseArgs(process.argv.slice(2), process.env);
  const entries = selectEntries(manifest, opts);
  if (opts.list) {
    for (const e of entries) {
      console.log(`${e.tier.padEnd(8)} ${e.id.padEnd(18)} ${e.repo.padEnd(56)} ${e.codeLicense}`);
    }
    return 0;
  }
  const target = resolveRefsDir(opts.dir, repoRoot, process.cwd());
  if (!target.ok) {
    console.error(
      target.reason === 'missing_dir'
        ? 'pass --dir <path> or set HAKONIWA_REFS_DIR (a folder outside this repository)'
        : 'the mirror folder must be outside this repository',
    );
    return 2;
  }
  let failed = 0;
  for (const e of entries) {
    const dir = join(target.dir, e.id);
    const exists = existsSync(join(dir, '.git'));
    if (exists && !opts.update) {
      let head = '';
      try {
        head = git(['-C', dir, 'rev-parse', 'HEAD']);
      } catch {
        head = '';
      }
      const note = head === e.commit ? 'at pinned commit' : 'differs from pin, use --update';
      console.log(`skip ${e.id}: exists, ${note}`);
      continue;
    }
    const steps = planGitSteps(e, dir, { exists, latest: opts.latest });
    try {
      for (const s of steps) {
        if (opts.dryRun) console.log(`git ${s.join(' ')}`);
        else git(s);
      }
      if (!opts.dryRun) console.log(`ok ${e.id} -> ${dir}`);
    } catch (err) {
      failed++;
      console.error(`fail ${e.id}: ${(err as Error).message.split('\n')[0]}`);
    }
  }
  return failed === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main();
}
