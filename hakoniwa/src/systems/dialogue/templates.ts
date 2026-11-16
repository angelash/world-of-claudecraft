// Rule line templates (the no-model voice, npc_society_ai.md 14): lookup by dotted legacy
// key with fallback to shorter keys, persona-specific overrides, and slot filling. The
// lines live in the line packs now (data/dialogue/lines/, PK-M0-25); a legacy key reads
// its slice of a pack slot through ./lines/legacy.ts, and a picked pack line is emitted as
// its content text key (D-077) with the fill values as parameters, never as a sentence.

import type { ContentMap } from '../../core/contracts';
import type { Rng } from '../../core/rng';
import type { TextParam } from '../../core/text';
import type { PersonaCard } from '../npc/types';
import { CJK, fill, lineText } from './lines/fill';
import { type LegacyLine, legacyLines } from './lines/legacy';

export { fill };

type LineSource = Pick<ContentMap, 'linePacks' | 'legacyLines'>;

interface Picked {
  /** persona override lines are the persona card's own text (content of the npcs table) */
  own?: string[];
  pack?: LegacyLine[];
}

function lookup(content: LineSource, key: string, persona?: PersonaCard): Picked {
  const parts = key.split('.');
  for (let n = parts.length; n > 0; n--) {
    const k = parts.slice(0, n).join('.');
    const own = persona?.lines?.[k];
    if (own && own.length > 0) return { own };
    const pack = legacyLines(content, k);
    if (pack.length > 0) return { pack };
  }
  return {};
}

/** Lines for a key, trying 'a.b.c', then 'a.b', then 'a'; persona overrides win per level. */
export function linesFor(content: LineSource, key: string, persona?: PersonaCard): string[] {
  const p = lookup(content, key, persona);
  return p.own ?? p.pack?.map((l) => l.zh) ?? [];
}

/** Pick and fill one line; returns '' when no template exists for the key chain. */
export function pickLine(
  content: LineSource,
  key: string,
  vars: Record<string, TextParam | undefined>,
  rng: Rng,
  persona?: PersonaCard,
): TextParam {
  const p = lookup(content, key, persona);
  const count = p.own?.length ?? p.pack?.length ?? 0;
  if (count === 0) return '';
  const catchphrase =
    persona && persona.voice.catchphrases.length > 0 ? rng.pick(persona.voice.catchphrases) : '';
  const all = { catch: catchphrase, ...vars };
  if (p.own) return fill(rng.pick(p.own), all, true);
  return lineText(rng.pick(p.pack as LegacyLine[]), all);
}

/**
 * The first line of a key (with the same shorter-key fallback) as a text reference: a
 * phrase part such as a feat or a rumor fragment, placed by the caller's own template;
 * '' when the key chain has no line.
 */
export function firstLine(content: LineSource, key: string): TextParam {
  const line = lookup(content, key).pack?.[0];
  if (!line) return '';
  return CJK.test(line.zh) ? { key: line.key } : line.zh;
}
