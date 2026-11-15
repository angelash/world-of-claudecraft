// Screen-space weather and ambience over the HD-2D scene (art_pipeline.md 2.8): rain
// streaks and splashes, snow, ash and embers, a drifting fog layer, storm lightning, the
// rising motes of sediment and of the divine court. Particles come from the shared pure
// weather module, laid out in sprite pixels and scaled by the zoom step, anchored to the
// camera focus so they drift with the world. With reduced motion there are fewer
// particles and lightning never flashes the whole screen.

import { TILE_PX } from '../render/camera';
import { matrixToCanvas } from '../render/canvas_util';
import type { Scene } from '../render/scene';
import { fogNoise, lightningFlash, moteParticles, weatherParticles } from '../render/weather_fx';
import { type ViewRequest, viewBasis } from './view';

const COLORS: Record<string, string> = {
  rain: '#a8c4e8',
  splash: '#c8dcf4',
  snow: '#ffffff',
  ash: '#8a827c',
  ember: '#ff8a3a',
};

let fogTile: HTMLCanvasElement | null = null;

export function paintWeatherOverlay(
  c: CanvasRenderingContext2D,
  scene: Scene,
  view: ViewRequest,
  deviceW: number,
  deviceH: number,
  reducedMotion = false,
): void {
  const z = view.step;
  const LW = Math.ceil(deviceW / z);
  const LH = Math.ceil(deviceH / z);
  // Anchor the particles to the focus as seen on screen (camera turn and tilt included).
  const b = viewBasis(view.pitch, view.yaw);
  const along = view.focusX * b.right[0] + view.focusY * b.right[2];
  const away = (view.focusX * b.away[0] + view.focusY * b.away[2]) * b.sinP;
  const pv = {
    w: LW,
    h: LH,
    camX: Math.round(along * TILE_PX),
    camY: Math.round(-away * TILE_PX),
  };
  if (scene.weather === 'fog') {
    if (!fogTile) fogTile = matrixToCanvas(fogNoise());
    const fw = deviceW * 1.6;
    const fh = deviceH * 1.4;
    const off = ((scene.timeMs / 90 + pv.camX * 0.5 * z) % fw) - fw;
    // Light enough that selection rings and placement tiles under it stay readable.
    c.globalAlpha = 0.35;
    c.imageSmoothingEnabled = true;
    c.drawImage(fogTile, off, -deviceH * 0.2, fw, fh);
    c.drawImage(fogTile, off + fw, -deviceH * 0.2, fw, fh);
    c.globalAlpha = 1;
  }
  const parts = weatherParticles(scene.weather, scene.timeMs, pv, reducedMotion ? 0.4 : 1);
  for (const p of parts) {
    c.globalAlpha = p.alpha;
    c.fillStyle = COLORS[p.kind] ?? '#ffffff';
    if (p.kind === 'rain') {
      for (let i = 0; i < p.size; i++)
        c.fillRect(Math.round(p.x - i * 0.25) * z, Math.round(p.y - i) * z, z, z);
    } else if (p.kind === 'splash') {
      c.fillRect((Math.round(p.x) - 1) * z, Math.round(p.y) * z, z, z);
      c.fillRect((Math.round(p.x) + 1) * z, Math.round(p.y) * z, z, z);
    } else {
      c.fillRect(Math.round(p.x) * z, Math.round(p.y) * z, p.size * z, p.size * z);
    }
  }
  c.globalAlpha = 1;
  if (scene.sediment > 0) {
    c.fillStyle = '#9a5ac8';
    for (const p of moteParticles(scene.timeMs, pv, scene.sediment, 3)) {
      c.globalAlpha = p.alpha * 0.8;
      c.fillRect(Math.round(p.x) * z, Math.round(p.y) * z, p.size * z, p.size * z);
    }
  }
  if (scene.divine > 0) {
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = '#fff0c0';
    for (const p of moteParticles(scene.timeMs, pv, scene.divine, 9)) {
      c.globalAlpha = p.alpha * 0.7;
      c.fillRect(Math.round(p.x) * z, Math.round(p.y) * z, p.size * z, p.size * z);
    }
    c.globalCompositeOperation = 'source-over';
  }
  c.globalAlpha = 1;
  if (scene.weather === 'storm' && !reducedMotion) {
    const flash = lightningFlash(scene.timeMs);
    if (flash > 0) {
      c.globalAlpha = flash * 0.85;
      c.fillStyle = '#e8f0ff';
      c.fillRect(0, 0, deviceW, deviceH);
      c.globalAlpha = 1;
    }
  }
}
