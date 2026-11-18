// Static HD-2D scene of one map (art_pipeline.md 2.2, 2.5 and 2.6): the baked ground
// plane with animated water, every building shell with its roof, gables, chimney and door
// leaves (one dissolve state per building), the free-standing walls, and the instanced
// standees (trees, rocks, decor, shop signs). Built once per map from the MapContext, and
// again from the live map when a switch tile opens or closes; on a map with switches every
// surface takes part in the switch dissolve (switch_fade.ts) through the scene's role.
// Disposed as a whole on map change.

import * as THREE from 'three';
import type { DecorKind, SignKind } from '../../systems/world/look';
import { TILE_PX } from '../render/camera';
import { decorSprite, shopSignSprite } from '../render/decor_art';
import type { MapContext } from '../render/map_context';
import { propSprite } from '../render/tile_art';
import { createMatrix, getPixel, type PixelMatrix, setPixel } from '../sprites/pixels';
import { boxMesh, groundQuad, type MeshData, roofMesh, standeeMesh, wallMesh } from './geometry';
import { paintGround, waterMask } from './ground';
import { CUTAWAY_FAR, CUTAWAY_NEAR, DOOR_HEIGHT, type StandeePlacement } from './layout';
import {
  createDissolve,
  type DissolveUniforms,
  litMaterial,
  pixelTexture,
  type SharedUniforms,
  type SwitchRole,
  standeeDepthMaterial,
  standeeMaterial,
} from './materials';
import { standeeQuad } from './standee';
import { materialColors, propColorsOf } from './style_packs';
import { paintDoor, paintRoof, paintWallAtlas } from './textures';

export interface BuildingMeshes {
  locationId: string;
  dissolve: DissolveUniforms;
  /** wall materials whose emissive windows light up at night */
  walls: THREE.MeshLambertMaterial;
  /** roof material: at night it keeps a faint glow of its own colour */
  roof: THREE.MeshLambertMaterial;
  /** the building's shadow casters; an opened building stops casting (its shell is cut) */
  casters: THREE.Mesh[];
  /** meshes a ground click can hit (walls, roof, gables) */
  pickable: THREE.Mesh[];
  /** id used to stagger window lighting */
  lampId: string;
}

export interface StaticScene {
  group: THREE.Group;
  buildings: BuildingMeshes[];
  /** meshes outside any building that cast sun shadows (toggled with the quality tier) */
  casters: THREE.Object3D[];
  /** the scene's part in a switch dissolve; null on maps without switches */
  role: SwitchRole | null;
  dispose(): void;
}

function toGeometry(md: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(md.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(md.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(md.uvs, 2));
  g.setIndex(md.indices);
  return g;
}

/** A 16x16 crop of a wall atlas's plain cell, for repeating textures (gables, chimneys). */
function plainTile(atlas: PixelMatrix): PixelMatrix {
  const m = createMatrix(TILE_PX, TILE_PX);
  const y0 = Math.max(0, Math.floor((atlas.h - TILE_PX) / 2));
  for (let y = 0; y < TILE_PX; y++)
    for (let x = 0; x < TILE_PX; x++) {
      const yy = Math.min(atlas.h - 1, y0 + y);
      setPixel(m, x, y, getPixel(atlas, x, yy));
    }
  return m;
}

export function buildStaticScene(
  ctx: MapContext,
  shared: SharedUniforms,
  waterHi: THREE.Color,
): StaticScene {
  const { map, pack, layout } = ctx;
  const role: SwitchRole | null = map.switches?.length ? { uSwMode: { value: 0 } } : null;
  const switchRole = role ?? undefined;
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const casters: THREE.Object3D[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  // Ground.
  const groundTex = track(pixelTexture(paintGround(map, pack)));
  const maskData = waterMask(map);
  const mask = track(new THREE.DataTexture(maskData, map.width, map.height, THREE.RGBAFormat));
  mask.magFilter = THREE.NearestFilter;
  mask.minFilter = THREE.NearestFilter;
  mask.needsUpdate = true;
  const groundMat = track(
    litMaterial(shared, { map: groundTex, water: { mask, hi: waterHi }, switchRole }),
  );
  const groundGeo = track(toGeometry(groundQuad(0, 0, map.width, map.height, 0)));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  group.add(ground);

  // Buildings.
  const buildings: BuildingMeshes[] = [];
  for (const b of layout.buildings) {
    const H = b.look.wallHeight;
    const col = materialColors(pack, b.look.wall);
    const seed = b.locationId.length * 31 + b.rect.x * 7 + b.rect.y;
    const atlas = paintWallAtlas(b.look.wall, col, H, pack.windowGlow, seed);
    const colorTex = track(pixelTexture(atlas.color));
    const emisTex = track(pixelTexture(atlas.emissive));
    const dissolve = createDissolve(
      b.rect.x + b.rect.w / 2,
      b.rect.y + b.rect.h / 2,
      b.rect.w / 2,
      b.rect.h / 2,
      CUTAWAY_FAR,
      CUTAWAY_NEAR,
    );
    const wallMat = track(
      litMaterial(shared, {
        map: colorTex,
        emissiveMap: emisTex,
        dissolve,
        alphaTest: 0.5,
        switchRole,
      }),
    );
    const caps = [...b.walls, ...b.doors.map((d) => ({ x: d.x, y: d.y }))];
    const walls = new THREE.Mesh(
      track(toGeometry(wallMesh(b.faces, caps, H, atlas.heightPx))),
      wallMat,
    );
    walls.castShadow = true;
    walls.receiveShadow = true;
    const own: THREE.Mesh[] = [walls];
    const pickable: THREE.Mesh[] = [walls];
    group.add(walls);

    const rm = roofMesh(b.rect, H, b.look.roof, b.ridge);
    const roofTex = track(
      pixelTexture(paintRoof(b.look.roofing, b.look.roofColors, rm.wPx, rm.lPx, seed)),
    );
    const roofMat = track(
      litMaterial(shared, { map: roofTex, emissiveMap: roofTex, dissolve, roof: true, switchRole }),
    );
    roofMat.side = THREE.DoubleSide;
    const roof = new THREE.Mesh(track(toGeometry(rm.slopes)), roofMat);
    roof.castShadow = true;
    roof.receiveShadow = true;
    own.push(roof);
    pickable.push(roof);
    group.add(roof);

    const tileTex = track(pixelTexture(plainTile(atlas.color)));
    tileTex.wrapS = THREE.RepeatWrapping;
    tileTex.wrapT = THREE.RepeatWrapping;
    if (rm.gables.positions.length) {
      const gableMat = track(
        litMaterial(shared, { map: tileTex, dissolve, roof: true, switchRole }),
      );
      const gables = new THREE.Mesh(track(toGeometry(rm.gables)), gableMat);
      gables.castShadow = true;
      gables.receiveShadow = true;
      own.push(gables);
      pickable.push(gables);
      group.add(gables);
    }
    if (b.look.chimney) {
      const brick = materialColors(pack, 'brick');
      const chimTex = track(
        pixelTexture(plainTile(paintWallAtlas('brick', brick, 1, 0, seed).color)),
      );
      chimTex.wrapS = THREE.RepeatWrapping;
      chimTex.wrapT = THREE.RepeatWrapping;
      const chimMat = track(
        litMaterial(shared, { map: chimTex, dissolve, roof: true, switchRole }),
      );
      const top = rm.ridgeY + 0.6;
      const [cx, , cz] = rm.chimneyAt;
      const box = track(toGeometry(boxMesh(cx - 0.3, cx + 0.3, H - 0.2, top, cz - 0.3, cz + 0.3)));
      const chim = new THREE.Mesh(box, chimMat);
      chim.castShadow = true;
      own.push(chim);
      group.add(chim);
    }
    const doorTex = track(pixelTexture(paintDoor(b.look.doorColor)));
    const doorMat = track(litMaterial(shared, { map: doorTex, dissolve, roof: true, switchRole }));
    for (const d of b.doors) {
      if (d.interior) continue;
      const inset = 0.06;
      const md =
        d.outward === 's' || d.outward === 'n'
          ? doorQuad(
              d.x,
              d.outward === 's' ? d.y + 1 - inset : d.y + inset,
              'z',
              d.outward === 's' ? 1 : -1,
            )
          : doorQuad(
              d.outward === 'e' ? d.x + 1 - inset : d.x + inset,
              d.y,
              'x',
              d.outward === 'e' ? 1 : -1,
            );
      const leaf = new THREE.Mesh(track(toGeometry(md)), doorMat);
      leaf.receiveShadow = true;
      group.add(leaf);
    }
    buildings.push({
      locationId: b.locationId,
      dissolve,
      walls: wallMat,
      roof: roofMat,
      casters: own,
      pickable,
      lampId: `${map.id}:win:${b.locationId}`,
    });
  }

  // Free-standing walls.
  if (layout.free.tiles.length) {
    const H = layout.free.height;
    const atlas = paintWallAtlas(
      layout.free.material,
      materialColors(pack, layout.free.material),
      H,
      0,
      3,
    );
    const tex = track(pixelTexture(atlas.color));
    const mat = track(litMaterial(shared, { map: tex, alphaTest: 0.5, switchRole }));
    const mesh = new THREE.Mesh(
      track(toGeometry(wallMesh(layout.free.faces, layout.free.tiles, H, atlas.heightPx))),
      mat,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    casters.push(mesh);
    group.add(mesh);
  }

  // Standees, instanced per sprite.
  const bySprite = new Map<string, StandeePlacement[]>();
  for (const p of layout.standees) {
    const key = `${p.source}:${p.kind}:${p.variant % 3}`;
    const list = bySprite.get(key);
    if (list) list.push(p);
    else bySprite.set(key, [p]);
  }
  const colors = propColorsOf(pack);
  const instanced: THREE.InstancedMesh[] = [];
  for (const list of bySprite.values()) {
    const p0 = list[0] as StandeePlacement;
    const sprite =
      p0.source === 'tree' || p0.source === 'rock'
        ? propSprite(p0.source, p0.variant, colors)
        : p0.source === 'sign'
          ? shopSignSprite(p0.kind as SignKind)
          : decorSprite(p0.kind as DecorKind, p0.variant);
    if (!sprite) continue;
    const tex = track(pixelTexture(sprite.matrix));
    const quad = standeeQuad(sprite.matrix.w, sprite.matrix.h, sprite.anchorX, sprite.anchorY);
    const geo = track(toGeometry(standeeMesh(quad)));
    const mat = track(standeeMaterial(shared, tex, switchRole));
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    inst.customDepthMaterial = track(standeeDepthMaterial(shared, tex));
    const m4 = new THREE.Matrix4();
    list.forEach((p, i) => {
      m4.makeTranslation(p.x, p.lift ?? 0, p.y);
      inst.setMatrixAt(i, m4);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    inst.castShadow = true;
    casters.push(inst);
    instanced.push(inst);
    group.add(inst);
  }

  return {
    group,
    buildings,
    casters,
    role,
    dispose() {
      for (const d of disposables) d.dispose();
      for (const i of instanced) i.dispose();
      group.clear();
    },
  };
}

/** A door leaf quad on a tile edge; `axis` is the axis the door plane is normal to. */
function doorQuad(a: number, b: number, axis: 'x' | 'z', dir: 1 | -1): MeshData {
  const md: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  const h = DOOR_HEIGHT;
  const pts: [number, number, number][] =
    axis === 'z'
      ? [
          [a, 0, b],
          [a + 1, 0, b],
          [a + 1, h, b],
          [a, h, b],
        ]
      : [
          [a, 0, b],
          [a, 0, b + 1],
          [a, h, b + 1],
          [a, h, b],
        ];
  const n: [number, number, number] = axis === 'z' ? [0, 0, dir] : [dir, 0, 0];
  for (const p of pts) {
    md.positions.push(...p);
    md.normals.push(...n);
  }
  md.uvs.push(0, 1, 1, 1, 1, 0, 0, 0);
  md.indices.push(0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2);
  return md;
}
