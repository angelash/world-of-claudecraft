// Gathering (catalog_gathering_crafting.md 1.3, 1.4, 6): an entity standing at a node's place
// takes what the node gives, as far as its skill and tool tiers allow (gatherVerdict): the
// main yield and the by-products by their chances, half of it when either tier falls one
// short; once in `rareOneIn` gathers with the full allowance a rare event gives five times
// as much, all signed by the gatherer (the player's signature is `unrecorded`). What comes
// from a node whose place lies at sediment 3 or more (the sediment at the centre of the
// node's location, wherever within reach the gatherer stands) carries the taint grade of
// 1.4 (a stack qualifier).
// The node then waits its refresh days (by tier; 0: until content resets it) and counts
// its uses; the tool wears; the skill grows by the four-state curve; `gather.done` goes out
// per item for the quest objectives. Draws go on the named stream `crafting.gather`.

import type { ContentMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import type { World } from '../../core/world';
import { addItem, holderId, type ItemGrant, UNRECORDED } from '../inventory';
import { mapById, sedimentAt } from '../world';
import type { Entity } from '../world/types';
import { entityOf, placeLocation, placeOf } from './places';
import { gainFactor, gatherTaint, gatherVerdict, halfYield, nodeProfession } from './rules';
import { addSkill, craftingConfig, holdsIn, skillOf } from './skills';
import { craftingSlice, readCrafting } from './slice';
import { bestTool, type ToolPick, wearTool } from './tools';
import type { CraftingConfig, GatherNodeDef, GatherProfession, Place } from './types';

/** The random stream of gathering (the yields and the rare event). */
export const GATHER_STREAM = 'crafting.gather';

export type GatherRefusal =
  | 'no_rules'
  | 'no_node'
  | 'no_body'
  | 'not_here'
  | 'not_now'
  | 'spent'
  | 'not_ready'
  | 'skill'
  | 'tool';

export interface GatherPlan {
  node: GatherNodeDef;
  profession: GatherProfession;
  place: Place;
  entity: Entity;
  tool?: ToolPick;
  /** full yield and signed rare finds (both tiers reach the node's) */
  full: boolean;
}

export function nodeDef(content: ContentMap, id: string): GatherNodeDef | undefined {
  return (content.gatherNodes ?? []).find((n) => n.id === id);
}

/** The tick a node gives again: 0 when ready now, -1 until content resets it. */
export function nodeReadyAt(world: Pick<World, 'slices'>, nodeId: string): number {
  return readCrafting(world)?.nodes[nodeId]?.readyAt ?? 0;
}

/** Whether a node is gone for good (its uses spent). */
export function nodeSpent(world: Pick<World, 'slices'>, node: GatherNodeDef): boolean {
  const used = readCrafting(world)?.nodes[node.id]?.used ?? 0;
  return node.uses !== undefined && used >= node.uses;
}

/** What a gather would do now, or why it cannot happen (no state changes). */
export function planGather(
  world: World,
  content: ContentMap,
  entityId: string,
  nodeId: string,
): { ok: true; plan: GatherPlan } | { ok: false; code: GatherRefusal } {
  const cfg = craftingConfig(content);
  if (!cfg) return { ok: false, code: 'no_rules' };
  const node = nodeDef(content, nodeId);
  if (!node) return { ok: false, code: 'no_node' };
  const entity = entityOf(world, entityId);
  if (!entity?.alive) return { ok: false, code: 'no_body' };
  const place = placeOf(content, entity, node.places, cfg.gather.reach);
  if (!place) return { ok: false, code: 'not_here' };
  if (!holdsIn(world, node.when)) return { ok: false, code: 'not_now' };
  if (nodeSpent(world, node)) return { ok: false, code: 'spent' };
  const readyAt = nodeReadyAt(world, node.id);
  if (readyAt < 0 || readyAt > world.meta.tick) return { ok: false, code: 'not_ready' };
  const profession = nodeProfession(node);
  const tool = bestTool(world, content, cfg, entityId, profession);
  const v = gatherVerdict(skillOf(world, entityId, profession), tool?.tier ?? 0, node.tier);
  if (!v.ok) return { ok: false, code: v.code };
  return { ok: true, plan: { node, profession, place, entity, tool, full: v.full } };
}

/** The signature a gatherer or maker leaves: `unrecorded` for the player, else the person. */
export function signatureOf(ctx: SystemContext, entityId: string): string {
  return entityId === ctx.world.slices.world.playerId ? UNRECORDED : holderId(ctx, entityId);
}

export interface Gathered {
  itemId: string;
  count: number;
}

/** The taint grade a node's place gives (the sediment at the centre of its location). */
function placeTaint(ctx: SystemContext, place: Place, tier: number): number {
  const map = mapById(ctx.content, place.mapId);
  const l = placeLocation(ctx.content, place);
  if (!map || !l) return 0;
  return gatherTaint(sedimentAt(map, l.x + l.w / 2, l.y + l.h / 2), tier);
}

/** Roll and hand out one gather of a planned node; returns what was given. */
export function runGather(ctx: SystemContext, cfg: CraftingConfig, plan: GatherPlan): Gathered[] {
  const { node, entity } = plan;
  const rng = ctx.rng(GATHER_STREAM);
  const rare = plan.full && cfg.gather.rareOneIn > 0 && rng.next() < 1 / cfg.gather.rareOneIn;
  const taint = (node.taint ?? placeTaint(ctx, plan.place, node.tier)) as 0 | 1 | 2 | 3;
  const out: Gathered[] = [];
  for (const y of node.yields) {
    if ((y.chance ?? 1) < 1 && rng.next() >= (y.chance ?? 1)) continue;
    let n = Array.isArray(y.count) ? rng.int(y.count[0], y.count[1]) : y.count;
    if (!plan.full) n = halfYield(n);
    if (rare) n *= cfg.gather.rareMultiplier;
    if (n <= 0) continue;
    const init: ItemGrant = {};
    if (taint > 0) init.sedTier = taint;
    if (rare) init.signature = signatureOf(ctx, entity.id);
    addItem(ctx, entity.id, y.itemId, n, 'gather', init);
    out.push({ itemId: y.itemId, count: n });
  }
  const slice = craftingSlice(ctx.world);
  const state = slice.nodes[node.id] ?? { readyAt: 0, used: 0 };
  const days = node.refreshDays ?? cfg.gather.refreshDays[node.tier - 1] ?? 1;
  state.readyAt = days > 0 ? ctx.tick + Math.round(days * TICKS_PER_GAME_DAY) : -1;
  state.used += 1;
  slice.nodes[node.id] = state;
  if (plan.tool) wearTool(ctx, cfg, entity.id, plan.tool);
  const skill = skillOf(ctx.world, entity.id, plan.profession);
  addSkill(ctx, cfg, entity.id, plan.profession, cfg.gain * gainFactor(cfg, skill, node.tier));
  if (rare) ctx.emit('crafting.rare', { entityId: entity.id, nodeId: node.id });
  for (const g of out) {
    ctx.emit('gather.done', {
      entityId: entity.id,
      itemId: g.itemId,
      count: g.count,
      nodeId: node.id,
      mapId: plan.place.mapId,
    });
  }
  return out;
}

/** Content resets an event node (T5 sources, a scripted find): it gives again now. */
export function resetNode(ctx: SystemContext, nodeId: string): boolean {
  const slice = craftingSlice(ctx.world);
  const state = slice.nodes[nodeId];
  if (!state) return false;
  state.readyAt = 0;
  return true;
}
