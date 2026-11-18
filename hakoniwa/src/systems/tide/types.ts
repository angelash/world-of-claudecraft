// Tide types (PK-M1-52): the content shapes of a written tide night (act1_borderstone.md 8.2
// to 8.7: phases, defence lines, the NPC action table, the striker, the settlement and the
// credit tables), the overflow rules that turn a dungeon overflow or a full nest into a
// monster tide (catalog_bestiary.md 7), and the slice. Every content id, every variable name
// and every number of a night lives in data/tide/; the code only knows the shapes.

import type { Effect } from '../quests/effect_types';

/** One place an actor stands in one phase, and what it adds there. */
export interface TidePost {
  /**
   * The line the actor holds: a line id of the night, `@player` for the player's line of the
   * phase (a follower), `@boss` for the boss itself; absent: on no line (a shelter, a cellar).
   */
  line?: string;
  /** defence added to that line; negative when the actor takes defenders away */
  defence?: number;
}

/** A pressure change a row makes: on a line, or on the face the surge hits (`@surge`). */
export interface PressureMod {
  phase: string;
  line: string;
  amount: number;
}

/** The special fate rules of a row (act1_borderstone.md 8.4: Boro, Dris). */
export interface FateRule {
  /** the row promises the actor lives through the night ("生还") */
  survives?: boolean;
  /** dies when the gap on his line in that phase reaches `gap` (Boro without cover) */
  diesAtGap?: { phase: string; gap: number };
  /** a death roll that replaces the general one (Dris on the east fence) */
  deathRoll?: { gap: number; chance: number };
  /** dies when the condition holds at the end of that phase (Dris alone at the boss) */
  diesWhen?: { phase: string; when: string };
}

/** One row of the NPC action table (act1_borderstone.md 8.4). */
export interface ActorRowDef {
  id: string;
  /** when the row is open to the actor; empty: always open (the table's "其他" row) */
  when?: string;
  /**
   * An additive row (the table's "任何情况" rows): it holds beside the one exclusive row
   * the actor picks, and a chooser cannot swap it out.
   */
  always?: boolean;
  /** what the actor does, as display text (the actor's memory of the night) */
  label: string;
  /** where the actor stands and what it adds, by phase id (a group may hold two lines) */
  posts?: Record<string, TidePost | TidePost[]>;
  /** town-wide casualty factor; the factors of all picked rows multiply (8.6 rule 2) */
  casualty?: number;
  /** casualty factor of the slope's own people (Oola out of the woods) */
  slopeCasualty?: number;
  pressure?: PressureMod[];
  /** prosperity change at dawn (8.6) */
  prosperity?: number;
  /** the prosperity change does not apply when this holds at dawn (an intercepted cart) */
  prosperityUnless?: string;
  fate?: FateRule;
  /** the shelter of the people this row looks after (chapel, guild, mill) */
  shelter?: string;
  /** where the children are taken (the boss's second target follows them) */
  children?: string;
  /** a call before the surge: the defenders move this much defence to the weakest face */
  call?: number;
  /** the slope folk are let in late unless someone orders the gate open */
  slopeDelay?: boolean;
  /** an actor on the slope's gate line in the first settled phase orders the gate open */
  orders?: boolean;
  /** the row raises the mob (8.4 Bertha) */
  mob?: boolean;
  /** the row sends a child after the prisoner alone (8.4 Cassian refuses: Noi) */
  rescueAttempt?: boolean;
  /** a loss the row causes, by code (the company's back warehouse) */
  loss?: string;
}

/** A row of the action table belongs to an actor: one named person, or a group led by one. */
export interface ActorDef {
  id: string;
  /** the named persons of the actor (fate rolls, trust, memory, witness); empty: no one */
  npcs?: string[];
  /** a group (the militia, the loggers): it fights on when its named persons are dead */
  group?: boolean;
  rows: ActorRowDef[];
}

/** A defence line, or a separate front that is settled only while someone holds it. */
export interface LineDef {
  id: string;
  /** a location of the night's map: the player within `postRadius` of it is on this line */
  location: string;
  /** base defence (8.3) */
  base: number;
  /** pressure by settled phase (8.3); a phase it does not name brings 0 */
  pressure?: Record<string, number>;
  /** the buildings behind the line, damaged one at a time (8.6 rule 4) */
  behind?: string[];
  /** a face of the town the surge can hit (the four directions of 8.2) */
  face?: boolean;
  /** a separate front (the east slope): settled only in phases where an actor holds it */
  front?: boolean;
  /** the surge wave that marches on this face */
  surgeWave?: string;
}

/** A conditional change to a line's defence or pressure (8.6's preparation sources). */
export interface LineModDef {
  when: string;
  line: string;
  /** phases it applies to; all settled phases when absent */
  phases?: string[];
  defence?: number;
  pressure?: number;
}

/** A wave a phase starts (the flag channel combat.wave.<id> = go). */
export interface PhaseWave {
  wave: string;
  when?: string;
}

/** One phase of the night (act1_borderstone.md 8.2). */
export interface PhaseDef {
  id: string;
  /** the stage number written to the stage variable */
  stage: number;
  /** game hours after the night begins at which the phase may start */
  hour: number;
  /** game hours the phase waits after the previous phase began (the surge's own span) */
  minHours?: number;
  /** the phase ends only when this holds (the boss falls) */
  until?: string;
  /** the defence lines are settled at the end of this phase */
  settle?: boolean;
  /** the player's line counts in this phase (+40 and the followers) */
  playerLines?: boolean;
  /** the surge phase: only the weakest face is pressed, with `surge.pressure` */
  surge?: boolean;
  /**
   * The boss arrives at the start: its target is `near` when the player is within `range`
   * tiles of `place`, else `far` (the door-marked children).
   */
  seek?: { place: string; range: number; near: string; far: string };
  /** the mob may rise in this phase (rows with `mob`) */
  mob?: boolean;
  /** the boss phase: named witnesses are counted when it ends */
  witness?: boolean;
  waves?: PhaseWave[];
}

/** The variables a night writes and reads (all registered in data/registry/vars.json). */
export interface NightVars {
  stage: string;
  started: string;
  cleared: string;
  /** the post the player chose at dusk (written by the dusk scene) */
  post?: string;
  /** the player left the post for the mob (written by the mob scene) */
  leftPost?: string;
  colossusTarget: string;
  weakest: string;
  gapWeakest: string;
  otherDead: string;
  survival: string;
  population: string;
  prosperity: string;
  credit: string;
  exposed: string;
  childrenAt: string;
}

/** The mob of the second beat (act1_borderstone.md 8.4 Bertha) and how it ends. */
export interface MobDef {
  /** the mob's end as written by the mob scene; the night falls back to `outcomes` */
  var: string;
  /** checked in order; the last one (no condition) is what happens when nobody stops it */
  outcomes: { value: string; when?: string }[];
  /** the writes of each end (the prisoner dragged out to the north gate) */
  effects?: Record<string, Effect[]>;
}

/** The striker of the surge (act1_borderstone.md 8.5: Marsha). */
export interface StrikerDef {
  npc: string;
  /** written true when she strikes, false when she only watches */
  revealed: string;
  /** written true when she strikes */
  strike: string;
  /** the free drink at dawn after a strike when this holds */
  ally?: { when: string; flag: string };
}

/** The bell call before the surge (8.4 Toma) is a row field; the settlement constants: */
export interface SettleDef {
  /** civilians lost per this much gap (8.6 rule 2: gap / 10, rounded down) */
  gapPerDeath: number;
  injury: { gap: number; chance: number };
  death: { gap: number; chance: number };
  /** a building behind the line is damaged at this gap (8.6 rule 4) */
  buildingGap: number;
  /** total civilian deaths to survival band (8.6: 0 to 5, 6 to 20, 21 and up) */
  survival: { max?: number; value: string }[];
  population: { base: number; min: number; max: number };
  prosperity: { start: number; perBuilding: number; min: number; max: number };
  trust: {
    sameLine: number;
    saved: number;
    /** the people of the children's home when the player left them to the boss */
    leftChildren: { when: string; amount: number; npcs: string[] };
  };
  /** the cross-act protected people: only hurt, never killed (8.4) */
  protected: string[];
  /** named dead not counted in the other-dead count (they have their own lines) */
  ownLines: string[];
  /** the injury value written for a badly hurt named person (registry npc.<id>.injury) */
  injuryValue: string;
  /**
   * The grievance of a shut-out front's people toward the town (8.6: the slope's trust in the
   * human folk -30); no registry variable holds it yet, so it goes out as an event.
   */
  grievance?: { front: string; group: string; amount: number };
  /** the player stands on the nearest line within this many tiles */
  postRadius: number;
  /** player and follower bonuses (8.3) */
  playerBonus: number;
  /** the factor on the slope's casualties while its people come in late (8.4 Gaspar) */
  slopeDelayFactor: number;
  /** where the slope's people are counted when they are inside the fence */
  slopeInside: { line: string; phase: string };
  /** the surge's pressure on the weakest face (8.2 phase 4) */
  surgePressure: number;
  /** the slope's gate counts as ordered open when this holds (the order or the persuasion) */
  slopeOrdered?: string;
}

/** The escalation casualty of a dispute settled on the tide night (act1_borderstone.md 4.4). */
export interface EscalationDef {
  when: string;
  /** the named person who dies with `chance` (Boro) */
  npc: string;
  chance: number;
  /** otherwise this many unnamed people die (a logger) */
  civilians: number;
}

/** The children's fates settled at dawn (act1_borderstone.md 7.2). */
export interface ChildDef {
  var: string;
  /** the value written when the child dies */
  dead: string;
  /** dies at dawn when this holds */
  dies: string;
  /** after the night: dies in the first game hour this holds (a deadline after the tide) */
  diesLater?: string;
  /** the value written when the child never fell ill (at dawn, or later once it holds) */
  healthy?: { when: string; value: string };
}

/** One version of who drove the tide back (act1_borderstone.md 8.7). */
export interface CreditVersion {
  id: string;
  /** named witnesses of the boss fight with trust at least `trust` */
  witnesses?: { count: number; trust: number };
  /** the striker struck */
  strike?: boolean;
  when?: string;
  /** the first tellers of this version */
  tellers: string[];
}

export interface CreditDef {
  /** checked in order; the last one is the fallback */
  versions: CreditVersion[];
  /** lines whose holders see the boss fight */
  lines: string[];
  /** shelters whose people see it */
  shelters: string[];
  /** a named person this close to the player when the boss falls sees it */
  radius: number;
}

/** Where the children end up after the night (registry a1_children_location). */
export interface ChildrenAtDef {
  when?: string;
  value: string;
}

/** A written tide night (act1_borderstone.md 8). */
export interface TideNightDef {
  id: string;
  name: string;
  act: string;
  mapId: string;
  /** the flag whose turning true at dusk begins the night (the act clock's night rule) */
  start: string;
  vars: NightVars;
  phases: PhaseDef[];
  lines: LineDef[];
  mods?: LineModDef[];
  actors: ActorDef[];
  striker?: StrikerDef;
  mob?: MobDef;
  settle: SettleDef;
  escalation?: EscalationDef;
  children?: ChildDef[];
  childrenAt?: ChildrenAtDef[];
  /** the shelters that put the children in a crowd (8.6 a1_children_exposed) */
  crowdShelters?: string[];
  /** the children are not exposed when this holds (A1-M11: kept where the player sees them) */
  exposedUnless?: string;
  credit: CreditDef;
}

/** What turns into a monster tide outside the written nights (catalog_bestiary.md 7.1). */
export type SurgeTrigger = 'overflow' | 'nest_full';

/** A rule that turns a dungeon overflow or a full nest into a tide on a settlement. */
export interface TideSurgeDef {
  id: string;
  on: SurgeTrigger;
  /** the settlement map the tide falls on (an overflow's `toMap`, or the nest's settlement) */
  toMap: string;
  /** nests on these maps feed this rule (nest_full only) */
  fromMaps?: string[];
  /** the mtide_ waves the tide is made of */
  waves: string[];
  /** a region code for the cooldown (catalog_bestiary.md 7.3: 14 days per region) */
  region: string;
  cooldownDays: number;
  /** the rule is open while this holds */
  when?: string;
}

// ---------------------------------------------------------------------------
// slice

/** One line's numbers in one settled phase. */
export interface LineResult {
  line: string;
  defence: number;
  pressure: number;
  gap: number;
  /** civilians lost there (fractional until dawn rounds the night's total) */
  deaths: number;
  /** the player's bonus was on this line */
  player: boolean;
  /** the striker cut the surge here: the losses are zero */
  struck?: boolean;
  /** the buildings damaged there in this phase */
  damaged: string[];
}

export interface PhaseResult {
  phase: string;
  lines: LineResult[];
}

export interface NightState {
  id: string;
  /** tick the night began (dusk) */
  start: number;
  /** index of the current phase */
  phase: number;
  /** tick the current phase began */
  phaseTick: number;
  /** tick of the next due check; NEVER while waiting on a phase's `until` */
  next: number;
  /** a flag moved: a waiting `until` is looked at again */
  dirty: boolean;
  /** rows picked per phase and actor */
  picks: Record<string, Record<string, string[]>>;
  /** a chooser's pick for an actor, kept while it stays legal (the command tide.act) */
  chosen: Record<string, string>;
  /** the player's played time per phase and line (game ticks; line id, '' for none) */
  samples: Record<string, Record<string, number>>;
  /** game ticks of a phase spent in hour-coarse time skips (away from the lines) */
  skipped: Record<string, number>;
  /** tick of the last sample */
  sampledAt?: number;
  /** the player's line per settled phase ('' for none) */
  playerLine: Record<string, string>;
  results: PhaseResult[];
  dead: { npc: string; phase: string; cause: string }[];
  injured: { npc: string; phase: string }[];
  /** unnamed dead outside the lines (an escalation's logger) */
  extraDeaths: number;
  buildings: string[];
  escalated: boolean;
  weakest?: string;
  gapWeakest?: number;
  struck?: boolean;
  boss?: string;
  witnesses: string[];
  /** the witnesses' trust when the boss fell (the credit's test, 8.7) */
  witnessTrust?: Record<string, number>;
  mob?: string;
  ended: boolean;
  /** dawn's numbers, kept for the credit computation and the view */
  summary?: NightSummary;
}

export interface NightSummary {
  civilians: number;
  named: string[];
  injured: string[];
  buildings: string[];
  survival: string;
  population: number;
  prosperity: number;
  credit: string;
  tellers: string[];
  losses: string[];
  grievances: { group: string; amount: number }[];
}

export interface TideSlice {
  version: number;
  /** the written night now running or last run */
  night: NightState | null;
  /** written nights that ended */
  done: string[];
  /** tick until which each region's surge rule rests */
  cooldown: Record<string, number>;
  /** children whose deadline runs on after the night (ChildDef.diesLater), by variable */
  pendingChildren: string[];
}
