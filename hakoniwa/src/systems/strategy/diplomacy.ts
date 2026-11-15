// Diplomacy (grand_strategy_slg.md 4): treaties, war declarations with casus belli and
// defensive allies, peace and truces (D-049), and the AI side's utility acceptance of
// proposals. Every result carries a readable Chinese reason.

import { type CommandResult, ok, reject } from '../../core';
import type { ContentMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { neighbors } from './map';
import {
  addTreaty,
  allies,
  atWar,
  enemiesOf,
  hasTreaty,
  inTruce,
  log,
  nationName,
  nationPower,
  newId,
  PLAYER,
  provincesOf,
  relation,
  removeTreaties,
  shiftRelation,
  strat,
  warBetween,
} from './state';
import type { DiplomacyAction, NationId, StrategySlice, TreatyType, War } from './types';

export function currentAct(ctx: SystemContext): string {
  return String(ctx.flag('act') ?? '');
}

/** Casus belli: deep hostility, a claim (they hold land we owned at the opening), or a pact breach. */
export function hasCasusBelli(
  content: ContentMap,
  s: StrategySlice,
  a: NationId,
  b: NationId,
): boolean {
  if (relation(s, a, b) <= -60) return true;
  for (const pid of provincesOf(s, b)) {
    if (content.slg_provinces?.find((p) => p.id === pid)?.owner === a) return true;
  }
  return false;
}

export function declareWar(
  ctx: SystemContext,
  a: NationId,
  b: NationId,
  opts: { force?: boolean } = {},
): CommandResult {
  const s = strat(ctx);
  if (a === b) return reject('self', '不能对自己宣战');
  if (!s.nations[b]?.alive) return reject('no_nation', '没有这个国家');
  if (atWar(s, a, b)) return reject('already', '双方已在交战');
  if (!opts.force && inTruce(s, a, b, currentAct(ctx))) {
    return reject('truce', '停战期未满（本幕之内且不少于一季）');
  }
  const cb = opts.force || hasCasusBelli(ctx.content, s, a, b);
  const na = s.nations[a];
  if (na && !cb) {
    na.legitimacy = Math.max(0, na.legitimacy - 15);
    na.credibility = Math.max(0, na.credibility - 10);
    for (const n of Object.values(s.nations)) {
      if (n.id !== a) n.ae[a] = (n.ae[a] ?? 0) + 15;
    }
  }
  const pacts = removeTreaties(s, a, b);
  if (na && pacts.some((t) => t.type === 'non_aggression' || t.type === 'pact')) {
    na.credibility = Math.max(0, na.credibility - 15);
  }
  const defenders = [b, ...allies(s, b).filter((x) => x !== a && !allies(s, a).includes(x))];
  const war: War = {
    id: newId(s, 'war'),
    attacker: a,
    defender: b,
    attackers: [a],
    defenders: [...new Set(defenders)].sort(),
    startDay: s.day,
    score: 0,
    casusBelli: cb,
  };
  s.wars.push(war);
  for (const d of war.defenders) shiftRelation(s, a, d, -30);
  log(
    s,
    `${nationName(ctx.content, s, a)}向${nationName(ctx.content, s, b)}宣战${cb ? '' : '（无正当理由）'}`,
  );
  ctx.emit('slg.war_declared', {
    attacker: a,
    defender: b,
    casusBelli: cb,
    allies: war.defenders.filter((x) => x !== b),
  });
  return ok(cb ? '宣战' : '宣战（无正当理由，正统受损）');
}

export function makePeace(ctx: SystemContext, war: War, kind: 'truce' | 'peace'): void {
  const s = strat(ctx);
  s.wars = s.wars.filter((w) => w.id !== war.id);
  const act = currentAct(ctx);
  const truceDays = ctx.content.slg_config?.truceDays ?? 28;
  for (const a of war.attackers) {
    for (const d of war.defenders) {
      s.truces.push({ a, b: d, untilDay: s.day + truceDays, act });
      shiftRelation(s, a, d, 10);
    }
  }
  log(
    s,
    `${nationName(ctx.content, s, war.attacker)}与${nationName(ctx.content, s, war.defender)}${kind === 'truce' ? '停战' : '议和'}`,
  );
  ctx.emit('slg.peace', { a: war.attacker, b: war.defender, kind });
}

function commonEnemy(s: StrategySlice, a: NationId, b: NationId): boolean {
  const ea = enemiesOf(s, a);
  return enemiesOf(s, b).some((x) => ea.includes(x));
}

function sharedThreat(s: StrategySlice, a: NationId, b: NationId): boolean {
  const na = s.nations[a];
  const nb = s.nations[b];
  if (!na || !nb) return false;
  return Object.keys(na.ae).some(
    (x) => x !== a && x !== b && (na.ae[x] ?? 0) >= 40 && (nb.ae[x] ?? 0) >= 40,
  );
}

/** Whole-number display of a relation or score. */
const num = (v: number) => String(Math.round(v));
/** Power ratio with one decimal. */
const times = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

/**
 * Utility acceptance by the receiving AI nation; returns a refusal reason or null. Every
 * reason names the deciding terms with their current and required values
 * (grand_strategy_slg 4.3), so the player can see what is missing and by how much.
 */
export function refusal(
  ctx: SystemContext,
  from: NationId,
  to: NationId,
  action: DiplomacyAction,
): string | null {
  const s = strat(ctx);
  const rel = relation(s, to, from);
  const def = ctx.content.slg_nations?.find((n) => n.id === to);
  const caution = def?.ruler.caution ?? 0.5;
  const relNeed = (need: number) => `关系 ${num(rel)}，需要 ${need}`;
  switch (action) {
    case 'alliance': {
      if (atWar(s, from, to)) return '双方仍在交战';
      const enemy = commonEnemy(s, from, to);
      const threat = sharedThreat(s, from, to);
      if (rel >= 50 || (rel >= 30 && enemy) || (rel >= 0 && threat)) return null;
      const alt = [
        enemy ? '有共同敌人时需要 30' : '有共同敌人可降到 30',
        threat ? '同受第三国威胁时需要 0' : '同受第三国威胁可降到 0',
      ];
      return `对方认为结盟的时机未到（${relNeed(50)}；${alt.join('；')}）`;
    }
    case 'trade':
      if (atWar(s, from, to)) return '双方仍在交战';
      return rel >= -10 ? null : `对方不愿与你通商（${relNeed(-10)}）`;
    case 'non_aggression': {
      if (atWar(s, from, to)) return '双方仍在交战';
      const ratio =
        nationPower(ctx.content, s, from) / Math.max(1e-9, nationPower(ctx.content, s, to));
      const fear = ratio > 1.3;
      return rel >= 0 || fear
        ? null
        : `对方不信任你的承诺（${relNeed(0)}；或你的国力达到对方的 1.3 倍，现为 ${times(ratio)} 倍）`;
    }
    case 'passage':
      if (atWar(s, from, to)) return '双方仍在交战';
      return rel >= 20 ? null : `对方不允许你的军队过境（${relNeed(20)}）`;
    case 'recognize':
      return rel >= -10 ? null : `对方拒绝承认你的主权（${relNeed(-10)}）`;
    case 'truce':
    case 'peace': {
      const war = warBetween(s, from, to);
      if (!war) return '双方并未交战';
      const weariness = s.nations[to]?.warWeariness ?? 0;
      const toAttacks = war.attackers.includes(to);
      const toScore = toAttacks ? war.score : -war.score;
      const ratio =
        nationPower(ctx.content, s, to) / Math.max(1e-9, nationPower(ctx.content, s, from));
      const days = s.day - war.startDay;
      const patient = caution >= 0.7;
      if (weariness >= 40 || toScore <= -20 || ratio < 0.8 || (patient && days >= 28)) return null;
      const terms = [
        `厌战 ${num(weariness)}，需要 40`,
        `对方战争分数 ${num(toScore)}，需要 -20 以下`,
        `对方国力为你的 ${times(ratio)} 倍，需要低于 0.8 倍`,
      ];
      if (patient) terms.push(`已交战 ${days} 天，谨慎的统治者 28 天后愿意谈`);
      return `对方认为仗还没有打完（${terms.join('；')}）`;
    }
    default:
      return null;
  }
}

const TREATY_OF: Partial<Record<DiplomacyAction, TreatyType>> = {
  alliance: 'alliance',
  trade: 'trade',
  non_aggression: 'non_aggression',
  passage: 'passage',
  recognize: 'recognition',
};

const ACTION_NAME: Record<DiplomacyAction, string> = {
  alliance: '结盟',
  trade: '通商',
  non_aggression: '互不侵犯',
  passage: '借道',
  recognize: '承认',
  declare_war: '宣战',
  truce: '停战',
  peace: '议和',
  break_treaty: '废约',
};

/** Execute a diplomatic action from one nation toward another (acceptance included). */
export function performDiplomacy(
  ctx: SystemContext,
  from: NationId,
  to: NationId,
  action: DiplomacyAction,
  treaty?: TreatyType,
): CommandResult {
  const s = strat(ctx);
  if (!s.nations[from]?.alive) return reject('no_nation', '你还没有可以代表的国家');
  if (!s.nations[to]?.alive) return reject('no_nation', '没有这个国家');
  if (from === to) return reject('self', '不能与自己交涉');
  if (action === 'declare_war') return declareWar(ctx, from, to);
  if (action === 'break_treaty') {
    const gone = removeTreaties(s, from, to, treaty);
    if (gone.length === 0) return reject('no_treaty', '双方之间没有这项条约');
    const n = s.nations[from];
    if (n) n.credibility = Math.max(0, n.credibility - 10);
    shiftRelation(s, from, to, -20);
    for (const t of gone) ctx.emit('slg.treaty', { a: from, b: to, type: t.type, signed: false });
    log(s, `${nationName(ctx.content, s, from)}废除了与${nationName(ctx.content, s, to)}的条约`);
    return ok('条约已废除');
  }
  // the receiver decides (the player answers through its own commands)
  if (to !== PLAYER) {
    const why = refusal(ctx, from, to, action);
    if (why) {
      shiftRelation(s, to, from, -2, false);
      return reject(
        'refused',
        `${nationName(ctx.content, s, to)}拒绝了${ACTION_NAME[action]}：${why}`,
      );
    }
  } else if (from !== PLAYER) {
    return reject('needs_player', '需要玩家亲自答复');
  }
  if (action === 'truce' || action === 'peace') {
    const war = warBetween(s, from, to);
    if (!war) return reject('not_at_war', '双方并未交战');
    makePeace(ctx, war, action);
    return ok(action === 'truce' ? '停战达成' : '和约签订');
  }
  const type = TREATY_OF[action];
  if (!type) return reject('bad_action', '无法理解的外交动作');
  if (hasTreaty(s, from, to, type)) return reject('exists', '这项条约已经生效');
  addTreaty(s, from, to, type);
  if (action === 'recognize') {
    const target = s.nations[from];
    if (target && !target.recognizedBy.includes(to)) {
      target.recognizedBy.push(to);
      target.recognizedBy.sort();
      target.legitimacy = Math.min(100, target.legitimacy + 8);
    }
  }
  shiftRelation(s, from, to, action === 'alliance' ? 15 : 5);
  ctx.emit('slg.treaty', { a: from, b: to, type, signed: true });
  log(
    s,
    `${nationName(ctx.content, s, from)}与${nationName(ctx.content, s, to)}达成${ACTION_NAME[action]}`,
  );
  return ok(`${ACTION_NAME[action]}达成`);
}

/** Neighbouring nations (sharing a province link). */
export function neighbourNations(content: ContentMap, s: StrategySlice, n: NationId): NationId[] {
  const out = new Set<NationId>();
  for (const pid of provincesOf(s, n)) {
    for (const q of neighbors(content, pid)) {
      const o = s.provinces[q]?.owner;
      if (o && o !== n) out.add(o);
    }
  }
  return [...out].sort();
}
