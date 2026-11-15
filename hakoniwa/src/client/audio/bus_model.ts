// The five buses as data (audio_direction.md 8.2, 8.3, 10.2 and 10.3): default volumes, the
// slider-to-decibel curve, the ducking table, the background-window rule and the voice caps.
// `mixBuses` turns settings plus the active duck triggers into one gain (and filter) per bus;
// the Web Audio graph (audio_bus, PK-M1-06) only applies the result. Pure, no audio context.

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
  | 'scripted_silence';

export interface Duck {
  db: number;
  /** Low-pass corner in Hz, when the duck also filters. */
  lowpassHz?: number;
  /** High-shelf cut above this frequency, when the duck also darkens. */
  highCutHz?: number;
  /** Only this sound group of the bus is ducked (the cutscene lowers world sounds, not its own). */
  group?: string;
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
    scripted_silence: { music: D(Number.NEGATIVE_INFINITY), ambience: D(-24) },
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
      const groupDb: Record<string, number> = {};
      for (const t of active) {
        const d = DUCKS[t][bus];
        if (!d) continue;
        if (d.group) {
          groupDb[d.group] = Math.min(groupDb[d.group] ?? 0, d.db);
          continue;
        }
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
      };
      continue;
    }
    out[bus] = { db, lowpassHz, highCutHz };
  }
  return out;
}

/** Effective gain in dB of one sound on a bus (bus plus master, plus its group's duck). */
export function effectiveDb(
  mix: Record<BusId, BusState>,
  bus: Exclude<BusId, 'master'>,
  group?: string,
): number {
  return mix.master.db + mix[bus].db + (group ? (mix[bus].groupDb?.[group] ?? 0) : 0);
}
