import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAssets } from '../src/client/assets/loader';
import { loadAudioIndex } from '../src/client/audio/audio_loader';
import { run as runCheck } from '../tools/assets/check';
import { type AudioMeta, newAudioMeta } from '../tools/assets/core/audio/meta';
import { buildOggSkeleton } from '../tools/assets/core/audio/ogg';
import { audioPlanOf } from '../tools/assets/core/audio/plan';
import { hexToPx } from '../tools/assets/core/color';
import { createImg, resizeNearest, setPx } from '../tools/assets/core/image';
import { type ManifestRecord, manifestJson, type ToolRecord } from '../tools/assets/core/manifest';
import {
  type ArtMeta,
  IMPORT_VERSION,
  metaPathOf,
  processedPathOf,
} from '../tools/assets/core/meta';
import { processArt } from '../tools/assets/core/pipeline';
import { encodePng } from '../tools/assets/core/png';
import { newRecord } from '../tools/assets/core/register';
import * as codec from '../tools/assets/ffmpeg';
import { run as runImport } from '../tools/assets/import';
import { type Logger, loadLibrary, sha256 } from '../tools/assets/lib';
import { addOutline } from './art_fixtures';

const PROMPTS = join(__dirname, '..', 'assets/prompts');
const lib = loadLibrary(PROMPTS);
const roots: string[] = [];
const TOOL: ToolRecord = {
  id: 'test',
  name: 'Test',
  usedVersions: ['fixture'],
  termsUrl: 'https://example.invalid',
  termsCheckedAt: '2026-11-19',
  commercialUse: true,
  outputRights: 'fixture',
  aigcLabel: 'none',
  kind: 'image',
};

function cache(artId = 'art_ico_sys_cur_mana', fill = '#5aa8f0') {
  const root = mkdtempSync(join(tmpdir(), 'hk-mixed-version-'));
  roots.push(root);
  const put = (file: string, bytes: string | Uint8Array) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), bytes);
  };
  const artEntry = lib.expected.get(artId)!;
  const audioEntry = lib.expected.get('sfx_ui_back')!;
  const src = createImg(24, 24);
  for (let y = 7; y < 17; y++) for (let x = 7; x < 17; x++) setPx(src, x, y, hexToPx(fill));
  addOutline(src, hexToPx('#1c1a24'));
  const artBytes = encodePng(resizeNearest(src, 384, 384));
  // Header-only original has the correct recorded SHA, but no decodable Vorbis sound.
  // A fresh cache must skip before codec discovery, decode or encode.
  const audioBytes = buildOggSkeleton({ sampleRate: 48000, channels: 2, totalSamples: 9600 });
  const rec = (entry: typeof artEntry, bytes: Uint8Array) =>
    newRecord(entry, {
      tool: entry.kind === 'image' ? 'test' : 'test_audio',
      toolVersion: 'fixture',
      generatedAt: '2026-11-19',
      sha256: sha256(bytes),
      aigcLabel: 'none',
    });
  const artRecord = rec(artEntry, artBytes);
  const audioRecord = rec(audioEntry, audioBytes);
  const art = processArt({
    id: artRecord.id,
    template: artRecord.template,
    templateDef: lib.templates[artRecord.template]!,
    src: resizeNearest(src, 384, 384),
    sourceFile: artRecord.file,
    sourceSha256: artRecord.sha256,
    aigcLabel: 'none',
  });
  if (!art.img) throw new Error('Missing art fixture');
  const artMeta: ArtMeta = { ...art.meta, importVersion: '1.0.17' };
  const plan = audioPlanOf(
    audioRecord.template,
    lib.templates[audioRecord.template]!,
    audioEntry.extra,
    audioRecord.id,
  );
  const audioMeta: AudioMeta = {
    ...newAudioMeta(
      audioRecord.id,
      plan,
      { file: audioRecord.file, sha256: audioRecord.sha256 },
      'none',
    ),
    files: [1, 2].map((i) => `processed/audio/ui/${audioRecord.id}_0${i}.ogg`),
    importVersion: '1.0.17',
    durationSec: 0.2,
    variants: 2,
    lufs: plan.targetLufs,
    truePeak: plan.truePeakMax - 1,
  };
  put('tools.json', JSON.stringify([TOOL, { ...TOOL, id: 'test_audio', kind: 'audio' }]));
  put('manifest.json', manifestJson([artRecord, audioRecord]));
  put(artRecord.file, artBytes);
  put(audioRecord.file, audioBytes);
  put(metaPathOf(artRecord.file), JSON.stringify(artMeta));
  put(processedPathOf(artRecord.file), encodePng(art.img));
  put(metaPathOf(audioRecord.file), JSON.stringify(audioMeta));
  for (const file of audioMeta.files) put(file, audioBytes);
  const lines: string[] = [];
  const log: Logger = { log: (s) => lines.push(s), error: (s) => lines.push(s) };
  return {
    root,
    put,
    artRecord,
    audioRecord,
    artMeta,
    audioMeta,
    lines,
    log,
    args: ['--root', root, '--prompts', PROMPTS, '--no-contact'],
    metadata: (r: ManifestRecord) =>
      JSON.parse(readFileSync(join(root, metaPathOf(r.file)), 'utf8')),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('real mixed import and check with independent art/audio versions', () => {
  it('reprocesses art 1.0.17 to 1.0.18 and skips audio 1.0.17 without touching its bytes or codec', async () => {
    const c = cache();
    const files = [metaPathOf(c.audioRecord.file), ...c.audioMeta.files];
    const before = files.map((f) => readFileSync(join(c.root, f)));
    const discover = vi.spyOn(codec, 'ffmpegPath').mockImplementation(() => {
      throw new Error('Codec must not be discovered');
    });
    const decode = vi.spyOn(codec, 'decodeAudio').mockImplementation(() => {
      throw new Error('Must not decode');
    });
    const encode = vi.spyOn(codec, 'encodeOgg').mockImplementation(() => {
      throw new Error('Must not encode');
    });
    expect(await runImport(c.args, c.log)).toBe(0);
    expect(c.lines.join('\n')).toContain('1 processed, 1 up to date, 0 with problems');
    expect(c.metadata(c.artRecord).importVersion).toBe('1.0.18');
    expect(c.metadata(c.audioRecord).importVersion).toBe('1.0.17');
    expect(discover).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
    expect(encode).not.toHaveBeenCalled();
    files.forEach((f, i) => {
      expect(readFileSync(join(c.root, f)).equals(before[i]!)).toBe(true);
    });
    c.lines.length = 0;
    expect(await runCheck(c.args, c.log), c.lines.join('\n')).toBe(0);
    expect(c.lines.join('\n')).toMatch(/2 record\(s\), 0 error\(s\), 0 stale, 0 failing/);
  });

  it('check accepts current audio 1.0.17 while reporting art 1.0.17 as stale', async () => {
    const c = cache();
    expect(await runCheck(c.args, c.log)).toBe(1);
    expect(c.lines.join('\n')).toContain(`stale ${c.artRecord.id}:`);
    expect(c.lines.join('\n')).not.toContain(`stale ${c.audioRecord.id}:`);
  });

  it('rechecks the explicit coin-gold palette after real mixed import instead of the generic UI board', async () => {
    const c = cache('art_ico_div_emblem_merca', '#e0a832');
    expect(await runImport(c.args, c.log)).toBe(0);
    expect(c.metadata(c.artRecord).swatch).toContain('#e0a832');
    c.lines.length = 0;
    expect(await runCheck(c.args, c.log), c.lines.join('\n')).toBe(0);
    expect(c.lines.join('\n')).toContain('0 stale, 0 failing check(s)');
  });

  it('skips current audio with existing quality failures and preserves its rework status and evidence', async () => {
    const c = cache();
    const rec: ManifestRecord = { ...c.audioRecord, status: 'rework', reason: 'loudness' };
    const meta = {
      ...c.audioMeta,
      lufs: -6,
      problems: [{ code: 'loudness', check: 'loudness', message: 'Existing loudness failure' }],
      autoReason: 'loudness',
    };
    c.put('manifest.json', manifestJson([c.artRecord, rec]));
    c.put(metaPathOf(rec.file), JSON.stringify(meta));
    const before = readFileSync(join(c.root, metaPathOf(rec.file)));
    const discover = vi.spyOn(codec, 'ffmpegPath').mockImplementation(() => {
      throw new Error('Current failing audio must still skip the codec');
    });
    expect(await runImport(c.args, c.log)).toBe(0);
    expect(discover).not.toHaveBeenCalled();
    expect(readFileSync(join(c.root, metaPathOf(rec.file))).equals(before)).toBe(true);
    const records: ManifestRecord[] = JSON.parse(
      readFileSync(join(c.root, 'manifest.json'), 'utf8'),
    );
    expect(records.find((r) => r.id === rec.id)).toEqual(rec);
    c.lines.length = 0;
    expect(await runCheck(c.args, c.log)).toBe(1);
    expect(c.lines.join('\n')).toContain(`fail [loudness] ${rec.id}:`);
    expect(c.lines.join('\n')).toContain('0 stale, 1 failing check(s)');
  });

  it.each(['old_version', 'source_mismatch'] as const)(
    'never skips an audio %s',
    async (reason) => {
      const c = cache();
      const bad = {
        ...c.audioMeta,
        ...(reason === 'old_version'
          ? { importVersion: '1.0.16' }
          : { source: { ...c.audioMeta.source, sha256: '0'.repeat(64) } }),
      };
      c.put(metaPathOf(c.audioRecord.file), JSON.stringify(bad));
      await runCheck(c.args, c.log);
      expect(c.lines.join('\n')).toContain(`stale ${c.audioRecord.id}:`);
      c.lines.length = 0;
      const discover = vi.spyOn(codec, 'ffmpegPath').mockReturnValue(process.execPath);
      const decode = vi.spyOn(codec, 'decodeAudio').mockImplementation(() => {
        throw new Error('Invalid test source is not decodable');
      });
      expect(await runImport([...c.args, '--id', c.audioRecord.id], c.log)).toBe(1);
      expect(discover).toHaveBeenCalled();
      expect(decode).toHaveBeenCalled();
      expect(c.lines.join('\n')).toContain('1 processed, 0 up to date, 1 with problems');
      expect(c.metadata(c.audioRecord)).toEqual(bad);
    },
  );

  it('check still rejects a changed original even when metadata and manifest agree', async () => {
    const c = cache();
    c.put(c.audioRecord.file, 'changed source');
    await runCheck(c.args, c.log);
    expect(c.lines.join('\n')).toContain('file changed since registration (sha256 differs)');
  });

  it('stamps newly processed audio with its current version rather than the art version', () => {
    const c = cache();
    const plan = audioPlanOf(c.audioRecord.template, lib.templates[c.audioRecord.template]!);
    expect(newAudioMeta(c.audioRecord.id, plan, c.audioMeta.source, 'none').importVersion).toBe(
      '1.0.17',
    );
    expect(IMPORT_VERSION).toBe('1.0.18');
  });
});

describe('production client loaders with independent import versions', () => {
  it.each([
    ['1.0.17', false, true],
    ['1.0.16', false, false],
    ['1.0.18', false, false],
    ['1.0.17', true, false],
  ] as const)(
    'audio %s, source mismatch %s, playable %s',
    async (version, wrongSource, playable) => {
      const c = cache();
      const meta = {
        ...c.audioMeta,
        importVersion: version,
        source: { ...c.audioMeta.source, sha256: wrongSource ? 'wrong' : c.audioRecord.sha256 },
      };
      const result = await loadAudioIndex({
        statuses: ['review'],
        fetchJson: async (url) => (url.endsWith('manifest.json') ? [c.audioRecord] : meta),
      });
      expect(result.index.has(c.audioRecord.id)).toBe(playable);
      expect(result.problems.length === 0).toBe(playable);
    },
  );

  it.each([
    ['1.0.18', false, true],
    ['1.0.17', false, false],
    ['1.0.18', true, false],
  ] as const)('art %s, source mismatch %s, decoded %s', async (version, wrongSource, decoded) => {
    const c = cache();
    const meta = {
      ...c.artMeta,
      importVersion: version,
      source: { ...c.artMeta.source, sha256: wrongSource ? 'wrong' : c.artRecord.sha256 },
    };
    const decode = vi.fn(async () => ({ w: 24, h: 24, rgba: new Uint8ClampedArray(24 * 24 * 4) }));
    const result = await loadAssets({
      statuses: ['review'],
      decode,
      fetchJson: async (url) => (url.endsWith('manifest.json') ? [c.artRecord] : meta),
    });
    expect(result.pixels.get(c.artRecord.id) !== undefined).toBe(decoded);
    expect(decode.mock.calls.length).toBe(decoded ? 1 : 0);
  });
});
