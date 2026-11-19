// The window.hk bridge the game preload exposes (docs/50_tech/release_engineering.md 2.3,
// llm_providers.md 7.2): one named method per hk:* channel, grouped by domain, and nothing
// else: no generic invoke, no raw ipcRenderer, no event objects handed to the page.
// createHkBridge() is pure over an injected ipcRenderer so tests pin the method-to-channel
// map; desktop/preload.ts passes the real one to contextBridge. The game side
// (src/platform/desktop_host.ts, a later package) types window.hk with HkBridge.

import type { LlmCallResult, LlmCallSpec } from '../src/ai/contracts';
import type { HkResult, PayloadOf } from './ipc/channels';
import type { AppInfo, FrameCap } from './ipc/handlers';
import { HK_NAMES } from './ipc/names';
import type { FromGateway, KeyStatus } from './llm_gateway/protocol';

/** Window and power events the shell pushes on hk:event (2.3). */
export type HkEvent =
  | { kind: 'focus' }
  | { kind: 'blur' }
  | { kind: 'minimize' }
  | { kind: 'restore' }
  | { kind: 'suspend' }
  | { kind: 'resume' }
  | { kind: 'fullscreen'; on: boolean };

export type HkProblem = Omit<Extract<FromGateway, { kind: 'problem' }>, 'kind'>;

type Call<K extends keyof typeof HK_NAMES, T = unknown> = (
  payload: PayloadOf<K>,
) => Promise<HkResult<T>>;
type Call0<T = unknown> = () => Promise<HkResult<T>>;

export interface HkBridge {
  readonly app: { info: Call0<AppInfo> };
  readonly saves: {
    list: Call0;
    write: Call<'saveWrite'>;
    read: Call<'saveRead'>;
    delete: Call<'saveDelete'>;
    recoverables: Call0;
    restore: Call<'saveRestore'>;
    importDemo: Call<'saveImportDemo'>;
  };
  readonly settings: { get: Call<'settingsGet'>; set: Call<'settingsSet'> };
  readonly llm: {
    /** Streams body deltas to onDelta; resolves with the receipt (never rejects). */
    request(spec: LlmCallSpec, onDelta?: (text: string) => void): Promise<LlmCallResult>;
    abort(requestId: string): void;
    /** A lineage hint namespaces request ids; it cannot reset spending caps. */
    scope: Call<'llmScope'>;
    secretEnter: Call<'llmSecretEnter', KeyStatus>;
    secretHas: Call<'llmSecretHas', KeyStatus>;
    secretClear: Call<'llmSecretClear', KeyStatus>;
    models: Call<'llmModels'>;
    test: Call<'llmTest'>;
    ledger: Call<'llmLedger'>;
    wipe: Call0;
    onProblem(listener: (problem: HkProblem) => void): () => void;
  };
  readonly steam: {
    achieve: Call<'steamAchieve'>;
    stat: Call<'steamStat'>;
    presence: Call<'steamPresence'>;
    status: Call0;
  };
  readonly diag: { export: Call<'diagExport'> };
  readonly crash: { pending: Call0; send: Call<'crashSend'> };
  readonly window: { mode: Call<'windowMode'>; frameCap: Call<'windowFrameCap', FrameCap> };
  readonly shell: { openExternal: Call<'shellOpenExternal'> };
  log(level: 'error' | 'warn' | 'info', message: string): void;
  onEvent(listener: (event: HkEvent) => void): () => void;
}

/** The ipcRenderer methods the bridge uses. */
export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  send(channel: string, ...args: unknown[]): void;
  postMessage(channel: string, message: unknown, transfer?: MessagePort[]): void;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
}

/** Longest a request may wait for its receipt before the bridge answers timeout itself. */
export const REQUEST_GRACE_MS = 5000;
export const MAX_REQUEST_TIMEOUT_MS = 300_000;

function timedOut(): LlmCallResult {
  return {
    ok: false,
    problem: 'timeout',
    error: { cls: 'timeout', message: 'no receipt from the shell' },
    latencyMs: 0,
  };
}

export function createHkBridge(
  ipc: IpcRendererLike,
  makeChannel: () => { port1: MessagePort; port2: MessagePort } = () => new MessageChannel(),
): HkBridge {
  const call =
    (name: string) =>
    (payload?: unknown): Promise<HkResult<never>> =>
      (payload === undefined ? ipc.invoke(name) : ipc.invoke(name, payload)) as Promise<
        HkResult<never>
      >;
  const subscribe =
    <T>(name: string) =>
    (listener: (value: T) => void): (() => void) => {
      const relay = (_event: unknown, value: unknown) => listener(value as T);
      ipc.on(name, relay);
      return () => {
        ipc.removeListener(name, relay);
      };
    };

  return {
    app: { info: call(HK_NAMES.appInfo) },
    saves: {
      list: call(HK_NAMES.saveList),
      write: call(HK_NAMES.saveWrite),
      read: call(HK_NAMES.saveRead),
      delete: call(HK_NAMES.saveDelete),
      recoverables: call(HK_NAMES.saveRecoverables),
      restore: call(HK_NAMES.saveRestore),
      importDemo: call(HK_NAMES.saveImportDemo),
    },
    settings: { get: call(HK_NAMES.settingsGet), set: call(HK_NAMES.settingsSet) },
    llm: {
      request(spec, onDelta) {
        return new Promise<LlmCallResult>((resolve) => {
          const { port1, port2 } = makeChannel();
          let settled = false;
          const wait =
            Math.min(Math.max(Number(spec?.timeoutMs) || 0, 0), MAX_REQUEST_TIMEOUT_MS) +
            REQUEST_GRACE_MS;
          const finish = (result: LlmCallResult) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            port1.close();
            resolve(result);
          };
          const timer = setTimeout(() => finish(timedOut()), wait);
          port1.onmessage = (e: MessageEvent) => {
            const m = e.data as { t?: unknown; text?: unknown; result?: unknown } | null;
            if (m?.t === 'delta' && typeof m.text === 'string') onDelta?.(m.text);
            else if (m?.t === 'done' || m?.t === 'error') finish(m.result as LlmCallResult);
          };
          ipc.postMessage(HK_NAMES.llmRequest, spec, [port2]);
        });
      },
      abort: (requestId) => ipc.send(HK_NAMES.llmAbort, { requestId }),
      scope: call(HK_NAMES.llmScope),
      secretEnter: call(HK_NAMES.llmSecretEnter),
      secretHas: call(HK_NAMES.llmSecretHas),
      secretClear: call(HK_NAMES.llmSecretClear),
      models: call(HK_NAMES.llmModels),
      test: call(HK_NAMES.llmTest),
      ledger: call(HK_NAMES.llmLedger),
      wipe: call(HK_NAMES.llmWipe),
      onProblem: subscribe<HkProblem>(HK_NAMES.llmProblem),
    },
    steam: {
      achieve: call(HK_NAMES.steamAchieve),
      stat: call(HK_NAMES.steamStat),
      presence: call(HK_NAMES.steamPresence),
      status: call(HK_NAMES.steamStatus),
    },
    diag: { export: call(HK_NAMES.diagExport) },
    crash: { pending: call(HK_NAMES.crashPending), send: call(HK_NAMES.crashSend) },
    window: { mode: call(HK_NAMES.windowMode), frameCap: call(HK_NAMES.windowFrameCap) },
    shell: { openExternal: call(HK_NAMES.shellOpenExternal) },
    log: (level, message) => ipc.send(HK_NAMES.log, { level, message: String(message) }),
    onEvent: subscribe<HkEvent>(HK_NAMES.event),
  };
}
