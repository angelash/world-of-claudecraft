// Draws a MapDef onto a 2D canvas for the map editor: flat tile colours, optional
// walkability, connected-area and grid overlays, locations, spawns, exits, the
// selection, a drag preview and issue markers. Reads only; never edits the map.

import type { MapDef, Rect } from '../../systems/world/types';
import type { Components, MapIssue } from './map_checks';
import type { Cell, ObjectRef } from './map_ops';
import { componentColor, isBlockingKind, tileColor } from './palette';

export interface MapOverlays {
  walk: boolean;
  components: boolean;
  grid: boolean;
  labels: boolean;
  issues: boolean;
}

export interface MapView {
  /** pixels per tile */
  tile: number;
  overlays: MapOverlays;
  selection: ObjectRef | null;
  hover: Cell | null;
  /** cell to flash (jumped to from an issue) */
  focus: Cell | null;
  preview: Rect | null;
  issues: readonly MapIssue[];
  comps: Components | null;
}

const SPAWN_COLORS: Record<string, string> = {
  monster: '#e04a4a',
  npc: '#3d8de0',
  object: '#a0a0a0',
};

export function sizeCanvas(
  canvas: HTMLCanvasElement,
  map: MapDef,
  tile: number,
): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, map.width * tile);
  const hgt = Math.max(1, map.height * tile);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${hgt}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function drawMap(ctx: CanvasRenderingContext2D, map: MapDef, view: MapView): void {
  const t = view.tile;
  ctx.clearRect(0, 0, map.width * t, map.height * t);
  for (let y = 0; y < map.height; y++) {
    const row = map.rows[y] ?? '';
    for (let x = 0; x < map.width; x++) {
      const ch = row[x];
      ctx.fillStyle = ch === undefined ? '#ff00ff' : tileColor(map.legend[ch]);
      ctx.fillRect(x * t, y * t, t, t);
    }
  }

  if (view.overlays.walk) {
    ctx.fillStyle = 'rgba(230, 40, 40, 0.38)';
    for (let y = 0; y < map.height; y++) {
      const row = map.rows[y] ?? '';
      for (let x = 0; x < map.width; x++) {
        const ch = row[x];
        if (ch === undefined || isBlockingKind(map.legend[ch])) ctx.fillRect(x * t, y * t, t, t);
      }
    }
  }

  if (view.overlays.components && view.comps) {
    const labels = view.comps.labels;
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i] as number;
      if (label < 0) continue;
      ctx.fillStyle = componentColor(label);
      ctx.fillRect((i % map.width) * t, Math.floor(i / map.width) * t, t, t);
    }
  }

  if (view.overlays.grid && t >= 8) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= map.width; x++) {
      ctx.moveTo(x * t + 0.5, 0);
      ctx.lineTo(x * t + 0.5, map.height * t);
    }
    for (let y = 0; y <= map.height; y++) {
      ctx.moveTo(0, y * t + 0.5);
      ctx.lineTo(map.width * t, y * t + 0.5);
    }
    ctx.stroke();
  }

  const font = `${Math.max(9, Math.min(14, Math.floor(t * 0.6)))}px sans-serif`;
  ctx.font = font;
  ctx.textBaseline = 'top';

  for (const l of map.locations) {
    const sel = view.selection?.kind === 'location' && view.selection.id === l.id;
    ctx.lineWidth = sel ? 3 : 2;
    ctx.strokeStyle = sel ? '#ffffff' : '#ffd23f';
    ctx.strokeRect(l.x * t + 1, l.y * t + 1, l.w * t - 2, l.h * t - 2);
    if (view.overlays.labels) label(ctx, l.name || l.id, l.x * t + 3, l.y * t + 2, '#ffd23f');
  }

  for (const s of map.spawns) {
    const sel = view.selection?.kind === 'spawn' && view.selection.id === s.id;
    const cx = s.x * t;
    const cy = s.y * t;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(3, t * 0.32), 0, Math.PI * 2);
    ctx.fillStyle = SPAWN_COLORS[s.kind] ?? '#cccccc';
    ctx.fill();
    ctx.lineWidth = sel ? 3 : 1.5;
    ctx.strokeStyle = sel ? '#ffffff' : '#000000';
    ctx.stroke();
    if (view.overlays.labels) label(ctx, s.ref || s.id, cx + t * 0.4, cy - t * 0.3, '#ffffff');
  }

  for (const e of map.exits) {
    const sel = view.selection?.kind === 'exit' && view.selection.id === e.id;
    const cx = (Math.floor(e.x) + 0.5) * t;
    const cy = (Math.floor(e.y) + 0.5) * t;
    const r = Math.max(4, t * 0.42);
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fillStyle = '#ff8a1f';
    ctx.fill();
    ctx.lineWidth = sel ? 3 : 1.5;
    ctx.strokeStyle = sel ? '#ffffff' : '#000000';
    ctx.stroke();
    if (view.overlays.labels) {
      label(ctx, `${e.label || e.id} -> ${e.toMap || '?'}`, cx + r + 2, cy - r, '#ffb36b');
    }
  }

  if (view.preview) {
    const p = view.preview;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(p.x * t + 1, p.y * t + 1, p.w * t - 2, p.h * t - 2);
    ctx.setLineDash([]);
  }

  if (view.overlays.issues) {
    for (const i of view.issues) {
      if (i.x === undefined || i.y === undefined || i.severity === 'info') continue;
      ctx.beginPath();
      ctx.arc(
        (Math.floor(i.x) + 0.5) * t,
        (Math.floor(i.y) + 0.5) * t,
        Math.max(5, t * 0.55),
        0,
        Math.PI * 2,
      );
      ctx.lineWidth = 2;
      ctx.strokeStyle = i.severity === 'error' ? '#ff3030' : '#ffc400';
      ctx.stroke();
    }
  }

  for (const c of [view.focus, view.hover]) {
    if (!c) continue;
    ctx.lineWidth = c === view.focus ? 3 : 1.5;
    ctx.strokeStyle = c === view.focus ? '#00e5ff' : 'rgba(255, 255, 255, 0.9)';
    ctx.strokeRect(c.x * t + 0.5, c.y * t + 0.5, t - 1, t - 1);
  }
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  const w = ctx.measureText(text).width;
  const hgt = Number.parseInt(ctx.font, 10) + 3;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(x - 1, y - 1, w + 3, hgt);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
