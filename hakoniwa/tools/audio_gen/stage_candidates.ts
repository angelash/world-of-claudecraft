// Put the audio pilot's takes into the candidate pool the editor's review desk reads
// (assets/_candidates/audio/<id>/candidates.json plus the take files; assets/README.md 3.4).
//
//   node ../node_modules/tsx/dist/cli.mjs tools/audio_gen/stage_candidates.ts
//
// Reads .local/audio_pilot/listen/records.json (written by pilot.ts) and copies every take
// it lists. Re-running replaces the pool folders of the staged ids.

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Candidate, CandidateSet } from '../assets/review/model';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LISTEN = join(ROOT, '.local', 'audio_pilot', 'listen');
const POOL = join(ROOT, 'assets', '_candidates', 'audio');

interface PilotRecord {
  file: string;
  assetId: string;
  method: string;
  tool: string;
  models: string[];
  seed?: number;
  settings: Record<string, unknown>;
  prompt?: string;
  generationSeconds?: number;
  peakGpuMiB?: number;
  loudness?: { lufs: number; truePeak: number };
  note?: string;
}

const TOOL_IDS: Record<string, { id: string; version: string }> = {
  'FluidSynth 2.6.2 + GeneralUser GS 2.0.3': {
    id: 'score_render_fluidsynth',
    version: 'FluidSynth 2.6.2, GeneralUser GS 2.0.3',
  },
  'ComfyUI 0.34.0, ACE-Step 1.5 turbo': {
    id: 'ace_step_15',
    version: 'ACE-Step 1.5 turbo (Comfy-Org/ACE-Step-1.5 371bb168), ComfyUI 0.34.0',
  },
  'ComfyUI 0.34.0, Stable Audio 3 Small-SFX': {
    id: 'stable_audio_3_small_sfx',
    version: 'Stable Audio 3 Small-SFX (Comfy-Org/stable-audio-3 75aad883), ComfyUI 0.34.0',
  },
};

/** Pool key, group and label of a listening-set file. */
function describe(file: string): { key: string; group: string; label: string } | null {
  const music = /^0(\d)_music_([A-D])_(.+)\.wav$/.exec(file);
  if (music) {
    const group = music[2] as string;
    const rest = music[3] as string;
    if (group === 'A' && rest !== 'score_render_full') return null; // layers ride on the full take
    const labels: Record<string, string> = {
      A: '乐谱直出（General MIDI 音色库），含三层分轨',
      B: 'ACE-Step 翻奏，从噪声起，只取乐谱的旋律与结构',
      C: 'ACE-Step 翻奏，从小样起',
      D: 'ACE-Step 只用提示词生成（无循环裁切、无分层）',
    };
    const key = `${group}_${rest
      .replace(/^score_render_full$/, 'render')
      .replace(/^cover_from_noise_/, 'noise_')
      .replace(/^cover_from_render_/, '')
      .replace(/^text_only_/, '')}`;
    return { key, group, label: `${labels[group]}（${key}）` };
  }
  const sfx = /^08_sfx_hit_slash_flesh_([AB])_take(\d+)\.wav$/.exec(file);
  if (sfx) {
    const group = sfx[1] as string;
    const label = group === 'A' ? '提示词库原文' : '改写版（写明闷响与低频）';
    return { key: `${group}${sfx[2]}`, group, label: `${label}，第 ${sfx[2]} 条` };
  }
  const amb = /^09_amb_town_day_(mono|wide)_loop90\.wav$/.exec(file);
  if (amb) {
    const wide = amb[1] === 'wide';
    return {
      key: amb[1] as string,
      group: amb[1] as string,
      label: wide ? '两次生成分放左右声道（宽立体声）' : '一次生成（模型输出为单声道）',
    };
  }
  return null;
}

function main(): void {
  const recordsPath = join(LISTEN, 'records.json');
  if (!existsSync(recordsPath)) throw new Error(`run pilot.ts first: ${recordsPath} is missing`);
  const data = JSON.parse(readFileSync(recordsPath, 'utf8')) as {
    generatedOn: string;
    records: PilotRecord[];
  };
  const generatedAt = data.generatedOn.slice(0, 10);
  const byAsset = new Map<string, Candidate[]>();
  const layersOf = (assetId: string) =>
    data.records
      .filter((r) => r.assetId === assetId && /^01_music_A_score_render_L\d/.test(r.file))
      .map((r) => r.file);

  // Check every record before touching the pool, so a bad record cannot leave it emptied.
  for (const r of data.records) {
    if (describe(r.file) && !TOOL_IDS[r.tool]) throw new Error(`no tool id for "${r.tool}"`);
  }
  for (const asset of new Set(data.records.map((r) => r.assetId))) {
    rmSync(join(POOL, asset), { recursive: true, force: true });
  }
  for (const r of data.records) {
    const d = describe(r.file);
    if (!d) continue;
    const tool = TOOL_IDS[r.tool];
    if (!tool) throw new Error(`no tool id for "${r.tool}"`);
    const dir = join(POOL, r.assetId);
    mkdirSync(dir, { recursive: true });
    const put = (name: string) => {
      copyFileSync(join(LISTEN, name), join(dir, name));
      return `_candidates/audio/${r.assetId}/${name}`;
    };
    const files: Candidate['files'] = [{ role: 'main', label: d.key, path: put(r.file) }];
    if (d.key === 'A_render') {
      for (const layer of layersOf(r.assetId)) {
        const label = /_L(\d)_/.exec(layer)?.[1] ?? '';
        files.push({ role: 'layer', label: `L${label}`, path: put(layer) });
      }
    }
    const metrics: Record<string, number | string> = {};
    if (r.loudness) {
      metrics.lufs = r.loudness.lufs;
      metrics.truePeak = r.loudness.truePeak;
    }
    if (r.generationSeconds !== undefined) metrics.generationSeconds = r.generationSeconds;
    if (r.peakGpuMiB !== undefined) metrics.peakGpuMiB = r.peakGpuMiB;
    const candidate: Candidate = {
      key: d.key,
      label: d.label,
      group: d.group,
      method: r.method,
      tool: tool.id,
      toolVersion: tool.version,
      models: r.models,
      seed: r.seed === undefined ? '' : String(r.seed),
      prompt:
        r.prompt ??
        (d.key === 'A_render' ? 'score: tools/audio_gen/scores/mus_town_borderstone_day.ts' : ''),
      promptLang: 'en',
      generatedAt,
      settings: r.settings,
      metrics,
      files,
      note: r.note ?? '',
    };
    byAsset.set(r.assetId, [...(byAsset.get(r.assetId) ?? []), candidate]);
  }
  for (const [assetId, candidates] of byAsset) {
    const sequence = assetId.startsWith('sfx_');
    const set: CandidateSet = {
      assetId,
      kind: 'audio',
      createdAt: generatedAt,
      source: 'tools/audio_gen/pilot.ts',
      adoptMode: sequence ? 'sequence' : 'single',
      adoptCount: sequence ? 4 : 0,
      candidates: candidates.sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true })),
    };
    writeFileSync(join(POOL, assetId, 'candidates.json'), `${JSON.stringify(set, null, 2)}\n`);
    console.log(`${assetId}: ${candidates.length} candidates`);
  }
}

main();
