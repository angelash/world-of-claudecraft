// The five buses as data (audio_direction.md 8.2, 8.3, 10.2 and 10.3): default volumes, the
// slider-to-decibel curve, the ducking table, the background-window rule and the voice caps.
// `mixBuses` turns settings plus the active duck triggers into one gain (and filter) per bus,
// and `masterChain` the master processing; the Web Audio graph (./audio_bus.ts) only applies
// the result. Pure, no audio context.

export type BusId = 'master' | 'music' | 'ambience' | 'sfx' | 'ui';

export const BUSES: readonly BusId[] = ['master', 'music', 'ambience', 'sfx', 'ui'];

/** Default slider positions (10.3). */
export const DEFAULT_VOLUMES: Readonly<Record<BusId, number>> = {
  master: 100,
  music: 70,
  ambience: 80,
  sfx: 90,
  ui: 70,
};

/** Simultaneous voices per bus (8.3); level-0 sounds may exceed the sfx cap by 4. */
export const VOICE_CAPS = {
  total: 64,
  music: 8,
  ambience: 12,
  sfx: 40,
  ui: 4,
  priorityZeroExtra: 4,
} as const;

/** Slider 0 is silence; 1 to 100 map to -50 dB to 0 dB on a logarithmic curve. */
export function sliderToDb(v: number): number {
  const s = Math.max(0, Math.min(100, Math.round(v)));
  if (s === 0) return Number.NEGATIVE_INFINITY;
  return 25 * Math.log10(s / 100);
}

export type DuckTrigger =
  | 'stinger'
  | 'dialogue'
  | 'oracle'
  | 'oracle_theme'
  | 'boss_roar'
  | 'cutscene'
  | 'pause'
  | 'presence'
  | 'scripted_silence'
  | 'rain'
  | 'storm';

export interface Duck {
  db: number;
  /** Low-pass corner in Hz, when the duck also filters. */
  lowpassHz?: number;
  /** High-shelf cut above this frequency, when the duck also darkens. */
  highCutHz?: number;
  /** Only this sound group of the bus is ducked (the cutscene lowers world sounds, not its own). */
  group?: string;
  /** Only these sound groups (a written silence keeps the cutscene's own sound alone). */
  groups?: readonly string[];
  attackMs: number;
  releaseMs: number;
}

const D = (db: number, extra: Partial<Duck> = {}): Duck => ({
  db,
  attackMs: 200,
  releaseMs: 1000,
  ...extra,
});

/**
 * 8.2 ducking table. A goddess speaking either switches the music to her theme (oracle_theme:
 * the theme itself is not ducked) or lowers the music (oracle). The cutscene ducks the world
 * sound group only, never the cutscene group.
 */
export const DUCKS: Readonly<Record<DuckTrigger, Partial<Record<Exclude<BusId, 'master'>, Duck>>>> =
  {
    stinger: { music: D(-6, { attackMs: 200, releaseMs: 1000 }) },
    dialogue: { music: D(-3), ambience: D(-3) },
    oracle: { music: D(-6), ambience: D(-6), sfx: D(-3) },
    oracle_theme: { ambience: D(-6), sfx: D(-3) },
    boss_roar: { music: D(-4, { releaseMs: 1500 }), ambience: D(-6) },
    cutscene: { ambience: D(-6), sfx: D(-12, { group: 'world' }) },
    pause: { music: D(-6, { lowpassHz: 800 }), ambience: D(-9, { lowpassHz: 800 }) },
    presence: { music: D(-4, { highCutHz: 6000 }), ambience: D(-6) },
    // A written silence (5.9, 8.2): the music stops, the ambience falls to -24 dB, and of the
    // effects only the written one (the cutscene group) is heard.
    scripted_silence: {
      music: D(Number.NEGATIVE_INFINITY),
      ambience: D(-24),
      sfx: D(Number.NEGATIVE_INFINITY, { groups: ['combat', 'world', 'army', 'divine'] }),
    },
    // Weather (5.6): rain lowers the music 2 dB behind a 10 kHz low-pass, heavy rain 4 dB.
    rain: { music: D(-2, { lowpassHz: 10000, attackMs: 2000, releaseMs: 2000 }) },
    storm: { music: D(-4, { lowpassHz: 10000, attackMs: 2000, releaseMs: 2000 }) },
  };

export interface MixSettings {
  volumes: Record<BusId, number>;
  /** Window in the background: mute, lower (-12 dB) or normal (10.3). */
  background: 'mute' | 'lower' | 'normal';
  focused: boolean;
}

export interface BusState {
  db: number;
  lowpassHz: number | null;
  highCutHz: number | null;
  /** The world sound group is paused (pause menu). */
  paused?: boolean;
  /** Extra gain per sound group of the bus (group ducks). */
  groupDb?: Record<string, number>;
  /** The deepest duck's press and release times (8.2), when a duck is on. */
  attackMs?: number;
  releaseMs?: number;
}

export function defaultMixSettings(): MixSettings {
  return { volumes: { ...DEFAULT_VOLUMES }, background: 'lower', focused: true };
}

/**
 * Gain per bus. Ducks on the same bus do not stack: the deepest one wins (and the lowest
 * filter corner). The master bus carries the slider and the background-window rule.
 */
export function mixBuses(
  settings: MixSettings,
  active: readonly DuckTrigger[],
): Record<BusId, BusState> {
  const out = {} as Record<BusId, BusState>;
  for (const bus of BUSES) {
    let db = sliderToDb(settings.volumes[bus]);
    let lowpassHz: number | null = null;
    let highCutHz: number | null = null;
    if (bus === 'master' && !settings.focused) {
      if (settings.background === 'mute') db = Number.NEGATIVE_INFINITY;
      else if (settings.background === 'lower') db -= 12;
    }
    if (bus !== 'master') {
      let duck = 0;
      let times: Duck | null = null;
      const groupDb: Record<string, number> = {};
      for (const t of active) {
        const d = DUCKS[t][bus];
        if (!d) continue;
        if (d.group || d.groups) {
          for (const g of d.groups ?? [d.group as string])
            groupDb[g] = Math.min(groupDb[g] ?? 0, d.db);
          continue;
        }
        if (!times || d.db < duck) times = d;
        duck = Math.min(duck, d.db);
        if (d.lowpassHz)
          lowpassHz = lowpassHz === null ? d.lowpassHz : Math.min(lowpassHz, d.lowpassHz);
        if (d.highCutHz)
          highCutHz = highCutHz === null ? d.highCutHz : Math.min(highCutHz, d.highCutHz);
      }
      db += duck;
      out[bus] = {
        db,
        lowpassHz,
        highCutHz,
        ...(bus === 'sfx' && active.includes('pause') ? { paused: true } : {}),
        ...(Object.keys(groupDb).length > 0 ? { groupDb } : {}),
        ...(times ? { attackMs: times.attackMs, releaseMs: times.releaseMs } : {}),
      };
      continue;
    }
    out[bus] = { db, lowpassHz, highCutHz };
  }
  return out;
}

/**
 * The master chain (8.1, 8.2, 10.4): the true-peak limiter at -1 dBTP always; night mode adds
 * 3:1 compression above -24 LUFS (about 12 dB between loudest and softest); reduce sudden loud
 * sounds puts a look-ahead limiter on the sfx bus at -18 (momentary); mono folds the output.
 */
export interface MasterChain {
  limiterDb: number;
  night: { thresholdDb: number; ratio: number } | null;
  sfxLimiterDb: number | null;
  mono: boolean;
}

/** Extra cut on sounds marked loud (cutscene hits, boss roars) under reduce loud sounds (10.4). */
export const REDUCE_LOUD_CUT_DB = -6;

export function masterChain(opts: { night: boolean; reduceLoud: boolean; mono: boolean }) {
  const chain: MasterChain = {
    limiterDb: -1,
    night: opts.night ? { thresholdDb: -24, ratio: 3 } : null,
    sfxLimiterDb: opts.reduceLoud ? -18 : null,
    mono: opts.mono,
  };
  return chain;
}

/** Effective gain in dB of one sound on a bus (bus plus master, plus its group's duck). */
export function effectiveDb(
  mix: Record<BusId, BusState>,
  bus: Exclude<BusId, 'master'>,
  group?: string,
): number {
  return mix.master.db + mix[bus].db + (group ? (mix[bus].groupDb?.[group] ?? 0) : 0);
}
