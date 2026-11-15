// The asset manifest and tool register (assets/README.md 3; art_pipeline.md 6.5 and 6.6):
// field validation, the two-way record and file reconciliation, the prompt-changed list,
// registration matching (folders, aliases, closest ids, implicit labels), the committed
// manifest's state, and the four command-line entries end to end on a temporary assets folder
// with code-generated sample images (assets:check must name the reason codes of bad samples).

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { run as runAtlas } from '../tools/assets/atlas';
import { run as runCheck } from '../tools/assets/check';
import {
  type ExpectedEntry,
  type ManifestRecord,
  manifestJson,
  promptChanged,
  reconcile,
  type ToolRecord,
  upsertRecord,
  validateManifest,
  validateTools,
} from '../tools/assets/core/manifest';
import { metaPathOf, processedPathOf } from '../tools/assets/core/meta';
import { decodePng, encodePng } from '../tools/assets/core/png';
import { aigcLabelOf, closestIds, matchFile, newRecord } from '../tools/assets/core/register';
import { labelChunks, nextStatus, run as runImport } from '../tools/assets/import';
import { type Logger, listFiles, loadLibrary } from '../tools/assets/lib';
import { isLfsPointer, run as runRegister } from '../tools/assets/register';
import { BEAST, creatureFrame, makeSheet } from './art_fixtures';

const ASSETS = join(__dirname, '..', 'assets');
const PROMPTS = join(ASSETS, 'prompts');

const TOOL: ToolRecord = {
  id: 'xiaojiu',
  name: '小九 AI',
  usedVersions: ['2026-11'],
  termsUrl: 'https://example.invalid/terms',
  termsCheckedAt: '2026-11-10',
  commercialUse: true,
  outputRights: '生成物归用户（条款摘录）',
  aigcLabel: '元数据 AIGC 字段',
  kind: 'image',
};

const RAT: ExpectedEntry = {
  id: 'art_mon_dian_rat_d',
  kind: 'image',
  file: 'art/monsters/art_mon_dian_rat_d.png',
  template: 'mon_small',
  milestone: 'M0',
  promptHash: '12b8678167d1',
  style: 'sealed_ruins',
};

function expectedMap(...es: ExpectedEntry[]): Map<string, ExpectedEntry> {
  return new Map(es.map((e) => [e.id, e]));
}

function record(over: Partial<ManifestRecord> = {}): ManifestRecord {
  return {
    ...newRecord(RAT, {
      tool: 'xiaojiu',
      toolVersion: '2026-11-20',
      generatedAt: '2026-11-20',
      sha256: 'b'.repeat(64),
      aigcLabel: 'none',
    }),
    ...over,
  };
}

describe('tools.json', () => {
  it('accepts a complete tool and flags missing or wrong fields', () => {
    expect(validateTools([TOOL])).toEqual([]);
    const bad = validateTools([
      { ...TOOL, commercialUse: 'yes', kind: 'video', termsCheckedAt: 'soon' },
      { id: 'xiaojiu' },
    ]);
    expect(bad.join('\n')).toMatch(/commercialUse/);
    expect(bad.join('\n')).toMatch(/kind must be/);
    expect(bad.join('\n')).toMatch(/termsCheckedAt/);
    expect(bad.join('\n')).toMatch(/duplicate tool id/);
  });
});

describe('manifest.json fields', () => {
  const ctx = {
    tools: [TOOL],
    expected: expectedMap(RAT, {
      ...RAT,
      id: 'art_mon_dian_rat_ref',
      file: 'art/monsters/ref/art_mon_dian_rat_ref.png',
      template: 'mon_turnaround',
    }),
  };

  it('a fresh registration record is valid and starts in review', () => {
    const r = record({ refs: ['art_mon_dian_rat_ref'] });
    expect(r.status).toBe('review');
    expect(validateManifest([r], ctx)).toEqual([]);
  });

  it('flags every class of bad record', () => {
    const cases: [Partial<ManifestRecord>, RegExp][] = [
      [{ tool: 'unknown' }, /not registered/],
      [
        { file: 'art/monsters/elsewhere.png' },
        /file must be art\/monsters\/art_mon_dian_rat_d.png/,
      ],
      [{ sha256: 'xyz' }, /sha256/],
      [{ promptHash: '' }, /promptHash must not be empty/],
      [{ status: 'approved' }, /approved needs reviewer/],
      [{ status: 'rework', reason: '' }, /needs reason codes/],
      [{ status: 'rework', reason: 'frames,blurry' }, /needs reason codes/],
      [{ refs: ['art_nope'] }, /ref art_nope/],
      [{ template: 'mon_medium' }, /template must be mon_small/],
      [{ milestone: 'M2' }, /milestone must be M0/],
      [{ style: 'wild_forest' }, /style must be/],
      [{ generatedAt: '20.11.2026' }, /generatedAt/],
      [{ promptLang: 'fr' as 'zh' }, /promptLang/],
      [{ id: 'art_unknown_thing' }, /no prompt entry/],
    ];
    for (const [over, re] of cases)
      expect(validateManifest([record(over)], ctx).join('\n'), JSON.stringify(over)).toMatch(re);
    expect(validateManifest([record(), record()], ctx).join('\n')).toMatch(/duplicate id/);
    expect(validateManifest([record({ status: 'rework', reason: 'frames,scale' })], ctx)).toEqual(
      [],
    );
    const audioTool = { ...TOOL, id: 'xj_audio', kind: 'audio' as const };
    expect(
      validateManifest([record({ tool: 'xj_audio' })], { ...ctx, tools: [TOOL, audioTool] }).join(
        '\n',
      ),
    ).toMatch(/audio tool/);
    expect(
      validateManifest([record()], { ...ctx, tools: [{ ...TOOL, commercialUse: false }] }).join(
        '\n',
      ),
    ).toMatch(/commercial/);
  });

  it('reconciles records and files both ways', () => {
    const recs = [
      record(),
      record({ id: 'b', file: 'art/monsters/b.png' }),
      record({ id: 'c', file: 'art/monsters/c.png', status: 'rejected', reason: 'identity' }),
    ];
    const res = reconcile(recs, [
      { path: 'art/monsters/art_mon_dian_rat_d.png', sha256: 'c'.repeat(64) },
      { path: 'art/monsters/stray.png' },
    ]);
    expect(res).toEqual({
      missingFiles: ['art/monsters/b.png'],
      unregistered: ['art/monsters/stray.png'],
      hashMismatch: ['art/monsters/art_mon_dian_rat_d.png'],
    });
  });

  it('lists records generated from an older prompt for re-review', () => {
    expect(promptChanged([record({ promptHash: '000000000000' })], expectedMap(RAT))).toEqual([
      'art_mon_dian_rat_d',
    ]);
    expect(promptChanged([record()], expectedMap(RAT))).toEqual([]);
  });

  it('writes records sorted by id with every field in order', () => {
    const list = upsertRecord(upsertRecord([], record({ id: 'z' })), record());
    expect(list.map((r) => r.id)).toEqual(['art_mon_dian_rat_d', 'z']);
    const text = manifestJson(list);
    expect(text.endsWith('\n')).toBe(true);
    expect(Object.keys(JSON.parse(text)[0])).toEqual(Object.keys(record()));
  });
});

describe('registration matching (step 1)', () => {
  const lib = loadLibrary(PROMPTS);

  it('matches a file by name and folder', () => {
    const m = matchFile('art/monsters/art_mon_dian_rat_d.png', lib.expected);
    expect(m.ok && m.entry.template).toBe('mon_small');
    const wrong = matchFile('art/icons/art_mon_dian_rat_d.png', lib.expected);
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.suggestions).toEqual(['art/monsters/art_mon_dian_rat_d.png']);
  });

  it('refuses alias subjects and names the canonical file', () => {
    for (const [alias, canonical] of [
      ['art_mon_dian_wolf_d', 'art_mon_grey_wolf_d'],
      ['art_mon_dian_boar_r', 'art_mon_forest_boar_r'],
      ['art_mon_ashhorn_deer_u', 'art_mon_greyelm_deer_u'],
      ['art_mon_mudspawn_d', 'art_mon_mud_fiend_d'],
    ]) {
      const m = matchFile(`art/monsters/${alias}.png`, lib.expected);
      expect(m.ok, alias).toBe(false);
      if (!m.ok) {
        expect(m.suggestions).toEqual([canonical]);
        expect(m.error).toMatch(/alias/);
      }
    }
  });

  it('refuses unknown names with the closest ids of the same class', () => {
    const m = matchFile('art/monsters/art_mon_dian_ratt_d.png', lib.expected);
    expect(m.ok).toBe(false);
    if (!m.ok) expect(m.suggestions[0]).toBe('art_mon_dian_rat_d');
    expect(
      closestIds('art_ico_item_iron_ingt', ['art_ico_item_iron_ingot', 'art_mon_iron_ingot'])[0],
    ).toBe('art_ico_item_iron_ingot');
  });

  it('reads the implicit AIGC label from metadata, or none', () => {
    expect(aigcLabelOf({ AIGC: '{"Label":"1"}', Software: 'x' })).toBe('AIGC={"Label":"1"}');
    expect(aigcLabelOf({ Software: 'x' })).toBe('none');
    expect(aigcLabelOf({ AIGC_LABEL: ['a', 'b'] })).toBe('AIGC_LABEL=a; AIGC_LABEL=b');
  });
});

describe('the committed manifest', () => {
  it('manifest.json and tools.json are valid and match the files under art/ and audio/ both ways', () => {
    const lib = loadLibrary(PROMPTS);
    expect(lib.problems).toEqual([]);
    const tools = JSON.parse(readFileSync(join(ASSETS, 'tools.json'), 'utf8')) as ToolRecord[];
    const records = JSON.parse(
      readFileSync(join(ASSETS, 'manifest.json'), 'utf8'),
    ) as ManifestRecord[];
    expect(validateTools(tools)).toEqual([]);
    expect(validateManifest(records, { tools, expected: lib.expected })).toEqual([]);
    const files = [...listFiles(ASSETS, 'art'), ...listFiles(ASSETS, 'audio')].map((path) => ({
      path,
    }));
    expect(reconcile(records, files)).toEqual({
      missingFiles: [],
      unregistered: [],
      hashMismatch: [],
    });
  });
});

describe('assets:register, assets:import, assets:atlas, assets:check end to end', {
  timeout: 120_000,
}, () => {
  let root = '';
  const lines: string[] = [];
  const log: Logger = { log: (l) => lines.push(l), error: (l) => lines.push(l) };
  const args = () => [
    '--root',
    root,
    '--prompts',
    PROMPTS,
    '--contact',
    join(root, '..', 'contact'),
    '--yes',
  ];
  const drop = (file: string, bytes: Uint8Array) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), bytes);
  };
  const manifest = () =>
    JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as ManifestRecord[];
  const sheet = (blankFilled = false) => {
    const layout = [
      [0, 1, 2, 3, blankFilled ? 0 : null, null],
      [0, 1, 2, 3, 4, 5],
      [0, 1, 2, 3, null, null],
      [0, 1, 2, 3, 4, 5],
    ];
    return makeSheet(
      layout.map((row) => row.map((p) => (p === null ? null : creatureFrame(48, 43, BEAST, p)))),
      [48, 48],
      { block: 4, offset: [1, 1], fringe: true },
    );
  };

  beforeAll(() => {
    root = join(mkdtempSync(join(tmpdir(), 'hk-assets-')), 'assets');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'tools.json'), `${JSON.stringify([TOOL], null, 2)}\n`);
    writeFileSync(join(root, 'manifest.json'), '[]\n');
    drop(
      'art/monsters/art_mon_dian_rat_d.png',
      encodePng(sheet(), { AIGC: '{"Label":"1","ProduceID":"t-1"}' }),
    );
    drop('art/monsters/art_mon_dian_rat_u.png', encodePng(sheet(true)));
  });

  afterAll(() => {
    if (root) rmSync(join(root, '..'), { recursive: true, force: true });
  });

  it('register writes review records with hash, fingerprint and label; alias names are refused', async () => {
    drop('art/monsters/art_mon_dian_wolf_d.png', encodePng(sheet()));
    const code = await runRegister(
      [...args(), '--tool', 'xiaojiu', '--tool-version', 'v3', '--date', '2026-11-20'],
      log,
    );
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(
      /art_mon_dian_wolf_d is an alias subject.*art_mon_grey_wolf_d/,
    );
    rmSync(join(root, 'art/monsters/art_mon_dian_wolf_d.png'));
    const recs = manifest();
    expect(recs.map((r) => r.id)).toEqual(['art_mon_dian_rat_d', 'art_mon_dian_rat_u']);
    const rat = recs[0]!;
    expect(rat).toMatchObject({
      status: 'review',
      tool: 'xiaojiu',
      toolVersion: 'v3',
      generatedAt: '2026-11-20',
      template: 'mon_small',
      milestone: 'M0',
    });
    expect(rat.aigcLabel).toBe('AIGC={"Label":"1","ProduceID":"t-1"}');
    expect(rat.promptHash).toBe(
      loadLibrary(PROMPTS).expected.get('art_mon_dian_rat_d')!.promptHash,
    );
    expect(rat.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rat.refs).toEqual(['art_mon_dian_rat_ref']);
  });

  it('import processes both, sends the bad grid to rework with frames, and writes a contact sheet', async () => {
    lines.length = 0;
    const code = await runImport(args(), log);
    expect(code).toBe(1);
    const recs = manifest();
    expect(recs.find((r) => r.id === 'art_mon_dian_rat_d')).toMatchObject({
      status: 'review',
      reason: '',
    });
    expect(recs.find((r) => r.id === 'art_mon_dian_rat_u')).toMatchObject({
      status: 'rework',
      reason: 'frames',
    });
    const png = decodePng(
      new Uint8Array(
        readFileSync(join(root, processedPathOf('art/monsters/art_mon_dian_rat_d.png'))),
      ),
    );
    expect([png.w, png.h]).toEqual([288, 192]);
    expect(png.text.AIGC).toBe('{"Label":"1","ProduceID":"t-1"}');
    expect(existsSync(join(root, metaPathOf('art/monsters/art_mon_dian_rat_d.png')))).toBe(true);
    expect(existsSync(join(root, '..', 'contact', 'contact.png'))).toBe(true);
    expect(readFileSync(join(root, '..', 'contact', 'contact.md'), 'utf8')).toContain(
      'art_mon_dian_rat_u',
    );
    // A second run skips results that are current.
    lines.length = 0;
    await runImport([...args(), '--id', 'art_mon_dian_rat_d'], log);
    expect(lines.join('\n')).toMatch(/0 processed, 1 up to date/);
  });

  it('check reports the bad sample with its reason code, and a hand-edited result too', async () => {
    lines.length = 0;
    expect(await runCheck(args(), log)).toBe(1);
    expect(lines.join('\n')).toMatch(/fail \[frames\] art_mon_dian_rat_u/);
    expect(lines.join('\n')).not.toMatch(/art_mon_dian_rat_d:/);
    // Paint a pure black pixel into the good result.
    const rel = processedPathOf('art/monsters/art_mon_dian_rat_d.png');
    const img = decodePng(new Uint8Array(readFileSync(join(root, rel))));
    img.data.set([0, 0, 0, 255], (30 * img.w + 20) * 4);
    writeFileSync(join(root, rel), encodePng(img));
    lines.length = 0;
    expect(await runCheck([...args(), '--mark'], log)).toBe(1);
    expect(lines.join('\n')).toMatch(
      /fail \[palette\] art_mon_dian_rat_d: \d+ pixels are pure black/,
    );
    expect(manifest().find((r) => r.id === 'art_mon_dian_rat_d')).toMatchObject({
      status: 'rework',
      reason: 'palette',
    });
  });

  it('check reports unregistered files, missing processed results and stray processed files', async () => {
    drop('art/monsters/art_mon_unknown_x.png', encodePng(sheet()));
    drop('processed/monsters/orphan.json', new TextEncoder().encode('{}'));
    const uMeta = join(root, metaPathOf('art/monsters/art_mon_dian_rat_u.png'));
    const saved = readFileSync(uMeta);
    rmSync(uMeta);
    lines.length = 0;
    expect(await runCheck(args(), log)).toBe(1);
    const out = lines.join('\n');
    expect(out).toMatch(/art_mon_unknown_x.png: file without a manifest record/);
    expect(out).toMatch(/orphan.json: processed file without a live manifest record/);
    expect(out).toMatch(/stale art_mon_dian_rat_u: no processed result/);
    rmSync(join(root, 'art/monsters/art_mon_unknown_x.png'));
    rmSync(join(root, 'processed/monsters/orphan.json'));
    writeFileSync(uMeta, saved);
  });

  it('atlas packs approved results only', async () => {
    const recs = manifest().map((r) =>
      r.id === 'art_mon_dian_rat_d'
        ? {
            ...r,
            status: 'approved' as const,
            reason: '',
            reviewer: 'tester',
            reviewedAt: '2026-11-21',
          }
        : r,
    );
    writeFileSync(join(root, 'manifest.json'), manifestJson(recs));
    await runImport([...args(), '--all', '--id', 'art_mon_dian_rat_d'], log);
    lines.length = 0;
    const out = join(root, '..', 'atlas');
    expect(await runAtlas([...args(), '--out', out], log)).toBe(0);
    const atlas = JSON.parse(readFileSync(join(out, 'atlas.json'), 'utf8'));
    expect(Object.keys(atlas.frames)).toEqual(['art_mon_dian_rat_d']);
    expect(atlas.pages[0]).toMatchObject({ file: 'actors_0.png', w: 2048, h: 2048 });
  });
});

describe('status transitions and label handling', () => {
  const rec = (over: Partial<ManifestRecord>): ManifestRecord => ({ ...record(), ...over });
  const fail = { code: 'frames' as const, check: 'grid_cells', message: 'x' };
  const note = { code: 'text' as const, check: 'text_suspect', message: 'x', warning: true };

  it('import sends failing review records to rework and its own rework back to review', () => {
    expect(nextStatus(rec({ status: 'review' }), [fail], null)).toEqual({
      status: 'rework',
      reason: 'frames',
    });
    expect(nextStatus(rec({ status: 'review' }), [note], null)).toBeNull();
    expect(nextStatus(rec({ status: 'rework', reason: 'frames' }), [], 'frames')).toEqual({
      status: 'review',
      reason: '',
    });
    // A reviewer's own reason is never cleared by a clean import.
    expect(nextStatus(rec({ status: 'rework', reason: 'identity' }), [], 'frames')).toBeNull();
    // Approved records keep their status through reprocessing (13).
    expect(nextStatus(rec({ status: 'approved' }), [fail], null)).toBeNull();
  });

  it('copies the original label verbatim, or rebuilds it from the record', () => {
    expect(labelChunks({ AIGC: '{"Label":"1"}', Software: 'x' }, 'AIGC={"Label":"1"}')).toEqual({
      AIGC: '{"Label":"1"}',
    });
    expect(labelChunks({}, 'AIGC={"Label":"1"}; AIGC_ID=7')).toEqual({
      AIGC: '{"Label":"1"}',
      AIGC_ID: '7',
    });
    expect(labelChunks({}, 'none')).toEqual({});
  });

  it('registration refuses Git LFS pointers and silent replacement of approved files', async () => {
    expect(
      isLfsPointer(
        new TextEncoder().encode(
          'version https://git-lfs.github.com/spec/v1\noid sha256:ab\nsize 12\n',
        ),
      ),
    ).toBe(true);
    expect(isLfsPointer(encodePng(sheetOf()))).toBe(false);
    const root = join(mkdtempSync(join(tmpdir(), 'hk-assets-reg-')), 'assets');
    try {
      mkdirSync(join(root, 'art', 'monsters'), { recursive: true });
      writeFileSync(join(root, 'tools.json'), `${JSON.stringify([TOOL], null, 2)}\n`);
      const approved = {
        ...record(),
        status: 'approved' as const,
        reviewer: 'tester',
        reviewedAt: '2026-11-21',
      };
      writeFileSync(join(root, 'manifest.json'), manifestJson([approved]));
      writeFileSync(join(root, RAT.file), encodePng(sheetOf()));
      writeFileSync(
        join(root, 'art/monsters/art_mon_dian_rat_u.png'),
        'version https://git-lfs.github.com/spec/v1\noid sha256:00\nsize 1\n',
      );
      const lines: string[] = [];
      const log: Logger = { log: (l) => lines.push(l), error: (l) => lines.push(l) };
      const base = [
        '--root',
        root,
        '--prompts',
        PROMPTS,
        '--tool',
        'xiaojiu',
        '--tool-version',
        'v3',
        '--yes',
      ];
      expect(await runRegister(base, log)).toBe(1);
      expect(lines.join('\n')).toMatch(/art_mon_dian_rat_u.png: a Git LFS pointer/);
      expect(lines.join('\n')).toMatch(/approved record has another hash; pass --replace/);
      expect(JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))[0].status).toBe(
        'approved',
      );
      rmSync(join(root, 'art/monsters/art_mon_dian_rat_u.png'));
      expect(await runRegister([...base, '--replace'], log)).toBe(0);
      expect(JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))[0].status).toBe(
        'review',
      );
    } finally {
      rmSync(join(root, '..'), { recursive: true, force: true });
    }
  });
});

function sheetOf() {
  return makeSheet([[creatureFrame(48, 43, BEAST, 0)]], [48, 48], { block: 2 });
}
