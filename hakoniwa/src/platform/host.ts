// PlatformHost: the renderer-side face of the platform (docs/50_tech/release_engineering.md
// 2.2): saves, settings, models, achievements, diagnostics and the window. Three hosts
// implement it: desktop (window.hk, desktop_host.ts), web (IndexedDB and localStorage,
// web_host.ts) and memory (tests, memory_host.ts). Only src/client/ uses this directory;
// core, systems, game and ai never import it (tests/architecture.test.ts).
//
// The desktop types are taken from the preload bridge (desktop/bridge.ts) as type-only
// imports, so the browser bundle never pulls in desktop code.

import type { HkBridge, HkEvent, HkProblem } from '../../desktop/bridge';
import type { HkReason, HkResult, PayloadOf } from '../../desktop/ipc/channels';
import type { FrameCap } from '../../desktop/ipc/handlers';
import type { KeyStatus } from '../../desktop/llm_gateway/protocol';
import type { SettingsPart } from '../../desktop/paths';
import type { SaveBackend } from '../core/save/backend';

export type { FrameCap, HkEvent as PlatformEvent, HkProblem, KeyStatus, SettingsPart };

export type PlatformKind = 'desktop' | 'web' | 'memory';

/** Every call that can be refused answers like the hk:* channels (2.3). */
export type PlatformResult<T> = HkResult<T>;
export type PlatformReason = HkReason;

/** What is running: the desktop build stamp, or the web build's equivalent. */
export interface PlatformInfo {
  kind: PlatformKind;
  version: string;
  build: string;
  /** A desktop build channel (3.1), or `web` and `memory` for the other hosts. */
  channel: string;
  contentVersion: string;
  /** `win32`, `darwin`, `linux`, or `web` and `memory`. */
  platform: string;
}

/** Settings values of one part; the settings store (PK-M0-20) owns their schema. */
export type SettingsValues = Record<string, unknown>;

/**
 * The two settings parts (13.10): `sync` follows the cloud, `local` stays on this machine.
 * get answers null when nothing is stored yet; set answers the values as stored.
 */
export interface SettingsBackend {
  get(part: SettingsPart): Promise<PlatformResult<SettingsValues | null>>;
  set(part: SettingsPart, values: SettingsValues): Promise<PlatformResult<SettingsValues>>;
}

/** The model surface of the desktop bridge (llm_providers.md 7.2), as window.hk.llm has it. */
export type LlmGatewayApi = HkBridge['llm'];

/**
 * How this platform reaches language models. The desktop goes through the main process to
 * the gateway (2.4) and the page never holds a key; the web demo has no gateway and may
 * only call a local model service on this machine (2.4, llm_providers.md 6.2). The
 * transports in src/ai/ (PK-M0-24) are built on top of this.
 */
export type PlatformLlm =
  | { readonly route: 'gateway'; readonly gateway: LlmGatewayApi }
  | {
      readonly route: 'loopback';
      /** True for an http(s) address on this machine (127.0.0.1, localhost, ::1). */
      endpointAllowed(url: string): boolean;
    };

/**
 * Store achievements, stats and rich presence (4.2). Where no store backs the build
 * (web, tests) `available` is false and every call answers `unavailable`.
 */
export interface AchievementSink {
  readonly available: boolean;
  unlock(api: string): Promise<PlatformResult<unknown>>;
  setStat(name: string, value: number): Promise<PlatformResult<unknown>>;
  setPresence(key: string, value: string): Promise<PlatformResult<unknown>>;
  status(): Promise<PlatformResult<unknown>>;
}

export type DiagExportOptions = PayloadOf<'diagExport'>;
export type LogLevel = 'error' | 'warn' | 'info';

/** Logs, the diagnostics bundle and crash reports (12). */
export interface PlatformDiagnostics {
  /** Developer text (English); the desktop shell scrubs secrets before writing it. */
  log(level: LogLevel, message: string): void;
  exportBundle(options: DiagExportOptions): Promise<PlatformResult<unknown>>;
  pendingCrash(): Promise<PlatformResult<unknown>>;
  sendCrash(reportId: string, autoSend?: boolean): Promise<PlatformResult<unknown>>;
}

export type DisplayMode = 'fullscreen' | 'windowed';

/** Display mode, frame cap, external links and window events (2.7). */
export interface PlatformWindow {
  setMode(mode: DisplayMode): Promise<PlatformResult<unknown>>;
  setFrameCap(cap: FrameCap): Promise<PlatformResult<FrameCap>>;
  /** https only; the desktop shell further limits it to the hosts the settings pages list. */
  openExternal(url: string): Promise<PlatformResult<unknown>>;
  /** Focus, blur, minimize, restore, suspend, resume and fullscreen changes. */
  onEvent(listener: (event: HkEvent) => void): () => void;
}

export interface PlatformHost {
  readonly kind: PlatformKind;
  info(): Promise<PlatformInfo>;
  /** The only way the game reads and writes saves (5.2). */
  readonly saves: SaveBackend;
  readonly settings: SettingsBackend;
  readonly llm: PlatformLlm;
  readonly achievements: AchievementSink;
  readonly diagnostics: PlatformDiagnostics;
  readonly window: PlatformWindow;
}

export const SETTINGS_PART_NAMES: readonly SettingsPart[] = ['sync', 'local'];

export function refused<T = never>(reason: PlatformReason): PlatformResult<T> {
  return { ok: false, reason };
}

export function accepted<T>(value: T): PlatformResult<T> {
  return { ok: true, value };
}

/** A plain JSON object (not null, not an array): the shape of a settings part. */
export function isSettingsValues(value: unknown): value is SettingsValues {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An http(s) URL whose host is this machine, with no user name or password in it. */
export function isLoopbackEndpoint(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname;
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]';
}

/** True for an https URL without credentials: the floor every host applies to external links. */
export function isHttpsLink(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
}
