// Sun, sky and grade for the HD-2D scene (art_pipeline.md 1.8 and 2.7). The four light
// weights of the shared lighting module (day, golden hour, blue hour, night) blend the
// style pack's LightPalette states; weather dims and greys the result; indoor maps use
// the pack's fixed indoor state. The sun crosses the southern sky from east to west, so
// shadows turn with the hour. Pure; Node-tested.

import type { Calendar } from '../../core/time';
import type { Weather } from '../../systems/world/types';
import { lightingAt, lightWeights } from '../render/lighting';
import { mix } from '../sprites/palette';
import type { Rgb } from '../sprites/pixels';
import type { LightState, StylePack } from './style_packs';

export interface SunSky extends LightState {
  /** unit vector from the ground toward the sun (scene axes: x east, y up, z south) */
  sunDir: [number, number, number];
  /** 0..1 daylight factor of the kernel calendar */
  daylight: number;
  /** 0..1, lamps light up progressively as it rises */
  lampLevel: number;
  /** 0..1 how wet surfaces look (rain, storm) */
  wet: number;
  /** 0..1 grey haze (fog, ash, overcast) */
  haze: number;
  /** 0..1 snow brightening */
  snow: number;
}

const WEATHER_DIM: Record<Weather, { k: number; grey: Rgb; wet: number; haze: number }> = {
  clear: { k: 1, grey: 0xffffff, wet: 0, haze: 0 },
  cloudy: { k: 0.72, grey: 0xc4c8d0, wet: 0, haze: 0.15 },
  rain: { k: 0.55, grey: 0xa8b0c0, wet: 0.8, haze: 0.25 },
  storm: { k: 0.42, grey: 0x8a94a8, wet: 1, haze: 0.35 },
  fog: { k: 0.7, grey: 0xd8dce4, wet: 0.2, haze: 0.6 },
  snow: { k: 0.8, grey: 0xe8eef8, wet: 0, haze: 0.25 },
  ashfall: { k: 0.6, grey: 0xb8947a, wet: 0, haze: 0.45 },
};

function blendState(a: LightState, b: LightState, t: number): LightState {
  return {
    sun: mix(a.sun, b.sun, t),
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t,
    sky: mix(a.sky, b.sky, t),
    ground: mix(a.ground, b.ground, t),
    hemiIntensity: a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * t,
    tint: mix(a.tint, b.tint, t),
    shade: mix(a.shade, b.shade, t),
  };
}

/**
 * Light direction for an hour. By day the sun rises in the east (05:00), stands in the
 * south at noon and sets in the west (21:00); by night the moon carries on from west back
 * to east across the southern sky, so shadows turn smoothly through the whole day.
 */
export function sunDirection(hour: number, daylight: number): [number, number, number] {
  const h = ((hour % 24) + 24) % 24;
  let az: number;
  let y: number;
  if (h >= 5 && h <= 21) {
    const t = (h - 5) / 16;
    az = Math.PI * t; // 0 east .. PI west
    y = Math.max(0.25, (0.22 + 0.9 * Math.sin(Math.PI * t)) * Math.max(0.35, daylight));
  } else {
    const t = ((h - 21 + 24) % 24) / 8;
    az = Math.PI * (1 - t); // PI west .. 0 east
    y = 0.25 + 0.3 * Math.sin(Math.PI * t);
  }
  const x = Math.cos(az);
  const z = Math.sin(az) * 0.85;
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
}

export function sunSkyAt(
  cal: Calendar,
  weather: Weather,
  indoor: boolean,
  pack: StylePack,
): SunSky {
  const base = lightingAt(cal, weather, indoor);
  const hour = cal.minuteOfDay / 60;
  if (indoor) {
    return {
      ...pack.light.indoor,
      sunDir: [0.35, 0.85, 0.4],
      daylight: base.daylight,
      lampLevel: 1,
      wet: 0,
      haze: 0,
      snow: 0,
    };
  }
  const w = lightWeights(cal);
  let s = blendState(pack.light.night, pack.light.day, base.daylight);
  s = blendState(s, pack.light.golden, w.golden * 0.85);
  s = blendState(s, pack.light.twilight, w.blue * 0.7 * (1 - base.daylight * 0.5));
  const dim = WEATHER_DIM[weather] ?? WEATHER_DIM.clear;
  const k = 1 - (1 - dim.k) * (0.4 + 0.6 * base.daylight);
  s = {
    ...s,
    sunIntensity: s.sunIntensity * k * (weather === 'clear' ? 1 : 0.55),
    hemiIntensity: s.hemiIntensity * (0.85 + 0.15 * k),
    sun: mix(s.sun, dim.grey, (1 - dim.k) * 0.6),
    sky: mix(s.sky, dim.grey, (1 - dim.k) * 0.7),
    tint: mix(s.tint, mix(dim.grey, s.tint, 0.5), (1 - dim.k) * 0.5),
  };
  return {
    ...s,
    sunDir: sunDirection(hour, base.daylight),
    daylight: base.daylight,
    lampLevel: base.lampLevel,
    wet: dim.wet,
    haze: dim.haze,
    snow: weather === 'snow' ? 1 : 0,
  };
}

/** Two lights blended at t (a cutscene weather change fading over a second). */
export function blendSunSky(a: SunSky, b: SunSky, t: number): SunSky {
  const k = Math.max(0, Math.min(1, t));
  const n = (x: number, y: number) => x + (y - x) * k;
  return {
    ...blendState(a, b, k),
    sunDir: b.sunDir,
    daylight: n(a.daylight, b.daylight),
    lampLevel: b.lampLevel,
    wet: n(a.wet, b.wet),
    haze: n(a.haze, b.haze),
    snow: n(a.snow, b.snow),
  };
}
