// Standee geometry (art_pipeline.md 2.4): a pixel sprite becomes a quad that leans back to
// face the camera and turns with its yaw, one sprite pixel per sixteenth of a metre. The
// quad's local frame puts the foot at the origin, x along screen right and y along screen
// up; the shader writes the depth of the same point standing upright at the foot, so
// things in front cover the standee and nothing behind it ever cuts its top. Pure.

import { TILE_PX } from '../render/camera';

export interface StandeeQuad {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/** Quad extents in metres around the foot for a frame of w by h pixels anchored at (ax, ay). */
export function standeeQuad(w: number, h: number, ax: number, ay: number): StandeeQuad {
  return {
    left: -ax / TILE_PX,
    right: (w - ax) / TILE_PX,
    bottom: -(h - ay) / TILE_PX,
    top: ay / TILE_PX,
  };
}

/** Height (metres) of the visible figure above the foot, for labels and hit boxes. */
export function standeeHeight(frameHeightPx: number): number {
  return frameHeightPx / TILE_PX;
}

/**
 * Screen hit box of a standee from its projected foot (device pixels): the figure spans
 * `heightPx` sprite pixels up and `widthPx` across, scaled by the zoom step.
 */
export function standeeHitBox(
  foot: { x: number; y: number },
  widthPx: number,
  heightPx: number,
  step: number,
): { x: number; y: number; w: number; h: number } {
  const w = widthPx * step;
  const h = (heightPx + 2) * step;
  return { x: foot.x - w / 2, y: foot.y - heightPx * step, w, h };
}
