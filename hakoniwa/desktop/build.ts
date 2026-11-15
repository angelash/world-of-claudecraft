// Build the desktop shell (docs/50_tech/release_engineering.md 3.1, npm run build:desktop):
// esbuild bundles each Node-side entry into one CommonJS file under desktop/dist/ with
// electron as the only external, so the sandboxed preloads need no require but electron.
// The key entry page script is bundled for the browser and its page copied beside it.
// Run with Node directly (type stripping): node desktop/build.ts

import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'dist');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'key_entry'), { recursive: true });

const node = {
  bundle: true,
  platform: 'node' as const,
  format: 'cjs' as const,
  target: 'node22',
  external: ['electron'],
  logLevel: 'warning' as const,
  legalComments: 'none' as const,
};

await Promise.all([
  build({ ...node, entryPoints: [join(here, 'main.ts')], outfile: join(out, 'main.cjs') }),
  build({ ...node, entryPoints: [join(here, 'preload.ts')], outfile: join(out, 'preload.cjs') }),
  build({
    ...node,
    entryPoints: [join(here, 'llm_gateway', 'main.ts')],
    outfile: join(out, 'llm_gateway.cjs'),
  }),
  build({
    ...node,
    entryPoints: [join(here, 'key_entry', 'preload.ts')],
    outfile: join(out, 'key_entry_preload.cjs'),
  }),
  build({
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    logLevel: 'warning',
    entryPoints: [join(here, 'key_entry', 'page.ts')],
    outfile: join(out, 'key_entry', 'page.js'),
  }),
]);
copyFileSync(join(here, 'key_entry', 'index.html'), join(out, 'key_entry', 'index.html'));
console.log('desktop shell built into desktop/dist');
