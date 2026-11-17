// Read-only queries for the client (the crafting and gathering windows, prompts at a node):
// an entity's livelihood skills with their caps, what each recipe would say now, and the
// nodes and stations where the entity stands. They reuse the command checks, so a window
// never promises what a command would refuse.

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { PROFESSIONS, type Profession } from '../inventory/types';
import { type CraftRefusal, planCraft } from './craft';
import { drunkLayers } from './drink';
import { type GatherRefusal, nodeReadyAt, planGather } from './gather';
import { entityOf, placeOf } from './places';
import { craftingConfig, skillCap, skillOf } from './skills';

export interface SkillRow {
  profession: Profession;
  /** shown floored */
  skill: number;
  cap: number;
}

export interface CraftingView {
  skills: SkillRow[];
  drunk: number;
}

/** An entity's livelihoods (every one it practised, plus the caps) and drunkenness. */
export function craftingView(world: World, content: ContentMap, entityId: string): CraftingView {
  const cfg = craftingConfig(content);
  const skills: SkillRow[] = [];
  if (cfg) {
    for (const p of PROFESSIONS) {
      const v = skillOf(world, entityId, p);
      if (v > 0) skills.push({ profession: p, skill: Math.floor(v), cap: skillCap(world, cfg, p) });
    }
  }
  return { skills, drunk: drunkLayers(world, entityId) };
}

export interface RecipeRow {
  id: string;
  ok: boolean;
  code?: CraftRefusal;
}

/** Every recipe the entity knows, with what a craft would say now (refine and enchant need a piece). */
export function recipeRows(world: World, content: ContentMap, entityId: string): RecipeRow[] {
  const out: RecipeRow[] = [];
  for (const r of content.recipes ?? []) {
    const v = planCraft(world, content, entityId, r.id);
    if (!v.ok && v.code === 'unknown') continue;
    out.push(v.ok ? { id: r.id, ok: true } : { id: r.id, ok: false, code: v.code });
  }
  return out;
}

export interface NodeRow {
  id: string;
  ok: boolean;
  code?: GatherRefusal;
  /** when it gives again (0 ready, -1 until content resets it) */
  readyAt: number;
}

/** The nodes whose places the entity stands at, with what a gather would say now. */
export function nodesHere(world: World, content: ContentMap, entityId: string): NodeRow[] {
  const cfg = craftingConfig(content);
  const e = entityOf(world, entityId);
  if (!cfg || !e) return [];
  const out: NodeRow[] = [];
  for (const n of content.gatherNodes ?? []) {
    if (!placeOf(content, e, n.places, cfg.gather.reach)) continue;
    const v = planGather(world, content, entityId, n.id);
    const readyAt = nodeReadyAt(world, n.id);
    out.push(
      v.ok ? { id: n.id, ok: true, readyAt } : { id: n.id, ok: false, code: v.code, readyAt },
    );
  }
  return out;
}
