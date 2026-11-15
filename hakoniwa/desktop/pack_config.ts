// Packaging configuration for npm run pack:win (docs/50_tech/release_engineering.md 2.6
// "fuses", 3.1 "build stamp", 3.2): an unsigned Windows x64 directory build of the desktop
// shell plus the built game. The runner (desktop/pack.ts) stages exactly APP_LAYOUT into
// release/app/ with its own package.json (no dependencies: the game is a Vite bundle and
// the shell an esbuild bundle whose only external is electron), then hands electron-builder
// the config built here. Pure, so tests/desktop_pack.test.ts pins the fuses, the stamp,
// the file set and the layout the main process reads (desktop/app_paths.ts).

import { APP_LAYOUT, BUNDLE_FILES } from './app_paths';
import { type BuildChannel, type BuildStamp, RELEASE_FUSES } from './security';

// The runner (Node, no extension-less imports) takes these through this module.
export { APP_LAYOUT } from './app_paths';
export { isBuildChannel } from './security';

export const PACK = Object.freeze({
  appId: 'com.hakoniwachronicle.desktop',
  /** English store name (14.3), shown in the executable's file properties. */
  productName: 'Hakoniwa Chronicle',
  /** Program and directory name (5.2, 14.3): HakoniwaChronicle.exe. */
  executableName: 'HakoniwaChronicle',
  /** Output directory under hakoniwa/ (gitignored). */
  output: 'release',
  /** Staged app directory under hakoniwa/. */
  stage: 'release/app',
  /** The channel of a local trial package. */
  defaultChannel: 'internal' as BuildChannel,
});

/** Files of the built game that stay out of the desktop package (the editor is dev-only). */
export const GAME_EXCLUDES: readonly string[] = Object.freeze(['editor.html']);

/** Every file the staged app must contain before electron-builder runs. */
export const REQUIRED_INPUTS: readonly string[] = Object.freeze([
  `${APP_LAYOUT.game}/index.html`,
  `${APP_LAYOUT.bundle}/${BUNDLE_FILES.main}`,
  `${APP_LAYOUT.bundle}/${BUNDLE_FILES.preload}`,
  `${APP_LAYOUT.bundle}/${BUNDLE_FILES.keyEntryPreload}`,
  `${APP_LAYOUT.bundle}/${BUNDLE_FILES.gateway}`,
  `${APP_LAYOUT.bundle}/${BUNDLE_FILES.keyEntryPage}/index.html`,
]);

/** The packaged app's own package.json (written into the stage). */
export function stagedManifest(version: string): Record<string, unknown> {
  return {
    name: 'hakoniwa-chronicle',
    productName: PACK.productName,
    version,
    private: true,
    description: 'Hakoniwa Chronicle desktop build',
    author: 'Hakoniwa Chronicle',
    main: `${APP_LAYOUT.bundle}/${BUNDLE_FILES.main}`,
  };
}

/** The hkBuild stamp (3.1) the shell trusts in a packaged build (security.ts resolveBuildInfo). */
export function buildStamp(input: {
  version: string;
  build: string;
  channel: BuildChannel;
  contentVersion?: string;
}): BuildStamp {
  return {
    version: input.version,
    build: input.build,
    channel: input.channel,
    ...(input.contentVersion ? { contentVersion: input.contentVersion } : {}),
  };
}

export interface PackInput {
  /** Absolute path of the output directory (release/). */
  outputDir: string;
  /** Electron version of the repository root install. */
  electronVersion: string;
  /** The unpacked Electron of the repository root install (node_modules/electron/dist). */
  electronDist: string;
  stamp: BuildStamp;
}

/** The electron-builder configuration of an unsigned Windows x64 directory build. */
export function packConfig(input: PackInput): Record<string, unknown> {
  return {
    appId: PACK.appId,
    productName: PACK.productName,
    executableName: PACK.executableName,
    copyright: 'Hakoniwa Chronicle',
    electronVersion: input.electronVersion,
    electronDist: input.electronDist,
    directories: { output: input.outputDir },
    files: [
      APP_LAYOUT.packageJson,
      `${APP_LAYOUT.game}/**/*`,
      `${APP_LAYOUT.bundle}/**/*`,
      ...GAME_EXCLUDES.map((f) => `!${APP_LAYOUT.game}/${f}`),
    ],
    asar: true,
    npmRebuild: false,
    nodeGypRebuild: false,
    buildDependenciesFromSource: false,
    extraMetadata: { hkBuild: input.stamp },
    electronFuses: { ...RELEASE_FUSES },
    win: {
      target: [{ target: 'dir', arch: ['x64'] }],
      // Unsigned until PK-M1-09 / M2 (3.3); resources (version info) are still written.
      signExecutable: false,
    },
    publish: null,
  };
}

/** Indexes of RELEASE_FUSES in Electron's fuse wire (@electron/fuses FuseV1Options). */
export const FUSE_WIRE_INDEX: Readonly<Record<keyof typeof RELEASE_FUSES, number>> = Object.freeze({
  runAsNode: 0,
  enableCookieEncryption: 1,
  enableNodeOptionsEnvironmentVariable: 2,
  enableNodeCliInspectArguments: 3,
  enableEmbeddedAsarIntegrityValidation: 4,
  onlyLoadAppFromAsar: 5,
});

/** Fuse wire states as @electron/fuses reports them ('0' and '1' bytes). */
export const FUSE_DISABLED = 48;
export const FUSE_ENABLED = 49;

/**
 * Compare a fuse wire read back from the packaged executable with RELEASE_FUSES (2.6
 * "verification"). Answers one line per fuse that is not as required; empty means all set.
 */
export function fuseMismatches(wire: Readonly<Record<number, unknown>>): string[] {
  const out: string[] = [];
  for (const [name, want] of Object.entries(RELEASE_FUSES) as [
    keyof typeof RELEASE_FUSES,
    boolean,
  ][]) {
    const index = FUSE_WIRE_INDEX[name];
    const state = wire[index];
    const expected = want ? FUSE_ENABLED : FUSE_DISABLED;
    if (state !== expected)
      out.push(`${name}: expected ${want ? 'on' : 'off'}, read ${String(state)}`);
  }
  return out;
}
