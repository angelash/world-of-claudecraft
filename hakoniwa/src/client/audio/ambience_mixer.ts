// Ambience mixer (audio_direction.md 6.1, 8.1, 8.4, 10.1): the pure half. From what the map
// registers in the atlas (beds by time of day, a pool of one-shot details, a reverb zone) and
// what the kernel says (weather, sediment grade, dungeon activity, indoors) it builds the five
// layers (base and settlement, fauna, weather, sediment, details) as a set of looping beds with
// a gain and filter each, and schedules the details: every 8 to 20 s one is drawn by weight
// from the pool, placed 15 to 30 m away off camera in a random direction, never the same one
// twice within 30 s. Indoors the outdoor layers drop 12 dB behind a 1.5 kHz low-pass and the
// location's interior bed plays (1 s change). The tables that name the sounds (weather beds,
// sediment beds, interior beds by location kind, detail captions) are data:
// data/audio/ambience.json. Pure: the caller passes the clock and a seeded random source.

import type { Rng } from './sound_player';

/** One registered bed (atlas `ambience`): always, or only by day or by night. */
export type AmbienceBedDef = string | { id: string; time: 'day' | 'night' };
/** One detail of the pool (atlas `ambiencePoints`): weight, and the time of day it may play. */
export interface AmbiencePointDef {
  id: string;
  weight: number;
  time?: 'day' | 'night' | 'dawn';
}

export type AmbienceLayer = 'base' | 'fauna' | 'weather' | 'dian' | 'interior';

export interface AmbienceTable {
  version: 1;
  /** Weather kind to its bed (6.10). */
  weather: Record<string, string>;
  /** Weather kind to extra details (thunder in a storm). */
  weatherPoints: Record<string, AmbiencePointDef[]>;
  /** Sediment beds (6.11): grades two to three, four to five. */
  dian: { low: string; high: string };
  /** Location kind to the interior bed (6.7). */
  interiors: Record<string, string>;
  /** Detail captions (10.4): caption key and level. */
  captions: Record<string, { key: string; level: 'important' | 'all' }>;
}

export interface AmbienceInput {
  beds: readonly AmbienceBedDef[];
  /** Extra beds the director asks for (the low sediment bed at tension 2). */
  extra?: readonly string[];
  night: boolean;
  /** The map is outdoors (weather reaches it). */
  outdoor: boolean;
  weather: string;
  /** Sediment grade 0 to 5 at the listener (6.1). */
  sediment: number;
  /** A dungeon in its active period adds one grade (6.1). */
  activeDungeon?: boolean;
  /** The watch-the-tide door sharpens the sediment layer by 3 dB (6.1). */
  dianSense?: boolean;
  /** The listener stands in a building of this kind (null outdoors). */
  interiorKind: string | null;
}

export interface BedMix {
  id: string;
  layer: AmbienceLayer;
  gainDb: number;
  lowpassHz: number | null;
}

/** Fauna, weather and sediment layers sit 4 dB under the base in the mix (8.1). */
export const LAYER_TRIM_DB = -4;
export const INDOOR_CUT_DB = -12;
export const INDOOR_LOWPASS_HZ = 1500;
export const INDOOR_RAMP_MS = 1000;

const timeOk = (time: 'day' | 'night' | undefined, night: boolean): boolean =>
  !time || (time === 'night') === night;

/** The bed ids that play at this time of day. */
export function bedsAt(beds: readonly AmbienceBedDef[], night: boolean): string[] {
  const out: string[] = [];
  for (const b of beds) {
    const id = typeof b === 'string' ? b : b.id;
    const time = typeof b === 'string' ? undefined : b.time;
    if (timeOk(time, night) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Layer of a bed id: fauna beds by prefix, everything registered on the map is the base. */
export function layerOf(id: string, table: AmbienceTable): AmbienceLayer {
  if (id.startsWith('amb_fauna_')) return 'fauna';
  if (Object.values(table.weather).includes(id)) return 'weather';
  if (id === table.dian.low || id === table.dian.high) return 'dian';
  if (Object.values(table.interiors).includes(id)) return 'interior';
  return 'base';
}

/** The sediment bed and its gain for a grade (6.1): two -12 dB, three -6 dB, four and up high. */
export function dianBed(
  grade: number,
  table: AmbienceTable,
): { id: string; gainDb: number } | null {
  if (grade >= 4) return { id: table.dian.high, gainDb: 0 };
  if (grade === 3) return { id: table.dian.low, gainDb: -6 };
  if (grade === 2) return { id: table.dian.low, gainDb: -12 };
  return null;
}

/** The beds that should play and their levels. */
export function mixAmbience(input: AmbienceInput, table: AmbienceTable): BedMix[] {
  const out: BedMix[] = [];
  const push = (id: string, layer: AmbienceLayer, gainDb: number): void => {
    const prev = out.find((b) => b.id === id);
    if (prev) {
      prev.gainDb = Math.max(prev.gainDb, gainDb);
      return;
    }
    out.push({ id, layer, gainDb, lowpassHz: null });
  };
  for (const id of bedsAt(input.beds, input.night)) {
    const layer = layerOf(id, table);
    push(id, layer, layer === 'base' ? 0 : LAYER_TRIM_DB);
  }
  const wx = input.outdoor ? table.weather[input.weather] : undefined;
  if (wx) push(wx, 'weather', LAYER_TRIM_DB);
  const grade = Math.max(0, Math.min(5, input.sediment + (input.activeDungeon ? 1 : 0)));
  const dian = dianBed(grade, table);
  const sense = input.dianSense ? 3 : 0;
  if (dian) push(dian.id, 'dian', LAYER_TRIM_DB + dian.gainDb + sense);
  for (const id of input.extra ?? []) {
    const layer = layerOf(id, table);
    // The director's tension bed comes in at the grade-two level, and only when no sediment
    // layer is on already (5.5).
    if (layer === 'dian' && out.some((b) => b.layer === 'dian')) continue;
    push(id, layer, layer === 'dian' ? LAYER_TRIM_DB - 12 + sense : 0);
  }
  if (input.interiorKind !== null) {
    for (const b of out) {
      b.gainDb += INDOOR_CUT_DB;
      b.lowpassHz = INDOOR_LOWPASS_HZ;
    }
    const inner = table.interiors[input.interiorKind];
    if (inner) out.push({ id: inner, layer: 'interior', gainDb: 0, lowpassHz: null });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Details (6.1, 6.12)

export const POINT_MIN_MS = 8000;
export const POINT_MAX_MS = 20000;
export const POINT_REPEAT_MS = 30000;
export const POINT_MIN_M = 15;
export const POINT_MAX_M = 30;

export interface PointShot {
  id: string;
  /** Offset from the listener in tiles (metres). */
  dx: number;
  dy: number;
}

/** Whether a detail may play now: by day, by night, or at dawn (5 to 8 o'clock). */
export function pointTimeOk(p: AmbiencePointDef, hour: number): boolean {
  const night = hour < 6 || hour >= 18;
  if (p.time === 'dawn') return hour >= 5 && hour < 8;
  if (p.time === 'night') return night;
  if (p.time === 'day') return !night;
  return true;
}

export class PointScheduler {
  private dueMs: number | null = null;
  private last = new Map<string, number>();

  /** Forget the schedule (map change): the next detail comes a full interval later. */
  reset(): void {
    this.dueMs = null;
  }

  /** At most one detail per call, when its time has come. */
  update(
    nowMs: number,
    pool: readonly AmbiencePointDef[],
    hour: number,
    rng: Rng,
  ): PointShot | null {
    if (this.dueMs === null) {
      this.dueMs = nowMs + POINT_MIN_MS + rng() * (POINT_MAX_MS - POINT_MIN_MS);
      return null;
    }
    if (nowMs < this.dueMs) return null;
    this.dueMs = nowMs + POINT_MIN_MS + rng() * (POINT_MAX_MS - POINT_MIN_MS);
    const open = pool.filter(
      (p) =>
        p.weight > 0 &&
        pointTimeOk(p, hour) &&
        nowMs - (this.last.get(p.id) ?? Number.NEGATIVE_INFINITY) >= POINT_REPEAT_MS,
    );
    const total = open.reduce((s, p) => s + p.weight, 0);
    if (total <= 0) return null;
    let r = rng() * total;
    let pick = open[open.length - 1] as AmbiencePointDef;
    for (const p of open) {
      r -= p.weight;
      if (r < 0) {
        pick = p;
        break;
      }
    }
    this.last.set(pick.id, nowMs);
    const angle = rng() * Math.PI * 2;
    const dist = POINT_MIN_M + rng() * (POINT_MAX_M - POINT_MIN_M);
    return { id: pick.id, dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist };
  }
}

/** Structural problems of data/audio/ambience.json; with `known`, every id must exist. */
export function validateAmbienceTable(raw: unknown, known?: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const t = raw as Partial<AmbienceTable>;
  if (!t || typeof t !== 'object') return ['ambience table must be an object'];
  if (t.version !== 1) out.push('version must be 1');
  const ids: [string, string][] = [];
  const amb = /^amb_[a-z0-9_]+$/;
  for (const [k, v] of Object.entries(t.weather ?? {})) ids.push([`weather.${k}`, v]);
  for (const [k, list] of Object.entries(t.weatherPoints ?? {}))
    for (const p of list ?? []) {
      ids.push([`weatherPoints.${k}`, p.id]);
      if (!(typeof p.weight === 'number' && p.weight > 0))
        out.push(`weatherPoints.${k}: ${p.id} needs a positive weight`);
    }
  if (!t.dian?.low || !t.dian?.high) out.push('dian needs low and high beds');
  else ids.push(['dian.low', t.dian.low], ['dian.high', t.dian.high]);
  for (const [k, v] of Object.entries(t.interiors ?? {})) ids.push([`interiors.${k}`, v]);
  for (const [k, c] of Object.entries(t.captions ?? {})) {
    ids.push([`captions.${k}`, k]);
    if (!/^audio\.cap\.[a-z0-9_]+$/.test(c?.key ?? ''))
      out.push(`captions.${k}: key must be audio.cap.<id>`);
    if (c?.level !== 'important' && c?.level !== 'all')
      out.push(`captions.${k}: level is important or all`);
  }
  for (const [where, id] of ids) {
    if (typeof id !== 'string' || !amb.test(id))
      out.push(`${where}: ${String(id)} is not an amb_ id`);
    else if (known && !known.has(id)) out.push(`${where}: ${id} is not in the prompt library`);
  }
  return out;
}
