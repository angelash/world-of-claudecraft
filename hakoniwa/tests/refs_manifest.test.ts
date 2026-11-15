// The open-source reference manifest (tools/refs/manifest.json) and the pure parts of
// its fetch tool: every entry is pinned, licensed, documented and safe to fetch, and a
// mirror can only land outside the repository as a sparse, blobless, pinned checkout.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isSafeSparsePath,
  parseArgs,
  planGitSteps,
  type RefEntry,
  type RefManifest,
  resolveRefsDir,
  selectEntries,
  validateManifest,
} from '../tools/refs/fetch_refs';

const HAKONIWA = resolve(__dirname, '..');
const REPO_ROOT = resolve(HAKONIWA, '..');
const MANIFEST_PATH = join(HAKONIWA, 'tools', 'refs', 'manifest.json');
const DOCS = join(HAKONIWA, 'docs', '10_research', 'open_source');
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as RefManifest;

const sample: RefEntry = {
  id: 'micropolis',
  name: 'Micropolis',
  indexAnchor: 'native-139',
  repo: 'https://github.com/SimHacker/micropolis',
  commit: 'c98f6b08519887b450d9be198bfca5237aab6d0c',
  commitDate: '2026-01-01',
  codeLicense: 'GPL-3.0',
  assetLicense: 'GPL-3.0',
  language: 'C++',
  tier: 'must',
  sparsePaths: ['MicropolisCore/src'],
  topics: ['city'],
  doc: 'city_builders.md',
  summary: 'sample',
};

function withEntry(patch: Partial<Record<keyof RefEntry, unknown>>): unknown {
  return { version: 1, researched: '2026-11-15', entries: [{ ...sample, ...patch }] };
}

describe('reference manifest', () => {
  it('validates with no problems', () => {
    expect(validateManifest(manifest)).toEqual([]);
  });

  it('points every entry at a research document that exists and names the project', () => {
    for (const e of manifest.entries) {
      const doc = join(DOCS, e.doc);
      expect(existsSync(doc), `${e.id} -> ${e.doc}`).toBe(true);
      expect(readFileSync(doc, 'utf8').includes(e.repo), `${e.doc} cites ${e.repo}`).toBe(true);
    }
  });

  it('pins the commit each research document recorded for the project', () => {
    for (const e of manifest.entries) {
      const text = readFileSync(join(DOCS, e.doc), 'utf8');
      expect(text.includes(e.commit), `${e.doc} records ${e.id} at ${e.commit}`).toBe(true);
    }
  });
});

describe('validateManifest negative cases', () => {
  it('accepts the well-formed sample', () => {
    expect(validateManifest(withEntry({}))).toEqual([]);
  });

  it.each([
    ['short sha', { commit: 'abc123' }, 'commit'],
    ['non-https repo', { repo: 'http://github.com/x/y' }, 'repo'],
    ['ssh repo', { repo: 'git@github.com:x/y.git' }, 'repo'],
    ['bad id', { id: 'Micro-Polis' }, 'id'],
    ['bad tier', { tier: 'skip' }, 'tier'],
    ['parent sparse path', { sparsePaths: ['src/../..'] }, 'sparse'],
    ['absolute sparse path', { sparsePaths: ['/etc'] }, 'sparse'],
    ['empty license', { codeLicense: ' ' }, 'codeLicense'],
    ['bad anchor', { indexAnchor: 'http://x' }, 'indexAnchor'],
    ['bad doc', { doc: '../README.md' }, 'doc'],
    ['bad date', { commitDate: '2026/1/1' }, 'commitDate'],
    ['no topics', { topics: [] }, 'topics'],
  ])('rejects %s', (_label, patch, needle) => {
    const problems = validateManifest(withEntry(patch));
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain(needle);
  });

  it('rejects duplicate ids and a missing entries list', () => {
    const dup = { version: 1, researched: '2026-11-15', entries: [sample, sample] };
    expect(validateManifest(dup)).toEqual(['entries[1] (micropolis): duplicate id']);
    expect(validateManifest({ version: 1, researched: '2026-11-15', entries: [] })).toEqual([
      'entries must be a non-empty array',
    ]);
  });

  it('accepts a supplement with a null index anchor', () => {
    expect(validateManifest(withEntry({ indexAnchor: null }))).toEqual([]);
  });
});

describe('isSafeSparsePath', () => {
  it.each([
    'src',
    'binaries/data/mods/public/simulation',
    'data/tribes',
    'lib/c++',
    'android/assets/jsons/Civ V - Gods & Kings',
  ])('accepts %s', (p) => expect(isSafeSparsePath(p)).toBe(true));
  it.each([
    '',
    '/src',
    'src/',
    'a//b',
    '.',
    'a/./b',
    '..',
    'a/../b',
    ' a',
    'a ',
    'a/ b',
    '.git',
    'a;b',
    'a\\b',
    'a:b',
  ])('rejects %j', (p) => expect(isSafeSparsePath(p)).toBe(false));
});

describe('resolveRefsDir', () => {
  it('requires a directory', () => {
    expect(resolveRefsDir(undefined, REPO_ROOT, REPO_ROOT)).toEqual({
      ok: false,
      reason: 'missing_dir',
    });
    expect(resolveRefsDir('  ', REPO_ROOT, REPO_ROOT)).toEqual({
      ok: false,
      reason: 'missing_dir',
    });
  });

  it('refuses the repository itself and any folder inside it', () => {
    for (const d of [REPO_ROOT, join(REPO_ROOT, 'hakoniwa', 'refs'), 'hakoniwa/.refs']) {
      expect(resolveRefsDir(d, REPO_ROOT, REPO_ROOT)).toEqual({ ok: false, reason: 'inside_repo' });
    }
  });

  it('accepts a sibling folder outside the repository', () => {
    const r = resolveRefsDir('../hakoniwa_refs', REPO_ROOT, REPO_ROOT);
    expect(r).toEqual({ ok: true, dir: resolve(REPO_ROOT, '..', 'hakoniwa_refs') });
  });
});

describe('planGitSteps', () => {
  const target = resolve(REPO_ROOT, '..', 'hakoniwa_refs', 'micropolis');

  it('creates a shallow blobless sparse clone, sets the cone, then checks out the pin', () => {
    const steps = planGitSteps(sample, target, { exists: false, latest: false });
    expect(steps).toHaveLength(4);
    const [clone, cone, fetch, reset] = steps;
    for (const flag of ['--filter=blob:none', '--no-checkout', '--sparse', '--depth']) {
      expect(clone).toContain(flag);
    }
    expect(clone.slice(-2)).toEqual([sample.repo, target]);
    expect(cone).toEqual(['-C', target, 'sparse-checkout', 'set', '--cone', 'MicropolisCore/src']);
    expect(fetch.slice(-2)).toEqual(['origin', sample.commit]);
    expect(fetch).toContain('--filter=blob:none');
    expect(reset).toEqual(['-C', target, 'reset', '--quiet', '--hard', sample.commit]);
  });

  it('moves an existing mirror without recloning', () => {
    const steps = planGitSteps(sample, target, { exists: true, latest: false });
    expect(steps.some((s) => s.includes('clone'))).toBe(false);
    expect(steps.at(-1)).toEqual(['-C', target, 'reset', '--quiet', '--hard', sample.commit]);
  });

  it('tracks the remote tip only when asked', () => {
    const steps = planGitSteps(sample, target, { exists: true, latest: true });
    expect(steps.flat()).not.toContain(sample.commit);
    expect(steps.at(-1)).toEqual(['-C', target, 'reset', '--quiet', '--hard', 'FETCH_HEAD']);
  });
});

describe('parseArgs and selectEntries', () => {
  it('reads the folder from the environment and flags from argv', () => {
    const o = parseArgs(['--tier', 'must', '--only', 'a,b', '--dry-run'], {
      HAKONIWA_REFS_DIR: 'D:/refs',
    });
    expect(o).toMatchObject({ dir: 'D:/refs', tier: 'must', only: ['a', 'b'], dryRun: true });
    expect(o.update).toBe(false);
  });

  it('treats --latest as an update and rejects unknown input', () => {
    expect(parseArgs(['--latest'], {})).toMatchObject({ latest: true, update: true });
    expect(() => parseArgs(['--tier', 'skip'], {})).toThrow('bad --tier');
    expect(() => parseArgs(['--force'], {})).toThrow('unknown argument');
  });

  it('filters by tier and id', () => {
    const m: RefManifest = {
      version: 1,
      researched: '2026-11-15',
      entries: [sample, { ...sample, id: 'other', tier: 'optional' }],
    };
    const base = parseArgs([], {});
    expect(selectEntries(m, { ...base, tier: 'optional' }).map((e) => e.id)).toEqual(['other']);
    expect(selectEntries(m, { ...base, only: ['micropolis'] }).map((e) => e.id)).toEqual([
      'micropolis',
    ]);
    expect(selectEntries(m, base)).toHaveLength(2);
  });
});
