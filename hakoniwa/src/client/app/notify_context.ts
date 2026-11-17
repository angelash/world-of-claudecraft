// The names the notification mapping (src/client/hud/notify_model.ts notifyOf) reads, from the
// client's world interface and adapters: item and quest display names, the companion an entity
// is, feature and act labels. Built once per batch of events; the party is read only when an
// event asks about a companion.

import { contentKey } from '../../core/content_key';
import { tOr } from '../../shared_ui/i18n';
import { actLabel, featureLabel } from '../hud/format';
import type { NotifyEventContext } from '../hud/notify_model';
import type { ClientAdapters } from '../view/adapters';
import type { GameView } from '../view/game_view';

export function notifyContext(view: GameView, adapters: ClientAdapters): NotifyEventContext {
  let companions: Map<string, string> | null = null;
  return {
    playerId: view.playerId(),
    itemName: (id) => {
      const name = view.itemDef(id)?.name ?? id;
      return tOr(contentKey('items', id, 'name'), name);
    },
    questTitle: (id) => {
      const title = view.content.quests?.find((q) => q.id === id)?.title ?? id;
      return tOr(contentKey('quests', id, 'title'), title);
    },
    companionName: (entityId) => {
      if (!companions) {
        companions = new Map();
        for (const c of adapters.party?.companions(view) ?? []) {
          if (c.unit)
            companions.set(c.unit.id, tOr(contentKey('companions', c.id, 'name'), c.name));
        }
      }
      return companions.get(entityId) ?? null;
    },
    featureName: featureLabel,
    actName: actLabel,
  };
}
