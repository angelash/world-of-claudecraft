// V10 proper nouns (release_engineering.md 7.4; reuse_map.md 6.1 and 6.3 item 3): the
// content data and the interface text hit no proper noun of the main project (its zones,
// bosses and named NPCs, coined skill and specialization names, brand terms) and no title
// or coined name of a known work. Lists: tools/content/names/woc_names.json (extracted from
// the main project) and known_works.json. Latin names match case-insensitively on word
// boundaries, Chinese names as substrings. Every prose string is scanned (identifier-like
// values such as `sk_war_heroicstrike` are ids, not prose; reuse_map.md 6.2). Every
// category blocks; ./names_reviewed.json lists the known first-round hits with
// the package that renames them (they warn until that milestone, a stale entry is an error).

import knownWorks from '../names/known_works.json';
import wocNames from '../names/woc_names.json';
import reviewedFile from './names_reviewed.json';
import {
  type Finding,
  milestoneIndex,
  type NameList,
  type ValidationInput,
  type Validator,
} from './types';

export interface ReviewedName {
  /** data file (path under data/) */
  file: string;
  name: string;
  /** milestone label from which the hit blocks */
  until: string;
  reason: string;
}

export const REVIEWED_NAMES: readonly ReviewedName[] = (reviewedFile as { entries: ReviewedName[] })
  .entries;

type Bilingual = { en: string[]; zh: string[] };

/** The shipped lists: one per main-project category, plus the known works. */
export function defaultNameLists(): NameList[] {
  const out: NameList[] = [];
  const cats = (wocNames as { categories: Record<string, Bilingual> }).categories;
  for (const [cat, lists] of Object.entries(cats)) {
    const category = `woc.${cat}`;
    out.push({
      category,
      blockingFrom: 0,
      names: [...lists.en, ...lists.zh],
    });
  }
  const works = knownWorks as Bilingual;
  out.push({ category: 'works', blockingFrom: 0, names: [...works.en, ...works.zh] });
  return out;
}

/** An interface text table flattened to dotted keys (the uiText input V10 scans). */
export function flattenText(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (v: unknown, key: string) => {
    if (typeof v === 'string') out[key] = v;
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v as Record<string, unknown>))
        visit(x, key ? `${key}.${k}` : k);
  };
  visit(value, prefix);
  return out;
}

const LATIN = /^[\x20-\x7e]+$/;
const IDENT = /^[a-z0-9_.:#<>/-]*$/;

interface Matcher {
  list: NameList;
  name: string;
  test(text: string): boolean;
}

function matchers(lists: readonly NameList[]): Matcher[] {
  const out: Matcher[] = [];
  for (const list of lists) {
    for (const name of list.names) {
      if (name.trim() === '') continue;
      if (LATIN.test(name)) {
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(^|[^A-Za-z0-9])${esc}($|[^A-Za-z0-9])`, 'i');
        out.push({ list, name, test: (t) => re.test(t) });
      } else out.push({ list, name, test: (t) => t.includes(name) });
    }
  }
  return out;
}

function prose(v: unknown, path: string, out: { path: string; value: string }[]): void {
  if (typeof v === 'string') {
    if (!IDENT.test(v)) out.push({ path, value: v });
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => {
      prose(x, `${path}[${i}]`, out);
    });
  } else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v as Record<string, unknown>))
      prose(x, path ? `${path}.${k}` : k, out);
}

export function nameFindings(
  input: Pick<ValidationInput, 'files' | 'milestone' | 'names' | 'uiText'>,
  reviewed: readonly ReviewedName[] = REVIEWED_NAMES,
): Finding[] {
  const ms = matchers(input.names ?? defaultNameLists());
  const out: Finding[] = [];
  const used = new Set<ReviewedName>();
  const scan = (source: string, path: string, text: string, file?: string) => {
    for (const m of ms) {
      if (!m.test(text)) continue;
      const r = file ? reviewed.find((e) => e.file === file && e.name === m.name) : undefined;
      if (r) used.add(r);
      const waived = !!r && input.milestone < milestoneIndex(r.until);
      const blocks = input.milestone >= m.list.blockingFrom && !waived;
      out.push({
        level: blocks ? 'error' : 'warning',
        message: `${source} ${path}: ${m.list.category} name '${m.name}'${waived && r ? `; reviewed, blocks from ${r.until}: ${r.reason}` : ''}`,
        file,
        path,
      });
    }
  };
  for (const [file, data] of input.files) {
    const strings: { path: string; value: string }[] = [];
    prose(data, '', strings);
    for (const s of strings) scan(file, s.path, s.value, file);
  }
  for (const [key, text] of Object.entries(input.uiText ?? {})) scan('ui text', key, text);
  for (const r of reviewed)
    if (!used.has(r))
      out.push({
        level: 'error',
        message: `names_reviewed.json: ${r.file} '${r.name}' matches no hit (remove the stale entry)`,
        file: r.file,
      });
  return out;
}

export const namesValidator: Validator = {
  id: 'V10',
  title: 'proper nouns',
  run: (input) => nameFindings(input),
};
