// What each hk:* channel does once the guard has passed it (docs/50_tech/release_engineering.md
// 2.3). One handler per channel, one job each. In this skeleton the save, settings, Steam,
// diagnostics and crash channels answer not_implemented: their payload checks are already
// live, and the packages that own them (PK-M0-16 saves, PK-M0-20 settings, PK-M2-02 Steam,
// PK-M2-03 crash and diagnostics) fill in the handler only. The model channels go to the
// gateway; hk:llm.request (a port channel) is handled in shell.ts.

import type { GatewayClient, GatewayReply } from '../llm_gateway/client';
import type { KeyStatus } from '../llm_gateway/protocol';
import type { RotatingLog } from '../logging';
import { type BuildInfo, externalUrlAllowed } from '../security';
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
}

type Invoke<K extends HkKey> = (payload: PayloadOf<K>) => Promise<HkResult<unknown>>;
type Send<K extends HkKey> = (payload: PayloadOf<K>) => void;

const notImplemented = async (): Promise<HkResult<never>> => ({
  ok: false,
  reason: 'not_implemented',
});

function fromGateway(reply: GatewayReply): HkResult<unknown> {
  return reply.ok ? { ok: true, value: reply.value } : { ok: false, reason: reply.reason };
}

export type FrameCap = 30 | 60 | 'display';

export function createHandlers(deps: HandlerDeps) {
  let frameCap: FrameCap = 60;

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

    saveList: notImplemented,
    saveWrite: notImplemented,
    saveRead: notImplemented,
    saveDelete: notImplemented,
    saveRecoverables: notImplemented,
    saveRestore: notImplemented,
    saveImportDemo: notImplemented,
    settingsGet: notImplemented,
    settingsSet: notImplemented,

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
      deps.setFullScreen(p.mode === 'fullscreen');
      return { ok: true, value: deps.isFullScreen() ? 'fullscreen' : 'windowed' };
    },
    windowFrameCap: async (p) => {
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
