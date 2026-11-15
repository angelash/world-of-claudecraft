// Combat types: content shapes (classes, abilities, auras, monsters, waves, fixtures),
// the per-entity combat unit, the combat slice, and the events and commands combat
// registers on the kernel contracts. Units hang off world entities by entity id.
// See docs/50_tech/architecture.md 4.6 (phase 20) and docs/20_world/power_system.md 3 to 5.

import type { Appearance } from '../world/types';

export type ResourceKind = 'mana' | 'rage' | 'energy';
export type School = 'physical' | 'holy' | 'fire' | 'frost' | 'nature' | 'shadow' | 'arcane';
/** ally: the player, companions, friendly guards; enemy: monsters and hostile people. */
export type Side = 'ally' | 'enemy' | 'neutral';
export type Role = 'tank' | 'healer' | 'melee' | 'ranged' | 'caster';
export type StatKey =
  | 'str'
  | 'agi'
  | 'sta'
  | 'int'
  | 'spi'
  | 'armor'
  | 'ap'
  | 'sp'
  | 'crit'
  | 'hit'
  | 'haste'
  | 'dodge';
/** Flat stats. crit, hit, haste and dodge are percentage points (5 = 5%). */
export type StatBlock = Partial<Record<StatKey, number>>;
export type CcKind = 'stun' | 'root' | 'silence' | 'slow' | 'fear' | 'incapacitate';
export type MobFamily =
  | 'beast'
  | 'humanoid'
  | 'spider'
  | 'burrower'
  | 'undead'
  | 'elemental'
  | 'construct'
  | 'dragonkin'
  | 'demon';
export type MonsterRank = 'normal' | 'elite' | 'rare' | 'boss';
export type HitOutcome =
  | 'hit'
  | 'crit'
  | 'miss'
  | 'dodge'
  | 'parry'
  | 'block'
  | 'resist'
  | 'immune'
  | 'absorb';

/** base + perLevel x (level - 1) + coef x power (attack power or spell power). */
export interface Scaling {
  base: number;
  perLevel?: number;
  coef?: number;
}

export type AbilityTarget =
  | 'enemy'
  | 'ally'
  | 'self'
  /** every enemy within radius of the caster */
  | 'area'
  /** every enemy within radius of the chosen enemy */
  | 'enemy_area'
  /** every ally within radius of the caster (party buffs) */
  | 'party'
  /** every ally within radius of the chosen ally */
  | 'ally_area';

/** How rule-driven AI (monsters, companions, guards) decides when to use an ability. */
export type AiUse =
  | 'filler'
  | 'opener'
  | 'dot'
  | 'debuff'
  | 'aoe'
  | 'execute'
  | 'finisher'
  | 'heal'
  | 'hot'
  | 'shield'
  | 'emergency'
  | 'buff'
  | 'defensive'
  | 'taunt'
  | 'interrupt'
  | 'cc'
  | 'summon'
  | 'mana'
  | 'never';

export type EffectDef =
  | {
      type: 'damage';
      school?: School;
      amount?: Scaling;
      /** adds a weapon swing times this multiplier */
      weapon?: number;
      /** extra damage per consumed combo point */
      perCombo?: Scaling;
      /** heal the caster for this fraction of damage dealt */
      leech?: number;
      /** threat multiplier (default 1) */
      threat?: number;
      /** which power the coefficient scales with (default ap for physical, sp otherwise) */
      power?: 'ap' | 'sp';
    }
  | { type: 'heal'; amount: Scaling }
  | { type: 'heal_pct'; pct: number }
  | { type: 'aura'; aura: string; to?: 'target' | 'self'; perComboMult?: number }
  | { type: 'resource'; resource: ResourceKind; amount: number }
  | { type: 'hp_to_mana'; amount: Scaling }
  | { type: 'combo'; amount: number }
  | { type: 'taunt' }
  | { type: 'interrupt'; lockout: number }
  | { type: 'dispel'; kind: 'debuff' | 'buff'; count?: number }
  | { type: 'charge' }
  | { type: 'knockback'; distance: number }
  | { type: 'summon'; monster: string; count: number }
  | { type: 'threat'; amount: Scaling };

export interface AbilityRequires {
  targetHpBelow?: number;
  selfHpBelow?: number;
  combo?: number;
  targetLacksAura?: string;
}

export interface AbilityDef {
  id: string;
  name: string;
  desc: string;
  school?: School;
  target: AbilityTarget;
  /** tiles; 0 or omitted for self and caster-centred areas; melee abilities use 1.2 */
  range?: number;
  minRange?: number;
  radius?: number;
  maxTargets?: number;
  resource?: ResourceKind;
  /** flat cost (rage, energy, or mana) */
  cost?: number;
  /** cost as a fraction of max mana (scales across 60 levels) */
  costPct?: number;
  /** seconds; 0 or omitted is instant */
  castTime?: number;
  cooldown?: number;
  /** triggers the global cooldown (default true) */
  gcd?: boolean;
  requires?: AbilityRequires;
  effects: EffectDef[];
  ai?: AiUse;
  /** higher first when AI picks among usable abilities */
  priority?: number;
  /** spoken line emitted as dialogue.line when a monster uses it */
  say?: string;
}

export interface AuraPeriodic {
  every: number;
  damage?: Scaling;
  heal?: Scaling;
  school?: School;
}

export interface AuraMods {
  damageDealt?: number;
  damageTaken?: number;
  healingDone?: number;
  healingTaken?: number;
  haste?: number;
  speed?: number;
  armorPct?: number;
}

export interface AuraDef {
  id: string;
  name: string;
  desc?: string;
  kind: 'buff' | 'debuff';
  /** seconds; 0 means it lasts until removed (passives, enrage) */
  duration: number;
  maxStacks?: number;
  periodic?: AuraPeriodic;
  /** flat stats per stack */
  stats?: StatBlock;
  /** extra flat stats per stack per level of the applier */
  statsPerLevel?: StatBlock;
  /** additive fractions per stack (damageTaken -0.5 halves damage taken) */
  mods?: AuraMods;
  cc?: CcKind;
  /** movement slow fraction (0.5 halves speed) */
  slow?: number;
  absorb?: Scaling;
  /** damage returned to melee attackers */
  thorns?: Scaling;
  /** periodic damage to enemies around the bearer */
  pulse?: { every: number; radius: number; damage: Scaling; school?: School };
  breakOnDamage?: boolean;
  dispellable?: boolean;
}

export interface ClassBase {
  str: number;
  agi: number;
  sta: number;
  int: number;
  spi: number;
}

export interface ClassDef {
  id: string;
  name: string;
  desc: string;
  /** primary resource; null for the outsider (pools come from doors, R-02) */
  resource: ResourceKind | null;
  role: Role;
  armorType: 'cloth' | 'leather' | 'mail';
  base: ClassBase;
  /** per level after the first */
  growth: ClassBase;
  hp: number;
  hpPerLevel: number;
  mana?: number;
  manaPerLevel?: number;
  /** attack power rule (classic): str2 = str x 2, str_agi = str + agi, str = str */
  apFrom: 'str2' | 'str_agi' | 'str';
  canParry?: boolean;
  /** auto-attack range in tiles (hunters shoot); default melee */
  attackRange?: number;
  unarmed: { min: number; max: number; speed: number };
  abilities: { id: string; level: number }[];
}

export interface LootEntry {
  itemId: string;
  chance: number;
  min?: number;
  max?: number;
}

export interface BossPhase {
  belowPct: number;
  name: string;
  say?: string;
  /** replaces the ability list from this phase on */
  abilities?: string[];
  /** aura applied to self when the phase starts */
  aura?: string;
}

export interface MonsterMechanics {
  /** flee once below this hp fraction (humanoid, burrower; never elite, rare or boss) */
  flee?: number;
  enrage?: { belowPct: number; aura: string; say?: string };
  summon?: { atPct: number; monster: string; count: number; say?: string }[];
  phases?: BossPhase[];
  /** stop fighting at this hp fraction instead of dying (Sasha retreats, the raven falls) */
  yieldAtPct?: number;
  yieldSay?: string;
  /** seconds after yielding before the entity leaves (omit to stay) */
  despawnAfterYield?: number;
  /** stacking self aura gained every N seconds in combat (Sasha's tempering) */
  ramp?: { every: number; aura: string };
  /** auras applied to the target on auto-attack hits */
  onHit?: { aura: string; chance: number }[];
  /** permanent auras at spawn (thorns, hides) */
  passives?: string[];
  /** radius in tiles that pulls idle kin of the same monster id into a fight */
  social?: number;
  /** while this flag is truthy the monster spawns neutral (purified ravens scout instead) */
  pacifiedBy?: string;
  /** remove every live instance once this flag turns truthy */
  removeOnFlag?: string;
  /** radius of the presence field (power_system.md 3.5) */
  presence?: number;
  /**
   * story encounter level sync: on the first pull the level becomes the player's level
   * plus `offset`, at least `min`, at most the monster's maxLevel
   */
  partySync?: { offset: number; min?: number };
}

export interface MonsterDef {
  id: string;
  name: string;
  desc: string;
  family: MobFamily;
  /** race tag for humanoids that are people, not monsters (power_system.md 7.3) */
  race?: string;
  faction: string;
  minLevel: number;
  maxLevel: number;
  rank?: MonsterRank;
  hpMult?: number;
  dmgMult?: number;
  armorMult?: number;
  /** seconds per auto-attack swing (default 2) */
  attackSpeed?: number;
  /** auto-attack range in tiles (default melee) */
  range?: number;
  school?: School;
  /** tiles per second */
  speed?: number;
  aggroRadius: number;
  /** tiles from the pull point before evading */
  leash: number;
  /** humanoid enemies can borrow a class ability list by level */
  classId?: string;
  abilities?: string[];
  mechanics?: MonsterMechanics;
  loot?: LootEntry[];
  /** copper range [min, max] */
  money?: [number, number];
  xpMult?: number;
  appearance: Appearance;
}

export interface WaveDef {
  id: string;
  name: string;
  mapId: string;
  /** spawn location id (falls back to the map centre when missing) */
  at: string;
  /** location id the wave marches on */
  target?: string;
  radius?: number;
  groups: { monster: string; count: number; level?: number }[];
  /** once this flag turns truthy the wave's live members leave (the story beat ended it) */
  endOnFlag?: string;
}

/** Fixed presences combat places itself (the gatekeeper Ash). */
export interface FixtureDef {
  id: string;
  mapId: string;
  location: string;
  kind: 'npc' | 'object';
  ref: string;
  name: string;
  level: number;
  tier: number;
  tags: string[];
  appearance: Appearance;
  presence?: number;
}

// ---------------------------------------------------------------------------
// Runtime state

export interface Aura {
  id: string;
  sourceId: string;
  /** expiry tick; 0 means permanent */
  expires: number;
  stacks: number;
  /** applier level, for statsPerLevel and periodic scaling */
  lvl: number;
  /** next periodic or pulse tick */
  next?: number;
  /** periodic amount per tick, precomputed at application */
  power?: number;
  absorb?: number;
  thorns?: number;
  /** granting door or system for passives */
  origin?: string;
}

export interface CastState {
  abilityId: string;
  targetId: string | null;
  start: number;
  end: number;
  x: number;
  y: number;
}

export type BrainState = 'idle' | 'chase' | 'flee' | 'evade' | 'yielded';

export interface MonsterBrain {
  state: BrainState;
  homeX: number;
  homeY: number;
  pullX: number;
  pullY: number;
  wanderAt: number;
  pathAt: number;
  goalX: number;
  goalY: number;
  fleeUntil: number;
  fled: boolean;
  evadeUntil: number;
  /** summon entries already triggered */
  summoned: number[];
  phase: number;
  enraged: boolean;
  rampAt: number;
  abilityAt: number;
  despawnAt: number;
}

export interface Unit {
  id: string;
  classId: string | null;
  monsterId: string | null;
  level: number;
  tier: number;
  xp: number;
  side: Side;
  attackable: boolean;
  hp: number;
  res: Partial<Record<ResourceKind, number>>;
  /** extra pools granted by source (doors grant pools to the outsider, R-02) */
  pools: Partial<Record<ResourceKind, Record<string, number>>>;
  combo: number;
  auras: Aura[];
  /** abilityId -> tick when ready */
  cds: Record<string, number>;
  gcd: number;
  cast: CastState | null;
  /** monsters: attacker id -> threat */
  threat: Record<string, number>;
  target: string | null;
  autoAttack: boolean;
  swingAt: number;
  combatUntil: number;
  manaSpentAt: number;
  /** explicit ability grants (player doors) on top of the class list */
  abilities: string[];
  /** source id -> flat stats (doors) */
  bonuses: Record<string, StatBlock>;
  baseSpeed: number;
  /** first ally-side unit that damaged this unit (loot and experience credit) */
  tapped: string | null;
  ai: MonsterBrain | null;
  /** strength multiplier from registered monster modifiers at spawn */
  power: number;
  spawnKey?: string;
  waveId?: string;
  presence?: number;
  /** rank floor for beings the Record cannot hold (Ash) */
  tierFloor?: number;
  forced?: { id: string; until: number };
  summonerId?: string;
  downed?: boolean;
  /** overrides the ability list (boss phases) */
  phaseAbilities?: string[];
  /** wave march target */
  march?: { x: number; y: number };
}

export interface SpawnState {
  alive: string[];
  respawn: number[];
}

export interface CombatSlice {
  units: Record<string, Unit>;
  spawns: Record<string, SpawnState>;
  waves: Record<string, { state: 'active' | 'cleared'; members: string[]; tick: number }>;
  /** entity id -> tick when the corpse is removed */
  corpses: Record<string, number>;
  /** recent player death ticks (door return overload) */
  deaths: number[];
  /** `${unitId}>${sourceId}` -> tick of the last presence_felt event */
  presence: Record<string, number>;
}

declare module '../../core/contracts' {
  interface WorldSlices {
    combat: CombatSlice;
  }
  interface ContentMap {
    classes: ClassDef[];
    abilities: AbilityDef[];
    auras: AuraDef[];
    monsters: MonsterDef[];
    waves: WaveDef[];
    combatFixtures: FixtureDef[];
  }
  interface EventMap {
    'combat.damage': {
      sourceId: string;
      targetId: string;
      abilityId?: string;
      amount: number;
      absorbed: number;
      school: School;
      outcome: HitOutcome;
    };
    'combat.heal': {
      sourceId: string;
      targetId: string;
      abilityId?: string;
      amount: number;
      overheal: number;
      crit: boolean;
    };
    'combat.aura': {
      targetId: string;
      auraId: string;
      sourceId: string;
      op: 'applied' | 'refreshed' | 'removed';
      stacks: number;
    };
    'combat.cast': {
      casterId: string;
      abilityId: string;
      targetId?: string;
      op: 'start' | 'finish' | 'interrupted';
    };
    'combat.kill': {
      killerId?: string;
      killerSide?: Side;
      victimId: string;
      victimRef?: string;
      monsterId?: string;
      family?: string;
      rank: MonsterRank | 'unit';
      level: number;
      tier: number;
      side: Side;
      mapId: string;
    };
    'combat.loot': {
      ownerId: string;
      victimId: string;
      items: { itemId: string; count: number }[];
      money: number;
    };
    'combat.xp': { entityId: string; amount: number; reason: string; level: number; xp: number };
    'combat.level_up': { entityId: string; level: number; tier: number };
    'combat.boss_phase': { entityId: string; bossId: string; phase: number; name: string };
    'combat.boss_defeated': { entityId: string; bossId: string; yielded: boolean };
    'combat.player_returned': {
      fromMap: string;
      x: number;
      y: number;
      toMap: string;
      toX: number;
      toY: number;
      innerCourt: boolean;
      moneyLost: number;
      fatigueMinutes: number;
    };
    'combat.wave_spawned': { waveId: string; mapId: string; count: number };
    'combat.wave_cleared': { waveId: string; mapId: string };
    'combat.presence_felt': { entityId: string; sourceId: string; gap: number };
    'combat.revived': { entityId: string; hpPct: number };
    'combat.evade': { entityId: string };
  }
  interface CommandMap {
    /** entityId defaults to the player; player-sourced commands may only drive the player */
    'combat.target': { entityId?: string; targetId: string | null };
    'combat.attack': { entityId?: string; on?: boolean; targetId?: string };
    'combat.cast': { entityId?: string; abilityId: string; targetId?: string };
    'combat.stop': { entityId?: string };
    'combat.set_class': { entityId: string; classId: string; level?: number };
    /** debug and scripts: spawn monsters near a point (defaults to the player) */
    'combat.spawn': {
      monsterId: string;
      mapId?: string;
      x?: number;
      y?: number;
      level?: number;
      count?: number;
    };
  }
}
