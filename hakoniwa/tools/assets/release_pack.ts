// Release-only media: approved processed files and the runtime fields their readers need.
// Source records, tools, seeds, review notes and rejected candidates stay in assets/.

import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';
import type { AssetMeta } from '../../src/client/assets/types';
import {
  type AudioMetaLike,
  audioMetaProblems,
  entryOf,
} from '../../src/client/audio/audio_manifest';
import { AUDIO_IMPORT_VERSION } from './core/import_versions';
import type { ManifestRecord, ToolRecord } from './core/manifest';
import { type ArtMeta, IMPORT_VERSION, metaPathOf, processedPathOf } from './core/meta';
import { decodePng } from './core/png';

export interface ReleaseMediaFile {
  path: string;
  bytes: Uint8Array;
}

export interface ReleaseMediaPack {
  files: ReleaseMediaFile[];
  artCount: number;
  audioCount: number;
}

/** Reject traversal, URLs and symlinks leaving the selected asset root. */
function mediaPath(root: string, name: string): string {
  if (!name || isAbsolute(name) || /[\\:]/.test(name) || name.includes(String.fromCharCode(0))) {
    throw new Error(`invalid media path: ${name}`);
  }
  const path = resolve(root, name);
  const inside = (candidate: string) => {
    const rel = relative(realpathSync(root), candidate);
    return (
      rel !== '..' &&
      !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
      !isAbsolute(rel)
    );
  };
  if (!inside(path) || !inside(realpathSync(path))) {
    throw new Error(`media path leaves asset root: ${name}`);
  }
  return path;
}

function readJson<T>(root: string, name: string): T {
  return JSON.parse(readFileSync(mediaPath(root, name), 'utf8')) as T;
}

/** Keep only presentation fields; never copy the import source or processing audit. */
function runtimeMeta(meta: ArtMeta): AssetMeta {
  return {
    id: meta.id,
    template: meta.template,
    style: meta.style,
    size: meta.size,
    cell: meta.cell,
    grid: meta.grid,
    frames: meta.frames,
    anims: meta.anims,
    directions: meta.directions,
    swatch: meta.swatch,
    processing: {},
  };
}

/** Build without touching source files or changing review states. */
export function buildReleaseMedia(root: string): ReleaseMediaPack {
  const records = readJson<ManifestRecord[]>(root, 'manifest.json');
  const tools = readJson<ToolRecord[]>(root, 'tools.json');
  if (!Array.isArray(records) || !Array.isArray(tools)) {
    throw new Error('release media requires manifest and tool arrays');
  }
  const out: ReleaseMediaPack = { files: [], artCount: 0, audioCount: 0 };
  const art: { id: string; template: string; image: string; meta: AssetMeta }[] = [];
  const audio: ReturnType<typeof entryOf>[] = [];
  const paths = new Set<string>();
  const ids = new Set<string>();
  const add = (path: string, bytes: Uint8Array) => {
    if (paths.has(path)) throw new Error(`duplicate release media path: ${path}`);
    paths.add(path);
    out.files.push({ path, bytes });
  };
  for (const rec of [...records].sort((a, b) => a.id.localeCompare(b.id))) {
    if (rec.status !== 'approved') continue;
    if (!/^[a-z][a-z0-9_]*$/.test(rec.id) || ids.has(rec.id)) {
      throw new Error(`invalid or duplicate approved media id: ${rec.id}`);
    }
    ids.add(rec.id);
    const tool = tools.find((t) => t.id === rec.tool);
    if (!tool?.commercialUse || !rec.reviewer || !/^\d{4}-\d{2}-\d{2}$/.test(rec.reviewedAt)) {
      throw new Error(`${rec.id}: approved media needs review and commercial rights`);
    }
    const rawMeta = readJson<{
      id: string;
      source?: { sha256?: string };
      problems?: { warning?: boolean }[];
    }>(root, metaPathOf(rec.file));
    if (rawMeta.id !== rec.id || rawMeta.source?.sha256 !== rec.sha256) {
      throw new Error(`${rec.id}: processed source does not match approval`);
    }
    if (rawMeta.problems?.some((p) => !p.warning)) {
      throw new Error(`${rec.id}: approved media still fails technical checks`);
    }
    if (rec.kind === 'art') {
      const meta = rawMeta as ArtMeta;
      if (meta.importVersion !== IMPORT_VERSION || !Array.isArray(meta.frames)) {
        throw new Error(`${rec.id}: art import is stale or incomplete`);
      }
      if (meta.processing?.reference) continue;
      const bytes = new Uint8Array(readFileSync(mediaPath(root, processedPathOf(rec.file))));
      const image = decodePng(bytes);
      for (const frame of meta.frames) {
        if (
          ![frame.x, frame.y, frame.w, frame.h].every(Number.isInteger) ||
          frame.x < 0 ||
          frame.y < 0 ||
          frame.w <= 0 ||
          frame.h <= 0 ||
          frame.x + frame.w > image.w ||
          frame.y + frame.h > image.h
        )
          throw new Error(`${rec.id}: frame leaves processed image`);
      }
      const file = `images/${rec.id}.png`;
      add(`art/${file}`, bytes);
      art.push({ id: rec.id, template: rec.template, image: file, meta: runtimeMeta(meta) });
      out.artCount++;
    } else if (rec.kind === 'audio') {
      const meta = rawMeta as unknown as AudioMetaLike;
      const problems = audioMetaProblems(rec, meta, AUDIO_IMPORT_VERSION);
      if (problems.length) throw new Error(problems.join('\n'));
      const entry = entryOf(meta);
      entry.files = entry.files.map((file) => {
        if (!file.startsWith('processed/audio/')) {
          throw new Error(`${rec.id}: audio must name a processed audio file`);
        }
        const relativeFile = file.slice('processed/audio/'.length);
        if (
          !relativeFile ||
          relativeFile.startsWith('/') ||
          relativeFile.split('/').some((p) => p === '.' || p === '..')
        ) {
          throw new Error(`${rec.id}: audio output leaves the release media folder`);
        }
        add(`audio/${relativeFile}`, new Uint8Array(readFileSync(mediaPath(root, file))));
        return relativeFile;
      });
      audio.push(entry);
      out.audioCount++;
    } else {
      throw new Error(`${rec.id}: unknown approved media kind`);
    }
  }
  const json = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value)}\n`);
  add('art/manifest.json', json({ version: 1, importVersion: IMPORT_VERSION, assets: art }));
  add('audio/manifest.json', json({ version: 1, entries: audio }));
  out.files.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/** Vite writes these assets into dist; no build ever writes into the source asset tree. */
export function releaseMediaPlugin(assetRoot: string): Plugin {
  return {
    name: 'hakoniwa-release-media',
    apply: 'build',
    generateBundle() {
      const pack = buildReleaseMedia(assetRoot);
      for (const file of pack.files) {
        this.emitFile({ type: 'asset', fileName: file.path, source: file.bytes });
      }
    },
  };
}
