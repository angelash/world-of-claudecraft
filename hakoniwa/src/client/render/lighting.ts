// Day, night and weather tint for the world layer (art_pipeline_2d.md 1.10). The kernel's
// daylight() drives the main factor; four weights (day, golden hour, blue hour, night)
// pick the multiply tint, weather greys it, and lamps light up progressively by a
// per-light hashed threshold. Pure; Node-tested.

import { type Calendar, daylight } from '../../core/time';
import type { Weather } from '../../systems/world/types';
import { mix } from '../sprites/palette';
import { hashString, type Rgb } from '../sprites/pixels';

export interface LightWeights {
  day: number;
  golden: number;
  blue: number;
  night: number;
}

export interface LightingParams {
  daylight: number;
  weights: LightWeights;
  /** multiply colour applied to the whole world layer (the light map's ambient) */
  tint: Rgb;
  /** 0..1: how far into the evening lamps are lit */
  lampLevel: number;
  /** a small light around the player at night so their surroundings stay readable */
  personalLight: boolean;
}

const COLORS = {
  day: 0xffffff,
  golden: 0xffd09a,
  blue: 0x8c9ee0,
  night: 0x34427a,
  indoor: 0xfff0dc,
};

const WEATHER_TINT: Record<Weather, [Rgb, number]> = {
  clear: [0xffffff, 0],
  cloudy: [0xb8bcc8, 0.2],
  rain: [0x98a4b8, 0.3],
  storm: [0x76829a, 0.42],
  fog: [0xd4d8e0, 0.16],
  snow: [0xe2eaf6, 0.12],
  ashfall: [0xb08a74, 0.32],
};

function bump(h: number, centre: number, width: number): number {
  return Math.max(0, 1 - Math.abs(h - centre) / width);
}

export function lightWeights(cal: Calendar): LightWeights {
  const d = daylight(cal);
  const h = cal.minuteOfDay / 60;
  const golden =
    Math.min(1, Math.max(bump(h, 7.3, 1.3), bump(h, 18.2, 1.4))) * Math.min(1, d * 1.5);
  const blue = Math.max(bump(h, 5.2, 1), bump(h, 20.3, 1.1));
  return { day: d * (1 - golden), golden, blue, night: 1 - d };
}

export function lightingAt(cal: Calendar, weather: Weather, indoor: boolean): LightingParams {
  const d = daylight(cal);
  const weights = lightWeights(cal);
  if (indoor) {
    return {
      daylight: d,
      weights,
      tint: mix(COLORS.indoor, COLORS.night, 0.28 * (1 - d)),
      lampLevel: 1,
      personalLight: false,
    };
  }
  let tint = mix(COLORS.night, COLORS.day, d);
  tint = mix(tint, COLORS.golden, weights.golden * 0.5);
  tint = mix(tint, COLORS.blue, weights.blue * 0.35 * (1 - d * 0.5));
  const [wc, wk] = WEATHER_TINT[weather] ?? WEATHER_TINT.clear;
  tint = mix(tint, mix(wc, COLORS.night, 1 - d), wk);
  return {
    daylight: d,
    weights,
    tint,
    lampLevel: Math.max(0, Math.min(1, (1 - d) * 1.5)),
    personalLight: d < 0.65,
  };
}

/** Whether a lamp with this id is lit at the given lamp level (staggered lighting-up). */
export function lampLit(id: string, lampLevel: number): boolean {
  if (lampLevel <= 0) return false;
  const threshold = (hashString(id) % 1000) / 1000;
  return lampLevel >= 0.15 + threshold * 0.8;
}

export const LIGHT_COLORS = {
  lamp: 0xffc878,
  hearth: 0xffa858,
  player: 0xd8d0b8,
  divine: 0xfff2c8,
  spirit: 0xb8e4ff,
};
