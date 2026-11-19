import { contentKey } from '../../core/content_key';
import type { AnyWorldEvent } from '../../core/contracts';
import { TICKS_PER_GAME_MINUTE } from '../../core/time';
import { tOr } from '../../shared_ui/i18n';
import { bagSummary } from '../../systems/combat/death_costs';
import { cardSubjectName, deathDamageRows } from '../adapters/player_cards';
import type { GameView } from '../view/game_view';

export interface DeathReviewModel {
  tick: number;
  damage: { source: string; ability: string; amount: number; agoTicks: number }[];
  destination: string;
  leftAt: string;
  lostMoney: number;
  items: { name: string; count: number }[];
  witnesses: number;
  remaining: number;
  elapsed: number;
  returned: boolean;
}

export function deathReviewData(
  view: GameView,
  events: readonly AnyWorldEvent[],
  tick: number,
  previous?: DeathReviewModel,
): DeathReviewModel | null {
  if (previous?.tick !== tick) previous = undefined;
  const candidate = view.world.slices.combat?.pendingReturn;
  const pending =
    candidate?.playerId === view.playerId() && candidate.at - candidate.revivalTicks === tick
      ? candidate
      : undefined;
  const returns = events.find((ev) => ev.kind === 'combat.player_returned' && ev.tick > tick);
  const ended = returns?.kind === 'combat.player_returned' ? returns.data : null;
  if (!pending && !ended && !previous) return null;
  const bagId = pending?.packId ?? ended?.packId;
  const bag = bagId ? view.world.slices.combat?.bags?.[bagId] : undefined;
  const destination = pending?.toMap ?? ended?.toMap;
  const from = pending?.fromMap ?? ended?.fromMap;
  const mapName = (id: string) => {
    const map = view.map(id);
    return map ? tOr(contentKey('maps', map.id, 'name'), map.name) : '';
  };
  return {
    tick,
    damage:
      previous?.damage ??
      deathDamageRows(events, view.playerId(), tick).map((d) => ({
        source: (() => {
          const source = view.entity(d.sourceId);
          return source && !source.hidden
            ? cardSubjectName(view, source)
            : tOr('ui.pop.death.unknown_source', '');
        })(),
        ability: d.abilityId
          ? tOr(
              contentKey('abilities', d.abilityId, 'name'),
              view.content.abilities.find((a) => a.id === d.abilityId)?.name ?? '',
            )
          : '',
        amount: d.amount,
        agoTicks: d.agoTicks,
      })),
    destination: destination ? mapName(destination) : (previous?.destination ?? ''),
    leftAt: from ? mapName(from) : (previous?.leftAt ?? ''),
    lostMoney: pending?.moneyLost ?? ended?.moneyLost ?? previous?.lostMoney ?? 0,
    items: bag
      ? bagSummary(bag).map((i) => ({
          name: tOr(
            contentKey('items', i.itemId, 'name'),
            view.itemDef(i.itemId)?.name ?? i.itemId,
          ),
          count: i.count,
        }))
      : (previous?.items ?? []),
    witnesses: pending?.witnessed ?? ended?.witnessed ?? previous?.witnesses ?? 0,
    remaining: pending
      ? Math.ceil(Math.max(0, pending.at - view.tick) / TICKS_PER_GAME_MINUTE) *
        TICKS_PER_GAME_MINUTE
      : 0,
    elapsed: pending?.revivalTicks ?? ended?.revivalTicks ?? previous?.elapsed ?? 0,
    returned: !pending && (!!ended || previous?.returned === true),
  };
}
