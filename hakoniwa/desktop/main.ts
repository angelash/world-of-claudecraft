// Main process entry (docs/50_tech/release_engineering.md 2.2). Bundled by desktop/build.ts
// into desktop/dist/main.cjs; everything it does lives in shell.ts. Its files come from
// app_paths.ts: relative to the bundle in development (desktop/dist/ and hakoniwa/dist/),
// from the app archive in a packaged build (npm run pack:win).

import { readFileSync } from 'node:fs';
import * as electron from 'electron';
import { shellPaths } from './app_paths';
import { startShell } from './shell';

const packaged = electron.app.isPackaged;
const paths = shellPaths({ packaged, appPath: electron.app.getAppPath(), bundleDir: __dirname });

function readPackage(): { version?: unknown; hkBuild?: unknown } {
  try {
    return JSON.parse(readFileSync(paths.packageJson, 'utf8'));
  } catch {
    return {};
  }
}

const pkg = readPackage();

startShell(electron, {
  gameRoot: paths.gameRoot,
  keyEntryRoot: paths.keyEntryRoot,
  preload: paths.preload,
  keyEntryPreload: paths.keyEntryPreload,
  gatewayEntry: paths.gatewayEntry,
  argv: process.argv,
  env: process.env,
  platform: process.platform,
  version: typeof pkg.version === 'string' ? pkg.version : '0.0.0',
  stamp: pkg.hkBuild && typeof pkg.hkBuild === 'object' ? pkg.hkBuild : null,
  echo: !packaged,
});
