// Fake Electron for the desktop shell tests: just enough of app, BrowserWindow, protocol,
// session, ipcMain and utilityProcess for desktop/shell.ts to run in Node. The fake gateway
// child runs the real gateway core in-process, so a call travels the same path it does in
// the app (guard, handler, gateway client, gateway core) without starting Electron.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserWindowConstructorOptions, CustomScheme } from 'electron';
import type { UtilityChild } from '../desktop/llm_gateway/client';
import {
  createGatewayCore,
  type GatewayConnection,
  type PortLike,
} from '../desktop/llm_gateway/core';
import { GAME_URL, KEY_ENTRY_URL } from '../desktop/security';
import type { IpcEventLike, ShellElectron, ShellOptions } from '../desktop/shell';

type Listener = (...args: never[]) => unknown;

class Emitter {
  readonly listeners = new Map<string, Listener[]>();
  on(event: string, listener: Listener): this {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return this;
  }
  once(event: string, listener: Listener): this {
    const wrapped = ((...args: never[]) => {
      this.off(event, wrapped);
      return listener(...args);
    }) as Listener;
    return this.on(event, wrapped);
  }
  off(event: string, listener: Listener): void {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter((l) => l !== listener),
    );
  }
  emit(event: string, ...args: unknown[]): void {
    for (const l of [...(this.listeners.get(event) ?? [])])
      (l as (...a: unknown[]) => unknown)(...args);
  }
  count(event: string): number {
    return this.listeners.get(event)?.length ?? 0;
  }
}

let nextContentsId = 1;

export class FakeWebContents extends Emitter {
  readonly id = nextContentsId++;
  openHandler: ((d: { url: string }) => { action: 'deny' }) | null = null;
  readonly sent: { channel: string; args: unknown[] }[] = [];
  devTools = false;
  destroyed = false;
  url = '';
  setWindowOpenHandler(handler: (d: { url: string }) => { action: 'deny' }): void {
    this.openHandler = handler;
  }
  send(channel: string, ...args: unknown[]): void {
    this.sent.push({ channel, args });
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
  openDevTools(): void {
    this.devTools = true;
  }
  closeDevTools(): void {
    this.devTools = false;
  }
  isDevToolsOpened(): boolean {
    return this.devTools;
  }
}

/** A navigation event in Electron 43's merged single-argument form. */
export function navEvent(url: string): { url: string; prevented: boolean; preventDefault(): void } {
  return {
    url,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
}

export interface FakePort extends PortLike {
  readonly messages: unknown[];
  closed: boolean;
}

export function fakePort(): FakePort {
  const port: FakePort = {
    messages: [],
    closed: false,
    postMessage(m: unknown) {
      if (!port.closed) port.messages.push(m);
    },
    close() {
      port.closed = true;
    },
  };
  return port;
}

export class FakeChild extends Emitter implements UtilityChild {
  readonly core;
  readonly received: unknown[] = [];
  killed = false;
  constructor(connections: GatewayConnection[]) {
    super();
    this.core = createGatewayCore({ connections: () => connections });
  }
  postMessage(message: unknown, transfer?: unknown[]): void {
    this.received.push(message);
    const reply = this.core.handle(message, (transfer ?? []) as PortLike[]);
    if (reply) queueMicrotask(() => this.emit('message', reply));
  }
  override on(event: 'message' | 'exit', listener: Listener): this {
    return super.on(event, listener);
  }
  kill(): boolean {
    this.killed = true;
    return true;
  }
}

export interface FakeElectron extends ShellElectron {
  readonly windows: FakeWindowInstance[];
  readonly calls: string[];
  readonly appEvents: Emitter;
  readonly switches: string[];
  readonly paths: Record<string, string>;
  readonly schemes: CustomScheme[][];
  readonly protocolHandlers: Map<string, (request: Request) => Promise<Response>>;
  readonly permission: {
    request: ((wc: unknown, p: string, cb: (g: boolean) => void) => void) | null;
    check: ((wc: unknown, p: string) => boolean) | null;
    device: (() => boolean) | null;
  };
  readonly ipcHandlers: Map<string, (event: IpcEventLike, ...args: unknown[]) => unknown>;
  readonly ipcListeners: Map<string, (event: IpcEventLike, ...args: unknown[]) => void>;
  readonly opened: string[];
  readonly children: FakeChild[];
  readonly menus: unknown[];
  clipboardText: string;
  quitCalls: number;
  exitCodes: (number | undefined)[];
  /** Resolve app.whenReady(). */
  makeReady(): void;
}

export interface FakeWindowInstance extends Emitter {
  readonly options: BrowserWindowConstructorOptions;
  readonly webContents: FakeWebContents;
  readonly loaded: string[];
  shown: boolean;
  fullscreen: boolean;
  minimized: boolean;
  focused: number;
  destroyed: boolean;
  close(): void;
}

export function makeFakeElectron(init: {
  packaged?: boolean;
  lock?: boolean;
  appData: string;
  connections?: GatewayConnection[];
}): FakeElectron {
  const calls: string[] = [];
  const appEvents = new Emitter();
  const windows: FakeWindowInstance[] = [];
  let ready: () => void = () => {};
  const readyPromise = new Promise<void>((r) => {
    ready = r;
  });

  class FakeWindow extends Emitter implements FakeWindowInstance {
    readonly webContents = new FakeWebContents();
    readonly loaded: string[] = [];
    shown = false;
    fullscreen: boolean;
    minimized = false;
    focused = 0;
    destroyed = false;
    constructor(readonly options: BrowserWindowConstructorOptions) {
      super();
      this.fullscreen = options.fullscreen === true;
      windows.push(this);
      calls.push('BrowserWindow');
      appEvents.emit('web-contents-created', {}, this.webContents);
    }
    loadURL(url: string): Promise<void> {
      this.loaded.push(url);
      this.webContents.url = url;
      return Promise.resolve();
    }
    show(): void {
      this.shown = true;
    }
    focus(): void {
      this.focused++;
    }
    restore(): void {
      this.minimized = false;
    }
    isMinimized(): boolean {
      return this.minimized;
    }
    setFullScreen(flag: boolean): void {
      this.fullscreen = flag;
    }
    isFullScreen(): boolean {
      return this.fullscreen;
    }
    close(): void {
      if (this.destroyed) return;
      this.destroyed = true;
      this.webContents.destroyed = true;
      this.emit('closed');
    }
    isDestroyed(): boolean {
      return this.destroyed;
    }
  }

  const fake: FakeElectron = {
    windows,
    calls,
    appEvents,
    switches: [],
    paths: { appData: init.appData },
    schemes: [],
    protocolHandlers: new Map(),
    permission: { request: null, check: null, device: null },
    ipcHandlers: new Map(),
    ipcListeners: new Map(),
    opened: [],
    children: [],
    menus: [],
    clipboardText: '',
    quitCalls: 0,
    exitCodes: [],
    makeReady: () => ready(),
    app: {
      isPackaged: init.packaged ?? false,
      commandLine: {
        appendSwitch: (name: string) => {
          fake.switches.push(name);
        },
      },
      getPath: (name) => fake.paths[name] as string,
      setPath: (name, path) => {
        calls.push(`setPath:${name}`);
        fake.paths[name] = path;
      },
      requestSingleInstanceLock: () => {
        calls.push('requestSingleInstanceLock');
        return init.lock ?? true;
      },
      on: (event, listener) => appEvents.on(event, listener as Listener),
      whenReady: () => readyPromise,
      quit: () => {
        fake.quitCalls++;
      },
      exit: (code?: number) => {
        fake.exitCodes.push(code);
      },
    },
    BrowserWindow: FakeWindow as unknown as ShellElectron['BrowserWindow'],
    protocol: {
      registerSchemesAsPrivileged: (schemes) => {
        calls.push('registerSchemesAsPrivileged');
        fake.schemes.push(schemes);
      },
      handle: (scheme, handler) => {
        calls.push(`protocol.handle:${scheme}`);
        fake.protocolHandlers.set(scheme, handler);
      },
    },
    session: {
      defaultSession: {
        setPermissionRequestHandler: (h) => {
          fake.permission.request = h;
        },
        setPermissionCheckHandler: (h) => {
          fake.permission.check = h;
        },
        setDevicePermissionHandler: (h) => {
          fake.permission.device = h;
        },
      },
    },
    ipcMain: {
      handle: (channel, listener) => {
        if (fake.ipcHandlers.has(channel)) throw new Error(`second handler for ${channel}`);
        fake.ipcHandlers.set(channel, listener);
      },
      on: (channel, listener) => {
        if (fake.ipcListeners.has(channel)) throw new Error(`second listener for ${channel}`);
        fake.ipcListeners.set(channel, listener);
      },
    },
    net: {
      fetch: async (url: string) =>
        new Response(`body of ${url}`, { status: 200, headers: { 'Content-Type': 'text/html' } }),
    },
    shell: {
      openExternal: async (url: string) => {
        fake.opened.push(url);
      },
    },
    Menu: {
      setApplicationMenu: (menu) => {
        fake.menus.push(menu);
      },
    },
    clipboard: { readText: () => fake.clipboardText },
    powerMonitor: { on: () => undefined },
    utilityProcess: {
      fork: () => {
        const child = new FakeChild(init.connections ?? []);
        fake.children.push(child);
        return child;
      },
    },
  };
  return fake;
}

/** A temp directory tree with a built game page and key entry page. */
export function fakeInstall(): {
  appData: string;
  gameRoot: string;
  keyEntryRoot: string;
  options(extra?: Partial<ShellOptions>): ShellOptions;
} {
  const base = mkdtempSync(join(tmpdir(), 'hk-desktop-'));
  const appData = join(base, 'appdata');
  const gameRoot = join(base, 'game');
  const keyEntryRoot = join(base, 'key');
  mkdirSync(appData, { recursive: true });
  mkdirSync(join(gameRoot, 'assets'), { recursive: true });
  mkdirSync(keyEntryRoot, { recursive: true });
  writeFileSync(join(gameRoot, 'index.html'), '<!doctype html><title>game</title>');
  writeFileSync(join(gameRoot, 'assets', 'main.js'), 'console.log(1)');
  writeFileSync(join(base, 'secret.txt'), 'outside the roots');
  writeFileSync(join(keyEntryRoot, 'index.html'), '<!doctype html><title>key</title>');
  return {
    appData,
    gameRoot,
    keyEntryRoot,
    options: (extra = {}) => ({
      gameRoot,
      keyEntryRoot,
      preload: join(base, 'preload.cjs'),
      keyEntryPreload: join(base, 'key_entry_preload.cjs'),
      gatewayEntry: join(base, 'llm_gateway.cjs'),
      argv: ['electron', 'main.cjs'],
      env: {},
      platform: 'win32',
      version: '0.1.0',
      ...extra,
    }),
  };
}

/** An IPC event as if sent by the top frame of a page at `url`. */
export function ipcEvent(
  url: string,
  senderId: number,
  extra: { parent?: unknown; ports?: unknown[]; frame?: null } = {},
): IpcEventLike {
  return {
    senderFrame: extra.frame === null ? null : { url, parent: extra.parent ?? null },
    sender: { id: senderId },
    ports: extra.ports ?? [],
  };
}

export const GAME_PAGE = GAME_URL;
export const KEY_PAGE = KEY_ENTRY_URL;

/** Let queued microtasks and promise chains run. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}
