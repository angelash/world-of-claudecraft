// The autoplayer's judgement of quest objectives that hold a precondition the player can see
// (PK-M1-33; catalog_quests_acts1_3.md 1.8): a delivery needs the item in the pack, and a
// persuasion only works once the kernel's threshold (evidence and relation, quests_and_
// events.md 5) holds. Talking to the person before that only idles, so: a missing item is
// bought where a market of a reachable map sells it, otherwise the objective is left alone;
// a persuasion below its threshold is left alone until the world changes. The answer is
// undefined when the objective has no such precondition (the player's usual handling).

import type { CommandKind, CommandMap, ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { countItem, holdingOf } from '../../systems/inventory';
import type { Objective } from '../../systems/quests/types';

/** What the gate needs of the autoplayer (a narrow view of Autoplayer). */
export interface GateHost {
  readonly world: World;
  readonly content: ContentMap;
  intent: { what: string };
  holds(cond: string | undefined): boolean;
  talk(npc: string, option: string | undefined, why: string): number;
  send(cmd: { [K in CommandKind]: { kind: K; data: CommandMap[K] } }[CommandKind]): void;
  nearestMerchant(mapId: string): string | null;
  recentlyRejected(kind: string, ticks: number): boolean;
}

/** Ticks a refused purchase keeps the bot from trying the shop again. */
export const SHOP_RETRY = 2400;

/** An open market that stocks the item: its id and the first map its merchants trade on. */
export function marketFor(
  content: ContentMap,
  world: World,
  itemId: string,
): { marketId: string; mapId: string } | null {
  const flags = world.meta.flags;
  for (const m of content.markets ?? []) {
    const mapId = m.mapIds[0];
    if (!mapId || !m.goods.some((g) => g.itemId === itemId)) continue;
    if (m.requiresFlags?.some((f) => !flags[f])) continue;
    const stock = world.slices.economy?.markets?.[m.id]?.goods?.[itemId]?.stock;
    if (stock !== undefined && stock <= 0) continue;
    return { marketId: m.id, mapId };
  }
  return null;
}

/**
 * A gated objective's next step: ticks to step, null when it is not actionable now (leave it,
 * do something else), or undefined when the objective has no gate (the usual handling).
 */
export function gatedObjective(
  bot: GateHost,
  o: Objective,
  why: string,
): number | null | undefined {
  switch (o.type) {
    case 'persuade':
      // the kernel judges the attempt by evidence and relation: below them it only idles
      if (bot.holds(o.when)) return undefined;
      bot.intent = { what: `${why}: not persuadable yet` };
      return null;
    case 'deliver': {
      const pid = bot.world.slices.world.playerId;
      const need = o.count ?? 1;
      const have = countItem(bot.world, pid, o.item);
      if (have >= need) return undefined;
      return shopFor(bot, o.item, need - have, why);
    }
    default:
      return undefined;
  }
}

/** Buy what a delivery lacks at a market that stocks it; null when none can be had. */
function shopFor(bot: GateHost, itemId: string, qty: number, why: string): number | null {
  const market = marketFor(bot.content, bot.world, itemId);
  if (!market || bot.recentlyRejected('economy.buy', SHOP_RETRY)) {
    bot.intent = { what: `${why}: no ${itemId} to be had` };
    return null;
  }
  const pack = holdingOf(bot.world, bot.world.slices.world.playerId);
  if (pack.money <= 0) {
    bot.intent = { what: `${why}: no money for ${itemId}` };
    return null;
  }
  const session = bot.world.slices.economy?.session;
  if (session) {
    bot.intent = { what: `${why}: buy ${qty} ${itemId}` };
    if (session.marketId === market.marketId)
      bot.send({ kind: 'economy.buy', data: { itemId, qty } });
    bot.send({ kind: 'economy.close_trade', data: {} });
    return 2;
  }
  const merchant = bot.nearestMerchant(market.mapId);
  if (!merchant) {
    bot.intent = { what: `${why}: no merchant for ${itemId}` };
    return null;
  }
  return bot.talk(merchant, 'economy:trade', `${why}: shop for ${itemId}`);
}
