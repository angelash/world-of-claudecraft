// Diplomacy (grand_strategy_slg.md 4): treaties, war declarations with casus belli and
// defensive allies, peace and truces (D-049), and the AI side's utility acceptance of
// proposals. Every result carries a readable reason (a TextRef, D-077).

import { type CommandResult, ok, reject } from '../../core';
import type { ContentMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { joinText, type KeyText, tr } from '../../core/text';
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
  if (a === b) return reject('self', tr('sys.strategy.reject.self.war'));
  if (!s.nations[b]?.alive) return reject('no_nation', tr('sys.strategy.reject.no_nation.unknown'));
  if (atWar(s, a, b)) return reject('already', tr('sys.strategy.reject.already.war'));
  if (!opts.force && inTruce(s, a, b, currentAct(ctx))) {
    return reject('truce', tr('sys.strategy.reject.truce'));
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
    tr('sys.strategy.log.war_declared', {
      a: nationName(ctx.content, s, a),
      b: nationName(ctx.content, s, b),
      unjust: cb ? '' : tr('sys.strategy.log.war_unjust'),
    }),
  );
  ctx.emit('slg.war_declared', {
    attacker: a,
    defender: b,
    casusBelli: cb,
    allies: war.defenders.filter((x) => x !== b),
  });
  return ok(
    cb ? tr('sys.strategy.info.war_declared') : tr('sys.strategy.info.war_declared_unjust'),
  );
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
    tr(kind === 'truce' ? 'sys.strategy.log.peace_truce' : 'sys.strategy.log.peace_peace', {
      a: nationName(ctx.content, s, war.attacker),
      b: nationName(ctx.content, s, war.defender),
    }),
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
): KeyText | null {
  const s = strat(ctx);
  const rel = relation(s, to, from);
  const def = ctx.content.slg_nations?.find((n) => n.id === to);
  const caution = def?.ruler.caution ?? 0.5;
  const relNeed = (need: number) => tr('sys.strategy.refuse.rel_need', { rel: num(rel), need });
  const atWarText = () => tr('sys.strategy.refuse.at_war');
  switch (action) {
    case 'alliance': {
      if (atWar(s, from, to)) return atWarText();
      const enemy = commonEnemy(s, from, to);
      const threat = sharedThreat(s, from, to);
      if (rel >= 50 || (rel >= 30 && enemy) || (rel >= 0 && threat)) return null;
      const alt = [
        enemy ? tr('sys.strategy.refuse.enemy_need') : tr('sys.strategy.refuse.enemy_could'),
        threat ? tr('sys.strategy.refuse.threat_need') : tr('sys.strategy.refuse.threat_could'),
      ];
      return tr('sys.strategy.refuse.alliance', {
        rel: relNeed(50),
        alt: joinText('semicolon', alt),
      });
    }
    case 'trade':
      if (atWar(s, from, to)) return atWarText();
      return rel >= -10 ? null : tr('sys.strategy.refuse.trade', { rel: relNeed(-10) });
    case 'non_aggression': {
      if (atWar(s, from, to)) return atWarText();
      const ratio =
        nationPower(ctx.content, s, from) / Math.max(1e-9, nationPower(ctx.content, s, to));
      const fear = ratio > 1.3;
      return rel >= 0 || fear
        ? null
        : tr('sys.strategy.refuse.non_aggression', { rel: relNeed(0), ratio: times(ratio) });
    }
    case 'passage':
      if (atWar(s, from, to)) return atWarText();
      return rel >= 20 ? null : tr('sys.strategy.refuse.passage', { rel: relNeed(20) });
    case 'recognize':
      return rel >= -10 ? null : tr('sys.strategy.refuse.recognize', { rel: relNeed(-10) });
    case 'truce':
    case 'peace': {
      const war = warBetween(s, from, to);
      if (!war) return tr('sys.strategy.refuse.not_at_war');
      const weariness = s.nations[to]?.warWeariness ?? 0;
      const toAttacks = war.attackers.includes(to);
      const toScore = toAttacks ? war.score : -war.score;
      const ratio =
        nationPower(ctx.content, s, to) / Math.max(1e-9, nationPower(ctx.content, s, from));
      const days = s.day - war.startDay;
      const patient = caution >= 0.7;
      if (weariness >= 40 || toScore <= -20 || ratio < 0.8 || (patient && days >= 28)) return null;
      const terms = [
        tr('sys.strategy.refuse.term.weariness', { n: num(weariness) }),
        tr('sys.strategy.refuse.term.score', { n: num(toScore) }),
        tr('sys.strategy.refuse.term.power', { ratio: times(ratio) }),
      ];
      if (patient) terms.push(tr('sys.strategy.refuse.term.patient', { days }));
      return tr('sys.strategy.refuse.peace', { terms: joinText('semicolon', terms) });
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

const ACTION_NAME: Record<DiplomacyAction, () => KeyText> = {
  alliance: () => tr('sys.strategy.action.alliance'),
  trade: () => tr('sys.strategy.action.trade'),
  non_aggression: () => tr('sys.strategy.action.non_aggression'),
  passage: () => tr('sys.strategy.action.passage'),
  recognize: () => tr('sys.strategy.action.recognize'),
  declare_war: () => tr('sys.strategy.action.declare_war'),
  truce: () => tr('sys.strategy.action.truce'),
  peace: () => tr('sys.strategy.action.peace'),
  break_treaty: () => tr('sys.strategy.action.break_treaty'),
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
  if (!s.nations[from]?.alive)
    return reject('no_nation', tr('sys.strategy.reject.no_nation.representable'));
  if (!s.nations[to]?.alive)
    return reject('no_nation', tr('sys.strategy.reject.no_nation.unknown'));
  if (from === to) return reject('self', tr('sys.strategy.reject.self.talk'));
  if (action === 'declare_war') return declareWar(ctx, from, to);
  if (action === 'break_treaty') {
    const gone = removeTreaties(s, from, to, treaty);
    if (gone.length === 0) return reject('no_treaty', tr('sys.strategy.reject.no_treaty'));
    const n = s.nations[from];
    if (n) n.credibility = Math.max(0, n.credibility - 10);
    shiftRelation(s, from, to, -20);
    for (const t of gone) ctx.emit('slg.treaty', { a: from, b: to, type: t.type, signed: false });
    log(
      s,
      tr('sys.strategy.log.treaty_broken', {
        a: nationName(ctx.content, s, from),
        b: nationName(ctx.content, s, to),
      }),
    );
    return ok(tr('sys.strategy.info.treaty_broken'));
  }
  // the receiver decides (the player answers through its own commands)
  if (to !== PLAYER) {
    const why = refusal(ctx, from, to, action);
    if (why) {
      shiftRelation(s, to, from, -2, false);
      return reject(
        'refused',
        tr('sys.strategy.reject.refused', {
          nation: nationName(ctx.content, s, to),
          action: ACTION_NAME[action](),
          why,
        }),
      );
    }
  } else if (from !== PLAYER) {
    return reject('needs_player', tr('sys.strategy.reject.needs_player.diplomacy'));
  }
  if (action === 'truce' || action === 'peace') {
    const war = warBetween(s, from, to);
    if (!war) return reject('not_at_war', tr('sys.strategy.reject.not_at_war'));
    makePeace(ctx, war, action);
    return ok(action === 'truce' ? tr('sys.strategy.info.truce') : tr('sys.strategy.info.peace'));
  }
  const type = TREATY_OF[action];
  if (!type) return reject('bad_action', tr('sys.strategy.reject.bad_action'));
  if (hasTreaty(s, from, to, type)) return reject('exists', tr('sys.strategy.reject.exists'));
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
    tr('sys.strategy.log.treaty_signed', {
      a: nationName(ctx.content, s, from),
      b: nationName(ctx.content, s, to),
      action: ACTION_NAME[action](),
    }),
  );
  return ok(tr('sys.strategy.info.signed', { action: ACTION_NAME[action]() }));
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
