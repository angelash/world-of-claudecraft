// Scene choice policies of the autoplayer, one per ending route. A policy sees what the
// player sees (the scene view: scene id, node id and the visible choice ids) plus the
// world for the court, where it weighs evidence against the goddess's defense lines the
// way a careful player reads the court window. Unknown nodes take the first visible
// choice, so new content never stalls a run.

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import type { DefenseLine } from '../../systems/scenes/types';

/** Endings the autoplayer knows how to steer toward. */
export type EndingRoute = 'release' | 'rule_merca';

export const ENDING_ROUTES: readonly EndingRoute[] = ['release', 'rule_merca'];

export type ChoicePolicy = (sceneId: string, nodeId: string, choices: string[]) => string;

const EVIDENCE_PREFIX = 'evidence:';

/** Node id to preferred choice ids, shared by every route (the "people" path of the story). */
const PREFER: Record<string, string[]> = {
  choose: ['evidence'],
  after_valda: ['duel'],
  after_merca: ['outlet'],
  janu_ask: ['tavi', 'ash', 'let_go'],
  patron: ['none'],
  face: ['redeem', 'destroy'],
  eska: ['ours'],
  table: ['broad'],
  eluen: ['decline'],
  moira: ['trade'],
};

/** Route overrides: node id to preferred choice ids. */
const ROUTE_PREFER: Record<EndingRoute, Record<string, string[]>> = {
  release: {},
  rule_merca: { patron: ['merca'] },
};

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

/** The choice policy for one ending route. */
export function scenePolicy(route: EndingRoute, world: World, content: ContentMap): ChoicePolicy {
  const prefer = { ...PREFER, ...ROUTE_PREFER[route] };
  return (sceneId, nodeId, ids) => {
    if (sceneId === 'a6_court' && nodeId.startsWith('crisis_') && ids.includes('stay')) {
      return 'stay';
    }
    if (sceneId === 'a6_court' && nodeId.startsWith('x_')) {
      return courtPick(world, content, nodeId.slice(2), ids);
    }
    if (sceneId === 'a5_route_choice') {
      if (ids.includes('ash_drawer')) return 'ash_drawer';
      if (ids.includes('people')) return 'people';
    }
    if (sceneId === 'ending_release') {
      for (const want of ['stay', 'give_all', 'maker_door', 'maker_door_home']) {
        if (ids.includes(want)) return want;
      }
    }
    for (const want of prefer[nodeId] ?? []) if (ids.includes(want)) return want;
    return ids[0] as string;
  };
}
