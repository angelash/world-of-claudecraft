// The player's model settings (docs/50_tech/llm_providers.md 4.1, 4.7, 5.4, 5.7, 5.8,
// 11.3): connections without keys, three model slots, a binding per role, the tilt, caps,
// privacy switches and first-use consent. validateSettings is the one parser every host
// runs on stored or edited settings: unknown fields are dropped, bad values fall back to
// defaults, connection addresses follow src/ai/providers/address.ts (cloud needs HTTPS,
// plain HTTP only for loopback and private ranges, the web demo only loopback and only
// local services, no credentials in the address). Pure.

import type { CapValue } from '../budget';
import type { BindingRole, Effort, ProviderId, Slot } from '../contracts';
import { BINDING_ROLES, TIER_ORDER } from '../contracts';
import { type AddressIssue, checkBaseUrl, isPrivateHost } from '../providers/address';
import { capabilityFor, profileFor } from '../providers/capabilities';
import type {
  Capability,
  ConnectionPublic,
  LocalFlavor,
  ModelProfile,
  PriceCard,
} from '../providers/types';
import { TILTS, type Tilt } from './kinds';

export const SETTINGS_VERSION = 1;

export type PresetId = 'off' | 'single' | 'tiered' | 'local' | 'custom';
export const PRESET_IDS: readonly PresetId[] = ['off', 'single', 'tiered', 'local', 'custom'];

export type BindingMode = 'route' | 'fixed' | 'builtin';

export interface Binding {
  mode: BindingMode;
  /** Only with mode 'fixed'. */
  slot?: Slot;
}

export interface SlotBinding {
  connectionId: string;
  model: string;
  effort?: Effort;
}

export interface LlmCaps {
  /** Sliding 60 real minutes, in-flight reservations included. */
  hour: CapValue;
  /** Local calendar day, across all saves. */
  day: CapValue;
  /** The whole save line since a new game; loading never rolls it back. */
  run?: CapValue;
  displayCurrency: 'USD' | 'CNY';
  /** The player's exchange rate; the price book's reference rate when absent. */
  fxCnyPerUsd?: number;
  /** Advanced: share of the hourly cap per binding role (overrides the preset structure). */
  roleShares?: Partial<Record<BindingRole, number>>;
}

export interface LlmPrivacy {
  /** Keep full prompts in audit records (AQ-15); only internal builds may turn it on. */
  developerMode: boolean;
  savePrivacy: boolean;
  remoteRevelations: boolean;
  telemetry: boolean;
  showLineSource: boolean;
}

export interface LlmSettings {
  version: number;
  preset: PresetId;
  /** Only affects bindings in mode 'route'. */
  tilt: Tilt;
  connections: ConnectionPublic[];
  slots: Partial<Record<Slot, SlotBinding>>;
  bindings: Record<BindingRole, Binding>;
  advanced: { highestForAnchors: boolean; streamFirstLine: boolean };
  caps: LlmCaps;
  privacy: LlmPrivacy;
  /** Cloud connections whose first-use notice the player accepted (11.3). */
  consentedConnectionIds: string[];
}

/** Key state as the game sees it (7.2): never the key, at most its last four characters. */
export interface KeyStatus {
  state: 'none' | 'saved' | 'session_only';
  last4?: string;
  savedAt?: string;
  backend: 'os_keychain' | 'memory_only';
}

export function bindingsAll(mode: BindingMode): Record<BindingRole, Binding> {
  return Object.fromEntries(BINDING_ROLES.map((r) => [r, { mode }])) as Record<
    BindingRole,
    Binding
  >;
}

/** A fresh install: preset off (built-in AI), nothing configured (D-067, D-010). */
export function defaultSettings(): LlmSettings {
  return {
    version: SETTINGS_VERSION,
    preset: 'off',
    tilt: 'standard',
    connections: [],
    slots: {},
    bindings: bindingsAll('builtin'),
    advanced: { highestForAnchors: true, streamFirstLine: true },
    caps: { hour: {}, day: {}, displayCurrency: 'USD' },
    privacy: {
      developerMode: false,
      savePrivacy: false,
      remoteRevelations: true,
      telemetry: false,
      showLineSource: false,
    },
    consentedConnectionIds: [],
  };
}

export type SettingsIssueCode =
  | AddressIssue
  | 'bad_value'
  | 'bad_connection'
  | 'duplicate_connection'
  | 'cloud_in_web'
  | 'unknown_connection'
  | 'model_not_enabled'
  | 'cap_required'
  | 'developer_mode_locked';

export interface SettingsIssue {
  /** Dotted path of the offending field, for example 'connections.0.baseUrl'. */
  path: string;
  code: SettingsIssueCode;
}

/** Issues that make the settings unusable as they are (the settings page blocks saving). */
export const BLOCKING_ISSUES: ReadonlySet<SettingsIssueCode> = new Set<SettingsIssueCode>([
  'invalid',
  'scheme',
  'credentials',
  'https_required',
  'not_local',
  'web_loopback_only',
  'cloud_in_web',
  'duplicate_connection',
  'bad_connection',
  'unknown_connection',
  'model_not_enabled',
  'cap_required',
]);

export interface SettingsValidateOptions {
  /** The web demo: only local services on loopback (D-081). */
  web?: boolean;
  /** Internal and e2e channel builds may keep developer mode on (AQ-15). */
  internalBuild?: boolean;
}

export interface Validated {
  settings: LlmSettings;
  issues: SettingsIssue[];
  /** No blocking issue. */
  ok: boolean;
}

const CONN_ID = /^[A-Za-z0-9_-]{1,64}$/;
const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/;
const FLAVORS: readonly LocalFlavor[] = ['ollama', 'lmstudio', 'llamacpp', 'generic'];
const CLOUD_KINDS: ReadonlySet<ProviderId> = new Set(['anthropic', 'openai_compat']);

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function capValue(v: unknown, path: string, issues: SettingsIssue[]): CapValue {
  const out: CapValue = {};
  if (!isObj(v)) return out;
  for (const k of ['usd', 'tokens'] as const) {
    const x = v[k];
    if (x === undefined) continue;
    if (finite(x) && x >= 0) out[k] = x;
    else issues.push({ path: `${path}.${k}`, code: 'bad_value' });
  }
  return out;
}

function rates(
  v: unknown,
): Omit<PriceCard, 'currency' | 'longPromptThreshold' | 'longPrompt'> | undefined {
  if (!isObj(v) || ![v.input, v.cacheRead, v.output].every((x) => finite(x) && x >= 0)) {
    return undefined;
  }
  const out: Omit<PriceCard, 'currency' | 'longPromptThreshold' | 'longPrompt'> = {
    input: v.input as number,
    cacheRead: v.cacheRead as number,
    output: v.output as number,
  };
  if (finite(v.cacheWrite5m) && v.cacheWrite5m >= 0) out.cacheWrite5m = v.cacheWrite5m;
  if (finite(v.cacheWrite1h) && v.cacheWrite1h >= 0) out.cacheWrite1h = v.cacheWrite1h;
  return out;
}

function priceCard(v: unknown): PriceCard | undefined {
  if (!isObj(v) || (v.currency !== 'USD' && v.currency !== 'CNY')) return undefined;
  const base = rates(v);
  if (!base) return undefined;
  const card: PriceCard = { currency: v.currency, ...base };
  const long = rates(v.longPrompt);
  if (long && finite(v.longPromptThreshold) && v.longPromptThreshold > 0) {
    card.longPromptThreshold = v.longPromptThreshold;
    card.longPrompt = long;
  }
  return card;
}

function modelProfile(
  v: unknown,
  kind: ProviderId,
  flavor: LocalFlavor | undefined,
): ModelProfile | undefined {
  const raw = typeof v === 'string' ? { model: v } : v;
  if (!isObj(raw) || typeof raw.model !== 'string' || raw.model === '' || raw.model.length > 200) {
    return undefined;
  }
  const base = profileFor(kind, raw.model, flavor);
  const cap = raw.capability;
  const capability: Capability =
    isObj(cap) && Array.isArray(cap.channels) && cap.channels.length > 0
      ? ({ ...capabilityFor(kind, raw.model, flavor), ...cap } as Capability)
      : base.capability;
  const prof: ModelProfile = { ...base, capability };
  if (typeof raw.displayName === 'string') prof.displayName = raw.displayName.slice(0, 80);
  const price = priceCard(raw.price);
  if (price) prof.price = price;
  if (finite(raw.temperature) && raw.temperature >= 0 && raw.temperature <= 2) {
    prof.temperature = raw.temperature;
  }
  return prof;
}

function connection(
  v: unknown,
  path: string,
  opts: SettingsValidateOptions,
  issues: SettingsIssue[],
): ConnectionPublic | undefined {
  if (
    !isObj(v) ||
    typeof v.id !== 'string' ||
    !CONN_ID.test(v.id) ||
    (v.kind !== 'anthropic' && v.kind !== 'openai_compat' && v.kind !== 'local')
  ) {
    issues.push({ path, code: 'bad_connection' });
    return undefined;
  }
  const kind = v.kind as Exclude<ProviderId, 'none'>;
  if (opts.web && CLOUD_KINDS.has(kind)) {
    issues.push({ path: `${path}.kind`, code: 'cloud_in_web' });
    return undefined;
  }
  const flavor =
    kind === 'local'
      ? FLAVORS.includes(v.flavor as LocalFlavor)
        ? (v.flavor as LocalFlavor)
        : 'generic'
      : undefined;
  const addr = checkBaseUrl(typeof v.baseUrl === 'string' ? v.baseUrl : '', kind, {
    web: opts.web,
    flavor,
  });
  if (!addr.ok) {
    issues.push({ path: `${path}.baseUrl`, code: addr.issue ?? 'invalid' });
    return undefined;
  }
  const auth = isObj(v.auth) ? v.auth : {};
  const scheme =
    auth.scheme === 'x_api_key' ||
    auth.scheme === 'bearer' ||
    auth.scheme === 'custom_header' ||
    auth.scheme === 'none'
      ? auth.scheme
      : kind === 'anthropic'
        ? 'x_api_key'
        : kind === 'local'
          ? 'none'
          : 'bearer';
  const conn: ConnectionPublic = {
    id: v.id,
    kind,
    name: typeof v.name === 'string' && v.name.trim() !== '' ? v.name.slice(0, 80) : v.id,
    baseUrl: addr.url,
    auth:
      scheme === 'custom_header'
        ? {
            scheme,
            headerName:
              typeof auth.headerName === 'string' && HEADER_NAME.test(auth.headerName)
                ? auth.headerName
                : 'x-api-key',
          }
        : { scheme },
    keyState:
      v.keyState === 'saved' || v.keyState === 'session_only' ? v.keyState : ('none' as const),
    extraHeaderNames: Array.isArray(v.extraHeaderNames)
      ? v.extraHeaderNames.filter((h): h is string => typeof h === 'string' && HEADER_NAME.test(h))
      : [],
    currency: v.currency === 'CNY' ? 'CNY' : 'USD',
    maxInFlight:
      finite(v.maxInFlight) && v.maxInFlight >= 1
        ? Math.min(32, Math.floor(v.maxInFlight))
        : kind === 'local'
          ? 2
          : 8,
    models: [],
  };
  if (flavor) conn.flavor = flavor;
  if (typeof v.keyLast4 === 'string' && v.keyLast4.length <= 4) conn.keyLast4 = v.keyLast4;
  if (kind === 'anthropic' && typeof v.serverFallback === 'boolean') {
    conn.serverFallback = v.serverFallback;
  }
  if (isObj(v.lastTest)) conn.lastTest = v.lastTest as unknown as ConnectionPublic['lastTest'];
  const seen = new Set<string>();
  for (const m of Array.isArray(v.models) ? v.models : []) {
    const prof = modelProfile(m, kind, flavor);
    if (prof && !seen.has(prof.model)) {
      seen.add(prof.model);
      conn.models.push(prof);
    }
  }
  return conn;
}

/** Cloud: Anthropic, or a compatible service outside loopback and private ranges. */
export function isCloudConnection(conn: Pick<ConnectionPublic, 'kind' | 'baseUrl'>): boolean {
  if (conn.kind === 'anthropic') return true;
  if (conn.kind !== 'openai_compat') return false;
  try {
    return !isPrivateHost(new URL(conn.baseUrl).hostname);
  } catch {
    return true;
  }
}

/** The connection's enabled models: also the gateway guard's whitelist (7.4 item 4). */
export function enabledModels(conn: Pick<ConnectionPublic, 'models'>): string[] {
  return conn.models.map((m) => m.model);
}

export function connectionOf(s: LlmSettings, id: string): ConnectionPublic | undefined {
  return s.connections.find((c) => c.id === id);
}

export function profileOf(
  s: LlmSettings,
  connectionId: string,
  model: string,
): ModelProfile | undefined {
  return connectionOf(s, connectionId)?.models.find((m) => m.model === model);
}

/** Whether a call can carry credentials: no auth needed, or a key is saved for the run. */
export function keyAvailable(conn: Pick<ConnectionPublic, 'auth' | 'keyState'>): boolean {
  return conn.auth.scheme === 'none' || conn.keyState !== 'none';
}

/** Cloud connections some binding may route to that still wait for the first-use notice. */
export function consentPending(s: LlmSettings): string[] {
  const used = new Set(Object.values(s.slots).map((b) => b?.connectionId));
  return s.connections
    .filter(
      (c) => used.has(c.id) && isCloudConnection(c) && !s.consentedConnectionIds.includes(c.id),
    )
    .map((c) => c.id);
}

function routesToCloud(s: LlmSettings): boolean {
  if (s.preset === 'off') return false;
  if (BINDING_ROLES.every((r) => s.bindings[r].mode === 'builtin')) return false;
  return Object.values(s.slots).some((b) => {
    const c = b && connectionOf(s, b.connectionId);
    return c !== undefined && isCloudConnection(c);
  });
}

function capSet(v: CapValue): boolean {
  return v.usd !== undefined || v.tokens !== undefined;
}

/** Hour and day caps are both set: required before any cloud connection is called (8.3). */
export function capsReady(s: Pick<LlmSettings, 'caps'>): boolean {
  return capSet(s.caps.hour) && capSet(s.caps.day);
}

/**
 * Parse settings from storage or the settings page. Invalid connections, slots that name an
 * unknown connection or a model the connection does not enable, and malformed values are
 * dropped or reset; every such case is listed in `issues`.
 */
export function validateSettings(raw: unknown, opts: SettingsValidateOptions = {}): Validated {
  const issues: SettingsIssue[] = [];
  const s = defaultSettings();
  if (!isObj(raw)) return { settings: s, issues, ok: true };
  if (PRESET_IDS.includes(raw.preset as PresetId)) s.preset = raw.preset as PresetId;
  if (TILTS.includes(raw.tilt as Tilt)) s.tilt = raw.tilt as Tilt;

  const ids = new Set<string>();
  (Array.isArray(raw.connections) ? raw.connections : []).forEach((c, i) => {
    const conn = connection(c, `connections.${i}`, opts, issues);
    if (!conn) return;
    if (ids.has(conn.id)) {
      issues.push({ path: `connections.${i}.id`, code: 'duplicate_connection' });
      return;
    }
    ids.add(conn.id);
    s.connections.push(conn);
  });

  const slots = isObj(raw.slots) ? raw.slots : {};
  for (const slot of TIER_ORDER) {
    const b = slots[slot];
    if (b === undefined) continue;
    if (!isObj(b) || typeof b.connectionId !== 'string' || typeof b.model !== 'string') {
      issues.push({ path: `slots.${slot}`, code: 'bad_value' });
      continue;
    }
    const conn = connectionOf(s, b.connectionId);
    if (!conn) {
      issues.push({ path: `slots.${slot}.connectionId`, code: 'unknown_connection' });
      continue;
    }
    if (!enabledModels(conn).includes(b.model)) {
      issues.push({ path: `slots.${slot}.model`, code: 'model_not_enabled' });
      continue;
    }
    const out: SlotBinding = { connectionId: b.connectionId, model: b.model };
    if (b.effort === 'low' || b.effort === 'medium' || b.effort === 'high') out.effort = b.effort;
    s.slots[slot] = out;
  }

  const bindings = isObj(raw.bindings) ? raw.bindings : {};
  for (const role of BINDING_ROLES) {
    const b = bindings[role];
    if (b === undefined) continue;
    if (!isObj(b) || (b.mode !== 'route' && b.mode !== 'fixed' && b.mode !== 'builtin')) {
      issues.push({ path: `bindings.${role}`, code: 'bad_value' });
      continue;
    }
    if (b.mode === 'fixed') {
      if (!TIER_ORDER.includes(b.slot as Slot)) {
        issues.push({ path: `bindings.${role}.slot`, code: 'bad_value' });
        continue;
      }
      s.bindings[role] = { mode: 'fixed', slot: b.slot as Slot };
    } else s.bindings[role] = { mode: b.mode };
  }

  if (isObj(raw.advanced)) {
    if (typeof raw.advanced.highestForAnchors === 'boolean') {
      s.advanced.highestForAnchors = raw.advanced.highestForAnchors;
    }
    if (typeof raw.advanced.streamFirstLine === 'boolean') {
      s.advanced.streamFirstLine = raw.advanced.streamFirstLine;
    }
  }

  const caps = isObj(raw.caps) ? raw.caps : {};
  s.caps.hour = capValue(caps.hour, 'caps.hour', issues);
  s.caps.day = capValue(caps.day, 'caps.day', issues);
  if (caps.run !== undefined) s.caps.run = capValue(caps.run, 'caps.run', issues);
  if (caps.displayCurrency === 'CNY') s.caps.displayCurrency = 'CNY';
  if (caps.fxCnyPerUsd !== undefined) {
    if (finite(caps.fxCnyPerUsd) && caps.fxCnyPerUsd > 0) s.caps.fxCnyPerUsd = caps.fxCnyPerUsd;
    else issues.push({ path: 'caps.fxCnyPerUsd', code: 'bad_value' });
  }
  if (isObj(caps.roleShares)) {
    const shares: Partial<Record<BindingRole, number>> = {};
    for (const role of BINDING_ROLES) {
      const x = caps.roleShares[role];
      if (x === undefined) continue;
      if (finite(x) && x >= 0 && x <= 1) shares[role] = x;
      else issues.push({ path: `caps.roleShares.${role}`, code: 'bad_value' });
    }
    s.caps.roleShares = shares;
  }

  if (isObj(raw.privacy)) {
    for (const k of [
      'developerMode',
      'savePrivacy',
      'remoteRevelations',
      'telemetry',
      'showLineSource',
    ] as const) {
      if (typeof raw.privacy[k] === 'boolean') s.privacy[k] = raw.privacy[k];
    }
  }
  if (s.privacy.developerMode && !opts.internalBuild) {
    s.privacy.developerMode = false;
    issues.push({ path: 'privacy.developerMode', code: 'developer_mode_locked' });
  }

  s.consentedConnectionIds = Array.isArray(raw.consentedConnectionIds)
    ? [...new Set(raw.consentedConnectionIds)].filter(
        (id): id is string => typeof id === 'string' && ids.has(id),
      )
    : [];

  if (routesToCloud(s)) {
    if (!capSet(s.caps.hour)) issues.push({ path: 'caps.hour', code: 'cap_required' });
    if (!capSet(s.caps.day)) issues.push({ path: 'caps.day', code: 'cap_required' });
  }
  return { settings: s, issues, ok: !issues.some((i) => BLOCKING_ISSUES.has(i.code)) };
}
