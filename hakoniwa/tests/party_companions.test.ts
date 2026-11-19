// Companions and party, first batch (PK-M1-15; companions_and_party.md 17.5, the M1 rows):
// recruit conditions, the act 1 places, parallel experience and catch-up, bond gates, red
// lines and the bond kept apart from trust, the focus order, Yeyu's personal rule, the
// determinism of the companions' acts, grave injury on a fatal blow, the one-way ironman
// switch; and the plan row's other items: rest days (U-10), the second down and defeat,
// ironman deaths and protection, the reaction delay to a ground warning, the pact door's
// retainers (feature servant), the hunting door's beast and its watch over a drop bag, the
// donkey, temporary companions, Shiya's family leaving, sediment exposure and crystallised
// bodies, the door-marked children, and waiting at a dungeon gate. The real engine over
// the shipped content with the registry flag guard on.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { Engine } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import type { GameSystem, SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../src/core/time';
import { createGame } from '../src/game/create';
import { system as ailments, readAilments } from '../src/systems/ailments';
import { system as combat, gainXp, reviveUnit, unitOf } from '../src/systems/combat';
import { resolveHit } from '../src/systems/combat/damage';
import type { TelegraphState } from '../src/systems/combat/mech_types';
import { deriveStats } from '../src/systems/combat/stats';
import type { MonsterDef } from '../src/systems/combat/types';
import { system as doors } from '../src/systems/doors';
import { evalKey } from '../src/systems/doors/keys';
import type { DoorDef } from '../src/systems/doors/types';
import { addItem, system as inventory, removeItem } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import {
  activeMount,
  bagKeeper,
  bondOf,
  catchUpFactor,
  DEFAULT_PARTY_CONFIG,
  isInParty,
  mountStops,
  system as party,
  recruitable,
  slotsUsed,
} from '../src/systems/party';
import { skipState, system as travel } from '../src/systems/travel';
import { spawnEntity, system as world } from '../src/systems/world';

const SYSTEMS: GameSystem[] = [modifiers, world, inventory, combat, party, doors, ailments, travel];

let shipped: ContentMap | undefined;
function content(): ContentMap {
  shipped ??= buildContent();
  return shipped;
}

/** A test monster: an eroded being that yields at 30% (a pact candidate). */
const ERODED: MonsterDef = {
  id: 'zz_eroded_hound',
  name: 'zz',
  desc: 'zz',
  family: 'beast',
  faction: 'monster',
  minLevel: 3,
  maxLevel: 3,
  aggroRadius: 0,
  leash: 30,
  tags: ['eroded'],
  mechanics: { yieldAtPct: 0.3 },
  appearance: { base: 'wolf', colors: ['#555555', '#777777', '#999999', '#bbbbbb'] },
};

/** A test boss whose shield breaks only to Yeyu's ravens (combat 10.4 `breakBy: ability`). */
const SHELLED: MonsterDef = {
  ...ERODED,
  id: 'zz_shelled',
  tags: [],
  mechanics: {
    shields: [
      {
        id: 'zz_shell',
        trigger: { phase: 1 },
        kind: 'absorb',
        amount: { base: 500, perLevel: 0 },
        breakBy: 'ability',
        breakRef: 'sk_yeyu_ravenswarm',
      },
    ],
  },
};

function withTestRows(): ContentMap {
  const base = content();
  const quests = [
    ...(base.quests ?? []),
    {
      id: 'q_zz_walk',
      act: 'act1',
      kind: 'side',
      title: 'zz',
      desc: 'zz',
      stages: [
        {
          id: 'walk',
          desc: 'zz',
          objectives: [{ type: 'accompany', npc: 'shiya', minutes: 30, label: 'zz' }],
        },
        { id: 'after', desc: 'zz', objectives: [] },
      ],
      rewards: [],
    },
  ];
  return {
    ...base,
    monsters: [...base.monsters, ERODED, SHELLED],
    quests,
  } as unknown as ContentMap;
}

function makeGame(opts: { seed?: number; content?: ContentMap; act?: string } = {}): Engine {
  const g = createGame({
    seed: opts.seed ?? 7,
    aiMode: 'off',
    content: opts.content ?? content(),
    systems: SYSTEMS,
  });
  g.queue('flag.set', { key: 'act', value: opts.act ?? 'act1' });
  // the empty sigil hall, away from the corridor monsters
  g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins', x: 32.5, y: 17.5 });
  g.step(1);
  return g;
}

/** Let game hours pass as one long skip (hour-coarse steps) and wait for its end. */
function skipHours(g: Engine, hours: number): void {
  g.queue('time.skip', { hours, kind: 'travel', mode: 'long' }, { type: 'script', script: 'test' });
  g.step(1);
  let guard = hours * 2 + 10;
  while (skipState(g.world) && guard-- > 0) g.step(1);
  if (skipState(g.world)) throw new Error('skip did not end');
  g.step(21);
}

function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe = { id: 'zz_probe', order: 999, tick: (ctx: SystemContext) => fn(ctx) };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
}

/** Run `fn` once at a given phase of the next tick (21: after combat, before the party). */
function withCtxAt(g: Engine, order: number, fn: (ctx: SystemContext) => void): void {
  const probe = { id: 'zz_probe_at', order, tick: (ctx: SystemContext) => fn(ctx) };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
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

function setFlags(g: Engine, values: Record<string, string | number | boolean>): void {
  for (const [key, value] of Object.entries(values)) g.queue('flag.set', { key, value });
  g.step(1);
}

function recruit(g: Engine, ...ids: string[]): void {
  for (const id of ids) g.queue('flag.set', { key: `companion.${id}.recruited`, value: true });
  g.step(1);
}

function spawnNear(g: Engine, monsterId: string, level: number, dx: number, dy = 0): string {
  const before = new Set(Object.keys(g.world.slices.world.entities));
  const p = g.world.slices.world.entities.player;
  g.queue('combat.spawn', {
    monsterId,
    mapId: p?.mapId,
    x: (p?.x ?? 0) + dx,
    y: (p?.y ?? 0) + dy,
    level,
  });
  g.step(1);
  const id = Object.keys(g.world.slices.world.entities).find((k) => !before.has(k));
  if (!id) throw new Error('spawn failed');
  return id;
}

const units = (g: Engine) => g.world.slices.combat.units;
const ents = (g: Engine) => g.world.slices.world.entities;
const member = (g: Engine, id: string) => g.world.slices.party.members[id];
const maxHp = (g: Engine, id: string) => {
  const u = units(g)[id];
  if (!u) throw new Error(`no unit ${id}`);
  return deriveStats(g.world, g.content, u).maxHp;
};
const recruitableNow = (g: Engine, id: string) => {
  let out = false;
  withCtx(g, (ctx) => {
    out = recruitable(ctx, id);
  });
  return out;
};

/** A hit that lands as it is (no roll) from `sourceId` on `targetId`. */
function hit(g: Engine, sourceId: string, targetId: string, amount: number): void {
  withCtxAt(g, 21, (ctx) => {
    const source = unitOf(ctx.world, sourceId);
    const target = unitOf(ctx.world, targetId);
    if (!source || !target) throw new Error('no units');
    resolveHit(ctx, { source, target, amount, school: 'arcane', kind: 'spell', noRoll: true });
  });
}

/** Give the player experience that the party does not share (the reason is not a quest). */
function playerToLevel(g: Engine, level: number): void {
  withCtx(g, (ctx) => {
    const u = unitOf(ctx.world, 'player');
    if (!u) return;
    while (u.level < level) gainXp(ctx, u, 1000, 'test');
  });
}

// ---------------------------------------------------------------------------
// 17.5 M1 rows

describe('recruitment conditions (17.5 招募 条件)', () => {
  it('Shiya refuses while the forest accord is broken and she did not stand through the tide', () => {
    const g = makeGame();
    setFlags(g, { a1_forest_accord: 'broken' });
    expect(recruitableNow(g, 'shiya')).toBe(false);
    g.queue('party.invite', { companionId: 'shiya' });
    g.step(1);
    expect(lastResult(g, 'party.invite')?.code).toBe('unwilling');
    // the story's recruit is refused too: the flag is put back, nothing joins
    recruit(g, 'shiya');
    expect(member(g, 'shiya')).toBeUndefined();
    expect(g.world.meta.flags['companion.shiya.recruited']).toBe(false);
    expect(events(g, 'party.refused').map((e) => e.data.companionId)).toContain('shiya');
  });

  it('either condition is enough: the accord not broken, or the tide night at her side', () => {
    const a = makeGame();
    expect(recruitableNow(a, 'shiya')).toBe(true);
    a.queue('party.invite', { companionId: 'shiya' });
    a.step(1);
    expect(lastResult(a, 'party.invite')?.ok).toBe(true);
    expect(isInParty(a.world, 'shiya')).toBe(true);

    const b = makeGame();
    setFlags(b, { a1_forest_accord: 'broken' });
    // she stands next to the player when the beast tide ends (the presence record)
    withCtx(b, (ctx) => {
      const p = ctx.world.slices.world.entities.player;
      spawnEntity(ctx, {
        id: 'npc_shiya',
        kind: 'npc',
        name: 'shiya',
        mapId: p?.mapId ?? 'seal_ruins',
        x: (p?.x ?? 0) + 2,
        y: p?.y ?? 0,
        faction: 'eastslope',
        appearance: { base: 'human', colors: ['#000000', '#000000', '#000000', '#000000'] },
        speed: 2.4,
        tags: [],
        ref: 'shiya',
      });
    });
    setFlags(b, { a1_beast_tide_cleared: true });
    expect(b.world.meta.flags.a1_tide_with_shiya).toBe(true);
    expect(recruitableNow(b, 'shiya')).toBe(true);
  });

  it('nobody far away is recorded as standing through the tide', () => {
    const g = makeGame();
    setFlags(g, { a1_forest_accord: 'broken', a1_beast_tide_cleared: true });
    expect(g.world.meta.flags.a1_tide_with_shiya).toBeUndefined();
    expect(recruitableNow(g, 'shiya')).toBe(false);
  });
});

describe('places in the party (17.5 队伍 随队位)', () => {
  it('act 1 takes three companions; the fourth stands by and cannot swap in', () => {
    const g = makeGame();
    setFlags(g, { a1_oola_fate: 'cleared' });
    recruit(g, 'yeyu', 'shiya', 'ron');
    expect(slotsUsed(g.world)).toBe(3);
    recruit(g, 'oola');
    expect(member(g, 'oola')?.state).toBe('standby');
    expect(ents(g).companion_oola).toBeUndefined();
    expect(isInParty(g.world, 'oola')).toBe(false);
    g.queue('party.swap', { inId: 'oola' });
    g.step(1);
    expect(lastResult(g, 'party.swap')?.code).toBe('party_full');
    expect(slotsUsed(g.world)).toBe(3);
  });

  it('from act 2 a fourth companion joins', () => {
    const g = makeGame();
    setFlags(g, { a1_oola_fate: 'cleared' });
    recruit(g, 'yeyu', 'shiya', 'ron', 'oola');
    expect(member(g, 'oola')?.state).toBe('standby');
    setFlags(g, { act: 'act2' });
    g.queue('party.swap', { inId: 'oola' });
    g.step(1);
    expect(lastResult(g, 'party.swap')?.ok).toBe(true);
    expect(isInParty(g.world, 'oola')).toBe(true);
    expect(slotsUsed(g.world)).toBe(4);
    // a level kept while standing by comes back with her (U-11: the character table's 27)
    expect(units(g).companion_oola?.level).toBe(27);
  });
});

describe('experience (17.5 成长)', () => {
  function killXp(withParty: boolean): number {
    const g = makeGame({ seed: 31 });
    if (withParty) recruit(g, 'yeyu', 'shiya', 'ron');
    const id = spawnNear(g, 'dian_dreg', 1, 2);
    const du = units(g)[id];
    if (du) du.hp = 1;
    g.queue('combat.attack', { on: true, targetId: id });
    for (let i = 0; i < 200 && ents(g)[id]?.alive; i++) g.step(1);
    return events(g, 'combat.xp')
      .filter(
        (e) =>
          e.data.entityId === 'player' &&
          typeof e.data.reason === 'string' &&
          e.data.reason.startsWith('kill:'),
      )
      .reduce((n, e) => n + e.data.amount, 0);
  }

  it('the player earns the same for a kill with or without companions (parallel)', () => {
    const alone = killXp(false);
    const together = killXp(true);
    expect(alone).toBeGreaterThan(0);
    expect(together).toBe(alone);
  });

  it('quest experience reaches each companion in full, without taking from the player', () => {
    const g = makeGame();
    playerToLevel(g, 6);
    recruit(g, 'shiya', 'ron');
    const p0 = units(g).player?.xp ?? 0;
    withCtx(g, (ctx) =>
      ctx.emit('xp.awarded', { entityId: 'player', amount: 300, reason: 'quest' }),
    );
    g.step(1);
    expect((units(g).player?.xp ?? 0) - p0).toBe(300);
    const quest = (id: string) =>
      events(g, 'combat.xp')
        .filter((e) => e.data.entityId === id && e.data.reason === 'quest')
        .map((e) => e.data.amount);
    // Shiya (5) beside a player at 6: the same 300, in parallel
    expect(quest('companion_shiya')).toEqual([300]);
    // Ron (11) stands above the player's level plus two: experience does not lift him further
    expect(quest('companion_ron')).toEqual([]);
    expect(units(g).companion_ron?.level).toBe(11);
  });

  it('catch-up: a companion eight levels under the player earns triple, three under double', () => {
    expect(catchUpFactor(DEFAULT_PARTY_CONFIG, 12, 20)).toBe(3);
    expect(catchUpFactor(DEFAULT_PARTY_CONFIG, 17, 20)).toBe(2);
    expect(catchUpFactor(DEFAULT_PARTY_CONFIG, 18, 20)).toBe(1);
    const g = makeGame();
    playerToLevel(g, 20);
    recruit(g, 'shiya');
    expect(units(g).companion_shiya?.level).toBe(5);
    withCtx(g, (ctx) =>
      ctx.emit('xp.awarded', { entityId: 'player', amount: 200, reason: 'quest' }),
    );
    g.step(1);
    const got = events(g, 'combat.xp').filter(
      (e) => e.data.entityId === 'companion_shiya' && e.data.reason === 'quest',
    );
    expect(got.map((e) => e.data.amount)).toEqual([600]);
  });

  it('catch-up adds to the kill share combat gives a companion far behind', () => {
    const g = makeGame({ seed: 41 });
    playerToLevel(g, 20);
    recruit(g, 'shiya');
    const id = spawnNear(g, 'dian_dreg', 5, 2);
    const du = units(g)[id];
    if (du) du.hp = 1;
    g.queue('combat.attack', { on: true, targetId: id });
    for (let i = 0; i < 200 && ents(g)[id]?.alive; i++) g.step(1);
    const xp = events(g, 'combat.xp').filter((e) => e.data.entityId === 'companion_shiya');
    const base = xp.find(
      (e) => typeof e.data.reason === 'string' && e.data.reason.startsWith('kill:'),
    );
    const top = xp.find((e) => e.data.reason === 'catchup');
    expect(base?.data.amount ?? 0).toBeGreaterThan(0);
    expect(top?.data.amount).toBe(Math.round((base?.data.amount ?? 0) * 2));
  });
});

describe('bonds (17.5 羁绊)', () => {
  it('daily sources stop at 59 before personal-line segment 2; the story does not', () => {
    const g = makeGame();
    recruit(g, 'shiya');
    const m = member(g, 'shiya');
    if (!m) throw new Error('no shiya');
    m.bond = 55;
    withCtx(g, (ctx) => addItem(ctx, 'player', 'wolf_pelt', 3));
    for (let i = 0; i < 3; i++) {
      g.queue('party.gift', { companionId: 'shiya', itemId: 'wolf_pelt' });
      g.step(1);
    }
    expect(bondOf(g.world, 'shiya')).toBe(59);
    // a shared kill at the gate adds nothing either
    const id = spawnNear(g, 'dian_dreg', 1, 2);
    const du = units(g)[id];
    if (du) du.hp = 1;
    g.queue('combat.attack', { on: true, targetId: id });
    for (let i = 0; i < 200 && ents(g)[id]?.alive; i++) g.step(1);
    expect(ents(g)[id]?.alive).toBe(false);
    expect(bondOf(g.world, 'shiya')).toBe(59);
    expect(member(g, 'shiya')?.bond).toBe(59);
    // a story flag of her card (the hunt done) is not gated
    setFlags(g, { 'quest.q_a1_m04_hunt': 'done' });
    expect(bondOf(g.world, 'shiya')).toBe(74);
    // the segment lifts the gate to 79 (a new week's gifts count again)
    g.queue(
      'party.segment',
      { companionId: 'shiya', stage: 2 },
      { type: 'script', script: 'test' },
    );
    g.step(1);
    skipHours(g, 24 * 7);
    expect(g.world.meta.flags['pl.shiya']).toBe(2);
    withCtx(g, (ctx) => addItem(ctx, 'player', 'wolf_pelt', 3));
    for (let i = 0; i < 3; i++) {
      g.queue('party.gift', { companionId: 'shiya', itemId: 'wolf_pelt' });
      g.step(1);
    }
    expect(bondOf(g.world, 'shiya')).toBe(79);
    // the player may not write a segment
    g.queue('party.segment', { companionId: 'shiya', stage: 3 });
    g.step(1);
    expect(lastResult(g, 'party.segment')?.code).toBe('not_allowed');
  });

  it("act 1 red line: grasping the sediment core costs Yeyu's bond 20 and raises the confrontation", () => {
    const g = makeGame();
    recruit(g, 'yeyu');
    const m = member(g, 'yeyu');
    if (!m) throw new Error('no yeyu');
    m.bond = 35;
    setFlags(g, { a1_core_choice: 'grasp' });
    expect(bondOf(g.world, 'yeyu')).toBe(15);
    const rl = events(g, 'party.red_line');
    expect(rl.map((e) => e.data)).toEqual([
      { companionId: 'yeyu', hook: 'RL-yeyu', delta: -20, count: 1 },
    ]);
    // once per line
    setFlags(g, { a1_core_choice_made: true });
    expect(bondOf(g.world, 'yeyu')).toBe(15);
  });

  it('the bond lives in the party slice: no flag, the bond key reads it, trust stays apart', () => {
    const g = makeGame();
    recruit(g, 'ron');
    const m = member(g, 'ron');
    if (!m) throw new Error('no ron');
    setFlags(g, { 'trust.ron': 10, 'trust.bron': 45 });
    m.bond = 65;
    m.reached.push(20, 40, 60);
    const door = { id: 'zz_door', keys: [] } as unknown as DoorDef;
    const bond = evalKey(
      g.world,
      door,
      { type: 'bond', companion: 'ron', min: 60, label: '' },
      '0',
    );
    expect(bond.met).toBe(true);
    // a threshold once crossed still counts after the bond falls
    m.bond = 30;
    expect(
      evalKey(g.world, door, { type: 'bond', companion: 'ron', min: 60, label: '' }, '0').met,
    ).toBe(true);
    // a person who is no companion: the key reads trust
    expect(
      evalKey(g.world, door, { type: 'trust', npc: 'bron', min: 40, label: '' }, '0').met,
    ).toBe(true);
    expect(g.world.meta.flags['trust.ron']).toBe(10);
    expect(Object.keys(g.world.meta.flags).some((k) => k.startsWith('bond.'))).toBe(false);
  });
});

describe('fighting (17.5 战斗)', () => {
  it('focus: after the order every companion targets what the player targets', () => {
    const g = makeGame();
    playerToLevel(g, 12);
    recruit(g, 'yeyu', 'shiya', 'ron');
    const a = spawnNear(g, 'grey_wolf', 12, 3, 2);
    const b = spawnNear(g, 'grey_wolf', 12, 3, -2);
    // the follow stance answers only what hits a companion: the wolves pick the companions
    g.queue('party.order', { order: 'follow' });
    g.step(1);
    for (const id of [a, b]) {
      const w = units(g)[id];
      if (w) w.threat.companion_ron = 1000;
    }
    g.step(20);
    g.queue('combat.target', { targetId: a });
    g.queue('party.tactic', { tactic: 'focus' });
    g.step(12);
    expect(lastResult(g, 'party.tactic')?.ok).toBe(true);
    for (const id of ['companion_yeyu', 'companion_shiya', 'companion_ron'])
      expect(units(g)[id]?.target).toBe(a);
  });

  it('Yeyu, passive, sends her ravens at whatever strikes a player under a third of health', () => {
    const g = makeGame();
    recruit(g, 'yeyu');
    g.queue('party.order', { order: 'passive' });
    g.step(1);
    const id = spawnNear(g, 'dian_dreg', 1, 1.5);
    g.queue('combat.attack', { on: true, targetId: id });
    g.step(20);
    const pu = units(g).player;
    if (!pu) throw new Error('no player');
    pu.hp = Math.round(maxHp(g, 'player') * 0.25);
    g.step(20 * 3);
    const rule = events(g, 'party.rule');
    expect(rule.map((e) => e.data)).toContainEqual({
      companionId: 'yeyu',
      rule: 'guard',
      targetId: id,
    });
    expect(
      events(g, 'combat.aura').some(
        (e) => e.data.targetId === id && e.data.auraId === 'aur_mon_blinded',
      ),
    ).toBe(true);
  });

  it('the companions act the same in two runs of the same seed and commands', () => {
    const run = () => {
      const g = makeGame({ seed: 99 });
      playerToLevel(g, 8);
      recruit(g, 'yeyu', 'shiya', 'ron');
      const id = spawnNear(g, 'grey_wolf', 6, 3);
      spawnNear(g, 'grey_wolf', 6, 4, 2);
      g.queue('combat.attack', { on: true, targetId: id });
      g.step(20 * 15);
      return g.world.recent
        .filter(
          (e) =>
            (e.kind === 'combat.cast' && e.data.casterId.startsWith('companion_')) ||
            (e.kind === 'combat.damage' && e.data.sourceId.startsWith('companion_')),
        )
        .map((e) => `${e.tick}:${e.kind}:${JSON.stringify(e.data)}`);
    };
    const first = run();
    expect(first.length).toBeGreaterThan(5);
    expect(run()).toEqual(first);
  });
});

describe('grave injury (17.5 重伤 条件; 11.2, 11.3)', () => {
  it('a blow that overflows by half the health or more sends the companion off to rest', () => {
    const g = makeGame();
    recruit(g, 'ron');
    const foe = spawnNear(g, 'dian_dreg', 1, 6);
    const ru = units(g).companion_ron;
    if (!ru) throw new Error('no ron');
    const max = maxHp(g, 'companion_ron');
    ru.hp = Math.round(max * 0.3);
    g.step(2);
    // overflow 0.7 of the health: fatal (an overflow counted from after the hit would also be)
    hit(g, foe, 'companion_ron', max);
    const w = events(g, 'party.wounded');
    expect(w.map((e) => [e.data.companionId, e.data.cause, e.data.days])).toEqual([
      ['ron', 'fatal', 3],
    ]);
    expect(member(g, 'ron')?.state).toBe('resting');
    expect(ents(g).companion_ron).toBeUndefined();
    expect(g.world.meta.flags['companion.ron.state']).toBe('resting');
  });

  it('a blow with little overflow only downs; the second down of one fight wounds', () => {
    const g = makeGame();
    recruit(g, 'ron');
    const foe = spawnNear(g, 'dian_dreg', 1, 6);
    const ru = units(g).companion_ron;
    if (!ru) throw new Error('no ron');
    const max = maxHp(g, 'companion_ron');
    ru.hp = Math.round(max * 0.3);
    g.step(2);
    // 0.6 of the health on 0.3 left: overflow 0.3, below the half (counted from after the
    // hit it would read 0.6 and wrongly send him off)
    hit(g, foe, 'companion_ron', Math.round(max * 0.6));
    expect(ru.downed).toBe(true);
    expect(member(g, 'ron')?.state).toBe('party');
    expect(events(g, 'party.wounded')).toEqual([]);
    // brought back up in the same fight, down again: off to rest (base 2 days, U-10)
    withCtx(g, (ctx) => {
      reviveUnit(ctx, ru, 0.01);
      ru.hp = 10;
      ru.combatUntil = ctx.tick + 400;
    });
    g.step(2);
    hit(g, foe, 'companion_ron', 12);
    const w = events(g, 'party.wounded');
    expect(w.map((e) => [e.data.cause, e.data.days])).toEqual([['second_down', 2]]);
  });

  it('rests two game days, then comes back to the party', () => {
    const g = makeGame();
    recruit(g, 'ron');
    g.queue('party.wound', { companionId: 'ron' }, { type: 'script', script: 'test' });
    g.step(1);
    expect(member(g, 'ron')?.state).toBe('resting');
    const w = events(g, 'party.wounded')[0];
    expect(w?.data).toMatchObject({ companionId: 'ron', cause: 'story', days: 2 });
    expect((w?.data.until ?? 0) - (w?.tick ?? 0)).toBe(2 * TICKS_PER_GAME_DAY);
    expect(g.world.meta.flags['companion.ron.injured_until']).toBe(2);
    skipHours(g, 24 * 2 + 1);
    expect(member(g, 'ron')?.state).toBe('party');
    expect(ents(g).companion_ron?.alive).toBe(true);
    expect(units(g).companion_ron?.level).toBe(11);
    expect(events(g, 'party.recovered').map((e) => e.data.companionId)).toEqual(['ron']);
  });

  it('the player falling while a companion is down is a defeat: grave injury', () => {
    const g = makeGame();
    recruit(g, 'ron');
    const foe = spawnNear(g, 'dian_dreg', 1, 6);
    const ru = units(g).companion_ron;
    if (!ru) throw new Error('no ron');
    ru.hp = 10;
    g.step(2);
    hit(g, foe, 'companion_ron', 12);
    expect(ru.downed).toBe(true);
    hit(g, foe, 'player', maxHp(g, 'player') * 3);
    expect(events(g, 'party.wounded').map((e) => e.data.cause)).toEqual(['defeat']);
  });
});

describe('ironman (17.5 铁人 单向; 11.4)', () => {
  it('turned off it stays off; turning it back on is refused', () => {
    const g = makeGame();
    setFlags(g, { ironman: true });
    expect(g.world.slices.party.ironman).toBe('on');
    g.queue('party.ironman_off', {});
    g.step(1);
    expect(lastResult(g, 'party.ironman_off')?.ok).toBe(true);
    expect(g.world.meta.flags.ironman).toBe(false);
    setFlags(g, { ironman: true });
    expect(g.world.meta.flags.ironman).toBe(false);
    expect(g.world.slices.party.ironman).toBe('off');
    expect(events(g, 'party.ironman').map((e) => e.data.op)).toEqual(['on', 'off', 'refused']);
    g.queue('party.ironman_off', {});
    g.step(1);
    expect(lastResult(g, 'party.ironman_off')?.code).toBe('not_ironman');
  });

  it('a run begun without ironman cannot turn it on later', () => {
    const g = makeGame();
    setFlags(g, { ironman: false });
    setFlags(g, { ironman: true });
    expect(g.world.meta.flags.ironman).toBe(false);
    expect(g.world.slices.party.ironman).toBe('off');
    expect(events(g, 'party.ironman').map((e) => e.data.op)).toEqual(['off', 'refused']);
  });

  it('under ironman an unprotected fall is a death at the spring; protection keeps it a wound', () => {
    const g = makeGame();
    setFlags(g, { ironman: true, a2_company_partner: true });
    recruit(g, 'ron', 'nera');
    g.queue('party.wound', { companionId: 'nera' }, { type: 'script', script: 'test' });
    g.queue('party.wound', { companionId: 'ron' }, { type: 'script', script: 'test' });
    g.step(1);
    expect(member(g, 'nera')?.state).toBe('spring');
    expect(g.world.meta.flags['companion.nera.state']).toBe('dead');
    // Ron is protected until the thousand legions door opens
    expect(member(g, 'ron')?.state).toBe('resting');
    skipHours(g, 24 * 7 + 1);
    expect(member(g, 'nera')?.state).toBe('dead');
    expect(g.world.meta.flags['companion.nera.lost']).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// the plan row's other items

describe('reaction delay to a ground warning (7.5)', () => {
  it('stands for the difficulty delay, then steps out of the marked area', () => {
    const g = makeGame({ content: withTestRows() });
    recruit(g, 'shiya');
    g.step(20 * 3);
    // the warning's caster is a foe far off (the party's own warnings are no danger)
    const foe = spawnNear(g, 'zz_eroded_hound', 3, -12);
    const e = ents(g).companion_shiya;
    if (!e) throw new Error('no shiya');
    const tx = Math.floor(e.x);
    const ty = Math.floor(e.y);
    const cells: number[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) cells.push(tx + dx, ty + dy);
    const t: TelegraphState = {
      id: 'zz_t',
      casterId: foe,
      mapId: e.mapId,
      kind: 'circle',
      tier: 'normal',
      cells,
      start: g.world.meta.tick,
      settle: g.world.meta.tick + 400,
    } as TelegraphState;
    g.world.slices.combat.telegraphs = { zz_t: t };
    // standard: 0.6 seconds (12 ticks) before the companion moves
    const x0 = e.x;
    const y0 = e.y;
    g.step(10);
    expect([e.x, e.y]).toEqual([x0, y0]);
    expect(e.move).toBeFalsy();
    g.step(20 * 2);
    const inside = cells.some(
      (c, i) => i % 2 === 0 && c === Math.floor(e.x) && cells[i + 1] === Math.floor(e.y),
    );
    expect(inside).toBe(false);
  });
});

describe('boss mechanics the companions answer (PK-M1-12 handover)', () => {
  it('a marked companion steps out of reach after the reaction delay', () => {
    const g = makeGame({ content: withTestRows() });
    recruit(g, 'shiya');
    g.step(20 * 3);
    const boss = spawnNear(g, 'zz_eroded_hound', 3, -12);
    const e = ents(g).companion_shiya;
    const p = ents(g).player;
    if (!e || !p) throw new Error('no shiya');
    const t = {
      id: 'zz_mark',
      casterId: boss,
      mapId: e.mapId,
      kind: 'circle',
      tier: 'normal',
      cells: [Math.floor(e.x), Math.floor(e.y)],
      start: g.world.meta.tick,
      settle: g.world.meta.tick + 400,
      mark: { kind: 'spread', targetId: 'companion_shiya', radius: 3 },
    } as TelegraphState;
    g.world.slices.combat.telegraphs = { zz_mark: t };
    g.step(20 * 3);
    expect(Math.hypot(e.x - p.x, e.y - p.y)).toBeGreaterThanOrEqual(3);
  });

  it('Yeyu turns her ravens on a shield that only they break', () => {
    const g = makeGame({ content: withTestRows() });
    recruit(g, 'yeyu');
    const id = spawnNear(g, 'zz_shelled', 3, 3);
    const u = units(g)[id];
    if (!u) throw new Error('no boss');
    u.boss = { start: g.world.meta.tick, shields: { zz_shell: { up: true, left: 500 } } };
    g.queue('combat.attack', { on: true, targetId: id });
    // she may first finish calling her imp
    g.step(20 * 15);
    expect(
      events(g, 'combat.cast').some(
        (e) =>
          e.data.casterId === 'companion_yeyu' &&
          e.data.abilityId === 'sk_yeyu_ravenswarm' &&
          e.data.targetId === id,
      ),
    ).toBe(true);
  });
});

describe("the pact door's retainers (thousand_doors.md 23 F, feature servant)", () => {
  it('without the feature the hand is not offered; with it a yielded eroded being is bound', () => {
    const g = makeGame({ content: withTestRows() });
    recruit(g, 'yeyu');
    const id = spawnNear(g, 'zz_eroded_hound', 3, 2);
    const u = units(g)[id];
    if (!u?.ai) throw new Error('no hound');
    u.ai.state = 'yielded';
    g.queue('party.pact', { targetId: id });
    g.step(1);
    expect(lastResult(g, 'party.pact')?.code).toBe('locked');
    setFlags(g, { 'feature.servant': true, door_fatigue: 10 });
    g.queue('party.pact', { targetId: id });
    g.step(1);
    expect(lastResult(g, 'party.pact')?.ok).toBe(true);
    const m = member(g, 'pet_retainer_zz_eroded_hound');
    expect(m?.pet).toMatchObject({ kind: 'retainer', monsterId: 'zz_eroded_hound' });
    expect(units(g)[m?.entityId ?? '']?.side).toBe('ally');
    expect(g.world.meta.flags.door_fatigue).toBe(30);
    // Yeyu and the retainer fill both servant places
    const id2 = spawnNear(g, 'zz_eroded_hound', 3, -2);
    const u2 = units(g)[id2];
    if (u2?.ai) u2.ai.state = 'yielded';
    g.queue('party.pact', { targetId: id2 });
    g.step(1);
    expect(lastResult(g, 'party.pact')?.code).toBe('no_place');
  });

  it('only a yielded being can be bound', () => {
    const g = makeGame({ content: withTestRows() });
    setFlags(g, { 'feature.servant': true });
    const id = spawnNear(g, 'zz_eroded_hound', 3, 2);
    g.queue('party.pact', { targetId: id });
    g.step(1);
    expect(lastResult(g, 'party.pact')?.code).toBe('not_bindable');
  });
});

describe("the hunting door's beast (2.3) and the drop bag", () => {
  it('tames a wolf once the door is open; it takes no place and keeps the 15.2 level', () => {
    const g = makeGame();
    playerToLevel(g, 6);
    recruit(g, 'yeyu', 'shiya', 'ron');
    const id = spawnNear(g, 'grey_wolf', 3, 2);
    g.queue('party.tame', { targetId: id });
    g.step(1);
    expect(lastResult(g, 'party.tame')?.code).toBe('locked');
    setFlags(g, { 'door.vocation_hunter': true, door_rank: 5 });
    g.queue('party.tame', { targetId: id });
    g.step(1);
    expect(lastResult(g, 'party.tame')?.ok).toBe(true);
    const m = member(g, 'pet_ashgrey_wolf');
    expect(m?.state).toBe('party');
    expect(slotsUsed(g.world)).toBe(3);
    // min(door rank 5, cap 20, player 6 + 2)
    expect(units(g)[m?.entityId ?? '']?.level).toBe(5);
    setFlags(g, { door_rank: 30 });
    expect(units(g)[m?.entityId ?? '']?.level).toBe(8);
    const other = spawnNear(g, 'grey_wolf', 3, -2);
    g.queue('party.tame', { targetId: other });
    g.step(1);
    expect(lastResult(g, 'party.tame')?.code).toBe('one_pet');
  });

  it('a bag-keeping beast stays by what the player left until it is taken back', () => {
    const g = makeGame();
    setFlags(g, { 'door.vocation_hunter': true, door_rank: 10 });
    const id = spawnNear(g, 'dian_boar', 3, 2);
    g.queue('party.tame', { targetId: id });
    g.step(1);
    const m = member(g, 'pet_cleanmane_boar');
    if (!m) throw new Error('no boar');
    const pe = ents(g).player;
    g.world.slices.combat.bags = {
      zz_bag: {
        id: 'zz_bag',
        ownerId: 'player',
        mapId: pe?.mapId ?? 'seal_ruins',
        // away from the player, who would take it back at once standing on it
        x: (pe?.x ?? 0) + 6,
        y: pe?.y ?? 0,
        items: [],
        money: 5,
        expires: g.world.meta.tick + TICKS_PER_GAME_DAY,
      },
    };
    withCtx(g, (ctx) =>
      ctx.emit('combat.bag', {
        bagId: 'zz_bag',
        ownerId: 'player',
        op: 'dropped',
        mapId: pe?.mapId ?? 'seal_ruins',
        items: [],
        money: 5,
      }),
    );
    expect(bagKeeper(g.world, 'zz_bag')).toBe(m.entityId);
    g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins_depths', x: 12.5, y: 17.5 });
    g.step(20 * 2);
    expect(ents(g)[m.entityId]?.mapId).toBe('seal_ruins');
    withCtx(g, (ctx) =>
      ctx.emit('combat.bag', {
        bagId: 'zz_bag',
        ownerId: 'player',
        op: 'reclaimed',
        mapId: 'seal_ruins',
        items: [],
        money: 5,
      }),
    );
    expect(bagKeeper(g.world, 'zz_bag')).toBeNull();
    g.step(20 * 2);
    expect(ents(g)[m.entityId]?.mapId).toBe('seal_ruins_depths');
  });
});

describe('the donkey (catalog_creatures_mounts.md 10)', () => {
  it('rides a donkey the player holds; it stops at sediment 3; selling it ends the ride', () => {
    const g = makeGame();
    g.queue('party.ride', { mountId: 'mnt_donkey' });
    g.step(1);
    expect(lastResult(g, 'party.ride')?.code).toBe('missing');
    withCtx(g, (ctx) => addItem(ctx, 'player', 'mnt_donkey', 1));
    g.queue('party.ride', { mountId: 'mnt_donkey' });
    g.step(1);
    expect(activeMount(g.world, g.content)?.dayKm).toBe(27.5);
    expect(mountStops(g.world, g.content, 2)).toBe(false);
    expect(mountStops(g.world, g.content, 3)).toBe(true);
    withCtx(g, (ctx) => removeItem(ctx, 'player', 'mnt_donkey', 1, 'sold'));
    expect(g.world.slices.party.mount).toBeUndefined();
    expect(activeMount(g.world, g.content)).toBeNull();
  });
});

describe('temporary companions (escort, rescue, accompany)', () => {
  it('a carded person walks and fights with the player for the quest stage only', () => {
    const g = makeGame({ content: withTestRows() });
    withCtx(g, (ctx) => {
      const p = ctx.world.slices.world.entities.player;
      spawnEntity(ctx, {
        id: 'npc_shiya',
        kind: 'npc',
        name: 'shiya',
        mapId: p?.mapId ?? 'seal_ruins',
        x: (p?.x ?? 0) + 1,
        y: p?.y ?? 0,
        faction: 'eastslope',
        appearance: { base: 'human', colors: ['#000000', '#000000', '#000000', '#000000'] },
        speed: 2.4,
        // a person with a class has a combat unit of her own (combat gives NPCs one)
        tags: ['class:hunter'],
        ref: 'shiya',
      });
    });
    setFlags(g, { 'quest.q_zz_walk': 'active', 'quest.q_zz_walk.stage': 'walk' });
    withCtx(g, (ctx) => ctx.emit('quest.stage', { questId: 'q_zz_walk', stage: 0, desc: 'zz' }));
    const m = member(g, 'shiya');
    expect(m?.temp).toEqual({ questId: 'q_zz_walk', stage: 'walk' });
    expect(units(g).npc_shiya?.side).toBe('ally');
    // no place taken, not "in the party" for a dungeon's cap
    expect(slotsUsed(g.world)).toBe(0);
    expect(isInParty(g.world, 'shiya')).toBe(false);
    setFlags(g, { 'quest.q_zz_walk.stage': 'after' });
    g.step(20);
    expect(member(g, 'shiya')).toBeUndefined();
    expect(ents(g).npc_shiya?.alive).toBe(true);
  });
});

describe("Shiya and her family's eviction (act1_borderstone.md 4.4)", () => {
  it('leaves with her family below trust 70 and comes back in act 2; at 70 she stays', () => {
    const a = makeGame();
    recruit(a, 'shiya');
    setFlags(a, { 'trust.shiya': 50 });
    setFlags(a, { a1_shiya_family: 'left' });
    expect(member(a, 'shiya')?.state).toBe('away');
    expect(a.world.meta.flags['companion.shiya.state']).toBe('left');
    expect(ents(a).companion_shiya).toBeUndefined();
    setFlags(a, { act: 'act2', act_week: 5 });
    expect(member(a, 'shiya')?.state).toBe('party');

    const b = makeGame();
    recruit(b, 'shiya');
    setFlags(b, { 'trust.shiya': 75 });
    setFlags(b, { a1_shiya_family: 'left' });
    expect(member(b, 'shiya')?.state).toBe('party');
  });
});

describe('sediment exposure (progression 9; PK-M1-51 handover)', () => {
  it('enrols companions and named people each hour, never the door-marked', () => {
    const g = makeGame();
    recruit(g, 'ron');
    withCtx(g, (ctx) => {
      const p = ctx.world.slices.world.entities.player;
      const at = { mapId: p?.mapId ?? 'seal_ruins', x: (p?.x ?? 0) + 3, y: p?.y ?? 0 };
      const look = { base: 'human', colors: ['#000000', '#000000', '#000000', '#000000'] };
      spawnEntity(ctx, {
        id: 'npc_bron',
        kind: 'npc',
        name: 'bron',
        ...at,
        faction: 'town',
        appearance: look,
        speed: 2,
        tags: [],
        ref: 'bron',
      });
      spawnEntity(ctx, {
        id: 'npc_noi',
        kind: 'npc',
        name: 'noi',
        ...at,
        faction: 'town',
        appearance: look,
        speed: 2,
        tags: ['child', 'door_mark'],
        ref: 'noi',
      });
    });
    g.step(TICKS_PER_GAME_HOUR + 5);
    const bodies = readAilments(g.world)?.bodies ?? {};
    expect(Object.keys(bodies)).toEqual(expect.arrayContaining(['companion_ron', 'npc_bron']));
    expect(bodies.npc_noi).toBeUndefined();
    // story taint on a door-marked child is washed off within the hour
    g.queue(
      'ailments.taint',
      { entityId: 'npc_noi', amount: 30 },
      { type: 'script', script: 'test' },
    );
    g.step(TICKS_PER_GAME_HOUR + 5);
    expect(readAilments(g.world)?.bodies.npc_noi?.taint ?? 0).toBe(0);
  });

  it('a crystallised companion leaves gravely hurt with taint 50; a named mortal dies', () => {
    const g = makeGame();
    recruit(g, 'ron');
    withCtx(g, (ctx) => {
      const p = ctx.world.slices.world.entities.player;
      spawnEntity(ctx, {
        id: 'npc_bron',
        kind: 'npc',
        name: 'bron',
        mapId: p?.mapId ?? 'seal_ruins',
        x: (p?.x ?? 0) + 3,
        y: p?.y ?? 0,
        faction: 'town',
        appearance: { base: 'human', colors: ['#000000', '#000000', '#000000', '#000000'] },
        speed: 2,
        tags: [],
        ref: 'bron',
      });
    });
    withCtx(g, (ctx) => {
      ctx.emit('ailments.crystal_due', { entityId: 'companion_ron', days: 7 });
      ctx.emit('ailments.crystal_due', { entityId: 'npc_bron', days: 7 });
    });
    expect(member(g, 'ron')?.state).toBe('resting');
    expect(member(g, 'ron')?.body?.taint).toBe(50);
    expect(events(g, 'party.wounded').map((e) => e.data.cause)).toEqual(['crystal']);
    expect(ents(g).npc_bron?.alive).toBe(false);
    expect(events(g, 'entity.died').some((e) => e.data.ref === 'bron')).toBe(true);
  });
});

describe('waiting at a dungeon gate (PK-M1-50 handover)', () => {
  it('a waiting companion stays put, is not counted in the party, and comes when called', () => {
    const g = makeGame();
    recruit(g, 'ron', 'shiya');
    g.queue('party.wait', { companionId: 'ron', on: true });
    g.step(1);
    expect(member(g, 'ron')?.state).toBe('waiting');
    expect(isInParty(g.world, 'ron')).toBe(false);
    expect(isInParty(g.world, 'shiya')).toBe(true);
    // still holds its place
    expect(slotsUsed(g.world)).toBe(2);
    g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins_depths', x: 12.5, y: 17.5 });
    g.step(20 * 2);
    expect(ents(g).companion_ron?.mapId).toBe('seal_ruins');
    expect(ents(g).companion_shiya?.mapId).toBe('seal_ruins_depths');
    g.queue('party.wait', { companionId: 'ron', on: false });
    g.step(20 * 2);
    expect(member(g, 'ron')?.state).toBe('party');
    expect(ents(g).companion_ron?.mapId).toBe('seal_ruins_depths');
  });
});

describe('red lines, three times (8.5)', () => {
  it('a third red line sends a main companion cold; a reconciliation brings it back', () => {
    const g = makeGame();
    recruit(g, 'yeyu');
    const m = member(g, 'yeyu');
    if (!m) throw new Error('no yeyu');
    m.redLines = ['RL-yeyu#8', 'RL-yeyu#9'];
    setFlags(g, { a1_core_choice: 'grasp' });
    expect(m.state).toBe('cold');
    g.queue('party.swap', { inId: 'yeyu' });
    g.step(1);
    expect(lastResult(g, 'party.swap')?.code).toBe('cold');
    g.queue('party.reconcile', { companionId: 'yeyu' }, { type: 'script', script: 'test' });
    g.step(1);
    expect(m.state).toBe('party');
  });
});

describe('the roster keeps what a companion carries (review fixes)', () => {
  it('a companion benched and back the same day keeps its taint, not twice it', () => {
    const g = makeGame();
    setFlags(g, { act: 'act2' });
    recruit(g, 'ron', 'shiya');
    g.queue(
      'ailments.taint',
      { entityId: 'companion_ron', amount: 30 },
      { type: 'script', script: 'test' },
    );
    g.step(1);
    expect(readAilments(g.world)?.bodies.companion_ron?.taint).toBe(30);
    g.queue('party.dismiss', { companionId: 'ron' });
    g.step(1);
    expect(readAilments(g.world)?.bodies.companion_ron).toBeUndefined();
    expect(member(g, 'ron')?.body?.taint).toBe(30);
    g.queue('party.swap', { inId: 'ron' });
    g.step(2);
    expect(member(g, 'ron')?.state).toBe('party');
    expect(readAilments(g.world)?.bodies.companion_ron?.taint).toBe(30);
  });

  it('out and back in within one tick: the companion returns with its unit and level', () => {
    const g = makeGame();
    setFlags(g, { act: 'act2' });
    recruit(g, 'ron');
    g.queue('party.dismiss', { companionId: 'ron' });
    g.queue('party.swap', { inId: 'ron' });
    g.step(3);
    expect(member(g, 'ron')?.state).toBe('party');
    expect(ents(g).companion_ron?.alive).toBe(true);
    expect(units(g).companion_ron?.level).toBe(11);
  });

  it('a third red line crossed while resting keeps the companion cold after the rest', () => {
    const g = makeGame();
    recruit(g, 'yeyu');
    const m = member(g, 'yeyu');
    if (!m) throw new Error('no yeyu');
    m.redLines = ['RL-yeyu|zz_a', 'RL-yeyu|zz_b'];
    g.queue('party.wound', { companionId: 'yeyu' }, { type: 'script', script: 'test' });
    g.step(1);
    setFlags(g, { a1_core_choice: 'grasp' });
    expect(m.cold).toBe(true);
    expect(m.state).toBe('resting');
    skipHours(g, 24 * 2 + 1);
    expect(m.state).toBe('cold');
    expect(ents(g).companion_yeyu).toBeUndefined();
  });

  it('a red line that already held when she joined neither costs bond nor counts', () => {
    const g = makeGame();
    setFlags(g, { a1_core_choice: 'grasp' });
    recruit(g, 'yeyu');
    expect(bondOf(g.world, 'yeyu')).toBe(0);
    expect(events(g, 'party.red_line')).toEqual([]);
    expect(member(g, 'yeyu')?.redLines ?? []).toEqual([]);
  });

  it('a personal-line segment reported twice changes the bond once', () => {
    const g = makeGame();
    recruit(g, 'shiya');
    for (let i = 0; i < 3; i++)
      g.queue(
        'party.segment',
        { companionId: 'shiya', stage: 1, bond: 10 },
        { type: 'script', script: 'test' },
      );
    g.step(1);
    expect(bondOf(g.world, 'shiya')).toBe(10);
    expect(g.world.meta.flags['pl.shiya']).toBe(1);
  });

  it('an older save with ironman on but no party record still counts as ironman', () => {
    const g = makeGame();
    setFlags(g, { a2_company_partner: true });
    recruit(g, 'nera');
    g.world.meta.flags.ironman = true;
    delete g.world.slices.party.ironman;
    g.queue('party.wound', { companionId: 'nera' }, { type: 'script', script: 'test' });
    g.step(1);
    expect(member(g, 'nera')?.state).toBe('spring');
  });
});
