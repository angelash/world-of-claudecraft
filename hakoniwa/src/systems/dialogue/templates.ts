// Rule line templates (the no-model voice, npc_society_ai.md 14): lookup by dotted key
// with fallback to shorter keys, persona-specific overrides, and slot filling.

import type { ContentMap } from '../../core/contracts';
import type { Rng } from '../../core/rng';
import { joinText, type TextParam } from '../../core/text';
import type { PersonaCard } from '../npc/types';
import type { DialogueTemplate } from './types';

const cache = new WeakMap<object, Map<string, DialogueTemplate>>();

function index(content: Pick<ContentMap, 'dialogueTemplates'>): Map<string, DialogueTemplate> {
  let idx = cache.get(content);
  if (!idx) {
    idx = new Map((content.dialogueTemplates ?? []).map((t) => [t.id, t]));
    cache.set(content, idx);
  }
  return idx;
}

/** Lines for a key, trying 'a.b.c', then 'a.b', then 'a'; persona overrides win per level. */
export function linesFor(
  content: Pick<ContentMap, 'dialogueTemplates'>,
  key: string,
  persona?: PersonaCard,
): string[] {
  const parts = key.split('.');
  for (let n = parts.length; n > 0; n--) {
    const k = parts.slice(0, n).join('.');
    const own = persona?.lines?.[k];
    if (own && own.length > 0) return own;
    const t = index(content).get(k);
    if (t && t.lines.length > 0) return t.lines;
  }
  return [];
}

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

/** Pick and fill one line; returns '' when no template exists for the key chain. */
export function pickLine(
  content: Pick<ContentMap, 'dialogueTemplates'>,
  key: string,
  vars: Record<string, TextParam | undefined>,
  rng: Rng,
  persona?: PersonaCard,
): TextParam {
  const lines = linesFor(content, key, persona);
  if (lines.length === 0) return '';
  const catchphrase =
    persona && persona.voice.catchphrases.length > 0 ? rng.pick(persona.voice.catchphrases) : '';
  return fill(rng.pick(lines), { catch: catchphrase, ...vars }, true);
}
