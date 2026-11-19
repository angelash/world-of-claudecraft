// The taint arithmetic and the dawn check of one body (progression_and_pacing.md 9.1 to 9.3,
// catalog_consumables_magitools.md 2.4). Pure: the system and the pacing model both run
// stepBody, the system with the named stream `sed.daily`, so a seed gives the same days.
//
//   exposure  each hour a body spends at canon grade g adds perGrade[g] / 24 (clear and the
//             inner court -2 a day, thin -0.3, accumulated +0.2, dense +1, deep +3, abyssal
//             +10; the critical level counts as abyssal)
//   wear      each worn piece with a sediment pattern adds one point per 10, 5 or 2 days; a
//             purified pattern instead takes its resistance off the gain in sediment zones
//             (catalog_equipment.md 2.6: 10%, 20%, 30%, the best piece counts)
//   onset     at dawn, one roll for the next stage only: min(cap, (taint - from + 1) x per),
//             times rankFactor per rank above the first mortal rank, times 1.5 for the frail
//   self-heal the spot heals after three dawns with taint under 15; fever and crystal never
// The frail factor applies after the cap (9.2 lists the rank and age factors after the capped
// formulas), so a frail child's spot chance can reach 22.5%.

import {
  type AilmentsConfig,
  type DayResult,
  SED_STAGES,
  type SedStage,
  type StageDef,
  type Sufferer,
  type WearGrade,
} from './types';

/** Number of canon sediment grades the exposure counts (0 clear to 6 critical). */
export const GRADES = 7;

/** A fresh, healthy body. */
export function freshBody(): Sufferer {
  return {
    taint: 0,
    stage: 'none',
    since: -1,
    low: -1,
    hours: new Array<number>(GRADES).fill(0),
    injuries: [],
  };
}

/** Taint kept inside 0..max with two decimals. */
export function clampTaint(cfg: AilmentsConfig, v: number): number {
  const c = Math.max(0, Math.min(cfg.max, Number.isFinite(v) ? v : 0));
  return Math.round(c * 100) / 100;
}

/** The daily drift at a canon grade (out-of-range grades clamp to 0..6). */
export function gradeRate(cfg: AilmentsConfig, grade: number): number {
  const g = Math.max(0, Math.min(GRADES - 1, Math.floor(Number.isFinite(grade) ? grade : 0)));
  return cfg.perGrade[g] ?? 0;
}

/**
 * The taint the hours spent at each grade bring (a whole day at one grade is its rate); a
 * resistance (0..1) shrinks the gains only, never the drift down in clear and thin places.
 */
export function exposureDelta(cfg: AilmentsConfig, hours: readonly number[], resist = 0): number {
  const keep = 1 - Math.max(0, Math.min(1, Number.isFinite(resist) ? resist : 0));
  let sum = 0;
  for (let g = 0; g < GRADES; g++) {
    const rate = gradeRate(cfg, g);
    sum += ((rate > 0 ? rate * keep : rate) * (hours[g] ?? 0)) / 24;
  }
  return sum;
}

/** The taint one day of wear brings: one point per `wear[grade]` days for each piece. */
export function wearDelta(cfg: AilmentsConfig, worn: readonly WearGrade[]): number {
  let sum = 0;
  for (const g of worn) {
    const days = cfg.wear[g];
    if (days > 0) sum += 1 / days;
  }
  return sum;
}

export function stageIndex(stage: SedStage): number {
  return SED_STAGES.indexOf(stage);
}

/** The stage definition of a stage past none. */
export function stageDef(cfg: AilmentsConfig, stage: SedStage): StageDef | undefined {
  return cfg.stages.find((s) => s.id === stage);
}

/** The stage a body can fall into next, if any. */
export function nextStage(cfg: AilmentsConfig, stage: SedStage): StageDef | undefined {
  const next = SED_STAGES[stageIndex(stage) + 1];
  return next ? stageDef(cfg, next) : undefined;
}

/** The daily chance of breaking out into `def` at this taint, before the body's factors. */
export function onsetChance(def: StageDef, taint: number): number {
  if (taint < def.from) return 0;
  return Math.min(def.cap, (taint - def.from + 1) * def.per);
}

/** The body's factor on every onset chance: its rank and whether it is frail. */
export function onsetFactor(cfg: AilmentsConfig, tier: number, frail: boolean): number {
  const t = Math.max(0, Math.floor(Number.isFinite(tier) ? tier : 0));
  return cfg.rankFactor ** t * (frail ? cfg.frail.factor : 1);
}

/** What the dawn check needs to know about the body besides its state. */
export interface DayInput {
  /** day index of this dawn */
  day: number;
  /** pattern grades of the unpurified pieces it wears */
  worn: readonly WearGrade[];
  /** the best purified pattern's resistance to sediment gains (0..1; 0 for none) */
  resist?: number;
  /** its rank (the `tier` tag, 0 for the first mortal rank) */
  tier: number;
  frail: boolean;
  /** preventive aura multiplier on spot onset only (adult/child already selected) */
  spotRisk?: number;
}

/**
 * One dawn check of a body, in place: the day's exposure and wear go on, the spot may heal
 * by itself, then one roll for the next stage (a draw only when its chance is above 0).
 */
export function stepBody(
  cfg: AilmentsConfig,
  body: Sufferer,
  input: DayInput,
  roll: () => number,
): DayResult {
  const from = body.stage;
  const before = body.taint;
  body.taint = clampTaint(
    cfg,
    body.taint + exposureDelta(cfg, body.hours, input.resist ?? 0) + wearDelta(cfg, input.worn),
  );
  body.hours = new Array<number>(GRADES).fill(0);
  let healed = false;
  let onset = false;
  const heal = cfg.selfHeal;
  if (body.stage === heal.stage) {
    if (body.taint < heal.below) {
      if (body.low < 0) body.low = input.day;
      if (input.day - body.low >= heal.days) {
        body.stage = 'none';
        body.since = -1;
        body.low = -1;
        healed = true;
      }
    } else body.low = -1;
  }
  const next = nextStage(cfg, body.stage);
  if (next) {
    const prevention = next.id === 'spot' ? (input.spotRisk ?? 1) : 1;
    const p =
      onsetChance(next, body.taint) * onsetFactor(cfg, input.tier, input.frail) * prevention;
    if (p > 0 && roll() < p) {
      body.stage = next.id;
      body.since = input.day;
      body.low = -1;
      onset = true;
    }
  }
  return {
    delta: Math.round((body.taint - before) * 100) / 100,
    taint: body.taint,
    from,
    stage: body.stage,
    onset,
    healed,
  };
}

/** Bring a sickness down by `stages` (at least one); returns the stage before. */
export function cureBody(body: Sufferer, stages: number, day: number): SedStage {
  const from = body.stage;
  const n = Number.isFinite(stages) ? Math.max(1, Math.floor(stages)) : 1;
  const to = Math.max(0, stageIndex(from) - n);
  body.stage = SED_STAGES[to] as SedStage;
  body.since = body.stage === 'none' ? -1 : day;
  body.low = -1;
  return from;
}

/**
 * What a cure item does to a stage (catalog_consumables_magitools.md 3.6, the item's
 * `use.sed`): it treats only the stages it lists (every stage when it lists none) and brings
 * one down by `down` stages, or straight to healthy with 'all'.
 */
export interface CureSpec {
  treats?: readonly SedStage[];
  down?: number | 'all';
}

/** The number of stages a cure takes off this stage, or 0 when it does not treat it. */
export function cureSteps(spec: CureSpec | undefined, stage: SedStage): number {
  if (stage === 'none') return 0;
  const treats = spec?.treats;
  if (Array.isArray(treats) && treats.length > 0 && !treats.includes(stage)) return 0;
  if (spec?.down === 'all') return stageIndex(stage);
  const down = spec?.down;
  return typeof down === 'number' && Number.isFinite(down) ? Math.max(1, Math.floor(down)) : 1;
}

/**
 * The aura stage a body shows: its stage, except the player's crystallisation, which works
 * on the door and leaves the body at `playerCrystal.bodyStage` (9.4).
 */
export function bodyAuraStage(cfg: AilmentsConfig, stage: SedStage, isPlayer: boolean): SedStage {
  return isPlayer && stage === 'crystal' ? cfg.playerCrystal.bodyStage : stage;
}

/** Blockage the player's crystallisation adds at a dawn (9.4): the first day, then daily. */
export function crystalBlockage(cfg: AilmentsConfig, result: DayResult): number {
  if (result.stage !== 'crystal') return 0;
  return result.onset ? cfg.playerCrystal.blockage : cfg.playerCrystal.daily;
}
