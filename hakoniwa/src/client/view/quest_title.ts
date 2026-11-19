// Display titles of quests and of the people in party lines, through their content keys so
// they follow the interface language (release_engineering.md 8.3). A commission instance's
// title is its template's (`QuestDef.textOf`, PK-M1-47's request): the run-time instance has
// no row in the generated table of its own. Pure.

import { contentKey } from '../../core/content_key';
import { tOr } from '../../shared_ui/i18n';
import { questDefOf } from '../../systems/quests';
import type { GameView } from './game_view';

/** A quest's title: the content's, an instance's through its template, else `raw` or the id. */
export function questTitleText(view: GameView, questId: string, raw?: string): string {
  const def = questDefOf(
    { content: { quests: view.content.quests ?? [] }, world: view.world as never },
    questId,
  );
  if (!def) return raw || questId;
  if (!def.title) return raw || questId;
  const src = def.textOf ?? { table: 'quests', id: def.id };
  return tOr(contentKey(src.table, src.id, 'title'), def.title);
}

/**
 * A companion's name by companion id (a join on standby has no entity yet): the content
 * record's name through its key, else the entity's name when one stands in the world, else
 * the id.
 */
export function companionName(view: GameView, companionId: string, entityId?: string): string {
  const rec = view.content.companions?.find((c) => c.id === companionId);
  if (rec) return tOr(contentKey('companions', companionId, 'name'), rec.name);
  const e = entityId ? view.entity(entityId) : undefined;
  return e?.name ?? companionId;
}
