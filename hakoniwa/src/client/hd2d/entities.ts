// Dynamic layer of the HD-2D scene (art_pipeline.md 2.4 and 3.7): one standee per visible
// entity showing its current paper-doll frame, a pixel contact shadow under it, the
// selection and hover rings, the click-to-move marker and the building placement tiles.
// Frame textures are cached by frame key with a bounded LRU; standee quads are shared
// per frame size. Frames come from approved art when the asset resolver has it, else from the
// procedural generator (src/client/assets/runtime.ts).

import * as THREE from 'three';
import { buildFrame, frameKey } from '../assets/runtime';
import { MOVE_PULSE_MS } from '../render/frame_signals';
import type { PlacementOverlay, SceneEntity } from '../render/scene';
import type { SpriteFrame } from '../sprites/generate';
import { groundQuad, type MeshData, standeeMesh } from './geometry';
import {
  pixelTexture,
  type SharedUniforms,
  standeeDepthMaterial,
  standeeMaterial,
} from './materials';
import { standeeQuad } from './standee';

const RING_COLORS: Record<string, number> = {
  self: 0xf0e6c8,
  hostile: 0xe0503c,
  friendly: 0x6cd06a,
  neutral: 0xe8c84a,
};

function toGeometry(md: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(md.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(md.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(md.uvs, 2));
  g.setIndex(md.indices);
  return g;
}

interface FrameEntry {
  frame: SpriteFrame;
  tex: THREE.DataTexture;
}

interface EntityView {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  depth: THREE.ShaderMaterial;
  shadow: THREE.Mesh;
  ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  key: string;
}

export class EntityLayer {
  readonly group = new THREE.Group();
  private readonly frames = new Map<string, FrameEntry>();
  private readonly quads = new Map<string, THREE.BufferGeometry>();
  private readonly views = new Map<string, EntityView>();
  private readonly shadowGeo = new THREE.CircleGeometry(0.5, 12);
  private readonly shadowMat = new THREE.MeshBasicMaterial({
    color: 0x14101e,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  private readonly ringGeo = new THREE.RingGeometry(0.48, 0.56, 28);
  private readonly target: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private placementKey = '';
  private placement: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly tileGeo = toGeometry(groundQuad(0, 0, 1, 1, 0.03));

  constructor(
    private readonly shared: SharedUniforms,
    private readonly frameLimit = 600,
  ) {
    this.shadowGeo.rotateX(-Math.PI / 2);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.target = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.22, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf0e6c8, transparent: true, depthWrite: false }),
    );
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
        const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
        shadow.renderOrder = 1;
        const ring = new THREE.Mesh(
          this.ringGeo,
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }),
        );
        ring.renderOrder = 2;
        this.group.add(mesh, shadow, ring);
        v = { mesh, depth, shadow, ring, key };
        this.views.set(e.id, v);
      }
      if (v.key !== key) {
        v.key = key;
        v.mesh.geometry = this.quad(entry.frame);
        (v.mesh.material.uniforms.map as { value: THREE.Texture }).value = entry.tex;
        (v.depth.uniforms.map as { value: THREE.Texture }).value = entry.tex;
      }
      v.mesh.position.set(e.x, 0, e.y);
      const sw = Math.max(0.5, (entry.frame.matrix.w / 48) * 0.75) * e.look.scale;
      // Ground marks are true ellipses on the ground; the camera does the foreshortening.
      v.shadow.position.set(e.x, 0.015, e.y);
      v.shadow.scale.set(sw, 1, sw * 0.7);
      v.ring.visible = e.selected || e.hovered;
      if (v.ring.visible) {
        v.ring.position.set(e.x, 0.02, e.y);
        v.ring.scale.set(sw * 1.25, 1, sw * 1.0);
        v.ring.material.color.setHex(e.selected ? (RING_COLORS[e.relation] ?? 0xffffff) : 0xffffff);
        v.ring.material.opacity = e.selected ? 0.95 : 0.55;
      }
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      this.group.remove(v.mesh, v.shadow, v.ring);
      v.mesh.material.dispose();
      v.depth.dispose();
      v.ring.material.dispose();
      this.views.delete(id);
    }

    if (moveTarget && moveTarget.ageMs < MOVE_PULSE_MS) {
      const k = 1 - moveTarget.ageMs / MOVE_PULSE_MS;
      this.target.visible = true;
      this.target.position.set(moveTarget.x, 0.025, moveTarget.y);
      const s = 1 + (1 - k) * 1.6;
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
      v.ring.material.dispose();
    }
    this.views.clear();
    for (const f of this.frames.values()) f.tex.dispose();
    this.frames.clear();
    for (const q of this.quads.values()) q.dispose();
    this.quads.clear();
    this.shadowGeo.dispose();
    this.shadowMat.dispose();
    this.ringGeo.dispose();
    this.tileGeo.dispose();
    this.target.geometry.dispose();
    this.target.material.dispose();
    for (const m of this.placement) m.material.dispose();
    this.group.clear();
  }
}
