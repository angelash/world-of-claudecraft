import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadReleaseArt } from '../src/client/assets/release_loader';
import { loadReleaseAudio } from '../src/client/audio/release_loader';
import { createImg } from '../tools/assets/core/image';
import { AUDIO_IMPORT_VERSION } from '../tools/assets/core/import_versions';
import { IMPORT_VERSION } from '../tools/assets/core/meta';
import { decodePng, encodePng } from '../tools/assets/core/png';
import { buildReleaseMedia } from '../tools/assets/release_pack';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    const full = resolve(root);
    if (
      !full.startsWith(`${resolve(tmpdir())}${sep}`) ||
      !basename(full).startsWith('hk-release-media-')
    ) {
      throw new Error('test cleanup target is not a generated release media fixture');
    }
    rmSync(full, { recursive: true, force: true });
  }
});

function put(root: string, name: string, value: unknown): void {
  const file = join(root, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    typeof value === 'string' || value instanceof Uint8Array ? value : JSON.stringify(value),
  );
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'hk-release-media-'));
  roots.push(root);
  const common = {
    status: 'approved',
    reviewer: 'fixture reviewer',
    reviewedAt: '2026-11-19',
    sha256: 'a'.repeat(64),
    notes: 'private fixture notes',
    seed: 'private fixture seed',
  };
  const art = {
    ...common,
    id: 'art_fixture',
    kind: 'art',
    file: 'art/fixture.png',
    template: 'prop_small',
    tool: 'image_fixture',
  };
  const sound = {
    ...common,
    id: 'sfx_fixture',
    kind: 'audio',
    file: 'audio/sfx/fixture.ogg',
    template: 'sfx_one',
    tool: 'audio_fixture',
  };
  const records = [
    art,
    sound,
    { ...art, id: 'art_unreviewed', status: 'review', file: 'art/never_read.png' },
  ];
  const tools = [
    { id: 'image_fixture', kind: 'image', commercialUse: true },
    { id: 'audio_fixture', kind: 'audio', commercialUse: true },
  ];
  const meta = {
    id: art.id,
    kind: 'art',
    template: art.template,
    style: null,
    importVersion: IMPORT_VERSION,
    source: { sha256: art.sha256, file: 'private source name' },
    size: [2, 2],
    cell: [2, 2],
    grid: [1, 1],
    frames: [
      {
        anim: 'idle',
        dir: 'down',
        i: 0,
        x: 0,
        y: 0,
        w: 2,
        h: 2,
        ax: 1,
        ay: 1,
        ms: null,
        footprint: 1,
      },
    ],
    anims: { 'idle/down': { frames: [0], ms: [null], loop: true, hold: false } },
    directions: { drawn: ['down'], mirrored: [] },
    swatch: [],
    processing: {},
    problems: [],
  };
  const audio = {
    id: sound.id,
    kind: 'sfx',
    bus: 'sfx',
    group: null,
    importVersion: AUDIO_IMPORT_VERSION,
    source: { sha256: sound.sha256 },
    files: ['processed/audio/sfx/fixture.ogg'],
    durationSec: 1,
    loop: false,
    loopStart: null,
    loopEnd: null,
    bpm: null,
    beatsPerBar: null,
    bars: null,
    stems: 1,
    variants: 1,
    channels: 'mono',
    syncOffsetMs: null,
    priority: 1,
    caption: null,
    problems: [],
  };
  put(root, 'manifest.json', records);
  put(root, 'tools.json', tools);
  put(root, 'processed/fixture.json', meta);
  put(root, 'processed/fixture.png', encodePng(createImg(2, 2, 0x55aa33ff)));
  put(root, 'processed/audio/sfx/fixture.json', audio);
  put(root, 'processed/audio/sfx/fixture.ogg', 'OggS fixture bytes');
  return { root, records, tools, meta, audio };
}

describe('approved release media through the runtime readers', () => {
  it('ships only approved processed data and both release readers use the pack without source manifests', async () => {
    const f = fixture();
    const original = readFileSync(join(f.root, 'manifest.json'), 'utf8');
    const pack = buildReleaseMedia(f.root);
    expect([pack.artCount, pack.audioCount]).toEqual([1, 1]);
    const files = new Map(pack.files.map((file) => [`/${file.path}`, file.bytes]));
    const json = async (url: string) => JSON.parse(new TextDecoder().decode(files.get(url)));
    const loaded = await loadReleaseArt({
      fetchJson: json,
      decode: async (url) => {
        const image = decodePng(files.get(url)!);
        return { w: image.w, h: image.h, rgba: new Uint8ClampedArray(image.data) };
      },
    });
    expect(loaded.resolver.has('art_fixture')).toBe(true);
    expect(loaded.resolver.has('art_unreviewed')).toBe(false);
    expect(loaded.pixels.get('art_fixture')?.rgba[0]).toBe(0x55);
    const played = await loadReleaseAudio(json);
    expect(played.problems).toEqual([]);
    expect(played.index.get('sfx_fixture')?.files).toEqual(['sfx/fixture.ogg']);
    const manifestText = new TextDecoder().decode(files.get('/art/manifest.json'));
    expect(manifestText).not.toMatch(/private|reviewer|source|notes|seed/);
    expect(readFileSync(join(f.root, 'manifest.json'), 'utf8')).toBe(original);
  });

  it('rejects stale results, technical failures, missing files and unlicensed approvals', () => {
    const f = fixture();
    put(f.root, 'processed/fixture.json', { ...f.meta, importVersion: 'old' });
    expect(() => buildReleaseMedia(f.root)).toThrow(/stale/);
    put(f.root, 'processed/fixture.json', {
      ...f.meta,
      problems: [{ code: 'frames', message: 'broken' }],
    });
    expect(() => buildReleaseMedia(f.root)).toThrow(/technical checks/);
    put(f.root, 'processed/fixture.json', f.meta);
    put(
      f.root,
      'tools.json',
      f.tools.map((tool) => ({ ...tool, commercialUse: false })),
    );
    expect(() => buildReleaseMedia(f.root)).toThrow(/commercial rights/);
    put(f.root, 'tools.json', f.tools);
    put(f.root, 'processed/audio/sfx/fixture.json', {
      ...f.audio,
      files: ['processed/audio/missing.ogg'],
    });
    expect(() => buildReleaseMedia(f.root)).toThrow();
  });

  it('rejects paths that would escape the output and falls back safely for absent or hostile packs', async () => {
    const f = fixture();
    put(f.root, 'processed/audio/sfx/fixture.json', {
      ...f.audio,
      files: ['processed/audio/../fixture.png'],
    });
    expect(() => buildReleaseMedia(f.root)).toThrow(/leaves the release/);
    const missing = await loadReleaseAudio(async () => {
      throw new Error('offline');
    });
    expect(missing.index.size).toBe(0);
    const hostile = await loadReleaseAudio(async () => ({
      version: 1,
      entries: [{ ...f.audio, files: ['https://example.invalid/private.ogg'] }],
    }));
    expect(hostile.index.size).toBe(0);
  });

  it('deterministically builds empty packs while the real reviewer has approved nothing', () => {
    const f = fixture();
    put(
      f.root,
      'manifest.json',
      f.records.map((r) => ({ ...r, status: 'review' })),
    );
    const first = buildReleaseMedia(f.root);
    expect([first.artCount, first.audioCount]).toEqual([0, 0]);
    expect(first.files).toEqual(buildReleaseMedia(f.root).files);
    expect(first.files.map((file) => file.path)).toEqual([
      'art/manifest.json',
      'audio/manifest.json',
    ]);
  });
});
