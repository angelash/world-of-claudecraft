// What each hk:* channel does once the guard has passed it (docs/50_tech/release_engineering.md
// 2.3). One handler per channel, one job each. Saves go to the save container over files
// (PK-M0-16's container, wired by PK-M0-20) and answer in the shapes the desktop host parses
// (src/platform/desktop_host.ts): the container's own result, failures included, as the
// value. Settings go to the settings files (desktop/settings.ts). The Steam, diagnostics and
// crash channels answer not_implemented until their packages (PK-M2-02, PK-M2-03) fill in the
// handler only; so does hk:save.importDemo (the demo save import, 4.9). The model channels go
// to the gateway; hk:llm.request (a port channel) is handled in shell.ts.

import type { SaveBackend, SaveReadRequest, SaveWriteRequest } from '../../src/core/save/backend';
import type { SlotId } from '../../src/core/save/header';
import type { GatewayClient, GatewayReply } from '../llm_gateway/client';
import type { KeyStatus } from '../llm_gateway/protocol';
import type { RotatingLog } from '../logging';
import { type BuildInfo, externalUrlAllowed } from '../security';
import type { DesktopSettings } from '../settings';
import { HK, type HkKey, type HkResult, type PayloadOf } from './channels';

export interface AppInfo {
  version: string;
  build: string;
  channel: BuildInfo['channel'];
  contentVersion: string;
  platform: string;
}

export interface HandlerDeps {
  build: BuildInfo;
  platform: string;
  gateway: GatewayClient;
  /** Opens the key entry window; resolves when it closes. */
  enterKey(connectionId: string, target: string): Promise<HkResult<KeyStatus>>;
  openExternal(url: string): Promise<void>;
  setFullScreen(on: boolean): void;
  isFullScreen(): boolean;
  rendererLog: RotatingLog;
  /** The save container over the saves directory; channels answer unavailable without it. */
  saves?: SaveBackend | null;
  /** The settings files; channels answer unavailable without them. */
  settings?: Pick<DesktopSettings, 'get' | 'set' | 'local' | 'unreadable'> | null;
}

type Invoke<K extends HkKey> = (payload: PayloadOf<K>) => Promise<HkResult<unknown>>;
type Send<K extends HkKey> = (payload: PayloadOf<K>) => void;

const notImplemented = async (): Promise<HkResult<never>> => ({
  ok: false,
  reason: 'not_implemented',
});

const unavailable: HkResult<never> = { ok: false, reason: 'unavailable' };

const accepted = <T>(value: T): HkResult<T> => ({ ok: true, value });

function fromGateway(reply: GatewayReply): HkResult<unknown> {
  return reply.ok ? { ok: true, value: reply.value } : { ok: false, reason: reply.reason };
}

export type FrameCap = 30 | 60 | 'display';

export function createHandlers(deps: HandlerDeps) {
  let frameCap: FrameCap = deps.settings?.local().frameCap ?? 60;
  const saves = deps.saves ?? null;
  const settings = deps.settings ?? null;

  const invoke: { [K in HkKey]?: Invoke<K> } = {
    appInfo: async () => ({
      ok: true,
      value: {
        version: deps.build.version,
        build: deps.build.build,
        channel: deps.build.channel,
        contentVersion: deps.build.contentVersion,
        platform: deps.platform,
      } satisfies AppInfo,
    }),

    // The payload checks passed (slot ids, run ids, hashes, sizes); the container checks the
    // header and every hash itself and answers its own failure codes.
    saveList: async () => (saves ? accepted(await saves.list()) : unavailable),
    saveWrite: async (p) =>
      saves ? accepted(await saves.write(p as unknown as SaveWriteRequest)) : unavailable,
    saveRead: async (p) =>
      saves ? accepted(await saves.read(p as unknown as SaveReadRequest)) : unavailable,
    saveDelete: async (p) => {
      if (!saves) return unavailable;
      await saves.delete({ slotId: p.slotId as SlotId });
      return accepted(null);
    },
    saveRecoverables: async () => (saves ? accepted(await saves.recoverables()) : unavailable),
    saveRestore: async (p) =>
      saves
        ? accepted(await saves.restore({ candidateId: p.candidateId, slotId: p.slotId as SlotId }))
        : unavailable,
    saveImportDemo: notImplemented,
    // A part whose file could not be read answers unavailable, so the page never writes it.
    settingsGet: async (p) =>
      settings && !settings.unreadable(p.part) ? accepted(settings.get(p.part)) : unavailable,
    settingsSet: async (p) => {
      if (!settings) return unavailable;
      const r = await settings.set(p.part, p.values);
      // The frame cap is the page's setting (one writer); the shell follows what it stored.
      if (r.ok && p.part === 'local') frameCap = settings.local().frameCap;
      return r;
    },

    llmSecretEnter: (p) => deps.enterKey(p.connectionId, p.target ?? 'key'),
    llmSecretHas: async (p) =>
      fromGateway(await deps.gateway.call('secret.has', { connectionId: p.connectionId })),
    llmSecretClear: async (p) =>
      fromGateway(await deps.gateway.call('secret.clear', { connectionId: p.connectionId })),
    llmModels: async (p) =>
      fromGateway(await deps.gateway.call('models', { connectionId: p.connectionId })),
    llmTest: async (p) =>
      fromGateway(
        await deps.gateway.call('test', {
          connectionId: p.connectionId,
          depth: p.depth,
          ...(p.models ? { models: p.models } : {}),
        }),
      ),
    llmLedger: async (p) => fromGateway(await deps.gateway.call('ledger', { window: p.window })),
    llmWipe: async () => fromGateway(await deps.gateway.call('wipe', {})),

    steamAchieve: notImplemented,
    steamStat: notImplemented,
    steamPresence: notImplemented,
    steamStatus: async () => ({ ok: true, value: { available: false } }),

    diagExport: notImplemented,
    crashPending: async () => ({ ok: true, value: [] }),
    crashSend: notImplemented,

    windowMode: async (p) => {
      // The shell records the mode in the local part when the window changes (shell.ts).
      deps.setFullScreen(p.mode === 'fullscreen');
      return { ok: true, value: deps.isFullScreen() ? 'fullscreen' : 'windowed' };
    },
    windowFrameCap: async (p) => {
      // Applies the cap; the page keeps it in the local part (hk:settings.set), and the next
      // start begins from the stored value.
      frameCap = p.cap;
      return { ok: true, value: frameCap };
    },

    shellOpenExternal: async (p) => {
      if (!externalUrlAllowed(p.url)) return { ok: false, reason: 'forbidden' };
      try {
        // Open the parsed, normalised address, so the shell sees exactly what was checked.
        await deps.openExternal(new URL(p.url).href);
        return { ok: true, value: null };
      } catch {
        return { ok: false, reason: 'failed' };
      }
    },
  };

  const send: { [K in HkKey]?: Send<K> } = {
    log: (p) => deps.rendererLog.write(p.level, 'renderer', p.message),
    llmAbort: (p) => deps.gateway.abort(p.requestId),
  };

  return { invoke, send, frameCap: () => frameCap };
}

/** Every invoke and send channel has exactly one handler; pinned by the surface test. */
export function handlerCoverage(handlers: ReturnType<typeof createHandlers>): {
  missing: string[];
  extra: string[];
} {
  const missing: string[] = [];
  const extra: string[] = [];
  for (const [key, def] of Object.entries(HK)) {
    const has =
      def.kind === 'invoke'
        ? key in handlers.invoke
        : def.kind === 'send'
          ? key in handlers.send
          : false;
    if ((def.kind === 'invoke' || def.kind === 'send') && !has) missing.push(def.name);
  }
  for (const key of [...Object.keys(handlers.invoke), ...Object.keys(handlers.send)]) {
    const def = (HK as Record<string, { kind: string; name: string }>)[key];
    if (!def) extra.push(key);
    else if (key in handlers.invoke && def.kind !== 'invoke') extra.push(def.name);
    else if (key in handlers.send && def.kind !== 'send') extra.push(def.name);
  }
  return { missing, extra };
}
