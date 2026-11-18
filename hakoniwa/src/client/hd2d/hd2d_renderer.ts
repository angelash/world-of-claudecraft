// The HD-2D renderer (art_pipeline.md 2): a three.js scene seen through an orthographic
// oblique camera, with the far sky and the out-of-bounds ground behind everything (2.13),
// the map's static scene (ground, buildings, free walls, standees), the entity layer, sun
// and sky from the style pack, the static light map and dynamic lights, the post chain,
// and a 2D overlay canvas on top for weather, the combat marks, names, bubbles, floating
// text and hints. All rules live in the pure hd2d and render modules; this class only
// drives three.js and the overlay, and only for the layers the frame scheduler marks dirty
// (release_engineering.md 6.3). A switch tile that opens or closes rebuilds the static
// scene from the live map and dissolves the old one into the new (switch_fade.ts).

import * as THREE from 'three';
import type { SkyPack } from '../../systems/world/atlas';
import { bitmapPixels } from '../assets/runtime';
import { ctx2d, ensureSize, matrixToCanvas } from '../render/canvas_util';
import { gradeHaze } from '../render/fairness';
import { ALL_LAYERS, type FrameLayers } from '../render/frame_scheduler';
import { lampLit } from '../render/lighting';
import type { MapContext } from '../render/map_context';
import { type MarkerKind, markerMatrix } from '../render/markers';
import { paintOverlays } from '../render/overlay_painter';
import type { HitBox, WorldRenderer } from '../render/renderer';
import type { Scene, SceneEntity, SceneLight } from '../render/scene';
import { MOOD_GRADES } from '../render/stage_direct';
import { mix } from '../sprites/palette';
import type { PixelMatrix } from '../sprites/pixels';
import { blendSunSky, type SunSky, sunSkyAt } from './daylight';
import { EntityLayer } from './entities';
import { LIGHTMAP_PX, lightsKey, paintLightmap } from './lightmap';
import { createSharedUniforms, type SharedUniforms } from './materials';
import { PostChain } from './post';
import { type QualitySettings, tierPixelRatio } from './quality';
import { buildStaticScene, type StaticScene } from './scene_builder';
import { MAX_DYNAMIC_LIGHTS, MAX_SWITCH_RECTS } from './shaders';
import {
  cachedSkyLayer,
  celestial,
  horizonFraction,
  layerOffset,
  SKY_BAND_H,
  SKY_BAND_W,
  type SkyLayerSpec,
  skyColors,
  skyLayers,
  skyPixelScale,
  skyVisibility,
} from './sky';
import { SkyLayer } from './sky_layer';
import { standeeHitBox } from './standee';
import {
  pixelsPerUnit,
  projectToScreen,
  screenToGround,
  snapFocus,
  type ViewBasis,
  type ViewRequest,
  viewBasis,
} from './view';
import { paintWeatherOverlay } from './weather_overlay';

const CAMERA_DISTANCE = 240;
/** Lowest standee ambient (linear RGB) at night. */
const NIGHT_FLOOR: readonly [number, number, number] = [0.3, 0.34, 0.5];
/** Roofs keep this fraction of their own colour as glow at full night. */
const ROOF_NIGHT_GLOW = 0.3;

function linear(hex: number): THREE.Color {
  return new THREE.Color().setHex(hex);
}

/** A sky layer strip: the approved art when it is in, else the cached placeholder (6.4). */
function skyStrip(pack: SkyPack, spec: SkyLayerSpec): PixelMatrix {
  const art = bitmapPixels(spec.assetId);
  if (art && art.w === SKY_BAND_W && art.h === SKY_BAND_H) return art;
  return cachedSkyLayer(pack, spec.kind);
}

export class Hd2dRenderer implements WorldRenderer {
  readonly kind = 'hd2d' as const;
  readonly canvas: HTMLCanvasElement;
  deviceW = 1;
  deviceH = 1;
  dpr = 1;
  private cssW = 1;
  private cssH = 1;
  private readonly gl: THREE.WebGLRenderer;
  private readonly overlay: CanvasRenderingContext2D;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, CAMERA_DISTANCE * 3);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  private readonly hemi = new THREE.HemisphereLight(0xcfe2ff, 0x8a7a5a, 1.2);
  private readonly shared: SharedUniforms;
  private readonly entities: EntityLayer;
  private readonly sky: SkyLayer;
  private readonly post: PostChain;
  private quality: QualitySettings;
  private ctx: MapContext | null = null;
  private stat: StaticScene | null = null;
  /** the static scene before a switch change, dissolving out while the new one comes in */
  private outgoing: StaticScene | null = null;
  private lightmap: THREE.DataTexture | null = null;
  private lightKey = '';
  private boxes: HitBox[] = [];
  private lastView: ViewRequest | null = null;
  private readonly markers = new Map<MarkerKind, HTMLCanvasElement>();
  private readonly waterHi = linear(0xd8f0ff);
  private readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly raycaster = new THREE.Raycaster();
  private openness = new Map<string, number>();
  private sunDistance = 120;
  private readonly buffer = new THREE.Vector2();

  constructor(quality: QualitySettings) {
    this.quality = quality;
    this.gl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    try {
      this.gl.toneMapping = THREE.ACESFilmicToneMapping;
      this.gl.toneMappingExposure = 1;
      this.gl.domElement.className = 'hk-world hk-world-gl';
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'hk-world hk-world-overlay';
      this.overlay = ctx2d(this.canvas);
      this.shared = createSharedUniforms();
      this.entities = new EntityLayer(this.shared);
      this.sky = new SkyLayer();
      this.scene.add(this.sun, this.sun.target, this.hemi, this.entities.group, this.sky.mesh);
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.03;
      this.post = new PostChain(this.gl, this.scene, this.camera);
      this.applyQuality();
    } catch (err) {
      // A half-built renderer must not keep its WebGL context alive.
      this.gl.dispose();
      this.gl.forceContextLoss();
      throw err;
    }
  }

  mount(parent: HTMLElement): void {
    parent.prepend(this.canvas);
    parent.prepend(this.gl.domElement);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = dpr;
    this.deviceW = Math.max(1, Math.round(this.cssW * dpr));
    this.deviceH = Math.max(1, Math.round(this.cssH * dpr));
    const pr = tierPixelRatio(this.quality, dpr);
    this.gl.setPixelRatio(pr);
    this.gl.setSize(this.cssW, this.cssH);
    this.post.setSize(this.cssW, this.cssH, pr);
    ensureSize(this.canvas, this.deviceW, this.deviceH);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
  }

  setQuality(q: QualitySettings): void {
    this.quality = q;
    this.applyQuality();
    this.resize(this.cssW, this.cssH, this.dpr);
  }

  private applyQuality(): void {
    const q = this.quality;
    const shadows = q.shadowMap > 0;
    this.gl.shadowMap.enabled = shadows;
    this.gl.shadowMap.type = q.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.sun.castShadow = shadows;
    if (shadows && this.sun.shadow.mapSize.x !== q.shadowMap) {
      this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    for (const c of this.stat?.casters ?? []) c.castShadow = shadows;
    this.entities.setShadows(shadows);
    this.post.setQuality(q);
    this.applySky();
  }

  /** The kept far-sky layers of the map's pack at this tier (art_pipeline.md 2.11, 2.13). */
  private applySky(): void {
    const pack = this.ctx?.sky ?? null;
    const layers = pack ? skyLayers(pack, this.quality.skyLayers) : [];
    this.sky.setLayers(pack, layers, (spec) => skyStrip(pack ?? 'lothar_plain', spec));
  }

  setMap(ctx: MapContext): void {
    if (this.ctx?.key === ctx.key && this.stat) return;
    const sameMap = this.ctx?.map.id === ctx.map.id && !!this.stat;
    this.disposeOutgoing();
    if (this.stat) {
      if (sameMap) {
        // a switch change: the old scene stays to dissolve out over the changed tiles
        this.outgoing = this.stat;
        for (const c of this.allCasters(this.outgoing)) c.castShadow = false;
      } else {
        this.scene.remove(this.stat.group);
        this.stat.dispose();
      }
    }
    this.ctx = ctx;
    const { map } = ctx;
    this.stat = buildStaticScene(ctx, this.shared, this.waterHi);
    this.scene.add(this.stat.group);
    this.applySky();
    if (sameMap && this.lightmap) {
      this.applyQuality();
      return;
    }
    this.shared.uMapSize.value.set(map.width, map.height);
    this.lightmap?.dispose();
    const w = map.width * LIGHTMAP_PX;
    const h = map.height * LIGHTMAP_PX;
    this.lightmap = new THREE.DataTexture(new Uint8Array(w * h * 4), w, h, THREE.RGBAFormat);
    this.lightmap.magFilter = THREE.NearestFilter;
    this.lightmap.minFilter = THREE.NearestFilter;
    this.lightmap.needsUpdate = true;
    this.shared.uLightmap.value = this.lightmap;
    this.lightKey = '';
    // the sky pass paints every pixel the map leaves (2.13), so there is no background clear
    this.scene.background = null;
    const cx = map.width / 2;
    const cz = map.height / 2;
    const r = Math.hypot(map.width, map.height) * 0.6 + 4;
    // The sun sits outside the map's bounding sphere so every caster is in front of it.
    this.sunDistance = r + 30;
    const sc = this.sun.shadow.camera;
    sc.left = -r;
    sc.right = r;
    sc.top = r;
    sc.bottom = -r;
    sc.near = 1;
    sc.far = this.sunDistance * 2 + 20;
    sc.updateProjectionMatrix();
    this.sun.target.position.set(cx, 0, cz);
    this.applyQuality();
  }

  private allCasters(s: StaticScene): THREE.Object3D[] {
    return [...s.casters, ...s.buildings.flatMap((b) => b.casters)];
  }

  private disposeOutgoing(): void {
    if (!this.outgoing) return;
    this.scene.remove(this.outgoing.group);
    this.outgoing.dispose();
    this.outgoing = null;
    if (this.stat?.role) this.stat.role.uSwMode.value = 0;
    this.shared.uSwCount.value = 0;
  }

  hitBoxes(): readonly HitBox[] {
    return this.boxes;
  }

  /**
   * The ground point under a pixel. A click on a closed building's walls or roof means
   * that building, not the ground hidden behind it, so those surfaces are hit first.
   */
  screenToGround(sx: number, sy: number): { x: number; y: number } | null {
    if (!this.lastView) return null;
    const targets: THREE.Object3D[] = [];
    for (const bm of this.stat?.buildings ?? [])
      if ((this.openness.get(bm.locationId) ?? 0) < 0.5) targets.push(...bm.pickable);
    if (targets.length) {
      const ndc = new THREE.Vector2((sx / this.deviceW) * 2 - 1, -((sy / this.deviceH) * 2 - 1));
      this.raycaster.setFromCamera(ndc, this.camera);
      const hit = this.raycaster.intersectObjects(targets, false)[0];
      if (hit) return { x: hit.point.x, y: hit.point.z };
    }
    return screenToGround(this.lastView, { w: this.deviceW, h: this.deviceH }, sx, sy);
  }

  /**
   * Draw the layers the frame scheduler marked dirty. The world pass (camera, sky, sun and
   * light, buildings, figures, post chain) and the overlay pass (weather, combat marks,
   * names, markers, bubbles, floating text) are independent: a skipped pass keeps its last
   * picture on its own canvas. Hit boxes are rebuilt on every drawn frame.
   */
  render(scene: Scene, layers: Readonly<FrameLayers> = ALL_LAYERS): void {
    const ctx = this.ctx;
    if (!ctx || ctx.map.id !== scene.map.id) return;
    // One rendered pixel spans dpr / pixelRatio device pixels (a whole number, quality.ts).
    const grid = this.dpr / tierPixelRatio(this.quality, this.dpr);
    const snapped = snapFocus(scene.view, { w: this.deviceW, h: this.deviceH }, grid);
    const view: ViewRequest = { ...scene.view, focusX: snapped.x, focusY: snapped.y };
    this.lastView = view;
    const vp = { w: this.deviceW, h: this.deviceH };
    const b = viewBasis(view.pitch, view.yaw);
    const ents = scene.items.filter((i): i is SceneEntity => i.type === 'entity');
    if (layers.world) this.renderWorld(scene, ctx, view, b, ents);
    const project = (x: number, h: number, y: number) => projectToScreen(view, vp, x, h, y);
    if (layers.overlay) {
      const o = this.overlay;
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.clearRect(0, 0, this.deviceW, this.deviceH);
      // weather first, then everything a player acts on above it (fairness.ts)
      paintWeatherOverlay(o, scene, view, this.deviceW, this.deviceH, this.reducedMotion);
      paintOverlays(o, scene, {
        dpr: this.dpr,
        scale: view.step,
        project,
        frameOf: (e) => this.entities.frameOf(e),
        marker: (k) => this.marker(k),
        viewport: vp,
      });
    }
    const boxes: HitBox[] = [];
    for (const e of ents) {
      const fr = this.entities.frameOf(e);
      const foot = project(e.x, 0, e.y);
      const bw = Math.max(10, Math.round(14 * e.look.scale));
      const box = standeeHitBox(foot, bw, fr.height, view.step);
      boxes.push({ id: e.id, ...box, sortY: e.x * b.toCamera[0] + e.y * b.toCamera[2] });
    }
    this.boxes = boxes;
  }

  /** Sun and sky of the scene, blended from the weather a cutscene is fading away from. */
  private sunSky(scene: Scene, ctx: MapContext): SunSky {
    const indoor = !!ctx.map.indoor;
    const now = sunSkyAt(scene.calendar, scene.weather, indoor, ctx.pack);
    const fade = scene.weatherFade;
    if (!fade || fade.t >= 1) return now;
    return blendSunSky(sunSkyAt(scene.calendar, fade.from, indoor, ctx.pack), now, fade.t);
  }

  private renderWorld(
    scene: Scene,
    ctx: MapContext,
    view: ViewRequest,
    b: ViewBasis,
    ents: readonly SceneEntity[],
  ): void {
    const { map, pack } = ctx;

    // Camera.
    const ppu = pixelsPerUnit(view.step);
    const hw = this.deviceW / 2 / ppu;
    const hh = this.deviceH / 2 / ppu;
    const cam = this.camera;
    cam.left = -hw;
    cam.right = hw;
    cam.top = hh;
    cam.bottom = -hh;
    cam.position.set(
      view.focusX + b.toCamera[0] * CAMERA_DISTANCE,
      b.toCamera[1] * CAMERA_DISTANCE,
      view.focusY + b.toCamera[2] * CAMERA_DISTANCE,
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(view.focusX, 0, view.focusY);
    cam.updateProjectionMatrix();
    this.shared.uRight.value.set(...b.right);
    this.shared.uUp.value.set(...b.up);
    this.shared.uToCam3.value.set(...b.toCamera);
    const tl = Math.hypot(b.toCamera[0], b.toCamera[2]) || 1;
    this.shared.uToCam.value.set(b.toCamera[0] / tl, b.toCamera[2] / tl);
    this.shared.uTime.value = scene.timeMs / 1000;

    // Sun and sky.
    const sky = this.sunSky(scene, ctx);
    this.sun.color.setHex(sky.sun);
    this.sun.intensity = sky.sunIntensity;
    const sd = this.sunDistance;
    this.sun.position.set(
      map.width / 2 + sky.sunDir[0] * sd,
      sky.sunDir[1] * sd,
      map.height / 2 + sky.sunDir[2] * sd,
    );
    this.hemi.color.setHex(sky.sky);
    this.hemi.groundColor.setHex(sky.ground);
    this.hemi.intensity = sky.hemiIntensity;
    const amb = linear(sky.sky).multiplyScalar(sky.hemiIntensity * 0.62);
    amb.add(linear(sky.sun).multiplyScalar(sky.sunIntensity * 0.32));
    // Night floor: the farthest figure from any lamp still reads (art_pipeline.md 2.7).
    amb.r = Math.max(amb.r, NIGHT_FLOOR[0]);
    amb.g = Math.max(amb.g, NIGHT_FLOOR[1]);
    amb.b = Math.max(amb.b, NIGHT_FLOOR[2]);
    this.shared.uAmbient.value.copy(amb);
    this.shared.uLightK.value = 0.55 + 0.45 * (1 - sky.daylight);
    const hazeColor = scene.weather === 'ashfall' ? 0x8a6a5a : 0xb8c0cc;
    this.updateSky(scene, ctx, view, b, sky, hazeColor);

    // Light map (static lights) and dynamic lights.
    const key = lightsKey(scene.staticLights);
    if (key !== this.lightKey && this.lightmap) {
      this.lightKey = key;
      const data = paintLightmap(scene.staticLights, map.width, map.height);
      (this.lightmap.image.data as Uint8Array).set(data);
      this.lightmap.needsUpdate = true;
    }
    // The player's own light always stays; the rest go by distance from the focus.
    const dyn = [...scene.dynamicLights]
      .sort(
        (p, q) =>
          (p.id === 'personal' ? -1e9 : Math.hypot(p.x - view.focusX, p.y - view.focusY)) -
          (q.id === 'personal' ? -1e9 : Math.hypot(q.x - view.focusX, q.y - view.focusY)),
      )
      .slice(0, MAX_DYNAMIC_LIGHTS);
    dyn.forEach((l: SceneLight, i) => {
      this.shared.uDyn.value[i]?.set(l.x, l.y, l.radius, l.intensity);
      this.shared.uDynColor.value[i]?.setHex(l.color);
    });
    this.shared.uDynCount.value = dyn.length;

    // Switch tiles fading open or shut: the old scene dissolves out, the new one in.
    this.updateSwitchFade(scene);

    // Buildings: dissolve, window glow, and no shadow from a shell that is cut open.
    const openness = new Map<string, number>();
    for (const it of scene.items)
      if (it.type === 'roof') openness.set(it.roof.locationId, it.openness);
    this.openness = openness;
    const shadows = this.quality.shadowMap > 0;
    for (const s of this.outgoing ? [this.stat, this.outgoing] : [this.stat]) {
      for (const bm of s?.buildings ?? []) {
        const open = openness.get(bm.locationId) ?? 0;
        bm.dissolve.uOpen.value = open;
        for (const m of bm.casters) m.castShadow = s === this.stat && shadows && open < 0.5;
        bm.walls.emissiveIntensity = lampLit(bm.lampId, sky.lampLevel) ? 1.25 : 0;
        bm.roof.emissiveIntensity = map.indoor ? 0 : ROOF_NIGHT_GLOW * (1 - sky.daylight);
      }
    }

    // Entities.
    this.entities.update(ents, scene.moveTarget, scene.placement);

    // Grade.
    let vigColor = 0x000000;
    let vigStrength = 0;
    let tint = sky.tint;
    if (scene.sediment > 0) {
      vigColor = 0x3a1450;
      vigStrength = 0.15 + scene.sediment * 0.4;
    } else if (scene.divine > 0) {
      vigColor = 0xffecbe;
      vigStrength = 0.22;
    }
    if (scene.mood) {
      const g = MOOD_GRADES[scene.mood.kind];
      const k = scene.mood.k;
      // the sediment haze stays readable under a mood: the mood only adds to it
      if (scene.sediment <= 0) {
        vigColor = mix(vigColor, g.vignette, k);
        vigStrength = vigStrength + (g.strength - vigStrength) * k;
      }
      tint = mix(tint, mix(tint, g.tint, 0.6), k);
    }
    this.post.apply({
      tint,
      shade: sky.shade,
      film: pack.film,
      haze: gradeHaze(sky.haze),
      hazeColor,
      vigColor,
      vigStrength,
      flash: 0,
      timeS: scene.timeMs / 1000,
      wet: sky.wet,
      snow: sky.snow,
    });
    this.post.render();
  }

  private updateSwitchFade(scene: Scene): void {
    const sf = scene.switchFade;
    if (!this.outgoing || !this.stat?.role || !this.outgoing.role || !sf) {
      this.disposeOutgoing();
      return;
    }
    const rects = sf.rects.slice(0, MAX_SWITCH_RECTS);
    rects.forEach((r, i) => {
      this.shared.uSwRect.value[i]?.set(r.x, r.y, r.w, r.h);
    });
    this.shared.uSwCount.value = rects.length;
    this.shared.uSwT.value = sf.t;
    this.outgoing.role.uSwMode.value = 1;
    this.stat.role.uSwMode.value = 2;
  }

  /** The far sky and the out-of-bounds fog for this frame (sky.ts). */
  private updateSky(
    scene: Scene,
    ctx: MapContext,
    view: ViewRequest,
    b: ViewBasis,
    sky: SunSky,
    hazeColor: number,
  ): void {
    this.gl.getDrawingBufferSize(this.buffer);
    const bufW = Math.max(1, this.buffer.x);
    const bufH = Math.max(1, this.buffer.y);
    const pr = tierPixelRatio(this.quality, this.dpr);
    const scale = skyPixelScale(bufH, (view.step * pr) / this.dpr);
    const colors = skyColors(sky, sky.daylight, sky.haze, hazeColor);
    const along = view.focusX * b.right[0] + view.focusY * b.right[2];
    const away = (view.focusX * b.away[0] + view.focusY * b.away[2]) * b.sinP;
    const hours = scene.calendar.dayIndex * 24 + scene.calendar.minuteOfDay / 60;
    const horizon = horizonFraction(view.pitch) * bufH;
    const offsets = this.sky.layerSpecs.map((spec) =>
      layerOffset(spec, view.yaw, along, hours, bufW / scale),
    );
    const c = ctx.sky ? celestial(sky.sunDir, view.yaw, sky.daylight) : null;
    const ppu = (pixelsPerUnit(view.step) * pr) / this.dpr;
    this.sky.update({
      bufW,
      bufH,
      scale,
      horizon,
      visibility: ctx.sky ? skyVisibility(view.pitch) : 0,
      zenith: colors.zenith,
      horizonColor: colors.horizon,
      outside: ctx.pack.outside,
      fogColor: mix(ctx.pack.outside, hazeColor, 0.55),
      fog: 0.28 + 0.2 * sky.haze,
      fogOffset: [(along * ppu) / scale, (-away * ppu) / scale],
      // wrapped so the fog noise keeps its precision in long games
      hours: hours % 240,
      stars: colors.stars,
      sun: c
        ? {
            x: bufW / 2 + c.x * SKY_BAND_W * scale,
            y: horizon - c.alt * SKY_BAND_H * 0.8 * scale,
            moon: c.moon,
          }
        : null,
      sunColor: c?.moon ? 0xe8ecf8 : mix(sky.sun, 0xffffff, 0.4),
      layerTint: colors.layerTint,
      offsets,
    });
  }

  private marker(kind: MarkerKind): HTMLCanvasElement {
    let c = this.markers.get(kind);
    if (!c) {
      c = matrixToCanvas(markerMatrix(kind));
      this.markers.set(kind, c);
    }
    return c;
  }

  dispose(): void {
    this.disposeOutgoing();
    if (this.stat) {
      this.scene.remove(this.stat.group);
      this.stat.dispose();
      this.stat = null;
    }
    this.entities.dispose();
    this.sky.dispose();
    this.lightmap?.dispose();
    this.post.dispose();
    this.gl.dispose();
    this.gl.forceContextLoss();
    this.gl.domElement.remove();
    this.canvas.remove();
  }
}
