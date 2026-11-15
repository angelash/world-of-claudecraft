// Weather and ambience particles (art_pipeline.md 2.8): rain streaks and splashes,
// snow, drifting ash with embers, a scrolling fog noise field, storm lightning, and the
// rising motes of sediment (dian) and the divine court. Every particle is a pure
// function of time and index, so nothing is stored and frames are reproducible.

import type { Weather } from '../../systems/world/types';
import { createMatrix, hash3, type PixelMatrix } from '../sprites/pixels';

export type ParticleKind = 'rain' | 'splash' | 'snow' | 'ash' | 'ember' | 'mote';

export interface Particle {
  kind: ParticleKind;
  /** logical (world-pixel) canvas coordinates */
  x: number;
  y: number;
  size: number;
  alpha: number;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

export interface ParticleView {
  /** logical canvas size */
  w: number;
  h: number;
  /** integer camera world-pixel origin, so particles stay attached to the world */
  camX: number;
  camY: number;
}

export function weatherParticles(
  weather: Weather,
  tMs: number,
  view: ParticleView,
  density = 1,
): Particle[] {
  const out: Particle[] = [];
  const t = tMs / 1000;
  const W = view.w + 32;
  const H = view.h + 32;
  const area = view.w * view.h;
  if (weather === 'rain' || weather === 'storm') {
    const n = Math.round((area / (weather === 'storm' ? 520 : 900)) * density);
    for (let i = 0; i < n; i++) {
      const h = hash3(i, 17, 3);
      const speed = 240 + (h % 90);
      const x = mod((h >>> 3) - speed * 0.25 * t - view.camX, W) - 16;
      const y = mod((h >>> 13) + speed * t - view.camY, H) - 16;
      out.push({ kind: 'rain', x, y, size: 4 + (h % 3), alpha: 0.55 });
    }
    const splashes = Math.round(n / 5);
    const cycle = Math.floor(tMs / 260);
    for (let i = 0; i < splashes; i++) {
      const h = hash3(i, cycle, 29);
      out.push({
        kind: 'splash',
        x: mod(h - view.camX, W) - 16,
        y: mod((h >>> 11) - view.camY, H) - 16,
        size: 1 + (h % 2),
        alpha: 0.6,
      });
    }
  } else if (weather === 'snow') {
    const n = Math.round((area / 1100) * density);
    for (let i = 0; i < n; i++) {
      const h = hash3(i, 23, 5);
      const speed = 16 + (h % 18);
      const sway = Math.sin(t * (0.6 + (h % 7) * 0.1) + (h % 628) / 100) * 6;
      out.push({
        kind: 'snow',
        x: mod((h >>> 3) + sway - view.camX, W) - 16,
        y: mod((h >>> 13) + speed * t - view.camY, H) - 16,
        size: h % 5 === 0 ? 2 : 1,
        alpha: 0.9,
      });
    }
  } else if (weather === 'ashfall') {
    const n = Math.round((area / 1300) * density);
    for (let i = 0; i < n; i++) {
      const h = hash3(i, 31, 7);
      const speed = 8 + (h % 12);
      const sway = Math.sin(t * 0.5 + (h % 628) / 100) * 9;
      const ember = i % 9 === 0;
      out.push({
        kind: ember ? 'ember' : 'ash',
        x: mod((h >>> 3) + sway + 4 * t - view.camX, W) - 16,
        y: mod((h >>> 13) + speed * t - view.camY, H) - 16,
        size: ember ? 1 : 1 + (h % 2),
        alpha: ember ? 0.5 + 0.5 * Math.abs(Math.sin(t * 3 + i)) : 0.7,
      });
    }
  }
  return out;
}

/** Rising motes for map ambience: sediment haze or divine light. */
export function moteParticles(
  tMs: number,
  view: ParticleView,
  intensity: number,
  salt: number,
): Particle[] {
  const out: Particle[] = [];
  if (intensity <= 0) return out;
  const t = tMs / 1000;
  const W = view.w + 32;
  const H = view.h + 32;
  const n = Math.round(((view.w * view.h) / 2600) * Math.min(1.5, intensity));
  for (let i = 0; i < n; i++) {
    const h = hash3(i, salt, 41);
    const speed = 5 + (h % 8);
    const sway = Math.sin(t * 0.7 + (h % 628) / 100) * 4;
    out.push({
      kind: 'mote',
      x: mod((h >>> 3) + sway - view.camX, W) - 16,
      y: mod((h >>> 13) - speed * t - view.camY, H) - 16,
      size: h % 4 === 0 ? 2 : 1,
      alpha: 0.35 + 0.4 * Math.abs(Math.sin(t * 1.3 + i)),
    });
  }
  return out;
}

/** Storm lightning: brief deterministic flashes, 0 when dark. */
export function lightningFlash(tMs: number): number {
  const period = 6500;
  const idx = Math.floor(tMs / period);
  const h = hash3(idx, 91, 13);
  if (h % 3 !== 0) return 0;
  const at = (h >>> 8) % (period - 600);
  const dt = tMs - idx * period - at;
  if (dt < 0 || dt > 260) return 0;
  return dt < 90 ? 0.55 : dt < 140 ? 0.1 : dt < 200 ? 0.4 : 0.15;
}

/** Soft value-noise alpha field for fog, drawn stretched and scrolled by the renderer. */
export function fogNoise(w = 48, h = 32, seed = 7): PixelMatrix {
  const m = createMatrix(w, h);
  const cell = 6;
  const v = (x: number, y: number) => (hash3(x, y, seed) % 1000) / 1000;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / cell;
      const gy = y / cell;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const fx = gx - x0;
      const fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const wrapX = Math.ceil(w / cell);
      const wrapY = Math.ceil(h / cell);
      const a = v(x0 % wrapX, y0 % wrapY);
      const b = v((x0 + 1) % wrapX, y0 % wrapY);
      const c = v(x0 % wrapX, (y0 + 1) % wrapY);
      const d = v((x0 + 1) % wrapX, (y0 + 1) % wrapY);
      const n = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
      const i = (y * w + x) * 4;
      m.rgba[i] = 226;
      m.rgba[i + 1] = 230;
      m.rgba[i + 2] = 236;
      m.rgba[i + 3] = Math.round(40 + n * 120);
    }
  }
  return m;
}
