// Mesh data for building shells, roofs and standee quads (art_pipeline.md 2.4 and 2.6),
// as plain arrays so the shapes are Node-testable; the scene builder wraps them in
// three.js buffers. Scene axes: x east, y up, z south; one unit is one metre. Texture v
// runs from the top row of a painted matrix (v 0) to its bottom row (v 1).

import type { RoofShape } from '../../systems/world/look';
import type { Rect } from '../../systems/world/types';
import { TILE_PX } from '../render/camera';
import { DOOR_HEIGHT, ROOF_OVERHANG, type Side, type WallFace } from './layout';
import type { StandeeQuad } from './standee';
import { ATLAS_CELLS, cellIndex } from './textures';

export interface MeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

export type V3 = [number, number, number];

export function emptyMesh(): MeshData {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/**
 * Append a polygon (3 or 4 corners, fan-triangulated) facing `outward`: the winding is
 * flipped when needed so the front face points that way.
 */
export function addPolygon(md: MeshData, pts: V3[], uvs: [number, number][], outward: V3): void {
  const n0 = norm(cross(sub(pts[1] as V3, pts[0] as V3), sub(pts[2] as V3, pts[0] as V3)));
  const flip = n0[0] * outward[0] + n0[1] * outward[1] + n0[2] * outward[2] < 0;
  const n = flip ? ([-n0[0], -n0[1], -n0[2]] as V3) : n0;
  const base = md.positions.length / 3;
  pts.forEach((p, i) => {
    md.positions.push(p[0], p[1], p[2]);
    md.normals.push(n[0], n[1], n[2]);
    const uv = uvs[i] as [number, number];
    md.uvs.push(uv[0], uv[1]);
  });
  for (let i = 1; i < pts.length - 1; i++) {
    if (flip) md.indices.push(base, base + i + 1, base + i);
    else md.indices.push(base, base + i, base + i + 1);
  }
}

const OUTWARD: Record<Side, V3> = { n: [0, 0, -1], s: [0, 0, 1], w: [-1, 0, 0], e: [1, 0, 0] };

/** Bottom-left and bottom-right corners of a tile side as seen from outside. */
function sideEdge(x: number, y: number, side: Side): [V3, V3] {
  switch (side) {
    case 'n':
      return [
        [x + 1, 0, y],
        [x, 0, y],
      ];
    case 's':
      return [
        [x, 0, y + 1],
        [x + 1, 0, y + 1],
      ];
    case 'w':
      return [
        [x, 0, y],
        [x, 0, y + 1],
      ];
    default:
      return [
        [x + 1, 0, y + 1],
        [x + 1, 0, y],
      ];
  }
}

/**
 * Wall faces and caps of one shell (or of the free walls) of `height` metres, mapped onto a
 * wall atlas of ATLAS_CELLS columns and `atlasPx` rows. Door lintels start at DOOR_HEIGHT.
 */
export function wallMesh(
  faces: readonly WallFace[],
  caps: readonly { x: number; y: number; lintel?: boolean }[],
  height: number,
  atlasPx: number,
): MeshData {
  const md = emptyMesh();
  const cells = ATLAS_CELLS.length;
  const v = (h: number) => (atlasPx - h * TILE_PX) / atlasPx;
  for (const f of faces) {
    const [bl, br] = sideEdge(f.x, f.y, f.side);
    const lo = f.lintel ? Math.min(DOOR_HEIGHT, height) : 0;
    if (lo >= height) continue;
    const c = cellIndex(f.cell);
    const u0 = c / cells;
    const u1 = (c + 1) / cells;
    addPolygon(
      md,
      [
        [bl[0], lo, bl[2]],
        [br[0], lo, br[2]],
        [br[0], height, br[2]],
        [bl[0], height, bl[2]],
      ],
      [
        [u0, v(lo)],
        [u1, v(lo)],
        [u1, v(height)],
        [u0, v(height)],
      ],
      OUTWARD[f.side],
    );
  }
  const cap = cellIndex('cap');
  const cu0 = cap / cells;
  const cu1 = (cap + 1) / cells;
  const cv1 = Math.min(1, TILE_PX / atlasPx);
  for (const t of caps) {
    addPolygon(
      md,
      [
        [t.x, height, t.y + 1],
        [t.x + 1, height, t.y + 1],
        [t.x + 1, height, t.y],
        [t.x, height, t.y],
      ],
      [
        [cu0, cv1],
        [cu1, cv1],
        [cu1, 0],
        [cu0, 0],
      ],
      [0, 1, 0],
    );
  }
  return md;
}

export interface RoofMesh {
  /** slopes, mapped onto a roof texture of wPx by lPx */
  slopes: MeshData;
  /** gable ends, mapped in metres (a repeating wall texture) */
  gables: MeshData;
  wPx: number;
  lPx: number;
  /** ridge height above the ground, for chimneys */
  ridgeY: number;
  /** a point on the ridge line for the chimney, and the slope direction away from it */
  chimneyAt: V3;
}

/** Slope pitch in degrees; for the dome it is the slope at the dome's foot. */
export const ROOF_PITCH_DEG: Record<RoofShape, number> = {
  gable: 36,
  hip: 30,
  flat: 0,
  dome: 90,
  cone: 32,
  spire: 62,
};

/** Facets around the revolved roofs: smooth enough for a tent or a dome, eight for a spire. */
export const ROOF_SEGMENTS: Readonly<Record<'dome' | 'cone' | 'spire', number>> = {
  dome: 16,
  cone: 16,
  spire: 8,
};

/** Dome profile: rings of [radius fraction, height fraction] from the foot to the crown. */
const DOME_RINGS: readonly [number, number][] = [
  [1, 0],
  [0.92, 0.38],
  [0.71, 0.71],
  [0.38, 0.92],
  [0, 1],
];

/**
 * A roof of revolution over the rect (art_pipeline.md 1.7): rings around the rect's centre
 * whose facets enclose the ellipse through the shell corners grown by the overhang, so the
 * eave stands above the wall top at every corner; rings are joined by quads (triangles at the
 * apex). The slopes texture wraps once around (u) and runs from the apex (v 0) to the
 * eave (v 1), like the gable slopes. The dome sits on a flat slab and spans the shorter side.
 */
function revolvedRoof(
  rect: Rect,
  wallH: number,
  shape: 'dome' | 'cone' | 'spire',
  slopes: MeshData,
): { wPx: number; lPx: number; ridgeY: number } {
  const oh = ROOF_OVERHANG;
  const cx = rect.x + rect.w / 2;
  const cz = rect.y + rect.h / 2;
  const n = ROOF_SEGMENTS[shape];
  let rings: [number, number, number][];
  if (shape === 'dome') {
    const r = Math.min(rect.w, rect.h) / 2;
    const foot = wallH + 0.12;
    rings = DOME_RINGS.map(([k, h]) => [r * k, r * k, foot + r * 0.9 * h]);
  } else {
    // The facets are chords of the ring: grow it so the polygon, not just its corners,
    // encloses the ellipse through the shell corners plus the overhang.
    const grow = 1 / Math.cos(Math.PI / n);
    const rx = ((rect.w / 2) * Math.SQRT2 + oh) * grow;
    const rz = ((rect.h / 2) * Math.SQRT2 + oh) * grow;
    const tan = Math.tan((ROOF_PITCH_DEG[shape] * Math.PI) / 180);
    const eaveY = wallH - oh * tan;
    rings = [
      [rx, rz, eaveY],
      [0, 0, eaveY + Math.max(rx, rz) * tan],
    ];
  }
  // Slant length along the profile sets the texture height; the eave ring sets its width.
  let slant = 0;
  for (let i = 1; i < rings.length; i++) {
    const [ax, , ay] = rings[i - 1] as [number, number, number];
    const [bx, , by] = rings[i] as [number, number, number];
    slant += Math.hypot(ax - bx, ay - by);
  }
  const [erx, erz] = rings[0] as [number, number, number];
  const around = Math.PI * (erx + erz);
  const at = (ring: [number, number, number], k: number): V3 => {
    const a = (k / n) * Math.PI * 2 + Math.PI / n;
    return [cx + Math.cos(a) * ring[0], ring[2], cz + Math.sin(a) * ring[1]];
  };
  let v0 = 0;
  for (let i = 0; i < rings.length - 1; i++) {
    const lo = rings[i] as [number, number, number];
    const hi = rings[i + 1] as [number, number, number];
    const step = Math.hypot(lo[0] - hi[0], lo[2] - hi[2]) / slant;
    const vLo = 1 - v0;
    const vHi = 1 - v0 - step;
    for (let k = 0; k < n; k++) {
      const mid = ((k + 0.5) / n) * Math.PI * 2 + Math.PI / n;
      const out: V3 = [Math.cos(mid), 0.6, Math.sin(mid)];
      const u0 = k / n;
      const u1 = (k + 1) / n;
      if (hi[0] === 0 && hi[1] === 0) {
        addPolygon(
          slopes,
          [at(lo, k), at(lo, k + 1), at(hi, k)],
          [
            [u0, vLo],
            [u1, vLo],
            [(u0 + u1) / 2, Math.max(0, vHi)],
          ],
          out,
        );
      } else {
        addPolygon(
          slopes,
          [at(lo, k), at(lo, k + 1), at(hi, k + 1), at(hi, k)],
          [
            [u0, vLo],
            [u1, vLo],
            [u1, vHi],
            [u0, vHi],
          ],
          out,
        );
      }
    }
    v0 += step;
  }
  if (shape === 'dome') {
    // The slab the dome stands on, with a low lip, as on a flat roof.
    const top = wallH + 0.12;
    addPolygon(
      slopes,
      [
        [rect.x - 0.1, top, rect.y + rect.h + 0.1],
        [rect.x + rect.w + 0.1, top, rect.y + rect.h + 0.1],
        [rect.x + rect.w + 0.1, top, rect.y - 0.1],
        [rect.x - 0.1, top, rect.y - 0.1],
      ],
      [
        [0, 1],
        [1, 1],
        [1, 0.9],
        [0, 0.9],
      ],
      [0, 1, 0],
    );
  }
  const crown = rings[rings.length - 1] as [number, number, number];
  return {
    wPx: Math.max(4, Math.round(around * TILE_PX)),
    lPx: Math.max(4, Math.round(slant * TILE_PX)),
    ridgeY: crown[2],
  };
}

/** Roof over a shell rect whose walls are `wallH` metres tall. */
export function roofMesh(rect: Rect, wallH: number, shape: RoofShape, ridge: 'x' | 'z'): RoofMesh {
  const slopes = emptyMesh();
  const gables = emptyMesh();
  const oh = ROOF_OVERHANG;
  if (shape === 'dome' || shape === 'cone' || shape === 'spire') {
    const r = revolvedRoof(rect, wallH, shape, slopes);
    // A chimney stands off-centre on the slab or the slope.
    return {
      slopes,
      gables,
      ...r,
      chimneyAt: [rect.x + rect.w * 0.2, wallH + 0.12, rect.y + rect.h * 0.25],
    };
  }
  if (shape === 'flat') {
    const top = wallH + 0.12;
    const x0 = rect.x - 0.1;
    const x1 = rect.x + rect.w + 0.1;
    const z0 = rect.y - 0.1;
    const z1 = rect.y + rect.h + 0.1;
    const wPx = Math.round((x1 - x0) * TILE_PX);
    const lPx = Math.round((z1 - z0) * TILE_PX);
    addPolygon(
      slopes,
      [
        [x0, top, z1],
        [x1, top, z1],
        [x1, top, z0],
        [x0, top, z0],
      ],
      [
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ],
      [0, 1, 0],
    );
    // A low lip on every side so the slab reads as a roof.
    const lip = 0.12;
    const sides: [V3, V3, V3][] = [
      [
        [x0, wallH, z1],
        [x1, wallH, z1],
        [0, 0, 1],
      ],
      [
        [x1, wallH, z0],
        [x0, wallH, z0],
        [0, 0, -1],
      ],
      [
        [x0, wallH, z0],
        [x0, wallH, z1],
        [-1, 0, 0],
      ],
      [
        [x1, wallH, z1],
        [x1, wallH, z0],
        [1, 0, 0],
      ],
    ];
    for (const [a, b, n] of sides) {
      addPolygon(
        slopes,
        [a, b, [b[0], top + lip, b[2]], [a[0], top + lip, a[2]]],
        [
          [0, 1],
          [1, 1],
          [1, 0.95],
          [0, 0.95],
        ],
        n,
      );
    }
    return {
      slopes,
      gables,
      wPx,
      lPx,
      ridgeY: top,
      chimneyAt: [rect.x + rect.w * 0.3, top, rect.y + rect.h * 0.4],
    };
  }
  const tan = Math.tan((ROOF_PITCH_DEG[shape] * Math.PI) / 180);
  // Work in a local frame where the ridge runs along "a" and the slopes fall along "b".
  const a0 = ridge === 'x' ? rect.x : rect.y;
  const aLen = ridge === 'x' ? rect.w : rect.h;
  const b0 = ridge === 'x' ? rect.y : rect.x;
  const bLen = ridge === 'x' ? rect.h : rect.w;
  const half = bLen / 2;
  const rise = half * tan;
  const eaveY = wallH - oh * tan;
  const ridgeY = wallH + rise;
  const bm = b0 + half;
  const P = (a: number, y: number, b: number): V3 => (ridge === 'x' ? [a, y, b] : [b, y, a]);
  const OUT = (db: number): V3 => (ridge === 'x' ? [0, 1, db] : [db, 1, 0]);
  const slopeLen = (half + oh) / Math.cos((ROOF_PITCH_DEG[shape] * Math.PI) / 180);
  const lPx = Math.max(4, Math.round(slopeLen * TILE_PX));
  const aStart = a0 - oh;
  const aEnd = a0 + aLen + oh;
  const wPx = Math.max(4, Math.round((aEnd - aStart) * TILE_PX));
  const u = (a: number) => (a - aStart) / (aEnd - aStart);
  if (shape === 'gable') {
    for (const dir of [-1, 1]) {
      const eb = dir < 0 ? b0 - oh : b0 + bLen + oh;
      addPolygon(
        slopes,
        [P(aStart, eaveY, eb), P(aEnd, eaveY, eb), P(aEnd, ridgeY, bm), P(aStart, ridgeY, bm)],
        [
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
        OUT(dir),
      );
    }
    for (const end of [a0, a0 + aLen]) {
      const out: V3 = ridge === 'x' ? [end === a0 ? -1 : 1, 0, 0] : [0, 0, end === a0 ? -1 : 1];
      const pts: V3[] = [P(end, wallH, b0), P(end, wallH, b0 + bLen), P(end, ridgeY, bm)];
      addPolygon(
        gables,
        pts,
        [
          [0, -wallH],
          [bLen, -wallH],
          [half, -ridgeY],
        ],
        out,
      );
    }
  } else {
    // Hip: the ridge is shortened by the half span at each end; end slopes are triangles.
    const inset = Math.min(half, aLen / 2);
    const rA0 = a0 + inset;
    const rA1 = a0 + aLen - inset;
    for (const dir of [-1, 1]) {
      const eb = dir < 0 ? b0 - oh : b0 + bLen + oh;
      addPolygon(
        slopes,
        [P(aStart, eaveY, eb), P(aEnd, eaveY, eb), P(rA1, ridgeY, bm), P(rA0, ridgeY, bm)],
        [
          [0, 1],
          [1, 1],
          [u(rA1), 0],
          [u(rA0), 0],
        ],
        OUT(dir),
      );
    }
    for (const end of [-1, 1]) {
      const ea = end < 0 ? aStart : aEnd;
      const ra = end < 0 ? rA0 : rA1;
      const out: V3 = ridge === 'x' ? [end, 1, 0] : [0, 1, end];
      addPolygon(
        slopes,
        [P(ea, eaveY, b0 - oh), P(ea, eaveY, b0 + bLen + oh), P(ra, ridgeY, bm)],
        [
          [0, 1],
          [1, 1],
          [0.5, 0],
        ],
        out,
      );
    }
  }
  const chimneyA = a0 + aLen * 0.28;
  return { slopes, gables, wPx, lPx, ridgeY, chimneyAt: P(chimneyA, ridgeY, bm - 0.55) };
}

/**
 * An axis-aligned box (chimneys, posts) with texture coordinates in metres for a
 * repeating 16-pixel tile: sides run u along the face and v down from the top (v = -y),
 * the top maps x and z. The bottom is left open.
 */
export function boxMesh(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
): MeshData {
  const md = emptyMesh();
  const side = (a: V3, b: V3, out: V3, len: number) =>
    addPolygon(
      md,
      [a, b, [b[0], y1, b[2]], [a[0], y1, a[2]]],
      [
        [0, -y0],
        [len, -y0],
        [len, -y1],
        [0, -y1],
      ],
      out,
    );
  side([x0, y0, z1], [x1, y0, z1], [0, 0, 1], x1 - x0);
  side([x1, y0, z0], [x0, y0, z0], [0, 0, -1], x1 - x0);
  side([x0, y0, z0], [x0, y0, z1], [-1, 0, 0], z1 - z0);
  side([x1, y0, z1], [x1, y0, z0], [1, 0, 0], z1 - z0);
  addPolygon(
    md,
    [
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y1, z0],
      [x0, y1, z0],
    ],
    [
      [x0, z1],
      [x1, z1],
      [x1, z0],
      [x0, z0],
    ],
    [0, 1, 0],
  );
  return md;
}

/** A standee quad in its local frame (x right, y up), uv with v 0 on the top row. */
export function standeeMesh(q: StandeeQuad): MeshData {
  return {
    positions: [q.left, q.bottom, 0, q.right, q.bottom, 0, q.right, q.top, 0, q.left, q.top, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 1, 1, 1, 1, 0, 0, 0],
    indices: [0, 1, 2, 0, 2, 3],
  };
}

/** A flat quad on the ground covering a rect (placement tiles, selection marks). */
export function groundQuad(x: number, y: number, w: number, h: number, lift = 0.02): MeshData {
  const md = emptyMesh();
  addPolygon(
    md,
    [
      [x, lift, y + h],
      [x + w, lift, y + h],
      [x + w, lift, y],
      [x, lift, y],
    ],
    [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
    [0, 1, 0],
  );
  return md;
}
