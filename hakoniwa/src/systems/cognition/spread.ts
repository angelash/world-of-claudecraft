// Rumor channels beyond two people talking (reputation_and_cognition.md 4.2; builtin_ai.md
// 5.2): a door hint told as a rumor lands in the local rumor pool (thousand_doors.md 18.3,
// the 'rumor' channel), travellers carry a town's three hottest rumors to the neighbouring
// towns (two to four game days between Borderstone and Wallenburg), and an amplifier tells
// the whole place once a day. Every rumor stays anchored on a kernel event or a recorded
// telling; draws come from the named streams cognition.road and cognition.rumor.

import type { SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import { personaById } from '../npc/personas';
import type { NpcState } from '../npc/types';
import { mapById } from '../world';
import { addHolding, distort, findHolding, HEAT_FLOOR, receive, seedRumor } from './rumor';
import { HINT_TOPIC } from './rumor_text';
import type { RumorHolding } from './types';

export { HINT_TOPIC };

/** Daily chance that the road carries a town's news to a neighbour (2 to 4 days). */
export const ROAD_CHANCE = 0.6;
/**
 * Rumors travel once they are this old on their home map: a day and a half for the news to
 * reach the market and the carts to cover the road (Borderstone to Wallenburg in 2 to 4).
 */
export const ROAD_MIN_AGE = (3 * TICKS_PER_GAME_DAY) / 2;

/** Named people present on a map, the strongest spreaders first (ties by id). */
function spreaders(ctx: SystemContext, mapId: string): NpcState[] {
  const npcs = ctx.world.slices.npc.npcs;
  return Object.keys(npcs)
    .sort()
    .map((id) => npcs[id] as NpcState)
    .filter((st) => !st.resident && !st.gone && st.mapId === mapId)
    .sort((a, b) => {
      const sa = personaById(ctx.content, a.id)?.spread ?? 1;
      const sb = personaById(ctx.content, b.id)?.spread ?? 1;
      return sb - sa || (a.id < b.id ? -1 : 1);
    });
}

/**
 * A door hint by rumor (thousand_doors.md 18.3): the hint enters the pool of the player's
 * map as a rumor held by its two strongest spreaders, who tell it on like any other news.
 */
export function injectHint(ctx: SystemContext, text: TextParam, doorId: string): string | null {
  const mapId = ctx.world.slices.npc.playerMap;
  const holders = spreaders(ctx, mapId).slice(0, 2);
  if (!mapId || holders.length === 0) return null;
  const rumor = seedRumor(ctx, {
    anchor: `hint:${ctx.tick}:${doorId}`,
    topic: HINT_TOPIC,
    subject: 'stranger',
    mapId,
    place: mapById(ctx.content, mapId)?.name ?? tr('sys.cognition.place.wild'),
    apparent: 0,
    count: 1,
    details: [text],
    famous: [],
    tier: 2,
  });
  for (const st of holders) {
    addHolding(ctx.world.slices.cognition, st.id, {
      rumor: rumor.id,
      v: { ...rumor.truth, details: [...rumor.truth.details] },
      cred: 0.6,
      from: 'road',
      origin: `hint:${doorId}`,
      hops: 1,
      tick: ctx.tick,
      believed: true,
      told: 0,
    });
  }
  return rumor.id;
}

/** Maps a map's exits lead to (its neighbours on the road). */
function neighbours(ctx: SystemContext, mapId: string): string[] {
  const out = new Set<string>();
  for (const x of mapById(ctx.content, mapId)?.exits ?? []) out.add(x.toMap);
  return [...out].sort();
}

/**
 * Daily: travellers carry each town's three hottest rumors (a day old or more) to every
 * neighbouring town that has named people, half the time (reputation 4.2 "跨地区").
 * Neighbours with no named people pass the news on toward the next town.
 */
export function carryByRoad(ctx: SystemContext): void {
  const slice = ctx.world.slices.cognition;
  const npcs = ctx.world.slices.npc.npcs;
  const rng = ctx.rng('cognition.road');
  const byMap = new Map<string, { h: RumorHolding; holder: string }[]>();
  for (const holder of Object.keys(slice.holdings).sort()) {
    const st = npcs[holder];
    if (!st || st.resident || st.gone) continue;
    for (const h of slice.holdings[holder] ?? []) {
      const r = slice.rumors[h.rumor];
      if (!r || r.heat < 0.2 || ctx.tick - r.tick < ROAD_MIN_AGE) continue;
      const list = byMap.get(st.mapId) ?? [];
      if (!list.some((x) => x.h.rumor === h.rumor)) list.push({ h, holder });
      byMap.set(st.mapId, list);
    }
  }
  for (const mapId of [...byMap.keys()].sort()) {
    const hot = (byMap.get(mapId) ?? [])
      .sort(
        (a, b) =>
          (slice.rumors[b.h.rumor]?.heat ?? 0) - (slice.rumors[a.h.rumor]?.heat ?? 0) ||
          (a.h.rumor < b.h.rumor ? -1 : 1),
      )
      .slice(0, 3);
    for (const to of neighbours(ctx, mapId)) {
      const there = spreaders(ctx, to);
      // a town with no named people of its own (a wild map) sends it further along
      const dest =
        there.length > 0
          ? to
          : neighbours(ctx, to).find((m) => m !== mapId && spreaders(ctx, m).length > 0);
      if (!dest) continue;
      const listener = spreaders(ctx, dest)[0];
      if (!listener) continue;
      for (const { h, holder } of hot) {
        const r = slice.rumors[h.rumor];
        if (!r || r.heat < HEAT_FLOOR) continue;
        if (spreaders(ctx, dest).some((o) => findHolding(slice, o.id, r.id))) continue;
        if (!rng.chance(ROAD_CHANCE)) continue;
        const { v } = distort(ctx, rng, r, h.v, personaById(ctx.content, holder), h.hops + 2, dest);
        receive(
          ctx,
          listener.id,
          {
            rumor: r,
            v,
            cred: Math.round(h.cred * 0.6 * 1000) / 1000,
            origin: `road:${mapId}`,
            hops: h.hops + 2,
            fromId: `road:${mapId}`,
            fromName: tr('sys.cognition.teller.travellers'),
          },
          dest,
        );
      }
    }
  }
}

/**
 * An amplifier (a bard, a halfling, the town's loudest mouth) tells the hottest news to
 * everyone present at once (builtin_ai.md 5.2 "放大器人物每游戏日额外对场所内全部听众讲一次").
 * Returns how many listeners got it.
 */
export function broadcast(ctx: SystemContext, tellerId: string): number {
  const slice = ctx.world.slices.cognition;
  const npcs = ctx.world.slices.npc.npcs;
  const teller = npcs[tellerId];
  if (!teller) return 0;
  const best = [...(slice.holdings[tellerId] ?? [])]
    .filter((h) => (slice.rumors[h.rumor]?.heat ?? 0) >= HEAT_FLOOR)
    .sort(
      (a, b) =>
        (slice.rumors[b.rumor]?.heat ?? 0) * b.cred - (slice.rumors[a.rumor]?.heat ?? 0) * a.cred ||
        (a.rumor < b.rumor ? -1 : 1),
    )[0];
  const r = best ? slice.rumors[best.rumor] : undefined;
  if (!best || !r) return 0;
  const p = personaById(ctx.content, tellerId);
  let n = 0;
  for (const id of Object.keys(npcs).sort()) {
    const o = npcs[id] as NpcState;
    if (
      o === teller ||
      o.resident ||
      o.gone ||
      o.mapId !== teller.mapId ||
      o.locId !== teller.locId
    )
      continue;
    if (findHolding(slice, id, r.id)) continue;
    const { v } = distort(
      ctx,
      ctx.rng('cognition.rumor'),
      r,
      best.v,
      p,
      best.hops + 1,
      teller.mapId,
    );
    receive(
      ctx,
      id,
      {
        rumor: r,
        v,
        cred: Math.round(best.cred * 0.8 * (p?.reliability ?? 0.8) * 1000) / 1000,
        origin: best.origin,
        hops: best.hops + 1,
        fromId: tellerId,
        fromName: p?.name ?? tr('sys.cognition.teller.someone'),
      },
      teller.mapId,
    );
    n++;
  }
  if (n > 0) {
    best.told += n;
    r.tellings += n;
  }
  return n;
}
