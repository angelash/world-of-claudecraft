// The gathering and crafting kernel (PK-M1-49; catalog_gathering_crafting.md 1 to 3, 7.1;
// progression_and_pacing.md 6.3): the pure rules (tiers, gain curve, taint, masterwork
// chance), gathering (place, skill and tool tiers, half yields, rare events and signatures,
// taint by sediment, refresh, uses, event nodes, conditions, tool wear, gather.done),
// crafting (station and tier, skill, known recipes, alternatives, inputs, fees, grain,
// masterworks and their reproducible distribution, the throttle, refine and enchant through
// the workshop ports, craft.done), the skill caps of the act, repairs (trade skills from the
// crafters data, the T6 repair site), the maker's bond, gold-scale and deep-hammer rules,
// weapon coatings, the use gate, drunkenness, and the shipped data.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import type { ContentPack } from '../src/content/pack';
import { pack as combatPack } from '../src/content/packs/combat';
import { validateCrafting } from '../src/content/packs/crafting';
import { pack as doorsPack } from '../src/content/packs/doors';
import { pack as invPack } from '../src/content/packs/inventory';
import { pack as partyPack } from '../src/content/packs/party';
import { pack as worldPack } from '../src/content/packs/world';
import type { ContentMap } from '../src/core/contracts';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../src/core/time';
import { createGame } from '../src/game/create';
import { system as combat } from '../src/systems/combat';
import {
  type CraftingConfig,
  system as crafting,
  drunkLayers,
  gainFactor,
  gatherTaint,
  gatherVerdict,
  halfYield,
  masterworkChance,
  nodesHere,
  readCrafting,
  recipeRows,
  recipeSkill,
  recipeStationTier,
  skillCap,
  skillOf,
} from '../src/systems/crafting';
import { system as doors } from '../src/systems/doors';
import {
  addInstance,
  addItem,
  addMoney,
  BOUND_STAT_SHARE,
  canRepair,
  checkUseGate,
  crafterSmith,
  effectiveDef,
  enchantSlots,
  equippedDefs,
  type ItemDef,
  instancesOf,
  system as inventory,
  maxRefine,
  procSources,
  REFINE_SKILL,
  refineInstance,
  registerUseGate,
  repairTrade,
  spendCoatingCharges,
  stackCount,
  UNRECORDED,
  useGate,
  wearInstance,
  wornPieces,
} from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { system as party } from '../src/systems/party';
import { system as world } from '../src/systems/world';
import { fixtureContent, Harness, ITEMS, SHIPPED_CONFIG } from './crafting_harness';

const cfg = SHIPPED_CONFIG;
const def = (id: string) => ITEMS.find((i) => i.id === id) as ItemDef;

// ---------------------------------------------------------------------------

describe('the rules (catalog_gathering_crafting.md 1.2 to 1.4, 2.4, 2.6)', () => {
  it('lets a node one tier above the skill and the tool, at half yield', () => {
    expect(gatherVerdict(0, 0, 1)).toEqual({ ok: true, full: false });
    expect(gatherVerdict(0, 1, 1)).toEqual({ ok: true, full: true });
    expect(gatherVerdict(0, 1, 2)).toEqual({ ok: true, full: false });
    expect(gatherVerdict(0, 0, 2)).toEqual({ ok: false, code: 'tool' });
    expect(gatherVerdict(0, 3, 3)).toEqual({ ok: false, code: 'skill' });
    expect(gatherVerdict(25, 2, 2)).toEqual({ ok: true, full: true });
    expect(gatherVerdict(24, 2, 2)).toEqual({ ok: true, full: false });
    expect([1, 2, 3, 4].map(halfYield)).toEqual([1, 1, 2, 2]);
  });

  it('taints by the sediment of the place and the node tier', () => {
    expect([0, 2].map((s) => gatherTaint(s, 1))).toEqual([0, 0]);
    expect(gatherTaint(3, 2)).toBe(1);
    expect(gatherTaint(3, 3)).toBe(2);
    expect(gatherTaint(4, 1)).toBe(2);
    expect(gatherTaint(5, 1)).toBe(3);
    expect(gatherTaint(6, 1)).toBe(3);
  });

  it('gains by the four-state curve: full, half, a quarter, nothing', () => {
    expect(gainFactor(cfg, 0, 1)).toBe(1);
    expect(gainFactor(cfg, 24, 1)).toBe(1);
    expect(gainFactor(cfg, 25, 1)).toBe(0.5);
    expect(gainFactor(cfg, 50, 1)).toBe(0.25);
    expect(gainFactor(cfg, 75, 1)).toBe(0);
    expect(gainFactor(cfg, 149, 1)).toBe(0);
    expect(gainFactor(cfg, 10, 3)).toBe(1);
  });

  it('sums the masterwork chance of 2.6 and caps it at 15%', () => {
    const base = { tiersAbove: 0, signed: false, specialized: false, stationTier: 1 };
    expect(masterworkChance(cfg, base)).toBeCloseTo(0.03, 10);
    expect(masterworkChance(cfg, { ...base, tiersAbove: -2 })).toBeCloseTo(0.03, 10);
    expect(masterworkChance(cfg, { ...base, tiersAbove: 2 })).toBeCloseTo(0.05, 10);
    expect(masterworkChance(cfg, { ...base, signed: true })).toBeCloseTo(0.05, 10);
    expect(masterworkChance(cfg, { ...base, specialized: true })).toBeCloseTo(0.06, 10);
    expect(masterworkChance(cfg, { ...base, stationTier: 3 })).toBeCloseTo(0.04, 10);
    expect(masterworkChance(cfg, { ...base, stationTier: 4 })).toBeCloseTo(0.05, 10);
    const all = { tiersAbove: 9, signed: true, specialized: true, stationTier: 4 };
    expect(masterworkChance(cfg, all)).toBe(0.15);
  });

  it('reads the recipe skill and station tier from the tier (2.4)', () => {
    expect([1, 2, 3, 6].map((tier) => recipeSkill({ tier }))).toEqual([0, 25, 50, 125]);
    expect(recipeSkill({ tier: 3, skill: 60 })).toBe(60);
    expect([1, 2, 3, 4, 5, 6].map((tier) => recipeStationTier({ tier }, cfg))).toEqual([
      1, 1, 2, 3, 4, 4,
    ]);
  });
});

// ---------------------------------------------------------------------------

describe('gathering (1.3, 1.4, 6.1)', () => {
  it('takes half the yield bare-handed, full with a tool of the tier, and wears the tool', () => {
    const t = new Harness();
    expect(t.command('crafting.gather', { nodeId: 'node_zc_ore' })?.ok).toBe(true);
    expect(t.h().items.x_ore).toBe(1);
    expect(skillOf(t.g.world, 'player', 'mining')).toBe(1);
    const g = t.events('gather.done').at(-1)?.data;
    expect(g).toMatchObject({
      entityId: 'player',
      itemId: 'x_ore',
      count: 1,
      nodeId: 'node_zc_ore',
    });
    expect(g?.mapId).toBe('zc_field');
    // the node waits its refresh day
    expect(t.command('crafting.gather', { nodeId: 'node_zc_ore' })?.code).toBe('not_ready');
    t.g.step(TICKS_PER_GAME_DAY);
    const pick = t.run((ctx) => addInstance(ctx, 'player', 'x_pick_t1')) as string;
    expect(t.command('crafting.gather', { nodeId: 'node_zc_ore' })?.ok).toBe(true);
    expect(t.h().items.x_ore).toBe(3);
    expect(t.h().instances?.[pick]?.durability?.cur).toBe(199);
  });

  it('refuses away from the place, above the tiers, and outside its condition', () => {
    const t = new Harness();
    expect(t.command('crafting.gather', { nodeId: 'node_zc_nope' })?.code).toBe('no_node');
    expect(t.command('crafting.gather', { nodeId: 'node_zc_ore2' })?.code).toBe('tool');
    t.run((ctx) => addInstance(ctx, 'player', 'x_pick_t1'));
    expect(t.command('crafting.gather', { nodeId: 'node_zc_ore2' })?.ok).toBe(true);
    // one tier short on the tool: half of 4
    expect(t.h().items.x_ore).toBe(2);
    expect(t.command('crafting.gather', { nodeId: 'node_zc_night' })?.code).toBe('not_now');
    t.standAt('away');
    expect(t.command('crafting.gather', { nodeId: 'node_zc_ore' })?.code).toBe('not_here');
    // the player's command acts for the player only
    expect(t.command('crafting.gather', { nodeId: 'node_zc_ore', entityId: 'npc_x' })?.code).toBe(
      'not_yours',
    );
    // the dead neither gather nor craft
    t.standAt('yard');
    const e = t.g.world.slices.world.entities.player;
    if (e) e.alive = false;
    expect(t.command('crafting.gather', { nodeId: 'node_zc_ore' })?.code).toBe('no_body');
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_ingot' })?.code).toBe('no_body');
  });

  it('gathers a night patch at night', () => {
    const t = new Harness();
    t.g.step(15 * TICKS_PER_GAME_HOUR);
    expect(t.command('crafting.gather', { nodeId: 'node_zc_night' })?.ok).toBe(true);
    expect(t.h().items.x_herb).toBe(1);
  });

  it('counts uses and waits for content on an event node', () => {
    const t = new Harness();
    expect(t.command('crafting.gather', { nodeId: 'node_zc_once' })?.ok).toBe(true);
    t.g.step(TICKS_PER_GAME_DAY);
    expect(t.command('crafting.gather', { nodeId: 'node_zc_once' })?.code).toBe('spent');
    expect(t.command('crafting.gather', { nodeId: 'node_zc_event' })?.ok).toBe(true);
    expect(readCrafting(t.g.world)?.nodes.node_zc_event).toEqual({ readyAt: -1, used: 1 });
    t.g.step(5 * TICKS_PER_GAME_DAY);
    expect(t.command('crafting.gather', { nodeId: 'node_zc_event' })?.code).toBe('not_ready');
    // only a script resets it
    expect(t.command('crafting.reset_node', { nodeId: 'node_zc_event' })?.code).toBe('not_allowed');
    expect(t.command('crafting.reset_node', { nodeId: 'node_zc_event' }, true)?.ok).toBe(true);
    expect(t.command('crafting.gather', { nodeId: 'node_zc_event' })?.ok).toBe(true);
  });

  it('taints what comes from sediment 3 and 5 (light and heavy)', () => {
    const t = new Harness();
    // standing within reach but outside the dark corner does not clean the herbs
    const e = t.g.world.slices.world.entities.player;
    if (e) {
      e.x = 15.5;
      e.y = 3.5;
    }
    expect(t.command('crafting.gather', { nodeId: 'node_zc_dark' })?.ok).toBe(true);
    expect(stackCount(t.h(), 'x_herb', { sedTier: 1 })).toBe(1);
    t.g.step(TICKS_PER_GAME_DAY);
    t.standAt('dark');
    expect(t.command('crafting.gather', { nodeId: 'node_zc_dark' })?.ok).toBe(true);
    expect(stackCount(t.h(), 'x_herb', { sedTier: 1 })).toBe(2);
    t.standAt('deep');
    expect(t.command('crafting.gather', { nodeId: 'node_zc_deep' })?.ok).toBe(true);
    expect(stackCount(t.h(), 'x_herb', { sedTier: 3 })).toBe(1);
    expect(stackCount(t.h(), 'x_herb')).toBe(0);
  });

  it('gives five times as much, signed by the gatherer, on a rare event', () => {
    const always = { ...cfg.gather, rareOneIn: 1 };
    const t = new Harness({ content: fixtureContent({ gather: always }) });
    t.run((ctx) => addInstance(ctx, 'player', 'x_pick_t1'));
    expect(t.command('crafting.gather', { nodeId: 'node_zc_ore' })?.ok).toBe(true);
    expect(stackCount(t.h(), 'x_ore', { signature: UNRECORDED })).toBe(10);
    expect(t.events('crafting.rare')).toHaveLength(1);
    // no rare find at half yield
    const u = new Harness({ content: fixtureContent({ gather: always }) });
    expect(u.command('crafting.gather', { nodeId: 'node_zc_ore' })?.ok).toBe(true);
    expect(u.h().items.x_ore).toBe(1);
    expect(u.events('crafting.rare')).toHaveLength(0);
  });

  it('keeps the gathering draws reproducible by seed', () => {
    const run = (seed: number) => {
      const t = new Harness({ seed });
      t.run((ctx) => addInstance(ctx, 'player', 'x_pick_t1'));
      const coal: number[] = [];
      for (let i = 0; i < 12; i++) {
        t.command('crafting.reset_node', { nodeId: 'node_zc_ore' }, true);
        t.command('crafting.gather', { nodeId: 'node_zc_ore' });
        coal.push(t.h().items.x_coal ?? 0);
      }
      return coal;
    };
    expect(run(5)).toEqual(run(5));
  });
});

// ---------------------------------------------------------------------------

describe('skill caps (progression_and_pacing.md 6.3)', () => {
  it('caps at layer one before act 1 and at 50 in act 1, never cutting a higher skill', () => {
    const t = new Harness();
    const c = t.g.content.craftingConfig;
    expect(skillCap(t.g.world, c, 'mining')).toBe(25);
    t.skill('mining', 25);
    t.run((ctx) => addInstance(ctx, 'player', 'x_pick_t1'));
    t.command('crafting.gather', { nodeId: 'node_zc_ore' });
    expect(skillOf(t.g.world, 'player', 'mining')).toBe(25);
    t.setFlag('act', 'act1');
    expect(skillCap(t.g.world, c, 'mining')).toBe(50);
    t.command('crafting.reset_node', { nodeId: 'node_zc_ore' }, true);
    t.command('crafting.gather', { nodeId: 'node_zc_ore' });
    // T2 gatherer at a T1 node: half gain
    expect(skillOf(t.g.world, 'player', 'mining')).toBe(25.5);
    t.skill('mining', 80);
    t.command('crafting.reset_node', { nodeId: 'node_zc_ore' }, true);
    t.command('crafting.gather', { nodeId: 'node_zc_ore' });
    expect(skillOf(t.g.world, 'player', 'mining')).toBe(80);
    expect(t.events('crafting.skill').map((e) => e.data.skill)).toEqual([25, 80]);
  });

  it('takes skill grants from scripts only', () => {
    const t = new Harness();
    expect(t.command('crafting.set_skill', { profession: 'mining', skill: 10 })?.code).toBe(
      'not_allowed',
    );
    expect(t.command('crafting.set_skill', { profession: 'juggling', skill: 10 }, true)?.code).toBe(
      'bad_skill',
    );
  });
});

// ---------------------------------------------------------------------------

describe('crafting (2.4 to 2.6, 7.1)', () => {
  function atShop(content?: ContentMap) {
    const t = new Harness(content ? { content } : {});
    t.standAt('shop');
    return t;
  }

  it('makes the output at a station, spends the inputs and tells the quests', () => {
    const t = atShop();
    t.run((ctx) => addItem(ctx, 'player', 'x_ore', 5));
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_ingot' })?.ok).toBe(true);
    expect(t.h().items).toMatchObject({ x_ore: 3, x_ingot: 1 });
    expect(t.events('craft.done').at(-1)?.data).toEqual({
      entityId: 'player',
      recipeId: 'rcp_zc_ingot',
      itemId: 'x_ingot',
      count: 1,
      quality: 1,
    });
    expect(skillOf(t.g.world, 'player', 'mining')).toBe(1);
    t.standAt('yard');
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_ingot' })?.code).toBe('no_station');
  });

  it('refuses without the skill, the recipe, the inputs or the fee', () => {
    const t = atShop();
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_nope' })?.code).toBe('no_recipe');
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_sword_t2' })?.code).toBe('skill');
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_secret' })?.code).toBe('unknown');
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_ingot' })?.code).toBe('inputs');
    t.setFlag('a1_guild_registered', true);
    t.run((ctx) => addItem(ctx, 'player', 'x_ore', 1));
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_secret' })?.ok).toBe(true);
    // nothing was spent on a refusal
    t.run((ctx) => addItem(ctx, 'player', 'x_ingot', 2));
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_sword' })?.code).toBe('inputs');
    expect(t.h().items.x_ingot).toBe(3);
  });

  it('takes an alternative input when the first is short', () => {
    const t = atShop();
    t.run((ctx) => {
      addItem(ctx, 'player', 'x_ingot', 2);
      addItem(ctx, 'player', 'x_herb', 1);
    });
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_sword' })?.ok).toBe(true);
    expect(t.h().items.x_herb).toBeUndefined();
    expect(instancesOf(t.h(), 'x_sword').length + instancesOf(t.h(), 'x_sword_good').length).toBe(
      1,
    );
  });

  it('passes the grain of the main material on (catalog_equipment.md 2.6)', () => {
    const t = atShop();
    t.run((ctx) => {
      addItem(ctx, 'player', 'x_ore', 2, 'gain', { sedTier: 2 });
      addItem(ctx, 'player', 'x_ore', 2, 'gain', { sedTier: 3, purified: true });
    });
    t.command('crafting.craft', { recipeId: 'rcp_zc_ingot', choice: { x_ore: { sedTier: 2 } } });
    expect(stackCount(t.h(), 'x_ingot', { sedTier: 2 })).toBe(1);
    t.command('crafting.craft', {
      recipeId: 'rcp_zc_ingot',
      choice: { x_ore: { sedTier: 3, purified: true } },
    });
    expect(stackCount(t.h(), 'x_ingot', { sedTier: 3, purified: true })).toBe(1);
  });

  it('signs a masterwork, makes the next quality, and marks the first', () => {
    const sure = { ...cfg.masterwork, base: 1, cap: 1 };
    const t = atShop(fixtureContent({ masterwork: sure }));
    t.run((ctx) => {
      addItem(ctx, 'player', 'x_ingot', 4);
      addItem(ctx, 'player', 'x_coal', 2);
    });
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_sword', runs: 2 })?.ok).toBe(true);
    const made = instancesOf(t.h(), 'x_sword_good');
    expect(made.map((i) => i.signature)).toEqual([UNRECORDED, UNRECORDED]);
    expect(t.events('crafting.masterwork').map((e) => e.data.first)).toEqual([true, false]);
    expect(t.events('craft.done').at(-1)?.data.quality).toBe(2);
  });

  it('draws masterworks reproducibly, at the chance of 2.6', () => {
    const N = 300;
    const run = (seed: number) => {
      const u = new Harness({ seed });
      u.standAt('shop');
      u.run((ctx) => {
        addItem(ctx, 'player', 'x_ingot', 2 * N);
        addItem(ctx, 'player', 'x_coal', N);
      });
      for (let i = 0; i < N / 10; i++) {
        u.command('crafting.craft', { recipeId: 'rcp_zc_sword', runs: 10 });
        u.g.step(20);
      }
      const h = u.h();
      return Object.values(h.instances ?? {})
        .sort(
          (a, b) =>
            a.instanceId.length - b.instanceId.length || (a.instanceId < b.instanceId ? -1 : 1),
        )
        .map((i) => (i.defId === 'x_sword_good' ? 1 : 0));
    };
    const a = run(3);
    expect(a).toHaveLength(N);
    expect(run(3)).toEqual(a);
    const masterworks = a.reduce<number>((s, v) => s + v, 0);
    // 4% at a tier-3 forge, 5% once the skill reaches T2 (cap 25): about 14 of 300
    expect(masterworks).toBeGreaterThanOrEqual(4);
    expect(masterworks).toBeLessThanOrEqual(30);
    expect(run(4)).not.toEqual(a);
  });

  it('holds a crafter to ten crafts a game minute', () => {
    const t = atShop();
    t.run((ctx) => addItem(ctx, 'player', 'x_ore', 30));
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_ingot', runs: 10 })?.ok).toBe(true);
    expect(t.h().items.x_ingot).toBe(10);
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_ingot' })?.code).toBe('busy');
    t.g.step(20);
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_ingot' })?.ok).toBe(true);
  });

  it('refines a piece through the workshop port at the level its skill allows', () => {
    const t = atShop();
    const sword = t.run((ctx) => {
      addItem(ctx, 'player', 'x_ingot', 6);
      return addInstance(ctx, 'player', 'x_sword');
    }) as string;
    t.skill('weaponcrafting', 40);
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_refine1', targetId: sword })?.code).toBe(
      'skill',
    );
    t.skill('weaponcrafting', 50);
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_refine1' })?.code).toBe('target');
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_refine1', targetId: sword })?.ok).toBe(
      true,
    );
    expect(t.h().instances?.[sword]?.refine).toBe(1);
    expect(t.h().items.x_ingot).toBe(4);
    // working on a piece is not making one: no craft.done for the quests
    expect(t.events('crafting.worked').at(-1)?.data).toEqual({
      entityId: 'player',
      recipeId: 'rcp_zc_refine1',
      instanceId: sword,
      itemId: 'x_sword',
      op: 'refine',
    });
    expect(t.events('craft.done')).toHaveLength(0);
    // the recipe makes level 1 only
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_refine1', targetId: sword })?.code).toBe(
      'target',
    );
  });

  it('puts an enchant on through the workshop port and takes the fee', () => {
    const t = atShop();
    const sword = t.run((ctx) => {
      addItem(ctx, 'player', 'x_herb', 2);
      return addInstance(ctx, 'player', 'x_sword');
    }) as string;
    t.skill('enchanting', 30);
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_enchant', targetId: sword })?.code).toBe(
      'money',
    );
    t.run((ctx) => addMoney(ctx, 'player', 7, 'test'));
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_enchant', targetId: sword })?.ok).toBe(
      true,
    );
    expect(t.h().instances?.[sword]?.affixes).toEqual(['ench_zc_wpn']);
    expect(t.h().money).toBe(2);
    const ring = t.run((ctx) => addInstance(ctx, 'player', 'x_ring_gold')) as string;
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_enchant', targetId: ring })?.code).toBe(
      'slot',
    );
  });

  it('lists recipes and nodes with what a command would say', () => {
    const t = atShop();
    const rows = recipeRows(t.g.world, t.g.content, 'player');
    expect(rows.find((r) => r.id === 'rcp_zc_ingot')).toEqual({
      id: 'rcp_zc_ingot',
      ok: false,
      code: 'inputs',
    });
    expect(rows.some((r) => r.id === 'rcp_zc_secret')).toBe(false);
    t.standAt('yard');
    expect(nodesHere(t.g.world, t.g.content, 'player').map((n) => n.id)).toContain('node_zc_ore');
  });
});

// ---------------------------------------------------------------------------

describe('routed instance-layer rules (catalog_equipment.md 1.6, 2.5, 2.7, 2.8)', () => {
  it('repairs fine pieces by the trade skill of the crafters data', () => {
    const fine = { ...def('x_sword'), quality: 3 } as ItemDef;
    const inst = { instanceId: 'it1', defId: 'x_sword' };
    expect(repairTrade(fine)).toBe('weaponcrafting');
    expect(repairTrade(def('x_plate_deep'))).toBe('armorcrafting');
    expect(repairTrade(def('x_ring_gold'))).toBe('jewelcrafting');
    expect(repairTrade(def('x_pick_t1'))).toBe('engineering');
    expect(canRepair(fine, inst, { skill: 0, skills: { weaponcrafting: 75 } })).toBe(true);
    expect(canRepair(fine, inst, { skill: 0, skills: { armorcrafting: 75 } })).toBe(false);
    expect(canRepair(fine, inst, { skill: 75 })).toBe(true);
    const content = buildContent();
    expect(crafterSmith(content, 'barga')).toEqual({
      skills: { weaponcrafting: 35, armorcrafting: 35 },
    });
    expect(crafterSmith(content, 'nobody')).toBeUndefined();
  });

  it('mends T6 work only at a T6 repair site', () => {
    const t6 = def('x_t6_blade');
    const inst = { instanceId: 'it1', defId: 'x_t6_blade' };
    expect(canRepair(t6, inst, { skill: 150, master: true })).toBe(false);
    expect(canRepair(t6, inst, { skill: 100, t6: true })).toBe(true);
    const t = new Harness();
    const id = t.run((ctx) => {
      addMoney(ctx, 'player', 1000, 'test');
      addItem(ctx, 'player', 'x_ingot', 2);
      const iid = addInstance(ctx, 'player', 'x_t6_blade') as string;
      wearInstance(ctx, 'player', iid, 40, 'test');
      return iid;
    }) as string;
    expect(t.command('crafting.repair', {})?.code).toBe('no_station');
    t.standAt('deep');
    expect(t.command('crafting.repair', {})?.ok).toBe(true);
    const d = t.h().instances?.[id]?.durability;
    expect(d?.cur).toBe(d?.max);
    // half the durability lost: 2 tier materials, 1000 x 0.2 x 0.5 copper
    expect(t.h().items.x_ingot).toBeUndefined();
    expect(t.h().money).toBe(900);
  });

  it('cuts a bound piece on anyone but the person it is bound to', () => {
    const sword = def('x_sword');
    const content = fixtureContent();
    const inst = { instanceId: 'it1', defId: 'x_sword', boundTo: 'ron' };
    expect(effectiveDef(sword, inst, content, 0, 'ron').stats).toEqual({ str: 10 });
    expect(effectiveDef(sword, inst, content, 0, 'player').stats).toEqual({
      str: 10 * BOUND_STAT_SHARE,
    });
    const t = new Harness();
    t.run((ctx) => addInstance(ctx, 'player', 'x_sword', { boundTo: 'ron' }));
    t.command('inventory.equip', { ownerId: 'player', itemId: 'x_sword' });
    expect(equippedDefs(t.g.world, t.g.content, 'player')[0]?.stats).toEqual({ str: 5 });
  });

  it('gives a gold-scale trinket a second enchant slot and deep-hammer work a fourth refine', () => {
    expect(enchantSlots(def('x_ring_gold'))).toBe(2);
    expect(enchantSlots({ ...def('x_ring_gold'), tags: [] } as ItemDef)).toBe(1);
    expect(enchantSlots({ ...def('x_ring_gold'), quality: 0 } as ItemDef)).toBe(0);
    expect(maxRefine(def('x_plate_deep'))).toBe(4);
    expect(maxRefine(def('x_sword'))).toBe(3);
    expect(REFINE_SKILL[4]).toBe(125);
    const t = new Harness();
    const [plate, sword] = t.run((ctx) => [
      addInstance(ctx, 'player', 'x_plate_deep') as string,
      addInstance(ctx, 'player', 'x_sword') as string,
    ]);
    const levels = t.run((ctx) => {
      const out: (number | string)[] = [];
      for (let i = 0; i < 5; i++) {
        const r = refineInstance(ctx, 'player', plate as string, { skill: 125 });
        out.push(r.ok ? (r.refine as number) : (r.failure as string));
      }
      const s = refineInstance(ctx, 'player', sword as string, { skill: 125 });
      for (let i = 0; i < 3; i++) refineInstance(ctx, 'player', sword as string, { skill: 125 });
      out.push(s.ok ? 'sword ok' : 'sword no');
      out.push(refineInstance(ctx, 'player', sword as string, { skill: 125 }).failure as string);
      return out;
    });
    expect(levels).toEqual([1, 2, 3, 4, 'max', 'sword ok', 'max']);
    // the fourth level needs layer five in the piece's trade
    const u = new Harness();
    const p2 = u.run((ctx) => addInstance(ctx, 'player', 'x_plate_deep', { refine: 3 })) as string;
    const r = u.run((ctx) => refineInstance(ctx, 'player', p2, { skill: 124 }));
    expect(r.failure).toBe('smith');
  });

  it('coats the main-hand weapon, spends a hit per weapon hit and lets it run out', () => {
    const t = new Harness();
    t.run((ctx) => addItem(ctx, 'player', 'x_poison', 2));
    expect(t.command('inventory.use', { ownerId: 'player', itemId: 'x_poison' })?.code).toBe(
      'no_weapon',
    );
    expect(t.h().items.x_poison).toBe(2);
    const sword = t.run((ctx) => addInstance(ctx, 'player', 'x_sword')) as string;
    t.command('inventory.equip', { ownerId: 'player', itemId: 'x_sword' });
    expect(t.command('inventory.use', { ownerId: 'player', itemId: 'x_poison' })?.ok).toBe(true);
    expect(t.h().instances?.[sword]?.coating).toEqual({ itemId: 'x_poison', charges: 3 });
    expect(t.events('item.coating').at(-1)?.data).toMatchObject({
      coatingId: 'x_poison',
      charges: 3,
    });
    const pieces = wornPieces(t.g.world, t.g.content, 'player');
    expect(procSources(pieces, t.g.content).map((s) => s.kind)).toEqual(['coating']);
    // a weapon hit fires the coating and spends one hit
    t.run((ctx) =>
      ctx.emit('combat.damage', {
        sourceId: 'player',
        targetId: 'dummy',
        school: 'physical',
        outcome: 'hit',
        weaponClass: 'sword',
        amount: 10,
      } as never),
    );
    expect(t.events('item.proc').at(-1)?.data).toMatchObject({
      source: 'coating',
      sourceId: 'x_poison',
      effect: { kind: 'dmg', school: 'nature', amount: 5 },
    });
    expect(t.h().instances?.[sword]?.coating?.charges).toBe(2);
    // a broken weapon swings as bare hands: the coating neither fires nor wears
    const fired = t.events('item.proc').length;
    t.run((ctx) => {
      wearInstance(ctx, 'player', sword, 1000, 'test');
      ctx.emit('combat.damage', {
        sourceId: 'player',
        targetId: 'dummy',
        school: 'physical',
        outcome: 'hit',
        weaponClass: 'sword',
        amount: 10,
      } as never);
    });
    expect(t.h().instances?.[sword]?.coating?.charges).toBe(2);
    expect(t.events('item.proc')).toHaveLength(fired);
    expect(t.run((ctx) => spendCoatingCharges(ctx, 'player', 5))).toBe(0);
    expect(t.h().instances?.[sword]?.coating).toBeUndefined();
    expect(t.events('item.coating').at(-1)?.data.charges).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('the use gate (combat_and_classes.md 14.1)', () => {
  it('asks the registered gate, except for uses combat already gated', () => {
    const saved = useGate();
    try {
      registerUseGate((_ctx, _owner, itemId) =>
        itemId === 'x_ale'
          ? { ok: false, code: 'in_combat', reason: { key: 'sys.combat.reject.item.in_combat' } }
          : { ok: true },
      );
      const t = new Harness();
      t.run((ctx) => addItem(ctx, 'player', 'x_ale', 2));
      const r = t.command('inventory.use', { ownerId: 'player', itemId: 'x_ale' });
      expect(r?.code).toBe('in_combat');
      expect(t.h().items.x_ale).toBe(2);
      // an item the user does not hold is missing before the gate is asked
      expect(t.command('inventory.use', { ownerId: 'player', itemId: 'x_sober' })?.code).toBe(
        'missing',
      );
      const gated = t.run((ctx) =>
        checkUseGate(ctx, 'player', 'x_ale', { type: 'system', system: 'combat' }),
      );
      expect(gated.ok).toBe(true);
    } finally {
      registerUseGate(saved);
    }
  });

  const PACKS: ContentPack[] = [worldPack, invPack, combatPack, partyPack, doorsPack];
  function combatGame(): Harness {
    const merged: Record<string, unknown> = {};
    for (const p of PACKS) {
      for (const [k, v] of Object.entries(p.tables)) {
        const prev = merged[k];
        merged[k] = Array.isArray(prev) && Array.isArray(v) ? [...prev, ...v] : v;
      }
    }
    const fx = fixtureContent({
      drunk: { ...cfg.drunk, aura: 'aur_zc_drunk' },
    }) as unknown as Record<string, unknown[]>;
    const content = {
      ...merged,
      maps: [...(merged.maps as unknown[]), ...(fx.maps as unknown[])],
      items: [...(merged.items as unknown[]), ...(fx.items as unknown[])],
      auras: [
        ...(merged.auras as unknown[]),
        {
          id: 'aur_zc_drunk',
          name: 'drunk',
          kind: 'debuff',
          duration: 0,
          maxStacks: 10,
          stats: { spi: -2 },
          presenceResist: { perStack: 0.03, max: 0.15 },
        },
      ],
      craftingConfig: fx.craftingConfig,
      gatherNodes: fx.gatherNodes,
      craftStations: fx.craftStations,
      recipes: fx.recipes,
    } as unknown as ContentMap;
    return new Harness({
      content,
      systems: [modifiers, world, inventory, combat, party, doors, crafting],
    });
  }

  it('refuses a drink in combat and lets a potion through, as combat.use_item does', () => {
    const t = combatGame();
    t.run((ctx) => {
      addItem(ctx, 'player', 'x_ale', 1);
      addItem(ctx, 'player', 'minor_healing_potion', 1);
      const u = ctx.world.slices.combat.units.player;
      if (u) u.combatUntil = ctx.tick + 10_000;
    });
    const r = t.command('inventory.use', { ownerId: 'player', itemId: 'x_ale' });
    expect(r?.code).toBe('in_combat');
    expect(r?.reason).toEqual({ key: 'sys.combat.reject.item.in_combat' });
    expect(
      t.command('inventory.use', { ownerId: 'player', itemId: 'minor_healing_potion' })?.ok,
    ).toBe(true);
  });

  it('keeps drunk layers as the stacks of the drunk aura, sobering by the hour', () => {
    const t = combatGame();
    t.run((ctx) => addItem(ctx, 'player', 'x_ale', 6));
    const drink = () => t.command('inventory.use', { ownerId: 'player', itemId: 'x_ale' });
    expect(drink()?.ok).toBe(true);
    const stacks = () =>
      t.g.world.slices.combat.units.player?.auras.find((a) => a.id === 'aur_zc_drunk')?.stacks ?? 0;
    expect(drunkLayers(t.g.world, 'player')).toBe(2);
    expect(stacks()).toBe(2);
    for (let i = 0; i < 5; i++) drink();
    expect(drunkLayers(t.g.world, 'player')).toBe(10);
    expect(stacks()).toBe(10);
    t.g.step(TICKS_PER_GAME_HOUR);
    expect(drunkLayers(t.g.world, 'player')).toBe(9);
    expect(stacks()).toBe(9);
    t.run((ctx) => addItem(ctx, 'player', 'x_sober', 1));
    expect(t.command('inventory.use', { ownerId: 'player', itemId: 'x_sober' })?.ok).toBe(true);
    expect(drunkLayers(t.g.world, 'player')).toBe(0);
    expect(stacks()).toBe(0);
    // a sober pill keeps new layers off for ten game minutes
    t.run((ctx) => addItem(ctx, 'player', 'x_ale', 2));
    drink();
    expect(drunkLayers(t.g.world, 'player')).toBe(0);
    t.g.step(10 * 20 + 1);
    drink();
    expect(drunkLayers(t.g.world, 'player')).toBe(2);
  });
});

// ---------------------------------------------------------------------------

describe('the shipped data', () => {
  it('validates, and the use fields other systems read are checked', () => {
    const content = buildContent();
    expect(validateCrafting(content)).toEqual([]);
    const bad: ContentMap = {
      ...content,
      items: [
        ...content.items,
        { ...def('x_poison'), id: 'x_bad_coat', use: { effect: 'coat', group: 'cd_coat' } },
        {
          ...def('x_poison'),
          id: 'x_bad_coat2',
          kind: 'material',
          use: { effect: 'coat', amount: 2, group: 'cd_coat' },
          procs: [{ on: 'crit', chance: 1, do: 'dmg:nature:1' }],
        },
        {
          ...def('x_ale'),
          id: 'x_bad_use',
          use: {
            effect: 'sed_cure',
            group: 'cd_sed',
            taint: Number.NaN,
            sed: { treats: ['none'], down: 0 },
            drunk: 0,
          },
        },
      ] as ItemDef[],
    };
    const problems = invPack.validate?.(bad) ?? [];
    expect(problems).toEqual([
      'item x_bad_coat: a coating needs use.amount, the hits it lasts',
      'item x_bad_coat2: a coating is a consumable (used up when applied)',
      'item x_bad_coat2: a coating triggers on weapon hits only (on: hit)',
      'item x_bad_use: use.taint is no number',
      'item x_bad_use: use.sed.treats names no sickness stage',
      'item x_bad_use: use.sed.down must be stages above 0 or all',
      'item x_bad_use: use.drunk must be whole layers above 0',
    ]);
  });

  it('holds recipes, stations and nodes to the catalog rules', () => {
    const base = buildContent();
    const fx = fixtureContent() as unknown as Record<string, unknown[]>;
    const content = {
      ...base,
      maps: [...base.maps, ...(fx.maps as never[])],
      items: [...base.items, ...(fx.items as never[])],
      enchants: [...(base.enchants ?? []), ...(fx.enchants as never[])],
      craftingConfig: { ...cfg, drunk: { ...cfg.drunk, aura: 'aur_zc_none' } },
      gatherNodes: [
        {
          id: 'node_zc_t6',
          name: 't6',
          kind: 'special',
          profession: 'mining',
          tier: 6,
          yields: [{ itemId: 'x_ore', count: 1 }],
          places: [],
        },
        {
          id: 'node_zc_bad_place',
          name: 'b',
          kind: 'ore',
          tier: 1,
          yields: [{ itemId: 'x_ore', count: 1 }],
          places: [{ mapId: 'zc_field', location: 'nowhere' }],
        },
      ],
      craftStations: [{ id: 'stn_zc_table', name: 't', type: 'grain_table', tier: 1, places: [] }],
      recipes: [
        {
          id: 'rcp_zc_good',
          name: 'good',
          profession: 'weaponcrafting',
          tier: 1,
          station: 'forge',
          inputs: [{ itemId: 'x_ingot', count: 9 }],
          output: { itemId: 'x_sword_good' },
        },
        {
          id: 'rcp_zc_plain',
          name: 'plain',
          profession: 'weaponcrafting',
          tier: 1,
          station: 'forge',
          inputs: [{ itemId: 'x_ingot', count: 9 }],
          output: { itemId: 'x_sword' },
          byproducts: [{ itemId: 'x_nothing' }],
        },
        {
          id: 'rcp_zc_cheap',
          name: 'cheap',
          profession: 'mining',
          tier: 1,
          station: 'smelter',
          inputs: [{ itemId: 'x_coal', count: 1 }],
          output: { itemId: 'x_ingot', count: 1 },
        },
      ],
      crafters: [{ id: 'nobody_x', skills: { mining: 200 } }],
    } as unknown as ContentMap;
    expect(validateCrafting(content)).toEqual([
      'craftingConfig: drunk.aura aur_zc_none is no aura',
      'gatherNodes node_zc_t6: a T6 node names its uses',
      'gatherNodes node_zc_bad_place places[0]: map zc_field has no location nowhere',
      'craftStations stn_zc_table: a grain table starts at tier 2',
      'recipes rcp_zc_good: x_sword_good of quality 2 needs a station of tier 2',
      'recipes rcp_zc_good: equipment below the top crafted quality names its masterwork item',
      'recipes rcp_zc_plain: equipment below the top crafted quality names its masterwork item',
      'recipes rcp_zc_plain byproducts[0]: unknown item x_nothing',
      "recipes rcp_zc_cheap: x_ingot buys back above its inputs' value",
      'crafters nobody_x: no such person',
      'crafters nobody_x: mining must be 0..150',
    ]);
  });

  it('hands out the by-products of a recipe beside the product', () => {
    const extra = {
      ...fixtureContent(),
      recipes: [
        {
          id: 'rcp_zc_split',
          name: 'split',
          profession: 'mining',
          tier: 1,
          station: 'smelter',
          inputs: [{ itemId: 'x_ore', count: 2 }],
          output: { itemId: 'x_ingot' },
          byproducts: [{ itemId: 'x_coal', count: 2 }],
        },
      ],
    } as unknown as ContentMap;
    const t = new Harness({ content: extra });
    t.standAt('shop');
    t.run((ctx) => addItem(ctx, 'player', 'x_ore', 2, 'gain', { sedTier: 1 }));
    expect(t.command('crafting.craft', { recipeId: 'rcp_zc_split' })?.ok).toBe(true);
    expect(stackCount(t.h(), 'x_ingot', { sedTier: 1 })).toBe(1);
    expect(stackCount(t.h(), 'x_coal', { sedTier: 1 })).toBe(2);
  });

  it('smelts iron at the smithy of the built town', () => {
    const g = createGame({ seed: 5 });
    const p = g.world.slices.world.entities.player;
    const smithy = g.content.maps
      .find((m) => m.id === 'borderstone')
      ?.locations.find((l) => l.id === 'smithy');
    if (!p || !smithy) throw new Error('no player or smithy');
    p.mapId = 'borderstone';
    p.x = smithy.x + 0.5;
    p.y = smithy.y + 0.5;
    p.move = null;
    const inv = g.world.slices.inventory;
    inv.owners.player ??= { money: 0, items: {}, equipped: {} };
    (inv.owners.player as { items: Record<string, number> }).items.iron_ore = 3;
    (inv.owners.player as { items: Record<string, number> }).items.charcoal = 2;
    g.queue('crafting.craft', { recipeId: 'rcp_smelt_iron' });
    g.step(1);
    expect(g.world.slices.inventory.owners.player?.items.iron_ingot).toBe(1);
    expect(g.world.slices.inventory.owners.player?.items.iron_ore).toBeUndefined();
    const cap = skillCap(g.world, g.content.craftingConfig as CraftingConfig, 'mining');
    expect([25, 50]).toContain(cap);
  });
});
