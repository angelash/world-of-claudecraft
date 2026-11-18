// A quest topic's `unlocks.quests` (builtin_ai.md 6.2; catalog_quests_acts1_3.md 1.8 rule 2):
// when the giver answers the topic, the talk leads into the quest. The dialogue system
// reports which topic a person answered (`dialogue.topic`); this module names the quests that
// answer opens: the ones the topic lists, given by that speaker, never started, and open now
// (week window and trigger), exactly what accepting them from the speaker would take. The
// quests system then accepts them. Topics are read structurally from the content, so the
// quests system imports nothing of the dialogue system.

import type { SystemContext } from '../../core/system';
import { available } from './progress';

/** The part of a topic record this module reads. */
interface TopicQuests {
  id: string;
  unlocks?: { quests?: string[] };
}

/** Quests a topic answered by `npcRef` leads into right now (in the topic's order). */
export function topicUnlockedQuests(ctx: SystemContext, npcRef: string, topicId: string): string[] {
  const topics = (ctx.content as { topics?: readonly TopicQuests[] }).topics ?? [];
  const topic = topics.find((t) => t.id === topicId);
  const out: string[] = [];
  for (const id of topic?.unlocks?.quests ?? []) {
    if (ctx.world.slices.quests.quests[id]) continue;
    const def = ctx.content.quests.find((q) => q.id === id);
    if (!def || def.giver !== npcRef) continue;
    if (available(ctx, def)) out.push(id);
  }
  return out;
}
