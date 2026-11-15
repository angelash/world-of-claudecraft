// Strategy (SLG) types: provinces on the continent graph, nations, relations, treaties,
// wars, armies, the seven-nation conclave and the release index (D-043). Treasuries are
// in gold (1 gold = 10000 copper); time steps by game day. See
// docs/40_design/systems/grand_strategy_slg.md.

export type ProvinceTerrain =
  | 'plain'
  | 'forest'
  | 'hills'
  | 'mountain'
  | 'swamp'
  | 'steppe'
  | 'waste'
  | 'coast';

export type NationId = string;

/** Content row of `slg_provinces`. */
export interface ProvinceDef {
  id: string;
  name: string;
  /** region id from docs/20_world/geography.md */
  region: string;
  /** owner at the opening (null = unowned land) */
  owner: NationId | null;
  terrain: ProvinceTerrain;
  population: number;
  /** yearly tax in gold at full stability */
  tax: number;
  /** abstract garrison soldiers */
  garrison: number;
  /** fortification level 0..3 */
  fort: number;
  /** Dian (sediment) level 0..5 */
  dian: number;
  /** map position for the client, 0..100 */
  x: number;
  y: number;
  capitalOf?: NationId;
  /** impassable event node (the dragon's peak) */
  impassable?: boolean;
  /** faith shares per goddess id, 0..1 */
  faith?: Record<string, number>;
  desc?: string;
}

/** Content row of `slg_links` (undirected). */
export interface ProvinceLink {
  a: string;
  b: string;
  /** march days at 1x */
  days: number;
  kind?: 'road' | 'river' | 'pass' | 'sea' | 'trail';
}

export interface RulerPersona {
  name: string;
  /** Chinese persona digest for the AI layer */
  persona: string;
  /** 0..1 utility weights */
  aggression: number;
  greed: number;
  piety: number;
  caution: number;
}

export interface ArmyTemplate {
  id: string;
  province: string;
  name: string;
  general?: string;
  regiments: { typeId: string; count: number }[];
}

/** Content row of `slg_nations`. */
export interface NationDef {
  id: NationId;
  name: string;
  short: string;
  capital: string;
  color: string;
  ruler: RulerPersona;
  /** gold */
  treasury: number;
  stability: number;
  legitimacy: number;
  /** 0..100 (AI nations: simplified, D-043) */
  autonomy: number;
  /** 0..100 structural divine reliance */
  divineReliance: number;
  /** patron goddess id for faith and reliance */
  goddess?: string;
  /** lore matrix row toward other nations, -3..3 (x30 at the opening) */
  relations: Record<NationId, number>;
  armies: ArmyTemplate[];
  /** unit type ids this nation recruits */
  recruits: string[];
  /** admin capacity base (provinces) */
  adminBase: number;
}

export interface StrategyConfig {
  /** relation score per lore step */
  loreScale: number;
  /** soldiers per kernel soldier when field battles get too large */
  maxKernelRegiment: number;
  /** days of truce, at least (D-049: one season) */
  truceDays: number;
  /** days between AI ruler policy rounds */
  rulerEveryDays: number;
  /** province ids granted to the player nation at founding */
  playerProvinces: string[];
  /** player nation template */
  playerNation: Omit<NationDef, 'armies' | 'relations'> & {
    relations: Record<NationId, number>;
    armies: ArmyTemplate[];
  };
  /** extra conclave stance from these flags when truthy (evidence) */
  evidenceFlags: string[];
  /** days of each conclave stage */
  conclaveStages: { stage: ConclaveStage; days: number }[];
}

export type TreatyType =
  | 'alliance'
  | 'trade'
  | 'non_aggression'
  | 'passage'
  | 'recognition'
  | 'pact';

export interface Treaty {
  id: string;
  type: TreatyType;
  a: NationId;
  b: NationId;
  startDay: number;
  endDay?: number;
  note?: string;
}

export interface War {
  id: string;
  attacker: NationId;
  defender: NationId;
  attackers: NationId[];
  defenders: NationId[];
  startDay: number;
  /** positive favors the attacker side */
  score: number;
  casusBelli: boolean;
}

export interface Truce {
  a: NationId;
  b: NationId;
  untilDay: number;
  /** act at signing; the truce lasts at least until the act changes (D-049) */
  act: string;
}

export interface ProvinceState {
  id: string;
  owner: NationId | null;
  controller: NationId | null;
  population: number;
  garrison: number;
  devastation: number;
  /** days since the current owner took it (core after 180) */
  heldDays: number;
  siege: { by: NationId; armyId: string; progress: number } | null;
}

export interface NationState {
  id: NationId;
  treasury: number;
  stability: number;
  legitimacy: number;
  warWeariness: number;
  autonomy: number;
  divineReliance: number;
  credibility: number;
  /** aggressive expansion this nation feels toward each aggressor */
  ae: Record<NationId, number>;
  taxRate: number;
  /** AI state revision; ruler.policy proposals carry it */
  revision: number;
  lastP3Day: number;
  lastPolicyDay: number;
  lastIntent?: string;
  incomeToday: number;
  upkeepToday: number;
  /** nations that recognise this one (player nation legitimacy count) */
  recognizedBy: NationId[];
  alive: boolean;
}

export interface Regiment {
  typeId: string;
  count: number;
}

export interface ArmyState {
  id: string;
  owner: NationId;
  name: string;
  province: string;
  general?: string;
  regiments: Regiment[];
  /** remaining provinces to walk through, next first */
  path: string[];
  /** days walked on the current link */
  progress: number;
  /** waiting for a manual battle */
  frozen?: boolean;
}

export type ConclaveStage = 'invite' | 'talks' | 'summit' | 'signing' | 'done';
export type SummitResult = 'alliance' | 'divided' | 'crusade' | 'broken';

export interface Conference {
  stage: ConclaveStage;
  stageEndsDay: number;
  startDay: number;
  stances: Record<NationId, number>;
  result?: SummitResult;
}

export interface PendingBattle {
  scenarioId: string;
  province: string;
  /** army ids on the player team ('player' side of the field) and the enemy team */
  playerArmies: string[];
  enemyArmies: string[];
  /** soldiers per kernel soldier */
  scale: number;
  createdDay: number;
}

export interface StrategyLogEntry {
  day: number;
  text: string;
}

export interface StrategySlice {
  day: number;
  active: boolean;
  provinces: Record<string, ProvinceState>;
  nations: Record<NationId, NationState>;
  /** directed scores keyed 'a>b', -100..100 */
  relations: Record<string, number>;
  treaties: Treaty[];
  wars: War[];
  truces: Truce[];
  armies: Record<string, ArmyState>;
  nextId: number;
  battleMode: 'auto' | 'manual';
  pendingBattle: PendingBattle | null;
  conference: Conference | null;
  summit: SummitResult | null;
  releaseIndex: number;
  /** display name the player chose at founding */
  playerNationName: string | null;
  log: StrategyLogEntry[];
}

export type DiplomacyAction =
  | 'alliance'
  | 'trade'
  | 'non_aggression'
  | 'passage'
  | 'recognize'
  | 'declare_war'
  | 'truce'
  | 'peace'
  | 'break_treaty';

export type RulerIntent =
  | 'observe'
  | 'proclaim'
  | 'develop'
  | 'raise_tax'
  | 'lower_tax'
  | 'recruit'
  | 'trade'
  | 'passage'
  | 'aid'
  | 'declare_war'
  | 'make_peace'
  | 'ally'
  | 'non_aggression'
  | 'recognize'
  | 'break_treaty';

declare module '../../core/contracts' {
  interface WorldSlices {
    strategy: StrategySlice;
  }
  interface ContentMap {
    slg_provinces: ProvinceDef[];
    slg_links: ProvinceLink[];
    slg_nations: NationDef[];
    slg_config: StrategyConfig;
  }
  interface EventMap {
    'slg.war_declared': {
      attacker: NationId;
      defender: NationId;
      casusBelli: boolean;
      allies: NationId[];
    };
    'slg.peace': { a: NationId; b: NationId; kind: 'truce' | 'peace' };
    'slg.treaty': { a: NationId; b: NationId; type: TreatyType; signed: boolean };
    'slg.province_captured': { provinceId: string; from: NationId | null; to: NationId };
    'slg.battle': {
      provinceId: string;
      attacker: NationId;
      defender: NationId;
      victor: NationId | 'draw';
      losses: Record<NationId, number>;
      manual: boolean;
    };
    'slg.nation_founded': { nationId: NationId; name: string; provinces: string[] };
    'slg.conclave_result': { result: SummitResult; stances: Record<NationId, number> };
    'slg.policy': { nationId: NationId; intent: RulerIntent; target?: string; ok: boolean };
  }
  interface CommandMap {
    'slg.diplomacy': {
      from?: NationId;
      to: NationId;
      action: DiplomacyAction;
      treaty?: TreatyType;
      revision?: number;
    };
    'slg.move_army': { armyId: string; to: string };
    'slg.recruit': { nationId?: NationId; provinceId: string; typeId: string; count: number };
    'slg.found_nation': { name?: string };
    'slg.convene': Record<string, never>;
    'slg.ruler_policy': {
      nationId: NationId;
      intent: RulerIntent;
      target?: string;
      revision: number;
    };
    'slg.set_battle_mode': { mode: 'auto' | 'manual' };
  }
}
