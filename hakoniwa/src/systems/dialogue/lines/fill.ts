// Filling a line (builtin_ai.md 7.9): the fill slots {player}, {place}, ... take the
// kernel's structured values. A pack line is emitted as its content text key with the
// values as parameters (D-077: the kernel never holds the sentence); the client fills the
// placeholders from the content table exactly as fill() would here. Pure.

import { joinText, type TextParam } from '../../../core/text';

/**
 * Replace {slot} markers; unknown slots are removed. A plain string when every slot used
 * holds a string or number; when one holds a TextRef (a kernel word such as the address
 * form), the line becomes a join of the content pieces and the slot values in order, so
 * it renders to exactly what the string fill would have given. `trim` drops the
 * surrounding whitespace of the whole line (of its first and last pieces).
 */
export function fill(
  text: string,
  vars: Record<string, TextParam | undefined>,
  trim = false,
): TextParam {
  const slot = /\{([a-z_]+)\}/g;
  let composite = false;
  for (const m of text.matchAll(slot)) {
    const v = vars[m[1] as string];
    if (v !== undefined && typeof v === 'object') composite = true;
  }
  if (!composite) {
    const out = text.replace(slot, (_m, k: string) => {
      const v = vars[k];
      return v === undefined || typeof v === 'object' ? '' : String(v);
    });
    return trim ? out.trim() : out;
  }
  const pieces: TextParam[] = [];
  let at = 0;
  for (const m of text.matchAll(slot)) {
    const index = m.index ?? 0;
    pieces.push(text.slice(at, index));
    const v = vars[m[1] as string];
    pieces.push(v === undefined ? '' : typeof v === 'number' ? String(v) : v);
    at = index + m[0].length;
  }
  pieces.push(text.slice(at));
  if (trim) {
    // like String.prototype.trim over the whole line: through leading and trailing plain
    // pieces until one keeps some text (a TextRef renders without surrounding whitespace)
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (typeof p !== 'string') break;
      pieces[i] = p.trimStart();
      if (pieces[i] !== '') break;
    }
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      if (typeof p !== 'string') break;
      pieces[i] = p.trimEnd();
      if (pieces[i] !== '') break;
    }
  }
  return joinText(
    'none',
    pieces.filter((x) => x !== ''),
  );
}

export const SLOT_PATTERN = /\{([a-z_]+)\}/g;

/**
 * Source text with a CJK character: what the content extractor keys (its CJK class,
 * src/shared_ui/content_text.ts). A line without one (`{catch}` alone) has nothing to
 * translate and no generated key, so it stays the filled text.
 */
export const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/**
 * A pack line as a text reference: its content key with the slots it uses as parameters.
 * Kept as the filled text when the extractor gives it no key (no CJK, `{catch}` alone) or
 * when trimming the filled line would cut into a value.
 * The client fills `{name}` placeholders exactly as fill() does here (a missing value
 * stays a placeholder there, so every used slot gets a value, '' when unset); a line with
 * nothing to show (only empty slots after trimming) gives ''.
 */
export function lineText(
  line: { zh: string; key: string },
  vars: Record<string, TextParam | undefined>,
): TextParam {
  const preview = fill(line.zh, vars, true);
  if (preview === '') return '';
  const params: Record<string, TextParam> = {};
  let any = false;
  for (const m of line.zh.matchAll(SLOT_PATTERN)) {
    const k = m[1] as string;
    const v = vars[k];
    params[k] = v === undefined ? '' : v;
    any = true;
  }
  if (!CJK.test(line.zh) || line.zh !== line.zh.trim() || hasEdgeSlot(line.zh, vars))
    return preview;
  return any ? { key: line.key, params } : { key: line.key };
}

/** True when trimming the filled line would cut into a slot value (keep the filled form). */
function hasEdgeSlot(text: string, vars: Record<string, TextParam | undefined>): boolean {
  for (const m of text.matchAll(SLOT_PATTERN)) {
    const v = vars[m[1] as string];
    if (typeof v === 'string' && v !== v.trim()) return true;
  }
  return false;
}
