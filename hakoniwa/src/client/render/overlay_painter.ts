// Screen-resolution overlay for the world (art_pipeline.md 2.10, 4.1, 4.2, 4.6 and 7.2): ground
// warnings, names (red for an enemy attacking the player), overhead markers, enemy cast bars
// (a shield border when uninterruptible), object glyphs, speech bubbles, floating combat
// text, the placement label, the exit hint, and the arrows at the screen edge for threats
// out of view. Text is drawn by the interface layer, never baked into sprites. Both renderers
// supply a projector from scene points to device pixels, so labels sit on the same feet as
// the standees in the HD-2D scene and on the sprites in the flat fallback. Both draw the
// weather first and this overlay after it, at every quality tier (fairness.ts): nothing a
// player acts on sits under the fog or the rain.

import type { SpriteFrame } from '../sprites/generate';
import { layoutBoxes, wrapText } from './bubbles';
import {
  castBarBox,
  cellOutline,
  edgeArrows,
  type GroundWarning,
  showsCastBar,
  wantsEdgeArrow,
  warningPolygons,
} from './combat_marks';
import { FLOAT_COLORS } from './floating_text';
import { type MarkerKind, markerBob } from './markers';
import { activePalette } from './palette_modes';
import type { Scene, SceneEntity } from './scene';

export interface OverlayFrame {
  dpr: number;
  /** device pixels per sprite pixel (the zoom step) */
  scale: number;
  /** device-pixel position of a scene point: tile x, height in metres, tile y */
  project(x: number, h: number, y: number): { x: number; y: number };
  frameOf(e: SceneEntity): SpriteFrame;
  marker(kind: MarkerKind): HTMLCanvasElement;
  /** device pixels of the canvas, for the edge arrows */
  viewport: { w: number; h: number };
}

/** Overhead name colour by relation in the active colour-vision palette (18.2). */
function nameColor(relation: string): string {
  const n = activePalette().names;
  return relation === 'self' ||
    relation === 'hostile' ||
    relation === 'friendly' ||
    relation === 'neutral'
    ? n[relation]
    : '#ffffff';
}

const FONT = 'system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

export function paintOverlays(c: CanvasRenderingContext2D, scene: Scene, f: OverlayFrame): void {
  const z = f.scale;
  const dpr = f.dpr;
  const heads = new Map<string, { x: number; y: number }>();
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.lineJoin = 'round';

  for (const w of scene.warnings) paintWarning(c, w, f, dpr);

  for (const it of scene.items) {
    if (it.type !== 'entity') continue;
    const fr = f.frameOf(it);
    const foot = f.project(it.x, 0, it.y);
    const head = { x: Math.round(foot.x), y: Math.round(foot.y - (fr.height + 2) * z) };
    let top = head.y;
    if (it.glyph) {
      const p = { x: head.x, y: Math.round(foot.y - (fr.height - 5) * z) };
      c.font = `bold ${Math.max(8, Math.round(6 * z))}px ${FONT}`;
      c.lineWidth = Math.max(2, Math.round(z));
      c.strokeStyle = 'rgba(30,22,14,0.9)';
      c.fillStyle = '#f4e8c8';
      c.strokeText(it.glyph, p.x, p.y);
      c.fillText(it.glyph, p.x, p.y);
    }
    if (it.showName) {
      const size = Math.round(12 * dpr);
      c.font = `${size}px ${FONT}`;
      c.lineWidth = Math.max(2, Math.round(3 * dpr));
      c.strokeStyle = 'rgba(16,12,24,0.85)';
      c.fillStyle = it.marks.threat ? activePalette().names.threat : nameColor(it.relation);
      c.strokeText(it.name, head.x, head.y);
      c.fillText(it.name, head.x, head.y);
      top = head.y - size - 2 * dpr;
    }
    if (it.marker) {
      const m = f.marker(it.marker);
      const scale = Math.max(1, z);
      const mw = m.width * scale;
      const mh = m.height * scale;
      const bob = markerBob(scene.timeMs, z);
      c.imageSmoothingEnabled = false;
      c.drawImage(m, Math.round(head.x - mw / 2), Math.round(top - mh - 2 * dpr + bob), mw, mh);
      top -= mh + 2 * dpr;
    }
    const cast = it.marks.cast;
    if (cast && showsCastBar(it)) {
      const bar = castBarBox({ x: head.x, y: top }, dpr);
      paintCastBar(c, bar, cast.progress, cast.interruptible, dpr);
      top = bar.y - 2 * dpr;
    }
    heads.set(it.id, { x: head.x, y: top });
  }

  // Bubbles: wrap, measure, push apart, draw.
  const size = Math.round(13 * dpr);
  const pad = Math.round(6 * dpr);
  const lineH = Math.round(size * 1.3);
  c.font = `${size}px ${FONT}`;
  const pending: {
    box: { x: number; y: number; w: number; h: number };
    lines: string[];
    kind: string;
    anchor: { x: number; y: number };
  }[] = [];
  for (const b of scene.bubbles) {
    const anchor = heads.get(b.speakerId);
    if (!anchor) continue;
    const lines = wrapText(b.text, 24, 3);
    const w = Math.max(...lines.map((l) => c.measureText(l).width)) + pad * 2;
    const h = lines.length * lineH + pad * 2 - Math.round(size * 0.3);
    pending.push({
      box: { x: anchor.x - w / 2, y: anchor.y - h - 8 * dpr, w, h },
      lines,
      kind: b.kind,
      anchor,
    });
  }
  const laid = layoutBoxes(
    pending.map((p) => p.box),
    3 * dpr,
  );
  pending.forEach((p, i) => {
    const box = laid[i] ?? p.box;
    const divine = p.kind === 'divine';
    const think = p.kind === 'think';
    c.save();
    if (divine) {
      c.shadowColor = 'rgba(255,220,140,0.9)';
      c.shadowBlur = 10 * dpr;
    }
    c.fillStyle = divine ? '#fff6dc' : think ? 'rgba(236,240,248,0.92)' : '#fbf8f0';
    c.strokeStyle = divine ? '#c8a04a' : '#3a3448';
    c.lineWidth = Math.max(1, Math.round(1.5 * dpr));
    if (think) c.setLineDash([4 * dpr, 3 * dpr]);
    c.beginPath();
    c.roundRect(box.x, box.y, box.w, box.h, 6 * dpr);
    c.fill();
    c.stroke();
    c.restore();
    // Tail toward the speaker (thought bubbles use two small dots instead).
    c.fillStyle = divine ? '#fff6dc' : think ? 'rgba(236,240,248,0.92)' : '#fbf8f0';
    const tx = Math.max(box.x + 8 * dpr, Math.min(box.x + box.w - 8 * dpr, p.anchor.x));
    const by = box.y + box.h;
    if (think) {
      c.beginPath();
      c.arc(tx, by + 4 * dpr, 2.5 * dpr, 0, Math.PI * 2);
      c.arc(p.anchor.x, Math.min(p.anchor.y - 2 * dpr, by + 9 * dpr), 1.6 * dpr, 0, Math.PI * 2);
      c.fill();
    } else {
      c.beginPath();
      c.moveTo(tx - 5 * dpr, by - 1);
      c.lineTo(tx + 5 * dpr, by - 1);
      c.lineTo(p.anchor.x, Math.max(by + 2 * dpr, p.anchor.y - 2 * dpr));
      c.closePath();
      c.fill();
      c.strokeStyle = divine ? '#c8a04a' : '#3a3448';
      c.lineWidth = Math.max(1, Math.round(1.5 * dpr));
      c.beginPath();
      c.moveTo(tx - 5 * dpr, by);
      c.lineTo(p.anchor.x, Math.max(by + 2 * dpr, p.anchor.y - 2 * dpr));
      c.lineTo(tx + 5 * dpr, by);
      c.stroke();
    }
    c.fillStyle = divine ? '#5a3e10' : '#2a2434';
    c.font = `${think ? 'italic ' : ''}${size}px ${FONT}`;
    c.textAlign = 'center';
    p.lines.forEach((line, li) => {
      c.fillText(line, box.x + box.w / 2, box.y + pad + size * 0.9 + li * lineH);
    });
  });

  // Floating combat text above heads.
  for (const f of scene.floats) {
    const head = heads.get(f.entityId);
    if (!head) continue;
    const size = Math.round(14 * dpr * f.scale);
    c.font = `bold ${size}px ${FONT}`;
    c.textAlign = 'center';
    c.globalAlpha = f.alpha;
    c.lineWidth = Math.max(2, Math.round(3 * dpr));
    c.strokeStyle = 'rgba(16,12,24,0.9)';
    c.fillStyle = FLOAT_COLORS[f.kind] ?? '#ffffff';
    const x = head.x + f.dx * dpr;
    const y = head.y - f.rise * dpr;
    c.strokeText(f.text, x, y);
    c.fillText(f.text, x, y);
    c.globalAlpha = 1;
  }

  if (scene.placement) {
    const t = scene.placement.tiles[0];
    if (t) {
      const g = f.project(t.x, 0, t.y);
      const p = { x: g.x, y: g.y - 4 * z };
      const s = Math.round(12 * dpr);
      c.font = `${s}px ${FONT}`;
      c.textAlign = 'left';
      const w = c.measureText(scene.placement.label).width + 12 * dpr;
      c.fillStyle = 'rgba(20,16,30,0.82)';
      c.beginPath();
      c.roundRect(p.x, p.y - s - 6 * dpr, w, s + 8 * dpr, 4 * dpr);
      c.fill();
      c.fillStyle = scene.placement.ok ? '#9ee08a' : '#ff9a8a';
      c.fillText(scene.placement.label, p.x + 6 * dpr, p.y - 4 * dpr);
      c.textAlign = 'center';
    }
  }

  if (scene.exitHint) {
    const g = f.project(scene.exitHint.x, 0, scene.exitHint.y);
    const p = { x: g.x, y: g.y - 18 * z };
    const s = Math.round(12 * dpr);
    c.font = `${s}px ${FONT}`;
    const w = c.measureText(scene.exitHint.text).width + 12 * dpr;
    c.fillStyle = 'rgba(20,16,30,0.78)';
    c.beginPath();
    c.roundRect(p.x - w / 2, p.y - s - 4 * dpr, w, s + 8 * dpr, 4 * dpr);
    c.fill();
    c.fillStyle = '#f2d78a';
    c.textAlign = 'center';
    c.fillText(scene.exitHint.text, p.x, p.y);
  }

  // Threats out of view: arrows at the screen edge (4.1), bosses bigger with the crest, and
  // the pad's soft-lock candidate.
  const threats: { id: string; x: number; y: number; boss: boolean }[] = [];
  for (const it of scene.items) {
    if (it.type !== 'entity' || !wantsEdgeArrow(it)) continue;
    const p = f.project(it.x, 0, it.y);
    threats.push({ id: it.id, x: p.x, y: p.y, boss: it.marks.boss });
  }
  for (const a of edgeArrows(threats, f.viewport, dpr))
    paintEdgeArrow(c, a.x, a.y, a.angle, a.size, a.boss, dpr);
}

/** A ground warning: the full outline, a faint fill, and the inner fill growing with the cast. */
function paintWarning(
  c: CanvasRenderingContext2D,
  w: GroundWarning,
  f: OverlayFrame,
  dpr: number,
): void {
  const pal = activePalette().warnings;
  const col = w.hostile ? pal.hostile : pal.friendly;
  const trace = (poly: readonly { x: number; y: number }[]) => {
    c.beginPath();
    poly.forEach((p, i) => {
      const s = f.project(p.x, 0, p.y);
      if (i === 0) c.moveTo(Math.round(s.x), Math.round(s.y));
      else c.lineTo(Math.round(s.x), Math.round(s.y));
    });
    c.closePath();
  };
  c.save();
  const full = warningPolygons(w.shape, 1);
  c.fillStyle = col.fill;
  for (const poly of full) {
    trace(poly);
    c.fill('evenodd');
  }
  c.fillStyle = col.core;
  for (const poly of warningPolygons(w.shape, w.progress)) {
    trace(poly);
    c.fill('evenodd');
  }
  // a pulse zone flashes its edge as each pulse comes (4.6)
  const flash = Math.max(0, Math.min(1, w.pulse ?? 0));
  c.lineWidth = Math.max(2, Math.round((2 + flash * 2) * dpr));
  c.strokeStyle = flash > 0 ? '#ffe0b0' : col.edge;
  if (w.shape.kind === 'cells') {
    // the outline of the locked cells, not of each cell
    c.beginPath();
    for (const [x0, y0, x1, y1] of cellOutline(w.shape.cells)) {
      const a = f.project(x0, 0, y0);
      const b = f.project(x1, 0, y1);
      c.moveTo(Math.round(a.x), Math.round(a.y));
      c.lineTo(Math.round(b.x), Math.round(b.y));
    }
    c.stroke();
  } else
    for (const poly of full) {
      trace(poly);
      c.stroke();
    }
  c.restore();
}

/** The enemy cast bar; an uninterruptible cast gets the shield border (4.2). */
function paintCastBar(
  c: CanvasRenderingContext2D,
  bar: { x: number; y: number; w: number; h: number; border: number },
  progress: number,
  interruptible: boolean,
  dpr: number,
): void {
  const b = bar.border;
  c.fillStyle = 'rgba(16,12,24,0.85)';
  c.fillRect(bar.x - b, bar.y - b, bar.w + b * 2, bar.h + b * 2);
  c.fillStyle = interruptible ? '#f2c94c' : '#b8c0d0';
  c.fillRect(bar.x, bar.y, Math.round(bar.w * Math.max(0, Math.min(1, progress))), bar.h);
  if (!interruptible) {
    // the shield: a light frame and a small crest at the left end
    c.strokeStyle = '#e8eef8';
    c.lineWidth = Math.max(1, Math.round(dpr));
    c.strokeRect(bar.x - b - 0.5, bar.y - b - 0.5, bar.w + b * 2 + 1, bar.h + b * 2 + 1);
    const sx = bar.x - b - Math.round(5 * dpr);
    const sy = bar.y + bar.h / 2;
    const r = Math.round(4 * dpr);
    c.fillStyle = '#e8eef8';
    c.beginPath();
    c.moveTo(sx - r, sy - r);
    c.lineTo(sx + r, sy - r);
    c.lineTo(sx + r, sy);
    c.lineTo(sx, sy + r);
    c.lineTo(sx - r, sy);
    c.closePath();
    c.fill();
  }
}

/** An arrow at the screen edge pointing out at a threat; a boss's carries a crest. */
function paintEdgeArrow(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  boss: boolean,
  dpr: number,
): void {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.beginPath();
  c.moveTo(size / 2, 0);
  c.lineTo(-size / 2, size / 2.4);
  c.lineTo(-size / 4, 0);
  c.lineTo(-size / 2, -size / 2.4);
  c.closePath();
  c.fillStyle = boss ? '#ff3a2a' : '#ff6a4a';
  c.strokeStyle = 'rgba(16,12,24,0.9)';
  c.lineWidth = Math.max(1, Math.round(1.5 * dpr));
  c.fill();
  c.stroke();
  if (boss) {
    c.rotate(-angle);
    c.fillStyle = '#ffe08a';
    const r = Math.round(4 * dpr);
    c.beginPath();
    c.moveTo(0, -r);
    c.lineTo(r, 0);
    c.lineTo(0, r);
    c.lineTo(-r, 0);
    c.closePath();
    c.fill();
  }
  c.restore();
}
