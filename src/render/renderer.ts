import * as THREE from 'three';
import { Entity, SimEvent } from '../sim/types';
import type { IWorld } from '../world_api';
import { terrainHeight, groundHeight, generateDecorations, roadDistance, WATER_LEVEL } from '../sim/world';
import {
  WORLD_SIZE, MOBS, ABILITIES, DUNGEON_X_THRESHOLD, DUNGEON_LIST,
  instanceOrigin, INSTANCE_SLOT_COUNT, ZONES, ZoneDef,
  WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_Z,
} from '../sim/data';
import type { BiomeId } from '../sim/types';
import { buildBear, buildRigFor, buildSheep, Rig } from './models';
import { buildProps } from './props';
import {
  barkTexture, cloudTexture, foliageTexture, grassTuftTexture, groundDetailTexture,
  skyTexture, sparkleTexture, waterNormalish,
} from './textures';
import { Vfx } from './vfx';

const NAMEPLATE_RANGE = 55;
// "max graphics" defaults; ?lowgfx keeps weak machines playable
const LOW_GFX_FLAG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('lowgfx');

// Software GL (SwiftShader/llvmpipe — headless test runners, VMs) can't take
// the full pipeline; drop to the lowgfx path automatically.
function isSoftwareGL(webgl: THREE.WebGLRenderer): boolean {
  try {
    const gl = webgl.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|software/i.test(name);
  } catch {
    return false;
  }
}

interface EntityView {
  group: THREE.Group;
  rig: Rig;
  sheepRig: Rig | null; // polymorph form, built lazily
  bearRig: Rig | null; // druid bear form, built lazily
  walkPhase: number;
  attackAnim: number;
  nameplate: HTMLDivElement;
  nameEl: HTMLDivElement;
  hpBar: HTMLDivElement;
  hpFill: HTMLDivElement;
  markerEl: HTMLDivElement;
  sparkle?: THREE.Sprite; // ground objects
  objectMesh?: THREE.Object3D;
  portal?: THREE.Mesh; // dungeon door swirl
}

export class Renderer {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  webgl: THREE.WebGLRenderer;
  views = new Map<number, EntityView>();
  nameplateLayer: HTMLDivElement;
  selectionRing: THREE.Mesh;
  raycaster = new THREE.Raycaster();
  clickTargets: THREE.Object3D[] = [];
  camYaw = Math.PI;
  camPitch = 0.32;
  camDist = 12;
  showNameplates = true;
  private tmpV = new THREE.Vector3();
  private sun: THREE.DirectionalLight;
  private sky!: THREE.Mesh;
  private sunSprites: THREE.Sprite[] = [];
  private sunDir = new THREE.Vector3();
  private clouds: THREE.Sprite[] = [];
  private water: THREE.Mesh;
  private waterTex: THREE.Texture;
  private flames: THREE.Mesh[];
  private fireLights: THREE.PointLight[];
  private time = 0;
  vfx: Vfx;

  private lowGfx: boolean;

  constructor(private sim: IWorld, canvas: HTMLCanvasElement, nameplateLayer: HTMLDivElement) {
    this.nameplateLayer = nameplateLayer;
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: !LOW_GFX_FLAG, powerPreference: 'high-performance' });
    this.lowGfx = LOW_GFX_FLAG || isSoftwareGL(this.webgl);
    const LOW_GFX = this.lowGfx;
    this.webgl.setPixelRatio(LOW_GFX ? 1 : Math.min(window.devicePixelRatio, 2.5));
    this.webgl.setSize(window.innerWidth, window.innerHeight);
    this.webgl.shadowMap.enabled = !LOW_GFX;
    this.webgl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.webgl.toneMapping = THREE.ACESFilmicToneMapping;
    this.webgl.toneMappingExposure = 1.12;
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 950);

    this.scene.fog = new THREE.Fog(0xa6c6e0, 130, 470);

    // sky dome — follows the camera so the world strip never outruns it
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(560, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x46603a, 1.0);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0cd, 2.2);
    sun.position.set(90, 140, 50);
    sun.castShadow = !LOW_GFX;
    sun.shadow.mapSize.set(LOW_GFX ? 1024 : 4096, LOW_GFX ? 1024 : 4096);
    sun.shadow.camera.near = 30;
    sun.shadow.camera.far = 480;
    const S = 75;
    sun.shadow.camera.left = -S;
    sun.shadow.camera.right = S;
    sun.shadow.camera.top = S;
    sun.shadow.camera.bottom = -S;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
    this.sunDir.copy(sun.position).normalize();

    // visible sun disc + bloom halo
    const sunCanvas = (core: boolean): THREE.CanvasTexture => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
      if (core) {
        g.addColorStop(0, 'rgba(255,252,238,1)');
        g.addColorStop(0.35, 'rgba(255,238,180,0.95)');
        g.addColorStop(1, 'rgba(255,220,140,0)');
      } else {
        g.addColorStop(0, 'rgba(255,236,180,0.55)');
        g.addColorStop(1, 'rgba(255,220,150,0)');
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    };
    for (const [tex, scale] of [[sunCanvas(true), 60], [sunCanvas(false), 190]] as const) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, fog: false, depthWrite: false, depthTest: false,
        blending: THREE.AdditiveBlending,
      }));
      sp.scale.set(scale, scale, 1);
      sp.renderOrder = -9;
      this.sunSprites.push(sp);
      this.scene.add(sp);
    }

    // clouds, spread over the whole zone strip
    const cloudTex = cloudTexture();
    const cloudSpan = (WORLD_MAX_Z - WORLD_MIN_Z) + 240;
    for (let i = 0; i < (LOW_GFX ? 14 : 30); i++) {
      const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, fog: false, depthWrite: false });
      const cl = new THREE.Sprite(mat);
      const sc = 60 + Math.random() * 90;
      cl.scale.set(sc, sc * 0.45, 1);
      cl.position.set(
        (Math.random() - 0.5) * 600,
        95 + Math.random() * 55,
        WORLD_MIN_Z - 120 + Math.random() * cloudSpan,
      );
      this.clouds.push(cl);
      this.scene.add(cl);
    }

    this.buildTerrain();
    // water
    this.waterTex = waterNormalish();
    this.waterTex.repeat.set(30, 30);
    const waterMat = new THREE.MeshPhongMaterial({
      color: 0x2a6a96, transparent: true, opacity: 0.8, shininess: 140,
      specular: 0xd8ecff, map: this.waterTex,
    });
    const worldDepth = WORLD_MAX_Z - WORLD_MIN_Z;
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, worldDepth).rotateX(-Math.PI / 2), waterMat);
    this.water.position.set(0, WATER_LEVEL, (WORLD_MIN_Z + WORLD_MAX_Z) / 2);
    this.scene.add(this.water);

    this.buildDecorations();
    this.buildGrass();
    const props = buildProps(this.sim.cfg.seed);
    this.scene.add(props.group);
    this.flames = props.flames;
    this.fireLights = props.fireLights;

    // selection ring
    const ringGeo = new THREE.RingGeometry(0.9, 1.15, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.selectionRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);

    // particle system: projectiles, impacts, heal glows, ambience
    this.vfx = new Vfx(this.scene, (id, frac) => {
      const v = this.views.get(id);
      if (!v) return null;
      const e = this.sim.entities.get(id);
      const h = v.rig.height * (e?.scale ?? 1) * frac;
      return new THREE.Vector3(v.group.position.x, v.group.position.y + h, v.group.position.z);
    });
    this.vfx.setViewportScale(this.webgl.domElement.clientHeight * this.webgl.getPixelRatio(), 60);

    for (const e of sim.entities.values()) this.createView(e);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.webgl.setSize(window.innerWidth, window.innerHeight);
      this.vfx.setViewportScale(this.webgl.domElement.clientHeight * this.webgl.getPixelRatio(), 60);
    });
  }

  // Visual reactions to sim events (called by the HUD for every event,
  // including those between other players and mobs).
  handleEvent(ev: SimEvent): void {
    switch (ev.type) {
      case 'spellfx':
        if (ev.fx === 'projectile') this.vfx.projectile(ev.sourceId, ev.targetId, ev.school);
        else if (ev.fx === 'tick') this.vfx.tick(ev.targetId, ev.school);
        else this.vfx.nova(ev.targetId, ev.school);
        break;
      case 'damage':
        // every melee/ranged swing animates the attacker for all to see
        if (ev.school === 'physical' && ev.sourceId !== -1) this.triggerAttack(ev.sourceId);
        if (ev.kind === 'hit' && ev.amount > 0 && ev.school === 'physical') {
          this.vfx.meleeSpark(ev.targetId, ev.crit);
        }
        break;
      case 'heal2':
        if (ev.amount > 0 || ev.crit) this.vfx.healGlow(ev.targetId);
        break;
      case 'aura': {
        const tgt = this.sim.entities.get(ev.targetId);
        if (ev.gained && tgt?.kind === 'player') this.vfx.buffSwirl(ev.targetId);
        break;
      }
      case 'levelup':
        this.vfx.levelUpPillar(this.sim.playerId);
        break;
    }
  }

  // -------------------------------------------------------------------------
  // World building
  // -------------------------------------------------------------------------

  private buildTerrain(): void {
    const detail = groundDetailTexture();
    detail.repeat.set(160, 160);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detail });
    for (const zone of ZONES) this.buildTerrainChunk(zone, mat);
  }

  // Ground colors per biome; boundaries blend across the same window as the
  // heightfield's shape blend.
  private static BIOME_PALETTE: Record<BiomeId, { grass: number; grassDark: number; grassYellow: number; dirt: number; sand: number }> = {
    vale: { grass: 0x55913f, grassDark: 0x3f7230, grassYellow: 0x7a9a3d, dirt: 0x8a6f47, sand: 0xc2b283 },
    marsh: { grass: 0x596d36, grassDark: 0x41522b, grassYellow: 0x71764a, dirt: 0x6e5a3e, sand: 0x8f7f5c },
    peaks: { grass: 0x687a55, grassDark: 0x4d5c45, grassYellow: 0x8d9168, dirt: 0x7d6a50, sand: 0xb0a486 },
  };

  private buildTerrainChunk(zone: ZoneDef, mat: THREE.Material): void {
    // per-zone chunks: keep the whole strip near the old single-zone triangle
    // budget so software-GL test runners stay usable
    const segX = this.lowGfx ? 140 : 256;
    const depth = zone.zMax - zone.zMin;
    const segZ = Math.max(8, Math.round(segX * (depth / WORLD_SIZE)));
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, depth, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, (zone.zMin + zone.zMax) / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const dirtDark = new THREE.Color(0x73592f);
    const rock = new THREE.Color(0x7a7a72);
    const hazyPeak = new THREE.Color(0xa8bdd4); // world-rim mountains, atmospheric
    const snowCap = new THREE.Color(0xedf3fa);
    const c = new THREE.Color();
    const grass = new THREE.Color(), grassDark = new THREE.Color(), grassYellow = new THREE.Color();
    const dirt = new THREE.Color(), sand = new THREE.Color();
    const pals = ZONES.map((zn) => {
      const p = Renderer.BIOME_PALETTE[zn.biome];
      return {
        grass: new THREE.Color(p.grass), grassDark: new THREE.Color(p.grassDark),
        grassYellow: new THREE.Color(p.grassYellow), dirt: new THREE.Color(p.dirt), sand: new THREE.Color(p.sand),
      };
    });
    const paletteAt = (z: number) => {
      grass.copy(pals[0].grass); grassDark.copy(pals[0].grassDark);
      grassYellow.copy(pals[0].grassYellow); dirt.copy(pals[0].dirt); sand.copy(pals[0].sand);
      for (let i = 0; i + 1 < ZONES.length; i++) {
        const b = ZONES[i].zMax;
        const t = Math.max(0, Math.min(1, (z - (b - 30)) / 65));
        const tt = t * t * (3 - 2 * t);
        if (tt <= 0) break;
        grass.lerp(pals[i + 1].grass, tt);
        grassDark.lerp(pals[i + 1].grassDark, tt);
        grassYellow.lerp(pals[i + 1].grassYellow, tt);
        dirt.lerp(pals[i + 1].dirt, tt);
        sand.lerp(pals[i + 1].sand, tt);
      }
    };
    const seed = this.sim.cfg.seed;
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = terrainHeight(x, z, seed);
      pos.setY(i, h);
      const eps = 1.5;
      const hx = terrainHeight(x + eps, z, seed) - terrainHeight(x - eps, z, seed);
      const hz = terrainHeight(x, z + eps, seed) - terrainHeight(x, z - eps, seed);
      const slope = Math.sqrt(hx * hx + hz * hz) / (2 * eps);
      paletteAt(z);
      // base grass with patchy variation
      const v = (Math.sin(x * 0.21) * Math.cos(z * 0.17) + 1) / 2;
      c.copy(grass).lerp(grassDark, v);
      const v2 = (Math.sin(x * 0.043 + 5) * Math.cos(z * 0.05 + 2) + 1) / 2;
      c.lerp(grassYellow, v2 * 0.35);
      if (h < WATER_LEVEL + 1.6) c.copy(sand);
      // packed dirt at each hub settlement
      for (const zn of ZONES) {
        const dHub = Math.hypot(x - zn.hub.x, z - zn.hub.z);
        if (dHub < 14) { c.lerp(dirtDark, 0.7); break; }
      }
      const rd = roadDistance(x, z);
      if (rd < 2.0) c.lerp(dirt, 0.85);
      else if (rd < 3.4) c.lerp(dirt, 0.85 * (1 - (rd - 2.0) / 1.4));
      if (slope > 0.55) c.lerp(rock, Math.min(1, (slope - 0.55) * 2));
      // high ground (ridges, peaks) goes rocky then snowy
      if (h > 22) {
        c.lerp(rock, clamp01((h - 22) / 10) * 0.7);
        c.lerp(snowCap, clamp01((h - 34) / 14) * 0.85);
      }
      // the rim wall reads as distant sunlit peaks, not a black cliff
      const edge = Math.max(
        Math.abs(x) - (WORLD_MAX_X - 32),
        WORLD_MIN_Z + 32 - z,
        z - (WORLD_MAX_Z - 32),
      );
      const rim = clamp01(edge / 26);
      if (rim > 0) {
        c.lerp(hazyPeak, rim * 0.9);
        c.lerp(snowCap, clamp01((h - 26) / 16) * rim * 0.8);
      }
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private buildDecorations(): void {
    const decos = generateDecorations(this.sim.cfg.seed);
    const pines = decos.filter((d) => d.kind === 'tree');
    const oaks = decos.filter((d) => d.kind === 'tree2');
    const rocks = decos.filter((d) => d.kind === 'rock');
    const seed = this.sim.cfg.seed;

    const bark = barkTexture();
    const foliage = foliageTexture();
    const trunkMat = new THREE.MeshLambertMaterial({ map: bark });
    const pineMat = new THREE.MeshLambertMaterial({ map: foliage, color: 0xa8c898 });
    const pineMat2 = new THREE.MeshLambertMaterial({ map: foliage, color: 0xc2d8a8 });
    const oakMat = new THREE.MeshLambertMaterial({ map: foliage, color: 0xb8cc8e });

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);

    // pines: trunk + 3 stacked cones
    const pTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.42, 2.6, 6), trunkMat, pines.length);
    const pC1 = new THREE.InstancedMesh(new THREE.ConeGeometry(2.4, 3.2, 7), pineMat, pines.length);
    const pC2 = new THREE.InstancedMesh(new THREE.ConeGeometry(1.85, 2.7, 7), pineMat2, pines.length);
    const pC3 = new THREE.InstancedMesh(new THREE.ConeGeometry(1.25, 2.2, 7), pineMat, pines.length);
    pines.forEach((t, i) => {
      const y = terrainHeight(t.x, t.z, seed);
      const s = t.scale * 1.5;
      q.setFromAxisAngle(up, t.variant * 2.1);
      const sv = new THREE.Vector3(s, s, s);
      m.compose(new THREE.Vector3(t.x, y + 1.3 * s, t.z), q, sv);
      pTrunk.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t.x, y + 3.6 * s, t.z), q, sv);
      pC1.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t.x, y + 5.3 * s, t.z), q, sv);
      pC2.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t.x, y + 6.8 * s, t.z), q, sv);
      pC3.setMatrixAt(i, m);
    });
    for (const im of [pTrunk, pC1, pC2, pC3]) {
      im.castShadow = true;
      this.scene.add(im);
    }

    // oaks: trunk + blobby foliage
    const oTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.5, 2.8, 6), trunkMat, oaks.length);
    const oFol = new THREE.InstancedMesh(new THREE.SphereGeometry(2.2, 7, 5), oakMat, oaks.length);
    const oFol2 = new THREE.InstancedMesh(new THREE.SphereGeometry(1.5, 6, 5), oakMat, oaks.length);
    oaks.forEach((t, i) => {
      const y = terrainHeight(t.x, t.z, seed);
      const s = t.scale * 1.3;
      q.setFromAxisAngle(up, t.variant * 2.1);
      m.compose(new THREE.Vector3(t.x, y + 1.4 * s, t.z), q, new THREE.Vector3(s, s, s));
      oTrunk.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t.x, y + 3.6 * s, t.z), q, new THREE.Vector3(s, s * 0.8, s));
      oFol.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t.x + 1.1 * s, y + 2.9 * s, t.z + 0.4 * s), q, new THREE.Vector3(s, s * 0.7, s));
      oFol2.setMatrixAt(i, m);
    });
    for (const im of [oTrunk, oFol, oFol2]) {
      im.castShadow = true;
      this.scene.add(im);
    }

    const rockMesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.9, 0),
      new THREE.MeshLambertMaterial({ color: 0x8d8d85, flatShading: true }),
      rocks.length,
    );
    rocks.forEach((r, i) => {
      const y = terrainHeight(r.x, r.z, seed);
      q.setFromAxisAngle(up, r.variant * 1.7);
      m.compose(new THREE.Vector3(r.x, y + 0.3 * r.scale, r.z), q, new THREE.Vector3(r.scale, r.scale * 0.7, r.scale));
      rockMesh.setMatrixAt(i, m);
    });
    rockMesh.castShadow = true;
    this.scene.add(rockMesh);
  }

  private buildGrass(): void {
    const seed = this.sim.cfg.seed;
    const positions: { x: number; z: number; s: number; r: number }[] = [];
    const step = this.lowGfx ? 4.5 : 3.4;
    const xHalf = WORLD_MAX_X - 16;
    let h1 = 0;
    for (let gx = -xHalf; gx < xHalf; gx += step) {
      for (let gz = WORLD_MIN_Z + 16; gz < WORLD_MAX_Z - 16; gz += step) {
        h1 = (Math.sin(gx * 12.9898 + gz * 78.233) * 43758.5453) % 1;
        const r = Math.abs(h1);
        if (r > 0.5) continue;
        const x = gx + (r - 0.25) * 8;
        const z = gz + ((r * 7) % 1 - 0.5) * 8;
        const h = terrainHeight(x, z, seed);
        if (h < WATER_LEVEL + 1.6) continue;
        let nearHub = false;
        for (const zn of ZONES) {
          if (Math.hypot(x - zn.hub.x, z - zn.hub.z) < 15) { nearHub = true; break; }
        }
        if (nearHub) continue;
        if (roadDistance(x, z) < 3.2) continue;
        positions.push({ x, z, s: 0.45 + r * 0.5, r: r * 6 });
      }
    }
    // crossed-quad geometry
    const quad = new THREE.PlaneGeometry(1.1, 0.7);
    quad.translate(0, 0.35, 0);
    const quad2 = quad.clone().rotateY(Math.PI / 2);
    const merged = mergeGeoms([quad, quad2]);
    const mat = new THREE.MeshLambertMaterial({
      map: grassTuftTexture(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
    });
    const im = new THREE.InstancedMesh(merged, mat, positions.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    positions.forEach((p, i) => {
      q.setFromAxisAngle(up, p.r);
      m.compose(new THREE.Vector3(p.x, terrainHeight(p.x, p.z, seed), p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      im.setMatrixAt(i, m);
    });
    this.scene.add(im);
  }

  // -------------------------------------------------------------------------
  // Entity views
  // -------------------------------------------------------------------------

  private createView(e: Entity): void {
    const group = new THREE.Group();
    let rig: Rig;
    let sparkle: THREE.Sprite | undefined;
    let objectMesh: THREE.Object3D | undefined;

    let portal: THREE.Mesh | undefined;
    if (e.kind === 'object' && (e.templateId === 'dungeon_door' || e.templateId === 'dungeon_exit')) {
      // dungeon doorway: stone arch with a swirling portal
      const entering = e.templateId === 'dungeon_door';
      const tint = entering ? 0x9a5df0 : 0x6ab8ff;
      rig = { body: new THREE.Group(), parts: {}, kind: 'humanoid', height: 4.6 };
      const stone = new THREE.MeshLambertMaterial({ color: 0x6a6a72 });
      for (const sx of [-1.5, 1.5]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 4.4, 0.7), stone);
        pillar.position.set(sx, 2.2, 0);
        pillar.castShadow = true;
        rig.body.add(pillar);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.7, 0.9), stone);
      lintel.position.y = 4.55;
      lintel.castShadow = true;
      rig.body.add(lintel);
      portal = new THREE.Mesh(
        new THREE.CircleGeometry(1.55, 24),
        new THREE.MeshBasicMaterial({
          color: tint, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      portal.position.y = 2.15;
      portal.scale.set(1, 1.35, 1);
      rig.body.add(portal);
      const glow = new THREE.PointLight(tint, 9, 15, 2);
      glow.position.y = 2.4;
      rig.body.add(glow);
      objectMesh = rig.body;
    } else if (e.kind === 'object') {
      rig = { body: new THREE.Group(), parts: {}, kind: 'humanoid', height: 1.2 };
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.9, 0.9),
        new THREE.MeshLambertMaterial({ color: 0x8a6537 }),
      );
      crate.position.y = 0.45;
      crate.castShadow = true;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.12, 0.96), new THREE.MeshLambertMaterial({ color: 0x6b4a2b }));
      lid.position.y = 0.92;
      rig.body.add(crate, lid);
      objectMesh = rig.body;
      const sMat = new THREE.SpriteMaterial({ map: sparkleTexture(), transparent: true, depthWrite: false });
      sparkle = new THREE.Sprite(sMat);
      sparkle.scale.set(0.9, 0.9, 1);
      sparkle.position.y = 1.35;
      group.add(sparkle);
    } else {
      rig = buildRigFor(e);
    }
    rig.body.scale.multiplyScalar(e.scale);
    group.add(rig.body);

    group.position.set(e.pos.x, e.pos.y, e.pos.z);
    group.userData.entityId = e.id;
    rig.body.traverse((o) => { o.userData.entityId = e.id; });
    this.scene.add(group);
    this.clickTargets.push(rig.body);

    // nameplate
    const np = document.createElement('div');
    np.className = 'nameplate';
    const marker = document.createElement('div');
    marker.className = 'np-marker';
    const nameEl = document.createElement('div');
    nameEl.className = 'np-name';
    nameEl.textContent = e.name;
    const hpBar = document.createElement('div');
    hpBar.className = 'np-hpbar';
    const hpFill = document.createElement('div');
    hpFill.className = 'np-hpfill';
    hpBar.appendChild(hpFill);
    np.append(marker, nameEl, hpBar);
    this.nameplateLayer.appendChild(np);

    this.views.set(e.id, {
      group, rig, sheepRig: null, bearRig: null, walkPhase: 0, attackAnim: 0,
      nameplate: np, nameEl, hpBar, hpFill, markerEl: marker, sparkle, objectMesh, portal,
    });
  }

  triggerAttack(entityId: number): void {
    const v = this.views.get(entityId);
    if (v) v.attackAnim = 0.35;
  }

  // -------------------------------------------------------------------------
  // Per-frame sync
  // -------------------------------------------------------------------------

  // ---------------------------------------------------------------------
  // The Hollow Crypt interior, built lazily per instance origin.
  // ---------------------------------------------------------------------

  private builtInteriors = new Set<string>();
  private fogState: 'outdoor' | 'dungeon' | 'underwater' = 'outdoor';

  private buildInterior(interior: string, ox: number, oz: number): void {
    // one builder per DungeonDef.interior key
    if (interior === 'sanctum') this.buildSanctum(ox, oz);
    else this.buildCrypt(ox, oz);
  }

  private buildCrypt(ox: number, oz: number): void {
    const g = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({ color: 0x6a6a72 });
    const stoneDark = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
    const bone = new THREE.MeshLambertMaterial({ color: 0xd8d4c0, flatShading: true });

    const floor = new THREE.Mesh(new THREE.BoxGeometry(46, 0.5, 122), stoneDark);
    floor.position.set(0, -0.25, 52);
    floor.receiveShadow = true;
    g.add(floor);
    // walls
    for (const sx of [-23, 23]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 9, 122), stone);
      wall.position.set(sx, 4.5, 52);
      g.add(wall);
    }
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(48, 9, 2), stone);
    backWall.position.set(0, 4.5, 112);
    g.add(backWall);
    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(48, 9, 2), stone);
    frontWall.position.set(0, 4.5, -9);
    g.add(frontWall);
    // pillars + torches
    for (let z = 10; z <= 100; z += 15) {
      for (const sx of [-14, 14]) {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 8, 7), stone);
        pillar.position.set(sx, 4, z);
        pillar.castShadow = true;
        g.add(pillar);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6), new THREE.MeshLambertMaterial({
          color: 0x7fd4ff, emissive: 0x2288cc, emissiveIntensity: 1.6, transparent: true, opacity: 0.92,
        }));
        flame.position.set(sx, 8.4, z);
        g.add(flame);
        this.flames.push(flame);
        const light = new THREE.PointLight(0x66bbff, 10, 22, 2);
        light.position.set(sx, 8.2, z);
        g.add(light);
        this.fireLights.push(light);
      }
    }
    // sarcophagi along the walls
    for (let z = 16; z <= 92; z += 19) {
      for (const sx of [-19, 19]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 4.2), stoneDark);
        s.position.set(sx, 0.7, z);
        s.castShadow = true;
        g.add(s);
      }
    }
    // bone piles
    for (let i = 0; i < 10; i++) {
      const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), bone);
      b.position.set(Math.sin(i * 2.4) * 14, 0.3, 12 + i * 9.5);
      b.scale.set(1.2, 0.5, 1);
      g.add(b);
    }
    // boss dais
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 1, 12), stone);
    dais.position.set(0, 0.5, 96);
    dais.receiveShadow = true;
    g.add(dais);

    g.position.set(ox, 0, oz);
    this.scene.add(g);
  }

  // Gravewyrm Sanctum: a stretched three-chamber crypt (z 0..158) — the
  // Boneworks, the Ritual Vault and the Wyrm's Hollow — separated by narrowed
  // waists, lit by green ritual fire. Wall/pillar geometry must stay in sync
  // with SANCTUM_COLLIDERS in sim/colliders.ts.
  private buildSanctum(ox: number, oz: number): void {
    const g = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({ color: 0x5e5a66 });
    const stoneDark = new THREE.MeshLambertMaterial({ color: 0x3f3b48 });
    const bone = new THREE.MeshLambertMaterial({ color: 0xd8d4c0, flatShading: true });

    const floor = new THREE.Mesh(new THREE.BoxGeometry(46, 0.5, 168), stoneDark);
    floor.position.set(0, -0.25, 74.5);
    floor.receiveShadow = true;
    g.add(floor);
    // walls
    for (const sx of [-23, 23]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 9, 168), stone);
      wall.position.set(sx, 4.5, 74.5);
      g.add(wall);
    }
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(48, 9, 2), stone);
    backWall.position.set(0, 4.5, 158);
    g.add(backWall);
    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(48, 9, 2), stone);
    frontWall.position.set(0, 4.5, -9);
    g.add(frontWall);
    // chamber waists: wall stubs leaving a ~10yd centre passage
    for (const sx of [-14, 14]) {
      const stub1 = new THREE.Mesh(new THREE.BoxGeometry(18, 9, 10), stone);
      stub1.position.set(sx, 4.5, 67); // Boneworks -> Korgath's Hall
      g.add(stub1);
      const stub2 = new THREE.Mesh(new THREE.BoxGeometry(18, 9, 6), stone);
      stub2.position.set(sx, 4.5, 115); // Ritual Vault -> Wyrm's Hollow
      g.add(stub2);
    }
    // pillars + green ritual torches (waist bands skipped)
    for (const z of [10, 25, 40, 55, 85, 100, 125, 140]) {
      for (const sx of [-14, 14]) {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 8, 7), stone);
        pillar.position.set(sx, 4, z);
        pillar.castShadow = true;
        g.add(pillar);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6), new THREE.MeshLambertMaterial({
          color: 0xa6ffb8, emissive: 0x22cc55, emissiveIntensity: 1.6, transparent: true, opacity: 0.92,
        }));
        flame.position.set(sx, 8.4, z);
        g.add(flame);
        this.flames.push(flame);
        const light = new THREE.PointLight(0x55e08a, 10, 22, 2);
        light.position.set(sx, 8.2, z);
        g.add(light);
        this.fireLights.push(light);
      }
    }
    // bone piles strewn between the chambers (none inside the waist walls)
    for (let i = 0; i < 14; i++) {
      const z = 12 + i * 10;
      if ((z > 60 && z < 74) || (z > 110 && z < 120)) continue;
      const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), bone);
      b.position.set(Math.sin(i * 2.1) * 14, 0.3, z);
      b.scale.set(1.3, 0.5, 1.1);
      g.add(b);
    }
    // Korzul's great dais
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(11, 12, 1.2, 14), stone);
    dais.position.set(0, 0.6, 146);
    dais.receiveShadow = true;
    g.add(dais);

    g.position.set(ox, 0, oz);
    this.scene.add(g);
  }

  private updateAmbience(px: number, camY: number): void {
    const inside = px > DUNGEON_X_THRESHOLD;
    if (inside) {
      // build the interior copy the player is standing in
      for (const dungeon of DUNGEON_LIST) {
        for (let i = 0; i < INSTANCE_SLOT_COUNT; i++) {
          const key = `${dungeon.id}:${i}`;
          if (this.builtInteriors.has(key)) continue;
          const o = instanceOrigin(dungeon.index, i);
          if (Math.abs(px - o.x) < 200 && Math.abs(this.sim.player.pos.z - o.z) < 250) {
            this.builtInteriors.add(key);
            this.buildInterior(dungeon.interior, o.x, o.z);
          }
        }
      }
    }
    const desired = inside ? 'dungeon' : camY < WATER_LEVEL - 0.05 ? 'underwater' : 'outdoor';
    if (desired === this.fogState) return;
    this.fogState = desired;
    const fog = this.scene.fog as THREE.Fog;
    if (desired === 'dungeon') {
      fog.color.setHex(0x05060a);
      fog.near = 18;
      fog.far = 90;
    } else if (desired === 'underwater') {
      fog.color.setHex(0x17506e);
      fog.near = 2;
      fog.far = 48;
    } else {
      fog.color.setHex(0xa6c6e0);
      fog.near = 130;
      fog.far = 470;
    }
  }

  // Drop the view of an entity that left the world / our interest area.
  private removeView(id: number): void {
    const v = this.views.get(id);
    if (!v) return;
    this.scene.remove(v.group);
    v.nameplate.remove();
    const idx = this.clickTargets.indexOf(v.rig.body);
    if (idx >= 0) this.clickTargets.splice(idx, 1);
    this.views.delete(id);
  }

  sync(alpha: number, dt: number, renderFacingOverride: number | null): void {
    this.time += dt;
    const sim = this.sim;
    const p = sim.player;

    // dynamic worlds: create views for newcomers, drop views for leavers
    for (const e of sim.entities.values()) {
      if (!this.views.has(e.id)) this.createView(e);
    }
    for (const id of [...this.views.keys()]) {
      if (!sim.entities.has(id)) this.removeView(id);
    }

    for (const e of sim.entities.values()) {
      const v = this.views.get(e.id);
      if (!v) continue;
      const x = e.prevPos.x + (e.pos.x - e.prevPos.x) * alpha;
      const y = e.prevPos.y + (e.pos.y - e.prevPos.y) * alpha;
      const z = e.prevPos.z + (e.pos.z - e.prevPos.z) * alpha;
      v.group.position.set(x, y, z);
      let facing = e.prevFacing + shortestAngle(e.prevFacing, e.facing) * alpha;
      if (e.id === p.id && renderFacingOverride !== null) facing = renderFacingOverride;
      v.group.rotation.y = facing;

      if (e.kind === 'object') {
        const vis = e.lootable;
        v.group.visible = vis;
        if (v.sparkle && vis) {
          const pulse = 0.75 + Math.sin(this.time * 3 + e.id) * 0.25;
          v.sparkle.scale.set(pulse, pulse, 1);
          v.sparkle.material.rotation = this.time * 0.8;
        }
        if (v.portal && vis) {
          v.portal.rotation.z = this.time * 1.4;
          (v.portal.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(this.time * 2.2 + e.id) * 0.15;
        }
        continue;
      }

      // swimming pose: prone at the surface, stroking arms
      const swimming = !e.dead
        && groundHeight(e.pos.x, e.pos.z, this.sim.cfg.seed) < WATER_LEVEL - 0.8
        && e.pos.y <= WATER_LEVEL - 0.5;

      // form swaps: polymorph sheep, druid bear
      const polyed = e.auras.some((a) => a.kind === 'polymorph');
      const bear = !polyed && e.auras.some((a) => a.kind === 'form_bear');
      if (polyed && !v.sheepRig) {
        v.sheepRig = buildSheep();
        v.sheepRig.body.scale.multiplyScalar(e.scale);
        v.group.add(v.sheepRig.body);
      }
      if (bear && !v.bearRig) {
        v.bearRig = buildBear();
        v.bearRig.body.scale.multiplyScalar(e.scale);
        v.group.add(v.bearRig.body);
      }
      if (v.sheepRig) v.sheepRig.body.visible = polyed;
      if (v.bearRig) v.bearRig.body.visible = bear;
      v.rig.body.visible = !polyed && !bear;
      const activeRig = polyed && v.sheepRig ? v.sheepRig : bear && v.bearRig ? v.bearRig : v.rig;
      const parts = activeRig.parts;

      // animation
      const speed = Math.hypot(e.pos.x - e.prevPos.x, e.pos.z - e.prevPos.z) / Math.max(dt, 1e-4) * 0.05;
      const moving = speed > 0.02;
      if (moving) v.walkPhase += dt * 9 * Math.min(2, speed * 6);
      const swing = moving ? Math.sin(v.walkPhase) * 0.55 : 0;

      if (parts.leftLeg || parts.rightLeg) {
        // biped
        if (parts.leftLeg) parts.leftLeg.rotation.x = swing;
        if (parts.rightLeg) parts.rightLeg.rotation.x = -swing;
        if (parts.leftArm) parts.leftArm.rotation.x = -swing * 0.65;
        if (parts.rightArm && v.attackAnim <= 0) parts.rightArm.rotation.x = swing * 0.65;
        if (v.attackAnim > 0) {
          v.attackAnim -= dt;
          const t = 1 - Math.max(0, v.attackAnim) / 0.35;
          if (parts.rightArm) parts.rightArm.rotation.x = -Math.sin(t * Math.PI) * 1.9;
        }
        // idle breathing
        if (!moving && parts.head) parts.head.position.y = (activeRig.kind === 'humanoid' ? 2.18 : parts.head.position.y) + Math.sin(this.time * 1.8 + e.id) * 0.012;
      } else if (parts.legs) {
        if (activeRig.kind === 'spider') {
          parts.legs.forEach((leg, i) => {
            const base = (i % 2 === 0 ? 1 : -1) * 0.18;
            leg.rotation.x = moving ? Math.sin(v.walkPhase * 1.6 + i * 0.9) * 0.35 : Math.sin(this.time * 2 + i) * 0.05;
            leg.rotation.z = base;
          });
        } else {
          parts.legs.forEach((leg, i) => {
            leg.rotation.x = moving ? Math.sin(v.walkPhase + (i % 2) * Math.PI) * 0.7 : 0;
          });
        }
        if (v.attackAnim > 0) {
          v.attackAnim -= dt;
          const t = 1 - Math.max(0, v.attackAnim) / 0.35;
          if (parts.head) parts.head.rotation.x = Math.sin(t * Math.PI) * 0.6;
        } else if (parts.head) {
          parts.head.rotation.x = 0;
        }
        if (parts.tail) parts.tail.rotation.x = 0.55 + Math.sin(this.time * 4 + e.id) * 0.15;
      }

      // death pose
      if (e.dead) {
        activeRig.body.rotation.z = Math.PI / 2;
        activeRig.body.rotation.x = 0;
        activeRig.body.position.y = 0.4;
      } else {
        activeRig.body.rotation.z = 0;
        activeRig.body.rotation.x = 0;
        activeRig.body.position.y = 0;
        if (e.castingAbility && parts.leftArm && parts.rightArm) {
          parts.leftArm.rotation.x = -2.4;
          parts.rightArm.rotation.x = -2.4;
          this.vfx.castSparkle(e.id, ABILITIES[e.castingAbility]?.school ?? 'arcane', dt);
        }
        // sitting pose
        if (e.kind === 'player' && (e.sitting || e.eating || e.drinking)) {
          activeRig.body.position.y = -0.8;
          if (parts.leftLeg) parts.leftLeg.rotation.x = -1.4;
          if (parts.rightLeg) parts.rightLeg.rotation.x = -1.4;
        }
        if (swimming) {
          // prone freestyle at the surface
          activeRig.body.rotation.x = 1.18;
          activeRig.body.position.y = 1.0 + Math.sin(this.time * 2 + e.id) * 0.08;
          const ph = moving ? v.walkPhase : this.time * 2.4;
          if (parts.leftArm) parts.leftArm.rotation.x = Math.sin(ph) * 1.25 - 1.5;
          if (parts.rightArm && v.attackAnim <= 0) parts.rightArm.rotation.x = Math.sin(ph + Math.PI) * 1.25 - 1.5;
          if (parts.leftLeg) parts.leftLeg.rotation.x = Math.sin(ph * 2) * 0.4;
          if (parts.rightLeg) parts.rightLeg.rotation.x = Math.sin(ph * 2 + Math.PI) * 0.4;
          if (moving) this.vfx.swimRipple(v.group.position, dt * 3);
          else this.vfx.swimRipple(v.group.position, dt);
        }
      }
    }

    // selection ring
    const target = p.targetId !== null ? sim.entities.get(p.targetId) : null;
    if (target) {
      const tv = this.views.get(target.id)!;
      this.selectionRing.position.copy(tv.group.position);
      this.selectionRing.position.y += 0.08;
      this.selectionRing.scale.setScalar(target.scale);
      (this.selectionRing.material as THREE.MeshBasicMaterial).color.setHex(
        target.hostile ? 0xcc2222 : 0xd4af37,
      );
      this.selectionRing.visible = true;
    } else {
      this.selectionRing.visible = false;
    }

    // fire flicker + rising embers
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const fl = 0.85 + Math.sin(this.time * 9 + i * 2.4) * 0.12 + Math.sin(this.time * 23 + i) * 0.06;
      f.scale.set(fl, fl * (1 + Math.sin(this.time * 13 + i) * 0.12), fl);
      const mat = f.material as THREE.MeshLambertMaterial;
      if (mat.color.r > mat.color.b) {
        f.getWorldPosition(this.tmpV);
        this.vfx.campfireEmber(this.tmpV, dt);
      }
    }
    for (let i = 0; i < this.fireLights.length; i++) {
      this.fireLights[i].intensity = 11 + Math.sin(this.time * 11 + i * 1.7) * 2.5;
    }

    // clouds drift
    for (const cl of this.clouds) {
      cl.position.x += dt * 1.6;
      if (cl.position.x > 320) cl.position.x = -320;
    }

    // water shimmer
    this.waterTex.offset.x = this.time * 0.008;
    this.waterTex.offset.y = this.time * 0.011;

    this.vfx.update(dt);

    this.updateCamera(alpha);
    this.updateAmbience(p.pos.x, this.camera.position.y);
    // shadow frustum follows the player
    const pv = this.views.get(p.id);
    if (pv) {
      const pp = pv.group.position;
      this.sun.position.set(pp.x + 90, pp.y + 140, pp.z + 50);
      this.sun.target.position.set(pp.x, pp.y, pp.z);
    }
    // sky dome + sun disc ride along with the camera
    this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.sky.visible = this.fogState === 'outdoor';
    for (const sp of this.sunSprites) {
      sp.position.copy(this.camera.position).addScaledVector(this.sunDir, 760);
      sp.visible = this.fogState === 'outdoor';
    }

    this.updateNameplates();
    this.webgl.render(this.scene, this.camera);
  }

  private updateCamera(alpha: number): void {
    const p = this.sim.player;
    const px = p.prevPos.x + (p.pos.x - p.prevPos.x) * alpha;
    const py = p.prevPos.y + (p.pos.y - p.prevPos.y) * alpha;
    const pz = p.prevPos.z + (p.pos.z - p.prevPos.z) * alpha;
    const eyeY = py + 2.0;
    const cx = px - Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const cy = eyeY + Math.sin(this.camPitch) * this.camDist;
    const cz = pz - Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const groundY = groundHeight(cx, cz, this.sim.cfg.seed) + 0.6;
    this.camera.position.set(cx, Math.max(cy, groundY), cz);
    this.camera.lookAt(px, eyeY, pz);
  }

  private updateNameplates(): void {
    const sim = this.sim;
    const p = sim.player;
    const w = window.innerWidth, h = window.innerHeight;
    for (const e of sim.entities.values()) {
      const v = this.views.get(e.id);
      if (!v) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const isSelf = e.id === p.id;
      const isDoor = e.templateId === 'dungeon_door' || e.templateId === 'dungeon_exit';
      const hidden = isSelf || dist > NAMEPLATE_RANGE
        || (e.dead && !e.lootable && e.kind === 'mob')
        || (e.kind === 'object' && !isDoor)
        || (!this.showNameplates && e.kind === 'mob' && !e.dead);
      if (hidden) {
        v.nameplate.style.display = 'none';
        continue;
      }
      this.tmpV.copy(v.group.position);
      this.tmpV.y += v.rig.height * e.scale + 0.5;
      this.tmpV.project(this.camera);
      if (this.tmpV.z > 1) { v.nameplate.style.display = 'none'; continue; }
      const sx = (this.tmpV.x * 0.5 + 0.5) * w;
      const sy = (-this.tmpV.y * 0.5 + 0.5) * h;
      v.nameplate.style.display = '';
      v.nameplate.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px) translate(-50%, -100%)`;

      if (e.kind === 'object') {
        // dungeon doorways announce themselves
        v.nameEl.style.color = '#c084ff';
        v.nameEl.textContent = e.name;
        v.hpBar.style.display = 'none';
        v.markerEl.textContent = '';
      } else if (e.kind === 'player') {
        // other players: friendly blue with an hp bar
        v.nameEl.style.color = '#7fb8ff';
        v.nameEl.textContent = `${e.name}`;
        v.hpBar.style.display = e.dead ? 'none' : '';
        v.hpFill.style.width = `${(100 * e.hp / Math.max(1, e.maxHp)).toFixed(1)}%`;
        v.markerEl.textContent = '';
      } else if (e.kind === 'npc') {
        v.nameEl.style.color = '#9fdc7f';
        v.nameEl.textContent = e.name;
        v.hpBar.style.display = 'none';
        let marker = '';
        let cls = '';
        for (const qid of e.questIds) {
          const st = sim.questState(qid);
          if (st === 'ready') { marker = '?'; cls = 'ready'; break; }
          if (st === 'available') { marker = '!'; cls = 'avail'; }
          else if (st === 'active' && !marker) { marker = '?'; cls = 'active'; }
        }
        v.markerEl.textContent = marker;
        v.markerEl.className = 'np-marker ' + cls;
      } else {
        const diff = e.level - p.level;
        const template = MOBS[e.templateId];
        const elite = !!template?.elite;
        v.nameEl.style.color = e.dead ? '#999' : diff >= 3 ? '#ff4444' : diff >= 1 ? '#ffaa33' : diff >= -2 ? '#ffe97a' : diff >= -5 ? '#7fdc4f' : '#9d9d9d';
        v.nameEl.textContent = e.dead ? `${e.name} (corpse)` : `[${e.level}${elite ? '+' : ''}] ${e.name}`;
        v.hpBar.style.display = e.dead ? 'none' : '';
        v.hpFill.style.width = `${(100 * e.hp / Math.max(1, e.maxHp)).toFixed(1)}%`;
        v.markerEl.textContent = e.lootable ? '$' : elite && !e.dead ? '◆' : '';
        v.markerEl.className = 'np-marker loot';
      }
    }
  }

  pick(clientX: number, clientY: number): number | null {
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.clickTargets, true);
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o) {
        if (o.userData.entityId !== undefined && o.userData.entityId !== this.sim.playerId) {
          const e = this.sim.entities.get(o.userData.entityId as number);
          if (e?.kind === 'object' && !e.lootable) return null;
          return o.userData.entityId as number;
        }
        o = o.parent;
      }
    }
    return null;
  }

  worldToScreen(x: number, y: number, z: number): { x: number; y: number; behind: boolean } {
    this.tmpV.set(x, y, z).project(this.camera);
    return {
      x: (this.tmpV.x * 0.5 + 0.5) * window.innerWidth,
      y: (-this.tmpV.y * 0.5 + 0.5) * window.innerHeight,
      behind: this.tmpV.z > 1,
    };
  }
}

function shortestAngle(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// minimal geometry merge (positions/normals/uvs) to avoid pulling in examples/
function mergeGeoms(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0, totalIdx = 0;
  for (const g of geoms) {
    totalVerts += g.attributes.position.count;
    totalIdx += g.index ? g.index.count : 0;
  }
  const pos = new Float32Array(totalVerts * 3);
  const norm = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);
  const idx = new Uint16Array(totalIdx);
  let vOff = 0, iOff = 0;
  for (const g of geoms) {
    pos.set(g.attributes.position.array as Float32Array, vOff * 3);
    norm.set(g.attributes.normal.array as Float32Array, vOff * 3);
    uv.set(g.attributes.uv.array as Float32Array, vOff * 2);
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[iOff + i] = g.index.array[i] + vOff;
      iOff += g.index.count;
    }
    vOff += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
