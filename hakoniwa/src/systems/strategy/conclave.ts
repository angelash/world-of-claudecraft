// The seven-nation conclave at the Sleepscale (grand_strategy_slg.md 8.1, act 4 section 9):
// a staged state machine with deadlines (invite, talks, summit, signing). At signing each
// power's stance toward the player decides the summit result, which is written as flags.

import type { SystemContext } from '../../core/system';
import { declareWar } from './diplomacy';
import {
  addTreaty,
  aliveNations,
  hasTreaty,
  log,
  PLAYER,
  relation,
  shiftRelation,
  strat,
} from './state';
import type { ConclaveStage, NationId, NationRole, SummitResult } from './types';

/** The nation that holds a conclave role (NationDef.roles); undefined when none does. */
export function nationByRole(ctx: SystemContext, role: NationRole): NationId | undefined {
  return ctx.content.slg_nations?.find((n) => n.roles?.includes(role))?.id;
}

const DEFAULT_STAGES: { stage: ConclaveStage; days: number }[] = [
  { stage: 'invite', days: 3 },
  { stage: 'talks', days: 5 },
  { stage: 'summit', days: 2 },
  { stage: 'signing', days: 1 },
];

export const STAGE_NAME: Record<ConclaveStage, string> = {
  invite: '邀请',
  talks: '游说',
  summit: '会盟',
  signing: '签署',
  done: '结束',
};

export const RESULT_NAME: Record<SummitResult, string> = {
  alliance: '眠鳞同盟',
  divided: '分化（眠鳞公约）',
  crusade: '圣战联军',
  broken: '破裂',
};

function stages(ctx: SystemContext) {
  return ctx.content.slg_config?.conclaveStages ?? DEFAULT_STAGES;
}

export function startConclave(ctx: SystemContext): boolean {
  const s = strat(ctx);
  if (s.conference || s.summit) return false;
  const first = stages(ctx)[0] ?? { stage: 'invite' as ConclaveStage, days: 3 };
  s.conference = {
    stage: first.stage,
    stageEndsDay: s.day + first.days,
    startDay: s.day,
    stances: {},
  };
  log(s, '七国会盟的邀请送往各国');
  return true;
}

/** Stance of an AI power toward the player at the summit. */
export function stanceToward(ctx: SystemContext, id: NationId): number {
  const s = strat(ctx);
  let v = relation(s, id, PLAYER);
  if (hasTreaty(s, id, PLAYER, 'alliance')) v += 30;
  if (hasTreaty(s, id, PLAYER, 'trade')) v += 15;
  if (hasTreaty(s, id, PLAYER, 'non_aggression')) v += 10;
  if (s.nations[PLAYER]?.recognizedBy.includes(id)) v += 10;
  const evidence = (ctx.content.slg_config?.evidenceFlags ?? []).filter(
    (f) => !!ctx.flag(f),
  ).length;
  v += id === nationByRole(ctx, 'church') ? -5 * evidence - 30 : 10 * evidence;
  const def = ctx.content.slg_nations?.find((n) => n.id === id);
  if (def?.ruler.piety && def.ruler.piety >= 0.9) v -= 10;
  return Math.max(-100, Math.min(100, Math.round(v)));
}

function decide(ctx: SystemContext, stances: Record<NationId, number>): SummitResult {
  if (ctx.flag('slg.summit_bloodshed')) return 'broken';
  const ids = Object.keys(stances);
  const forCrusade = ids.filter((k) => (stances[k] ?? 0) < -20).length;
  if (forCrusade >= 4) return 'crusade';
  const supporters = ids.filter((k) => (stances[k] ?? 0) >= 30);
  const key = nationByRole(ctx, 'summit_key');
  if (supporters.length >= 4 && key !== undefined && supporters.includes(key)) return 'alliance';
  return 'divided';
}

function resolve(ctx: SystemContext): void {
  const s = strat(ctx);
  const conf = s.conference;
  if (!conf) return;
  const stances: Record<NationId, number> = {};
  for (const n of aliveNations(s)) if (n.id !== PLAYER) stances[n.id] = stanceToward(ctx, n.id);
  const result = decide(ctx, stances);
  conf.stances = stances;
  conf.result = result;
  conf.stage = 'done';
  s.summit = result;
  const hasPlayer = !!s.nations[PLAYER]?.alive;
  if (hasPlayer) {
    if (result === 'alliance') {
      for (const [k, v] of Object.entries(stances)) {
        if (v >= 30) {
          addTreaty(s, k, PLAYER, 'alliance', '眠鳞同盟');
          ctx.emit('slg.treaty', { a: k, b: PLAYER, type: 'alliance', signed: true });
        }
      }
    } else if (result === 'divided') {
      for (const k of Object.keys(stances)) addTreaty(s, k, PLAYER, 'pact', '眠鳞公约');
    } else if (result === 'crusade') {
      for (const [k, v] of Object.entries(stances)) if (v < -20) shiftRelation(s, k, PLAYER, -10);
      const church = nationByRole(ctx, 'church');
      if (church && s.nations[church]?.alive) declareWar(ctx, church, PLAYER, { force: true });
    } else {
      for (const k of Object.keys(stances)) shiftRelation(s, k, PLAYER, -20);
    }
  }
  log(s, `七国会盟落幕：${RESULT_NAME[result]}`);
  ctx.setFlag('slg.summit_result', result);
  ctx.setFlag('slg.conclave_done', true);
  ctx.emit('slg.conclave_result', { result, stances });
}

/** Advance the conclave one day; resolve at the end of the signing stage. */
export function advanceConclave(ctx: SystemContext): void {
  const s = strat(ctx);
  const conf = s.conference;
  if (!conf || conf.stage === 'done' || s.day < conf.stageEndsDay) return;
  const list = stages(ctx);
  const idx = list.findIndex((x) => x.stage === conf.stage);
  const next = list[idx + 1];
  if (!next) {
    resolve(ctx);
    return;
  }
  conf.stage = next.stage;
  conf.stageEndsDay = s.day + next.days;
  log(s, `七国会盟进入${STAGE_NAME[next.stage]}阶段`);
}
