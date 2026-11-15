// Economy types: market definitions and state, the trade session, the Door Company
// (门扉商会) with caravans and Earth-knowledge production, and the rule-driven competitor
// (金冠商行). Money is integer copper (see systems/inventory formatMoney).
// See docs/40_design/systems/economy_and_trade.md.

export interface MarketGoodDef {
  itemId: string;
  /** units consumed per day by the market's population and trades */
  demand: number;
  /** units produced or imported per day */
  supply: number;
  /** opening stock in days of demand (default: the config target days) */
  stockDays?: number;
  /** local price factor on top of the item value (scarcity, specialty) */
  priceMult?: number;
}

export interface MarketDef {
  id: string;
  name: string;
  /** region id from docs/20_world/geography.md */
  region: string;
  /** maps whose merchants trade at this market */
  mapIds: string[];
  /** trade tax, 0..1 (where it goes: the settlement treasury) */
  taxRate: number;
  /** bid/ask spread, 0..1 */
  spread: number;
  population: number;
  /** market is closed until every listed flag is truthy */
  requiresFlags?: string[];
  goods: MarketGoodDef[];
  /** share of item value a merchant pays for unlisted, legal items (loot) */
  buybackRate: number;
  /** NPC content ids that trade here even without a merchant tag */
  merchantRefs?: string[];
  desc: string;
}

export interface RecipeDef {
  id: string;
  name: string;
  /** produced item id */
  product: string;
  output: number;
  inputs: Record<string, number>;
  /** game days per run */
  days: number;
  /** 口述 (oral, from the cabin workbench) or 书斋 (court study) */
  tier: 'oral' | 'study';
  requiresFlags?: string[];
  /** days after the first sale until the competitor imitates it */
  imitationDays: number;
  desc: string;
}

export interface RouteDef {
  id: string;
  name: string;
  /** market ids; routes run both ways */
  a: string;
  b: string;
  /** caravan travel days */
  days: number;
  /** raid chance per travel day before escorts */
  risk: number;
  /** toll on cargo value, 0..1 */
  tollRate: number;
}

export interface EconomyConfig {
  targetDays: number;
  /** max relative change of the supply-demand multiplier per day */
  maxDailyChange: number;
  /** exponent k by item class */
  k: { staple: number; general: number; luxury: number };
  bounds: { staple: [number, number]; other: [number, number] };
  /** combined price modifier factor is clamped to this range (economy design 7.3) */
  modifierBounds: [number, number];
  /** items legal markets refuse (D-040) */
  illegalItems: string[];
  company: {
    id: string;
    name: string;
    ownerId: string;
    partnerNpc: string;
    foundCost: number;
    requiresFlags?: string[];
    /** partner share of caravan profit by flag nera.stance */
    partnerShare: Record<string, number>;
    defaultPartnerShare: number;
    cartCapacity: number;
    cartCostPerDay: number;
    guardCostPerDay: number;
    /** raid chance reduction per guard per cart, capped */
    guardCover: number;
    maxCaravans: number;
    maxQueue: number;
  };
  competitor: {
    id: string;
    name: string;
    ownerId: string;
    startFunds: number;
    /** daily imitation output as a share of a market's demand */
    imitationShare: number;
    /** company weekly volume share that triggers undercutting */
    undercutTrigger: number;
    undercutShare: number;
    hoardBelow: number;
    hoardShare: number;
    cooldownDays: number;
    /** company scale that triggers a buyout offer */
    offerAtScale: number;
  };
}

export interface MarketGoodState {
  stock: number;
  /** current supply-demand multiplier */
  mult: number;
}

export interface MarketState {
  goods: Record<string, MarketGoodState>;
  /** company and player sales per item over the last 7 days, newest last */
  sales: Record<string, number[]>;
  taxCollected: number;
}

export interface TradeSession {
  npcId: string;
  npcRef?: string;
  marketId: string;
  openedTick: number;
}

export interface CaravanState {
  id: string;
  routeId: string;
  from: string;
  to: string;
  cargo: Record<string, number>;
  /** cargo value at the origin's ask price, for the profit split */
  costBasis: number;
  carts: number;
  guards: number;
  departTick: number;
  arriveTick: number;
  status: 'travel' | 'arrived' | 'lost';
  raids: number;
  revenue: number;
}

export interface ProductionJob {
  id: string;
  recipeId: string;
  runs: number;
  doneTick: number;
}

export interface CompanyLedgerEntry {
  day: number;
  delta: number;
  reason: string;
}

export interface CompanyState {
  founded: boolean;
  foundedDay: number;
  partnerShare: number;
  reputation: number;
  scale: number;
  caravans: CaravanState[];
  jobs: ProductionJob[];
  /** first company sale of each item: day and market (imitation clock) */
  firstSale: Record<string, { day: number; marketId: string }>;
  produced: Record<string, number>;
  caravansDone: number;
  revenue: number;
  ledger: CompanyLedgerEntry[];
}

export interface CompetitorAction {
  day: number;
  kind: 'imitate' | 'undercut' | 'hoard' | 'offer';
  marketId: string;
  itemId?: string;
  note: string;
}

export interface CompetitorState {
  imitating: Record<string, boolean>;
  cooldown: Record<string, number>;
  offered: boolean;
  actions: CompetitorAction[];
}

export interface EconomySlice {
  markets: Record<string, MarketState>;
  session: TradeSession | null;
  company: CompanyState;
  competitor: CompetitorState;
  day: number;
}

export interface QuoteLine {
  kind: 'base' | 'supply' | 'modifier' | 'spread' | 'tax';
  label: string;
  value: number;
  modifierId?: string;
}

export interface PriceQuote {
  marketId: string;
  itemId: string;
  side: 'buy' | 'sell';
  qty: number;
  unit: number;
  total: number;
  lines: QuoteLine[];
  legal: boolean;
}

export type TradeResult = { ok: true; total: number } | { ok: false; code: string; reason: string };

declare module '../../core/contracts' {
  interface WorldSlices {
    economy: EconomySlice;
  }
  interface ContentMap {
    markets: MarketDef[];
    trade_recipes: RecipeDef[];
    trade_routes: RouteDef[];
    economy_config: EconomyConfig;
  }
  interface EventMap {
    'economy.trade_opened': { npcId: string; marketId: string };
    'economy.trade_closed': { npcId: string; marketId: string };
    'economy.traded': {
      marketId: string;
      ownerId: string;
      itemId: string;
      qty: number;
      side: 'buy' | 'sell';
      total: number;
    };
    'economy.prices_updated': { day: number };
    'economy.company_founded': { companyId: string; partnerShare: number };
    'economy.caravan_departed': { caravanId: string; from: string; to: string; arriveTick: number };
    'economy.caravan_raided': { caravanId: string; lostShare: number };
    'economy.caravan_arrived': { caravanId: string; to: string; revenue: number; profit: number };
    'economy.production_done': { jobId: string; recipeId: string; itemId: string; count: number };
    'economy.competitor_action': CompetitorAction & { competitorId: string };
  }
  interface CommandMap {
    'economy.buy': { itemId: string; qty: number; ownerId?: string };
    'economy.sell': { itemId: string; qty: number; ownerId?: string };
    'economy.close_trade': Record<string, never>;
    'economy.found_company': Record<string, never>;
    /** positive deposits player money into the company, negative withdraws */
    'economy.company_funds': { amount: number };
    'economy.company_transfer': { itemId: string; qty: number; to: 'company' | 'player' };
    'economy.company_buy': { marketId: string; itemId: string; qty: number };
    'economy.company_sell': { marketId: string; itemId: string; qty: number };
    'economy.produce': { recipeId: string; runs: number };
    'economy.caravan_send': {
      from: string;
      to: string;
      cargo: Record<string, number>;
      guards: number;
    };
  }
}
