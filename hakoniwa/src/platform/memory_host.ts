// The memory PlatformHost for tests: deterministic (a fixed clock unless one is injected,
// a fixed writer), nothing leaves the process, and every effect is recorded so a test can
// read it back. Saves run the real save container over MemoryStorage (which can inject
// power cuts); the model gateway is a scripted stand-in with the window.hk.llm shape, so a
// transport written against the bridge (PK-M0-24) runs against it unchanged.

import type { LlmCallResult, LlmCallSpec } from '../ai/contracts';
import { ContainerBackend, type ContainerOptions } from '../core/save/container';
import { MemoryStorage } from '../core/save/memory_storage';
import {
  accepted,
  type FrameCap,
  type HkProblem,
  isHttpsLink,
  isSettingsValues,
  type KeyStatus,
  type LlmGatewayApi,
  type LogLevel,
  type PlatformEvent,
  type PlatformHost,
  type PlatformResult,
  refused,
  SETTINGS_PART_NAMES,
  type SettingsPart,
  type SettingsValues,
} from './host';

/** What the scripted gateway answers to one request: optional body deltas, then the receipt. */
export interface ScriptedAnswer {
  deltas?: string[];
  result: LlmCallResult;
}

export type LlmResponder = (spec: LlmCallSpec) => ScriptedAnswer | Promise<ScriptedAnswer>;

/** The gateway's answer when no connection is configured (desktop/shell.ts does the same). */
export function notConfiguredAnswer(): ScriptedAnswer {
  return {
    result: {
      ok: false,
      error: { cls: 'bad_request', message: 'connection not configured' },
      problem: 'not_configured',
      latencyMs: 0,
    },
  };
}

export interface MemoryGateway extends LlmGatewayApi {
  /** Every request spec, in order. */
  readonly requests: LlmCallSpec[];
  /** Every aborted request id, in order. */
  readonly aborted: string[];
  /** Push a gateway problem to onProblem listeners. */
  emitProblem(problem: HkProblem): void;
}

function memoryGateway(respond: LlmResponder): MemoryGateway {
  const requests: LlmCallSpec[] = [];
  const aborted: string[] = [];
  const secrets = new Map<string, KeyStatus>();
  const listeners = new Set<(p: HkProblem) => void>();
  const none: KeyStatus = { state: 'none', backend: 'memory_only' };
  const status = (id: string): PlatformResult<KeyStatus> => accepted(secrets.get(id) ?? none);
  return {
    requests,
    aborted,
    emitProblem: (problem) => {
      for (const l of [...listeners]) l(problem);
    },
    async request(spec, onDelta) {
      requests.push(spec);
      const answer = await respond(spec);
      for (const d of answer.deltas ?? []) onDelta?.(d);
      return answer.result;
    },
    abort: (requestId) => {
      aborted.push(requestId);
    },
    // The key entry window is a desktop shell window; here entering a key always succeeds
    // for this run only, and no key text ever exists.
    secretEnter: async ({ connectionId }) => {
      secrets.set(connectionId, { state: 'session_only', backend: 'memory_only' });
      return status(connectionId);
    },
    secretHas: async ({ connectionId }) => status(connectionId),
    secretClear: async ({ connectionId }) => {
      secrets.delete(connectionId);
      return status(connectionId);
    },
    models: async () => refused('unavailable'),
    test: async () => refused('unavailable'),
    ledger: async () => refused('unavailable'),
    wipe: async () => {
      secrets.clear();
      return accepted(null);
    },
    onProblem: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export interface MemoryHostOptions {
  /** Clock for the save container; default a fixed 0. */
  now?: () => number;
  writer?: { id: string; name: string };
  /** The byte store under the saves (pass one to inject power cuts). */
  storage?: MemoryStorage;
  /** Container options beyond the clock and writer (collection timing, versions). */
  container?: Omit<ContainerOptions, 'now' | 'writer'>;
  /** Scripted model answers; default every request answers not_configured. */
  llm?: LlmResponder;
  /** Whether the store sink is available; default true so tests can read unlocks back. */
  achievements?: boolean;
}

export interface MemoryHost extends PlatformHost {
  readonly kind: 'memory';
  readonly storage: MemoryStorage;
  readonly settingsStore: Map<SettingsPart, SettingsValues>;
  readonly gateway: MemoryGateway;
  readonly logs: { level: LogLevel; message: string }[];
  readonly unlocked: string[];
  readonly stats: Map<string, number>;
  readonly presence: Map<string, string>;
  readonly opened: string[];
  readonly frameCaps: FrameCap[];
  readonly modes: string[];
  /** Push a window event to onEvent listeners. */
  emit(event: PlatformEvent): void;
}

export function createMemoryHost(opts: MemoryHostOptions = {}): MemoryHost {
  const now = opts.now ?? (() => 0);
  const storage = opts.storage ?? new MemoryStorage({ now });
  const saves = new ContainerBackend(storage, {
    ...opts.container,
    now,
    writer: opts.writer ?? { id: 'w-00000000', name: 'memory' },
  });
  const settingsStore = new Map<SettingsPart, SettingsValues>();
  const gateway = memoryGateway(opts.llm ?? notConfiguredAnswer);
  const logs: { level: LogLevel; message: string }[] = [];
  const unlocked: string[] = [];
  const stats = new Map<string, number>();
  const presence = new Map<string, string>();
  const opened: string[] = [];
  const frameCaps: FrameCap[] = [];
  const modes: string[] = [];
  const listeners = new Set<(e: PlatformEvent) => void>();
  const store = opts.achievements ?? true;
  const isPart = (p: unknown): p is SettingsPart =>
    (SETTINGS_PART_NAMES as readonly unknown[]).includes(p);

  return {
    kind: 'memory',
    storage,
    settingsStore,
    gateway,
    logs,
    unlocked,
    stats,
    presence,
    opened,
    frameCaps,
    modes,
    emit: (event) => {
      for (const l of [...listeners]) l(event);
    },
    info: async () => ({
      kind: 'memory',
      version: '0.0.0',
      build: 'memory',
      channel: 'memory',
      contentVersion: 'unknown',
      platform: 'memory',
    }),
    // Nothing here outlives the test.
    durability: async () => ({ saves: false, settings: false }),
    saves,
    settings: {
      get: async (part) => {
        if (!isPart(part)) return refused('bad_request');
        const v = settingsStore.get(part);
        return accepted(v ? structuredClone(v) : null);
      },
      set: async (part, values) => {
        if (!isPart(part) || !isSettingsValues(values)) return refused('bad_request');
        // Stored as JSON would store it: no functions, no undefined fields.
        const stored = JSON.parse(JSON.stringify(values)) as SettingsValues;
        settingsStore.set(part, stored);
        return accepted(structuredClone(stored));
      },
    },
    llm: { route: 'gateway', gateway },
    achievements: {
      available: store,
      unlock: async (api) => {
        if (!store) return refused('unavailable');
        if (!unlocked.includes(api)) unlocked.push(api);
        return accepted(null);
      },
      setStat: async (name, value) => {
        if (!store) return refused('unavailable');
        stats.set(name, value);
        return accepted(null);
      },
      setPresence: async (key, value) => {
        if (!store) return refused('unavailable');
        presence.set(key, value);
        return accepted(null);
      },
      status: async () => (store ? accepted({ running: true }) : refused('unavailable')),
    },
    diagnostics: {
      log: (level, message) => {
        logs.push({ level, message: String(message) });
      },
      exportBundle: async () => refused('unavailable'),
      pendingCrash: async () => accepted([]),
      sendCrash: async () => refused('unavailable'),
    },
    window: {
      setMode: async (mode) => {
        modes.push(mode);
        return accepted(null);
      },
      setFrameCap: async (cap) => {
        frameCaps.push(cap);
        return accepted(cap);
      },
      openExternal: async (url) => {
        if (!isHttpsLink(url)) return refused('bad_request');
        opened.push(url);
        return accepted(null);
      },
      onEvent: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  };
}
