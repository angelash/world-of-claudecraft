// Offscreen-canvas cache of generated sprite frames, keyed by look, animation, direction
// and frame (art_pipeline_2d.md 3.7: bake on demand, reuse, evict least recently used).
// The generation itself is the pure ./generate module; this file only uploads pixels.

import { makeCanvas, matrixToCanvas } from '../render/canvas_util';
import type { AnimName, Dir } from './anim_spec';
import { generateFrame, type SpriteFrame, spriteKey } from './generate';
import type { SpriteLook } from './look';

export interface CachedFrame {
  canvas: HTMLCanvasElement;
  frame: SpriteFrame;
}

export class SpriteCache {
  private entries = new Map<string, CachedFrame>();
  constructor(private readonly limit = 3000) {}

  get(look: SpriteLook, anim: AnimName, dir: Dir, frame: number): CachedFrame {
    const key = spriteKey(look, anim, dir, frame);
    const hit = this.entries.get(key);
    if (hit) {
      // Refresh recency: Map iteration order is insertion order.
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    const f = generateFrame(look, anim, dir, frame);
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

/** A small framed portrait (idle, facing the viewer) for unit frames. */
export function portraitCanvas(
  cache: SpriteCache,
  look: SpriteLook,
  size: number,
): HTMLCanvasElement {
  const { canvas, frame } = cache.get(look, 'idle', 'down', 0);
  const out = makeCanvas(size, size);
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.imageSmoothingEnabled = false;
  // Crop around the upper body: from the top of the head down about two thirds.
  const top = Math.max(0, frame.anchorY - frame.height - 2);
  const span = Math.max(16, Math.round(frame.height * 0.75));
  const sx = Math.round(frame.anchorX - span / 2);
  ctx.drawImage(canvas, sx, top, span, span, 0, 0, size, size);
  return out;
}
