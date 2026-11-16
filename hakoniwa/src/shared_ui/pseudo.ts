// Pseudo-localization `qps-wide` (ux_and_onboarding.md 20.6; release_engineering.md 8.2):
// every Han character becomes two accented Latin letters and the whole string is wrapped in
// full-width corner brackets (PSEUDO_OPEN, PSEUDO_CLOSE), so overflow and clipping show before English arrives and any string that is not
// wrapped is hard-coded (it never went through a table). Placeholders, plural and select
// syntax, and digits pass through untouched, so the pseudo table renders with the same
// parameters as the source. Built from the source table at run time, in dev builds only.
// Pure and deterministic.

/** The pseudo-locale id (BCP 47 private-use). */
export const PSEUDO_LANG = 'qps-wide';

/** Accented Latin letters the transform draws from (two per Han character). */
const ACCENTED = 'àáâãäåèéêëìíîïòóôõöùúûüýÿñçāēīōūăĕĭŏŭąęįųőűŵŷ';

/** CJK ideographs (unified, extension A, compatibility). */
function isHan(c: number): boolean {
  return (
    (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff)
  );
}

/** Two letters for one Han character, picked from its code point (same input, same output). */
function widen(c: number): string {
  const a = ACCENTED[c % ACCENTED.length] as string;
  const b = ACCENTED[Math.floor(c / ACCENTED.length) % ACCENTED.length] as string;
  return a + b;
}

/** The opening and closing marks of a pseudo string. */
export const PSEUDO_OPEN = '【';
export const PSEUDO_CLOSE = '】';

/** Widen the Han characters of a plain text run (no placeholders inside). */
function widenRun(text: string): string {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    out += isHan(c) ? widen(c) : ch;
  }
  return out;
}

/**
 * The pseudo form of one template: Han characters widened outside placeholders; the text
 * inside the branches of a plural or select placeholder widened too; the whole wrapped in
 * PSEUDO_OPEN and PSEUDO_CLOSE. An empty template stays empty (it renders nothing either way).
 */
export function pseudoTemplate(template: string): string {
  if (template === '') return '';
  return PSEUDO_OPEN + widenTemplate(template) + PSEUDO_CLOSE;
}

const BRANCHED = /^\{\s*\w+\s*,\s*(plural|select)\s*,/;

function widenTemplate(t: string): string {
  let out = '';
  let i = 0;
  while (i < t.length) {
    const open = t.indexOf('{', i);
    if (open < 0) {
      out += widenRun(t.slice(i));
      break;
    }
    out += widenRun(t.slice(i, open));
    const close = matchBrace(t, open);
    if (close < 0) {
      out += widenRun(t.slice(open));
      break;
    }
    const inner = t.slice(open, close + 1);
    const head = BRANCHED.exec(inner);
    out += head ? head[0] + widenBranches(inner.slice(head[0].length, -1)) + '}' : inner;
    i = close + 1;
  }
  return out;
}

/** `name {text} name {text}`: the branch names stay, the texts are widened. */
function widenBranches(body: string): string {
  let out = '';
  let i = 0;
  while (i < body.length) {
    const open = body.indexOf('{', i);
    if (open < 0) {
      out += body.slice(i);
      break;
    }
    const close = matchBrace(body, open);
    if (close < 0) {
      out += body.slice(i);
      break;
    }
    out += body.slice(i, open + 1) + widenTemplate(body.slice(open + 1, close)) + '}';
    i = close + 1;
  }
  return out;
}

function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

/** True for a string the pseudo transform produced (wrapped in 【】). */
export function isPseudoText(s: string): boolean {
  return s.startsWith(PSEUDO_OPEN) && s.endsWith(PSEUDO_CLOSE);
}

/**
 * The pseudo table of a source table. Separators and joiners (sys.common.join.*, the
 * window list separators ui.*.list_sep, sys.common.money.sep, sys.common.duration.sep) and
 * the date and season parts keep their source value, so lists, amounts and dates are not
 * wrapped piece by piece.
 */
export function pseudoTable(source: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(source)) {
    out[k] = KEEP.test(k) ? v : pseudoTemplate(v);
  }
  return out;
}

const KEEP =
  /^(sys\.common\.(join\.|money\.sep$|duration\.sep$|date\.|season\.)|ui\.[a-z0-9_.]*\.list_sep$)/;
