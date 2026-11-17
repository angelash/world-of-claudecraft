// The asset review desk (tools/assets/review, src/editor/assets): decision rules match the
// manifest validator, adoption turns pool takes into a registered original, decisions
// write the manifest and the append-only trail, rejected originals leave the tracked tree,
// uncleared tools cannot be adopted, unregistered originals are listed, and the editor's
// pure list logic and client behave.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAssetDeskApi } from '../src/editor/assets/asset_client';
import {
  adoptedKeys,
  assetUrl,
  decisionProblems,
  filterRows,
  groupRows,
  stepId,
  togglePick,
} from '../src/editor/assets/asset_model';
import type { ManifestRecord, ToolRecord } from '../tools/assets/core/manifest';
import { validateManifest } from '../tools/assets/core/manifest';
import { encodePng } from '../tools/assets/core/png';
import { decodeAudio, ffmpegPath } from '../tools/assets/ffmpeg';
import { loadLibrary, sha256 } from '../tools/assets/lib';
import {
  type AssetRow,
  applyDecision,
  buildRows,
  type CandidateSet,
  candidateSetProblems,
  checkAdoption,
  type EntryInfo,
  safeCandidatePath,
  summarize,
} from '../tools/assets/review/model';
import { sameOrigin } from '../tools/assets/review/routes';
import {
  adopt,
  deskPaths,
  listDesk,
  ReviewError,
  readLog,
  review,
} from '../tools/assets/review/store';
import { writeWav } from '../tools/audio_gen/wav';

const PROMPTS = join(__dirname, '..', 'assets', 'prompts');

function record(over: Partial<ManifestRecord> = {}): ManifestRecord {
  return {
    id: 'mus_town_borderstone_day',
    kind: 'audio',
    file: 'audio/music/mus_town_borderstone_day.ogg',
    template: 'music_loop',
    style: 'm_lotha_folk',
    promptHash: '0123456789ab',
    promptLang: 'en',
    tool: 'ace_step_15',
    toolVersion: 'v',
    seed: '1',
    refs: [],
    generatedAt: '2026-11-17',
    sha256: 'a'.repeat(64),
    aigcLabel: 'none',
    converted: true,
    status: 'review',
    reason: '',
    reviewer: '',
    reviewedAt: '',
    milestone: 'M1',
    notes: '',
    ...over,
  };
}

function candidateSet(over: Partial<CandidateSet> = {}): CandidateSet {
  const take = (key: string, tool = 'ace_step_15') => ({
    key,
    label: key,
    group: 'A',
    method: 'test',
    tool,
    toolVersion: 'v1',
    models: ['m'],
    seed: key,
    prompt: 'p',
    promptLang: 'en' as const,
    generatedAt: '2026-11-17',
    settings: {},
    metrics: {},
    files: [{ role: 'main' as const, label: key, path: `_candidates/audio/x/${key}.wav` }],
    note: '',
  });
  return {
    assetId: 'x',
    kind: 'audio',
    createdAt: '2026-11-17',
    source: 'test',
    adoptMode: 'single',
    adoptCount: 0,
    candidates: [take('a'), take('b'), take('c', 'other_tool')],
    ...over,
  };
}

describe('review decisions', () => {
  it('approves with a reviewer and the day, and clears an old reason', () => {
    const out = applyDecision(
      record({ status: 'rework', reason: 'seam' }),
      {
        status: 'approved',
        reasons: [],
        note: '',
        reviewer: '主审',
      },
      '2026-11-17',
    );
    expect(out.errors).toEqual([]);
    expect(out.record).toMatchObject({
      status: 'approved',
      reason: '',
      reviewer: '主审',
      reviewedAt: '2026-11-17',
    });
  });

  it('refuses rework without reason codes of the record kind, and approval without a reviewer', () => {
    expect(
      applyDecision(record(), { status: 'rework', reasons: [], note: '', reviewer: 'r' }, 'd')
        .errors,
    ).not.toEqual([]);
    expect(
      applyDecision(
        record(),
        { status: 'rework', reasons: ['frames'], note: '', reviewer: 'r' },
        'd',
      ).errors,
    ).not.toEqual([]);
    expect(
      applyDecision(record(), { status: 'approved', reasons: [], note: '', reviewer: ' ' }, 'd')
        .errors,
    ).toEqual(['reviewer is required']);
  });

  it('stores rework reasons sorted and unique, and sending back to review clears the decision', () => {
    const rework = applyDecision(
      record(),
      { status: 'rework', reasons: ['seam', 'motif', 'seam'], note: '', reviewer: 'r' },
      'd',
    );
    expect(rework.record?.reason).toBe('motif,seam');
    const back = applyDecision(
      rework.record as ManifestRecord,
      { status: 'review', reasons: [], note: '', reviewer: '' },
      'd',
    );
    expect(back.record).toMatchObject({
      status: 'review',
      reason: '',
      reviewer: '',
      reviewedAt: '',
    });
  });

  it('produces records the manifest validator accepts', () => {
    const lib = loadLibrary(PROMPTS);
    const e = lib.expected.get('mus_town_borderstone_day');
    expect(e).toBeDefined();
    const tools: ToolRecord[] = [
      {
        id: 'ace_step_15',
        name: 'n',
        usedVersions: [],
        termsUrl: 'u',
        termsCheckedAt: '2026-11-17',
        commercialUse: true,
        outputRights: 'o',
        aigcLabel: 'a',
        kind: 'audio',
      },
    ];
    const base = record({
      file: e?.file,
      template: e?.template,
      style: e?.style ?? '',
      milestone: e?.milestone,
      promptHash: e?.promptHash,
    });
    for (const decision of [
      { status: 'approved' as const, reasons: [] },
      { status: 'rework' as const, reasons: ['seam'] },
      { status: 'rejected' as const, reasons: ['style', 'motif'] },
      { status: 'retired' as const, reasons: [] },
    ]) {
      const out = applyDecision(base, { ...decision, note: '', reviewer: '主审' }, '2026-11-17');
      expect(validateManifest([out.record], { tools, expected: lib.expected })).toEqual([]);
    }
  });
});

describe('adoption checks and pool shapes', () => {
  it('takes one candidate in single mode and an ordered list in sequence mode', () => {
    expect(checkAdoption(candidateSet(), ['a'])).toEqual([]);
    expect(checkAdoption(candidateSet(), ['a', 'b'])).toEqual(['this asset takes one candidate']);
    expect(checkAdoption(candidateSet({ adoptMode: 'sequence' }), ['b', 'a'])).toEqual([]);
    expect(checkAdoption(candidateSet(), [])).toEqual(['pick at least one candidate']);
    expect(checkAdoption(candidateSet(), ['zz'])).toEqual(['no candidate zz']);
    expect(checkAdoption(candidateSet({ adoptMode: 'sequence' }), ['a', 'c'])[0]).toMatch(
      /different tools/,
    );
  });

  it('keeps pool paths inside _candidates/', () => {
    expect(safeCandidatePath('_candidates/audio/x/a.wav')).toBe('_candidates/audio/x/a.wav');
    expect(safeCandidatePath('_candidates\\audio\\x\\a.wav')).toBe('_candidates/audio/x/a.wav');
    for (const bad of [
      '../manifest.json',
      '_candidates/../manifest.json',
      '/etc/passwd',
      'C:/x',
      'audio/music/a.ogg',
      '_candidates/a.wav',
    ]) {
      expect(safeCandidatePath(bad)).toBeNull();
    }
    expect(candidateSetProblems(candidateSet(), 'w')).toEqual([]);
    const broken = candidateSet();
    broken.candidates[0] = {
      ...broken.candidates[0],
      files: [{ role: 'main', label: 'a', path: '../x.wav' }],
    } as never;
    expect(candidateSetProblems(broken, 'w').join(' ')).toMatch(/inside _candidates/);
    const odd = candidateSet();
    odd.candidates[1] = { ...odd.candidates[1], files: {} as never, models: 'x' as never } as never;
    expect(() => candidateSetProblems(odd, 'w')).not.toThrow();
    expect(candidateSetProblems(odd, 'w').join(' ')).toMatch(/files must be a non-empty list/);
    expect(candidateSetProblems(odd, 'w').join(' ')).toMatch(/models must be a list/);
    expect(checkAdoption(candidateSet({ adoptMode: 'sequence', adoptCount: 2 }), ['a'])).toEqual([
      'this asset takes 2 variations in order',
    ]);
  });
});

describe('rows and coverage', () => {
  const entries = new Map<string, EntryInfo>([
    [
      'mus_a',
      {
        id: 'mus_a',
        kind: 'audio',
        file: 'audio/music/mus_a.ogg',
        template: 't',
        milestone: 'M1',
        category: 'music',
      },
    ],
    [
      'art_b',
      {
        id: 'art_b',
        kind: 'image',
        file: 'art/props/art_b.png',
        template: 't',
        milestone: 'M1',
        category: 'props',
      },
    ],
    [
      'art_c',
      {
        id: 'art_c',
        kind: 'image',
        file: 'art/props/art_c.png',
        template: 't',
        milestone: 'M1',
        category: 'props',
      },
    ],
    [
      'sfx_d',
      {
        id: 'sfx_d',
        kind: 'audio',
        file: 'audio/sfx/sfx_d.ogg',
        template: 't',
        milestone: 'M1',
        category: 'sfx',
      },
    ],
  ]);

  it('lists records, pool takes and unregistered originals, with orphans marked', () => {
    const rows = buildRows(
      entries,
      [record({ id: 'mus_a', file: 'audio/music/mus_a.ogg', status: 'approved' })],
      [candidateSet({ assetId: 'sfx_d' })],
      ['art/props/art_b.png', 'art/props/stray.png'],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get('mus_a')?.state).toBe('approved');
    expect(byId.get('sfx_d')?.state).toBe('candidates');
    expect(byId.get('art_b')).toMatchObject({
      state: 'unregistered',
      unregisteredFile: 'art/props/art_b.png',
    });
    expect(byId.get('stray')).toMatchObject({ state: 'unregistered', orphan: true });
    expect(byId.has('art_c')).toBe(false);
    const counts = summarize(
      entries,
      [record({ id: 'mus_a', status: 'approved' })],
      [candidateSet({ assetId: 'sfx_d' })],
      ['art/props/art_b.png'],
    );
    expect(counts.art).toMatchObject({ expected: 2, unregistered: 1, untouched: 1 });
    expect(counts.audio).toMatchObject({ expected: 2, approved: 1, candidates: 1, untouched: 0 });
  });
});

const hasFfmpeg = ffmpegPath() !== null;

describe('the desk on disk', () => {
  let root: string;
  const tone = (seconds: number, freq: number) => {
    const n = Math.round(seconds * 48000);
    const samples = new Float32Array(n * 2);
    for (let i = 0; i < n; i++)
      samples[i * 2] = samples[i * 2 + 1] = 0.3 * Math.sin((2 * Math.PI * freq * i) / 48000);
    return writeWav({ sampleRate: 48000, channels: 2, samples });
  };
  const pool = (id: string, set: Partial<CandidateSet>, keys: string[]) => {
    const dir = join(root, 'assets', '_candidates', 'audio', id);
    mkdirSync(dir, { recursive: true });
    // A full take shape from the default set; `set.candidates` only names the tool.
    const template = candidateSet().candidates[0] as CandidateSet['candidates'][number];
    const base = candidateSet({ assetId: id, ...set });
    base.candidates = keys.map((k, i) => {
      writeFileSync(join(dir, `${k}.wav`), tone(0.5, 220 + i * 110));
      return {
        ...template,
        key: k,
        label: k,
        seed: String(i),
        tool: set.candidates?.[0]?.tool ?? 'ace_step_15',
        files: [{ role: 'main', label: k, path: `_candidates/audio/${id}/${k}.wav` }],
      };
    });
    writeFileSync(join(dir, 'candidates.json'), JSON.stringify(base));
  };
  const tools: ToolRecord[] = [
    {
      id: 'ace_step_15',
      name: 'ACE',
      usedVersions: ['v1'],
      termsUrl: 'u',
      termsCheckedAt: '2026-11-17',
      commercialUse: true,
      outputRights: 'MIT',
      aigcLabel: 'a',
      kind: 'audio',
    },
    {
      id: 'stable_audio_3_small_sfx',
      name: 'SA3',
      usedVersions: ['v1'],
      termsUrl: 'u',
      termsCheckedAt: '2026-11-17',
      commercialUse: false,
      outputRights: 'register first',
      aigcLabel: 'a',
      kind: 'audio',
    },
  ];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'hk-desk-'));
    mkdirSync(join(root, 'assets'), { recursive: true });
    writeFileSync(join(root, 'assets', 'manifest.json'), '[]\n');
    writeFileSync(join(root, 'assets', 'tools.json'), JSON.stringify(tools));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it.skipIf(!hasFfmpeg)(
    'adopts a take, then approves, sends back and rejects it with a trail',
    () => {
      const paths = deskPaths(root, PROMPTS);
      pool('mus_town_borderstone_day', {}, ['B1', 'B2']);
      const adopted = adopt(paths, {
        id: 'mus_town_borderstone_day',
        keys: ['B2'],
        reviewer: '主审',
        note: '',
        replace: false,
      });
      const file = join(root, 'assets', adopted.record.file);
      expect(adopted.record).toMatchObject({
        status: 'review',
        tool: 'ace_step_15',
        seed: '1',
        converted: true,
      });
      expect(adopted.record.notes).toMatch(/^picked B2 of 2 candidates/);
      expect(existsSync(file)).toBe(true);
      expect(adopted.record.sha256).toBe(sha256(new Uint8Array(readFileSync(file))));
      expect(adoptedKeys(adopted.record)).toEqual(['B2']);

      expect(() =>
        review(paths, 'mus_town_borderstone_day', {
          status: 'approved',
          reasons: [],
          note: '',
          reviewer: '',
        }),
      ).toThrow(ReviewError);
      review(paths, 'mus_town_borderstone_day', {
        status: 'approved',
        reasons: [],
        note: '好',
        reviewer: '主审',
      });
      const manifest = JSON.parse(readFileSync(paths.manifest, 'utf8')) as ManifestRecord[];
      expect(manifest[0]).toMatchObject({ status: 'approved', reviewer: '主审' });
      expect(
        validateManifest(manifest, { tools, expected: loadLibrary(PROMPTS).expected }),
      ).toEqual([]);

      // An approved original is replaced only on purpose.
      expect(() =>
        adopt(paths, {
          id: 'mus_town_borderstone_day',
          keys: ['B1'],
          reviewer: '',
          note: '',
          replace: false,
        }),
      ).toThrow(/replace_required/);

      review(paths, 'mus_town_borderstone_day', {
        status: 'rejected',
        reasons: ['style'],
        note: '太闷',
        reviewer: '主审',
      });
      expect(existsSync(file)).toBe(false);
      expect(
        existsSync(join(root, 'assets', '_rejected', 'audio', 'mus_town_borderstone_day.ogg')),
      ).toBe(true);
      const trail = readLog(paths, 'mus_town_borderstone_day');
      expect(trail.map((e) => `${e.action}:${e.status}`)).toEqual([
        'adopt:review',
        'review:approved',
        'review:rejected',
      ]);
      expect(trail[2]).toMatchObject({ reason: 'style', note: '太闷' });
    },
  );

  it.skipIf(!hasFfmpeg)('joins sequence picks in order with one second of silence', () => {
    const paths = deskPaths(root, PROMPTS);
    writeFileSync(
      join(root, 'assets', 'tools.json'),
      JSON.stringify([{ ...tools[1], commercialUse: true }]),
    );
    pool(
      'sfx_hit_slash_flesh',
      {
        adoptMode: 'sequence',
        adoptCount: 2,
        candidates: [{ tool: 'stable_audio_3_small_sfx' } as never],
      },
      ['A1', 'A2', 'A3'],
    );
    const out = adopt(paths, {
      id: 'sfx_hit_slash_flesh',
      keys: ['A3', 'A1'],
      reviewer: '',
      note: '',
      replace: false,
    });
    expect(out.record.notes).toMatch(/^picked A3\+A1 of 3 candidates/);
    expect(out.record.seed).toBe('2,0');
    // 0.5 s take, 1 s of silence, 0.5 s take; A3 (440 Hz) first, A1 (220 Hz) last.
    const pcm = decodeAudio(join(root, 'assets', out.record.file), 48000);
    const left = pcm[0] as Float32Array;
    expect(left.length / 48000).toBeGreaterThan(1.95);
    expect(left.length / 48000).toBeLessThan(2.1);
    const crossings = (from: number, to: number) => {
      let n = 0;
      for (let i = from + 1; i < to; i++) if ((left[i - 1] ?? 0) < 0 !== (left[i] ?? 0) < 0) n++;
      return n;
    };
    expect(crossings(0, 24000)).toBeGreaterThan(1.6 * crossings(72000, 96000));
    let gapPeak = 0;
    for (let i = 26400; i < 69600; i++) gapPeak = Math.max(gapPeak, Math.abs(left[i] ?? 0));
    expect(gapPeak).toBeLessThan(0.01);
    expect(() =>
      adopt(paths, {
        id: 'sfx_hit_slash_flesh',
        keys: ['A2'],
        reviewer: '',
        note: '',
        replace: true,
      }),
    ).toThrow(/takes 2 variations/);
  });

  it.skipIf(!hasFfmpeg)('keeps a replaced original and will not revive a rejected one', () => {
    const paths = deskPaths(root, PROMPTS);
    pool('mus_town_borderstone_day', {}, ['B1', 'B2']);
    const id = 'mus_town_borderstone_day';
    adopt(paths, { id, keys: ['B1'], reviewer: '', note: '', replace: false });
    // A record still under review is replaced without confirmation, but the old file is kept.
    const second = adopt(paths, { id, keys: ['B2'], reviewer: '', note: '', replace: false });
    expect(second.event.parked).toBe('_rejected/audio/mus_town_borderstone_day.ogg');
    expect(
      existsSync(join(root, 'assets', '_rejected', 'audio', 'mus_town_borderstone_day.ogg')),
    ).toBe(true);
    review(paths, id, { status: 'rejected', reasons: ['seam'], note: '', reviewer: '主审' });
    // The second rejected file does not overwrite the first parked one.
    expect(
      existsSync(join(root, 'assets', '_rejected', 'audio', 'mus_town_borderstone_day_2.ogg')),
    ).toBe(true);
    expect(() =>
      review(paths, id, { status: 'approved', reasons: [], note: '', reviewer: '主审' }),
    ).toThrow(/file_missing/);
  });

  it.skipIf(!hasFfmpeg)(
    'still retires a record whose tool lost clearance, but will not approve it',
    () => {
      const paths = deskPaths(root, PROMPTS);
      pool('mus_town_borderstone_day', {}, ['B1']);
      const id = 'mus_town_borderstone_day';
      adopt(paths, { id, keys: ['B1'], reviewer: '', note: '', replace: false });
      writeFileSync(
        join(root, 'assets', 'tools.json'),
        JSON.stringify([{ ...tools[0], commercialUse: false }, tools[1]]),
      );
      expect(() =>
        review(paths, id, { status: 'approved', reasons: [], note: '', reviewer: '主审' }),
      ).toThrow(/invalid_record/);
      const out = review(paths, id, { status: 'retired', reasons: [], note: '', reviewer: '主审' });
      expect(out.record.status).toBe('retired');
    },
  );

  it('adopts an image as is and keeps its own implicit label', () => {
    const paths = deskPaths(root, PROMPTS);
    const id = 'art_bg_lothar_plain_far';
    writeFileSync(
      join(root, 'assets', 'tools.json'),
      JSON.stringify([{ ...tools[0], id: 'image_tool', kind: 'image', commercialUse: true }]),
    );
    const dir = join(root, 'assets', '_candidates', 'art', id);
    mkdirSync(dir, { recursive: true });
    const png = encodePng(
      { w: 2, h: 2, data: new Uint8Array(16).fill(200) },
      { AIGC: 'label from the generator' },
    );
    writeFileSync(join(dir, 'take.png'), png);
    const set = candidateSet({ assetId: id, kind: 'art' });
    set.candidates = [
      {
        ...(set.candidates[0] as CandidateSet['candidates'][number]),
        key: 'take',
        tool: 'image_tool',
        files: [{ role: 'main', label: 'take', path: `_candidates/art/${id}/take.png` }],
      },
    ];
    writeFileSync(join(dir, 'candidates.json'), JSON.stringify(set));
    const out = adopt(paths, { id, keys: ['take'], reviewer: '', note: '', replace: false });
    expect(out.record).toMatchObject({
      kind: 'art',
      converted: false,
      aigcLabel: 'AIGC=label from the generator',
    });
    expect(readFileSync(join(root, 'assets', out.record.file))).toEqual(Buffer.from(png));
  });

  it.skipIf(!hasFfmpeg)('leaves no original behind when the record does not validate', () => {
    const paths = deskPaths(root, PROMPTS);
    pool('mus_town_borderstone_day', {}, ['B1']);
    const file = join(paths.pool, 'audio', 'mus_town_borderstone_day', 'candidates.json');
    const set = JSON.parse(readFileSync(file, 'utf8')) as CandidateSet;
    (set.candidates[0] as CandidateSet['candidates'][number]).generatedAt = '2026/11/17';
    writeFileSync(file, JSON.stringify(set));
    expect(() =>
      adopt(paths, {
        id: 'mus_town_borderstone_day',
        keys: ['B1'],
        reviewer: '',
        note: '',
        replace: false,
      }),
    ).toThrow(/invalid_record/);
    const musicDir = join(root, 'assets', 'audio', 'music');
    expect(existsSync(musicDir) ? readdirSync(musicDir) : []).toEqual([]);
    expect(JSON.parse(readFileSync(paths.manifest, 'utf8'))).toEqual([]);
    expect(readLog(paths)).toEqual([]);
  });

  it('refuses takes from a tool that is not cleared for commercial use', () => {
    const paths = deskPaths(root, PROMPTS);
    pool(
      'sfx_hit_slash_flesh',
      { adoptMode: 'sequence', candidates: [{ tool: 'stable_audio_3_small_sfx' } as never] },
      ['A1'],
    );
    expect(() =>
      adopt(paths, {
        id: 'sfx_hit_slash_flesh',
        keys: ['A1'],
        reviewer: '',
        note: '',
        replace: false,
      }),
    ).toThrow(/tool_not_cleared/);
    expect(JSON.parse(readFileSync(paths.manifest, 'utf8'))).toEqual([]);
  });

  it('lists pool takes and unregistered originals, and reports broken pool files', () => {
    const paths = deskPaths(root, PROMPTS);
    pool('mus_town_borderstone_day', {}, ['B1']);
    mkdirSync(join(root, 'assets', 'art', 'props'), { recursive: true });
    writeFileSync(join(root, 'assets', 'art', 'props', 'stray.png'), 'x');
    mkdirSync(join(root, 'assets', '_candidates', 'audio', 'amb_town_day'), { recursive: true });
    writeFileSync(
      join(root, 'assets', '_candidates', 'audio', 'amb_town_day', 'candidates.json'),
      '{',
    );
    const listing = listDesk(paths);
    const states = Object.fromEntries(listing.rows.map((r: AssetRow) => [r.id, r.state]));
    expect(states).toEqual({ mus_town_borderstone_day: 'candidates', stray: 'unregistered' });
    expect(listing.problems.join(' ')).toMatch(/amb_town_day.*not valid JSON/);
    expect(listing.reasonCodes.audio).toContain('seam');
  });
});

describe('route guard', () => {
  it('accepts same-origin and origin-less writes and refuses other pages', () => {
    const req = (origin: string | undefined) =>
      ({ headers: { host: '127.0.0.1:5180', ...(origin ? { origin } : {}) } }) as never;
    expect(sameOrigin(req(undefined))).toBe(true);
    expect(sameOrigin(req('http://127.0.0.1:5180'))).toBe(true);
    expect(sameOrigin(req('http://127.0.0.1:5173'))).toBe(false);
    expect(sameOrigin(req('not a url'))).toBe(false);
  });
});

describe('editor desk core', () => {
  const rows = [
    {
      id: 'art_b',
      kind: 'art',
      category: 'props',
      state: 'review',
      subject: { zh: '木箱', en: 'crate' },
    },
    {
      id: 'mus_a',
      kind: 'audio',
      category: 'music',
      state: 'candidates',
      subject: { zh: '边石镇白天', en: 'Borderstone' },
    },
    { id: 'sfx_d', kind: 'audio', category: 'sfx', state: 'approved' },
  ] as AssetRow[];

  it('filters by kind, state and query and groups by category', () => {
    expect(filterRows(rows, { query: '', kind: 'audio', state: 'all' }).map((r) => r.id)).toEqual([
      'mus_a',
      'sfx_d',
    ]);
    expect(filterRows(rows, { query: '边石', kind: 'all', state: 'all' }).map((r) => r.id)).toEqual(
      ['mus_a'],
    );
    expect(
      filterRows(rows, { query: 'CRATE', kind: 'all', state: 'review' }).map((r) => r.id),
    ).toEqual(['art_b']);
    expect(groupRows(rows).map((g) => g.key)).toEqual(['art:props', 'audio:music', 'audio:sfx']);
  });

  it('steps through the list with wrap-around and toggles picks by mode', () => {
    expect(stepId(rows, '', 1)).toBe('art_b');
    expect(stepId(rows, 'sfx_d', 1)).toBe('art_b');
    expect(stepId(rows, 'art_b', -1)).toBe('sfx_d');
    expect(togglePick(['a'], 'b', 'single')).toEqual(['b']);
    expect(togglePick(['a'], 'b', 'sequence')).toEqual(['a', 'b']);
    expect(togglePick(['a', 'b'], 'a', 'sequence')).toEqual(['b']);
  });

  it('checks decisions like the server and encodes asset URLs', () => {
    expect(decisionProblems('rework', [], 'r')).toEqual(['needReason']);
    expect(decisionProblems('approved', [], '')).toEqual(['needReviewer']);
    expect(decisionProblems('review', [], '')).toEqual([]);
    expect(assetUrl('_candidates/audio/x/a b.wav')).toBe('/assets/_candidates/audio/x/a%20b.wav');
  });

  it('reports server errors with their codes through the client', async () => {
    const api = createAssetDeskApi(async (url, init) => ({
      ok: !url.endsWith('/review'),
      status: url.endsWith('/review') ? 400 : 200,
      headers: { get: () => 'application/json' },
      text: async () =>
        url.endsWith('/review')
          ? JSON.stringify({ ok: false, error: 'bad_decision', details: ['reviewer is required'] })
          : JSON.stringify({ ok: true, events: [{ id: 'x' }], method: init?.method }),
    }));
    expect(
      await api.review({ id: 'x', status: 'approved', reasons: [], note: '', reviewer: '' }),
    ).toEqual({
      ok: false,
      error: 'bad_decision',
      details: ['reviewer is required'],
    });
    const log = await api.log('x');
    expect(log.ok && log.value).toEqual([{ id: 'x' }]);
    const offline = await createAssetDeskApi(async () => {
      throw new Error('down');
    }).list();
    expect(offline).toEqual({ ok: false, error: 'network', details: [] });
  });
});
