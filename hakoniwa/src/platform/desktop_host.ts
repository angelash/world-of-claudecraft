// The desktop PlatformHost: a thin layer over window.hk, the preload bridge of the desktop
// shell (desktop/bridge.ts; release_engineering.md 2.3). Every member maps to named bridge
// methods; nothing here touches files, keys or the network. Saves are a pass-through to the
// hk:save.* channels, whose main-process handler runs the save container over files
// (PK-M0-16), so a refusal at the channel becomes a SaveFailure or a thrown error exactly
// where the in-process container (src/core/save/container.ts) would fail the same way.

import type { HkBridge } from '../../desktop/bridge';
import type {
  Recoverable,
  SaveBackend,
  SaveFailure,
  SaveReadResult,
  SaveWriteResult,
  SlotRecord,
} from '../core/save/backend';
import {
  type FrameCap,
  isSettingsValues,
  type PlatformHost,
  type PlatformInfo,
  type PlatformReason,
  type PlatformResult,
  refused,
  type SettingsValues,
} from './host';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isFn = (v: unknown) => typeof v === 'function';

/** True when a value has the shape of the preload bridge (window.hk). */
export function isHkBridge(value: unknown): value is HkBridge {
  if (!isObject(value)) return false;
  const v = value as Record<string, Record<string, unknown> | undefined>;
  return (
    isFn(v.app?.info) &&
    isFn(v.saves?.write) &&
    isFn(v.saves?.read) &&
    isFn(v.settings?.get) &&
    isFn(v.llm?.request) &&
    isFn(v.window?.mode) &&
    isFn((value as { log?: unknown }).log) &&
    isFn((value as { onEvent?: unknown }).onEvent)
  );
}

/** A refused channel as a save failure: shape errors are the caller's, the rest are I/O. */
function saveRefusal(channel: string, reason: PlatformReason): SaveFailure {
  const code = reason === 'bad_request' || reason === 'too_large' ? 'bad_request' : 'io';
  return { ok: false, code, reason: `${channel} refused: ${reason}` };
}

function malformed(channel: string): SaveFailure {
  return { ok: false, code: 'io', reason: `${channel} answered an unexpected shape` };
}

const isResultShape = (v: unknown): v is { ok: boolean } =>
  isObject(v) && typeof v.ok === 'boolean';

/** The value of an accepted call, or an error naming the channel and the reason. */
function valueOr(channel: string, r: PlatformResult<unknown>): unknown {
  if (!r.ok) throw new Error(`${channel} refused: ${r.reason}`);
  return r.value;
}

function desktopSaves(hk: HkBridge): SaveBackend {
  return {
    async list(): Promise<SlotRecord[]> {
      const v = valueOr('hk:save.list', await hk.saves.list());
      if (!Array.isArray(v)) throw new Error('hk:save.list answered an unexpected shape');
      return v as SlotRecord[];
    },
    async write(req): Promise<SaveWriteResult> {
      const r = await hk.saves.write(req);
      if (!r.ok) return saveRefusal('hk:save.write', r.reason);
      return isResultShape(r.value) ? (r.value as SaveWriteResult) : malformed('hk:save.write');
    },
    async read(req): Promise<SaveReadResult> {
      const r = await hk.saves.read(req);
      if (!r.ok) return saveRefusal('hk:save.read', r.reason);
      return isResultShape(r.value) ? (r.value as SaveReadResult) : malformed('hk:save.read');
    },
    async delete(req): Promise<void> {
      valueOr('hk:save.delete', await hk.saves.delete(req));
    },
    async recoverables(): Promise<Recoverable[]> {
      const v = valueOr('hk:save.recoverables', await hk.saves.recoverables());
      if (!Array.isArray(v)) throw new Error('hk:save.recoverables answered an unexpected shape');
      return v as Recoverable[];
    },
    async restore(req): Promise<SaveWriteResult> {
      const r = await hk.saves.restore(req);
      if (!r.ok) return saveRefusal('hk:save.restore', r.reason);
      return isResultShape(r.value) ? (r.value as SaveWriteResult) : malformed('hk:save.restore');
    },
  };
}

/** Settings answers must be a plain object (or null for "nothing stored yet"). */
function settingsAnswer<T extends SettingsValues | null>(
  r: PlatformResult<unknown>,
  allowNull: boolean,
): PlatformResult<T> {
  if (!r.ok) return r;
  if ((allowNull && r.value === null) || isSettingsValues(r.value)) {
    return { ok: true, value: r.value as T };
  }
  return refused('failed');
}

export function createDesktopHost(hk: HkBridge): PlatformHost {
  return {
    kind: 'desktop',
    async info(): Promise<PlatformInfo> {
      const r = await hk.app.info();
      if (!r.ok) {
        return {
          kind: 'desktop',
          version: 'unknown',
          build: 'unknown',
          channel: 'unknown',
          contentVersion: 'unknown',
          platform: 'unknown',
        };
      }
      return { kind: 'desktop', ...r.value };
    },
    // Saves and settings are files in the user data directory (5.2).
    durability: async () => ({ saves: true, settings: true }),
    saves: desktopSaves(hk),
    settings: {
      get: async (part) => settingsAnswer(await hk.settings.get({ part }), true),
      set: async (part, values) => settingsAnswer(await hk.settings.set({ part, values }), false),
    },
    llm: { route: 'gateway', gateway: hk.llm },
    achievements: {
      available: true,
      unlock: (api) => hk.steam.achieve({ api }),
      setStat: (name, value) => hk.steam.stat({ name, value }),
      setPresence: (key, value) => hk.steam.presence({ key, value }),
      status: () => hk.steam.status(),
    },
    diagnostics: {
      log: (level, message) => hk.log(level, message),
      exportBundle: (options) => hk.diag.export(options),
      pendingCrash: () => hk.crash.pending(),
      sendCrash: (reportId, autoSend) =>
        hk.crash.send(autoSend === undefined ? { reportId } : { reportId, autoSend }),
    },
    window: {
      setMode: (mode) => hk.window.mode({ mode }),
      setFrameCap: (cap): Promise<PlatformResult<FrameCap>> => hk.window.frameCap({ cap }),
      openExternal: (url) => hk.shell.openExternal({ url }),
      onEvent: (listener) => hk.onEvent(listener),
    },
  };
}
