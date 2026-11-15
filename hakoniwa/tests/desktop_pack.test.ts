// Packaging (docs/50_tech/release_engineering.md 2.6 "fuses", 3.1, 3.2) and the path layout
// the main process reads in development and in a packaged build (desktop/app_paths.ts,
// desktop/pack_config.ts). npm run pack:win itself is verified by hand (desktop/README.md).

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_LAYOUT, BUNDLE_FILES, shellPaths } from '../desktop/app_paths';
import {
  buildStamp,
  FUSE_DISABLED,
  FUSE_ENABLED,
  FUSE_WIRE_INDEX,
  fuseMismatches,
  GAME_EXCLUDES,
  PACK,
  packConfig,
  REQUIRED_INPUTS,
  stagedManifest,
} from '../desktop/pack_config';
import { RELEASE_FUSES, resolveBuildInfo } from '../desktop/security';

const HAKONIWA = join('/repo', 'hakoniwa');
const ASAR = join('/Games', 'HakoniwaChronicle', 'resources', 'app.asar');

describe('shell paths', () => {
  it('development: the root is two levels above the bundle', () => {
    const bundleDir = join(HAKONIWA, 'desktop', 'dist');
    const p = shellPaths({ packaged: false, appPath: join('/elsewhere'), bundleDir });
    expect(p).toEqual({
      root: HAKONIWA,
      packageJson: join(HAKONIWA, 'package.json'),
      gameRoot: join(HAKONIWA, 'dist'),
      keyEntryRoot: join(bundleDir, 'key_entry'),
      preload: join(bundleDir, 'preload.cjs'),
      keyEntryPreload: join(bundleDir, 'key_entry_preload.cjs'),
      gatewayEntry: join(bundleDir, 'llm_gateway.cjs'),
    });
  });

  it('packaged: everything comes from the app archive, whatever __dirname says', () => {
    const p = shellPaths({ packaged: true, appPath: ASAR, bundleDir: join('/somewhere', 'else') });
    expect(p).toEqual({
      root: ASAR,
      packageJson: join(ASAR, 'package.json'),
      gameRoot: join(ASAR, 'dist'),
      keyEntryRoot: join(ASAR, 'desktop', 'dist', 'key_entry'),
      preload: join(ASAR, 'desktop', 'dist', 'preload.cjs'),
      keyEntryPreload: join(ASAR, 'desktop', 'dist', 'key_entry_preload.cjs'),
      gatewayEntry: join(ASAR, 'desktop', 'dist', 'llm_gateway.cjs'),
    });
  });

  it('both layouts agree when the archive mirrors the source tree', () => {
    const dev = shellPaths({
      packaged: false,
      appPath: '',
      bundleDir: join(ASAR, 'desktop', 'dist'),
    });
    const packed = shellPaths({ packaged: true, appPath: ASAR, bundleDir: '' });
    expect(packed).toEqual(dev);
  });
});

describe('pack config', () => {
  const stamp = buildStamp({ version: '0.1.0', build: 'c00a7dd', channel: 'internal' });
  const config = packConfig({
    outputDir: join(HAKONIWA, 'release'),
    electronVersion: '43.8.1',
    electronDist: join('/repo', 'node_modules', 'electron', 'dist'),
    stamp,
  });

  it('applies exactly RELEASE_FUSES', () => {
    expect(config.electronFuses).toEqual(RELEASE_FUSES);
    expect(config.electronFuses).not.toBe(RELEASE_FUSES);
  });

  it('stamps hkBuild through extraMetadata, and the shell trusts it once packaged', () => {
    expect(config.extraMetadata).toEqual({
      hkBuild: { version: '0.1.0', build: 'c00a7dd', channel: 'internal' },
    });
    const info = resolveBuildInfo({
      packaged: true,
      version: '9.9.9',
      stamp,
      env: { HK_CHANNEL: 'e2e' },
    });
    expect(info).toMatchObject({ version: '0.1.0', build: 'c00a7dd', channel: 'internal' });
    expect(buildStamp({ version: '1', build: 'b', channel: 'e2e', contentVersion: 'c-1' })).toEqual(
      { version: '1', build: 'b', channel: 'e2e', contentVersion: 'c-1' },
    );
  });

  it('packs the layout the main process reads, without the editor', () => {
    expect(config.files).toEqual([
      'package.json',
      'dist/**/*',
      'desktop/dist/**/*',
      '!dist/editor.html',
    ]);
    expect(GAME_EXCLUDES).toEqual(['editor.html']);
    for (const dir of [APP_LAYOUT.game, APP_LAYOUT.bundle]) {
      expect(config.files).toContain(`${dir}/**/*`);
    }
    expect(stagedManifest('0.1.0')).toMatchObject({
      version: '0.1.0',
      main: `${APP_LAYOUT.bundle}/${BUNDLE_FILES.main}`,
    });
    expect(stagedManifest('0.1.0')).not.toHaveProperty('dependencies');
    expect(REQUIRED_INPUTS).toEqual([
      'dist/index.html',
      'desktop/dist/main.cjs',
      'desktop/dist/preload.cjs',
      'desktop/dist/key_entry_preload.cjs',
      'desktop/dist/llm_gateway.cjs',
      'desktop/dist/key_entry/index.html',
    ]);
  });

  it('builds an unsigned Windows x64 directory into release/ with the root Electron', () => {
    expect(config).toMatchObject({
      executableName: 'HakoniwaChronicle',
      electronVersion: '43.8.1',
      electronDist: join('/repo', 'node_modules', 'electron', 'dist'),
      directories: { output: join(HAKONIWA, 'release') },
      asar: true,
      npmRebuild: false,
      publish: null,
      win: { target: [{ target: 'dir', arch: ['x64'] }], signExecutable: false },
    });
    expect(PACK.output).toBe('release');
    expect(PACK.stage).toBe('release/app');
    expect(PACK.defaultChannel).toBe('internal');
  });
});

describe('fuse read-back', () => {
  const wireFor = (fuses: Record<string, boolean>) => {
    const wire: Record<number, number> = {};
    for (const [name, on] of Object.entries(fuses)) {
      wire[FUSE_WIRE_INDEX[name as keyof typeof FUSE_WIRE_INDEX]] = on
        ? FUSE_ENABLED
        : FUSE_DISABLED;
    }
    return wire;
  };

  it('maps each fuse to its wire index (@electron/fuses FuseV1Options)', () => {
    expect(FUSE_WIRE_INDEX).toEqual({
      runAsNode: 0,
      enableCookieEncryption: 1,
      enableNodeOptionsEnvironmentVariable: 2,
      enableNodeCliInspectArguments: 3,
      enableEmbeddedAsarIntegrityValidation: 4,
      onlyLoadAppFromAsar: 5,
    });
    expect(Object.keys(FUSE_WIRE_INDEX).sort()).toEqual(Object.keys(RELEASE_FUSES).sort());
    expect([FUSE_DISABLED, FUSE_ENABLED]).toEqual(['0'.charCodeAt(0), '1'.charCodeAt(0)]);
  });

  it('passes a wire set as required and names every fuse that is not', () => {
    expect(fuseMismatches(wireFor(RELEASE_FUSES))).toEqual([]);
    // An unflipped Electron: every fuse at its stock value.
    const stock = wireFor({
      runAsNode: true,
      enableCookieEncryption: false,
      enableNodeOptionsEnvironmentVariable: true,
      enableNodeCliInspectArguments: true,
      enableEmbeddedAsarIntegrityValidation: false,
      onlyLoadAppFromAsar: false,
    });
    expect(fuseMismatches(stock)).toEqual([
      'runAsNode: expected off, read 49',
      'enableNodeOptionsEnvironmentVariable: expected off, read 49',
      'enableNodeCliInspectArguments: expected off, read 49',
      'enableEmbeddedAsarIntegrityValidation: expected on, read 48',
      'onlyLoadAppFromAsar: expected on, read 48',
      'enableCookieEncryption: expected on, read 48',
    ]);
    // A removed or missing fuse is a mismatch too.
    const partial = wireFor(RELEASE_FUSES);
    delete partial[FUSE_WIRE_INDEX.onlyLoadAppFromAsar];
    expect(fuseMismatches(partial)).toEqual(['onlyLoadAppFromAsar: expected on, read undefined']);
  });
});
