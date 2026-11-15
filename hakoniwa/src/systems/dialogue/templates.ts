// Rule line templates (the no-model voice, npc_society_ai.md 14): lookup by dotted key
// with fallback to shorter keys, persona-specific overrides, and slot filling.

import type { ContentMap } from '../../core/contracts';
import type { Rng } from '../../core/rng';
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

/** Replace {slot} markers; unknown slots are removed. */
export function fill(text: string, vars: Record<string, string | number | undefined>): string {
  return text.replace(/\{([a-z_]+)\}/g, (_m, k: string) => {
    const v = vars[k];
    return v === undefined ? '' : String(v);
  });
}

/** Pick and fill one line; returns '' when no template exists for the key chain. */
export function pickLine(
  content: Pick<ContentMap, 'dialogueTemplates'>,
  key: string,
  vars: Record<string, string | number | undefined>,
  rng: Rng,
  persona?: PersonaCard,
): string {
  const lines = linesFor(content, key, persona);
  if (lines.length === 0) return '';
  const catchphrase =
    persona && persona.voice.catchphrases.length > 0 ? rng.pick(persona.voice.catchphrases) : '';
  return fill(rng.pick(lines), { catch: catchphrase, ...vars }).trim();
}
