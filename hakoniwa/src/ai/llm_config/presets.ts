// The four presets (docs/50_tech/llm_providers.md 4.4, 4.5) and the budget share structure
// each one implies (8.4). A preset writes slots, bindings and the tilt in one go and keeps
// everything else (connections, caps, privacy, consent); any later edit shows as 'custom'
// (detectPreset). The recommended Anthropic models and the shares live in
// data/llm/presets.json, so a content release can update them. Pure.

import presets from '../../../data/llm/presets.json';
import type { BindingRole, Slot } from '../contracts';
import { BINDING_ROLES, TIER_ORDER } from '../contracts';
import { priceCardOf } from '../pricing';
import type { ConnectionPublic } from '../providers/types';
import type { Tilt } from './kinds';
import {
  type Binding,
  bindingsAll,
  connectionOf,
  type LlmSettings,
  type PresetId,
  type SlotBinding,
} from './settings';

interface PresetFile {
  anthropic: {
    single: { recommended: string; quality: string };
    tiered: Record<Tilt, Partial<Record<Slot, string>>>;
  };
  shares: Record<string, { roles: BindingRole[]; share: number }[]>;
}

const DATA = presets as unknown as PresetFile;

export type SlotModels = Partial<Record<Slot, string>>;

/** Recommended Anthropic models per tilt of the tiered preset (frugal has no top slot). */
export const ANTHROPIC_TIERED: Readonly<Record<Tilt, SlotModels>> = DATA.anthropic.tiered;

/** Recommended Anthropic model of the single preset, and its quality-first alternative. */
export const ANTHROPIC_SINGLE: Readonly<{ recommended: string; quality: string }> =
  DATA.anthropic.single;

export type PresetChoice =
  | { preset: 'off' }
  | {
      preset: 'single';
      connectionId: string;
      /** Required for compatible and local services; Anthropic defaults to the recommendation. */
      model?: string;
      quality?: boolean;
    }
  | {
      preset: 'tiered';
      connectionId: string;
      tilt?: Tilt;
      /** Required for compatible services; Anthropic defaults to the recommended table. */
      models?: SlotModels;
    }
  | {
      preset: 'local';
      connectionId: string;
      /** The 14B-class (or larger) model for the top and mid slots, the 7B-class one for low. */
      models: { high: string; low: string };
    };

const LOCAL_BINDINGS: Readonly<Record<BindingRole, Binding>> = {
  goddess: { mode: 'builtin' },
  core_npc: { mode: 'route' },
  present_npc: { mode: 'fixed', slot: 'low' },
  offstage_batch: { mode: 'fixed', slot: 'low' },
  ruler_general: { mode: 'route' },
  court_reviewer: { mode: 'builtin' },
};

function slotsOf(connectionId: string, models: SlotModels): Partial<Record<Slot, SlotBinding>> {
  const out: Partial<Record<Slot, SlotBinding>> = {};
  for (const slot of TIER_ORDER) {
    const model = models[slot];
    if (model) out[slot] = { connectionId, model };
  }
  return out;
}

/** The slot models a preset puts on a connection (before checking what it enables). */
export function presetSlotModels(choice: PresetChoice, conn?: ConnectionPublic): SlotModels {
  switch (choice.preset) {
    case 'off':
      return {};
    case 'single': {
      const model =
        choice.model ??
        (conn?.kind === 'anthropic'
          ? choice.quality
            ? ANTHROPIC_SINGLE.quality
            : ANTHROPIC_SINGLE.recommended
          : undefined);
      return model ? { top: model, mid: model, low: model } : {};
    }
    case 'tiered': {
      const tilt = choice.tilt ?? 'standard';
      const models = {
        ...(choice.models ?? (conn?.kind === 'anthropic' ? ANTHROPIC_TIERED[tilt] : {})),
      };
      // Frugal never fills the top slot: its "highest" is the mid slot (17, AQ-18).
      if (tilt === 'frugal') delete models.top;
      return models;
    }
    case 'local':
      return { top: choice.models.high, mid: choice.models.high, low: choice.models.low };
  }
}

/** Apply a preset: slots, bindings and tilt; connections, caps and privacy are kept. */
export function applyPreset(base: LlmSettings, choice: PresetChoice): LlmSettings {
  const next: LlmSettings = {
    ...base,
    preset: choice.preset,
    tilt: 'standard',
    slots: {},
    bindings: bindingsAll('builtin'),
  };
  if (choice.preset === 'off') return next;
  const conn = connectionOf(base, choice.connectionId);
  const models = presetSlotModels(choice, conn);
  next.slots = slotsOf(choice.connectionId, models);
  if (choice.preset === 'tiered') next.tilt = choice.tilt ?? 'standard';
  next.bindings =
    choice.preset === 'local'
      ? { ...LOCAL_BINDINGS }
      : (bindingsAll('route') as typeof next.bindings);
  return next;
}

function sameSlots(a: LlmSettings['slots'], b: LlmSettings['slots']): boolean {
  return TIER_ORDER.every(
    (s) =>
      a[s]?.connectionId === b[s]?.connectionId &&
      a[s]?.model === b[s]?.model &&
      a[s]?.effort === b[s]?.effort,
  );
}

function sameBindings(
  a: Record<BindingRole, Binding>,
  b: Readonly<Record<BindingRole, Binding>>,
): boolean {
  return BINDING_ROLES.every((r) => a[r].mode === b[r].mode && a[r].slot === b[r].slot);
}

/**
 * The preset these settings still match, or 'custom' (4.1: any edit after choosing a preset
 * shows as custom). Compatible and local services match on the binding layout and slot shape
 * because their models are the player's choice.
 */
export function detectPreset(s: LlmSettings): PresetId {
  const filled = TIER_ORDER.filter((t) => s.slots[t]);
  const allRoute = sameBindings(s.bindings, bindingsAll('route'));
  if (filled.length === 0 && sameBindings(s.bindings, bindingsAll('builtin'))) return 'off';
  const conns = new Set(filled.map((t) => s.slots[t]?.connectionId));
  if (conns.size !== 1) return 'custom';
  const connectionId = [...conns][0] as string;
  const conn = connectionOf(s, connectionId);
  if (!conn) return 'custom';
  if (filled.some((t) => s.slots[t]?.effort !== undefined)) return 'custom';
  const models = filled.map((t) => s.slots[t]?.model);
  if (allRoute && filled.length === 3 && new Set(models).size === 1 && s.tilt === 'standard') {
    return 'single';
  }
  if (allRoute && filled.length >= 2) {
    const want = slotsOf(
      connectionId,
      presetSlotModels({ preset: 'tiered', connectionId, tilt: s.tilt }, conn),
    );
    if (conn.kind === 'anthropic' ? sameSlots(s.slots, want) : conn.kind === 'openai_compat') {
      return 'tiered';
    }
  }
  if (
    conn.kind === 'local' &&
    filled.length === 3 &&
    s.slots.top?.model === s.slots.mid?.model &&
    s.tilt === 'standard' &&
    sameBindings(s.bindings, LOCAL_BINDINGS)
  ) {
    return 'local';
  }
  return 'custom';
}

export interface SharePool {
  /** Binding roles joined by '+', for example 'present_npc+offstage_batch'. */
  id: string;
  roles: BindingRole[];
  share: number;
}

function pools(key: string): SharePool[] {
  return (DATA.shares[key] ?? []).map((p) => ({
    id: p.roles.join('+'),
    roles: [...p.roles],
    share: p.share,
  }));
}

/**
 * The hourly-cap shares (8.4): the player's per-role override when set, else the structure
 * of the preset the settings match (single, tiered by tilt), the token-only structure when
 * no money cap applies or no slot is priced, and the standard tiered structure for custom
 * settings.
 */
export function sharesFor(s: LlmSettings): SharePool[] {
  const override = s.caps.roleShares;
  if (override && Object.keys(override).length > 0) {
    return BINDING_ROLES.filter((r) => override[r] !== undefined).map((r) => ({
      id: r,
      roles: [r],
      share: override[r] as number,
    }));
  }
  const money = s.caps.hour.usd !== undefined;
  const priced = TIER_ORDER.some((t) => {
    const b = s.slots[t];
    const c = b && connectionOf(s, b.connectionId);
    if (!b || !c || c.kind === 'local') return false;
    return (
      (c.models.find((m) => m.model === b.model)?.price ?? priceCardOf(c.kind, b.model)) !==
      undefined
    );
  });
  if (!money || !priced) return pools('tokens_only');
  const preset = detectPreset(s);
  if (preset === 'single') return pools('single');
  return pools(`tiered.${s.tilt}`);
}

/** The pool a binding role draws on, if any. */
export function poolOf(list: readonly SharePool[], role: BindingRole): SharePool | undefined {
  return list.find((p) => p.roles.includes(role));
}

/** What the dev server's GET /api/llm/status says about its connections (12). */
export interface DevProxyFacts {
  available: boolean;
  tiers?: SlotModels;
  connections?: ConnectionPublic[];
}

export const DEV_PROXY_CONNECTION_ID = 'dev_proxy';

/**
 * The 'custom: dev proxy' settings (4.7, 12): every served connection, the slots from the
 * proxy's HAKONIWA_MODEL_* mapping, all roles routed with the standard tilt, the legacy
 * default of one dollar per hour (three per day), and the developer's own consent. The
 * proxy holds the credentials, so its pseudo connection counts as keyed while it answers.
 */
export function devProxySettings(base: LlmSettings, facts: DevProxyFacts): LlmSettings {
  const conns = (facts.connections ?? []).map((c) =>
    c.id === DEV_PROXY_CONNECTION_ID && facts.available ? { ...c, keyState: 'saved' as const } : c,
  );
  const dev = conns.find((c) => c.id === DEV_PROXY_CONNECTION_ID);
  const slots: Partial<Record<Slot, SlotBinding>> = {};
  for (const slot of TIER_ORDER) {
    const model = facts.tiers?.[slot];
    if (dev && model && dev.models.some((m) => m.model === model)) {
      slots[slot] = { connectionId: DEV_PROXY_CONNECTION_ID, model };
    }
  }
  return {
    ...base,
    preset: 'custom',
    tilt: 'standard',
    connections: conns,
    slots,
    bindings: bindingsAll('route'),
    caps: { ...base.caps, hour: { usd: 1 }, day: { usd: 3 } },
    consentedConnectionIds: dev ? [DEV_PROXY_CONNECTION_ID] : [],
  };
}
