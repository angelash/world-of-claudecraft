// Where the main process finds its files, in development and in a packaged build
// (docs/50_tech/release_engineering.md 2.2, 3.1). The app root holds the same three
// entries in both: package.json, the built game (dist/) and the shell bundle
// (desktop/dist/). In development the root is hakoniwa/, two levels above the bundle; in a
// packaged build it is the app archive (resources/app.asar, app.getAppPath()), which
// npm run pack:win fills with exactly APP_LAYOUT (desktop/pack_config.ts). Pure, so
// tests/desktop_pack.test.ts pins both cases without starting Electron.

import { join } from 'node:path';

/** The app root's layout, relative to the root ('/'-separated). */
export const APP_LAYOUT = Object.freeze({
  packageJson: 'package.json',
  game: 'dist',
  bundle: 'desktop/dist',
});

/** Files inside the shell bundle directory. */
export const BUNDLE_FILES = Object.freeze({
  main: 'main.cjs',
  preload: 'preload.cjs',
  keyEntryPreload: 'key_entry_preload.cjs',
  gateway: 'llm_gateway.cjs',
  keyEntryPage: 'key_entry',
});

export interface ShellPaths {
  /** hakoniwa/ in development, the app archive in a packaged build. */
  root: string;
  packageJson: string;
  /** The built game served as app://hakoniwa. */
  gameRoot: string;
  /** The built key entry page served as app://key-entry. */
  keyEntryRoot: string;
  preload: string;
  keyEntryPreload: string;
  gatewayEntry: string;
}

const under = (root: string, rel: string) => join(root, ...rel.split('/'));

/**
 * Resolve the shell's paths. `bundleDir` is the directory of the running main bundle
 * (`__dirname`); `appPath` is `app.getAppPath()`, used once the app is packaged.
 */
export function shellPaths(input: {
  packaged: boolean;
  appPath: string;
  bundleDir: string;
}): ShellPaths {
  const root = input.packaged ? input.appPath : join(input.bundleDir, '..', '..');
  const bundle = input.packaged ? under(root, APP_LAYOUT.bundle) : input.bundleDir;
  return {
    root,
    packageJson: under(root, APP_LAYOUT.packageJson),
    gameRoot: under(root, APP_LAYOUT.game),
    keyEntryRoot: join(bundle, BUNDLE_FILES.keyEntryPage),
    preload: join(bundle, BUNDLE_FILES.preload),
    keyEntryPreload: join(bundle, BUNDLE_FILES.keyEntryPreload),
    gatewayEntry: join(bundle, BUNDLE_FILES.gateway),
  };
}
