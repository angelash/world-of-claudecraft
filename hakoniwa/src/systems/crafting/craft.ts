// Crafting (catalog_gathering_crafting.md 1.4, 1.5, 2.4 to 2.6, 7.1; catalog_equipment.md 2.6,
// 2.8): a crafter who knows a recipe and has its skill, standing at a station of its type and
// tier, spends the inputs (and the station's fee) and makes the output, refines a piece one
// level, or puts an enchant on it. A made item may come out a masterwork, drawn once per
// craft on the named stream `crafting.masterwork` at the chance of 2.6 (base, tiers above the
// recipe, a signed input, a specialty, the station tier; capped): it is the masterwork item
// of the recipe (the next quality) or the same item, signed by the maker. The product takes
// the grain of its main materials (fine and better work: of every input): the heaviest
// unpurified taint comes through, else a purified one. At most `throttle.count` crafts in
// `throttle.minutes` game minutes per crafter. The tool of the livelihood, if held, wears;
// the skill grows by the four-state curve; a made item goes out as `craft.done` for the quest
// objectives (with its by-products, unsigned), a refine or an enchant as `crafting.worked`
// (working on a piece is not making one).

import type { ContentMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_MINUTE } from '../../core/time';
import type { World } from '../../core/world';
import {
  addItem,
  craftTierOf,
  ENCHANT_SLOT_OF,
  enchantInstance,
  enchantSlots,
  gradeTier,
  type ItemGrant,
  maxRefine,
  type Parcel,
  type QualifierFields,
  REFINE_SKILL,
  refineInstance,
  repairTrade,
  spendMoney,
  stackCount,
  takeItems,
} from '../inventory';
import type { EnchantDef, Holding, ItemDef } from '../inventory/types';
import type { Entity } from '../world/types';
import { signatureOf } from './gather';
import { entityOf, placeOf } from './places';
import { gainFactor, masterworkChance, recipeSkill, recipeStationTier } from './rules';
import { addSkill, craftingConfig, holdsIn, skillOf } from './skills';
import { craftingSlice, readCrafting } from './slice';
import { bestTool, type ToolPick, wearTool } from './tools';
import type { CraftingConfig, RecipeDef, StationDef, StationType } from './types';

/** The random stream of the masterwork draw. */
export const MASTERWORK_STREAM = 'crafting.masterwork';

export type CraftRefusal =
  | 'no_rules'
  | 'no_recipe'
  | 'no_body'
  | 'unknown'
  | 'skill'
  | 'no_station'
  | 'busy'
  | 'inputs'
  | 'money'
  | 'target'
  | 'max'
  | 'slot';

/** Which stack of an input to spend (a stack key's qualifiers by item id); default plain first. */
export type InputChoice = Record<string, QualifierFields>;

interface InputTake {
  itemId: string;
  count: number;
  main: boolean;
  qualifiers?: QualifierFields;
}

export interface CraftPlan {
  recipe: RecipeDef;
  entity: Entity;
  station: StationDef;
  inputs: InputTake[];
  tool?: ToolPick;
  skill: number;
  /** refine and enchant: the piece worked on */
  targetId?: string;
}

export function recipeDef(content: ContentMap, id: string): RecipeDef | undefined {
  return (content.recipes ?? []).find((r) => r.id === id);
}

function itemDefOf(content: ContentMap, id: string): ItemDef | undefined {
  return content.items.find((i) => i.id === id);
}

/** The best station of a type and tier the entity stands at, if any. */
export function stationAt(
  world: World,
  content: ContentMap,
  cfg: CraftingConfig,
  e: Entity,
  type: StationType,
  minTier: number,
): StationDef | undefined {
  let best: StationDef | undefined;
  for (const s of content.craftStations ?? []) {
    if (s.type !== type || s.tier < minTier || (best && best.tier >= s.tier)) continue;
    if (!placeOf(content, e, s.places, cfg.gather.reach) || !holdsIn(world, s.when)) continue;
    best = s;
  }
  return best;
}

/** How many of an item an owner can spend under a choice (a named stack, else any). */
function available(h: Holding | undefined, itemId: string, q: QualifierFields | undefined): number {
  if (!h) return 0;
  return q ? stackCount(h, itemId, q) : (h.items[itemId] ?? 0);
}

/** The inputs one craft would spend (alternatives in order), or null when short. */
function planInputs(h: Holding | undefined, r: RecipeDef, choice: InputChoice): InputTake[] | null {
  const want = new Map<string, number>();
  const out: InputTake[] = [];
  r.inputs.forEach((inp, i) => {
    const main = inp.main ?? (r.inputs.some((x) => x.main) ? false : i === 0);
    for (const id of [inp.itemId, ...(inp.alt ?? [])]) {
      const q = choice[id];
      const key = `${id}\n${JSON.stringify(q ?? null)}`;
      const need = (want.get(key) ?? 0) + inp.count;
      if (available(h, id, q) < need) continue;
      want.set(key, need);
      out.push({ itemId: id, count: inp.count, main, ...(q ? { qualifiers: q } : {}) });
      return;
    }
  });
  return out.length === r.inputs.length ? out : null;
}

/** Recent craft ticks of a crafter still inside the throttle window. */
function recentCrafts(world: World, cfg: CraftingConfig, entityId: string): number[] {
  const since = world.meta.tick - cfg.throttle.minutes * TICKS_PER_GAME_MINUTE;
  return (readCrafting(world)?.recent[entityId] ?? []).filter((t) => t > since);
}

/** What one craft would do now, or why it cannot happen (no state changes). */
export function planCraft(
  world: World,
  content: ContentMap,
  entityId: string,
  recipeId: string,
  opts: { targetId?: string; choice?: InputChoice } = {},
): { ok: true; plan: CraftPlan } | { ok: false; code: CraftRefusal } {
  const cfg = craftingConfig(content);
  if (!cfg) return { ok: false, code: 'no_rules' };
  const recipe = recipeDef(content, recipeId);
  if (!recipe) return { ok: false, code: 'no_recipe' };
  const entity = entityOf(world, entityId);
  if (!entity?.alive) return { ok: false, code: 'no_body' };
  if (!holdsIn(world, recipe.requires)) return { ok: false, code: 'unknown' };
  const skill = skillOf(world, entityId, recipe.profession);
  if (skill < recipeSkill(recipe)) return { ok: false, code: 'skill' };
  const station = stationAt(
    world,
    content,
    cfg,
    entity,
    recipe.station,
    recipeStationTier(recipe, cfg),
  );
  if (!station) return { ok: false, code: 'no_station' };
  if (recentCrafts(world, cfg, entityId).length >= cfg.throttle.count)
    return { ok: false, code: 'busy' };
  const h = world.slices.inventory.owners[entityId];
  const op = recipe.op ?? 'make';
  let targetId: string | undefined;
  if (op !== 'make') {
    const inst = opts.targetId ? h?.instances?.[opts.targetId] : undefined;
    const def = inst ? itemDefOf(content, inst.defId) : undefined;
    if (!inst || !def?.slot) return { ok: false, code: 'target' };
    if (op === 'refine') {
      if (repairTrade(def) !== recipe.profession) return { ok: false, code: 'target' };
      const next = (inst.refine ?? 0) + 1;
      if (next > maxRefine(def)) return { ok: false, code: 'max' };
      if (recipe.level !== next) return { ok: false, code: 'target' };
      const named = def.quality >= 4;
      if (named || skill < (REFINE_SKILL[next] ?? Number.POSITIVE_INFINITY))
        return { ok: false, code: 'skill' };
    } else {
      const ench = (content.enchants as EnchantDef[] | undefined)?.find(
        (e) => e.id === recipe.enchant,
      );
      if (!ench || ENCHANT_SLOT_OF[def.slot] !== ench.slot || enchantSlots(def) <= 0)
        return { ok: false, code: 'slot' };
    }
    targetId = inst.instanceId;
  }
  const inputs = planInputs(h, recipe, opts.choice ?? {});
  if (!inputs) return { ok: false, code: 'inputs' };
  if ((recipe.fee ?? 0) > (h?.money ?? 0)) return { ok: false, code: 'money' };
  const tool = bestTool(world, content, cfg, entityId, recipe.profession);
  return { ok: true, plan: { recipe, entity, station, inputs, tool, skill, targetId } };
}

/** The grain of what the spent inputs pass on (catalog_equipment.md 2.6). */
function grainFrom(
  content: ContentMap,
  taken: { take: InputTake; parcel: Parcel }[],
  allInputs: boolean,
): QualifierFields {
  let dirty = 0;
  let clean = 0;
  for (const { take, parcel } of taken) {
    if (!allInputs && !take.main) continue;
    const def = itemDefOf(content, take.itemId);
    const plainTier = gradeTier(def?.sed?.grade);
    const plainClean = def?.sed?.purified === true;
    if (parcel.plain > 0 && plainTier > 0) {
      if (plainClean) clean = Math.max(clean, plainTier);
      else dirty = Math.max(dirty, plainTier);
    }
    for (const p of [...parcel.parts, ...parcel.instances]) {
      const t = p.sedTier ?? 0;
      if (t <= 0) continue;
      if (p.purified) clean = Math.max(clean, t);
      else dirty = Math.max(dirty, t);
    }
  }
  if (dirty > 0) return { sedTier: dirty };
  if (clean > 0) return { sedTier: clean, purified: true };
  return {};
}

function signedInput(taken: { parcel: Parcel }[]): boolean {
  return taken.some(
    ({ parcel }) =>
      parcel.parts.some((p) => !!p.signature) || parcel.instances.some((i) => !!i.signature),
  );
}

export interface Crafted {
  itemId: string;
  count: number;
  quality: number;
  masterwork: boolean;
}

/** Spend the inputs of a planned craft and make it (one run). */
export function runCraft(ctx: SystemContext, cfg: CraftingConfig, plan: CraftPlan): Crafted {
  const { recipe, entity } = plan;
  const op = recipe.op ?? 'make';
  if ((recipe.fee ?? 0) > 0) spendMoney(ctx, entity.id, recipe.fee ?? 0, 'craft_fee');
  const taken: { take: InputTake; parcel: Parcel }[] = [];
  for (const t of plan.inputs) {
    const parcel = takeItems(ctx, entity.id, t.itemId, t.count, 'craft', {
      ...(t.qualifiers ? { qualifiers: t.qualifiers } : {}),
    });
    if (parcel) taken.push({ take: t, parcel });
  }
  let result: Crafted;
  if (op === 'make') {
    const out = recipe.output ?? { itemId: '' };
    const outDef = itemDefOf(ctx.content, out.itemId);
    const quality = outDef?.quality ?? 0;
    let masterwork = false;
    if (quality >= 1) {
      const chance = masterworkChance(cfg, {
        tiersAbove: craftTierOf(plan.skill) - recipe.tier,
        signed: signedInput(taken),
        specialized: false,
        stationTier: plan.station.tier,
      });
      masterwork = ctx.rng(MASTERWORK_STREAM).next() < chance;
    }
    const made = masterwork && recipe.masterwork ? recipe.masterwork : out;
    const itemId = made.itemId;
    const count = made.count ?? out.count ?? 1;
    const madeDef = itemDefOf(ctx.content, itemId);
    const init: ItemGrant = { ...(grainFrom(ctx.content, taken, quality >= 3) as ItemGrant) };
    if (masterwork) init.signature = signatureOf(ctx, entity.id);
    addItem(ctx, entity.id, itemId, count, 'craft', init);
    const grain = { ...init };
    delete grain.signature;
    for (const b of recipe.byproducts ?? []) {
      addItem(ctx, entity.id, b.itemId, b.count ?? 1, 'craft', grain);
    }
    result = { itemId, count, quality: madeDef?.quality ?? quality, masterwork };
    if (masterwork) {
      const slice = craftingSlice(ctx.world);
      const n = (slice.masterworks[entity.id] ?? 0) + 1;
      slice.masterworks[entity.id] = n;
      ctx.emit('crafting.masterwork', {
        entityId: entity.id,
        recipeId: recipe.id,
        itemId,
        first: n === 1,
      });
    }
  } else {
    const targetId = plan.targetId ?? '';
    const inst = ctx.world.slices.inventory.owners[entity.id]?.instances?.[targetId];
    const def = inst ? itemDefOf(ctx.content, inst.defId) : undefined;
    if (op === 'refine') refineInstance(ctx, entity.id, targetId, { skill: plan.skill });
    else enchantInstance(ctx, entity.id, targetId, recipe.enchant ?? '');
    result = { itemId: inst?.defId ?? '', count: 1, quality: def?.quality ?? 0, masterwork: false };
    ctx.emit('crafting.worked', {
      entityId: entity.id,
      recipeId: recipe.id,
      instanceId: targetId,
      itemId: result.itemId,
      op,
    });
  }
  if (plan.tool) wearTool(ctx, cfg, entity.id, plan.tool);
  addSkill(
    ctx,
    cfg,
    entity.id,
    recipe.profession,
    cfg.gain * gainFactor(cfg, plan.skill, recipe.tier),
  );
  const slice = craftingSlice(ctx.world);
  slice.recent[entity.id] = [...recentCrafts(ctx.world, cfg, entity.id), ctx.tick];
  if (op === 'make') {
    ctx.emit('craft.done', {
      entityId: entity.id,
      recipeId: recipe.id,
      itemId: result.itemId,
      count: result.count,
      quality: result.quality,
    });
  }
  return result;
}
