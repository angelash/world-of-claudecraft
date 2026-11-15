// City system types: sites (the old outpost settlement and the inner court), building
// definitions and instances, population, officials, policies and the autonomy ledger.
// See docs/40_design/systems/city_building.md (scale ladder 1, court 2, placement 3.4,
// buildings 4, population 5, production 6, officials 7.4, autonomy 8, events 10).

export type SiteKind = 'settlement' | 'court';
/** Scale ladder (D-045 for battles; city 1.1): outpost, village, territory. Court is separate. */
export type Stage = 'outpost' | 'village' | 'territory' | 'court';
export const STAGE_ORDER: Record<Stage, number> = {
  outpost: 0,
  village: 1,
  territory: 2,
  court: 0,
};

export type Domain =
  | 'food'
  | 'works'
  | 'security'
  | 'civil'
  | 'commerce'
  | 'military'
  | 'culture'
  | 'research';

export const DOMAIN_LABELS: Record<Domain, string> = {
  food: '粮务',
  works: '工务',
  security: '治安',
  civil: '民政',
  commerce: '商务',
  military: '军务',
  culture: '教化',
  research: '研究',
};

export type BuildingCategory =
  | 'residential'
  | 'production'
  | 'storage'
  | 'commerce'
  | 'culture'
  | 'defense'
  | 'admin'
  | 'research'
  | 'special';

export type TerrainNeed = 'any' | 'near_water' | 'near_tree' | 'near_rock';

export interface BuildingEffects {
  security?: number;
  happiness?: number;
  health?: number;
  faith?: number;
  /** village_defense contribution (palisade, tower, guardhouse) */
  defense?: number;
  /** militia soldiers available for raids */
  militia?: number;
  /** archers on towers for raids */
  archers?: number;
  /** migration attraction bonus 0..0.2 */
  attraction?: number;
  /** sediment reduction per day through a registered 'sediment' modifier */
  sediment?: number;
  /** extra policy slot (administration) */
  policySlots?: number;
  /** talent depth bonus (school) */
  talent?: number;
  /** gate link between the inner court and this settlement (door node), daily units */
  gateThroughput?: number;
  /** fire risk per day added by wooden buildings */
  fireRisk?: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  category: BuildingCategory;
  desc: string;
  /** footprint in tiles; the entrance is the tile below the bottom edge, at the centre */
  footprint: { w: number; h: number };
  cost: { items: Record<string, number>; money?: number };
  /** game days to build */
  days: number;
  /** output per day at full staffing */
  produces?: Record<string, number>;
  /** input per day at full staffing */
  consumes?: Record<string, number>;
  /** registered modifier channel for the output (D-013) */
  channel?: 'harvest' | 'production';
  jobs?: number;
  housing?: number;
  storage?: number;
  effects?: BuildingEffects;
  /** copper per 30 game days */
  upkeepPerMonth: number;
  unlock: { stage?: Stage; flags?: string[]; buildings?: string[] };
  terrain?: TerrainNeed;
  sites: SiteKind[];
  /** max instances per site */
  max?: number;
  /** wooden, food, shack, remnant, divine_sight, ... */
  tags?: string[];
}

export interface StageCaps {
  population: number;
  policySlots: number;
  storageBase: number;
}

export interface SiteDef {
  id: string;
  name: string;
  kind: SiteKind;
  mapId: string;
  /** inventory owner id for the stockpile and the treasury */
  stockOwner: string;
  /** location id on the map: settlement centre for reachability checks */
  centerLocation: string;
  /** market used by officials to buy food and sell surplus */
  tradeMarket?: string;
  initialStock: Record<string, number>;
  initialMoney: number;
  /** site usable only while every flag is truthy */
  requiresFlags?: string[];
  /** court: nothing here enters any goddess's observation (city_building 2.5) */
  outsideDivineSight?: boolean;
  /** court: output ignores season, disaster and goddess modifiers (city_building 2.2) */
  immuneToModifiers?: boolean;
  caps: Partial<Record<Stage, StageCaps>>;
  /** what the site stands for in the story (release_engineering.md 13.2), see SiteRole */
  roles?: SiteRole[];
  /** court: the location the door opens onto (else the first safe location) */
  arrivalLocation?: string;
}

/**
 * Site roles: 'village_core' is the settlement the inner court's door leads back to when
 * the player entered the court from nowhere (and that later grows into the territory).
 */
export type SiteRole = 'village_core';

/** One food the residents eat, in eating order (processed and perishable first). */
export interface CityFoodDef {
  itemId: string;
  /** residents fed for a day by one unit (city_building P9: bread 1.3) */
  value: number;
}

/** Daily spoilage of a stocked good (0.3 to 1 percent a day). */
export interface CitySpoilDef {
  itemId: string;
  rate: number;
  /** a granary halves the loss (food yes, herbs no) */
  granaryHalves: boolean;
}

/** A good used up slowly by every resident (need tiers 2 and 3). */
export interface CitySlowUseDef {
  itemId: string;
  perHead: number;
}

/** Item roles of the settlement rules (data/city/config.json). */
export interface CityConfig {
  food: CityFoodDef[];
  spoilage: CitySpoilDef[];
  slowUse: CitySlowUseDef[];
  /** the staple grain: lost first in a raid, bought by officials when food runs short */
  staple: string;
  /**
   * Goods that meet a need (city_building 5.4), any one in stock counts: clothing and care
   * (stability), drink (prosperity), healing (the health bonus).
   */
  needGoods: { clothing: string[]; care: string[]; drink: string[]; healing: string[] };
  /** what officials keep back before selling the rest (sell_surplus), in selling order */
  surplusKeep: { itemId: string; keep: number }[];
}

export interface OfficialDef {
  id: string;
  name: string;
  desc: string;
  competence: Partial<Record<Domain, number>>;
  loyalty: number;
  ambition: number;
  integrity: number;
  initiative: number;
  /** 秩序, 争斗, 交易, 生命, 记录, 门 */
  creed: string;
  requiresFlags?: string[];
}

export interface PolicyEffects {
  happiness?: number;
  security?: number;
  health?: number;
  /** multiplier on all production */
  production?: number;
  /** multiplier on food production */
  foodProduction?: number;
  /** multiplier on head tax */
  tax?: number;
  /** extra refugees per day while housing allows */
  refugees?: number;
  /** extra militia */
  militia?: number;
  /** attraction offset */
  attraction?: number;
  /** auto repair one damaged building per day from stock */
  autoRepair?: boolean;
  /** food producers get workers first */
  foodFirst?: boolean;
}

export interface PolicyDef {
  id: string;
  name: string;
  domain: Domain;
  desc: string;
  minStage: Stage;
  effects: PolicyEffects;
  exclusive?: string[];
}

// ---------------------------------------------------------------------------
// Runtime state

export type PopGroup = 'refugees' | 'remnants' | 'migrants';
export const POP_GROUP_LABELS: Record<PopGroup, string> = {
  refugees: '难民',
  remnants: '遗民',
  migrants: '移民',
};

export interface BuildingInstance {
  id: string;
  defId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  status: 'construction' | 'active';
  /** construction days done */
  progress: number;
  /** 0..100; below 50 degraded, below 20 shut down */
  condition: number;
  workers: number;
  /** readable status shown in the client (warehouse full, missing inputs, ...) */
  note?: string;
  boostUntilDay?: number;
  placedDay: number;
  placedBy: 'player' | 'official';
  /** fractional output carried to the next day */
  acc?: Record<string, number>;
}

export interface HappinessFactor {
  source: string;
  label: string;
  value: number;
}

export interface TempEffect {
  id: string;
  kind: 'happiness' | 'security' | 'health' | 'production' | 'ration' | 'militia';
  value: number;
  untilDay: number;
  label: string;
}

export interface DecisionRecord {
  day: number;
  by: 'player' | 'official';
  weight: number;
}

export interface TrialRecord {
  day: number;
  ok: boolean;
  weight: number;
}

export interface DependencyEntry {
  day: number;
  action: string;
  delta: number;
}

export interface AutonomyLedger {
  I: number;
  T: number;
  D: number;
  S: number;
  C: number;
  pDep: number;
  raw: number;
  value: number;
  /** last 30 daily values, oldest first */
  history: number[];
  dependency: DependencyEntry[];
}

export interface OfficeState {
  domain: Domain;
  holderId?: string;
  deputyId?: string;
  /** 1 routine, 2 important, 3 major, 4 crisis */
  authority: number;
  revision: number;
  vacantDays: number;
}

export interface CityEventRecord {
  day: number;
  kind: CityEventKind;
  severity: 'minor' | 'severe';
  text: string;
}

export type CityEventKind = 'fire' | 'plague' | 'raid';

export interface SiteState {
  id: string;
  stage: Stage;
  active: boolean;
  buildings: BuildingInstance[];
  pop: Record<PopGroup, number>;
  happiness: number;
  factors: HappinessFactor[];
  security: number;
  health: number;
  foodDays: number;
  housing: number;
  storageUsed: number;
  storageCap: number;
  needs: { survival: number; stability: number; prosperity: number; belonging: number };
  offices: Partial<Record<Domain, OfficeState>>;
  policies: string[];
  effects: TempEffect[];
  decisions: DecisionRecord[];
  trials: TrialRecord[];
  autonomy: AutonomyLedger;
  upkeep: { acc: number; arrearsDays: number; state: 'ok' | 'grace' | 'degraded' | 'shutdown' };
  severe: { kind: CityEventKind; untilDay: number }[];
  lastSevereDay: number;
  eventLog: CityEventRecord[];
  settlers: string[];
  /** units moved through door nodes today (court gate throughput) */
  gateUsed: number;
  sediment: number;
  sedimentModifier: { id: string; untilTick: number } | null;
  /** readable status lines for the client */
  status: string[];
  workersTotal: number;
  laborTotal: number;
  /** spoilage carry */
  spoil: Record<string, number>;
}

export interface CitySlice {
  sites: Record<string, SiteState>;
  /** national core offices after the founding (A_core) */
  nation: {
    founded: boolean;
    offices: Partial<Record<Domain, OfficeState>>;
    core: AutonomyLedger | null;
  };
  court: { returnTo: { mapId: string; x: number; y: number } | null };
}

export type MicroAction = 'boost' | 'rush' | 'handle_dispute' | 'personal_defense';

export type OfficialActionId =
  | 'idle'
  | 'ration'
  | 'prioritize_food'
  | 'buy_food'
  | 'repair'
  | 'build_housing'
  | 'build_storage'
  | 'patrol'
  | 'curfew'
  | 'settle'
  | 'welcome_refugees'
  | 'festival'
  | 'sell_surplus'
  | 'drill'
  | 'study';

declare module '../../core/contracts' {
  interface WorldSlices {
    city: CitySlice;
  }
  interface ContentMap {
    city_buildings: BuildingDef[];
    city_sites: SiteDef[];
    city_officials: OfficialDef[];
    city_policies: PolicyDef[];
    city_config: CityConfig;
  }
  interface EventMap {
    'city.building_placed': { siteId: string; buildingId: string; defId: string; by: string };
    'city.building_cancelled': { siteId: string; buildingId: string; defId: string };
    'city.stage_changed': { siteId: string; from: Stage; to: Stage };
    'city.population_changed': { siteId: string; total: number; delta: number; reason: string };
    'city.event': {
      siteId: string;
      kind: CityEventKind;
      severity: 'minor' | 'severe';
      text: string;
      ok: boolean;
    };
    'city.official_decided': {
      siteId: string;
      domain: Domain;
      officialId: string;
      action: OfficialActionId;
      ok: boolean;
      note: string;
    };
    'city.autonomy_changed': { siteId: string; value: number; raw: number };
  }
  interface CommandMap {
    'city.found': { siteId: string };
    'city.place': { siteId: string; defId: string; x: number; y: number };
    'city.cancel': { siteId: string; buildingId: string };
    /** npcId '' vacates the office; siteId 'nation' after slg.nation_founded */
    'city.assign': {
      siteId: string;
      domain: Domain;
      npcId: string;
      rank?: 'head' | 'deputy';
      authority?: number;
    };
    'city.policy': { siteId: string; policyId: string; enabled: boolean };
    'city.micro': { siteId: string; action: MicroAction; target?: string };
    /** itemId 'money' moves copper to or from the treasury */
    'city.deposit': { siteId: string; itemId: string; count: number };
    'city.withdraw': { siteId: string; itemId: string; count: number };
    'city.add_population': { siteId: string; group: PopGroup; count: number; reason?: string };
    /** official.decide proposals and their fallbacks */
    'city.official_act': {
      siteId: string;
      domain: Domain;
      officialId: string;
      action: OfficialActionId;
      revision: number;
    };
    'city.enter_court': Record<string, never>;
    'city.leave_court': Record<string, never>;
  }
}
