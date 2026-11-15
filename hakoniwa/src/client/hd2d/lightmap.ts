// The static light map (art_pipeline.md 2.7): door lamps, street lamps, braziers and the
// hearths of opened buildings painted additively into one world-space texture of
// LIGHTMAP_PX pixels per tile, which ground, walls and standees sample once. Falloff is
// quantised into three steps with an ordered dither on the step edges so light keeps the
// pixel look. The texture is repainted only when the set of lit lights changes. Values
// are stored at half scale so the shader can brighten up to twice. Pure; Node-tested.

import { bayer4 } from '../sprites/pixels';

export const LIGHTMAP_PX = 4;

export interface MapLight {
  id: string;
  /** tiles */
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
}

/** Three-step falloff with a dithered edge between steps; 0 outside the radius. */
export function steppedFalloff(d: number, radius: number, px: number, py: number): number {
  if (radius <= 0 || d >= radius) return 0;
  const f = 1 - d / radius;
  const t = f * 3 + bayer4(px, py) / 16 - 0.5;
  const step = Math.max(0, Math.min(3, Math.floor(t + 0.5)));
  return [0, 0.32, 0.64, 1][step] as number;
}

/** A stable key of the lit set, to skip repainting when nothing changed. */
export function lightsKey(lights: readonly MapLight[]): string {
  return lights
    .map((l) => `${l.id}@${l.x.toFixed(2)},${l.y.toFixed(2)}:${l.intensity.toFixed(2)}`)
    .sort()
    .join('|');
}

/** Paint the lit lights into an RGBA buffer of (w * LIGHTMAP_PX) by (h * LIGHTMAP_PX). */
export function paintLightmap(
  lights: readonly MapLight[],
  mapW: number,
  mapH: number,
  px = LIGHTMAP_PX,
): Uint8Array<ArrayBuffer> {
  const W = mapW * px;
  const H = mapH * px;
  const acc = new Float32Array(W * H * 3);
  for (const l of lights) {
    const r = ((l.color >> 16) & 0xff) / 255;
    const g = ((l.color >> 8) & 0xff) / 255;
    const b = (l.color & 0xff) / 255;
    const x0 = Math.max(0, Math.floor((l.x - l.radius) * px));
    const x1 = Math.min(W - 1, Math.ceil((l.x + l.radius) * px));
    const y0 = Math.max(0, Math.floor((l.y - l.radius) * px));
    const y1 = Math.min(H - 1, Math.ceil((l.y + l.radius) * px));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot((x + 0.5) / px - l.x, (y + 0.5) / px - l.y);
        const k = steppedFalloff(d, l.radius, x, y) * l.intensity;
        if (k <= 0) continue;
        const o = (y * W + x) * 3;
        acc[o] = (acc[o] as number) + r * k;
        acc[o + 1] = (acc[o + 1] as number) + g * k;
        acc[o + 2] = (acc[o + 2] as number) + b * k;
      }
    }
  }
  const out = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    out[i * 4] = Math.min(255, Math.round(((acc[i * 3] as number) / 2) * 255));
    out[i * 4 + 1] = Math.min(255, Math.round(((acc[i * 3 + 1] as number) / 2) * 255));
    out[i * 4 + 2] = Math.min(255, Math.round(((acc[i * 3 + 2] as number) / 2) * 255));
    out[i * 4 + 3] = 255;
  }
  return out;
}
