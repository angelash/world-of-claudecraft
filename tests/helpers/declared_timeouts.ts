// Pure scraper for DECLARED vitest timeouts in a test file's source text.
// Consumed by tests/suite_duration_budget.test.ts (the anti-whale ratchet) and
// driven directly by that consumer's inline source fixtures, so the parsing
// semantics are pinned by execution rather than assumed. The guard is this
// module's fixtures and tests/declared_timeout_values.test.ts are its executable
// specification, including complete platform expressions and formatted tails.
//
// The parser is a masking scanner, not a bare regex, because the first cut's
// unanchored regexes were caught counting spawn options
// (execFileSync(..., { timeout: 300_000 })), ordinary function arguments
// (someOptions({...}, 120_000)), fixture objects inside test bodies, and
// numbers inside string literals. Pass 1 masks comments and string CONTENTS
// (indices preserved), so nothing quoted can ever count; pass 2 finds
// REGISTRATION HEADS (it/test/bench/describe, their .each curried form and
// dotted modifiers, the four hooks, and vi.setConfig), bracket-matches each
// call's argument span, splits it at top-level commas, and reads timeouts only
// from the two places vitest defines them:
//   - a trailing numeric (or FLAG ? full : diet ternary) argument; the DIET
//     (second) arm counts, because that is the PR-time allowance, and the
//     sweep arm runs on the nightly, which runs the whole suite regardless;
//   - a literal process.platform === 'win32' conditional counts the larger
//     arm, so the ledger is conservative and independent of the review host;
//     it may also be the diet arm of a numeric FULL_SWEEP conditional;
//   - a top-level options-object argument's timeout / testTimeout /
//     hookTimeout keys (vi.setConfig's object counts the same way, since a
//     file-wide testTimeout is a per-test allowance on every test in the
//     file).
// A timeout bound to a BARE identifier resolves through a same-file
// unique module-level const binding with a supported complete value expression;
// imports, shadowed bindings and anything else
// unresolvable is reported in `unparsed`
// rather than silently skipped, and the consumer fails the suite on it, so
// moving an allowance behind an opaque constant cannot evade the ledger.
//
// Values at or below the repo default testTimeout (20s, vite.config.ts) are
// ignored: a declaration that lowers a test's allowance is not added
// allowance (vitest's HOOK default is 10s, so a 10-to-20s hook declaration is
// technically added allowance this floor ignores; recorded, accepted).
// Deliberate limitations, stated where the consumer states its contract: this
// reads ALLOWANCES, not runtimes; describe-body collection work and it.each
// expansion are invisible; a describe-level timeout counts ONCE though it
// applies to every case in the block; hook timeouts count as single
// allowances (a hook is a serial chain too).

import { moduleTimeoutConstants } from './timeout_bindings';
import { timeoutValue } from './timeout_values';

export interface DeclaredTimeouts {
  perTest: number[];
  sum: number;
  /** Timeout declarations whose complete expression cannot be sized. */
  unparsed: string[];
}

// Count only allowances strictly above the repo default testTimeout of 20s.
const MIN_COUNTED_MS = 20_001;

// The dotted suffix is restricted to vitest's REAL modifiers: an unrestricted
// `(?:\.\w+)*` let an ordinary method call on a local variable named `test`
// (tests/lockpick_controller.test.ts has `test.controller.end(...)`) parse as
// a registration head and mint phantom allowances from its numeric arguments.
const HEAD_RE =
  /(?:\b(?:it|test|bench|describe)\b(?:\.(?:only|skip|todo|fails|concurrent|sequential|shuffle|each|for|skipIf|runIf|extend)\b)*|\b(?:beforeAll|beforeEach|afterAll|afterEach)\b|\bvi\.setConfig)\s*\(/g;

/**
 * Replace comment text and string CONTENTS with spaces, preserving length and
 * indices. Template literals mask to spaces too, with `${` re-entering code
 * state so brackets inside interpolations still balance.
 */
export function maskCommentsAndStrings(source: string): string {
  const out = source.split('');
  type State = 'code' | 'line' | 'block' | 'single' | 'double' | 'template' | 'regex';
  const stack: State[] = [];
  let state: State = 'code';
  // The last significant code character, for the division-vs-regex-literal
  // decision: a `/` after a value continues an expression (division); after an
  // operator, opener, or line start it begins a regex literal. Without this
  // state a regex containing an odd number of quotes (`/it's/`) flipped the
  // scanner into string state and silently masked the rest of the file.
  let lastCode = '';
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === 'code') {
      if (ch === '/' && next === '/') {
        state = 'line';
        out[i] = ' ';
      } else if (ch === '/' && next === '*') {
        state = 'block';
        out[i] = ' ';
      } else if (ch === '/' && (lastCode === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(lastCode))) {
        state = 'regex';
        inClass = false;
      } else if (ch === "'") state = 'single';
      else if (ch === '"') state = 'double';
      else if (ch === '`') state = 'template';
      else if (ch === '}' && stack.length > 0) {
        // Close of a template interpolation: back into the template.
        state = stack.pop() as State;
      }
      if (state === 'code' && !/\s/.test(ch)) lastCode = ch;
      continue;
    }
    if (state === 'regex') {
      if (ch === '\\') {
        out[i] = ' ';
        if (i + 1 < source.length && source[i + 1] !== '\n') out[i + 1] = ' ';
        i++;
        continue;
      }
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      if ((ch === '/' && !inClass) || ch === '\n') {
        state = 'code';
        lastCode = '/';
        continue;
      }
      out[i] = ' ';
      continue;
    }
    if (state === 'line') {
      if (ch === '\n') state = 'code';
      else out[i] = ' ';
      continue;
    }
    if (state === 'block') {
      if (ch === '*' && next === '/') {
        out[i] = ' ';
        out[i + 1] = ' ';
        i++;
        state = 'code';
      } else if (ch !== '\n') out[i] = ' ';
      continue;
    }
    // Inside a string. Quotes stay visible; contents mask to spaces.
    if (ch === '\\') {
      out[i] = ' ';
      if (i + 1 < source.length && source[i + 1] !== '\n') out[i + 1] = ' ';
      i++;
      continue;
    }
    if (state === 'single' && ch === "'") state = 'code';
    else if (state === 'double' && ch === '"') state = 'code';
    else if (state === 'template' && ch === '`') state = 'code';
    else if (state === 'template' && ch === '$' && next === '{') {
      out[i] = ' ';
      // Leave the `{` visible so bracket depth stays balanced with the `}`.
      stack.push('template');
      state = 'code';
      i++;
    } else if (ch !== '\n') out[i] = ' ';
  }
  return out.join('');
}

/** Index just past the matching close paren, or -1 when unbalanced. */
function matchParen(masked: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** Split a call's argument span at top-level commas (masked indices). */
function splitArgs(masked: string, start: number, end: number): { from: number; to: number }[] {
  const args: { from: number; to: number }[] = [];
  let depth = 0;
  let from = start;
  for (let i = start; i < end; i++) {
    const ch = masked[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      args.push({ from, to: i });
      from = i + 1;
    }
  }
  if (masked.slice(from, end).trim()) args.push({ from, to: end });
  return args;
}

const IDENT_ARG_RE = /^\s*([A-Za-z_$][\w$.]*)\s*,?\s*$/;

export function declaredTimeouts(source: string): DeclaredTimeouts {
  const masked = maskCommentsAndStrings(source);
  const perTest: number[] = [];
  const unparsed: string[] = [];
  const record = (value: number) => {
    if (value >= MIN_COUNTED_MS) perTest.push(value);
  };
  const resolving = new Set<string>();
  let constants: ReturnType<typeof moduleTimeoutConstants> | undefined;
  const resolveConst = (name: string): number | null => {
    if (!/^[A-Za-z_$][\w$]*$/.test(name) || resolving.has(name)) return null;
    constants ??= moduleTimeoutConstants(source);
    const binding = constants.get(name);
    if (!binding) return null;
    resolving.add(name);
    try {
      return timeoutValue(
        masked.slice(binding.from, binding.to),
        source.slice(binding.from, binding.to),
        resolveConst,
      );
    } finally {
      resolving.delete(name);
    }
  };

  for (const head of masked.matchAll(HEAD_RE)) {
    const isSetConfig = head[0].includes('setConfig');
    const isHook = /^(?:before|after)/.test(head[0]);
    let open = head.index + head[0].length - 1;
    let close = matchParen(masked, open);
    if (close < 0) continue;
    // The curried it.each(TABLE)('title', fn, timeout) form: the registration
    // arguments live in the SECOND call group.
    const following = masked.slice(close).match(/^\s*\(/);
    if (following && !isSetConfig && !isHook) {
      open = close + following[0].length - 1;
      close = matchParen(masked, open);
      if (close < 0) continue;
    }
    const args = splitArgs(masked, open + 1, close - 1);
    for (const [argIndex, arg] of args.entries()) {
      const maskedArg = masked.slice(arg.from, arg.to);
      const sourceArg = source.slice(arg.from, arg.to);
      const trimmed = maskedArg.trim();
      if (trimmed.startsWith('{')) {
        // A top-level options object (or setConfig's config object): read its
        // timeout keys at the object's own top level only, so a nested
        // fixture cannot count.
        const objectOpen = arg.from + maskedArg.indexOf('{');
        const objectClose = matchParen(masked, objectOpen);
        if (objectClose < 0) continue;
        for (const property of splitArgs(masked, objectOpen + 1, objectClose - 1)) {
          const key = /^\s*(timeout|testTimeout|hookTimeout)\s*:/.exec(
            masked.slice(property.from, property.to),
          );
          if (!key) continue;
          const from = property.from + key[0].length;
          const value = timeoutValue(
            masked.slice(from, property.to),
            source.slice(from, property.to),
            resolveConst,
          );
          if (value !== null) record(value);
          else unparsed.push(`${key[1]}: ${source.slice(from, property.to).trim().slice(0, 80)}`);
        }
        continue;
      }
      // Only a LAST argument can be the trailing timeout form.
      if (argIndex !== args.length - 1 || argIndex === 0 || isSetConfig) continue;
      const value = timeoutValue(maskedArg, sourceArg, resolveConst);
      if (value !== null) {
        record(value);
        continue;
      }
      const ident = maskedArg.match(IDENT_ARG_RE);
      // Position decides for every unsupported form, including a callback
      // reference or an unparenthesized arrow followed by a bare identifier.
      // A test-fn after an options object remains outside the timeout slot.
      const prev = masked.slice(args[argIndex - 1].from, args[argIndex - 1].to).trim();
      const prevIsFunction = /^(?:async\b|function\b|\()/.test(prev);
      const timeoutSlot = prevIsFunction || isHook || (argIndex >= 2 && !prev.startsWith('{'));
      if (timeoutSlot) {
        unparsed.push(
          ident
            ? `trailing ${ident[1]} (${sourceArg.trim().slice(0, 40)})`
            : `trailing expression (${sourceArg.trim().slice(0, 80)})`,
        );
      }
    }
  }
  return { perTest, sum: perTest.reduce((total, value) => total + value, 0), unparsed };
}
