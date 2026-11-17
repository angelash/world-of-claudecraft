// Behavior trees of the built-in AI (builtin_ai.md 2.2): functional-role duties,
// companions, regiments, heroes and leaders' errands. Trees are data (data/ai/bt/*.json)
// with stable node ids; the runner keeps per-node memory so a running branch resumes
// where it was. A tree does not tick every frame: the owning system advances it when an
// action's receipt arrives, a watched blackboard key changes, or the actor's evaluation
// beat comes round. Pure and deterministic: randomness only through the Rng in the env.

import type { Rng } from '../rng';
import {
  calendarAt,
  TICKS_PER_GAME_DAY,
  TICKS_PER_GAME_HOUR,
  TICKS_PER_GAME_MINUTE,
} from '../time';
import { byScoreThenId } from './utility';

export type BtStatus = 'success' | 'failure' | 'running';

export const BT_NODE_TYPES = [
  'seq',
  'sel',
  'usel',
  'par',
  'cond',
  'act',
  'say',
  'wait',
  'deco',
] as const;
export type BtNodeType = (typeof BT_NODE_TYPES)[number];

export const BT_DECORATORS = [
  'cooldown',
  'once',
  'timeout',
  'chance',
  'guard',
  'invert',
  'throttle',
] as const;
export type BtDecorator = (typeof BT_DECORATORS)[number];

/**
 * One node of a tree (builtin_ai 18). `arg` by type: cond and guard a condition; act a
 * command kind; say a line slot; wait a duration or `event:<kind>`; par `all` (default)
 * or `any`; cooldown and timeout a duration; chance a probability; throttle `n,<duration>`.
 * Durations are ticks, or game time with a unit: `30m`, `2h`, `1d`.
 */
export interface BtNodeDef {
  id: string;
  type: BtNodeType;
  deco?: BtDecorator;
  arg?: string;
  children?: BtNodeDef[];
}

/** Blackboard keys: a closed set (builtin_ai 2.2); values are stable ids or numbers. */
export const BLACKBOARD_KEYS = [
  'target',
  'place',
  'item',
  'topic',
  'threat',
  'order',
  'quest',
] as const;
export type BlackboardKey = (typeof BLACKBOARD_KEYS)[number];
export type BlackboardValue = string | number;

export function isBlackboardKey(k: string): k is BlackboardKey {
  return (BLACKBOARD_KEYS as readonly string[]).includes(k);
}

/**
 * One actor's blackboard. Never saved: after a load the owning system rebuilds it from
 * the world. `changed()` hands out the keys written since the last call, so the system
 * can wake the tree on a watched key.
 */
export class Blackboard {
  private readonly values = new Map<BlackboardKey, BlackboardValue>();
  private readonly dirty = new Set<BlackboardKey>();

  get(key: BlackboardKey): BlackboardValue | undefined {
    return this.values.get(key);
  }

  has(key: BlackboardKey): boolean {
    return this.values.has(key);
  }

  set(key: BlackboardKey, value: BlackboardValue): void {
    if (!isBlackboardKey(key)) throw new Error(`unknown blackboard key ${String(key)}`);
    if (this.values.get(key) === value) return;
    this.values.set(key, value);
    this.dirty.add(key);
  }

  delete(key: BlackboardKey): void {
    if (this.values.delete(key)) this.dirty.add(key);
  }

  /** Keys written since the last call, sorted; clears the set. */
  changed(): BlackboardKey[] {
    const out = [...this.dirty].sort();
    this.dirty.clear();
    return out;
  }
}

/** What a tree reaches the world through (the owning system implements it). */
export interface BtEnv {
  tick: number;
  /** the actor's named stream (chance) */
  rng: Rng;
  /** a condition: a reveal-ledger expression or a registered predicate */
  cond(expr: string, bb: Blackboard): boolean;
  /** submit a kernel command; its handle, or null when it could not be submitted */
  act(command: string, node: BtNodeDef, bb: Blackboard): string | null;
  /** the receipt of a submitted command, or undefined while it is pending */
  receipt(handle: string): 'success' | 'failure' | undefined;
  /** the branch running the command was abandoned */
  cancel?(handle: string): void;
  /** choose and submit a line of `slot`; false when nothing could be said */
  say(slot: string, node: BtNodeDef, bb: Blackboard): boolean;
  /** utility score of a usel child (builtin_ai 2.1); 0 when absent */
  score?(node: BtNodeDef, bb: Blackboard): number;
  /** an event of `kind` happened at or after `sinceTick` */
  eventSince?(kind: string, sinceTick: number): boolean;
}

/** A duration argument in ticks: `90` ticks, `30m`, `2h`, `1d` game time; NaN when malformed. */
export function parseDuration(arg: string | undefined): number {
  const m = /^(\d+(?:\.\d+)?)([mhd]?)$/.exec((arg ?? '').trim());
  if (!m) return Number.NaN;
  const v = Number(m[1]);
  const unit =
    m[2] === 'm'
      ? TICKS_PER_GAME_MINUTE
      : m[2] === 'h'
        ? TICKS_PER_GAME_HOUR
        : m[2] === 'd'
          ? TICKS_PER_GAME_DAY
          : 1;
  return Math.round(v * unit);
}

/** `n,<duration>` of throttle; null when malformed. */
export function parseThrottle(arg: string | undefined): { n: number; span: number } | null {
  const [a, b] = (arg ?? '').split(',');
  const n = Number(a);
  const span = parseDuration(b);
  if (!Number.isInteger(n) || n < 1 || !(span > 0)) return null;
  return { n, span };
}

/** Per-run memory of a node (cleared when the node finishes or is abandoned). */
interface RunMem {
  index?: number;
  /** usel: child ids in score order, fixed when the node starts */
  order?: string[];
  start?: number;
  handle?: string;
  /** par: finished children */
  results?: Record<string, BtStatus>;
  /** decorators: the child is mid-run */
  running?: boolean;
}

/** Decorator memory that outlives a run (cooldown, once, throttle). */
interface KeepMem {
  readyAt?: number;
  day?: number;
  uses?: number[];
}

/**
 * The saved form of a runner (builtin_ai.md 2.2 and 18): the per-run memory of the nodes
 * mid-run (resume points, usel orders, pending command handles) and the decorator history
 * that outlives a run (cooldown, once, throttle), keyed by stable node id. Plain JSON, so
 * an owning system keeps it in its slice: after a load the tree resumes where it was and a
 * `once` that fired today does not fire again.
 */
export interface BtRunnerState {
  run: Record<string, RunMem>;
  keep: Record<string, KeepMem>;
}

/** A deep copy of plain node memory (number arrays and records only). */
function copyMem<T extends object>(m: T): T {
  return JSON.parse(JSON.stringify(m)) as T;
}

/**
 * Runs one actor's tree. Composite nodes remember the running child; seq and sel do not
 * re-check finished children (no reactive re-evaluation: a guard decorator gives that
 * where it is wanted). Abandoned branches cancel their pending commands.
 */
export class BtRunner {
  private readonly run = new Map<string, RunMem>();
  private readonly keep = new Map<string, KeepMem>();
  private statusesNow = new Map<string, BtStatus>();

  constructor(readonly root: BtNodeDef) {
    const problems = treeProblems(root);
    if (problems.length > 0) throw new Error(`bad behavior tree: ${problems.join('; ')}`);
  }

  /** Advance the tree once; the root's status. */
  tick(env: BtEnv, bb: Blackboard): BtStatus {
    this.statusesNow = new Map();
    return this.exec(this.root, env, bb);
  }

  /** Status of every node visited by the last tick (the live view of builtin_ai 15). */
  statuses(): ReadonlyMap<string, BtStatus> {
    return this.statusesNow;
  }

  /** Abandon the running branch (cancelling pending commands); decorator history stays. */
  abort(env: Pick<BtEnv, 'cancel'>): void {
    this.drop(this.root, env);
  }

  /**
   * The runner's memory as saveable JSON (copies, sorted by node id): the running branch
   * and the decorator history. Pair with restore() to survive a save and load, or to run one
   * tree for many actors with one runner (restore the actor's state, tick, snapshot).
   */
  snapshot(): BtRunnerState {
    const run: Record<string, RunMem> = {};
    for (const id of [...this.run.keys()].sort()) run[id] = copyMem(this.run.get(id) as RunMem);
    const keep: Record<string, KeepMem> = {};
    for (const id of [...this.keep.keys()].sort()) {
      const k = this.keep.get(id) as KeepMem;
      if (k.readyAt === undefined && k.day === undefined && (k.uses?.length ?? 0) === 0) continue;
      keep[id] = copyMem(k);
    }
    return { run, keep };
  }

  /**
   * Replace the runner's memory with a saved state (copied in); memory of node ids the tree
   * no longer has is dropped, so a tree edited between save and load starts those fresh.
   */
  restore(state: BtRunnerState | undefined): void {
    this.run.clear();
    this.keep.clear();
    this.statusesNow = new Map();
    if (!state) return;
    const ids = new Set<string>();
    const visit = (n: BtNodeDef) => {
      ids.add(n.id);
      for (const c of n.children ?? []) visit(c);
    };
    visit(this.root);
    for (const [id, m] of Object.entries(state.run ?? {}))
      if (ids.has(id)) this.run.set(id, copyMem(m));
    for (const [id, k] of Object.entries(state.keep ?? {}))
      if (ids.has(id)) this.keep.set(id, copyMem(k));
  }

  private mem(node: BtNodeDef): RunMem {
    let m = this.run.get(node.id);
    if (!m) {
      m = {};
      this.run.set(node.id, m);
    }
    return m;
  }

  private kept(node: BtNodeDef): KeepMem {
    let m = this.keep.get(node.id);
    if (!m) {
      m = {};
      this.keep.set(node.id, m);
    }
    return m;
  }

  private done(node: BtNodeDef, status: BtStatus): BtStatus {
    if (status !== 'running') this.run.delete(node.id);
    this.statusesNow.set(node.id, status);
    return status;
  }

  private drop(node: BtNodeDef, env: Pick<BtEnv, 'cancel'>): void {
    const m = this.run.get(node.id);
    if (m?.handle !== undefined) env.cancel?.(m.handle);
    this.run.delete(node.id);
    for (const c of node.children ?? []) this.drop(c, env);
  }

  private exec(node: BtNodeDef, env: BtEnv, bb: Blackboard): BtStatus {
    switch (node.type) {
      case 'seq':
        return this.ordered(node, node.children ?? [], env, bb, 'failure');
      case 'sel':
        return this.ordered(node, node.children ?? [], env, bb, 'success');
      case 'usel': {
        const m = this.mem(node);
        const kids = node.children ?? [];
        // an order restored from a save of an older tree is redrawn rather than trusted, and
        // the run under it starts over (its resume index pointed into the old order)
        const stale =
          !!m.order &&
          (m.order.length !== kids.length || m.order.some((id) => !kids.some((c) => c.id === id)));
        if (stale) {
          delete m.index;
          for (const c of kids) this.drop(c, env);
        }
        if (!m.order || stale) {
          m.order = kids
            .map((c) => ({ id: c.id, score: env.score?.(c, bb) ?? 0 }))
            .sort(byScoreThenId)
            .map((c) => c.id);
        }
        const byId = new Map(kids.map((c) => [c.id, c]));
        const order = m.order.map((id) => byId.get(id) as BtNodeDef);
        return this.ordered(node, order, env, bb, 'success');
      }
      case 'par':
        return this.parallel(node, env, bb);
      case 'cond':
        return this.done(node, env.cond(node.arg ?? '', bb) ? 'success' : 'failure');
      case 'say':
        return this.done(node, env.say(node.arg ?? '', node, bb) ? 'success' : 'failure');
      case 'act': {
        const m = this.mem(node);
        if (m.handle === undefined) {
          const handle = env.act(node.arg ?? '', node, bb);
          if (handle === null) return this.done(node, 'failure');
          m.handle = handle;
        }
        const r = env.receipt(m.handle);
        return this.done(node, r ?? 'running');
      }
      case 'wait': {
        const m = this.mem(node);
        m.start ??= env.tick;
        const arg = node.arg ?? '';
        if (arg.startsWith('event:')) {
          if (!env.eventSince) return this.done(node, 'failure');
          return this.done(node, env.eventSince(arg.slice(6), m.start) ? 'success' : 'running');
        }
        return this.done(node, env.tick - m.start >= parseDuration(arg) ? 'success' : 'running');
      }
      case 'deco':
        return this.decorate(node, env, bb);
    }
  }

  /**
   * seq (stop on failure) and sel (stop on success) over `kids` in order, resuming at the
   * remembered child.
   */
  private ordered(
    node: BtNodeDef,
    kids: readonly BtNodeDef[],
    env: BtEnv,
    bb: Blackboard,
    stopOn: 'success' | 'failure',
  ): BtStatus {
    const m = this.mem(node);
    for (let i = m.index ?? 0; i < kids.length; i++) {
      const s = this.exec(kids[i] as BtNodeDef, env, bb);
      if (s === 'running') {
        m.index = i;
        return this.done(node, 'running');
      }
      if (s === stopOn) return this.done(node, stopOn);
    }
    return this.done(node, stopOn === 'failure' ? 'success' : 'failure');
  }

  /**
   * par: every unfinished child runs each tick, in order, until the outcome is decided (a
   * failure under `all`, a success under `any`); the children not yet reached that tick
   * are not started, and the ones still running are abandoned.
   */
  private parallel(node: BtNodeDef, env: BtEnv, bb: Blackboard): BtStatus {
    const m = this.mem(node);
    m.results ??= {};
    const results = m.results;
    const kids = node.children ?? [];
    const all = node.arg !== 'any';
    const decisive: BtStatus = all ? 'failure' : 'success';
    for (const c of kids) {
      if (results[c.id] !== undefined) continue;
      const s = this.exec(c, env, bb);
      if (s !== 'running') results[c.id] = s;
      if (s === decisive) break;
    }
    const settle = (status: BtStatus): BtStatus => {
      for (const c of kids) if (results[c.id] === undefined) this.drop(c, env);
      return this.done(node, status);
    };
    const statuses = kids.map((c) => results[c.id]);
    if (all) {
      if (statuses.includes('failure')) return settle('failure');
      if (statuses.every((s) => s === 'success')) return settle('success');
    } else {
      if (statuses.includes('success')) return settle('success');
      if (statuses.every((s) => s === 'failure')) return settle('failure');
    }
    return this.done(node, 'running');
  }

  private decorate(node: BtNodeDef, env: BtEnv, bb: Blackboard): BtStatus {
    const child = (node.children ?? [])[0] as BtNodeDef;
    const m = this.mem(node);
    const k = this.kept(node);
    const runChild = (after?: (s: BtStatus) => void): BtStatus => {
      const s = this.exec(child, env, bb);
      if (s === 'running') {
        m.running = true;
        return this.done(node, 'running');
      }
      after?.(s);
      return this.done(node, s);
    };
    switch (node.deco) {
      case 'invert': {
        const s = this.exec(child, env, bb);
        return this.done(
          node,
          s === 'running' ? 'running' : s === 'success' ? 'failure' : 'success',
        );
      }
      case 'cooldown': {
        if (!m.running && k.readyAt !== undefined && env.tick < k.readyAt)
          return this.done(node, 'failure');
        return runChild(() => {
          k.readyAt = env.tick + parseDuration(node.arg);
        });
      }
      case 'once': {
        if (!m.running) {
          const today = calendarAt(env.tick).dayIndex;
          if (k.day === today) return this.done(node, 'failure');
          k.day = today;
        }
        return runChild();
      }
      case 'timeout': {
        m.start ??= env.tick;
        if (env.tick - m.start >= parseDuration(node.arg)) {
          this.drop(child, env);
          return this.done(node, 'failure');
        }
        return runChild();
      }
      case 'chance': {
        if (!m.running && !env.rng.chance(Number(node.arg))) return this.done(node, 'failure');
        return runChild();
      }
      case 'guard': {
        if (!env.cond(node.arg ?? '', bb)) {
          this.drop(child, env);
          return this.done(node, 'failure');
        }
        return runChild();
      }
      case 'throttle': {
        const t = parseThrottle(node.arg) as { n: number; span: number };
        k.uses = (k.uses ?? []).filter((at) => env.tick - at < t.span);
        if (!m.running) {
          if (k.uses.length >= t.n) return this.done(node, 'failure');
          k.uses.push(env.tick);
        }
        return runChild();
      }
      default:
        return this.done(node, 'failure');
    }
  }
}

export interface TreeCheckOptions {
  /** kernel command kinds an act may submit */
  commands?: ReadonlySet<string>;
  /** parse check of a cond or guard expression: null when fine, else the problem */
  checkCondition?(expr: string): string | null;
  /** whether a say slot has lines for the tree's speakers */
  slotHasLines?(slot: string): boolean;
}

const COMPOSITE: ReadonlySet<BtNodeType> = new Set(['seq', 'sel', 'usel', 'par']);
const LEAF: ReadonlySet<BtNodeType> = new Set(['cond', 'act', 'say', 'wait']);

/** Problems of a tree (content validation, builtin_ai 2.2 and 15). */
export function treeProblems(root: BtNodeDef, opts: TreeCheckOptions = {}): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const visit = (n: BtNodeDef): void => {
    const at = `node ${n.id || '(no id)'}`;
    if (!n.id) out.push('node without an id');
    else if (ids.has(n.id)) out.push(`${at}: duplicate id`);
    ids.add(n.id);
    const kids = n.children ?? [];
    if (!(BT_NODE_TYPES as readonly string[]).includes(n.type)) {
      out.push(`${at}: unknown type ${String(n.type)}`);
      return;
    }
    if (COMPOSITE.has(n.type) && kids.length === 0) out.push(`${at}: ${n.type} needs children`);
    if (LEAF.has(n.type) && kids.length > 0) out.push(`${at}: ${n.type} takes no children`);
    if (n.type === 'par' && n.arg !== undefined && n.arg !== 'all' && n.arg !== 'any')
      out.push(`${at}: par policy must be all or any`);
    const arg = (n.arg ?? '').trim();
    const needsCondition = n.type === 'cond' || (n.type === 'deco' && n.deco === 'guard');
    if (needsCondition) {
      if (!arg) out.push(`${at}: missing condition`);
      else {
        const bad = opts.checkCondition?.(arg);
        if (bad) out.push(`${at}: condition does not parse: ${bad}`);
      }
    }
    if (n.type === 'act') {
      if (!arg) out.push(`${at}: act needs a command`);
      else if (opts.commands && !opts.commands.has(arg)) out.push(`${at}: unknown command ${arg}`);
    }
    if (n.type === 'say') {
      if (!arg) out.push(`${at}: say needs a slot`);
      else if (opts.slotHasLines && !opts.slotHasLines(arg))
        out.push(`${at}: slot ${arg} has no lines`);
    }
    if (n.type === 'wait' && !arg.startsWith('event:') && !(parseDuration(arg) >= 0))
      out.push(`${at}: wait needs a duration or event:<kind>`);
    if (n.type === 'deco') {
      if (!n.deco || !(BT_DECORATORS as readonly string[]).includes(n.deco))
        out.push(`${at}: unknown decorator ${String(n.deco)}`);
      if (kids.length !== 1) out.push(`${at}: a decorator takes exactly one child`);
      if ((n.deco === 'cooldown' || n.deco === 'timeout') && !(parseDuration(arg) > 0))
        out.push(`${at}: ${n.deco} needs a positive duration`);
      if (n.deco === 'chance') {
        const p = Number(arg);
        if (!arg || !(p >= 0 && p <= 1)) out.push(`${at}: chance needs a probability 0 to 1`);
      }
      if (n.deco === 'throttle' && !parseThrottle(arg))
        out.push(`${at}: throttle needs n,<duration>`);
    }
    for (const c of kids) visit(c);
  };
  visit(root);
  return out;
}
