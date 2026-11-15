// The document guard (docs/60_production/dev_process.md section 4.3 items 1, 7 and 8;
// PK-M0-32). It scans the markdown of docs/ (recursively), assets/README.md,
// assets/prompts/README.md, hakoniwa/README.md and hakoniwa/CLAUDE.md for:
// - forbidden characters (hakoniwa/CLAUDE.md): the dashes U+2013 to U+2015, the U+2600 to
//   U+27BF symbols, the emoji presentation selector U+FE0F and the emoji blocks U+1F000 to
//   U+1FAFF, the same set as dev_process.md 4.3 command one and the gate scan;
// - relative links, inline `[text](path)` and reference definitions `[label]: path`, whose
//   target file must exist (anchors are not checked; inside the repository the case of every
//   path segment must match, so a link that only resolves on a case-insensitive disk fails).
//   The one exception is a planned document: a link may point at a file that the document
//   plan (dev_process.md section 7) lists by its full path with the status "缺" (missing)
//   and a responsible packet; once the file lands the link resolves like any other;
// - the index: docs/README.md links every document under docs/ except the research files
//   (docs/10_research/README.md indexes those) and the packet folders under docs/70_packets/.
// The forbidden characters are built from char codes so this file never contains them.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const REPO = resolve(ROOT, '..');
const DOCS = join(ROOT, 'docs');
const RESEARCH = join(DOCS, '10_research');
const PACKETS = join(DOCS, '70_packets');
const DEV_PROCESS = join(DOCS, '60_production', 'dev_process.md');
const EXTRA_FILES = ['README.md', 'CLAUDE.md', 'assets/README.md', 'assets/prompts/README.md'];

// ---------------------------------------------------------------------------
// Forbidden characters

const ch = (...codes: number[]) => String.fromCharCode(...codes);

// U+1F000 and U+1FAFF written as UTF-16 surrogate pairs; the `u` flag reads each pair as one
// code point, so the class covers the whole emoji range.
const FORBIDDEN = new RegExp(
  `[${ch(0x2013)}-${ch(0x2015)}${ch(0x2600)}-${ch(0x27bf)}${ch(0xfe0f)}${ch(0xd83c, 0xdc00)}-${ch(0xd83e, 0xdeff)}]`,
  'gu',
);

/** `line:column U+XXXX` for every forbidden character of a text. */
function forbiddenHits(text: string): string[] {
  const hits: string[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const match of line.matchAll(FORBIDDEN)) {
      const code = (match[0].codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0');
      hits.push(`${index + 1}:${(match.index ?? 0) + 1} U+${code}`);
    }
  });
  return hits;
}

// ---------------------------------------------------------------------------
// Link extraction

interface LinkRef {
  /** 1-based line. */
  readonly line: number;
  /** The destination as written, angle brackets removed. */
  readonly target: string;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
// A run of backticks, content ending in a non-backtick, and a closing run of the same length.
const CODE_SPAN = /(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
// [text](destination "optional title"); the text may hold one level of nested brackets.
const INLINE_LINK =
  /\[(?:[^[\]]|\[[^[\]]*\])*\]\(\s*(<[^>]*>|[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
// [label]: destination; footnote definitions [^1]: are not links.
const REFERENCE_DEFINITION = /^ {0,3}\[(?!\^)[^\]]+\]:\s*(<[^>]*>|\S+)/;

const unbracket = (raw: string) =>
  raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw;

/** Every link destination of a markdown text, outside code blocks, code spans and comments. */
function linkRefs(text: string): LinkRef[] {
  const refs: LinkRef[] = [];
  let fence: string | undefined;
  const withoutComments = text.replace(HTML_COMMENT, (m) => m.replace(/[^\n]/g, ' '));
  withoutComments.split(/\r?\n/).forEach((rawLine, index) => {
    const opener = FENCE.exec(rawLine);
    if (fence !== undefined) {
      if (opener && opener[1][0] === fence[0] && opener[1].length >= fence.length)
        fence = undefined;
      return;
    }
    if (opener) {
      fence = opener[1];
      return;
    }
    const line = rawLine.replace(CODE_SPAN, (m) => ' '.repeat(m.length));
    const definition = REFERENCE_DEFINITION.exec(line);
    if (definition) refs.push({ line: index + 1, target: unbracket(definition[1]) });
    for (const match of line.matchAll(INLINE_LINK)) {
      refs.push({ line: index + 1, target: unbracket(match[1]) });
    }
  });
  return refs;
}

/**
 * The file a link destination points at, relative to the linking file's folder, or
 * undefined for links this guard does not check: external schemes, pure anchors, empty.
 */
function linkPath(fromFile: string, target: string): string | undefined {
  if (target === '' || target.startsWith('#')) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return undefined;
  const path = target.replace(/[#?].*$/, '');
  if (path === '') return undefined;
  let decoded = path;
  try {
    decoded = decodeURI(path);
  } catch {
    // A malformed escape stays as written and simply fails the existence check.
  }
  return resolve(dirname(fromFile), decoded);
}

// ---------------------------------------------------------------------------
// Planned documents

/**
 * The documents the plan table (section 7 of dev_process.md) marks as missing ("缺"),
 * as paths under hakoniwa/. Only full file paths count: a bare name, a folder or a path
 * with a placeholder such as `<里程碑>` never matches a link.
 */
function plannedDocuments(devProcess: string): string[] {
  const out: string[] = [];
  let inPlan = false;
  for (const line of devProcess.split(/\r?\n/)) {
    if (/^## /.test(line)) inPlan = /^## 7\./.test(line);
    if (!inPlan || !line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 5 || !cells[3].startsWith('缺')) continue;
    for (const match of cells[1].matchAll(/`([^`]+)`/g)) {
      if (/^[\w-]+(\/[\w.-]+)+\.md$/.test(match[1])) out.push(match[1]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Files

function markdownUnder(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownUnder(p));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(p);
  }
  return out.sort();
}

const listings = new Map<string, Set<string> | null>();

function entriesOf(dir: string): Set<string> | null {
  if (!listings.has(dir)) {
    let names: Set<string> | null = null;
    try {
      names = statSync(dir).isDirectory() ? new Set(readdirSync(dir)) : null;
    } catch {
      names = null;
    }
    listings.set(dir, names);
  }
  return listings.get(dir) ?? null;
}

/** Whether a path exists; inside the repository every segment must match its exact case. */
function existsExact(abs: string): boolean {
  if (!abs.startsWith(REPO + sep)) return existsSync(abs);
  let current = REPO;
  for (const part of abs.slice(REPO.length + 1).split(sep)) {
    if (part === '') continue;
    if (!entriesOf(current)?.has(part)) return false;
    current = join(current, part);
  }
  return true;
}

const rel = (abs: string) => relative(ROOT, abs).split(sep).join('/');

const SCANNED = [...markdownUnder(DOCS), ...EXTRA_FILES.map((f) => join(ROOT, f))];
const TEXT = new Map(SCANNED.map((f) => [f, readFileSync(f, 'utf8')]));

/** The resolved files a markdown file links to. */
function linkedFiles(file: string): Set<string> {
  const out = new Set<string>();
  for (const ref of linkRefs(TEXT.get(file) ?? readFileSync(file, 'utf8'))) {
    const path = linkPath(file, ref.target);
    if (path !== undefined) out.add(path);
  }
  return out;
}

const isUnder = (file: string, dir: string) => file.startsWith(dir + sep);

/**
 * The documents docs/README.md must link: every markdown file under docs/ except the index
 * itself, the research files below docs/10_research/README.md, and anything inside a folder
 * under docs/70_packets/ (the packets and the template).
 */
function requiredInIndex(files: readonly string[]): string[] {
  return files.filter((f) => {
    if (f === join(DOCS, 'README.md')) return false;
    if (isUnder(f, RESEARCH)) return f === join(RESEARCH, 'README.md');
    if (isUnder(f, PACKETS)) return dirname(f) === PACKETS;
    return true;
  });
}

// ---------------------------------------------------------------------------

describe('docs guard: the scanners themselves', () => {
  it('flags exactly the forbidden ranges', () => {
    const forbidden = [0x2013, 0x2014, 0x2015, 0x2600, 0x2705, 0x27bf, 0xfe0f, 0x1f000, 0x1f600];
    const allowed = [0x2012, 0x2016, 0x25ff, 0x27c0, 0xfe0e, 0x1efff, 0x1fb00, 0x3001, 0xff1a];
    for (const cp of [...forbidden, 0x1faff]) {
      expect(forbiddenHits(`a${String.fromCodePoint(cp)}b`), cp.toString(16)).toHaveLength(1);
    }
    for (const cp of allowed) {
      expect(forbiddenHits(`a${String.fromCodePoint(cp)}b`), cp.toString(16)).toEqual([]);
    }
    expect(forbiddenHits(`ok\nx${ch(0x2014)}`)).toEqual(['2:2 U+2014']);
  });

  it('extracts inline links and reference definitions, skipping code and comments', () => {
    const text = [
      'See [a](one.md) and [`b`](../two.md#part "title") and ![img](pic.png).',
      '[label]: <three file.md>',
      '[^1]: a footnote, not a link',
      '`[c](not_a_link.md)` and <!-- [d](hidden.md) -->',
      '```',
      '[e](in_fence.md)',
      '```',
      '[f](after_fence.md) [g](https://example.com) [h](#anchor)',
    ].join('\n');
    expect(linkRefs(text)).toEqual([
      { line: 1, target: 'one.md' },
      { line: 1, target: '../two.md#part' },
      { line: 1, target: 'pic.png' },
      { line: 2, target: 'three file.md' },
      { line: 8, target: 'after_fence.md' },
      { line: 8, target: 'https://example.com' },
      { line: 8, target: '#anchor' },
    ]);
  });

  it('resolves relative targets and skips external links and anchors', () => {
    const from = join(DOCS, '60_production', 'x.md');
    expect(linkPath(from, '../50_tech/a.md#s2')).toBe(join(DOCS, '50_tech', 'a.md'));
    expect(linkPath(from, 'b%20c.md')).toBe(join(DOCS, '60_production', 'b c.md'));
    expect(linkPath(from, 'https://example.com/a.md')).toBeUndefined();
    expect(linkPath(from, 'mailto:a@example.com')).toBeUndefined();
    expect(linkPath(from, '#only-anchor')).toBeUndefined();
  });

  it('reads planned documents only from the missing rows of the plan table', () => {
    const text = [
      '## 6. 前一节',
      '| L4 | `docs/a/early.md` | 早 | 缺 | PK-1 |',
      '## 7. 文档计划表',
      '| 层 | 路径 | 文档 | 现状 | 负责 |',
      '| --- | --- | --- | --- | --- |',
      '| L4 | `docs/a/planned.md` | 甲 | 缺 | PK-2 |',
      '| L4 | `docs/a/written.md` | 乙 | 已有 | |',
      '| L4 | `docs/a/half.md` | 丙 | 续写中 | PK-3 |',
      '| 横向 | `docs/b/log.md`、`handoffs/`、`docs/m/<里程碑>/x.md` | 丁 | 缺 | PK-4 |',
      '## 8. 依据',
      '| L4 | `docs/a/late.md` | 戊 | 缺 | PK-5 |',
    ].join('\n');
    expect(plannedDocuments(text)).toEqual(['docs/a/planned.md', 'docs/b/log.md']);
  });

  it('requires every document in the index except research files and packet folders', () => {
    const at = (...parts: string[]) => join(DOCS, ...parts);
    const files = [
      at('README.md'),
      at('50_tech', 'architecture.md'),
      at('60_production', 'reviewers', 'README.md'),
      at('10_research', 'README.md'),
      at('10_research', 'anime', 'synthesis.md'),
      at('70_packets', 'README.md'),
      at('70_packets', '_template', 'brief.md'),
      at('70_packets', 'pk_m0_14_text_ref_kernel', 'README.md'),
    ];
    expect(requiredInIndex(files)).toEqual([
      at('50_tech', 'architecture.md'),
      at('60_production', 'reviewers', 'README.md'),
      at('10_research', 'README.md'),
      at('70_packets', 'README.md'),
    ]);
  });

  it('checks the case of every path segment inside the repository', () => {
    expect(existsExact(join(ROOT, 'docs', 'README.md'))).toBe(true);
    expect(existsExact(join(ROOT, 'docs', 'readme.md'))).toBe(false);
    expect(existsExact(join(ROOT, 'docs', 'no_such_file.md'))).toBe(false);
  });
});

describe('docs guard: the documents', () => {
  it('scans every markdown file in scope', () => {
    for (const f of EXTRA_FILES) expect(existsSync(join(ROOT, f)), f).toBe(true);
    expect(SCANNED.length).toBeGreaterThan(EXTRA_FILES.length);
  });

  it('has no forbidden characters', () => {
    const hits = SCANNED.flatMap((f) =>
      forbiddenHits(TEXT.get(f) ?? '').map((hit) => `${rel(f)}:${hit}`),
    );
    expect(hits).toEqual([]);
  });

  it('has no broken relative links', () => {
    const planned = new Set(
      plannedDocuments(readFileSync(DEV_PROCESS, 'utf8')).map((p) => join(ROOT, ...p.split('/'))),
    );
    const broken: string[] = [];
    for (const file of SCANNED) {
      for (const ref of linkRefs(TEXT.get(file) ?? '')) {
        const path = linkPath(file, ref.target);
        if (path !== undefined && !existsExact(path) && !planned.has(path)) {
          broken.push(`${rel(file)}:${ref.line} -> ${ref.target}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('indexes every document in docs/README.md', () => {
    const readme = join(DOCS, 'README.md');
    const indexed = linkedFiles(readme);
    const required = requiredInIndex(markdownUnder(DOCS));
    expect(required).toContain(join(PACKETS, 'README.md'));
    expect(required.filter((f) => !indexed.has(f)).map(rel)).toEqual([]);
  });

  it('indexes every research document in docs/10_research/README.md', () => {
    const readme = join(RESEARCH, 'README.md');
    const indexed = linkedFiles(readme);
    const missing = markdownUnder(RESEARCH).filter((f) => f !== readme && !indexed.has(f));
    expect(missing.map(rel)).toEqual([]);
  });
});
