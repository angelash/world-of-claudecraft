// Local ComfyUI client and the audio graphs the pilot runs on it (ACE-Step 1.5 for
// music, Stable Audio 3 Small-SFX for effects and beds). The server and models live
// outside the repo (E:/AI/ComfyUI_modern, recorded in the open-share environment
// registry); HAKONIWA_COMFY_URL and HAKONIWA_COMFY_ROOT override the defaults.

import { execFile } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export const COMFY_URL = process.env.HAKONIWA_COMFY_URL || 'http://127.0.0.1:8189';
export const COMFY_ROOT = process.env.HAKONIWA_COMFY_ROOT || 'E:/AI/ComfyUI_modern';

export const MODELS = {
  aceDit: 'acestep_v1.5_turbo.safetensors',
  aceTextEncoder: 'qwen_0.6b_ace15.safetensors',
  aceLm: 'qwen_1.7b_ace15.safetensors',
  aceVae: 'ace_1.5_vae.safetensors',
  sfxCheckpoint: 'stable_audio_3_small_sfx.safetensors',
  sfxTextEncoder: 't5gemma_b_b_ul2.safetensors',
} as const;

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

export interface AceSettings {
  caption: string;
  seconds: number;
  bpm: number;
  keyscale: string;
  timesignature: '2' | '3' | '4' | '6';
  seed: number;
  outputPrefix: string;
}

/**
 * Tiles of 512 latent frames (about 20 s at 25 Hz) with a 64-frame (about 2.6 s) overlap,
 * ComfyUI's own defaults. The 8 GB card shares its memory with the desktop, so a whole
 * decode overflows into shared memory once free memory runs low: a 330-second take decoded
 * for over three hours and, later on a busy desktop, takes of 140 to 160 seconds for 15 to
 * 20 minutes, while tiles finish in about a minute. A take shorter than one tile decodes as
 * one tile, which equals the whole decode.
 */
export const ACE_DECODE_TILE = { tile_size: 512, overlap: 64 } as const;

/** The VAE decode node for every ACE-Step take. */
export function aceDecodeNode(): Graph[string] {
  return {
    class_type: 'VAEDecodeAudioTiled',
    inputs: { samples: ['sampler', 0], vae: ['vae', 0], ...ACE_DECODE_TILE },
  };
}

function aceBase(s: AceSettings, generateCodes: boolean): Graph {
  return {
    unet: {
      class_type: 'UNETLoader',
      inputs: { unet_name: MODELS.aceDit, weight_dtype: 'default' },
    },
    clip: {
      class_type: 'DualCLIPLoader',
      inputs: {
        clip_name1: MODELS.aceTextEncoder,
        clip_name2: MODELS.aceLm,
        type: 'ace',
        device: 'default',
      },
    },
    vae: { class_type: 'VAELoader', inputs: { vae_name: MODELS.aceVae } },
    sampling: { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['unet', 0], shift: 3 } },
    text: {
      class_type: 'TextEncodeAceStepAudio1.5',
      inputs: {
        clip: ['clip', 0],
        tags: s.caption,
        lyrics: '[Instrumental]',
        seed: s.seed,
        bpm: s.bpm,
        duration: s.seconds,
        timesignature: s.timesignature,
        language: 'en',
        keyscale: s.keyscale,
        generate_audio_codes: generateCodes,
        cfg_scale: 2,
        temperature: 0.85,
        top_p: 0.9,
        top_k: 0,
        min_p: 0,
      },
    },
    negative: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['text', 0] } },
    decode: aceDecodeNode(),
    save: {
      class_type: 'SaveAudio',
      inputs: { audio: ['decode', 0], filename_prefix: s.outputPrefix },
    },
  };
}

/** Text to music: the prompt library entry alone, as the current plan would do it. */
export function aceText2MusicGraph(s: AceSettings): Graph {
  return {
    ...aceBase(s, true),
    latent: {
      class_type: 'EmptyAceStep1.5LatentAudio',
      inputs: { seconds: s.seconds, batch_size: 1 },
    },
    sampler: {
      class_type: 'KSampler',
      inputs: {
        model: ['sampling', 0],
        positive: ['text', 0],
        negative: ['negative', 0],
        latent_image: ['latent', 0],
        seed: s.seed,
        steps: 8,
        cfg: 1,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1,
      },
    },
  };
}

/**
 * Cover: the rendered score is the reference. ACE-Step tokenizes it into 5 Hz semantic
 * hints that hold melody, harmony and form, while the caption re-voices it. With
 * denoise 1 the sampler starts from noise (hints only); below 1 it also starts from the
 * encoded render, which keeps more of the original sound.
 */
export function aceCoverGraph(s: AceSettings, inputFile: string, denoise: number): Graph {
  const fromSource = denoise < 1;
  return {
    ...aceBase(s, false),
    source: { class_type: 'LoadAudio', inputs: { audio: inputFile } },
    encoded: { class_type: 'VAEEncodeAudio', inputs: { audio: ['source', 0], vae: ['vae', 0] } },
    reference: {
      class_type: 'ReferenceTimbreAudio',
      inputs: { conditioning: ['text', 0], latent: ['encoded', 0] },
    },
    latent: {
      class_type: 'EmptyAceStep1.5LatentAudio',
      inputs: { seconds: s.seconds, batch_size: 1 },
    },
    sampler: {
      class_type: 'KSampler',
      inputs: {
        model: ['sampling', 0],
        positive: ['reference', 0],
        negative: ['negative', 0],
        latent_image: fromSource ? ['encoded', 0] : ['latent', 0],
        seed: s.seed,
        steps: 8,
        cfg: 1,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise,
      },
    },
  };
}

export interface SfxSettings {
  prompt: string;
  negative: string;
  seconds: number;
  batch: number;
  seed: number;
  outputPrefix: string;
}

/** Stable Audio 3 Small-SFX text to audio (8 steps, cfg 1, as the distilled templates use). */
export function stableAudioGraph(s: SfxSettings): Graph {
  return {
    ckpt: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: MODELS.sfxCheckpoint } },
    clip: {
      class_type: 'CLIPLoader',
      inputs: { clip_name: MODELS.sfxTextEncoder, type: 'stable_audio', device: 'default' },
    },
    positive: { class_type: 'CLIPTextEncode', inputs: { text: s.prompt, clip: ['clip', 0] } },
    negative: { class_type: 'CLIPTextEncode', inputs: { text: s.negative, clip: ['clip', 0] } },
    latent: { class_type: 'EmptyLatentAudio', inputs: { seconds: s.seconds, batch_size: s.batch } },
    sampler: {
      class_type: 'KSampler',
      inputs: {
        model: ['ckpt', 0],
        positive: ['positive', 0],
        negative: ['negative', 0],
        latent_image: ['latent', 0],
        seed: s.seed,
        steps: 8,
        cfg: 1,
        sampler_name: 'lcm',
        scheduler: 'simple',
        denoise: 1,
      },
    },
    decode: { class_type: 'VAEDecodeAudio', inputs: { samples: ['sampler', 0], vae: ['ckpt', 2] } },
    save: {
      class_type: 'SaveAudio',
      inputs: { audio: ['decode', 0], filename_prefix: s.outputPrefix },
    },
  };
}

/** Put a local file into ComfyUI's input folder and return the name LoadAudio takes. */
export function stageInput(path: string, subfolder = 'hakoniwa_audio_pilot'): string {
  const dir = join(COMFY_ROOT, 'input', subfolder);
  mkdirSync(dir, { recursive: true });
  copyFileSync(path, join(dir, basename(path)));
  return `${subfolder}/${basename(path)}`;
}

function gpuMemoryUsedMiB(): Promise<number> {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=memory.used', '--format=csv,noheader,nounits'],
      (err, out) => {
        resolve(err ? 0 : Number(String(out).trim().split('\n')[0]) || 0);
      },
    );
  });
}

export interface JobResult {
  promptId: string;
  seconds: number;
  peakGpuMiB: number;
  files: string[];
}

interface HistoryEntry {
  status?: { status_str?: string; completed?: boolean; messages?: unknown[] };
  outputs?: Record<
    string,
    { audio?: Array<{ filename: string; subfolder: string; type: string }> }
  >;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Drop a prompt from ComfyUI's pending queue and interrupt it if it is the running one. */
export async function cancelPrompt(promptId: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const post = (path: string, body: unknown) =>
    fetchFn(`${COMFY_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  await post('/queue', { delete: [promptId] });
  await post('/interrupt', { prompt_id: promptId });
}

/** Queue a graph, wait for it, download its audio outputs into destDir. */
export async function runGraph(
  graph: Graph,
  destDir: string,
  timeoutMs = 30 * 60 * 1000,
): Promise<JobResult> {
  const started = Date.now();
  const res = await fetch(`${COMFY_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: graph, client_id: 'hakoniwa-audio-pilot' }),
  });
  const body = (await res.json()) as { prompt_id?: string; error?: unknown; node_errors?: unknown };
  if (!res.ok || !body.prompt_id)
    throw new Error(`ComfyUI rejected the graph: ${JSON.stringify(body)}`);
  const promptId = body.prompt_id;
  let peak = await gpuMemoryUsedMiB();
  let entry: HistoryEntry | undefined;
  while (Date.now() - started < timeoutMs) {
    await sleep(1500);
    peak = Math.max(peak, await gpuMemoryUsedMiB());
    const hist = (await (await fetch(`${COMFY_URL}/history/${promptId}`)).json()) as Record<
      string,
      HistoryEntry
    >;
    entry = hist[promptId];
    if (entry?.status?.completed || entry?.status?.status_str === 'error') break;
  }
  if (!entry?.status?.completed && entry?.status?.status_str !== 'error') {
    // Take the abandoned job out of ComfyUI, or every later job queues behind it and
    // times out in turn (seen once: one stuck decode failed the next six entries).
    await cancelPrompt(promptId);
    throw new Error(`Timed out waiting for ${promptId}; the job was cancelled in ComfyUI`);
  }
  if (!entry) throw new Error(`No history for ${promptId}`);
  if (entry.status?.status_str === 'error') {
    throw new Error(`ComfyUI job ${promptId} failed: ${JSON.stringify(entry.status.messages)}`);
  }
  mkdirSync(destDir, { recursive: true });
  // The exact API graph beside its outputs, so any take can be reproduced.
  writeFileSync(join(destDir, 'graph.json'), `${JSON.stringify(graph, null, 2)}\n`);
  const files: string[] = [];
  for (const output of Object.values(entry.outputs ?? {})) {
    for (const file of output.audio ?? []) {
      const url = `${COMFY_URL}/view?${new URLSearchParams({ filename: file.filename, subfolder: file.subfolder, type: file.type })}`;
      const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
      const dest = join(destDir, file.filename);
      writeFileSync(dest, data);
      files.push(dest);
    }
  }
  if (files.length === 0) throw new Error(`ComfyUI job ${promptId} produced no audio`);
  return { promptId, seconds: (Date.now() - started) / 1000, peakGpuMiB: peak, files };
}
