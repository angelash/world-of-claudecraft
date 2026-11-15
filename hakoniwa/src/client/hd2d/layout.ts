// The HD-2D scene layout of a map (art_pipeline.md 2.6 and 5.1): which wall tiles become
// which building shell, the exposed wall faces with their window and door cells, roof
// spans, free-standing walls (town walls, ruins, indoor cutaways), standees (trees,
// rocks, decor, shop signs) and the static lights. Derived once per map from the spatial
// layer (rows and legend) plus the look layer (style pack, per-location looks, decor);
// nothing here feeds back into the kernel. Pure; Node-tested.

import { tileAt } from '../../systems/world/grid';
import { type DecorKind, LIGHT_DECOR, type WallMaterial } from '../../systems/world/look';
import type { MapDef, Rect, TileKind } from '../../systems/world/types';
import { hasRoof } from '../render/roofs';
import { hash3, hashString } from '../sprites/pixels';
import { type ResolvedLook, resolveLook, type StylePack } from './style_packs';

/** Metres: door openings are this high; walls above a door tile form a lintel. */
export const DOOR_HEIGHT = 2.1;
/** Metres the roof reaches past the shell on every side. */
export const ROOF_OVERHANG = 0.3;
/** Opened buildings drop their shell to a cutaway: far sides and the camera side. */
export const CUTAWAY_FAR = 1.3;
export const CUTAWAY_NEAR = 0.5;

export type Side = 'n' | 's' | 'e' | 'w';
/** Wall atlas cells (textures.ts paints one column per cell). */
export type FaceCell = 'plain' | 'plain2' | 'pane' | 'inner';

export interface WallFace {
  x: number;
  y: number;
  side: Side;
  cell: FaceCell;
  /** the face belongs to a door lintel (only drawn above DOOR_HEIGHT) */
  lintel: boolean;
}

export interface BuildingShell {
  locationId: string;
  name: string;
  /** shell rect in tiles: the location rect grown by its wall ring */
  rect: Rect;
  look: ResolvedLook;
  walls: { x: number; y: number }[];
  /** front doors sit on the wall ring; interior doors (inside the location) get no lamp or sign */
  doors: { x: number; y: number; outward: Side; interior: boolean }[];
  faces: WallFace[];
  /** ridge runs along x (east to west) or along z (north to south) */
  ridge: 'x' | 'z';
}

export interface FreeWalls {
  material: WallMaterial;
  height: number;
  tiles: { x: number; y: number }[];
  faces: WallFace[];
}

export interface StandeePlacement {
  /** stable id for instancing and hashing */
  id: string;
  source: 'tree' | 'rock' | 'decor' | 'sign';
  /** tree/rock variant, decor kind, or sign kind */
  kind: string;
  variant: number;
  /** foot position in tiles */
  x: number;
  y: number;
  /** metres above the ground (hanging signs) */
  lift?: number;
}

export interface StaticLight {
  id: string;
  x: number;
  y: number;
  /** metres above the ground (the lightmap ignores height; standees use it for glow) */
  h: number;
  radius: number;
  color: number;
  intensity: number;
  /** lit only at night (lamps, windows) or always (braziers, hearths) */
  night: boolean;
}

export interface SceneLayout {
  buildings: BuildingShell[];
  free: FreeWalls;
  standees: StandeePlacement[];
  lights: StaticLight[];
}

const SIDES: readonly [Side, number, number][] = [
  ['n', 0, -1],
  ['s', 0, 1],
  ['w', -1, 0],
  ['e', 1, 0],
];

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function isWall(k: TileKind): boolean {
  return k === 'wall';
}

/** Shell rect of a roofed location: the location grown by one tile, clipped to the map. */
export function shellRect(map: MapDef, loc: Rect): Rect {
  const x = Math.max(0, loc.x - 1);
  const y = Math.max(0, loc.y - 1);
  const x1 = Math.min(map.width, loc.x + loc.w + 1);
  const y1 = Math.min(map.height, loc.y + loc.h + 1);
  return { x, y, w: x1 - x, h: y1 - y };
}

function faceCell(
  shell: Rect,
  inner: Rect,
  x: number,
  y: number,
  side: Side,
  doorNear: (x: number, y: number) => boolean,
): FaceCell {
  const [, dx, dy] = SIDES.find((s) => s[0] === side) as [Side, number, number];
  if (inRect(inner, x + dx, y + dy)) return 'inner';
  const along = side === 'n' || side === 's' ? x - shell.x : y - shell.y;
  const span = side === 'n' || side === 's' ? shell.w : shell.h;
  const corner = along === 0 || along === span - 1;
  if (!corner && along % 3 === 1 && !doorNear(x, y)) return 'pane';
  return hash3(x, y, 17) % 5 === 0 ? 'plain2' : 'plain';
}

export function buildLayout(map: MapDef, pack: StylePack): SceneLayout {
  const buildings: BuildingShell[] = [];
  const claimed = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;
  const kind = (x: number, y: number) => tileAt(map, x, y);
  const doorNear = (x: number, y: number) => {
    for (const [, dx, dy] of SIDES) if (kind(x + dx, y + dy) === 'door') return true;
    return false;
  };

  if (!map.indoor) {
    for (const loc of map.locations) {
      if (!hasRoof(loc, map)) continue;
      const rect = shellRect(map, loc);
      const look = resolveLook(pack, loc, map.looks?.[loc.id]);
      const walls: BuildingShell['walls'] = [];
      const doors: BuildingShell['doors'] = [];
      const faces: WallFace[] = [];
      for (let y = rect.y; y < rect.y + rect.h; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          const k = kind(x, y);
          // Faces between two tiles of this shell are hidden; faces toward anything else
          // (open ground, another building, a town wall of another height) are built.
          const sameShell = (nx: number, ny: number) => {
            const nk = kind(nx, ny);
            return (isWall(nk) || nk === 'door') && inRect(rect, nx, ny);
          };
          if (k === 'door') {
            const interior = inRect(loc, x, y);
            let outward: Side = 's';
            for (const [side, dx, dy] of SIDES)
              if (!inRect(loc, x + dx, y + dy) && !isWall(kind(x + dx, y + dy))) outward = side;
            doors.push({ x, y, outward, interior });
            claimed.add(key(x, y));
            for (const [side, dx, dy] of SIDES) {
              if (sameShell(x + dx, y + dy)) continue;
              faces.push({
                x,
                y,
                side,
                cell: inRect(loc, x + dx, y + dy) ? 'inner' : 'plain',
                lintel: true,
              });
            }
            continue;
          }
          if (!isWall(k)) continue;
          walls.push({ x, y });
          claimed.add(key(x, y));
          for (const [side, dx, dy] of SIDES) {
            if (isWall(kind(x + dx, y + dy)) && inRect(rect, x + dx, y + dy)) continue;
            faces.push({
              x,
              y,
              side,
              cell: faceCell(rect, loc, x, y, side, doorNear),
              lintel: false,
            });
          }
        }
      }
      buildings.push({
        locationId: loc.id,
        name: loc.name,
        rect,
        look,
        walls,
        doors,
        faces,
        ridge: rect.w >= rect.h ? 'x' : 'z',
      });
    }
  }

  const free: FreeWalls = {
    material: pack.freeWall,
    height: map.indoor ? pack.indoorWallHeight : pack.freeWallHeight,
    tiles: [],
    faces: [],
  };
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isWall(kind(x, y)) || claimed.has(key(x, y))) continue;
      free.tiles.push({ x, y });
      for (const [side, dx, dy] of SIDES) {
        const nx = x + dx;
        const ny = y + dy;
        const inside = nx >= 0 && ny >= 0 && nx < map.width && ny < map.height;
        // Next to another free wall the face is hidden; next to a building's wall it is
        // built, because the two walls have different heights.
        if (inside && isWall(kind(nx, ny)) && !claimed.has(key(nx, ny))) continue;
        free.faces.push({
          x,
          y,
          side,
          cell: hash3(x, y, 29) % 4 === 0 ? 'plain2' : 'plain',
          lintel: false,
        });
      }
    }
  }

  const standees: StandeePlacement[] = [];
  const salt = hashString(map.id);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const k = kind(x, y);
      if (k !== 'tree' && k !== 'rock') continue;
      const v = hash3(x, y, salt + 7) % 3;
      // Trees stand a little off the tile centre so a forest edge does not read as a grid.
      const jx = k === 'tree' ? ((hash3(x, y, salt + 3) % 5) - 2) * 0.06 : 0;
      const jy = k === 'tree' ? ((hash3(x, y, salt + 5) % 5) - 2) * 0.05 : 0;
      standees.push({
        id: `${k}:${x}:${y}`,
        source: k,
        kind: k,
        variant: v,
        x: x + 0.5 + jx,
        y: y + 0.85 + jy,
      });
    }
  }
  (map.decor ?? []).forEach((d, i) => {
    standees.push({
      id: `decor:${i}`,
      source: 'decor',
      kind: d.kind,
      variant: d.variant ?? i,
      x: d.x,
      y: d.y,
    });
  });
  for (const b of buildings) {
    if (b.look.sign === 'none') continue;
    const door = b.doors.find((d) => !d.interior);
    if (!door) continue;
    const [, dx, dy] = SIDES.find((s) => s[0] === door.outward) as [Side, number, number];
    standees.push({
      id: `sign:${b.locationId}`,
      source: 'sign',
      kind: b.look.sign,
      variant: 0,
      lift: 1.9,
      x: door.x + 0.5 + dx * 0.55 + (dy !== 0 ? 0.75 : 0),
      y: door.y + 0.5 + dy * 0.55 + (dx !== 0 ? 0.75 : 0),
    });
  }

  const lights: StaticLight[] = [];
  if (!map.indoor) {
    for (const b of buildings) {
      for (const d of b.doors) {
        if (d.interior) continue;
        const [, dx, dy] = SIDES.find((s) => s[0] === d.outward) as [Side, number, number];
        lights.push({
          id: `${map.id}:door:${d.x}:${d.y}`,
          x: d.x + 0.5 + dx * 0.7,
          y: d.y + 0.5 + dy * 0.7,
          h: 2.2,
          radius: 3.2,
          color: pack.windowGlow,
          intensity: 0.9,
          night: true,
        });
      }
    }
  }
  (map.decor ?? []).forEach((d, i) => {
    if (!LIGHT_DECOR.has(d.kind as DecorKind)) return;
    lights.push({
      id: `${map.id}:decor:${i}`,
      x: d.x,
      y: d.y,
      h: d.kind === 'lamp' ? 2.4 : 0.9,
      radius: d.kind === 'lamp' ? 4.2 : 3.4,
      color: d.kind === 'lamp' ? 0xffc878 : 0xff9a48,
      intensity: 1,
      night: d.kind === 'lamp',
    });
  });

  return { buildings, free, standees, lights };
}

/**
 * Which roofs the camera should open: the building the player stands in, the selected
 * building, and buildings explicitly opened (placement mode opens every roof).
 */
export function buildingAt(layout: SceneLayout, x: number, y: number): BuildingShell | null {
  for (const b of layout.buildings) if (inRect(b.rect, x, y)) return b;
  return null;
}
