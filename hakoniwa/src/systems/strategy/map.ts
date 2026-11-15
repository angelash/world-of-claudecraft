// The continent graph: adjacency from `slg_links`, march-day routing with entry rules
// (own, allied, unowned, enemy at war, or passage treaty) and the seasonal march factor.

import type { ContentMap } from '../../core/contracts';
import { calendarAt } from '../../core/time';
import { allies, atWar, hasTreaty } from './state';
import type { NationId, ProvinceDef, ProvinceLink, StrategySlice } from './types';

const adjCache = new WeakMap<ProvinceLink[], Map<string, { to: string; days: number }[]>>();

export function adjacency(content: ContentMap): Map<string, { to: string; days: number }[]> {
  const links = content.slg_links ?? [];
  let m = adjCache.get(links);
  if (m) return m;
  m = new Map();
  for (const l of links) {
    if (!m.has(l.a)) m.set(l.a, []);
    if (!m.has(l.b)) m.set(l.b, []);
    m.get(l.a)?.push({ to: l.b, days: l.days });
    m.get(l.b)?.push({ to: l.a, days: l.days });
  }
  for (const list of m.values()) list.sort((x, y) => x.to.localeCompare(y.to));
  adjCache.set(links, m);
  return m;
}

export function neighbors(content: ContentMap, id: string): string[] {
  return (adjacency(content).get(id) ?? []).map((x) => x.to);
}

export function linkDays(content: ContentMap, a: string, b: string): number {
  return (
    adjacency(content)
      .get(a)
      ?.find((x) => x.to === b)?.days ?? Number.POSITIVE_INFINITY
  );
}

export function provinceDef(content: ContentMap, id: string): ProvinceDef | undefined {
  return content.slg_provinces?.find((p) => p.id === id);
}

/** Whether an army of `owner` may enter province `id` now. */
export function canEnter(
  content: ContentMap,
  s: StrategySlice,
  owner: NationId,
  id: string,
): boolean {
  const def = provinceDef(content, id);
  if (!def || def.impassable) return false;
  const holder = s.provinces[id]?.controller ?? null;
  if (holder === null || holder === owner) return true;
  if (allies(s, owner).includes(holder)) return true;
  if (atWar(s, owner, holder)) return true;
  return hasTreaty(s, owner, holder, 'passage');
}

/** Cheapest route in march days (Dijkstra); excludes the start, includes the goal. */
export function findRoute(
  content: ContentMap,
  s: StrategySlice,
  owner: NationId,
  from: string,
  to: string,
): string[] | null {
  if (from === to) return [];
  if (!canEnter(content, s, owner, to)) return null;
  const adj = adjacency(content);
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const done = new Set<string>();
  for (;;) {
    let cur: string | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const [k, d] of dist) {
      if (!done.has(k) && (d < best || (d === best && cur !== undefined && k < cur))) {
        best = d;
        cur = k;
      }
    }
    if (cur === undefined) return null;
    if (cur === to) break;
    done.add(cur);
    for (const e of adj.get(cur) ?? []) {
      if (done.has(e.to)) continue;
      if (e.to !== to && !canEnter(content, s, owner, e.to)) continue;
      const nd = best + e.days;
      if (nd < (dist.get(e.to) ?? Number.POSITIVE_INFINITY)) {
        dist.set(e.to, nd);
        prev.set(e.to, cur);
      }
    }
  }
  const path: string[] = [];
  let k: string | undefined = to;
  while (k && k !== from) {
    path.push(k);
    k = prev.get(k);
  }
  return path.reverse();
}

/** March progress per day: spring mud, northern winter snow (grand_strategy_slg.md 1.4). */
export function marchFactor(tick: number, def: ProvinceDef | undefined): number {
  const season = calendarAt(tick).season;
  if (season === 0) return 0.8;
  if (season === 3) return def && def.y < 35 ? 0.6 : 0.9;
  return 1;
}
