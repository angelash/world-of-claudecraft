// AI rulers (grand_strategy_slg.md 3): a quarterly ruler.policy request per AI nation
// with a deterministic utility fallback, permission levels P0 to P4 enforced on every
// proposal, daily rule operations (march on war targets, peace when weary) and the
// anti-coalition rule (4.5).

import { type CommandResult, ok, reject, systemSource } from '../../core';
import type { AiContextV1 } from '../../core/ai_port';
import type { SystemContext } from '../../core/system';
import { kernelData } from '../warfare/data';
import {
  currentAct,
  declareWar,
  hasCasusBelli,
  makePeace,
  neighbourNations,
  performDiplomacy,
  refusal,
} from './diplomacy';
import { findRoute } from './map';
import { addRegiments } from './military';
import { COPPER_PER_GOLD } from './nations';
import {
  addTreaty,
  aliveNations,
  armiesOf,
  atWar,
  enemiesOf,
  hasTreaty,
  inTruce,
  log,
  nationName,
  nationPower,
  PLAYER,
  relation,
  strat,
  warBetween,
} from './state';
import type { NationId, RulerIntent, StrategySlice } from './types';

/** Permission level per intent (P0 read, P1 words, P2 bounded, P3 high risk). P4 = anything else. */
export const PERMISSION: Record<RulerIntent, 0 | 1 | 2 | 3> = {
  observe: 0,
  proclaim: 1,
  develop: 2,
  raise_tax: 2,
  lower_tax: 2,
  recruit: 2,
  trade: 2,
  passage: 2,
  aid: 2,
  declare_war: 3,
  make_peace: 3,
  ally: 3,
  non_aggression: 3,
  recognize: 3,
  break_treaty: 3,
};

const INTENT_NAME: Record<RulerIntent, string> = {
  observe: '静观',
  proclaim: '发布文告',
  develop: '休养生息',
  raise_tax: '加税',
  lower_tax: '减税',
  recruit: '征兵',
  trade: '通商',
  passage: '借道',
  aid: '援助',
  declare_war: '宣战',
  make_peace: '议和',
  ally: '结盟',
  non_aggression: '互不侵犯',
  recognize: '承认',
  break_treaty: '废约',
};

export const P3_COOLDOWN_DAYS = 28;

function def(ctx: SystemContext, id: NationId) {
  return ctx.content.slg_nations?.find((n) => n.id === id);
}

/** Deterministic utility choice of a ruler's quarterly intent (the no-model fallback). */
export function chooseIntent(
  ctx: SystemContext,
  id: NationId,
): { intent: RulerIntent; target?: string } {
  const s = strat(ctx);
  const n = s.nations[id];
  const d = def(ctx, id);
  if (!n || !d) return { intent: 'observe' };
  const p = d.ruler;
  const power = nationPower(ctx.content, s, id);
  const enemies = enemiesOf(s, id);
  if (enemies.length > 0) {
    const foe = enemies[0] as NationId;
    const foePower = nationPower(ctx.content, s, foe);
    if ((n.warWeariness >= 60 || power < 0.6 * foePower) && !refusal(ctx, id, foe, 'peace')) {
      return { intent: 'make_peace', target: foe };
    }
    if (n.treasury > 200) return { intent: 'recruit' };
    return { intent: 'develop' };
  }
  // anti-coalition: someone frightening and expanding
  for (const x of Object.keys(n.ae).sort()) {
    if ((n.ae[x] ?? 0) < 50 || x === id) continue;
    if (nationPower(ctx.content, s, x) <= 1.3 * power) continue;
    const partner = aliveNations(s).find(
      (m) =>
        m.id !== id &&
        m.id !== x &&
        (m.ae[x] ?? 0) >= 40 &&
        !hasTreaty(s, id, m.id, 'alliance') &&
        m.id !== PLAYER,
    );
    if (partner) return { intent: 'ally', target: partner.id };
  }
  if (n.stability < 40) return { intent: 'develop' };
  if (n.treasury < 0) return { intent: 'raise_tax' };
  // war only when strong, hostile, permitted and rolled (aggression-weighted)
  const roll = ctx.rng('strategy.ai').next();
  if (roll < p.aggression * 0.35) {
    const act = currentAct(ctx);
    const targets = neighbourNations(ctx.content, s, id)
      .filter(
        (t) => s.nations[t]?.alive && !inTruce(s, id, t, act) && !hasTreaty(s, id, t, 'alliance'),
      )
      .filter((t) => relation(s, id, t) <= -50 && power >= 1.5 * nationPower(ctx.content, s, t))
      .sort((a, b) => relation(s, id, a) - relation(s, id, b) || a.localeCompare(b));
    const t = targets[0];
    if (t && hasCasusBelli(ctx.content, s, id, t)) return { intent: 'declare_war', target: t };
  }
  if (p.greed >= 0.5) {
    const partner = neighbourNations(ctx.content, s, id).find(
      (t) =>
        !hasTreaty(s, id, t, 'trade') && relation(s, id, t) >= 0 && !refusal(ctx, id, t, 'trade'),
    );
    if (partner && partner !== PLAYER) return { intent: 'trade', target: partner };
  }
  return { intent: 'develop' };
}

function contextFor(ctx: SystemContext, id: NationId): AiContextV1 {
  const s = strat(ctx);
  const n = s.nations[id];
  const d = def(ctx, id);
  const menu = (Object.keys(PERMISSION) as RulerIntent[]).map(
    (k) => `${k}（${INTENT_NAME[k]}，P${PERMISSION[k]}）`,
  );
  const rels = aliveNations(s)
    .filter((m) => m.id !== id)
    .map(
      (m) =>
        `${nationName(ctx.content, s, m.id)}：${Math.round(relation(s, id, m.id))}${atWar(s, id, m.id) ? '（交战中）' : ''}`,
    );
  return {
    v: 1,
    persona: d?.ruler.persona ?? id,
    situation: `第 ${s.day} 日。国库 ${Math.round(n?.treasury ?? 0)} 金，稳定 ${Math.round(n?.stability ?? 0)}，战争厌倦 ${Math.round(n?.warWeariness ?? 0)}。`,
    knowledge: rels,
    goals: ['保全国家', '按照统治者的性格行事'],
    commands: {
      'slg.ruler_policy': `每季选择一项国策意图：${menu.join('、')}。数据字段 nationId、intent、target（国家 ID，可选）、revision；nationId 与 revision 原样填写。P3 动作需要正当理由与冷却，P4 一律拒绝。`,
    },
    speakAs: d?.ruler.name,
  };
}

/** File the quarterly ruler.policy request for each AI nation whose round is due. */
export function requestRulerPolicies(ctx: SystemContext): void {
  const s = strat(ctx);
  const every = ctx.content.slg_config?.rulerEveryDays ?? 28;
  for (const n of aliveNations(s)) {
    if (n.id === PLAYER || s.day - n.lastPolicyDay < every) continue;
    n.lastPolicyDay = s.day;
    const choice = chooseIntent(ctx, n.id);
    ctx.ai.request({
      agentId: n.id,
      role: 'ruler.policy',
      purpose: 'quarterly_policy',
      revision: n.revision,
      context: contextFor(ctx, n.id),
      allowed: ['slg.ruler_policy'],
      fallback: [
        {
          kind: 'slg.ruler_policy',
          data: {
            nationId: n.id,
            intent: choice.intent,
            target: choice.target,
            revision: n.revision,
          },
          source: systemSource('strategy'),
        },
      ],
      deadlineTicks: 600,
      priority: 1,
    });
  }
}

/** Validate and execute a ruler intent (the slg.ruler_policy command). */
export function executeIntent(
  ctx: SystemContext,
  id: NationId,
  intent: string,
  target: string | undefined,
  revision: number,
): CommandResult {
  const s = strat(ctx);
  const n = s.nations[id];
  if (!n?.alive) return reject('no_nation', '没有这个国家');
  if (id === PLAYER) return reject('not_ai', '玩家的国家不经由 AI 统治者决策');
  if (!(intent in PERMISSION)) return reject('forbidden', '越权的动作（P4）永远被拒绝');
  if (revision !== n.revision) return reject('stale', '局势已变，提议过时');
  const it = intent as RulerIntent;
  const level = PERMISSION[it];
  if (target !== undefined && target !== id && !s.nations[target])
    return reject('bad_target', '目标国家不存在');
  if (level === 3) {
    if (!s.active) return reject('dormant', '大陆棋局尚未展开');
    if (s.day - n.lastP3Day < P3_COOLDOWN_DAYS) return reject('cooldown', '高风险动作的冷却未满');
    if (!target || target === id) return reject('bad_target', '需要指定目标国家');
  }
  let res: CommandResult;
  switch (it) {
    case 'observe':
    case 'proclaim':
      res = ok();
      break;
    case 'develop': {
      const cost = Math.min(Math.max(0, n.treasury) * 0.1, 500);
      n.treasury -= cost;
      n.stability = Math.min(100, n.stability + 3 + cost / 250);
      res = ok('休养生息');
      break;
    }
    case 'raise_tax':
    case 'lower_tax': {
      const next = Math.max(0.05, Math.min(0.4, n.taxRate + (it === 'raise_tax' ? 0.05 : -0.05)));
      n.stability = Math.max(0, n.stability + (it === 'raise_tax' ? -3 : 2));
      n.taxRate = Math.round(next * 100) / 100;
      res = ok();
      break;
    }
    case 'recruit': {
      const d = def(ctx, id);
      const capital = d?.capital;
      const typeId = d?.recruits[0];
      if (!capital || !typeId || s.provinces[capital]?.owner !== id) {
        res = reject('no_capital', '没有可以征兵的都城');
        break;
      }
      const unit = kernelData(ctx.content.regiment_types ?? []).units.get(typeId);
      const per = (unit?.cost ?? 100) / COPPER_PER_GOLD;
      const count = Math.floor(
        Math.min(1000, (Math.max(0, n.treasury) * 0.3) / Math.max(per, 0.001)),
      );
      if (count < 50) {
        res = reject('no_funds', '国库不足以征兵');
        break;
      }
      n.treasury -= count * per;
      addRegiments(s, id, capital, [{ typeId, count }], `${nationName(ctx.content, s, id)}新军`);
      res = ok(`征兵 ${count} 人`);
      break;
    }
    case 'aid': {
      if (!target || !s.nations[target]) {
        res = reject('bad_target', '需要指定援助对象');
        break;
      }
      const amount = Math.min(Math.max(0, n.treasury) * 0.1, 1000);
      n.treasury -= amount;
      const t = s.nations[target];
      if (t) t.treasury += amount;
      res = ok();
      break;
    }
    case 'make_peace': {
      if (!target) {
        res = reject('bad_target', '需要指定议和对象');
        break;
      }
      const war = warBetween(s, id, target);
      if (!war) {
        res = reject('not_at_war', '双方并未交战');
        break;
      }
      if (target === PLAYER) {
        res = reject('needs_player', '需要玩家答复议和');
        break;
      }
      res = performDiplomacy(ctx, id, target, 'peace');
      break;
    }
    case 'ally':
      res = performDiplomacy(ctx, id, target as string, 'alliance');
      break;
    case 'declare_war':
      res = declareWar(ctx, id, target as string);
      break;
    case 'trade':
    case 'passage':
    case 'non_aggression':
    case 'recognize':
      if (!target) {
        res = reject('bad_target', '需要指定目标国家');
        break;
      }
      if (target === PLAYER) {
        // AI offers to the player are recorded; the player answers through slg.diplomacy
        res = ok('已向玩家提出');
        break;
      }
      res = performDiplomacy(ctx, id, target, it === 'recognize' ? 'recognize' : it);
      break;
    case 'break_treaty':
      res = performDiplomacy(ctx, id, target as string, 'break_treaty');
      break;
  }
  if (res.ok) {
    n.revision += 1;
    n.lastIntent = it;
    if (level === 3) n.lastP3Day = s.day;
  }
  ctx.emit('slg.policy', { nationId: id, intent: it, target, ok: res.ok });
  return res;
}

/** Daily rule operations: march field armies on war targets, end exhausted AI-only wars. */
export function runAiOperations(ctx: SystemContext): void {
  const s = strat(ctx);
  for (const n of aliveNations(s)) {
    if (n.id === PLAYER) continue;
    const enemies = enemiesOf(s, n.id);
    for (const army of armiesOf(s, n.id)) {
      if (army.frozen || army.path.length > 0) continue;
      if (enemies.length === 0) continue;
      const target = pickTarget(ctx, s, n.id, army.province, enemies);
      if (!target) continue;
      const route = findRoute(ctx.content, s, n.id, army.province, target);
      if (route && route.length > 0) army.path = route;
    }
  }
  for (const war of [...s.wars]) {
    const sides = [...war.attackers, ...war.defenders];
    if (sides.includes(PLAYER)) continue;
    const a = s.nations[war.attacker];
    const d = s.nations[war.defender];
    if (!a || !d) continue;
    if (a.warWeariness >= 70 || d.warWeariness >= 70 || Math.abs(war.score) >= 60)
      makePeace(ctx, war, 'peace');
  }
}

function pickTarget(
  ctx: SystemContext,
  s: StrategySlice,
  owner: NationId,
  from: string,
  enemies: NationId[],
): string | undefined {
  // nearest enemy-held province reachable by route length (deterministic tie-break)
  let best: string | undefined;
  let bestLen = Number.POSITIVE_INFINITY;
  for (const pid of Object.keys(s.provinces).sort()) {
    const ctrl = s.provinces[pid]?.controller;
    if (!ctrl || !enemies.includes(ctrl)) continue;
    const route = findRoute(ctx.content, s, owner, from, pid);
    if (!route) continue;
    if (route.length < bestLen) {
      bestLen = route.length;
      best = pid;
    }
  }
  return best;
}

/** Nations that fear the same expanding power sign defensive alliances (4.5). */
export function runAntiCoalition(ctx: SystemContext): void {
  const s = strat(ctx);
  const nations = aliveNations(s).filter((n) => n.id !== PLAYER);
  for (const n of nations) {
    for (const x of Object.keys(n.ae).sort()) {
      if ((n.ae[x] ?? 0) < 50 || x === n.id) continue;
      if (nationPower(ctx.content, s, x) <= 1.3 * nationPower(ctx.content, s, n.id)) continue;
      for (const m of nations) {
        if (m.id === n.id || m.id === x || (m.ae[x] ?? 0) < 40) continue;
        if (atWar(s, n.id, m.id) || hasTreaty(s, n.id, m.id, 'alliance')) continue;
        if (relation(s, n.id, m.id) < -20) continue;
        addTreaty(s, n.id, m.id, 'alliance', `反${nationName(ctx.content, s, x)}联盟`);
        ctx.emit('slg.treaty', { a: n.id, b: m.id, type: 'alliance', signed: true });
        log(
          s,
          `${nationName(ctx.content, s, n.id)}与${nationName(ctx.content, s, m.id)}结成反${nationName(ctx.content, s, x)}联盟`,
        );
      }
    }
  }
}
