// The combat rules of PK-M1-11 (combat_and_classes.md 20, the rows tagged M1 that this
// package owns): party experience, the hit-sound fields, aura stacking, crowd control
// (ladders, rank scaling, modifiers, immunities, breaks), dispel order, presence, the five
// death costs, difficulty, the outsider's skill rack and pools, duels, credit, pushback and
// the fiends. The harness is the kernel systems plus combat, party and doors; most rows run
// in a walled test arena with no spawns, so no map monster's presence reaches them.

import { describe, expect, it } from 'vitest';
import type { ContentPack } from '../src/content/pack';
import {
  pack as combatPack,
  monsterControlCaps,
  validateCombat,
} from '../src/content/packs/combat';
import { pack as doorsPack } from '../src/content/packs/doors';
import { pack as invPack } from '../src/content/packs/inventory';
import { pack as partyPack } from '../src/content/packs/party';
import { pack as worldPack } from '../src/content/packs/world';
import { Engine, worldHash } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import type { SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR, TICKS_PER_GAME_MINUTE } from '../src/core/time';
import {
  addUnit,
  ccModFactor,
  system as combat,
  combatMod,
  DIFFICULTY_MODS,
  groupXpBonus,
  mobXpValue,
  partySizeHpScale,
  presenceCcFactor,
  setLevel,
  skillRackSize,
  standardAmount,
} from '../src/systems/combat';
import { applyAura, dispel } from '../src/systems/combat/auras';
import { drStage } from '../src/systems/combat/control';
import { resolveHit } from '../src/systems/combat/damage';
import { spawnMonster } from '../src/systems/combat/spawning';
import { deriveStats } from '../src/systems/combat/stats';
import type { AbilityDef, AuraDef, MonsterDef, Unit } from '../src/systems/combat/types';
import { system as doors } from '../src/systems/doors';
import type { ItemDef } from '../src/systems/inventory';
import { addItem, system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { system as party } from '../src/systems/party';
import { spawnEntity, system as world } from '../src/systems/world';
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

const PACKS = [worldPack, invPack, combatPack, partyPack, doorsPack];
const SYSTEMS = [modifiers, world, inventory, combat, party, doors];

/** A walled room with nothing in it. */
const ARENA: MapDef = {
  id: 'zz_arena',
  name: '试场',
  region: 'test',
  width: 40,
  height: 10,
  rows: ['#'.repeat(40), ...Array.from({ length: 8 }, () => `#${'.'.repeat(38)}#`), '#'.repeat(40)],
  legend: { '#': 'wall', '.': 'floor' },
  locations: [],
  spawns: [],
  exits: [],
};

const COURT: MapDef = {
  id: 'inner_court',
  name: '门内庭院',
  region: 'test',
  width: 8,
  height: 6,
  rows: ['########', '#......#', '#......#', '#......#', '#......#', '########'],
  legend: { '#': 'wall', '.': 'floor' },
  locations: [{ id: 'court_respawn', name: '复苏处', kind: 'safe', x: 2, y: 2, w: 2, h: 2 }],
  spawns: [],
  exits: [],
  respawn: 'door',
};

const TEST_AURAS: AuraDef[] = [
  { id: 'zz_stun', name: 'x', kind: 'debuff', duration: 6, cc: 'stun' },
  { id: 'zz_open', name: 'x', kind: 'debuff', duration: 4, cc: 'stun', drCategory: 'stun_open' },
  { id: 'zz_incap', name: 'x', kind: 'debuff', duration: 6, cc: 'incapacitate' },
  { id: 'zz_fear', name: 'x', kind: 'debuff', duration: 6, cc: 'fear' },
  { id: 'zz_disarm', name: 'x', kind: 'debuff', duration: 6, cc: 'disarm' },
  { id: 'zz_slow30', name: 'x', kind: 'debuff', duration: 4, slow: 0.3, group: 'slow' },
  { id: 'zz_slow50', name: 'x', kind: 'debuff', duration: 2, slow: 0.5, group: 'slow' },
  { id: 'aur_zz_buff', name: 'x', kind: 'buff', duration: 10, mods: { damageDealt: 0.1 } },
  { id: 'aur_zz_setward', name: 'x', kind: 'buff', duration: 0, mods: { damageTaken: -0.05 } },
  {
    id: 'zz_ward10',
    name: 'x',
    kind: 'buff',
    duration: 4,
    mods: { damageTaken: -0.1 },
    group: 'ward',
  },
  {
    id: 'zz_ward30',
    name: 'x',
    kind: 'buff',
    duration: 2,
    mods: { damageTaken: -0.3 },
    group: 'ward',
  },
  {
    id: 'zz_cold',
    name: 'x',
    kind: 'debuff',
    duration: 8,
    slow: 0.3,
    periodic: { every: 1, damage: { base: 20 }, school: 'frost' },
  },
  {
    id: 'zz_dot',
    name: 'x',
    kind: 'debuff',
    duration: 10,
    perSource: true,
    periodic: { every: 1, damage: { base: 5 }, school: 'shadow' },
  },
  { id: 'zz_hex1', name: 'x', kind: 'debuff', duration: 30, dispelType: 'magic' },
  { id: 'zz_hex2', name: 'x', kind: 'debuff', duration: 30, dispelType: 'magic' },
  { id: 'zz_poison', name: 'x', kind: 'debuff', duration: 30, dispelType: 'poison' },
  { id: 'zz_short', name: 'x', kind: 'debuff', duration: 0, mods: { ccDurationTaken: -0.9 } },
  { id: 'zz_long', name: 'x', kind: 'buff', duration: 0, mods: { ccDurationDone: 1.5 } },
  {
    id: 'zz_drink',
    name: 'x',
    kind: 'buff',
    duration: 0,
    maxStacks: 10,
    presenceResist: { perStack: 0.03, max: 0.15 },
  },
];

const TEST_ABILITIES: AbilityDef[] = [
  {
    id: 'zz_heavy',
    name: 'x',
    desc: 'x',
    target: 'enemy',
    range: 1.2,
    heavy: true,
    gcd: false,
    effects: [{ type: 'damage', weapon: 1 }],
  },
  {
    id: 'zz_bolt',
    name: 'x',
    desc: 'x',
    school: 'arcane',
    target: 'enemy',
    range: 10,
    castTime: 2.5,
    effects: [{ type: 'damage', school: 'arcane', amount: { base: 5 } }],
  },
  {
    id: 'zz_wall',
    name: 'x',
    desc: 'x',
    school: 'shadow',
    target: 'enemy',
    range: 10,
    castTime: 3,
    uninterruptible: true,
    effects: [{ type: 'damage', school: 'shadow', amount: { base: 5 } }],
  },
  {
    id: 'zz_kick',
    name: 'x',
    desc: 'x',
    target: 'enemy',
    range: 30,
    gcd: false,
    effects: [{ type: 'interrupt', lockout: 4 }],
  },
  {
    id: 'zz_rage',
    name: 'x',
    desc: 'x',
    target: 'enemy',
    range: 30,
    resource: 'rage',
    cost: 10,
    gcd: false,
    effects: [{ type: 'damage', amount: { base: 1 } }],
  },
  {
    id: 'zz_mana',
    name: 'x',
    desc: 'x',
    target: 'enemy',
    range: 30,
    resource: 'mana',
    cost: 10,
    gcd: false,
    effects: [{ type: 'damage', school: 'arcane', amount: { base: 1 } }],
  },
];

const TEST_ITEMS = [
  {
    id: 'zz_sword',
    name: 'x',
    kind: 'weapon',
    quality: 1,
    value: 1,
    desc: 'x',
    slot: 'main_hand',
    weapon: { min: 5, max: 5, speed: 2, range: 1.2 },
    weaponClass: 'sword',
  },
  {
    id: 'zz_plate',
    name: 'x',
    kind: 'armor',
    quality: 1,
    value: 1,
    desc: 'x',
    slot: 'chest',
    armorClass: 'plate',
  },
  { id: 'zz_herb', name: 'x', kind: 'material', quality: 1, value: 1, desc: 'x', stack: 99 },
  {
    id: 'zz_charm',
    name: 'x',
    kind: 'trinket',
    quality: 2,
    value: 1,
    desc: 'x',
    slot: 'trinket',
    set: 'zz_set',
    procs: [
      { on: 'low_hp', chance: 1, do: 'aura:ember_door@self' },
      { on: 'combat_start', chance: 1, when: 'solo', do: 'aura:zz_buff@self' },
    ],
  },
  {
    id: 'zz_bandage',
    name: 'x',
    kind: 'consumable',
    quality: 1,
    value: 1,
    desc: 'x',
    use: { effect: 'heal', amount: 10, group: 'cd_bandage' },
  },
  {
    id: 'zz_potion',
    name: 'x',
    kind: 'consumable',
    quality: 1,
    value: 1,
    desc: 'x',
    use: { effect: 'heal', amount: 10, group: 'cd_potion' },
  },
  {
    id: 'zz_elixir',
    name: 'x',
    kind: 'consumable',
    quality: 1,
    value: 1,
    desc: 'x',
    use: { effect: 'aura', ability: 'aur_zz_buff', group: 'cd_elixir_battle' },
  },
  {
    id: 'zz_tool',
    name: 'x',
    kind: 'material',
    quality: 1,
    value: 1,
    desc: 'x',
    stack: 20,
    durability: 30,
  },
  {
    id: 'zz_axe',
    name: 'x',
    kind: 'weapon',
    quality: 2,
    value: 1,
    desc: 'x',
    slot: 'main_hand',
    weapon: { min: 5, max: 5, speed: 2, range: 1.2 },
    weaponClass: 'axe',
    durability: 50,
  },
] as unknown as ItemDef[];

function makeGame(seed = 7): Engine {
  const content = merge(PACKS);
  // one goddess whose believers carry the `priest` tag (witnesses of a death, 15.1)
  (content as unknown as { goddesses: unknown[] }).goddesses = [
    { id: 'zz_goddess', faithTags: ['priest'] },
  ];
  content.maps = [...content.maps, ARENA, COURT];
  content.auras = [...content.auras, ...TEST_AURAS];
  content.abilities = [...content.abilities, ...TEST_ABILITIES];
  content.items = [...content.items, ...TEST_ITEMS];
  (content as unknown as { itemSets: unknown[] }).itemSets = [
    ...((content as unknown as { itemSets?: unknown[] }).itemSets ?? []),
    { id: 'zz_set', name: 'x', bonuses: [{ pieces: 1, aura: 'zz_setward' }] },
  ];
  return Engine.create(seed, content, SYSTEMS);
}

function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe = { id: 'zz_probe', order: 999, tick: (ctx: SystemContext) => fn(ctx) };
  const engine = Engine.resume(g.world, g.content, [...g.systems, probe]);
  engine.step(1);
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

/** A combat unit on an inert entity (no brain of any system), placed in the arena. */
function dummy(
  g: Engine,
  id: string,
  spec: {
    classId?: string;
    level: number;
    side: Unit['side'];
    x: number;
    y?: number;
    kind?: 'object' | 'companion';
    tags?: string[];
  },
): Unit {
  withCtx(g, (ctx) => {
    spawnEntity(ctx, {
      id,
      kind: spec.kind ?? 'object',
      name: id,
      mapId: ARENA.id,
      x: spec.x,
      y: spec.y ?? 5,
      faction: 'test',
      appearance: { base: 'human', colors: ['#000000', '#000000', '#000000', '#000000'] },
      tags: spec.tags ?? [],
    });
    addUnit(ctx, id, { classId: spec.classId ?? 'warrior', level: spec.level, side: spec.side });
  });
  return unit(g, id);
}

/** A monster in the arena; returns its unit. */
function monster(g: Engine, monsterId: string, level: number, x: number, y = 5): Unit {
  let made: Unit | undefined;
  withCtx(g, (ctx) => {
    made = spawnMonster(ctx, monsterId, ARENA.id, x, y, { level });
  });
  if (!made) throw new Error(`spawn failed: ${monsterId}`);
  return made;
}

function toArena(g: Engine, x = 5, y = 5): void {
  g.queue('world.teleport', { entityId: 'player', mapId: ARENA.id, x, y });
  g.step(1);
}

/** Apply an aura from `source` to `target` now; returns the duration in ticks (or null). */
function laid(g: Engine, target: string, auraId: string, source: string): number | null {
  let ticks: number | null = null;
  withCtx(g, (ctx) => {
    const t = unit(g, target);
    if (!applyAura(ctx, t, auraId, unit(g, source))) return;
    const a = t.auras.find((x) => x.id === auraId);
    ticks = a ? a.expires - ctx.tick : null;
  });
  return ticks;
}

function kill(g: Engine, attacker: string, victim: string): void {
  withCtx(g, (ctx) => {
    const v = unit(g, victim);
    v.hp = 1;
    resolveHit(ctx, {
      source: unit(g, attacker),
      target: v,
      amount: 50,
      school: 'shadow',
      kind: 'periodic',
    });
  });
}

// ---------------------------------------------------------------------------

describe('20 组队: party experience (8.5)', () => {
  function killWith(companions: number): { player: number; comps: number[] } {
    const g = makeGame();
    toArena(g);
    withCtx(g, (ctx) => setLevel(ctx, unit(g, 'player'), 5));
    for (let i = 0; i < companions; i++)
      dummy(g, `zz_comp_${i}`, { level: 4, side: 'ally', x: 4, y: 3 + i, kind: 'companion' });
    const mob = monster(g, 'oneeye_bandit', 5, 7);
    const before = unit(g, 'player').xp;
    kill(g, 'player', mob.id);
    return {
      player: unit(g, 'player').xp - before,
      comps: Array.from({ length: companions }, (_, i) => unit(g, `zz_comp_${i}`).xp),
    };
  }

  it('玩家不摊薄 and 同伴另算: three companions change nothing for the player', () => {
    const solo = killWith(0);
    const four = killWith(3);
    expect(solo.player).toBe(mobXpValue(5, 5));
    expect(four.player).toBe(solo.player);
    const each = Math.round((mobXpValue(5, 4) * groupXpBonus(4)) / 3);
    expect(four.comps).toEqual([each, each, each]);
  });

  it('不给经验: an add a boss called gives nobody experience', () => {
    const g = makeGame();
    toArena(g);
    let add: Unit | undefined;
    withCtx(g, (ctx) => {
      add = spawnMonster(ctx, 'oneeye_bandit', ARENA.id, 7, 5, { level: 1, summonerId: 'zz_boss' });
    });
    if (!add) throw new Error('no add');
    const before = unit(g, 'player').xp;
    kill(g, 'player', add.id);
    expect(events(g, 'combat.kill').some((e) => e.data.victimId === add?.id)).toBe(true);
    expect(unit(g, 'player').xp).toBe(before);
  });

  it('落后补正: x1.5 in act 2 at level 13, never in act 1', () => {
    const gain = (act: string) => {
      const g = makeGame();
      g.queue('flag.set', { key: 'act', value: act });
      toArena(g);
      withCtx(g, (ctx) => setLevel(ctx, unit(g, 'player'), 13));
      const mob = monster(g, 'oneeye_bandit', 13, 7);
      kill(g, 'player', mob.id);
      return unit(g, 'player').xp;
    };
    expect(gain('act1')).toBe(mobXpValue(13, 13));
    expect(gain('act2')).toBe(Math.round(mobXpValue(13, 13) * 1.5));
  });

  it('credit: a kill by companions alone counts for the party', () => {
    const g = makeGame();
    toArena(g);
    const comp = dummy(g, 'zz_comp', { level: 1, side: 'ally', x: 6, kind: 'companion' });
    const mob = monster(g, 'oneeye_bandit', 1, 8);
    const before = unit(g, 'player').xp;
    kill(g, comp.id, mob.id);
    expect(unit(g, 'player').xp).toBe(before + mobXpValue(1, 1));
  });

  it('credit: town guards alone earn the party nothing; 10% from the party earns it all', () => {
    const g = makeGame();
    toArena(g);
    const guard = dummy(g, 'zz_guard', { level: 30, side: 'ally', x: 20 });
    const a = monster(g, 'oneeye_bandit', 1, 22);
    const before = unit(g, 'player').xp;
    kill(g, guard.id, a.id);
    expect(unit(g, 'player').xp).toBe(before);
    // the player deals a tenth first, then the guard finishes it
    const b = monster(g, 'oneeye_bandit', 1, 24);
    const max = deriveStats(g.world, g.content, b).maxHp;
    b.partyDamage = Math.ceil(max * 0.1);
    kill(g, guard.id, b.id);
    expect(unit(g, 'player').xp).toBeGreaterThan(before);
  });
});

describe('20 命中事件: hit-sound selection fields (8.3)', () => {
  it('a sword on plate is sword, slash, plate; a miss carries the same fields', () => {
    const g = makeGame();
    toArena(g);
    const foe = dummy(g, 'zz_knight', { level: 3, side: 'enemy', x: 6 });
    withCtx(g, (ctx) => {
      const inv = ctx.world.slices.inventory.owners as Record<string, unknown>;
      inv.player = { money: 0, items: { zz_sword: 1 }, equipped: { main_hand: 'zz_sword' } };
      inv.zz_knight = { money: 0, items: { zz_plate: 1 }, equipped: { chest: 'zz_plate' } };
    });
    const hits: AnyWorldEvent[] = [];
    for (let i = 0; i < 40; i++) {
      withCtx(g, (ctx) => {
        foe.hp = 1000;
        resolveHit(ctx, {
          source: unit(g, 'player'),
          target: foe,
          amount: 3,
          school: 'physical',
          kind: 'melee',
        });
      });
      hits.push(...events(g, 'combat.damage').filter((e) => e.data.sourceId === 'player'));
    }
    const data = [...new Map(hits.map((e) => [e.seq, e.data as Record<string, unknown>])).values()];
    expect(data.length).toBeGreaterThan(10);
    for (const d of data)
      expect(d).toMatchObject({
        weaponClass: 'sword',
        damageKind: 'slash',
        material: 'plate',
        heavy: false,
        ranged: false,
      });
    expect(
      data.some((d) => d.outcome === 'miss' || d.outcome === 'dodge' || d.outcome === 'parry'),
    ).toBe(true);
  });

  it('a disarmed hand is unarmed; a heavy ability hits heavy', () => {
    const g = makeGame();
    toArena(g);
    const foe = dummy(g, 'zz_target', { level: 1, side: 'enemy', x: 6 });
    withCtx(g, (ctx) => {
      const inv = ctx.world.slices.inventory.owners as Record<string, unknown>;
      inv.player = { money: 0, items: { zz_sword: 1 }, equipped: { main_hand: 'zz_sword' } };
      ctx.world.slices.combat.units.player?.abilities.push('zz_heavy');
      const p = unit(g, 'player');
      p.rack = [...(p.rack ?? []), 'zz_heavy'];
    });
    laid(g, 'player', 'zz_disarm', foe.id);
    withCtx(g, (ctx) => {
      resolveHit(ctx, {
        source: unit(g, 'player'),
        target: foe,
        amount: 3,
        school: 'physical',
        kind: 'melee',
      });
    });
    expect(events(g, 'combat.damage').at(-1)?.data).toMatchObject({
      weaponClass: 'unarmed',
      damageKind: 'blunt',
    });
    // disarmed, the weapon strike is refused; once the disarm is gone it lands heavy
    g.queue('combat.cast', { abilityId: 'zz_heavy', targetId: foe.id });
    g.step(1);
    expect(events(g, 'command.result').at(-1)?.data).toMatchObject({ ok: false, code: 'disarmed' });
    withCtx(g, (ctx) => {
      unit(g, 'player').auras = unit(g, 'player').auras.filter((a) => a.id !== 'zz_disarm');
      void ctx;
    });
    g.queue('combat.cast', { abilityId: 'zz_heavy', targetId: foe.id });
    g.step(1);
    const blow = events(g, 'combat.damage')
      .filter((e) => e.data.abilityId === 'zz_heavy')
      .at(-1);
    expect(blow?.data).toMatchObject({ heavy: true, weaponClass: 'sword' });
  });
});

describe('20 光环: per-source dots and one strongest per group (8.2)', () => {
  it('按施加者: two casters keep two copies of a per-source dot, each ticking', () => {
    const g = makeGame();
    const a = dummy(g, 'zz_a', { level: 5, side: 'ally', x: 3 });
    const b = dummy(g, 'zz_b', { level: 5, side: 'ally', x: 4 });
    const t = dummy(g, 'zz_t', { level: 5, side: 'enemy', x: 30 });
    laid(g, t.id, 'zz_dot', a.id);
    laid(g, t.id, 'zz_dot', b.id);
    expect(
      t.auras
        .filter((x) => x.id === 'zz_dot')
        .map((x) => x.sourceId)
        .sort(),
    ).toEqual(['zz_a', 'zz_b']);
    g.step(45);
    const ticks = events(g, 'combat.damage').filter(
      (e) => e.data.targetId === t.id && e.data.abilityId === 'zz_dot',
    );
    expect(ticks.some((e) => e.data.sourceId === 'zz_a')).toBe(true);
    expect(ticks.some((e) => e.data.sourceId === 'zz_b')).toBe(true);
  });

  it('同组取最强: 30% then 50% gives 50%; once the 50% runs out the 30% is back', () => {
    const g = makeGame();
    const s = dummy(g, 'zz_s', { level: 5, side: 'ally', x: 3 });
    const t = dummy(g, 'zz_t', { level: 5, side: 'enemy', x: 30 });
    laid(g, t.id, 'zz_slow30', s.id);
    laid(g, t.id, 'zz_slow50', s.id);
    expect(deriveStats(g.world, g.content, t).speedMult).toBeCloseTo(0.5, 6);
    g.step(45);
    expect(t.auras.map((a) => a.id)).toEqual(['zz_slow30']);
    expect(deriveStats(g.world, g.content, t).speedMult).toBeCloseTo(0.7, 6);
  });

  it('同组取最强 with modifiers: -10% and -30% of one group give -30%, then -10% again', () => {
    const g = makeGame();
    const t = dummy(g, 'zz_t', { level: 5, side: 'ally', x: 30 });
    laid(g, t.id, 'zz_ward10', t.id);
    laid(g, t.id, 'zz_ward30', t.id);
    expect(deriveStats(g.world, g.content, t).mods.damageTaken).toBeCloseTo(-0.3, 6);
    g.step(45);
    expect(t.auras.map((a) => a.id)).toEqual(['zz_ward10']);
    expect(deriveStats(g.world, g.content, t).mods.damageTaken).toBeCloseTo(-0.1, 6);
  });
});

describe('20 控制: crowd control (9.1 to 9.3, 9.7)', () => {
  it('时长上限: the content check refuses a monster stun over 3 seconds', () => {
    const content = merge(PACKS);
    expect(monsterControlCaps(content)).toEqual([]);
    content.auras = [
      ...content.auras,
      { id: 'zz_long_stun', name: 'x', kind: 'debuff', duration: 4, cc: 'stun' },
    ];
    content.abilities = [
      ...content.abilities,
      {
        id: 'zz_bash',
        name: 'x',
        desc: 'x',
        target: 'enemy',
        effects: [{ type: 'aura', aura: 'zz_long_stun' }],
      },
    ];
    const mon = content.monsters.find((m) => m.id === 'oneeye_bandit') as MonsterDef;
    content.monsters = [...content.monsters, { ...mon, id: 'zz_basher', abilities: ['zz_bash'] }];
    expect(validateCombat(content).join('\n')).toContain('zz_basher');
    expect(monsterControlCaps(content)[0]).toContain('over the 3 s cap');
  });

  it('递减阶梯: four active stuns in 18 seconds are full, half, quarter, immune; then full again', () => {
    const g = makeGame();
    const s = dummy(g, 'zz_s', { level: 1, side: 'enemy', x: 3 });
    toArena(g, 30);
    const got: (number | null)[] = [];
    for (let i = 0; i < 4; i++) got.push(laid(g, 'player', 'zz_stun', s.id));
    expect(got).toEqual([120, 60, 30, null]);
    expect(events(g, 'combat.aura').at(-1)?.data).toMatchObject({ op: 'resisted', reason: 'dr' });
    expect(drStage(unit(g, 'player'), 'stun_ctrl', g.world.meta.tick)).toBe(3);
    g.step(18 * 20 + 1);
    expect(laid(g, 'player', 'zz_stun', s.id)).toBe(120);
  });

  it('类别独立: an opener stun leaves the active-stun ladder at full', () => {
    const g = makeGame();
    const s = dummy(g, 'zz_s', { level: 1, side: 'enemy', x: 3 });
    toArena(g, 30);
    expect(laid(g, 'player', 'zz_open', s.id)).toBe(80);
    expect(laid(g, 'player', 'zz_stun', s.id)).toBe(120);
  });

  it('谁递减: a normal monster takes four full stuns, an elite climbs the ladder', () => {
    const g = makeGame();
    const s = dummy(g, 'zz_s', { level: 5, side: 'ally', x: 3 });
    // a beast: people (humanoid with a race) climb the ladders like every person
    const normal = monster(g, 'grey_wolf', 5, 30, 3);
    const elite = monster(g, 'vero', 5, 30, 7);
    expect([0, 1, 2, 3].map(() => laid(g, normal.id, 'zz_stun', s.id))).toEqual([
      120, 120, 120, 120,
    ]);
    expect([0, 1, 2, 3].map(() => laid(g, elite.id, 'zz_stun', s.id))).toEqual([120, 60, 30, null]);
  });

  it('位阶缩放: 6 s on a target two ranks up is 3.9 s; from two ranks up it is 8.1 s', () => {
    expect(presenceCcFactor(0, 2) * 6).toBeCloseTo(3.9, 6);
    expect(presenceCcFactor(2, 0) * 6).toBeCloseTo(8.1, 6);
    const g = makeGame();
    const low = dummy(g, 'zz_low', { level: 1, side: 'ally', x: 3 });
    const high = dummy(g, 'zz_high', { level: 25, side: 'enemy', x: 30 });
    expect(laid(g, high.id, 'zz_stun', low.id)).toBe(Math.round(120 * 0.65));
    expect(laid(g, low.id, 'zz_stun', high.id)).toBe(Math.round(120 * 1.35));
  });

  it('修正范围: duration modifiers stop at -75% and +100%', () => {
    expect(ccModFactor(-0.9)).toBeCloseTo(0.25, 6);
    expect(ccModFactor(1.5)).toBeCloseTo(2, 6);
    const g = makeGame();
    const s = dummy(g, 'zz_s', { level: 1, side: 'ally', x: 3 });
    const t = dummy(g, 'zz_t', { level: 1, side: 'enemy', x: 30 });
    laid(g, t.id, 'zz_short', t.id);
    expect(laid(g, t.id, 'zz_stun', s.id)).toBe(30);
    const g2 = makeGame();
    const s2 = dummy(g2, 'zz_s', { level: 1, side: 'ally', x: 3 });
    const t2 = dummy(g2, 'zz_t', { level: 1, side: 'enemy', x: 30 });
    laid(g2, s2.id, 'zz_long', s2.id);
    expect(laid(g2, t2.id, 'zz_stun', s2.id)).toBe(240);
  });

  it('首领免疫: a lair lord is slowed but not stunned; a dungeon lord not slowed; both interruptible', () => {
    const g = makeGame();
    const s = dummy(g, 'zz_s', { level: 12, side: 'ally', x: 3 });
    const lair = monster(g, 'seg_oneeye', 12, 30, 3);
    const dungeon = monster(g, 'rat_king', 12, 30, 7);
    expect(laid(g, lair.id, 'zz_slow30', s.id)).not.toBeNull();
    expect(laid(g, lair.id, 'zz_stun', s.id)).toBeNull();
    expect(events(g, 'combat.aura').at(-1)?.data).toMatchObject({
      op: 'resisted',
      reason: 'immune',
    });
    expect(laid(g, dungeon.id, 'zz_slow30', s.id)).toBeNull();
    // both casts break on an interrupt; an uninterruptible cast does not
    const castAt = (b: Unit, abilityId: string, tick: number) => {
      const e = ents(g)[b.id];
      b.cast = {
        abilityId,
        targetId: s.id,
        start: tick,
        end: tick + 50,
        x: e?.x ?? 0,
        y: e?.y ?? 0,
      };
    };
    withCtx(g, (ctx) => {
      unit(g, s.id).abilities.push('zz_kick');
      for (const b of [lair, dungeon]) castAt(b, 'zz_bolt', ctx.tick);
    });
    for (const b of [lair, dungeon]) {
      g.queue(
        'combat.cast',
        { entityId: s.id, abilityId: 'zz_kick', targetId: b.id },
        { type: 'system', system: 'test' },
      );
      g.step(1);
      expect(b.cast).toBeNull();
    }
    expect(events(g, 'combat.cast').filter((e) => e.data.op === 'interrupted').length).toBe(2);
    expect(lair.auras.some((a) => a.id === 'aur_mon_schoollock')).toBe(true);
    expect(dungeon.auras.some((a) => a.id === 'aur_mon_schoollock')).toBe(true);
    withCtx(g, (ctx) => castAt(lair, 'zz_wall', ctx.tick));
    g.queue(
      'combat.cast',
      { entityId: s.id, abilityId: 'zz_kick', targetId: lair.id },
      { type: 'system', system: 'test' },
    );
    g.step(1);
    expect(lair.cast?.abilityId).toBe('zz_wall');
  });

  it('破除: 1 damage wakes the incapacitated; a tenth of max health breaks a fear', () => {
    const g = makeGame();
    const s = dummy(g, 'zz_s', { level: 5, side: 'ally', x: 3 });
    const t = dummy(g, 'zz_t', { level: 5, side: 'enemy', x: 30 });
    laid(g, t.id, 'zz_incap', s.id);
    withCtx(g, (ctx) => {
      resolveHit(ctx, { source: s, target: t, amount: 1, school: 'shadow', kind: 'periodic' });
    });
    expect(t.auras.some((a) => a.id === 'zz_incap')).toBe(false);
    laid(g, t.id, 'zz_fear', s.id);
    const max = deriveStats(g.world, g.content, t).maxHp;
    withCtx(g, (ctx) => {
      resolveHit(ctx, {
        source: s,
        target: t,
        amount: Math.ceil(max * 0.1),
        school: 'shadow',
        kind: 'periodic',
      });
    });
    expect(t.auras.some((a) => a.id === 'zz_fear')).toBe(false);
    // a twentieth of max health: an even chance per hit, drawn on combat.proc
    let broke = 0;
    for (let i = 0; i < 30; i++) {
      laid(g, t.id, 'zz_fear', s.id);
      withCtx(g, (ctx) => {
        t.hp = max;
        resolveHit(ctx, {
          source: s,
          target: t,
          amount: Math.round(max * 0.05),
          school: 'shadow',
          kind: 'periodic',
        });
      });
      if (!t.auras.some((a) => a.id === 'zz_fear')) broke++;
      g.step(20 * 19);
    }
    expect(broke).toBeGreaterThan(5);
    expect(broke).toBeLessThan(25);
  });

  it('a slow-immune lord still takes the cold of a blizzard; the tutorial raven takes control', () => {
    const g = makeGame();
    const s = dummy(g, 'zz_s', { level: 14, side: 'ally', x: 3 });
    const lord = monster(g, 'rat_king', 14, 30, 3);
    expect(laid(g, lord.id, 'zz_cold', s.id)).not.toBeNull();
    expect(
      events(g, 'combat.aura')
        .filter((e) => e.data.op === 'resisted')
        .at(-1)?.data,
    ).toMatchObject({
      targetId: lord.id,
      reason: 'immune',
    });
    expect(deriveStats(g.world, g.content, lord).speedMult).toBe(1);
    g.step(25);
    expect(
      events(g, 'combat.damage').some(
        (e) => e.data.targetId === lord.id && e.data.abilityId === 'zz_cold',
      ),
    ).toBe(true);
    // the tutorial boss (9.3): every control lands and climbs the ladder (one rank down: x1.15)
    const raven = monster(g, 'guardian_raven', 3, 30, 7);
    expect(s.tier - raven.tier).toBe(1);
    expect([0, 1, 2, 3].map(() => laid(g, raven.id, 'zz_stun', s.id))).toEqual([
      Math.round(120 * 1.15),
      Math.round(60 * 1.15),
      Math.round(30 * 1.15),
      null,
    ]);
    expect(raven.auras.find((a) => a.id === 'zz_stun')?.dr).toBe(2);
  });
});

describe('20 驱散: the newest first (9.5)', () => {
  it('two magic debuffs: one dispel takes the one applied last; categories filter', () => {
    const g = makeGame();
    const s = dummy(g, 'zz_s', { level: 5, side: 'enemy', x: 3 });
    const t = dummy(g, 'zz_t', { level: 5, side: 'ally', x: 30 });
    laid(g, t.id, 'zz_hex1', s.id);
    laid(g, t.id, 'zz_poison', s.id);
    laid(g, t.id, 'zz_hex2', s.id);
    withCtx(g, (ctx) => dispel(ctx, t, 'debuff', 1, ['magic']));
    expect(t.auras.map((a) => a.id).sort()).toEqual(['zz_hex1', 'zz_poison']);
    withCtx(g, (ctx) => dispel(ctx, t, 'debuff', 1, ['magic']));
    expect(t.auras.map((a) => a.id)).toEqual(['zz_poison']);
  });
});

describe('20 威压: rank pressure and its field (3.5)', () => {
  it('威压缺省: an unwritten presence presses within 6 tiles; one rank down is uneasy', () => {
    const g = makeGame();
    toArena(g, 5);
    dummy(g, 'zz_high', { level: 10, side: 'enemy', x: 10.5 });
    g.step(25);
    expect(unit(g, 'player').auras.some((a) => a.id === 'aur_st_presence_unease')).toBe(true);
    const g2 = makeGame();
    toArena(g2, 5);
    dummy(g2, 'zz_high', { level: 10, side: 'enemy', x: 12.5 });
    const [p, h] = [ents(g2).player, ents(g2).zz_high];
    expect(Math.hypot((p?.x ?? 0) - (h?.x ?? 0), (p?.y ?? 0) - (h?.y ?? 0))).toBeGreaterThan(6);
    g2.step(25);
    expect(unit(g2, 'player').auras.some((a) => a.id === 'aur_st_presence_unease')).toBe(false);
  });

  it('新表: three ranks up strike for 3 seconds on the first entry, once per encounter', () => {
    const g = makeGame();
    toArena(g, 3);
    const low = monster(g, 'grey_wolf', 1, 30, 3);
    const high = dummy(g, 'zz_high', { level: 40, side: 'neutral', x: 30, y: 7 });
    expect(high.tier - low.tier).toBe(3);
    g.step(25);
    const stun = low.auras.find((a) => a.id === 'aur_st_presence_paralysis');
    expect(stun).toBeDefined();
    const felt = events(g, 'combat.aura').find(
      (e) => e.data.targetId === low.id && e.data.auraId === 'aur_st_presence_paralysis',
    );
    expect(felt).toBeDefined();
    // a beast has no spirit and no ally beside it: the full 3 seconds
    expect((stun?.expires ?? 0) - (felt?.tick ?? 0)).toBe(60);
    g.step(20 * 6);
    const again = events(g, 'combat.aura').filter(
      (e) =>
        e.data.targetId === low.id &&
        e.data.auraId === 'aur_st_presence_paralysis' &&
        e.data.op === 'applied',
    );
    expect(again.length).toBe(1);
    expect(low.auras.some((a) => a.id === 'aur_st_presence_pressure')).toBe(true);
  });

  it('resistance: five stacks of drink give 0.15; will gives up to 0.15', () => {
    const g = makeGame();
    toArena(g, 3);
    const t = unit(g, 'player');
    withCtx(g, (ctx) => {
      for (let i = 0; i < 6; i++) applyAura(ctx, t, 'zz_drink', t);
    });
    // spirit 20 at level 1 gives the full will share; drink adds its capped 0.15
    const near = dummy(g, 'zz_high', { level: 20, side: 'enemy', x: 6 });
    g.step(25);
    const press = t.auras.find((a) => a.id === 'aur_st_presence_pressure');
    expect(near.tier - t.tier).toBe(2);
    expect(press?.scale).toBeCloseTo(1 - 0.3, 6);
  });
});

describe('20 死亡: the five death costs (15.1)', () => {
  function die(g: Engine): void {
    const u = unit(g, 'player');
    const foe = dummy(g, `zz_killer_${g.world.meta.tick}`, { level: 1, side: 'enemy', x: 30 });
    withCtx(g, (ctx) => {
      u.hp = 1;
      resolveHit(ctx, { source: foe, target: u, amount: 50, school: 'shadow', kind: 'periodic' });
    });
  }
  function back(g: Engine): AnyWorldEvent | undefined {
    const n = events(g, 'combat.player_returned').length;
    for (let i = 0; i < 4000 && events(g, 'combat.player_returned').length === n; i++) g.step(1);
    return events(g, 'combat.player_returned').at(-1);
  }

  it('五项代价: fatigue floor 60, the state for 2 + rank/10 hours, the bag, the wear, witnesses', () => {
    const g = makeGame();
    g.queue('flag.set', { key: 'door_rank', value: 45 });
    toArena(g, 5);
    dummy(g, 'zz_priest', { level: 1, side: 'neutral', x: 8, tags: ['priest'] });
    withCtx(g, (ctx) => {
      const inv = ctx.world.slices.inventory.owners as Record<string, unknown>;
      inv.player = {
        money: 1000,
        items: { zz_herb: 10, zz_sword: 1 },
        equipped: { main_hand: 'zz_sword' },
      };
    });
    die(g);
    const bag = events(g, 'combat.bag').at(-1)?.data;
    expect(bag).toMatchObject({
      op: 'dropped',
      items: [{ itemId: 'zz_herb', count: 2 }],
      money: 100,
    });
    expect(events(g, 'feat.performed').at(-1)?.data).toMatchObject({
      kind: 'door_return',
      actorId: 'player',
    });
    expect(ents(g).player?.alive).toBe(false);
    const ret = back(g);
    expect(ret?.data).toMatchObject({
      overload: 0,
      moneyLost: 100,
      fatigueMinutes: 6 * 60,
      fatigueFloor: 60,
      witnessed: 1,
      revivalTicks: TICKS_PER_GAME_HOUR,
      packId: bag?.bagId,
    });
    expect(g.world.meta.flags.door_fatigue).toBeGreaterThanOrEqual(60);
    const state = unit(g, 'player').auras.find((a) => a.id === 'aur_st_revival_fatigue');
    expect((state?.expires ?? 0) - g.world.meta.tick).toBeGreaterThan(6 * TICKS_PER_GAME_HOUR - 30);
    // the state: damage and healing -30%, max health -20%, door skills x1.5 (15.1)
    const d = deriveStats(g.world, g.content, unit(g, 'player'));
    expect(d.mods).toMatchObject({
      damageDealt: -0.3,
      healingDone: -0.3,
      maxHpPct: -0.2,
      doorSkillCost: 0.5,
    });
    // the equipped sword never falls into the bag; its wear is the inventory's port
    const holding = g.world.slices.inventory.owners.player as unknown as {
      items: Record<string, number>;
    };
    expect(holding.items.zz_herb).toBe(8);
    // walking back to the bag reclaims it
    g.queue('world.teleport', { entityId: 'player', mapId: ARENA.id, x: 5, y: 5 });
    g.step(25);
    expect(events(g, 'combat.bag').at(-1)?.data).toMatchObject({ op: 'reclaimed' });
    expect(
      (g.world.slices.inventory.owners.player as unknown as { items: Record<string, number> }).items
        .zz_herb,
    ).toBe(10);
  });

  it('过载: the fourth death in a game day has 3 stacks, x2.5 fatigue, +9 blockage', () => {
    const g = makeGame();
    toArena(g, 5);
    let blockage = 0;
    let ret: AnyWorldEvent | undefined;
    for (let i = 0; i < 4; i++) {
      blockage = Number(g.world.meta.flags.blockage ?? 0);
      die(g);
      ret = back(g);
      g.queue('world.teleport', { entityId: 'player', mapId: ARENA.id, x: 5, y: 5 });
      g.step(1);
    }
    expect(ret?.data).toMatchObject({ overload: 3, fatigueMinutes: Math.round(120 * 2.5) });
    expect(Number(g.world.meta.flags.blockage ?? 0) - blockage).toBe(9);
  });

  it('复苏地点: the sigil hall while the court is closed, the court once open', () => {
    const g = makeGame();
    toArena(g, 5);
    die(g);
    expect(back(g)?.data).toMatchObject({ toMap: 'seal_ruins', innerCourt: false });
    const g2 = makeGame();
    g2.queue('flag.set', { key: 'feature.inner_court', value: true });
    toArena(g2, 5);
    die(g2);
    expect(back(g2)?.data).toMatchObject({ toMap: 'inner_court', innerCourt: true });
  });

  it('结算顺序: the same seed settles two deaths into the same events and the same world', () => {
    const run = () => {
      const g = makeGame(11);
      toArena(g, 5);
      withCtx(g, (ctx) => {
        const inv = ctx.world.slices.inventory.owners as Record<string, unknown>;
        inv.player = { money: 777, items: { zz_herb: 13 }, equipped: {} };
      });
      die(g);
      back(g);
      die(g);
      back(g);
      const seq = g.world.recent
        .filter((e) => e.kind.startsWith('combat.') || e.kind === 'entity.died')
        .map((e) => `${e.tick}:${e.kind}`);
      return { seq, hash: worldHash(g.world) };
    };
    const a = run();
    const b = run();
    expect(a.seq).toEqual(b.seq);
    expect(a.hash).toBe(b.hash);
  });
});

describe('20 难度: the four levels as registered modifiers (16)', () => {
  it('修正项: every item a registered modifier; legend locked after the start; story floor 30', () => {
    const g = makeGame();
    g.queue('flag.set', { key: 'difficulty', value: 'story' });
    g.step(1);
    const regs = events(g, 'modifier.registered').filter((e) => e.data.source === 'difficulty');
    expect(regs.map((e) => e.data.key).sort()).toEqual(
      [
        'companion_react',
        'death_fatigue',
        'death_money',
        'enemy_damage',
        'player_healing_taken',
        'second_down_injury',
        'soft_enrage',
        'telegraph_lead',
      ].sort(),
    );
    expect(combatMod(g.world, 'enemy_damage')).toBeCloseTo(0.7, 6);
    expect(combatMod(g.world, 'player_healing_taken')).toBeCloseTo(1.2, 6);
    expect(combatMod(g.world, 'death_money')).toBeCloseTo(0, 6);
    expect(combatMod(g.world, 'companion_react')).toBeCloseTo(0.3, 6);
    expect(combatMod(g.world, 'second_down_injury')).toBe(0);
    // story: the death fatigue floor is 30 (and no money falls)
    toArena(g, 5);
    const foe = dummy(g, 'zz_killer', { level: 1, side: 'enemy', x: 30 });
    withCtx(g, (ctx) => {
      unit(g, 'player').hp = 1;
      resolveHit(ctx, {
        source: foe,
        target: unit(g, 'player'),
        amount: 50,
        school: 'shadow',
        kind: 'periodic',
      });
    });
    for (let i = 0; i < 4000 && events(g, 'combat.player_returned').length === 0; i++) g.step(1);
    expect(events(g, 'combat.player_returned').at(-1)?.data).toMatchObject({
      fatigueFloor: 30,
      fatigueMinutes: 60,
    });
    expect(g.world.meta.flags.door_fatigue).toBe(30);
    // switching between story, standard and hard out of combat is free
    g.queue('flag.set', { key: 'difficulty', value: 'hard' });
    g.step(1);
    expect(g.world.meta.flags.difficulty).toBe('hard');
    expect(combatMod(g.world, 'enemy_damage')).toBeCloseTo(1.2, 6);
    // legend is chosen at the start of a run only, and kept
    g.queue('flag.set', { key: 'difficulty', value: 'legend' });
    g.step(1);
    expect(g.world.meta.flags.difficulty).toBe('hard');
    expect(events(g, 'combat.difficulty').at(-1)?.data).toMatchObject({
      op: 'refused',
      reason: 'locked',
    });
    const l = makeGame();
    l.queue('flag.set', { key: 'difficulty', value: 'legend' });
    l.step(1);
    expect(combatMod(l.world, 'enemy_hp')).toBeCloseTo(1.15, 6);
    l.step(30);
    l.queue('flag.set', { key: 'difficulty', value: 'story' });
    l.step(1);
    expect(l.world.meta.flags.difficulty).toBe('legend');
  });

  it('a standard run registers nothing; a switch in combat is refused', () => {
    const g = makeGame();
    g.step(2);
    expect(events(g, 'modifier.registered').filter((e) => e.data.source === 'difficulty')).toEqual(
      [],
    );
    expect(DIFFICULTY_MODS.standard.enemyDamage).toBe(1);
    toArena(g, 5);
    unit(g, 'player').combatUntil = g.world.meta.tick + 200;
    g.queue('flag.set', { key: 'difficulty', value: 'story' });
    g.step(1);
    expect(g.world.meta.flags.difficulty).toBe('standard');
    expect(events(g, 'combat.difficulty').at(-1)?.data).toMatchObject({ reason: 'in_combat' });
  });

  it('软狂暴与难度: a 30% enrage fires at 21% on story and at 34.5% on hard', () => {
    const at = (difficulty: string, pct: number) => {
      const g = makeGame();
      g.queue('flag.set', { key: 'difficulty', value: difficulty });
      g.step(1);
      toArena(g, 5);
      const boss = monster(g, 'seg_oneeye', 12, 7);
      const max = deriveStats(g.world, g.content, boss).maxHp;
      withCtx(g, (ctx) => {
        boss.hp = Math.floor(max * pct);
        resolveHit(ctx, {
          source: unit(g, 'player'),
          target: boss,
          amount: 1,
          school: 'shadow',
          kind: 'periodic',
        });
      });
      g.step(30);
      return !!boss.ai?.enraged;
    };
    expect(at('story', 0.25)).toBe(false);
    expect(at('story', 0.2)).toBe(true);
    expect(at('hard', 0.34)).toBe(true);
    expect(at('standard', 0.34)).toBe(false);
  });
});

describe('7 and 4.3: the skill rack and the driven pool', () => {
  it('the rack holds 8 at level 1 and 12 at level 10; an unracked ability is refused', () => {
    expect([1, 9, 10, 19, 20, 34, 35, 49, 50, 60].map(skillRackSize)).toEqual([
      8, 8, 12, 12, 16, 16, 20, 20, 24, 24,
    ]);
    const g = makeGame();
    const extra = g.content.abilities.filter((a) => a.id.startsWith('sk_war_')).slice(0, 10);
    withCtx(g, (ctx) => {
      for (const a of extra) {
        unit(g, 'player').abilities.push(a.id);
      }
      // the doors' port fills the rack while it has room
      void ctx;
    });
    withCtx(g, (ctx) => {
      const p = unit(g, 'player');
      p.rack = undefined;
      void ctx;
    });
    g.step(20);
    const p = unit(g, 'player');
    expect(p.rack?.length).toBe(8);
    const out = [...new Set([...p.abilities])].find((id) => !p.rack?.includes(id));
    expect(out).toBeDefined();
    g.queue('combat.cast', { abilityId: out as string });
    g.step(1);
    expect(events(g, 'command.result').at(-1)?.data).toMatchObject({
      ok: false,
      code: 'not_racked',
    });
    // in combat the rack is locked; out of combat it changes
    p.combatUntil = g.world.meta.tick + 100;
    g.queue('combat.rack', { abilityId: out as string, on: true });
    g.step(1);
    expect(events(g, 'command.result').at(-1)?.data).toMatchObject({
      ok: false,
      code: 'in_combat',
    });
    p.combatUntil = 0;
    g.queue('combat.rack', { abilityId: p.rack?.[1] as string, on: false });
    g.queue('combat.rack', { abilityId: out as string, on: true });
    g.step(1);
    expect(p.rack).toContain(out);
    const known = new Set(p.abilities).size + 1;
    withCtx(g, (ctx) => setLevel(ctx, p, 10));
    g.step(21);
    expect(known).toBeGreaterThan(8);
    expect(p.rack?.length).toBe(Math.min(12, known - 1));
    expect(p.rack).not.toContain(p.rackOff?.[0]);
  });

  it('two door pools: one is driven; the other switches out of combat; dual pulse drives both', () => {
    const g = makeGame();
    toArena(g, 5);
    const foe = dummy(g, 'zz_t', { level: 1, side: 'enemy', x: 8 });
    withCtx(g, (ctx) => {
      const p = unit(g, 'player');
      p.pools = { rage: { 'door:a': 100 }, mana: { 'door:b': 80 } };
      p.activePool = 'rage';
      p.res = { rage: 100, mana: 80 };
      p.abilities.push('zz_rage', 'zz_mana');
      p.rack = [...(p.rack ?? []), 'zz_rage', 'zz_mana'];
      void ctx;
    });
    g.queue('combat.cast', { abilityId: 'zz_mana', targetId: foe.id });
    g.step(1);
    expect(events(g, 'command.result').at(-1)?.data).toMatchObject({
      ok: false,
      code: 'pool_idle',
    });
    unit(g, 'player').combatUntil = 0;
    g.queue('combat.switch_pool', { resource: 'mana' });
    g.step(1);
    expect(events(g, 'combat.pool_switched').at(-1)?.data).toMatchObject({ resource: 'mana' });
    g.step(20);
    g.queue('combat.cast', { abilityId: 'zz_mana', targetId: foe.id });
    g.step(1);
    expect(events(g, 'command.result').at(-1)?.data).toMatchObject({ ok: true });
    g.queue('combat.cast', { abilityId: 'zz_rage', targetId: foe.id });
    g.step(1);
    expect(events(g, 'command.result').at(-1)?.data).toMatchObject({
      ok: false,
      code: 'pool_idle',
    });
    g.queue('flag.set', { key: 'feature.dual_pulse', value: true });
    g.step(1);
    g.queue('combat.cast', { abilityId: 'zz_rage', targetId: foe.id });
    g.step(1);
    expect(events(g, 'command.result').at(-1)?.data).toMatchObject({ ok: true });
  });
});

describe('19.2 duelWatch and duel.ended: the one-on-one duel', () => {
  it('观战: a boss fought alone keeps 0.415 of its health; a second fighter turns the watchers', () => {
    expect(partySizeHpScale(1, 3)).toBeCloseTo(0.415, 3);
    const g = makeGame();
    toArena(g, 5);
    withCtx(g, (ctx) => setLevel(ctx, unit(g, 'player'), 12));
    const seg = monster(g, 'seg_oneeye', 12, 8);
    const gang = monster(g, 'oneeye_bandit', 10, 12);
    const full = deriveStats(g.world, g.content, seg).maxHp;
    g.queue('combat.duel', { opponentId: seg.id });
    g.step(1);
    expect(events(g, 'combat.duel_started').length).toBe(1);
    expect(deriveStats(g.world, g.content, seg).maxHp).toBe(
      Math.round(full * partySizeHpScale(1, 3)),
    );
    expect(gang.side).toBe('neutral');
    const comp = dummy(g, 'zz_comp', { level: 10, side: 'ally', x: 6, kind: 'companion' });
    withCtx(g, (ctx) => {
      resolveHit(ctx, { source: comp, target: seg, amount: 5, school: 'shadow', kind: 'periodic' });
    });
    expect(gang.side).toBe('enemy');
    expect(events(g, 'duel.ended').at(-1)?.data).toMatchObject({
      opponentRef: 'seg_oneeye',
      winner: 'draw',
    });
  });

  it('a won duel ends without a death: the opponent yields and duel.ended names the player', () => {
    const g = makeGame();
    toArena(g, 5);
    withCtx(g, (ctx) => setLevel(ctx, unit(g, 'player'), 12));
    const seg = monster(g, 'seg_oneeye', 12, 8);
    g.queue('combat.duel', { opponentId: seg.id });
    g.step(1);
    withCtx(g, (ctx) => {
      seg.hp = 5;
      resolveHit(ctx, {
        source: unit(g, 'player'),
        target: seg,
        amount: 50,
        school: 'shadow',
        kind: 'periodic',
      });
    });
    expect(events(g, 'duel.ended').at(-1)?.data).toMatchObject({
      opponentRef: 'seg_oneeye',
      winner: 'player',
    });
    expect(events(g, 'entity.died').some((e) => e.data.id === seg.id)).toBe(false);
    expect(g.world.meta.flags['boss.seg_oneeye.yielded']).toBe(true);
    // a lost duel leaves the player on 1 health, not in the corridor
    const g2 = makeGame();
    toArena(g2, 5);
    const foe = dummy(g2, 'zz_rival', { level: 5, side: 'neutral', x: 7 });
    g2.queue('combat.duel', { opponentId: foe.id });
    g2.step(1);
    withCtx(g2, (ctx) => {
      unit(g2, 'player').hp = 2;
      resolveHit(ctx, {
        source: foe,
        target: unit(g2, 'player'),
        amount: 50,
        school: 'shadow',
        kind: 'periodic',
      });
    });
    expect(events(g2, 'duel.ended').at(-1)?.data).toMatchObject({ winner: 'opponent' });
    expect(unit(g2, 'player').hp).toBe(1);
    expect(ents(g2).player?.alive).toBe(true);
    expect(foe.side).toBe('neutral');
  });
});

describe('12.3 and catalog 4.5: the fiends', () => {
  function warlock(g: Engine): Unit {
    toArena(g, 5);
    const p = unit(g, 'player');
    withCtx(g, (ctx) => {
      setLevel(ctx, p, 10);
      p.pools = { mana: { 'door:vocation_warlock': 80 } };
      p.res.mana = 2000;
      p.abilities.push('sk_lok_summonremnant', 'sk_lok_summonimp');
      p.rack = [...(p.rack ?? []), 'sk_lok_summonremnant', 'sk_lok_summonimp'];
    });
    return p;
  }
  function cast(g: Engine, id: string): void {
    g.queue('combat.cast', { abilityId: id });
    g.step(1);
    for (let i = 0; i < 80 && unit(g, 'player').cast; i++) g.step(1);
  }

  it('the blood pact takes 15% of max health while the remnant is out, and leaves with it', () => {
    const g = makeGame();
    const p = warlock(g);
    const before = deriveStats(g.world, g.content, p).maxHp;
    cast(g, 'sk_lok_summonremnant');
    const pet = Object.values(units(g)).find((u) => u.monsterId === 'fiend_colossus_remnant');
    expect(pet).toBeDefined();
    expect(p.auras.some((a) => a.id === 'aur_lok_remnantpact')).toBe(true);
    expect(deriveStats(g.world, g.content, p).maxHp).toBe(Math.round(before * 0.85));
    // one fiend at a time: calling the imp sends the remnant back into its pact
    g.step(40);
    cast(g, 'sk_lok_summonimp');
    const fiends = Object.values(units(g)).filter((u) => u.summonerId === 'player');
    expect(fiends.map((u) => u.monsterId)).toEqual(['contract_imp']);
    g.step(21);
    expect(p.auras.some((a) => a.id === 'aur_lok_remnantpact')).toBe(false);
  });

  it('near the seal ruins the remnant does not obey and walks toward the ash chamber', () => {
    const g = makeGame();
    const p = warlock(g);
    g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins_depths', x: 6, y: 6 });
    g.step(1);
    cast(g, 'sk_lok_summonremnant');
    const pet = Object.values(units(g)).find((u) => u.monsterId === 'fiend_colossus_remnant');
    const pe = pet ? ents(g)[pet.id] : undefined;
    expect(pe?.mapId).toBe('seal_ruins_depths');
    const goal = g.content.maps
      .find((m) => m.id === 'seal_ruins_depths')
      ?.locations.find((l) => l.id === 'ash_chamber');
    const cx = (goal?.x ?? 0) + (goal?.w ?? 0) / 2;
    const cy = (goal?.y ?? 0) + (goal?.h ?? 0) / 2;
    const d0 = Math.hypot((pe?.x ?? 0) - cx, (pe?.y ?? 0) - cy);
    g.step(60);
    const pe2 = pet ? ents(g)[pet.id] : undefined;
    expect(Math.hypot((pe2?.x ?? 0) - cx, (pe2?.y ?? 0) - cy)).toBeLessThan(d0);
    void p;
  });
});

describe('3.9 and 18: pushback and the readable cast bar', () => {
  it('a cast is pushed back twice at most; an uninterruptible start says so', () => {
    const g = makeGame();
    toArena(g, 5);
    const foe = dummy(g, 'zz_t', { level: 1, side: 'enemy', x: 9 });
    withCtx(g, (ctx) => {
      const p = unit(g, 'player');
      p.pools = { mana: { 'door:x': 100 } };
      p.res.mana = 100;
      p.abilities.push('zz_bolt', 'zz_wall');
      p.rack = [...(p.rack ?? []), 'zz_bolt', 'zz_wall'];
      void ctx;
    });
    g.queue('combat.cast', { abilityId: 'zz_bolt', targetId: foe.id });
    g.step(1);
    const cast = unit(g, 'player').cast;
    expect(events(g, 'combat.cast').at(-1)?.data).toMatchObject({
      op: 'start',
      interruptible: true,
    });
    const end = cast?.end ?? 0;
    for (let i = 0; i < 4; i++)
      withCtx(g, (ctx) => {
        resolveHit(ctx, {
          source: foe,
          target: unit(g, 'player'),
          amount: 1,
          school: 'shadow',
          kind: 'periodic',
        });
      });
    expect(unit(g, 'player').cast?.end).toBe(end + 20);
    expect(standardAmount(1)).toBe(9);
    expect(standardAmount(60)).toBe(698);
  });
});

describe('15.2: downs in a fight', () => {
  it('a companion going down counts its downs until the fight is over', () => {
    const g = makeGame();
    const comp = dummy(g, 'zz_comp', { level: 5, side: 'ally', x: 5, kind: 'companion' });
    const foe = dummy(g, 'zz_t', { level: 5, side: 'enemy', x: 30 });
    withCtx(g, (ctx) => {
      comp.hp = 1;
      resolveHit(ctx, {
        source: foe,
        target: comp,
        amount: 50,
        school: 'shadow',
        kind: 'periodic',
      });
    });
    expect(comp.downed).toBe(true);
    expect(comp.downs).toBe(1);
    void TICKS_PER_GAME_DAY;
    void TICKS_PER_GAME_MINUTE;
  });
});

describe('13.2 and 15.1: the gear wears through the inventory port', () => {
  it('a death takes 10% of the maximum off each worn piece', () => {
    const g = makeGame();
    toArena(g, 5);
    withCtx(g, (ctx) => {
      addItem(ctx, 'player', 'zz_axe', 1, 'test');
    });
    g.queue('inventory.equip', { ownerId: 'player', itemId: 'zz_axe' });
    g.step(1);
    const worn = () => {
      const h = g.world.slices.inventory.owners.player as unknown as {
        instances?: Record<string, { defId: string; durability?: { cur: number; max: number } }>;
      };
      return Object.values(h.instances ?? {}).find((i) => i.defId === 'zz_axe')?.durability;
    };
    const before = { ...worn() };
    expect(before.max).toBeGreaterThan(0);
    const foe = dummy(g, 'zz_killer', { level: 1, side: 'enemy', x: 30 });
    withCtx(g, (ctx) => {
      unit(g, 'player').hp = 1;
      resolveHit(ctx, {
        source: foe,
        target: unit(g, 'player'),
        amount: 50,
        school: 'shadow',
        kind: 'periodic',
      });
    });
    expect(worn()?.cur).toBeCloseTo((before.cur ?? 0) - (before.max ?? 0) * 0.1, 3);
  });
});

describe('13.2: one fight wears each worn piece by 1', () => {
  it('a fight that ends wears the axe by 1 through the inventory port', () => {
    const g = makeGame();
    toArena(g, 5);
    withCtx(g, (ctx) => {
      addItem(ctx, 'player', 'zz_axe', 1, 'test');
    });
    g.queue('inventory.equip', { ownerId: 'player', itemId: 'zz_axe' });
    g.step(1);
    const cur = () => {
      const h = g.world.slices.inventory.owners.player as unknown as {
        instances?: Record<string, { defId: string; durability?: { cur: number } }>;
      };
      return Object.values(h.instances ?? {}).find((i) => i.defId === 'zz_axe')?.durability?.cur;
    };
    const before = cur() ?? 0;
    unit(g, 'player').combatUntil = g.world.meta.tick + 30;
    g.step(25);
    expect(cur()).toBe(before);
    g.step(40);
    expect(cur()).toBe(before - 1);
    g.step(60);
    expect(cur()).toBe(before - 1);
  });
});

describe('review fixes: doors overload, duels and companions', () => {
  it('doors take the overload stacks from the return, not from their own clock', () => {
    const g = makeGame();
    const blockage = () => Number(g.world.meta.flags.blockage ?? 0);
    const before = blockage();
    withCtx(g, (ctx) => {
      ctx.emit('combat.player_returned', {
        fromMap: ARENA.id,
        x: 1,
        y: 1,
        toMap: ARENA.id,
        toX: 1,
        toY: 1,
        innerCourt: false,
        moneyLost: 0,
        fatigueMinutes: 120,
        overload: 2,
        fatigueFloor: 60,
      });
    });
    expect(blockage() - before).toBe(6);
  });

  it("a companion does not join the player's duel; a broken duel restores the boss's health", () => {
    const g = makeGame();
    toArena(g, 5);
    withCtx(g, (ctx) => setLevel(ctx, unit(g, 'player'), 12));
    const seg = monster(g, 'seg_oneeye', 12, 8);
    g.queue('combat.duel', { opponentId: seg.id });
    g.step(1);
    // the pets of the player hold off the duelist
    const pet = monster(g, 'grey_wolf', 12, 6);
    pet.side = 'ally';
    pet.summonerId = 'player';
    unit(g, 'player').target = seg.id;
    // the master is fighting: a pet would otherwise join in on its target
    unit(g, 'player').combatUntil = g.world.meta.tick + 2000;
    g.step(40);
    expect(
      events(g, 'combat.damage').some(
        (e) => e.data.sourceId === pet.id && e.data.targetId === seg.id,
      ),
    ).toBe(false);
    expect(seg.duel).toBeDefined();
    const full = (() => {
      const scale = seg.hpScale;
      delete seg.hpScale;
      const m = deriveStats(g.world, g.content, seg).maxHp;
      seg.hpScale = scale;
      return m;
    })();
    const comp = dummy(g, 'zz_comp', { level: 10, side: 'ally', x: 6, kind: 'companion' });
    withCtx(g, (ctx) => {
      resolveHit(ctx, { source: comp, target: seg, amount: 1, school: 'shadow', kind: 'periodic' });
    });
    expect(events(g, 'duel.ended').at(-1)?.data).toMatchObject({ winner: 'draw' });
    expect(seg.hpScale).toBeUndefined();
    expect(seg.hp).toBeGreaterThan(full * 0.9);
  });
});

describe('13.3 and 14.1: item triggers, set auras and items in play', () => {
  function wearCharm(g: Engine): void {
    withCtx(g, (ctx) => {
      addItem(ctx, 'player', 'zz_charm', 1, 'test');
    });
    g.queue('inventory.equip', { ownerId: 'player', itemId: 'zz_charm' });
    g.step(21);
  }

  it('combat fires combat_start (with solo) and low_hp; the worn set keeps its aura on', () => {
    const g = makeGame();
    toArena(g, 5);
    wearCharm(g);
    const p = unit(g, 'player');
    expect(p.auras.find((a) => a.id === 'aur_zz_setward')?.origin).toBe('gear');
    const foe = dummy(g, 'zz_t', { level: 1, side: 'enemy', x: 7 });
    const max = deriveStats(g.world, g.content, p).maxHp;
    withCtx(g, (ctx) => {
      p.hp = Math.round(max * 0.5);
      resolveHit(ctx, {
        source: foe,
        target: p,
        amount: Math.round(max * 0.3),
        school: 'shadow',
        kind: 'periodic',
      });
    });
    g.step(1);
    const procs = events(g, 'item.proc').map((e) => e.data.on);
    expect(procs).toContain('combat_start');
    expect(procs).toContain('low_hp');
    expect(p.auras.some((a) => a.id === 'aur_zz_buff')).toBe(true);
    expect(p.auras.some((a) => a.id === 'aur_ember_door')).toBe(true);
    // taking the charm off takes the set aura off
    g.queue('inventory.unequip', { ownerId: 'player', slot: 'trinket' });
    g.step(21);
    expect(p.auras.some((a) => a.id === 'aur_zz_setward')).toBe(false);
  });

  it('a fired dmg, chain, aura and cleanse land, marked fromProc', () => {
    const g = makeGame();
    toArena(g, 5);
    const a = dummy(g, 'zz_a', { level: 1, side: 'enemy', x: 7 });
    const b = dummy(g, 'zz_b', { level: 1, side: 'enemy', x: 8.5 });
    const c = dummy(g, 'zz_c', { level: 1, side: 'enemy', x: 10 });
    const proc = (effect: unknown, targetId?: string) =>
      withCtx(g, (ctx) => {
        ctx.emit('item.proc', {
          ownerId: 'player',
          targetId,
          on: 'hit',
          source: 'item',
          sourceId: 'zz_charm',
          itemId: 'zz_charm',
          effect: effect as never,
        });
      });
    proc({ kind: 'chain', school: 'fire', amount: 5, jumps: 2 }, a.id);
    g.step(1);
    const hits = events(g, 'combat.damage').filter((e) => e.data.sourceId === 'player');
    expect(hits.map((e) => e.data.targetId).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(hits.every((e) => e.data.fromProc === true && e.data.weaponClass === 'none')).toBe(true);
    // a proc's hit triggers no further procs (the inventory skips fromProc)
    proc({ kind: 'aura', aura: 'zz_hex1', at: 'target' }, a.id);
    g.step(1);
    expect(a.auras.some((x) => x.id === 'zz_hex1')).toBe(false);
    laid(g, 'player', 'zz_hex1', a.id);
    laid(g, 'player', 'zz_hex2', a.id);
    proc({ kind: 'cleanse' });
    g.step(1);
    expect(unit(g, 'player').auras.map((x) => x.id)).toContain('zz_hex1');
    expect(unit(g, 'player').auras.map((x) => x.id)).not.toContain('zz_hex2');
  });

  it('in combat a bandage is refused, a potion skips the global cooldown, an elixir takes it', () => {
    const g = makeGame();
    toArena(g, 5);
    withCtx(g, (ctx) => {
      for (const id of ['zz_bandage', 'zz_potion', 'zz_elixir'])
        addItem(ctx, 'player', id, 2, 'test');
    });
    const p = unit(g, 'player');
    p.combatUntil = g.world.meta.tick + 2000;
    const use = (itemId: string) => {
      g.queue('combat.use_item', { itemId });
      g.step(1);
      return events(g, 'command.result')
        .filter((e) => e.data.kind === 'combat.use_item')
        .at(-1)?.data;
    };
    expect(use('zz_bandage')).toMatchObject({ ok: false, code: 'in_combat' });
    expect(use('zz_potion')).toMatchObject({ ok: true });
    g.step(1);
    expect(p.gcd).toBeLessThanOrEqual(g.world.meta.tick);
    expect(use('zz_elixir')).toMatchObject({ ok: true });
    g.step(1);
    expect(p.gcd).toBeGreaterThan(g.world.meta.tick);
    expect(p.auras.some((a) => a.id === 'aur_zz_buff')).toBe(true);
    expect(use('zz_elixir')).toMatchObject({ ok: false, code: 'gcd' });
    // out of combat the bandage goes through
    p.combatUntil = 0;
    expect(use('zz_bandage')).toMatchObject({ ok: true });
  });

  it('a tool kept as a record per piece never falls into the drop bag', () => {
    const g = makeGame();
    toArena(g, 5);
    withCtx(g, (ctx) => {
      addItem(ctx, 'player', 'zz_tool', 8, 'test');
      addItem(ctx, 'player', 'zz_herb', 8, 'test');
    });
    const foe = dummy(g, 'zz_killer', { level: 1, side: 'enemy', x: 30 });
    withCtx(g, (ctx) => {
      unit(g, 'player').hp = 1;
      resolveHit(ctx, {
        source: foe,
        target: unit(g, 'player'),
        amount: 50,
        school: 'shadow',
        kind: 'periodic',
      });
    });
    expect(events(g, 'combat.bag').at(-1)?.data.items).toEqual([{ itemId: 'zz_herb', count: 2 }]);
  });
});
