// Combat readability marks in the world (art_pipeline.md 4.1, 4.2, 4.6 and 4.10): the ground
// warnings of hostile area casts, the small cast bar over an enemy's head (a shield border
// when it cannot be interrupted), the threat mark of enemies attacking the player, and the
// arrows at the screen edge pointing at threats out of view (bigger with a crest for a
// boss, and for the soft-lock candidate). These are actionable information: no quality tier,
// weather or setting takes them away, so nothing here reads a tier, and the painter draws
// them after the weather and the fog (fairness.ts). Shapes are in tiles on the ground plane
// and match the kernel's areas: a kernel warning (`telegraphsOn`) is its locked cells, hit
// by the tile under a unit's centre; an area cast without one is a distance from a centre.
// Pure; Node-tested.

/** A unit's cast as the world shows it. */
export interface CastMark {
  /** 0..1 of the cast */
  progress: number;
  /** false draws the shield border (4.2) */
  interruptible: boolean;
  /** Cosmetic school frame, sourced from the same ability and clock as this cast. */
  school?: string;
  elapsedMs?: number;
}

/** Per-entity combat marks the session hands to the scene. */
export interface EntityMarks {
  /** a hostile unit whose current target is the player (4.1: red name, thin outer ring) */
  threat: boolean;
  /** a boss: its off-screen arrow is bigger and carries the crest */
  boss: boolean;
  /** the unit is casting (enemy cast bars, 4.2) */
  cast: CastMark | null;
}

export const NO_MARKS: EntityMarks = { threat: false, boss: false, cast: null };

/**
 * A ground warning (4.6). Circles cover `groundAoE`-style casts around a caster or a target;
 * cones, lines and rings are the shapes boss telegraphs use (PK-M1-12 hands them over in
 * the same form).
 */
export type WarningShape =
  /** the kernel's locked cells (tile x and y in pairs), hit by the tile under a unit */
  | { kind: 'cells'; cells: readonly number[] }
  | { kind: 'circle'; x: number; y: number; radius: number }
  | { kind: 'ring'; x: number; y: number; inner: number; radius: number }
  /** `dir` in radians (map axes, atan2 with +y south), `arc` the full opening angle */
  | { kind: 'cone'; x: number; y: number; radius: number; dir: number; arc: number }
  /** from (x, y) along `dir` for `length` tiles, `width` tiles wide (a charge path) */
  | { kind: 'line'; x: number; y: number; dir: number; length: number; width: number };

export interface GroundWarning {
  id: string;
  shape: WarningShape;
  /** 0..1: how far the cast is; the inner fill grows with it */
  progress: number;
  /** hostile warnings are orange-red, friendly ones blue-green (4.6) */
  hostile: boolean;
  /** 0..1: a pulse zone flashes its edge as each pulse comes (4.6), 0 otherwise */
  pulse?: number;
}

export const WARNING_COLORS = {
  hostile: { edge: '#ff5a2e', fill: 'rgba(255,90,46,0.22)', core: 'rgba(255,120,60,0.38)' },
  friendly: { edge: '#3ad0b8', fill: 'rgba(58,208,184,0.18)', core: 'rgba(58,208,184,0.32)' },
} as const;

export type Pt = { x: number; y: number };

/** Points around an arc, inclusive of both ends. */
function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

/** The cells of a cell warning as [x, y] pairs. */
function cellPairs(cells: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < cells.length; i += 2)
    out.push([cells[i] as number, cells[i + 1] as number]);
  return out;
}

/** A point of the tile ground (x, y) as a reference point of a shape (its anchor or centroid). */
export function warningCentre(shape: WarningShape): Pt {
  if (shape.kind !== 'cells') return { x: shape.x, y: shape.y };
  const cs = cellPairs(shape.cells);
  if (cs.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const [cx, cy] of cs) {
    x += cx + 0.5;
    y += cy + 0.5;
  }
  return { x: x / cs.length, y: y / cs.length };
}

/**
 * The outline of a cell warning: every cell edge without a neighbour cell across it, as
 * segments [x0, y0, x1, y1] in tiles.
 */
export function cellOutline(cells: readonly number[]): [number, number, number, number][] {
  const set = new Set(cellPairs(cells).map(([x, y]) => `${x},${y}`));
  const has = (x: number, y: number) => set.has(`${x},${y}`);
  const out: [number, number, number, number][] = [];
  for (const [x, y] of cellPairs(cells)) {
    if (!has(x, y - 1)) out.push([x, y, x + 1, y]);
    if (!has(x, y + 1)) out.push([x, y + 1, x + 1, y + 1]);
    if (!has(x - 1, y)) out.push([x, y, x, y + 1]);
    if (!has(x + 1, y)) out.push([x + 1, y, x + 1, y + 1]);
  }
  return out;
}

/** Ground polygons (tiles) of a shape scaled by k (1 the outline, progress the fill). */
export function warningPolygons(shape: WarningShape, k = 1, segments = 32): Pt[][] {
  const s = Math.max(0, Math.min(1, k));
  switch (shape.kind) {
    case 'cells': {
      // the fill spreads from the area's middle outward with the cast
      if (s <= 0) return [];
      const cs = cellPairs(shape.cells);
      const c = warningCentre(shape);
      let far = 0;
      for (const [x, y] of cs) far = Math.max(far, Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y));
      const reach = s >= 1 ? Number.POSITIVE_INFINITY : s * (far + 0.5);
      return cs
        .filter(([x, y]) => Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) <= reach)
        .map(([x, y]) => [
          { x, y },
          { x: x + 1, y },
          { x: x + 1, y: y + 1 },
          { x, y: y + 1 },
        ]);
    }
    case 'circle':
      if (s <= 0) return [];
      return [arcPoints(shape.x, shape.y, shape.radius * s, 0, Math.PI * 2, segments)];
    case 'ring': {
      // the fill closes in from the outer edge toward the safe middle
      const outer = shape.radius;
      const inner = outer - (outer - shape.inner) * s;
      if (s <= 0) return [];
      const o = arcPoints(shape.x, shape.y, outer, 0, Math.PI * 2, segments);
      const i = arcPoints(shape.x, shape.y, inner, Math.PI * 2, 0, segments);
      return [[...o, ...i]];
    }
    case 'cone': {
      if (s <= 0) return [];
      const half = shape.arc / 2;
      const n = Math.max(4, Math.ceil((segments * shape.arc) / (Math.PI * 2)));
      const pts = arcPoints(
        shape.x,
        shape.y,
        shape.radius * s,
        shape.dir - half,
        shape.dir + half,
        n,
      );
      return [[{ x: shape.x, y: shape.y }, ...pts]];
    }
    case 'line': {
      if (s <= 0) return [];
      const len = shape.length * s;
      const dx = Math.cos(shape.dir);
      const dy = Math.sin(shape.dir);
      const hw = shape.width / 2;
      const px = -dy * hw;
      const py = dx * hw;
      return [
        [
          { x: shape.x + px, y: shape.y + py },
          { x: shape.x + dx * len + px, y: shape.y + dy * len + py },
          { x: shape.x + dx * len - px, y: shape.y + dy * len - py },
          { x: shape.x - px, y: shape.y - py },
        ],
      ];
    }
  }
}

/** Whether a ground point lies inside a warning's full area (what the kernel would hit). */
export function insideWarning(shape: WarningShape, x: number, y: number): boolean {
  if (shape.kind === 'cells') {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    for (let i = 0; i + 1 < shape.cells.length; i += 2)
      if (shape.cells[i] === tx && shape.cells[i + 1] === ty) return true;
    return false;
  }
  const dx = x - shape.x;
  const dy = y - shape.y;
  const d = Math.hypot(dx, dy);
  switch (shape.kind) {
    case 'circle':
      return d <= shape.radius;
    case 'ring':
      return d <= shape.radius && d >= shape.inner;
    case 'cone': {
      if (d > shape.radius) return false;
      if (d === 0) return true;
      const a = Math.atan2(dy, dx) - shape.dir;
      const w = Math.atan2(Math.sin(a), Math.cos(a));
      return Math.abs(w) <= shape.arc / 2;
    }
    case 'line': {
      const along = dx * Math.cos(shape.dir) + dy * Math.sin(shape.dir);
      const across = -dx * Math.sin(shape.dir) + dy * Math.cos(shape.dir);
      return along >= 0 && along <= shape.length && Math.abs(across) <= shape.width / 2;
    }
  }
}

/** The enemy cast bar over a head (device pixels): centred, above the name. */
export function castBarBox(
  head: Pt,
  dpr: number,
): { x: number; y: number; w: number; h: number; border: number } {
  const w = Math.round(44 * dpr);
  const h = Math.max(3, Math.round(4 * dpr));
  const border = Math.max(1, Math.round(dpr));
  return { x: Math.round(head.x - w / 2), y: Math.round(head.y - h - 3 * dpr), w, h, border };
}

/** An arrow at the screen edge pointing at an off-screen threat. */
export interface EdgeArrow {
  id: string;
  /** device pixels, on the inset screen edge */
  x: number;
  y: number;
  /** radians, screen axes (+y down): the direction to the threat */
  angle: number;
  /** device pixels, tip to tail */
  size: number;
  boss: boolean;
}

/**
 * Edge arrows for threats whose foot is off screen: each sits where the line from the
 * screen centre to the threat crosses the edge, inset by `inset`. Bosses get the bigger
 * arrow. Sorted bosses first, then by id, so the drawing order is stable.
 */
export function edgeArrows(
  threats: readonly { id: string; x: number; y: number; boss: boolean }[],
  vp: { w: number; h: number },
  dpr: number,
): EdgeArrow[] {
  const inset = Math.round(28 * dpr);
  const cx = vp.w / 2;
  const cy = vp.h / 2;
  const hw = Math.max(1, cx - inset);
  const hh = Math.max(1, cy - inset);
  const out: EdgeArrow[] = [];
  for (const t of threats) {
    if (t.x >= 0 && t.x <= vp.w && t.y >= 0 && t.y <= vp.h) continue;
    const dx = t.x - cx;
    const dy = t.y - cy;
    if (dx === 0 && dy === 0) continue;
    const k = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
    out.push({
      id: t.id,
      x: Math.round(cx + dx * k),
      y: Math.round(cy + dy * k),
      angle: Math.atan2(dy, dx),
      size: Math.round((t.boss ? 22 : 14) * dpr),
      boss: t.boss,
    });
  }
  return out.sort((a, b) => (a.boss === b.boss ? (a.id < b.id ? -1 : 1) : a.boss ? -1 : 1));
}

/** Name colour of an enemy attacking the player (4.1: the name turns red). */
export const THREAT_NAME_COLOR = '#ff4a3a';

/**
 * Whether a figure shows the small cast bar over its head (4.2): enemies and the neutral do,
 * the player and friends do not (theirs are on the HUD). The overlay and the frame signature
 * both read this, so a cast nobody sees never redraws the overlay.
 */
export function showsCastBar(e: { relation: string; marks: EntityMarks }): boolean {
  return !!e.marks.cast && e.relation !== 'self' && e.relation !== 'friendly';
}

/**
 * Whether a figure out of view gets an edge arrow (4.1): an enemy attacking the player, a
 * boss in a fight, and the pad's soft-lock candidate.
 */
export function wantsEdgeArrow(e: {
  relation: string;
  hovered: boolean;
  marks: EntityMarks;
}): boolean {
  if (e.relation !== 'hostile') return false;
  return e.marks.threat || e.marks.boss || e.hovered;
}
