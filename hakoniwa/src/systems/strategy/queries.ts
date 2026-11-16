// Read-only views of the continent for the client and the editor: the map with owners
// and armies, one nation's state, and the diplomatic table.

import type { ContentMap } from '../../core/contracts';
import { type KeyText, type TextParam, tr } from '../../core/text';
import { resultName, stageName } from './conclave';
import { provinceDef } from './map';
import {
  aliveNations,
  armiesOf,
  atWar,
  band,
  enemiesOf,
  inTruce,
  nationName,
  nationPower,
  PLAYER,
  populationOf,
  provincesOf,
  relation,
  soldiersOf,
  treatiesBetween,
} from './state';
import type {
  ConclaveStage,
  NationId,
  ProvinceTerrain,
  StrategyLogEntry,
  StrategySlice,
  SummitResult,
  TreatyType,
} from './types';

type WorldWithStrategy = {
  slices: { strategy: StrategySlice };
  meta: { flags: Record<string, unknown> };
};

export interface ContinentView {
  day: number;
  active: boolean;
  releaseIndex: number;
  provinces: {
    id: string;
    name: string;
    region: string;
    terrain: ProvinceTerrain;
    owner: NationId | null;
    ownerName: string | KeyText;
    color: string;
    population: number;
    garrison: number;
    dian: number;
    x: number;
    y: number;
    impassable: boolean;
    capitalOf?: NationId;
    siege: { by: NationId; byName: string | KeyText; progress: number } | null;
    armies: string[];
  }[];
  links: { a: string; b: string; days: number; kind?: string }[];
  armies: {
    id: string;
    owner: NationId;
    ownerName: string | KeyText;
    name: TextParam;
    province: string;
    soldiers: number;
    general?: string;
    path: string[];
    frozen: boolean;
  }[];
  wars: {
    id: string;
    attackers: NationId[];
    defenders: NationId[];
    score: number;
    startDay: number;
  }[];
  conference: { stage: ConclaveStage; stageName: string | KeyText; endsDay: number } | null;
  summit: { result: SummitResult; name: string | KeyText } | null;
  pendingBattle: { scenarioId: string; province: string } | null;
  log: StrategyLogEntry[];
}

function colorOf(content: ContentMap, id: NationId | null): string {
  if (!id) return '#7a7a7a';
  if (id === PLAYER) return content.slg_config?.playerNation.color ?? '#d8d0c0';
  return content.slg_nations?.find((n) => n.id === id)?.color ?? '#999999';
}

export function continentView(world: WorldWithStrategy, content: ContentMap): ContinentView {
  const s = world.slices.strategy;
  const armyIds = new Map<string, string[]>();
  for (const a of Object.values(s.armies)) {
    const list = armyIds.get(a.province) ?? [];
    list.push(a.id);
    armyIds.set(a.province, list.sort());
  }
  return {
    day: s.day,
    active: s.active,
    releaseIndex: s.releaseIndex,
    provinces: (content.slg_provinces ?? []).map((d) => {
      const p = s.provinces[d.id];
      const owner = p?.owner ?? null;
      return {
        id: d.id,
        name: d.name,
        region: d.region,
        terrain: d.terrain,
        owner,
        ownerName: nationName(content, s, owner),
        color: colorOf(content, owner),
        population: p?.population ?? d.population,
        garrison: p?.garrison ?? d.garrison,
        dian: d.dian,
        x: d.x,
        y: d.y,
        impassable: !!d.impassable,
        capitalOf: d.capitalOf,
        siege: p?.siege
          ? {
              by: p.siege.by,
              byName: nationName(content, s, p.siege.by),
              progress: Math.round(p.siege.progress),
            }
          : null,
        armies: armyIds.get(d.id) ?? [],
      };
    }),
    links: (content.slg_links ?? []).map((l) => ({ a: l.a, b: l.b, days: l.days, kind: l.kind })),
    armies: Object.keys(s.armies)
      .sort()
      .map((k) => {
        const a = s.armies[k];
        if (!a) throw new Error('army vanished');
        return {
          id: a.id,
          owner: a.owner,
          ownerName: nationName(content, s, a.owner),
          name: a.name,
          province: a.province,
          soldiers: soldiersOf(a),
          general: a.general,
          path: [...a.path],
          frozen: !!a.frozen,
        };
      }),
    wars: s.wars.map((w) => ({
      id: w.id,
      attackers: w.attackers,
      defenders: w.defenders,
      score: w.score,
      startDay: w.startDay,
    })),
    conference: s.conference
      ? {
          stage: s.conference.stage,
          stageName: stageName(s.conference.stage),
          endsDay: s.conference.stageEndsDay,
        }
      : null,
    summit: s.summit ? { result: s.summit, name: resultName(s.summit) } : null,
    pendingBattle: s.pendingBattle
      ? { scenarioId: s.pendingBattle.scenarioId, province: s.pendingBattle.province }
      : null,
    log: s.log.slice(-20),
  };
}

export interface NationView {
  id: NationId;
  name: string | KeyText;
  ruler: string | KeyText;
  capital: string;
  alive: boolean;
  treasury: number;
  income: number;
  upkeep: number;
  taxRate: number;
  stability: number;
  legitimacy: number;
  warWeariness: number;
  autonomy: number;
  divineReliance: number;
  credibility: number;
  population: number;
  provinces: { id: string; name: string }[];
  armies: { id: string; name: TextParam; province: string; soldiers: number }[];
  soldiers: number;
  power: number;
  enemies: NationId[];
  recognizedBy: NationId[];
  /** aggressive expansion other nations feel toward this one */
  aeAgainst: { nation: NationId; value: number }[];
}

export function nationView(
  world: WorldWithStrategy,
  content: ContentMap,
  id: NationId,
): NationView | null {
  const s = world.slices.strategy;
  const n = s.nations[id];
  if (!n) return null;
  const def = content.slg_nations?.find((x) => x.id === id);
  const capital =
    id === PLAYER ? (content.slg_config?.playerNation.capital ?? '') : (def?.capital ?? '');
  const armies = armiesOf(s, id);
  return {
    id,
    name: nationName(content, s, id),
    ruler: id === PLAYER ? tr('sys.strategy.name.you') : (def?.ruler.name ?? ''),
    capital,
    alive: n.alive,
    treasury: Math.round(n.treasury),
    income: n.incomeToday,
    upkeep: n.upkeepToday,
    taxRate: n.taxRate,
    stability: Math.round(n.stability),
    legitimacy: Math.round(n.legitimacy),
    warWeariness: Math.round(n.warWeariness),
    autonomy: Math.round(
      id === PLAYER ? Number(world.meta.flags.autonomy ?? n.autonomy) : n.autonomy,
    ),
    divineReliance: Math.round(n.divineReliance),
    credibility: Math.round(n.credibility),
    population: populationOf(s, id),
    provinces: provincesOf(s, id).map((p) => ({ id: p, name: provinceDef(content, p)?.name ?? p })),
    armies: armies.map((a) => ({
      id: a.id,
      name: a.name,
      province: a.province,
      soldiers: soldiersOf(a),
    })),
    soldiers: armies.reduce((t, a) => t + soldiersOf(a), 0),
    power: Math.round(nationPower(content, s, id)),
    enemies: enemiesOf(s, id),
    recognizedBy: [...n.recognizedBy],
    aeAgainst: Object.values(s.nations)
      .filter((o) => o.id !== id && (o.ae[id] ?? 0) > 0)
      .map((o) => ({ nation: o.id, value: Math.round(o.ae[id] ?? 0) })),
  };
}

export interface DiplomacyRow {
  nation: NationId;
  name: string | KeyText;
  /** our score toward them, and theirs toward us */
  scoreTo: number;
  scoreFrom: number;
  band: string | KeyText;
  treaties: TreatyType[];
  atWar: boolean;
  truce: boolean;
  /** AE they feel toward us (explicit early warning, 4.5) */
  aeTowardUs: number;
}

export function diplomacyView(
  world: WorldWithStrategy,
  content: ContentMap,
  id: NationId = PLAYER,
): DiplomacyRow[] {
  const s = world.slices.strategy;
  const act = String(world.meta.flags.act ?? '');
  return aliveNations(s)
    .filter((n) => n.id !== id)
    .map((n) => {
      const from = relation(s, n.id, id);
      return {
        nation: n.id,
        name: nationName(content, s, n.id),
        scoreTo: Math.round(relation(s, id, n.id)),
        scoreFrom: Math.round(from),
        band: band(from),
        treaties: treatiesBetween(s, id, n.id).map((t) => t.type),
        atWar: atWar(s, id, n.id),
        truce: inTruce(s, id, n.id, act),
        aeTowardUs: Math.round(n.ae[id] ?? 0),
      };
    });
}
