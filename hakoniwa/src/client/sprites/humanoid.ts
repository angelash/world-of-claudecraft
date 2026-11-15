// Humanoid paper doll (H and HS templates of art_pipeline.md 3.2): human, elf,
// dwarf, halfling, beastkin, demon, undead and goddess. Draws one pose into a shape
// grid from parametric parts (legs, torso, arms, head, hair, racial features), so a
// larger `scale` means more pixels, never image scaling. Pure.

import type { AnimName, Dir } from './anim_spec';
import type { Archetype } from './look';
import { SHADE } from './palette';
import {
  drawLine,
  fillEllipse,
  fillRect,
  fillTriangle,
  type ShapeGrid,
  SLOT,
  setCell,
  strokeEllipse,
} from './shape';

export interface HumanoidBuild {
  bodyH: number;
  headR: number;
  torsoW: number;
  torsoH: number;
  legW: number;
  armW: number;
  hair: 'short' | 'long' | 'curly' | 'flowing';
  ears: 'round' | 'pointed' | 'animal';
  tail: boolean;
  horns: boolean;
  wings: boolean;
  beard: boolean;
  dress: boolean;
  ragged: boolean;
  barefoot: boolean;
  halo: boolean;
  glowEyes: boolean;
}

export function humanoidBuild(a: Archetype, s: number): HumanoidBuild {
  const base: HumanoidBuild = {
    // Q-version proportions, about 1.75 heads (art_pipeline.md 1.6).
    bodyH: 28,
    headR: 7.8,
    torsoW: 10,
    torsoH: 7,
    legW: 3,
    armW: 2,
    hair: 'short',
    ears: 'round',
    tail: false,
    horns: false,
    wings: false,
    beard: false,
    dress: false,
    ragged: false,
    barefoot: false,
    halo: false,
    glowEyes: false,
  };
  let b: HumanoidBuild;
  switch (a) {
    case 'elf':
      b = { ...base, bodyH: 29, torsoW: 9, hair: 'long', ears: 'pointed' };
      break;
    case 'dwarf':
      b = { ...base, bodyH: 22, headR: 6.6, torsoW: 12, torsoH: 6, legW: 4, armW: 3, beard: true };
      break;
    case 'halfling':
      b = { ...base, bodyH: 20, headR: 6.4, torsoW: 9, torsoH: 5, hair: 'curly', barefoot: true };
      break;
    case 'beastkin':
      b = { ...base, ears: 'animal', tail: true };
      break;
    case 'demon':
      b = { ...base, bodyH: 29, horns: true, wings: true, glowEyes: true };
      break;
    case 'undead':
      b = { ...base, bodyH: 27, torsoW: 9, ragged: true, glowEyes: true };
      break;
    case 'goddess':
      b = { ...base, bodyH: 30, torsoW: 9, hair: 'flowing', dress: true, halo: true };
      break;
    default:
      b = base;
  }
  const k = (n: number) => Math.max(1, Math.round(n * s));
  return {
    ...b,
    bodyH: k(b.bodyH),
    headR: b.headR * s,
    torsoW: Math.max(4, 2 * Math.round((b.torsoW * s) / 2)),
    torsoH: k(b.torsoH),
    legW: k(b.legW),
    armW: k(b.armW),
  };
}

export interface HumanoidPose {
  bob: number;
  headBob: number;
  /** front view: pixels lifted from the left and right leg */
  liftL: number;
  liftR: number;
  /** side view: leg spread (front leg forward by stride) */
  stride: number;
  /** arm swing in pixels (sign alternates with the legs) */
  swing: number;
  /** 0 none, 1 wind-up, 2 strike, 3 follow-through */
  attack: 0 | 1 | 2 | 3;
  recoil: number;
  /** 0 standing, 1 kneel, 2 falling, 3 lying */
  fall: 0 | 1 | 2 | 3;
}

export function humanoidPose(anim: AnimName, frame: number, s: number): HumanoidPose {
  const p: HumanoidPose = {
    bob: 0,
    headBob: 0,
    liftL: 0,
    liftR: 0,
    stride: 0,
    swing: 0,
    attack: 0,
    recoil: 0,
    fall: 0,
  };
  const k = (n: number) => Math.round(n * s);
  switch (anim) {
    case 'idle':
      p.headBob = [0, 0, k(1), k(1)][frame % 4] as number;
      break;
    case 'walk': {
      const f = frame % 6;
      p.stride = k([2, 1, 0, -2, -1, 0][f] as number);
      p.swing = -Math.sign(p.stride) * Math.max(1, k(1));
      if (p.stride === 0) p.swing = 0;
      p.bob = [0, 0, -k(1), 0, 0, -k(1)][f] as number;
      p.liftL = f === 1 || f === 2 ? k(1) : 0;
      p.liftR = f === 4 || f === 5 ? k(1) : 0;
      break;
    }
    case 'attack':
      p.attack = ([1, 2, 3, 0] as const)[frame % 4] as 0 | 1 | 2 | 3;
      if (p.attack === 2) p.bob = k(1);
      break;
    case 'hit':
      p.recoil = frame === 0 ? k(2) : k(1);
      p.headBob = frame === 0 ? -k(1) : 0;
      break;
    case 'death':
      p.fall = ([1, 2, 3, 3] as const)[Math.min(3, frame)] as 0 | 1 | 2 | 3;
      break;
  }
  return p;
}

/** Draw a humanoid with feet on row `groundY` (exclusive) centred on column boundary `cx`. */
export function drawHumanoid(
  g: ShapeGrid,
  b: HumanoidBuild,
  pose: HumanoidPose,
  dir: Exclude<Dir, 'left'>,
  cx0: number,
  groundY0: number,
  s: number,
): void {
  if (pose.fall >= 2) {
    drawLying(g, b, pose.fall === 2, cx0, groundY0, s);
    return;
  }
  const k = (n: number) => Math.max(1, Math.round(n * s));
  let cx = cx0;
  let groundY = groundY0 + pose.bob;
  if (dir === 'right') cx -= pose.recoil;
  else groundY -= Math.round(pose.recoil / 2);

  const headD = Math.round(b.headR * 2);
  let legH = Math.max(k(2), b.bodyH - headD - b.torsoH);
  if (pose.fall === 1) {
    groundY += 0;
    legH = Math.max(1, legH - k(3));
  }
  const hipY = groundY - legH;
  const torsoTop = hipY - b.torsoH;
  const hr = b.headR;
  const headCY = torsoTop - hr + k(1) + pose.headBob;

  if (dir === 'down') drawFront(g, b, pose, cx, groundY, hipY, torsoTop, headCY, s, false);
  else if (dir === 'up') drawFront(g, b, pose, cx, groundY, hipY, torsoTop, headCY, s, true);
  else drawSide(g, b, pose, cx, groundY, hipY, torsoTop, headCY, s);
}

function drawFront(
  g: ShapeGrid,
  b: HumanoidBuild,
  pose: HumanoidPose,
  cx: number,
  groundY: number,
  hipY: number,
  torsoTop: number,
  headCY: number,
  s: number,
  back: boolean,
): void {
  const k = (n: number) => Math.max(1, Math.round(n * s));
  const tw = b.torsoW;
  const tx0 = cx - tw / 2;
  const hr = b.headR;

  // Behind the body (front view): wings, long hair, tail.
  if (!back) {
    if (b.wings) drawWingsFront(g, cx, tw, torsoTop, b.torsoH, s);
    if (b.hair === 'long' || b.hair === 'flowing') {
      const len = b.hair === 'flowing' ? b.torsoH + k(4) : Math.round(b.torsoH * 0.8);
      fillRect(g, cx - hr - 0.5, headCY, hr * 2 + 1, len, SLOT.HAIR);
    }
    if (b.tail)
      drawLine(g, cx + tw / 2 - 1, hipY - 1, cx + tw / 2 + k(4), hipY - k(5), k(2), SLOT.HAIR);
  }

  // Legs (or the gown).
  const footH = k(1.5);
  const lw = b.legW;
  const footSlot = b.barefoot ? SLOT.SKIN : SLOT.LEATHER;
  if (b.dress) {
    const top = torsoTop + Math.round(b.torsoH * 0.6);
    const sway = pose.stride > 0 ? 1 : pose.stride < 0 ? -1 : 0;
    for (let y = top; y < groundY; y++) {
      const t = (y - top) / Math.max(1, groundY - top);
      const half = tw / 2 + Math.round(t * k(2.5));
      const shift = y > groundY - k(3) ? sway : 0;
      fillRect(g, cx - half + shift, y, half * 2, 1, SLOT.PRIMARY);
    }
    fillRect(g, cx - tw / 2 - k(2.5) + sway, groundY - k(1), tw + k(5), k(1), SLOT.SECONDARY);
  } else {
    const legL = cx - 1 - lw;
    const legR = cx + 1;
    fillRect(g, legL, hipY, lw, groundY - hipY - pose.liftL, SLOT.SECONDARY);
    fillRect(g, legR, hipY, lw, groundY - hipY - pose.liftR, SLOT.SECONDARY);
    fillRect(g, legL, groundY - footH - pose.liftL, lw, footH, footSlot);
    fillRect(g, legR, groundY - footH - pose.liftR, lw, footH, footSlot);
  }

  // Torso with rounded shoulders, belt and collar.
  fillRect(g, tx0, torsoTop, tw, b.torsoH, SLOT.PRIMARY);
  setCell(g, tx0, torsoTop, SLOT.EMPTY);
  setCell(g, tx0 + tw - 1, torsoTop, SLOT.EMPTY);
  if (!b.dress) fillRect(g, tx0, hipY - k(1), tw, k(1), SLOT.LEATHER);
  else fillRect(g, tx0 + 1, hipY - k(1), tw - 2, k(1), SLOT.SECONDARY);
  if (!back) fillRect(g, cx - 1, torsoTop, 2, k(1), SLOT.SKIN);
  if (b.ragged) {
    for (let x = Math.floor(tx0); x < tx0 + tw; x += 3) setCell(g, x, hipY, SLOT.PRIMARY);
  }

  // Arms (sleeves plus hands). The right arm carries the weapon.
  const aw = b.armW;
  const armH = b.torsoH + k(1);
  const handH = k(1.5);
  const leftX = tx0 - aw;
  const rightX = tx0 + tw;
  const swingL = pose.swing;
  const swingR = -pose.swing;
  fillRect(g, leftX, torsoTop + 1 + swingL, aw, armH - handH, SLOT.PRIMARY);
  fillRect(g, leftX, torsoTop + 1 + swingL + armH - handH, aw, handH, SLOT.SKIN);
  if (pose.attack === 0) {
    fillRect(g, rightX, torsoTop + 1 + swingR, aw, armH - handH, SLOT.PRIMARY, SHADE.SHADOW);
    fillRect(g, rightX, torsoTop + 1 + swingR + armH - handH, aw, handH, SLOT.SKIN);
  } else {
    drawFrontAttackArm(g, pose.attack, rightX, aw, torsoTop, armH, handH, back, s);
  }

  // Head.
  if (back) {
    fillEllipse(g, cx, headCY, hr + 0.6, hr + 0.4, SLOT.HAIR);
    if (b.hair === 'long' || b.hair === 'flowing') {
      const len = b.hair === 'flowing' ? b.torsoH + k(4) : Math.round(b.torsoH * 0.8);
      fillRect(g, cx - hr - 0.5, headCY, hr * 2 + 1, len, SLOT.HAIR);
    }
    if (b.hair === 'curly') drawCurls(g, cx, headCY, hr, s);
  } else {
    fillEllipse(g, cx, headCY, hr + 0.6, hr + 0.4, SLOT.HAIR);
    if (b.hair === 'curly') drawCurls(g, cx, headCY, hr, s);
    fillEllipse(g, cx, headCY + hr * 0.3, hr - 0.7, hr * 0.78, SLOT.SKIN);
    // Fringe: a broken row of hair along the top of the face.
    const fringeY = Math.round(headCY + hr * 0.3 - hr * 0.78);
    for (let x = Math.floor(cx - hr + 1); x < cx + hr - 1; x++) {
      if ((x - Math.floor(cx)) % 3 !== 0) setCell(g, x, fringeY, SLOT.HAIR);
    }
    if (b.beard) {
      fillEllipse(g, cx, headCY + hr * 0.95, hr - 0.6, hr * 0.45, SLOT.HAIR);
    }
    // Eyes: vertical blocks of 3 pixels (art_pipeline.md 1.6).
    const ew = Math.max(1, Math.round(s));
    const eh = Math.max(2, Math.round(3 * s));
    const ey = Math.round(headCY + hr * 0.15);
    const ex = Math.round(hr * 0.42);
    const eyeSlot = b.glowEyes ? SLOT.GLOW : SLOT.EYE;
    fillRect(g, cx - ex - ew, ey, ew, eh, eyeSlot);
    fillRect(g, cx + ex, ey, ew, eh, eyeSlot);
  }

  // Ears and horns.
  if (b.ears === 'pointed') {
    fillTriangle(
      g,
      cx - hr - 0.2,
      headCY - 0.5,
      cx - hr - 0.2,
      headCY + 1.5,
      cx - hr - k(3),
      headCY - k(2.5),
      SLOT.SKIN,
    );
    fillTriangle(
      g,
      cx + hr + 0.2,
      headCY - 0.5,
      cx + hr + 0.2,
      headCY + 1.5,
      cx + hr + k(3),
      headCY - k(2.5),
      SLOT.SKIN,
    );
  } else if (b.ears === 'animal') {
    const top = headCY - hr + 0.5;
    fillTriangle(
      g,
      cx - hr + 0.5,
      top + 1,
      cx - hr * 0.15,
      top,
      cx - hr * 0.7,
      top - k(4),
      SLOT.HAIR,
    );
    fillTriangle(
      g,
      cx + hr - 0.5,
      top + 1,
      cx + hr * 0.15,
      top,
      cx + hr * 0.7,
      top - k(4),
      SLOT.HAIR,
    );
    if (!back) {
      setCell(g, Math.floor(cx - hr * 0.6), Math.floor(top - k(1)), SLOT.SKIN, SHADE.SHADOW);
      setCell(g, Math.floor(cx + hr * 0.6), Math.floor(top - k(1)), SLOT.SKIN, SHADE.SHADOW);
    }
  }
  if (b.horns) {
    const top = headCY - hr + 1;
    drawLine(g, cx - hr * 0.5, top, cx - hr * 0.95, top - k(3.5), k(2), SLOT.BONE);
    drawLine(g, cx + hr * 0.5 - 1, top, cx + hr * 0.95 - 1, top - k(3.5), k(2), SLOT.BONE);
  }

  // In front of the body when seen from behind: tail and wings.
  if (back) {
    if (b.tail) drawLine(g, cx, hipY - 1, cx + k(2), groundY - k(2), k(2), SLOT.HAIR);
    if (b.wings) drawWingsFront(g, cx, tw, torsoTop, b.torsoH, s);
  }
  if (b.halo) strokeEllipse(g, cx, headCY - hr - k(3), hr + 1, k(1.6), 1, SLOT.GLOW);
}

function drawFrontAttackArm(
  g: ShapeGrid,
  phase: 1 | 2 | 3,
  x: number,
  aw: number,
  torsoTop: number,
  armH: number,
  handH: number,
  back: boolean,
  s: number,
): void {
  const k = (n: number) => Math.max(1, Math.round(n * s));
  const blade = k(7);
  const bw = Math.max(1, Math.round(s));
  if (phase === 1) {
    // Wind-up: arm raised, blade pointing up.
    const y0 = torsoTop - armH + k(3);
    fillRect(g, x, y0, aw, armH - handH, SLOT.PRIMARY);
    fillRect(g, x, y0 - handH, aw, handH, SLOT.SKIN);
    fillRect(g, x + Math.floor(aw / 2), y0 - handH - blade, bw, blade, SLOT.METAL, SHADE.LIGHT);
  } else if (phase === 2) {
    // Strike: arm thrust down toward the viewer (or away when seen from behind).
    const len = armH + k(2);
    fillRect(g, x, torsoTop + 1, aw, len - handH, SLOT.PRIMARY);
    fillRect(g, x, torsoTop + 1 + len - handH, aw, handH, SLOT.SKIN);
    if (!back)
      fillRect(g, x + Math.floor(aw / 2), torsoTop + 1 + len, bw, blade, SLOT.METAL, SHADE.LIGHT);
  } else {
    // Follow-through: blade swept across the body.
    fillRect(g, x, torsoTop + 1, aw, armH - handH, SLOT.PRIMARY);
    fillRect(g, x, torsoTop + 1 + armH - handH, aw, handH, SLOT.SKIN);
    const hx = x;
    const hy = torsoTop + 1 + armH;
    drawLine(g, hx, hy, hx - blade, hy + Math.round(blade / 2), bw, SLOT.METAL, SHADE.LIGHT);
  }
}

function drawSide(
  g: ShapeGrid,
  b: HumanoidBuild,
  pose: HumanoidPose,
  cx: number,
  groundY: number,
  hipY: number,
  torsoTop: number,
  headCY: number,
  s: number,
): void {
  const k = (n: number) => Math.max(1, Math.round(n * s));
  const tws = Math.max(4, Math.round(b.torsoW * 0.7));
  const tx0 = cx - Math.floor(tws / 2);
  const hr = b.headR;
  const lw = b.legW;
  const footH = k(1.5);
  const footSlot = b.barefoot ? SLOT.SKIN : SLOT.LEATHER;

  // Behind: tail, wing, far arm, long hair.
  if (b.tail) drawLine(g, tx0, hipY - 1, tx0 - k(5), hipY - k(5), k(2), SLOT.HAIR);
  if (b.wings) {
    fillTriangle(
      g,
      tx0 + 1,
      torsoTop + 1,
      tx0 + 1,
      torsoTop + b.torsoH - 2,
      tx0 - k(7),
      torsoTop - k(4),
      SLOT.SECONDARY,
    );
  }
  if (b.hair === 'long' || b.hair === 'flowing') {
    const len = b.hair === 'flowing' ? b.torsoH + k(4) : Math.round(b.torsoH * 0.8);
    fillRect(g, cx - hr, headCY, Math.round(hr), len, SLOT.HAIR);
  }
  const aw = b.armW;
  const armH = b.torsoH + k(1);
  const handH = k(1.5);
  const armX = cx - Math.floor(aw / 2);
  fillRect(g, armX - pose.swing, torsoTop + 1, aw, armH, SLOT.PRIMARY, SHADE.SHADOW);

  // Legs: far leg shaded, near leg in front; feet point forward (right).
  const legX = cx - Math.floor(lw / 2);
  if (b.dress) {
    const top = torsoTop + Math.round(b.torsoH * 0.6);
    for (let y = top; y < groundY; y++) {
      const t = (y - top) / Math.max(1, groundY - top);
      const back = Math.round(t * k(2));
      const front = Math.round(t * k(3)) + (y > groundY - k(3) ? Math.sign(pose.stride) : 0);
      fillRect(g, tx0 - back, y, tws + back + front, 1, SLOT.PRIMARY);
    }
    fillRect(g, tx0 - k(2), groundY - k(1), tws + k(5), k(1), SLOT.SECONDARY);
  } else {
    const far = legX - pose.stride;
    const near = legX + pose.stride;
    fillRect(g, far, hipY, lw, groundY - hipY, SLOT.SECONDARY, SHADE.SHADOW);
    fillRect(g, far, groundY - footH, lw + 1, footH, footSlot, SHADE.SHADOW);
    fillRect(g, near, hipY, lw, groundY - hipY, SLOT.SECONDARY);
    fillRect(g, near, groundY - footH, lw + 1, footH, footSlot);
  }

  // Torso.
  fillRect(g, tx0, torsoTop, tws, b.torsoH, SLOT.PRIMARY);
  setCell(g, tx0, torsoTop, SLOT.EMPTY);
  if (!b.dress) fillRect(g, tx0, hipY - k(1), tws, k(1), SLOT.LEATHER);
  if (b.ragged) {
    for (let x = tx0; x < tx0 + tws; x += 3) setCell(g, x, hipY, SLOT.PRIMARY);
  }

  // Head: hair volume set back, face forward, one eye.
  fillEllipse(g, cx, headCY, hr + 0.6, hr + 0.4, SLOT.HAIR);
  if (b.hair === 'curly') drawCurls(g, cx - 1, headCY, hr, s);
  fillEllipse(g, cx + hr * 0.35, headCY + hr * 0.28, hr * 0.78, hr * 0.78, SLOT.SKIN);
  const fringeY = Math.round(headCY + hr * 0.28 - hr * 0.78);
  for (let x = Math.floor(cx); x < cx + hr; x++) {
    if ((x - Math.floor(cx)) % 3 !== 1) setCell(g, x, fringeY, SLOT.HAIR);
  }
  if (b.beard) fillEllipse(g, cx + hr * 0.45, headCY + hr * 0.85, hr * 0.6, hr * 0.45, SLOT.HAIR);
  const ew = Math.max(1, Math.round(s));
  const eh = Math.max(2, Math.round(2 * s));
  fillRect(
    g,
    cx + Math.round(hr * 0.5),
    Math.round(headCY + hr * 0.15),
    ew,
    eh,
    b.glowEyes ? SLOT.GLOW : SLOT.EYE,
  );

  if (b.ears === 'pointed') {
    fillTriangle(
      g,
      cx - 1,
      headCY - 0.5,
      cx - 1,
      headCY + 1.5,
      cx - k(4),
      headCY - k(3),
      SLOT.SKIN,
    );
  } else if (b.ears === 'animal') {
    const top = headCY - hr + 0.5;
    fillTriangle(
      g,
      cx - hr * 0.7,
      top + 1,
      cx - hr * 0.05,
      top,
      cx - hr * 0.55,
      top - k(4),
      SLOT.HAIR,
    );
    fillTriangle(
      g,
      cx + hr * 0.05,
      top + 1,
      cx + hr * 0.6,
      top + 0.5,
      cx + hr * 0.3,
      top - k(3.5),
      SLOT.HAIR,
      SHADE.SHADOW,
    );
  }
  if (b.horns) {
    const top = headCY - hr + 1;
    drawLine(g, cx, top, cx - k(3), top - k(3), k(2), SLOT.BONE);
  }

  // Near arm with the weapon.
  if (pose.attack === 0) {
    fillRect(g, armX + pose.swing, torsoTop + 1, aw, armH - handH, SLOT.PRIMARY);
    fillRect(g, armX + pose.swing, torsoTop + 1 + armH - handH, aw, handH, SLOT.SKIN);
  } else {
    const blade = k(7);
    const bw = Math.max(1, Math.round(s));
    const sy = torsoTop + k(2);
    if (pose.attack === 1) {
      const hx = cx - k(3);
      const hy = torsoTop - k(3);
      drawLine(g, armX, sy, hx, hy, aw, SLOT.PRIMARY);
      fillRect(g, hx - 1, hy - handH, aw, handH, SLOT.SKIN);
      drawLine(g, hx, hy - handH, hx - k(2), hy - handH - blade, bw, SLOT.METAL, SHADE.LIGHT);
    } else if (pose.attack === 2) {
      const reach = k(6);
      fillRect(g, armX, sy, reach, aw, SLOT.PRIMARY);
      fillRect(g, armX + reach, sy, k(1.5), aw, SLOT.SKIN);
      fillRect(
        g,
        armX + reach + k(1.5),
        sy + Math.floor(aw / 2),
        blade,
        bw,
        SLOT.METAL,
        SHADE.LIGHT,
      );
    } else {
      const hx = armX + k(4);
      const hy = sy + k(5);
      drawLine(g, armX, sy, hx, hy, aw, SLOT.PRIMARY);
      fillRect(g, hx, hy, k(1.5), k(1.5), SLOT.SKIN);
      drawLine(
        g,
        hx + 1,
        hy + 1,
        hx + blade - 1,
        hy + Math.round(blade * 0.7),
        bw,
        SLOT.METAL,
        SHADE.LIGHT,
      );
    }
  }
  if (b.halo) strokeEllipse(g, cx, headCY - hr - k(3), hr + 0.5, k(1.6), 1, SLOT.GLOW);
}

function drawWingsFront(
  g: ShapeGrid,
  cx: number,
  tw: number,
  torsoTop: number,
  torsoH: number,
  s: number,
): void {
  const k = (n: number) => Math.max(1, Math.round(n * s));
  const l = cx - tw / 2;
  const r = cx + tw / 2;
  fillTriangle(
    g,
    l + 1,
    torsoTop + 1,
    l + 1,
    torsoTop + torsoH - 1,
    l - k(6),
    torsoTop - k(3),
    SLOT.SECONDARY,
  );
  fillTriangle(
    g,
    r - 1,
    torsoTop + 1,
    r - 1,
    torsoTop + torsoH - 1,
    r + k(6),
    torsoTop - k(3),
    SLOT.SECONDARY,
  );
}

function drawCurls(g: ShapeGrid, cx: number, headCY: number, hr: number, s: number): void {
  const r = Math.max(1.2, 1.6 * s);
  fillEllipse(g, cx - hr * 0.7, headCY - hr * 0.6, r, r, SLOT.HAIR);
  fillEllipse(g, cx + hr * 0.7, headCY - hr * 0.6, r, r, SLOT.HAIR);
  fillEllipse(g, cx, headCY - hr * 0.95, r, r, SLOT.HAIR);
}

/** Fallen body seen from the side (death frames), head to the left. */
function drawLying(
  g: ShapeGrid,
  b: HumanoidBuild,
  falling: boolean,
  cx: number,
  groundY: number,
  s: number,
): void {
  const k = (n: number) => Math.max(1, Math.round(n * s));
  const lift = falling ? k(2) : 0;
  const len = Math.round(b.bodyH * (falling ? 0.85 : 1));
  const x0 = Math.round(cx - len / 2);
  const thick = Math.max(k(4), Math.round(b.torsoW * 0.6));
  const y0 = groundY - thick - lift;
  const hr = b.headR * 0.9;
  const headD = Math.round(hr * 2);
  const torsoLen = b.torsoH + k(2);
  // Legs, torso, head (left), arm along the body.
  fillRect(
    g,
    x0 + headD + torsoLen - 1,
    y0 + 1,
    len - headD - torsoLen + 1,
    thick - 2,
    SLOT.SECONDARY,
  );
  fillRect(g, x0 + len - k(2), y0 + 1, k(2), thick - 2, b.barefoot ? SLOT.SKIN : SLOT.LEATHER);
  fillRect(g, x0 + headD - 1, y0, torsoLen, thick, b.dress ? SLOT.PRIMARY : SLOT.PRIMARY);
  fillEllipse(g, x0 + hr, groundY - hr - lift, hr + 0.4, hr, SLOT.HAIR);
  fillEllipse(g, x0 + hr + 0.5, groundY - hr * 0.8 - lift, hr * 0.75, hr * 0.7, SLOT.SKIN);
  fillRect(g, x0 + Math.round(hr), groundY - Math.round(hr) - lift, k(2), 1, SLOT.EYE);
  fillRect(g, x0 + headD, y0 + thick - k(2), torsoLen, k(1.5), SLOT.PRIMARY, SHADE.SHADOW);
  if (b.tail)
    drawLine(
      g,
      x0 + headD + torsoLen,
      y0 + 1,
      x0 + headD + torsoLen + k(4),
      y0 - k(2),
      k(2),
      SLOT.HAIR,
    );
  if (b.halo) strokeEllipse(g, x0 + hr, groundY - hr * 2 - lift - k(2), hr, k(1.2), 1, SLOT.GLOW);
}
