// Shapes of the boss mechanics library and the monster mechanic field registry
// (combat_and_classes.md 10, 11, 19.1, 19.2; PK-M1-12): ground telegraphs, channels, boss
// phases and actions, adds, enrage and berserk, marks, interrupt windows, shield phases,
// terrain, non-combat resolutions, door seeking, and the registry fields act 1 uses. The
// runtime state of a boss fight and of a telegraph lives here too, with the events and the
// command this library adds to the kernel contracts. types.ts imports these into the
// ability, monster and unit shapes; field names are the contract of 19.1 and 19.2.

import type { FlagValue } from '../../core/contracts';
import type { Appearance } from '../world/types';
import type { Scaling } from './types';

// ---------------------------------------------------------------------------
// Telegraphs (10.3) and channels (3.9)

export type TelegraphAt = 'self' | 'target' | 'point' | 'each_member';

export type TelegraphShape =
  | { kind: 'circle'; radius: number; at: TelegraphAt; count?: number }
  | { kind: 'cone'; radius: number; angle: number }
  | { kind: 'line'; length: number; width: number }
  | { kind: 'ring'; inner: number; outer: number; at: 'self' | 'target' | 'point' }
  | {
      kind: 'pulse';
      radius: number;
      every: number;
      duration: number;
      firstDelay: number;
      at: 'self' | 'target' | 'point';
    };

export type TelegraphKind = TelegraphShape['kind'];
export type TelegraphTier = 'lethal' | 'heavy' | 'normal';

export interface TelegraphDef {
  shape: TelegraphShape;
  /** seconds; content validation: lethal at least 2.0, heavy 1.5, normal 1.2 */
  lead: number;
  tier: TelegraphTier;
  /** default true: the area locks when the warning appears */
  snapshot?: boolean;
  /** non-lethal only: the area follows the target until it settles */
  follow?: boolean;
  /** units standing on a cover tile (10.6) are not hit */
  fromAbove?: boolean;
  /** the first settlement of this warning deals half damage (the teaching boss) */
  firstHalf?: boolean;
}

/** A channel (3.9): the cast time split into `ticks` pulses of the ability's effects. */
export interface ChannelDef {
  ticks: number;
  /** each later pulse is stronger by this fraction of the first (the door drain grows) */
  ramp?: number;
}

/** An injury the ability gives on a hit that lands (progression_and_pacing.md 10.1). */
export interface InjureDef {
  kind: 'light' | 'maimed_arm' | 'maimed_leg';
  /** default 1 */
  chance?: number;
}

// ---------------------------------------------------------------------------
// The boss library (10.2 to 10.7)

/** ring: 1.5 tiles round the boss; edges: the arena's rim; else a location id of the map. */
export type SpawnAt = 'ring' | 'edges' | { location: string };

export type BossAction =
  | { do: 'cast'; ability: string }
  | { do: 'adds'; monster: string; count: number; at?: SpawnAt }
  | { do: 'terrain'; object: string; state: string }
  | { do: 'shield'; ref: string }
  | { do: 'say'; line: string }
  | { do: 'flag'; name: string; value: FlagValue }
  /** the boss staggers for N seconds (10.4; at most 6) */
  | { do: 'stagger'; seconds: number };

export interface BossPhaseExt {
  /** enter at this many seconds into the fight instead of (or before) the health line */
  atSec?: number;
  /** seconds the boss cannot be targeted after entering; its clocks run on */
  untargetable?: number;
  onEnter?: BossAction[];
}

export interface AddWave {
  atPct?: number;
  /** seconds between waves (the first one `every` seconds into the fight) */
  every?: number;
  monster: string;
  count: number;
  at?: SpawnAt;
  say?: string;
  despawnWithBoss?: boolean;
}

export interface MarkDef {
  kind: 'spread' | 'stack' | 'chase';
  /** the boss ability whose use places the marks; its effects settle on the marked */
  ability: string;
  count: number;
  radius: number;
  /** seconds from the mark to its settlement: the lead */
  delay: number;
  /** companions act on it only when the player orders (10.5) */
  needsOrder?: boolean;
}

export interface ShieldPhaseDef {
  id: string;
  trigger: { belowPct?: number; atSec?: number; phase?: number };
  kind: 'absorb' | 'immune';
  amount?: Scaling;
  breakBy: 'damage' | 'adds' | 'terrain' | 'ability' | 'timer';
  /** the ability (ability), the terrain object (terrain) that breaks it */
  breakRef?: string;
  /** seconds a `timer` shield holds */
  seconds?: number;
  /** stagger seconds after the break (at most 6) and a vulnerability aura */
  onBreak?: { stagger?: number; aura?: string };
}

export type TerrainRole = 'breakable' | 'interact' | 'cover' | 'hazard' | 'switch';

export interface TerrainUse {
  /** the object's id within this boss's arena */
  object: string;
  /** the object's name (content text) and look; arena areas need neither */
  name?: string;
  appearance?: Appearance;
  role: TerrainRole;
  /** a location id of the boss's map: the object stands at its centre, a cover or hazard is its rectangle */
  at?: string;
  /** where no location is named yet: tiles from the boss's home (x, y) */
  offset?: [number, number];
  /** cover and hazard without a location: the half-size of the square round the point */
  size?: number;
  /** a breakable object's health (a fraction of the boss's maximum health) */
  hp?: number;
  /** a breakable object strikes this far round itself when it falls (default 2.5) */
  radius?: number;
  /** what breaking or using it does */
  effect?: BossAction[] | { stagger: number; interrupt?: boolean };
  /** a hazard: seconds between its pulses and what each pulse lays on whoever stands there */
  every?: number;
  aura?: string;
  damage?: Scaling;
}

export type ResolveWay =
  | 'yield'
  | 'purify'
  | 'pacify'
  | 'talk'
  | 'item'
  | 'interact'
  | 'survive'
  | 'escape'
  | 'flag';

export interface ResolveDef {
  way: ResolveWay;
  /**
   * A world-state expression (the registry's syntax); `yield` writes the health line; `survive`
   * writes seconds into the fight; `interact` counts the arena objects used.
   */
  when: string | { belowPct: number } | { atSec: number } | { interacted: number };
  outcome?: { reward?: 'full' | 'none' | `table:${string}`; flags?: Record<string, FlagValue> };
}

export type BossTargeting = 'threat' | 'doorSeek' | 'caravanRaid';

/** Breakable parts (catalog_dungeons_bosses.md 1.6): sub-targets with their own health. */
export interface BreakablePart {
  id: string;
  /** health as a fraction of the boss's maximum */
  hp: number;
  /** the part shows once this many phases were entered (0: from the start, 1: the first) */
  phase?: number;
  onBreak?: BossAction[];
}

// ---------------------------------------------------------------------------
// Registry fields (section 11) that act 1 uses, beyond the first-round kernel

/** Chance-on-hit affixes: an aura (or a knockback) on the struck (13.3 `on: hit`). */
export interface HitAffix {
  chance: number;
  /** seconds; default the template aura's */
  duration?: number;
  /** periodic damage per tick (dots) */
  damage?: number;
  /** magnitude (corrode: armour fraction; demoralize: damage fraction) */
  amount?: number;
  /** knockback distance */
  distance?: number;
}

export interface PilferDef {
  take: 'coin' | 'consumable' | 'item';
  /** default 1 */
  chance?: number;
  /** copper (coin) or count (goods) per theft; default 1 */
  amount?: number;
  /** flee after a theft */
  flee?: boolean;
}

/** The registry fields of section 11 the kernel reads (first need act one). */
export interface MonsterRegistryFields {
  // timed (chase) affixes
  aoePulse?: { radius: number; every: number; damage: Scaling; school?: string };
  stomp?: { radius: number; every: number; duration: number; damage?: Scaling };
  bigCast?: { ability: string; every: number; castTime?: number };
  stoneskin?: { every: number; absorb: Scaling };
  aoeSlow?: { radius: number; every: number; slow: number; duration: number };
  charge?: { minRange: number; every: number; damage?: Scaling };
  desperateHeal?: { belowPct: number; pct: number; castTime?: number };
  // on-hit affixes
  soulrot?: HitAffix;
  smolder?: HitAffix;
  mortalStrike?: HitAffix;
  concuss?: HitAffix;
  stunOnHit?: HitAffix;
  ensnare?: HitAffix;
  knockback?: HitAffix;
  corrode?: HitAffix;
  blind?: HitAffix;
  demoralize?: HitAffix;
  pilfer?: PilferDef;
  /** eats one of `items` (crystal ids, in order) from the struck's pack */
  crystalEat?: { grade?: string; chance?: number; items?: string[] };
  // reactions
  thorns?: { amount: number };
  frenzyOnHit?: { amount: number; max: number };
  packFrenzy?: { amount: number; max: number };
  deathThroes?: { radius: number; damage: Scaling; delay?: number };
  ashPuddle?: { radius: number; slow: number; duration: number };
  // flags
  ccImmune?: boolean;
  slowImmune?: boolean;
  ignoreTaunt?: boolean;
  phasesThroughObstacles?: boolean;
  canSwim?: boolean;
  componentTags?: string[];
  // spawning and the world
  /** spawn only at night, or (weaken) carry `aura` by day */
  nightOnly?: { mode: 'spawn' | 'weaken'; aura?: string };
  weatherSpawn?: string;
  rumorScale?: { perLevel: number; max: number };
  nameInherit?: boolean;
  ambushEmerge?: { radius: number; firstHitMult: number };
  purifyTo?: string;
  /** Named remains shed on purification, without kill experience or generic kill loot. */
  purifyItems?: { itemId: string; count: number; companion?: string }[];
  corpseRise?: { into: string; chance: number; minSediment?: number };
  cropBlight?: { rate: number };
  caravanRaid?: boolean;
  lureFlee?: boolean;
  breakableParts?: BreakablePart[];
  oathLock?: boolean;
}

// ---------------------------------------------------------------------------
// Runtime state

/** One live ground warning (10.3), kept in the combat slice until it settles. */
export interface TelegraphState {
  id: string;
  casterId: string;
  /** the ability it settles; an affix or terrain warning names its source instead */
  abilityId?: string;
  source?: string;
  mapId: string;
  kind: TelegraphKind;
  tier: TelegraphTier;
  /** the locked area: tile x and y in pairs */
  cells: number[];
  start: number;
  settle: number;
  fromAbove?: boolean;
  half?: boolean;
  /** a follow warning re-centres on this unit until it settles, at this radius */
  follow?: string;
  radius?: number;
  /** a mark (10.5): who carries it and how the hit is shared */
  mark?: { kind: MarkDef['kind']; targetId: string; radius: number };
  /** a pulse zone: the next pulse and the end of the zone */
  pulse?: { every: number; next: number; until: number };
  /** a hazard pulse lays this aura; an affix warning deals this damage */
  aura?: string;
  /** the aura's length (seconds), strength and ladder when an affix sets them */
  auraSec?: number;
  auraScale?: number;
  auraDr?: string;
  damage?: number;
  school?: string;
  /** a charge: the caster lands here once the line settles */
  dash?: [number, number];
  /** the warning belongs to a cast in progress and dies with it */
  cast?: boolean;
}

export interface ShieldState {
  up: boolean;
  broken?: boolean;
  /** absorb left */
  left?: number;
  /** a timer shield drops at this tick */
  until?: number;
}

/** The fight-scoped state of a boss (10.1 reset: all of it goes when the boss resets). */
export interface BossFight {
  /** the tick the fight began (the first chase) */
  start: number;
  /** add waves by index: health-line waves fired, `every` waves' next tick */
  addsDone?: number[];
  /** adds that arrived in this fight (a shield broken by adds waits for some first) */
  spawned?: number;
  addsNext?: Record<string, number>;
  /** adds announced, appearing after their 1.2-second warning */
  pending?: { at: number; wave: number; monster: string; points: number[]; despawn?: boolean }[];
  berserk?: boolean;
  untargetableUntil?: number;
  shields?: Record<string, ShieldState>;
  /** casts an `onEnter` queued while the warning cap was full */
  queued?: string[];
  resolved?: string;
  sealed?: boolean;
  /** registry affix clocks by field */
  affixAt?: Record<string, number>;
  healed?: boolean;
  /** the arena objects used (interact) */
  used?: string[];
  /** the breakable parts placed: part id to entity id */
  parts?: Record<string, string>;
  /** the door a door seeker last chose (an entity id; '' for threat) */
  seek?: string;
  /** a wave boss with no foe left: the tick its fight stood still (`pauseBoss`) */
  pausedAt?: number;
}

/** An arena object a boss's data places (10.6). */
export interface TerrainState {
  id: string;
  /** the boss unit and monster it belongs to */
  bossId: string;
  monsterId: string;
  object: string;
  role: TerrainRole;
  mapId: string;
  x: number;
  y: number;
  /** cover and hazard tiles: [x0, y0, x1, y1] half-open */
  rect?: [number, number, number, number];
  state: string;
  /** a hazard's next pulse */
  next?: number;
  /** a breakable part of the boss rather than an arena object */
  part?: boolean;
}

/** A unit using an arena object (the one-second interaction, broken by a hit). */
export interface InteractState {
  objectId: string;
  until: number;
  /** where the use began: a step away breaks it */
  x: number;
  y: number;
}

declare module '../../core/contracts' {
  interface EventMap {
    /** a ground warning appeared (10.3, 18): the locked cells, the lead and its tier */
    'combat.telegraph': {
      id: string;
      casterId: string;
      abilityId?: string;
      mapId: string;
      kind: TelegraphKind;
      tier: TelegraphTier;
      cells: number[];
      /** seconds from the warning to the hit */
      lead: number;
      /** the school of the hit (the warning's sound) */
      school?: string;
      /** the caster's side: an enemy warning and a friendly ground effect look apart (10.3) */
      side?: string;
      start: number;
      settle: number;
      fromAbove?: boolean;
      /** the marked unit of a mark (10.5) */
      markedId?: string;
      markKind?: MarkDef['kind'];
      /** the companions dodge this mark only on the player's order (10.5 `needsOrder`) */
      needsOrder?: boolean;
    };
    /** a beast was purified back to its kind (11 `purifyTo`; settled as `purify`, 10.7) */
    'combat.purified': {
      casterId: string;
      entityId: string;
      from: string;
      to: string;
      newId: string;
    };
    /** a ground warning went away: it hit, its cast broke, or its zone ran out */
    'combat.telegraph_ended': {
      id: string;
      casterId: string;
      op: 'settled' | 'cancelled' | 'expired';
      /** units the settlement struck */
      hit?: string[];
    };
    /** one pulse of a channel (3.9) */
    'combat.channel': { casterId: string; abilityId: string; targetId?: string; n: number };
    /** a boss shield went up, broke or ran out (10.4) */
    'combat.boss_shield': {
      entityId: string;
      bossId: string;
      shieldId: string;
      op: 'up' | 'broken' | 'expired';
      kind: 'absorb' | 'immune';
      amount?: number;
    };
    /** a boss fight was settled without a kill (10.7) */
    'combat.boss_resolved': { entityId: string; bossId: string; way: ResolveWay };
    /** adds announced (the 1.2-second spawn light) and their arrival (10.5) */
    'combat.adds': {
      entityId: string;
      bossId: string;
      monster: string;
      op: 'warned' | 'spawned';
      points: number[];
    };
    /** an arena object changed (10.6) */
    'combat.terrain': {
      objectId: string;
      object: string;
      bossId: string;
      role: TerrainRole;
      op: 'placed' | 'broken' | 'used' | 'restored' | 'switched';
      state: string;
      /** a cover or hazard area's tiles, x and y in pairs (on `placed`) */
      cells?: number[];
    };
    /** a boss sealed its arena or let it open (10.1, oathLock) */
    'combat.arena': { entityId: string; bossId: string; op: 'sealed' | 'opened' };
    /** the door-seeker turned to a door (10.8): the player, a door-marked holder, or threat */
    'combat.door_seek': {
      entityId: string;
      targetId: string | null;
      reason: 'player' | 'mark' | 'threat';
    };
  }
  interface CommandMap {
    /** use an arena object (10.6): a one-second interaction, broken by a hit */
    'combat.interact': { objectId: string };
  }
}
