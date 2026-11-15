// The spend estimator (docs/50_tech/llm_providers.md 8.1, 8.2, 8.3; ai_architecture.md
// 10.1 to 10.6, 10.9): per category, the request volume of the act times the cost of one
// call on the model its representative kind routes to under the player's settings, plus
// the retry margin, converted from game days to real hours at the game speed. One-off
// scenes (prologue, act six trials, revelations) and the full-run figure use the same
// formula without the margin, like the design tables. Calibration blends the measured
// spend per role (exponential smoothing) once the warm-up is over. Pure; the design numbers
// live in data/llm/estimate_baseline.json.

import baseline from '../../../data/llm/estimate_baseline.json';
import type { BindingRole } from '../contracts';
import { BINDING_ROLES } from '../contracts';
import { FX_CNY_PER_USD, priceCardOf } from '../pricing';
import type { PriceCard } from '../providers/types';
import type { RouteHints } from './kinds';
import { type ModelRoute, resolveRoute } from './routing';
import { type LlmSettings, profileOf } from './settings';

/** One call's shape: input tokens, cache hit rate, output tokens, cache-write weight w. */
export interface CallShape {
  input: number;
  hit: number;
  output: number;
  w: number;
}

interface Category extends CallShape {
  id: string;
  kind: string;
  hints?: RouteHints;
}

interface Scene extends CallShape {
  kind: string;
  calls: number;
}

export type SceneId = 'prologue' | 'trial' | 'revelation';

interface Baseline {
  retryMargin: number;
  realMinutesPerGameDay: number;
  categories: Category[];
  perGameDay: Record<string, Record<string, number>>;
  actVolumes: Record<string, string>;
  scenes: Record<SceneId, Scene>;
  run: {
    prologueScenes: number;
    hours: Record<string, number>;
    trials: number;
    revelations: number;
  };
  caps: { hourFactor: number; hourSteps: number[]; dayFactor: number; runFactor: number };
  calibration: { weight: number; warmupMinutes: number };
}

const BASE = baseline as unknown as Baseline;

export const ESTIMATE_BASELINE: Readonly<Baseline> = BASE;

/**
 * Cost of one call under a price card (ai_architecture.md 10.1):
 * I(1-h) p_in w + I h p_read + O p_out. A card without cache-write prices (most compatible
 * services) has no write surcharge, so w is 1; CNY cards convert at `cnyPerUsd` (the
 * player's rate from the caps when set, else the price book's reference rate).
 */
export function callCostUsd(card: PriceCard, c: CallShape, cnyPerUsd = FX_CNY_PER_USD): number {
  const use =
    card.longPrompt && card.longPromptThreshold !== undefined && c.input > card.longPromptThreshold
      ? card.longPrompt
      : card;
  const w = use.cacheWrite5m === undefined && use.cacheWrite1h === undefined ? 1 : c.w;
  const amount =
    c.input * (1 - c.hit) * use.input * w + c.input * c.hit * use.cacheRead + c.output * use.output;
  const usd = amount / 1_000_000;
  return card.currency === 'CNY' ? usd / cnyPerUsd : usd;
}

/** The price card of a route: the player's per-model override, else the shipped card. */
export function routePrice(s: LlmSettings, route: ModelRoute): PriceCard | undefined {
  return (
    profileOf(s, route.connectionId, route.model)?.price ?? priceCardOf(route.provider, route.model)
  );
}

/** Estimates take the configured route: no key, consent or caps are needed yet. */
function routeOf(s: LlmSettings, kind: string, hints?: RouteHints): ModelRoute | undefined {
  const r = resolveRoute(kind, { degradeLevel: 0, hints, readiness: 'config' }, s);
  return r.driver === 'model' ? r : undefined;
}

/** Volume row of an act: acts three to five run at the act four volume (10.4). */
export function volumeKey(act: number): string {
  return BASE.actVolumes[String(act)] ?? (act <= 1 ? '1' : '4');
}

export interface RoleEstimate {
  usdPerHour: number;
  requestsPerHour: number;
  inputTokensPerHour: number;
  outputTokensPerHour: number;
  /** The role routes to a model without a price: only tokens can be capped. */
  unpriced: boolean;
}

export interface HourlyEstimate {
  act: number;
  speed: number;
  usdPerHour: number;
  usdPerGameDay: number;
  /** Design volume with every role on a model (8.2 token table), per real hour. */
  designTokens: { uncached: number; cached: number; output: number };
  /** Tokens of the requests that route to a model under these settings, per real hour. */
  routedTokens: { input: number; output: number };
  byRole: Record<BindingRole, RoleEstimate>;
}

function emptyRole(): RoleEstimate {
  return {
    usdPerHour: 0,
    requestsPerHour: 0,
    inputTokensPerHour: 0,
    outputTokensPerHour: 0,
    unpriced: false,
  };
}

/** Real hours per game day at `speed` (1x: a game day is 24 real minutes, D-070). */
function gameDaysPerHour(speed: number): number {
  return (60 / BASE.realMinutesPerGameDay) * speed;
}

/**
 * Spend per real hour in an act (8.1, 8.2): every category at the act's volume, priced on
 * the model its kind routes to, times the retry margin.
 */
export function estimateHourly(
  s: LlmSettings,
  opts: { act: number; speed?: number; cnyPerUsd?: number },
): HourlyEstimate {
  const speed = opts.speed ?? 1;
  const vol = BASE.perGameDay[volumeKey(opts.act)] ?? {};
  const perHour = gameDaysPerHour(speed) * BASE.retryMargin;
  const byRole = Object.fromEntries(BINDING_ROLES.map((r) => [r, emptyRole()])) as Record<
    BindingRole,
    RoleEstimate
  >;
  const design = { uncached: 0, cached: 0, output: 0 };
  const routed = { input: 0, output: 0 };
  let usdPerDay = 0;
  for (const c of BASE.categories) {
    const n = vol[c.id] ?? 0;
    design.uncached += n * c.input * (1 - c.hit) * perHour;
    design.cached += n * c.input * c.hit * perHour;
    design.output += n * c.output * perHour;
    const route = routeOf(s, c.kind, c.hints);
    if (!route || n === 0) continue;
    const role = byRole[route.bindingRole];
    role.requestsPerHour += n * perHour;
    role.inputTokensPerHour += n * c.input * perHour;
    role.outputTokensPerHour += n * c.output * perHour;
    routed.input += n * c.input * perHour;
    routed.output += n * c.output * perHour;
    const card = routePrice(s, route);
    if (!card) {
      role.unpriced = true;
      continue;
    }
    const usd = n * callCostUsd(card, c, opts.cnyPerUsd ?? s.caps.fxCnyPerUsd);
    usdPerDay += usd;
    role.usdPerHour += usd * perHour;
  }
  return {
    act: opts.act,
    speed,
    usdPerHour: usdPerDay * perHour,
    usdPerGameDay: usdPerDay * BASE.retryMargin,
    designTokens: design,
    routedTokens: routed,
    byRole,
  };
}

/**
 * One scene in US dollars (8.2 one-off table): the prologue interview, one act six trial,
 * or one revelation read by the six goddesses; 0 when the scene runs on the built-in AI,
 * undefined when its model has no price.
 */
export function estimateScene(
  s: LlmSettings,
  scene: SceneId,
  cnyPerUsd?: number,
): number | undefined {
  const sc = BASE.scenes[scene];
  const route = routeOf(s, sc.kind);
  if (!route) return 0;
  const card = routePrice(s, route);
  if (!card) return undefined;
  // Scene inputs are totals over many turns, each far under a long-prompt threshold.
  const { longPrompt: _l, longPromptThreshold: _t, ...perTurn } = card;
  return sc.calls * callCostUsd(perTurn, sc, cnyPerUsd ?? s.caps.fxCnyPerUsd);
}

export interface RunEstimate {
  usd: number;
  /** Per part of the run: the acts by volume row, plus the scenes. */
  parts: { prologue: number; acts: Record<string, number>; trials: number; revelations: number };
}

/** The whole main line at 1x for the full time (8.2 full-run table). */
export function estimateRun(s: LlmSettings, cnyPerUsd?: number): RunEstimate {
  const acts: Record<string, number> = {};
  for (const [key, hours] of Object.entries(BASE.run.hours)) {
    acts[key] = hours * estimateHourly(s, { act: Number(key), cnyPerUsd }).usdPerHour;
  }
  const prologue = BASE.run.prologueScenes * (estimateScene(s, 'prologue', cnyPerUsd) ?? 0);
  const trials = BASE.run.trials * (estimateScene(s, 'trial', cnyPerUsd) ?? 0);
  const revelations = BASE.run.revelations * (estimateScene(s, 'revelation', cnyPerUsd) ?? 0);
  const usd = prologue + trials + revelations + Object.values(acts).reduce((a, b) => a + b, 0);
  return { usd, parts: { prologue, acts, trials, revelations } };
}

/** The smallest cap step at or above `usd`; above the last step, the next multiple of ten. */
export function roundUpCap(usd: number): number {
  const step = BASE.caps.hourSteps.find((x) => x >= usd - 1e-9);
  return step ?? Math.ceil(usd / 10) * 10;
}

function roundUpTokens(n: number): number {
  if (n <= 0) return 0;
  const mag = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  return Math.ceil(n / mag) * mag;
}

export interface SuggestedCaps {
  hourUsd: number;
  dayUsd: number;
  runUsd: number;
  hourTokens: number;
  dayTokens: number;
}

/**
 * Suggested caps (8.3): the hour at 1.5 times the larger of the design estimate and the
 * calibrated measurement, rounded up to a cap step; the day at three hours; the run at 1.2
 * times the full-run estimate. Token caps follow the routed token volume the same way.
 */
export function suggestCaps(
  s: LlmSettings,
  opts: { act: number; speed?: number; measuredUsdPerHour?: number; cnyPerUsd?: number },
): SuggestedCaps {
  const est = estimateHourly(s, opts);
  const hourBase = Math.max(est.usdPerHour, opts.measuredUsdPerHour ?? 0);
  const hourUsd = hourBase > 0 ? roundUpCap(hourBase * BASE.caps.hourFactor) : 0;
  const tokens = est.routedTokens.input + est.routedTokens.output;
  const hourTokens = roundUpTokens(tokens * BASE.caps.hourFactor);
  return {
    hourUsd,
    dayUsd: hourUsd * BASE.caps.dayFactor,
    runUsd: estimateRun(s, opts.cnyPerUsd).usd * BASE.caps.runFactor,
    hourTokens,
    dayTokens: hourTokens * BASE.caps.dayFactor,
  };
}

/** Measured spend per role, smoothed (8.1: new samples weigh 0.3). */
export interface Calibration {
  startedAtMs: number;
  byRole: Partial<Record<BindingRole, number>>;
  samples: number;
}

export function startCalibration(nowMs: number): Calibration {
  return { startedAtMs: nowMs, byRole: {}, samples: 0 };
}

/** One exponential smoothing step; the first sample is taken as is. */
export function smooth(
  prev: number | undefined,
  sample: number,
  weight = BASE.calibration.weight,
): number {
  return prev === undefined ? sample : prev * (1 - weight) + sample * weight;
}

/** Fold a measured "last 60 minutes" sample per role into the calibration. */
export function noteMeasured(
  cal: Calibration,
  sample: Partial<Record<BindingRole, number>>,
  weight = BASE.calibration.weight,
): Calibration {
  const byRole = { ...cal.byRole };
  for (const r of BINDING_ROLES) {
    const x = sample[r];
    if (x !== undefined && Number.isFinite(x) && x >= 0) byRole[r] = smooth(byRole[r], x, weight);
  }
  return { ...cal, byRole, samples: cal.samples + 1 };
}

/** The calibrated spend per hour, shown next to the design estimate after the warm-up. */
export function measuredUsdPerHour(cal: Calibration, nowMs: number): number | undefined {
  if (nowMs - cal.startedAtMs < BASE.calibration.warmupMinutes * 60_000 || cal.samples === 0) {
    return undefined;
  }
  return Object.values(cal.byRole).reduce<number>((a, b) => a + (b ?? 0), 0);
}
