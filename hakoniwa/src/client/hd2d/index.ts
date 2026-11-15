// HD-2D scene renderer (art_pipeline.md 2): the public surface. createWorldRenderer builds
// the three.js HD-2D renderer for every quality tier except "flat", and falls back to the
// flat Canvas2D renderer when WebGL2 is unavailable or the HD-2D renderer fails to start.

import { FlatWorldRenderer } from '../render/flat_renderer';
import type { WorldRenderer } from '../render/renderer';
import { Hd2dRenderer } from './hd2d_renderer';
import { QUALITY_TIERS, type QualitySettings } from './quality';

export { QUALITY_IDS, type QualityId, type QualitySettings, resolveQuality } from './quality';
export * from './view';

/** Whether this browser can create a WebGL2 context. */
export function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

export function createWorldRenderer(q: QualitySettings): WorldRenderer {
  if (q.tier === 'flat') return new FlatWorldRenderer();
  try {
    return new Hd2dRenderer(q);
  } catch (err) {
    console.warn('[hakoniwa] HD-2D renderer unavailable, using the flat renderer:', err);
    return new FlatWorldRenderer();
  }
}

export { QUALITY_TIERS };
