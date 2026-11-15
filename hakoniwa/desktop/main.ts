// Main process entry (docs/50_tech/release_engineering.md 2.2). Bundled by desktop/build.ts
// into desktop/dist/main.cjs; everything it does lives in shell.ts. Paths are relative to
// the bundle: desktop/dist/ holds the preloads, the gateway and the key entry page, and the
// built game is hakoniwa/dist/ (the packaged layout arrives with the packaging package).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as electron from 'electron';
import { startShell } from './shell';

const here = __dirname;
const root = join(here, '..', '..');

function readPackage(): { version?: unknown; hkBuild?: unknown } {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

const pkg = readPackage();

startShell(electron, {
  gameRoot: join(root, 'dist'),
  keyEntryRoot: join(here, 'key_entry'),
  preload: join(here, 'preload.cjs'),
  keyEntryPreload: join(here, 'key_entry_preload.cjs'),
  gatewayEntry: join(here, 'llm_gateway.cjs'),
  argv: process.argv,
  env: process.env,
  platform: process.platform,
  version: typeof pkg.version === 'string' ? pkg.version : '0.0.0',
  stamp: pkg.hkBuild && typeof pkg.hkBuild === 'object' ? pkg.hkBuild : null,
  echo: !electron.app.isPackaged,
});
