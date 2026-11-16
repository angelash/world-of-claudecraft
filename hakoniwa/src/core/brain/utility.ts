// Utility scoring of the built-in AI (builtin_ai.md 2.1): pick one legal option by a
// named score. Shared by NPC actions, divine actions, ruler intents, general plans,
// official intents, topics and lines. Pure and deterministic: every random draw goes
// through an Rng the caller passes in (a named stream), never Math.random.
//
//   U(a) = W_a x G(a) x M(a) + B(a) - C(a)
//
// G(a) is the compensated product of the gate considerations, M(a) the persona multiplier
// (clamped to 0.5..1.5), B(a) the additive bonuses (inertia among them), C(a) the costs.

import type { Rng } from '../rng';
import { type Curve, evalCurve } from './curves';

/** A gate: a registered input read through a response curve (builtin_ai 2.1 data shape). */
export interface Consideration {
  name: string;
  /** registered input function id */
  input: string;
  curve: Curve;
}

/** A bonus or cost: a registered input times a scale. */
export interface NamedTerm {
  name: string;
  input: string;
  scale: number;
}

/** One action or intent of a utility library (data/ai/utility/*.json). */
export interface UtilityActionDef {
  /** action or intent id; one to one with a kernel command */
  id: string;
  /** W_a */
  weight: number;
  gates: Consideration[];
  bonuses?: NamedTerm[];
  costs?: NamedTerm[];
  /** persona dimensions M(a) multiplies, e.g. ['greed', 'caution'] */
  persona?: string[];
  cooldownTicks?: number;
  /** e.g. hostile, public, religious (persona and visibility modifiers read them) */
  tags?: string[];
}

/** Inertia: the action already running gets +INERTIA x W_a (builtin_ai 2.1). */
export const INERTIA = 0.1;
export const PERSONA_MIN = 0.5;
export const PERSONA_MAX = 1.5;
/** Band of the weighted draw for everyday choices (NPC actions, lines, topics). */
export const LIFE_BAND = 0.1;
/** Band for goddesses, rulers, generals and officials: next to always optimal. */
export const STRATEGIC_BAND = 0.02;

export interface ScoredTerm {
  name: string;
  value: number;
}

export interface ScoredAction<T = unknown> {
  id: string;
  /** the final score U(a); 0 when blocked */
  score: number;
  /** a gate read 0, or the action is cooling down: never chosen */
  blocked: boolean;
  /** every named term behind the score, for BrainTrace */
  terms: ScoredTerm[];
  data?: T;
}

/** Already-evaluated values of one action (the low-level form scoreAction takes). */
export interface UtilityValues<T = unknown> {
  id: string;
  weight: number;
  /** gate values 0..1 */
  gates: readonly ScoredTerm[];
  /** bonus values, already scaled */
  bonuses?: readonly ScoredTerm[];
  /** cost values, already scaled */
  costs?: readonly ScoredTerm[];
  /** M(a); clamped to PERSONA_MIN..PERSONA_MAX */
  persona?: number;
  blocked?: boolean;
  data?: T;
}

/**
 * Compensated product of the gate values (builtin_ai 2.1): each gate c is first raised to
 * c' = c + (1 - c) x c x (1 - 1/n), n the number of gates, so an action with many gates is
 * not crushed toward 0 by middling considerations. No gate gives 1.
 */
export function compensatedGate(values: readonly number[]): number {
  const n = values.length;
  let product = 1;
  for (const c of values) product *= c + (1 - c) * c * (1 - 1 / n);
  return product;
}

export function clampPersona(m: number): number {
  return Math.min(PERSONA_MAX, Math.max(PERSONA_MIN, m));
}

/** U(a) from evaluated values; a gate at 0 short-circuits (bonuses and costs are skipped). */
export function scoreAction<T>(v: UtilityValues<T>): ScoredAction<T> {
  const terms: ScoredTerm[] = v.gates.map((g) => ({ name: `gate.${g.name}`, value: g.value }));
  const g = compensatedGate(v.gates.map((x) => x.value));
  if (v.blocked || g <= 0) {
    return { id: v.id, score: 0, blocked: true, terms, data: v.data };
  }
  const m = clampPersona(v.persona ?? 1);
  let total = v.weight * g * m;
  for (const b of v.bonuses ?? []) {
    terms.push({ name: `bonus.${b.name}`, value: b.value });
    total += b.value;
  }
  for (const c of v.costs ?? []) {
    terms.push({ name: `cost.${c.name}`, value: c.value });
    total -= c.value;
  }
  terms.push({ name: 'W', value: v.weight }, { name: 'G', value: g }, { name: 'M', value: m });
  return { id: v.id, score: total, blocked: false, terms, data: v.data };
}

/** What a library action reads: registered inputs, persona dimensions, running action, clock. */
export interface UtilityInputs {
  /** a registered input function by id, evaluated for one action */
  input(id: string, actionId: string): number;
  /** a persona dimension's multiplier (default 1 for every dimension) */
  persona?(dim: string): number;
  /** the action the actor is executing now (gets inertia) */
  current?: string;
  tick?: number;
  /** the tick the action last ran, for cooldownTicks */
  lastUsedTick?(actionId: string): number | undefined;
}

/** Evaluate one library action (curves, scales, persona, inertia, cooldown) and score it. */
export function evaluateAction(def: UtilityActionDef, inputs: UtilityInputs): ScoredAction {
  const last = def.cooldownTicks ? inputs.lastUsedTick?.(def.id) : undefined;
  const cooling =
    last !== undefined &&
    inputs.tick !== undefined &&
    inputs.tick - last < (def.cooldownTicks as number);
  const gates = def.gates.map((c) => ({
    name: c.name,
    value: evalCurve(c.curve, inputs.input(c.input, def.id)),
  }));
  let persona = 1;
  for (const dim of def.persona ?? []) persona *= inputs.persona?.(dim) ?? 1;
  const bonuses = (def.bonuses ?? []).map((b) => ({
    name: b.name,
    value: inputs.input(b.input, def.id) * b.scale,
  }));
  if (inputs.current === def.id) bonuses.push({ name: 'inertia', value: INERTIA * def.weight });
  const costs = (def.costs ?? []).map((c) => ({
    name: c.name,
    value: inputs.input(c.input, def.id) * c.scale,
  }));
  return scoreAction({
    id: def.id,
    weight: def.weight,
    gates,
    bonuses,
    costs,
    persona,
    blocked: cooling,
  });
}

export interface PickOptions {
  /**
   * Fraction of the top score within which candidates compete in a weighted draw
   * (LIFE_BAND, STRATEGIC_BAND); omit or 0 for the plain top pick.
   */
  band?: number;
  /** the actor's named stream for the draw; without it the top pick wins */
  rng?: Rng;
  /** the do-nothing baseline: an action is taken only when the top score is not below it */
  idleScore?: number;
}

export interface PickResult<T = unknown> {
  chosen: ScoredAction<T> | null;
  /** unblocked candidates, highest score first, ties by id ascending */
  ranked: ScoredAction<T>[];
  /** the idle baseline won (or nothing was eligible) */
  idle: boolean;
  /** the draw in [0, 1) when a weighted draw happened, else -1 */
  draw: number;
}

/** Score descending, then id ascending (code unit order, never locale order). */
export function byScoreThenId(a: { score: number; id: string }, b: { score: number; id: string }) {
  if (b.score !== a.score) return b.score - a.score;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The winner among scored actions (builtin_ai 1.5 and 2.1):
 * 1. blocked actions never compete;
 * 2. ties rank by id ascending, so a plain pick takes the lexicographically first id;
 * 3. when the top score is below `idleScore` nothing is done (equal still acts);
 * 4. with `band` and `rng`, every candidate within band x |top| of the top (and not
 *    below the idle baseline) joins a draw weighted by score, in ranked order, one draw from
 *    the stream; a lone candidate or a top score at or below 0 takes the plain pick.
 */
export function pickBest<T>(
  actions: readonly ScoredAction<T>[],
  opts: PickOptions = {},
): PickResult<T> {
  const ranked = actions.filter((a) => !a.blocked).sort(byScoreThenId);
  const top = ranked[0];
  if (!top || (opts.idleScore !== undefined && top.score < opts.idleScore))
    return { chosen: null, ranked, idle: true, draw: -1 };
  if (!opts.band || !opts.rng || top.score <= 0)
    return { chosen: top, ranked, idle: false, draw: -1 };
  // the band never reaches below the idle baseline: doing nothing beats those
  const threshold = Math.max(
    top.score - Math.abs(top.score) * opts.band,
    opts.idleScore ?? Number.NEGATIVE_INFINITY,
  );
  const pool = ranked.filter((a) => a.score >= threshold);
  if (pool.length < 2) return { chosen: top, ranked, idle: false, draw: -1 };
  const { index, draw } = weightedIndex(
    opts.rng,
    pool.map((a) => a.score),
  );
  return { chosen: pool[index] as ScoredAction<T>, ranked, idle: false, draw };
}

/**
 * One weighted draw over positive weights in the given order (non-positive weights never
 * win). Returns the index and the raw draw; with no positive weight, index 0 and no draw.
 * Equal weights select exactly as Rng.pick would for the same draw.
 */
export function weightedIndex(
  rng: Rng,
  weights: readonly number[],
): { index: number; draw: number } {
  let total = 0;
  for (const w of weights) if (w > 0) total += w;
  if (total <= 0) return { index: 0, draw: -1 };
  const draw = rng.next();
  let roll = draw * total;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] as number;
    if (w <= 0) continue;
    roll -= w;
    if (roll < 0) return { index: i, draw };
  }
  for (let i = weights.length - 1; i >= 0; i--)
    if ((weights[i] as number) > 0) return { index: i, draw };
  return { index: 0, draw };
}
