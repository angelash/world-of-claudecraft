// The tension meter (goddess_gm.md 8.2): a deterministic 0..100 reading of how hard
// the last hours were, sampled every game hour and smoothed. Inputs are normalised to
// 0..1: combat pressure (kills around the player, damage taken, deaths), threat
// (the highest goddess gaze), stagnation (time since the last story beat, inverted)
// and act pressure (a beat target per act).

export interface TensionInputs {
  /** monsters killed near the player in the last hour */
  kills: number;
  /** the player died or retreated through the door in the last hour */
  deaths: number;
  /** hostile events aimed at the player's map in the last hour (waves, divine hostility) */
  threats: number;
  /** highest goddess gaze 0..100 */
  gaze: number;
  /** game hours since the last story beat (quest done, act change, door, scene) */
  hoursSinceBeat: number;
}

export const WEIGHTS = { combat: 0.45, threat: 0.15, social: 0.1, stagnation: 0.3 };

/** Raw tension of one hourly sample. */
export function rawTension(i: TensionInputs): number {
  const combat = Math.min(1, i.kills / 12 + i.deaths * 0.6);
  const threat = Math.min(1, i.gaze / 100 + i.threats * 0.25);
  const social = Math.min(1, i.threats * 0.2);
  const stagnation = 1 - Math.min(1, i.hoursSinceBeat / 24);
  const t =
    WEIGHTS.combat * combat +
    WEIGHTS.threat * threat +
    WEIGHTS.social * social +
    WEIGHTS.stagnation * stagnation;
  return Math.round(Math.max(0, Math.min(1, t)) * 100);
}

/** Exponential smoothing over the hourly samples. */
export function smooth(prev: number, raw: number, alpha = 0.35): number {
  return Math.round((prev * (1 - alpha) + raw * alpha) * 10) / 10;
}

/**
 * Target band by act. goddess_gm.md 8.2 sets bands per beat (落地 30..50, 暗面 50..75, 高潮
 * 75..95, 拉远 40..60); the first round uses one widened band per act until beats are tagged.
 */
export function bandFor(act: string): { low: number; high: number } {
  switch (act) {
    case 'act1':
    case 'act2':
      return { low: 20, high: 65 };
    case 'act3':
    case 'act4':
      return { low: 25, high: 70 };
    case 'act5':
      return { low: 30, high: 80 };
    default:
      return { low: 0, high: 100 };
  }
}

export type DirectorMove = 'coincidence' | 'respite' | null;

/**
 * Decide a move from the run of samples outside the band: 20 hours under the low edge
 * opens a coincidence (at most one per 30 hours), 10 hours over the high edge opens a
 * respite (at most one per 12 hours).
 */
export function decide(
  hoursLow: number,
  hoursHigh: number,
  hoursSinceCoincidence: number,
  hoursSinceRespite: number,
  extraCoincidences = 0,
): DirectorMove {
  if (hoursHigh >= 10 && hoursSinceRespite >= 12) return 'respite';
  const cool = extraCoincidences > 0 ? 20 : 30;
  if (hoursLow >= 20 && hoursSinceCoincidence >= cool) return 'coincidence';
  return null;
}
