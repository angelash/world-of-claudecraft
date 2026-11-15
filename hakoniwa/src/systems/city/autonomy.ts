// Autonomy (D-011, D-043, city_building 8.2): a pure formula plus the daily ledger step.
//   A_raw = 100 * (0.25 I + 0.20 T + 0.20 D + 0.15 S + 0.20 C) - P_dep
//   A moves toward A_raw by at most 1 per day (anti-farming inertia, 8.7).
// I institutions, T talent depth, D delegation share, S self-reliance record, C cohesion,
// P_dep accumulated player dependency (decays 2 percent per day, capped at 40).

import { clamp } from './common';
import type { AutonomyLedger, DecisionRecord, TrialRecord } from './types';

export interface DomainInput {
  hasHead: boolean;
  hasPolicy: boolean;
  hasDeputy: boolean;
  /** head official's competence in the domain, 0..100 */
  competence: number;
}

export interface AutonomyInput {
  domains: DomainInput[];
  /** talent bonus from schools, 0..1 */
  talentBonus: number;
  decisions: DecisionRecord[];
  trials: TrialRecord[];
  day: number;
  /** -30..30 */
  happiness: number;
  /** 0..100 */
  security: number;
  /** average official loyalty 0..100 (50 when nobody is appointed) */
  loyalty: number;
  pDep: number;
}

export interface AutonomyTerms {
  I: number;
  T: number;
  D: number;
  S: number;
  C: number;
  raw: number;
}

/** Decision weights by authority level (8.2 D term). */
export const DECISION_WEIGHT: Record<number, number> = { 1: 1, 2: 3, 3: 5, 4: 8 };

/** Self-run efficiency E = 0.70 + 0.004 A (8.4). */
export function autonomyEfficiency(a: number): number {
  return 0.7 + 0.004 * clamp(a, 0, 100);
}

/** Highest authority level an official acts on alone: min(authority, 1 + floor(A / 25)) (8.4). */
export function actingLevel(authority: number, a: number): number {
  return Math.min(authority, 1 + Math.floor(clamp(a, 0, 100) / 25));
}

export function computeTerms(input: AutonomyInput): AutonomyTerms {
  const n = input.domains.length;
  let I = 0;
  let T = 0;
  if (n > 0) {
    for (const d of input.domains) {
      if (d.hasHead) {
        I += (d.hasPolicy ? 1 : 0.6) * (0.6 + (0.4 * clamp(d.competence, 0, 100)) / 100);
      }
      if (d.hasDeputy) T += 1;
    }
    I /= n;
    T /= n;
  }
  T = clamp(T + input.talentBonus, 0, 1);

  let playerW = 0;
  let totalW = 0;
  for (const r of input.decisions) {
    if (input.day - r.day > 30) continue;
    totalW += r.weight;
    if (r.by === 'player') playerW += r.weight;
  }
  const D = totalW > 0 ? 1 - playerW / totalW : 0.5;

  let ok = 0;
  let bad = 0;
  for (const t of input.trials) {
    const w = input.day - t.day > 180 ? t.weight / 2 : t.weight;
    if (t.ok) ok += w;
    else bad += w;
  }
  const S = (ok + 1) / (ok + bad + 3);

  const h = clamp((input.happiness + 30) / 60, 0, 1);
  const C = clamp(
    0.4 * h + 0.4 * (clamp(input.security, 0, 100) / 100) + 0.2 * (input.loyalty / 100),
    0,
    1,
  );

  const raw = clamp(100 * (0.25 * I + 0.2 * T + 0.2 * D + 0.15 * S + 0.2 * C) - input.pDep, 0, 100);
  return { I, T, D, S, C, raw };
}

export function newLedger(value: number): AutonomyLedger {
  return {
    I: 0,
    T: 0,
    D: 0.5,
    S: 1 / 3,
    C: 0.5,
    pDep: 0,
    raw: value,
    value,
    history: [value],
    dependency: [],
  };
}

/** One daily step: decay dependency, recompute terms, move the value by at most 1. */
export function stepLedger(ledger: AutonomyLedger, terms: AutonomyTerms): void {
  ledger.I = terms.I;
  ledger.T = terms.T;
  ledger.D = terms.D;
  ledger.S = terms.S;
  ledger.C = terms.C;
  ledger.raw = terms.raw;
  const diff = terms.raw - ledger.value;
  ledger.value = clamp(ledger.value + clamp(diff, -1, 1), 0, 100);
  ledger.history.push(Math.round(ledger.value * 10) / 10);
  if (ledger.history.length > 30) ledger.history.splice(0, ledger.history.length - 30);
  ledger.pDep = Math.max(0, ledger.pDep * 0.98);
}

/** Add player dependency (8.2 table), capped at 40 points. */
export function addDependency(
  ledger: AutonomyLedger,
  day: number,
  action: string,
  delta: number,
): void {
  ledger.pDep = clamp(ledger.pDep + delta, 0, 40);
  ledger.dependency.push({ day, action, delta });
  if (ledger.dependency.length > 30) ledger.dependency.splice(0, ledger.dependency.length - 30);
}

export function recordDecision(
  decisions: DecisionRecord[],
  day: number,
  by: 'player' | 'official',
  weight: number,
): void {
  decisions.push({ day, by, weight });
  // keep the 30-day window plus a little slack
  while (decisions.length > 0 && day - (decisions[0] as DecisionRecord).day > 31) decisions.shift();
}

export function recordTrial(trials: TrialRecord[], day: number, ok: boolean, weight: number): void {
  trials.push({ day, ok, weight });
  if (trials.length > 60) trials.splice(0, trials.length - 60);
}
