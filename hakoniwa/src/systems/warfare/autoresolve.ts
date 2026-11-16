// Auto-resolve (warfare_rts.md 2.4): the same kernel and seed as a manual battle, run
// synchronously with the rule AI driving both teams. Also the generated field battle
// used by strategy and city, and the C-layer power estimate (2.5).

import { type TextParam, tr } from '../../core/text';
import { QUALITY_COEF, soldierDps, soldierEhp } from './combat_math';
import { kernelData } from './data';
import { createBattleState, STEP_SECONDS, stepBattle } from './kernel';
import type {
  AutoResolveInput,
  AutoResolveResult,
  BattleSetup,
  BattleState,
  BattleTerrain,
  ForceSpec,
  RegimentSpec,
  Team,
  UnitTypeDef,
} from './types';

export const DEFAULT_MAX_SECONDS = 1800;

export function summarize(state: BattleState): AutoResolveResult {
  const teams = {} as AutoResolveResult['teams'];
  for (const team of ['player', 'enemy'] as Team[]) {
    const regs = state.regiments.filter((r) => r.team === team);
    teams[team] = {
      start: regs.reduce((s, r) => s + r.maxCount, 0),
      end: regs.reduce((s, r) => s + r.count, 0),
      regiments: regs.map((r) => ({ id: r.id, typeId: r.typeId, start: r.maxCount, end: r.count })),
    };
  }
  return {
    victor: state.outcome?.victor ?? 'draw',
    reason: state.outcome?.reason ?? tr('sys.warfare.outcome.undecided'),
    seconds: state.time,
    teams,
    heroesDown: state.heroes.filter((h) => h.down).map((h) => h.id),
  };
}

/** Run a battle to completion without rendering. Deterministic for the same input. */
export function autoResolve(input: AutoResolveInput): AutoResolveResult {
  const data = kernelData(input.units, input.abilities);
  const state = createBattleState(input.setup, {
    id: 'auto',
    // a throwaway state: the id only labels it (generated field names are TextRefs)
    scenarioId: typeof input.setup.name === 'string' ? input.setup.name : 'field',
    seed: input.seed,
    data,
    mode: 'auto',
    flags: input.flags,
    playerLevel: input.playerLevel,
  });
  runToEnd(state, data, input.maxSeconds);
  return summarize(state);
}

/** Step until an outcome; the time limit inside the state always ends it. */
export function runToEnd(
  state: BattleState,
  data: ReturnType<typeof kernelData>,
  maxSeconds = DEFAULT_MAX_SECONDS,
): void {
  const limit = Math.min(state.timeLimit, maxSeconds);
  if (limit < state.timeLimit) state.timeLimit = limit;
  const maxSteps = Math.ceil(limit / STEP_SECONDS) + 2;
  let guard = 0;
  while (!state.outcome && guard++ < maxSteps + 10) stepBattle(state, data);
  if (!state.outcome)
    state.outcome = { victor: 'draw', reason: tr('sys.warfare.outcome.time_up_draw') };
}

export interface FieldOptions {
  name: TextParam;
  teams: Record<Team, ForceSpec>;
  terrain?: BattleTerrain;
  width?: number;
  height?: number;
  timeLimit?: number;
}

const TERRAIN_CHAR: Record<BattleTerrain, string> = {
  plain: '.',
  road: '=',
  forest: 'T',
  hill: '^',
  ford: '~',
  water: 'W',
  wall: '#',
  swamp: 'S',
  snow: '*',
  dian: ':',
  building: 'B',
};

function deploy(force: ForceSpec, team: Team, width: number, height: number): RegimentSpec[] {
  const n = force.regiments.length;
  const out: RegimentSpec[] = [];
  force.regiments.forEach((r, i) => {
    const col = Math.floor(i / 6);
    const row = i % 6;
    const perCol = Math.min(6, n - col * 6);
    const gap = height / (perCol + 1);
    const depth = 3 + col * 2.5;
    const x = team === 'player' ? depth : width - depth;
    out.push({
      id: r.id ?? `${team === 'player' ? 'a' : 'b'}${i + 1}`,
      typeId: r.typeId,
      count: Math.max(1, Math.round(r.count)),
      x: Math.max(1, Math.min(width - 1, x)),
      y: gap * (row + 1),
      general: r.general,
      controller: 'ai',
    });
  });
  return out;
}

/** A generated open-field battle: team player deploys left, enemy right, both seek to annihilate. */
export function buildFieldSetup(opts: FieldOptions): BattleSetup {
  const width = opts.width ?? 32;
  const height = opts.height ?? 20;
  const terrain = opts.terrain ?? 'plain';
  const ch = TERRAIN_CHAR[terrain];
  const passableFill =
    terrain === 'water' || terrain === 'wall' || terrain === 'building' ? '.' : ch;
  const rows = Array.from({ length: height }, () => passableFill.repeat(width));
  return {
    name: opts.name,
    width,
    height,
    rows,
    legend: { [passableFill]: passableFill === '.' ? 'plain' : terrain },
    teams: {
      player: {
        regiments: deploy(opts.teams.player, 'player', width, height),
        heroes: (opts.teams.player.heroes ?? []).map((h) => ({ ...h, controller: 'ai' })),
        retreat: { x: 0.5, y: height / 2 },
      },
      enemy: {
        regiments: deploy(opts.teams.enemy, 'enemy', width, height),
        heroes: (opts.teams.enemy.heroes ?? []).map((h) => ({ ...h, controller: 'ai' })),
        retreat: { x: width - 0.5, y: height / 2 },
      },
    },
    objectives: [
      {
        id: 'player_annihilate',
        team: 'player',
        kind: 'annihilate',
        label: tr('sys.warfare.objective.annihilate'),
      },
      {
        id: 'enemy_annihilate',
        team: 'enemy',
        kind: 'annihilate',
        label: tr('sys.warfare.objective.annihilate'),
      },
    ],
    timeLimit: opts.timeLimit ?? 600,
  };
}

/** C-layer regiment power: count x sqrt(dps x effective hp) x quality coefficient. */
export function estimatePower(
  units: UnitTypeDef[],
  regiments: { typeId: string; count: number }[],
): number {
  const byId = kernelData(units).units;
  let p = 0;
  for (const r of regiments) {
    const u = byId.get(r.typeId);
    if (!u || r.count <= 0) continue;
    p += r.count * Math.sqrt(soldierDps(u) * soldierEhp(u)) * QUALITY_COEF[u.quality];
  }
  return Math.round(p * 10) / 10;
}
