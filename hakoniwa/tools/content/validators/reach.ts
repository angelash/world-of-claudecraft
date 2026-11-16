// V9 reachability (release_engineering.md 7.4 and 10.3): the quest and story graphs are
// reachable, and every ending has a route. The quest analysis is the editor's quest and
// story graph (src/editor/quests: the flag write index over data and system sources, the
// reachability fixed point); scenes are reached from reachable acts, quests and scenes
// through the reference table and from `scene.pending` writes. Every ending of the scene
// system needs its scene, and an autoplayer route whose table resolves against the
// content (src/game/autoplay/routes.ts routeProblems). Routes for all eleven endings are
// the RE-21 schedule (first batch M1, all by M3): a missing route warns before M3.

import { collectRefs } from '../../../src/content/references';
import type { ContentMap } from '../../../src/core/contracts';
import { buildFlagIndex, type FlagRef } from '../../../src/editor/quests/flag_index';
import { buildQuestGraph } from '../../../src/editor/quests/quest_graph';
import type { ActDef, QuestDef } from '../../../src/systems/quests';
import { ENDINGS } from '../../../src/systems/scenes/types';
import type { Finding, ValidationInput, Validator } from './types';

/** Milestone from which every ending needs an autoplayer route (RE-21 full, M3). */
export const ROUTES_BLOCKING_FROM = 3;

/** Scene id of an ending. */
export const endingScene = (ending: string): string => `ending_${ending}`;

function rows<T>(content: ContentMap, table: string): T[] {
  const v = (content as unknown as Record<string, unknown>)[table];
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Scenes reachable from the reachable acts and quests, closed over scene references. */
export function reachableScenes(
  content: ContentMap,
  quests: ReadonlySet<string>,
  acts: ReadonlySet<string>,
  index: readonly FlagRef[],
): Set<string> {
  const ids = new Set(rows<{ id: string }>(content, 'scenes').map((s) => s.id));
  const refs = collectRefs(content).filter((u) => u.to.includes('scenes') && ids.has(u.value));
  const out = new Set<string>();
  const queue: string[] = [];
  const add = (id: string) => {
    if (!ids.has(id) || out.has(id)) return;
    out.add(id);
    queue.push(id);
  };
  for (const u of refs) {
    if (u.table === 'acts' && acts.has(u.row)) add(u.value);
    if (u.table === 'quests' && quests.has(u.row)) add(u.value);
  }
  for (const r of index) {
    if (r.kind !== 'write' || r.key !== 'scene.pending' || typeof r.value !== 'string') continue;
    if (r.quest && !quests.has(r.quest)) continue;
    add(r.value);
  }
  while (queue.length) {
    const from = queue.shift() as string;
    for (const u of refs) if (u.table === 'scenes' && u.row === from) add(u.value);
  }
  return out;
}

export function reachFindings(input: ValidationInput): Finding[] {
  if (!input.codeSources || !input.initialFlags) {
    return [
      {
        level: 'error',
        message: 'reachability needs the system sources and the initial world flags',
      },
    ];
  }
  const out: Finding[] = [];
  const index = buildFlagIndex(input.files, input.codeSources);
  const quests = rows<QuestDef>(input.content, 'quests');
  const acts = rows<ActDef>(input.content, 'acts');
  const graph = buildQuestGraph({ quests, acts, index, initialFlags: input.initialFlags });
  const reachableQuests = new Set<string>();
  for (const v of Object.values(graph.verdicts)) {
    if (v.state === 'reachable' || v.state === 'undecided') reachableQuests.add(v.id);
    if (v.state === 'unreachable' || v.state === 'stuck')
      out.push({
        level: 'error',
        message: `quests:${v.id}: ${v.state}${v.stage !== undefined ? ` at stage ${v.stage}` : ''} (blocked by ${v.blockers.join(', ') || 'nothing written'}${v.unwritten.length ? `; never written: ${v.unwritten.join(', ')}` : ''})`,
        table: 'quests',
        row: v.id,
      });
    else if (v.state === 'undecided')
      out.push({
        level: 'warning',
        message: `quests:${v.id}: reachability undecided (too many value combinations)`,
        table: 'quests',
        row: v.id,
      });
  }
  for (const act of graph.unreachableActs)
    out.push({
      level: 'error',
      message: `acts:${act}: no reachable writer switches to this act`,
      table: 'acts',
      row: act,
    });
  const unreachableActs = new Set(graph.unreachableActs);
  const liveActs = new Set(acts.map((a) => a.id).filter((id) => !unreachableActs.has(id)));
  const scenes = reachableScenes(input.content, reachableQuests, liveActs, index);
  for (const s of rows<{ id: string }>(input.content, 'scenes'))
    if (!scenes.has(s.id))
      out.push({
        level: 'error',
        message: `scenes:${s.id}: no reachable act, quest or scene requests it`,
        table: 'scenes',
        row: s.id,
      });
  const sceneIds = new Set(rows<{ id: string }>(input.content, 'scenes').map((s) => s.id));
  const routes = new Set(input.endingRoutes ?? []);
  const routeLevel = input.milestone >= ROUTES_BLOCKING_FROM ? 'error' : 'warning';
  for (const ending of ENDINGS) {
    if (!sceneIds.has(endingScene(ending)))
      out.push({
        level: 'error',
        message: `ending ${ending}: no scene ${endingScene(ending)}`,
        table: 'scenes',
        row: endingScene(ending),
      });
    if (!routes.has(ending))
      out.push({
        level: routeLevel,
        message: `ending ${ending}: no autoplayer route yet (RE-21: every ending by M3)`,
      });
  }
  for (const message of input.routeProblems ?? []) out.push({ level: 'error', message });
  return out;
}

export const reachValidator: Validator = {
  id: 'V9',
  title: 'reachability',
  run: reachFindings,
};
