// The release bundle check (docs/50_tech/llm_providers.md 12 and 16.2; release_engineering.md
// 3.1 and 13.9): a release build (the desktop target of vite.config.ts) ships the game entry
// only, and no shipped file may name the dev service's routes or the Anthropic SDK. The
// development tools (the editor workbench, the dev transport, tools/dev_api.ts and
// tools/llm_proxy.ts) stay out of it. releaseLeaks is pure over (path, text) pairs; the Vite
// plugin runs it on every desktop build, and desktop/pack.ts runs it on dist/
// (readBuiltFiles) before packaging, so a development build of dist/ is never packed.
// tests/release_bundle.test.ts builds the desktop target and scans the output.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Strings no file of a release build may contain: the dev service's routes (tools/dev_api.ts:
 * the model proxy, the data write-back, the audit log) and the Anthropic SDK.
 */
export const RELEASE_FORBIDDEN: readonly string[] = Object.freeze([
  '/api/llm',
  '/api/data',
  '/api/audit',
  '@anthropic-ai/sdk',
]);

/** Pages of development builds only (the editor entry). */
export const DEV_ONLY_PAGES: readonly string[] = Object.freeze(['editor.html']);

/** Built files read as text; images and audio are not scanned. */
export const SCANNED_FILE = /\.(?:[cm]?js|html|css|json|map|svg|txt|webmanifest)$/i;

export interface BuiltFile {
  /** Path inside the build output, with forward slashes. */
  readonly path: string;
  readonly text: string;
}

/** One line per problem: a development page, or a forbidden string in a scanned file. */
export function releaseLeaks(files: Iterable<BuiltFile>): string[] {
  const out: string[] = [];
  for (const f of files) {
    const path = f.path.replace(/\\/g, '/');
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (DEV_ONLY_PAGES.includes(name)) out.push(`${path}: development page`);
    if (!SCANNED_FILE.test(path)) continue;
    for (const s of RELEASE_FORBIDDEN) if (f.text.includes(s)) out.push(`${path}: contains ${s}`);
  }
  return out.sort();
}

/** Every file under a build output directory; scanned files are read as UTF-8 text. */
export function readBuiltFiles(dir: string): BuiltFile[] {
  const out: BuiltFile[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const path = relative(dir, full).split(sep).join('/');
        out.push({ path, text: SCANNED_FILE.test(path) ? readFileSync(full, 'utf8') : '' });
      }
    }
  };
  walk(dir);
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

interface BundleItem {
  type: 'chunk' | 'asset';
  fileName: string;
  code?: string;
  source?: string | Uint8Array;
}

/** The written bundle as built files (chunks by code, text assets by source). */
export function bundleFiles(bundle: Record<string, BundleItem>): BuiltFile[] {
  return Object.values(bundle).map((item) => {
    let text = '';
    if (item.type === 'chunk') text = item.code ?? '';
    else if (typeof item.source === 'string') text = item.source;
    else if (item.source && SCANNED_FILE.test(item.fileName)) {
      text = new TextDecoder().decode(item.source);
    }
    return { path: item.fileName, text };
  });
}

/** Fails a release build whose written output leaks a development surface. */
export function releaseBundleGuard(): Plugin {
  return {
    name: 'hakoniwa-release-bundle',
    apply: 'build',
    enforce: 'post',
    writeBundle(_options, bundle) {
      const leaks = releaseLeaks(bundleFiles(bundle as unknown as Record<string, BundleItem>));
      if (leaks.length > 0) {
        this.error(
          `release bundle check failed (release_engineering.md 13.9):\n${leaks.join('\n')}`,
        );
      }
    },
  };
}
