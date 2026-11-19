// The hk:* channel table (docs/50_tech/release_engineering.md 2.3 and llm_providers.md 7.2):
// every channel the game page may use, its direction, its payload check, its size cap and
// its rate limit. Nothing outside this table is ever registered, and the preload exposes
// one named method per entry (desktop/bridge.ts); there is no generic channel or call.
// The key entry window has its own three channels (KEY_ENTRY_CHANNELS), trusted only from
// its own origin and never reachable from the game page.

import { isRunId, isSha256, isSlotId, SETTINGS_PARTS } from '../paths';
import { HK_NAMES, KEY_ENTRY_NAMES } from './names';
import {
  arr,
  bool,
  bytes,
  type Check,
  type CheckValue,
  json,
  none,
  num,
  obj,
  oneOf,
  str,
  where,
} from './validate';

/**
 * invoke: renderer asks, main answers (ipcRenderer.invoke / ipcMain.handle).
 * send: renderer to main, no answer (ipcRenderer.send / ipcMain.on).
 * port: renderer to main with one MessagePort (ipcRenderer.postMessage / ipcMain.on).
 * push: main to renderer events (webContents.send / ipcRenderer.on).
 */
export type ChannelKind = 'invoke' | 'send' | 'port' | 'push';

export interface RateRule {
  /** Channels sharing a bucket share the budget. */
  bucket: string;
  max: number;
  windowMs: number;
}

export interface ChannelDef<P = unknown> {
  name: string;
  kind: ChannelKind;
  payload: Check<P>;
  /** Cap on the approximate wire size of the payload (validate.ts payloadBytes). */
  maxBytes: number;
  rate?: RateRule;
}

const KiB = 1024;
const MiB = 1024 * KiB;

/** A single save write is at most 64 MB (2.3). */
export const SAVE_WRITE_MAX_BYTES = 64 * MiB;
/** One slot header as JSON. */
export const SAVE_HEADER_MAX_BYTES = 256 * KiB;
/** hk:llm.request pre-check; parseCallSpec then enforces 256 KiB of serialised JSON. */
export const LLM_REQUEST_MAX_BYTES = 1 * MiB;
export const DEFAULT_MAX_BYTES = 16 * KiB;

const CONNECTION_ID = str({ min: 1, max: 64, pattern: /^[A-Za-z0-9_-]+$/ });
const REQUEST_ID = str({ min: 1, max: 96 });
const SLOT_ID = where(isSlotId, 'unknown slot id');
const RUN_ID = where(isRunId, 'bad run id');
const SHA256 = where(isSha256, 'bad sha256');
const CANDIDATE_ID = str({ min: 1, max: 160, pattern: /^[A-Za-z0-9_.-]+$/ });
const SETTINGS_PART = oneOf(SETTINGS_PARTS);
/** Settings values: plain JSON; the settings store (PK-M0-20) checks each field. */
const SETTINGS_VALUES = json({ maxDepth: 8, maxNodes: 4000 });

const SAVE_FILE = obj({
  sha256: SHA256,
  kind: oneOf(['snapshot', 'segment'] as const),
  bytes: bytes(SAVE_WRITE_MAX_BYTES),
});

const per = (bucket: string, max: number, windowMs: number): RateRule => ({
  bucket,
  max,
  windowMs,
});

function def<P>(
  name: string,
  kind: ChannelKind,
  payload: Check<P>,
  extra: { maxBytes?: number; rate?: RateRule } = {},
): ChannelDef<P> {
  return { name, kind, payload, maxBytes: extra.maxBytes ?? DEFAULT_MAX_BYTES, rate: extra.rate };
}

/** Every hk:* channel of the game page. Keys are the bridge's internal names. */
export const HK = {
  appInfo: def(HK_NAMES.appInfo, 'invoke', none),

  saveList: def(HK_NAMES.saveList, 'invoke', none),
  saveWrite: def(
    HK_NAMES.saveWrite,
    'invoke',
    obj({
      runId: RUN_ID,
      slotId: SLOT_ID,
      files: arr(SAVE_FILE, { max: 256 }),
      header: json({ maxDepth: 8, maxNodes: 4000 }),
    }),
    { maxBytes: SAVE_WRITE_MAX_BYTES },
  ),
  saveRead: def(
    HK_NAMES.saveRead,
    'invoke',
    obj({ slotId: SLOT_ID, hashes: arr(SHA256, { max: 256 }) }),
  ),
  saveDelete: def(HK_NAMES.saveDelete, 'invoke', obj({ slotId: SLOT_ID })),
  saveRecoverables: def(HK_NAMES.saveRecoverables, 'invoke', none),
  saveRestore: def(
    HK_NAMES.saveRestore,
    'invoke',
    obj({ candidateId: CANDIDATE_ID, slotId: SLOT_ID }),
  ),
  saveImportDemo: def(HK_NAMES.saveImportDemo, 'invoke', obj({ candidateId: CANDIDATE_ID })),

  settingsGet: def(HK_NAMES.settingsGet, 'invoke', obj({ part: SETTINGS_PART })),
  settingsSet: def(
    HK_NAMES.settingsSet,
    'invoke',
    obj({ part: SETTINGS_PART, values: SETTINGS_VALUES }),
    { maxBytes: 256 * KiB },
  ),

  llmRequest: def(HK_NAMES.llmRequest, 'port', json({ maxDepth: 16, maxNodes: 20_000 }), {
    maxBytes: LLM_REQUEST_MAX_BYTES,
  }),
  llmAbort: def(HK_NAMES.llmAbort, 'send', obj({ requestId: REQUEST_ID })),
  llmSecretEnter: def(
    HK_NAMES.llmSecretEnter,
    'invoke',
    obj(
      {
        connectionId: CONNECTION_ID,
        target: str({ min: 3, max: 72, pattern: /^(key|header:[A-Za-z0-9-]{1,64})$/ }),
      },
      { optional: ['target'] },
    ),
  ),
  llmSecretHas: def(HK_NAMES.llmSecretHas, 'invoke', obj({ connectionId: CONNECTION_ID })),
  llmSecretClear: def(HK_NAMES.llmSecretClear, 'invoke', obj({ connectionId: CONNECTION_ID })),
  llmModels: def(HK_NAMES.llmModels, 'invoke', obj({ connectionId: CONNECTION_ID }), {
    rate: per('llm.probe', 10, 60_000),
  }),
  llmTest: def(
    HK_NAMES.llmTest,
    'invoke',
    obj(
      {
        connectionId: CONNECTION_ID,
        depth: oneOf(['quick', 'deep'] as const),
        models: arr(str({ min: 1, max: 200 }), { max: 8 }),
      },
      { optional: ['models'] },
    ),
    { rate: per('llm.probe', 10, 60_000) },
  ),
  llmLedger: def(
    HK_NAMES.llmLedger,
    'invoke',
    obj({ window: oneOf(['hour', 'day', 'run'] as const) }),
  ),
  llmWipe: def(HK_NAMES.llmWipe, 'invoke', none),
  llmScope: def(
    HK_NAMES.llmScope,
    'invoke',
    obj({ runId: str({ min: 1, max: 128, pattern: /^[A-Za-z0-9_-]+$/ }) }),
  ),
  llmProblem: def(HK_NAMES.llmProblem, 'push', none),

  steamAchieve: def(
    HK_NAMES.steamAchieve,
    'invoke',
    obj({ api: str({ min: 4, max: 64, pattern: /^HK_[A-Z0-9_]+$/ }) }),
  ),
  steamStat: def(
    HK_NAMES.steamStat,
    'invoke',
    obj({
      name: str({ min: 4, max: 64, pattern: /^HK_[A-Z0-9_]+$/ }),
      value: num({ min: -1e9, max: 1e9 }),
    }),
  ),
  steamPresence: def(
    HK_NAMES.steamPresence,
    'invoke',
    obj({
      key: str({ min: 1, max: 64, pattern: /^[a-z0-9_]+$/ }),
      value: str({ max: 256 }),
    }),
  ),
  steamStatus: def(HK_NAMES.steamStatus, 'invoke', none),

  diagExport: def(
    HK_NAMES.diagExport,
    'invoke',
    obj(
      { logs: bool, system: bool, settings: bool, slotId: SLOT_ID, flags: bool },
      { optional: ['slotId', 'flags'] },
    ),
  ),
  crashPending: def(HK_NAMES.crashPending, 'invoke', none),
  crashSend: def(
    HK_NAMES.crashSend,
    'invoke',
    obj(
      { reportId: str({ min: 1, max: 64, pattern: /^[A-Za-z0-9_-]+$/ }), autoSend: bool },
      {
        optional: ['autoSend'],
      },
    ),
  ),

  windowMode: def(
    HK_NAMES.windowMode,
    'invoke',
    obj({ mode: oneOf(['fullscreen', 'windowed'] as const) }),
  ),
  windowFrameCap: def(
    HK_NAMES.windowFrameCap,
    'invoke',
    obj({ cap: oneOf([30, 60, 'display'] as const) }),
  ),

  shellOpenExternal: def(
    HK_NAMES.shellOpenExternal,
    'invoke',
    obj({ url: str({ min: 9, max: 2048 }) }),
  ),
  log: def(
    HK_NAMES.log,
    'send',
    obj({ level: oneOf(['error', 'warn', 'info'] as const), message: str({ max: 8000 }) }),
    { maxBytes: 32 * KiB, rate: per('log', 50, 1000) },
  ),
  event: def(HK_NAMES.event, 'push', none),
} as const;

export type HkChannels = typeof HK;
export type HkKey = keyof HkChannels;
export type PayloadOf<K extends HkKey> = CheckValue<HkChannels[K]['payload']>;

/** Every game channel name, in table order. */
export const HK_CHANNEL_NAMES: readonly string[] = Object.freeze(
  Object.values(HK).map((d) => d.name),
);

const BY_NAME: ReadonlyMap<string, ChannelDef> = new Map(
  Object.values(HK).map((d) => [d.name, d as ChannelDef]),
);

export function channelByName(name: string): ChannelDef | undefined {
  return BY_NAME.get(name);
}

/** Channels of the key entry window (llm_providers.md 5.5: submit, paste, cancel only). */
export const KEY_ENTRY = {
  submit: def(KEY_ENTRY_NAMES.submit, 'invoke', obj({ secret: str({ max: 4096 }) }), {
    maxBytes: 16 * KiB,
  }),
  paste: def(KEY_ENTRY_NAMES.paste, 'invoke', none),
  cancel: def(KEY_ENTRY_NAMES.cancel, 'send', none),
} as const;

export const KEY_ENTRY_CHANNEL_NAMES: readonly string[] = Object.freeze(
  Object.values(KEY_ENTRY).map((d) => d.name),
);

/** Why the shell refused a call; every invoke answers with HkResult. */
export type HkReason =
  | 'forbidden'
  | 'bad_request'
  | 'too_large'
  | 'rate_limited'
  | 'not_implemented'
  | 'unavailable'
  | 'failed'
  | 'busy';

export type HkResult<T> = { ok: true; value: T } | { ok: false; reason: HkReason };
