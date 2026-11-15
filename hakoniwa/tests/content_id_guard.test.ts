// Content ID guard (release_engineering.md 13.2, RE-12): systems read content ids from
// data, never from code. Collects the entity ids of data/ (maps, sites, markets, persons,
// goddesses, items, monsters, doors, quests, scenes, plus nations, provinces, regions and
// act 6 evidence) and fails on any string literal in src/systems/** or src/core/** equal
// to one, unless tests/fixtures/content_id_allowlist.json lists it (the systems list is
// pinned empty). The autoplayer (src/game/autoplay/) has its own list; its route tables
// live in data/autoplay/routes.json, checked here against the content.
//
// Vocabulary words: until the content namespaces (content_bible.md 12) prefix every id,
// some bare ids are also words of a closed code vocabulary (door 'settlement' and the site
// kind, item 'stone' and the tile kind). A literal is such a word when its system declares
// it in a closed vocabulary (a union of string literal types or an `as const` array) that
// also holds a word that is no id; then the literal is the vocabulary word, not the id.
// Ids of persons, goddesses, sites, markets, quests, scenes, nations and evidence can never
// be vocabulary, and a union or array of ids only (the old GoddessId) is itself a hit.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import type { ContentMap } from '../src/core/contracts';
import { ENDING_ROUTES } from '../src/game/autoplay';
import { routeProblems } from '../src/game/autoplay/routes';
import allowlist from './fixtures/content_id_allowlist.json';

const ROOT = join(__dirname, '..');

/** Entity tables of the guard: table name, kind label, and whether it can be vocabulary. */
const KINDS: { table: keyof ContentMap; kind: string; protectedKind: boolean }[] = [
  { table: 'maps', kind: 'map', protectedKind: false },
  { table: 'atlas_maps', kind: 'map', protectedKind: false },
  { table: 'atlas_regions', kind: 'region', protectedKind: false },
  { table: 'slg_provinces', kind: 'province', protectedKind: false },
  { table: 'items', kind: 'item', protectedKind: false },
  { table: 'monsters', kind: 'monster', protectedKind: false },
  { table: 'doors', kind: 'door', protectedKind: false },
  { table: 'city_sites', kind: 'site', protectedKind: true },
  { table: 'markets', kind: 'market', protectedKind: true },
  { table: 'npcs', kind: 'person', protectedKind: true },
  { table: 'companions', kind: 'person', protectedKind: true },
  { table: 'goddesses', kind: 'goddess', protectedKind: true },
  { table: 'quests', kind: 'quest', protectedKind: true },
  { table: 'scenes', kind: 'scene', protectedKind: true },
  { table: 'slg_nations', kind: 'nation', protectedKind: true },
  { table: 'evidence', kind: 'evidence', protectedKind: true },
];

interface IdIndex {
  /** id -> kinds it names */
  kinds: Map<string, Set<string>>;
  /** ids that can never be a vocabulary word */
  protectedIds: Set<string>;
}

function indexContent(content: ContentMap): IdIndex {
  const kinds = new Map<string, Set<string>>();
  const protectedIds = new Set<string>();
  for (const k of KINDS) {
    const rows = (content as unknown as Record<string, unknown>)[k.table];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const id = (row as { id?: unknown }).id;
      if (typeof id !== 'string' || id === '') continue;
      if (!kinds.has(id)) kinds.set(id, new Set());
      kinds.get(id)?.add(k.kind);
      if (k.protectedKind) protectedIds.add(id);
    }
  }
  return { kinds, protectedIds };
}

interface Hit {
  /** path relative to the project root, with forward slashes */
  file: string;
  line: number;
  id: string;
  kinds: string[];
}

interface Literal {
  text: string;
  line: number;
  /** index of the closed vocabulary group the literal declares, or -1 for a plain literal */
  group: number;
}

function isConstAssertion(n: ts.Node): n is ts.AsExpression {
  return (
    ts.isAsExpression(n) &&
    ts.isTypeReferenceNode(n.type) &&
    ts.isIdentifier(n.type.typeName) &&
    n.type.typeName.text === 'const'
  );
}

/** Every string literal of a source file, tagged with its vocabulary group (if any). */
function literalsOf(fileName: string, text: string): { literals: Literal[]; groups: string[][] } {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true);
  const literals: Literal[] = [];
  const groups: string[][] = [];
  const grouped = new Map<ts.Node, number>();
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const isString = (n: ts.Node): n is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral =>
    ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);

  const declare = (members: ts.Node[]) => {
    const strings = members.filter(isString);
    if (strings.length === 0) return;
    const g = groups.length;
    groups.push(strings.map((s) => s.text));
    for (const s of strings) grouped.set(s, g);
  };

  const visit = (n: ts.Node): void => {
    // module paths are not content
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) return;
    if (ts.isModuleDeclaration(n) && ts.isStringLiteral(n.name)) {
      if (n.body) visit(n.body);
      return;
    }
    if (ts.isImportTypeNode(n)) return;
    // closed vocabularies: a union of literal types, a lone literal type, an `as const` array
    if (ts.isUnionTypeNode(n)) {
      declare(n.types.flatMap((t) => (ts.isLiteralTypeNode(t) ? [t.literal] : [])));
    } else if (ts.isLiteralTypeNode(n) && !ts.isUnionTypeNode(n.parent)) {
      declare([n.literal]);
    } else if (isConstAssertion(n) && ts.isArrayLiteralExpression(n.expression)) {
      declare([...n.expression.elements]);
    }
    if (isString(n)) literals.push({ text: n.text, line: lineOf(n), group: grouped.get(n) ?? -1 });
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { literals, groups };
}

/**
 * Hits of one directory (one system): a literal equal to an entity id that is neither a
 * word of a closed vocabulary its directory declares (a group holding some non-id word)
 * nor exempt by the vocabulary rule. Ids of protected kinds are always hits.
 */
function scanSources(sources: { file: string; text: string }[], ids: IdIndex): Hit[] {
  const parsed = sources.map((s) => ({ file: s.file, ...literalsOf(s.file, s.text) }));
  const vocabulary = new Set<string>();
  for (const p of parsed)
    for (const g of p.groups)
      if (g.some((w) => !ids.kinds.has(w))) for (const w of g) vocabulary.add(w);
  const hits: Hit[] = [];
  for (const p of parsed) {
    for (const lit of p.literals) {
      const kinds = ids.kinds.get(lit.text);
      if (!kinds) continue;
      if (!ids.protectedIds.has(lit.text) && vocabulary.has(lit.text)) continue;
      hits.push({ file: p.file, line: lit.line, id: lit.text, kinds: [...kinds].sort() });
    }
  }
  return hits;
}

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Group the files of a tree by system directory (src/systems/<name>, or the tree itself). */
function scanTree(tree: string, perChild: boolean, ids: IdIndex): Hit[] {
  const groups = new Map<string, string[]>();
  for (const f of tsFiles(join(ROOT, tree))) {
    const rel = relative(join(ROOT, tree), f).split(sep);
    const key = perChild && rel.length > 1 ? (rel[0] as string) : '';
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const hits: Hit[] = [];
  for (const files of groups.values()) {
    const sources = files.map((f) => ({
      file: relative(ROOT, f).split(sep).join('/'),
      text: readFileSync(f, 'utf8'),
    }));
    hits.push(...scanSources(sources, ids));
  }
  return hits;
}

interface AllowEntry {
  file: string;
  id: string;
  reason: string;
}

function unlisted(hits: Hit[], list: AllowEntry[]): string[] {
  return hits
    .filter((h) => !list.some((a) => a.file === h.file && a.id === h.id))
    .map((h) => `${h.file}:${h.line} '${h.id}' (${h.kinds.join(', ')})`);
}

function stale(hits: Hit[], list: AllowEntry[]): string[] {
  return list
    .filter((a) => !hits.some((h) => h.file === a.file && h.id === a.id))
    .map((a) => `${a.file} '${a.id}'`);
}

const content = buildContent();
const ids = indexContent(content);
const allow = allowlist as { systems: AllowEntry[]; autoplay: AllowEntry[] };

describe('content id guard: the scanner', () => {
  const fake: IdIndex = {
    kinds: new Map([
      ['inner_court', new Set(['map', 'site'])],
      ['settlement', new Set(['door'])],
      ['stone', new Set(['item'])],
      ['eluen', new Set(['goddess'])],
      ['valda', new Set(['goddess'])],
    ]),
    protectedIds: new Set(['inner_court', 'eluen', 'valda']),
  };
  const scan = (text: string) => scanSources([{ file: 'x.ts', text }], fake).map((h) => h.id);

  it('flags an id used as a value, in a call, a comparison or a case', () => {
    expect(scan("const m = mapById(ctx.content, 'inner_court');")).toEqual(['inner_court']);
    expect(scan('if (g === `eluen`) x();')).toEqual(['eluen']);
    expect(scan("switch (g) { case 'valda': break; }")).toEqual(['valda']);
  });

  it('flags a union or a const array made of ids only (the old GoddessId)', () => {
    expect(scan("type G = 'eluen' | 'valda';")).toEqual(['eluen', 'valda']);
    expect(scan("const S = ['eluen', 'valda'] as const;")).toEqual(['eluen', 'valda']);
  });

  it('lets a word of a mixed closed vocabulary through, but never a protected id', () => {
    expect(scan("type K = 'settlement' | 'court'; if (k === 'settlement') f();")).toEqual([]);
    expect(scan("const T = ['grass', 'stone'] as const; t === 'stone';")).toEqual([]);
    expect(scan("type G = 'eluen' | 'nobody'; g === 'eluen';")).toEqual(['eluen', 'eluen']);
    expect(scan("const k: 'settlement' = 'settlement';")).toEqual(['settlement', 'settlement']);
  });

  it('flags a vocabulary word its directory never declares', () => {
    const hits = scanSources([{ file: 'a.ts', text: "if (kind === 'settlement') f();" }], fake).map(
      (h) => h.id,
    );
    expect(hits).toEqual(['settlement']);
  });

  it('ignores comments, module paths and partial templates', () => {
    expect(scan("// mapById(content, 'inner_court')\n/* 'eluen' */")).toEqual([]);
    expect(scan("import { x } from './eluen';\nexport * from './valda';")).toEqual([]);
    // a template with a substitution is never one exact id (built with $ and { apart)
    const template = (head: string, tail: string) => `\`${head}$${'{'}id}${tail}\``;
    expect(scan(`const f = ${template('goddess.', '.eluen')};`)).toEqual([]);
    expect(scan(`const g = ${template('', '')};`)).toEqual([]);
    expect(scan("ctx.flag('feature.inner_court');")).toEqual([]);
  });
});

describe('content id guard: src/systems and src/core', () => {
  it('collects the entity ids of the content', () => {
    for (const id of ['old_outpost', 'wallenburg', 'eluen', 'janu', 'merca_coin', 'prologue'])
      expect(ids.kinds.has(id), id).toBe(true);
  });

  it('keeps the systems allowlist empty (RE-12 acceptance)', () => {
    expect(allow.systems).toEqual([]);
  });

  it('finds no content id written in a system or the core', () => {
    const hits = [...scanTree('src/systems', true, ids), ...scanTree('src/core', false, ids)];
    expect(unlisted(hits, allow.systems)).toEqual([]);
    expect(stale(hits, allow.systems)).toEqual([]);
  });
});

describe('content id guard: the autoplayer', () => {
  it('finds no content id outside its own allowlist, and no stale entry', () => {
    const hits = scanTree('src/game/autoplay', false, ids);
    expect(unlisted(hits, allow.autoplay)).toEqual([]);
    expect(stale(hits, allow.autoplay)).toEqual([]);
  });

  it('resolves every id of the route table (data/autoplay/routes.json)', () => {
    expect(routeProblems(content)).toEqual([]);
  });

  it('knows both ending routes of the playthroughs', () => {
    expect([...ENDING_ROUTES]).toEqual(['release', 'rule_merca']);
  });
});
