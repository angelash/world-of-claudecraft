// Thin bitmap effects over the picture, before every actionable warning, name and cast bar.
// The same overlay runs in both renderers. The casting clock picks an imported frame; no
// gameplay or quality decision depends on the bitmap being available.

import { castSurface } from '../assets/surface_art';
import type { PixelMatrix } from '../sprites/pixels';
import { matrixToCanvas } from './canvas_util';
import type { OverlayFrame } from './overlay_painter';
import { worldCalm } from './palette_modes';
import type { Scene } from './scene';

const canvases = new WeakMap<PixelMatrix, HTMLCanvasElement>();

export function paintSurfaceEffects(
  context: CanvasRenderingContext2D,
  scene: Scene,
  frame: OverlayFrame,
): void {
  if (worldCalm()) return;
  let drawn = 0;
  for (const entity of scene.items) {
    if (entity.type !== 'entity' || !entity.marks.cast) continue;
    const cast = entity.marks.cast;
    const art = castSurface(cast.school, cast.elapsedMs ?? 0);
    if (!art) continue;
    // Picture-only draw budget. The cast bars and warnings below never share this cap.
    if (drawn++ >= 64) break;
    let canvas = canvases.get(art.pixels);
    if (!canvas) {
      canvas = matrixToCanvas(art.pixels);
      canvases.set(art.pixels, canvas);
    }
    const at = frame.project(entity.x, 0.6, entity.y);
    const scale = Math.max(1, frame.scale);
    context.save();
    context.globalCompositeOperation = 'lighter';
    context.globalAlpha = 0.6;
    context.imageSmoothingEnabled = false;
    context.drawImage(
      canvas,
      Math.round(at.x - art.anchorX * scale),
      Math.round(at.y - art.anchorY * scale),
      art.pixels.w * scale,
      art.pixels.h * scale,
    );
    context.restore();
  }
}
