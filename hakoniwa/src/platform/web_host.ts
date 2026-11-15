// The web PlatformHost (release_engineering.md 2.8): the browser build has no shell, so
// saves run the same save container in the page over IndexedDB (memory when the browser
// has none), settings are JSON in local storage, models are reachable only on this machine
// (2.4, llm_providers.md 6.2), and there is no store: achievements answer unavailable.
// Every browser facility is injected (the client passes the page's own), so tests run
// this host with hand-rolled fakes and no DOM.

import type { SaveBackend } from '../core/save/backend';
import { ContainerBackend, type ContainerOptions } from '../core/save/container';
import { IdbStorage } from '../core/save/idb_storage';
import { MemoryStorage } from '../core/save/memory_storage';
import type { SaveStorage } from '../core/save/storage';
import {
  accepted,
  type FrameCap,
  isHttpsLink,
  isLoopbackEndpoint,
  isSettingsValues,
  type LogLevel,
  type PlatformHost,
  type PlatformResult,
  refused,
  SETTINGS_PART_NAMES,
  type SettingsBackend,
  type SettingsPart,
  type SettingsValues,
} from './host';

/** The Storage methods this host uses (window.localStorage has them). */
export interface KeyValueLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ConsoleLike {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
}

export interface WebHostOptions {
  /** hakoniwa/package.json version. */
  version: string;
  /** Build label; default `web`. */
  build?: string;
  /** This browser's name in the slot list (player-visible: the client passes a text key's value). */
  writerName: string;
  /** window.localStorage, or null when the page may not use it (settings then last for the visit). */
  storage?: KeyValueLike | null;
  /** window.indexedDB, or null (saves then last until the page closes). */
  indexedDB?: IDBFactory | null;
  /** Wall clock, ms since the epoch; default Date.now. */
  now?: () => number;
  /** Random bytes for the writer id; default crypto.getRandomValues. */
  randomBytes?: (n: number) => Uint8Array;
  /** Opens an external link in a new tab; default none (links answer unavailable). */
  openWindow?: ((url: string) => unknown) | null;
  /** Where diagnostics.log writes; default none. */
  console?: ConsoleLike | null;
  /** Version fields for headers the container writes itself (restore). */
  versions?: ContainerOptions['versions'];
}

/** Local storage keys of the web host. */
export const WEB_KEYS = Object.freeze({
  /** Same key the first web build used, so a browser keeps its writer id. */
  writer: 'hakoniwa.saves.writer',
  settings: (part: SettingsPart) => `hakoniwa.settings.${part}`,
  badSuffix: '.bad',
});

/** hk:settings.set caps a part at 256 KiB; the web host keeps the same cap. */
export const SETTINGS_MAX_CHARS = 256 * 1024;

const FRAME_CAPS: readonly FrameCap[] = [30, 60, 'display'];

/** A Map behind the Storage methods, for pages that may not use local storage. */
export class MemoryKeyValue implements KeyValueLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/**
 * A SaveBackend whose real backend opens on first use (IndexedDB opens asynchronously),
 * so PlatformHost.saves can be a plain member. The open runs once; every call waits on it.
 */
export class LazySaveBackend implements SaveBackend {
  private opened: Promise<SaveBackend> | null = null;
  constructor(private readonly open: () => Promise<SaveBackend>) {}

  private backend(): Promise<SaveBackend> {
    this.opened ??= this.open();
    return this.opened;
  }
  async list() {
    return (await this.backend()).list();
  }
  async write(req: Parameters<SaveBackend['write']>[0]) {
    return (await this.backend()).write(req);
  }
  async read(req: Parameters<SaveBackend['read']>[0]) {
    return (await this.backend()).read(req);
  }
  async delete(req: Parameters<SaveBackend['delete']>[0]) {
    return (await this.backend()).delete(req);
  }
  async recoverables() {
    return (await this.backend()).recoverables();
  }
  async restore(req: Parameters<SaveBackend['restore']>[0]) {
    return (await this.backend()).restore(req);
  }
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function defaultRandomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** This browser's writer id for slot headers (5.3), kept across visits when storage allows. */
export function webWriterId(kv: KeyValueLike, randomBytes: (n: number) => Uint8Array): string {
  try {
    const known = kv.getItem(WEB_KEYS.writer);
    if (known && /^w-[0-9a-f]{8,32}$/.test(known)) return known;
  } catch {
    // Unreadable storage: pick a fresh id below.
  }
  const id = `w-${hex(randomBytes(8))}`;
  try {
    kv.setItem(WEB_KEYS.writer, id);
  } catch {
    // Not kept: the next visit picks another id, which only shows in the slot list.
  }
  return id;
}

const isSettingsPart = (v: unknown): v is SettingsPart =>
  (SETTINGS_PART_NAMES as readonly unknown[]).includes(v);

/**
 * Settings parts as JSON in local storage. An unreadable part is kept beside it as `.bad`
 * and read as "nothing stored", like the desktop settings files (13.10).
 */
export function webSettings(kv: KeyValueLike): SettingsBackend {
  return {
    async get(part): Promise<PlatformResult<SettingsValues | null>> {
      if (!isSettingsPart(part)) return refused('bad_request');
      const key = WEB_KEYS.settings(part);
      let raw: string | null;
      try {
        raw = kv.getItem(key);
      } catch {
        return refused('unavailable');
      }
      if (raw === null) return accepted(null);
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isSettingsValues(parsed)) return accepted(parsed);
      } catch {
        // Falls through to the .bad copy.
      }
      try {
        kv.setItem(key + WEB_KEYS.badSuffix, raw);
        kv.removeItem(key);
      } catch {
        // Left in place; the next read lands here again.
      }
      return accepted(null);
    },
    async set(part, values): Promise<PlatformResult<SettingsValues>> {
      if (!isSettingsPart(part) || !isSettingsValues(values)) return refused('bad_request');
      let text: string;
      try {
        text = JSON.stringify(values);
      } catch {
        return refused('bad_request');
      }
      if (text.length > SETTINGS_MAX_CHARS) return refused('too_large');
      const stored: unknown = JSON.parse(text);
      if (!isSettingsValues(stored)) return refused('bad_request');
      try {
        kv.setItem(WEB_KEYS.settings(part), text);
      } catch {
        // Quota or a storage the page may not use.
        return refused('failed');
      }
      return accepted(stored);
    },
  };
}

export function createWebHost(opts: WebHostOptions): PlatformHost {
  const now = opts.now ?? (() => Date.now());
  const kv = opts.storage ?? new MemoryKeyValue();
  const out = opts.console ?? null;
  const randomBytes = opts.randomBytes ?? defaultRandomBytes;
  const factory = opts.indexedDB ?? null;

  const saves = new LazySaveBackend(async () => {
    let storage: SaveStorage;
    try {
      storage = factory ? await IdbStorage.open(factory, { now }) : new MemoryStorage({ now });
      if (!factory) out?.warn('[platform] no IndexedDB; saves last until the page closes');
    } catch (err) {
      out?.warn('[platform] IndexedDB unavailable; saves last until the page closes', err);
      storage = new MemoryStorage({ now });
    }
    return new ContainerBackend(storage, {
      now,
      writer: { id: webWriterId(kv, randomBytes), name: opts.writerName },
      versions: opts.versions,
    });
  });

  const write = (level: LogLevel, message: string) => {
    if (!out) return;
    if (level === 'error') out.error(message);
    else if (level === 'warn') out.warn(message);
    else out.info(message);
  };

  return {
    kind: 'web',
    info: async () => ({
      kind: 'web',
      version: opts.version,
      build: opts.build ?? 'web',
      channel: 'web',
      contentVersion: 'unknown',
      platform: 'web',
    }),
    saves,
    settings: webSettings(kv),
    llm: { route: 'loopback', endpointAllowed: isLoopbackEndpoint },
    achievements: {
      available: false,
      unlock: async () => refused('unavailable'),
      setStat: async () => refused('unavailable'),
      setPresence: async () => refused('unavailable'),
      status: async () => refused('unavailable'),
    },
    diagnostics: {
      log: (level, message) => write(level, String(message)),
      exportBundle: async () => refused('unavailable'),
      pendingCrash: async () => refused('unavailable'),
      sendCrash: async () => refused('unavailable'),
    },
    window: {
      // The page owns browser fullscreen (the Fullscreen API needs a user gesture there).
      setMode: async () => refused('unavailable'),
      // The frame cap is applied by the renderer's frame scheduler; nothing to tell a shell.
      setFrameCap: async (cap) =>
        FRAME_CAPS.includes(cap) ? accepted(cap) : refused('bad_request'),
      openExternal: async (url) => {
        if (!isHttpsLink(url)) return refused('bad_request');
        if (!opts.openWindow) return refused('unavailable');
        try {
          return opts.openWindow(url) === null ? refused('failed') : accepted(null);
        } catch {
          return refused('failed');
        }
      },
      // Focus and visibility are page events the client listens to itself.
      onEvent: () => () => {},
    },
  };
}
