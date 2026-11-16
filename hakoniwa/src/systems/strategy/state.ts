// Strategy slice helpers: relations (directed scores), treaties, wars, truces, logging,
// ids and per-nation aggregates. Pure functions over the slice and content.

import type { ContentMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { type KeyText, type TextParam, tr } from '../../core/text';
import { estimatePower } from '../warfare/autoresolve';
import type {
  ArmyState,
  NationId,
  NationState,
  StrategySlice,
  Treaty,
  TreatyType,
  War,
} from './types';

export const PLAYER: NationId = 'player';
export const LOG_KEPT = 80;

export function strat(ctx: SystemContext): StrategySlice {
  return ctx.world.slices.strategy;
}

export function relKey(a: NationId, b: NationId): string {
  return `${a}>${b}`;
}

export function relation(s: StrategySlice, a: NationId, b: NationId): number {
  return s.relations[relKey(a, b)] ?? 0;
}

export function setRelation(s: StrategySlice, a: NationId, b: NationId, v: number): void {
  s.relations[relKey(a, b)] = Math.max(-100, Math.min(100, Math.round(v * 10) / 10));
}

export function shiftRelation(
  s: StrategySlice,
  a: NationId,
  b: NationId,
  delta: number,
  both = true,
): void {
  setRelation(s, a, b, relation(s, a, b) + delta);
  if (both) setRelation(s, b, a, relation(s, b, a) + delta);
}

export function band(score: number): KeyText {
  if (score <= -60) return tr('sys.strategy.band.hostile');
  if (score <= -20) return tr('sys.strategy.band.cold');
  if (score < 20) return tr('sys.strategy.band.neutral');
  if (score < 60) return tr('sys.strategy.band.friendly');
  return tr('sys.strategy.band.close');
}

export function treatiesBetween(s: StrategySlice, a: NationId, b: NationId): Treaty[] {
  return s.treaties.filter(
    (t) =>
      ((t.a === a && t.b === b) || (t.a === b && t.b === a)) &&
      (t.endDay === undefined || t.endDay > s.day),
  );
}

export function hasTreaty(s: StrategySlice, a: NationId, b: NationId, type: TreatyType): boolean {
  return treatiesBetween(s, a, b).some((t) => t.type === type);
}

export function addTreaty(
  s: StrategySlice,
  a: NationId,
  b: NationId,
  type: TreatyType,
  note?: TextParam,
): Treaty {
  const existing = treatiesBetween(s, a, b).find((t) => t.type === type);
  if (existing) return existing;
  const t: Treaty = { id: newId(s, 'treaty'), type, a, b, startDay: s.day, note };
  s.treaties.push(t);
  return t;
}

export function removeTreaties(
  s: StrategySlice,
  a: NationId,
  b: NationId,
  type?: TreatyType,
): Treaty[] {
  const gone: Treaty[] = [];
  s.treaties = s.treaties.filter((t) => {
    const pair = (t.a === a && t.b === b) || (t.a === b && t.b === a);
    if (pair && (!type || t.type === type)) {
      gone.push(t);
      return false;
    }
    return true;
  });
  return gone;
}

export function allies(s: StrategySlice, n: NationId): NationId[] {
  const out: NationId[] = [];
  for (const t of s.treaties) {
    if (t.type !== 'alliance' || (t.endDay !== undefined && t.endDay <= s.day)) continue;
    if (t.a === n) out.push(t.b);
    else if (t.b === n) out.push(t.a);
  }
  return out;
}

export function warBetween(s: StrategySlice, a: NationId, b: NationId): War | undefined {
  return s.wars.find(
    (w) =>
      (w.attackers.includes(a) && w.defenders.includes(b)) ||
      (w.attackers.includes(b) && w.defenders.includes(a)),
  );
}

export function atWar(s: StrategySlice, a: NationId, b: NationId): boolean {
  return !!warBetween(s, a, b);
}

export function atAnyWar(s: StrategySlice, n: NationId): boolean {
  return s.wars.some((w) => w.attackers.includes(n) || w.defenders.includes(n));
}

export function enemiesOf(s: StrategySlice, n: NationId): NationId[] {
  const out = new Set<NationId>();
  for (const w of s.wars) {
    if (w.attackers.includes(n)) for (const d of w.defenders) out.add(d);
    if (w.defenders.includes(n)) for (const a of w.attackers) out.add(a);
  }
  return [...out].sort();
}

/** D-049: no war on the same nation before the act changes and at least one season passes. */
export function inTruce(s: StrategySlice, a: NationId, b: NationId, act: string): boolean {
  return s.truces.some(
    (t) =>
      ((t.a === a && t.b === b) || (t.a === b && t.b === a)) &&
      (s.day < t.untilDay || t.act === act),
  );
}

export function newId(s: StrategySlice, prefix: string): string {
  s.nextId += 1;
  return `${prefix}${s.nextId}`;
}

export function log(s: StrategySlice, text: TextParam): void {
  s.log.push({ day: s.day, text });
  if (s.log.length > LOG_KEPT) s.log.splice(0, s.log.length - LOG_KEPT);
}

export function aliveNations(s: StrategySlice): NationState[] {
  return Object.keys(s.nations)
    .sort()
    .map((k) => s.nations[k] as NationState)
    .filter((n) => n.alive);
}

export function provincesOf(s: StrategySlice, n: NationId): string[] {
  return Object.keys(s.provinces)
    .sort()
    .filter((k) => s.provinces[k]?.owner === n);
}

export function populationOf(s: StrategySlice, n: NationId): number {
  let p = 0;
  for (const k of provincesOf(s, n)) p += s.provinces[k]?.population ?? 0;
  return p;
}

export function armiesOf(s: StrategySlice, n: NationId): ArmyState[] {
  return Object.keys(s.armies)
    .sort()
    .map((k) => s.armies[k] as ArmyState)
    .filter((a) => a.owner === n);
}

export function soldiersOf(a: ArmyState): number {
  return a.regiments.reduce((sum, r) => sum + r.count, 0);
}

export function armyPower(content: ContentMap, a: ArmyState): number {
  return estimatePower(content.regiment_types ?? [], a.regiments);
}

/** Field armies plus a militia-equivalent of the garrisons. */
export function nationPower(content: ContentMap, s: StrategySlice, n: NationId): number {
  let p = 0;
  for (const a of armiesOf(s, n)) p += armyPower(content, a);
  let garrison = 0;
  for (const k of provincesOf(s, n)) garrison += s.provinces[k]?.garrison ?? 0;
  p += estimatePower(content.regiment_types ?? [], [{ typeId: 'militia', count: garrison }]);
  return p;
}

/** Display name of a nation: the content name, or a text key for the unowned land. */
export function nationName(
  content: ContentMap,
  s: StrategySlice,
  n: NationId | null,
): string | KeyText {
  if (!n) return tr('sys.strategy.nation.unowned');
  if (n === PLAYER)
    return (
      s.playerNationName ??
      content.slg_config?.playerNation.name ??
      tr('sys.strategy.nation.player_default')
    );
  return content.slg_nations?.find((x) => x.id === n)?.name ?? n;
}
