// The local ComfyUI graphs the CG runner uses (cg_and_video.md section 5): FLUX.2 Klein draws
// and edits keyframes, MiniMax H3 turns a first frame (and, when the storyboard anchors it, a
// last frame) into one three-second segment. The server, models and launch flags live outside
// the repo (the open-share environment registry); this file only builds API graphs, stages
// input images and collects the outputs.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { COMFY_ROOT, COMFY_URL, cancelPrompt } from '../audio_gen/comfy';

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

export const VIDEO_MODELS = {
  h3Unet: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
  h3Encoder: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  h3Vae: 'minimax_h3_video_vae_int8_convrot.safetensors',
  h3Turbo: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors',
  klein: 'flux-2-klein-4b.safetensors',
  kleinEncoder: 'qwen_3_4b_fp8_mixed.safetensors',
  kleinVae: 'flux2-vae.safetensors',
} as const;

/** Copy an image into ComfyUI's input folder; returns the name LoadImage takes. */
export function stageImage(path: string, subfolder = 'hakoniwa_cg'): string {
  const dir = join(COMFY_ROOT, 'input', subfolder);
  mkdirSync(dir, { recursive: true });
  copyFileSync(path, join(dir, basename(path)));
  return `${subfolder}/${basename(path)}`;
}

export interface KeyframeJob {
  prompt: string;
  /** staged input names, in order (the edited keyframe first when editing) */
  references: string[];
  width: number;
  height: number;
  seed: number;
  prefix: string;
}

/** FLUX.2 Klein 4B, 4 steps; every reference rides as a reference latent. */
export function keyframeGraph(j: KeyframeJob): Graph {
  const g: Graph = {
    unet: {
      class_type: 'UNETLoader',
      inputs: { unet_name: VIDEO_MODELS.klein, weight_dtype: 'default' },
    },
    clip: {
      class_type: 'CLIPLoader',
      inputs: { clip_name: VIDEO_MODELS.kleinEncoder, type: 'flux2', device: 'default' },
    },
    vae: { class_type: 'VAELoader', inputs: { vae_name: VIDEO_MODELS.kleinVae } },
    pos: { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: j.prompt } },
    neg: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['pos', 0] } },
    latent: {
      class_type: 'EmptyFlux2LatentImage',
      inputs: { width: j.width, height: j.height, batch_size: 1 },
    },
    noise: { class_type: 'RandomNoise', inputs: { noise_seed: j.seed } },
    sampler: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    sigmas: {
      class_type: 'Flux2Scheduler',
      inputs: { steps: 4, width: j.width, height: j.height },
    },
  };
  let positive: [string, number] = ['pos', 0];
  let negative: [string, number] = ['neg', 0];
  j.references.forEach((name, i) => {
    g[`ref${i}`] = { class_type: 'LoadImage', inputs: { image: name } };
    g[`refenc${i}`] = {
      class_type: 'VAEEncode',
      inputs: { pixels: [`ref${i}`, 0], vae: ['vae', 0] },
    };
    g[`refpos${i}`] = {
      class_type: 'ReferenceLatent',
      inputs: { conditioning: positive, latent: [`refenc${i}`, 0] },
    };
    g[`refneg${i}`] = {
      class_type: 'ReferenceLatent',
      inputs: { conditioning: negative, latent: [`refenc${i}`, 0] },
    };
    positive = [`refpos${i}`, 0];
    negative = [`refneg${i}`, 0];
  });
  g.guider = {
    class_type: 'CFGGuider',
    inputs: { model: ['unet', 0], positive, negative, cfg: 1.0 },
  };
  g.sample = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['noise', 0],
      guider: ['guider', 0],
      sampler: ['sampler', 0],
      sigmas: ['sigmas', 0],
      latent_image: ['latent', 0],
    },
  };
  g.decode = { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['vae', 0] } };
  g.save = {
    class_type: 'SaveImage',
    inputs: { images: ['decode', 0], filename_prefix: j.prefix },
  };
  return g;
}

export interface SegmentJob {
  prompt: string;
  first: string;
  last: string | null;
  width: number;
  height: number;
  frames: number;
  seed: number;
  prefix: string;
}

/**
 * MiniMax H3 FL2VA with the 8-step turbo LoRA (the verified settings of the environment
 * registry). The video is saved without the model's audio (the film is scored from the game's
 * own music), and the last decoded frame is saved as a PNG: the next segment starts from it
 * losslessly instead of from a frame pulled out of the compressed video.
 */
export function segmentGraph(j: SegmentJob): Graph {
  const i2v: Record<string, unknown> = {
    clip: ['clip', 0],
    vae: ['vae', 0],
    prompt: j.prompt,
    width: j.width,
    height: j.height,
    length: j.frames,
    first_frame: ['first', 0],
  };
  const g: Graph = {
    unet: {
      class_type: 'UNETLoader',
      inputs: { unet_name: VIDEO_MODELS.h3Unet, weight_dtype: 'default' },
    },
    lora: {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: ['unet', 0], lora_name: VIDEO_MODELS.h3Turbo, strength_model: 1.0 },
    },
    clip: {
      class_type: 'CLIPLoader',
      inputs: { clip_name: VIDEO_MODELS.h3Encoder, type: 'minimax', device: 'default' },
    },
    vae: { class_type: 'VAELoader', inputs: { vae_name: VIDEO_MODELS.h3Vae } },
    first: { class_type: 'LoadImage', inputs: { image: j.first } },
    i2v: { class_type: 'MiniMaxH3ImageToVideo', inputs: i2v },
    guider: { class_type: 'BasicGuider', inputs: { model: ['lora', 0], conditioning: ['i2v', 0] } },
    noise: { class_type: 'RandomNoise', inputs: { noise_seed: j.seed } },
    sampler: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'res_multistep' } },
    sigmas: {
      class_type: 'BasicScheduler',
      inputs: { model: ['lora', 0], scheduler: 'simple', steps: 8, denoise: 1.0 },
    },
    sample: {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['noise', 0],
        guider: ['guider', 0],
        sampler: ['sampler', 0],
        sigmas: ['sigmas', 0],
        latent_image: ['i2v', 1],
      },
    },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['vae', 0] } },
    video: {
      class_type: 'CreateVideo',
      inputs: { images: ['decode', 0], fps: 24.0, bit_depth: 8 },
    },
    save: {
      class_type: 'SaveVideo',
      inputs: { video: ['video', 0], filename_prefix: j.prefix, format: 'auto' },
    },
    tail: {
      class_type: 'ImageFromBatch',
      inputs: { image: ['decode', 0], batch_index: j.frames - 1, length: 1 },
    },
    saveTail: {
      class_type: 'SaveImage',
      inputs: { images: ['tail', 0], filename_prefix: `${j.prefix}_last` },
    },
  };
  if (j.last) {
    g.last = { class_type: 'LoadImage', inputs: { image: j.last } };
    i2v.last_frame = ['last', 0];
  }
  return g;
}

interface OutputFile {
  filename: string;
  subfolder: string;
  type: string;
}

interface HistoryEntry {
  status?: { status_str?: string; completed?: boolean; messages?: unknown[] };
  outputs?: Record<string, Record<string, unknown>>;
}

export interface GraphResult {
  promptId: string;
  seconds: number;
  /** downloaded files by output node id */
  files: Record<string, string[]>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Queue a graph, wait for it, download every saved file into destDir. */
export async function runGraph(
  graph: Graph,
  destDir: string,
  timeoutMs: number,
): Promise<GraphResult> {
  const started = Date.now();
  const res = await fetch(`${COMFY_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: graph, client_id: 'hakoniwa-cg' }),
  });
  const body = (await res.json()) as { prompt_id?: string };
  if (!res.ok || !body.prompt_id)
    throw new Error(`ComfyUI rejected the graph: ${JSON.stringify(body)}`);
  const promptId = body.prompt_id;
  let entry: HistoryEntry | undefined;
  while (Date.now() - started < timeoutMs) {
    await sleep(2000);
    try {
      const hist = (await (await fetch(`${COMFY_URL}/history/${promptId}`)).json()) as Record<
        string,
        HistoryEntry
      >;
      entry = hist[promptId];
    } catch {
      // a busy server can drop a poll; the job keeps running, ask again
      continue;
    }
    if (entry?.status?.completed || entry?.status?.status_str === 'error') break;
  }
  if (!entry?.status?.completed && entry?.status?.status_str !== 'error') {
    await cancelPrompt(promptId);
    throw new Error(`timed out waiting for ${promptId}; the job was cancelled in ComfyUI`);
  }
  if (entry?.status?.status_str === 'error')
    throw new Error(`ComfyUI job ${promptId} failed: ${JSON.stringify(entry.status.messages)}`);
  mkdirSync(destDir, { recursive: true });
  writeFileSync(join(destDir, 'graph.json'), `${JSON.stringify(graph, null, 2)}\n`);
  const files: Record<string, string[]> = {};
  for (const [node, output] of Object.entries(entry?.outputs ?? {})) {
    for (const value of Object.values(output)) {
      if (!Array.isArray(value)) continue;
      for (const f of value as OutputFile[]) {
        if (!f || typeof f.filename !== 'string') continue;
        const url = `${COMFY_URL}/view?${new URLSearchParams({ filename: f.filename, subfolder: f.subfolder, type: f.type })}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`could not download ${f.filename}: ${res.status}`);
        const data = new Uint8Array(await res.arrayBuffer());
        const dest = join(destDir, f.filename);
        writeFileSync(dest, data);
        files[node] = [...(files[node] ?? []), dest];
      }
    }
  }
  return { promptId, seconds: (Date.now() - started) / 1000, files };
}
