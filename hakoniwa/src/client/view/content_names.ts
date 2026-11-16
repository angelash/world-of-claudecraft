// Content display names for the client (release_engineering.md 8.3): names, titles and
// labels the HUD and the windows read from a content record go through the content key, so
// they follow the interface language and the pseudo-locale like any other text; when no
// table has the key (a record missing from the generated table, a name with no CJK in it),
// the value the record holds shows as it always did. Pure.

import { contentKey } from '../../core/content_key';
import { tOr } from '../../shared_ui/i18n';

/** A content field's display text: its key in the active language, else `value` as written. */
function field(table: string, id: string | undefined, value: unknown, name = 'name'): string {
  const text = typeof value === 'string' ? value : '';
  if (!id || text === '') return text;
  return tOr(contentKey(table, id, name), text);
}

export const contentNames = {
  map: (m: { id: string; name: string } | undefined): string => field('maps', m?.id, m?.name),
  ability: (id: string, name: string): string => field('abilities', id, name),
  abilityDesc: (id: string, desc: string): string => field('abilities', id, desc, 'desc'),
  aura: (id: string, name: string): string => field('auras', id, name),
  className: (c: { id: string; name: string } | undefined): string =>
    field('classes', c?.id, c?.name),
  sceneTitle: (id: string, title: string): string => field('scenes', id, title, 'title'),
};
