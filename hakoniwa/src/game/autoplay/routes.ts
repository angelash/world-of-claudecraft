// The autoplayer's route tables as data (release_engineering.md 13.2): data/autoplay/routes.json
// holds every content id the scripted player steers by (scene choices per ending route,
// hunting grounds, the shop, kept goods, the settlement build and policy plans). It is
// maintained with the content batches; routeProblems checks it against the content.

import raw from '../../../data/autoplay/routes.json';
import type { ContentMap } from '../../core/contracts';
import type { Domain } from '../../systems/city/types';
import { ENDINGS } from '../../systems/scenes/types';

/** A scene-specific choice rule, tried in order before the node preferences. */
export interface SceneRule {
  scene: string;
  /** only nodes whose id starts with this prefix */
  nodePrefix?: string;
  /** take the first of these choices that is visible (fall through when none is) */
  pick?: string[];
  /** a court node: the goddess is the node id after the prefix, weigh the evidence */
  court?: boolean;
}

export interface PlanStep {
  defId: string;
  count: number;
}

export interface AutoplayRoutes {
  scenes: {
    /** node id to preferred choice ids, shared by every route (the "people" path) */
    prefer: Record<string, string[]>;
    /** ending routes the autoplayer can steer toward: node id overrides per route */
    routes: Record<string, Record<string, string[]>>;
    rules: SceneRule[];
  };
  /** maps to grind on when nothing names a monster, in order of preference */
  huntingMaps: string[];
  /** map whose merchants buy loot and sell supplies */
  shopMap: string;
  /** goods never sold as loot (the settlement lives on them) */
  keptItems: string[];
  /** building materials bought for the next planned buildings */
  buildMaterials: string[];
  settlement: {
    /** the last battle, held back until the nation stands on its own */
    climax: string;
    /** copper kept back for grain while the outpost still has to swear its oath */
    grainReserve: number;
    /** food the village oath needs: ten days for thirty sworn residents (city 1.2) */
    foundingFood: number;
    /** buildings the bot places itself before the officials take over */
    outpostPlan: PlanStep[];
    /** later buildings that raise autonomy (policy slots, talent) or keep people fed */
    growthPlan: PlanStep[];
    /** policies per domain in order of preference (one per domain, while slots last) */
    policies: Partial<Record<Domain, string[]>>;
  };
}

export const ROUTES: AutoplayRoutes = raw as AutoplayRoutes;

/** The ending routes the route table knows (keys of scenes.routes). */
export function routeNames(routes: AutoplayRoutes = ROUTES): string[] {
  return Object.keys(routes.scenes.routes);
}

/** Problems with the route table against the content (empty = every id resolves). */
export function routeProblems(content: ContentMap, routes: AutoplayRoutes = ROUTES): string[] {
  const out: string[] = [];
  const scenes = content.scenes ?? [];
  const nodesWithId = (id: string) => scenes.flatMap((s) => s.nodes.filter((n) => n.id === id));
  const choiceIds = (nodes: { choices?: { id: string }[] }[]) =>
    new Set(nodes.flatMap((n) => (n.choices ?? []).map((c) => c.id)));
  const checkPrefer = (where: string, table: Record<string, string[]>) => {
    for (const [node, picks] of Object.entries(table)) {
      const nodes = nodesWithId(node);
      if (nodes.length === 0) out.push(`autoplay ${where}: no scene has node ${node}`);
      const ids = choiceIds(nodes);
      for (const c of picks)
        if (nodes.length > 0 && !ids.has(c))
          out.push(`autoplay ${where}: node ${node} has no choice ${c}`);
    }
  };
  checkPrefer('prefer', routes.scenes.prefer);
  for (const [name, table] of Object.entries(routes.scenes.routes)) {
    if (!(ENDINGS as readonly string[]).includes(name))
      out.push(`autoplay route ${name}: not an ending id`);
    checkPrefer(`route ${name}`, table);
  }
  for (const r of routes.scenes.rules) {
    const scene = scenes.find((s) => s.id === r.scene);
    if (!scene) {
      out.push(`autoplay rule: unknown scene ${r.scene}`);
      continue;
    }
    const nodes = scene.nodes.filter((n) => !r.nodePrefix || n.id.startsWith(r.nodePrefix));
    if (nodes.length === 0)
      out.push(`autoplay rule ${r.scene}: no node starts with ${r.nodePrefix}`);
    if (!r.pick && !r.court) out.push(`autoplay rule ${r.scene}: needs pick or court`);
    const ids = choiceIds(nodes);
    for (const c of r.pick ?? [])
      if (!ids.has(c)) out.push(`autoplay rule ${r.scene}: no choice ${c}`);
    if (r.court)
      for (const n of nodes) {
        const goddess = n.id.slice(r.nodePrefix?.length ?? 0);
        if (!content.goddesses?.some((g) => g.id === goddess))
          out.push(`autoplay rule ${r.scene}: node ${n.id} names no goddess`);
      }
  }
  const maps = new Set((content.maps ?? []).map((m) => m.id));
  for (const m of [...routes.huntingMaps, routes.shopMap])
    if (!maps.has(m)) out.push(`autoplay: unknown map ${m}`);
  const items = new Set((content.items ?? []).map((i) => i.id));
  for (const i of [...routes.keptItems, ...routes.buildMaterials])
    if (!items.has(i)) out.push(`autoplay: unknown item ${i}`);
  const s = routes.settlement;
  if (!(content.battle_scenarios ?? []).some((b) => b.id === s.climax))
    out.push(`autoplay: unknown climax battle ${s.climax}`);
  const buildings = new Set((content.city_buildings ?? []).map((b) => b.id));
  for (const step of [...s.outpostPlan, ...s.growthPlan])
    if (!buildings.has(step.defId)) out.push(`autoplay: unknown building ${step.defId}`);
  const policies = new Set((content.city_policies ?? []).map((p) => p.id));
  for (const ids of Object.values(s.policies))
    for (const id of ids ?? []) if (!policies.has(id)) out.push(`autoplay: unknown policy ${id}`);
  return out;
}
