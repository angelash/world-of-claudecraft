// The changed-files Biome step of the full local gate (tools/gate.ts). Like the main
// project's CI, Biome runs on the changed files only: the files that differ from a base
// ref (HEAD by default, so the uncommitted edits; the commit pipeline passes the push or
// pull request base) plus untracked files, under hakoniwa/ only, through the pinned Biome
// at the repository root (`npm run format` uses the same binary). Markdown is never
// checked. Errors and format differences fail the step; lint warnings do not.
//
// Pure and self-contained so tools/gate.ts can load it straight from Node; tested in
// tests/gate.test.ts.

/** The repository root's pinned Biome, relative to hakoniwa/. */
export const BIOME_BIN = '../node_modules/@biomejs/biome/bin/biome';

/** File types Biome checks here; markdown and everything else is left out. */
export const BIOME_EXTENSIONS: readonly string[] = [
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
  '.css',
];

/** Files per Biome invocation, well under the Windows command line limit. */
export const BIOME_CHUNK = 80;

/**
 * The git invocations (run from hakoniwa/) that list the changed files: tracked files
 * that differ from the base, deletions excluded and paths relative to hakoniwa/, then the
 * untracked files git does not ignore. NUL-separated so no path is quoted.
 */
export function gitChangedArgs(base: string): string[][] {
  return [
    ['diff', '--name-only', '--relative', '--no-renames', '--diff-filter=d', '-z', base, '--'],
    ['ls-files', '--others', '--exclude-standard', '-z'],
  ];
}

/** The git invocation that confirms the base names a commit. */
export function gitVerifyArgs(base: string): string[] {
  return ['rev-parse', '--verify', '--quiet', `${base}^{commit}`];
}

/** Paths from git output (NUL or newline separated), forward slashes, empties dropped. */
export function parseNameList(stdout: string): string[] {
  return stdout
    .split(/[\0\r\n]+/)
    .filter((p) => p.length > 0)
    .map((p) => p.replace(/\\/g, '/'));
}

/** The changed files Biome checks: supported types only, de-duplicated, sorted. */
export function biomeTargets(
  paths: readonly string[],
  extensions: readonly string[] = BIOME_EXTENSIONS,
): string[] {
  const kept = paths.filter((p) => {
    const name = p.slice(p.lastIndexOf('/') + 1);
    const dot = name.lastIndexOf('.');
    return dot > 0 && extensions.includes(name.slice(dot).toLowerCase());
  });
  return [...new Set(kept)].sort();
}

/** Splits a list into runs of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error(`chunk size must be positive, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Node arguments for one Biome check over some files. */
export function biomeArgs(files: readonly string[]): string[] {
  return [BIOME_BIN, 'check', '--no-errors-on-unmatched', ...files];
}
