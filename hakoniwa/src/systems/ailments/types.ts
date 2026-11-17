// Data and state of the ailments system (PK-M1-51): taint (澱染, 0 to 100 on every body),
// the three taint sicknesses (澱病: spot, fever, crystallisation) with their daily check,
// the injuries (伤病) and the act's sediment hooks (the town's sediment track and the
// scripted cases of the children). Numbers live in data/ailments/; this file names the
// shapes and the closed sets (progression_and_pacing.md 9, 10; catalog_consumables_magitools
// .md 2.4; combat_and_classes.md 9.4; catalog_abilities_talents.md 7.5, 7.6).

/** The taint sickness stages, mildest first; `none` is the healthy body (9.3). */
export const SED_STAGES = ['none', 'spot', 'fever', 'crystal'] as const;
export type SedStage = (typeof SED_STAGES)[number];

/**
 * The injury sub-types (catalog_abilities_talents.md 7.6): light wound, maimed arm, maimed
 * leg, tempering backlash, old wound relapse.
 */
export const INJURY_KINDS = ['light', 'maimed_arm', 'maimed_leg', 'backlash', 'relapse'] as const;
export type InjuryKind = (typeof INJURY_KINDS)[number];

/** Values of the player's injury mirror `player.injury` (world_state_registry.md 8.1). */
export const PLAYER_INJURY_VALUES = ['none', 'minor', 'limb'] as const;
export type PlayerInjury = (typeof PLAYER_INJURY_VALUES)[number];

/** Stages a scripted case moves through, plus its cured end (`sed_case.<case>`). */
export const CASE_STAGES = ['none', 'spot', 'fever', 'crystal', 'cured'] as const;
export type CaseStage = (typeof CASE_STAGES)[number];

/** Grades of the sediment-pattern wear on equipment (catalog_equipment.md 1.5 `sed.grade`). */
export const WEAR_GRADES = ['light', 'mid', 'heavy'] as const;
export type WearGrade = (typeof WEAR_GRADES)[number];

/** One sickness stage past `none`: its aura and its daily onset chance (9.2). */
export interface StageDef {
  id: Exclude<SedStage, 'none'>;
  /** the state aura (an `aur_st_sed_*` id in data/combat/auras.json) */
  aura: string;
  /** taint from which the stage can break out (20, 45, 75) */
  from: number;
  /** chance per point of taint at and above `from` (0.005: half a percent) */
  per: number;
  /** the daily chance never goes above this */
  cap: number;
}

export interface InjuryDef {
  id: InjuryKind;
  /** the state aura (an `aur_st_injury_*` id) */
  aura: string;
  /** game days it lasts by itself; 0 lasts until it is treated or the player is remade */
  days: number;
  /** the value it shows as on `player.injury`, when the player may carry it */
  player?: Exclude<PlayerInjury, 'none'>;
}

export interface AilmentsConfig {
  /** top of the taint scale */
  max: number;
  /** the hour of the daily check (6: the dawn check, or waking) */
  checkHour: number;
  /** daily taint drift by canon sediment grade 0 to 6 (clear to critical) */
  perGrade: number[];
  /** game days per point of taint for one worn piece of each pattern grade */
  wear: Record<WearGrade, number>;
  stages: StageDef[];
  /** onset chance factor per rank above the first mortal rank (tier tag) */
  rankFactor: number;
  /** tags of the frail (children, the old) and their onset factor */
  frail: { tags: string[]; factor: number };
  /** the spot heals by itself after `days` dawn checks with taint below `below` */
  selfHeal: { stage: Exclude<SedStage, 'none'>; below: number; days: number };
  /**
   * The player's crystallisation is a door blockage, not a body change (9.4): the body
   * keeps the aura of `bodyStage`, and the doors take `blockage` on the day it sets in and
   * `daily` on every later dawn until it is cured.
   */
  playerCrystal: {
    bodyStage: Exclude<SedStage, 'none' | 'crystal'>;
    blockage: number;
    daily: number;
  };
  /**
   * Days a body other than the player's may stay crystallised before its end is due (9.3:
   * a mortal dies, a companion or general leaves gravely hurt); the owner of that body acts
   * on the `ailments.crystal_due` event.
   */
  crystalDays: number;
  injuries: InjuryDef[];
  /** chance an old wound breaks open with a tempering backlash (10.1) */
  relapseChance: number;
  /** taint a sediment cure taken too early leaves instead of its effect (药毒 I, catalog 2.1) */
  earlyTaint: number;
}

/**
 * A sediment track: a world variable (0 to 100) that moves by the act week, the town's
 * sediment of act 1 (act1_borderstone.md 7.2). The first rule whose condition holds names
 * the week's change; without one the base `weekly` applies.
 */
export interface TrackDef {
  id: string;
  act: string;
  /** the registered variable the track keeps */
  var: string;
  /** the track runs while this holds */
  when: string;
  /** its value in the act's first week, when nothing wrote it before */
  start: number;
  weekly: number;
  rules?: { when: string; weekly: number }[];
  min?: number;
  max?: number;
}

/**
 * A scripted case: a named sufferer whose sickness the story fixes (the children of act 1,
 * act1_borderstone.md 7.2). Its stage only moves forward through `steps` (the first step
 * that holds and is past the current stage) until `cure.when` holds; the stage shows on
 * `sed_case.<id>`. Deaths and outcomes stay with the story.
 */
export interface CaseDef {
  id: string;
  act: string;
  steps: { when: string; stage: Exclude<CaseStage, 'none' | 'cured'> }[];
  cure?: { when: string };
}

/** An injury a body carries. */
export interface InjuryState {
  kind: InjuryKind;
  /** tick it began */
  since: number;
  /** tick it ends by itself; 0 when it lasts until treated */
  until: number;
}

/** The taint and sickness of one body. */
export interface Sufferer {
  /** taint, kept with two decimals; the flag mirror shows it rounded down */
  taint: number;
  stage: SedStage;
  /** day index the current stage began (-1 for none) */
  since: number;
  /** day index the taint first went under the self-heal line in the current stage, -1 if not */
  low: number;
  /** hours spent at each canon grade (0 to 6) since the last dawn check */
  hours: number[];
  injuries: InjuryState[];
}

export interface AilmentsSlice {
  /** bodies by entity id; the player's is made on first use */
  bodies: Record<string, Sufferer>;
  /** last act week each track settled, by track id */
  tracks: Record<string, number>;
  /** current stage of each scripted case */
  cases: Record<string, CaseStage>;
  /** day index of the last dawn check (-1 before the first) */
  checked: number;
  /** a flag moved: the cases and tracks settle on the next tick */
  dirty: boolean;
}

/** What one dawn check did to one body (for events, tests and the pacing model). */
export interface DayResult {
  /** taint change of the day (exposure and wear) */
  delta: number;
  taint: number;
  from: SedStage;
  stage: SedStage;
  /** the stage changed by an onset roll */
  onset: boolean;
  /** the spot healed by itself */
  healed: boolean;
}

declare module '../../core/contracts' {
  interface WorldSlices {
    ailments: AilmentsSlice;
  }
  interface ContentMap {
    ailmentsConfig: AilmentsConfig;
    sedimentTracks: TrackDef[];
    sedCases: CaseDef[];
  }
  interface EventMap {
    /** a body's sickness stage moved (onset roll, self-heal, cure) */
    'ailments.stage': {
      entityId: string;
      stage: SedStage;
      from: SedStage;
      cause: 'onset' | 'self_heal' | 'cure';
    };
    /** the dawn check of one body */
    'ailments.daily': { entityId: string; taint: number; delta: number; stage: SedStage };
    /** an injury began or ended */
    'ailments.injury': { entityId: string; kind: InjuryKind; op: 'added' | 'healed' };
    /** a scripted case moved */
    'ailments.case': { caseId: string; stage: CaseStage; from: CaseStage };
    /** a body other than the player's has been crystallised for crystalDays (9.3) */
    'ailments.crystal_due': { entityId: string; days: number };
  }
  interface CommandMap {
    /** add (or with a negative amount take away) taint: scripts and the story */
    'ailments.taint': { entityId?: string; amount: number };
    /** bring a sickness down by `stages` (default 1) */
    'ailments.cure': { entityId?: string; stages?: number };
    /** give an injury; `days` overrides its data length (0: until treated) */
    'ailments.injure': { entityId?: string; kind: InjuryKind; days?: number };
    /** heal one kind of injury, or every injury when no kind is named */
    'ailments.heal': { entityId?: string; kind?: InjuryKind };
  }
}
