// Uses must have an executor before the inventory spends an item or starts a timer.
// These run the public commands against the shipped act 1 definitions.

import { describe, expect, it } from 'vitest';
import type { ContentMap } from '../src/core/contracts';
import { unitOf } from '../src/systems/combat';
import { addItem } from '../src/systems/inventory';
import { content, events, game, lastResult, TOWN, withCtx } from './ailments_harness';

const SCRIPT = { type: 'script', script: 'test' } as const;

describe('an inventory use needs an implemented primary effect', () => {
  it('every still-unimplemented shipped primary effect preserves the item and timers', () => {
    const pending = new Set([
      'food',
      'throw',
      'gate',
      'detect',
      'light',
      'ward',
      'rest',
      'bait',
      'purify',
      'conceal',
      'pact',
      'beast_cure',
    ]);
    const rows = content().items.filter((row) => pending.has(row.use?.effect ?? ''));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const g = game(TOWN);
      withCtx(g, (ctx) => addItem(ctx, 'player', row.id, 1));
      const before = g.world.slices.inventory.owners.player?.items[row.id];
      const timers = JSON.stringify(g.world.slices.inventory.timers);
      g.queue('inventory.use', { ownerId: 'player', itemId: row.id });
      g.step(1);
      expect(lastResult(g, 'inventory.use')?.ok, row.id).toBe(false);
      expect(g.world.slices.inventory.owners.player?.items[row.id], row.id).toBe(before);
      expect(JSON.stringify(g.world.slices.inventory.timers), row.id).toBe(timers);
    }
  });

  it.each(['inventory.use', 'combat.use_item'] as const)(
    '%s refuses an unimplemented throwable before spending it or its cooldown',
    (command) => {
      const g = game(TOWN);
      withCtx(g, (ctx) => addItem(ctx, 'player', 'cs_fire_flask', 2));
      const timers = JSON.stringify(g.world.slices.inventory.timers);
      const gcd = unitOf(g.world, 'player')?.gcd;
      g.queue(command, { ownerId: 'player', itemId: 'cs_fire_flask' });
      g.step(2);
      expect(lastResult(g, command)).toMatchObject({ ok: false, code: 'not_usable' });
      expect(g.world.slices.inventory.owners.player?.items.cs_fire_flask).toBe(2);
      expect(JSON.stringify(g.world.slices.inventory.timers)).toBe(timers);
      expect(unitOf(g.world, 'player')?.gcd).toBe(gcd);
      expect(events(g, 'item.used')).toEqual([]);
    },
  );

  it('a system source cannot bypass the primary-effect check', () => {
    const g = game(TOWN);
    withCtx(g, (ctx) => addItem(ctx, 'player', 'cs_fire_flask', 1));
    g.queue(
      'inventory.use',
      { ownerId: 'player', itemId: 'cs_fire_flask' },
      { type: 'system', system: 'combat' },
    );
    g.step(1);
    expect(g.world.slices.inventory.owners.player?.items.cs_fire_flask).toBe(1);
    expect(events(g, 'item.used')).toEqual([]);
  });

  it.each(['inventory.use', 'combat.use_item'] as const)(
    '%s refuses an explicitly missing target before spending a working potion',
    (command) => {
      const g = game(TOWN);
      withCtx(g, (ctx) => addItem(ctx, 'player', 'minor_healing_potion', 1));
      g.queue(command, {
        ownerId: 'player',
        itemId: 'minor_healing_potion',
        targetId: 'missing_target',
      });
      g.step(2);
      expect(lastResult(g, command)?.ok).toBe(false);
      expect(g.world.slices.inventory.owners.player?.items.minor_healing_potion).toBe(1);
      expect(events(g, 'item.used')).toEqual([]);
    },
  );

  it('a missing aura definition is refused without spending the item', () => {
    const c: ContentMap = {
      ...content(),
      items: [
        ...content().items,
        {
          id: 'zz_missing_aura_item',
          name: 'fixture',
          desc: '',
          kind: 'consumable',
          quality: 1,
          value: 0,
          use: { effect: 'aura', ability: 'zz_missing_aura' },
        },
      ],
    };
    const g = game(TOWN, { content: c });
    withCtx(g, (ctx) => addItem(ctx, 'player', 'zz_missing_aura_item', 1));
    g.queue('inventory.use', { ownerId: 'player', itemId: 'zz_missing_aura_item' }, SCRIPT);
    g.step(1);
    expect(lastResult(g, 'inventory.use')?.ok).toBe(false);
    expect(g.world.slices.inventory.owners.player?.items.zz_missing_aura_item).toBe(1);
  });

  it('implemented healing still restores health and enforces its shared cooldown', () => {
    const g = game(TOWN);
    const u = unitOf(g.world, 'player');
    if (!u) throw new Error('missing player unit');
    u.hp = 1;
    withCtx(g, (ctx) => addItem(ctx, 'player', 'minor_healing_potion', 2));
    g.queue('inventory.use', { ownerId: 'player', itemId: 'minor_healing_potion' });
    g.step(1);
    expect(lastResult(g, 'inventory.use')?.ok).toBe(true);
    expect(u.hp).toBeGreaterThan(1);
    g.queue('inventory.use', { ownerId: 'player', itemId: 'minor_healing_potion' });
    g.step(1);
    expect(lastResult(g, 'inventory.use')).toMatchObject({ ok: false, code: 'cooldown' });
    expect(g.world.slices.inventory.owners.player?.items.minor_healing_potion).toBe(1);
  });
});
