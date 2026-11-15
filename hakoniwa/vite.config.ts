// Vite config for Hakoniwa (architecture.md 3 and 9): the root is this directory, the
// game (index.html) and, when present, the editor (editor.html) are build entries, the
// dev server runs on port 5180, and the dev API middleware from tools/dev_api.ts (the
// model proxy and data write-back) is mounted when that file exists.

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type PluginOption, runnerImport } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));

/** Build inputs: the game always, the editor only when its page exists. */
export function buildInputs(dir: string): Record<string, string> {
  const input: Record<string, string> = { main: resolve(dir, 'index.html') };
  const editor = resolve(dir, 'editor.html');
  if (existsSync(editor)) input.editor = editor;
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
  const plugins: PluginOption[] = [];
  if (command === 'serve') {
    const devApi = await loadDevApi(root);
    if (devApi) plugins.push(devApi);
  }
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
      rollupOptions: { input: buildInputs(root) },
    },
  };
});
