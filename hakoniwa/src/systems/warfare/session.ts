// Engine glue for battles: resolve a scenario or registered setup, open the battle with
// a seed from the warfare stream, file general.order AI requests, and close the battle
// (events, result flags, bounded history).

import { systemSource } from '../../core';
import type { AiContextV1 } from '../../core/ai_port';
import type { SystemContext } from '../../core/system';
import { applyModifiers } from '../modifiers';
import { playerEntity } from '../world';
import { chooseUtilityPlan, PLAN_NAMES } from './ai';
import { summarize } from './autoresolve';
import { kernelData } from './data';
import { createBattleState } from './kernel';
import type {
  BattleResultRecord,
  BattleSetup,
  BattleState,
  PlanId,
  Team,
  WarfareSlice,
} from './types';

export const RESULTS_KEPT = 20;
export const PLAN_REQUEST_EVERY = 300; // kernel steps = 60 battle seconds

const SCALE_TIER: Record<string, number> = { squad: 2, company: 3, legion: 4, coalition: 5 };

export function warfare(ctx: SystemContext): WarfareSlice {
  return ctx.world.slices.warfare;
}

export function dataOf(ctx: SystemContext) {
  return kernelData(ctx.content.regiment_types ?? [], ctx.content.hero_abilities ?? []);
}

export function resolveSetup(ctx: SystemContext, scenarioId: string): BattleSetup | undefined {
  return (
    ctx.content.battle_scenarios?.find((s) => s.id === scenarioId) ??
    warfare(ctx).custom[scenarioId]
  );
}

export function playerLevel(ctx: SystemContext): number {
  const p = playerEntity(ctx.world);
  const tag = p?.tags.find((t) => t.startsWith('lvl:'));
  const n = tag ? Number(tag.slice(4)) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : 10;
}

export function beginBattle(
  ctx: SystemContext,
  scenarioId: string,
  setup: BattleSetup,
  mode: 'manual' | 'auto',
): BattleState {
  const slice = warfare(ctx);
  slice.nextBattle += 1;
  const battle = createBattleState(setup, {
    id: `battle${slice.nextBattle}`,
    scenarioId,
    seed: ctx.rng('warfare.battle').int(1, 0x7fffffff),
    data: dataOf(ctx),
    mode,
    flags: ctx.world.meta.flags,
    playerLevel: playerLevel(ctx),
    moraleBonus: {
      player: applyModifiers(ctx.world, 'morale', 'player', 0),
      enemy: applyModifiers(ctx.world, 'morale', scenarioId, 0),
    },
  });
  slice.battle = battle;
  slice.last = null;
  ctx.emit('war.battle_started', { battleId: battle.id, scenario: scenarioId, mode });
  if (mode === 'manual') requestPlans(ctx, battle);
  return battle;
}

function planContext(
  battle: BattleState,
  team: Team,
  generalName: string,
  plan: PlanId,
): AiContextV1 {
  const mine = battle.regiments.filter((r) => r.team === team && r.state !== 'gone');
  const theirs = battle.regiments.filter((r) => r.team !== team && r.state !== 'gone');
  const plans = Object.entries(PLAN_NAMES)
    .map(([id, name]) => `${id}（${name}）`)
    .join('、');
  return {
    v: 1,
    persona: `${generalName}，指挥${team === 'enemy' ? '敌方' : '友军'}的将领`,
    situation: `${battle.name}，战斗第 ${Math.round(battle.time)} 秒。我方 ${mine.length} 个兵团共 ${mine.reduce((s, r) => s + r.count, 0)} 人，对面 ${theirs.length} 个兵团共 ${theirs.reduce((s, r) => s + r.count, 0)} 人。当前方案：${PLAN_NAMES[plan]}。`,
    goals: battle.objectives.filter((o) => o.team === team).map((o) => o.label),
    commands: {
      'war.general_plan': `从作战方案菜单中选择一个：${plans}。数据字段 battleId、team、generalId、planId、revision 原样填写，只改 planId。`,
    },
    speakAs: generalName,
  };
}

/** File one general.order request per team that has a named AI general. */
export function requestPlans(ctx: SystemContext, battle: BattleState): void {
  const data = dataOf(ctx);
  for (const team of ['enemy', 'player'] as Team[]) {
    const general = battle.generals[team];
    if (!general) continue;
    if (
      team === 'player' &&
      !battle.regiments.some((r) => r.team === 'player' && r.controller === 'ai')
    )
      continue;
    const planId = chooseUtilityPlan(battle, team, data);
    const cmd = {
      battleId: battle.id,
      team,
      generalId: general.id,
      planId,
      revision: battle.revision,
    };
    ctx.ai.request({
      agentId: general.id,
      role: 'general.order',
      purpose: 'battle_plan',
      revision: battle.revision,
      context: planContext(battle, team, general.name, battle.plans[team]?.planId ?? planId),
      allowed: ['war.general_plan'],
      fallback: [{ kind: 'war.general_plan', data: cmd, source: systemSource('warfare') }],
      deadlineTicks: 60,
      priority: 2,
    });
  }
}

export function emitFlashes(ctx: SystemContext, battle: BattleState): void {
  for (const f of battle.flashes ?? []) {
    if (f.kind === 'rout') {
      ctx.emit('war.regiment_routed', { battleId: battle.id, regimentId: f.id, team: f.team });
    } else if (f.kind === 'ability' && f.abilityId) {
      ctx.emit('war.hero_ability_used', {
        battleId: battle.id,
        heroId: f.id,
        abilityId: f.abilityId,
        targetId: f.targetId,
        felled: f.felled ?? 0,
      });
    }
  }
  battle.flashes = [];
}

export function finishBattle(ctx: SystemContext): BattleResultRecord | undefined {
  const slice = warfare(ctx);
  const battle = slice.battle;
  if (!battle) return undefined;
  if (!battle.outcome) battle.outcome = { victor: 'draw', reason: '战斗中止' };
  const sum = summarize(battle);
  const record: BattleResultRecord = {
    battleId: battle.id,
    scenarioId: battle.scenarioId,
    victor: sum.victor,
    reason: sum.reason,
    seconds: sum.seconds,
    tick: ctx.tick,
    casualties: {
      player: sum.teams.player.start - sum.teams.player.end,
      enemy: sum.teams.enemy.start - sum.teams.enemy.end,
    },
    regiments: battle.regiments.map((r) => ({
      id: r.id,
      typeId: r.typeId,
      team: r.team,
      start: r.maxCount,
      end: r.count,
    })),
  };
  slice.results.push(record);
  if (slice.results.length > RESULTS_KEPT)
    slice.results.splice(0, slice.results.length - RESULTS_KEPT);
  slice.battle = null;
  slice.last = battle;
  delete slice.custom[battle.scenarioId];

  ctx.emit('battle.ended', {
    battleId: battle.id,
    victor: record.victor,
    scenario: battle.scenarioId,
  });
  ctx.emit('war.battle_report', {
    battleId: battle.id,
    scenario: battle.scenarioId,
    victor: record.victor,
    reason: record.reason,
    seconds: record.seconds,
    casualties: record.casualties,
    regiments: record.regiments,
  });
  const result = record.victor === 'player' ? 'win' : record.victor === 'enemy' ? 'lose' : 'draw';
  ctx.setFlag(`war.${battle.scenarioId}.result`, result);
  if (ctx.flag('war.pending') === battle.scenarioId) ctx.setFlag('war.pending', '');
  if (result === 'win') {
    if (!ctx.flag('war.first_battle_won')) ctx.setFlag('war.first_battle_won', true);
    const p = playerEntity(ctx.world);
    const scenario = ctx.content.battle_scenarios?.find((s) => s.id === battle.scenarioId);
    if (p) {
      ctx.emit('feat.performed', {
        actorId: p.id,
        kind: 'battle',
        tier: SCALE_TIER[scenario?.scale ?? 'squad'] ?? 2,
        mapId: p.mapId,
        x: p.x,
        y: p.y,
        note: battle.name,
      });
    }
  }
  return record;
}
