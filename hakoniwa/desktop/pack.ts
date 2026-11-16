// npm run pack:win (docs/50_tech/release_engineering.md 3.1): an unsigned Windows x64
// directory build of the desktop shell and the built game, into release/win-unpacked/.
// npm run pack:win first runs npm run build:release (the game entry alone, the desktop
// target of vite.config.ts) and npm run build:desktop; this script only packages.
//
//   node desktop/pack.ts [--channel internal|e2e|steam|steam-playtest|steam-demo]
//
// Steps: check the inputs, refuse a dist/ that is not a release build (an editor page, or the
// dev service's routes or the Anthropic SDK named anywhere; tools/release_bundle.ts, 13.9),
// stage APP_LAYOUT into release/app/ with its own package.json,
// run electron-builder (the repository root's install, with the root's unpacked Electron so
// nothing is downloaded), stamp hkBuild through extraMetadata, apply RELEASE_FUSES, then
// read the fuse wire back from the executable and fail on any difference.
// Run with Node directly (type stripping): node desktop/pack.ts

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';
import type { BuildChannel } from './security';

// Node runs this file directly and refuses extension-less relative imports, so the pure
// config module (and what it re-exports) and the release bundle check load through Vite's
// module runner, as the replay tool does (tools/replay/run.ts).
type PackConfigModule = typeof import('./pack_config');
type ReleaseBundleModule = typeof import('../tools/release_bundle');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);
const { module: cfg } = await runnerImport<PackConfigModule>(join(here, 'pack_config.ts'), {
  root,
  configFile: false,
  logLevel: 'error',
});
const { APP_LAYOUT, buildStamp, fuseMismatches, GAME_EXCLUDES, isBuildChannel, PACK } = cfg;
const { packConfig, REQUIRED_INPUTS, stagedManifest } = cfg;
const { module: release } = await runnerImport<ReleaseBundleModule>(
  join(root, 'tools', 'release_bundle.ts'),
  { root, configFile: false, logLevel: 'error' },
);
const under = (base: string, rel: string) => join(base, ...rel.split('/'));

function fail(message: string): never {
  console.error(`pack:win: ${message}`);
  process.exit(1);
}

function channelArg(argv: readonly string[]): BuildChannel {
  const i = argv.findIndex((a) => a === '--channel' || a.startsWith('--channel='));
  if (i < 0) return PACK.defaultChannel;
  const value = argv[i]?.includes('=') ? argv[i]?.split('=')[1] : argv[i + 1];
  if (!isBuildChannel(value)) fail(`unknown channel ${String(value)}`);
  return value;
}

/** Short commit hash, with -dirty when hakoniwa/ has uncommitted changes. */
function commitId(): string {
  try {
    const opts = {
      cwd: root,
      encoding: 'utf8' as const,
      stdio: ['ignore', 'pipe', 'ignore'] as ['ignore', 'pipe', 'ignore'],
    };
    const hash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], opts).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', '.'], opts).trim() !== '';
    return dirty ? `${hash}-dirty` : hash;
  } catch {
    return 'unknown';
  }
}

if (process.platform !== 'win32') fail('pack:win builds on Windows only (3.2: no cross builds)');

const channel = channelArg(process.argv.slice(2));
const missing = REQUIRED_INPUTS.filter((f) => !existsSync(under(root, f)));
if (missing.length > 0) {
  fail(`missing ${missing.join(', ')}; run npm run build:release and npm run build:desktop first`);
}
const leaks = release.releaseLeaks(release.readBuiltFiles(under(root, APP_LAYOUT.game)));
if (leaks.length > 0) {
  fail(
    `${APP_LAYOUT.game}/ is not a release build; run npm run build:release\n${leaks.join('\n')}`,
  );
}

const version = (
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
).version;
const stage = under(root, PACK.stage);
const output = under(root, PACK.output);
const gameDir = under(root, APP_LAYOUT.game);
const excluded = new Set(GAME_EXCLUDES.map((f) => join(gameDir, ...f.split('/'))));

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(gameDir, under(stage, APP_LAYOUT.game), {
  recursive: true,
  filter: (src) => !excluded.has(src),
});
cpSync(under(root, APP_LAYOUT.bundle), under(stage, APP_LAYOUT.bundle), { recursive: true });
writeFileSync(
  under(stage, APP_LAYOUT.packageJson),
  `${JSON.stringify(stagedManifest(version), null, 2)}\n`,
);

const electronDir = dirname(require.resolve('electron/package.json'));
const electronVersion = (require('electron/package.json') as { version: string }).version;
const stamp = buildStamp({ version, build: commitId(), channel });
const config = packConfig({
  outputDir: output,
  electronVersion,
  electronDist: join(electronDir, 'dist'),
  stamp,
});

const builder = require('electron-builder') as {
  build(options: Record<string, unknown>): Promise<string[]>;
  Platform: { WINDOWS: { createTarget(types: string[], ...archs: number[]): unknown } };
  Arch: { x64: number };
};
console.log(
  `pack:win: channel=${channel} build=${String(stamp.build)} electron=${electronVersion}`,
);
await builder.build({
  projectDir: stage,
  targets: builder.Platform.WINDOWS.createTarget(['dir'], builder.Arch.x64),
  config,
  publish: 'never',
});

// An unpacked Electron keeps its default app and version file, which electron-builder only
// removes when it unpacks a downloaded zip; the game never loads them.
const unpacked = join(output, 'win-unpacked');
rmSync(join(unpacked, 'resources', 'default_app.asar'), { force: true });
rmSync(join(unpacked, 'version'), { force: true });

// 2.6: read the fuse wire back from the packaged executable and compare.
const exe = join(unpacked, `${PACK.executableName}.exe`);
if (!existsSync(exe)) fail(`no executable at ${relative(root, exe)}`);
// @electron/fuses is electron-builder's own dependency (app-builder-lib); resolve it there.
const fromBuilder = createRequire(require.resolve('electron-builder'));
const fuses = createRequire(fromBuilder.resolve('app-builder-lib/package.json'))(
  '@electron/fuses',
) as { getCurrentFuseWire(path: string): Promise<Record<number, unknown>> };
const wrong = fuseMismatches(await fuses.getCurrentFuseWire(exe));
if (wrong.length > 0) fail(`fuses not applied: ${wrong.join('; ')}`);
console.log(`pack:win: fuses verified; ${relative(root, exe).split(sep).join('/')}`);
