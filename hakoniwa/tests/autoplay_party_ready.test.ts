// The autoplayer takes a named fight with its party, not alone (src/game/autoplay/fight.ts
// `companionsReady`): while a companion walking with the player is down or badly hurt and
// nothing is attacking, the bot waits for the party before it pulls a named target. Without
// it the bot re-pulled the act-five king alone after every wipe, once the companions were
// down, and looped die, rest, return (PK-M1-12 and PK-M1-20 act-five finding). The same
// fights also need the bot to use its heals: one heal before it runs from a losing fight
// (never thrown away by running mid-cast, never retried at once), and spells to heal up
// while it rests.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { Engine } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import type { SystemContext } from '../src/core/system';
import {
  Autoplayer,
  chooseAbility,
  companionInNeed,
  companionsReady,
  selfHeal,
} from '../src/game/autoplay';
import { createGame } from '../src/game/create';
import { abilityBar, grantAbility, setLevel } from '../src/systems/combat';
import { applyAura } from '../src/systems/combat/auras';
import { killUnit } from '../src/systems/combat/death';
import { secs } from '../src/systems/combat/defs';
import { deriveStats } from '../src/systems/combat/stats';
import type { AbilityDef } from '../src/systems/combat/types';
import type { QuestDef } from '../src/systems/quests/types';

function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe = { id: 'zz_probe', order: 999, tick: (ctx: SystemContext) => fn(ctx) };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
}

/** A game whose player walks with two companions, in an empty hall away from monsters. */
function withParty(content?: ContentMap): Engine {
  const g = createGame({ aiMode: 'off', ...(content ? { content } : {}) });
  for (const id of ['yeyu', 'ron']) {
    g.queue('flag.set', { key: `companion.${id}.recruited`, value: true });
  }
  g.step(1);
  g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins', x: 32.5, y: 17.5 });
  g.step(2);
  // well above anything around: readiness and grinding never come into it
  withCtx(g, (ctx) => {
    const me = ctx.world.slices.combat.units[ctx.world.slices.world.playerId];
    if (me) setLevel(ctx, me, 30);
  });
  return g;
}

function companionUnit(g: Engine, id: string) {
  const m = g.world.slices.party.members[id];
  const u = m ? g.world.slices.combat.units[m.entityId] : undefined;
  if (!m || !u) throw new Error(`no companion ${id}`);
  return u;
}

describe('autoplayer: a named fight waits for the party', () => {
  it('reads the companions on the player map: down or below the line is not ready', () => {
    const g = withParty();
    expect(Object.keys(g.world.slices.party.members).sort()).toEqual(['ron', 'yeyu']);
    expect(companionsReady(g.world, g.content)).toBe(true);
    // hurt below the line
    withCtx(g, (ctx) => {
      const u = companionUnit(g, 'ron');
      u.hp = Math.round(deriveStats(ctx.world, ctx.content, u).maxHp * 0.5);
    });
    expect(companionsReady(g.world, g.content)).toBe(false);
    expect(companionsReady(g.world, g.content, 0.4)).toBe(true);
    // healed, then down
    withCtx(g, (ctx) => {
      const u = companionUnit(g, 'ron');
      u.hp = deriveStats(ctx.world, ctx.content, u).maxHp;
    });
    expect(companionsReady(g.world, g.content)).toBe(true);
    withCtx(g, (ctx) => {
      const u = companionUnit(g, 'yeyu');
      killUnit(ctx, u, u);
    });
    expect(companionUnit(g, 'yeyu').downed).toBe(true);
    expect(companionsReady(g.world, g.content)).toBe(false);
  });

  it('a companion just back on its feet is not ready while its getting-up weakness lasts', () => {
    const g = withParty();
    withCtx(g, (ctx) => {
      const u = companionUnit(g, 'yeyu');
      applyAura(ctx, u, 'aur_st_downed_weak', u);
    });
    expect(companionsReady(g.world, g.content)).toBe(false);
    g.step(secs(121));
    expect(companionUnit(g, 'yeyu').auras.some((a) => a.id === 'aur_st_downed_weak')).toBe(false);
    expect(companionsReady(g.world, g.content)).toBe(true);
  });

  it('a named kill objective rests for the party instead of pulling while a companion is down', () => {
    const g = withParty();
    const bot = new Autoplayer(g, { route: 'release' });
    withCtx(g, (ctx) => {
      const u = companionUnit(g, 'yeyu');
      killUnit(ctx, u, u);
    });
    const quest = {
      id: 'zz_q',
      act: 'act1',
      kind: 'main',
      title: 'x',
      desc: 'x',
      stages: [],
    } as unknown as QuestDef;
    // a monster of rank (a rare): the fight is the party's
    const named = { type: 'kill', refs: ['split_ear'], count: 1, label: 'x' } as const;
    const look = (
      bot as unknown as {
        objective: (d: QuestDef, o: typeof named) => number | null;
      }
    ).objective.bind(bot);
    look(quest, named);
    expect(bot.intent.what).toContain('wait for the party before the fight');
    // the party back on its feet: the bot goes after the target
    withCtx(g, (ctx) => {
      const u = companionUnit(g, 'yeyu');
      u.downed = false;
      u.hp = deriveStats(ctx.world, ctx.content, u).maxHp;
      const e = ctx.world.slices.world.entities[u.id];
      if (e) e.alive = true;
    });
    look(quest, named);
    expect(bot.intent.what).not.toContain('wait for the party');
    // an ordinary monster is no party fight: the bot does not wait for anyone
    withCtx(g, (ctx) => {
      const u = companionUnit(g, 'yeyu');
      killUnit(ctx, u, u);
    });
    const plain = { type: 'kill', refs: ['dian_rat'], count: 1, label: 'x' } as const;
    look(quest, plain as unknown as typeof named);
    expect(bot.intent.what).not.toContain('wait for the party');
  });

  it('a party member with no body in the world (gravely hurt) is not standing with the party', () => {
    const g = withParty();
    expect(companionsReady(g.world, g.content)).toBe(true);
    const m = g.world.slices.party.members.ron;
    if (!m) throw new Error('no ron');
    m.entityId = '';
    expect(companionsReady(g.world, g.content)).toBe(false);
  });

  it('a companion that refuses the heal (a shield lockout) is healed another way, not stuck on it', () => {
    const g = withParty();
    const pid = g.world.slices.world.playerId;
    withCtx(g, (ctx) => {
      for (const a of ['sk_pri_powerwordshield', 'sk_pri_lesserheal']) grantAbility(ctx, pid, a);
      const ron = companionUnit(g, 'ron');
      ron.hp = Math.round(deriveStats(ctx.world, ctx.content, ron).maxHp * 0.3);
      // the shield's lockout on the companion: the shield is refused there
      applyAura(ctx, ron, 'aur_pri_weakenedsoul', ron);
    });
    const ron = companionUnit(g, 'ron');
    const pick = chooseAbility(g.world, g.content, null);
    expect(pick).toEqual({ abilityId: 'sk_pri_lesserheal', targetId: ron.id });
  });

  it('a healer player keeps a companion standing: an ally heal on the most hurt one', () => {
    const g = withParty();
    const pid = g.world.slices.world.playerId;
    withCtx(g, (ctx) => {
      for (const a of ['sk_pri_renew', 'sk_pri_lesserheal']) grantAbility(ctx, pid, a);
      const ron = companionUnit(g, 'ron');
      ron.hp = Math.round(deriveStats(ctx.world, ctx.content, ron).maxHp * 0.3);
      const yeyu = companionUnit(g, 'yeyu');
      yeyu.hp = Math.round(deriveStats(ctx.world, ctx.content, yeyu).maxHp * 0.9);
    });
    const ron = companionUnit(g, 'ron');
    expect(companionInNeed(g.world, g.content)).toEqual({ id: ron.id, frac: expect.any(Number) });
    const pick = chooseAbility(g.world, g.content, null);
    expect(pick?.targetId).toBe(ron.id);
    expect(['sk_pri_renew', 'sk_pri_lesserheal']).toContain(pick?.abilityId);
    // everyone whole: no heal is spent on the party
    withCtx(g, (ctx) => {
      for (const id of ['ron', 'yeyu']) {
        const u = companionUnit(g, id);
        u.hp = deriveStats(ctx.world, ctx.content, u).maxHp;
      }
    });
    expect(companionInNeed(g.world, g.content)).toBeNull();
    expect(chooseAbility(g.world, g.content, null)).toBeNull();
  });

  it('an interruptible cast on the target is kicked before anything else', () => {
    // a free interrupt, so the player's pools do not come into it
    const content = buildContent();
    content.abilities = [
      ...content.abilities,
      {
        id: 'zz_kick',
        name: 'x',
        desc: 'x',
        target: 'enemy',
        range: 5,
        gcd: false,
        effects: [{ type: 'interrupt', lockout: 1 }],
        ai: 'interrupt',
      } as AbilityDef,
    ];
    const g = withParty(content);
    const pid = g.world.slices.world.playerId;
    const p = g.world.slices.world.entities[pid];
    const before = new Set(Object.keys(g.world.slices.world.entities));
    g.queue('combat.spawn', {
      monsterId: 'oneeye_bandit',
      mapId: p?.mapId ?? '',
      x: (p?.x ?? 0) + 1.2,
      y: p?.y ?? 0,
      level: 5,
    });
    g.step(1);
    const foe = Object.keys(g.world.slices.world.entities).find((k) => !before.has(k));
    if (!foe) throw new Error('spawn failed');
    withCtx(g, (ctx) => grantAbility(ctx, pid, 'zz_kick'));
    // the player has the foe targeted, as the bot's fight does before it casts
    g.queue('combat.target', { targetId: foe });
    g.step(1);
    // the foe's cast bar shows an interruptible heal (set last: its own tick would end it)
    const u = g.world.slices.combat.units[foe];
    if (u)
      u.cast = {
        abilityId: 'sk_mon_dianinfusion',
        targetId: null,
        start: g.tick,
        end: g.tick + 80,
        x: 0,
        y: 0,
      };
    const slot = abilityBar(g.world, g.content).find((x) => x.id === 'zz_kick');
    expect(slot?.usable).toBe(true);
    expect(chooseAbility(g.world, g.content, foe)).toEqual({ abilityId: 'zz_kick', targetId: foe });
    if (u) u.cast = null;
    expect(chooseAbility(g.world, g.content, foe)?.abilityId).not.toBe('zz_kick');
  });
});

/** Spawn one monster next to the player, set on the player, and return its id. */
function foeOnPlayer(g: Engine, level: number): string {
  const pid = g.world.slices.world.playerId;
  const p = g.world.slices.world.entities[pid];
  const before = new Set(Object.keys(g.world.slices.world.entities));
  g.queue('combat.spawn', {
    monsterId: 'oneeye_bandit',
    mapId: p?.mapId ?? '',
    x: (p?.x ?? 0) + 1.2,
    y: p?.y ?? 0,
    level,
  });
  g.step(1);
  const foe = Object.keys(g.world.slices.world.entities).find((k) => !before.has(k));
  if (!foe) throw new Error('spawn failed');
  withCtx(g, (ctx) => {
    const u = ctx.world.slices.combat.units[foe];
    if (u) {
      u.threat[pid] = 50;
      u.target = pid;
    }
  });
  return foe;
}

/** No cut scene running and no monster within reach of the player: the bot is free to act. */
function quietAround(g: Engine): void {
  g.world.slices.scenes.current = null;
  withCtx(g, (ctx) => {
    const p = ctx.world.slices.world.entities[ctx.world.slices.world.playerId];
    for (const e of Object.values(ctx.world.slices.world.entities)) {
      const u = ctx.world.slices.combat.units[e.id];
      if (!p || !u || e.kind !== 'monster' || !e.alive || e.mapId !== p.mapId) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) <= 12) killUnit(ctx, u, u);
    }
  });
}

function setPlayerHealth(g: Engine, frac: number): void {
  withCtx(g, (ctx) => {
    const me = ctx.world.slices.combat.units[ctx.world.slices.world.playerId];
    if (me) me.hp = Math.round(deriveStats(ctx.world, ctx.content, me).maxHp * frac);
  });
}

describe('autoplayer: heals in a losing fight and while it rests', () => {
  it('uses the available door dodge before fleeing when no healing spell exists', () => {
    const g = withParty();
    const pid = g.world.slices.world.playerId;
    withCtx(g, (ctx) => grantAbility(ctx, pid, 'sk_door_step'));
    const bot = new Autoplayer(g);
    quietAround(g);
    foeOnPlayer(g, 30);
    setPlayerHealth(g, 0.4);
    const ledger = (bot as unknown as { ledger: { tick: number; dealt: number; taken: number }[] })
      .ledger;
    ledger.push({ tick: g.tick, dealt: 1, taken: 100000 });
    expect(abilityBar(g.world, g.content).find((a) => a.id === 'sk_door_step')?.usable).toBe(true);
    expect(selfHeal(g.world, g.content)).toBeNull();
    expect(selfHeal(g.world, g.content, { defensive: true })).toEqual({
      abilityId: 'sk_door_step',
      targetId: undefined,
    });
    bot.think();
    expect(g.world.inbox).toContainEqual(
      expect.objectContaining({ kind: 'combat.cast', data: { abilityId: 'sk_door_step' } }),
    );
    g.step(1);
    expect(g.world.slices.combat.units[pid]?.auras.some((a) => a.id === 'aur_door_dodge')).toBe(
      true,
    );
  });
  it('in a losing fight it casts one heal before it runs, holds while it casts, and does not retry at once', () => {
    const g = withParty();
    const pid = g.world.slices.world.playerId;
    // a heal with a cast bar, so running mid-cast would throw it away
    withCtx(g, (ctx) => grantAbility(ctx, pid, 'sk_pri_lesserheal'));
    const bot = new Autoplayer(g, { route: 'release' });
    quietAround(g);
    foeOnPlayer(g, 30);
    setPlayerHealth(g, 0.4);
    // the race is lost: the party deals next to nothing while the player takes a lot
    const ledger = (bot as unknown as { ledger: { tick: number; dealt: number; taken: number }[] })
      .ledger;
    ledger.push({ tick: g.tick, dealt: 1, taken: 100_000 });
    bot.think();
    expect(bot.intent.what).toBe('heal before running');
    expect(bot.sent['combat.cast']).toBe(1);
    g.step(1);
    const me = g.world.slices.combat.units[pid];
    expect(me?.cast?.abilityId).toBe('sk_pri_lesserheal');
    // mid-cast: the bot holds, it neither runs nor casts again
    setPlayerHealth(g, 0.4);
    ledger.push({ tick: g.tick, dealt: 1, taken: 100_000 });
    bot.think();
    expect(bot.intent.what).toBe('heal before running');
    expect(bot.sent['combat.cast']).toBe(1);
    expect(bot.sent['combat.stop'] ?? 0).toBe(0);
    // the heal did not turn the race: no second heal within the retry window, though one
    // is at hand again (cast bar and global cooldown clear)
    if (me) {
      me.cast = null;
      me.gcd = 0;
    }
    setPlayerHealth(g, 0.4);
    expect(selfHeal(g.world, g.content)).not.toBeNull();
    bot.think();
    expect(bot.sent['combat.cast'] ?? 0).toBe(1);
    expect(bot.intent.what).not.toBe('heal before running');
  });

  it('resting hurt with mana to spare, it heals up with a spell (no shield) and drops its target first', () => {
    const g = withParty();
    const pid = g.world.slices.world.playerId;
    withCtx(g, (ctx) => {
      for (const a of ['sk_pri_powerwordshield', 'sk_pri_lesserheal']) grantAbility(ctx, pid, a);
    });
    const bot = new Autoplayer(g, { route: 'release' });
    quietAround(g);
    const ron = companionUnit(g, 'ron');
    withCtx(g, (ctx) => {
      const me = ctx.world.slices.combat.units[pid];
      if (me) me.target = ron.id;
    });
    setPlayerHealth(g, 0.7);
    const rest = (bot as unknown as { rest: (why: string) => number }).rest.bind(bot);
    rest('rest');
    expect(bot.intent.what).toBe('rest (heal up)');
    expect(bot.sent['combat.target']).toBe(1);
    expect(bot.sent['combat.cast']).toBe(1);
    g.step(1);
    const me = g.world.slices.combat.units[pid];
    expect(me?.target).toBeNull();
    expect(me?.cast?.abilityId).toBe('sk_pri_lesserheal');
  });

  it('resting with less than half its mana, it waits instead of spending it on healing', () => {
    const g = withParty();
    const pid = g.world.slices.world.playerId;
    withCtx(g, (ctx) => grantAbility(ctx, pid, 'sk_pri_lesserheal'));
    const bot = new Autoplayer(g, { route: 'release' });
    quietAround(g);
    let max = 0;
    withCtx(g, (ctx) => {
      const me = ctx.world.slices.combat.units[pid];
      if (!me) return;
      // a priest runs on mana
      me.classId = 'priest';
      max = deriveStats(ctx.world, ctx.content, me).maxRes.mana ?? 0;
      me.res.mana = Math.floor(max * 0.3);
    });
    // the player runs on mana, so the line is what holds the heal back
    expect(max).toBeGreaterThan(0);
    setPlayerHealth(g, 0.7);
    // a heal is at hand: only the mana line holds it back
    expect(selfHeal(g.world, g.content, { shield: false })).not.toBeNull();
    const rest = (bot as unknown as { rest: (why: string) => number }).rest.bind(bot);
    expect(rest('rest')).toBe(40);
    expect(bot.sent['combat.cast'] ?? 0).toBe(0);
    expect(bot.intent.what).toBe('rest');
  });
});
