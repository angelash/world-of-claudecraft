// Balance lab, battlefield: batch auto-resolve of a content scenario or a generated
// open-field battle (warfare autoResolve and buildFieldSetup), reporting win rate,
// casualties and duration over seeds. Pure: no DOM.

import type { ContentMap, FlagValue } from '../../core/contracts';
import { t as renderText } from '../../shared_ui/i18n';
import {
  type AutoResolveResult,
  autoResolve,
  type BattleSetup,
  type BattleTerrain,
  buildFieldSetup,
  type ForceSpec,
} from '../../systems/warfare';
import { mean, percentile, rate } from '../util/stats';

export type BattleSpec =
  | { kind: 'scenario'; scenarioId: string }
  | { kind: 'field'; player: ForceSpec; enemy: ForceSpec; terrain: BattleTerrain };

export interface BattleRunOptions {
  flags?: Record<string, FlagValue>;
  playerLevel?: number;
  maxSeconds?: number;
}

export function battleSetup(content: ContentMap, spec: BattleSpec): BattleSetup | null {
  if (spec.kind === 'scenario') {
    return content.battle_scenarios.find((s) => s.id === spec.scenarioId) ?? null;
  }
  return buildFieldSetup({
    name: 'lab_field',
    teams: { player: spec.player, enemy: spec.enemy },
    terrain: spec.terrain,
  });
}

export function runBattles(
  content: ContentMap,
  spec: BattleSpec,
  seeds: readonly number[],
  opts: BattleRunOptions = {},
): AutoResolveResult[] {
  const setup = battleSetup(content, spec);
  if (!setup) return [];
  return seeds.map((seed) =>
    autoResolve({
      setup,
      units: content.regiment_types,
      abilities: content.hero_abilities,
      seed,
      flags: opts.flags,
      playerLevel: opts.playerLevel,
      maxSeconds: opts.maxSeconds,
    }),
  );
}

/**
 * Parse a force written as "typeId x count" items separated by commas or new lines
 * (for example "militia x 40, archer x 20"), or as ForceSpec JSON.
 */
export function parseForce(
  text: string,
): { ok: true; force: ForceSpec } | { ok: false; error: string } {
  const t = text.trim();
  if (t.startsWith('{')) {
    try {
      const v = JSON.parse(t) as ForceSpec;
      if (!Array.isArray(v.regiments)) return { ok: false, error: 'regiments' };
      return { ok: true, force: v };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  const regiments: ForceSpec['regiments'] = [];
  for (const part of t.split(/[,，\n]/)) {
    const p = part.trim();
    if (!p) continue;
    const m = /^([A-Za-z_][\w.]*)\s*[xX*]\s*(\d+)$/.exec(p);
    if (!m) return { ok: false, error: p };
    regiments.push({ typeId: m[1] as string, count: Number(m[2]) });
  }
  if (regiments.length === 0) return { ok: false, error: t };
  return { ok: true, force: { regiments } };
}

export interface TeamCasualties {
  meanLossPct: number;
  p90LossPct: number;
}

export interface BattleSummary {
  runs: number;
  winRate: number;
  lossRate: number;
  drawRate: number;
  meanSeconds: number;
  player: TeamCasualties;
  enemy: TeamCasualties;
  /** runs in which at least one hero went down */
  heroesDownRate: number;
  /** most frequent outcome reasons */
  reasons: { reason: string; count: number }[];
}

function casualties(
  results: readonly AutoResolveResult[],
  team: 'player' | 'enemy',
): TeamCasualties {
  const losses = results.map((r) => {
    const t = r.teams[team];
    return t.start > 0 ? (t.start - t.end) / t.start : 0;
  });
  return { meanLossPct: mean(losses), p90LossPct: percentile(losses, 0.9) };
}

export function summarizeBattles(results: readonly AutoResolveResult[]): BattleSummary {
  const n = results.length;
  const reasons = new Map<string, number>();
  for (const r of results) {
    const reason = renderText(r.reason);
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  return {
    runs: n,
    winRate: rate(results.filter((r) => r.victor === 'player').length, n),
    lossRate: rate(results.filter((r) => r.victor === 'enemy').length, n),
    drawRate: rate(results.filter((r) => r.victor === 'draw').length, n),
    meanSeconds: mean(results.map((r) => r.seconds)),
    player: casualties(results, 'player'),
    enemy: casualties(results, 'enemy'),
    heroesDownRate: rate(results.filter((r) => r.heroesDown.length > 0).length, n),
    reasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}
