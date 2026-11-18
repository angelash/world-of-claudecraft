// The tension meter (goddess_gm.md 8.2; builtin_ai.md 13.1): a deterministic 0..100 reading
// of how hard the last hours were, sampled every game hour and smoothed. Six inputs, each
// normalised to 0..1: combat pressure (kills around the player, deaths), threat (the highest
// goddess gaze, waves and hostile divine acts, dynamic events landing near), social tension
// (the highest escalation of the act's disputes, read from dispute.<id>.escalation), progress
// stagnation inverted (time since the last story beat), resource pressure (money, healing
// supplies, a debt past its credit) and divine pressure (divine power spent on the player's
// map in the last day). The target band follows the act clock's beat (landing, dark,
// climax, pull-back); at rest (the inner court, a town) its floor is 15 lower.

export interface TensionInputs {
  /** monsters killed near the player in the last hour */
  kills: number;
  /** the player died or retreated through the door in the last hour */
  deaths: number;
  /** hostile events aimed at the player's map in the last hour (waves, divine hostility, events) */
  threats: number;
  /** highest goddess gaze 0..100 */
  gaze: number;
  /** game hours since the last story beat (quest done, act change, door, scene, delivery) */
  hoursSinceBeat: number;
  /** highest escalation of the act's running disputes, 0 to 3 */
  escalation?: number;
  /** resource pressure 0..1 */
  resource?: number;
  /** divine power spent on the player's map in the last game day */
  divinePower?: number;
}

/** The six weights of goddess_gm.md 8.2 (they sum to 1). */
export const WEIGHTS = {
  combat: 0.25,
  threat: 0.15,
  social: 0.2,
  stagnation: 0.2,
  resource: 0.1,
  divine: 0.1,
};

/** Divine power on the player's map in a day that reads as full divine pressure. */
export const DIVINE_FULL = 50;

/** The six normalised inputs of one sample. */
export function tensionParts(i: TensionInputs): Record<keyof typeof WEIGHTS, number> {
  return {
    combat: Math.min(1, i.kills / 12 + i.deaths * 0.6),
    threat: Math.min(1, i.gaze / 100 + i.threats * 0.25),
    social: Math.min(1, Math.max(0, (i.escalation ?? 0) / 3)),
    stagnation: 1 - Math.min(1, i.hoursSinceBeat / 24),
    resource: Math.min(1, Math.max(0, i.resource ?? 0)),
    divine: Math.min(1, Math.max(0, (i.divinePower ?? 0) / DIVINE_FULL)),
  };
}

/** Raw tension of one hourly sample. */
export function rawTension(i: TensionInputs): number {
  const p = tensionParts(i);
  let t = 0;
  for (const k of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) t += WEIGHTS[k] * p[k];
  return Math.round(Math.max(0, Math.min(1, t)) * 100);
}

/** Exponential smoothing over the hourly samples. */
export function smooth(prev: number, raw: number, alpha = 0.35): number {
  return Math.round((prev * (1 - alpha) + raw * alpha) * 10) / 10;
}

/** Target bands by the act clock's beat id (goddess_gm.md 8.2; data/goddess/director_acts.json). */
export type BeatBands = Readonly<Record<string, { low: number; high: number }>>;

/** How much lower the floor sits at rest (the inner court, a town). */
export const REST_DROP = 15;

/**
 * Target band: the band the act's data gives its clock's beat, else one widened band per
 * act; at rest the floor drops by REST_DROP.
 */
export function bandFor(
  act: string,
  beat?: string,
  atRest = false,
  bands?: BeatBands,
): { low: number; high: number } {
  let band: { low: number; high: number };
  const byBeat = beat ? bands?.[beat] : undefined;
  if (byBeat) band = { ...byBeat };
  else
    switch (act) {
      case 'act1':
      case 'act2':
        band = { low: 20, high: 65 };
        break;
      case 'act3':
      case 'act4':
        band = { low: 25, high: 70 };
        break;
      case 'act5':
        band = { low: 30, high: 80 };
        break;
      default:
        band = { low: 0, high: 100 };
    }
  if (atRest) band.low = Math.max(0, band.low - REST_DROP);
  return band;
}

export type DirectorMove = 'coincidence' | 'respite' | null;

/** Hours below the floor before a coincidence opens (24000 ticks, D-079 AQ-19). */
export const LOW_HOURS = 20;
/** Hours above the ceiling before a respite opens (12000 ticks). */
export const HIGH_HOURS = 10;
/** No coincidence within this many hours of the last (36000 ticks). */
export const COINCIDENCE_COOL_HOURS = 30;
/** No respite within this many hours of the last. */
export const RESPITE_COOL_HOURS = 12;

/**
 * Decide a move from the run of samples outside the band: LOW_HOURS under the floor opens a
 * coincidence (at most one per COINCIDENCE_COOL_HOURS; 20 hours when an extra written one is
 * owed), HIGH_HOURS over the ceiling opens a respite (at most one per RESPITE_COOL_HOURS).
 */
export function decide(
  hoursLow: number,
  hoursHigh: number,
  hoursSinceCoincidence: number,
  hoursSinceRespite: number,
  extraCoincidences = 0,
): DirectorMove {
  if (hoursHigh >= HIGH_HOURS && hoursSinceRespite >= RESPITE_COOL_HOURS) return 'respite';
  const cool = extraCoincidences > 0 ? 20 : COINCIDENCE_COOL_HOURS;
  if (hoursLow >= LOW_HOURS && hoursSinceCoincidence >= cool) return 'coincidence';
  return null;
}

/**
 * The 13.3 score of a menu item: the tension gap times the precondition, the data weight, a
 * freshness bonus (1.2 when unused for twice its cooldown) and the story fit (1.3 when it
 * touches a running quest, dispute or undelivered entry). Ties are settled by id.
 */
export function itemScore(f: {
  gap: number;
  prereq: number;
  weight: number;
  fresh: boolean;
  fit: boolean;
}): number {
  const v = f.gap * f.prereq * f.weight * (f.fresh ? 1.2 : 1) * (f.fit ? 1.3 : 1);
  return Math.round(v * 1e6) / 1e6;
}

/** The tension gap of a move (13.3): how far below the floor, or above the ceiling. */
export function tensionGap(
  move: Exclude<DirectorMove, null>,
  t: number,
  band: { low: number; high: number },
): number {
  if (move === 'coincidence') return band.low > 0 ? Math.max(0, (band.low - t) / band.low) : 0;
  return band.high < 100 ? Math.max(0, (t - band.high) / (100 - band.high)) : 0;
}
