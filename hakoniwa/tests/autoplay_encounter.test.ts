import { describe, expect, it } from 'vitest';
import type { Engine, SystemContext } from '../src/core';
import { Autoplayer, attackers } from '../src/game/autoplay';
import { interruptCast } from '../src/systems/combat/abilities';
import { resolveHit } from '../src/systems/combat/damage';
import { startEvade } from '../src/systems/combat/monster_ai';
import { haltEntity } from '../src/systems/world';
import { recordedEncounter as encounter } from './playthrough/encounter_fixture';

function moves(g: Engine) {
  return g.world.inbox.filter((c) => c.kind === 'world.move_to');
}

function fallTo(ctx: SystemContext, sourceId: string) {
  const source = ctx.world.slices.combat.units[sourceId];
  const target = ctx.world.slices.combat.units.player;
  if (!source || !target) throw new Error('missing damage fixture');
  resolveHit(ctx, {
    source,
    target,
    amount: 100000,
    school: 'shadow',
    kind: 'spell',
    noRoll: true,
  });
}

describe('autoplayer encounter decisions from the real M02 pull', () => {
  it('holds its approach while the engaged melee guardian pauses to cast at itself', () => {
    const { g, boss, player } = encounter(2478);
    const bot = new Autoplayer(g);
    expect(boss.cast).toMatchObject({
      abilityId: 'sk_mon_featherstorm',
      targetId: boss.id,
      end: 2506,
    });
    expect(attackers(g.world)).toEqual([boss.id]);
    const approach = { x: player.x, y: player.y };
    bot.think();
    expect(moves(g)).toEqual([]);
    g.step(4);
    expect({ x: player.x, y: player.y }).toEqual(approach);
    expect(attackers(g.world)).toEqual([boss.id]);
  });

  it('does not keep waiting on a cast whose recorded end has passed', () => {
    const { g, boss } = encounter(2478);
    if (!boss.cast) throw new Error('missing recorded cast');
    boss.cast.end = g.tick;
    new Autoplayer(g).fight(boss.id, 'recorded encounter');
    expect(moves(g)).toHaveLength(1);
  });

  it('returns to its normal approach after the real cast is interrupted', () => {
    const { g, boss, run } = encounter(2478);
    run((ctx) => {
      interruptCast(ctx, boss);
      haltEntity(ctx, boss.id);
    });
    expect(boss.cast).toBeNull();
    new Autoplayer(g).fight(boss.id, 'recorded encounter');
    expect(moves(g)).toHaveLength(1);
  });

  it('retains the ranged-enemy approach instead of waiting for that enemy to close in', () => {
    const { g, boss } = encounter(2478);
    g.content.monsters = g.content.monsters.map((m) =>
      m.id === boss.monsterId ? { ...m, range: 6 } : m,
    );
    new Autoplayer(g).fight(boss.id, 'ranged fixture');
    expect(moves(g)).toHaveLength(1);
  });

  it('keeps the boss loss when normal commands switch damage to a lower-HP crow', () => {
    const { g, boss, run } = encounter(2490);
    const bot = new Autoplayer(g);
    expect(bot.readyFor('guardian_raven')).toBe(true);
    bot.think();
    expect(bot.intent.what).toBe('fight raven_flock (defend)');
    expect(g.world.inbox).toContainEqual(
      expect.objectContaining({ kind: 'combat.target', data: { targetId: 'monster_10' } }),
    );
    g.step(1);
    expect(g.world.slices.combat.units.player?.target).toBe('monster_10');
    run((ctx) => fallTo(ctx, 'monster_14'));
    expect(g.world.recent).toContainEqual(
      expect.objectContaining({
        kind: 'entity.died',
        data: expect.objectContaining({ id: 'player' }),
      }),
    );
    expect(bot.deaths).toBe(1);
    expect(bot.lossesTo).toEqual({ guardian_raven: 1 });
    expect(bot.readyFor('guardian_raven')).toBe(false);
    expect(boss.hp).toBe(151);
  });

  it('drops the old boss encounter after its real evade and attributes an isolated crow loss', () => {
    const { g, boss, run } = encounter(2490);
    const bot = new Autoplayer(g);
    bot.fight(boss.id, 'recorded encounter');
    run((ctx) => {
      startEvade(ctx, boss);
      for (const id of ['monster_11', 'monster_12', 'monster_13', 'monster_14', 'monster_15']) {
        const crow = ctx.world.slices.combat.units[id];
        if (crow) startEvade(ctx, crow);
      }
    });
    expect(attackers(g.world)).toEqual(['monster_10']);
    bot.think();
    expect(bot.intent.what).toBe('fight raven_flock (defend)');
    run((ctx) => fallTo(ctx, 'monster_10'));
    expect(bot.deaths).toBe(1);
    expect(bot.lossesTo).toEqual({ raven_flock: 1 });
  });
});
