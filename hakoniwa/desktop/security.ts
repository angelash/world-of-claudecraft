// Pure security policy of the desktop shell (docs/50_tech/release_engineering.md 2.6 and
// 2.7): the privileged app:// scheme, the web preferences every window gets, the content
// security policy, the permission allow-list, the navigation and new-window rules, the
// IPC sender check, the external link allow-list, and the build channel rules (developer
// tools, remote debugging, environment variables, release fuses). No Electron runtime
// import: only types, so tests/desktop_security.test.ts can pin every item without
// starting Electron.

import type { BrowserWindowConstructorOptions, CustomScheme, WebPreferences } from 'electron';

export const APP_SCHEME = 'app';
/** The game page host; its origin is the only one the hk:* game channels trust. */
export const GAME_HOST = 'hakoniwa';
/** The key entry window host: a separate origin, so it shares no storage with the game. */
export const KEY_ENTRY_HOST = 'key-entry';
export const GAME_ORIGIN = `${APP_SCHEME}://${GAME_HOST}`;
export const KEY_ENTRY_ORIGIN = `${APP_SCHEME}://${KEY_ENTRY_HOST}`;
export const GAME_URL = `${GAME_ORIGIN}/index.html`;
export const KEY_ENTRY_URL = `${KEY_ENTRY_ORIGIN}/index.html`;

/** Scheme privileges (2.6 "page source"): standard, secure, fetch, code cache; no more. */
export const APP_SCHEME_PRIVILEGES = Object.freeze({
  standard: true,
  secure: true,
  supportFetchAPI: true,
  codeCache: true,
});

export const APP_SCHEMES: CustomScheme[] = [
  { scheme: APP_SCHEME, privileges: { ...APP_SCHEME_PRIVILEGES } },
];

/**
 * The web preferences every shell window starts from (2.6 "webPreferences"). The six keys
 * the checklist names are pinned, plus the node integration variants for workers and
 * subframes, no navigation by drag and drop, and no spell checker.
 */
export const SECURE_WEB_PREFERENCES: Readonly<WebPreferences> = Object.freeze({
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  navigateOnDragDrop: false,
  spellcheck: false,
});

/** Content security policy of every app:// response (2.6 "content security policy"). */
export const CSP_DIRECTIVES: readonly string[] = Object.freeze([
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
]);

export const CONTENT_SECURITY_POLICY = CSP_DIRECTIVES.join('; ');

/** The only permissions any page may get (2.6 "permissions"). */
export const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set(['fullscreen', 'pointerLock']);

export function permissionAllowed(permission: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission);
}

/**
 * Navigation rule (2.6 "navigation"): will-navigate, will-redirect and will-frame-navigate
 * are always blocked. Pages are loaded by the shell with loadURL, which never raises them.
 */
export function navigationAllowed(_url: string): boolean {
  return false;
}

/** New windows are always denied; external links go through hk:shell.openExternal. */
export function windowOpenResponse(): { action: 'deny' } {
  return { action: 'deny' };
}

/** `${protocol}//${host}` of a URL, or null. Not URL.origin: app:// reports "null" there. */
export function deriveOrigin(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!parsed.protocol || !parsed.host) return null;
  return `${parsed.protocol}//${parsed.host}`;
}

/** The parts of a WebFrameMain the sender check reads. */
export interface SenderFrameLike {
  readonly url: string;
  readonly parent?: unknown;
}

/**
 * True when an IPC message comes from the top frame of a page served from `origin`
 * (2.3 general rules). A destroyed frame (null), a subframe or any other origin is
 * untrusted. Never throws.
 */
export function isTrustedSender(
  frame: SenderFrameLike | null | undefined,
  origin: string,
): boolean {
  try {
    if (!frame) return false;
    if (frame.parent) return false;
    return deriveOrigin(frame.url) === origin;
  } catch {
    return false;
  }
}

/**
 * Hosts hk:shell.openExternal may open (2.3: https only, and only the domains the settings
 * pages list: provider consoles, the project site, the Steam community). Exact host match;
 * later packages add the project site once it exists.
 */
export const EXTERNAL_HOSTS: ReadonlySet<string> = new Set([
  'console.anthropic.com',
  'www.anthropic.com',
  'platform.openai.com',
  'steamcommunity.com',
  'store.steampowered.com',
  'help.steampowered.com',
]);

export function externalUrlAllowed(
  url: string,
  hosts: ReadonlySet<string> = EXTERNAL_HOSTS,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password || parsed.port) return false;
  return hosts.has(parsed.hostname);
}

// ---------------------------------------------------------------------------
// Build channels (3.1 build stamp; 2.6 developer tools, remote debugging, environment).

export type BuildChannel = 'steam' | 'steam-playtest' | 'steam-demo' | 'internal' | 'e2e';

export const BUILD_CHANNELS: readonly BuildChannel[] = [
  'steam',
  'steam-playtest',
  'steam-demo',
  'internal',
  'e2e',
];

export function isBuildChannel(value: unknown): value is BuildChannel {
  return typeof value === 'string' && (BUILD_CHANNELS as readonly string[]).includes(value);
}

/** Developer tools: closed on the three Steam channels, available on internal and e2e. */
export function devToolsAllowed(channel: BuildChannel): boolean {
  return channel === 'internal' || channel === 'e2e';
}

/** Only the e2e channel accepts --remote-debugging-port; any other channel exits on it. */
export function remoteDebuggingRejected(argv: readonly string[], channel: BuildChannel): boolean {
  if (channel === 'e2e') return false;
  return argv.some(
    (a) => a === '--remote-debugging-port' || a.startsWith('--remote-debugging-port='),
  );
}

/** The build facts the shell runs with (the hkBuild stamp of a packaged build). */
export interface BuildInfo {
  version: string;
  build: string;
  channel: BuildChannel;
  contentVersion: string;
  packaged: boolean;
}

/** The hkBuild stamp electron-builder writes into the packaged package.json (3.1). */
export interface BuildStamp {
  version?: unknown;
  build?: unknown;
  channel?: unknown;
  contentVersion?: unknown;
}

const text = (v: unknown, fallback: string): string =>
  typeof v === 'string' && v !== '' && v.length <= 64 ? v : fallback;

/**
 * Resolve the build facts. A packaged build trusts its stamp only and ignores every
 * environment variable (2.6 "runtime environment variables"); a packaged build without a
 * valid stamp falls back to the most locked-down channel. An unpackaged (development) run
 * defaults to internal and honours HK_CHANNEL so an e2e run can ask for its channel.
 */
export function resolveBuildInfo(input: {
  packaged: boolean;
  version: string;
  stamp?: BuildStamp | null;
  env: Readonly<Record<string, string | undefined>>;
}): BuildInfo {
  if (input.packaged) {
    const s = input.stamp ?? {};
    return {
      version: text(s.version, input.version),
      build: text(s.build, 'unknown'),
      channel: isBuildChannel(s.channel) ? s.channel : 'steam',
      contentVersion: text(s.contentVersion, 'unknown'),
      packaged: true,
    };
  }
  const envChannel = input.env.HK_CHANNEL;
  return {
    version: input.version,
    build: 'dev',
    channel: isBuildChannel(envChannel) ? envChannel : 'internal',
    contentVersion: 'dev',
    packaged: false,
  };
}

/** Rescue switches the shell honours in every build (2.6, 2.7). */
export const RESCUE_ENV: readonly string[] = ['HK_DISABLE_GPU_FORCE'];

/**
 * Chromium switches for the GPU preference (2.7): high performance unless the player chose
 * "let the system choose" (`gpu` in settings.local.json) or the rescue switch is set.
 */
export function gpuSwitches(
  env: Readonly<Record<string, string | undefined>>,
  preference: 'high_performance' | 'system' = 'high_performance',
): string[] {
  if (env.HK_DISABLE_GPU_FORCE === '1' || preference === 'system') return [];
  return ['force_high_performance_gpu'];
}

/**
 * Electron fuses for release packages (2.6 "fuses"), in electron-builder's electronFuses
 * key names; the packaging step applies them and the release pipeline reads them back.
 */
export const RELEASE_FUSES = Object.freeze({
  runAsNode: false,
  enableNodeOptionsEnvironmentVariable: false,
  enableNodeCliInspectArguments: false,
  enableEmbeddedAsarIntegrityValidation: true,
  onlyLoadAppFromAsar: true,
  enableCookieEncryption: true,
});

// ---------------------------------------------------------------------------
// Window options (2.7).

export const GAME_WINDOW_SIZE = Object.freeze({
  width: 1280,
  height: 720,
  minWidth: 960,
  minHeight: 540,
});

export function gameWindowOptions(input: {
  preload: string;
  channel: BuildChannel;
  fullscreen: boolean;
}): BrowserWindowConstructorOptions {
  return {
    ...GAME_WINDOW_SIZE,
    title: '箱庭纪',
    backgroundColor: '#000000',
    show: false,
    fullscreen: input.fullscreen,
    autoHideMenuBar: true,
    webPreferences: {
      ...SECURE_WEB_PREFERENCES,
      preload: input.preload,
      devTools: devToolsAllowed(input.channel),
      // The world keeps running while the window is unfocused (2.7); pausing on minimize
      // is the game's own setting, not Chromium throttling.
      backgroundThrottling: false,
    },
  };
}

/** The key entry window (llm_providers.md 5.5): small, modal, its own preload, no tools. */
export function keyEntryWindowOptions(input: {
  preload: string;
  parent?: BrowserWindowConstructorOptions['parent'];
}): BrowserWindowConstructorOptions {
  return {
    width: 440,
    height: 260,
    title: '录入密钥',
    backgroundColor: '#1b1d22',
    show: false,
    modal: input.parent !== undefined,
    parent: input.parent,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    webPreferences: {
      ...SECURE_WEB_PREFERENCES,
      preload: input.preload,
      devTools: false,
    },
  };
}

/** Keys that toggle the display mode (2.7): F11 and Alt+Enter. */
export function isFullscreenToggle(input: {
  type?: string;
  key?: string;
  alt?: boolean;
  control?: boolean;
  meta?: boolean;
}): boolean {
  if (input.type !== 'keyDown') return false;
  if (input.key === 'F11') return true;
  return input.key === 'Enter' && input.alt === true && !input.control && !input.meta;
}

/** Keys that toggle developer tools where the channel allows them: F12, Ctrl+Shift+I. */
export function isDevToolsToggle(input: {
  type?: string;
  key?: string;
  code?: string;
  shift?: boolean;
  control?: boolean;
  meta?: boolean;
  alt?: boolean;
}): boolean {
  if (input.type !== 'keyDown') return false;
  if (input.key === 'F12') return true;
  const isI = input.code === 'KeyI' || input.key?.toLowerCase() === 'i';
  return (
    isI &&
    ((input.control === true && input.shift === true) ||
      (input.meta === true && input.alt === true))
  );
}
