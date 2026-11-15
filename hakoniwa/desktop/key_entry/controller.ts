// Main process side of the key entry window (docs/50_tech/llm_providers.md 5.5,
// release_engineering.md 2.5): one window at a time, modal over the game, loaded from its
// own origin with its own preload. A submitted or pasted key is checked here and handed
// straight to the gateway; the main process keeps no copy, and the game page only ever
// receives the resulting KeyStatus (at most the last four characters).

import type { BrowserWindowConstructorOptions } from 'electron';
import type { HkResult } from '../ipc/channels';
import type { GatewayClient } from '../llm_gateway/client';
import type { KeyStatus } from '../llm_gateway/protocol';
import { KEY_ENTRY_URL, keyEntryWindowOptions } from '../security';
import { checkKeyText, type KeyRejection, keyFromClipboard } from './rules';

/** The parts of a BrowserWindow the controller uses. */
export interface KeyWindowLike {
  readonly webContents: { readonly id: number };
  loadURL(url: string): Promise<void>;
  once(event: 'ready-to-show', listener: () => void): unknown;
  on(event: 'closed', listener: () => void): unknown;
  show(): void;
  close(): void;
  isDestroyed(): boolean;
}

export interface KeyEntryDeps {
  createWindow(options: BrowserWindowConstructorOptions): KeyWindowLike;
  parent(): BrowserWindowConstructorOptions['parent'] | undefined;
  preload: string;
  gateway: GatewayClient;
  readClipboard(): string;
  log(message: string): void;
}

/** What the key entry page hears back after submit or paste: never the key. */
export type KeySubmitAnswer = { ok: true } | { ok: false; reason: KeyRejection | 'failed' };

export interface KeyEntryController {
  open(connectionId: string, target: string): Promise<HkResult<KeyStatus>>;
  /** True when `senderId` is the web contents of the open key window. */
  isKeyWindow(senderId: number): boolean;
  submit(secret: string): Promise<KeySubmitAnswer>;
  paste(): Promise<KeySubmitAnswer>;
  cancel(): void;
}

export function createKeyEntry(deps: KeyEntryDeps): KeyEntryController {
  let active: {
    win: KeyWindowLike;
    connectionId: string;
    target: string;
    result: KeyStatus | null;
  } | null = null;

  const store = async (raw: string): Promise<KeySubmitAnswer> => {
    const a = active;
    if (!a) return { ok: false, reason: 'failed' };
    const checked = checkKeyText(raw);
    if (!checked.ok) return checked;
    const reply = await deps.gateway.call('secret.put', {
      connectionId: a.connectionId,
      target: a.target,
      secret: raw,
    });
    if (!reply.ok) {
      deps.log(`key entry: gateway refused the key (${reply.reason})`);
      return { ok: false, reason: 'failed' };
    }
    a.result = reply.value as KeyStatus;
    if (!a.win.isDestroyed()) a.win.close();
    return { ok: true };
  };

  return {
    open(connectionId, target) {
      if (active) return Promise.resolve({ ok: false, reason: 'busy' });
      return new Promise((resolve) => {
        const win = deps.createWindow(
          keyEntryWindowOptions({ preload: deps.preload, parent: deps.parent() }),
        );
        const entry = { win, connectionId, target, result: null as KeyStatus | null };
        active = entry;
        win.once('ready-to-show', () => win.show());
        win.on('closed', () => {
          if (active === entry) active = null;
          if (entry.result) {
            resolve({ ok: true, value: entry.result });
            return;
          }
          // Cancelled or closed: report what the gateway holds now.
          void deps.gateway
            .call('secret.has', { connectionId })
            .then((r) =>
              resolve(
                r.ok ? { ok: true, value: r.value as KeyStatus } : { ok: false, reason: r.reason },
              ),
            );
        });
        win.loadURL(KEY_ENTRY_URL).catch(() => {
          deps.log('key entry: page failed to load');
          if (!win.isDestroyed()) win.close();
        });
      });
    },
    isKeyWindow: (senderId) => active !== null && active.win.webContents.id === senderId,
    submit: (secret) => store(secret),
    paste: () => store(keyFromClipboard(deps.readClipboard())),
    cancel() {
      if (active && !active.win.isDestroyed()) active.win.close();
    },
  };
}
