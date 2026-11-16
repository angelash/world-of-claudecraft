// The built-in AI primitives (builtin_ai.md 2, 19 step 1; PK-M0-25): response curves,
// utility scoring with every tie rule, every behavior tree node and decorator, HTN
// decomposition (cost order, backtracking, budgets, omens, bindings, replanning), rule
// tables (priority, ties, weights, cooldown, once scopes) and decision traces.

import { describe, expect, it } from 'vitest';
import {
  advancePlan,
  allMatches,
  BLACKBOARD_KEYS,
  Blackboard,
  type BtEnv,
  type BtNodeDef,
  BtRunner,
  bell,
  compensatedGate,
  currentStep,
  domainProblems,
  evalCurve,
  evaluateAction,
  firstMatch,
  type HtnDomain,
  type HtnState,
  inv,
  LIFE_BAND,
  lin,
  logi,
  markFired,
  newRuleMemory,
  parseDuration,
  pickBest,
  planHtn,
  quad,
  type RuleRow,
  replanReason,
  ruleProblems,
  type ScoredAction,
  scoreAction,
  startPlan,
  step,
  TRACE_RING,
  TraceBook,
  traceOfPick,
  treeProblems,
  weightedIndex,
} from '../src/core/brain';
import { curveProblems } from '../src/core/brain/curves';
import { Rng } from '../src/core/rng';
import {
  TICKS_PER_GAME_DAY,
  TICKS_PER_GAME_HOUR,
  TICKS_PER_GAME_MINUTE,
  tickAtDay,
} from '../src/core/time';
import { checkCondition, evaluate } from '../src/systems/quests/conditions';

const rng = (s = 7) => new Rng({ s });

// ---------------------------------------------------------------------------
describe('response curves', () => {
  it('interpolates between nodes and clamps outside them', () => {
    const c = lin(10, 20);
    expect(evalCurve(c, 0)).toBe(0);
    expect(evalCurve(c, 10)).toBe(0);
    expect(evalCurve(c, 15)).toBe(0.5);
    expect(evalCurve(c, 20)).toBe(1);
    expect(evalCurve(c, 99)).toBe(1);
    expect(evalCurve(inv(0, 100), 25)).toBe(0.75);
    expect(evalCurve([], 3)).toBe(0);
    expect(evalCurve(c, Number.NaN)).toBe(0);
  });

  it('reads a step right-continuously: 0 below the threshold, 1 from it', () => {
    const s = step(35);
    expect(evalCurve(s, 34.999)).toBe(0);
    expect(evalCurve(s, 35)).toBe(1);
    expect(evalCurve(s, 80)).toBe(1);
    const mid = [
      { x: 0, y: 0 },
      { x: 10, y: 0.2 },
      { x: 10, y: 0.8 },
      { x: 20, y: 1 },
    ];
    expect(evalCurve(mid, 9.99)).toBeCloseTo(0.1998, 4);
    expect(evalCurve(mid, 10)).toBe(0.8);
    expect(evalCurve(mid, 15)).toBeCloseTo(0.9, 10);
  });

  it('generates quad, bell and logi as tables of at most 8 nodes', () => {
    const q = quad(0, 1, 2);
    expect(q.length).toBeLessThanOrEqual(8);
    expect(evalCurve(q, 0.5)).toBeGreaterThan(0.2);
    expect(evalCurve(q, 0.5)).toBeLessThan(0.3);
    expect(evalCurve(quad(0, 1, 3), 1)).toBe(1);
    const b = bell(50, 10);
    expect(evalCurve(b, 50)).toBe(1);
    expect(evalCurve(b, 40)).toBe(0);
    expect(evalCurve(b, 55)).toBe(0.5);
    expect(evalCurve(b, 70)).toBe(0);
    const l = logi(50, 20);
    expect(l.length).toBe(8);
    expect(evalCurve(l, 30)).toBe(0);
    expect(evalCurve(l, 70)).toBe(1);
    expect(evalCurve(l, 50)).toBeCloseTo(0.5, 3);
    // the constants are the true logistic 1/(1+e^-5u) on -1..1, rescaled to 0..1
    const f = (u: number) => 1 / (1 + Math.exp(-5 * u));
    for (const p of l) {
      const u = (p.x - 50) / 20;
      const want = (f(u) - f(-1)) / (f(1) - f(-1));
      expect(Math.abs(p.y - want)).toBeLessThan(1e-4);
    }
    for (const c of [q, b, l, step(3), lin(0, 1), inv(1, 2)]) expect(curveProblems(c)).toEqual([]);
  });

  it('rejects degenerate shapes and malformed tables', () => {
    expect(() => lin(5, 5)).toThrow();
    expect(() => inv(6, 5)).toThrow();
    expect(() => bell(0, 0)).toThrow();
    expect(() => logi(0, -1)).toThrow();
    expect(curveProblems([])).toContain('curve has no node');
    const many = Array.from({ length: 9 }, (_, i) => ({ x: i, y: 0 }));
    expect(curveProblems(many).join()).toContain('9 nodes');
    expect(
      curveProblems([
        { x: 2, y: 0 },
        { x: 1, y: 1.5 },
      ]),
    ).toEqual(['node 1: y 1.5 outside 0 to 1', 'node 1: x out of order']);
  });
});

// ---------------------------------------------------------------------------
describe('utility scoring', () => {
  it('compensates the gate product for the number of gates', () => {
    expect(compensatedGate([])).toBe(1);
    expect(compensatedGate([0.5])).toBe(0.5);
    // n = 2: c' = 0.5 + 0.5 * 0.5 * 0.5 = 0.625 each
    expect(compensatedGate([0.5, 0.5])).toBeCloseTo(0.390625, 10);
    expect(compensatedGate([0.5, 0.5])).toBeGreaterThan(0.25);
    expect(compensatedGate([0, 1])).toBe(0);
  });

  it('scores W x G x M + B - C with every term named', () => {
    const s = scoreAction({
      id: 'eat',
      weight: 2,
      gates: [{ name: 'hunger', value: 0.5 }],
      bonuses: [{ name: 'plan', value: 3 }],
      costs: [{ name: 'price', value: 0.5 }],
      persona: 1.2,
    });
    expect(s.score).toBeCloseTo(2 * 0.5 * 1.2 + 3 - 0.5, 10);
    expect(s.blocked).toBe(false);
    expect(s.terms.map((t) => t.name)).toEqual([
      'gate.hunger',
      'bonus.plan',
      'cost.price',
      'W',
      'G',
      'M',
    ]);
    // the persona multiplier is clamped to 0.5..1.5
    expect(scoreAction({ id: 'x', weight: 1, gates: [], persona: 9 }).score).toBe(1.5);
    expect(scoreAction({ id: 'x', weight: 1, gates: [], persona: 0.1 }).score).toBe(0.5);
  });

  it('short-circuits a zero gate: blocked, score 0, bonuses and costs skipped', () => {
    const s = scoreAction({
      id: 'steal',
      weight: 5,
      gates: [
        { name: 'chance', value: 0 },
        { name: 'greed', value: 1 },
      ],
      bonuses: [{ name: 'script', value: 5 }],
    });
    expect(s).toMatchObject({ score: 0, blocked: true });
    expect(s.terms.some((t) => t.name.startsWith('bonus.'))).toBe(false);
  });

  it('evaluates a library action: curves, scales, persona dims, inertia and cooldown', () => {
    const def = {
      id: 'eat_tavern',
      weight: 4,
      gates: [{ name: 'hunger', input: 'need.hunger', curve: inv(0, 100) }],
      bonuses: [{ name: 'near', input: 'near', scale: 2 }],
      costs: [{ name: 'price', input: 'price', scale: 0.1 }],
      persona: ['greed', 'pride'],
      cooldownTicks: 100,
    };
    const inputs: Record<string, number> = { 'need.hunger': 25, near: 1, price: 10 };
    const base = { input: (id: string) => inputs[id] ?? 0 };
    const s = evaluateAction(def, { ...base, persona: (d) => (d === 'greed' ? 1.2 : 1) });
    expect(s.score).toBeCloseTo(4 * 0.75 * 1.2 + 2 - 1, 10);
    const running = evaluateAction(def, { ...base, current: 'eat_tavern' });
    expect(running.score - evaluateAction(def, base).score).toBeCloseTo(0.4, 10);
    expect(running.terms.some((t) => t.name === 'bonus.inertia')).toBe(true);
    const cooling = { ...base, tick: 150, lastUsedTick: () => 100 };
    expect(evaluateAction(def, cooling).blocked).toBe(true);
    expect(evaluateAction(def, { ...cooling, tick: 200 }).blocked).toBe(false);
  });

  const sa = (id: string, score: number, blocked = false): ScoredAction => ({
    id,
    score,
    blocked,
    terms: [],
  });

  it('tie rule: equal scores go to the lexicographically first id (code units, not locale)', () => {
    expect(pickBest([sa('walk', 3), sa('eat', 3), sa('sleep', 3)]).chosen?.id).toBe('eat');
    // code unit order: uppercase before lowercase, '1' before '9'
    expect(pickBest([sa('b', 1), sa('B', 1)]).chosen?.id).toBe('B');
    expect(pickBest([sa('item9', 1), sa('item10', 1)]).chosen?.id).toBe('item10');
    expect(pickBest([sa('z', 2), sa('a', 1)]).chosen?.id).toBe('z');
    expect(pickBest([sa('walk', 3), sa('eat', 3)]).ranked.map((a) => a.id)).toEqual([
      'eat',
      'walk',
    ]);
  });

  it('never chooses a blocked action, and nothing eligible means idle', () => {
    expect(pickBest([sa('fly', 99, true), sa('walk', 1)]).chosen?.id).toBe('walk');
    expect(pickBest([sa('fly', 99, true)])).toMatchObject({ chosen: null, idle: true });
  });

  it('idle rule: below the baseline stays idle, equal to it acts', () => {
    expect(pickBest([sa('smite', 3.9)], { idleScore: 4 })).toMatchObject({
      chosen: null,
      idle: true,
    });
    expect(pickBest([sa('smite', 4)], { idleScore: 4 }).chosen?.id).toBe('smite');
  });

  it('band rule: a weighted draw among the candidates within the band of the top', () => {
    const list = [sa('a', 10), sa('b', 9), sa('c', 8.9)];
    // 10% band: threshold 9 (inclusive), c is out
    const seen = new Set<string>();
    const r = rng(11);
    for (let i = 0; i < 200; i++) {
      const p = pickBest(list, { band: LIFE_BAND, rng: r });
      seen.add(p.chosen?.id ?? '');
      expect(p.draw).toBeGreaterThanOrEqual(0);
    }
    expect([...seen].sort()).toEqual(['a', 'b']);
    // the same stream state gives the same choice and draw
    expect(pickBest(list, { band: 0.1, rng: rng(3) })).toEqual(
      pickBest(list, { band: 0.1, rng: rng(3) }),
    );
  });

  it('band rule: a lone candidate in the band, or a top at or below 0, draws nothing', () => {
    const st = { s: 42 };
    const r = new Rng(st);
    const lone = pickBest([sa('a', 10), sa('b', 8)], { band: 0.1, rng: r });
    expect(lone).toMatchObject({ draw: -1 });
    expect(lone.chosen?.id).toBe('a');
    const neg = pickBest([sa('a', -1), sa('b', -1)], { band: 0.5, rng: r });
    expect(neg.chosen?.id).toBe('a');
    expect(st.s).toBe(42);
    // no rng: the band is ignored and the plain top wins
    expect(pickBest([sa('b', 10), sa('a', 9.5)], { band: 0.1 }).chosen?.id).toBe('b');
  });

  it('weightedIndex with equal weights picks exactly as Rng.pick does', () => {
    for (let seed = 1; seed < 40; seed++) {
      const a = rng(seed);
      const b = rng(seed);
      expect(weightedIndex(a, [1, 1, 1, 1, 1]).index).toBe(b.pick([0, 1, 2, 3, 4]));
    }
    expect(weightedIndex(rng(), [0, 0])).toEqual({ index: 0, draw: -1 });
    // zero weights never win
    for (let seed = 1; seed < 30; seed++) expect(weightedIndex(rng(seed), [0, 2, 0]).index).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// behavior trees: a scripted env whose commands settle when the test says so

interface Script {
  conds: Record<string, boolean>;
  receipts: Record<string, 'success' | 'failure' | undefined>;
  acted: string[];
  cancelled: string[];
  said: string[];
  sayOk: boolean;
  scores: Record<string, number>;
  events: { kind: string; tick: number }[];
}

function script(): Script {
  return {
    conds: {},
    receipts: {},
    acted: [],
    cancelled: [],
    said: [],
    sayOk: true,
    scores: {},
    events: [],
  };
}

function env(s: Script, tick: number, r: Rng = rng()): BtEnv {
  return {
    tick,
    rng: r,
    cond: (expr) => s.conds[expr] ?? false,
    act: (command, node) => {
      if (command === 'refuse') return null;
      s.acted.push(node.id);
      return node.id;
    },
    receipt: (h) => s.receipts[h],
    cancel: (h) => {
      s.cancelled.push(h);
    },
    say: (slot) => {
      s.said.push(slot);
      return s.sayOk;
    },
    score: (node) => s.scores[node.id] ?? 0,
    eventSince: (kind, since) => s.events.some((e) => e.kind === kind && e.tick >= since),
  };
}

const cond = (id: string, arg = id): BtNodeDef => ({ id, type: 'cond', arg });
const act = (id: string, arg = 'npc.move'): BtNodeDef => ({ id, type: 'act', arg });
const say = (id: string, arg = 'bark.work'): BtNodeDef => ({ id, type: 'say', arg });
const node = (id: string, type: BtNodeDef['type'], children: BtNodeDef[], arg?: string) => ({
  id,
  type,
  children,
  arg,
});
const deco = (id: string, d: BtNodeDef['deco'], child: BtNodeDef, arg?: string): BtNodeDef => ({
  id,
  type: 'deco',
  deco: d,
  arg,
  children: [child],
});

describe('behavior tree nodes', () => {
  it('cond, say and act leaves', () => {
    const s = script();
    const bb = new Blackboard();
    s.conds.hungry = true;
    expect(new BtRunner(cond('hungry')).tick(env(s, 0), bb)).toBe('success');
    expect(new BtRunner(cond('tired')).tick(env(s, 0), bb)).toBe('failure');
    expect(new BtRunner(say('s1')).tick(env(s, 0), bb)).toBe('success');
    s.sayOk = false;
    expect(new BtRunner(say('s2')).tick(env(s, 0), bb)).toBe('failure');
    expect(s.said).toEqual(['bark.work', 'bark.work']);
    // act: running until the receipt, then its result; submitted once
    const r = new BtRunner(act('go'));
    expect(r.tick(env(s, 0), bb)).toBe('running');
    expect(r.tick(env(s, 1), bb)).toBe('running');
    s.receipts.go = 'success';
    expect(r.tick(env(s, 2), bb)).toBe('success');
    expect(s.acted).toEqual(['go']);
    const f = new BtRunner(act('go2'));
    s.receipts.go2 = 'failure';
    expect(f.tick(env(s, 0), bb)).toBe('failure');
    expect(new BtRunner(act('no', 'refuse')).tick(env(s, 0), bb)).toBe('failure');
  });

  it('seq: in order, stops at the first failure, resumes a running child', () => {
    const s = script();
    const bb = new Blackboard();
    s.conds.a = true;
    const r = new BtRunner(node('root', 'seq', [cond('a'), act('go'), say('talk')]));
    expect(r.tick(env(s, 0), bb)).toBe('running');
    // the finished cond is not re-checked while go runs
    s.conds.a = false;
    expect(r.tick(env(s, 1), bb)).toBe('running');
    s.receipts.go = 'success';
    expect(r.tick(env(s, 2), bb)).toBe('success');
    expect(s.said).toEqual(['bark.work']);
    // a fresh run starts from the first child again, and a failure stops the sequence
    expect(r.tick(env(s, 3), bb)).toBe('failure');
    expect(s.acted).toEqual(['go']);
  });

  it('sel: first success wins, all failing fails', () => {
    const s = script();
    const bb = new Blackboard();
    const r = new BtRunner(node('root', 'sel', [cond('a'), cond('b'), say('talk')]));
    expect(r.tick(env(s, 0), bb)).toBe('success');
    expect(s.said).toEqual(['bark.work']);
    s.sayOk = false;
    expect(r.tick(env(s, 1), bb)).toBe('failure');
    s.conds.b = true;
    expect(r.tick(env(s, 2), bb)).toBe('success');
    expect(r.statuses().get('a')).toBe('failure');
    expect(r.statuses().get('b')).toBe('success');
    expect(r.statuses().has('talk')).toBe(false);
  });

  it('usel: highest score first, ties by id, the next one on failure', () => {
    const s = script();
    const bb = new Blackboard();
    const kids = [say('z_low', 'z'), say('m_tie', 'm'), say('a_tie', 'a')];
    s.scores = { z_low: 1, m_tie: 5, a_tie: 5 };
    expect(new BtRunner(node('u', 'usel', kids)).tick(env(s, 0), bb)).toBe('success');
    expect(s.said).toEqual(['a']);
    s.said = [];
    s.sayOk = false;
    expect(new BtRunner(node('u', 'usel', kids)).tick(env(s, 0), bb)).toBe('failure');
    expect(s.said).toEqual(['a', 'm', 'z']);
  });

  it('usel keeps the order fixed while a child runs', () => {
    const s = script();
    const bb = new Blackboard();
    s.scores = { x: 2, y: 1 };
    const r = new BtRunner(node('u', 'usel', [act('x'), act('y')]));
    expect(r.tick(env(s, 0), bb)).toBe('running');
    s.scores = { x: 0, y: 9 };
    s.receipts.x = 'failure';
    expect(r.tick(env(s, 1), bb)).toBe('running');
    expect(s.acted).toEqual(['x', 'y']);
  });

  it('par all: fails on the first failure (cancelling the rest), succeeds when all do', () => {
    const s = script();
    const bb = new Blackboard();
    const r = new BtRunner(node('p', 'par', [act('a'), act('b')], 'all'));
    expect(r.tick(env(s, 0), bb)).toBe('running');
    s.receipts.a = 'success';
    expect(r.tick(env(s, 1), bb)).toBe('running');
    s.receipts.b = 'success';
    expect(r.tick(env(s, 2), bb)).toBe('success');
    const s2 = script();
    const r2 = new BtRunner(node('p', 'par', [act('a'), act('b')]));
    expect(r2.tick(env(s2, 0), bb)).toBe('running');
    s2.receipts.a = 'failure';
    expect(r2.tick(env(s2, 1), bb)).toBe('failure');
    expect(s2.cancelled).toEqual(['b']);
  });

  it('par any: succeeds on the first success, fails when all fail', () => {
    const s = script();
    const bb = new Blackboard();
    const r = new BtRunner(node('p', 'par', [act('a'), act('b')], 'any'));
    expect(r.tick(env(s, 0), bb)).toBe('running');
    s.receipts.b = 'success';
    expect(r.tick(env(s, 1), bb)).toBe('success');
    expect(s.cancelled).toEqual(['a']);
    const s2 = script();
    const r2 = new BtRunner(node('p', 'par', [cond('x'), cond('y')], 'any'));
    expect(r2.tick(env(s2, 0), bb)).toBe('failure');
  });

  it('wait: a game duration or an event', () => {
    const s = script();
    const bb = new Blackboard();
    const r = new BtRunner({ id: 'w', type: 'wait', arg: '30m' });
    expect(r.tick(env(s, 100), bb)).toBe('running');
    expect(r.tick(env(s, 100 + 30 * TICKS_PER_GAME_MINUTE - 1), bb)).toBe('running');
    expect(r.tick(env(s, 100 + 30 * TICKS_PER_GAME_MINUTE), bb)).toBe('success');
    const e = new BtRunner({ id: 'w', type: 'wait', arg: 'event:bell' });
    s.events.push({ kind: 'bell', tick: 5 });
    expect(e.tick(env(s, 10), bb)).toBe('running');
    s.events.push({ kind: 'bell', tick: 12 });
    expect(e.tick(env(s, 12), bb)).toBe('success');
    const noEvents = { ...env(s, 0), eventSince: undefined };
    expect(new BtRunner({ id: 'w', type: 'wait', arg: 'event:x' }).tick(noEvents, bb)).toBe(
      'failure',
    );
  });

  it('parses durations in ticks and game time', () => {
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('30m')).toBe(30 * TICKS_PER_GAME_MINUTE);
    expect(parseDuration('2h')).toBe(2 * TICKS_PER_GAME_HOUR);
    expect(parseDuration('1d')).toBe(TICKS_PER_GAME_DAY);
    expect(parseDuration('x')).toBeNaN();
  });
});

describe('behavior tree decorators', () => {
  const bb = new Blackboard();

  it('invert flips success and failure, keeps running', () => {
    const s = script();
    expect(new BtRunner(deco('i', 'invert', cond('a'))).tick(env(s, 0), bb)).toBe('success');
    s.conds.a = true;
    expect(new BtRunner(deco('i', 'invert', cond('a'))).tick(env(s, 0), bb)).toBe('failure');
    expect(new BtRunner(deco('i', 'invert', act('go'))).tick(env(s, 0), bb)).toBe('running');
  });

  it('cooldown fails for the duration after the child finishes', () => {
    const s = script();
    const r = new BtRunner(deco('c', 'cooldown', say('hi'), '100'));
    expect(r.tick(env(s, 0), bb)).toBe('success');
    expect(r.tick(env(s, 99), bb)).toBe('failure');
    expect(r.tick(env(s, 100), bb)).toBe('success');
    expect(s.said.length).toBe(2);
  });

  it('once lets the child start once per game day', () => {
    const s = script();
    const r = new BtRunner(deco('o', 'once', say('hi')));
    const day0 = tickAtDay(0, 8);
    expect(r.tick(env(s, day0), bb)).toBe('success');
    expect(r.tick(env(s, tickAtDay(0, 23)), bb)).toBe('failure');
    expect(r.tick(env(s, tickAtDay(1, 0)), bb)).toBe('success');
  });

  it('timeout abandons a running child and cancels its command', () => {
    const s = script();
    const r = new BtRunner(deco('t', 'timeout', act('go'), '10'));
    expect(r.tick(env(s, 0), bb)).toBe('running');
    expect(r.tick(env(s, 9), bb)).toBe('running');
    expect(r.tick(env(s, 10), bb)).toBe('failure');
    expect(s.cancelled).toEqual(['go']);
  });

  it('chance draws once per run from the named stream, never while the child runs', () => {
    const s = script();
    const st = { s: 5 };
    const r = new BtRunner(deco('ch', 'chance', act('go'), '1'));
    expect(r.tick(env(s, 0, new Rng(st)), bb)).toBe('running');
    const after = st.s;
    expect(r.tick(env(s, 1, new Rng(st)), bb)).toBe('running');
    expect(st.s).toBe(after);
    expect(new BtRunner(deco('ch', 'chance', say('x'), '0')).tick(env(s, 0), bb)).toBe('failure');
    // the same stream state decides the same way
    const runs = (seed: number) =>
      Array.from({ length: 20 }, () => 0).map((_, i) =>
        new BtRunner(deco('ch', 'chance', say('x'), '0.5')).tick(env(s, i, rng(seed + i)), bb),
      );
    expect(runs(1)).toEqual(runs(1));
    expect(new Set(runs(1)).size).toBe(2);
  });

  it('guard checks every tick and abandons the child when it turns false', () => {
    const s = script();
    s.conds.safe = true;
    const r = new BtRunner(deco('g', 'guard', act('go'), 'safe'));
    expect(r.tick(env(s, 0), bb)).toBe('running');
    s.conds.safe = false;
    expect(r.tick(env(s, 1), bb)).toBe('failure');
    expect(s.cancelled).toEqual(['go']);
  });

  it('throttle allows n starts per window', () => {
    const s = script();
    const r = new BtRunner(deco('th', 'throttle', say('x'), '2,100'));
    expect(r.tick(env(s, 0), bb)).toBe('success');
    expect(r.tick(env(s, 10), bb)).toBe('success');
    expect(r.tick(env(s, 20), bb)).toBe('failure');
    expect(r.tick(env(s, 100), bb)).toBe('success');
  });

  it('abort clears the running branch but keeps decorator history', () => {
    const s = script();
    const r = new BtRunner(node('root', 'seq', [deco('c', 'cooldown', say('a'), '50'), act('go')]));
    expect(r.tick(env(s, 0), bb)).toBe('running');
    r.abort({ cancel: (h) => s.cancelled.push(h) });
    expect(s.cancelled).toEqual(['go']);
    expect(r.tick(env(s, 1), bb)).toBe('failure');
  });
});

describe('blackboard and tree checks', () => {
  it('holds a closed key set and reports changed keys', () => {
    const bb = new Blackboard();
    expect(BLACKBOARD_KEYS).toContain('target');
    bb.set('target', 'ron');
    bb.set('place', 'tavern');
    bb.set('target', 'ron');
    expect(bb.changed()).toEqual(['place', 'target']);
    expect(bb.changed()).toEqual([]);
    bb.delete('place');
    expect(bb.changed()).toEqual(['place']);
    expect(() => bb.set('mood' as never, 1)).toThrow();
  });

  it('finds structural and argument problems', () => {
    const bad: BtNodeDef = node('r', 'seq', [
      { id: 'dup', type: 'cond', arg: 'a1_witch_trial >= ' },
      { id: 'dup', type: 'act', arg: 'npc.fly' },
      { id: 's', type: 'say', arg: 'greet.purple' },
      { id: 'w', type: 'wait', arg: 'soon' },
      { id: 'd', type: 'deco', deco: 'chance', arg: '2', children: [] },
      { id: 't', type: 'deco', deco: 'throttle', arg: '0,10', children: [cond('x')] },
      { id: 'leaf', type: 'cond', arg: 'x', children: [cond('y')] },
      { id: 'e', type: 'sel', children: [] },
    ]);
    const problems = treeProblems(bad, {
      commands: new Set(['npc.move']),
      checkCondition,
      slotHasLines: (s) => s !== 'greet.purple',
    });
    const text = problems.join('\n');
    for (const want of [
      'node dup: condition does not parse',
      'node dup: duplicate id',
      'unknown command npc.fly',
      'slot greet.purple has no lines',
      'node w: wait needs',
      'node d: a decorator takes exactly one child',
      'node d: chance needs a probability',
      'node t: throttle needs',
      'node leaf: cond takes no children',
      'node e: sel needs children',
    ])
      expect(text).toContain(want);
    expect(() => new BtRunner(bad)).toThrow();
  });
});

// ---------------------------------------------------------------------------
describe('HTN planning', () => {
  const holds = (expr: string, st: Readonly<HtnState>) => evaluate(expr, (n) => st[n]);

  const domain: HtnDomain = {
    methods: [
      { task: 'investigate', pre: '', subtasks: ['ask_hero', 'report'], cost: 3 },
      { task: 'investigate', pre: 'priests_free', subtasks: ['ask_priest', 'report'], cost: 1 },
      { task: 'investigate', pre: '', subtasks: ['look', 'report'], cost: 3 },
    ],
    operators: [
      { task: 'ask_priest', command: 'goddess.oracle', params: { who: '$priest' }, etaHours: 2 },
      { task: 'ask_hero', command: 'goddess.oracle', params: { who: 'hero' }, etaHours: 4 },
      { task: 'look', command: 'goddess.sign', params: {}, etaHours: 1 },
      {
        task: 'report',
        command: 'goddess.note',
        params: {},
        etaHours: 0,
        expect: { investigated: 'true' },
      },
    ],
  };

  it('tries methods cheapest first, then in declaration order on equal cost', () => {
    const cheap = planHtn(domain, 'investigate', { priests_free: true }, holds, {
      bindings: { priest: 'cassian' },
    });
    expect(cheap.ok && cheap.plan.steps.map((s) => s.task)).toEqual(['ask_priest', 'report']);
    expect(cheap.ok && cheap.plan.steps[0]?.params).toEqual({ who: 'cassian' });
    expect(cheap.ok && cheap.plan.cost).toBe(1);
    // the precondition fails: the two cost-3 methods remain, the first declared wins
    const tie = planHtn(domain, 'investigate', {}, holds);
    expect(tie.ok && tie.plan.steps.map((s) => s.task)).toEqual(['ask_hero', 'report']);
  });

  it('backtracks to the next method when a later subtask cannot apply', () => {
    const d: HtnDomain = {
      methods: [
        { task: 'root', pre: '', subtasks: ['prep', 'strike'], cost: 1 },
        { task: 'root', pre: '', subtasks: ['wait'], cost: 2 },
      ],
      operators: [
        { task: 'prep', command: 'x.prep', params: {}, etaHours: 1, expect: { ready: 'false' } },
        { task: 'strike', command: 'x.strike', params: {}, etaHours: 1, pre: 'ready' },
        { task: 'wait', command: 'x.wait', params: {}, etaHours: 1 },
      ],
    };
    const r = planHtn(d, 'root', { ready: true }, holds);
    expect(r.ok && r.plan.steps.map((s) => s.task)).toEqual(['wait']);
    // expected effects feed later preconditions
    const d2: HtnDomain = {
      ...d,
      operators: d.operators.map((o) =>
        o.task === 'prep' ? { ...o, expect: { ready: 'true' } } : o,
      ),
    };
    const r2 = planHtn(d2, 'root', {}, holds);
    expect(r2.ok && r2.plan.steps.map((s) => s.task)).toEqual(['prep', 'strike']);
  });

  it('caps compound depth at 4, atoms at 12 and expansions at 200', () => {
    const chain = (levels: number): HtnDomain => ({
      methods: Array.from({ length: levels }, (_, i) => ({
        task: `c${i + 1}`,
        pre: '',
        subtasks: [i + 1 < levels ? `c${i + 2}` : 'leaf'],
        cost: 0,
      })),
      operators: [{ task: 'leaf', command: 'x', params: {}, etaHours: 0 }],
    });
    expect(planHtn(chain(4), 'c1', {}, holds).ok).toBe(true);
    expect(planHtn(chain(5), 'c1', {}, holds)).toMatchObject({ ok: false, reason: 'budget' });
    const wide: HtnDomain = {
      methods: [{ task: 'root', pre: '', subtasks: Array(13).fill('leaf'), cost: 0 }],
      operators: [{ task: 'leaf', command: 'x', params: {}, etaHours: 0 }],
    };
    expect(planHtn(wide, 'root', {}, holds)).toMatchObject({ ok: false, reason: 'budget' });
    const ok12 = {
      ...wide,
      methods: [{ task: 'root', pre: '', subtasks: Array(12).fill('leaf'), cost: 0 }],
    };
    expect(planHtn(ok12, 'root', {}, holds).ok).toBe(true);
    // many failing alternatives exhaust the expansion budget
    const many: HtnDomain = {
      methods: Array.from({ length: 300 }, () => ({
        task: 'root',
        pre: 'never',
        subtasks: ['leaf'],
        cost: 0,
      })),
      operators: [{ task: 'leaf', command: 'x', params: {}, etaHours: 0 }],
    };
    const r = planHtn(many, 'root', {}, holds);
    expect(r).toMatchObject({ ok: false, reason: 'budget' });
    expect(r.ok ? 0 : r.expanded).toBe(201);
  });

  it('inserts the registered omen before a hostile or P3 task, with its gap window', () => {
    const d: HtnDomain = {
      methods: [{ task: 'punish', pre: '', subtasks: ['arrest'], cost: 0 }],
      operators: [
        { task: 'notice', command: 'city.notice', params: {}, etaHours: 2 },
        { task: 'arrest', command: 'city.arrest', params: {}, etaHours: 6, perm: 'P3' },
      ],
      omens: { arrest: { task: 'notice', minHours: 24, maxHours: 72 } },
    };
    const r = planHtn(d, 'punish', {}, holds);
    expect(r.ok && r.plan.steps).toEqual([
      { task: 'notice', command: 'city.notice', params: {}, etaHours: 2, omenFor: 'arrest' },
      { task: 'arrest', command: 'city.arrest', params: {}, etaHours: 6, gapHours: [24, 72] },
    ]);
    // an omen the author already placed just before is not doubled
    const placed = {
      ...d,
      methods: [{ task: 'punish', pre: '', subtasks: ['notice', 'arrest'], cost: 0 }],
    };
    const r2 = planHtn(placed, 'punish', {}, holds);
    expect(r2.ok && r2.plan.steps.map((s) => s.task)).toEqual(['notice', 'arrest']);
    const hostile = {
      ...d,
      operators: [{ task: 'arrest', command: 'x', params: {}, etaHours: 1, hostileToPlayer: true }],
      omens: {},
    };
    expect(planHtn(hostile, 'punish', {}, holds)).toMatchObject({ ok: false, reason: 'no_omen' });
  });

  it('reports unknown tasks, unbound parameters and missing methods', () => {
    expect(planHtn(domain, 'conquer', {}, holds)).toMatchObject({
      ok: false,
      reason: 'unknown_task',
    });
    expect(planHtn(domain, 'investigate', { priests_free: true }, holds).ok).toBe(true);
    const onlyPriest: HtnDomain = {
      ...domain,
      methods: [domain.methods[1] as HtnDomain['methods'][0]],
    };
    expect(planHtn(onlyPriest, 'investigate', { priests_free: true }, holds)).toMatchObject({
      ok: false,
      reason: 'unbound',
    });
    expect(planHtn(onlyPriest, 'investigate', {}, holds)).toMatchObject({
      ok: false,
      reason: 'no_method',
    });
  });

  it('tracks execution and the four replan reasons', () => {
    const r = planHtn(domain, 'investigate', {}, holds);
    if (!r.ok) throw new Error('no plan');
    const p = startPlan('p1', r.plan, { priest: 'x' }, 100, 1000);
    expect(currentStep(p)).toBe('ask_hero');
    advancePlan(p);
    expect(currentStep(p)).toBe('report');
    advancePlan(p);
    expect(currentStep(p)).toBeNull();
    expect(replanReason(p, { tick: 500 })).toBeNull();
    expect(replanReason(p, { tick: 500, stepFailed: true })).toBe('step_failed');
    expect(replanReason(p, { tick: 500, preHolds: false })).toBe('pre_broken');
    expect(replanReason(p, { tick: 1001 })).toBe('expired');
    expect(replanReason(p, { tick: 500, currentUtility: 10, bestOtherUtility: 13 })).toBe(
      'better_goal',
    );
    expect(replanReason(p, { tick: 500, currentUtility: 10, bestOtherUtility: 12.9 })).toBeNull();
    expect(replanReason(p, { tick: 500, currentUtility: -10, bestOtherUtility: -7 })).toBe(
      'better_goal',
    );
  });

  it('checks a domain: unknown subtasks, cycles, depth and omens', () => {
    const bad: HtnDomain = {
      methods: [
        { task: 'a', pre: '', subtasks: ['b'], cost: 1 },
        { task: 'b', pre: '', subtasks: ['a', 'ghost'], cost: -1 },
        { task: 'd1', pre: 'x ==', subtasks: ['d2'], cost: 0 },
        { task: 'd2', pre: '', subtasks: ['d3'], cost: 0 },
        { task: 'd3', pre: '', subtasks: ['d4'], cost: 0 },
        { task: 'd4', pre: '', subtasks: ['d5'], cost: 0 },
        { task: 'd5', pre: '', subtasks: ['op'], cost: 0 },
      ],
      operators: [{ task: 'op', command: 'x', params: {}, etaHours: 0, perm: 'P3' }],
      omens: { other: { task: 'nope', minHours: 5, maxHours: 1 } },
    };
    const text = domainProblems(bad, { checkCondition }).join('\n');
    for (const want of [
      'unknown subtask ghost',
      'cost must be 0 or more',
      'methods form a cycle',
      'task d1: decomposes 5 compound levels deep',
      'operator op: hostile or P3 without a registered omen',
      'omen of other: unknown omen task nope',
      'the gap must be',
      'precondition does not parse',
    ])
      expect(text).toContain(want);
    expect(domainProblems(domain)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('rule tables', () => {
  const row = (id: string, priority: number, when = '', extra: Partial<RuleRow> = {}): RuleRow => ({
    id,
    when,
    priority,
    // biome-ignore lint/suspicious/noThenProperty: RuleRow.then is the action list of builtin_ai 2.5
    then: [{ action: id }],
    ...extra,
  });
  const flags: Record<string, boolean | string> = { feat: true };
  const renv = (tick = 0, act = 'act1') => ({
    tick,
    act,
    holds: (when: string) => evaluate(when, (n) => flags[n]),
  });

  it('firstMatch takes the highest priority row that holds', () => {
    const rows = [row('low', 1), row('high', 5, 'feat'), row('higher_off', 9, 'nothing')];
    expect(firstMatch(rows, renv())?.id).toBe('high');
    expect(allMatches(rows, renv()).map((r) => r.id)).toEqual(['high', 'low']);
    expect(firstMatch([row('x', 1, 'nothing')], renv())).toBeNull();
  });

  it('tie rule: equal priority without weights goes to the smallest id', () => {
    const rows = [row('react_b', 3), row('react_a', 3), row('react_c', 3)];
    expect(firstMatch(rows, renv())?.id).toBe('react_a');
    // with an rng but no declared weight, still the smallest id and no draw
    const st = { s: 9 };
    expect(firstMatch(rows, renv(), undefined, new Rng(st))?.id).toBe('react_a');
    expect(st.s).toBe(9);
    expect(allMatches(rows, renv()).map((r) => r.id)).toEqual(['react_a', 'react_b', 'react_c']);
  });

  it('tie rule: declared weights draw among equal-priority rows (missing weight is 1)', () => {
    const rows = [row('a', 3, '', { weight: 1 }), row('b', 3, '', { weight: 3 }), row('c', 3)];
    const seen: Record<string, number> = {};
    const r = rng(77);
    for (let i = 0; i < 500; i++) {
      const id = firstMatch(rows, renv(), undefined, r)?.id as string;
      seen[id] = (seen[id] ?? 0) + 1;
    }
    expect(Object.keys(seen).sort()).toEqual(['a', 'b', 'c']);
    expect(seen.b).toBeGreaterThan(seen.a as number);
    // no rng: the smallest id
    expect(firstMatch(rows, renv())?.id).toBe('a');
    // a lower priority row never joins the draw
    expect(firstMatch([row('top', 4), ...rows], renv(), undefined, rng(1))?.id).toBe('top');
  });

  it('cooldown and once (act, day, game) keep a fired row out', () => {
    const mem = newRuleMemory();
    const cd = row('cd', 1, '', { cooldownTicks: 100 });
    markFired(cd, renv(10), mem);
    expect(firstMatch([cd], renv(109), mem)).toBeNull();
    expect(firstMatch([cd], renv(110), mem)?.id).toBe('cd');
    const perAct = row('pa', 1, '', { once: 'act' });
    markFired(perAct, renv(0, 'act1'), mem);
    expect(firstMatch([perAct], renv(5, 'act1'), mem)).toBeNull();
    expect(firstMatch([perAct], renv(5, 'act2'), mem)?.id).toBe('pa');
    const perDay = row('pd', 1, '', { once: 'day' });
    markFired(perDay, renv(tickAtDay(0, 9)), mem);
    expect(firstMatch([perDay], renv(tickAtDay(0, 23)), mem)).toBeNull();
    expect(firstMatch([perDay], renv(tickAtDay(1, 0)), mem)?.id).toBe('pd');
    const ever = row('pg', 1, '', { once: 'game' });
    markFired(ever, renv(0), mem);
    expect(firstMatch([ever], renv(10 * TICKS_PER_GAME_DAY, 'act6'), mem)).toBeNull();
  });

  it('checks a table: ids, actions, weights and conditions', () => {
    const text = ruleProblems(
      [
        row('a', 1, 'x =='),
        row('a', 1),
        // biome-ignore lint/suspicious/noThenProperty: RuleRow.then is the action list of builtin_ai 2.5
        { id: 'b', when: '', priority: 1, then: [] },
        row('c', 1, '', { weight: 0 }),
      ],
      checkCondition,
    ).join('\n');
    for (const want of [
      'rule a: condition does not parse',
      'rule a: duplicate id',
      'rule b: no action',
      'rule c: weight must be positive',
    ])
      expect(text).toContain(want);
  });
});

// ---------------------------------------------------------------------------
describe('decision traces', () => {
  it('records the top three candidates with named terms, the winner, stream and draw', () => {
    const scored = ['walk', 'eat', 'sleep', 'pray'].map((id, i) =>
      scoreAction({ id, weight: 4 - i, gates: [{ name: 'need', value: 1 }] }),
    );
    const pick = pickBest(scored, { band: 0.5, rng: rng(4) });
    const t = traceOfPick('ron', 'npc.life', 1200, pick, 'npc.brain.ron');
    expect(t.top.map((c) => c.id)).toEqual(['walk', 'eat', 'sleep']);
    expect(t.top[0]?.terms.map((x) => x.name)).toEqual(['gate.need', 'W', 'G', 'M']);
    expect(t.chosen).toBe(pick.chosen?.id);
    expect(t.draw).toBe(pick.draw);
    expect(t.draw).toBeGreaterThanOrEqual(0);
    const idle = traceOfPick('x', 'k', 0, pickBest(scored, { idleScore: 99 }));
    expect(idle).toMatchObject({ chosen: '', draw: -1, stream: '' });
  });

  it('keeps a ring of the latest 32 traces per actor', () => {
    const book = new TraceBook();
    for (let i = 0; i < 40; i++)
      book.push({
        actor: i % 2 ? 'b' : 'a',
        kind: 'k',
        tick: i,
        top: [],
        chosen: '',
        stream: '',
        draw: -1,
      });
    for (let i = 0; i < 40; i++)
      book.push({
        actor: 'a',
        kind: 'k',
        tick: 100 + i,
        top: [],
        chosen: '',
        stream: '',
        draw: -1,
      });
    expect(book.recent('a').length).toBe(TRACE_RING);
    expect(book.recent('a')[0]?.tick).toBe(108);
    expect(book.recent('b').length).toBe(20);
    expect(book.actors()).toEqual(['a', 'b']);
    book.clear();
    expect(book.recent('a')).toEqual([]);
  });
});
