// Scene choice policies of the autoplayer, one per ending route. A policy sees what the
// player sees (the scene view: scene id, node id and the visible choice ids) plus the
// world for the court, where it weighs evidence against the goddess's defense lines the
// way a careful player reads the court window. Unknown nodes take the first visible
// choice, so new content never stalls a run. The choice tables are data
// (data/autoplay/routes.json, scenes).

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import type { DefenseLine } from '../../systems/scenes/types';
import { ROUTES, routeNames } from './routes';

/** An ending the autoplayer knows how to steer toward (a key of the route table's routes). */
export type EndingRoute = string;

export const ENDING_ROUTES: readonly EndingRoute[] = routeNames();

export type ChoicePolicy = (sceneId: string, nodeId: string, choices: string[]) => string;

const EVIDENCE_PREFIX = 'evidence:';

function lineOpen(world: World, content: ContentMap, goddess: string, line: DefenseLine): boolean {
  const def = content.courtDefenses.find((d) => d.goddess === goddess);
  const strength = world.slices.scenes.court.strength[goddess];
  const thick = def?.thickness[line] ?? 0;
  return (strength?.[line] ?? 0) < thick + (line === 'need' ? 1 : 0);
}

/** Pick evidence that still hits an unbroken line, else a mitigating piece, else end. */
function courtPick(world: World, content: ContentMap, goddess: string, ids: string[]): string {
  const evidenceOf = (id: string) =>
    id.startsWith(EVIDENCE_PREFIX)
      ? content.evidence.find((e) => e.id === id.slice(EVIDENCE_PREFIX.length))
      : undefined;
  const useful = ids.find((id) =>
    evidenceOf(id)?.targets.some(
      (t) =>
        t.goddess === goddess && t.line !== 'mitigate' && lineOpen(world, content, goddess, t.line),
    ),
  );
  if (useful) return useful;
  const mitigate = ids.find((id) =>
    evidenceOf(id)?.targets.some((t) => t.goddess === goddess && t.line === 'mitigate'),
  );
  return mitigate ?? ids.find((id) => !id.startsWith(EVIDENCE_PREFIX)) ?? (ids[0] as string);
}

/** The choice policy for one ending route (scene rules first, then node preferences). */
export function scenePolicy(route: EndingRoute, world: World, content: ContentMap): ChoicePolicy {
  const prefer = { ...ROUTES.scenes.prefer, ...ROUTES.scenes.routes[route] };
  return (sceneId, nodeId, ids) => {
    for (const rule of ROUTES.scenes.rules) {
      if (rule.scene !== sceneId) continue;
      const prefix = rule.nodePrefix ?? '';
      if (!nodeId.startsWith(prefix)) continue;
      if (rule.court) return courtPick(world, content, nodeId.slice(prefix.length), ids);
      for (const want of rule.pick ?? []) if (ids.includes(want)) return want;
    }
    for (const want of prefer[nodeId] ?? []) if (ids.includes(want)) return want;
    return ids[0] as string;
  };
}
