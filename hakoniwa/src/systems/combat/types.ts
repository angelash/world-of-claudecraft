// Combat types: content shapes (classes, abilities, auras, monsters, waves, fixtures),
// the per-entity combat unit, the combat slice, and the events and commands combat
// registers on the kernel contracts. Units hang off world entities by entity id.
// See docs/50_tech/architecture.md 4.6 (phase 20) and docs/20_world/power_system.md 3 to 5.

import type { TextParam } from '../../core/text';
import type { Parcel } from '../inventory';
import type { Appearance } from '../world/types';
import type {
  AddWave,
  BossFight,
  BossPhaseExt,
  BossTargeting,
  ChannelDef,
  InjureDef,
  InteractState,
  MarkDef,
  MonsterRegistryFields,
  ResolveDef,
  ShieldPhaseDef,
  TelegraphDef,
  TelegraphState,
  TerrainState,
  TerrainUse,
} from './mech_types';

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
export type CcKind = 'stun' | 'root' | 'silence' | 'slow' | 'fear' | 'incapacitate' | 'disarm';
/**
 * Diminishing-returns categories (combat_and_classes.md 9.2): three kinds of stun (active,
 * opener, proc), root, incapacitate, sleep, polymorph, fear, silence and disarm; each has
 * its own ladder (full, half, quarter, immune) and its own 18-second reset window.
 */
export type DrCategory =
  | 'stun_ctrl'
  | 'stun_open'
  | 'stun_proc'
  | 'root'
  | 'incap'
  | 'sleep'
  | 'poly'
  | 'fear'
  | 'silence'
  | 'disarm';
/** Dispel categories (9.5); an aura without one cannot be dispelled. */
export type DispelType = 'magic' | 'curse' | 'poison' | 'disease';
/** Aura bar category (8.2; the interface's `AuraView`). */
export type AuraCategory = 'buff' | 'debuff' | 'state' | 'mount' | 'food';
/**
 * Boss layers (5.5): lair lord, dungeon lord, great-dungeon boss, surge lord, story boss,
 * and the tutorial boss (9.3: controlled like an elite; 17.4: a party of one).
 */
export type BossTier = 'lair' | 'dungeon' | 'raid' | 'surge' | 'story' | 'tutorial';
/** Weapon class of the striking hand (8.3). */
export type WeaponClass =
  | 'sword'
  | 'axe'
  | 'mace'
  | 'dagger'
  | 'polearm'
  | 'staff'
  | 'rod'
  | 'fist'
  | 'unarmed'
  | 'bow'
  | 'crossbow'
  | 'thrown'
  | 'none';
/** Damage kind a weapon class implies (8.3); spells have none. */
export type DamageKind = 'slash' | 'pierce' | 'blunt' | 'arrow';
/** Material of the target a hit lands on (8.3). */
export type HitMaterial =
  | 'flesh'
  | 'leather'
  | 'mail'
  | 'plate'
  | 'bone'
  | 'spirit'
  | 'ash'
  | 'crystal'
  | 'stone'
  | 'wood';
/** Armour class of a chest piece or a vocation (8.3, 6.1). */
export type ArmorClass = 'cloth' | 'leather' | 'mail' | 'plate';
/** Difficulty levels (16; the registry built-in `difficulty`). */
export type Difficulty = 'story' | 'standard' | 'hard' | 'legend';
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
  | {
      type: 'dispel';
      kind: 'debuff' | 'buff';
      count?: number;
      /** the dispel categories it removes (9.5); without: every dispellable aura */
      types?: DispelType[];
    }
  | { type: 'charge' }
  | { type: 'knockback'; distance: number }
  | { type: 'summon'; monster: string; count: number }
  | { type: 'threat'; amount: Scaling }
  /** purify a low-sediment beast back to its kind (11 `purifyTo`; settled as `purify`, 10.7) */
  | { type: 'purify' };

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
  /** the cast cannot be interrupted; its cast bar carries the shield border (8.1, 18) */
  uninterruptible?: boolean;
  /** a charged or heavy weapon blow: the heavy swing sound and the hit stop (8.1, 8.3) */
  heavy?: boolean;
  /** diminishing-returns category of the control it applies (9.2); default by the aura */
  dr?: DrCategory;
  /** a ground warning: the effects wait for the lead and land on the locked cells (10.3) */
  telegraph?: TelegraphDef;
  /** a channel: the cast time pulses its effects `ticks` times (3.9, 10.4) */
  channel?: ChannelDef;
  /** the hit gives an injury (a boss skill, progression_and_pacing.md 10.1) */
  injure?: InjureDef;
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
  /** maximum health as a fraction (-0.2 takes a fifth off; blood pacts, revival fatigue) */
  maxHpPct?: number;
  /** cast and swing interval as a fraction (+0.1 makes both 10% slower; presence 3.5) */
  interval?: number;
  /** door-skill cost as a fraction (+0.5 is x1.5; revival fatigue 15.1; door skills read it) */
  doorSkillCost?: number;
  /** duration of the control this unit applies, as a fraction (9.3) */
  ccDurationDone?: number;
  /** duration of the control this unit suffers, as a fraction (9.3) */
  ccDurationTaken?: number;
  /** health regeneration as a fraction (the taint spot -10%, combat 9.4) */
  hpRegen?: number;
  /** mana regeneration as a fraction (tempering backlash -50%, 9.4) */
  manaRegen?: number;
  /** door-skill cooldowns as a fraction (a maimed player +20%, progression 10.2) */
  doorSkillCooldown?: number;
}

/** Preventive item effects; multipliers reduce only environmental gains or spot onset. */
export interface AuraPrevention {
  exposure?: { multiplier: number; belowGrade?: number };
  spot?: { adult: number; child: number };
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
  /** aura bar category (8.2) */
  category?: AuraCategory;
  /** dispel category (9.5); a debuff without one is not dispellable by category */
  dispelType?: DispelType;
  /** diminishing-returns category of a control aura (9.2); default by its cc kind */
  drCategory?: DrCategory;
  /** fear: each hit breaks it with chance damage / (scale x max health) (9.7; default 0.1) */
  breakChanceScale?: number;
  /** periodic auras: one instance per applier, each ticking on its own (8.2) */
  perSource?: boolean;
  /** auras of one group do not stack: only the strongest counts (8.2) */
  group?: string;
  /** presence resistance per stack, capped (3.5: drink, veils) */
  presenceResist?: { perStack: number; max: number };
  /**
   * Explicit effect per stack count (index = stacks - 1), replacing `slow` and `mods x
   * stacks`, for an aura whose levels are not multiples of one step (presence 3.5).
   */
  byStacks?: { slow?: number; mods?: AuraMods }[];
  /** chance each spell of a mana caster miscasts: interrupted, its mana lost (sediment fever 9.4) */
  miscast?: number;
  /** two-handed weapons cannot be used (a maimed arm, 9.4) */
  noTwoHand?: boolean;
  /** prevention from consumables (catalog_consumables_magitools.md 3.6) */
  prevention?: AuraPrevention;
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
  armorType: ArmorClass;
  /** weapon class a member without a known weapon strikes with (humanoid monsters, 8.3) */
  weaponClass?: WeaponClass;
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

export interface BossPhase extends BossPhaseExt {
  /** enter below this health fraction (a phase names this, `atSec`, or both) */
  belowPct?: number;
  name: string;
  say?: string;
  /** replaces the ability list from this phase on */
  abilities?: string[];
  /** aura applied to self when the phase starts */
  aura?: string;
}

export interface MonsterMechanics extends MonsterRegistryFields {
  /** flee once below this hp fraction (beasts too; never elite, rare or boss; 11) */
  flee?: number;
  /** soft enrage by health line or fight time (10.5) */
  enrage?: { belowPct?: number; atSec?: number; aura: string; say?: string };
  /** the hard enrage of dungeon lords and above (10.5) */
  berserk?: { atSec?: number; aura?: string };
  /** reinforcements (10.5; `summon` is their first-round alias) */
  adds?: AddWave[];
  marks?: MarkDef[];
  interruptWindows?: { ability: string; from?: number; to?: number; whileFlag?: string }[];
  shields?: ShieldPhaseDef[];
  terrain?: TerrainUse[];
  resolve?: ResolveDef[];
  /** the arena seals at the pull (10.1) */
  arena?: { seal: boolean };
  targeting?: BossTargeting;
  /**
   * Chase the biggest door in range (10.8): the player within `range`, else the nearest
   * holder of `fallbackTag`, else threat. Near a holder it channels `channel`.
   */
  doorSeek?: { range: number; fallbackTag: string; channel?: string };
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
  /**
   * A one-on-one duel (19.2 `duelWatch`): the watchers (monster ids of the same band) stay
   * out while the player fights alone and all turn hostile once a second fighter of the
   * player's side deals damage. A duel ends without a death (duel.ended).
   */
  duelWatch?: { watchers: string[]; breakOn: 'second_fighter' };
  /** pets of one group: a summoner keeps one at a time (a warlock's fiends, 6.5.8) */
  petGroup?: string;
  /**
   * A pet that will not obey on some maps (12.3): on each map named here it leaves its
   * summoner and walks to the named location of that map (map id to location id).
   */
  petQuirk?: { walkTo: Record<string, string> };
  /** while this pet is out its summoner carries this aura (a blood pact) */
  ownerAura?: string;
}

export interface MonsterDef {
  id: string;
  name: string;
  desc: string;
  family: MobFamily;
  /** race tag for humanoids that are people, not monsters (power_system.md 7.3) */
  race?: string;
  faction: string;
  /**
   * act of first appearance (act1 to act6) as the bestiary declares it; the content
   * validator judges the level band at this act (V6). The kernel does not read it.
   */
  act?: string;
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
  /** boss layer (5.5, 9.3); a boss without one is a lair lord */
  tier?: BossTier;
  /** the layer a story boss counts as */
  storyAs?: Exclude<BossTier, 'story' | 'tutorial'>;
  /** weapon class of its blows (8.3); default by family */
  weaponClass?: WeaponClass;
  /** what a hit on it sounds like (8.3); default by family */
  material?: HitMaterial;
  /** voice family (8.3); read by the audio tables only */
  voice?: string;
  /** entity tags at spawn (11: reptile, eroded, flying, door_mark, swarm) */
  tags?: string[];
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
  /** application order on the unit (a dispel takes the newest first, 9.5) */
  seq?: number;
  /** strength of this instance's slow and modifiers (resisted presence, 3.5); default 1 */
  scale?: number;
  /** the control part was refused (a slow on a slow-immune target): the rest still counts */
  ccOff?: boolean;
  /** the ladder step this control landed at (9.2 icon corner: 1 half, 2 quarter) */
  dr?: number;
}

/** One diminishing-returns ladder of a unit (9.2). */
export interface DrState {
  /** 0 full, 1 half, 2 quarter, 3 immune */
  stage: 0 | 1 | 2 | 3;
  /** the ladder is back at full from this tick unless a control of its category lands */
  resetAt: number;
}

export interface CastState {
  abilityId: string;
  targetId: string | null;
  start: number;
  end: number;
  x: number;
  y: number;
  /** pushbacks taken so far (at most two, 3.9) */
  pushes?: number;
  /** a channel: ticks between pulses, the next pulse and the pulses done */
  channel?: { every: number; next: number; n: number };
  /** the cast winds up a ground warning (10.3) */
  warned?: boolean;
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

/** A drink in progress; absent on saves written before consumable channels. */
export interface ItemConsumption {
  itemId: string;
  started: number;
  until: number;
  amount: number;
  applied: number;
  mapId: string;
  x: number;
  y: number;
}

export type FoodConsumption = Omit<ItemConsumption, 'amount' | 'applied'> & { auraId: string };

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
  /** independent from the food aura slot; interrupted by actual movement or damage */
  drinking?: ItemConsumption;
  /** completes its food aura only after 18 uninterrupted seconds */
  eating?: FoodConsumption;
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
  /** diminishing-returns ladders by category (9.2) */
  dr?: Partial<Record<DrCategory, DrState>>;
  /** times this unit went down in the current fight (15.2) */
  downs?: number;
  /** damage the player's side dealt to this unit (credit, 8.5) */
  partyDamage?: number;
  /** the outsider's skill rack: the active abilities in use (7) */
  rack?: string[];
  /** abilities the player took off the rack by hand (the rack does not refill them) */
  rackOff?: string[];
  /** the outsider's driven pool when no dual-pulse door drives more (4.3) */
  activePool?: ResourceKind;
  /** presence mode of the restraint door (3.5, 12.2); default normal */
  presenceMode?: 'normal' | 'veiled' | 'released';
  /** the duel this unit is in (duel.ts) */
  duel?: string;
  /** maximum-health scale while a boss is fought alone (5.5; duel.ts) */
  hpScale?: number;
  /** a fight is under way for durability (13.2: one fight wears each worn piece by 1) */
  fighting?: boolean;
  /** the tick of the last pulse cross-feed (4.3: at most once per tick) */
  fedAt?: number;
  /** a boss in a fight: phases by time, adds, shields, the arena (boss/) */
  boss?: BossFight;
  /** telegraphed abilities whose first settlement already happened (10.3 `firstHalf`) */
  firstHalf?: string[];
  /** using an arena object (10.6) */
  interact?: InteractState;
  /** an arena object or a boss part: its terrain record id (10.6; breakableParts) */
  terrain?: string;
  /** an ambusher still hidden: its first strike's multiplier (11 `ambushEmerge`) */
  ambush?: number;
  /** an add that goes when its boss falls (10.5 `despawnWithBoss`) */
  despawnWithBoss?: boolean;
  /** what a thief carries until it dies, and whose it was (11 `pilfer`, `crystalEat`) */
  stolen?: { ownerId: string; money: number; items: Parcel[] };
  /** this body rises as that monster when its corpse goes (11 `corpseRise`) */
  rise?: string;
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
  /** units whose first-entry paralysis fired in this encounter (3.5) */
  presenceStruck?: Record<string, true>;
  /** drop bags (遗落包) left where the player fell (15.1) */
  bags?: Record<string, DropBag>;
  /** duels in progress (duel.ts) */
  duels?: Record<string, DuelState>;
  /** the player reforming in the corridor: the return lands at `at` (15.1 step 7) */
  pendingReturn?: PendingReturn;
  /** application counter: aura order on every unit (9.5) */
  auraSeq?: number;
  /** the difficulty whose modifier items are registered (difficulty.ts) */
  difficulty?: Difficulty;
  /** live ground warnings (10.3) */
  telegraphs?: Record<string, TelegraphState>;
  /** arena objects and boss parts (10.6) */
  terrain?: Record<string, TerrainState>;
}

/** What the player left behind where they fell (15.1; thousand_doors.md 6.3). */
export interface DropBag {
  id: string;
  ownerId: string;
  mapId: string;
  x: number;
  y: number;
  /** what fell, as inventory parcels (counted goods with their qualifiers) */
  items: Parcel[];
  money: number;
  /** the bag crumbles away at this tick (three game days) */
  expires: number;
}

/** A one-on-one duel (19.2 duelWatch; duel.ended). */
export interface DuelState {
  id: string;
  /** the player's unit */
  challengerId: string;
  opponentId: string;
  opponentRef: string;
  /** the watchers' unit ids, out of the fight while it lasts */
  watchers: string[];
  /** the sides the duel changed (opponent and watchers), restored at its end */
  sides: Record<string, Side>;
  startTick: number;
}

/** The settled death costs waiting for the end of the revival (15.1 steps 7 and 8). */
export interface PendingReturn {
  /** the tick the player reforms */
  at: number;
  playerId: string;
  fromMap: string;
  x: number;
  y: number;
  toMap: string;
  toX: number;
  toY: number;
  innerCourt: boolean;
  overload: number;
  packId?: string;
  moneyLost: number;
  revivalTicks: number;
  fatigueTicks: number;
  fatigueMinutes: number;
  fatigueFloor: number;
  witnessed: number;
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
      /**
       * Hit-sound selection fields (8.3). Combat writes all of them on every outcome
       * (tests/combat_rules.test.ts); they are optional here only so that other systems'
       * synthetic events in tests need not invent them.
       */
      weaponClass?: WeaponClass;
      damageKind?: DamageKind;
      material?: HitMaterial;
      heavy?: boolean;
      ranged?: boolean;
      /** the damage came from a trigger and triggers nothing further (13.3) */
      fromProc?: boolean;
    };
    'combat.heal': {
      sourceId: string;
      targetId: string;
      abilityId?: string;
      amount: number;
      overheal: number;
      crit: boolean;
      /** healing of a fired trigger: triggers nothing further (13.3) */
      fromProc?: boolean;
    };
    'combat.aura': {
      targetId: string;
      auraId: string;
      sourceId: string;
      op: 'applied' | 'refreshed' | 'removed' | 'resisted';
      stacks: number;
      /** why a control was resisted (9.2, 9.3) */
      reason?: 'dr' | 'immune' | 'resist';
    };
    'combat.cast': {
      casterId: string;
      abilityId: string;
      targetId?: string;
      op: 'start' | 'finish' | 'interrupted';
      /** readability (18): false draws the shield border of an uninterruptible cast */
      interruptible?: boolean;
      /** an interruption by the sediment fever's miscast (9.4) */
      reason?: 'miscast';
      /** the cast is a channel (3.9; the cast bar empties) */
      channel?: boolean;
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
      /** harvest tags of the body (11 `componentTags`) */
      components?: string[];
      /** an unwitnessed kill passes the name on (11 `nameInherit`; cognition decides) */
      nameInherit?: boolean;
    };
    'combat.loot': {
      ownerId: string;
      victimId: string;
      items: { itemId: string; count: number }[];
      money: number;
    };
    'combat.xp': {
      entityId: string;
      amount: number;
      reason: TextParam;
      level: number;
      xp: number;
    };
    'combat.level_up': { entityId: string; level: number; tier: number };
    'combat.boss_phase': { entityId: string; bossId: string; phase: number; name: string };
    'combat.boss_defeated': {
      entityId: string;
      bossId: string;
      yielded: boolean;
      killerId?: string;
    };
    'combat.player_returned': {
      fromMap: string;
      x: number;
      y: number;
      toMap: string;
      toX: number;
      toY: number;
      innerCourt: boolean;
      moneyLost: number;
      /** game minutes of the revival-fatigue state (15.1) */
      fatigueMinutes: number;
      /** overload stacks: earlier deaths within one game day, at most three (15.1) */
      overload?: number;
      /** the drop bag left where the player fell, when anything was left (15.1) */
      packId?: string;
      /** ticks the player spent reforming in the corridor (15.1) */
      revivalTicks?: number;
      /** door fatigue floor of this return: 60 times the difficulty factor (15.1, 16) */
      fatigueFloor?: number;
      /** believers who saw the body go through a door (15.1) */
      witnessed?: number;
    };
    /** a drop bag appeared, was reclaimed or crumbled away (15.1) */
    'combat.bag': {
      bagId: string;
      ownerId: string;
      op: 'dropped' | 'reclaimed' | 'expired' | 'swallowed';
      mapId: string;
      items: { itemId: string; count: number }[];
      money: number;
    };
    /** the outsider switched its driven pool (4.3; the switch has its sound and look) */
    'combat.pool_switched': { entityId: string; resource: ResourceKind };
    /** a one-on-one duel started (duel.ts); duel.ended reports its end */
    'combat.duel_started': { duelId: string; challengerId: string; opponentId: string };
    /** the difficulty in effect changed, or a change was refused (16) */
    'combat.difficulty': {
      difficulty: Difficulty;
      op: 'set' | 'refused';
      reason?: 'locked' | 'in_combat';
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
    /** put an ability on the outsider's skill rack, or take it off (7) */
    'combat.rack': { abilityId: string; on: boolean };
    /** switch the outsider's driven pool, out of combat (4.3) */
    'combat.switch_pool': { resource: ResourceKind };
    /** challenge someone to a one-on-one duel (19.2 duelWatch) */
    'combat.duel': { opponentId: string };
    /**
     * Use an item in play (14.1): the cooldown group's in-combat ban and its global cooldown
     * are checked here, then the inventory uses it
     */
    'combat.use_item': { itemId: string; targetId?: string };
  }
}
