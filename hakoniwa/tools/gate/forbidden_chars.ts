// The forbidden-character scan of the full local gate (tools/gate.ts). The rule is the one
// in hakoniwa/CLAUDE.md and docs/60_production/dev_process.md section 4.3 item 1, and the
// same set the repository Stop hook (.claude/hooks/qa-stop.sh) blocks on added lines: the
// dashes U+2013, U+2014 and U+2015, emoji, the U+2600 to U+27BF symbols, and the emoji
// presentation selector U+FE0F. The gate scans every text file under the listed folders,
// not only the changed lines, so a character that slipped past the hook still fails here.
//
// Self-contained (node:fs and node:path only) so tools/gate.ts can load it straight from
// Node; the rules and the walk are tested in tests/gate.test.ts.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type ForbiddenCategory = 'dash' | 'symbol' | 'emoji';

export interface ForbiddenRange {
  readonly from: number;
  readonly to: number;
  readonly category: ForbiddenCategory;
}

export const FORBIDDEN_RANGES: readonly ForbiddenRange[] = [
  // En dash, em dash, horizontal bar (the Chinese double dash is two em dashes).
  { from: 0x2013, to: 0x2015, category: 'dash' },
  // Miscellaneous symbols and dingbats: stars, notes, check marks, gender signs.
  { from: 0x2600, to: 0x27bf, category: 'symbol' },
  // Emoji presentation selector.
  { from: 0xfe0f, to: 0xfe0f, category: 'emoji' },
  // Mahjong and card symbols through the pictograph, emoticon and symbol extension blocks.
  { from: 0x1f000, to: 0x1faff, category: 'emoji' },
];

const codePointClass = (cp: number) => `\\u{${cp.toString(16)}}`;

const FORBIDDEN_RE = new RegExp(
  `[${FORBIDDEN_RANGES.map((r) =>
    r.from === r.to ? codePointClass(r.from) : `${codePointClass(r.from)}-${codePointClass(r.to)}`,
  ).join('')}]`,
  'u',
);

/** The category of a forbidden code point, or undefined when it is allowed. */
export function categoryOf(codePoint: number): ForbiddenCategory | undefined {
  return FORBIDDEN_RANGES.find((r) => codePoint >= r.from && codePoint <= r.to)?.category;
}

export interface ForbiddenHit {
  /** 1-based line. */
  readonly line: number;
  /** 1-based column in code points. */
  readonly column: number;
  readonly codePoint: number;
  readonly category: ForbiddenCategory;
}

/** Every forbidden character in a text, with its line and column. */
export function scanText(text: string): ForbiddenHit[] {
  if (!FORBIDDEN_RE.test(text)) return [];
  const hits: ForbiddenHit[] = [];
  text.split(/\r?\n/).forEach((lineText, index) => {
    if (!FORBIDDEN_RE.test(lineText)) return;
    let column = 0;
    for (const ch of lineText) {
      column += 1;
      const codePoint = ch.codePointAt(0) ?? 0;
      const category = categoryOf(codePoint);
      if (category) hits.push({ line: index + 1, column, codePoint, category });
    }
  });
  return hits;
}

export interface ScanConfig {
  /** Folders under hakoniwa/ to walk; a missing folder is reported, not an error. */
  readonly dirs: readonly string[];
  /** Text file extensions, lower case with the dot. */
  readonly extensions: readonly string[];
  /** Folder names skipped anywhere in the walk. */
  readonly skipDirNames: readonly string[];
  /** Folders (paths under hakoniwa/) skipped. */
  readonly skipPaths: readonly string[];
}

export const FORBIDDEN_SCAN: ScanConfig = {
  dirs: ['src', 'tests', 'tools', 'data', 'docs', 'assets/prompts', 'desktop'],
  extensions: [
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.json',
    '.jsonc',
    '.md',
    '.css',
    '.html',
    '.svg',
    '.glsl',
    '.wgsl',
    '.yml',
    '.yaml',
    '.toml',
    '.sh',
    '.txt',
    '.csv',
  ],
  skipDirNames: ['node_modules', '.git', 'dist'],
  // Generated from the specs (npm run prompts) and not committed; the specs are scanned.
  skipPaths: ['assets/prompts/out'],
};

/** Whether a file name has one of the text extensions. */
export function isTextFile(name: string, extensions: readonly string[]): boolean {
  const dot = name.lastIndexOf('.');
  const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  if (dot <= slash + 1) return false;
  return extensions.includes(name.slice(dot).toLowerCase());
}

export interface TextFileList {
  /** Paths under the root, forward slashes, sorted. */
  readonly files: string[];
  readonly missingDirs: string[];
}

/** The text files under the configured folders of a root. */
export function listTextFiles(root: string, config: ScanConfig): TextFileList {
  const files: string[] = [];
  const missingDirs: string[] = [];
  const walk = (abs: string, rel: string) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const childRel = `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (config.skipDirNames.includes(entry.name) || config.skipPaths.includes(childRel)) {
          continue;
        }
        walk(join(abs, entry.name), childRel);
      } else if (entry.isFile() && isTextFile(entry.name, config.extensions)) {
        files.push(childRel);
      }
    }
  };
  for (const dir of config.dirs) {
    const abs = join(root, dir);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) {
      missingDirs.push(dir);
      continue;
    }
    walk(abs, dir);
  }
  files.sort();
  return { files, missingDirs };
}

export interface PathHit extends ForbiddenHit {
  readonly path: string;
}

export interface TreeScan {
  readonly fileCount: number;
  readonly hits: PathHit[];
  readonly missingDirs: string[];
}

/** Scans every text file under the configured folders of a root. */
export function scanTree(root: string, config: ScanConfig): TreeScan {
  const { files, missingDirs } = listTextFiles(root, config);
  const hits: PathHit[] = [];
  for (const path of files) {
    for (const hit of scanText(readFileSync(join(root, path), 'utf8'))) hits.push({ path, ...hit });
  }
  return { fileCount: files.length, hits, missingDirs };
}

/** `path:line:column U+2014 (dash)`. */
export function formatHit(hit: PathHit): string {
  const code = hit.codePoint.toString(16).toUpperCase().padStart(4, '0');
  return `${hit.path}:${hit.line}:${hit.column} U+${code} (${hit.category})`;
}
