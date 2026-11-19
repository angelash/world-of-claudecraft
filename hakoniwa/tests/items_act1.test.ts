// PK-M1-31: the act 1 item data (data/items/, data/inventory/ sets and enchants, the act 1
// crafting rows) holds the import rules of the instance layer and the crafting kernel, the
// T1 ladder is the generator's output, and a portion from a tainted stack carries its grain
// to the ailments system (catalog_consumables_magitools.md 2.4).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateCrafting } from '../src/content/packs/crafting';
import { TOOL_DURABILITY, validateItems } from '../src/content/packs/items';
import type { ItemDef } from '../src/systems/inventory';
import { addItem } from '../src/systems/inventory';
import { buildLadder } from '../tools/content/equipment_ladder';
import { body, content, events, game, lastResult, TOWN, withCtx } from './ailments_harness';

const DATA = join(__dirname, '..', 'data');
const read = <T>(file: string): T => JSON.parse(readFileSync(join(DATA, file), 'utf8')) as T;

describe('the act 1 item rows', () => {
  it('pass the act 1 import rules and the crafting validator', () => {
    expect(validateItems(content())).toEqual([]);
    expect(validateCrafting(content())).toEqual([]);
  });

  it('the T1 ladder file is what the generator writes', () => {
    expect(read<unknown[]>('items/equipment_t1.json')).toEqual(buildLadder());
  });

  it('every tool is an instance with its tool kind and 200 durability', () => {
    const tools = read<ItemDef[]>('items/consumables_act1.json').filter((i) =>
      i.tags?.includes('tool'),
    );
    expect(tools.length).toBeGreaterThanOrEqual(7);
    const kinds = new Set(content().craftingConfig.tools.map((t) => t.tag));
    for (const t of tools) {
      expect(t.durability, t.id).toBe(TOOL_DURABILITY);
      expect(
        t.tags?.filter((x) => x.startsWith('tool:')).map((x) => kinds.has(x.slice(5))),
      ).toEqual([true]);
    }
  });

  it('the plan row items are there: crystalback sword, both sets, enchants, repair kit', () => {
    const items = new Map(content().items.map((i) => [i.id, i]));
    expect(items.get('eq_barga_crystalback_sword')?.maker).toBe('barga');
    expect(items.get('cs_field_repair_kit_t1')?.use).toMatchObject({
      effect: 'repair',
      amount: 30,
    });
    expect(items.get('rusty_shortsword')?.salvage?.itemId).toBe('iron_ore');
    const sets = new Set(content().itemSets.map((s) => s.id));
    expect(sets.has('set_dg_seal_ruins') && sets.has('set_barga_forge')).toBe(true);
    for (const p of ['head', 'hands', 'feet', 'trinket'])
      expect(items.get(`eq_emberward_${p}`)?.set, p).toBe('set_dg_seal_ruins');
    expect(content().enchants.filter((e) => e.tier === 1).length).toBeGreaterThanOrEqual(14);
    // every crafted T1 weapon names a good masterwork one quality up (crafting 2.6)
    for (const r of content().recipes.filter((x) => x.output?.itemId.startsWith('eq_t1_'))) {
      const out = items.get(r.output?.itemId ?? '');
      expect(items.get(r.masterwork?.itemId ?? '')?.quality, r.id).toBe((out?.quality ?? 0) + 1);
    }
  });

  it('weapons and body armour name their hit-sound classes', () => {
    for (const it of content().items) {
      if (it.id.startsWith('zz_')) continue;
      const row = it as ItemDef & { weaponClass?: string; armorClass?: string };
      if (row.kind === 'weapon') expect(row.weaponClass, row.id).toBeTruthy();
      if (row.kind === 'armor' && row.slot && row.slot !== 'off_hand' && row.slot !== 'trinket')
        expect(row.armorClass, row.id).toBeTruthy();
    }
  });
});

describe('a portion from a tainted stack', () => {
  const FOOD = 'cs_scavenger_jerky';

  function eat(sedTier?: 1 | 2 | 3, purified?: true) {
    const g = game(TOWN);
    withCtx(g, (ctx) => {
      addItem(ctx, 'player', FOOD, 1, 'gain', sedTier ? { sedTier, purified } : undefined);
    });
    const before = body(g)?.taint ?? 0;
    g.queue('inventory.use', { ownerId: 'player', itemId: FOOD });
    g.step(2);
    expect(lastResult(g, 'inventory.use')?.ok).toBe(true);
    const used = events(g, 'item.used').filter((e) => e.data.itemId === FOOD);
    return { used: used[used.length - 1]?.data, gain: (body(g)?.taint ?? 0) - before };
  }

  it('names its grain on item.used and adds that grade of taint', () => {
    const mid = eat(2);
    expect(mid.used?.sedTier).toBe(2);
    expect(mid.gain).toBeCloseTo(3, 5);
    expect(eat(3).gain).toBeCloseTo(8, 5);
  });

  it('a clean or purified portion adds nothing', () => {
    const clean = eat();
    expect(clean.used?.sedTier).toBeUndefined();
    expect(clean.gain).toBeCloseTo(0, 5);
    const washed = eat(1, true);
    expect(washed.used?.sedTier).toBeUndefined();
    expect(washed.gain).toBeCloseTo(0, 5);
  });
});
