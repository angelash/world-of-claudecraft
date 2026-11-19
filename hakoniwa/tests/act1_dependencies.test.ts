import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { Engine } from '../src/core';
import type { SystemContext } from '../src/core/system';
import { tickAtDay } from '../src/core/time';
import { createGame } from '../src/game/create';
import { allSystems } from '../src/game/registry';
import { system as combat } from '../src/systems/combat';
import { purifyHit } from '../src/systems/combat/affixes/purify';
import { award } from '../src/systems/combat/rewards';
import { spawnMonster } from '../src/systems/combat/spawning';
import { buyFromMarket } from '../src/systems/economy';
import { addItem, addMoney, countItem, system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { system as party } from '../src/systems/party';
import { enterStage, system as quests, startQuest } from '../src/systems/quests';
import { system as world } from '../src/systems/world';
import { fixtureContent, Harness, SHIPPED_CONFIG } from './crafting_harness';

function withCtx(g: Engine, fn: (ctx: SystemContext) => void) {
  Engine.resume(g.world, g.content, [
    ...g.systems,
    { id: 'dependency_fixture', order: 999, tick: fn },
  ]).step(1);
}

describe('act 1 content dependencies through their owning systems', () => {
  it('the graveyard commission has its three real night spawns and purification blocks new ones', () => {
    const systems = [modifiers, world, inventory, combat];
    const g = Engine.create(49, buildContent(), systems);
    const wisps = (game: Engine) =>
      Object.values(game.world.slices.combat.units).filter(
        (u) => u.monsterId === 'gravefield_wisp',
      );
    expect(wisps(g)).toHaveLength(0);
    const nightSave = structuredClone(g.world);
    nightSave.meta.tick = tickAtDay(0, 20);
    const night = Engine.resume(nightSave, g.content, systems);
    night.step(20);
    expect(wisps(night)).toHaveLength(3);
    for (const unit of wisps(night)) {
      const entity = night.world.slices.world.entities[unit.id]!;
      expect(entity.mapId).toBe('borderstone');
      expect(entity.x).toBeGreaterThanOrEqual(38);
      expect(entity.x).toBeLessThan(47);
      expect(entity.y).toBeGreaterThanOrEqual(57);
      expect(entity.y).toBeLessThan(62);
      expect(unit.level).toBeGreaterThanOrEqual(9);
      expect(unit.level).toBeLessThanOrEqual(12);
    }
    const purified = Engine.resume(structuredClone(g.world), g.content, systems);
    purified.queue('flag.set', { key: 'a1_graveyard_purified', value: true });
    purified.step(1);
    purified.world.meta.tick = tickAtDay(0, 20);
    purified.step(20);
    expect(wisps(purified)).toHaveLength(0);
  });

  it('the five named encounters actually grant their canonical task items', () => {
    const g = Engine.create(43, buildContent(), [modifiers, world, inventory, combat]);
    g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins', x: 32.5, y: 17.5 });
    g.step(1);
    const pairs = [
      ['red_sock', 'nm_faded_red_sock'],
      ['toll_taker', 'nm_brass_dog_tag'],
      ['old_louse', 'nm_louse_belly_crystal'],
      ['three_toes', 'nm_three_toes_antler'],
      ['furrow_rat_queen', 'rat_queen_heart'],
    ];
    for (const [monsterId, itemId] of pairs) {
      g.queue('combat.spawn', {
        monsterId: monsterId!,
        mapId: 'seal_ruins',
        x: 34.5,
        y: 17.5,
        level: 1,
      });
      g.step(1);
      const victim = Object.values(g.world.slices.combat.units).find(
        (u) =>
          u.monsterId === monsterId && g.world.slices.world.entities[u.id]?.mapId === 'seal_ruins',
      )!;
      victim.tapped = 'player';
      withCtx(g, (ctx) => award(ctx, victim, g.world.slices.combat.units.player!, false));
      expect(countItem(g.world, 'player', itemId!)).toBe(1);
    }
  });

  it.each([
    { present: true, playerCast: true, legacyState: false },
    { present: false, playerCast: true, legacyState: false },
    { present: true, playerCast: false, legacyState: false },
    { present: true, playerCast: true, legacyState: true },
  ])(
    'an active purification quest settles only the party action with its real catcher: %o',
    ({ present, playerCast, legacyState }) => {
      let g = Engine.create(45, buildContent(), [
        modifiers,
        world,
        inventory,
        combat,
        party,
        quests,
      ]);
      g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins', x: 32.5, y: 17.5 });
      g.queue('flag.set', { key: 'a1_forest_accord', value: 'kept' });
      if (present) g.queue('flag.set', { key: 'companion.shiya.recruited', value: true });
      g.queue('combat.spawn', {
        monsterId: 'three_toes',
        mapId: 'seal_ruins',
        x: 34.5,
        y: 17.5,
        level: 1,
      });
      g.step(1);
      if (present) expect(g.world.slices.party.members.shiya?.state).toBe('party');
      withCtx(g, (ctx) => {
        const id = 'q_a1_s28_three_toes';
        const def = ctx.content.quests.find((q) => q.id === id)!;
        startQuest(ctx, id);
        enterStage(ctx, def, ctx.world.slices.quests.quests[id]!, 1);
      });
      if (legacyState) {
        const save = structuredClone(g.world);
        const member = save.slices.party.members.shiya;
        if (!member) throw new Error('missing saved companion');
        delete member.state;
        g = Engine.resume(save, g.content, g.systems);
      }
      const victim = Object.values(g.world.slices.combat.units).find(
        (u) =>
          u.monsterId === 'three_toes' &&
          g.world.slices.world.entities[u.id]?.mapId === 'seal_ruins',
      )!;
      withCtx(g, (ctx) => {
        const caster = playerCast
          ? g.world.slices.combat.units.player
          : spawnMonster(ctx, 'grey_wolf', 'seal_ruins', 31.5, 17.5, { side: 'ally' });
        if (!caster) throw new Error('missing purification caster');
        expect(purifyHit(ctx, caster, victim)).toBe(true);
      });
      expect(countItem(g.world, 'player', 'nm_three_toes_antler')).toBe(
        present && playerCast ? 1 : 0,
      );
      expect(g.world.slices.quests.quests.q_a1_s28_three_toes?.status).toBe(
        playerCast ? 'done' : 'active',
      );
      expect(g.world.recent.some((event) => event.kind === 'combat.purified')).toBe(true);
      expect(
        g.content.monsters.find((m) => m.id === 'ashhorn_deer')?.mechanics?.purifyItems,
      ).toBeUndefined();
    },
  );

  it('the post station market sells a real mount through the trade port', () => {
    const g = createGame({
      seed: 47,
      systems: allSystems().filter((s) =>
        ['modifiers', 'world', 'inventory', 'economy', 'party'].includes(s.id),
      ),
    });
    let result: { ok: boolean } | undefined;
    withCtx(g, (ctx) => {
      addMoney(ctx, 'player', 5000, 'fixture');
      result = buyFromMarket(ctx, 'borderstone', 'player', 'mnt_donkey', 1, 'buy');
    });
    expect(result?.ok).toBe(true);
    expect(countItem(g.world, 'player', 'mnt_donkey')).toBe(1);
    g.queue('party.ride', { mountId: 'mnt_donkey' });
    g.step(1);
    expect(g.world.slices.party.mount).toBe('mnt_donkey');
  });

  it('craft facts describe the actual masterwork and signed inputs consumed', () => {
    const c = fixtureContent({ masterwork: { ...SHIPPED_CONFIG.masterwork, base: 1, cap: 1 } });
    const h = new Harness({ content: c });
    h.standAt('shop');
    h.run((ctx) => {
      addItem(ctx, 'player', 'x_ingot', 2, 'fixture', { signature: 'fixture_maker' });
      addItem(ctx, 'player', 'x_coal', 1);
    });
    expect(h.command('crafting.craft', { recipeId: 'rcp_zc_sword' })?.ok).toBe(true);
    expect(h.events('craft.done').at(-1)?.data).toMatchObject({
      masterwork: true,
      signedInputs: true,
    });
  });
});
