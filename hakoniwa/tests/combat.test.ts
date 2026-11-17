// Combat system: formulas, content, spawning, the hit chain from command to death,
// rewards, monster brains, bosses, waves, the return through the door, presence, items,
// and determinism. The harness builds the game from the kernel systems plus combat,
// party and doors with their packs, so these tests run the real engine chain without
// depending on systems other teams are still writing.

import { describe, expect, it } from 'vitest';
import type { ContentPack } from '../src/content/pack';
import { pack as combatPack } from '../src/content/packs/combat';
import { pack as doorsPack } from '../src/content/packs/doors';
import { pack as invPack } from '../src/content/packs/inventory';
import { pack as partyPack } from '../src/content/packs/party';
import { pack as worldPack } from '../src/content/packs/world';
import { Engine, worldHash } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import type { SystemContext } from '../src/core/system';
import { tr } from '../src/core/text';
import { TICKS_PER_GAME_MINUTE } from '../src/core/time';
import { t } from '../src/shared_ui/i18n';
import {
  abilityBar,
  armorReduction,
  canMove,
  system as combat,
  enemiesNear,
  grantAbility,
  grantPool,
  meleeMissChance,
  mobXpValue,
  presencePenalty,
  spellHitChance,
  strengthReading,
  targetInfo,
  tierForLevel,
  tierName,
  unitView,
  xpForLevel,
  xpProgress,
} from '../src/systems/combat';
import { resourceName } from '../src/systems/combat/abilities';
import { deriveStats } from '../src/systems/combat/stats';
import { syncToParty } from '../src/systems/combat/threat';
import { system as doors } from '../src/systems/doors';
import { addItem, system as inventory } from '../src/systems/inventory';
import { system as modifiers, registerModifier } from '../src/systems/modifiers';
import { system as party } from '../src/systems/party';
import { findPath, mapById, spawnEntity, system as world } from '../src/systems/world';
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

/** A tiny walkable room standing in for the domain team's inner court map. */
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

function makeGame(seed = 7, extraMaps: MapDef[] = []): Engine {
  const content = merge(PACKS);
  content.maps = [...content.maps, ...extraMaps];
  return Engine.create(seed, content, SYSTEMS);
}

/** Run something inside a system context (as tests of ports do). */
function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe = {
    id: 'zz_probe',
    order: 999,
    tick: (ctx: SystemContext) => fn(ctx),
  };
  const engine = Engine.resume(g.world, g.content, [...g.systems, probe]);
  engine.step(1);
}

function events<K extends AnyWorldEvent['kind']>(g: Engine, kind: K) {
  return g.world.recent.filter((e): e is Extract<AnyWorldEvent, { kind: K }> => e.kind === kind);
}

function lastResult(g: Engine, kind: string) {
  const r = [...g.world.recent]
    .reverse()
    .find((e) => e.kind === 'command.result' && e.data.kind === kind);
  return r?.kind === 'command.result' ? r.data : undefined;
}

const units = (g: Engine) => g.world.slices.combat.units;
const ents = (g: Engine) => g.world.slices.world.entities;

/** Spawn a monster next to the player through the debug command. */
function spawnNear(g: Engine, monsterId: string, level: number, dx = 1.2): string {
  const before = new Set(Object.keys(ents(g)));
  const p = ents(g).player;
  if (!p) throw new Error('no player');
  g.queue('combat.spawn', { monsterId, mapId: p.mapId, x: p.x + dx, y: p.y, level });
  g.step(1);
  const id = Object.keys(ents(g)).find((k) => !before.has(k) && ents(g)[k]?.ref === monsterId);
  if (!id) throw new Error(`spawn failed: ${monsterId}`);
  return id;
}

/** Move the player to an empty spot of the sigil hall, away from the corridor monsters. */
function isolate(g: Engine): void {
  g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins', x: 18.5, y: 9.5 });
  g.step(1);
}

describe('combat formulas (classic originals)', () => {
  it('follows the classic 1 to 60 experience curve', () => {
    expect(xpForLevel(1)).toBe(400);
    expect(xpForLevel(10)).toBe(7600);
    expect(xpForLevel(20)).toBe(23200);
    expect(xpForLevel(30)).toBe(47400);
    expect(xpForLevel(59)).toBe(209800);
    expect(xpForLevel(60)).toBe(0);
  });

  it('scales mob experience by level difference and goes gray', () => {
    expect(mobXpValue(1, 1)).toBe(50);
    expect(mobXpValue(12, 10)).toBe(Math.round((45 + 60) * 1.1));
    expect(mobXpValue(1, 10)).toBe(0);
    expect(mobXpValue(5, 5, 2)).toBe(140);
  });

  it('mitigates armor and caps at 75%', () => {
    expect(armorReduction(0, 10)).toBe(0);
    expect(armorReduction(1250, 10)).toBeCloseTo(0.5, 5);
    expect(armorReduction(1e9, 1)).toBe(0.75);
  });

  it('uses the classic hit tables', () => {
    expect(meleeMissChance(10, 10)).toBeCloseTo(0.05, 6);
    expect(meleeMissChance(10, 13)).toBeCloseTo(0.09, 6);
    expect(spellHitChance(10, 10)).toBeCloseTo(0.96, 6);
    expect(spellHitChance(10, 13)).toBeCloseTo(0.83, 6);
    expect(spellHitChance(10, 7)).toBeCloseTo(0.99, 6);
  });

  it('maps levels to ranks and applies presence only two ranks up (Q-003)', () => {
    expect([1, 9, 10, 20, 35, 50, 60].map(tierForLevel)).toEqual([0, 0, 1, 2, 3, 4, 5]);
    expect(presencePenalty(1, 2)).toEqual({ hitPenalty: 0, damageFactor: 1 });
    const two = presencePenalty(0, 2);
    expect(two.hitPenalty).toBeCloseTo(0.1, 6);
    expect(two.damageFactor).toBeCloseTo(0.8, 6);
    const far = presencePenalty(0, 7);
    expect(far.hitPenalty).toBeCloseTo(0.4, 6);
    expect(far.damageFactor).toBeCloseTo(0.3, 6);
    expect(presencePenalty(0, 2, 0.5).hitPenalty).toBeCloseTo(0.05, 6);
  });
});

describe('combat content', () => {
  it('validates every combat, doors and party table', () => {
    const content = merge(PACKS);
    expect(combatPack.validate?.(content)).toEqual([]);
    expect(doorsPack.validate?.(content)).toEqual([]);
    expect(partyPack.validate?.(content)).toEqual([]);
  });

  it('ships nine vocations, the outsider, 35 or more monsters and the five bosses', () => {
    const c = merge(PACKS);
    expect(c.classes.map((x) => x.id).sort()).toEqual(
      [
        'druid',
        'hunter',
        'mage',
        'outsider',
        'paladin',
        'priest',
        'rogue',
        'shaman',
        'warlock',
        'warrior',
      ].sort(),
    );
    for (const cls of c.classes.filter((x) => x.id !== 'outsider')) {
      expect(cls.abilities.length).toBeGreaterThanOrEqual(6);
      expect(cls.abilities.length).toBeLessThanOrEqual(10);
    }
    const outsider = c.classes.find((x) => x.id === 'outsider');
    expect(outsider?.resource).toBeNull();
    expect(outsider?.abilities.map((a) => a.id)).toEqual(['sk_door_strike']);
    expect(c.monsters.length).toBeGreaterThanOrEqual(35);
    for (const boss of [
      'guardian_raven',
      'dian_colossus',
      'crystal_centipede',
      'sasha',
      'faceless_king',
    ]) {
      expect(c.monsters.find((m) => m.id === boss)?.rank).toBe('boss');
    }
  });

  it('keeps every combat map connected from its arrival points', () => {
    const c = merge(PACKS);
    for (const id of [
      'seal_ruins',
      'seal_ruins_depths',
      'forest_edge',
      'ash_waste',
      'wallenburg_sewers',
    ]) {
      const map = mapById(c, id);
      if (!map) throw new Error(`missing map ${id}`);
      const gate = map.locations.find((l) => l.id.startsWith('gate_'));
      if (!gate) throw new Error(`no arrival on ${id}`);
      const from = { x: gate.x + gate.w / 2, y: gate.y + gate.h / 2 };
      for (const s of map.spawns) expect(findPath(map, from, s), `${id}/${s.id}`).not.toBeNull();
      for (const x of map.exits)
        expect(findPath(map, from, { x: x.x + 0.5, y: x.y + 0.5 }), `${id}/${x.id}`).not.toBeNull();
    }
  });

  it('offers the seal ruins wake point as a priority-1 world start', () => {
    const c = merge(PACKS);
    const start = c.worldStarts.find((s) => s.mapId === 'seal_ruins');
    expect(start?.priority).toBe(1);
    const g = makeGame();
    expect(ents(g).player?.mapId).toBe('seal_ruins');
  });
});

describe('combat units and spawning', () => {
  it('gives the player an outsider unit with only the opening strike', () => {
    const g = makeGame();
    const u = units(g).player;
    expect(u?.classId).toBe('outsider');
    expect(u?.res).toEqual({});
    expect(abilityBar(g.world, g.content).map((s) => s.id)).toEqual(['sk_door_strike']);
    expect(ents(g).player?.tags).toEqual(expect.arrayContaining(['lvl:1', 'tier:0']));
  });

  it('spawns map monsters with level, rank and hostility tags', () => {
    const g = makeGame();
    const wolves = Object.values(ents(g)).filter((e) => e.ref === 'grey_wolf');
    expect(wolves.length).toBeGreaterThan(0);
    for (const w of wolves) {
      expect(w.tags).toEqual(expect.arrayContaining(['monster', 'hostile', 'family:beast']));
      const lvl = Number(w.tags.find((t) => t.startsWith('lvl:'))?.slice(4));
      expect(lvl).toBeGreaterThanOrEqual(2);
      expect(lvl).toBeLessThanOrEqual(4);
      expect(units(g)[w.id]?.side).toBe('enemy');
    }
    const boss = Object.values(ents(g)).find((e) => e.ref === 'guardian_raven');
    expect(boss?.tags).toContain('boss');
  });

  it('places the gatekeeper Ash as an unattackable presence', () => {
    const g = makeGame();
    const ash = Object.values(ents(g)).find((e) => e.ref === 'ash');
    expect(ash?.mapId).toBe('seal_ruins_depths');
    expect(ash?.tags).toEqual(expect.arrayContaining(['unattackable', 'tier:6']));
    expect(units(g)[ash?.id ?? '']?.attackable).toBe(false);
    g.queue('combat.attack', { on: true, targetId: ash?.id });
    g.step(1);
    expect(lastResult(g, 'combat.attack')?.code).toBe('bad_target');
  });

  it('honours requiresFlags: the seep spirits appear only after the raven falls', () => {
    const g = makeGame();
    const spirits = () => Object.values(ents(g)).filter((e) => e.ref === 'dian_spirit').length;
    expect(spirits()).toBe(0);
    g.queue('flag.set', { key: 'boss.guardian_raven.defeated', value: true });
    g.step(2);
    expect(spirits()).toBe(2);
  });

  it('applies registered monster strength modifiers by map', () => {
    const g = makeGame();
    isolate(g);
    withCtx(g, (ctx) => {
      registerModifier(ctx, {
        target: 'monster',
        key: 'seal_ruins:power',
        factor: 2,
        untilTick: ctx.tick + 10000,
        source: 'test',
        visibility: 'hidden',
        note: '澱涌',
      });
    });
    const id = spawnNear(g, 'dian_dreg', 1, 6);
    const u = units(g)[id];
    if (!u) throw new Error('no unit');
    expect(u.power).toBe(2);
    expect(deriveStats(g.world, g.content, u).maxHp).toBe(Math.round((40 + 10 + 0.9) * 0.9 * 2));
  });

  it('respawns a killed spawn-point monster after its respawn minutes', () => {
    const g = makeGame();
    const key = 'seal_ruins/sr_dreg_w';
    const st = g.world.slices.combat.spawns[key];
    const victim = st?.alive[0];
    if (!st || !victim) throw new Error('no spawn');
    // finish it through the real chain: a weakened target, the player's auto-attack
    const u = units(g)[victim];
    if (!u) throw new Error('no unit');
    u.hp = 1;
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: 'seal_ruins',
      x: (ents(g)[victim]?.x ?? 9) + 1.1,
      y: ents(g)[victim]?.y ?? 9,
    });
    g.step(1);
    g.queue('combat.attack', { on: true, targetId: victim });
    for (let i = 0; i < 200 && ents(g)[victim]?.alive; i++) g.step(1);
    expect(ents(g)[victim]?.alive ?? false).toBe(false);
    const minutes =
      mapById(g.content, 'seal_ruins')?.spawns.find((x) => x.id === 'sr_dreg_w')?.respawnMinutes ??
      0;
    expect(minutes).toBeGreaterThan(0);
    g.step(minutes * TICKS_PER_GAME_MINUTE + 400);
    expect(ents(g)[victim]).toBeUndefined();
    const count =
      mapById(g.content, 'seal_ruins')?.spawns.find((x) => x.id === 'sr_dreg_w')?.count ?? 1;
    expect(g.world.slices.combat.spawns[key]?.alive.length).toBe(count);
  });
});

describe('combat chain', () => {
  it('kills a monster through commands: damage, death, experience, loot', () => {
    const g = makeGame(11);
    isolate(g);
    const id = spawnNear(g, 'dian_dreg', 1);
    g.queue('combat.attack', { on: true, targetId: id });
    for (let i = 0; i < 400 && ents(g)[id]?.alive; i++) {
      if (i % 20 === 0) g.queue('combat.cast', { abilityId: 'sk_door_strike' });
      g.step(1);
    }
    expect(ents(g)[id]?.alive).toBe(false);
    const died = events(g, 'entity.died').find((e) => e.data.id === id);
    expect(died?.data.killerId).toBe('player');
    const kill = events(g, 'combat.kill').find((e) => e.data.victimId === id);
    expect(kill?.data).toMatchObject({ family: 'elemental', rank: 'normal', killerSide: 'ally' });
    expect(units(g).player?.xp).toBe(50);
    expect(
      events(g, 'combat.damage').some((e) => e.data.sourceId === 'player' && e.data.amount > 0),
    ).toBe(true);
    expect(g.world.slices.inventory.owners.player?.money ?? 0).toBeGreaterThan(0);
  });

  it('levels up from xp.awarded, emits player.level_up and retags', () => {
    const g = makeGame();
    withCtx(g, (ctx) =>
      ctx.emit('xp.awarded', { entityId: 'player', amount: 1400, reason: 'quest' }),
    );
    g.step(1);
    expect(units(g).player?.level).toBe(3);
    expect(units(g).player?.xp).toBe(100);
    expect(events(g, 'player.level_up').map((e) => e.data.level)).toEqual([2, 3]);
    expect(ents(g).player?.tags).toContain('lvl:3');
    expect(xpProgress(g.world)).toMatchObject({ level: 3, xp: 100, next: 1400 });
  });

  it('rejects bad commands with readable reasons', () => {
    const g = makeGame();
    isolate(g);
    const far = spawnNear(g, 'dian_dreg', 1, 6);
    const cases: [Parameters<Engine['queue']>, string, string][] = [
      [
        ['combat.cast', { abilityId: 'sk_war_heroicstrike', targetId: far }],
        'combat.cast',
        'unknown',
      ],
      [['combat.cast', { abilityId: 'no_such' }], 'combat.cast', 'no_ability'],
      [
        ['combat.cast', { abilityId: 'sk_door_strike', targetId: far }],
        'combat.cast',
        'out_of_range',
      ],
      [['combat.attack', { on: true }], 'combat.attack', 'bad_target'],
      [['combat.cast', { entityId: far, abilityId: 'sk_door_strike' }], 'combat.cast', 'not_yours'],
      [
        ['combat.set_class', { entityId: 'player', classId: 'warrior' }],
        'combat.set_class',
        'outsider',
      ],
      [['combat.set_class', { entityId: far, classId: 'bard' }], 'combat.set_class', 'no_class'],
      [['combat.spawn', { monsterId: 'dragon_king' }], 'combat.spawn', 'no_monster'],
      [['combat.target', { targetId: 'nobody' }], 'combat.target', 'bad_target'],
    ];
    for (const [args, kind, code] of cases) {
      g.queue(...args);
      g.step(1);
      const r = lastResult(g, kind);
      expect(r?.ok, `${kind} ${code}`).toBe(false);
      expect(r?.code).toBe(code);
      expect(t(r?.reason).length).toBeGreaterThan(0);
    }
  });

  it('gates door-granted skills on door-granted pools (R-02) and on cooldowns', () => {
    const g = makeGame();
    isolate(g);
    const id = spawnNear(g, 'dian_dreg', 1);
    withCtx(g, (ctx) => {
      grantAbility(ctx, 'player', 'sk_war_heroicstrike');
    });
    g.queue('combat.cast', { abilityId: 'sk_war_heroicstrike', targetId: id });
    g.step(1);
    expect(lastResult(g, 'combat.cast')?.code).toBe('no_pool');
    expect(lastResult(g, 'combat.cast')?.reason).toEqual(
      tr('sys.combat.reject.no_pool', { resource: tr('sys.combat.resource.rage') }),
    );
    expect(t(lastResult(g, 'combat.cast')?.reason)).toBe('没有战意可用');
    withCtx(g, (ctx) => grantPool(ctx, 'player', 'door:test', 'rage', 100));
    expect(units(g).player?.res.rage ?? 99).toBeLessThan(15);
    g.queue('combat.cast', { abilityId: 'sk_war_heroicstrike', targetId: id });
    g.step(1);
    expect(lastResult(g, 'combat.cast')?.code).toBe('no_resource');
    expect(lastResult(g, 'combat.cast')?.reason).toEqual(
      tr('sys.combat.reject.no_resource', { resource: tr('sys.combat.resource.rage') }),
    );
    g.queue('combat.cast', { abilityId: 'sk_door_strike', targetId: id });
    g.step(31);
    g.queue('combat.cast', { abilityId: 'sk_door_strike', targetId: id });
    g.step(1);
    expect(lastResult(g, 'combat.cast')?.code).toBe('cooldown');
  });

  it('starts a cast bar and lets movement interrupt it', () => {
    const g = makeGame();
    isolate(g);
    const id = spawnNear(g, 'dian_dreg', 1, 5);
    withCtx(g, (ctx) => {
      grantAbility(ctx, 'player', 'sk_lok_shadowbolt');
      grantPool(ctx, 'player', 'door:test', 'mana', 200);
    });
    g.queue('combat.cast', { abilityId: 'sk_lok_shadowbolt', targetId: id });
    g.step(2);
    expect(unitView(g.world, g.content, 'player')?.cast?.abilityId).toBe('sk_lok_shadowbolt');
    g.queue('world.set_intent', { entityId: 'player', dx: 0, dy: 1 });
    g.step(3);
    expect(units(g).player?.cast).toBeNull();
    expect(events(g, 'combat.cast').some((e) => e.data.op === 'interrupted')).toBe(true);
  });

  it('aggroes monsters in their alert radius and resets them past the leash', () => {
    const g = makeGame();
    isolate(g);
    const id = spawnNear(g, 'dian_dreg', 2, 3);
    g.step(40);
    const brain = units(g)[id]?.ai;
    expect(brain?.state).toBe('chase');
    expect(units(g)[id]?.threat.player).toBeGreaterThan(0);
    g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins_depths', x: 3.5, y: 9.5 });
    g.step(20);
    expect(['evade', 'idle']).toContain(units(g)[id]?.ai?.state);
    g.step(20 * 12);
    expect(units(g)[id]?.ai?.state).toBe('idle');
    const u = units(g)[id];
    if (!u) throw new Error('gone');
    expect(u.hp).toBe(deriveStats(g.world, g.content, u).maxHp);
  });

  it('heals with consumables through item.used', () => {
    const g = makeGame();
    withCtx(g, (ctx) => {
      addItem(ctx, 'player', 'minor_healing_potion', 1);
      const u = ctx.world.slices.combat.units.player;
      if (u) u.hp = 10;
    });
    g.queue('inventory.use', { ownerId: 'player', itemId: 'minor_healing_potion' });
    g.step(1);
    expect(units(g).player?.hp).toBe(60);
    expect(events(g, 'combat.heal').at(-1)?.data).toMatchObject({
      targetId: 'player',
      amount: 50,
      overheal: 40,
    });
  });
});

describe('the return through the door (power_system.md 9.8)', () => {
  function killPlayer(g: Engine): void {
    isolate(g);
    const id = spawnNear(g, 'black_ridge', 11, 1.1);
    const u = units(g).player;
    if (u) u.hp = 1;
    for (let i = 0; i < 400 && events(g, 'combat.player_returned').length === 0; i++) g.step(1);
    void id;
  }

  it('wakes at the nearest safe point with door fatigue and a lost share of money', () => {
    const g = makeGame();
    withCtx(g, (ctx) => {
      const h = ctx.world.slices.inventory.owners;
      h.player = { money: 1000, items: {}, equipped: {} };
    });
    killPlayer(g);
    const ret = events(g, 'combat.player_returned').at(-1);
    expect(ret?.data).toMatchObject({
      innerCourt: false,
      toMap: 'seal_ruins',
      moneyLost: 100,
      // door rank 1: two game hours (thousand_doors.md 6.3)
      fatigueMinutes: 120,
    });
    expect(g.world.slices.inventory.owners.player?.money).toBe(900);
    expect(units(g).player?.auras.map((a) => a.id)).toContain('aur_st_revival_fatigue');
    const p = ents(g).player;
    expect(Math.hypot((p?.x ?? 0) - 18, (p?.y ?? 0) - 5)).toBeLessThan(1.5);
    expect(units(g).player?.hp).toBeGreaterThan(1);
    expect(events(g, 'entity.died').some((e) => e.data.kind === 'player')).toBe(true);
  });

  it('wakes in the inner court once feature.inner_court is set', () => {
    const g = makeGame(7, [COURT]);
    g.queue('flag.set', { key: 'feature.inner_court', value: true });
    g.step(1);
    killPlayer(g);
    expect(events(g, 'combat.player_returned').at(-1)?.data).toMatchObject({
      innerCourt: true,
      toMap: 'inner_court',
    });
    expect(ents(g).player?.mapId).toBe('inner_court');
  });
});

describe('bosses, yielding and waves', () => {
  /** Step while keeping the player topped up, so only the boss can lose. */
  function fight(g: Engine, ticks: number, until?: () => boolean): void {
    for (let i = 0; i < ticks; i++) {
      const u = units(g).player;
      if (u) u.hp = deriveStats(g.world, g.content, u).maxHp;
      g.step(1);
      if (until?.()) return;
    }
  }

  function beat(g: Engine, id: string, pct: number): void {
    const u = units(g)[id];
    if (!u) throw new Error('no boss');
    const max = deriveStats(g.world, g.content, u).maxHp;
    u.hp = Math.max(1, Math.round(max * pct));
  }

  it('the guardian raven summons, changes phase, and falls without dying', () => {
    const g = makeGame();
    const raven = Object.values(ents(g)).find((e) => e.ref === 'guardian_raven');
    if (!raven) throw new Error('no raven');
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: raven.mapId,
      x: raven.x + 1.2,
      y: raven.y,
    });
    g.step(1);
    withCtx(g, (ctx) => {
      const u = ctx.world.slices.combat.units.player;
      if (u) u.level = 40;
    });
    g.queue('combat.attack', { on: true, targetId: raven.id });
    fight(g, 5);
    beat(g, raven.id, 0.55);
    fight(g, 25);
    expect(events(g, 'combat.boss_phase').some((e) => e.data.bossId === 'guardian_raven')).toBe(
      true,
    );
    expect(
      Object.values(units(g)).filter((u) => u.summonerId === raven.id).length,
    ).toBeGreaterThanOrEqual(2);
    beat(g, raven.id, 0.03);
    fight(g, 200, () => !!g.world.meta.flags['boss.guardian_raven.defeated']);
    expect(g.world.meta.flags['boss.guardian_raven.defeated']).toBe(true);
    expect(g.world.meta.flags['boss.guardian_raven.yielded']).toBe(true);
    expect(ents(g)[raven.id]?.alive).toBe(true);
    expect(units(g)[raven.id]?.ai?.state).toBe('yielded');
    const feat = events(g, 'feat.performed').find(
      (e) => e.data.kind === 'boss_kill' && e.data.targetId === raven.id,
    );
    expect(feat?.data.note).toMatchObject({ key: 'sys.combat.feat.yielded' });
    expect(g.world.slices.inventory.owners.player?.items.raven_quill_charm).toBe(1);
    g.queue('flag.set', { key: 'companion.yeyu.recruited', value: true });
    g.step(2);
    expect(ents(g)[raven.id]).toBeUndefined();
    const flock = Object.values(units(g)).filter((u) => u.monsterId === 'raven_flock');
    expect(flock.length).toBeGreaterThan(0);
    expect(flock.every((u) => u.side === 'neutral')).toBe(true);
  });

  it('Sasha ramps up, retreats at 20% and leaves', () => {
    const g = makeGame();
    isolate(g);
    withCtx(g, (ctx) => {
      const u = ctx.world.slices.combat.units.player;
      if (u) u.level = 48;
    });
    const id = spawnNear(g, 'sasha', 48);
    g.queue('combat.attack', { on: true, targetId: id });
    fight(g, 20 * 11);
    expect(units(g)[id]?.auras.some((a) => a.id === 'aur_mon_tempering')).toBe(true);
    // a hair above the 20% line: an ungeared player chips the 18.2 health (hpMult 8.2) slowly
    beat(g, id, 0.2002);
    fight(g, 200, () => !!g.world.meta.flags['boss.sasha.defeated']);
    expect(g.world.meta.flags['boss.sasha.yielded']).toBe(true);
    expect(events(g, 'dialogue.line').some((e) => t(e.data.text).includes('看走眼'))).toBe(true);
    g.step(20 * 8);
    expect(ents(g)[id]).toBeUndefined();
  });

  it('spawns a scripted wave on combat.wave.<id> = go and reports it cleared', () => {
    const g = makeGame();
    g.queue('flag.set', { key: 'combat.wave.forest_vanguard', value: 'go' });
    g.step(2);
    const wave = g.world.slices.combat.waves.forest_vanguard;
    expect(wave?.members.length).toBe(4);
    expect(g.world.meta.flags['combat.wave.forest_vanguard.state']).toBe('active');
    expect(events(g, 'combat.wave_spawned').at(-1)?.data).toMatchObject({
      waveId: 'forest_vanguard',
      count: 4,
    });
    withCtx(g, (ctx) => {
      for (const id of wave?.members ?? []) {
        const e = ctx.world.slices.world.entities[id];
        if (e) e.alive = false;
      }
    });
    g.step(25);
    expect(g.world.meta.flags['combat.wave.forest_vanguard.state']).toBe('cleared');
    expect(events(g, 'combat.wave_cleared').some((e) => e.data.waveId === 'forest_vanguard')).toBe(
      true,
    );
  });

  it('ends a tide wave when its story beat is over (the dawn after the beast tide)', () => {
    const content = merge(PACKS);
    // the four tide waves of the real content end on the dawn flag
    const tides = content.waves.filter((w) => w.id.startsWith('tide_'));
    expect(tides.map((w) => w.endOnFlag)).toEqual(Array(4).fill('a1_beast_tide_cleared'));
    // the same rule on a combat map of this test world
    content.waves = [...content.waves];
    content.waves.push({
      id: 'test_tide',
      name: '测试兽潮',
      mapId: 'forest_edge',
      at: 'wolf_den',
      radius: 2,
      endOnFlag: 'a1_beast_tide_cleared',
      groups: [{ monster: 'dian_wolf', count: 5 }],
    });
    const g = Engine.create(7, content, SYSTEMS);
    g.queue('flag.set', { key: 'combat.wave.test_tide', value: 'go' });
    g.step(2);
    const wave = g.world.slices.combat.waves.test_tide;
    expect(wave?.members.length).toBe(5);
    const before = Object.keys(ents(g)).length;
    g.queue('flag.set', { key: 'a1_beast_tide_cleared', value: true });
    g.step(25);
    expect(Object.keys(ents(g)).length).toBe(before - 5);
    expect(g.world.meta.flags['combat.wave.test_tide.state']).toBe('cleared');
    // an ordinary wave without the beat flag stays
    g.queue('flag.set', { key: 'combat.wave.forest_vanguard', value: 'go' });
    g.step(25);
    expect(g.world.meta.flags['combat.wave.forest_vanguard.state']).toBe('active');
  });

  it('story bosses sync to the player only at or below the catch-up line (progression 4.3)', () => {
    /** Level of a monster after the player pulls it, with the act and player level set. */
    function pulled(act: string | null, playerLevel: number, monsterId: string, level: number) {
      const g = makeGame();
      isolate(g);
      if (act) g.queue('flag.set', { key: 'act', value: act });
      withCtx(g, (ctx) => {
        const u = ctx.world.slices.combat.units.player;
        if (u) u.level = playerLevel;
      });
      const id = spawnNear(g, monsterId, level, 3);
      expect(units(g)[id]?.level).toBe(level);
      g.queue('combat.attack', { on: true, targetId: id });
      // Idle monsters think on a staggered schedule (by id hash), so step until the first
      // pull rather than a fixed tick count.
      for (let i = 0; i < 80 && units(g)[id]?.ai?.state === 'idle'; i++) g.step(1);
      const u = units(g)[id];
      if (!u) throw new Error(`no ${monsterId}`);
      expect(u.ai?.state).not.toBe('idle');
      return { g, id, level: u.level, full: u.hp === deriveStats(g.world, g.content, u).maxHp };
    }
    // act 5 (band 55 to 60): the line is 53; partySync { offset: 0, min: 10 } (18.2)
    const atLine = pulled('act5', 53, 'faceless_king', 60);
    expect([atLine.level, atLine.full]).toEqual([53, true]);
    const below = pulled('act5', 20, 'faceless_king', 60);
    expect([below.level, below.full]).toEqual([20, true]);
    expect(pulled('act5', 54, 'faceless_king', 60).level).toBe(60);
    // act 2 (band 15 to 30): the line is 13; never below the sync floor (min 8)
    const rat = pulled('act2', 13, 'rat_king', 18);
    expect(rat.level).toBe(13);
    expect(pulled('act2', 5, 'rat_king', 18).level).toBe(8);
    expect(pulled('act2', 14, 'rat_king', 18).level).toBe(18);
    // synced down once, the boss is back at its design level when the next pull (after an
    // evade, say) finds the player over the line
    withCtx(rat.g, (ctx) => {
      const p = ctx.world.slices.combat.units.player;
      if (p) p.level = 14;
      const boss = ctx.world.slices.combat.units[rat.id];
      if (boss) syncToParty(ctx, boss);
    });
    expect(units(rat.g)[rat.id]?.level).toBe(18);
    // act 1 (band 1 to 15): the line is -1, so the colossus always keeps its design level;
    // outside the acts (prologue) nothing syncs either; ordinary monsters never sync
    expect(pulled('act1', 1, 'dian_colossus', 14).level).toBe(14);
    expect(pulled(null, 20, 'faceless_king', 60).level).toBe(60);
    expect(pulled('act5', 2, 'grey_wolf', 4).level).toBe(4);
  });
});

describe('presence, guards, queries, determinism', () => {
  it('freezes a low rank near the gatekeeper once, then lets them pass', () => {
    const g = makeGame();
    const ash = Object.values(ents(g)).find((e) => e.ref === 'ash');
    if (!ash) throw new Error('no ash');
    g.queue('world.teleport', { entityId: 'player', mapId: ash.mapId, x: ash.x + 1.5, y: ash.y });
    g.step(25);
    const felt = events(g, 'combat.presence_felt').find((e) => e.data.entityId === 'player');
    expect(felt?.data.gap).toBeGreaterThanOrEqual(3);
    expect(canMove(g.world, g.content)).toBe(false);
    g.step(20 * 4);
    expect(canMove(g.world, g.content)).toBe(true);
    expect(strengthReading(g.world, 'player', ash.id)).toBe('unreadable');
  });

  it('gives combat NPCs from other systems a unit and lets guards fight', () => {
    const g = makeGame();
    isolate(g);
    withCtx(g, (ctx) => {
      spawnEntity(ctx, {
        id: 'guard_1',
        kind: 'npc',
        name: '卫兵',
        mapId: 'seal_ruins',
        x: 18.5,
        y: 11.5,
        faction: 'town',
        appearance: { base: 'human', colors: ['#000000', '#000000', '#000000', '#000000'] },
        tags: ['npc', 'guard', 'lvl:12'],
      });
    });
    g.step(1);
    expect(units(g).guard_1).toMatchObject({ classId: 'warrior', level: 12, side: 'ally' });
    const id = spawnNear(g, 'dian_dreg', 1, 2);
    g.step(60);
    expect(
      events(g, 'combat.damage').some(
        (e) => e.data.sourceId === 'guard_1' && e.data.targetId === id,
      ),
    ).toBe(true);
  });

  it('exposes unit frames, target info and tab targets', () => {
    const g = makeGame();
    isolate(g);
    const id = spawnNear(g, 'dian_dreg', 1, 2);
    g.queue('combat.target', { targetId: id });
    g.step(1);
    const info = targetInfo(g.world, g.content);
    expect(info?.hostile).toBe(true);
    expect(info?.attackable).toBe(true);
    expect(info?.reading).toBe('similar');
    expect(info?.levelText).toBe('?');
    expect(info?.unit.maxHp).toBeGreaterThan(0);
    expect(enemiesNear(g.world, 5)).toContain(id);
    const view = unitView(g.world, g.content, 'player');
    expect(view).toMatchObject({
      level: 1,
      tier: 0,
      tierName: tr('sys.combat.tier.0'),
      side: 'ally',
      alive: true,
    });
  });

  it('names ranks, pools, level ranges and spawns with text keys', () => {
    const g = makeGame();
    isolate(g);
    const id = spawnNear(g, 'dian_dreg', 1, 2);
    expect(lastResult(g, 'combat.spawn')?.reason).toEqual(tr('sys.combat.info.spawned', { n: 1 }));
    expect(t(tr('sys.combat.info.spawned', { n: 3 }))).toBe('生成了 3 只');
    g.queue('flag.set', { key: 'feature.tide_sight', value: true });
    g.queue('combat.target', { targetId: id });
    g.step(1);
    const info = targetInfo(g.world, g.content);
    expect(info?.levelText).toEqual(tr('sys.combat.level_range', { lo: 1, hi: 3 }));
    expect(t(info?.levelText)).toBe('Lv 1 到 3');
    expect(t(tierName(7))).toBe('超越');
    expect(tierName(8)).toBe('');
    expect(t(resourceName('energy'))).toBe('气息');
    const a = tierName(1);
    const b = tierName(1);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('is deterministic for the same seed and inputs', () => {
    const run = (seed: number) => {
      const g = makeGame(seed);
      isolate(g);
      spawnNear(g, 'dian_rat', 2, 2);
      g.queue('flag.set', { key: 'combat.wave.ruins_unrest', value: 'go' });
      g.step(600);
      return worldHash(g.world);
    };
    expect(run(5)).toBe(run(5));
    expect(run(5)).not.toBe(run(6));
  });

  it('survives a save round trip mid-fight', () => {
    const g = makeGame(9);
    isolate(g);
    spawnNear(g, 'dian_rat', 2, 2);
    g.step(40);
    const copy = Engine.resume(JSON.parse(JSON.stringify(g.world)), g.content, g.systems);
    g.step(200);
    copy.step(200);
    expect(worldHash(copy.world)).toBe(worldHash(g.world));
  });
});
