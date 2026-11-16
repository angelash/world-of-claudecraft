// Vite config for Hakoniwa (architecture.md 3 and 9): the root is this directory, the
// game (index.html) and, when present, the editor (editor.html) are build entries, the
// dev server runs on port 5180, and the dev API middleware from tools/dev_api.ts (the
// model proxy and data write-back) is mounted when that file exists.
// Build targets (release_engineering.md 3.1, 13.9): `npm run build` builds both entries for
// development; the desktop target (`npm run build:release`, which is `--mode desktop`, or
// HK_TARGET=desktop) builds the game entry only and fails when the written bundle names the
// dev proxy path or the Anthropic SDK (tools/release_bundle.ts).

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type PluginOption, runnerImport } from 'vite';
import { releaseBundleGuard } from './tools/release_bundle';

const root = dirname(fileURLToPath(import.meta.url));

/** dev: game and editor (development); desktop: the release build of the game alone. */
export type BuildTarget = 'dev' | 'desktop';

/** The target from the Vite mode or HK_TARGET; an unknown HK_TARGET is an error. */
export function buildTarget(mode: string, env: Record<string, string | undefined>): BuildTarget {
  const named = env.HK_TARGET;
  if (named !== undefined && named !== '' && named !== 'desktop') {
    throw new Error(`HK_TARGET must be desktop or unset, not ${named}`);
  }
  return named === 'desktop' || mode === 'desktop' ? 'desktop' : 'dev';
}

/** Build inputs: the game always; the editor only in a dev build and when its page exists. */
export function buildInputs(dir: string, target: BuildTarget = 'dev'): Record<string, string> {
  const input: Record<string, string> = { main: resolve(dir, 'index.html') };
  const editor = resolve(dir, 'editor.html');
  if (target === 'dev' && existsSync(editor)) input.editor = editor;
  return input;
}

/** Load the devApi() plugin from tools/dev_api.ts when the file exists; never fatal. */
async function loadDevApi(dir: string): Promise<PluginOption | null> {
  const file = resolve(dir, 'tools/dev_api.ts');
  if (!existsSync(file)) return null;
  try {
    // runnerImport resolves and transpiles TypeScript the way Vite does, without our config.
    const { module } = await runnerImport<{ devApi?: () => PluginOption }>(file, {
      root: dir,
      logLevel: 'error',
    });
    if (typeof module.devApi === 'function') return module.devApi();
    console.warn('[hakoniwa] tools/dev_api.ts has no devApi() export; dev API disabled');
  } catch (err) {
    console.warn('[hakoniwa] tools/dev_api.ts failed to load; dev API disabled:', err);
  }
  return null;
}

export default defineConfig(async ({ command, mode }) => {
  const target = buildTarget(mode, process.env);
  const plugins: PluginOption[] = [];
  if (command === 'serve') {
    const devApi = await loadDevApi(root);
    if (devApi) plugins.push(devApi);
  }
  if (command === 'build' && target === 'desktop') plugins.push(releaseBundleGuard());
  return {
    root,
    publicDir: resolve(root, 'public'),
    plugins,
    // --mode nohmr keeps a long manual test session alive while others edit sources.
    server: { port: 5180, strictPort: true, hmr: mode === 'nohmr' ? false : undefined },
    preview: { port: 5181 },
    build: {
      outDir: resolve(root, 'dist'),
      emptyOutDir: true,
      target: 'es2022',
      chunkSizeWarningLimit: 1024,
      rollupOptions: { input: buildInputs(root, target) },
    },
  };
});
