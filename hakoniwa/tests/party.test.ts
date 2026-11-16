// Party system: recruitment by flag, level scaling, following across maps, assisting,
// healing and taunting, party orders, bonds (gifts, shared kills, story flags, threshold
// flags), being downed and getting back up, and leaving. Runs the real engine with the
// kernel systems plus combat, party and doors.

import { describe, expect, it } from 'vitest';
import type { ContentPack } from '../src/content/pack';
import { pack as combatPack } from '../src/content/packs/combat';
import { pack as doorsPack } from '../src/content/packs/doors';
import { pack as invPack } from '../src/content/packs/inventory';
import { pack as partyPack } from '../src/content/packs/party';
import { pack as worldPack } from '../src/content/packs/world';
import { Engine } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import type { SystemContext } from '../src/core/system';
import { tr } from '../src/core/text';
import { t } from '../src/shared_ui/i18n';
import { system as combat } from '../src/systems/combat';
import { deriveStats } from '../src/systems/combat/stats';
import { system as doors } from '../src/systems/doors';
import { addItem, system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { bondOf, bondReached, isInParty, system as party, partyView } from '../src/systems/party';
import { system as world } from '../src/systems/world';

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

function makeGame(seed = 5): Engine {
  return Engine.create(seed, merge([worldPack, invPack, combatPack, partyPack, doorsPack]), [
    modifiers,
    world,
    inventory,
    combat,
    party,
    doors,
  ]);
}

function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe = { id: 'zz_probe', order: 999, tick: (ctx: SystemContext) => fn(ctx) };
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

/** The empty sigil hall, away from the corridor monsters. */
function isolate(g: Engine): void {
  g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins', x: 18.5, y: 9.5 });
  g.step(1);
}

function spawnNear(g: Engine, monsterId: string, level: number, dx: number): string {
  const before = new Set(Object.keys(g.world.slices.world.entities));
  const p = g.world.slices.world.entities.player;
  g.queue('combat.spawn', { monsterId, mapId: p?.mapId, x: (p?.x ?? 0) + dx, y: p?.y ?? 0, level });
  g.step(1);
  const id = Object.keys(g.world.slices.world.entities).find((k) => !before.has(k));
  if (!id) throw new Error('spawn failed');
  return id;
}

const ents = (g: Engine) => g.world.slices.world.entities;
const units = (g: Engine) => g.world.slices.combat.units;

describe('recruitment', () => {
  it('spawns a companion beside the player when companion.<id>.recruited turns true', () => {
    const g = makeGame();
    expect(isInParty(g.world, 'shiya')).toBe(false);
    recruit(g, 'shiya');
    const e = ents(g).companion_shiya;
    const p = ents(g).player;
    expect(e).toMatchObject({ kind: 'companion', ref: 'shiya', mapId: p?.mapId });
    expect(Math.hypot((e?.x ?? 0) - (p?.x ?? 0), (e?.y ?? 0) - (p?.y ?? 0))).toBeLessThan(3);
    expect(units(g).companion_shiya).toMatchObject({ classId: 'hunter', side: 'ally', level: 5 });
    expect(events(g, 'party.joined').map((x) => x.data.companionId)).toEqual(['shiya']);
    expect(partyView(g.world, g.content)[0]).toMatchObject({
      id: 'shiya',
      className: '猎人',
      order: 'assist',
    });
  });

  it('scales companion levels with the player', () => {
    const g = makeGame();
    recruit(g, 'yeyu', 'ron');
    expect(units(g).companion_yeyu?.level).toBe(3);
    withCtx(g, (ctx) =>
      ctx.emit('xp.awarded', { entityId: 'player', amount: 60000, reason: 'test' }),
    );
    g.step(1);
    const pl = units(g).player?.level ?? 0;
    expect(pl).toBeGreaterThan(10);
    expect(units(g).companion_yeyu?.level).toBe(pl + 1);
    expect(units(g).companion_ron?.level).toBe(pl);
    expect(ents(g).companion_ron?.tags).toContain(`lvl:${pl}`);
  });

  it('leaves when the recruited flag is cleared', () => {
    const g = makeGame();
    recruit(g, 'nera');
    g.queue('flag.set', { key: 'companion.nera.recruited', value: false });
    g.step(1);
    expect(ents(g).companion_nera).toBeUndefined();
    expect(units(g).companion_nera).toBeUndefined();
    expect(isInParty(g.world, 'nera')).toBe(false);
  });
});

describe('following and fighting', () => {
  it('follows the player to another map and keeps formation', () => {
    const g = makeGame();
    recruit(g, 'ron');
    g.queue('world.teleport', { entityId: 'player', mapId: 'forest_edge', x: 8.5, y: 11.5 });
    g.step(2);
    expect(ents(g).companion_ron?.mapId).toBe('forest_edge');
    g.queue('world.move_to', { entityId: 'player', x: 18.5, y: 16.5 });
    g.step(20 * 6);
    const p = ents(g).player;
    const r = ents(g).companion_ron;
    expect(Math.hypot((r?.x ?? 0) - (p?.x ?? 0), (r?.y ?? 0) - (p?.y ?? 0))).toBeLessThan(4);
  });

  it('assists: attacks the player target', () => {
    const g = makeGame();
    isolate(g);
    recruit(g, 'ron');
    const id = spawnNear(g, 'dian_dreg', 1, 3);
    g.queue('combat.attack', { on: true, targetId: id });
    g.step(20 * 6);
    expect(
      events(g, 'combat.damage').some(
        (e) => e.data.sourceId === 'companion_ron' && e.data.targetId === id,
      ),
    ).toBe(true);
  });

  it('healers heal the most wounded member', () => {
    const g = makeGame();
    isolate(g);
    recruit(g, 'oola');
    const u = units(g).player;
    if (!u) throw new Error('no player');
    const max = deriveStats(g.world, g.content, u).maxHp;
    u.hp = Math.round(max * 0.3);
    g.step(20 * 6);
    expect(
      events(g, 'combat.heal').some(
        (e) => e.data.sourceId === 'companion_oola' && e.data.targetId === 'player',
      ),
    ).toBe(true);
  });

  it('tanks taunt enemies off the player', () => {
    const g = makeGame();
    isolate(g);
    withCtx(g, (ctx) =>
      ctx.emit('xp.awarded', { entityId: 'player', amount: 60000, reason: 'test' }),
    );
    g.step(1);
    recruit(g, 'ron');
    const id = spawnNear(g, 'grey_wolf', units(g).player?.level ?? 10, 1.2);
    g.queue('combat.target', { targetId: id });
    g.queue('combat.cast', { abilityId: 'door_strike', targetId: id });
    g.step(2);
    // the player holds far more threat than Ron could build by damage alone
    const wolf = units(g)[id];
    if (wolf) wolf.threat.player = 100000;
    g.step(20 * 5);
    const taunts = events(g, 'combat.cast').filter(
      (e) =>
        e.data.casterId === 'companion_ron' &&
        e.data.abilityId === 'taunt' &&
        e.data.op === 'finish',
    );
    expect(taunts.length).toBeGreaterThan(0);
  });

  it('obeys party orders: passive companions hold their fire', () => {
    const g = makeGame();
    isolate(g);
    recruit(g, 'ron');
    g.queue('party.order', { order: 'passive' });
    g.step(1);
    expect(partyView(g.world, g.content)[0]?.orderName).toEqual(tr('sys.party.order.passive'));
    const id = spawnNear(g, 'dian_dreg', 1, 3);
    g.queue('combat.attack', { on: true, targetId: id });
    g.step(20 * 5);
    expect(events(g, 'combat.damage').some((e) => e.data.sourceId === 'companion_ron')).toBe(false);
  });

  it('rejects bad orders and unknown companions', () => {
    const g = makeGame();
    g.queue('party.order', { order: 'charge' as never });
    g.step(1);
    expect(lastResult(g, 'party.order')?.code).toBe('bad_order');
    expect(lastResult(g, 'party.order')?.reason).toEqual(tr('sys.party.reject.bad_order'));
    g.queue('party.order', { companionId: 'ghost', order: 'follow' });
    g.step(1);
    expect(lastResult(g, 'party.order')?.code).toBe('no_companion');
  });

  it('a downed companion gets back up beside the player after the fight', () => {
    const g = makeGame();
    isolate(g);
    recruit(g, 'nera');
    const id = spawnNear(g, 'black_ridge', 11, 2);
    const nu = units(g).companion_nera;
    if (nu) nu.hp = 1;
    for (let i = 0; i < 400 && !nu?.downed; i++) g.step(1);
    expect(nu?.downed).toBe(true);
    g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins_depths', x: 3.5, y: 9.5 });
    g.step(20 * 25);
    expect(nu?.downed).toBe(false);
    expect(ents(g).companion_nera?.alive).toBe(true);
    expect(ents(g).companion_nera?.mapId).toBe('seal_ruins_depths');
    expect(nu?.auras.map((a) => a.id)).toContain('spring_weakness');
    void id;
  });
});

describe('bonds', () => {
  it('grows with gifts (liked gifts count double) and sets threshold flags', () => {
    const g = makeGame();
    recruit(g, 'yeyu');
    const start = bondOf(g.world, 'yeyu');
    withCtx(g, (ctx) => {
      addItem(ctx, 'player', 'raven_quill_charm', 3);
      addItem(ctx, 'player', 'minor_healing_potion', 1);
    });
    g.queue('party.gift', { companionId: 'yeyu', itemId: 'minor_healing_potion' });
    g.step(1);
    expect(bondOf(g.world, 'yeyu')).toBe(start + 4);
    g.queue('party.gift', { companionId: 'yeyu', itemId: 'raven_quill_charm' });
    g.step(1);
    expect(bondOf(g.world, 'yeyu')).toBe(start + 4 + 16);
    // the bond is party state (door keys of type bond read it), not a world flag
    expect(bondReached(g.world, 'yeyu', 20)).toBe(true);
    expect(bondReached(g.world, 'yeyu', 40)).toBe(false);
    expect(Object.keys(g.world.meta.flags).some((k) => k.startsWith('bond.'))).toBe(false);
  });

  it('rejects gifts that are missing or not giftable', () => {
    const g = makeGame();
    recruit(g, 'shiya');
    g.queue('party.gift', { companionId: 'shiya', itemId: 'wolf_pelt' });
    g.step(1);
    expect(lastResult(g, 'party.gift')?.code).toBe('missing');
    expect(t(lastResult(g, 'party.gift')?.reason)).toBe('背包里没有它');
    withCtx(g, (ctx) => addItem(ctx, 'player', 'gate_stone', 1));
    g.queue('party.gift', { companionId: 'shiya', itemId: 'gate_stone' });
    g.step(1);
    expect(lastResult(g, 'party.gift')?.code).toBe('not_giftable');
    g.queue('party.gift', { companionId: 'ghost', itemId: 'wolf_pelt' });
    g.step(1);
    expect(lastResult(g, 'party.gift')?.code).toBe('no_companion');
  });

  it('grows from shared kills and story flags', () => {
    const g = makeGame();
    isolate(g);
    recruit(g, 'ron');
    const before = g.world.slices.party.members.ron?.bond ?? 0;
    g.queue('flag.set', { key: 'boss.crystal_mother.defeated', value: true });
    g.step(1);
    expect(g.world.slices.party.members.ron?.bond).toBe(before + 15);
    const id = spawnNear(g, 'dian_dreg', 1, 2);
    const du = units(g)[id];
    if (du) du.hp = 1;
    g.queue('combat.attack', { on: true, targetId: id });
    for (let i = 0; i < 200 && ents(g)[id]?.alive; i++) g.step(1);
    expect(g.world.slices.party.members.ron?.bond).toBe(before + 15.25);
  });
});
