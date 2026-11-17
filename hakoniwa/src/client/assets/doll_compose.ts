// The paper-doll assembler (art_pipeline.md 3.3; ux_and_onboarding.md 3.4.3): a doll recipe's
// approved parts composed into one standee frame. The layers come from `dollPlan` in draw
// order: the back attachment, the outfit strip (the body: its frame and foot anchor define the
// standee), the rigid head parts' back rows, the head base, the front head parts, the held
// items. Head parts sit on the mannequin's neck and held items on its hands; the import does
// not record those anchors yet, so they come from the procedural mannequin of the same body
// (src/client/sprites/humanoid.ts: torso top plus the head bob of the pose), which is the pose
// reference the doll art is drawn on. Key colours are recoloured from the look's palette
// through the slot map the import writes (meta `slots`: colour to slot and level).
//
// Composition only happens when every named layer is approved and decoded; otherwise the
// caller keeps the procedural placeholder, so with no art the standee is the placeholder bit
// for bit (runtime.ts). Pure.

import { DOLL_LAYERS } from '../../systems/world/appearance';
import type { DollBody } from '../../systems/world/types';
import type { AnimName, Dir } from '../sprites/anim_spec';
import { proceduralPose } from '../sprites/anim_spec';
import { frameEffects, type SpriteFrame } from '../sprites/generate';
import { humanoidBuild, humanoidPose } from '../sprites/humanoid';
import { paletteFor, type SpriteLook } from '../sprites/look';
import { createMatrix, opaqueBounds, type PixelMatrix } from '../sprites/pixels';
import { SLOT } from '../sprites/shape';
import { applyEffects, framePixels } from './frames';
import type { AssetResolver, ResolvedFrame } from './resolver';
import type { SheetPixels } from './runtime';
import { activeArt, dollPlan } from './sprite_source';

/** Points of the mannequin relative to the foot anchor (x right, y down), for one pose. */
export interface DollAnchors {
  neck: { x: number; y: number };
  mainHand: { x: number; y: number };
  offHand: { x: number; y: number };
}

/** The mannequin archetype whose proportions a doll body uses. */
function mannequin(body: DollBody): 'human' | 'halfling' {
  return body === 'hs' ? 'halfling' : 'human';
}

/** The neck and hand points of a doll body in a pose (from the procedural mannequin). */
export function dollAnchors(body: DollBody, anim: AnimName, dir: Dir, frame: number): DollAnchors {
  const b = humanoidBuild(mannequin(body), 1);
  const p = proceduralPose(anim, frame);
  const pose = humanoidPose(p.pose, p.frame, 1);
  const headD = Math.round(b.headR * 2);
  const legH = Math.max(2, b.bodyH - headD - b.torsoH);
  const ground = pose.bob;
  const torsoTop = ground - legH - b.torsoH;
  const side = dir === 'left' || dir === 'right';
  const reach = side ? 1 : Math.round(b.torsoW / 2) + b.armW;
  const handY = torsoTop + Math.round(b.torsoH * 0.8);
  const facing = dir === 'left' ? -1 : 1;
  return {
    neck: { x: 0, y: torsoTop + 1 + pose.headBob },
    mainHand: { x: side ? facing * (reach + 2) : reach, y: handY },
    offHand: { x: side ? -facing * 1 : -reach, y: handY },
  };
}

/** The palette slot of each key slot name the import writes (tools/assets/core/doll_keys.ts). */
const SLOT_OF: Readonly<Record<string, number>> = {
  primary: SLOT.PRIMARY,
  secondary: SLOT.SECONDARY,
  skin: SLOT.SKIN,
  hair: SLOT.HAIR,
  leather: SLOT.LEATHER,
  metal: SLOT.METAL,
  accent: SLOT.ACCENT,
};

/**
 * The ramp step of a key level: the import's level 0 is the outline, 1 the shadow, 2 the base,
 * 3 the light; the placeholder's ramps run light2, light1, base, dark, outline.
 */
const RAMP_OF_LEVEL = [4, 3, 2, 1] as const;

function hexOf(r: number, g: number, b: number): string {
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Recolour key colours in place: each pixel whose colour the slot map lists takes the look's
 * ramp for that slot (its colours for primary, secondary, skin and hair; the fixed leather,
 * metal and accent ramps of the placeholder) at its level.
 */
export function recolor(
  m: PixelMatrix,
  slots: Readonly<Record<string, { slot: string; level: number }>> | undefined,
  look: SpriteLook,
): PixelMatrix {
  if (!slots) return m;
  const palette = paletteFor(look);
  for (let i = 0; i < m.rgba.length; i += 4) {
    if ((m.rgba[i + 3] as number) === 0) continue;
    const s = slots[hexOf(m.rgba[i] as number, m.rgba[i + 1] as number, m.rgba[i + 2] as number)];
    if (!s) continue;
    const slot = SLOT_OF[s.slot];
    const ramp = slot === undefined ? undefined : palette[slot];
    if (!ramp) continue;
    const step = RAMP_OF_LEVEL[Math.max(0, Math.min(3, Math.floor(s.level)))] ?? 2;
    const c = ramp[step] ?? ramp[2];
    if (c === undefined) continue;
    m.rgba[i] = (c >> 16) & 0xff;
    m.rgba[i + 1] = (c >> 8) & 0xff;
    m.rgba[i + 2] = c & 0xff;
  }
  return m;
}

/** Draw `src` onto `dst` with src's anchor at (x, y); later layers cover earlier ones. */
function blit(
  dst: PixelMatrix,
  src: PixelMatrix,
  ax: number,
  ay: number,
  x: number,
  y: number,
): void {
  const ox = Math.round(x - ax);
  const oy = Math.round(y - ay);
  for (let row = 0; row < src.h; row++) {
    const dy = oy + row;
    if (dy < 0 || dy >= dst.h) continue;
    for (let col = 0; col < src.w; col++) {
      const dx = ox + col;
      if (dx < 0 || dx >= dst.w) continue;
      const si = (row * src.w + col) * 4;
      if ((src.rgba[si + 3] as number) === 0) continue;
      const di = (dy * dst.w + dx) * 4;
      dst.rgba[di] = src.rgba[si] as number;
      dst.rgba[di + 1] = src.rgba[si + 1] as number;
      dst.rgba[di + 2] = src.rgba[si + 2] as number;
      dst.rgba[di + 3] = src.rgba[si + 3] as number;
    }
  }
}

interface Part {
  frame: ResolvedFrame;
  pixels: PixelMatrix;
}

/**
 * The composed standee frame of a look's doll for one animation frame, or null when the look
 * has no doll or any named part is missing (not approved, not decoded, or no outfit body):
 * the caller then keeps the placeholder. `key` names the parts for the frame cache.
 */
export function composeDoll(
  r: AssetResolver,
  sheets: SheetPixels,
  look: SpriteLook,
  anim: AnimName,
  dir: Dir,
  frame: number,
): { frame: SpriteFrame; key: string } | null {
  const recipe = activeArt(look.art)?.doll;
  if (!recipe || r.size === 0) return null;
  const plan = dollPlan(r, recipe, anim, dir, frame);
  if (!plan.ready) return null;
  const parts = new Map<string, Part>();
  const backs = new Map<string, Part>();
  const decode = (f: ResolvedFrame | null | undefined): Part | null => {
    if (!f) return null;
    const sheet = sheets.get(f.assetId);
    if (!sheet) return null;
    const slots = (r.lookup(f.assetId) as { meta?: { slots?: Record<string, never> } }).meta?.slots;
    return { frame: f, pixels: recolor(framePixels(sheet, f), slots, look) };
  };
  for (const l of plan.layers) {
    const part = decode(l.frame);
    if (!part) return null;
    parts.set(l.layer, part);
    const back = decode(l.back);
    if (back) backs.set(l.layer, back);
  }
  const body = parts.get('outfit');
  if (!body) return null;
  const w = body.pixels.w;
  const h = body.pixels.h;
  const fx = body.frame.ax ?? Math.floor(w / 2);
  const fy = body.frame.ay ?? h - 1;
  const at = dollAnchors(recipe.body, anim, dir, frame);
  const out = createMatrix(w, h);
  const place = (p: Part, x: number, y: number) =>
    blit(
      out,
      p.pixels,
      p.frame.ax ?? Math.floor(p.pixels.w / 2),
      p.frame.ay ?? p.pixels.h - 1,
      x,
      y,
    );
  const neck = { x: fx + at.neck.x, y: fy + at.neck.y };
  const back = parts.get('back');
  if (back) place(back, fx, fy);
  place(body, fx, fy);
  for (const layer of DOLL_LAYERS) {
    const b = backs.get(layer);
    if (b) place(b, neck.x, neck.y);
  }
  for (const layer of ['head', 'hair', 'ears', 'headwear', 'beard'] as const) {
    const p = parts.get(layer);
    if (p) place(p, neck.x, neck.y);
  }
  const main = parts.get('mainHand');
  if (main) place(main, fx + at.mainHand.x, fy + at.mainHand.y);
  const off = parts.get('offHand');
  if (off) place(off, fx + at.offHand.x, fy + at.offHand.y);
  const fxs = frameEffects(look.archetype, anim, frame);
  const matrix = applyEffects(out, fxs);
  const bounds = opaqueBounds(matrix);
  const layers = plan.layers.map((l) => `${l.assetId}#${l.frame?.index ?? -1}`).join(',');
  const key = `doll:${layers}:${anim}:${dir}:${frame}:${fxs.alpha}:${fxs.flash}@${look.key}`;
  return {
    frame: {
      matrix,
      anchorX: fx,
      anchorY: fy,
      height: bounds ? Math.max(0, fy - bounds.y0) : 0,
      lift: bounds ? Math.max(0, fy - bounds.y1) : 0,
    },
    key,
  };
}
