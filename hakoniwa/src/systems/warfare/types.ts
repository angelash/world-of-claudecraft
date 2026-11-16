// Warfare (RTS) types: regiment types, battle scenarios, the runtime battle state, and
// the auto-resolve contract shared with strategy and city. A battle is its own grid
// instance (it never uses world-map entities). Regiments resolve by expected value on a
// fixed kernel step; heroes are multipliers whose single cast fells at most 20 percent
// of a regiment (D-012). See docs/40_design/systems/warfare_rts.md.

import type { FlagValue } from '../../core/contracts';
import type { RngState } from '../../core/rng';
import type { TextParam } from '../../core/text';

export type DamageType = 'slash' | 'pierce' | 'blunt' | 'missile' | 'magic' | 'holy' | 'siege';
export type ArmorType = 'none' | 'light' | 'medium' | 'heavy' | 'monster' | 'building' | 'spirit';
export type UnitRole =
  | 'militia'
  | 'shield'
  | 'spear'
  | 'shock'
  | 'archer'
  | 'light_cav'
  | 'heavy_cav'
  | 'mage'
  | 'healer'
  | 'scout'
  | 'monster'
  | 'flying'
  | 'siege';
export type Quality = 'recruit' | 'regular' | 'elite';
export type Formation =
  | 'line'
  | 'column'
  | 'square'
  | 'wedge'
  | 'skirmish'
  | 'shield_wall'
  | 'circle';
export type BattleTerrain =
  | 'plain'
  | 'road'
  | 'forest'
  | 'hill'
  | 'ford'
  | 'water'
  | 'wall'
  | 'swamp'
  | 'snow'
  | 'dian'
  | 'building';

/** Team A is the player's side (with AI allies), team B the enemy. */
export type Team = 'player' | 'enemy';
export type Victor = Team | 'draw';

/** A regiment type (content table `regiment_types`); one representative soldier. */
export interface UnitTypeDef {
  id: string;
  name: string;
  race: string;
  role: UnitRole;
  quality: Quality;
  /** representative soldier level (used by the armor reduction formula) */
  level: number;
  hp: number;
  armor: number;
  armorType: ArmorType;
  dmgMin: number;
  dmgMax: number;
  dmgType: DamageType;
  /** seconds between attacks (ranged: between volleys) */
  attackInterval: number;
  /** reach in battle tiles (melee about 1, bows 6 to 9) */
  range: number;
  hitBase: number;
  dodgeBase: number;
  /** battle tiles per second */
  speed: number;
  /** morale baseline 0..100 (recruit 50, regular 60, elite 70) */
  morale: number;
  formations: Formation[];
  /** recruit cost and monthly upkeep per soldier, copper */
  cost: number;
  upkeep: number;
  desc: string;
  /** traits: night, forest, undead, flying, never_rout, anti_monster, ... */
  tags?: string[];
}

/** A unit as the kernel sees it: a content type, or a built-in stand-in named by a TextRef. */
export type KernelUnit = Omit<UnitTypeDef, 'name'> & { name: TextParam };

export type HeroAbilityKind = 'charge' | 'inspire' | 'aoe' | 'rally' | 'strike';

export interface HeroAbilityDef {
  id: string;
  name: string;
  kind: HeroAbilityKind;
  /** seconds */
  cooldown: number;
  /** battle tiles */
  range: number;
  radius?: number;
  /** damage for charge/aoe/strike, morale for inspire */
  power: number;
  desc: string;
}

export interface RegimentSpec {
  id: string;
  typeId: string;
  count: number;
  x: number;
  y: number;
  formation?: Formation;
  name?: string;
  /** named general leading this regiment (morale bonus, general-killed shock) */
  general?: string;
  /** 'ai' marks an allied regiment the player cannot order (default: team player = player) */
  controller?: 'player' | 'ai';
  requiresFlags?: string[];
}

export interface HeroSpec {
  id: string;
  name: string;
  x: number;
  y: number;
  /** 'player' for the player, otherwise a companion or NPC id */
  ref?: string;
  /** stats; the player's hero scales from its entity tag lvl:<n> when omitted */
  level?: number;
  /**
   * floor for the player's hero level in this battle (a story battle fought at the act's
   * band whatever the player's own level; a stronger player keeps their level)
   */
  minLevel?: number;
  hp?: number;
  attack?: number;
  auraRadius?: number;
  /**
   * kind: auras of the same kind do not stack, the strongest one counts (warfare_rts 2.5);
   * omitted, each hero's aura is its own kind
   */
  aura?: { kind?: string; damage?: number; defense?: number; morale?: number };
  abilities: string[];
  requiresFlags?: string[];
  controller?: 'player' | 'ai';
}

export interface TeamSpec {
  regiments: RegimentSpec[];
  heroes: HeroSpec[];
  /** retreat point for routing regiments */
  retreat: { x: number; y: number };
  /** named commanding general (AI plans) */
  general?: { id: string; name: string; traits?: string[] };
  /** morale baseline bonus for the whole team (home defence, zeal) */
  morale?: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ObjectiveKind = 'annihilate' | 'hold' | 'kill_hero' | 'survive';

export interface ObjectiveSpec {
  id: string;
  /** whose objective it is */
  team: Team;
  kind: ObjectiveKind;
  /** display label: content text for scenarios, a TextRef for generated field battles */
  label: TextParam;
  /** hold: the zone; seconds: hold or survive duration */
  zone?: Rect;
  seconds?: number;
  heroId?: string;
  /** completing it wins the battle at once (annihilate is always decisive) */
  decisive?: boolean;
}

export interface ReinforcementSpec {
  atSecond: number;
  team: Team;
  regiments: RegimentSpec[];
  heroes?: HeroSpec[];
  requiresFlags?: string[];
  label?: string;
}

/** Everything the kernel needs to run a battle; scenarios and generated fields share it. */
export interface BattleSetup {
  /** display name: content text for scenarios, a TextRef for generated field battles */
  name: TextParam;
  width: number;
  height: number;
  rows: string[];
  legend: Record<string, BattleTerrain>;
  teams: Record<Team, TeamSpec>;
  objectives: ObjectiveSpec[];
  reinforcements?: ReinforcementSpec[];
  /** battle seconds; at the limit the result is judged on objectives and strength */
  timeLimit: number;
  /** named zones for multi-front battles (display) */
  zones?: { id: string; name: string; rect: Rect }[];
}

export interface BattleScenarioDef extends BattleSetup {
  name: string;
  id: string;
  /** squad, company, legion, coalition (D-045) */
  scale: 'squad' | 'company' | 'legion' | 'coalition';
  act?: string;
  desc: string;
}

// ---------------------------------------------------------------------------
// Runtime state (plain data, serialized with the world)

export type RegimentStateName = 'idle' | 'march' | 'engaged' | 'hold' | 'rout' | 'rally' | 'gone';

export type UnitOrder =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'attack'; targetId: string }
  | { kind: 'hold'; x: number; y: number }
  | { kind: 'retreat' };

export interface RegimentState {
  id: string;
  typeId: string;
  team: Team;
  controller: 'player' | 'ai';
  /** display name: the spec or unit type name (content), or a TextRef for built-in units */
  name: TextParam;
  count: number;
  maxCount: number;
  x: number;
  y: number;
  facing: number;
  formation: Formation;
  state: RegimentStateName;
  morale: number;
  fatigue: number;
  order: UnitOrder | null;
  path: { x: number; y: number }[];
  /** leftover damage below one soldier (never lost) */
  dmgAcc: number;
  /** formation broken until this battle time (frontage halved) */
  brokenUntil: number;
  /** recent losses for the casualty-shock morale rule */
  losses: { t: number; n: number }[];
  general?: string;
  /** last engaged enemy id (display, flank memory) */
  targetId?: string;
  /** battle time of the last casualty-shock morale hit */
  shockAt?: number;
  /** fought or was attacked during the last kernel step */
  busy?: boolean;
  /** set once the general-killed morale shock has been applied */
  leaderLost?: boolean;
  /** AI chase memory: closest distance reached to the current target and AI rounds without progress */
  aiChase?: { targetId: string; best: number; rounds: number };
  /** AI gave up on this target until the given step (no progress) */
  aiAvoid?: { targetId: string; untilStep: number };
}

export interface HeroState {
  id: string;
  name: string;
  team: Team;
  controller: 'player' | 'ai';
  ref?: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  auraRadius: number;
  aura: { kind: string; damage: number; defense: number; morale: number };
  abilities: { id: string; readyAt: number }[];
  down: boolean;
  order: { kind: 'move'; x: number; y: number } | null;
  path?: { x: number; y: number }[];
  /** hero id or regiment id the hero is chasing (AI) */
  chase?: string;
}

export interface ObjectiveState extends ObjectiveSpec {
  /** seconds accumulated (hold, survive) */
  progress: number;
  status: 'active' | 'done' | 'failed';
  /** hold: seconds the zone has been held by the enemy alone */
  lostFor?: number;
}

export type PlanId = 'advance' | 'flank' | 'breakthrough' | 'hold' | 'protect' | 'decapitate';

export interface BattleLogEntry {
  t: number;
  text: TextParam;
}

export interface BattleState {
  id: string;
  scenarioId: string;
  name: TextParam;
  /** battle seconds elapsed */
  time: number;
  step: number;
  width: number;
  height: number;
  rows: string[];
  legend: Record<string, BattleTerrain>;
  regiments: RegimentState[];
  heroes: HeroState[];
  objectives: ObjectiveState[];
  pending: ReinforcementSpec[];
  retreat: Record<Team, { x: number; y: number }>;
  generals: Partial<Record<Team, { id: string; name: string; traits?: string[] }>>;
  plans: Partial<Record<Team, { planId: PlanId; at: number; source: 'ai' | 'rule' }>>;
  timeLimit: number;
  rng: RngState;
  /** bumped on every plan change; AI proposals carry it */
  revision: number;
  mode: 'manual' | 'auto';
  log: BattleLogEntry[];
  outcome: { victor: Victor; reason: TextParam } | null;
  zones?: { id: string; name: string; rect: Rect }[];
  /** additive morale baseline per team from registered morale modifiers */
  moraleBonus?: Partial<Record<Team, number>>;
  /** recent battle state hashes (sync_hash.ts), newest last */
  syncHashes?: { step: number; hash: number }[];
  /** transient notices produced by the last kernel step (routs, heroes down, casts) */
  flashes?: {
    kind: 'rout' | 'hero_down' | 'ability';
    id: string;
    team: Team;
    abilityId?: string;
    targetId?: string;
    felled?: number;
  }[];
}

export interface BattleResultRecord {
  battleId: string;
  scenarioId: string;
  victor: Victor;
  reason: TextParam;
  seconds: number;
  tick: number;
  casualties: Record<Team, number>;
  regiments: { id: string; typeId: string; team: Team; start: number; end: number }[];
}

export interface WarfareSlice {
  battle: BattleState | null;
  /** the battle that just ended, with its outcome, kept readable until the next one starts */
  last?: BattleState | null;
  /** generated setups registered by other systems (strategy, city) by scenario id */
  custom: Record<string, BattleSetup>;
  results: BattleResultRecord[];
  nextBattle: number;
}

// ---------------------------------------------------------------------------
// Auto-resolve contract (pure; used by strategy and city)

export interface AutoResolveInput {
  setup: BattleSetup;
  units: UnitTypeDef[];
  abilities?: HeroAbilityDef[];
  seed: number;
  /** resolved story flags for requiresFlags filters */
  flags?: Record<string, FlagValue>;
  /** level of the player's hero when its spec has no level */
  playerLevel?: number;
  maxSeconds?: number;
}

export interface AutoResolveResult {
  victor: Victor;
  reason: TextParam;
  seconds: number;
  teams: Record<
    Team,
    {
      start: number;
      end: number;
      regiments: { id: string; typeId: string; start: number; end: number }[];
    }
  >;
  heroesDown: string[];
}

/** A force for generated field battles (strategy armies, city raids). */
export interface ForceSpec {
  regiments: { typeId: string; count: number; id?: string; general?: string }[];
  heroes?: HeroSpec[];
}

declare module '../../core/contracts' {
  interface WorldSlices {
    warfare: WarfareSlice;
  }
  interface ContentMap {
    regiment_types: UnitTypeDef[];
    battle_scenarios: BattleScenarioDef[];
    hero_abilities: HeroAbilityDef[];
  }
  interface EventMap {
    'war.battle_started': { battleId: string; scenario: string; mode: 'manual' | 'auto' };
    'war.battle_report': {
      battleId: string;
      scenario: string;
      victor: Victor;
      reason: TextParam;
      seconds: number;
      casualties: Record<Team, number>;
      regiments: { id: string; typeId: string; team: Team; start: number; end: number }[];
    };
    'war.regiment_routed': { battleId: string; regimentId: string; team: Team };
    'war.hero_ability_used': {
      battleId: string;
      heroId: string;
      abilityId: string;
      targetId?: string;
      felled: number;
    };
  }
  interface CommandMap {
    'war.start': { scenarioId: string };
    /** unitId is a regiment id or a hero id */
    'war.order': {
      unitId: string;
      kind: 'move' | 'attack' | 'hold' | 'retreat' | 'formation';
      x?: number;
      y?: number;
      targetId?: string;
      formation?: Formation;
    };
    'war.hero_ability': {
      heroId: string;
      abilityId: string;
      targetId?: string;
      x?: number;
      y?: number;
    };
    'war.retreat': Record<string, never>;
    'war.auto_resolve': { scenarioId?: string };
    /** general.order AI proposals and their fallbacks */
    'war.general_plan': {
      battleId: string;
      team: Team;
      generalId: string;
      planId: PlanId;
      revision: number;
    };
  }
}
