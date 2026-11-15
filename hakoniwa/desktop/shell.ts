// The main process wiring (docs/50_tech/release_engineering.md 2.1 to 2.7): lifecycle, the
// fixed user data directory, the single instance lock, the privileged app:// protocol with
// its content security policy, permission and navigation lock-down on every web contents,
// the game window, the hk:* channel guard and handlers, the key entry window and the model
// gateway utility process. Electron is injected (desktop/main.ts passes the real module),
// so tests/desktop_security.test.ts drives all of it with fakes and never starts Electron.

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { BrowserWindowConstructorOptions, CustomScheme } from 'electron';
import { parseCallSpec } from '../src/ai/providers/call_spec';
import { serveAppRequest } from './app_protocol';
import { HK, type HkResult, KEY_ENTRY } from './ipc/channels';
import { guardCall } from './ipc/guard';
import { createHandlers } from './ipc/handlers';
import { createKeyEntry, type KeyWindowLike } from './key_entry/controller';
import { createGatewayClient, type UtilityChild } from './llm_gateway/client';
import { failedResult } from './llm_gateway/protocol';
import { createRotatingLog, type LogFs, type RotatingLog } from './logging';
import { type StorageLayout, storageLayout, userDataDir } from './paths';
import { RateLimiter } from './rate_limit';
import {
  APP_SCHEMES,
  type BuildInfo,
  type BuildStamp,
  devToolsAllowed,
  GAME_HOST,
  GAME_ORIGIN,
  GAME_URL,
  gameWindowOptions,
  gpuSwitches,
  isDevToolsToggle,
  isFullscreenToggle,
  KEY_ENTRY_HOST,
  KEY_ENTRY_ORIGIN,
  navigationAllowed,
  permissionAllowed,
  remoteDebuggingRejected,
  resolveBuildInfo,
  type SenderFrameLike,
  windowOpenResponse,
} from './security';

// ---------------------------------------------------------------------------
// The slice of Electron the shell uses (structural, so fakes can stand in).

export interface NavigationDetails {
  url: string;
  preventDefault(): void;
}

export interface InputEventLike {
  preventDefault(): void;
}

export interface WebContentsLike {
  readonly id: number;
  on(event: string, listener: (...args: never[]) => void): unknown;
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void;
  send(channel: string, ...args: unknown[]): void;
  isDestroyed(): boolean;
  openDevTools(options?: { mode: 'detach' }): void;
  closeDevTools(): void;
  isDevToolsOpened(): boolean;
}

export interface BrowserWindowLike extends KeyWindowLike {
  readonly webContents: WebContentsLike;
  on(event: string, listener: (...args: never[]) => void): unknown;
  focus(): void;
  restore(): void;
  isMinimized(): boolean;
  setFullScreen(flag: boolean): void;
  isFullScreen(): boolean;
}

export interface IpcEventLike {
  readonly senderFrame: SenderFrameLike | null;
  readonly sender: { readonly id: number };
  readonly ports?: readonly unknown[];
}

export interface PortMainLike {
  postMessage(message: unknown): void;
  close(): void;
}

export interface ShellElectron {
  app: {
    readonly isPackaged: boolean;
    readonly commandLine: { appendSwitch(name: string): void };
    getPath(name: 'appData' | 'userData'): string;
    setPath(name: 'userData', path: string): void;
    requestSingleInstanceLock(): boolean;
    on(event: string, listener: (...args: never[]) => void): unknown;
    whenReady(): Promise<unknown>;
    quit(): void;
    exit(code?: number): void;
  };
  BrowserWindow: new (options: BrowserWindowConstructorOptions) => BrowserWindowLike;
  protocol: {
    registerSchemesAsPrivileged(schemes: CustomScheme[]): void;
    handle(scheme: string, handler: (request: Request) => Promise<Response>): void;
  };
  session: {
    defaultSession: {
      setPermissionRequestHandler(
        handler: (wc: unknown, permission: string, callback: (granted: boolean) => void) => void,
      ): void;
      setPermissionCheckHandler(handler: (wc: unknown, permission: string) => boolean): void;
      setDevicePermissionHandler(handler: () => boolean): void;
    };
  };
  ipcMain: {
    handle(channel: string, listener: (event: IpcEventLike, ...args: unknown[]) => unknown): void;
    on(channel: string, listener: (event: IpcEventLike, ...args: unknown[]) => void): unknown;
  };
  net: { fetch(url: string): Promise<Response> };
  shell: { openExternal(url: string): Promise<void> };
  Menu: { setApplicationMenu(menu: null): void };
  clipboard: { readText(): string };
  powerMonitor: { on(event: 'suspend' | 'resume', listener: () => void): unknown };
  utilityProcess: {
    fork(modulePath: string, args?: string[], options?: { serviceName?: string }): UtilityChild;
  };
}

export interface ShellOptions {
  /** The built game (`hakoniwa/dist`). */
  gameRoot: string;
  /** The built key entry page (`desktop/dist/key_entry`). */
  keyEntryRoot: string;
  preload: string;
  keyEntryPreload: string;
  gatewayEntry: string;
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  platform: string;
  /** hakoniwa/package.json version. */
  version: string;
  /** The hkBuild stamp of a packaged build. */
  stamp?: BuildStamp | null;
  /** Mirror logs to the console (development runs). */
  echo?: boolean;
  now?: () => number;
  fs?: LogFs & {
    mkdirSync(path: string, opts: { recursive: true }): unknown;
    isFile(path: string): boolean;
  };
}

export interface ShellHandle {
  readonly build: BuildInfo;
  /** False when the shell refused to start (remote debugging, second instance). */
  readonly started: boolean;
  /** Settles once the app is ready and the game window exists. */
  readonly ready: Promise<void>;
  layout(): StorageLayout | null;
  mainWindow(): BrowserWindowLike | null;
}

const nodeFs = {
  appendFileSync: (p: string, d: string) => appendFileSync(p, d),
  statSync: (p: string) => statSync(p),
  renameSync: (a: string, b: string) => renameSync(a, b),
  existsSync: (p: string) => existsSync(p),
  mkdirSync: (p: string, o: { recursive: true }) => mkdirSync(p, o),
  isFile: (p: string) => {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  },
};

/** Start the desktop shell. Call once, synchronously at main-process start-up. */
export function startShell(electron: ShellElectron, opts: ShellOptions): ShellHandle {
  const { app } = electron;
  const fs = opts.fs ?? nodeFs;
  const now = opts.now ?? (() => Date.now());
  const build = resolveBuildInfo({
    packaged: app.isPackaged,
    version: opts.version,
    stamp: opts.stamp,
    env: opts.env,
  });
  let layout: StorageLayout | null = null;
  let mainLog: RotatingLog | null = null;
  let win: BrowserWindowLike | null = null;
  const early: string[] = [];
  const log = (level: 'error' | 'warn' | 'info', message: string) => {
    if (opts.echo) console[level === 'info' ? 'log' : level](`[shell] ${message}`);
    if (mainLog) mainLog.write(level, 'main', message);
    else early.push(`${level} ${message}`);
  };
  const refused = (): ShellHandle => ({
    build,
    started: false,
    ready: Promise.resolve(),
    layout: () => null,
    mainWindow: () => null,
  });

  // 2.6 remote debugging: only the e2e channel may be started with a debugging port.
  if (remoteDebuggingRejected(opts.argv, build.channel)) {
    app.exit(1);
    return refused();
  }

  // 5.2: the user data directory name is fixed before anything reads it.
  app.setPath('userData', userDataDir(app.getPath('appData')));

  // 2.6 single instance: a second launch focuses the running window and quits.
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return refused();
  }

  for (const name of gpuSwitches(opts.env)) app.commandLine.appendSwitch(name);
  electron.protocol.registerSchemesAsPrivileged(APP_SCHEMES);
  if (opts.platform === 'win32' || opts.platform === 'linux') {
    electron.Menu.setApplicationMenu(null);
  }

  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on('window-all-closed', () => app.quit());

  // 2.6 navigation and new windows, for every web contents the app ever creates.
  app.on('web-contents-created', ((_event: unknown, contents: WebContentsLike) => {
    contents.setWindowOpenHandler(() => windowOpenResponse());
    const block = (details: NavigationDetails) => {
      if (navigationAllowed(details.url)) return;
      details.preventDefault();
      log('warn', `blocked navigation to ${details.url.slice(0, 200)}`);
    };
    contents.on('will-navigate', block);
    contents.on('will-redirect', block);
    contents.on('will-frame-navigate', block);
    contents.on('will-attach-webview', ((event: InputEventLike) =>
      event.preventDefault()) as never);
  }) as never);

  const limiter = new RateLimiter(now);
  const gateway = createGatewayClient({
    spawn: () =>
      electron.utilityProcess.fork(opts.gatewayEntry, [], {
        serviceName: 'Hakoniwa Model Gateway',
      }),
    onProblem: (push) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(HK.llmProblem.name, {
          problem: push.problem,
          ...(push.connectionId ? { connectionId: push.connectionId } : {}),
        });
      }
    },
    log: (m) => log('warn', m),
  });
  const keyEntry = createKeyEntry({
    createWindow: (options) => new electron.BrowserWindow(options),
    parent: () => (win && !win.isDestroyed() ? (win as never) : undefined),
    preload: opts.keyEntryPreload,
    gateway,
    readClipboard: () => electron.clipboard.readText(),
    log: (m) => log('warn', m),
  });

  const push = (event: Record<string, unknown>) => {
    if (win && !win.isDestroyed()) win.webContents.send(HK.event.name, event);
  };

  const ready = app.whenReady().then(() => {
    layout = storageLayout(app.getPath('userData'));
    for (const dir of layout.dirs) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        // The game still runs; saving and logging report their own failures.
      }
    }
    mainLog = createRotatingLog({ file: layout.mainLog, fs });
    const rendererLog = createRotatingLog({ file: layout.rendererLog, fs });
    for (const line of early.splice(0)) mainLog.write('info', 'main', line);
    log(
      'info',
      `start version=${build.version} build=${build.build} channel=${build.channel} platform=${opts.platform}`,
    );

    // 2.6 permissions: fullscreen and pointer lock only.
    const ses = electron.session.defaultSession;
    ses.setPermissionRequestHandler((_wc, permission, callback) =>
      callback(permissionAllowed(permission)),
    );
    ses.setPermissionCheckHandler((_wc, permission) => permissionAllowed(permission));
    ses.setDevicePermissionHandler(() => false);

    // 2.6 page source: app://hakoniwa (game) and app://key-entry (key entry page).
    const roots = { [GAME_HOST]: opts.gameRoot, [KEY_ENTRY_HOST]: opts.keyEntryRoot };
    electron.protocol.handle('app', (request) =>
      serveAppRequest(request, roots, {
        isFile: fs.isFile,
        fetchFile: (file) => electron.net.fetch(pathToFileURL(file).toString()),
      }),
    );

    registerGameChannels({
      electron,
      limiter,
      log,
      handlers: createHandlers({
        build,
        platform: opts.platform,
        gateway,
        enterKey: (connectionId, target) => keyEntry.open(connectionId, target),
        openExternal: (url) => electron.shell.openExternal(url),
        setFullScreen: (on) => win?.setFullScreen(on),
        isFullScreen: () => win?.isFullScreen() ?? false,
        rendererLog,
      }),
      forwardRequest: (spec, port) => {
        try {
          gateway.forward(spec, port);
        } catch {
          answerPort(port, failedResult('network', 'gateway unavailable'));
        }
      },
    });
    registerKeyEntryChannels({ electron, limiter, log, keyEntry });

    electron.powerMonitor.on('suspend', () => push({ kind: 'suspend' }));
    electron.powerMonitor.on('resume', () => push({ kind: 'resume' }));

    win = createGameWindow(electron, build, opts, log, push);
  });

  return {
    build,
    started: true,
    ready: ready.then(() => undefined),
    layout: () => layout,
    mainWindow: () => win,
  };
}

function answerPort(port: unknown, result: ReturnType<typeof failedResult>): void {
  const p = port as PortMainLike | undefined;
  if (!p) return;
  try {
    p.postMessage({ t: 'error', result });
  } finally {
    p.close();
  }
}

function createGameWindow(
  electron: ShellElectron,
  build: BuildInfo,
  opts: ShellOptions,
  log: (level: 'error' | 'warn' | 'info', m: string) => void,
  push: (event: Record<string, unknown>) => void,
): BrowserWindowLike {
  const win = new electron.BrowserWindow(
    gameWindowOptions({
      preload: opts.preload,
      channel: build.channel,
      fullscreen: build.packaged,
    }),
  );
  const tools = devToolsAllowed(build.channel);
  win.once('ready-to-show', () => win.show());
  win.webContents.on('before-input-event', ((
    event: InputEventLike,
    input: Parameters<typeof isFullscreenToggle>[0],
  ) => {
    if (isFullscreenToggle(input)) {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    } else if (tools && isDevToolsToggle(input)) {
      event.preventDefault();
      if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
      else win.webContents.openDevTools({ mode: 'detach' });
    }
  }) as never);
  for (const kind of ['focus', 'blur', 'minimize', 'restore'] as const) {
    win.on(kind, () => push({ kind }));
  }
  win.on('enter-full-screen', () => push({ kind: 'fullscreen', on: true }));
  win.on('leave-full-screen', () => push({ kind: 'fullscreen', on: false }));
  // Page warnings and errors go to the main log (12.1); info stays in developer tools.
  win.webContents.on('console-message', ((details: { level?: unknown; message?: unknown }) => {
    const level = details?.level;
    if (level !== 'warning' && level !== 'error') return;
    log(level === 'error' ? 'error' : 'warn', `page: ${String(details.message ?? '')}`);
  }) as never);
  win.webContents.on('render-process-gone', ((_e: unknown, details: { reason?: unknown }) => {
    log('error', `game renderer gone: ${String(details?.reason ?? 'unknown')}`);
  }) as never);
  win
    .loadURL(GAME_URL)
    .catch((err: unknown) => log('error', `game page failed to load: ${String(err)}`));
  return win;
}

function registerGameChannels(ctx: {
  electron: ShellElectron;
  limiter: RateLimiter;
  log: (level: 'error' | 'warn' | 'info', m: string) => void;
  handlers: ReturnType<typeof createHandlers>;
  forwardRequest: (spec: unknown, port: unknown) => void;
}): void {
  const { ipcMain } = ctx.electron;
  const refuse = (name: string, reason: string, detail: string) =>
    ctx.log('warn', `refused ${name}: ${reason} (${detail})`);

  for (const [key, def] of Object.entries(HK)) {
    if (def.kind === 'invoke') {
      const handler = (
        ctx.handlers.invoke as Record<string, (p: unknown) => Promise<HkResult<unknown>>>
      )[key];
      if (!handler) continue;
      ipcMain.handle(def.name, async (event, ...args): Promise<HkResult<unknown>> => {
        const g = guardCall(def, event.senderFrame, args, {
          origin: GAME_ORIGIN,
          limiter: ctx.limiter,
        });
        if (!g.ok) {
          refuse(def.name, g.reason, g.detail);
          return { ok: false, reason: g.reason };
        }
        try {
          return await handler(g.payload);
        } catch (err) {
          ctx.log('error', `${def.name} failed: ${String(err)}`);
          return { ok: false, reason: 'failed' };
        }
      });
    } else if (def.kind === 'send') {
      const handler = (ctx.handlers.send as Record<string, (p: unknown) => void>)[key];
      if (!handler) continue;
      ipcMain.on(def.name, (event, ...args) => {
        const g = guardCall(def, event.senderFrame, args, {
          origin: GAME_ORIGIN,
          limiter: ctx.limiter,
        });
        if (!g.ok) {
          refuse(def.name, g.reason, g.detail);
          return;
        }
        handler(g.payload);
      });
    } else if (def.kind === 'port') {
      ipcMain.on(def.name, (event, ...args) => {
        const ports = event.ports ?? [];
        const port = ports[0];
        const g = guardCall(def, event.senderFrame, args, {
          origin: GAME_ORIGIN,
          limiter: ctx.limiter,
        });
        if (!g.ok || ports.length !== 1) {
          refuse(def.name, g.ok ? 'bad_request' : g.reason, g.ok ? 'one port expected' : g.detail);
          // An untrusted sender gets nothing back; a trusted one learns the call was bad.
          for (const p of ports) {
            if (g.ok || g.reason !== 'forbidden')
              answerPort(p, failedResult('bad_request', 'refused'));
            else (p as PortMainLike).close();
          }
          return;
        }
        // 7.4 items 2 and 3: the agreed spec shape, then a configured connection.
        const spec = parseCallSpec(g.payload);
        if (!spec.ok) {
          refuse(def.name, 'bad_request', spec.error);
          answerPort(port, failedResult('bad_request', spec.error));
          return;
        }
        if (!connectionConfigured(spec.value.connectionId)) {
          answerPort(
            port,
            failedResult('bad_request', 'connection not configured', 'not_configured'),
          );
          return;
        }
        ctx.forwardRequest(spec.value, port);
      });
    }
  }
}

/**
 * Saved and enabled connections (7.4 item 3). None exist until the settings store
 * (PK-M0-20) and the model settings screens (PK-M1-01, PK-M1-02) land, so every request is
 * answered not_configured here and the world falls back to its rules (D-010).
 */
function connectionConfigured(_connectionId: string): boolean {
  return false;
}

function registerKeyEntryChannels(ctx: {
  electron: ShellElectron;
  limiter: RateLimiter;
  log: (level: 'error' | 'warn' | 'info', m: string) => void;
  keyEntry: ReturnType<typeof createKeyEntry>;
}): void {
  const { ipcMain } = ctx.electron;
  // Trusted only from the open key window's own top frame on the key entry origin.
  const trusted = (
    event: IpcEventLike,
    def: (typeof KEY_ENTRY)[keyof typeof KEY_ENTRY],
    args: unknown[],
  ) => {
    const g = guardCall(def, event.senderFrame, args, {
      origin: KEY_ENTRY_ORIGIN,
      limiter: ctx.limiter,
    });
    if (!g.ok || !ctx.keyEntry.isKeyWindow(event.sender.id)) {
      ctx.log('warn', `refused ${def.name}: ${g.ok ? 'not the key window' : g.reason}`);
      return null;
    }
    return g;
  };
  ipcMain.handle(KEY_ENTRY.submit.name, async (event, ...args) => {
    const g = trusted(event, KEY_ENTRY.submit, args);
    if (!g) return { ok: false, reason: 'failed' };
    return ctx.keyEntry.submit((g.payload as { secret: string }).secret);
  });
  ipcMain.handle(KEY_ENTRY.paste.name, async (event, ...args) => {
    if (!trusted(event, KEY_ENTRY.paste, args)) return { ok: false, reason: 'failed' };
    return ctx.keyEntry.paste();
  });
  ipcMain.on(KEY_ENTRY.cancel.name, (event, ...args) => {
    if (trusted(event, KEY_ENTRY.cancel, args)) ctx.keyEntry.cancel();
  });
}
