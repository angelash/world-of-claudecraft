// Offscreen-canvas cache of sprite frames, keyed by look, animation, direction and frame
// (art_pipeline.md 3.7: bake on demand, reuse, evict least recently used). Frames come from
// approved art when the asset resolver has it, else from the pure procedural generator
// (src/client/assets/runtime.ts); this file only uploads pixels.

import { buildFrame, frameKey, portraitPixels } from '../assets/runtime';
import { makeCanvas, matrixToCanvas } from '../render/canvas_util';
import type { AnimName, Dir } from './anim_spec';
import type { SpriteFrame } from './generate';
import type { SpriteLook } from './look';

export interface CachedFrame {
  canvas: HTMLCanvasElement;
  frame: SpriteFrame;
}

export class SpriteCache {
  private entries = new Map<string, CachedFrame>();
  constructor(private readonly limit = 3000) {}

  get(look: SpriteLook, anim: AnimName, dir: Dir, frame: number): CachedFrame {
    const key = frameKey(look, anim, dir, frame);
    const hit = this.entries.get(key);
    if (hit) {
      // Refresh recency: Map iteration order is insertion order.
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    const f = buildFrame(look, anim, dir, frame);
    const entry: CachedFrame = { canvas: matrixToCanvas(f.matrix), frame: f };
    this.entries.set(key, entry);
    if (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return entry;
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * A small framed portrait for unit frames: the approved portrait art when there is one
 * (art_pipeline.md 3.6), else the standee (idle, facing the viewer) cropped to the head.
 */
export function portraitCanvas(
  cache: SpriteCache,
  look: SpriteLook,
  size: number,
): HTMLCanvasElement {
  const out = makeCanvas(size, size);
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.imageSmoothingEnabled = false;
  const art = portraitPixels(look);
  if (art) {
    // Pixel art shows at a whole multiple (or a whole divisor) of its size, centred (3.6).
    const k = art.w <= size ? Math.floor(size / art.w) : 1 / Math.ceil(art.w / size);
    const w = Math.round(art.w * k);
    const h = Math.round(art.h * k);
    const x = Math.floor((size - w) / 2);
    const y = Math.floor((size - h) / 2);
    ctx.drawImage(matrixToCanvas(art), 0, 0, art.w, art.h, x, y, w, h);
    return out;
  }
  const { canvas, frame } = cache.get(look, 'idle', 'down', 0);
  // Crop around the upper body: from the top of the head down about two thirds.
  const top = Math.max(0, frame.anchorY - frame.height - 2);
  const span = Math.max(16, Math.round(frame.height * 0.75));
  const sx = Math.round(frame.anchorX - span / 2);
  ctx.drawImage(canvas, sx, top, span, span, 0, 0, size, size);
  return out;
}
