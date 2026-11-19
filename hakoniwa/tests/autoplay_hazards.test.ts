import { describe, expect, it } from 'vitest';
import { Autoplayer } from '../src/game/autoplay';
import { helpfulBreakable } from '../src/game/autoplay/boss_objects';
import { interruptCast, useAbility } from '../src/systems/combat/abilities';
import { restoreTerrain } from '../src/systems/combat/boss/terrain';
import { resolveHit } from '../src/systems/combat/damage';
import { telegraphsOn } from '../src/systems/combat/telegraph';
import { inCells } from '../src/systems/party/danger';
import { recordedEncounter } from './playthrough/encounter_fixture';

function windAt(tick: number) {
  const fixture = recordedEncounter(tick);
  fixture.run((ctx) => {
    interruptCast(ctx, fixture.boss);
    expect(
      useAbility(ctx, fixture.boss, 'sk_mon_featherstorm', fixture.boss.id, { force: true }).ok,
    ).toBe(true);
  });
  const warning = telegraphsOn(fixture.g.world, fixture.player.mapId).find(
    (w) => w.casterId === fixture.boss.id && w.abilityId === 'sk_mon_featherstorm',
  );
  if (!warning) throw new Error('real featherstorm produced no warning');
  return { ...fixture, warning: structuredClone(warning) };
}

describe('autoplayer: actual featherstorm warnings and south stone', () => {
  it.each([2478, 2706])(
    'leaves and keeps out of the real warning from tick %i until it settles',
    (tick) => {
      const { g, player, warning } = windAt(tick);
      const bot = new Autoplayer(g);
      const windDamage: number[] = [];
      g.onEvents((events) => {
        for (const ev of events) {
          if (
            ev.kind === 'combat.damage' &&
            ev.data.targetId === player.id &&
            ev.data.abilityId === 'sk_mon_featherstorm'
          )
            windDamage.push(ev.data.amount);
        }
      });
      expect(inCells(warning.cells, player.x, player.y)).toBe(true);
      let escaped = false;
      while (g.tick < warning.settle) {
        const step = bot.think();
        g.step(Math.min(step, warning.settle - g.tick));
        const inside = inCells(warning.cells, player.x, player.y);
        if (!inside) escaped = true;
        if (escaped && g.tick < warning.settle) expect(inside).toBe(false);
      }
      expect(player.alive).toBe(true);
      expect(escaped).toBe(true);
      expect(windDamage).toEqual([]);
      expect(telegraphsOn(g.world, player.mapId).some((w) => w.id === warning.id)).toBe(false);
      bot.think();
      expect(bot.intent.what).not.toContain('warning');
    },
  );

  it('saves the real south stone while a noncasting guardian is still outside attack reach', () => {
    const { g, boss } = recordedEncounter(2410);
    expect(helpfulBreakable(g.world, g.content, boss.id)).toBeNull();
    new Autoplayer(g).fight(boss.id, 'recorded encounter');
    expect(g.world.inbox).not.toContainEqual(
      expect.objectContaining({ kind: 'combat.target', data: { targetId: 'object_3' } }),
    );
  });

  it('uses the real stone to interrupt a live cast, cancels its warning and never reuses the stone', () => {
    const { g, boss, warning, run } = windAt(2410);
    const bot = new Autoplayer(g);
    bot.fight(boss.id, 'recorded encounter');
    expect(g.world.inbox).toContainEqual(
      expect.objectContaining({ kind: 'combat.target', data: { targetId: 'object_3' } }),
    );
    run((ctx) => {
      const source = ctx.world.slices.combat.units.player;
      const target = ctx.world.slices.combat.units.object_3;
      if (!source || !target) throw new Error('missing real south stone');
      resolveHit(ctx, {
        source,
        target,
        amount: 9,
        school: 'physical',
        kind: 'melee',
        noRoll: true,
      });
    });
    expect(g.world.slices.combat.terrain?.object_3?.state).toBe('broken');
    expect(boss.cast).toBeNull();
    expect(boss.auras.some((a) => a.id === 'aur_st_stagger')).toBe(true);
    expect(telegraphsOn(g.world, warning.mapId).some((w) => w.id === warning.id)).toBe(false);
    g.step(61);
    expect(helpfulBreakable(g.world, g.content, boss.id)).not.toBe('object_3');
  });

  it('uses an intact stone once the real guardian reaches the player even without a cast', () => {
    const { g, boss, run } = recordedEncounter(2518);
    run((ctx) => restoreTerrain(ctx, boss));
    expect(boss.cast).toBeNull();
    expect(helpfulBreakable(g.world, g.content, boss.id)).toBe('object_3');
  });
});
