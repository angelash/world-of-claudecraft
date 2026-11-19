// Quest instances (PK-M1-47; quests_and_events.md 6.5): quests built at run time from a
// template instead of read from data, such as the guild's commissions (GC-F-001 built from
// cmm_a1_cellar_rats). The system that instantiates a template hands the built QuestDef to
// addQuestInstance; the definition is kept in the quests slice, so it is saved with the world
// and a loaded game or a replay rebuilds nothing, and every lookup of the quests system
// (progress, outcomes, the log, turn-in) sees it like a content quest. An instance never
// starts by itself: its owner starts it (startQuest). dropQuestInstance removes a closed one
// with its progress record (the owner's retention); its quest.<id> flag stays as history.
// A leaf module (types and the content key helper only), so progress and outcomes can use it.

import { contentText } from '../../core/content_key';
import type { TextParam } from '../../core/text';
import type { QuestDef, QuestsSlice } from './types';

type InstanceWorld = { slices: { quests: QuestsSlice } };
type QuestLookup = {
  content: { quests?: QuestDef[] };
  world: { slices: { quests?: QuestsSlice } };
};
type QuestRegistration = { content: { quests: QuestDef[] }; world: InstanceWorld };

/** The instance definitions of a world, by quest id (empty when there are none). */
export function questInstances(world: QuestLookup['world']): Readonly<Record<string, QuestDef>> {
  return world.slices.quests?.instances ?? {};
}

/** A quest's definition: the content's, else a run-time instance's. */
export function questDefOf(ctx: QuestLookup, id: string): QuestDef | undefined {
  return ctx.content.quests?.find((q) => q.id === id) ?? questInstances(ctx.world)[id];
}

/** Every quest definition: the content's in content order, then the instances in insertion order. */
export function allQuestDefs(ctx: QuestLookup): QuestDef[] {
  const authored = ctx.content.quests ?? [];
  const inst = Object.values(questInstances(ctx.world));
  return inst.length === 0 ? authored : [...authored, ...inst];
}

/**
 * Register a built quest. False (nothing kept) when the id is taken by a content quest or
 * by another instance: ids are never reused, so a closed quest cannot come back.
 */
export function addQuestInstance(ctx: QuestRegistration, def: QuestDef): boolean {
  const slice = ctx.world.slices.quests;
  if (ctx.content.quests.some((q) => q.id === def.id)) return false;
  if (slice.instances?.[def.id] || slice.quests[def.id]) return false;
  slice.instances ??= {};
  slice.instances[def.id] = def;
  return true;
}

/**
 * Remove a closed instance (done, failed, expired or by someone else) with its progress
 * record and its place in the log order. An active or ready one is kept: false.
 */
export function dropQuestInstance(ctx: { world: InstanceWorld }, id: string): boolean {
  const slice = ctx.world.slices.quests;
  if (!slice.instances?.[id]) return false;
  const q = slice.quests[id];
  if (q && (q.status === 'active' || q.status === 'ready')) return false;
  delete slice.instances[id];
  delete slice.quests[id];
  const i = slice.order.indexOf(id);
  if (i >= 0) slice.order.splice(i, 1);
  return true;
}

/**
 * The display title of a quest as a text parameter: the content key of its title, or for an
 * instance the key of its template's title (`textOf`), so the client renders it in the active
 * language.
 */
export function questTitle(def: QuestDef): TextParam {
  const src = def.textOf;
  if (!src) return contentText('quests', def, '', 'title');
  return contentText(
    src.table,
    { id: src.id, title: def.title } as { id: string },
    def.title,
    'title',
  );
}
