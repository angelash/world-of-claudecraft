// Dynamic layer of the HD-2D scene (art_pipeline.md 2.4, 3.7 and 4.1): one standee per visible
// entity showing its current paper-doll frame, the pixel ground marks under it (contact
// shadow, selection or hover ring by relation, the thin outer threat ring of an enemy
// attacking the player; ground_marks.ts), the silhouette of the player and party members
// where cover hides them, the click-to-move marker and the building placement tiles. Every
// mark is drawn at every quality tier (fairness.ts). Frame textures are cached by frame key
// with a bounded LRU; standee quads are shared per frame size, mark textures per size and
// style. Frames come from approved art when the asset resolver has it, else from the
// procedural generator (src/client/assets/runtime.ts).

import * as THREE from 'three';
import { buildFrame, frameKey } from '../assets/runtime';
import { MOVE_PULSE_MS } from '../render/frame_signals';
import type { PlacementOverlay, SceneEntity } from '../render/scene';
import type { SpriteFrame } from '../sprites/generate';
import type { PixelMatrix } from '../sprites/pixels';
import { groundQuad, type MeshData, standeeMesh } from './geometry';
import {
  markPx,
  markSize,
  RING_COLORS,
  type RingStyle,
  ringMark,
  shadowMark,
  silhouetteColor,
} from './ground_marks';
import {
  pixelTexture,
  type SharedUniforms,
  silhouetteMaterial,
  standeeDepthMaterial,
  standeeMaterial,
} from './materials';
import { PIXEL_MAP_FRAGMENT } from './shaders';
import { standeeQuad } from './standee';

function toGeometry(md: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(md.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(md.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(md.uvs, 2));
  g.setIndex(md.indices);
  return g;
}

/** A ground-mark material: the mark's pixels sampled on their own grid, tinted, no depth write. */
function markMaterial(tex: THREE.Texture, color: number, opacity: number): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  mat.customProgramCacheKey = () => 'hk:mark';
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      PIXEL_MAP_FRAGMENT,
    );
  };
  return mat;
}

interface FrameEntry {
  frame: SpriteFrame;
  tex: THREE.DataTexture;
}

interface Mark {
  mat: THREE.MeshBasicMaterial;
  tex: THREE.DataTexture;
  /** metres */
  w: number;
  d: number;
}

interface EntityView {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  depth: THREE.ShaderMaterial;
  shadow: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  threat: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** only for the player and party members */
  silhouette: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null;
  key: string;
  /** the frame width and scale the ground marks were sized for, and the marks */
  markW: number;
  markScale: number;
  shadowMark: Mark | null;
  ringMark: Mark | null;
  ringStyle: RingStyle | null;
  threatMark: Mark | null;
}

export class EntityLayer {
  readonly group = new THREE.Group();
  private readonly frames = new Map<string, FrameEntry>();
  private readonly quads = new Map<string, THREE.BufferGeometry>();
  private readonly views = new Map<string, EntityView>();
  private readonly marks = new Map<string, Mark>();
  /** the material of a mark mesh before its first placement (never drawn) */
  private readonly blankMat = new THREE.MeshBasicMaterial({ visible: false });
  /** a 1 by 1 metre ground quad centred on the origin; marks scale it to their pixel size */
  private readonly markGeo = toGeometry(groundQuad(-0.5, -0.5, 1, 1, 0));
  private readonly target: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly targetTex: THREE.DataTexture;
  private placementKey = '';
  private placement: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly tileGeo = toGeometry(groundQuad(0, 0, 1, 1, 0.03));

  constructor(
    private readonly shared: SharedUniforms,
    private readonly frameLimit = 600,
  ) {
    const tp = markPx(0.44);
    this.targetTex = pixelTexture(ringMark(tp, tp, 'hover'), false);
    this.target = new THREE.Mesh(this.markGeo, markMaterial(this.targetTex, 0xf0e6c8, 1));
    this.target.renderOrder = 2;
    this.target.visible = false;
    this.group.add(this.target);
  }

  /** The sprite frame an entity currently shows (also used for labels and hit boxes). */
  frameOf(e: SceneEntity): SpriteFrame {
    return this.entry(e).frame;
  }

  private entry(e: SceneEntity): FrameEntry {
    const key = frameKey(e.look, e.anim.anim, e.anim.dir, e.anim.frame);
    const hit = this.frames.get(key);
    if (hit) {
      this.frames.delete(key);
      this.frames.set(key, hit);
      return hit;
    }
    const frame = buildFrame(e.look, e.anim.anim, e.anim.dir, e.anim.frame);
    const entry = { frame, tex: pixelTexture(frame.matrix) };
    this.frames.set(key, entry);
    if (this.frames.size > this.frameLimit) {
      // Evict the least recently used frames that no standee shows right now.
      const inUse = new Set([...this.views.values()].map((v) => v.key));
      inUse.add(key);
      for (const k of this.frames.keys()) {
        if (this.frames.size <= this.frameLimit) break;
        if (inUse.has(k)) continue;
        this.frames.get(k)?.tex.dispose();
        this.frames.delete(k);
      }
    }
    return entry;
  }

  private quad(f: SpriteFrame): THREE.BufferGeometry {
    const k = `${f.matrix.w}x${f.matrix.h}@${f.anchorX},${f.anchorY}`;
    let g = this.quads.get(k);
    if (!g) {
      g = toGeometry(standeeMesh(standeeQuad(f.matrix.w, f.matrix.h, f.anchorX, f.anchorY)));
      this.quads.set(k, g);
    }
    return g;
  }

  /** A cached mark texture and its material (one per style and pixel size). */
  private mark(style: RingStyle | 'shadow', wPx: number, hPx: number): Mark {
    const key = `${style}:${wPx}x${hPx}`;
    let m = this.marks.get(key);
    if (!m) {
      const pixels: PixelMatrix =
        style === 'shadow' ? shadowMark(wPx, hPx) : ringMark(wPx, hPx, style);
      const tex = pixelTexture(pixels, false);
      const color = style === 'shadow' ? 0x14101e : (RING_COLORS[style as RingStyle] ?? 0xffffff);
      const opacity = style === 'shadow' ? 0.32 : style === 'hover' ? 0.6 : 0.95;
      m = { tex, mat: markMaterial(tex, color, opacity), w: wPx / 16, d: hPx / 16 };
      this.marks.set(key, m);
    }
    return m;
  }

  private placeMark(
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>,
    m: Mark,
    x: number,
    y: number,
    lift: number,
  ): void {
    mesh.material = m.mat;
    mesh.position.set(x, lift, y);
    mesh.scale.set(m.w, 1, m.d);
  }

  update(
    items: readonly SceneEntity[],
    moveTarget: { x: number; y: number; ageMs: number } | null,
    placement: PlacementOverlay | null,
  ): void {
    const seen = new Set<string>();
    for (const e of items) {
      seen.add(e.id);
      const entry = this.entry(e);
      const key = frameKey(e.look, e.anim.anim, e.anim.dir, e.anim.frame);
      let v = this.views.get(e.id);
      if (!v) {
        const mat = standeeMaterial(this.shared, entry.tex);
        const depth = standeeDepthMaterial(this.shared, entry.tex);
        const mesh = new THREE.Mesh(this.quad(entry.frame), mat);
        mesh.customDepthMaterial = depth;
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        const shadow = new THREE.Mesh(this.markGeo, this.blankMat);
        shadow.renderOrder = 1;
        const ring = new THREE.Mesh(this.markGeo, this.blankMat);
        ring.renderOrder = 2;
        const threat = new THREE.Mesh(this.markGeo, this.blankMat);
        threat.renderOrder = 2;
        const sc = silhouetteColor(e);
        let silhouette: EntityView['silhouette'] = null;
        if (sc !== null) {
          silhouette = new THREE.Mesh(
            this.quad(entry.frame),
            silhouetteMaterial(this.shared, entry.tex, sc),
          );
          silhouette.frustumCulled = false;
          silhouette.renderOrder = 50;
          this.group.add(silhouette);
        }
        this.group.add(mesh, shadow, ring, threat);
        v = {
          mesh,
          depth,
          shadow,
          ring,
          threat,
          silhouette,
          key,
          markW: -1,
          markScale: -1,
          shadowMark: null,
          ringMark: null,
          ringStyle: null,
          threatMark: null,
        };
        this.views.set(e.id, v);
      }
      if (v.key !== key) {
        v.key = key;
        v.mesh.geometry = this.quad(entry.frame);
        (v.mesh.material.uniforms.map as { value: THREE.Texture }).value = entry.tex;
        (v.depth.uniforms.map as { value: THREE.Texture }).value = entry.tex;
        if (v.silhouette) {
          v.silhouette.geometry = v.mesh.geometry;
          (v.silhouette.material.uniforms.map as { value: THREE.Texture }).value = entry.tex;
        }
      }
      v.mesh.position.set(e.x, 0, e.y);
      v.silhouette?.position.set(e.x, 0, e.y);
      // Ground marks are true ellipses on the ground; the camera does the foreshortening.
      // They are sized once per frame width and scale, not every frame.
      const ringStyle: RingStyle | null = e.selected ? e.relation : e.hovered ? 'hover' : null;
      const fw = entry.frame.matrix.w;
      const resized = v.markW !== fw || v.markScale !== e.look.scale;
      if (resized || v.ringStyle !== ringStyle) {
        const size = markSize(fw, e.look.scale);
        if (resized) {
          v.shadowMark = this.mark('shadow', markPx(size.w), markPx(size.d));
          v.threatMark = this.mark('threat', markPx(size.w * 1.25 + 0.375), markPx(size.w + 0.375));
        }
        v.ringMark = ringStyle ? this.mark(ringStyle, markPx(size.w * 1.25), markPx(size.w)) : null;
        v.markW = fw;
        v.markScale = e.look.scale;
        v.ringStyle = ringStyle;
      }
      if (v.shadowMark) this.placeMark(v.shadow, v.shadowMark, e.x, e.y, 0.015);
      v.ring.visible = !!v.ringMark;
      if (v.ringMark) this.placeMark(v.ring, v.ringMark, e.x, e.y, 0.02);
      v.threat.visible = e.marks.threat && !!v.threatMark;
      if (v.threat.visible && v.threatMark) this.placeMark(v.threat, v.threatMark, e.x, e.y, 0.021);
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      this.group.remove(v.mesh, v.shadow, v.ring, v.threat);
      v.mesh.material.dispose();
      v.depth.dispose();
      if (v.silhouette) {
        this.group.remove(v.silhouette);
        v.silhouette.material.dispose();
      }
      this.views.delete(id);
    }

    if (moveTarget && moveTarget.ageMs < MOVE_PULSE_MS) {
      const k = 1 - moveTarget.ageMs / MOVE_PULSE_MS;
      this.target.visible = true;
      this.target.position.set(moveTarget.x, 0.025, moveTarget.y);
      const s = (1 + (1 - k) * 1.6) * (markPx(0.44) / 16);
      this.target.scale.set(s, 1, s);
      this.target.material.opacity = k;
    } else this.target.visible = false;

    this.updatePlacement(placement);
  }

  private updatePlacement(pl: PlacementOverlay | null): void {
    const key = pl ? JSON.stringify(pl) : '';
    if (key === this.placementKey) return;
    this.placementKey = key;
    for (const m of this.placement) {
      this.group.remove(m);
      m.material.dispose();
    }
    this.placement = [];
    if (!pl) return;
    const blocked = new Set(pl.blocked.map((t) => `${t.x},${t.y}`));
    const add = (x: number, y: number, color: number, opacity: number, size = 1) => {
      const m = new THREE.Mesh(
        this.tileGeo,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
      );
      m.position.set(x, 0.005, y);
      m.scale.set(size, 1, size);
      m.renderOrder = 3;
      this.group.add(m);
      this.placement.push(m);
    };
    for (const t of pl.tiles) {
      const bad = !pl.ok && (blocked.size === 0 || blocked.has(`${t.x},${t.y}`));
      add(t.x, t.y, pl.ok ? 0x60dc6e : bad ? 0xe6463c : 0xe6aa3c, pl.ok ? 0.42 : bad ? 0.55 : 0.32);
    }
    for (const t of pl.blocked) {
      if (pl.tiles.some((x) => x.x === t.x && x.y === t.y)) continue;
      add(t.x, t.y, 0xe6463c, 0.45);
    }
    if (pl.entrance) add(pl.entrance.x + 0.3, pl.entrance.y + 0.3, 0xf2c94c, 0.9, 0.4);
  }

  setShadows(on: boolean): void {
    for (const v of this.views.values()) v.mesh.castShadow = on;
  }

  dispose(): void {
    for (const v of this.views.values()) {
      v.mesh.material.dispose();
      v.depth.dispose();
      v.silhouette?.material.dispose();
    }
    this.views.clear();
    for (const f of this.frames.values()) f.tex.dispose();
    this.frames.clear();
    for (const q of this.quads.values()) q.dispose();
    this.quads.clear();
    for (const m of this.marks.values()) {
      m.tex.dispose();
      m.mat.dispose();
    }
    this.marks.clear();
    this.markGeo.dispose();
    this.blankMat.dispose();
    this.target.material.dispose();
    this.targetTex.dispose();
    this.tileGeo.dispose();
    for (const m of this.placement) m.material.dispose();
    this.group.clear();
  }
}
