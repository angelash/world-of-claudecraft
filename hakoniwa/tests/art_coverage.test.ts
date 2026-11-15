// Art coverage and the milestone gate (art_pipeline.md 6.6 and 15.4; tools/assets/core/
// coverage.ts). Always on: the import alias table agrees with the prompt library and the gate
// logic is exercised on synthetic manifests. The real gate runs only when ART_GATE names a
// milestone (ART_GATE=M0 npm test): every entry of that milestone and the earlier ones must be
// registered, approved and processed, and (from M1) every non-humanoid monster in the combat
// data must have art, counting alias subjects as covered.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ART_ALIASES, artSubject, canonicalAssetId } from '../tools/assets/core/aliases';
import { gateMilestones, gateReport, uncoveredContent } from '../tools/assets/core/coverage';
import type { ExpectedEntry, ManifestRecord } from '../tools/assets/core/manifest';
import {
  type ArtMeta,
  IMPORT_VERSION,
  metaPathOf,
  processedPathOf,
} from '../tools/assets/core/meta';
import { newRecord } from '../tools/assets/core/register';
import { isReference } from '../tools/assets/core/template_specs';
import { loadLibrary } from '../tools/assets/lib';

const ASSETS = join(__dirname, '..', 'assets');
const lib = loadLibrary(join(ASSETS, 'prompts'));
const ids = [...lib.expected.keys()];

const isRefTemplate = (t: string): boolean => {
  const def = lib.templates[t];
  return !!def && def.kind === 'image' && isReference(def);
};

describe('import alias table', () => {
  it('names the four shared-art subjects of the development plan', () => {
    expect(ART_ALIASES).toEqual({
      dian_wolf: 'grey_wolf',
      dian_boar: 'forest_boar',
      ashhorn_deer: 'greyelm_deer',
      mudspawn: 'mud_fiend',
    });
    expect(artSubject('dian_wolf')).toBe('grey_wolf');
    expect(artSubject('grey_wolf')).toBe('grey_wolf');
    expect(canonicalAssetId('art_mon_mudspawn_ref')).toBe('art_mon_mud_fiend_ref');
    expect(canonicalAssetId('art_mon_dian_rat_d')).toBeNull();
  });

  it('every alias target has a full sheet set and no entry is named after an alias subject', () => {
    expect(lib.problems).toEqual([]);
    for (const [alias, subject] of Object.entries(ART_ALIASES)) {
      for (const suffix of ['ref', 'd', 'r', 'u'])
        expect(ids, `${subject} ${suffix}`).toContain(`art_mon_${subject}_${suffix}`);
      expect(
        ids.filter((id) => id.startsWith(`art_mon_${alias}_`) || id === `art_mon_${alias}`),
      ).toEqual([]);
    }
  });

  it('counts alias subjects as covered in the content report', () => {
    expect(
      uncoveredContent(['dian_wolf', 'dian_boar', 'ashhorn_deer', 'mudspawn', 'dian_rat'], ids, [
        'art_mon_',
        'art_boss_',
      ]),
    ).toEqual([]);
    expect(uncoveredContent(['no_such_beast'], ids, ['art_mon_'])).toEqual(['no_such_beast']);
  });
});

describe('milestone gate logic', () => {
  const entries: ExpectedEntry[] = [
    {
      id: 'art_a',
      kind: 'image',
      file: 'art/x/art_a.png',
      template: 'mon_small',
      milestone: 'M0',
      promptHash: '0'.repeat(12),
    },
    {
      id: 'art_a_ref',
      kind: 'image',
      file: 'art/x/ref/art_a_ref.png',
      template: 'mon_turnaround',
      milestone: 'M0',
      promptHash: '0'.repeat(12),
    },
    {
      id: 'art_b',
      kind: 'image',
      file: 'art/x/art_b.png',
      template: 'mon_small',
      milestone: 'M1',
      promptHash: '0'.repeat(12),
    },
    {
      id: 'art_c',
      kind: 'image',
      file: 'art/x/art_c.png',
      template: 'mon_small',
      milestone: 'M2',
      promptHash: '0'.repeat(12),
    },
  ];
  const rec = (e: ExpectedEntry, status: ManifestRecord['status']): ManifestRecord => ({
    ...newRecord(e, {
      tool: 't',
      toolVersion: 'v',
      generatedAt: '2026-11-20',
      sha256: 'f'.repeat(64),
      aigcLabel: 'none',
    }),
    status,
  });

  it('a gate covers its milestone and the earlier ones', () => {
    expect(gateMilestones('m1')).toEqual(['M0', 'M1']);
    expect(() => gateMilestones('M9')).toThrow();
  });

  it('reports missing, unapproved and unprocessed entries; references need approval only', () => {
    const records = [
      rec(entries[0]!, 'approved'),
      rec(entries[1]!, 'approved'),
      rec(entries[2]!, 'rework'),
    ];
    const none = gateReport(entries, records, () => false, 'M1', isRefTemplate);
    expect(none).toEqual({ missing: [], notApproved: ['art_b'], notProcessed: ['art_a'] });
    const ok = gateReport(entries, records, () => true, 'M0', isRefTemplate);
    expect(ok).toEqual({ missing: [], notApproved: [], notProcessed: [] });
    expect(gateReport(entries, [], () => true, 'M2', isRefTemplate).missing).toEqual([
      'art_a',
      'art_a_ref',
      'art_b',
      'art_c',
    ]);
  });
});

const GATE = process.env.ART_GATE;

describe.skipIf(!GATE)(`art gate ${GATE ?? '(off)'}`, () => {
  const records = JSON.parse(
    readFileSync(join(ASSETS, 'manifest.json'), 'utf8'),
  ) as ManifestRecord[];
  const processedOk = (r: ManifestRecord): boolean => {
    const metaPath = join(ASSETS, metaPathOf(r.file));
    if (!existsSync(metaPath)) return false;
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as ArtMeta;
    // Current result from the registered original; the import's heuristic findings were settled
    // by the reviewer's approval (technical failures stay red in npm run assets:check).
    if (meta.importVersion !== IMPORT_VERSION || meta.source.sha256 !== r.sha256) return false;
    return r.kind === 'audio' || existsSync(join(ASSETS, processedPathOf(r.file)));
  };

  it('every entry up to the gate milestone is approved and processed', () => {
    const report = gateReport(lib.expected.values(), records, processedOk, GATE!, isRefTemplate);
    expect(report).toEqual({ missing: [], notApproved: [], notProcessed: [] });
  });

  it.skipIf(GATE === 'M0')(
    'every non-humanoid monster in the combat data has art (aliases count)',
    () => {
      const data = JSON.parse(
        readFileSync(join(__dirname, '..', 'data', 'combat', 'monsters.json'), 'utf8'),
      );
      const list = (Array.isArray(data) ? data : data.monsters) as { id: string; family: string }[];
      const beasts = list.filter((m) => m.family !== 'humanoid').map((m) => m.id);
      expect(uncoveredContent(beasts, ids, ['art_mon_', 'art_boss_'])).toEqual([]);
    },
  );
});
