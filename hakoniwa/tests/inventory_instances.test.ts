// The item instance layer (D-072, PK-M1-13): stacked goods against pieces with records,
// durability (death wear, fight wear, the 20% line, 0 gives nothing, poor pieces break),
// repair (cost, who may, materials, the field kit), triggers in the one `procs` shape
// (order, chance stream, internal cooldowns, no chaining, sets and enchants), consumable
// cooldown groups, the workshop ports (sign, purify, refine, enchant), the crafting skill
// cap, and the save side: the slice check, the rename fields, the backfill of saves from
// before the layer, and the instance round trip.

import { describe, expect, it } from 'vitest';
import { Engine } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import { applyRenames, RenameSet, serializeWorld, worldHash } from '../src/core/save';
import { migrateSnapshot } from '../src/core/save/migrate';
import type { GameSystem, SystemContext } from '../src/core/system';
import {
  addInstance,
  addItem,
  addMoney,
  applyCombatWear,
  applyDeathWear,
  CRAFT_SKILL_CAP,
  canRepair,
  clampCraftSkill,
  craftTierOf,
  type EnchantDef,
  effectiveDef,
  enchantInstance,
  equippedDefs,
  fieldKitMends,
  fireProcs,
  type Holding,
  INVENTORY_ID_FIELDS,
  type ItemDef,
  type ItemSetDef,
  instancesOf,
  system as inventory,
  layerCap,
  maxDurability,
  parseProcDo,
  parseProcWhen,
  plainCount,
  procProblems,
  purifyInstance,
  purifyStack,
  refineInstance,
  removeItem,
  repairInstance,
  repairQuote,
  sedimentWearFactor,
  signInstance,
  stackCount,
  transferItem,
  UNRECORDED,
  upgradeSlice,
  validateInventorySlice,
  wearInstance,
} from '../src/systems/inventory';
import { onDamage as onDamageForTest } from '../src/systems/inventory/procs';

// ---------------------------------------------------------------------------
// A tiny catalogue

const item = (over: Partial<ItemDef> & { id: string }): ItemDef => ({
  name: over.id,
  kind: 'material',
  quality: 1,
  value: 100,
  desc: '',
  ...over,
});

const ITEMS: ItemDef[] = [
  item({
    id: 'x_sword',
    kind: 'weapon',
    quality: 1,
    value: 1000,
    slot: 'main_hand',
    level: 5,
    weapon: { min: 10, max: 20, speed: 2, range: 1.2 },
    stats: { str: 10 },
  }),
  item({
    id: 'x_rusty',
    kind: 'weapon',
    quality: 0,
    value: 8,
    slot: 'main_hand',
    weapon: { min: 2, max: 5, speed: 2, range: 1.2 },
    salvage: { itemId: 'x_scrap', count: 2 },
  }),
  item({
    id: 'x_fine_helm',
    kind: 'armor',
    quality: 3,
    value: 2000,
    slot: 'head',
    level: 12,
    tags: ['plate'],
    stats: { sta: 10, armor: 100 },
    set: 'set_x',
    repairMaterial: 'x_ingot',
    procs: [{ on: 'struck', chance: 1, do: 'aura:aur_x_guard@self' }],
  }),
  item({
    id: 'x_chest',
    kind: 'armor',
    quality: 2,
    value: 600,
    slot: 'chest',
    tags: ['leather'],
    stats: { agi: 6 },
    set: 'set_x',
  }),
  item({
    id: 'x_named',
    kind: 'weapon',
    quality: 4,
    value: 5000,
    slot: 'main_hand',
    level: 20,
    weapon: { min: 30, max: 40, speed: 2.4, range: 1.2 },
    maker: 'x_smith',
    recognizes: 'x_hero',
    procs: [
      { on: 'hit', chance: 1, icd: 2, do: 'dmg:physical:Lv×3' },
      { on: 'kill', chance: 1, do: 'stack:str|int:1:10:60' },
      { on: 'struck', chance: 1, do: 'slow:0.5:3' },
      { on: 'spell', chance: 1, when: 'target.family=undead', do: 'cleanse' },
      { on: 'heal', chance: 1, when: 'holder=x_hero', do: 'hot:4:6' },
    ],
  }),
  item({ id: 'x_legend', kind: 'trinket', quality: 5, value: 0, slot: 'trinket' }),
  item({ id: 'x_twohand', kind: 'weapon', quality: 1, slot: 'main_hand', tags: ['two_hand'] }),
  item({ id: 'x_shield', kind: 'armor', quality: 1, slot: 'off_hand', tags: ['shield'] }),
  item({
    id: 'x_grained',
    kind: 'armor',
    quality: 2,
    slot: 'legs',
    stats: { sta: 100 },
    sed: { grade: 'mid' },
  }),
  item({ id: 'x_ingot' }),
  item({ id: 'x_scrap', quality: 0 }),
  item({ id: 'x_wood' }),
  item({
    id: 'x_potion',
    kind: 'consumable',
    use: { effect: 'heal', amount: 10, group: 'cd_potion' },
  }),
  item({
    id: 'x_tonic',
    kind: 'consumable',
    use: { effect: 'heal', amount: 5, group: 'cd_potion' },
  }),
  item({ id: 'x_charm', kind: 'consumable', use: { effect: 'return', group: 'cd_charm' } }),
  item({ id: 'x_snack', kind: 'consumable', use: { effect: 'heal', amount: 1 } }),
  item({
    id: 'x_kit',
    kind: 'consumable',
    level: 9,
    use: { effect: 'repair', amount: 30, group: 'cd_none' },
  }),
  item({ id: 'x_tool', kind: 'goods', tags: ['tool'] }),
  item({ id: 'x_stick', kind: 'weapon', slot: 'main_hand', instanced: false }),
  item({
    id: 'x_bandage',
    kind: 'consumable',
    use: { effect: 'heal', amount: 5, group: 'cd_bandage' },
  }),
  item({ id: 'x_bomb', kind: 'consumable', use: { effect: 'throw', group: 'cd_throw' } }),
  item({ id: 'x_cure', kind: 'consumable', use: { effect: 'sed_cure', group: 'cd_sed' } }),
  item({
    id: 'x_ward',
    kind: 'consumable',
    use: { effect: 'detect', group: 'cd_charm', cooldown: 10 },
  }),
  item({ id: 'x_t2_sword', kind: 'weapon', quality: 1, slot: 'main_hand', level: 12 }),
  item({ id: 'x_t1_fine', kind: 'weapon', quality: 3, slot: 'main_hand', level: 5 }),
];

const SETS: ItemSetDef[] = [
  {
    id: 'set_x',
    name: 'x set',
    bonuses: [
      { pieces: 2, stats: { sta: 7 }, procs: [{ on: 'struck', chance: 1, do: 'cleanse' }] },
      { pieces: 3, stats: { sta: 100 } },
    ],
  },
];

const ENCHANTS: EnchantDef[] = [
  {
    id: 'ench_x_head',
    name: 'h',
    slot: 'head',
    tier: 1,
    stats: { str: 3 },
    procs: [{ on: 'struck', chance: 1, do: 'sed:-1' }],
  },
  { id: 'ench_x_head2', name: 'h2', slot: 'head', tier: 1, stats: { int: 3 } },
  { id: 'ench_x_wpn', name: 'w', slot: 'wpn', tier: 1, stats: { agi: 3 } },
];

function content(): ContentMap {
  return {
    items: ITEMS,
    itemSets: SETS,
    enchants: ENCHANTS,
    auras: [{ id: 'aur_x_tick' }],
  } as unknown as ContentMap;
}

/** The inventory alone, plus a probe that runs one closure per step inside a context. */
class Harness {
  readonly g: Engine;
  private job: ((ctx: SystemContext) => void) | null = null;
  constructor(seed = 11) {
    const probe: GameSystem = {
      id: 'zz_probe',
      order: 999,
      tick: (ctx) => {
        const j = this.job;
        this.job = null;
        j?.(ctx);
      },
    };
    this.g = Engine.create(seed, content(), [inventory, probe], { aiMode: 'off' });
  }
  run<T>(fn: (ctx: SystemContext) => T): T {
    let out: T | undefined;
    this.job = (ctx) => {
      out = fn(ctx);
    };
    this.g.step(1);
    return out as T;
  }
  h(owner = 'p'): Holding {
    return this.g.world.slices.inventory.owners[owner] as Holding;
  }
  events<K extends AnyWorldEvent['kind']>(kind: K) {
    return this.g.world.recent.filter(
      (e): e is Extract<AnyWorldEvent, { kind: K }> => e.kind === kind,
    );
  }
  result(kind: string) {
    const r = [...this.g.world.recent]
      .reverse()
      .find((e) => e.kind === 'command.result' && e.data.kind === kind);
    return r?.kind === 'command.result' ? r.data : undefined;
  }
  command(kind: string, data: unknown, system?: string) {
    // a service run by a script (its results are reported like the player's)
    const source = system ? { type: 'script' as const, script: system } : undefined;
    this.g.queue(kind as never, data as never, source);
    this.g.step(1);
    return this.result(kind);
  }
}

// ---------------------------------------------------------------------------

describe('stacks and instances (catalog_equipment.md 1.6)', () => {
  it('gives equipment a record per piece and counts stacked goods', () => {
    const t = new Harness();
    const ids = t.run((ctx) => addItem(ctx, 'p', 'x_sword', 2));
    t.run((ctx) => addItem(ctx, 'p', 'x_wood', 5));
    const h = t.h();
    expect(ids).toEqual(['it1', 'it2']);
    expect(h.items).toEqual({ x_sword: 2, x_wood: 5 });
    expect(instancesOf(h, 'x_sword').map((i) => i.durability)).toEqual([
      { cur: 40, max: 40 },
      { cur: 40, max: 40 },
    ]);
    expect(h.instances?.it1?.defId).toBe('x_sword');
    // a tool tag makes goods an instance; a legendary piece keeps a record but never wears
    t.run((ctx) => addItem(ctx, 'p', 'x_tool'));
    t.run((ctx) => addItem(ctx, 'p', 'x_legend'));
    expect(instancesOf(t.h(), 'x_tool')).toHaveLength(1);
    expect(instancesOf(t.h(), 'x_legend')[0]?.durability).toBeUndefined();
    expect(validateInventorySlice(t.g.world.slices.inventory)).toEqual([]);
  });

  it('signs pieces with their maker and names the holder of a named piece', () => {
    const t = new Harness();
    const id = t.run((ctx) => addInstance(ctx, 'p', 'x_named')) as string;
    const inst = t.h().instances?.[id];
    expect(inst).toMatchObject({
      signature: 'x_smith',
      holder: 'p',
      durability: { cur: 100, max: 100 },
    });
    // a crafted piece the player made carries the unrecorded signature
    const own = t.run((ctx) => addInstance(ctx, 'p', 'x_sword', { signature: UNRECORDED }));
    expect(t.h().instances?.[own as string]?.signature).toBe('unrecorded');
  });

  it('keeps qualified stacks apart and takes plain ones first', () => {
    const t = new Harness();
    t.run((ctx) => addItem(ctx, 'p', 'x_wood', 3));
    t.run((ctx) => addItem(ctx, 'p', 'x_wood', 2, 'gather', { sedTier: 1 }));
    t.run((ctx) => addItem(ctx, 'p', 'x_wood', 1, 'gather', { signature: 'x_smith' }));
    let h = t.h();
    expect(h.items.x_wood).toBe(6);
    expect(plainCount(h, 'x_wood')).toBe(3);
    expect(stackCount(h, 'x_wood', { sedTier: 1 })).toBe(2);
    expect(h.stacks?.map((p) => p.count)).toEqual([1, 2]);
    // plain first, then parts in key order
    expect(t.run((ctx) => removeItem(ctx, 'p', 'x_wood', 4))).toBe(true);
    h = t.h();
    expect([
      h.items.x_wood,
      plainCount(h, 'x_wood'),
      stackCount(h, 'x_wood', { sedTier: 1 }),
    ]).toEqual([2, 0, 2]);
    // a named stack key only
    expect(
      t.run((ctx) => removeItem(ctx, 'p', 'x_wood', 3, 'x', { qualifiers: { sedTier: 1 } })),
    ).toBe(false);
    expect(
      t.run((ctx) => removeItem(ctx, 'p', 'x_wood', 2, 'x', { qualifiers: { sedTier: 1 } })),
    ).toBe(true);
    expect(t.h().items.x_wood).toBeUndefined();
    expect(t.h().stacks).toBeUndefined();
    expect(validateInventorySlice(t.g.world.slices.inventory)).toEqual([]);
  });

  it('equips the best kept piece, unequips, and leaves the worn piece last', () => {
    const t = new Harness();
    const [a, b] = t.run((ctx) => addItem(ctx, 'p', 'x_sword', 2));
    t.run((ctx) => wearInstance(ctx, 'p', a as string, 30, 'test'));
    expect(t.command('inventory.equip', { ownerId: 'p', itemId: 'x_sword' })?.ok).toBe(true);
    expect(t.h().worn).toEqual({ main_hand: b });
    expect(t.h().equipped).toEqual({ main_hand: 'x_sword' });
    // removing one takes the unworn piece; the worn one stays on
    t.run((ctx) => removeItem(ctx, 'p', 'x_sword', 1));
    expect(Object.keys(t.h().instances ?? {})).toEqual([b]);
    expect(t.h().worn).toEqual({ main_hand: b });
    // a chosen instance; a wrong one is refused
    expect(
      t.command('inventory.equip', { ownerId: 'p', itemId: 'x_sword', instanceId: 'it99' })?.ok,
    ).toBe(false);
    expect(t.command('inventory.unequip', { ownerId: 'p', slot: 'main_hand' })?.ok).toBe(true);
    expect([t.h().equipped, t.h().worn]).toEqual([{}, undefined]);
  });

  it('clears the off hand for a two-handed weapon and the two-hander for an off hand', () => {
    const t = new Harness();
    t.run((ctx) => {
      addItem(ctx, 'p', 'x_twohand');
      addItem(ctx, 'p', 'x_shield');
    });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_shield' });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_twohand' });
    expect(t.h().equipped).toEqual({ main_hand: 'x_twohand' });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_shield' });
    expect(t.h().equipped).toEqual({ off_hand: 'x_shield' });
  });

  it('moves records whole between owners; a named piece changes holder', () => {
    const t = new Harness();
    const id = t.run((ctx) => addInstance(ctx, 'p', 'x_named')) as string;
    t.run((ctx) => {
      const inst = ctx.world.slices.inventory.owners.p?.instances?.[id];
      if (inst) inst.marks = 12;
    });
    t.run((ctx) => wearInstance(ctx, 'p', id, 10, 'test'));
    expect(
      t.command('inventory.give', { fromId: 'p', toId: 'q', itemId: 'x_named', count: 1 })?.ok,
    ).toBe(true);
    const moved = t.h('q').instances?.[id];
    expect(moved).toMatchObject({
      marks: 12,
      signature: 'x_smith',
      holder: 'q',
      durability: { cur: 90 },
    });
    expect(t.h().items.x_named).toBeUndefined();
    expect(t.run((ctx) => transferItem(ctx, 'p', 'q', 'x_named'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('durability (catalog_equipment.md 2.7; combat_and_classes.md 13.2, 15.1)', () => {
  it('caps durability by quality, deep pieces higher, legendary and goods never', () => {
    expect(
      [0, 1, 2, 3, 4].map((q) => maxDurability(item({ id: 'a', kind: 'armor', quality: q }))),
    ).toEqual([20, 40, 60, 80, 100]);
    expect(maxDurability(item({ id: 'a', kind: 'armor', quality: 2, tags: ['deep'] }))).toBe(80);
    expect(maxDurability(item({ id: 'a', kind: 'weapon', quality: 5 }))).toBeUndefined();
    expect(maxDurability(item({ id: 'a', kind: 'material' }))).toBeUndefined();
    expect(maxDurability(item({ id: 'a', kind: 'armor', durability: 0 }))).toBeUndefined();
    expect(maxDurability(item({ id: 'a', kind: 'armor', durability: 90 }))).toBe(90);
  });

  it('takes 10% of the maximum from every worn piece at death, never below 0, never the bag', () => {
    const t = new Harness();
    const [worn] = t.run((ctx) => addItem(ctx, 'p', 'x_sword'));
    const [bag] = t.run((ctx) => addItem(ctx, 'p', 'x_sword'));
    const [helm] = t.run((ctx) => addItem(ctx, 'p', 'x_fine_helm'));
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_sword', instanceId: worn });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_fine_helm' });
    const hit = t.run((ctx) => applyDeathWear(ctx, 'p'));
    expect(hit).toEqual([worn, helm]);
    const h = t.h();
    expect(h.instances?.[worn as string]?.durability).toEqual({ cur: 36, max: 40 });
    expect(h.instances?.[helm as string]?.durability).toEqual({ cur: 72, max: 80 });
    expect(h.instances?.[bag as string]?.durability).toEqual({ cur: 40, max: 40 });
    // repeated deaths stop at 0; the broken piece stays worn and gives nothing
    for (let i = 0; i < 12; i++) t.run((ctx) => applyDeathWear(ctx, 'p'));
    expect(t.h().instances?.[worn as string]?.durability?.cur).toBe(0);
    expect(t.h().equipped.main_hand).toBe('x_sword');
    const states = t
      .events('item.durability')
      .filter((e) => e.data.instanceId === worn)
      .map((e) => e.data.state);
    expect(states).toEqual(['low', 'broken']);
    const gear = equippedDefs(t.g.world, t.g.content, 'p');
    expect(gear.map((d) => d.id)).toEqual([]);
  });

  it('breaks a poor piece at 0 into its salvage', () => {
    const t = new Harness();
    const [id] = t.run((ctx) => addItem(ctx, 'p', 'x_rusty'));
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_rusty' });
    t.run((ctx) => wearInstance(ctx, 'p', id as string, 25, 'test'));
    expect(t.h().items).toEqual({ x_scrap: 2 });
    expect(t.h().equipped).toEqual({});
    expect(t.events('item.durability').at(-1)?.data.state).toBe('shattered');
  });

  it('does not wear a named piece in the hands its will recognizes', () => {
    const t = new Harness();
    const id = t.run((ctx) => addInstance(ctx, 'p', 'x_named', { holder: 'x_hero' })) as string;
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_named' });
    t.run((ctx) => applyDeathWear(ctx, 'p'));
    expect(t.h().instances?.[id]?.durability?.cur).toBe(100);
  });

  it('wears one point a fight, metal more in sediment, soft pieces never more', () => {
    const t = new Harness();
    t.run((ctx) => {
      addItem(ctx, 'p', 'x_fine_helm');
      addItem(ctx, 'p', 'x_chest');
    });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_fine_helm' });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_chest' });
    t.run((ctx) => applyCombatWear(ctx, 'p'));
    const d = () => Object.values(t.h().instances ?? {}).map((i) => i.durability?.cur);
    expect(d()).toEqual([79, 59]);
  });
});

describe('repair (catalog_equipment.md 2.7)', () => {
  it('quotes value x 0.2 x the share lost, with a material per started 25% on fine pieces', () => {
    const helm = ITEMS.find((i) => i.id === 'x_fine_helm') as ItemDef;
    const q = repairQuote(helm, {
      instanceId: 'a',
      defId: helm.id,
      durability: { cur: 50, max: 80 },
    });
    expect(q).toEqual({ lost: 0.375, copper: 150, material: { itemId: 'x_ingot', count: 2 } });
    expect(
      repairQuote(helm, { instanceId: 'a', defId: helm.id, durability: { cur: 80, max: 80 } }),
    ).toBeNull();
    const inst = { instanceId: 'a', defId: helm.id, signature: 'x_smith' };
    expect(canRepair(helm, inst, { skill: 74 })).toBe(false);
    expect(canRepair(helm, inst, { skill: 75 })).toBe(true);
    const named = ITEMS.find((i) => i.id === 'x_named') as ItemDef;
    expect(canRepair(named, inst, { skill: 150 })).toBe(false);
    expect(canRepair(named, inst, { skill: 0, id: 'x_smith' })).toBe(true);
    expect(canRepair(named, inst, { skill: 0, master: true })).toBe(true);
  });

  it('repairs at a smith with the payer purse and the material, or changes nothing', () => {
    const t = new Harness();
    const [id] = t.run((ctx) => addItem(ctx, 'p', 'x_fine_helm'));
    t.run((ctx) => wearInstance(ctx, 'p', id as string, 30, 'test'));
    // no money, no material, a smith too green: nothing changes
    expect(t.run((ctx) => repairInstance(ctx, 'p', id as string, { skill: 75 })).failure).toBe(
      'money',
    );
    t.g.world.slices.inventory.owners.p = { ...t.h(), money: 1000 };
    expect(t.run((ctx) => repairInstance(ctx, 'p', id as string, { skill: 75 })).failure).toBe(
      'material',
    );
    t.run((ctx) => addItem(ctx, 'p', 'x_ingot', 2));
    expect(t.run((ctx) => repairInstance(ctx, 'p', id as string, { skill: 10 })).failure).toBe(
      'smith',
    );
    expect(t.h().instances?.[id as string]?.durability?.cur).toBe(50);
    const r = t.command('inventory.repair', { ownerId: 'p', skill: 75 }, 'smithy');
    expect(r?.ok).toBe(true);
    expect(t.h().instances?.[id as string]?.durability?.cur).toBe(80);
    expect([t.h().money, t.h().items.x_ingot]).toEqual([1000 - 150, undefined]);
    expect(t.command('inventory.repair', { ownerId: 'p' }, 'smithy')?.ok).toBe(false);
  });

  it('a field kit mends 30% on worn pieces of its tier and goes', () => {
    const t = new Harness();
    const [id] = t.run((ctx) => addItem(ctx, 'p', 'x_sword'));
    t.run((ctx) => addItem(ctx, 'p', 'x_kit', 2));
    expect(t.command('inventory.use', { ownerId: 'p', itemId: 'x_kit' })?.ok).toBe(false);
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_sword' });
    t.run((ctx) => wearInstance(ctx, 'p', id as string, 30, 'test'));
    expect(t.command('inventory.use', { ownerId: 'p', itemId: 'x_kit' })?.ok).toBe(true);
    expect(t.h().instances?.[id as string]?.durability?.cur).toBe(22);
    expect(t.h().items.x_kit).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('what worn gear gives (combat_and_classes.md 13.1)', () => {
  it('scales stats by refining and grain, adds enchants, and counts set pieces once', () => {
    const helm = ITEMS.find((i) => i.id === 'x_fine_helm') as ItemDef;
    const c = { items: ITEMS, enchants: ENCHANTS, itemSets: SETS };
    const plain = effectiveDef(helm, { instanceId: 'a', defId: helm.id }, c);
    expect(plain).toBe(helm);
    const up = effectiveDef(
      helm,
      { instanceId: 'a', defId: helm.id, refine: 2, affixes: ['ench_x_head'] },
      c,
    );
    expect(Object.keys(up.stats ?? {})).toEqual(['sta', 'armor', 'str']);
    expect(up.stats?.sta).toBeCloseTo(11);
    expect(up.stats?.armor).toBeCloseTo(110);
    expect(up.stats?.str).toBe(3);
    const legs = ITEMS.find((i) => i.id === 'x_grained') as ItemDef;
    expect(effectiveDef(legs, { instanceId: 'b', defId: legs.id }, c).stats?.sta).toBeCloseTo(106);
    expect(effectiveDef(legs, { instanceId: 'b', defId: legs.id }, c, 4).stats?.sta).toBeCloseTo(
      112,
    );
    expect(
      effectiveDef(legs, { instanceId: 'b', defId: legs.id, purified: true }, c, 4),
    ).toMatchObject({ stats: { sta: 100 }, sed: { grade: 'mid', purified: true } });
    const sword = ITEMS.find((i) => i.id === 'x_sword') as ItemDef;
    const w = effectiveDef(sword, { instanceId: 'c', defId: sword.id, refine: 1 }, c).weapon;
    expect([w?.min, w?.max, w?.speed]).toEqual([expect.closeTo(10.5), expect.closeTo(21), 2]);

    const t = new Harness();
    t.run((ctx) => {
      addItem(ctx, 'p', 'x_fine_helm');
      addItem(ctx, 'p', 'x_chest');
    });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_fine_helm' });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_chest' });
    const gear = equippedDefs(t.g.world, t.g.content, 'p');
    expect(gear.map((d) => [d.id, d.slot])).toEqual([
      ['x_fine_helm', 'head'],
      ['x_chest', 'chest'],
      ['set_x', undefined],
    ]);
    expect(gear[2]?.stats).toEqual({ sta: 7 });
    // a broken piece leaves the set
    const chest = t.h().worn?.chest as string;
    t.run((ctx) => wearInstance(ctx, 'p', chest, 999, 'test'));
    expect(equippedDefs(t.g.world, t.g.content, 'p').map((d) => d.id)).toEqual(['x_fine_helm']);
  });
});

describe('triggers: the one procs shape (combat_and_classes.md 13.3)', () => {
  it('parses the do and when grammar and rejects anything else', () => {
    expect(parseProcDo('aura:aur_x@self')).toEqual({ kind: 'aura', aura: 'aur_x', at: 'self' });
    expect(parseProcDo('aura:aur_x')).toEqual({ kind: 'aura', aura: 'aur_x', at: 'target' });
    expect(parseProcDo('dmg:holy:Lv×3')).toEqual({
      kind: 'dmg',
      school: 'holy',
      amount: { perLevel: 3 },
    });
    expect(parseProcDo('chain:frost:12:3')).toMatchObject({ kind: 'chain', jumps: 3 });
    expect(parseProcDo('slow:0.5:4')).toEqual({ kind: 'slow', mult: 0.5, secs: 4 });
    expect(parseProcDo('dot:shadow:5:12')).toMatchObject({ kind: 'dot', secs: 12 });
    expect(parseProcDo('hot:Lvx2:9')).toMatchObject({ kind: 'hot', perTick: { perLevel: 2 } });
    expect(parseProcDo('stack:str|int:1:10:60')).toMatchObject({ stats: ['str', 'int'], max: 10 });
    expect(parseProcDo('sed:+1')).toEqual({ kind: 'sed', delta: 1 });
    expect(parseProcDo('morale:-5')).toEqual({ kind: 'morale', delta: -5 });
    expect(parseProcDo('cleanse')).toEqual({ kind: 'cleanse' });
    for (const bad of [
      'dmg:light:3',
      'aura:',
      'chain:fire:3',
      'heal:5',
      'slow:x:1',
      'aura:a@there',
    ]) {
      expect(parseProcDo(bad), bad).toBeNull();
    }
    expect(parseProcWhen('target.family=undead, zone.sed>=3')).toEqual([
      { atom: 'target.family', value: 'undead' },
      { atom: 'zone.sed', min: 3 },
    ]);
    expect(parseProcWhen('hp<0.3,night,solo,holder=marcus,region=lotha')).toHaveLength(5);
    expect(parseProcWhen('moon=full')).toBeNull();
    expect(procProblems({ on: 'hit', chance: 0, do: 'cleanse' })).toEqual(['chance out of (0, 1]']);
    expect(procProblems({ on: 'nope' as never, chance: 1, do: 'x', when: 'y' })).toHaveLength(3);
  });

  it('fires in slot, enchant, set order with icd, and draws only when a piece carries the trigger', () => {
    const t = new Harness();
    t.run((ctx) => {
      addItem(ctx, 'p', 'x_fine_helm');
      addItem(ctx, 'p', 'x_chest');
      addItem(ctx, 'p', 'x_named');
    });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_fine_helm' });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_chest' });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_named' });
    const helm = t.h().worn?.head as string;
    t.run((ctx) => enchantInstance(ctx, 'p', helm, 'ench_x_head'));
    const rng = () => JSON.stringify(t.g.world.rng['combat.proc'] ?? null);
    // no piece carries `heal`: no draw on the stream
    const before = rng();
    expect(t.run((ctx) => fireProcs(ctx, 'p', 'heal'))).toEqual([]);
    expect(rng()).toBe(before);
    const struck = t.run((ctx) => fireProcs(ctx, 'p', 'struck', { targetId: 'm' }));
    // main hand first, then the head piece's own trigger, its enchant, then the set
    expect(struck.map((f) => [f.source.kind, f.source.sourceId])).toEqual([
      ['item', 'x_named'],
      ['item', 'x_fine_helm'],
      ['enchant', 'ench_x_head'],
      ['set', 'set_x'],
    ]);
    expect(rng()).not.toBe(before);
    // the named weapon: Lv x 3 resolved at item level 20, then its 2 s internal cooldown
    const at = t.run((ctx) => {
      const fired = fireProcs(ctx, 'p', 'hit', { targetId: 'm' });
      expect(fired.map((f) => f.effect)).toEqual([{ kind: 'dmg', school: 'physical', amount: 60 }]);
      return ctx.tick;
    });
    const hitAt = (tick: number) => {
      while (t.g.tick < tick - 1) t.g.step(1);
      return t.run((ctx) => {
        expect(ctx.tick).toBe(tick);
        return fireProcs(ctx, 'p', 'hit').length;
      });
    };
    expect(hitAt(at + 39)).toBe(0);
    expect(hitAt(at + 40)).toBe(1);
    expect(t.events('item.proc').at(-1)?.data).toMatchObject({
      ownerId: 'p',
      on: 'hit',
      source: 'item',
      sourceId: 'x_named',
    });
  });

  it('checks conditions against what the caller knows and the holder', () => {
    const t = new Harness();
    t.run((ctx) => addInstance(ctx, 'p', 'x_named', { holder: 'x_hero' }));
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_named' });
    const fire = (on: 'spell' | 'heal', env: object) =>
      t.run((ctx) => fireProcs(ctx, 'p', on, { env }).length);
    expect(fire('spell', {})).toBe(0);
    expect(fire('spell', { targetFamily: 'beast' })).toBe(0);
    expect(fire('spell', { targetFamily: 'undead' })).toBe(1);
    expect(fire('heal', {})).toBe(1);
    const other = new Harness();
    other.run((ctx) => addInstance(ctx, 'p', 'x_named'));
    other.command('inventory.equip', { ownerId: 'p', itemId: 'x_named' });
    expect(other.run((ctx) => fireProcs(ctx, 'p', 'heal').length)).toBe(0);
  });

  it('turns combat events into trigger points without chaining; kill always counts', () => {
    const t = new Harness();
    t.run((ctx) => addItem(ctx, 'p', 'x_named'));
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_named' });
    const dmg = {
      sourceId: 'p',
      targetId: 'm',
      school: 'physical',
      outcome: 'hit',
      weaponClass: 'sword',
    };
    t.run((ctx) => onDamageForTest(ctx, { ...dmg, fromProc: true }));
    expect(t.events('item.proc')).toHaveLength(0);
    // a periodic tick (an aura id under abilityId) is no swing
    t.run((ctx) => onDamageForTest(ctx, { ...dmg, abilityId: 'aur_x_tick' }));
    expect(t.events('item.proc')).toHaveLength(0);
    t.run((ctx) => onDamageForTest(ctx, dmg));
    expect(t.events('item.proc')).toHaveLength(1);
    // the engine routes combat.kill to the inventory: the kill trigger fires
    t.run((ctx) =>
      ctx.emit(
        'combat.kill' as never,
        {
          killerId: 'p',
          victimId: 'm',
          rank: 'normal',
          level: 1,
          tier: 0,
          side: 'enemy',
          mapId: 'x',
        } as never,
      ),
    );
    expect(t.events('item.proc').at(-1)?.data.on).toBe('kill');
  });

  it('does not fire from a broken piece', () => {
    const t = new Harness();
    const [id] = t.run((ctx) => addItem(ctx, 'p', 'x_named'));
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_named' });
    t.run((ctx) => wearInstance(ctx, 'p', id as string, 100, 'test'));
    expect(t.run((ctx) => fireProcs(ctx, 'p', 'hit'))).toEqual([]);
  });

  it('marks fine pieces on a named or lord kill, by origin', () => {
    const t = new Harness();
    const [helm] = t.run((ctx) => addItem(ctx, 'p', 'x_fine_helm'));
    const [chest] = t.run((ctx) => addItem(ctx, 'p', 'x_chest'));
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_fine_helm' });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_chest' });
    const kill = (rank: string) =>
      t.run((ctx) =>
        ctx.emit(
          'combat.kill' as never,
          {
            killerId: 'p',
            victimId: 'm',
            rank,
            family: 'undead',
            level: 1,
            tier: 0,
            side: 'enemy',
            mapId: 'x',
          } as never,
        ),
      );
    kill('normal');
    kill('rare');
    kill('boss');
    expect(t.h().instances?.[helm as string]).toMatchObject({
      marks: 15,
      markFrom: { 'family:undead': 15 },
    });
    expect(t.h().instances?.[chest as string]?.marks).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

describe('consumable cooldown groups (catalog_consumables_magitools.md 2.1)', () => {
  it('shares 120 seconds across potions and leaves ungrouped items free', () => {
    const t = new Harness();
    t.run((ctx) => {
      addItem(ctx, 'p', 'x_potion', 2);
      addItem(ctx, 'p', 'x_tonic');
      addItem(ctx, 'p', 'x_snack', 2);
    });
    expect(t.command('inventory.use', { ownerId: 'p', itemId: 'x_potion' })?.ok).toBe(true);
    const r = t.command('inventory.use', { ownerId: 'p', itemId: 'x_tonic' });
    expect(r).toMatchObject({
      ok: false,
      code: 'cooldown',
      reason: { key: 'sys.inventory.reject.cooldown' },
    });
    expect(t.h().items.x_tonic).toBe(1);
    expect(t.command('inventory.use', { ownerId: 'p', itemId: 'x_snack' })?.ok).toBe(true);
    expect(t.command('inventory.use', { ownerId: 'p', itemId: 'x_snack' })?.ok).toBe(true);
    t.g.step(120 * 20);
    expect(t.command('inventory.use', { ownerId: 'p', itemId: 'x_tonic' })?.ok).toBe(true);
  });

  it('holds the movement charms for 30 game minutes', () => {
    const t = new Harness();
    t.run((ctx) => addItem(ctx, 'p', 'x_charm', 2));
    expect(t.command('inventory.use', { ownerId: 'p', itemId: 'x_charm' })?.ok).toBe(true);
    expect(t.command('inventory.use', { ownerId: 'p', itemId: 'x_charm' })?.ok).toBe(false);
    t.g.step(30 * 20);
    expect(t.command('inventory.use', { ownerId: 'p', itemId: 'x_charm' })?.ok).toBe(true);
  });
});

describe('workshop ports (catalog_equipment.md 2.6, 2.8, 6)', () => {
  it('signs, purifies pieces and stacks, refines by layer, and enchants into the slots', () => {
    const t = new Harness();
    const [helm] = t.run((ctx) => addItem(ctx, 'p', 'x_fine_helm'));
    const [legs] = t.run((ctx) => addItem(ctx, 'p', 'x_grained'));
    const [rusty] = t.run((ctx) => addItem(ctx, 'p', 'x_rusty'));
    expect(t.run((ctx) => signInstance(ctx, 'p', helm as string, 'x_smith'))).toBe(true);
    expect(t.events('item.signed').at(-1)?.data.signature).toBe('x_smith');
    expect(t.run((ctx) => purifyInstance(ctx, 'p', legs as string))).toBe(true);
    expect(t.h().instances?.[legs as string]).toMatchObject({ sedTier: 2, purified: true });
    expect(t.run((ctx) => purifyInstance(ctx, 'p', helm as string))).toBe(false);
    t.run((ctx) => addItem(ctx, 'p', 'x_wood', 3, 'gather', { sedTier: 1 }));
    expect(t.run((ctx) => purifyStack(ctx, 'p', 'x_wood', 2, 1))).toBe(true);
    expect([
      stackCount(t.h(), 'x_wood', { sedTier: 1 }),
      stackCount(t.h(), 'x_wood', { sedTier: 1, purified: true }),
    ]).toEqual([1, 2]);
    // refining: +1 needs 50, +2 75, +3 100; three is the top
    expect(t.run((ctx) => refineInstance(ctx, 'p', helm as string, { skill: 49 })).ok).toBe(false);
    for (const skill of [50, 75, 100]) {
      expect(t.run((ctx) => refineInstance(ctx, 'p', helm as string, { skill })).ok).toBe(true);
    }
    expect(t.run((ctx) => refineInstance(ctx, 'p', helm as string, { skill: 150 })).failure).toBe(
      'max',
    );
    // enchants: the slot must fit; a common piece has one slot, a new enchant pushes out the old
    expect(t.run((ctx) => enchantInstance(ctx, 'p', helm as string, 'ench_x_wpn')).failure).toBe(
      'slot',
    );
    t.run((ctx) => enchantInstance(ctx, 'p', helm as string, 'ench_x_head'));
    const r = t.run((ctx) => enchantInstance(ctx, 'p', helm as string, 'ench_x_head2'));
    expect(r).toEqual({ ok: true, replaced: 'ench_x_head' });
    expect(t.h().instances?.[helm as string]?.affixes).toEqual(['ench_x_head2']);
    expect(t.run((ctx) => enchantInstance(ctx, 'p', rusty as string, 'ench_x_wpn')).failure).toBe(
      'no_room',
    );
  });

  it('caps the crafting skill at 150 in six layers of 25 (D-072)', () => {
    expect(CRAFT_SKILL_CAP).toBe(150);
    expect([0, 24, 25, 49, 50, 99, 100, 124, 125, 150, 400].map(craftTierOf)).toEqual([
      1, 1, 2, 2, 3, 4, 5, 5, 6, 6, 6,
    ]);
    expect([1, 3, 6, 9].map(layerCap)).toEqual([25, 75, 150, 150]);
    expect(clampCraftSkill(90, 3)).toBe(75);
    expect(clampCraftSkill(999)).toBe(150);
  });
});

// ---------------------------------------------------------------------------

describe('saves: check, renames, backfill and round trip', () => {
  /** A holding as saves before the instance layer wrote it. */
  function oldWorld(): Engine {
    const t = new Harness(3);
    const inv = t.g.world.slices.inventory;
    delete inv.rev;
    inv.owners.p = {
      money: 50,
      items: { x_sword: 2, x_wood: 4, x_fine_helm: 1 },
      equipped: { main_hand: 'x_sword', head: 'x_fine_helm' },
    };
    return t.g;
  }

  it('accepts the old shape and the new one and names what is broken', () => {
    const g = oldWorld();
    expect(validateInventorySlice(g.world.slices.inventory)).toEqual([]);
    expect(validateInventorySlice(undefined)).toEqual([]);
    const bad = {
      owners: {
        p: {
          money: 'x',
          items: { a: -1, b: 1 },
          equipped: { belt: 'b', head: 'a' },
          instances: {
            it1: { instanceId: 'it2', defId: 'b' },
            it3: { instanceId: 'it3', defId: 'b', durability: { cur: 9, max: 5 } },
            it4: { instanceId: 'it4', defId: 'b' },
          },
          worn: { head: 'it4' },
          stacks: [{ itemId: 'b', count: 3 }],
        },
      },
    };
    const problems = validateInventorySlice(bad);
    for (const re of [
      /money/,
      /items\.a/,
      /belt/,
      /it1 is not an instance/,
      /it3\.durability/,
      /2 records of b for 1/,
      /worn\.head/,
      /3 qualified b/,
    ]) {
      expect(
        problems.some((p) => re.test(p)),
        String(re),
      ).toBe(true);
    }
  });

  it('gives an old holding its records on the first tick, once, worn slots included', () => {
    const g = oldWorld();
    g.step(1);
    const inv = g.world.slices.inventory;
    const h = inv.owners.p as Holding;
    expect(inv.rev).toBe(1);
    expect(instancesOf(h, 'x_sword').map((i) => i.durability)).toEqual([
      { cur: 40, max: 40 },
      { cur: 40, max: 40 },
    ]);
    expect(h.worn).toEqual({
      main_hand: instancesOf(h, 'x_sword')[0]?.instanceId,
      head: instancesOf(h, 'x_fine_helm')[0]?.instanceId,
    });
    expect(h.items).toEqual({ x_sword: 2, x_wood: 4, x_fine_helm: 1 });
    expect(validateInventorySlice(inv)).toEqual([]);
    g.step(5);
    expect(Object.keys(h.instances ?? {})).toHaveLength(3);
    // idempotent: syncing again changes nothing
    const copy = JSON.parse(JSON.stringify(inv));
    upgradeSlice(
      copy,
      (id) => ITEMS.find((i) => i.id === id),
      () => 'never',
    );
    expect(copy.owners).toEqual(inv.owners);
  });

  it('a port touching an old holding before the sweep gives the same records', () => {
    const a = oldWorld();
    a.step(1);
    const b = oldWorld();
    // the death port runs before the tick sweep
    const probe: GameSystem = {
      id: 'aa_first',
      order: 1,
      tick: (ctx) => void applyDeathWear(ctx, 'p'),
    };
    const eb = Engine.resume(b.world, b.content, [probe, ...b.systems]);
    eb.step(1);
    const ha = a.world.slices.inventory.owners.p as Holding;
    const hb = eb.world.slices.inventory.owners.p as Holding;
    expect(Object.keys(hb.instances ?? {}).sort()).toEqual(Object.keys(ha.instances ?? {}).sort());
    expect(
      instancesOf(hb, 'x_sword')
        .map((i) => i.durability?.cur)
        .sort(),
    ).toEqual([36, 40]);
    expect(validateInventorySlice(eb.world.slices.inventory)).toEqual([]);
  });

  it('renames an item in counts, slots, records and stack parts', () => {
    const t = new Harness();
    t.run((ctx) => {
      addItem(ctx, 'p', 'x_sword');
      addItem(ctx, 'p', 'x_wood', 2, 'gather', { sedTier: 1 });
    });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_sword' });
    const table = {
      version: 2,
      entries: [
        { since: 1, kind: 'item', from: 'x_sword', to: 'eq_x_sword' },
        { since: 2, kind: 'item', from: 'x_wood', to: 'mat_x_wood' },
      ],
    };
    applyRenames(t.g.world, new RenameSet(table as never, 0, { isCanonical: () => true }), [
      { slice: 'inventory', fields: INVENTORY_ID_FIELDS },
    ]);
    const h = t.h();
    expect(h.items).toEqual({ eq_x_sword: 1, mat_x_wood: 2 });
    expect(h.equipped).toEqual({ main_hand: 'eq_x_sword' });
    expect(Object.values(h.instances ?? {}).map((i) => i.defId)).toEqual(['eq_x_sword']);
    expect(h.stacks?.map((p) => p.itemId)).toEqual(['mat_x_wood']);
    expect(validateInventorySlice(t.g.world.slices.inventory)).toEqual([]);
  });

  it('round-trips instances through a save: same hash, same records', () => {
    const t = new Harness();
    const id = t.run((ctx) =>
      addInstance(ctx, 'p', 'x_named', { provenance: ['claim:x'] }),
    ) as string;
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_named' });
    t.run((ctx) => {
      wearInstance(ctx, 'p', id, 7.5, 'test');
      addItem(ctx, 'p', 'x_wood', 2, 'gather', { purified: true, sedTier: 2 });
    });
    const text = serializeWorld(t.g.world);
    const { world } = migrateSnapshot(text, 0, { owners: [inventory as never] });
    expect(worldHash(world)).toBe(worldHash(t.g.world));
    expect(world.slices.inventory.owners.p?.instances?.[id]).toEqual(t.h().instances?.[id]);
    const resumed = Engine.resume(world, t.g.content, t.g.systems);
    resumed.step(10);
    t.g.step(10);
    expect(worldHash(resumed.world)).toBe(worldHash(t.g.world));
  });
});

// ---------------------------------------------------------------------------

describe('pinned lengths, gates and factors', () => {
  it('holds each timer exactly its length', () => {
    const t = new Harness();
    t.run((ctx) => addItem(ctx, 'p', 'x_potion', 3));
    const use = () => t.command('inventory.use', { ownerId: 'p', itemId: 'x_potion' })?.ok;
    expect(use()).toBe(true);
    const start = t.g.tick - 1;
    while (t.g.tick < start + 120 * 20 - 1) t.g.step(1);
    expect(use()).toBe(false);
    expect(use()).toBe(true);
    // throwables share 30 seconds
    const u = new Harness();
    u.run((ctx) => addItem(ctx, 'p', 'x_bomb', 3));
    const toss = () => u.command('inventory.use', { ownerId: 'p', itemId: 'x_bomb' })?.ok;
    expect(toss()).toBe(true);
    const s0 = u.g.tick - 1;
    while (u.g.tick < s0 + 30 * 20 - 1) u.g.step(1);
    expect(toss()).toBe(false);
    expect(toss()).toBe(true);
  });

  it('keeps a bandaged person waiting 60 seconds whoever bandages next', () => {
    const t = new Harness();
    t.run((ctx) => {
      addItem(ctx, 'a', 'x_bandage', 3);
      addItem(ctx, 'b', 'x_bandage', 3);
    });
    const wrap = (by: string, on: string) =>
      t.command('inventory.use', { ownerId: by, itemId: 'x_bandage', targetId: on })?.ok;
    expect(wrap('a', 'm')).toBe(true);
    expect(wrap('b', 'm')).toBe(false);
    expect(wrap('a', 'n')).toBe(true);
    t.g.step(60 * 20);
    expect(wrap('b', 'm')).toBe(true);
  });

  it('lets an early sediment cure go down without effect and without a new timer', () => {
    const t = new Harness();
    t.run((ctx) => addItem(ctx, 'p', 'x_cure', 2));
    expect(t.command('inventory.use', { ownerId: 'p', itemId: 'x_cure' })?.ok).toBe(true);
    const ready = t.g.world.slices.inventory.timers?.p?.['use:cd_sed'];
    expect(ready).toBeGreaterThan(t.g.tick);
    expect(t.command('inventory.use', { ownerId: 'p', itemId: 'x_cure' })?.ok).toBe(true);
    expect(t.events('item.used').map((e) => e.data.early)).toEqual([undefined, true]);
    expect(t.g.world.slices.inventory.timers?.p?.['use:cd_sed']).toBe(ready);
    expect(t.h().items.x_cure).toBeUndefined();
  });

  it('runs a charm kind on its own timer', () => {
    const t = new Harness();
    t.run((ctx) => {
      addItem(ctx, 'p', 'x_ward', 2);
      addItem(ctx, 'p', 'x_charm', 1);
    });
    expect(t.command('inventory.use', { ownerId: 'p', itemId: 'x_ward' })?.ok).toBe(true);
    expect(t.command('inventory.use', { ownerId: 'p', itemId: 'x_ward' })?.ok).toBe(false);
    // another charm kind is free
    expect(t.command('inventory.use', { ownerId: 'p', itemId: 'x_charm' })?.ok).toBe(true);
    t.g.step(10 * 20);
    expect(t.command('inventory.use', { ownerId: 'p', itemId: 'x_ward' })?.ok).toBe(true);
  });

  it('gates each refine level and named pieces on a master', () => {
    const t = new Harness();
    const [helm] = t.run((ctx) => addItem(ctx, 'p', 'x_fine_helm'));
    const id = helm as string;
    const ref = (skill: number, master?: boolean) =>
      t.run((ctx) => refineInstance(ctx, 'p', id, { skill, master }).ok);
    expect(ref(49)).toBe(false);
    expect(ref(50)).toBe(true);
    expect(ref(74)).toBe(false);
    expect(ref(75)).toBe(true);
    expect(ref(99)).toBe(false);
    expect(ref(100)).toBe(true);
    const named = t.run((ctx) => addInstance(ctx, 'p', 'x_named')) as string;
    expect(t.run((ctx) => refineInstance(ctx, 'p', named, { skill: 150 }).ok)).toBe(false);
    expect(t.run((ctx) => refineInstance(ctx, 'p', named, { skill: 0, master: true }).ok)).toBe(
      true,
    );
  });

  it('wears metal more in sediment, bone half the surcharge, soft pieces never more', () => {
    const plate = item({ id: 'a', kind: 'armor', tags: ['plate'] });
    const bone = item({ id: 'b', kind: 'armor', tags: ['bone'] });
    const cloth = item({ id: 'c', kind: 'armor', tags: ['cloth'] });
    const blade = item({ id: 'd', kind: 'weapon' });
    const staff = item({ id: 'e', kind: 'weapon', tags: ['staff'] });
    const rows = [0, 2, 3, 4, 5].map((sed) =>
      [plate, bone, cloth, blade, staff].map((d) => sedimentWearFactor(d, sed)),
    );
    expect(rows).toEqual([
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [1.5, 1.25, 1, 1.5, 1],
      [2, 1.5, 1, 2, 1],
      [3, 2, 1, 3, 1],
    ]);
  });

  it('gives named pieces two enchant slots', () => {
    const t = new Harness();
    const id = t.run((ctx) => addInstance(ctx, 'p', 'x_named')) as string;
    const more: EnchantDef[] = [
      ...ENCHANTS,
      { id: 'ench_x_wpn2', name: 'w2', slot: 'wpn', tier: 1 },
    ];
    (t.g.content as unknown as { enchants: EnchantDef[] }).enchants = more;
    t.run((ctx) => enchantInstance(ctx, 'p', id, 'ench_x_wpn'));
    expect(t.run((ctx) => enchantInstance(ctx, 'p', id, 'ench_x_wpn2'))).toEqual({
      ok: true,
      replaced: undefined,
    });
    expect(t.h().instances?.[id]?.affixes).toEqual(['ench_x_wpn', 'ench_x_wpn2']);
  });

  it('refuses a field kit for pieces above its tier or above fine', () => {
    const t = new Harness();
    t.run((ctx) => {
      addItem(ctx, 'p', 'x_t2_sword');
      addItem(ctx, 'p', 'x_kit');
    });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_t2_sword' });
    t.run((ctx) => wearInstance(ctx, 'p', t.h().worn?.main_hand as string, 10, 'test'));
    expect(t.command('inventory.use', { ownerId: 'p', itemId: 'x_kit' })?.code).toBe(
      'nothing_to_mend',
    );
    const kit = ITEMS.find((i) => i.id === 'x_kit') as ItemDef;
    expect(fieldKitMends(kit, ITEMS.find((i) => i.id === 'x_t1_fine') as ItemDef)).toBe(true);
    expect(fieldKitMends(kit, ITEMS.find((i) => i.id === 'x_named') as ItemDef)).toBe(false);
  });
});

describe('records kept across moves and changes', () => {
  it('gives a qualified stack with its qualifiers', () => {
    const t = new Harness();
    t.run((ctx) => addItem(ctx, 'p', 'x_wood', 2, 'gather', { sedTier: 2, signature: 'x_smith' }));
    expect(
      t.command('inventory.give', { fromId: 'p', toId: 'q', itemId: 'x_wood', count: 2 })?.ok,
    ).toBe(true);
    expect(stackCount(t.h('q'), 'x_wood', { sedTier: 2, signature: 'x_smith' })).toBe(2);
    expect(plainCount(t.h('q'), 'x_wood')).toBe(0);
  });

  it('re-equips a working piece rather than a broken spare, and keeps the worn one on a tie', () => {
    const t = new Harness();
    const [a, b] = t.run((ctx) => addItem(ctx, 'p', 'x_sword', 2));
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_sword', instanceId: b });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_sword' });
    expect(t.h().worn?.main_hand).toBe(b);
    t.run((ctx) => wearInstance(ctx, 'p', b as string, 99, 'test'));
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_sword' });
    expect(t.h().worn?.main_hand).toBe(a);
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_sword' });
    expect(t.h().worn?.main_hand).toBe(a);
  });

  it('clears a stale worn record when an uninstanced item takes the slot', () => {
    const t = new Harness();
    t.run((ctx) => {
      addItem(ctx, 'p', 'x_sword');
      addItem(ctx, 'p', 'x_stick');
    });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_sword' });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_stick' });
    expect([t.h().equipped, t.h().worn]).toEqual([{ main_hand: 'x_stick' }, undefined]);
    expect(validateInventorySlice(t.g.world.slices.inventory)).toEqual([]);
  });

  it('reports the instance grain to readers of the effective piece', () => {
    const legs = ITEMS.find((i) => i.id === 'x_grained') as ItemDef;
    const sword = ITEMS.find((i) => i.id === 'x_sword') as ItemDef;
    const c = { items: ITEMS };
    expect(effectiveDef(legs, { instanceId: 'a', defId: legs.id, purified: true }, c).sed).toEqual({
      grade: 'mid',
      purified: true,
    });
    expect(effectiveDef(sword, { instanceId: 'b', defId: sword.id, sedTier: 3 }, c).sed).toEqual({
      grade: 'heavy',
    });
  });

  it('sweeps again when the item rules change: stacked items fold, new instanced ones get records', () => {
    const t = new Harness();
    t.run((ctx) => {
      addItem(ctx, 'p', 'x_sword', 2);
      addItem(ctx, 'p', 'x_wood', 3);
    });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_sword' });
    const changed = (content() as unknown as { items: ItemDef[] }).items.map((d) =>
      d.id === 'x_sword'
        ? { ...d, instanced: false }
        : d.id === 'x_wood'
          ? { ...d, tags: ['tool'] }
          : d,
    );
    const next = { ...content(), items: changed } as unknown as ContentMap;
    const g = Engine.resume(t.g.world, next, t.g.systems);
    g.step(1);
    const h = g.world.slices.inventory.owners.p as Holding;
    expect(h.items).toEqual({ x_sword: 2, x_wood: 3 });
    expect(instancesOf(h, 'x_sword')).toEqual([]);
    expect(instancesOf(h, 'x_wood')).toHaveLength(3);
    expect([h.equipped, h.worn]).toEqual([{ main_hand: 'x_sword' }, undefined]);
    expect(validateInventorySlice(g.world.slices.inventory)).toEqual([]);
  });

  it('loads a save whose items the rename table removed and drops their records once swept', () => {
    const t = new Harness();
    t.run((ctx) => {
      addItem(ctx, 'p', 'x_sword');
      addItem(ctx, 'p', 'x_wood', 2, 'gather', { sedTier: 1 });
      addItem(ctx, 'p', 'x_ingot', 1);
    });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_sword' });
    const table = {
      version: 1,
      entries: [
        { since: 1, kind: 'item', from: 'x_sword', removed: true, refund: { copper: 7 } },
        { since: 1, kind: 'item', from: 'x_wood', removed: true },
      ],
    };
    const world = structuredClone(t.g.world);
    applyRenames(world, new RenameSet(table as never, 0, { isCanonical: () => true }), [
      { slice: 'inventory', fields: INVENTORY_ID_FIELDS },
    ]);
    const inv = world.slices.inventory;
    expect(validateInventorySlice(inv)).toEqual([]);
    expect(inv.owners.p?.items).toEqual({ x_ingot: 1 });
    expect(inv.owners.p?.money).toBe(7);
    const gone = (content() as unknown as { items: ItemDef[] }).items.filter(
      (d) => d.id !== 'x_sword' && d.id !== 'x_wood',
    );
    const next = { ...content(), items: gone } as unknown as ContentMap;
    const g = Engine.resume(world, next, t.g.systems);
    g.step(1);
    const h = g.world.slices.inventory.owners.p as Holding;
    expect([h.instances, h.worn, h.stacks, h.equipped]).toEqual([
      undefined,
      undefined,
      undefined,
      {},
    ]);
    expect(validateInventorySlice(g.world.slices.inventory)).toEqual([]);
  });

  it('names the holder of a named piece a save carried as a count', () => {
    const t = new Harness();
    const inv = t.g.world.slices.inventory;
    delete inv.rev;
    inv.owners.p = { money: 0, items: { x_named: 1 }, equipped: {} };
    t.g.step(1);
    expect(instancesOf(t.h(), 'x_named')[0]).toMatchObject({ holder: 'p', signature: 'x_smith' });
  });
});

describe('the smith service (catalog_equipment.md 2.7)', () => {
  function withTown(): Harness {
    const t = new Harness();
    (t.g.world.slices as unknown as Record<string, unknown>).world = {
      playerId: 'p',
      entities: {
        p: { id: 'p', mapId: 'town', x: 5, y: 5, tags: [] },
        smith: {
          id: 'smith',
          ref: 'x_smith',
          name: 'S',
          mapId: 'town',
          x: 6,
          y: 5,
          tags: ['smith'],
        },
        far: { id: 'far', ref: 'x_other', name: 'F', mapId: 'town', x: 30, y: 5, tags: ['smith'] },
        baker: { id: 'baker', name: 'B', mapId: 'town', x: 5, y: 6, tags: ['merchant'] },
      },
    };
    t.run((ctx) => {
      addItem(ctx, 'p', 'x_sword');
      addMoney(ctx, 'p', 500, 'test');
    });
    t.command('inventory.equip', { ownerId: 'p', itemId: 'x_sword' });
    t.run((ctx) => wearInstance(ctx, 'p', t.h().worn?.main_hand as string, 20, 'test'));
    return t;
  }

  it('offers repair with its price where a smith stands, and mends on the choice', () => {
    const t = withTown();
    t.run((ctx) => ctx.emit('player.talked', { npcId: 'baker' }));
    expect(t.events('dialogue.options_offered')).toHaveLength(0);
    t.run((ctx) => ctx.emit('player.talked', { npcId: 'smith' }));
    const offer = t.events('dialogue.options_offered').at(-1)?.data;
    expect(offer).toMatchObject({
      npcId: 'smith',
      system: 'inventory',
      options: [{ id: 'repair' }],
    });
    // 1000 x 0.2 x 0.5 = 100 copper
    expect(offer?.options[0]?.hint).toEqual({
      key: 'sys.inventory.option.repair_hint',
      params: { m: 100 },
    });
    t.run((ctx) =>
      ctx.emit('dialogue.option_chosen', {
        npcId: 'smith',
        system: 'inventory',
        optionId: 'repair',
      }),
    );
    expect(t.h().instances?.[t.h().worn?.main_hand as string]?.durability?.cur).toBe(40);
    expect(t.h().money).toBe(400);
    expect(t.events('dialogue.line').at(-1)?.data.text).toEqual({
      key: 'sys.inventory.say.repaired',
      params: { m: 100 },
    });
  });

  it("takes the player's own repair command only next to a smith, as an ordinary smith", () => {
    const t = withTown();
    const order = (data: object) => t.command('inventory.repair', { ownerId: 'p', ...data });
    expect(order({ skill: 150, master: true })?.code).toBe('no_smith');
    expect(order({ smithId: 'far' })?.code).toBe('no_smith');
    expect(order({ smithId: 'baker' })?.code).toBe('no_smith');
    expect(order({ smithId: 'smith', payerId: 'q' })?.ok).toBe(true);
    expect(t.h().money).toBe(400);
  });
});
