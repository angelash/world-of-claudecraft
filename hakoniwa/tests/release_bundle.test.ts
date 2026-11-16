// The release bundle check (docs/50_tech/llm_providers.md 12 and 16.2; release_engineering.md
// 3.1 and 13.9): the desktop target builds the game entry alone, and its output names neither
// the dev service's routes (/api/llm and the rest) nor the Anthropic SDK. Pins the target
// resolution, the Vite config of each target, the scanner and the build plugin, then builds
// the desktop target for real (Vite in a child process, as npm run build:release runs it,
// into a temporary directory) and scans what it wrote.

import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { ConfigEnv, Plugin, PluginOption, UserConfig } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bundleFiles,
  DEV_ONLY_PAGES,
  RELEASE_FORBIDDEN,
  readBuiltFiles,
  releaseBundleGuard,
  releaseLeaks,
} from '../tools/release_bundle';
import viteConfig, { buildInputs, buildTarget } from '../vite.config';

const ROOT = resolve(__dirname, '..');
const run = promisify(execFile);
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'hk-release-'));
  dirs.push(d);
  return d;
}

/** The resolved config of a build in a mode, with HK_TARGET unset. */
async function buildConfig(mode: string): Promise<UserConfig> {
  const saved = process.env.HK_TARGET;
  delete process.env.HK_TARGET;
  try {
    const fn = viteConfig as unknown as (env: ConfigEnv) => Promise<UserConfig>;
    return await fn({ command: 'build', mode, isSsrBuild: false, isPreview: false });
  } finally {
    if (saved !== undefined) process.env.HK_TARGET = saved;
  }
}

function pluginNames(config: UserConfig): string[] {
  return ((config.plugins ?? []) as PluginOption[])
    .flat()
    .map((p) => (p && typeof p === 'object' && 'name' in p ? (p as Plugin).name : ''));
}

describe('build targets', () => {
  it('resolves the desktop target from the mode or HK_TARGET, and refuses an unknown target', () => {
    expect(buildTarget('production', {})).toBe('dev');
    expect(buildTarget('desktop', {})).toBe('desktop');
    expect(buildTarget('production', { HK_TARGET: 'desktop' })).toBe('desktop');
    expect(buildTarget('production', { HK_TARGET: '' })).toBe('dev');
    expect(() => buildTarget('production', { HK_TARGET: 'web' })).toThrow(/HK_TARGET/);
  });

  it('builds the editor only for development: the desktop target has the game entry alone', async () => {
    expect(Object.keys(buildInputs(ROOT, 'desktop'))).toEqual(['main']);
    const dev = await buildConfig('production');
    expect(dev.build?.rollupOptions?.input).toEqual({
      main: join(ROOT, 'index.html'),
      editor: join(ROOT, 'editor.html'),
    });
    expect(pluginNames(dev)).not.toContain('hakoniwa-release-bundle');
    const desktop = await buildConfig('desktop');
    expect(desktop.build?.rollupOptions?.input).toEqual({ main: join(ROOT, 'index.html') });
    expect(desktop.build?.outDir).toBe(join(ROOT, 'dist'));
    expect(pluginNames(desktop)).toContain('hakoniwa-release-bundle');
  });

  it('runs the release build and packs through the desktop target', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.build).toBe('vite build --config vite.config.ts');
    expect(pkg.scripts['build:release']).toBe('vite build --config vite.config.ts --mode desktop');
    expect(pkg.scripts['pack:win']).toBe(
      'npm run build:release && npm run build:desktop && node desktop/pack.ts',
    );
  });
});

describe('release bundle scanner', () => {
  it('forbids the dev service routes and the SDK, and the editor page', () => {
    expect(RELEASE_FORBIDDEN).toEqual(['/api/llm', '/api/data', '/api/audit', '@anthropic-ai/sdk']);
    expect(DEV_ONLY_PAGES).toEqual(['editor.html']);
  });

  it('names each leaking file and string; binary files are not read', () => {
    const devTransport = readFileSync(
      join(ROOT, 'src', 'ai', 'transports', 'dev_proxy.ts'),
      'utf8',
    );
    expect(
      releaseLeaks([
        { path: 'index.html', text: '<script src="/assets/main.js"></script>' },
        { path: 'assets/main.js', text: 'fetch("http://127.0.0.1:11434/api/chat")' },
        { path: 'assets/dev.js', text: devTransport },
        { path: 'assets/sdk.js', text: 'import "@anthropic-ai/sdk"; fetch("/api/data")' },
        { path: 'assets\\audit.js', text: 'post("/api/audit")' },
        { path: 'editor.html', text: '<html></html>' },
        { path: 'assets/tile.png', text: '/api/llm' },
      ]),
    ).toEqual([
      'assets/audit.js: contains /api/audit',
      'assets/dev.js: contains /api/llm',
      'assets/sdk.js: contains /api/data',
      'assets/sdk.js: contains @anthropic-ai/sdk',
      'editor.html: development page',
    ]);
  });

  it('reads a build directory and fails the build from the plugin', () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<html></html>');
    writeFileSync(join(dir, 'assets', 'a.js'), 'x("/api/llm/status")');
    writeFileSync(join(dir, 'assets', 'b.png'), Buffer.from('/api/llm'));
    const files = readBuiltFiles(dir);
    expect(files.map((f) => f.path)).toEqual(['assets/a.js', 'assets/b.png', 'index.html']);
    expect(releaseLeaks(files)).toEqual(['assets/a.js: contains /api/llm']);

    const hook = releaseBundleGuard().writeBundle as unknown as (
      this: { error(message: string): never },
      options: unknown,
      bundle: unknown,
    ) => void;
    const ctx = {
      error(message: string): never {
        throw new Error(message);
      },
    };
    type Bundle = Parameters<typeof bundleFiles>[0];
    const clean: Bundle = {
      'index.html': { type: 'asset', fileName: 'index.html', source: '<html></html>' },
      'assets/main.js': { type: 'chunk', fileName: 'assets/main.js', code: 'run()' },
      'assets/i.png': { type: 'asset', fileName: 'assets/i.png', source: Buffer.from('/api/llm') },
    };
    expect(() => hook.call(ctx, {}, clean)).not.toThrow();
    const css = new TextEncoder().encode('a{background:url(/api/data)}');
    const leaking: Bundle = {
      ...clean,
      'assets/x.css': { type: 'asset', fileName: 'assets/x.css', source: css },
      'assets/dev.js': { type: 'chunk', fileName: 'assets/dev.js', code: 'f("/api/llm")' },
    };
    expect(bundleFiles(leaking).find((f) => f.path === 'assets/x.css')?.text).toContain('/api');
    expect(() => hook.call(ctx, {}, leaking)).toThrow(
      /assets\/dev\.js: contains \/api\/llm\nassets\/x\.css: contains \/api\/data/,
    );
  });
});

describe('the desktop build', () => {
  it('writes the game entry alone, and nothing in it names /api/llm or the SDK', async () => {
    const out = tempDir();
    const require = createRequire(import.meta.url);
    const vite = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
    // As npm run build:release runs it: no test NODE_ENV (a build is production) or target.
    const env: NodeJS.ProcessEnv = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (k !== 'NODE_ENV' && k !== 'HK_TARGET' && !k.startsWith('VITEST')) env[k] = v;
    }
    await run(
      process.execPath,
      [vite, 'build', '--config', 'vite.config.ts', '--mode', 'desktop', '--outDir', out],
      { cwd: ROOT, env, timeout: 240_000, maxBuffer: 16 * 1024 * 1024 },
    );
    const files = readBuiltFiles(out);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('index.html');
    expect(paths.some((p) => p.endsWith('.js'))).toBe(true);
    expect(paths).not.toContain('editor.html');
    expect(paths.filter((p) => /(^|\/)editor[-.]/.test(p))).toEqual([]);
    expect(releaseLeaks(files)).toEqual([]);
  }, 300_000);
});
