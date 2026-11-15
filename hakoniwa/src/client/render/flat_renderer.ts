// The flat Canvas2D renderer (art_pipeline.md 2.1): the fallback when WebGL is missing or
// the player picks the flat quality tier. The world is seen straight from above and drawn
// at one world pixel per canvas pixel into a low-resolution canvas (ground, shadows,
// depth-sorted sprites and standees, roofs, weather, light map), then upscaled by the
// integer zoom with nearest-neighbour sampling and the camera's sub-pixel remainder as a
// device offset. It reads the same scene, map context and style pack as the HD-2D scene;
// names, markers and bubbles come from the shared overlay painter.

import type { StandeePlacement } from '../hd2d/layout';
import type { QualitySettings } from '../hd2d/quality';
import { propColorsOf } from '../hd2d/style_packs';
import { toCss } from '../sprites/palette';
import { BAYER4 } from '../sprites/pixels';
import { SpriteCache } from '../sprites/sprite_cache';
import {
  type Camera,
  clampZoom,
  followCamera,
  logicalSize,
  screenToWorld,
  snapCamera,
  TILE_PX,
} from './camera';
import { ctx2d, ensureSize, makeCanvas, matrixToCanvas } from './canvas_util';
import { decorSprite, shopSignSprite } from './decor_art';
import { MOVE_PULSE_MS } from './frame_signals';
import type { MapContext } from './map_context';
import { markerMatrix } from './markers';
import { paintOverlays } from './overlay_painter';
import type { HitBox, WorldRenderer } from './renderer';
import { dissolveLevel, roofPixels } from './roofs';
import type { Scene, SceneEntity, SceneLight } from './scene';
import { bakeGround, propSprite, WATER_FRAMES } from './tile_art';
import { fogNoise, lightningFlash, moteParticles, weatherParticles } from './weather_fx';

const VOID_COLOR = '#101018';
const RELATION_RING: Record<string, string> = {
  self: '#f0e6c8',
  hostile: '#e0503c',
  friendly: '#6cd06a',
  neutral: '#e8c84a',
};

export class FlatWorldRenderer implements WorldRenderer {
  readonly kind = 'flat' as const;
  readonly canvas: HTMLCanvasElement;
  deviceW = 1;
  deviceH = 1;
  dpr = 1;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly world = makeCanvas(1, 1);
  private readonly wctx = ctx2d(this.world);
  private readonly light = makeCanvas(1, 1);
  private readonly lctx = ctx2d(this.light);
  private readonly scratch = makeCanvas(1, 1);
  private readonly sctx = ctx2d(this.scratch);
  private ground: HTMLCanvasElement[] = [];
  private mapId = '';
  private ctxMap: MapContext | null = null;
  private camera: Camera | null = null;
  private readonly roofCanvases = new Map<string, HTMLCanvasElement>();
  private readonly sprites = new SpriteCache();
  private readonly props = new Map<string, { canvas: HTMLCanvasElement; ax: number; ay: number }>();
  private readonly markers = new Map<string, HTMLCanvasElement>();
  private readonly shadows = new Map<number, HTMLCanvasElement>();
  private readonly dissolve: HTMLCanvasElement[] = [];
  private fog: HTMLCanvasElement | null = null;
  private boxes: HitBox[] = [];
  private readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hk-world';
    this.ctx = ctx2d(this.canvas);
    for (let level = 0; level <= 16; level++) {
      // 4x4 mask with `level` Bayer cells opaque: used to punch dissolving roofs.
      const c = makeCanvas(4, 4);
      const x = ctx2d(c);
      x.fillStyle = '#000';
      for (let i = 0; i < 16; i++) {
        if ((BAYER4[i] as number) < level) x.fillRect(i % 4, Math.floor(i / 4), 1, 1);
      }
      this.dissolve.push(c);
    }
  }

  mount(parent: HTMLElement): void {
    parent.prepend(this.canvas);
  }

  setQuality(_q: QualitySettings): void {
    // The flat renderer has no optional effects; the tier only selects it.
  }

  screenToGround(sx: number, sy: number): { x: number; y: number } | null {
    return this.camera ? screenToWorld(this.camera, sx, sy) : null;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr;
    this.deviceW = Math.max(1, Math.round(cssW * dpr));
    this.deviceH = Math.max(1, Math.round(cssH * dpr));
    ensureSize(this.canvas, this.deviceW, this.deviceH);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.ctx.imageSmoothingEnabled = false;
  }

  setMap(ctx: MapContext): void {
    if (this.mapId === ctx.map.id && this.ground.length) return;
    this.mapId = ctx.map.id;
    this.ctxMap = ctx;
    this.ground = [];
    for (let f = 0; f < WATER_FRAMES; f++) {
      this.ground.push(matrixToCanvas(bakeGround(ctx.map, f, { ramps: ctx.pack.ground })));
    }
    this.roofCanvases.clear();
    this.props.clear();
  }

  hitBoxes(): readonly HitBox[] {
    return this.boxes;
  }

  dispose(): void {
    this.sprites.clear();
    this.roofCanvases.clear();
    this.ground = [];
    this.canvas.remove();
  }

  /**
   * One canvas holds every layer, so a frame the scheduler marks dirty for either layer
   * repaints the whole picture; between dirty frames the canvas keeps the last one.
   */
  render(scene: Scene): void {
    const map = scene.map;
    const zoom = clampZoom(scene.view.step);
    const at = followCamera(
      { x: scene.view.focusX, y: scene.view.focusY },
      map.width,
      map.height,
      this.deviceW,
      this.deviceH,
      zoom,
    );
    const cam: Camera = { zoom, x: at.x, y: at.y, viewW: this.deviceW, viewH: this.deviceH };
    this.camera = cam;
    const { ix, iy, ox, oy } = snapCamera(cam);
    const { w: LW, h: LH } = logicalSize(cam.viewW, cam.viewH, cam.zoom);
    ensureSize(this.world, LW, LH);
    const w = this.wctx;
    w.globalCompositeOperation = 'source-over';
    w.globalAlpha = 1;
    w.fillStyle = VOID_COLOR;
    w.fillRect(0, 0, LW, LH);
    const frame = Math.floor(scene.timeMs / 650) % WATER_FRAMES;
    const ground = this.ground[frame] ?? this.ground[0];
    if (ground) w.drawImage(ground, -ix, -iy);

    const boxes: HitBox[] = [];
    // Contact shadows and selection rings under every entity.
    for (const it of scene.items) {
      if (it.type !== 'entity') continue;
      const lx = Math.round(it.x * TILE_PX) - ix;
      const ly = Math.round(it.y * TILE_PX) - iy;
      const width = it.look.archetype === 'golem' ? 22 : it.look.archetype === 'wolf' ? 18 : 12;
      const sw = Math.round(width * it.look.scale);
      w.drawImage(this.shadow(sw), lx - Math.floor(sw / 2), ly - 2);
      if (it.selected || it.hovered) this.ring(lx, ly, sw + 6, it);
    }
    if (scene.moveTarget) {
      const lx = Math.round(scene.moveTarget.x * TILE_PX) - ix;
      const ly = Math.round(scene.moveTarget.y * TILE_PX) - iy;
      const k = Math.max(0, 1 - scene.moveTarget.ageMs / MOVE_PULSE_MS);
      if (k > 0) {
        w.globalAlpha = k;
        w.fillStyle = '#f0e6c8';
        const r = 2 + Math.round((1 - k) * 3);
        w.fillRect(lx - r, ly, 1, 1);
        w.fillRect(lx + r, ly, 1, 1);
        w.fillRect(lx, ly - r, 1, 1);
        w.fillRect(lx, ly + r, 1, 1);
        w.globalAlpha = 1;
      }
    }

    if (scene.placement) this.drawPlacement(scene.placement, ix, iy);

    // Depth-sorted sprites, props and roofs.
    for (const it of scene.items) {
      if (it.type === 'entity') {
        const { canvas, frame: f } = this.sprites.get(
          it.look,
          it.anim.anim,
          it.anim.dir,
          it.anim.frame,
        );
        const lx = Math.round(it.x * TILE_PX) - ix;
        const ly = Math.round(it.y * TILE_PX) - iy;
        const dx = lx - f.anchorX;
        const dy = ly - f.anchorY;
        if (dx > LW || dy > LH || dx + canvas.width < 0 || dy + canvas.height < 0) continue;
        w.drawImage(canvas, dx, dy);
        const top = ly - f.height;
        const bw = Math.max(10, Math.round(14 * it.look.scale));
        boxes.push({
          id: it.id,
          x: (lx - bw / 2) * cam.zoom + ox,
          y: top * cam.zoom + oy,
          w: bw * cam.zoom,
          h: (ly - top + 2) * cam.zoom,
          sortY: it.sortY,
        });
      } else if (it.type === 'prop') {
        const p = this.prop(it.placement);
        if (!p) continue;
        const lx = Math.round(it.placement.x * TILE_PX) - ix;
        const ly = Math.round((it.placement.y - (it.placement.lift ?? 0)) * TILE_PX) - iy;
        w.drawImage(p.canvas, lx - p.ax, ly - p.ay);
      } else {
        if (it.openness >= 1) continue;
        const rc = this.roof(it.roof);
        const rx = it.roof.x * TILE_PX - ix;
        const ry = it.roof.y * TILE_PX - iy;
        const level = dissolveLevel(it.openness);
        if (level === 0) w.drawImage(rc, rx, ry);
        else {
          ensureSize(this.scratch, rc.width, rc.height);
          const s = this.sctx;
          s.globalCompositeOperation = 'source-over';
          s.clearRect(0, 0, rc.width, rc.height);
          s.drawImage(rc, 0, 0);
          s.globalCompositeOperation = 'destination-out';
          const pat = s.createPattern(this.dissolve[level] as HTMLCanvasElement, 'repeat');
          if (pat) {
            // Roofs start on tile boundaries (multiples of 4), so the dither stays world-aligned.
            s.fillStyle = pat;
            s.fillRect(0, 0, rc.width, rc.height);
          }
          s.globalCompositeOperation = 'source-over';
          w.drawImage(this.scratch, 0, 0, rc.width, rc.height, rx, ry, rc.width, rc.height);
        }
      }
    }
    this.boxes = boxes;

    // Weather and fog (before lighting, so night darkens them too).
    const view = { w: LW, h: LH, camX: ix, camY: iy };
    if (scene.weather === 'fog') this.drawFog(scene.timeMs, LW, LH, ix, 0.85);
    const parts = weatherParticles(scene.weather, scene.timeMs, view, this.reducedMotion ? 0.4 : 1);
    for (const p of parts) {
      w.globalAlpha = p.alpha;
      if (p.kind === 'rain') {
        w.fillStyle = '#a8c4e8';
        for (let i = 0; i < p.size; i++)
          w.fillRect(Math.round(p.x - i * 0.25), Math.round(p.y - i), 1, 1);
      } else if (p.kind === 'splash') {
        w.fillStyle = '#c8dcf4';
        w.fillRect(Math.round(p.x) - 1, Math.round(p.y), 1, 1);
        w.fillRect(Math.round(p.x) + 1, Math.round(p.y), 1, 1);
      } else if (p.kind === 'snow') {
        w.fillStyle = '#ffffff';
        w.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      } else if (p.kind === 'ash') {
        w.fillStyle = '#8a827c';
        w.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      } else if (p.kind === 'ember') {
        w.fillStyle = '#ff8a3a';
        w.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
    }
    w.globalAlpha = 1;
    if (scene.sediment > 0) {
      w.fillStyle = '#6a3a8a';
      for (const p of moteParticles(scene.timeMs, view, scene.sediment, 3)) {
        w.globalAlpha = p.alpha * 0.8;
        w.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      w.globalAlpha = 1;
    }

    this.applyLighting(scene, LW, LH, ix, iy);

    // Emissive after lighting: divine motes, glows, lightning, sediment vignette.
    if (scene.divine > 0) {
      w.globalCompositeOperation = 'lighter';
      w.fillStyle = '#fff0c0';
      for (const p of moteParticles(scene.timeMs, view, scene.divine, 9)) {
        w.globalAlpha = p.alpha * 0.7;
        w.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      w.globalAlpha = 1;
      w.globalCompositeOperation = 'source-over';
    }
    for (const it of scene.items) {
      if (it.type !== 'entity') continue;
      const f = this.sprites.get(it.look, it.anim.anim, it.anim.dir, it.anim.frame).frame;
      if (!f.glow) continue;
      const lx = Math.round(it.x * TILE_PX) - ix;
      const ly = Math.round(it.y * TILE_PX) - iy - Math.round(f.height / 2);
      this.glow(lx, ly, f.glow.radius, f.glow.color, 0.35 + 0.08 * Math.sin(scene.timeMs / 400));
    }
    if (scene.weather === 'storm' && !this.reducedMotion) {
      const flash = lightningFlash(scene.timeMs);
      if (flash > 0) {
        w.globalAlpha = flash;
        w.fillStyle = '#e8f0ff';
        w.fillRect(0, 0, LW, LH);
        w.globalAlpha = 1;
      }
    }
    if (scene.sediment > 0) this.vignette(LW, LH, 'rgba(58,20,80,', 0.15 + scene.sediment * 0.4);
    if (scene.divine > 0) this.vignette(LW, LH, 'rgba(255,236,190,', 0.22);

    // Upscale to the screen.
    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = VOID_COLOR;
    c.fillRect(0, 0, this.deviceW, this.deviceH);
    c.drawImage(this.world, ox, oy, LW * cam.zoom, LH * cam.zoom);

    paintOverlays(c, scene, {
      scale: cam.zoom,
      project: (x, h, y) => ({
        x: (Math.round(x * TILE_PX) - ix) * cam.zoom + ox,
        y: (Math.round(y * TILE_PX) - iy - h * TILE_PX) * cam.zoom + oy,
      }),
      dpr: this.dpr,
      frameOf: (e: SceneEntity) =>
        this.sprites.get(e.look, e.anim.anim, e.anim.dir, e.anim.frame).frame,
      marker: (kind) => this.marker(kind),
    });
  }

  /** Placement preview: footprint tiles green or red, blocked tiles darker, the entrance gold. */
  private drawPlacement(pl: NonNullable<Scene['placement']>, ix: number, iy: number): void {
    const w = this.wctx;
    const blocked = new Set(pl.blocked.map((t) => `${t.x},${t.y}`));
    for (const t of pl.tiles) {
      const bad = !pl.ok && (blocked.size === 0 || blocked.has(`${t.x},${t.y}`));
      w.fillStyle = pl.ok
        ? 'rgba(96,220,110,0.38)'
        : bad
          ? 'rgba(230,70,60,0.5)'
          : 'rgba(230,170,60,0.3)';
      w.fillRect(t.x * TILE_PX - ix, t.y * TILE_PX - iy, TILE_PX, TILE_PX);
      w.fillStyle = pl.ok ? 'rgba(160,255,170,0.8)' : 'rgba(255,140,120,0.8)';
      w.fillRect(t.x * TILE_PX - ix, t.y * TILE_PX - iy, TILE_PX, 1);
      w.fillRect(t.x * TILE_PX - ix, t.y * TILE_PX - iy, 1, TILE_PX);
    }
    for (const t of pl.blocked) {
      if (pl.tiles.some((x) => x.x === t.x && x.y === t.y)) continue;
      w.fillStyle = 'rgba(230,70,60,0.45)';
      w.fillRect(t.x * TILE_PX - ix, t.y * TILE_PX - iy, TILE_PX, TILE_PX);
    }
    if (pl.entrance) {
      w.fillStyle = 'rgba(242,201,76,0.85)';
      w.fillRect(pl.entrance.x * TILE_PX - ix + 5, pl.entrance.y * TILE_PX - iy + 5, 6, 6);
    }
  }

  private applyLighting(scene: Scene, LW: number, LH: number, ix: number, iy: number): void {
    const { tint } = scene.lighting;
    const lights = [...scene.staticLights, ...scene.dynamicLights];
    if (tint === 0xffffff && lights.length === 0) return;
    ensureSize(this.light, LW, LH);
    const l = this.lctx;
    l.globalCompositeOperation = 'source-over';
    l.fillStyle = toCss(tint);
    l.fillRect(0, 0, LW, LH);
    l.globalCompositeOperation = 'lighter';
    const dark =
      1 -
      Math.min(1, ((tint >> 16) & 0xff) / 255 + ((tint >> 8) & 0xff) / 255 + (tint & 0xff) / 255) /
        3;
    for (const light of lights) this.paintLight(l, light, ix, iy, Math.max(0.15, dark));
    l.globalCompositeOperation = 'source-over';
    const w = this.wctx;
    w.globalCompositeOperation = 'multiply';
    w.drawImage(this.light, 0, 0);
    w.globalCompositeOperation = 'source-over';
  }

  /** Stepped radial light (three bands, the quantised falloff of art_pipeline.md 2.7). */
  private paintLight(
    l: CanvasRenderingContext2D,
    light: SceneLight,
    ix: number,
    iy: number,
    k: number,
  ): void {
    const x = light.x * TILE_PX - ix;
    const y = light.y * TILE_PX - iy;
    const r = light.radius * TILE_PX;
    const a = Math.max(0, Math.min(1, light.intensity * k * 1.4));
    const col = (m: number) => toCss(light.color, a * m);
    const g = l.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col(1));
    g.addColorStop(0.4, col(1));
    g.addColorStop(0.41, col(0.62));
    g.addColorStop(0.7, col(0.62));
    g.addColorStop(0.71, col(0.3));
    g.addColorStop(1, col(0));
    l.fillStyle = g;
    l.fillRect(Math.floor(x - r), Math.floor(y - r), Math.ceil(r * 2), Math.ceil(r * 2));
  }

  private glow(x: number, y: number, r: number, color: number, a: number): void {
    const w = this.wctx;
    w.globalCompositeOperation = 'lighter';
    const g = w.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, toCss(color, a));
    g.addColorStop(0.5, toCss(color, a * 0.45));
    g.addColorStop(1, toCss(color, 0));
    w.fillStyle = g;
    w.fillRect(x - r, y - r, r * 2, r * 2);
    w.globalCompositeOperation = 'source-over';
  }

  private vignette(LW: number, LH: number, rgbaPrefix: string, strength: number): void {
    const w = this.wctx;
    const g = w.createRadialGradient(
      LW / 2,
      LH / 2,
      Math.min(LW, LH) * 0.35,
      LW / 2,
      LH / 2,
      Math.max(LW, LH) * 0.7,
    );
    g.addColorStop(0, `${rgbaPrefix}0)`);
    g.addColorStop(1, `${rgbaPrefix}${strength.toFixed(3)})`);
    w.fillStyle = g;
    w.fillRect(0, 0, LW, LH);
  }

  private drawFog(tMs: number, LW: number, LH: number, ix: number, strength: number): void {
    if (!this.fog) this.fog = matrixToCanvas(fogNoise());
    const w = this.wctx;
    const fw = LW * 1.6;
    const fh = LH * 1.4;
    const off = ((tMs / 90 + ix * 0.5) % fw) - fw;
    w.globalAlpha = strength;
    w.imageSmoothingEnabled = true;
    w.drawImage(this.fog, off, -LH * 0.2, fw, fh);
    w.drawImage(this.fog, off + fw, -LH * 0.2, fw, fh);
    w.imageSmoothingEnabled = false;
    w.globalAlpha = 1;
  }

  private ring(lx: number, ly: number, width: number, it: SceneEntity): void {
    const w = this.wctx;
    w.fillStyle = it.selected
      ? (RELATION_RING[it.relation] ?? '#ffffff')
      : 'rgba(255,255,255,0.55)';
    const rx = width / 2;
    const ry = Math.max(2, Math.round(width / 5));
    for (let a = 0; a < 48; a++) {
      const t = (a / 48) * Math.PI * 2;
      w.fillRect(Math.round(lx + Math.cos(t) * rx), Math.round(ly + Math.sin(t) * ry), 1, 1);
    }
  }

  private shadow(width: number): HTMLCanvasElement {
    let c = this.shadows.get(width);
    if (c) return c;
    const h = Math.max(3, Math.round(width / 3));
    c = makeCanvas(width, h);
    const x = ctx2d(c);
    x.fillStyle = 'rgba(20,16,30,0.32)';
    const rx = width / 2;
    const ry = h / 2;
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < width; xx++) {
        const dx = (xx + 0.5 - rx) / rx;
        const dy = (yy + 0.5 - ry) / ry;
        if (dx * dx + dy * dy <= 1) x.fillRect(xx, yy, 1, 1);
      }
    }
    this.shadows.set(width, c);
    return c;
  }

  private prop(pl: StandeePlacement): { canvas: HTMLCanvasElement; ax: number; ay: number } | null {
    const key = `${pl.source}:${pl.kind}:${pl.variant % 3}`;
    let p = this.props.get(key);
    if (!p) {
      const pack = this.ctxMap?.pack;
      const s =
        pl.source === 'tree' || pl.source === 'rock'
          ? propSprite(pl.source, pl.variant, pack ? propColorsOf(pack) : undefined)
          : pl.source === 'sign'
            ? shopSignSprite(pl.kind as Parameters<typeof shopSignSprite>[0])
            : decorSprite(pl.kind as Parameters<typeof decorSprite>[0], pl.variant);
      if (!s) return null;
      p = { canvas: matrixToCanvas(s.matrix), ax: s.anchorX, ay: s.anchorY };
      this.props.set(key, p);
    }
    return p;
  }

  private roof(spec: { locationId: string } & Parameters<typeof roofPixels>[0]): HTMLCanvasElement {
    let c = this.roofCanvases.get(spec.locationId);
    if (!c) {
      c = matrixToCanvas(roofPixels(spec));
      this.roofCanvases.set(spec.locationId, c);
    }
    return c;
  }

  private marker(kind: Parameters<typeof markerMatrix>[0]): HTMLCanvasElement {
    let c = this.markers.get(kind);
    if (!c) {
      c = matrixToCanvas(markerMatrix(kind));
      this.markers.set(kind, c);
    }
    return c;
  }
}
