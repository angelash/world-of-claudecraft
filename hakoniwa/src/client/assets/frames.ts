// Standee frames cut from processed art (art_pipeline.md 3.5 and 3.7): the frame rectangle
// of a decoded sheet, mirrored for left-facing frames, with the anchor the import recorded,
// in the same SpriteFrame shape the procedural generator returns, so the renderers draw art
// and placeholder through one path. Pure.

import type { AnimName } from '../sprites/anim_spec';
import { frameEffects, type SpriteFrame } from '../sprites/generate';
import type { SpriteLook } from '../sprites/look';
import { createMatrix, mirrorX, opaqueBounds, type PixelMatrix } from '../sprites/pixels';
import type { ResolvedFrame } from './resolver';

/** A copy of the rectangle (x, y, w, h) of `sheet`; pixels outside the sheet stay clear. */
export function cropMatrix(
  sheet: PixelMatrix,
  x: number,
  y: number,
  w: number,
  h: number,
): PixelMatrix {
  const out = createMatrix(w, h);
  for (let row = 0; row < h; row++) {
    const sy = y + row;
    if (sy < 0 || sy >= sheet.h) continue;
    for (let col = 0; col < w; col++) {
      const sx = x + col;
      if (sx < 0 || sx >= sheet.w) continue;
      const si = (sy * sheet.w + sx) * 4;
      const di = (row * w + col) * 4;
      out.rgba[di] = sheet.rgba[si] as number;
      out.rgba[di + 1] = sheet.rgba[si + 1] as number;
      out.rgba[di + 2] = sheet.rgba[si + 2] as number;
      out.rgba[di + 3] = sheet.rgba[si + 3] as number;
    }
  }
  return out;
}

/**
 * Apply the render-state effects (generate.ts frameEffects) to art pixels: every drawn pixel
 * takes the effect's opacity, and a flash lightens it toward white, as the placeholder does.
 */
export function applyEffects(m: PixelMatrix, fx: { alpha: number; flash: number }): PixelMatrix {
  if (fx.alpha === 255 && fx.flash === 0) return m;
  const a = Math.max(0, Math.min(255, Math.round(fx.alpha)));
  for (let i = 0; i < m.rgba.length; i += 4) {
    if ((m.rgba[i + 3] as number) === 0) continue;
    if (fx.flash > 0) {
      for (let c = 0; c < 3; c++) {
        const v = m.rgba[i + c] as number;
        m.rgba[i + c] = Math.round(v + (255 - v) * fx.flash);
      }
    }
    m.rgba[i + 3] = a;
  }
  return m;
}

/** The pixels of a resolved frame, mirrored when it is a left-facing reuse. */
export function framePixels(sheet: PixelMatrix, f: ResolvedFrame): PixelMatrix {
  const m = cropMatrix(sheet, f.frame.x, f.frame.y, f.frame.w, f.frame.h);
  return f.flipX ? mirrorX(m) : m;
}

/**
 * A standee frame from art for one animation frame. Without a recorded anchor the foot is the
 * bottom centre. Height runs from the anchor to the topmost drawn row (names and bubbles sit
 * above it); lift is the clear space between the lowest drawn row and the anchor (flyers).
 * Translucency, the death fade, the hit flash and the glow follow the look and the animation,
 * as they do for the placeholder: they are render effects, not part of the art.
 */
export function assetSpriteFrame(
  sheet: PixelMatrix,
  f: ResolvedFrame,
  look: Pick<SpriteLook, 'archetype' | 'scale' | 'glow'>,
  anim: AnimName,
  frame: number,
): SpriteFrame {
  const matrix = applyEffects(framePixels(sheet, f), frameEffects(look.archetype, anim, frame));
  const anchorX = f.ax ?? Math.floor(matrix.w / 2);
  const anchorY = f.ay ?? matrix.h - 1;
  const b = opaqueBounds(matrix);
  const height = b ? Math.max(0, anchorY - b.y0) : 0;
  const lift = b ? Math.max(0, anchorY - b.y1) : 0;
  let glow: SpriteFrame['glow'];
  if (look.archetype === 'goddess')
    glow = { radius: Math.round(26 * look.scale), color: look.glow };
  else if (look.archetype === 'spirit')
    glow = { radius: Math.round(16 * look.scale), color: look.glow };
  return { matrix, anchorX, anchorY, height, lift, glow };
}
