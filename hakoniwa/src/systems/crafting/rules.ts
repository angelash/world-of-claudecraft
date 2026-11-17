// The gathering and crafting rules as pure functions (catalog_gathering_crafting.md 1.2 to
// 1.5, 2.4, 2.6; progression_and_pacing.md 6.3): skill tiers and layer caps, the four-state
// gain curve of the main project (full at or above the work's tier, then half, a quarter,
// nothing), what a node allows by skill and tool tier, the taint a place's sediment gives,
// the masterwork chance, and the station tier a recipe needs. No state, no randomness.

import { craftTierOf, layerCap } from '../inventory/rules';
import type { CraftingConfig, GatherNodeDef, GatherProfession, NodeKind, RecipeDef } from './types';
import { NODE_PROFESSION } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The livelihood a node is gathered with. */
export function nodeProfession(node: Pick<GatherNodeDef, 'kind' | 'profession'>): GatherProfession {
  if (node.kind === 'special') return node.profession ?? 'mining';
  return NODE_PROFESSION[node.kind as Exclude<NodeKind, 'special'>];
}

/** The skill a recipe needs: its own, else the first point of its tier. */
export function recipeSkill(r: Pick<RecipeDef, 'skill' | 'tier'>): number {
  return r.skill ?? (Math.max(1, r.tier) - 1) * 25;
}

/** The station tier a recipe needs: its own, else by its tier (2.4: T1 to T2 one, T3 two...). */
export function recipeStationTier(
  r: Pick<RecipeDef, 'stationTier' | 'tier'>,
  cfg: CraftingConfig,
): number {
  return r.stationTier ?? cfg.stationTiers[clamp(r.tier, 1, cfg.stationTiers.length) - 1] ?? 1;
}

/**
 * The gain factor of one action (the main project's four-state curve): full when the
 * crafter's tier is at or below the work's, then by how many tiers above it they stand.
 */
export function gainFactor(cfg: CraftingConfig, skill: number, workTier: number): number {
  const above = craftTierOf(skill) - workTier;
  if (above <= 0) return cfg.gainCurve[0] ?? 1;
  return cfg.gainCurve[Math.min(above, cfg.gainCurve.length - 1)] ?? 0;
}

/** A skill after one action's gain, held to its cap; never lowered (a cap below stays put). */
export function gainedSkill(skill: number, gain: number, cap: number): number {
  if (gain <= 0 || skill >= cap) return skill;
  return Math.round(Math.min(cap, skill + gain) * 1000) / 1000;
}

/** The skill cap of a layer (25 per layer, to 150). */
export function capOfLayer(layer: number): number {
  return layerCap(layer);
}

export type GatherVerdict = { ok: true; full: boolean } | { ok: false; code: 'skill' | 'tool' };

/**
 * What a gatherer may take from a node (1.3, consumables 3.15): the node at most one tier
 * above the skill's tier and one above the tool's; full yield and signed rare finds only
 * when both reach the node's tier, else half the yield and nothing signed. No tool is tier 0.
 */
export function gatherVerdict(skill: number, toolTier: number, nodeTier: number): GatherVerdict {
  const skillTier = craftTierOf(skill);
  if (nodeTier > skillTier + 1) return { ok: false, code: 'skill' };
  if (nodeTier > toolTier + 1) return { ok: false, code: 'tool' };
  return { ok: true, full: skillTier >= nodeTier && toolTier >= nodeTier };
}

/** Half a yield, rounded up (a node above the gatherer's tier gives half). */
export function halfYield(n: number): number {
  return Math.ceil(n / 2);
}

/**
 * The taint grade a place's sediment gives what is gathered there (1.4): none below
 * sediment 3; light at 3 for T1 to T2 nodes, mid at 3 for T3 and up; mid at 4; heavy at 5
 * and above.
 */
export function gatherTaint(sediment: number, nodeTier: number): 0 | 1 | 2 | 3 {
  if (sediment >= 5) return 3;
  if (sediment >= 4) return 2;
  if (sediment >= 3) return nodeTier >= 3 ? 2 : 1;
  return 0;
}

export interface MasterworkInput {
  /** the crafter's skill tier minus the recipe's tier (below 0 counts as 0) */
  tiersAbove: number;
  /** a signed material went in */
  signed: boolean;
  /** the crafter specialized in this branch (skill 75, 2.5) */
  specialized: boolean;
  stationTier: number;
}

/** The masterwork chance of one craft (2.6), capped. */
export function masterworkChance(cfg: CraftingConfig, m: MasterworkInput): number {
  const w = cfg.masterwork;
  const chance =
    w.base +
    w.perTierAbove * Math.max(0, m.tiersAbove) +
    (m.signed ? w.signed : 0) +
    (m.specialized ? w.specialization : 0) +
    (w.stationTier[String(m.stationTier)] ?? 0);
  return Math.min(w.cap, chance);
}
