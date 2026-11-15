// Goddess GM types: persona cards (content), the divine action menu, revelations, and
// the goddess slice (power, faith, gaze, relation, covenant ledger, miracle ledger).
// See docs/40_design/systems/goddess_gm.md and docs/20_world/pantheon.md.
// Which goddesses exist, who sits at the court and who plays which part all come from
// data/goddess/goddesses.json (release_engineering.md 13.2); code never names one.

import type { ModifierTarget } from '../modifiers';
import type { DefenseLine } from '../scenes/types';

/**
 * A goddess id: a string checked against the persona cards when the content loads (the
 * goddess pack validator), never a closed union in code. Narrow a raw string with
 * `goddessIdOf` (./roster) before using it as one.
 */
export type GoddessId = string & { readonly __goddessId: true };

/**
 * Story roles a persona card may hold (each by at most one goddess): 'fate_director' runs
 * the narrative director's coincidences and respites (Moira's fate channel, goddess_gm.md 8),
 * 'offering' receives offerings through her token (prologue 4.9).
 */
export type GoddessRole = 'fate_director' | 'offering';

/** How a goddess reaches the garden: through her believers' faith, or bound to the player. */
export type GoddessReach = 'faith' | 'player';

/** A cue that makes a seated goddess yield of her own will at the court (act6 3.5 and 5). */
export type VoluntaryCue =
  /** these defense lines are all broken */
  | { lines: DefenseLine[] }
  /** any of these evidence ids was shown to her */
  | { shown: string[] }
  /** a reveal-ledger condition over the flags */
  | { when: string };

/** How the court's verdict on a seated goddess is reached (act6 3.5 and 5). */
export interface CourtVerdictRule {
  /** broken defense lines that bring her to judgment (3 = all of them) */
  judgedAt: number;
  /** a mitigating piece shown to her also brings her to judgment (a confession) */
  mitigationJudges?: boolean;
  /** she yields of her own will when any cue holds; only once judged unless `alone` */
  voluntary: { alone?: boolean; any: VoluntaryCue[] };
}

/** A seat at the divine court (the prologue antechamber and the act 6 review). */
export interface CourtSeat {
  /** seating order: verdicts, review crises and 'all' effects run in this order */
  seat: number;
  /** her review crisis (act6 2.4): flag review.<id>, and the condition that adds 10 strength */
  crisis: { id: string; bonus: string };
  /** extra thickness on a defense line while a condition holds (the god purge route) */
  thicken?: { line: DefenseLine; when: string; add: number }[];
  verdict: CourtVerdictRule;
  /** flag set to true once she yields (voluntary or judged): Sylvie's spring memory */
  yieldFlag?: string;
}

/** Who writes the epilogue record (act6 12.4 rule 6) and in which voice. */
export interface RecordWriter {
  kind: 'narrate' | 'divine';
  /** endings whose record she writes; absent: the default writer of every other ending */
  endings?: string[];
}

/** Persona card (goddess_gm.md 14). Hard constraints feed every prompt. */
export interface GoddessDef {
  id: GoddessId;
  /** short name, for example 艾琉恩 */
  name: string;
  /** full name, for example 艾琉恩·奥瑞莉亚 */
  fullName: string;
  /** title, for example 光与秩序之司 */
  title: string;
  /** the honorific invocation (pantheon.md 0.1): title + full name */
  honorific: string;
  /** name shown to the player before revealWhen holds (janu: 门口的女人) */
  hiddenName?: string;
  revealWhen?: string;
  /** speech rules and fingerprint */
  voice: string[];
  mustKeep: string[];
  never: string[];
  publicGoal: string;
  /** private goals; entries with `when` enter her prompt only once the condition holds */
  privateGoals: { text: string; when?: string }[];
  /** what she knows and may say, per act key (prologue, act1..act6) */
  knowledgeByAct: Record<string, string[]>;
  anchors: string[];
  /** divine action ids she may use (see DivineActionDef) */
  menu: string[];
  /** starting power and daily net income (goddess_gm.md 4.2) */
  power: { start: number; daily: number };
  /** utility weight per action id for the no-model planner */
  weights: Record<string, number>;
  /** cap on gaze per act key (cognitive clamp, goddess_gm.md 3.6) */
  gazeCap: Record<string, number>;
  /** entity tags that count as her believers (witnesses raise her gaze) */
  faithTags: string[];
  /** initial faith share per map id or region id, 0..1 */
  faith: Record<string, number>;
  /** first act index in which she plans (valda is absent in acts 1 and 2) */
  activeFromAct: number;
  breachTendency: 'none' | 'low' | 'mid' | 'high';
  /** her seat at the court; absent for a goddess outside it (Janu) */
  courtSeat?: CourtSeat;
  /** how she reaches the garden (default 'faith') */
  reach?: GoddessReach;
  /** condition beyond the act gate before she can act at all (Janu: the seal stage) */
  actsWhen?: string;
  /** condition before she shows in the goddess window and plans (Janu: the first dream) */
  appearsWhen?: string;
  /** token item through which she blesses the pageless player and receives offerings */
  token?: string;
  roles?: GoddessRole[];
  /** ledger alias flag that mirrors her gaze (goddess_gm.md 3.4) */
  gazeFlag?: string;
  /** she writes the epilogue record (act6 12.4 rule 6) */
  record?: RecordWriter;
  /** written replies for the no-model mode */
  replies: {
    /** answer when the player speaks her honorific */
    honorific: string;
    /** her reading of a revelation */
    revelation: string;
    /** thanks for an offering (merca) */
    offering?: string;
  };
}

/**
 * The Maker's card (pantheon.md 7). The Maker never plans, speaks or acts; the card is
 * the rule sheet the operator and the AI layer follow when drafting revelations.
 */
export interface MakerDef {
  id: 'maker';
  name: string;
  /** what goddesses call the Maker (上面, 那一位) */
  aliases: string[];
  presence: string;
  /** the original charter on the seven steles */
  charter: string;
  revelationRules: string[];
  never: string[];
  room: string;
}

/** One entry of the divine action menu (goddess_gm.md 5). */
export interface DivineActionDef {
  id: string;
  label: string;
  /** base power cost */
  power: number;
  cooldownHours: number;
  /** sediment rate: 0, 0.01 (with the flow), 0.1 (turning), 0.3 (against) */
  sedimentRate: number;
  /** first act index where it is on the menu */
  minAct: number;
  visibility: 'public' | 'hidden';
  /** may be used through the breach channel (covenant violation, D-026) */
  breachable?: boolean;
  /** counts against the per-act hostility budget when aimed at the player's map (D-027) */
  hostile?: boolean;
  /** modifiers the action registers; key 'region' is replaced by the target map id */
  modifiers?: {
    target: ModifierTarget;
    key: string;
    factor?: number;
    add?: number;
    hours: number;
  }[];
  /** forced weather while the action lasts */
  weather?: string;
  /** description of params for the model */
  params: string;
  /**
   * Written texts per goddess for the no-model planner (oracle, dream, omen, request).
   * Request lines are written as `key|text`.
   */
  lines?: Record<string, string[]>;
}

/** A Maker revelation (goddess_gm.md 9). */
export interface RevelationDef {
  id: string;
  /** Old Court text on the seven steles */
  text: string;
  /** scholars' literal reading */
  literal: string;
  /** flags written when it lands (ledger markers) */
  flags?: Record<string, string | number | boolean>;
  modifiers?: {
    target: ModifierTarget;
    key: string;
    factor?: number;
    add?: number;
    days: number;
  }[];
  /** first written reaction of each goddess (no-model readings) */
  responses: Partial<Record<GoddessId, string>>;
}

/** A reveal-ledger knowledge entry (reveal_ledger.md 2). */
export interface LoreDef {
  id: string;
  /** mystery code, for example M01 */
  mystery: string;
  text: string;
  /** K0 (mortal common) .. K5 (divine), or P (private to `knowers`) */
  tier: 'K0' | 'K1' | 'K2' | 'K3' | 'K4' | 'K5' | 'P';
  knowers?: string[];
  /** reveal-ledger unlock condition */
  unlock: string;
  /** words that leak this entry when it is still locked */
  keywords?: string[];
}

/** Name opening table (reveal_ledger.md 6): a term is forbidden until unlock holds. */
export interface TermDef {
  term: string;
  unlock: string;
  /** what model output is rewritten to while locked */
  replacement: string;
}

export interface MiracleEntry {
  id: string;
  tick: number;
  act: string;
  goddess: string;
  action: string;
  mapId: string;
  power: number;
  sediment: number;
  /** visible to mortals (enters the public record) */
  public: boolean;
  breach: boolean;
  note: string;
}

export interface Breach {
  id: string;
  goddess: string;
  act: string;
  tick: number;
  action: string;
  mapId: string;
  /** the corrosion trace left behind (D-047) */
  trace: string;
}

export interface GoddessState {
  id: GoddessId;
  power: number;
  /** map or region id -> faith share 0..1 */
  faith: Record<string, number>;
  /** decayed sum of witness sample weights */
  sightWeight: number;
  /** 0..100 */
  gaze: number;
  /** prologue impression -3..3 */
  impression: number;
  /** prologue interest 0..3 */
  interest: number;
  /** -100..100 */
  relation: number;
  memoryTags: string[];
  /** KPI score */
  score: number;
  /** action id -> tick when usable again */
  cooldowns: Record<string, number>;
  /** acts in which she used the breach channel */
  breachActs: string[];
  /** act -> hostile actions used against the player's map */
  hostility: Record<string, number>;
  /** honorific wake-ups: day index and count that day */
  wakeDay: number;
  wakes: number;
  /** bumps whenever her state changes in a way a pending proposal could depend on */
  revision: number;
  /** she has left the garden (act 6 verdict) */
  departed: boolean;
}

export interface GoddessSlice {
  goddesses: Record<string, GoddessState>;
  ledger: MiracleEntry[];
  breaches: Breach[];
  /** map or region id -> accumulated sediment */
  sediment: Record<string, number>;
  revelations: { id: string; tick: number; text: string; literal: string }[];
  /** hostility budget per goddess per act (D-027) */
  hostilityBudget: number;
}
