// Condition expressions in the reveal-ledger syntax (docs/30_story/reveal_ledger.md 0.4,
// docs/40_design/systems/quests_and_events.md 4): AND, OR, NOT, comparisons, IN, HAS,
// COUNT, MIN, MAX and parentheses. Pure and deterministic: no time, no randomness, no
// model. The left operand of a comparison is a variable; a bare identifier on the
// right is an enum literal (for example `a1_oola_fate == cleared`).

import type { FlagValue } from '../../core/contracts';

export type Resolver = (name: string) => FlagValue | undefined;

type Node =
  | { t: 'lit'; v: FlagValue }
  | { t: 'var'; name: string }
  | { t: 'not'; e: Node }
  | { t: 'and'; a: Node; b: Node }
  | { t: 'or'; a: Node; b: Node }
  | { t: 'cmp'; op: string; a: Node; b: Node }
  | { t: 'in'; a: Node; items: Node[] }
  | { t: 'has'; a: Node; b: Node }
  | { t: 'fn'; name: 'COUNT' | 'MIN' | 'MAX'; args: Node[] };

interface Token {
  k: 'id' | 'num' | 'str' | 'op' | 'lp' | 'rp' | 'comma';
  v: string;
}

const ACT_INDEX: Record<string, number> = {
  prologue: 0,
  act1: 1,
  act2: 2,
  act3: 3,
  act4: 4,
  act5: 5,
  act6: 6,
  epilogue: 7,
};

/** Numeric index of an act flag value ('act3' -> 3); NaN when not an act name. */
export function actIndex(value: FlagValue | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value in ACT_INDEX) return ACT_INDEX[value] as number;
  return Number.NaN;
}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '(') {
      out.push({ k: 'lp', v: c });
      i++;
      continue;
    }
    if (c === ')') {
      out.push({ k: 'rp', v: c });
      i++;
      continue;
    }
    if (c === ',') {
      out.push({ k: 'comma', v: c });
      i++;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '>=' || two === '<=') {
      out.push({ k: 'op', v: two });
      i += 2;
      continue;
    }
    if (c === '>' || c === '<') {
      out.push({ k: 'op', v: c });
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new Error(`unterminated string in condition: ${src}`);
      out.push({ k: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const num = /^-?\d+(\.\d+)?/.exec(src.slice(i));
    if (num && (c === '-' || /\d/.test(c))) {
      out.push({ k: 'num', v: num[0] });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(src.slice(i));
    if (id) {
      out.push({ k: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    throw new Error(`unexpected character '${c}' in condition: ${src}`);
  }
  return out;
}

class Parser {
  private pos = 0;
  constructor(
    private readonly toks: Token[],
    private readonly src: string,
  ) {}

  parse(): Node {
    const n = this.or();
    if (this.pos < this.toks.length) this.fail('trailing tokens');
    return n;
  }

  private peek(): Token | undefined {
    return this.toks[this.pos];
  }

  private isKw(word: string): boolean {
    const t = this.peek();
    return !!t && t.k === 'id' && t.v === word;
  }

  private fail(msg: string): never {
    throw new Error(`${msg} in condition: ${this.src}`);
  }

  private or(): Node {
    let a = this.and();
    while (this.isKw('OR')) {
      this.pos++;
      a = { t: 'or', a, b: this.and() };
    }
    return a;
  }

  private and(): Node {
    let a = this.not();
    while (this.isKw('AND')) {
      this.pos++;
      a = { t: 'and', a, b: this.not() };
    }
    return a;
  }

  private not(): Node {
    if (this.isKw('NOT')) {
      this.pos++;
      return { t: 'not', e: this.not() };
    }
    return this.cmp();
  }

  private cmp(): Node {
    const a = this.operand(false);
    const t = this.peek();
    if (t?.k === 'op') {
      this.pos++;
      return { t: 'cmp', op: t.v, a, b: this.operand(true) };
    }
    if (this.isKw('IN')) {
      this.pos++;
      if (this.peek()?.k !== 'lp') this.fail('IN needs a list');
      this.pos++;
      const items: Node[] = [];
      while (this.peek() && this.peek()?.k !== 'rp') {
        items.push(this.operand(true));
        if (this.peek()?.k === 'comma') this.pos++;
      }
      if (this.peek()?.k !== 'rp') this.fail('unclosed IN list');
      this.pos++;
      return { t: 'in', a, items };
    }
    if (this.isKw('HAS')) {
      this.pos++;
      return { t: 'has', a, b: this.operand(true) };
    }
    return a;
  }

  private operand(literalIds: boolean): Node {
    const t = this.peek();
    if (!t) this.fail('unexpected end');
    if (t.k === 'lp') {
      this.pos++;
      const e = this.or();
      if (this.peek()?.k !== 'rp') this.fail('missing )');
      this.pos++;
      return e;
    }
    if (t.k === 'num') {
      this.pos++;
      return { t: 'lit', v: Number(t.v) };
    }
    if (t.k === 'str') {
      this.pos++;
      return { t: 'lit', v: t.v };
    }
    if (t.k === 'id') {
      this.pos++;
      if ((t.v === 'COUNT' || t.v === 'MIN' || t.v === 'MAX') && this.peek()?.k === 'lp') {
        this.pos++;
        const args: Node[] = [];
        while (this.peek() && this.peek()?.k !== 'rp') {
          args.push(this.or());
          if (this.peek()?.k === 'comma') this.pos++;
        }
        if (this.peek()?.k !== 'rp') this.fail('unclosed function call');
        this.pos++;
        return { t: 'fn', name: t.v, args };
      }
      if (t.v === 'true') return { t: 'lit', v: true };
      if (t.v === 'false') return { t: 'lit', v: false };
      if (t.v === 'AND' || t.v === 'OR' || t.v === 'NOT') this.fail(`misplaced ${t.v}`);
      return literalIds ? { t: 'lit', v: t.v } : { t: 'var', name: t.v };
    }
    return this.fail(`unexpected token ${t.v}`);
  }
}

const cache = new Map<string, Node>();

function compile(src: string): Node {
  let n = cache.get(src);
  if (!n) {
    n = new Parser(tokenize(src), src).parse();
    cache.set(src, n);
  }
  return n;
}

/** Throws a readable error when the expression does not parse (used by content validation). */
export function checkCondition(src: string): string | null {
  try {
    compile(src);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export function truthy(v: FlagValue | undefined): boolean {
  if (v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return v !== '' && v !== 'false' && v !== '0';
}

function toNum(v: FlagValue | undefined): number {
  if (v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  if (!Number.isNaN(n)) return n;
  const a = actIndex(v);
  return Number.isNaN(a) ? Number.NaN : a;
}

function compare(op: string, a: FlagValue | undefined, b: FlagValue | undefined): boolean {
  const numeric = typeof b === 'number' || typeof a === 'number';
  if (numeric) {
    const x = toNum(a);
    const y = toNum(b);
    if (Number.isNaN(x) || Number.isNaN(y)) return op === '!=';
    switch (op) {
      case '==':
        return x === y;
      case '!=':
        return x !== y;
      case '>=':
        return x >= y;
      case '<=':
        return x <= y;
      case '>':
        return x > y;
      case '<':
        return x < y;
    }
    return false;
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const x = truthy(a);
    const y = truthy(b);
    return op === '==' ? x === y : op === '!=' ? x !== y : false;
  }
  const x = a === undefined ? '' : String(a);
  const y = b === undefined ? '' : String(b);
  if (op === '==') return x === y;
  if (op === '!=') return x !== y;
  return compare(op, toNum(x), toNum(y));
}

function value(n: Node, r: Resolver): FlagValue | undefined {
  switch (n.t) {
    case 'lit':
      return n.v;
    case 'var':
      return r(n.name);
    case 'fn': {
      if (n.name === 'COUNT') return n.args.filter((a) => truthy(value(a, r))).length;
      const nums = n.args.map((a) => toNum(value(a, r)));
      if (nums.length === 0) return 0;
      return n.name === 'MIN' ? Math.min(...nums) : Math.max(...nums);
    }
    default:
      return evalNode(n, r);
  }
}

function evalNode(n: Node, r: Resolver): boolean {
  switch (n.t) {
    case 'not':
      return !evalNode(n.e, r);
    case 'and':
      return evalNode(n.a, r) && evalNode(n.b, r);
    case 'or':
      return evalNode(n.a, r) || evalNode(n.b, r);
    case 'cmp':
      return compare(n.op, value(n.a, r), value(n.b, r));
    case 'in': {
      const a = value(n.a, r);
      return n.items.some((it) => compare('==', a, value(it, r)));
    }
    case 'has': {
      const set = value(n.a, r);
      const item = String(value(n.b, r) ?? '');
      if (typeof set !== 'string' || set === '') return false;
      return set.split(',').includes(item);
    }
    default:
      return truthy(value(n, r));
  }
}

/** Evaluate an expression; empty or missing expressions are true. */
export function evaluate(src: string | undefined, resolve: Resolver): boolean {
  if (!src || src.trim() === '') return true;
  return evalNode(compile(src), resolve);
}

/** Every variable name an expression references (for editor dependency graphs). */
export function referencedVars(src: string): string[] {
  const out = new Set<string>();
  const walk = (n: Node): void => {
    switch (n.t) {
      case 'var':
        out.add(n.name);
        return;
      case 'not':
        walk(n.e);
        return;
      case 'and':
      case 'or':
      case 'cmp':
        walk(n.a);
        walk(n.b);
        return;
      case 'in':
        walk(n.a);
        for (const i of n.items) walk(i);
        return;
      case 'has':
        walk(n.a);
        walk(n.b);
        return;
      case 'fn':
        for (const a of n.args) walk(a);
        return;
      default:
        return;
    }
  };
  walk(compile(src));
  return [...out];
}

/**
 * Standard resolver over world flags plus a few built-ins: `act` (numeric when compared
 * with numbers through actIndex), `ai_enabled`, `day`.
 */
export function flagResolver(
  flags: Record<string, FlagValue>,
  extra?: Record<string, FlagValue>,
): Resolver {
  return (name) => {
    if (extra && name in extra) return extra[name];
    return flags[name];
  };
}
