// The M1 panels read exported court/roster queries and the public party snapshot. They
// never mutate a slice: every button constructs a command for the next simulation tick.

import { contentKey } from '../../core/content_key';
import { t, tOr } from '../../shared_ui/i18n';
import { courtSite, courtView } from '../../systems/city';
import { rosterView } from '../../systems/party';
import { banterReplyKey } from '../../systems/party/banter_select';
import type {
  BanterPanelData,
  CompanionInteractionData,
  CourtItemRow,
  CourtPanelData,
} from '../view/adapters_interface';
import type { ClientCommand, GameView } from '../view/game_view';
import { flagOn } from '../view/game_view';

function itemRows(view: GameView, ownerId: string): CourtItemRow[] {
  return Object.entries(view.holding(ownerId).items)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, count]) => ({
      id,
      name: tOr(contentKey('items', id, 'name'), view.itemDef(id)?.name ?? id),
      count,
    }));
}

export function courtPanelData(view: GameView): CourtPanelData | null {
  if (!flagOn(view.flag('feature.inner_court')) || !view.world.slices.city) return null;
  const site = courtSite(view.content);
  const data = courtView(view.world, view.content);
  if (!site || !data) return null;
  const inside = view.player()?.mapId === site.mapId;
  return {
    siteId: site.id,
    inside,
    enterable: !inside && data.door.near && data.door.cooldownLeft === 0,
    cooldown: data.door.cooldownLeft,
    storage: data.storage,
    cases: data.display.cases,
    entries: data.display.entries.map((e) => ({
      id: e.id,
      name: tOr(contentKey('items', e.itemId, 'name'), view.itemDef(e.itemId)?.name ?? e.itemId),
      caseId: e.caseId,
      remaining: e.takeDue === undefined ? null : Math.max(0, e.takeDue - view.tick),
    })),
    pack: itemRows(view, view.playerId()),
    stock: itemRows(view, site.stockOwner),
  };
}

export function courtMoveCommand(inside: boolean): ClientCommand[] {
  return [{ kind: inside ? 'city.leave_court' : 'city.enter_court', data: {} }];
}

export function courtStorageCommand(
  siteId: string,
  itemId: string,
  direction: 'deposit' | 'withdraw',
  count = 1,
): ClientCommand[] {
  if (!Number.isSafeInteger(count) || count <= 0) return [];
  return [
    {
      kind: direction === 'deposit' ? 'city.deposit' : 'city.withdraw',
      data: { siteId, itemId, count },
    },
  ];
}

export function courtDisplayCommand(itemId: string, caseId: string): ClientCommand[] {
  return [{ kind: 'city.display_put', data: { itemId, caseId } }];
}

export function courtTakeCommand(entryId: string): ClientCommand[] {
  return [{ kind: 'city.display_take', data: { entryId } }];
}

export function companionInteractionData(view: GameView): CompanionInteractionData[] {
  if (!view.world.slices.party) return [];
  return rosterView(view.world, view.content).map((c) => ({
    id: c.id,
    name: tOr(contentKey('companions', c.id, 'name'), c.name),
    manual: view.world.slices.party.members[c.id]?.stanceBy === 'player',
    walking: c.state === 'party' || c.state === 'waiting',
    resting: c.state === 'resting',
  }));
}

export function companionAutoCommand(companionId: string, on: boolean): ClientCommand[] {
  return [{ kind: 'party.auto_stance', data: { companionId, on } }];
}

export function companionTalkCommand(companionId: string, visit: boolean): ClientCommand[] {
  return [{ kind: visit ? 'party.visit' : 'party.camp_talk', data: { companionId } }];
}

/** The saved running exchange is authoritative; an old reply event cannot resurrect it. */
export function banterPanelData(view: GameView): BanterPanelData | null {
  const run = view.world.slices.party?.banter?.running;
  if (!run) return null;
  const latest = [...view.recentEvents()].reverse();
  const spoken = latest.find((e) => e.kind === 'party.banter' && e.data.exchangeId === run.id);
  const ask = latest.find((e) => e.kind === 'party.banter_ask' && e.data.exchangeId === run.id);
  const active = run.replyUntil !== undefined && run.replyUntil >= view.tick;
  let options: BanterPanelData['options'] = [];
  if (active && ask?.kind === 'party.banter_ask' && ask.data.until === run.replyUntil) {
    options = ask.data.options.map((label, index) => ({ index, label: t(label) }));
  } else if (active) {
    const def = view.content.partyBanter?.find((d) => d.id === run.id);
    const lines = view.content.linePacks?.find((p) => p.id === 'ln_party')?.slots[
      `party.${run.id}`
    ];
    if (def && Array.isArray(lines)) {
      options = (def.replies ?? []).map((_reply, index) => {
        const entry = lines[def.speakers.length + index];
        const key = banterReplyKey(def, index);
        return {
          index,
          label: t({ key: entry !== null && typeof entry === 'object' ? `${key}.zh` : key }),
        };
      });
    }
  }
  return {
    id: run.id,
    line: spoken?.kind === 'party.banter' ? t(spoken.data.text) : '',
    remaining: active ? Math.max(0, (run.replyUntil ?? view.tick) - view.tick) : 0,
    options,
  };
}

export function banterReplyCommand(exchangeId: string, option: number): ClientCommand[] {
  if (!Number.isSafeInteger(option) || option < 0) return [];
  return [{ kind: 'party.banter_reply', data: { exchangeId, option } }];
}
