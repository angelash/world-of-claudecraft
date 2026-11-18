// The boss mechanics library and the monster mechanic field registry (PK-M1-12;
// combat_and_classes.md 10, 11, 12.2, 20): the five ground warnings and their rules, phases
// by time, adds, soft and hard enrage, interrupt windows, shields and stagger, arena objects,
// marks, the sealed arena, the non-combat resolutions, door seeking, the channel's pushback,
// perceived presence, every registry field act one uses (one data-driven case each), the
// sediment and injury auras in combat, the injury sources, the dungeons' left-item port and
// the two-way cues. Most rows run in a walled test arena with test monsters, so nothing of
// the map content reaches them.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ContentPack } from '../src/content/pack';
import { pack as ailmentsPack } from '../src/content/packs/ailments';
import { pack as combatPack } from '../src/content/packs/combat';
import {
  bossMechanicProblems,
  cueCoverage,
  designDamage,
  standardMemberHp,
  telegraphProblems,
  tierFor,
} from '../src/content/packs/combat_boss_checks';
import { pack as doorsPack } from '../src/content/packs/doors';
import { pack as invPack } from '../src/content/packs/inventory';
import { pack as partyPack } from '../src/content/packs/party';
import { pack as worldPack } from '../src/content/packs/world';
import { Engine } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import type { SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_DAY } from '../src/core/time';
import { system as ailments } from '../src/systems/ailments';
import {
  addUnit,
  arenaSealed,
  berserkSeconds,
  bossTargetKillTime,
  canAttack,
  system as combat,
  grantAbility,
  setLevel,
  temperBacklash,
} from '../src/systems/combat';
import { useAbility } from '../src/systems/combat/abilities';
import {
  ambushMult,
  caravanTarget,
  FIRST_ACT_FIELDS,
  fleePoint,
  MECHANIC_KEYS,
  movementTraits,
  onHitAffixes,
  renewBlight,
  spawnAllowed,
  tickTimedAffixes,
} from '../src/systems/combat/affixes';
import { applyAura } from '../src/systems/combat/auras';
import { tickAutoAttack, tickRegen } from '../src/systems/combat/auto_attack';
import { BAG_PORT } from '../src/systems/combat/bag_port';
import { berserkAt, interruptibleNow } from '../src/systems/combat/boss';
import { resolveHit } from '../src/systems/combat/damage';
import { killUnit, reviveUnit } from '../src/systems/combat/death';
import { secs } from '../src/systems/combat/defs';
import { startEvade, tickMonster } from '../src/systems/combat/monster_ai';
import { instinct, willPick } from '../src/systems/combat/perceive';
import { spawnMonster } from '../src/systems/combat/spawning';
import { deriveStats } from '../src/systems/combat/stats';
import { cellSet, shapeCells } from '../src/systems/combat/telegraph_shapes';
import { engage, taunt } from '../src/systems/combat/threat';
import type { AbilityDef, AuraDef, MonsterDef, Unit } from '../src/systems/combat/types';
import { leftItemPort } from '../src/systems/dungeons/left_items';
import type { ItemDef } from '../src/systems/inventory';
import { addItem, addMoney, system as inventory } from '../src/systems/inventory';
import { activeModifiers, system as modifiers, registerModifier } from '../src/systems/modifiers';
import { system as party } from '../src/systems/party';
import { forceWeather, spawnEntity, system as world } from '../src/systems/world';
import type { MapDef } from '../src/systems/world/types';

function merge(packs: ContentPack[]): ContentMap {
  const out: Record<string, unknown> = {};
  for (const p of packs) {
    for (const [k, v] of Object.entries(p.tables)) {
      const prev = out[k];
      out[k] = Array.isArray(prev) && Array.isArray(v) ? [...prev, ...v] : v;
    }
  }
  return out as unknown as ContentMap;
}

const PACKS = [worldPack, invPack, combatPack, partyPack, doorsPack, ailmentsPack];
const SYSTEMS = [modifiers, world, inventory, combat, party, ailments];

/** A walled room with nothing in it; one corner is dense sediment (积澱 and up). */
const ARENA: MapDef = {
  id: 'zz_arena',
  name: '试场',
  region: 'test',
  width: 60,
  height: 20,
  rows: [
    '#'.repeat(60),
    ...Array.from({ length: 18 }, () => `#${'.'.repeat(58)}#`),
    '#'.repeat(60),
  ],
  legend: { '#': 'wall', '.': 'floor' },
  locations: [
    { id: 'zz_dense', name: '澱坑', kind: 'ruin', x: 50, y: 14, w: 4, h: 4, sediment: 4 },
  ],
  spawns: [],
  exits: [],
};

const look = { base: 'golem', colors: ['#000000', '#000000', '#000000', '#000000'] };

const TEST_AURAS: AuraDef[] = [
  { id: 'zz_dodge', name: 'x', kind: 'buff', duration: 0, stats: { dodge: 100 } },
  { id: 'zz_cold', name: 'x', kind: 'debuff', duration: 4, slow: 0.3 },
  { id: 'zz_stun', name: 'x', kind: 'debuff', duration: 4, cc: 'stun' },
  { id: 'zz_root', name: 'x', kind: 'debuff', duration: 4, cc: 'root' },
  { id: 'zz_weak', name: 'x', kind: 'debuff', duration: 0, mods: { damageTaken: 0.2 } },
];

const dmg = (base: number) => ({
  type: 'damage' as const,
  school: 'shadow' as const,
  amount: { base },
});

const TEST_ABILITIES: AbilityDef[] = [
  {
    id: 'zz_slam',
    name: 'x',
    desc: 'x',
    target: 'area',
    radius: 6,
    school: 'shadow',
    effects: [dmg(60)],
    telegraph: { shape: { kind: 'circle', radius: 3, at: 'self' }, lead: 2, tier: 'lethal' },
    gcd: false,
  },
  {
    id: 'zz_rain',
    name: 'x',
    desc: 'x',
    target: 'area',
    radius: 30,
    school: 'shadow',
    effects: [dmg(40)],
    telegraph: {
      shape: { kind: 'circle', radius: 4, at: 'self' },
      lead: 2,
      tier: 'lethal',
      fromAbove: true,
    },
    gcd: false,
  },
  {
    id: 'zz_first',
    name: 'x',
    desc: 'x',
    target: 'area',
    radius: 6,
    school: 'shadow',
    effects: [dmg(80)],
    telegraph: {
      shape: { kind: 'circle', radius: 3, at: 'self' },
      lead: 1.5,
      tier: 'heavy',
      firstHalf: true,
    },
    gcd: false,
  },
  {
    id: 'zz_trio',
    name: 'x',
    desc: 'x',
    target: 'area',
    radius: 30,
    school: 'shadow',
    effects: [dmg(10)],
    telegraph: {
      shape: { kind: 'circle', radius: 1, at: 'self', count: 3 },
      lead: 1.2,
      tier: 'normal',
    },
    gcd: false,
  },
  {
    id: 'zz_pool',
    name: 'x',
    desc: 'x',
    target: 'area',
    radius: 30,
    school: 'shadow',
    effects: [{ type: 'aura', aura: 'zz_cold' }],
    telegraph: {
      shape: { kind: 'pulse', radius: 3, every: 1, duration: 5, firstDelay: 1.2, at: 'self' },
      lead: 1.2,
      tier: 'normal',
    },
    gcd: false,
  },
  {
    id: 'zz_long',
    name: 'x',
    desc: 'x',
    target: 'enemy',
    range: 40,
    school: 'shadow',
    castTime: 4,
    effects: [dmg(5)],
    gcd: false,
  },
  {
    id: 'zz_kick',
    name: 'x',
    desc: 'x',
    target: 'enemy',
    range: 40,
    gcd: false,
    effects: [{ type: 'interrupt', lockout: 2 }],
  },
  {
    id: 'zz_breaker',
    name: 'x',
    desc: 'x',
    target: 'enemy',
    range: 40,
    gcd: false,
    effects: [dmg(5)],
  },
  {
    id: 'zz_markhit',
    name: 'x',
    desc: 'x',
    target: 'area',
    radius: 40,
    school: 'shadow',
    effects: [dmg(100)],
    gcd: false,
  },
  {
    id: 'zz_drain',
    name: 'x',
    desc: 'x',
    target: 'enemy',
    range: 3,
    school: 'shadow',
    castTime: 10,
    channel: { ticks: 10, ramp: 0.5 },
    cooldown: 10,
    effects: [dmg(5)],
    ai: 'never',
  },
  {
    id: 'zz_mend',
    name: 'x',
    desc: 'x',
    target: 'self',
    castTime: 4,
    channel: { ticks: 4 },
    effects: [{ type: 'heal', amount: { base: 1 } }],
    gcd: false,
  },
  {
    id: 'zz_bolt',
    name: 'x',
    desc: 'x',
    target: 'enemy',
    range: 40,
    school: 'arcane',
    resource: 'mana',
    cost: 10,
    gcd: false,
    effects: [dmg(1)],
  },
  {
    id: 'zz_wound',
    name: 'x',
    desc: 'x',
    target: 'enemy',
    range: 40,
    gcd: false,
    effects: [dmg(5)],
    injure: { kind: 'maimed_arm' },
  },
  {
    id: 'zz_cleanse',
    name: 'x',
    desc: 'x',
    target: 'enemy',
    range: 40,
    gcd: false,
    effects: [{ type: 'purify' }],
  },
  {
    id: 'zz_doorhit',
    name: 'x',
    desc: 'x',
    target: 'enemy',
    range: 40,
    gcd: false,
    cooldown: 10,
    effects: [dmg(1)],
  },
];

/** A test monster: a lair boss by default, nothing else unless the case gives it. */
function mon(id: string, extra: Partial<MonsterDef> = {}): MonsterDef {
  return {
    id,
    name: 'x',
    desc: 'x',
    family: 'construct',
    faction: 'monster',
    minLevel: 10,
    maxLevel: 10,
    rank: 'boss',
    tier: 'lair',
    aggroRadius: 3,
    leash: 200,
    appearance: look,
    ...extra,
  } as MonsterDef;
}

const TEST_MONSTERS: MonsterDef[] = [
  mon('zz_boss', { abilities: ['zz_slam'] }),
  mon('zz_plain', { rank: 'normal', tier: undefined, family: 'beast' }),
];

const TEST_ITEMS = [
  {
    id: 'zz_greatsword',
    name: 'x',
    kind: 'weapon',
    quality: 1,
    value: 1,
    desc: 'x',
    slot: 'main_hand',
    tags: ['two_hand'],
    weapon: { min: 20, max: 20, speed: 3, range: 1.2 },
    weaponClass: 'sword',
  },
  { id: 'zz_crystal', name: 'x', kind: 'material', quality: 1, value: 1, desc: 'x', stack: 99 },
  { id: 'zz_bread', name: 'x', kind: 'consumable', quality: 1, value: 1, desc: 'x', stack: 20 },
] as unknown as ItemDef[];

interface Extra {
  monsters?: MonsterDef[];
  abilities?: AbilityDef[];
  maps?: MapDef[];
}

function makeGame(extra: Extra = {}, seed = 11): Engine {
  const content = merge(PACKS);
  content.maps = [...content.maps, ARENA, ...(extra.maps ?? [])];
  content.auras = [...content.auras, ...TEST_AURAS];
  content.abilities = [...content.abilities, ...TEST_ABILITIES, ...(extra.abilities ?? [])];
  content.monsters = [...content.monsters, ...TEST_MONSTERS, ...(extra.monsters ?? [])];
  content.items = [...content.items, ...TEST_ITEMS];
  return Engine.create(seed, content, SYSTEMS);
}

function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe = { id: 'zz_probe', order: 999, tick: (ctx: SystemContext) => fn(ctx) };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
}

function events<K extends AnyWorldEvent['kind']>(g: Engine, kind: K) {
  return g.world.recent.filter((e): e is Extract<AnyWorldEvent, { kind: K }> => e.kind === kind);
}

const units = (g: Engine) => g.world.slices.combat.units;
const unit = (g: Engine, id: string): Unit => {
  const u = units(g)[id];
  if (!u) throw new Error(`no unit ${id}`);
  return u;
};
const ents = (g: Engine) => g.world.slices.world.entities;

/** A combat unit on an inert entity, placed in the arena. */
function dummy(
  g: Engine,
  id: string,
  spec: {
    level?: number;
    side: Unit['side'];
    x: number;
    y?: number;
    kind?: 'object' | 'companion' | 'npc';
    tags?: string[];
    classId?: string;
  },
): Unit {
  withCtx(g, (ctx) => {
    spawnEntity(ctx, {
      id,
      kind: spec.kind ?? 'object',
      name: id,
      mapId: ARENA.id,
      x: spec.x,
      y: spec.y ?? 10,
      faction: 'test',
      appearance: look,
      tags: spec.tags ?? [],
    });
    addUnit(ctx, id, {
      classId: spec.classId ?? 'warrior',
      level: spec.level ?? 10,
      side: spec.side,
    });
  });
  return unit(g, id);
}

function monster(g: Engine, monsterId: string, x: number, y = 10, level?: number): Unit {
  let made: Unit | undefined;
  withCtx(g, (ctx) => {
    made = spawnMonster(ctx, monsterId, ARENA.id, x, y, level !== undefined ? { level } : {});
  });
  if (!made) throw new Error(`spawn failed: ${monsterId}`);
  return made;
}

function toArena(g: Engine, x = 5, y = 10): void {
  g.queue('world.teleport', { entityId: 'player', mapId: ARENA.id, x, y });
  g.step(1);
}

/** Put a monster into a fight with `foe` now. */
function pull(g: Engine, m: Unit, foe: Unit): void {
  withCtx(g, (ctx) => engage(ctx, m, foe));
}

/** Damage a unit directly (a periodic tick: no roll). */
function hurt(g: Engine, source: string, target: string, amount: number): void {
  withCtx(g, (ctx) =>
    resolveHit(ctx, {
      source: unit(g, source),
      target: unit(g, target),
      amount,
      school: 'shadow',
      kind: 'periodic',
    }),
  );
}

function use(g: Engine, caster: string, abilityId: string, target?: string): boolean {
  let ok = false;
  withCtx(g, (ctx) => {
    ok = useAbility(ctx, unit(g, caster), abilityId, target ?? null, { force: true }).ok;
  });
  return ok;
}

function setHpFrac(g: Engine, id: string, frac: number): void {
  withCtx(g, (ctx) => {
    const u = unit(g, id);
    u.hp = Math.round(deriveStats(ctx.world, ctx.content, u).maxHp * frac);
  });
}

/** A unit's health as a fraction of its maximum. */
function healthOf(g: Engine, id: string): number {
  let frac = 0;
  withCtx(g, (ctx) => {
    const u = unit(g, id);
    frac = u.hp / deriveStats(ctx.world, ctx.content, u).maxHp;
  });
  return frac;
}

const damageTo = (g: Engine, id: string, ability?: string) =>
  events(g, 'combat.damage').filter(
    (e) => e.data.targetId === id && (!ability || e.data.abilityId === ability),
  );

// ---------------------------------------------------------------------------

describe('10.3 the five ground warnings', () => {
  it('the shapes cover the tiles whose centre lies inside them', () => {
    const b = { width: 30, height: 30 };
    const circle = cellSet(
      shapeCells({ kind: 'circle', radius: 1.5, at: 'self' }, { x: 10.5, y: 10.5, facing: 0 }, b),
    );
    expect(circle.has('10,10') && circle.has('11,10') && circle.has('11,11')).toBe(true);
    expect(circle.has('12,12')).toBe(false);
    const cone = cellSet(
      shapeCells({ kind: 'cone', radius: 4, angle: 90 }, { x: 10.5, y: 10.5, facing: 0 }, b),
    );
    expect(cone.has('13,10')).toBe(true);
    expect(cone.has('7,10')).toBe(false);
    const line = cellSet(
      shapeCells(
        { kind: 'line', length: 6, width: 1 },
        { x: 10.5, y: 10.5, facing: Math.PI / 2 },
        b,
      ),
    );
    expect(line.has('10,16')).toBe(true);
    expect(line.has('11,13')).toBe(false);
    const ring = cellSet(
      shapeCells(
        { kind: 'ring', inner: 2, outer: 3, at: 'self' },
        { x: 10.5, y: 10.5, facing: 0 },
        b,
      ),
    );
    expect(ring.has('10,10')).toBe(false);
    expect(ring.has('12,10') && ring.has('13,10')).toBe(true);
    const pulse = shapeCells(
      { kind: 'pulse', radius: 1, every: 1, duration: 2, firstDelay: 1.2, at: 'self' },
      { x: 0.5, y: 0.5, facing: 0 },
      b,
    );
    expect(pulse.length / 2).toBe(3);
  });

  it('a one-shot (lethal) warning gives at least 2 seconds, story 1.5 times that', () => {
    const lead = (difficulty?: string) => {
      const g = makeGame();
      if (difficulty) g.queue('flag.set', { key: 'difficulty', value: difficulty });
      toArena(g);
      const boss = monster(g, 'zz_boss', 10);
      expect(use(g, boss.id, 'zz_slam')).toBe(true);
      const t = events(g, 'combat.telegraph').at(-1);
      expect(t?.data.tier).toBe('lethal');
      return (t?.data.settle ?? 0) - (t?.data.start ?? 0);
    };
    expect(lead()).toBeGreaterThanOrEqual(secs(2));
    expect(lead('story')).toBe(secs(3));
  });

  it('content validation: leads under their tier and damage above its tier are refused', () => {
    const base: AbilityDef = {
      id: 'zz_v',
      name: 'x',
      desc: 'x',
      target: 'area',
      effects: [dmg(10)],
    };
    const probs = (tier: 'lethal' | 'heavy' | 'normal', lead: number) =>
      telegraphProblems({
        ...base,
        telegraph: { shape: { kind: 'circle', radius: 2, at: 'self' }, lead, tier },
      });
    expect(probs('lethal', 1.9)).toHaveLength(1);
    expect(probs('lethal', 2)).toEqual([]);
    expect(probs('heavy', 1.4)).toHaveLength(1);
    expect(probs('heavy', 1.5)).toEqual([]);
    expect(probs('normal', 1.1)).toHaveLength(1);
    expect(probs('normal', 1.2)).toEqual([]);
    // a cast as long as the lead counts as the lead (the warning shows for the whole cast)
    expect(
      telegraphProblems({
        ...base,
        castTime: 3.5,
        telegraph: { shape: { kind: 'circle', radius: 2, at: 'self' }, lead: 0, tier: 'lethal' },
      }),
    ).toEqual([]);
    const g = makeGame();
    const hp = standardMemberHp(g.content, 10);
    expect(tierFor(hp * 0.85, hp)).toBe('lethal');
    expect(tierFor(hp * 0.5, hp)).toBe('heavy');
    expect(tierFor(hp * 0.1, hp)).toBe('normal');
    const huge: AbilityDef = {
      ...base,
      id: 'zz_huge',
      effects: [dmg(Math.ceil(hp))],
      telegraph: { shape: { kind: 'circle', radius: 2, at: 'self' }, lead: 1.2, tier: 'normal' },
    };
    const m = mon('zz_v', { abilities: ['zz_huge'] });
    expect(designDamage(huge, m)).toBeGreaterThanOrEqual(hp);
    const content = {
      ...g.content,
      abilities: [...g.content.abilities, huge],
      monsters: [m],
    } as ContentMap;
    expect(
      bossMechanicProblems(content).some((p) =>
        p.includes('deals lethal damage under a normal warning'),
      ),
    ).toBe(true);
  });

  it('locks its area: the boss moves 5 tiles and the hit still lands on the locked cells', () => {
    const g = makeGame();
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_boss', 20);
    const foe = dummy(g, 'zz_foe', { side: 'ally', x: 21 });
    expect(use(g, boss.id, 'zz_slam')).toBe(true);
    g.queue('world.teleport', { entityId: boss.id, mapId: ARENA.id, x: 25, y: 10 });
    g.step(secs(2) + 2);
    expect(damageTo(g, foe.id, 'zz_slam')).toHaveLength(1);
    expect(events(g, 'combat.telegraph_ended').at(-1)?.data).toMatchObject({
      op: 'settled',
      hit: [foe.id],
    });
  });

  it('rolls nothing: a unit inside with 100% dodge is struck, one outside is not', () => {
    const g = makeGame();
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_boss', 20);
    const inside = dummy(g, 'zz_in', { side: 'ally', x: 21 });
    const outside = dummy(g, 'zz_out', { side: 'ally', x: 30 });
    withCtx(g, (ctx) => applyAura(ctx, inside, 'zz_dodge', inside));
    use(g, boss.id, 'zz_slam');
    g.step(secs(2) + 2);
    expect(damageTo(g, inside.id, 'zz_slam')[0]?.data.outcome).toBe('hit');
    expect(damageTo(g, outside.id, 'zz_slam')).toEqual([]);
  });

  it('cover: a `fromAbove` warning spares a unit on a cover tile', () => {
    const g = makeGame({
      monsters: [
        mon('zz_coverboss', {
          abilities: ['zz_rain'],
          mechanics: { terrain: [{ object: 'eave', role: 'cover', offset: [2, 0], size: 0.5 }] },
        }),
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_coverboss', 20);
    const sheltered = dummy(g, 'zz_sheltered', { side: 'ally', x: 22.5, y: 10.5 });
    const open = dummy(g, 'zz_open', { side: 'ally', x: 18.5, y: 10.5 });
    use(g, boss.id, 'zz_rain');
    g.step(secs(2) + 2);
    expect(damageTo(g, sheltered.id, 'zz_rain')).toEqual([]);
    expect(damageTo(g, open.id, 'zz_rain')).toHaveLength(1);
  });

  it('first half: the first settlement deals half, the second full, still full after a reset', () => {
    const g = makeGame({ monsters: [mon('zz_halfboss', { abilities: ['zz_first'] })] });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_halfboss', 20);
    const foe = dummy(g, 'zz_foe', { side: 'ally', x: 21, level: 40 });
    const hit = () => {
      use(g, boss.id, 'zz_first');
      g.step(secs(1.5) + 2);
      return damageTo(g, foe.id, 'zz_first').at(-1)?.data.amount ?? 0;
    };
    const first = hit();
    const second = hit();
    expect(Math.abs(first * 2 - second)).toBeLessThanOrEqual(1);
    withCtx(g, (ctx) => startEvade(ctx, unit(g, boss.id)));
    expect(hit()).toBe(second);
  });

  it('at most three areas at once: a fourth waits, and content refuses a phase that could lay four', () => {
    const g = makeGame();
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_boss', 20);
    expect(use(g, boss.id, 'zz_trio')).toBe(true);
    withCtx(g, (ctx) => {
      const u = unit(g, boss.id);
      u.cast = null;
      expect(useAbility(ctx, u, 'zz_slam', null, { force: true })).toMatchObject({
        ok: false,
        code: 'warn_cap',
      });
    });
    const content = {
      ...g.content,
      monsters: [mon('zz_four', { abilities: ['zz_trio', 'zz_slam'] })],
    } as ContentMap;
    expect(bossMechanicProblems(content)).toContain(
      'monster zz_four: one phase can lay 4 warning areas',
    );
  });

  it('a pulse zone pulses from its first delay every second until it runs out', () => {
    const g = makeGame();
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_boss', 20);
    const foe = dummy(g, 'zz_foe', { side: 'ally', x: 21 });
    expect(use(g, boss.id, 'zz_pool')).toBe(true);
    const t = events(g, 'combat.telegraph').at(-1);
    expect(t?.data.kind).toBe('pulse');
    expect((t?.data.settle ?? 0) - (t?.data.start ?? 0)).toBe(secs(1.2));
    g.step(secs(1.2) - 2);
    expect(unit(g, foe.id).auras.some((a) => a.id === 'zz_cold')).toBe(false);
    g.step(secs(6));
    const applied = events(g, 'combat.aura').filter(
      (e) => e.data.targetId === foe.id && e.data.auraId === 'zz_cold',
    );
    expect(applied.length).toBe(4);
    expect(events(g, 'combat.telegraph_ended').find((e) => e.data.id === t?.data.id)?.data.op).toBe(
      'expired',
    );
  });
});

describe('10.2 to 10.5 phases, adds, enrage, windows', () => {
  it('阶段计时: a phase written with atSec comes at its time, whatever the health', () => {
    const g = makeGame({
      monsters: [
        mon('zz_timed', { mechanics: { phases: [{ atSec: 5, name: '时', untargetable: 2 }] } }),
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_timed', 20);
    pull(g, boss, unit(g, 'player'));
    g.step(secs(4));
    expect(events(g, 'combat.boss_phase')).toEqual([]);
    g.step(secs(1.5));
    expect(events(g, 'combat.boss_phase').at(-1)?.data).toMatchObject({
      bossId: 'zz_timed',
      phase: 1,
    });
    expect(unit(g, boss.id).hp).toBe(deriveStats(g.world, g.content, unit(g, boss.id)).maxHp);
    // untargetable for its seconds, then fair game again
    let can = true;
    withCtx(g, (ctx) => {
      can = useAbility(ctx, unit(g, 'player'), 'zz_kick', boss.id, { force: true }).ok;
    });
    expect(can).toBe(false);
    g.step(secs(2));
    withCtx(g, (ctx) => {
      can = useAbility(ctx, unit(g, 'player'), 'zz_kick', boss.id, { force: true }).ok;
    });
    expect(can).toBe(true);
  });

  it('onEnter runs its actions: a cast, a flag', () => {
    const g = makeGame({
      monsters: [
        mon('zz_enter', {
          mechanics: {
            phases: [
              {
                belowPct: 0.5,
                name: '半',
                onEnter: [
                  { do: 'cast', ability: 'zz_slam' },
                  { do: 'flag', name: 'seal_unrest', value: 7 },
                ],
              },
            ],
          },
        }),
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_enter', 20);
    pull(g, boss, unit(g, 'player'));
    setHpFrac(g, boss.id, 0.4);
    g.step(2);
    expect(
      events(g, 'combat.cast').some(
        (e) => e.data.casterId === boss.id && e.data.abilityId === 'zz_slam',
      ),
    ).toBe(true);
    expect(g.world.meta.flags.seal_unrest).toBe(7);
  });

  it('增援: adds come 1.2 s after their warning with half the boss threat; a reset sends them away', () => {
    const g = makeGame({
      monsters: [
        mon('zz_caller', {
          mechanics: {
            adds: [
              { atPct: 0.9, monster: 'zz_plain', count: 2, at: 'ring', despawnWithBoss: true },
            ],
          },
        }),
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_caller', 20);
    const foe = dummy(g, 'zz_foe', { side: 'ally', x: 30 });
    pull(g, boss, foe);
    unit(g, boss.id).threat[foe.id] = 400;
    setHpFrac(g, boss.id, 0.85);
    g.step(2);
    expect(events(g, 'combat.adds').at(-1)?.data.op).toBe('warned');
    expect(Object.values(units(g)).filter((u) => u.summonerId === boss.id)).toEqual([]);
    g.step(secs(1.2));
    const adds = Object.values(units(g)).filter((u) => u.summonerId === boss.id);
    expect(adds).toHaveLength(2);
    // half of the boss's 400 (2.5)
    for (const a of adds) expect(a.threat[foe.id]).toBe(200);
    withCtx(g, (ctx) => startEvade(ctx, unit(g, boss.id)));
    expect(Object.values(units(g)).filter((u) => u.summonerId === boss.id)).toEqual([]);
  });

  it('a wave boss left without a foe keeps its fight: no phase or add wave comes twice on the next pull', () => {
    const g = makeGame({
      monsters: [
        mon('zz_marcher', {
          mechanics: {
            arena: { seal: true },
            summon: [{ atPct: 0.9, monster: 'zz_plain', count: 2 }],
            phases: [{ belowPct: 0.7, name: 'x' }],
          },
        }),
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_marcher', 20);
    unit(g, boss.id).waveId = 'zz_wave';
    const foe = dummy(g, 'zz_foe', { side: 'ally', x: 30, level: 60 });
    pull(g, boss, foe);
    setHpFrac(g, boss.id, 0.6);
    g.step(secs(2));
    const callsOf = () =>
      events(g, 'combat.adds').filter((e) => e.data.entityId === boss.id && e.data.op === 'warned')
        .length;
    const phasesOf = () =>
      events(g, 'combat.boss_phase').filter((e) => e.data.entityId === boss.id).length;
    expect(callsOf()).toBe(1);
    expect(phasesOf()).toBe(1);
    expect(arenaSealed(g.world, ARENA.id)).toBe(boss.id);
    const start = unit(g, boss.id).boss?.start ?? 0;
    // the foe leaves the table: the wave boss stands where it is, its fight kept, its arena open
    const hp = unit(g, boss.id).hp;
    unit(g, boss.id).threat = {};
    g.step(2);
    expect(unit(g, boss.id).ai?.state).toBe('idle');
    expect(unit(g, boss.id).hp).toBe(hp);
    expect(unit(g, boss.id).ai?.phase).toBe(1);
    expect(unit(g, boss.id).ai?.summoned).toEqual([0]);
    expect(arenaSealed(g.world, ARENA.id)).toBeNull();
    // the next pull goes on from there; the fight clock skips the time it stood still
    g.step(secs(3));
    pull(g, unit(g, boss.id), unit(g, foe.id));
    g.step(secs(2));
    expect(unit(g, boss.id).ai?.state).toBe('chase');
    expect(callsOf()).toBe(1);
    expect(phasesOf()).toBe(1);
    expect(arenaSealed(g.world, ARENA.id)).toBe(boss.id);
    expect((unit(g, boss.id).boss?.start ?? 0) - start).toBeGreaterThanOrEqual(secs(3));
  });

  it('a paused wave boss that heals back to full out of the fight starts its fight over', () => {
    const g = makeGame({
      monsters: [
        mon('zz_marcher', {
          mechanics: {
            summon: [{ atPct: 0.9, monster: 'zz_plain', count: 2 }],
            phases: [{ belowPct: 0.7, name: 'x' }],
          },
        }),
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_marcher', 20);
    unit(g, boss.id).waveId = 'zz_wave';
    const foe = dummy(g, 'zz_foe', { side: 'ally', x: 30, level: 60 });
    pull(g, boss, foe);
    setHpFrac(g, boss.id, 0.6);
    g.step(secs(2));
    unit(g, boss.id).threat = {};
    g.step(2);
    expect(unit(g, boss.id).ai?.phase).toBe(1);
    // out of the fight it regenerates; once whole, the fight is over and starts anew
    g.step(secs(240));
    expect(healthOf(g, boss.id)).toBe(1);
    expect(unit(g, boss.id).boss).toBeUndefined();
    expect(unit(g, boss.id).ai?.phase).toBe(0);
    expect(unit(g, boss.id).ai?.summoned).toEqual([]);
  });

  it('软狂暴与难度: a 0.3 line comes at 21% on story, 34.5% on hard; a time line moves the other way', () => {
    const at = (difficulty: string, frac: number) => {
      const g = makeGame({
        monsters: [
          mon('zz_rage', { mechanics: { enrage: { belowPct: 0.3, aura: 'aur_st_enrage' } } }),
        ],
      });
      g.queue('flag.set', { key: 'difficulty', value: difficulty });
      toArena(g, 5, 2);
      const boss = monster(g, 'zz_rage', 20);
      pull(g, boss, unit(g, 'player'));
      setHpFrac(g, boss.id, frac);
      g.step(2);
      return unit(g, boss.id).auras.some((a) => a.id === 'aur_st_enrage');
    };
    expect(at('story', 0.215)).toBe(false);
    expect(at('story', 0.205)).toBe(true);
    expect(at('hard', 0.35)).toBe(false);
    expect(at('hard', 0.34)).toBe(true);
    const timed = (difficulty: string, sec: number) => {
      const g = makeGame({
        monsters: [
          mon('zz_trage', { mechanics: { enrage: { atSec: 10, aura: 'aur_st_enrage' } } }),
        ],
      });
      g.queue('flag.set', { key: 'difficulty', value: difficulty });
      toArena(g, 5, 2);
      const boss = monster(g, 'zz_trage', 20);
      pull(g, boss, dummy(g, 'zz_wall', { side: 'ally', x: 21, level: 60 }));
      g.step(secs(sec));
      return unit(g, boss.id).auras.some((a) => a.id === 'aur_st_enrage');
    };
    expect(timed('story', 12.5)).toBe(false);
    expect(timed('story', 13.5)).toBe(true);
  });

  it('硬狂暴: a dungeon lord berserks at 2.5 target kill times; a story boss never', () => {
    expect(bossTargetKillTime(18, 'dungeon', 2)).toBeCloseTo(46.5, 0);
    expect(berserkSeconds(18, 'dungeon', 2)).toBe(115);
    const g = makeGame({
      monsters: [
        mon('zz_lord', { tier: 'dungeon', mechanics: { berserk: {} } }),
        mon('zz_story', { tier: 'story', storyAs: 'dungeon', mechanics: { berserk: {} } }),
      ],
    });
    toArena(g, 5, 2);
    const lord = monster(g, 'zz_lord', 20);
    const story = monster(g, 'zz_story', 30);
    let lordAt: number | null = null;
    let storyAt: number | null = 0;
    withCtx(g, (ctx) => {
      lordAt = berserkAt(ctx, lord);
      storyAt = berserkAt(ctx, story);
    });
    expect(lordAt).toBe(berserkSeconds(10, 'dungeon'));
    expect(storyAt).toBeNull();
    pull(g, lord, unit(g, 'player'));
    g.step(1);
    withCtx(g, (ctx) => {
      const f = unit(g, lord.id).boss;
      if (f) f.start = ctx.tick - secs(lordAt ?? 0) + 5;
    });
    g.step(2);
    expect(unit(g, lord.id).auras.some((a) => a.id === 'aur_st_berserk')).toBe(false);
    g.step(10);
    expect(unit(g, lord.id).auras.some((a) => a.id === 'aur_st_berserk')).toBe(true);
  });

  it('打断窗口: a window of 0.5 to 1.0 refuses an interrupt at 0.3 and takes one at 0.6', () => {
    const g = makeGame({
      monsters: [
        mon('zz_window', {
          abilities: ['zz_long'],
          mechanics: { interruptWindows: [{ ability: 'zz_long', from: 0.5, to: 1 }] },
        }),
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_window', 20);
    pull(g, boss, unit(g, 'player'));
    use(g, boss.id, 'zz_long', 'player');
    g.step(Math.round(secs(4) * 0.3) - 1);
    expect(interruptibleNow(g.world, g.content, unit(g, boss.id))).toBe(false);
    use(g, 'player', 'zz_kick', boss.id);
    expect(unit(g, boss.id).cast).not.toBeNull();
    g.step(Math.round(secs(4) * 0.3));
    expect(interruptibleNow(g.world, g.content, unit(g, boss.id))).toBe(true);
    use(g, 'player', 'zz_kick', boss.id);
    expect(unit(g, boss.id).cast).toBeNull();
  });
});

describe('10.4 shields and stagger, 10.6 arena objects', () => {
  it('护盾与失衡: the named ability breaks the ash shell; the stagger lands through the immunity and climbs no ladder', () => {
    const g = makeGame({
      monsters: [
        mon('zz_shell', {
          mechanics: {
            shields: [
              {
                id: 'shell',
                trigger: { belowPct: 1 },
                kind: 'absorb',
                amount: { base: 500 },
                breakBy: 'ability',
                breakRef: 'zz_breaker',
                onBreak: { stagger: 3 },
              },
            ],
          },
        }),
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_shell', 20);
    withCtx(g, (ctx) => setLevel(ctx, unit(g, 'player'), 40));
    pull(g, boss, unit(g, 'player'));
    g.step(2);
    expect(events(g, 'combat.boss_shield').at(-1)?.data).toMatchObject({ op: 'up', amount: 500 });
    const hp = unit(g, boss.id).hp;
    hurt(g, 'player', boss.id, 100);
    expect(unit(g, boss.id).hp).toBe(hp);
    // a stun cannot touch it (a lair lord is control-immune) ...
    let stunned = true;
    withCtx(g, (ctx) => {
      stunned = applyAura(ctx, unit(g, boss.id), 'zz_stun', unit(g, 'player'));
    });
    expect(stunned).toBe(false);
    // ... but the breaker breaks the shell and the stagger lands
    use(g, 'player', 'zz_breaker', boss.id);
    expect(events(g, 'combat.boss_shield').at(-1)?.data.op).toBe('broken');
    const st = unit(g, boss.id).auras.find((a) => a.id === 'aur_st_stagger');
    expect(st).toBeDefined();
    expect((st?.expires ?? 0) - g.world.meta.tick).toBeGreaterThan(secs(2.5));
    expect(unit(g, boss.id).dr?.stun_ctrl).toBeUndefined();
  });

  it('an immune shield turns every hit away until its timer runs out', () => {
    const g = makeGame({
      monsters: [
        mon('zz_ward', {
          mechanics: {
            shields: [
              { id: 'ward', trigger: { atSec: 0 }, kind: 'immune', breakBy: 'timer', seconds: 3 },
            ],
          },
        }),
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_ward', 20);
    withCtx(g, (ctx) => setLevel(ctx, unit(g, 'player'), 40));
    pull(g, boss, unit(g, 'player'));
    g.step(2);
    use(g, 'player', 'zz_breaker', boss.id);
    expect(damageTo(g, boss.id, 'zz_breaker').at(-1)?.data.outcome).toBe('immune');
    g.step(secs(3));
    expect(events(g, 'combat.boss_shield').at(-1)?.data.op).toBe('expired');
    use(g, 'player', 'zz_breaker', boss.id);
    expect(damageTo(g, boss.id, 'zz_breaker').at(-1)?.data.outcome).not.toBe('immune');
  });

  it('地形: a hanging stone broken onto the boss breaks its cast and staggers it 3 s; a reset puts it back', () => {
    const g = makeGame({
      monsters: [
        mon('zz_stoneboss', {
          abilities: ['zz_long'],
          mechanics: {
            terrain: [
              {
                object: 'stone',
                name: '悬石',
                role: 'breakable',
                offset: [2, 0],
                hp: 0.05,
                radius: 4,
                effect: { stagger: 3, interrupt: true },
              },
            ],
          },
        }),
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_stoneboss', 20);
    const placed = events(g, 'combat.terrain').find(
      (e) => e.data.op === 'placed' && e.data.bossId === 'zz_stoneboss',
    );
    const stone = placed?.data.objectId ?? '';
    expect(units(g)[stone]?.terrain).toBe(stone);
    pull(g, boss, unit(g, 'player'));
    use(g, boss.id, 'zz_long', 'player');
    expect(unit(g, boss.id).cast?.abilityId).toBe('zz_long');
    hurt(g, 'player', stone, 100000);
    expect(events(g, 'combat.terrain').at(-1)?.data).toMatchObject({
      op: 'broken',
      object: 'stone',
    });
    expect(unit(g, boss.id).cast).toBeNull();
    const st = unit(g, boss.id).auras.find((a) => a.id === 'aur_st_stagger');
    const left = (st?.expires ?? 0) - g.world.meta.tick;
    expect(left >= secs(3) - 1 && left <= secs(3)).toBe(true);
    expect(ents(g)[stone]?.alive).toBe(false);
    expect(events(g, 'entity.died').some((e) => e.data.id === stone)).toBe(false);
    withCtx(g, (ctx) => startEvade(ctx, unit(g, boss.id)));
    expect(ents(g)[stone]?.alive).toBe(true);
    expect(g.world.slices.combat.terrain?.[stone]?.state).toBe('intact');
  });

  it('interact: a one-second use a hit breaks; two uses settle a boss that resolves by interaction', () => {
    const g = makeGame({
      monsters: [
        mon('zz_scroll', {
          mechanics: {
            terrain: [
              { object: 'vent_a', role: 'interact', offset: [-14, 0] },
              { object: 'vent_b', role: 'interact', offset: [-14, 2] },
            ],
            resolve: [{ way: 'interact', when: { interacted: 2 }, outcome: { reward: 'none' } }],
          },
        }),
      ],
    });
    toArena(g, 6, 10);
    const boss = monster(g, 'zz_scroll', 20);
    pull(g, boss, unit(g, 'player'));
    const objs = events(g, 'combat.terrain')
      .filter((e) => e.data.op === 'placed' && e.data.bossId === 'zz_scroll')
      .map((e) => e.data.objectId);
    g.queue('combat.interact', { objectId: objs[0] ?? '' });
    g.step(5);
    hurt(g, boss.id, 'player', 1);
    g.step(secs(1));
    expect(events(g, 'combat.terrain').some((e) => e.data.op === 'used')).toBe(false);
    for (const id of objs) {
      g.queue('combat.interact', { objectId: id });
      g.step(secs(1) + 2);
    }
    expect(events(g, 'combat.terrain').filter((e) => e.data.op === 'used')).toHaveLength(2);
    g.step(secs(1));
    expect(events(g, 'combat.boss_resolved').at(-1)?.data).toMatchObject({
      bossId: 'zz_scroll',
      way: 'interact',
    });
    expect(g.world.meta.flags['boss.zz_scroll.resolved']).toBe('interact');
    expect(unit(g, boss.id).side).toBe('neutral');
  });

  it('a hazard pulses its aura on the boss foes standing in it while the boss fights', () => {
    const g = makeGame({
      monsters: [
        mon('zz_seep', {
          mechanics: {
            terrain: [
              {
                object: 'seep',
                role: 'hazard',
                offset: [-15, 0],
                size: 1,
                aura: 'zz_cold',
                every: 1,
              },
            ],
          },
        }),
      ],
    });
    toArena(g, 5, 10);
    const boss = monster(g, 'zz_seep', 20);
    g.step(secs(2));
    expect(unit(g, 'player').auras.some((a) => a.id === 'zz_cold')).toBe(false);
    pull(g, boss, unit(g, 'player'));
    g.step(secs(3));
    expect(unit(g, 'player').auras.some((a) => a.id === 'zz_cold')).toBe(true);
  });
});

describe('10.5 marks, 10.1 the sealed arena, 10.7 resolutions, 10.8 door seeking', () => {
  function markGame(kind: 'spread' | 'stack') {
    const g = makeGame({
      monsters: [
        mon('zz_marker', {
          abilities: ['zz_markhit'],
          mechanics: { marks: [{ kind, ability: 'zz_markhit', count: 1, radius: 3, delay: 2 }] },
        }),
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_marker', 10);
    dummy(g, 'zz_a', { side: 'ally', x: 30, level: 40 });
    dummy(g, 'zz_b', { side: 'ally', x: 31, level: 40 });
    expect(use(g, boss.id, 'zz_markhit')).toBe(true);
    const t = events(g, 'combat.telegraph').at(-1);
    g.step(secs(2) + 2);
    const a = damageTo(g, 'zz_a', 'zz_markhit').at(-1)?.data.amount ?? 0;
    const b = damageTo(g, 'zz_b', 'zz_markhit').at(-1)?.data.amount ?? 0;
    return { a, b, marked: t?.data.markedId };
  }

  it('点名: a stack mark shares the hit among those in its radius; a spread mark hits each in full', () => {
    const stack = markGame('stack');
    const spread = markGame('spread');
    expect(stack.marked).toBe('zz_b');
    expect(spread.a).toBeGreaterThan(0);
    expect(Math.abs(stack.a * 2 - spread.a)).toBeLessThanOrEqual(1);
    expect(Math.abs(stack.b * 2 - spread.b)).toBeLessThanOrEqual(1);
  });

  it('a sealed arena: no leash while it holds; the other systems can ask; it opens when the boss falls', () => {
    const g = makeGame({
      monsters: [mon('zz_sealer', { leash: 5, mechanics: { arena: { seal: true } } })],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_sealer', 20);
    pull(g, boss, unit(g, 'player'));
    g.step(2);
    expect(events(g, 'combat.arena').at(-1)?.data.op).toBe('sealed');
    expect(arenaSealed(g.world, ARENA.id)).toBe(boss.id);
    g.queue('world.teleport', { entityId: boss.id, mapId: ARENA.id, x: 40, y: 10 });
    g.step(10);
    expect(unit(g, boss.id).ai?.state).toBe('chase');
    withCtx(g, (ctx) => killUnit(ctx, unit(g, boss.id), unit(g, 'player')));
    expect(events(g, 'combat.arena').at(-1)?.data.op).toBe('opened');
    expect(arenaSealed(g.world, ARENA.id)).toBeNull();
  });

  it('非战斗解法: surviving N seconds and a world-state expression both settle the fight', () => {
    const survive = makeGame({
      monsters: [
        mon('zz_tide', { mechanics: { resolve: [{ way: 'survive', when: { atSec: 3 } }] } }),
      ],
    });
    toArena(survive, 5, 2);
    const a = monster(survive, 'zz_tide', 20);
    pull(survive, a, dummy(survive, 'zz_wall', { side: 'ally', x: 21, level: 60 }));
    survive.step(secs(4));
    expect(survive.world.meta.flags['boss.zz_tide.resolved']).toBe('survive');
    const talk = makeGame({
      monsters: [
        mon('zz_talker', {
          mechanics: {
            resolve: [
              { way: 'talk', when: 'seal_unrest >= 10', outcome: { flags: { seal_looseness: 3 } } },
            ],
          },
        }),
      ],
    });
    toArena(talk, 5, 2);
    const b = monster(talk, 'zz_talker', 20);
    pull(talk, b, unit(talk, 'player'));
    talk.step(secs(2));
    expect(talk.world.meta.flags['boss.zz_talker.resolved']).toBeUndefined();
    talk.queue('flag.set', { key: 'seal_unrest', value: 12 });
    talk.step(secs(1.5));
    expect(talk.world.meta.flags['boss.zz_talker.resolved']).toBe('talk');
    expect(talk.world.meta.flags.seal_looseness).toBe(3);
    expect(unit(talk, b.id).ai?.state).toBe('yielded');
  });

  it('认输 through the library: a yield line in `resolve` stops the boss and writes both flags', () => {
    const g = makeGame({
      monsters: [
        mon('zz_yielder', { mechanics: { resolve: [{ way: 'yield', when: { belowPct: 0.1 } }] } }),
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_yielder', 20);
    pull(g, boss, unit(g, 'player'));
    setHpFrac(g, boss.id, 0.12);
    hurt(g, 'player', boss.id, 50);
    expect(unit(g, boss.id).ai?.state).toBe('yielded');
    expect(g.world.meta.flags['boss.zz_yielder.yielded']).toBe(true);
    expect(g.world.meta.flags['boss.zz_yielder.resolved']).toBe('yield');
    expect(events(g, 'combat.boss_resolved').at(-1)?.data.way).toBe('yield');
  });

  it('追门: out of 20 tiles the colossus walks to the door-marked child and drains it within 3; the player within 6 turns it back', () => {
    const g = makeGame({
      monsters: [
        mon('zz_seeker', {
          speed: 6,
          mechanics: { doorSeek: { range: 20, fallbackTag: 'door_mark', channel: 'zz_drain' } },
        }),
      ],
    });
    toArena(g, 2, 2);
    const boss = monster(g, 'zz_seeker', 30, 10);
    withCtx(g, (ctx) => {
      spawnEntity(ctx, {
        id: 'zz_child',
        kind: 'npc',
        name: 'x',
        mapId: ARENA.id,
        x: 40,
        y: 10,
        faction: 'town',
        appearance: look,
        tags: ['door_mark'],
      });
    });
    g.step(secs(6));
    const seek = events(g, 'combat.door_seek');
    expect(seek.some((e) => e.data.targetId === 'zz_child' && e.data.reason === 'mark')).toBe(true);
    const start = events(g, 'combat.cast').find(
      (e) => e.data.casterId === boss.id && e.data.op === 'start',
    );
    expect(start?.data).toMatchObject({ targetId: 'zz_child', channel: true, interruptible: true });
    const be = ents(g)[boss.id];
    expect(Math.hypot((be?.x ?? 0) - 40, (be?.y ?? 0) - 10)).toBeLessThanOrEqual(3);
    g.step(secs(1.5));
    expect(
      events(g, 'combat.channel').some(
        (e) => e.data.casterId === boss.id && e.data.targetId === 'zz_child',
      ),
    ).toBe(true);
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: ARENA.id,
      x: (be?.x ?? 0) - 4,
      y: be?.y ?? 10,
    });
    g.step(3);
    expect(
      events(g, 'combat.cast').some(
        (e) => e.data.casterId === boss.id && e.data.op === 'interrupted',
      ),
    ).toBe(true);
    expect(events(g, 'combat.door_seek').at(-1)?.data).toMatchObject({
      targetId: 'player',
      reason: 'player',
    });
  });

  it('within 20 tiles the player is the biggest door', () => {
    const g = makeGame({
      monsters: [
        mon('zz_seeker2', { mechanics: { doorSeek: { range: 20, fallbackTag: 'door_mark' } } }),
      ],
    });
    toArena(g, 15, 10);
    const boss = monster(g, 'zz_seeker2', 30, 10);
    withCtx(g, (ctx) => {
      spawnEntity(ctx, {
        id: 'zz_child',
        kind: 'npc',
        name: 'x',
        mapId: ARENA.id,
        x: 33,
        y: 10,
        faction: 'town',
        appearance: look,
        tags: ['door_mark'],
      });
    });
    pull(g, boss, unit(g, 'player'));
    g.step(3);
    expect(events(g, 'combat.door_seek').at(-1)?.data).toMatchObject({
      targetId: 'player',
      reason: 'player',
    });
  });
});

describe('3.9 channels, 12.2 perceived presence', () => {
  it('a hit on a channel takes a quarter of what is left of it', () => {
    const g = makeGame();
    toArena(g, 5, 2);
    const caster = dummy(g, 'zz_monk', { side: 'ally', x: 20, level: 40 });
    const foe = dummy(g, 'zz_brute', { side: 'enemy', x: 22 });
    withCtx(g, (ctx) => grantAbility(ctx, caster.id, 'zz_mend'));
    use(g, caster.id, 'zz_mend');
    const c = unit(g, caster.id).cast;
    expect(c?.channel).toBeDefined();
    g.step(secs(1));
    const left = (c?.end ?? 0) - g.world.meta.tick;
    hurt(g, foe.id, caster.id, 5);
    const after = (unit(g, caster.id).cast?.end ?? 0) - g.world.meta.tick;
    expect(after).toBe(left - 1 - Math.floor((left - 1) * 0.25));
  });

  it('看到的灵压: a beast leaves a player two ranks up alone, attacks once the player veils; an undead does not care', () => {
    const g = makeGame({
      monsters: [
        mon('zz_wolf', {
          family: 'beast',
          rank: 'normal',
          tier: undefined,
          aggroRadius: 6,
          minLevel: 3,
          maxLevel: 3,
        }),
        mon('zz_bones', {
          family: 'undead',
          rank: 'normal',
          tier: undefined,
          aggroRadius: 6,
          minLevel: 3,
          maxLevel: 3,
        }),
      ],
    });
    toArena(g, 5, 2);
    const p = unit(g, 'player');
    p.level = 25;
    p.tier = 2;
    const wolf = monster(g, 'zz_wolf', 20, 10, 3);
    const bones = monster(g, 'zz_bones', 40, 10, 3);
    expect(instinct(g.world, g.content, wolf, unit(g, 'player'))).toBe('avoid');
    expect(willPick(g.world, g.content, wolf, unit(g, 'player'))).toBe(false);
    expect(willPick(g.world, g.content, bones, unit(g, 'player'))).toBe(true);
    g.queue('world.teleport', { entityId: 'player', mapId: ARENA.id, x: 24.5, y: 10 });
    g.step(secs(2));
    expect(unit(g, wolf.id).ai?.state).toBe('idle');
    unit(g, 'player').presenceMode = 'veiled';
    expect(willPick(g.world, g.content, wolf, unit(g, 'player'))).toBe(true);
    // the alert radius shrinks with the level gap (11 `aggroRadius`): step in close
    const we = ents(g)[wolf.id];
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: ARENA.id,
      x: (we?.x ?? 20) + 2,
      y: we?.y ?? 10,
    });
    g.step(secs(2));
    expect(unit(g, wolf.id).ai?.state).toBe('chase');
  });
});

describe('11 the registry fields act one uses (one data-driven case each)', () => {
  it('lists every first-act field and reads only registered keys', () => {
    expect(FIRST_ACT_FIELDS.length).toBeGreaterThanOrEqual(40);
    for (const f of FIRST_ACT_FIELDS) expect(MECHANIC_KEYS.has(f)).toBe(true);
    const g = makeGame();
    const content = {
      ...g.content,
      monsters: [mon('zz_odd', { mechanics: { zzMystery: true } as never })],
    } as ContentMap;
    expect(bossMechanicProblems(content)).toContain('monster zz_odd: unknown mechanic zzMystery');
    expect(bossMechanicProblems(g.content)).toEqual([]);
  });

  it('on-hit affixes lay their template auras with the data numbers', () => {
    const fields = {
      soulrot: ['aur_mon_dianrot'],
      smolder: ['aur_mon_smolder'],
      mortalStrike: ['aur_mon_mortalwound'],
      concuss: ['aur_mon_dazed'],
      stunOnHit: ['aur_mon_dazed'],
      ensnare: ['aur_mon_webbed'],
      corrode: ['aur_mon_corrode'],
      blind: ['aur_mon_blinded'],
      demoralize: ['aur_mon_demoralized'],
    } as const;
    for (const [field, [aura]] of Object.entries(fields)) {
      const g = makeGame({
        monsters: [
          mon(`zz_${field}`, {
            rank: 'normal',
            tier: undefined,
            mechanics: { [field]: { chance: 1, duration: 2, amount: 0.2, damage: 7 } },
          }),
        ],
      });
      toArena(g, 5, 2);
      const m = monster(g, `zz_${field}`, 20);
      const t = dummy(g, 'zz_t', { side: 'ally', x: 21 });
      withCtx(g, (ctx) => onHitAffixes(ctx, m, t));
      const a = unit(g, t.id).auras.find((x) => x.id === aura);
      expect(a, field).toBeDefined();
      const left = (a?.expires ?? 0) - g.world.meta.tick;
      expect(left >= secs(2) - 1 && left <= secs(2), field).toBe(true);
      if (field === 'corrode') expect(a?.scale).toBeCloseTo(2);
      if (field === 'soulrot' || field === 'smolder') expect(a?.power).toBe(7);
      if (field === 'concuss') expect(unit(g, t.id).dr?.stun_proc).toBeDefined();
    }
    const g = makeGame({
      monsters: [
        mon('zz_knock', {
          rank: 'normal',
          tier: undefined,
          mechanics: { knockback: { chance: 1, distance: 3 } },
        }),
      ],
    });
    toArena(g, 5, 2);
    const m = monster(g, 'zz_knock', 20);
    const t = dummy(g, 'zz_t', { side: 'ally', x: 21 });
    withCtx(g, (ctx) => onHitAffixes(ctx, m, t));
    g.step(secs(2));
    expect(ents(g)[t.id]?.x ?? 0).toBeGreaterThan(22.5);
  });

  it('timed affixes: aoePulse, stomp, aoeSlow and charge lay warnings; stoneskin shields; bigCast casts; desperateHeal heals once', () => {
    const g = makeGame({
      monsters: [
        mon('zz_timer', {
          mechanics: {
            aoePulse: { radius: 3, every: 5, damage: { base: 20 } },
            stomp: { radius: 3, every: 5, duration: 1, damage: { base: 5 } },
            aoeSlow: { radius: 3, every: 5, slow: 0.25, duration: 4 },
            stoneskin: { every: 5, absorb: { base: 120 } },
            bigCast: { ability: 'zz_long', every: 5 },
            desperateHeal: { belowPct: 0.3, pct: 0.25 },
          },
        }),
        mon('zz_charger', { mechanics: { charge: { minRange: 4, every: 5 } } }),
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_timer', 20);
    const foe = dummy(g, 'zz_foe', { side: 'ally', x: 21 });
    const far = dummy(g, 'zz_far', { side: 'ally', x: 30, level: 40 });
    withCtx(g, (ctx) => {
      const b = unit(g, boss.id);
      b.boss = { start: ctx.tick - secs(5) };
      tickTimedAffixes(ctx, b, ents(g)[boss.id] as never, unit(g, far.id));
    });
    const sources = events(g, 'combat.telegraph').filter((e) => e.data.casterId === boss.id);
    expect(sources.map((e) => e.data.kind)).toEqual(['circle', 'circle', 'circle']);
    expect(unit(g, boss.id).auras.find((a) => a.id === 'aur_mon_ashshell')?.absorb).toBe(120);
    expect(unit(g, boss.id).cast?.abilityId).toBe('zz_long');
    g.step(secs(1.2) + 2);
    expect(unit(g, foe.id).auras.some((a) => a.id === 'aur_mon_stompstun')).toBe(true);
    expect(unit(g, foe.id).auras.find((a) => a.id === 'aur_mon_ashtideslow')?.scale).toBeCloseTo(
      0.5,
    );
    const charger = monster(g, 'zz_charger', 10, 15);
    withCtx(g, (ctx) => {
      const c = unit(g, charger.id);
      c.boss = { start: ctx.tick - secs(5) };
      tickTimedAffixes(ctx, c, ents(g)[charger.id] as never, unit(g, far.id));
    });
    expect(events(g, 'combat.telegraph').at(-1)?.data).toMatchObject({
      casterId: charger.id,
      kind: 'line',
    });
    g.step(secs(1.2) + 2);
    const ce = ents(g)[charger.id];
    expect(Math.hypot((ce?.x ?? 0) - 30, (ce?.y ?? 0) - 10)).toBeLessThan(1.5);
    // the desperate heal: below its line, once a fight, a cast that heals its share
    withCtx(g, (ctx) => {
      const b = unit(g, boss.id);
      b.cast = null;
      b.hp = Math.round(deriveStats(ctx.world, ctx.content, b).maxHp * 0.2);
      tickTimedAffixes(ctx, b, ents(g)[boss.id] as never, unit(g, far.id));
    });
    expect(unit(g, boss.id).cast?.abilityId).toBe('sk_mon_desperateheal');
    const before = unit(g, boss.id).hp;
    g.step(secs(2) + 1);
    const max = deriveStats(g.world, g.content, unit(g, boss.id)).maxHp;
    expect(unit(g, boss.id).hp - before).toBe(Math.round(max * 0.25));
  });

  it('reactions: thorns, frenzyOnHit, packFrenzy, deathThroes, ashPuddle', () => {
    const g = makeGame({
      monsters: [
        mon('zz_spiky', {
          rank: 'normal',
          tier: undefined,
          mechanics: { thorns: { amount: 9 }, frenzyOnHit: { amount: 0.05, max: 0.3 } },
        }),
        mon('zz_pack', {
          rank: 'normal',
          tier: undefined,
          mechanics: {
            packFrenzy: { amount: 0.1, max: 0.3 },
            deathThroes: { radius: 2, damage: { base: 30 } },
            ashPuddle: { radius: 2, slow: 0.5, duration: 4 },
          },
        }),
      ],
    });
    toArena(g, 5, 2);
    const spiky = monster(g, 'zz_spiky', 20);
    expect(unit(g, spiky.id).auras.find((a) => a.id === 'aur_mon_thorns')?.thorns).toBe(9);
    const fresh = deriveStats(g.world, g.content, unit(g, spiky.id)).stats.haste;
    setHpFrac(g, spiky.id, 0.5);
    expect(deriveStats(g.world, g.content, unit(g, spiky.id)).stats.haste - fresh).toBeCloseTo(25);
    const a = monster(g, 'zz_pack', 40);
    const b = monster(g, 'zz_pack', 41);
    const near = dummy(g, 'zz_near', { side: 'ally', x: 40, y: 11, level: 40 });
    withCtx(g, (ctx) => killUnit(ctx, unit(g, a.id), unit(g, 'player')));
    expect(unit(g, b.id).auras.find((x) => x.id === 'aur_mon_packfrenzy')?.stacks).toBe(1);
    const kinds = events(g, 'combat.telegraph')
      .filter((e) => e.data.casterId === a.id)
      .map((e) => e.data.kind);
    expect(kinds).toEqual(['circle', 'pulse']);
    g.step(secs(1.2) + 2);
    expect(damageTo(g, near.id, 'affix:deathThroes')).toHaveLength(1);
    expect(unit(g, near.id).auras.some((x) => x.id === 'aur_mon_ashtideslow')).toBe(true);
  });

  it('flags: ccImmune, slowImmune, ignoreTaunt, tags (flying), movement traits, componentTags and nameInherit', () => {
    const g = makeGame({
      monsters: [
        mon('zz_flags', {
          rank: 'normal',
          tier: undefined,
          tags: ['flying', 'eroded'],
          mechanics: {
            ccImmune: true,
            slowImmune: true,
            ignoreTaunt: true,
            phasesThroughObstacles: true,
            canSwim: true,
            componentTags: ['part_fang'],
            nameInherit: true,
          },
        }),
      ],
    });
    toArena(g, 5, 2);
    const m = monster(g, 'zz_flags', 20);
    expect(ents(g)[m.id]?.tags).toEqual(expect.arrayContaining(['flying', 'eroded']));
    let stun = true;
    let slow = true;
    withCtx(g, (ctx) => {
      stun = applyAura(ctx, unit(g, m.id), 'zz_stun', unit(g, 'player'));
      slow = applyAura(ctx, unit(g, m.id), 'zz_cold', unit(g, 'player'));
      taunt(ctx, unit(g, m.id), unit(g, 'player'));
    });
    expect([stun, slow]).toEqual([false, false]);
    expect(unit(g, m.id).forced).toBeUndefined();
    expect(movementTraits(g.content, 'zz_flags')).toEqual({ phases: true, swims: true });
    // flying shrugs off roots (9.3) even without ccImmune
    const g2 = makeGame({
      monsters: [mon('zz_bird', { rank: 'normal', tier: undefined, tags: ['flying'] })],
    });
    toArena(g2, 5, 2);
    const bird = monster(g2, 'zz_bird', 20);
    let rooted = true;
    withCtx(g2, (ctx) => {
      rooted = applyAura(ctx, unit(g2, bird.id), 'zz_root', unit(g2, 'player'));
    });
    expect(rooted).toBe(false);
    withCtx(g, (ctx) => killUnit(ctx, unit(g, m.id), unit(g, 'player')));
    expect(events(g, 'combat.kill').at(-1)?.data).toMatchObject({
      components: ['part_fang'],
      nameInherit: true,
    });
  });

  it('spawning: nightOnly, weatherSpawn, rumorScale and ambushEmerge', () => {
    const g = makeGame({
      monsters: [
        mon('zz_night', {
          rank: 'normal',
          tier: undefined,
          mechanics: { nightOnly: { mode: 'spawn' } },
        }),
        mon('zz_storm', {
          rank: 'normal',
          tier: undefined,
          mechanics: { weatherSpawn: 'ashfall' },
        }),
        mon('zz_rare', { rank: 'rare', tier: undefined }),
        mon('zz_lurker', {
          rank: 'normal',
          tier: undefined,
          mechanics: { ambushEmerge: { radius: 3, firstHitMult: 2 } },
        }),
      ],
    });
    toArena(g, 5, 2);
    withCtx(g, (ctx) => {
      expect(
        spawnAllowed(ctx, ctx.content.monsters.find((m) => m.id === 'zz_night') as MonsterDef),
      ).toBe(false);
      const storm = ctx.content.monsters.find((m) => m.id === 'zz_storm') as MonsterDef;
      forceWeather(ctx, 'clear', ctx.tick + 100, 'test');
      expect(spawnAllowed(ctx, storm)).toBe(false);
      forceWeather(ctx, 'ashfall', ctx.tick + 100, 'test');
      expect(spawnAllowed(ctx, storm)).toBe(true);
      registerModifier(ctx, {
        target: 'monster',
        key: 'rumor:zz_rare',
        add: 3,
        untilTick: ctx.tick + 1000,
        source: 'cognition',
        visibility: 'hidden',
        note: '',
      });
    });
    const rare = monster(g, 'zz_rare', 20);
    expect(unit(g, rare.id).auras.find((a) => a.id === 'aur_mon_rumor')?.scale).toBeCloseTo(3);
    const lurker = monster(g, 'zz_lurker', 40);
    expect(unit(g, lurker.id).attackable).toBe(false);
    expect(ents(g)[lurker.id]?.tags).toContain('ambush');
    g.queue('world.teleport', { entityId: 'player', mapId: ARENA.id, x: 38, y: 10 });
    g.step(3);
    expect(unit(g, lurker.id).attackable).toBe(true);
    expect(unit(g, lurker.id).ai?.state).toBe('chase');
    expect(ambushMult(unit(g, lurker.id))).toBe(2);
    expect(ambushMult(unit(g, lurker.id))).toBe(1);
  });

  it('world: purifyTo, corpseRise, cropBlight, caravanRaid, lureFlee', () => {
    const g = makeGame({
      monsters: [
        mon('zz_tainted', {
          rank: 'normal',
          tier: undefined,
          family: 'beast',
          mechanics: { purifyTo: 'zz_plain' },
        }),
        mon('zz_riser', {
          rank: 'normal',
          tier: undefined,
          mechanics: { corpseRise: { into: 'zz_plain', chance: 1 } },
        }),
        mon('zz_blight', {
          rank: 'normal',
          tier: undefined,
          mechanics: { cropBlight: { rate: 0.2 }, caravanRaid: true, lureFlee: true },
        }),
      ],
    });
    toArena(g, 5, 2);
    const tainted = monster(g, 'zz_tainted', 20);
    use(g, 'player', 'zz_cleanse', tainted.id);
    const purified = events(g, 'combat.purified').at(-1);
    expect(purified?.data).toMatchObject({ from: 'zz_tainted', to: 'zz_plain' });
    expect(units(g)[tainted.id]).toBeUndefined();
    expect(unit(g, purified?.data.newId ?? '').side).toBe('neutral');
    const riser = monster(g, 'zz_riser', 51, 15);
    withCtx(g, (ctx) => killUnit(ctx, unit(g, riser.id), unit(g, 'player')));
    expect(unit(g, riser.id).rise).toBe('zz_plain');
    g.step(secs(9));
    expect(
      Object.values(units(g)).some(
        (u) =>
          u.monsterId === 'zz_plain' &&
          Math.hypot((ents(g)[u.id]?.x ?? 0) - 51, (ents(g)[u.id]?.y ?? 0) - 15) < 1.5,
      ),
    ).toBe(true);
    const blight = monster(g, 'zz_blight', 45);
    withCtx(g, (ctx) => renewBlight(ctx));
    expect(activeModifiers(g.world, 'production', ARENA.id).map((m) => m.factor)).toEqual([0.8]);
    const cart = dummy(g, 'zz_cart', { side: 'ally', x: 46, tags: ['caravan'] });
    withCtx(g, (ctx) => {
      expect(caravanTarget(ctx, unit(g, blight.id), ents(g)[blight.id] as never, 5)?.id).toBe(
        cart.id,
      );
      const p = fleePoint(
        ctx,
        unit(g, blight.id),
        ents(g)[blight.id] as never,
        ents(g)[cart.id] as never,
      );
      expect(Math.hypot(p.x - 52, p.y - 16)).toBeLessThan(0.01);
    });
  });

  it('thieves: pilfer takes coin and crystalEat a crystal; the kill gives both back', () => {
    const g = makeGame({
      monsters: [
        mon('zz_thief', {
          rank: 'normal',
          tier: undefined,
          mechanics: { pilfer: { take: 'coin', amount: 7 }, crystalEat: { items: ['zz_crystal'] } },
        }),
      ],
    });
    toArena(g, 5, 2);
    withCtx(g, (ctx) => {
      addMoney(ctx, 'player', 50, 'test');
      addItem(ctx, 'player', 'zz_crystal', 2);
    });
    const thief = monster(g, 'zz_thief', 20);
    withCtx(g, (ctx) => onHitAffixes(ctx, unit(g, thief.id), unit(g, 'player')));
    const inv = () => g.world.slices.inventory.owners.player;
    expect(inv()?.money).toBe(43);
    expect(inv()?.items.zz_crystal).toBe(1);
    expect(unit(g, thief.id).stolen?.money).toBe(7);
    withCtx(g, (ctx) => killUnit(ctx, unit(g, thief.id), unit(g, 'player')));
    expect(inv()?.money).toBeGreaterThanOrEqual(50);
    expect(inv()?.items.zz_crystal).toBe(2);
  });

  it('an oath-locked monster never flees', () => {
    const g = makeGame({
      monsters: [
        mon('zz_oath', {
          rank: 'normal',
          tier: undefined,
          family: 'humanoid',
          aggroRadius: 0,
          mechanics: { oathLock: true, flee: 0.5 },
        }),
      ],
    });
    toArena(g, 5, 2);
    const m = monster(g, 'zz_oath', 20);
    const foe = dummy(g, 'zz_foe', { side: 'ally', x: 21, level: 40 });
    pull(g, m, foe);
    withCtx(g, (ctx) => {
      unit(g, m.id).hp = 1;
      tickMonster(ctx, unit(g, m.id));
    });
    expect(unit(g, m.id).ai?.state).toBe('chase');
  });

  it('breakableParts show from their phase and fire their actions; oathLock seals the arena', () => {
    const g = makeGame({
      monsters: [
        mon('zz_parts', {
          mechanics: {
            phases: [{ belowPct: 0.5, name: '崩' }],
            breakableParts: [
              {
                id: 'core',
                hp: 0.1,
                phase: 1,
                onBreak: [
                  { do: 'flag', name: 'seal_unrest', value: 4 },
                  { do: 'stagger', seconds: 2 },
                ],
              },
            ],
            oathLock: true,
            flee: 0.9,
          },
        }),
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_parts', 20);
    pull(g, boss, unit(g, 'player'));
    g.step(2);
    expect(events(g, 'combat.arena').at(-1)?.data.op).toBe('sealed');
    const parts = () => Object.values(g.world.slices.combat.terrain ?? {}).filter((t) => t.part);
    expect(parts()).toEqual([]);
    setHpFrac(g, boss.id, 0.45);
    g.step(2);
    expect(unit(g, boss.id).ai?.state).toBe('chase');
    const part = parts()[0];
    expect(part?.object).toBe('core');
    hurt(g, 'player', part?.id ?? '', 100000);
    expect(g.world.meta.flags.seal_unrest).toBe(4);
    expect(unit(g, boss.id).auras.some((a) => a.id === 'aur_st_stagger')).toBe(true);
  });

  it('口径扩展: a beast with flee runs and calls nobody; a person calls idle kin; social defaults to 3 tiles', () => {
    const g = makeGame({
      monsters: [
        mon('zz_hare', {
          rank: 'normal',
          tier: undefined,
          family: 'beast',
          aggroRadius: 0,
          mechanics: { flee: 0.5 },
        }),
        mon('zz_man', {
          rank: 'normal',
          tier: undefined,
          family: 'humanoid',
          aggroRadius: 0,
          mechanics: { flee: 0.5 },
        }),
      ],
    });
    toArena(g, 5, 2);
    const hare = monster(g, 'zz_hare', 20);
    const kinHare = monster(g, 'zz_hare', 22);
    const farHare = monster(g, 'zz_hare', 26);
    const man = monster(g, 'zz_man', 40);
    const kinMan = monster(g, 'zz_man', 42, 10);
    const farMan = monster(g, 'zz_man', 46, 10);
    const foe = dummy(g, 'zz_foe', { side: 'ally', x: 30, level: 40 });
    withCtx(g, (ctx) => {
      engage(ctx, unit(g, hare.id), foe);
    });
    // social: the hare's kin 2 tiles off joins at the pull (3 tiles by default), 4 off does not
    expect(unit(g, kinHare.id).ai?.state).toBe('chase');
    expect(unit(g, farHare.id).ai?.state).toBe('idle');
    withCtx(g, (ctx) => {
      const kb = unit(g, kinHare.id).ai;
      if (kb) kb.state = 'idle';
      unit(g, kinHare.id).threat = {};
      unit(g, hare.id).hp = 1;
      tickMonster(ctx, unit(g, hare.id));
    });
    expect(unit(g, hare.id).ai?.state).toBe('flee');
    expect(unit(g, kinHare.id).ai?.state).toBe('idle');
    withCtx(g, (ctx) => {
      const mb = unit(g, man.id).ai;
      if (mb) mb.state = 'chase';
      unit(g, man.id).threat = { [foe.id]: 5 };
      unit(g, man.id).hp = 1;
      tickMonster(ctx, unit(g, man.id));
    });
    expect(unit(g, man.id).ai?.state).toBe('flee');
    expect(unit(g, kinMan.id).ai?.state).toBe('chase');
    expect(unit(g, farMan.id).ai?.state).toBe('idle');
  });
});

describe('9.4 the sediment and injury auras in combat; injury sources', () => {
  it('澱热: 1,000 casts of a fevered caster miscast 70 to 130 times, the same on a replay', () => {
    const run = () => {
      const g = makeGame({}, 3);
      toArena(g, 5, 2);
      const caster = dummy(g, 'zz_mage', { side: 'ally', x: 20, classId: 'mage', level: 20 });
      const foe = dummy(g, 'zz_target', { side: 'enemy', x: 40, level: 20 });
      let miscast = 0;
      withCtx(g, (ctx) => {
        grantAbility(ctx, caster.id, 'zz_bolt');
        applyAura(ctx, caster, 'aur_st_sed_fever', caster);
      });
      // in batches: the event ring keeps 400
      for (let batch = 0; batch < 50; batch++) {
        const from = g.world.meta.tick;
        withCtx(g, (ctx) => {
          for (let i = 0; i < 20; i++) {
            caster.res.mana = 1000;
            caster.cast = null;
            useAbility(ctx, caster, 'zz_bolt', foe.id, { force: true });
            foe.hp = 100000;
          }
        });
        miscast += events(g, 'combat.cast').filter(
          (e) => e.tick > from && e.data.reason === 'miscast',
        ).length;
      }
      return miscast;
    };
    const a = run();
    expect(a).toBeGreaterThanOrEqual(70);
    expect(a).toBeLessThanOrEqual(130);
    expect(run()).toBe(a);
  });

  it('the taint spot slows health regeneration by 10%, the tempering backlash halves mana regeneration', () => {
    const g = makeGame();
    toArena(g, 5, 2);
    const a = dummy(g, 'zz_a', { side: 'ally', x: 20, classId: 'priest', level: 20 });
    withCtx(g, (ctx) => {
      applyAura(ctx, a, 'aur_st_sed_spot', a);
      applyAura(ctx, a, 'aur_st_injury_backlash', a);
    });
    const d = deriveStats(g.world, g.content, unit(g, a.id));
    expect(d.mods.hpRegen).toBeCloseTo(-0.1);
    expect(d.mods.manaRegen).toBeCloseTo(-0.5);
  });

  it('a maimed arm cannot wield a two-handed weapon; a maimed player waits 20% longer on door skills', () => {
    const g = makeGame();
    toArena(g, 5, 2);
    const w = dummy(g, 'zz_w', { side: 'ally', x: 20, level: 20 });
    withCtx(g, (ctx) => {
      const h = ctx.world.slices.inventory.owners;
      h[w.id] = { money: 0, items: { zz_greatsword: 1 }, equipped: { main_hand: 'zz_greatsword' } };
    });
    expect(deriveStats(g.world, g.content, unit(g, w.id)).mainHand?.id).toBe('zz_greatsword');
    withCtx(g, (ctx) => applyAura(ctx, unit(g, w.id), 'aur_st_injury_maimed_arm', unit(g, w.id)));
    const d = deriveStats(g.world, g.content, unit(g, w.id));
    expect(d.twoHandLocked).toBe(true);
    expect(d.mainHand).toBeUndefined();
    const foe = dummy(g, 'zz_foe', { side: 'enemy', x: 21 });
    withCtx(g, (ctx) => {
      expect(
        useAbility(ctx, unit(g, w.id), 'sk_war_heroicstrike', foe.id, { force: true }),
      ).toMatchObject({ ok: false, code: 'maimed' });
    });
    withCtx(g, (ctx) => {
      grantAbility(ctx, 'player', 'zz_doorhit');
      applyAura(ctx, unit(g, 'player'), 'aur_st_injury_maimed_leg', unit(g, 'player'));
      useAbility(ctx, unit(g, 'player'), 'zz_doorhit', foe.id, { force: true });
      expect((unit(g, 'player').cds.zz_doorhit ?? 0) - ctx.tick).toBe(secs(12));
    });
  });

  it('injury sources: a companion brought back up, a boss skill on the player, the tempering backlash', () => {
    const g = makeGame();
    toArena(g, 5, 2);
    const comp = dummy(g, 'zz_comp', { side: 'ally', x: 20, kind: 'companion' });
    withCtx(g, (ctx) => {
      killUnit(ctx, comp, null);
      reviveUnit(ctx, unit(g, comp.id), 0.5);
    });
    g.step(2);
    const injuries = () => events(g, 'ailments.injury').map((e) => [e.data.entityId, e.data.kind]);
    expect(injuries()).toContainEqual([comp.id, 'light']);
    const boss = monster(g, 'zz_boss', 30);
    use(g, boss.id, 'zz_wound', 'player');
    g.step(2);
    expect(injuries()).toContainEqual(['player', 'maimed_arm']);
    let backlashes = 0;
    withCtx(g, (ctx) => {
      for (let i = 0; i < 40; i++) if (temperBacklash(ctx, comp.id)) backlashes++;
    });
    expect(backlashes).toBeGreaterThan(8);
    expect(backlashes).toBeLessThan(32);
  });
});

describe('review follow-ups: resets, aim, resolutions, arena objects, the rest', () => {
  it('a reset takes off the enrage, berserk and phase auras with the fight', () => {
    const g = makeGame({
      monsters: [
        mon('zz_resetter', {
          tier: 'dungeon',
          mechanics: {
            enrage: { belowPct: 0.5, aura: 'aur_st_enrage' },
            phases: [{ belowPct: 0.6, name: '甲', aura: 'zz_weak' }],
            berserk: { atSec: 1 },
            passives: ['aur_mon_crystalhide'],
          },
        }),
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_resetter', 20);
    pull(g, boss, dummy(g, 'zz_wall', { side: 'ally', x: 21, level: 60 }));
    setHpFrac(g, boss.id, 0.4);
    g.step(secs(1.5));
    const ids = () => unit(g, boss.id).auras.map((a) => a.id);
    expect(ids()).toEqual(expect.arrayContaining(['aur_st_enrage', 'zz_weak', 'aur_st_berserk']));
    withCtx(g, (ctx) => startEvade(ctx, unit(g, boss.id)));
    expect(ids()).not.toContain('aur_st_enrage');
    expect(ids()).not.toContain('aur_st_berserk');
    expect(ids()).not.toContain('zz_weak');
    expect(ids()).toContain('aur_mon_crystalhide');
    expect(unit(g, boss.id).boss).toBeUndefined();
  });

  it('a warning at the target aims at the caster foe, also for an area ability; a cone faces it', () => {
    const g = makeGame({
      abilities: [
        {
          id: 'zz_aimed',
          name: 'x',
          desc: 'x',
          target: 'area',
          radius: 30,
          school: 'shadow',
          effects: [dmg(10)],
          telegraph: {
            shape: { kind: 'circle', radius: 1, at: 'target' },
            lead: 1.2,
            tier: 'normal',
          },
          gcd: false,
        },
        {
          id: 'zz_breath',
          name: 'x',
          desc: 'x',
          target: 'area',
          radius: 30,
          school: 'fire',
          effects: [dmg(10)],
          telegraph: { shape: { kind: 'cone', radius: 6, angle: 60 }, lead: 1.2, tier: 'normal' },
          gcd: false,
        },
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_boss', 30);
    const foe = dummy(g, 'zz_west', { side: 'ally', x: 25, level: 40 });
    unit(g, boss.id).target = foe.id;
    use(g, boss.id, 'zz_aimed');
    const circle = cellSet(events(g, 'combat.telegraph').at(-1)?.data.cells ?? []);
    expect(circle.has('25,10')).toBe(true);
    expect(circle.has('30,10')).toBe(false);
    unit(g, boss.id).cast = null;
    use(g, boss.id, 'zz_breath');
    const cone = cellSet(events(g, 'combat.telegraph').at(-1)?.data.cells ?? []);
    expect(cone.has('26,10')).toBe(true);
    expect(cone.has('33,10')).toBe(false);
  });

  it('adds lay down with their master on a resolution and on a yield', () => {
    const g = makeGame({
      monsters: [
        mon('zz_trial', {
          mechanics: {
            adds: [{ atPct: 1, monster: 'zz_plain', count: 2 }],
            resolve: [{ way: 'survive', when: { atSec: 3 } }],
          },
        }),
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_trial', 20);
    pull(g, boss, dummy(g, 'zz_wall', { side: 'ally', x: 21, level: 60 }));
    g.step(secs(2));
    const adds = () => Object.values(units(g)).filter((u) => u.summonerId === boss.id);
    expect(adds()).toHaveLength(2);
    g.step(secs(2));
    expect(g.world.meta.flags['boss.zz_trial.resolved']).toBe('survive');
    for (const a of adds()) expect([a.side, a.ai?.state]).toEqual(['neutral', 'yielded']);
  });

  it('an immune shield breaks when its named ability strikes it', () => {
    const g = makeGame({
      monsters: [
        mon('zz_aegis', {
          mechanics: {
            shields: [
              {
                id: 'aegis',
                trigger: { atSec: 0 },
                kind: 'immune',
                breakBy: 'ability',
                breakRef: 'zz_breaker',
              },
            ],
          },
        }),
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_aegis', 20);
    withCtx(g, (ctx) => setLevel(ctx, unit(g, 'player'), 40));
    pull(g, boss, unit(g, 'player'));
    g.step(2);
    use(g, 'player', 'zz_breaker', boss.id);
    expect(damageTo(g, boss.id, 'zz_breaker').at(-1)?.data.outcome).toBe('immune');
    expect(events(g, 'combat.boss_shield').at(-1)?.data.op).toBe('broken');
  });

  it('arena objects are neutral: only the boss foes strike them, rest and presence ignore them', () => {
    const g = makeGame();
    toArena(g, 5, 2);
    const raven = monster(g, 'guardian_raven', 20, 10, 3);
    const stone = Object.values(g.world.slices.combat.terrain ?? {}).find(
      (t) => t.bossId === raven.id,
    );
    const su = unit(g, stone?.id ?? '');
    expect(su.side).toBe('neutral');
    expect(su.presence).toBe(0);
    withCtx(g, (ctx) => {
      expect(canAttack(ctx.world, unit(g, 'player'), su)).toBe(true);
      expect(canAttack(ctx.world, unit(g, raven.id), su)).toBe(false);
    });
    expect(ents(g)[su.id]?.tags).not.toContain('hostile');
  });

  it('an interrupted boss cast goes on cooldown and is not recast at once', () => {
    const g = makeGame({
      abilities: [
        {
          ...(TEST_ABILITIES.find((a) => a.id === 'zz_long') as AbilityDef),
          id: 'zz_longcd',
          cooldown: 20,
        },
      ],
    });
    toArena(g, 5, 2);
    const boss = monster(g, 'zz_boss', 20);
    withCtx(g, (ctx) => setLevel(ctx, unit(g, 'player'), 40));
    pull(g, boss, unit(g, 'player'));
    use(g, boss.id, 'zz_longcd', 'player');
    use(g, 'player', 'zz_kick', boss.id);
    expect(unit(g, boss.id).cast).toBeNull();
    expect((unit(g, boss.id).cds.zz_longcd ?? 0) - g.world.meta.tick).toBeGreaterThan(secs(19));
  });

  it('a pilfering thief that flees runs off', () => {
    const g = makeGame({
      monsters: [
        mon('zz_runner', {
          rank: 'normal',
          tier: undefined,
          family: 'beast',
          mechanics: { pilfer: { take: 'coin', amount: 3, flee: true } },
        }),
      ],
    });
    toArena(g, 5, 10);
    withCtx(g, (ctx) => addMoney(ctx, 'player', 20, 'test'));
    const thief = monster(g, 'zz_runner', 7, 10);
    withCtx(g, (ctx) => onHitAffixes(ctx, unit(g, thief.id), unit(g, 'player')));
    g.step(secs(2));
    expect(unit(g, thief.id).ai?.state).toBe('flee');
    expect(ents(g)[thief.id]?.x ?? 0).toBeGreaterThan(9);
  });

  it('看到的灵压 for people: one who can yield yields, one who can flee flees, the rest fight', () => {
    const g = makeGame({
      monsters: [
        mon('zz_yielder2', {
          rank: 'normal',
          tier: undefined,
          family: 'humanoid',
          mechanics: { yieldAtPct: 0.2 },
        }),
        mon('zz_runner2', {
          rank: 'normal',
          tier: undefined,
          family: 'humanoid',
          mechanics: { flee: 0.2 },
        }),
        mon('zz_brawler', { rank: 'normal', tier: undefined, family: 'humanoid' }),
      ],
    });
    toArena(g, 5, 2);
    const p = unit(g, 'player');
    p.level = 25;
    p.tier = 2;
    const y = monster(g, 'zz_yielder2', 20, 10, 3);
    const r = monster(g, 'zz_runner2', 30, 10, 3);
    const b = monster(g, 'zz_brawler', 40, 10, 3);
    expect(instinct(g.world, g.content, y, p)).toBe('yield');
    expect(instinct(g.world, g.content, r, p)).toBe('flee');
    expect(instinct(g.world, g.content, b, p)).toBe('fight');
    for (const m of [y, r, b]) pull(g, m, p);
    g.step(2);
    expect(unit(g, y.id).ai?.state).toBe('yielded');
    expect(unit(g, r.id).ai?.state).toBe('flee');
    expect(unit(g, b.id).ai?.state).toBe('chase');
  });

  it('a hazard shows its area and waits the pulse-zone lead before its first pulse', () => {
    const g = makeGame({
      monsters: [
        mon('zz_seep2', {
          mechanics: {
            terrain: [
              {
                object: 'seep',
                role: 'hazard',
                offset: [-15, 0],
                size: 1,
                aura: 'zz_cold',
                every: 1,
              },
            ],
          },
        }),
      ],
    });
    toArena(g, 5, 10);
    const boss = monster(g, 'zz_seep2', 20);
    expect(
      events(g, 'combat.terrain').find((e) => e.data.bossId === 'zz_seep2')?.data.cells?.length,
    ).toBeGreaterThan(0);
    pull(g, boss, unit(g, 'player'));
    const warnedNow = () => events(g, 'combat.telegraph').find((e) => e.data.casterId === boss.id);
    for (let i = 0; i < secs(2) && !warnedNow(); i++) g.step(1);
    const warned = warnedNow();
    expect(warned?.data).toMatchObject({ kind: 'pulse' });
    expect((warned?.data.settle ?? 0) - (warned?.data.start ?? 0)).toBe(secs(1.2));
    expect(unit(g, 'player').auras.some((a) => a.id === 'zz_cold')).toBe(false);
    g.step(secs(1.2) + secs(1));
    expect(unit(g, 'player').auras.some((a) => a.id === 'zz_cold')).toBe(true);
  });

  it('content refuses a lethal or early mark, an immune shield broken by damage, a strong affix and bad action refs', () => {
    const g = makeGame();
    const content = {
      ...g.content,
      monsters: [
        mon('zz_badboss', {
          abilities: ['zz_slam', 'zz_markhit'],
          mechanics: {
            marks: [
              { kind: 'spread', ability: 'zz_slam', count: 1, radius: 2, delay: 3 },
              { kind: 'stack', ability: 'zz_markhit', count: 1, radius: 2, delay: 1 },
            ],
            shields: [{ id: 's', trigger: { atSec: 0 }, kind: 'immune', breakBy: 'damage' }],
            aoePulse: { radius: 2, every: 5, damage: { base: 100000 } },
            terrain: [
              {
                object: 'o',
                role: 'breakable',
                offset: [1, 0],
                effect: [{ do: 'cast', ability: 'zz_nothing' }],
              },
            ],
          },
        }),
      ],
    } as ContentMap;
    const p = bossMechanicProblems(content);
    expect(p).toContain('monster zz_badboss: mark zz_slam cannot be lethal (it follows)');
    expect(p).toContain('monster zz_badboss: mark zz_markhit delay 1 s under 1.5 s');
    expect(p).toContain('monster zz_badboss: immune shield s cannot break by damage');
    expect(p).toContain('monster zz_badboss: aoePulse hits lethal under a plain warning');
    expect(p).toContain('monster zz_badboss: object o casts unknown zz_nothing');
  });

  it('a monster auto-attack rolls the on-hit affixes; the regeneration modifiers bite in the tick', () => {
    const g = makeGame({
      monsters: [
        mon('zz_biter', {
          rank: 'normal',
          tier: undefined,
          family: 'beast',
          mechanics: { mortalStrike: { chance: 1 } },
        }),
      ],
    });
    toArena(g, 5, 2);
    const biter = monster(g, 'zz_biter', 20, 10, 60);
    const t = dummy(g, 'zz_t', { side: 'ally', x: 20.8, level: 1 });
    withCtx(g, (ctx) => {
      const u = unit(g, biter.id);
      u.target = t.id;
      u.autoAttack = true;
      for (let i = 0; i < 20 && !t.auras.some((a) => a.id === 'aur_mon_mortalwound'); i++) {
        u.swingAt = 0;
        t.hp = 1000;
        tickAutoAttack(ctx, u);
      }
    });
    expect(unit(g, t.id).auras.some((a) => a.id === 'aur_mon_mortalwound')).toBe(true);
    const healer = dummy(g, 'zz_heal', { side: 'ally', x: 40, classId: 'priest', level: 20 });
    const gain = (aura?: string) => {
      let d = 0;
      withCtx(g, (ctx) => {
        const u = unit(g, healer.id);
        if (aura) applyAura(ctx, u, aura, u);
        u.combatUntil = 0;
        u.manaSpentAt = -1000;
        const max = deriveStats(ctx.world, ctx.content, u);
        u.hp = 1;
        u.res.mana = 0;
        tickRegen(ctx, u);
        d = u.hp - 1 + (u.res.mana ?? 0) * 1000;
        void max;
      });
      return d;
    };
    const plain = gain();
    const spot = gain('aur_st_sed_spot');
    expect(spot).toBeLessThan(plain);
  });

  it('醉意: five layers stagger, and the drink resists presence up to 0.15', () => {
    const g = makeGame();
    toArena(g, 5, 2);
    const d = dummy(g, 'zz_drinker', { side: 'ally', x: 20 });
    withCtx(g, (ctx) => applyAura(ctx, d, 'aur_st_drunk', d, { stacks: 4 }));
    const four = deriveStats(g.world, g.content, unit(g, d.id));
    expect(four.speedMult).toBe(1);
    withCtx(g, (ctx) => applyAura(ctx, d, 'aur_st_drunk', d, { stacks: 5 }));
    const five = deriveStats(g.world, g.content, unit(g, d.id));
    expect(five.speedMult).toBeCloseTo(0.85);
    expect(five.intervalMult).toBeCloseTo(1.1);
  });
});

describe('the dungeons left-item port, the two-way cues, the act one data', () => {
  it('combat registers its drop bags as the dungeons left-item port, and a swallowed bag leaves the world', () => {
    expect(leftItemPort()).toBe(BAG_PORT);
    const g = makeGame();
    toArena(g, 5, 2);
    withCtx(g, (ctx) => {
      ctx.world.slices.combat.bags = {
        bag_1: {
          id: 'bag_1',
          ownerId: 'player',
          mapId: ARENA.id,
          x: 5,
          y: 5,
          items: [],
          money: 9,
          expires: ctx.tick + 3 * TICKS_PER_GAME_DAY,
        },
      };
    });
    const bag = g.world.slices.combat.bags?.bag_1;
    expect(BAG_PORT.items(g.world)).toEqual([
      {
        id: 'bag_1',
        mapId: ARENA.id,
        x: 5,
        y: 5,
        since: (bag?.expires ?? 0) - 3 * TICKS_PER_GAME_DAY,
      },
    ]);
    withCtx(g, (ctx) => {
      expect(BAG_PORT.swallow(ctx, 'bag_1')).toBe(true);
      expect(BAG_PORT.swallow(ctx, 'bag_1')).toBe(false);
    });
    expect(g.world.slices.combat.bags).toBeUndefined();
    expect(events(g, 'combat.bag').at(-1)?.data).toMatchObject({ bagId: 'bag_1', op: 'swallowed' });
  });

  it('两路提示: every lethal and heavy warning and every boss cast of the content has a sound cue', () => {
    const g = makeGame();
    const table = JSON.parse(
      readFileSync(join(__dirname, '..', 'data', 'audio', 'cues.json'), 'utf8'),
    ) as { cues: { id: string; event: string; when?: Record<string, unknown> }[] };
    expect(cueCoverage(g.content, table.cues)).toEqual([]);
    const silent = table.cues.filter((c) => c.event !== 'combat.telegraph');
    expect(
      cueCoverage(g.content, silent).some((p) => p.includes('heavy warning sk_mon_featherstorm')),
    ).toBe(true);
  });

  it('the act one bosses carry their library entries (10.8)', () => {
    const g = makeGame();
    const def = (id: string) => g.content.monsters.find((m) => m.id === id);
    const ability = (id: string) => g.content.abilities.find((a) => a.id === id);
    expect(ability('sk_mon_featherstorm')?.telegraph).toMatchObject({
      tier: 'heavy',
      firstHalf: true,
    });
    expect(
      def('guardian_raven')?.mechanics?.terrain?.filter((t) => t.role === 'breakable'),
    ).toHaveLength(3);
    expect(ability('sk_mon_crystalfall')?.telegraph?.shape).toMatchObject({
      kind: 'circle',
      at: 'each_member',
    });
    expect(def('crystal_mother')?.mechanics?.phases?.[0]?.onEnter).toEqual([
      { do: 'cast', ability: 'sk_mon_cavein' },
    ]);
    expect(ability('sk_mon_cavein')?.telegraph).toMatchObject({ tier: 'lethal', lead: 2 });
    expect(ability('sk_mon_ashrain')?.telegraph).toMatchObject({ tier: 'lethal', fromAbove: true });
    expect(ability('sk_mon_ashtide')?.telegraph?.shape.kind).toBe('pulse');
    expect(def('dian_colossus')?.mechanics?.doorSeek).toMatchObject({
      range: 20,
      fallbackTag: 'door_mark',
      channel: 'sk_mon_doordrain',
    });
    expect(def('dian_colossus')?.mechanics?.shields?.[0]).toMatchObject({
      kind: 'absorb',
      trigger: { phase: 1 },
    });
    expect(def('dian_colossus')?.mechanics?.berserk).toBeUndefined();
  });

  it('the guardian raven: a stone broken onto it stops it for 3 s; it still yields at 2% (the teaching fight)', () => {
    const g = makeGame();
    toArena(g, 5, 2);
    const raven = monster(g, 'guardian_raven', 20, 10, 3);
    const stones = Object.values(g.world.slices.combat.terrain ?? {}).filter(
      (t) => t.bossId === raven.id,
    );
    expect(stones).toHaveLength(3);
    pull(g, raven, unit(g, 'player'));
    withCtx(g, (ctx) => {
      const near = stones.find(
        (s) =>
          Math.hypot(s.x - (ents(g)[raven.id]?.x ?? 0), s.y - (ents(g)[raven.id]?.y ?? 0)) <= 4,
      );
      if (!near) throw new Error('no stone near the raven');
      resolveHit(ctx, {
        source: unit(g, 'player'),
        target: unit(g, near.id),
        amount: 100000,
        school: 'physical',
        kind: 'periodic',
      });
    });
    expect(unit(g, raven.id).auras.some((a) => a.id === 'aur_st_stagger')).toBe(true);
    setHpFrac(g, raven.id, 0.03);
    hurt(g, 'player', raven.id, 50);
    expect(unit(g, raven.id).ai?.state).toBe('yielded');
    expect(g.world.meta.flags['boss.guardian_raven.resolved']).toBe('yield');
  });
});
