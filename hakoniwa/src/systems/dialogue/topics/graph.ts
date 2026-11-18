// The topic graph as an index (builtin_ai.md 6.2): topics by id, the topics a free-text
// entity names (`aliases`: persona, map or map/location ids and lexicon words), and the
// keyword groups of a free-text question (`keywords`). Pure; cached per content map.

import type { ContentMap } from '../../../core/contracts';
import type { TopicDef } from './types';

interface TopicIndex {
  byId: Map<string, TopicDef>;
  /** subject (entity id or word) -> topics naming it, in data order */
  bySubject: Map<string, TopicDef[]>;
}

const cache = new WeakMap<object, TopicIndex>();

function indexOf(content: Pick<ContentMap, 'topics'>): TopicIndex {
  let idx = cache.get(content);
  if (idx) return idx;
  const byId = new Map<string, TopicDef>();
  const bySubject = new Map<string, TopicDef[]>();
  for (const t of content.topics ?? []) {
    byId.set(t.id, t);
    for (const s of t.aliases ?? []) {
      const list = bySubject.get(s) ?? [];
      list.push(t);
      bySubject.set(s, list);
    }
  }
  idx = { byId, bySubject };
  cache.set(content, idx);
  return idx;
}

export function topicById(content: Pick<ContentMap, 'topics'>, id: string): TopicDef | undefined {
  return indexOf(content).byId.get(id);
}

export function allTopics(content: Pick<ContentMap, 'topics'>): readonly TopicDef[] {
  return content.topics ?? [];
}

/** Topics an entity names (a person's own `person_` topic first, then data order). */
export function topicsOfSubject(
  content: Pick<ContentMap, 'topics'>,
  subject: string,
): readonly TopicDef[] {
  const idx = indexOf(content);
  const own = idx.byId.get(`person_${subject}`);
  const listed = idx.bySubject.get(subject) ?? [];
  return own && !listed.includes(own) ? [own, ...listed] : listed;
}

/**
 * How many of a topic's keyword groups the text hits (one per group with any of its words);
 * the text is the classifier's normalized input, so words compare as typed.
 */
export function askHits(t: TopicDef, text: string): number {
  let n = 0;
  for (const group of t.keywords ?? []) if (group.some((w) => w !== '' && text.includes(w))) n++;
  return n;
}

/**
 * The topics a free-text question names by keyword, best first (more groups hit, then the
 * longer matched word, then data order); `filter` narrows the candidates (a prefix, the
 * speaker's open topics).
 */
export function topicsAsked(
  content: Pick<ContentMap, 'topics'>,
  text: string,
  filter: (t: TopicDef) => boolean = () => true,
): TopicDef[] {
  const scored: { t: TopicDef; hits: number; len: number; at: number }[] = [];
  (content.topics ?? []).forEach((t, at) => {
    if (!filter(t)) return;
    const hits = askHits(t, text);
    if (hits === 0) return;
    let len = 0;
    for (const g of t.keywords ?? [])
      for (const w of g) if (text.includes(w)) len = Math.max(len, w.length);
    scored.push({ t, hits, len, at });
  });
  scored.sort((a, b) => b.hits - a.hits || b.len - a.len || a.at - b.at);
  return scored.map((s) => s.t);
}
