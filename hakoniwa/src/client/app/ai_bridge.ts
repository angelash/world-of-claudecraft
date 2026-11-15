// Connects the AI layer to running worlds (docs/50_tech/llm_providers.md 4.7, 13, 14;
// release_engineering.md 2.8, 13.9): keeps the player's LlmSettings as the `llm` partition
// of the machine-local settings part (migrated from the legacy on/off switch), picks the
// transport of the platform (the desktop gateway through IpcTransport, the dev server's
// DevProxyTransport in development builds only, the web demo's LocalHttpTransport to
// loopback services), and runs one AiRunner attached to the current engine (rebound after
// loading) that routes every request. Settings changes apply from the next request without
// reopening the world. Worlds run with aiMode 'external' only when some role routes to a
// model; otherwise 'off', and every request falls back to its rule exactly as before (D-010).
// The platform pieces (PlatformHost.settings and PlatformHost.llm) are injected
// structurally; without them the bridge reads the local part from the key-value store under
// the same key the web host uses, and finds the shell's model channel on window.hk.

import type { CapWindow, Cost } from '../../ai/budget';
import type { BindingRole, Clock, LlmTransport } from '../../ai/contracts';
import { BINDING_ROLES } from '../../ai/contracts';
import { ROLE_PROBE_KIND } from '../../ai/llm_config/kinds';
import {
  LEGACY_AI_SWITCH_KEY,
  LLM_SETTINGS_PART,
  type MigrateContext,
  readLlmPartition,
  writeLlmPartition,
} from '../../ai/llm_config/migrate';
import { type DevProxyFacts, detectPreset, devProxySettings } from '../../ai/llm_config/presets';
import { resolveRoute } from '../../ai/llm_config/routing';
import {
  defaultSettings,
  type LlmSettings,
  type SettingsIssue,
  validateSettings,
} from '../../ai/llm_config/settings';
import type { MergedProblem } from '../../ai/providers/problems';
import { TransportProvider } from '../../ai/providers/transport_provider';
import type { Capability } from '../../ai/providers/types';
import { AiRunner, type DriverView } from '../../ai/runner';
import { type IpcLlmChannel, IpcTransport } from '../../ai/transports/ipc';
import { LocalHttpTransport } from '../../ai/transports/local_http';
import type { AiMode } from '../../core/ai_port';
import type { Engine } from '../../core/engine';
import { createRoleRegistry } from '../../game/ai_roles';
import type { KeyValueStore } from '../hud/save_slots';
import type { AiStatusView, ClientSettings } from '../windows/window_context';

const PROBE_TIMEOUT_MS = 2500;
/** Browser storage key of the local settings part (the web host's key for it). */
const LOCAL_PART_KEY = `hakoniwa.settings.${LLM_SETTINGS_PART}`;

export type AiPlatform = 'desktop' | 'dev' | 'web';

type PartResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** The local settings part of PlatformHost.settings, structurally. */
export interface LocalSettingsStore {
  get(part: 'local'): Promise<PartResult<Record<string, unknown> | null>>;
  set(part: 'local', values: Record<string, unknown>): Promise<PartResult<Record<string, unknown>>>;
}

/** PlatformHost.llm, structurally: the desktop gateway, or loopback services only. */
export type PlatformLlmLike =
  | { route: 'gateway'; gateway: IpcLlmChannel }
  | { route: 'loopback'; endpointAllowed(url: string): boolean };

export interface AiBridgeOptions {
  /** PlatformHost.llm; detected from window.hk when absent. */
  llm?: PlatformLlmLike;
  /** PlatformHost.settings; the key-value store's local part when absent. */
  settingsStore?: LocalSettingsStore;
  /** Force the platform (tests); detected from the host and the build otherwise. */
  platform?: AiPlatform;
  clock?: Clock;
  /** Local calendar date for the budget's day window. */
  dayKey?: () => string;
  /** Save line id for the run window; one line for everything until the save layer has one. */
  runId?: () => string;
  /** Window totals the host already booked (the gateway's hk:llm.ledger), seeded once. */
  ledger?: () => Promise<Partial<Record<CapWindow, Cost>> | null>;
}

/** The shell's preload bridge, when this page runs inside the desktop shell. */
function shellLlm(): PlatformLlmLike | undefined {
  const hk = (globalThis as { hk?: { llm?: IpcLlmChannel } }).hk;
  return hk?.llm && typeof hk.llm.request === 'function'
    ? { route: 'gateway', gateway: hk.llm }
    : undefined;
}

function localDayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The local settings part kept in a key-value store, as JSON under the web host's key. */
function kvLocalPart(store: KeyValueStore): LocalSettingsStore {
  return {
    async get() {
      const text = store.getItem(LOCAL_PART_KEY);
      if (text === null) return { ok: true, value: null };
      try {
        const v = JSON.parse(text) as unknown;
        return {
          ok: true,
          value:
            typeof v === 'object' && v !== null && !Array.isArray(v)
              ? (v as Record<string, unknown>)
              : null,
        };
      } catch {
        return { ok: true, value: null };
      }
    },
    async set(_part, values) {
      store.setItem(LOCAL_PART_KEY, JSON.stringify(values));
      return { ok: true, value: values };
    },
  };
}

/**
 * The 0 to 9 ladder on the settings window's five-step display (normal, throttled, saving,
 * key requests only, rules): 1 to 3, 4 to 6, 7 and 8, then 9.
 */
export function displayLevel(level: number): number {
  if (level <= 0) return 0;
  if (level <= 3) return 1;
  if (level <= 6) return 2;
  if (level <= 8) return 3;
  return 4;
}

export class AiBridge implements ClientSettings {
  private runner: AiRunner | null = null;
  private engine: Engine | null = null;
  private available = false;
  private probed: Promise<boolean> | null = null;
  private current: LlmSettings = defaultSettings();
  private readOnly = false;
  /** Whether the local part held model settings when it was read. */
  private stored = false;
  private provider: TransportProvider | null = null;
  private devFacts: DevProxyFacts | null = null;
  private writes: Promise<unknown> = Promise.resolve();
  private readonly llm: PlatformLlmLike | undefined;
  private readonly settingsStore: LocalSettingsStore;
  private readonly clock: Clock;
  readonly platform: AiPlatform;

  constructor(
    private readonly store: KeyValueStore,
    private readonly opts: AiBridgeOptions = {},
  ) {
    this.llm = opts.llm ?? shellLlm();
    this.platform =
      opts.platform ??
      (this.llm?.route === 'gateway' ? 'desktop' : import.meta.env.DEV ? 'dev' : 'web');
    this.settingsStore = opts.settingsStore ?? kvLocalPart(store);
    this.clock = opts.clock ?? { now: () => performance.now() };
  }

  private context(): MigrateContext {
    return {
      legacySwitch: this.store.getItem(LEGACY_AI_SWITCH_KEY),
      devProxy: this.devFacts,
      web: this.platform === 'web',
    };
  }

  /** Read the llm partition of the local part (migrating the legacy switch). */
  private async load(): Promise<void> {
    const got = await this.settingsStore.get('local').catch(() => null);
    const part = got?.ok ? got.value : null;
    this.stored = typeof part?.llm === 'object' && part.llm !== null;
    const r = readLlmPartition(part, this.context());
    this.readOnly = r.readOnly;
    this.current = r.settings;
  }

  /** Write the llm partition back into a freshly read local part (other fields untouched). */
  private persist(settings: LlmSettings): Promise<unknown> {
    this.writes = this.writes
      .then(async () => {
        const got = await this.settingsStore.get('local');
        // Never write over a part that could not be read: its other fields would be lost.
        if (!got.ok) return;
        const done = await this.settingsStore.set('local', writeLlmPartition(got.value, settings));
        if (done.ok) this.stored = true;
      })
      .catch(() => undefined);
    return this.writes;
  }

  /** Resolves once every settings write issued so far has landed. */
  flush(): Promise<unknown> {
    return this.writes;
  }

  private transportFor(platform: AiPlatform): LlmTransport | null {
    if (platform === 'desktop' && this.llm?.route === 'gateway') {
      return new IpcTransport(this.llm.gateway);
    }
    if (platform === 'web') {
      const allowed = this.llm?.route === 'loopback' ? this.llm.endpointAllowed : undefined;
      return new LocalHttpTransport({
        connections: () => this.current.connections,
        clock: this.clock,
        ...(allowed ? { endpointAllowed: (url: string) => allowed(url) } : {}),
      });
    }
    return null;
  }

  /** Load the settings and ask the platform once (bounded); later calls reuse the answer. */
  probe(): Promise<boolean> {
    if (!this.probed) this.probed = this.connect();
    return this.probed;
  }

  private async connect(): Promise<boolean> {
    await this.load();
    let transport = this.transportFor(this.platform);
    if (import.meta.env.DEV && this.platform === 'dev') {
      // Development only: production builds drop this branch and the module with it.
      const { DevProxyTransport } = await import('../../ai/transports/dev_proxy');
      const dev = new DevProxyTransport({ clock: this.clock });
      const timeout = new Promise<null>((r) => setTimeout(() => r(null), PROBE_TIMEOUT_MS));
      const facts = await Promise.race([dev.status().catch(() => null), timeout]);
      this.devFacts = facts;
      transport = dev;
      if (!this.stored) await this.load();
      else if (facts) this.current = this.refreshDevProxy(this.current, facts);
      this.available =
        facts !== null &&
        (facts.available || (facts.connections ?? []).some((c) => c.id !== 'dev_proxy'));
    } else {
      this.available = this.platform === 'desktop' || this.current.connections.length > 0;
    }
    this.provider = transport ? new TransportProvider(transport, { id: this.platform }) : null;
    if (!transport) this.available = false;
    return this.available;
  }

  /** Stored settings that use the dev proxy get its current models and key state. */
  private refreshDevProxy(s: LlmSettings, facts: DevProxyFacts): LlmSettings {
    if (!s.connections.some((c) => c.id === 'dev_proxy')) return s;
    const fresh = devProxySettings(s, facts).connections.find((c) => c.id === 'dev_proxy');
    if (!fresh) return s;
    return { ...s, connections: s.connections.map((c) => (c.id === 'dev_proxy' ? fresh : c)) };
  }

  get enabled(): boolean {
    return this.current.preset !== 'off';
  }

  /** Whether any binding role routes to a model right now. */
  private routesToModel(): boolean {
    return BINDING_ROLES.some(
      (r) => resolveRoute(ROLE_PROBE_KIND[r], { degradeLevel: 0 }, this.current).driver === 'model',
    );
  }

  /** aiMode for the next world: external only when a model can answer some role. */
  mode(): AiMode {
    return this.available && this.routesToModel() ? 'external' : 'off';
  }

  /** Drive this engine's AI requests (or stop when its world runs without a model). */
  attach(engine: Engine): void {
    this.engine = engine;
    if (engine.world.ai.mode !== 'external') {
      this.runner?.rebind(engine);
      return;
    }
    if (!this.runner) {
      this.runner = new AiRunner({
        engine,
        roles: createRoleRegistry(),
        clock: this.clock,
        settings: () => this.current,
        providers: () => this.provider ?? undefined,
        budgetScope: {
          dayKey: this.opts.dayKey ?? localDayKey,
          runId: this.opts.runId ?? (() => 'default'),
        },
        onCapability: (connectionId, model, capability) =>
          this.patchCapability(connectionId, model, capability),
      });
      this.runner.attach();
      const runner = this.runner;
      void this.opts
        .ledger?.()
        .then((snap) => {
          if (snap) runner.budget.seed(snap);
        })
        .catch(() => undefined);
    } else this.runner.rebind(engine);
  }

  ai(): AiStatusView {
    const st = this.runner?.status();
    return {
      enabled: this.enabled,
      available: this.available,
      active: this.engine?.world.ai.mode === 'external',
      level: displayLevel(st?.level ?? 0),
      budgetUsed: st?.budget.hourUsd,
      budgetCap: st?.budget.perHourUsd,
    };
  }

  /**
   * The legacy switch: off keeps slots and bindings and only turns the preset off; on brings
   * back the preset they still match (or, with nothing configured, the dev proxy migration).
   */
  setAiEnabled(on: boolean): void {
    if (on === this.enabled) return;
    if (!on) {
      this.setSettings({ ...this.current, preset: 'off' });
      return;
    }
    const preset = detectPreset(this.current);
    if (preset !== 'off') {
      this.setSettings({ ...this.current, preset });
      return;
    }
    const fresh = readLlmPartition(null, { ...this.context(), legacySwitch: 'on' }).settings;
    if (fresh.preset !== 'off') this.setSettings(fresh);
  }

  /** The settings in effect (after validation and migration). */
  settings(): LlmSettings {
    return this.current;
  }

  /**
   * Apply new settings from the next request on and write them to the local part. Refused
   * (nothing changes) when they have blocking issues or the stored settings came from a
   * newer version.
   */
  setSettings(next: unknown): { ok: boolean; issues: SettingsIssue[] } {
    const v = validateSettings(next, { web: this.platform === 'web' });
    if (!v.ok || this.readOnly) return { ok: false, issues: v.issues };
    this.current = v.settings;
    void this.persist(v.settings);
    if (this.platform !== 'dev') {
      this.available = this.platform === 'desktop' || this.current.connections.length > 0;
    }
    return { ok: true, issues: v.issues };
  }

  /** Who drives each binding role now (screen A). */
  drivers(): Record<BindingRole, DriverView> | undefined {
    return this.runner?.drivers();
  }

  problems(): MergedProblem[] {
    return this.runner?.problems() ?? [];
  }

  /** The player pressed retry on a connection problem. */
  resetConnection(connectionId: string): void {
    this.runner?.resetConnection(connectionId);
  }

  private patchCapability(connectionId: string, model: string, capability: Capability): void {
    const next: LlmSettings = {
      ...this.current,
      connections: this.current.connections.map((c) =>
        c.id !== connectionId
          ? c
          : { ...c, models: c.models.map((m) => (m.model === model ? { ...m, capability } : m)) },
      ),
    };
    this.setSettings(next);
  }
}
