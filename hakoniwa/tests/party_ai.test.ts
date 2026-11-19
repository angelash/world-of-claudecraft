// Companion combat AI (PK-M1-21; builtin_ai.md 11.1, companions_and_party.md 7.1 to 7.5,
// combat_and_classes.md 10.3 to 10.6): the stance the built-in AI picks per fight from the
// personality affinity and the party's state, the player's stance standing over it, the
// companion.tactics request and its fallback, the opening move, the spare rule, a protector
// peeling what strikes the player, the avoid layer's new dangers (hazard zones, marks on
// someone else, needsOrder), not walking into a warning to reach a target, Yeyu's ravens
// breaking the ash shell (a debuff that lands is a hit of its ability), the rescue bond, and
// the same acts in two runs of one seed. The real engine over the shipped content.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { Engine } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import type { GameSystem, SystemContext } from '../src/core/system';
import { createGame } from '../src/game/create';
import { system as ailments } from '../src/systems/ailments';
import { system as combat, unitOf } from '../src/systems/combat';
import type { TelegraphState } from '../src/systems/combat/mech_types';
import { deriveStats } from '../src/systems/combat/stats';
import type { MonsterDef } from '../src/systems/combat/types';
import { system as doors } from '../src/systems/doors';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { system as party } from '../src/systems/party';
import { spares } from '../src/systems/party/ai';
import { DEFAULT_TACTICS } from '../src/systems/party/config';
import { openingFor, scoreStances, type TacticsInputs } from '../src/systems/party/tactics';
import { system as travel } from '../src/systems/travel';
import { removeEntity, system as world } from '../src/systems/world';

const SYSTEMS: GameSystem[] = [modifiers, world, inventory, combat, party, doors, ailments, travel];

let shipped: ContentMap | undefined;
function content(): ContentMap {
  shipped ??= buildContent();
  return shipped;
}

/** A quiet test monster: never starts a fight on its own. */
const QUIET: MonsterDef = {
  id: 'zz_quiet',
  name: 'zz',
  desc: 'zz',
  family: 'beast',
  faction: 'monster',
  minLevel: 3,
  maxLevel: 3,
  aggroRadius: 0,
  leash: 40,
  appearance: { base: 'wolf', colors: ['#555555', '#777777', '#999999', '#bbbbbb'] },
};

/** A boss whose spread mark the companions answer only on the player's order (10.5). */
const MARKER: MonsterDef = {
  ...QUIET,
  id: 'zz_marker',
  mechanics: {
    marks: [
      { kind: 'spread', ability: 'zz_mark', count: 1, radius: 3, delay: 3, needsOrder: true },
    ],
  },
};

/** A boss whose shield breaks only to Yeyu's ravens (combat 10.4 `breakBy: ability`). */
const SHELLED: MonsterDef = {
  ...QUIET,
  id: 'zz_shelled',
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

/** A quiet monster that cannot move (it stays inside its warning). */
const ROOTED: MonsterDef = { ...QUIET, id: 'zz_rooted', speed: 0.001 };

function withFixtures(): ContentMap {
  const base = content();
  return {
    ...base,
    monsters: [...base.monsters, QUIET, ROOTED, MARKER, SHELLED],
  } as ContentMap;
}

function makeGame(seed = 7): Engine {
  const g = createGame({ seed, aiMode: 'off', content: withFixtures(), systems: SYSTEMS });
  g.queue('flag.set', { key: 'act', value: 'act1' });
  g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins', x: 32.5, y: 17.5 });
  g.step(1);
  return g;
}

function withCtx(g: Engine, fn: (ctx: SystemContext) => void, order = 999): void {
  const probe = { id: 'zz_probe', order, tick: (ctx: SystemContext) => fn(ctx) };
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

function recruit(g: Engine, ...ids: string[]): void {
  for (const id of ids) g.queue('flag.set', { key: `companion.${id}.recruited`, value: true });
  g.step(1);
}

function spawnAt(g: Engine, monsterId: string, level: number, dx: number, dy = 0): string {
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

const ents = (g: Engine) => g.world.slices.world.entities;
const units = (g: Engine) => g.world.slices.combat.units;
const member = (g: Engine, id: string) => {
  const m = g.world.slices.party.members[id];
  if (!m) throw new Error(`no member ${id}`);
  return m;
};
const maxHp = (g: Engine, id: string) => {
  const u = units(g)[id];
  if (!u) throw new Error(`no unit ${id}`);
  return deriveStats(g.world, g.content, u).maxHp;
};
const dist = (g: Engine, a: string, b: string) => {
  const ea = ents(g)[a];
  const eb = ents(g)[b];
  if (!ea || !eb) throw new Error('no entity');
  return Math.hypot(ea.x - eb.x, ea.y - eb.y);
};
const ai = (id: string) => content().companions.find((c) => c.id === id)?.ai;

const CALM: TacticsInputs = { full: false, low: false, hardStreak: 0, playerHp: 1, foes: 'even' };

// ---------------------------------------------------------------------------

describe('the stance score (builtin_ai.md 11.1)', () => {
  it('reads the personality affinity times 3 and never offers the passive stance', () => {
    const scored = scoreStances(DEFAULT_TACTICS, ai('ron'), 'passive', CALM);
    expect(scored.map((s) => s.id).sort()).toEqual(['assist', 'follow', 'stay']);
    const by = Object.fromEntries(scored.map((s) => [s.id, s.score]));
    // Ron: aggression 30, caution 70, protect 80
    expect(by).toEqual({ assist: 0.9, stay: 2.1, follow: 2.4 });
  });

  it('a full party tips toward assist (+2); low supplies or two hard fights toward stay (+2)', () => {
    const full = scoreStances(DEFAULT_TACTICS, ai('yeyu'), 'passive', { ...CALM, full: true });
    expect(full.find((s) => s.id === 'assist')?.score).toBe(3.5);
    const low = scoreStances(DEFAULT_TACTICS, ai('yeyu'), 'passive', { ...CALM, low: true });
    expect(low.find((s) => s.id === 'stay')?.score).toBe(3.2);
    const hard = scoreStances(DEFAULT_TACTICS, ai('yeyu'), 'passive', { ...CALM, hardStreak: 2 });
    expect(hard.find((s) => s.id === 'stay')?.score).toBe(3.2);
    const once = scoreStances(DEFAULT_TACTICS, ai('yeyu'), 'passive', { ...CALM, hardStreak: 1 });
    expect(once.find((s) => s.id === 'stay')?.score).toBe(1.2);
  });

  it('the player under half health tips toward follow (+3); the foes and inertia +1', () => {
    const hurt = scoreStances(DEFAULT_TACTICS, ai('shiya'), 'passive', { ...CALM, playerHp: 0.4 });
    expect(hurt.find((s) => s.id === 'follow')?.score).toBe(5.1);
    const half = scoreStances(DEFAULT_TACTICS, ai('shiya'), 'passive', { ...CALM, playerHp: 0.5 });
    expect(half.find((s) => s.id === 'follow')?.score).toBe(2.1);
    const weak = scoreStances(DEFAULT_TACTICS, ai('shiya'), 'passive', { ...CALM, foes: 'weak' });
    expect(weak.find((s) => s.id === 'assist')?.score).toBe(3.1);
    const strong = scoreStances(DEFAULT_TACTICS, ai('shiya'), 'passive', {
      ...CALM,
      foes: 'strong',
    });
    expect(strong.find((s) => s.id === 'stay')?.score).toBe(1.9);
    const kept = scoreStances(DEFAULT_TACTICS, ai('shiya'), 'stay', CALM);
    expect(kept.find((s) => s.id === 'stay')?.score).toBe(1.9);
  });

  it('each stance brings its opening move', () => {
    expect(openingFor('assist')).toBe('burst');
    expect(openingFor('stay')).toBe('buff');
    expect(openingFor('follow')).toBe('close');
  });
});

describe('the built-in AI picks a stance as a fight begins (companion.tactics)', () => {
  it('picks, files the request, and its fallback lands on the same stance', () => {
    const g = makeGame();
    recruit(g, 'ron');
    const foe = spawnAt(g, 'zz_quiet', 3, 4);
    g.queue('combat.attack', { on: true, targetId: foe });
    for (let i = 0; i < 40 && !lastResult(g, 'party.stance'); i++) g.step(1);
    const picks = events(g, 'party.tactics');
    expect(picks.length).toBe(1);
    expect(picks[0]?.data).toMatchObject({ companionId: 'ron', fight: 1, by: 'builtin' });
    expect(member(g, 'ron').order).toBe(picks[0]?.data.order);
    // aiMode off: the request's fallback came back as party.stance and was taken
    expect(lastResult(g, 'party.stance')?.ok).toBe(true);
  });

  it("the player's own stance stands: no pick for that companion", () => {
    const g = makeGame();
    recruit(g, 'ron');
    g.queue('party.order', { order: 'follow' });
    g.step(1);
    const foe = spawnAt(g, 'zz_quiet', 3, 4);
    g.queue('combat.attack', { on: true, targetId: foe });
    g.step(5);
    expect(events(g, 'party.tactics')).toEqual([]);
    expect(member(g, 'ron').order).toBe('follow');
    // handing it back to the AI: the next fight picks again
    g.queue('party.auto_stance', { on: true });
    g.step(1);
    expect(member(g, 'ron').stanceBy).toBeUndefined();
  });

  it('refuses the stance command from the player, a stale fight and the passive stance', () => {
    const g = makeGame();
    recruit(g, 'ron');
    g.queue('party.stance', { companionId: 'ron', order: 'stay', revision: 0 });
    g.step(1);
    expect(lastResult(g, 'party.stance')?.code).toBe('not_allowed');
    const script = { type: 'script' as const, script: 'test' };
    g.queue('party.stance', { companionId: 'ron', order: 'stay', revision: 9 }, script);
    g.step(1);
    expect(lastResult(g, 'party.stance')?.code).toBe('stale');
    g.queue('party.stance', { companionId: 'ron', order: 'passive', revision: 0 }, script);
    g.step(1);
    expect(lastResult(g, 'party.stance')?.code).toBe('bad_order');
    // a model or a fallback answers only for the companion its request named
    const other = { type: 'fallback' as const, agentId: 'shiya', requestId: 'zz' };
    g.queue('party.stance', { companionId: 'ron', order: 'stay', revision: 0 }, other);
    g.step(1);
    expect(lastResult(g, 'party.stance')?.code).toBe('not_allowed');
    // in fight 1 an answer for another fight is stale; one for this fight is taken
    const foe = spawnAt(g, 'zz_quiet', 3, 4);
    g.queue('combat.attack', { on: true, targetId: foe });
    for (let i = 0; i < 40 && !g.world.slices.party.fight?.on; i++) g.step(1);
    expect(g.world.slices.party.fight?.count).toBe(1);
    // the built-in pick's own fallback lands first
    g.step(3);
    g.queue('party.stance', { companionId: 'ron', order: 'stay', revision: 0 }, script);
    g.step(1);
    expect(lastResult(g, 'party.stance')?.code).toBe('stale');
    g.queue('party.stance', { companionId: 'ron', order: 'stay', revision: 1 }, script);
    g.step(1);
    expect(lastResult(g, 'party.stance')?.ok).toBe(true);
    expect(member(g, 'ron').order).toBe('stay');
  });

  it("a warning of the party's own side is no danger: it stays put", () => {
    const g = makeGame();
    recruit(g, 'shiya');
    g.queue('party.order', { order: 'passive' });
    g.step(20 * 3);
    const e = ents(g).companion_shiya;
    if (!e) throw new Error('no shiya');
    const tx = Math.floor(e.x);
    const ty = Math.floor(e.y);
    const cells: number[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) cells.push(tx + dx, ty + dy);
    g.world.slices.combat.telegraphs = {
      zz_own: {
        id: 'zz_own',
        casterId: 'player',
        mapId: e.mapId,
        kind: 'circle',
        tier: 'normal',
        cells,
        start: g.world.meta.tick,
        settle: g.world.meta.tick + 400,
      } as TelegraphState,
    };
    const x0 = e.x;
    const y0 = e.y;
    g.step(20 * 3);
    expect([e.x, e.y]).toEqual([x0, y0]);
  });

  it('a player under half health: the protective companion follows and steps to the player', () => {
    const g = makeGame();
    recruit(g, 'ron');
    const pu = units(g).player;
    if (!pu) throw new Error('no player');
    pu.hp = Math.floor(maxHp(g, 'player') * 0.3);
    const e = ents(g).companion_ron;
    if (!e) throw new Error('no ron');
    // Ron stands away; the fight begins
    g.queue('world.teleport', { entityId: 'companion_ron', mapId: e.mapId, x: e.x - 6, y: e.y });
    g.step(1);
    const foe = spawnAt(g, 'zz_quiet', 3, 4);
    g.queue('combat.attack', { on: true, targetId: foe });
    for (let i = 0; i < 40 && events(g, 'party.tactics').length === 0; i++) g.step(1);
    const pick = events(g, 'party.tactics')[0]?.data;
    expect(pick).toMatchObject({ order: 'follow', opening: 'close' });
    g.step(20 * 3);
    expect(dist(g, 'companion_ron', 'player')).toBeLessThanOrEqual(2.6);
  });

  it('a guard the AI set to follow answers what strikes the player, not only itself', () => {
    const g = makeGame();
    recruit(g, 'yeyu');
    const pu = units(g).player;
    if (!pu) throw new Error('no player');
    // under half (the guarding stance), over the three tenths of her own guard rule (7.4)
    pu.hp = Math.floor(maxHp(g, 'player') * 0.45);
    // the foe stands next to the player, who strikes it: it strikes back at the player
    const foe = spawnAt(g, 'zz_quiet', 3, 1);
    g.queue('combat.attack', { on: true, targetId: foe });
    for (let i = 0; i < 40 && events(g, 'party.tactics').length === 0; i++) g.step(1);
    expect(member(g, 'yeyu').order).toBe('follow');
    // the player holds at under half all along (her own guard rule stays out of it)
    const half = Math.floor(maxHp(g, 'player') * 0.45);
    for (let i = 0; i < 20 * 8; i++) {
      pu.hp = half;
      g.step(1);
    }
    expect(units(g)[foe]?.target).toBe('player');
    // she turned on it: a follow the player ordered would wait for it to strike her
    expect(units(g).companion_yeyu?.target).toBe(foe);
  });

  it('the stance holds for the fight; after it the companion is back on its own', () => {
    const g = makeGame();
    recruit(g, 'ron');
    const pu = units(g).player;
    if (!pu) throw new Error('no player');
    pu.hp = Math.floor(maxHp(g, 'player') * 0.3);
    expect(member(g, 'ron').order).toBe('assist');
    const foe = spawnAt(g, 'zz_quiet', 3, 4);
    g.queue('combat.attack', { on: true, targetId: foe });
    for (let i = 0; i < 40 && events(g, 'party.tactics').length === 0; i++) g.step(1);
    expect(member(g, 'ron').order).toBe('follow');
    withCtx(g, (ctx) => removeEntity(ctx, foe));
    for (let i = 0; i < 20 * 30 && g.world.slices.party.fight?.on; i++) g.step(1);
    expect(g.world.slices.party.fight?.on).toBe(false);
    expect(member(g, 'ron').order).toBe('assist');
    // the last fight's stance is what the inertia term reads at the next one
    expect(member(g, 'ron').stanceLast).toBe('follow');
    // the AI's picks are told as party.tactics, never as the player's party.order
    expect(events(g, 'party.order')).toEqual([]);
  });
});

describe("personality's rules in the duty layer (7.4)", () => {
  it('Shiya spares a fleeing beast; a beast standing its ground is fair game', () => {
    const card = content().companions.find((c) => c.id === 'shiya');
    if (!card) throw new Error('no shiya');
    expect(spares(card, 'beast', true)).toBe(true);
    expect(spares(card, 'beast', false)).toBe(false);
    expect(spares(card, 'humanoid', true)).toBe(false);
    const ron = content().companions.find((c) => c.id === 'ron');
    if (!ron) throw new Error('no ron');
    expect(spares(ron, 'beast', true)).toBe(false);
  });

  it("a protector peels what strikes the player before the player's own target", () => {
    for (const [who, want] of [
      ['yeyu', 'peel'],
      ['shiya', 'target'],
    ] as const) {
      const g = makeGame();
      recruit(g, who);
      g.queue('party.order', { order: 'assist' });
      g.step(1);
      const target = spawnAt(g, 'zz_quiet', 3, 5, 2);
      const biter = spawnAt(g, 'zz_quiet', 3, -2, -2);
      g.queue('combat.attack', { on: true, targetId: target });
      g.step(1);
      // the biter goes for the player and keeps at it
      const keep = (ctx: SystemContext) => {
        const b = unitOf(ctx.world, biter);
        if (b?.ai) {
          b.ai.state = 'chase';
          b.target = 'player';
        }
      };
      for (let i = 0; i < 20 * 3; i++) withCtx(g, keep, 21);
      const u = units(g)[`companion_${who}`];
      expect(u?.target).toBe(want === 'peel' ? biter : target);
    }
  });
});

describe('the avoid layer (7.1 layer 4, 7.5; combat 10.5, 10.6)', () => {
  it('steps off an arena hazard zone after the reaction delay', () => {
    const g = makeGame();
    recruit(g, 'shiya');
    g.queue('party.order', { order: 'passive' });
    g.step(20 * 3);
    const boss = spawnAt(g, 'zz_quiet', 3, 12);
    const e = ents(g).companion_shiya;
    if (!e) throw new Error('no shiya');
    const tx = Math.floor(e.x);
    const ty = Math.floor(e.y);
    g.world.slices.combat.terrain = {
      zz_haz: {
        id: 'zz_haz',
        bossId: boss,
        monsterId: 'zz_quiet',
        object: 'zz_haz',
        role: 'hazard',
        mapId: e.mapId,
        x: tx,
        y: ty,
        rect: [tx - 1, ty - 1, tx + 2, ty + 2],
        state: 'on',
      },
    };
    const chase = (ctx: SystemContext) => {
      const b = unitOf(ctx.world, boss);
      if (b?.ai) b.ai.state = 'chase';
    };
    const x0 = e.x;
    for (let i = 0; i < 8; i++) withCtx(g, chase, 21);
    // standard difficulty: 0.6 seconds before it moves
    expect(e.x).toBe(x0);
    for (let i = 0; i < 20 * 3; i++) withCtx(g, chase, 21);
    const inRect = e.x >= tx - 1 && e.x < tx + 2 && e.y >= ty - 1 && e.y < ty + 2;
    expect(inRect).toBe(false);
  });

  it("keeps out of a spread mark on the player and steps into a stack mark's circle", () => {
    for (const kind of ['spread', 'stack'] as const) {
      const g = makeGame();
      recruit(g, 'shiya');
      g.queue('party.order', { order: 'passive' });
      g.step(20 * 3);
      const p = ents(g).player;
      if (!p) throw new Error('no player');
      // spread: she stands next to the player; stack: six tiles off
      const at = kind === 'spread' ? p.x + 1 : p.x + 6;
      // the mark's caster is a foe far off (a warning of the party's own side is no danger)
      const boss = spawnAt(g, 'zz_quiet', 3, -12);
      g.queue('world.teleport', { entityId: 'companion_shiya', mapId: p.mapId, x: at, y: p.y });
      g.queue('party.order', { order: 'stay' });
      g.step(1);
      const t = {
        id: 'zz_mark',
        casterId: boss,
        mapId: p.mapId,
        kind: 'circle',
        tier: 'normal',
        cells: [Math.floor(p.x), Math.floor(p.y)],
        start: g.world.meta.tick,
        settle: g.world.meta.tick + 400,
        mark: { kind, targetId: 'player', radius: 3 },
      } as TelegraphState;
      g.world.slices.combat.telegraphs = { zz_mark: t };
      g.step(20 * 2);
      // once out, it stays out: the spot it holds is not pulled back into the circle
      let closest = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 40; i++) {
        g.step(1);
        closest = Math.min(closest, dist(g, 'companion_shiya', 'player'));
      }
      const d = dist(g, 'companion_shiya', 'player');
      if (kind === 'spread') {
        expect(d).toBeGreaterThanOrEqual(3.5);
        expect(closest).toBeGreaterThanOrEqual(3);
      } else expect(d).toBeLessThanOrEqual(3);
    }
  });

  it('a needsOrder mark waits for the spread order', () => {
    const g = makeGame();
    recruit(g, 'shiya');
    g.queue('party.order', { order: 'stay' });
    g.step(20 * 3);
    const boss = spawnAt(g, 'zz_marker', 3, 10);
    const p = ents(g).player;
    if (!p) throw new Error('no player');
    g.queue('world.teleport', { entityId: 'companion_shiya', mapId: p.mapId, x: p.x + 1, y: p.y });
    g.queue('party.order', { order: 'stay' });
    g.step(1);
    const t = {
      id: 'zz_mark',
      casterId: boss,
      abilityId: 'zz_mark',
      mapId: p.mapId,
      kind: 'circle',
      tier: 'normal',
      cells: [Math.floor(p.x), Math.floor(p.y)],
      start: g.world.meta.tick,
      settle: g.world.meta.tick + 2000,
      mark: { kind: 'spread', targetId: 'player', radius: 3 },
    } as TelegraphState;
    g.world.slices.combat.telegraphs = { zz_mark: t };
    g.step(20 * 3);
    expect(dist(g, 'companion_shiya', 'player')).toBeLessThan(2);
    g.queue('party.tactic', { tactic: 'spread' });
    g.step(20 * 3);
    expect(dist(g, 'companion_shiya', 'player')).toBeGreaterThanOrEqual(3.5);
  });

  it('a melee companion does not walk into a warning to reach its target', () => {
    const run = (warned: boolean) => {
      const g = makeGame();
      recruit(g, 'ron');
      g.queue('party.order', { order: 'assist' });
      g.step(20 * 2);
      const foe = spawnAt(g, 'zz_rooted', 3, 6);
      const fe = ents(g)[foe];
      if (!fe) throw new Error('no foe');
      if (warned) {
        const cells: number[] = [];
        for (let dx = -2; dx <= 2; dx++)
          for (let dy = -2; dy <= 2; dy++) cells.push(Math.floor(fe.x) + dx, Math.floor(fe.y) + dy);
        g.world.slices.combat.telegraphs = {
          zz_t: {
            id: 'zz_t',
            casterId: foe,
            mapId: fe.mapId,
            kind: 'pulse',
            tier: 'normal',
            cells,
            start: g.world.meta.tick,
            settle: g.world.meta.tick + 4000,
          } as TelegraphState,
        };
      }
      g.queue('combat.attack', { on: true, targetId: foe });
      g.step(20 * 4);
      return dist(g, 'companion_ron', foe);
    };
    expect(run(false)).toBeLessThan(2);
    expect(run(true)).toBeGreaterThan(2);
  });
});

describe("Yeyu's ravens and the ash shell (combat 10.4, 10.8)", () => {
  it('a landed swarm (a debuff, no damage) breaks the shield that names it, once', () => {
    const g = makeGame();
    recruit(g, 'yeyu');
    const id = spawnAt(g, 'zz_shelled', 3, 3);
    const u = units(g)[id];
    if (!u) throw new Error('no boss');
    u.boss = { start: g.world.meta.tick, shields: { zz_shell: { up: true, left: 500 } } };
    g.queue('combat.attack', { on: true, targetId: id });
    g.step(20 * 15);
    const broken = events(g, 'combat.boss_shield').filter(
      (e) => e.data.shieldId === 'zz_shell' && e.data.op === 'broken',
    );
    expect(broken.length).toBe(1);
    expect(u.boss.shields?.zz_shell?.broken).toBe(true);
  });

  it('a following Yeyu still turns her ravens on the shield (the boss strikes the player)', () => {
    const g = makeGame();
    recruit(g, 'yeyu');
    g.queue('party.order', { order: 'follow' });
    g.step(20 * 2);
    // the boss stands next to the player, who strikes it: it strikes back at the player
    const id = spawnAt(g, 'zz_shelled', 3, 1);
    const u = units(g)[id];
    if (!u) throw new Error('no boss');
    u.boss = { start: g.world.meta.tick, shields: { zz_shell: { up: true, left: 500 } } };
    g.queue('combat.attack', { on: true, targetId: id });
    g.step(20 * 15);
    expect(member(g, 'yeyu').order).toBe('follow');
    // only her ravens break this shell (breakRef), and the boss never struck her
    expect(u.target).not.toBe('companion_yeyu');
    expect(u.boss.shields?.zz_shell?.broken).toBe(true);
  });
});

describe('the rescue bond (companions_and_party.md 8.4 危急解围)', () => {
  /** A heal of `from` to `to` (shares of Ron's health) as combat lands it: hp first. */
  const healRon = (g: Engine, from: number, to: number) => {
    const ru = units(g).companion_ron;
    if (!ru) throw new Error('no ron');
    const max = maxHp(g, 'companion_ron');
    ru.hp = Math.max(1, Math.floor(max * from));
    g.step(5);
    withCtx(
      g,
      (ctx) => {
        const before = ru.hp;
        ru.hp = Math.floor(max * to);
        ctx.emit('combat.heal', {
          sourceId: 'player',
          targetId: 'companion_ron',
          amount: ru.hp - before,
          overheal: 0,
          crit: false,
        });
        // before the party's own tick, as combat lands a heal: the party snaps the healed health
      },
      1,
    );
  };

  it('the player healing a companion under a fifth of its health: +1 once a fight', () => {
    const g = makeGame();
    recruit(g, 'ron');
    const foe = spawnAt(g, 'zz_quiet', 3, 4);
    g.queue('combat.attack', { on: true, targetId: foe });
    g.step(5);
    const bond0 = member(g, 'ron').bond;
    // from a tenth to two fifths: the party snapped the healed health already, yet it counts
    healRon(g, 0.1, 0.4);
    expect(member(g, 'ron').bond).toBe(bond0 + 1);
    healRon(g, 0.05, 0.4);
    expect(member(g, 'ron').bond).toBe(bond0 + 1);
  });

  it('a heal from above a fifth is no rescue', () => {
    const g = makeGame();
    recruit(g, 'ron');
    const foe = spawnAt(g, 'zz_quiet', 3, 4);
    g.queue('combat.attack', { on: true, targetId: foe });
    g.step(5);
    const bond0 = member(g, 'ron').bond;
    healRon(g, 0.3, 0.6);
    expect(member(g, 'ron').bond).toBe(bond0);
  });
});

describe('determinism (17.5 战斗 确定性)', () => {
  it('two runs of one seed pick the same stances and act the same', () => {
    const run = () => {
      const g = makeGame(11);
      recruit(g, 'yeyu', 'shiya', 'ron');
      const foe = spawnAt(g, 'zz_quiet', 3, 4);
      g.queue('combat.attack', { on: true, targetId: foe });
      g.step(20 * 10);
      return {
        picks: events(g, 'party.tactics').map((e) => e.data),
        casts: events(g, 'combat.cast')
          .filter((e) => e.data.casterId.startsWith('companion_'))
          .map((e) => `${e.data.casterId}:${e.data.abilityId}`),
        at: ['companion_yeyu', 'companion_shiya', 'companion_ron'].map((id) => {
          const e = ents(g)[id];
          return e ? [e.x, e.y] : null;
        }),
      };
    };
    expect(run()).toEqual(run());
  });
});
