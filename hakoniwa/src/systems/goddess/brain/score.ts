// The divine action score of the goddess brain (builtin_ai.md 8.3, with the catalog's
// weight, gate and persona multiplier of catalog_goddess_interventions.md 5.0). Pure: the
// planner gathers the facts of one "action on a map" from the world and her projection, and
// this function turns them into a named score (every term kept for the brain trace).
//
//   U = s × W × G × M                         catalog 5.0 (s: config.weightScale)
//     + 10 × Σ w_k × ΔK_k                     expected KPI contribution
//     + 3 × Σ trait_t × A(a, t)                persona affinity
//     + 4 × [next step of a scheme] + 5 × [open scripted act]
//     + 2 × [answers a notice of the last 24 game hours]
//     + 2 × interest(act) × playerRel × [on the player's map]
//     - 20 × cost / max(1, power)
//     - 10 × sediment rate × (1 - self-deception)
//     - 3 × visibility × stealth × caution
//     - 2 × uses of the action in the last 7 game days
//     - 5 × (1 - hostility budget left)        hostile actions only
//     - 3 × [act spending ahead of the act's elapsed share]
//     + ε in [0, 0.5) from goddess.brain.<id>

import type { ScoredTerm } from '../../../core/brain/utility';

export interface ScoreFacts {
  /** W (catalog 5.0) */
  weight: number;
  /** G: 1 when every gate holds, else 0 (the candidate is dropped) */
  gate: number;
  /** M (persona multipliers by tag) */
  mult: number;
  /** Σ w_k × ΔK_k, already scaled by the map */
  kpi: number;
  /** Σ trait_t × A(a, t) */
  affinity: number;
  scheme: boolean;
  beat: boolean;
  notice: boolean;
  interest: number;
  playerRel: number;
  onPlayerMap: boolean;
  cost: number;
  power: number;
  sedimentRate: number;
  denial: number;
  /** 1 for a public action, 0.3 for a hidden one */
  visibility: number;
  stealth: number;
  caution: number;
  uses7d: number;
  hostile: boolean;
  /** share of the act's hostility budget still free, 0 to 1 */
  hostileLeft: number;
  overspent: boolean;
  /** the seeded jitter, 0 to 0.5 */
  jitter: number;
}

export interface ScoreConstants {
  weightScale: number;
}

/** The named terms of one candidate and their sum. */
export function scoreAction(
  f: ScoreFacts,
  c: ScoreConstants,
): { total: number; terms: ScoredTerm[] } {
  const terms: ScoredTerm[] = [
    { name: 'weight', value: c.weightScale * f.weight * f.gate * f.mult },
    { name: 'kpi', value: 10 * f.kpi },
    { name: 'affinity', value: 3 * f.affinity },
    { name: 'scheme', value: f.scheme ? 4 : 0 },
    { name: 'beat', value: f.beat ? 5 : 0 },
    { name: 'notice', value: f.notice ? 2 : 0 },
    { name: 'interest', value: f.onPlayerMap ? 2 * f.interest * f.playerRel : 0 },
    { name: 'power', value: (-20 * f.cost) / Math.max(1, f.power) },
    { name: 'sediment', value: -10 * f.sedimentRate * (1 - f.denial) },
    { name: 'visibility', value: -3 * f.visibility * f.stealth * f.caution },
    { name: 'repeat', value: -2 * f.uses7d },
    { name: 'hostility', value: f.hostile ? -5 * (1 - f.hostileLeft) : 0 },
    { name: 'budget', value: f.overspent ? -3 : 0 },
    { name: 'jitter', value: f.jitter },
  ];
  let total = 0;
  for (const t of terms) total += t.value;
  // round to 1e-6 so float noise never reorders two candidates across platforms
  return { total: Math.round(total * 1e6) / 1e6, terms };
}

/**
 * Whether the act's spending runs ahead of its elapsed share (builtin_ai 8.3: "本幕过半却已花
 * 掉七成"): spent / budget above the elapsed fraction by more than a fifth of the budget.
 */
export function overspent(spent: number, budget: number, elapsed: number): boolean {
  if (budget <= 0) return spent > 0;
  const share = Math.max(0, Math.min(1, elapsed));
  return spent / budget > share + 0.2;
}

/**
 * Whether a spend keeps her projected power at the act's end above the reserve (catalog 5.0:
 * the end reserve is a hard limit): power now, minus the cost, plus the daily income over
 * the days left.
 */
export function keepsReserve(
  power: number,
  cost: number,
  daily: number,
  daysLeft: number,
  reserve: number,
): boolean {
  return power - cost + daily * Math.max(0, daysLeft) >= reserve;
}
