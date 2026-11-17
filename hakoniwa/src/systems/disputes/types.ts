// Dispute runner data and state (PK-M1-46; act1_borderstone.md 4; quests_and_events.md 3.6;
// npc_society_ai.md 9; builtin_ai.md 5.8). A dispute record runs one dispute chain quest
// (a quest of kind `dispute`, whose `defaults` are the week-by-week default development the
// act clock applies, src/systems/quests/disputes.ts): this record adds what the quest model
// leaves to the runner, namely the chain's stages, its decision points (named NPCs choose
// from a menu; the built-in utility is the fallback), and the settlement of its outcomes
// into registry variables.

import type { Effect } from '../quests/effect_types';

/** A conditional adjustment of a utility input. */
export interface TermAdd {
  when: string;
  value: number;
}

/**
 * One input of the decision utility, read as 0..1: a plain number, or a base plus the
 * adjustments whose conditions hold now (the evidence, relations and facts the world holds).
 */
export type TermDef = number | { base: number; add?: TermAdd[] };

/** The four weighted inputs of a decision option (builtin_ai.md 5.8). */
export interface OptionTerms {
  /** stance alignment */
  stance: TermDef;
  /** relation with the people concerned */
  relation: TermDef;
  /** the actor's own safety and interest */
  safety: TermDef;
  /** divine impulse and values */
  values: TermDef;
}

export interface DecisionOptionDef {
  id: string;
  label: string;
  /** offered only while this holds (what the actor would never do is simply not offered) */
  when?: string;
  /** while this holds the option breaks one of the actor's must-keep rules (-100) */
  breaks?: string;
  /**
   * A written option (builtin_ai.md 5.8, main-line protection): when any offered option is
   * fixed, the menu is trimmed to the fixed ones, for the built-in AI and the model alike.
   */
  fixed?: boolean;
  terms: OptionTerms;
  /** consequences, applied when the option is chosen */
  effects?: Effect[];
}

/**
 * A decision point (npc_society_ai.md 9): the chain names an NPC, who chooses one option of
 * the menu before the deadline. A point opens at act week `week` (or later inside the
 * window, once `when` holds), or right after the point `after` was decided (checked once).
 * `unless` holding at opening drops it (the player stepped in). Nobody's choice by the
 * deadline: the built-in utility decides (the fallback), so the chain never waits.
 */
export interface DecisionPointDef {
  id: string;
  label: string;
  /** the NPC who decides (persona id) */
  actor: string;
  week?: number;
  /** last act week the point may open (default: the end of the dispute's span) */
  until?: number;
  after?: string;
  when?: string;
  unless?: string;
  /** game hours from opening to the deadline (default DEFAULT_DECISION_HOURS) */
  hours?: number;
  /** weighted-draw band of the fallback pick (default LIFE_BAND; 0 for the plain top pick) */
  band?: number;
  options: DecisionOptionDef[];
}

/** A stage of the chain (its escalation level feeds the director's tension, 0 to 3). */
export interface DisputeStageDef {
  id: string;
  label: string;
  escalation: number;
  /** from this act week (default 1) */
  week?: number;
  /** and while this holds; the current stage is the last listed one that qualifies */
  when?: string;
}

/** Who brought an ending about. */
export type EndingBy = 'player' | 'world';

export const ENDING_BY: readonly EndingBy[] = ['player', 'world'];

/**
 * One outcome row. The primary ending is the first non-stacking row whose `when` holds,
 * else the default row; stacking rows apply on top whenever their `when` holds (endings
 * that add up, act1_borderstone.md 4.1). `by` says whether the player's interventions
 * brought it about (`player`, the chain settlement is the player's) or the world's own
 * course did (`world`, the default development got there first).
 */
export interface OutcomeDef {
  id: string;
  label: string;
  /** the ending code written to dispute.<id>.ending (default: the row id) */
  ending?: string;
  when?: string;
  by: EndingBy;
  /** the ending when no other row holds: exactly one row, without `when` */
  default?: boolean;
  /** applies on top of the primary ending when it holds */
  stack?: boolean;
  /** the world writes of the ending */
  effects?: Effect[];
}

export interface DisputeDef {
  /** the dispute chain quest this record runs (a quest of kind `dispute`) */
  id: string;
  act: string;
  /** display number, e.g. A1-D01 */
  code: string;
  /** the people of the chain (persona ids) */
  parties: string[];
  /** the act weeks the chain runs */
  span: { from: number; to: number };
  stages: DisputeStageDef[];
  decisions: DecisionPointDef[];
  /**
   * When the outcomes settle: at the start of act week `week`, as soon as `when` holds, or
   * once the world is past the dispute's act, whichever comes first.
   */
  settle: { week: number; when?: string };
  outcomes: OutcomeDef[];
}

// ---------------------------------------------------------------------------
// runtime

/** Who made a decision: a chooser through disputes.decide, or the built-in fallback. */
export type DecisionSource = 'chooser' | 'fallback';

export interface DisputeState {
  /** the stage last written ('' before the first) */
  stage: string;
  /** decided points: the chosen option ('' when nothing was on the menu) */
  chosen: Record<string, string>;
  /** points that will not happen (dropped by `unless`, a closed window, or no predecessor) */
  dropped: string[];
  /** set once settled */
  ending?: string;
  by?: EndingBy;
  /** outcome rows applied on top of the primary ending */
  stacked?: string[];
  settledTick?: number;
}

/** A decision point waiting for a choice (in the slice until decided). */
export interface OpenDecision {
  dispute: string;
  point: string;
  actor: string;
  openedTick: number;
  /** the fallback runs at this tick */
  dueTick: number;
}

export interface DisputesSlice {
  disputes: Record<string, DisputeState>;
  /** open decisions, in opening order */
  open: OpenDecision[];
  /** a flag moved since the last step */
  dirty: boolean;
  /** act and act week of the last step (a change steps at once) */
  act: string;
  week: number;
}
