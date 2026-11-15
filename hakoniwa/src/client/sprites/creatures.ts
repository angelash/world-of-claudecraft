// Non-humanoid body templates (art_pipeline.md 3.2 and 3.8): golem (HL), wolf
// (quadruped Q), bird (flyer F), slime and spirit (blobs), and world objects. Each draws
// one pose into a shape grid; shapes scale by pixel count, not by image scaling. Pure.

import type { AnimName, Dir } from './anim_spec';
import { SHADE } from './palette';
import { hash3 } from './pixels';
import {
  drawLine,
  fillEllipse,
  fillRect,
  fillTriangle,
  type ShapeGrid,
  SLOT,
  setCell,
} from './shape';

type FacingDir = Exclude<Dir, 'left'>;

const kk = (s: number) => (n: number) => Math.max(1, Math.round(n * s));

/** Walk leg phase shared by the creature templates: -1, 0 or 1. */
function legPhase(anim: AnimName, frame: number): number {
  if (anim !== 'walk') return 0;
  return [1, 1, 0, -1, -1, 0][frame % 6] as number;
}

// ---------------------------------------------------------------------------
// Golem (HL): blocky stone giant with a glowing core.

export function drawGolem(
  g: ShapeGrid,
  anim: AnimName,
  frame: number,
  dir: FacingDir,
  cx: number,
  groundY0: number,
  s: number,
): void {
  const k = kk(s);
  if (anim === 'death') {
    // Crumbling into a pile of blocks.
    const n = 3 + frame * 2;
    for (let i = 0; i < n; i++) {
      const h = hash3(i, frame, 7);
      const w = k(4 + (h % 4));
      const x = cx - k(12) + ((h >>> 4) % k(24));
      const y = groundY0 - k(3 + ((h >>> 9) % Math.max(1, 14 - frame * 3)));
      fillRect(g, x, y, w, k(3), i % 3 === 0 ? SLOT.SECONDARY : SLOT.PRIMARY);
    }
    if (frame < 2) fillRect(g, cx - 1, groundY0 - k(6), k(2), k(2), SLOT.GLOW);
    return;
  }
  const phase = legPhase(anim, frame);
  const bob = anim === 'walk' && phase === 0 ? -k(1) : anim === 'idle' && frame >= 2 ? k(1) : 0;
  const recoil = anim === 'hit' ? (frame === 0 ? k(2) : k(1)) : 0;
  const groundY = groundY0 + bob;
  const x = dir === 'right' ? cx - recoil : cx;
  const legH = k(9);
  const legW = k(6);
  const torsoW = dir === 'right' ? k(16) : k(22);
  const torsoH = k(16);
  const hipY = groundY - legH;
  const torsoTop = hipY - torsoH;
  const tx0 = x - Math.floor(torsoW / 2);

  // Legs.
  if (dir === 'right') {
    fillRect(
      g,
      x - Math.floor(legW / 2) - phase * k(2),
      hipY,
      legW,
      legH,
      SLOT.PRIMARY,
      SHADE.SHADOW,
    );
    fillRect(g, x - Math.floor(legW / 2) + phase * k(2), hipY, legW, legH, SLOT.PRIMARY);
  } else {
    const liftL = phase > 0 ? k(1) : 0;
    const liftR = phase < 0 ? k(1) : 0;
    fillRect(g, x - k(2) - legW, hipY, legW, legH - liftL, SLOT.PRIMARY);
    fillRect(g, x + k(2), hipY, legW, legH - liftR, SLOT.PRIMARY);
  }
  // Torso with moss patches and cracks.
  fillRect(g, tx0, torsoTop, torsoW, torsoH, SLOT.PRIMARY);
  for (let i = 0; i < 4; i++) {
    const h = hash3(i, 11, 3);
    fillRect(
      g,
      tx0 + (h % Math.max(1, torsoW - k(4))),
      torsoTop + ((h >>> 5) % Math.max(1, torsoH - k(3))),
      k(4),
      k(2),
      SLOT.SECONDARY,
    );
  }
  drawLine(
    g,
    tx0 + k(4),
    torsoTop + k(3),
    tx0 + k(7),
    torsoTop + k(8),
    1,
    SLOT.PRIMARY,
    SHADE.OUTLINE,
  );
  // Head sits low between the shoulders.
  const headW = k(10);
  const headTop = torsoTop - k(6);
  if (dir === 'right') {
    fillRect(g, x - Math.floor(headW / 2) + k(2), headTop, headW, k(8), SLOT.PRIMARY);
    fillRect(g, x + k(4), headTop + k(3), k(2), k(1), SLOT.GLOW);
  } else {
    fillRect(g, x - Math.floor(headW / 2), headTop, headW, k(8), SLOT.PRIMARY);
    if (dir === 'down') {
      fillRect(g, x - k(3), headTop + k(3), k(2), k(1), SLOT.GLOW);
      fillRect(g, x + k(1), headTop + k(3), k(2), k(1), SLOT.GLOW);
      fillRect(g, x - 1, torsoTop + k(6), k(2), k(2), SLOT.GLOW);
    }
  }
  // Arms: thick, hanging past the hips; attack raises and slams them.
  const armW = k(6);
  const armH = k(18);
  const raised = anim === 'attack' && frame === 0;
  const slam = anim === 'attack' && (frame === 1 || frame === 2);
  if (dir === 'right') {
    const ay = raised ? torsoTop - armH + k(6) : torsoTop + k(2);
    const ax = slam ? x + k(4) : x - Math.floor(armW / 2);
    if (slam) {
      fillRect(g, ax, torsoTop + k(6), armH, armW, SLOT.PRIMARY, SHADE.LIGHT);
      fillRect(g, ax, torsoTop + k(6) + armW, armH, 1, SLOT.PRIMARY, SHADE.OUTLINE);
    } else {
      fillRect(g, ax, ay, armW, armH, SLOT.PRIMARY, SHADE.LIGHT);
      fillRect(g, ax - 1, ay, 1, armH, SLOT.PRIMARY, SHADE.OUTLINE);
      fillRect(g, ax + armW, ay, 1, armH, SLOT.PRIMARY, SHADE.OUTLINE_DEEP);
    }
  } else {
    // A one-pixel gap lets the outline pass separate the arms from the torso.
    const ay = raised ? torsoTop - armH + k(6) : torsoTop + k(2) + (slam ? k(3) : 0);
    const swing = phase * k(1);
    for (let yy = ay; yy < ay + armH; yy++) {
      setCell(g, tx0 - 1, yy + swing, SLOT.EMPTY);
      setCell(g, tx0 + torsoW, yy - swing, SLOT.EMPTY);
    }
    fillRect(g, tx0 - armW - 1, ay + swing, armW, armH, SLOT.PRIMARY);
    fillRect(g, tx0 + torsoW + 1, ay - swing, armW, armH, SLOT.PRIMARY, SHADE.SHADOW);
  }
}

// ---------------------------------------------------------------------------
// Wolf (Q): four-legged beast, side view for left and right, front and back views.

export function drawWolf(
  g: ShapeGrid,
  anim: AnimName,
  frame: number,
  dir: FacingDir,
  cx: number,
  groundY: number,
  s: number,
): void {
  const k = kk(s);
  if (anim === 'death') {
    const flat = Math.min(3, frame + 1);
    const cy = groundY - k(5) + flat;
    fillEllipse(g, cx, cy, k(12), k(5) - flat / 2, SLOT.PRIMARY);
    fillEllipse(g, cx, cy + k(1), k(10), k(2), SLOT.SECONDARY);
    fillEllipse(g, cx + k(11), cy - k(1), k(4), k(3), SLOT.PRIMARY);
    for (let i = 0; i < 4; i++) {
      drawLine(
        g,
        cx - k(7) + i * k(5),
        cy + k(2),
        cx - k(8) + i * k(5) + k(3),
        groundY - 1,
        k(2),
        SLOT.PRIMARY,
        SHADE.SHADOW,
      );
    }
    fillRect(g, cx + k(11), cy - k(2), k(2), 1, SLOT.EYE);
    return;
  }
  const phase = legPhase(anim, frame);
  const recoil = anim === 'hit' ? (frame === 0 ? k(2) : k(1)) : 0;
  const lunge = anim === 'attack' ? ([0, k(3), k(2), 0][frame] as number) : 0;
  const breathe = anim === 'idle' && frame >= 2 ? 1 : 0;
  const legH = k(6);
  const bodyRy = k(4.5);
  const bodyCY = groundY - legH - bodyRy + 1 + breathe;
  if (dir === 'right') {
    const x = cx - recoil + lunge;
    const rx = k(11);
    // Tail behind, far legs, body, near legs, head.
    drawLine(
      g,
      x - rx,
      bodyCY - 1,
      x - rx - k(5),
      bodyCY - k(4) + (phase !== 0 ? 1 : 0),
      k(2),
      SLOT.PRIMARY,
    );
    setCell(g, x - rx - k(5), bodyCY - k(4), SLOT.SECONDARY);
    const legs = [x + rx - k(4), x - rx + k(3)];
    for (const [i, lx] of legs.entries()) {
      const off = (i === 0 ? phase : -phase) * k(2);
      fillRect(
        g,
        lx - off,
        bodyCY + k(2),
        k(2),
        groundY - bodyCY - k(2),
        SLOT.PRIMARY,
        SHADE.SHADOW,
      );
    }
    fillEllipse(g, x, bodyCY, rx, bodyRy, SLOT.PRIMARY);
    fillEllipse(g, x + 1, bodyCY + bodyRy * 0.55, rx * 0.8, bodyRy * 0.45, SLOT.SECONDARY);
    for (const [i, lx] of legs.entries()) {
      const off = (i === 0 ? phase : -phase) * k(2);
      fillRect(g, lx + off + 1, bodyCY + k(2), k(2), groundY - bodyCY - k(2), SLOT.PRIMARY);
    }
    const hx = x + rx + k(1);
    const hy = bodyCY - k(3);
    fillEllipse(g, hx, hy, k(4), k(3.5), SLOT.PRIMARY);
    const open = anim === 'attack' && frame === 1;
    fillRect(g, hx + k(2), hy, k(4), k(2), SLOT.SECONDARY);
    if (open) fillRect(g, hx + k(2), hy + k(2), k(4), k(1), SLOT.SECONDARY, SHADE.SHADOW);
    setCell(g, hx + k(6), hy, SLOT.EYE);
    fillTriangle(g, hx - k(2), hy - k(2), hx + k(1), hy - k(2), hx - k(1), hy - k(6), SLOT.PRIMARY);
    fillRect(g, hx + k(1), hy - k(1), k(1), k(1), SLOT.EYE);
    return;
  }
  const front = dir === 'down';
  const y = front ? -lunge : lunge;
  // Body behind (front view) or in front (back view).
  const by = bodyCY + y;
  fillEllipse(g, cx, by, k(7), bodyRy + 1, SLOT.PRIMARY);
  const liftL = phase > 0 ? k(1) : 0;
  const liftR = phase < 0 ? k(1) : 0;
  fillRect(g, cx - k(5), by + k(2), k(2), groundY - by - k(2) - liftL, SLOT.PRIMARY);
  fillRect(g, cx + k(3), by + k(2), k(2), groundY - by - k(2) - liftR, SLOT.PRIMARY);
  const hy = by - k(4);
  if (front) {
    fillEllipse(g, cx, hy, k(5), k(4.5), SLOT.PRIMARY);
    fillTriangle(g, cx - k(5), hy - k(2), cx - k(2), hy - k(3), cx - k(4), hy - k(8), SLOT.PRIMARY);
    fillTriangle(g, cx + k(5), hy - k(2), cx + k(2), hy - k(3), cx + k(4), hy - k(8), SLOT.PRIMARY);
    fillEllipse(g, cx, hy + k(2.5), k(2.5), k(2), SLOT.SECONDARY);
    fillRect(g, cx - 1, hy + k(1.5), k(2), k(1), SLOT.EYE);
    fillRect(g, cx - k(3), hy - k(1), k(1), k(1), SLOT.EYE);
    fillRect(g, cx + k(2), hy - k(1), k(1), k(1), SLOT.EYE);
  } else {
    fillTriangle(g, cx - k(5), hy - k(2), cx - k(2), hy - k(3), cx - k(4), hy - k(8), SLOT.PRIMARY);
    fillTriangle(g, cx + k(5), hy - k(2), cx + k(2), hy - k(3), cx + k(4), hy - k(8), SLOT.PRIMARY);
    fillEllipse(g, cx, hy, k(4.5), k(4), SLOT.PRIMARY);
    drawLine(g, cx, by, cx + (phase !== 0 ? 1 : 0), by - k(6), k(2), SLOT.PRIMARY);
    setCell(g, cx, by - k(6), SLOT.SECONDARY);
  }
}

// ---------------------------------------------------------------------------
// Bird (F): small flyer; the renderer lifts it above its ground shadow.

/** Hover height in pixels for flyers and floaters (drawn above the anchor). */
export function liftFor(archetype: string, anim: AnimName, frame: number, s: number): number {
  if (anim === 'death') return 0;
  if (archetype === 'bird') return Math.round((8 + (frame % 2)) * s);
  if (archetype === 'spirit') return Math.round((5 + ([0, 1, 2, 1][frame % 4] as number)) * s);
  return 0;
}

export function drawBird(
  g: ShapeGrid,
  anim: AnimName,
  frame: number,
  dir: FacingDir,
  cx: number,
  groundY: number,
  s: number,
): void {
  const k = kk(s);
  if (anim === 'death') {
    const cy = groundY - k(3);
    fillEllipse(g, cx, cy, k(5), k(2.5), SLOT.PRIMARY);
    fillTriangle(g, cx - k(2), cy, cx + k(2), cy, cx - k(9), cy + k(2), SLOT.SECONDARY);
    fillTriangle(g, cx - k(2), cy, cx + k(2), cy, cx + k(9), cy + k(2), SLOT.SECONDARY);
    fillRect(g, cx + k(5), cy - 1, k(2), k(1), SLOT.ACCENT);
    return;
  }
  const up = anim === 'walk' ? frame % 2 === 0 : anim === 'attack' ? frame === 0 : frame % 4 < 2;
  const recoil = anim === 'hit' ? k(2) : 0;
  const dive = anim === 'attack' && frame === 1 ? k(2) : 0;
  const cy = groundY - k(5) + dive;
  if (dir === 'right') {
    const x = cx - recoil + dive;
    fillTriangle(g, x - k(4), cy, x - k(4), cy + k(2), x - k(8), cy + k(1), SLOT.SECONDARY);
    fillEllipse(g, x, cy, k(5), k(3.5), SLOT.PRIMARY);
    fillEllipse(g, x + k(4), cy - k(2), k(2.8), k(2.8), SLOT.PRIMARY);
    fillTriangle(g, x + k(6), cy - k(3), x + k(6), cy - k(1), x + k(9), cy - k(2), SLOT.ACCENT);
    setCell(g, x + k(5), cy - k(3), SLOT.EYE);
    if (up)
      fillTriangle(
        g,
        x - k(3),
        cy - k(1),
        x + k(2),
        cy - k(1),
        x - k(3),
        cy - k(8),
        SLOT.SECONDARY,
      );
    else
      fillTriangle(
        g,
        x - k(3),
        cy + k(1),
        x + k(2),
        cy + k(1),
        x - k(2),
        cy + k(6),
        SLOT.SECONDARY,
      );
    return;
  }
  const x = cx;
  const wy = up ? -k(6) : k(4);
  fillTriangle(g, x - k(2), cy - k(1), x - k(2), cy + k(1), x - k(11), cy + wy, SLOT.SECONDARY);
  fillTriangle(g, x + k(2), cy - k(1), x + k(2), cy + k(1), x + k(11), cy + wy, SLOT.SECONDARY);
  fillEllipse(g, x, cy, k(3.5), k(4), SLOT.PRIMARY);
  fillEllipse(g, x, cy - k(4), k(2.8), k(2.6), SLOT.PRIMARY);
  if (dir === 'down') {
    fillTriangle(g, x - 1, cy - k(3), x + 1, cy - k(3), x, cy - k(1), SLOT.ACCENT);
    setCell(g, x - k(2), cy - k(5), SLOT.EYE);
    setCell(g, x + k(1), cy - k(5), SLOT.EYE);
  }
}

// ---------------------------------------------------------------------------
// Slime and spirit (blobs).

export function drawSlime(
  g: ShapeGrid,
  anim: AnimName,
  frame: number,
  dir: FacingDir,
  cx: number,
  groundY: number,
  s: number,
): void {
  const k = kk(s);
  let rx = 7;
  let ry = 5;
  if (anim === 'idle') ry = [5, 4.6, 5, 5.4][frame % 4] as number;
  else if (anim === 'walk') ry = [5.6, 5, 4.4, 5.6, 5, 4.4][frame % 6] as number;
  else if (anim === 'attack') ry = [6.2, 4, 4.6, 5][frame % 4] as number;
  else if (anim === 'hit') ry = frame === 0 ? 4 : 4.6;
  else if (anim === 'death') ry = [4, 3, 2, 1.4][Math.min(3, frame)] as number;
  rx = (7 * 5) / Math.max(3.5, ry) + (anim === 'death' ? frame : 0);
  const RX = rx * s;
  const RY = ry * s;
  const cy = groundY - RY;
  const x = anim === 'attack' && frame === 1 && dir === 'right' ? cx + k(2) : cx;
  fillEllipse(g, x, cy, RX, RY, SLOT.PRIMARY);
  fillEllipse(g, x, cy + RY * 0.55, RX * 0.85, RY * 0.4, SLOT.SECONDARY);
  if (anim !== 'death' || frame < 2) {
    fillRect(g, x - RX * 0.55, cy - RY * 0.55, k(2), k(1.5), SLOT.WHITE, SHADE.HIGHLIGHT);
  }
  if (dir !== 'up' && anim !== 'death') {
    const ey = Math.round(cy - RY * 0.1);
    if (dir === 'down') {
      fillRect(g, x - k(3), ey, k(1), k(2), SLOT.EYE);
      fillRect(g, x + k(2), ey, k(1), k(2), SLOT.EYE);
    } else {
      fillRect(g, x + k(3), ey, k(1), k(2), SLOT.EYE);
    }
  }
}

export function drawSpirit(
  g: ShapeGrid,
  anim: AnimName,
  frame: number,
  dir: FacingDir,
  cx: number,
  groundY: number,
  s: number,
): void {
  const k = kk(s);
  const shrink = anim === 'death' ? frame : 0;
  const cy = groundY - k(13) + shrink * k(2);
  const r = Math.max(2, 6 - shrink) * s;
  const sway = anim === 'walk' ? ([0, 1, 1, 0, -1, -1][frame % 6] as number) : 0;
  const x = cx - (anim === 'hit' ? k(2) : 0) + (anim === 'attack' && frame === 1 ? k(2) : 0);
  // Tapering tail.
  fillTriangle(
    g,
    x - r * 0.8,
    cy + r * 0.3,
    x + r * 0.8,
    cy + r * 0.3,
    x - sway * k(2),
    cy + r + k(7) - shrink * k(2),
    SLOT.PRIMARY,
  );
  fillEllipse(g, x, cy, r, r * 1.05, SLOT.PRIMARY);
  fillEllipse(g, x - r * 0.15, cy - r * 0.1, r * 0.55, r * 0.55, SLOT.SECONDARY);
  fillEllipse(
    g,
    x - r * 0.2,
    cy - r * 0.15,
    Math.max(1, r * 0.25),
    Math.max(1, r * 0.25),
    SLOT.GLOW,
  );
  if (dir !== 'up' && anim !== 'death') {
    if (dir === 'down') {
      fillRect(g, x - k(3), cy, k(1), k(2), SLOT.EYE);
      fillRect(g, x + k(2), cy, k(1), k(2), SLOT.EYE);
    } else fillRect(g, x + k(3), cy, k(1), k(2), SLOT.EYE);
  }
}

// ---------------------------------------------------------------------------
// Objects: signpost (when a glyph is set), crate, barrel or standing stone.

export function objectVariant(
  key: string,
  hasGlyph: boolean,
): 'sign' | 'crate' | 'barrel' | 'stone' {
  if (hasGlyph) return 'sign';
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return (['crate', 'barrel', 'stone'] as const)[h % 3] as 'crate' | 'barrel' | 'stone';
}

export function drawObject(
  g: ShapeGrid,
  variant: 'sign' | 'crate' | 'barrel' | 'stone',
  cx: number,
  groundY: number,
  s: number,
): void {
  const k = kk(s);
  switch (variant) {
    case 'sign':
      fillRect(g, cx - 1, groundY - k(14), k(2), k(14), SLOT.LEATHER);
      fillRect(g, cx - k(7), groundY - k(18), k(14), k(8), SLOT.PRIMARY);
      fillRect(g, cx - k(7), groundY - k(11), k(14), k(1), SLOT.SECONDARY);
      break;
    case 'crate':
      fillRect(g, cx - k(7), groundY - k(11), k(14), k(11), SLOT.PRIMARY);
      fillRect(g, cx - k(7), groundY - k(11), k(14), k(3), SLOT.PRIMARY, SHADE.LIGHT);
      drawLine(g, cx - k(6), groundY - k(8), cx + k(6), groundY - 1, 1, SLOT.SECONDARY);
      fillRect(g, cx - k(7), groundY - k(8), k(14), k(1), SLOT.SECONDARY);
      break;
    case 'barrel':
      fillEllipse(g, cx, groundY - k(6), k(6), k(6.5), SLOT.PRIMARY);
      fillRect(g, cx - k(6), groundY - k(10), k(12), k(1), SLOT.METAL, SHADE.SHADOW);
      fillRect(g, cx - k(6), groundY - k(4), k(12), k(1), SLOT.METAL, SHADE.SHADOW);
      fillEllipse(g, cx, groundY - k(12), k(4.5), k(1.5), SLOT.PRIMARY, SHADE.LIGHT);
      break;
    default:
      fillRect(g, cx - k(4), groundY - k(16), k(8), k(16), SLOT.SECONDARY);
      fillTriangle(
        g,
        cx - k(4),
        groundY - k(16),
        cx + k(4),
        groundY - k(16),
        cx,
        groundY - k(20),
        SLOT.SECONDARY,
      );
      fillRect(g, cx - 1, groundY - k(12), k(2), k(2), SLOT.GLOW);
  }
}
