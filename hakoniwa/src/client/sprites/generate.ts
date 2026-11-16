// Sprite frame generator: SpriteLook + animation + direction + frame index to a pixel
// matrix with its ground anchor. Shapes are drawn per template, lit from the upper left,
// outlined with deepened neighbour colours and coloured through the look's palette.
// Left frames mirror right frames (art_pipeline.md 3.5). Animations without a drawing of
// their own borrow the nearest procedural pose (anim_spec.ts proceduralPose). Pure and
// deterministic.

import { ANIM_SPECS, type AnimName, type Dir, proceduralPose } from './anim_spec';
import {
  drawBird,
  drawGolem,
  drawObject,
  drawSlime,
  drawSpirit,
  drawWolf,
  liftFor,
  objectVariant,
} from './creatures';
import { drawHumanoid, humanoidBuild, humanoidPose } from './humanoid';
import { type Archetype, bodyTemplate, paletteFor, type SpriteLook } from './look';
import type { Rgb } from './pixels';
import { mirrorX, opaqueBounds, type PixelMatrix } from './pixels';
import { autoShade, colorize, createShape, outline } from './shape';

export interface SpriteFrame {
  matrix: PixelMatrix;
  /** ground contact point inside the matrix */
  anchorX: number;
  anchorY: number;
  /** pixels from the anchor up to the top of the drawn body (for names and bubbles) */
  height: number;
  /** pixels the body floats above its ground shadow */
  lift: number;
  /** additive glow the renderer adds around emissive beings */
  glow?: { radius: number; color: Rgb };
}

const BASE_FRAME: Record<ReturnType<typeof bodyTemplate>, number> = {
  H: 48,
  HS: 48,
  HL: 64,
  Q: 48,
  F: 48,
  B: 48,
  O: 32,
};

export function frameSize(look: SpriteLook): { w: number; h: number; ax: number; ay: number } {
  const tpl = bodyTemplate(look.archetype);
  const base = BASE_FRAME[tpl];
  const size = 2 * Math.ceil((base * look.scale) / 2);
  const foot = Math.round((tpl === 'O' ? 3 : 4) * look.scale);
  return { w: size, h: size, ax: size / 2, ay: size - foot };
}

export function frameCountFor(look: SpriteLook, anim: AnimName): number {
  if (look.archetype === 'object') return 1;
  return ANIM_SPECS[anim].frames;
}

export function spriteKey(look: SpriteLook, anim: AnimName, dir: Dir, frame: number): string {
  return `${look.key}|${anim}|${dir}|${frame}`;
}

/**
 * Render-state effects baked into a standee frame (art_pipeline.md 3.4 and 3.8): spirits and
 * slimes are translucent and fade while they fall, and the first frame of a hit flashes white
 * (block and dodge do not). The placeholder and art frames share them, so the feedback a
 * player reads does not change when art arrives.
 */
export function frameEffects(
  archetype: Archetype,
  anim: AnimName,
  frame: number,
): { alpha: number; flash: number } {
  const p = proceduralPose(anim, frame);
  let alpha = 255;
  if (archetype === 'spirit') alpha = 215;
  else if (archetype === 'slime') alpha = 235;
  if (p.pose === 'death' && (archetype === 'spirit' || archetype === 'slime')) {
    alpha = Math.round(alpha * (1 - p.frame * 0.22));
  }
  const flash = anim === 'hit' && p.frame === 0 ? 0.55 : 0;
  return { alpha, flash };
}

export function generateFrame(
  look: SpriteLook,
  anim: AnimName,
  dir: Dir,
  frameIndex: number,
): SpriteFrame {
  const s = look.scale;
  const { w, h, ax, ay } = frameSize(look);
  const frames = frameCountFor(look, anim);
  const clamped = Math.max(0, Math.min(frames - 1, Math.floor(frameIndex)));
  const pose = proceduralPose(anim, clamped);
  const p = pose.pose;
  const frame = frames === 1 ? 0 : pose.frame;
  const drawDir = dir === 'left' ? 'right' : dir;
  const lift = liftFor(look.archetype, p, frame, s);
  const groundY = ay - lift;
  const g = createShape(w, h);
  const arch = look.archetype;
  switch (arch) {
    case 'golem':
      drawGolem(g, p, frame, drawDir, ax, groundY, s);
      break;
    case 'wolf':
      drawWolf(g, p, frame, drawDir, ax, groundY, s);
      break;
    case 'bird':
      drawBird(g, p, frame, drawDir, ax, groundY, s);
      break;
    case 'slime':
      drawSlime(g, p, frame, drawDir, ax, groundY, s);
      break;
    case 'spirit':
      drawSpirit(g, p, frame, drawDir, ax, groundY, s);
      break;
    case 'object':
      drawObject(g, objectVariant(look.key, !!look.glyph), ax, groundY, s);
      break;
    default:
      drawHumanoid(g, humanoidBuild(arch, s), humanoidPose(p, frame, s), drawDir, ax, groundY, s);
  }
  autoShade(g);
  outline(g, bodyTemplate(arch) === 'HL' || s >= 1.5);

  const { alpha, flash } = frameEffects(arch, anim, frames === 1 ? 0 : clamped);
  let matrix = colorize(g, paletteFor(look), { alpha, flash, glow: look.glow });
  if (dir === 'left') matrix = mirrorX(matrix);
  const bounds = opaqueBounds(matrix);
  const height = bounds ? ay - bounds.y0 : 0;
  let glow: SpriteFrame['glow'];
  if (arch === 'goddess') glow = { radius: Math.round(26 * s), color: look.glow };
  else if (arch === 'spirit') glow = { radius: Math.round(16 * s), color: look.glow };
  return { matrix, anchorX: ax, anchorY: ay, height, lift, glow };
}
