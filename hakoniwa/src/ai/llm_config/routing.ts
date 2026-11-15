// Route resolution (docs/50_tech/llm_providers.md 4.3; ai_architecture.md 9.4, 9.5): from a
// decision kind to its binding role, the slot the binding and tilt ask for (the highest
// configured slot for the anchors), the nearest usable slot (this one, then lower, then
// higher), one slot lower from ladder level 2 for non-reserved requests, and the reroute
// chain past a connection whose circuit is open (other usable slots on another connection,
// lower first). A usable slot names a known connection, a model the connection enables, a
// key when the connection needs one, the first-use consent for a cloud connection, and is
// not disabled by the health record. Pure: settings, a health snapshot and the level in,
// a decision out; the decision goes into the audit record.

import type { BindingRole, Effort, ProviderId, Slot } from '../contracts';
import { BINDING_ROLES, TIER_ORDER } from '../contracts';
import {
  bindingOf,
  isReservedKind,
  kindDef,
  ROLE_PROBE_KIND,
  type RouteHints,
  tierOf,
} from './kinds';
import {
  capsReady,
  connectionOf,
  isCloudConnection,
  keyAvailable,
  type LlmSettings,
} from './settings';

/** Connection health as routing sees it (the runner's circuit breakers). */
export interface RouteHealth {
  /** The connection's circuit is open: route around it. */
  isOpen(connectionId: string): boolean;
  /** The model is disabled on the connection (permission denied, not found). */
  isModelDisabled?(connectionId: string, model: string): boolean;
}

export interface RouteContext {
  /** Global ladder level 0 to 9. */
  degradeLevel: number;
  /** Reserved request (defaults to the kind's own rule). */
  reserved?: boolean;
  health?: RouteHealth;
  hints?: RouteHints;
  /** The role pack's default tier, used for kinds the table does not list. */
  fallbackTier?: Slot;
  /** 'call' (default) needs everything a call needs; 'config' is for estimates (see slotUsable). */
  readiness?: Readiness;
}

/**
 * How ready a slot must be: 'call' needs a key when the connection uses one, the first-use
 * consent and the hour and day caps for a cloud connection (8.3: required once a cloud
 * connection is bound), and a model the health record has not disabled; 'config' only needs
 * the slot to name a model its connection enables (the estimate before keys and caps exist).
 */
export type Readiness = 'call' | 'config';

export type BuiltinReason = 'model_off' | 'role_builtin' | 'not_configured' | 'connection_down';

export interface ModelRoute {
  driver: 'model';
  kind: string;
  bindingRole: BindingRole;
  /** The slot used. */
  slot: Slot;
  /** The slot the binding and tilt asked for. */
  wanted: Slot;
  connectionId: string;
  provider: ProviderId;
  model: string;
  effort?: Effort;
  /** Moved to another connection past an open circuit. */
  rerouted: boolean;
  /** Lowered one slot by the ladder (level 2 and above). */
  lowered: boolean;
}

export interface BuiltinRoute {
  driver: 'builtin';
  kind: string;
  bindingRole: BindingRole;
  reason: BuiltinReason;
}

export type RouteDecision = ModelRoute | BuiltinRoute;

const NO_HEALTH: RouteHealth = { isOpen: () => false };

/** Whether a slot can carry a call right now (circuit state aside). */
export function slotUsable(
  s: LlmSettings,
  slot: Slot,
  health: RouteHealth = NO_HEALTH,
  readiness: Readiness = 'call',
): boolean {
  const b = s.slots[slot];
  if (!b) return false;
  const conn = connectionOf(s, b.connectionId);
  if (!conn?.models.some((m) => m.model === b.model)) return false;
  if (readiness === 'config') return true;
  if (!keyAvailable(conn)) return false;
  if (isCloudConnection(conn)) {
    if (!s.consentedConnectionIds.includes(conn.id) || !capsReady(s)) return false;
  }
  return !health.isModelDisabled?.(conn.id, b.model);
}

/** The highest usable slot (AQ-18: the anchors' "highest configured tier"). */
export function highestConfigured(
  s: LlmSettings,
  health?: RouteHealth,
  readiness?: Readiness,
): Slot | undefined {
  return TIER_ORDER.find((t) => slotUsable(s, t, health, readiness));
}

/** This slot, else the next lower usable one, else the nearest higher one. */
export function nearestConfigured(
  s: LlmSettings,
  want: Slot,
  health?: RouteHealth,
  readiness?: Readiness,
): Slot | undefined {
  const i = TIER_ORDER.indexOf(want);
  const order = [...TIER_ORDER.slice(i), ...TIER_ORDER.slice(0, i).reverse()];
  return order.find((t) => slotUsable(s, t, health, readiness));
}

/** The next lower usable slot, or undefined when there is none. */
export function lowerConfigured(
  s: LlmSettings,
  slot: Slot,
  health?: RouteHealth,
  readiness?: Readiness,
): Slot | undefined {
  return TIER_ORDER.slice(TIER_ORDER.indexOf(slot) + 1).find((t) =>
    slotUsable(s, t, health, readiness),
  );
}

/**
 * Where to go when `slot`'s connection is down: other usable slots on another connection,
 * lower ones first (top fails: mid, then low), then higher ones nearest first. Slots on the
 * same connection are never in the chain, because the circuit is per connection.
 */
export function fallbackChain(
  s: LlmSettings,
  slot: Slot,
  health?: RouteHealth,
  readiness?: Readiness,
): Slot[] {
  const failed = s.slots[slot]?.connectionId;
  const i = TIER_ORDER.indexOf(slot);
  const order = [...TIER_ORDER.slice(i + 1), ...TIER_ORDER.slice(0, i).reverse()];
  return order.filter(
    (t) => slotUsable(s, t, health, readiness) && s.slots[t]?.connectionId !== failed,
  );
}

function modelRoute(
  s: LlmSettings,
  kind: string,
  role: BindingRole,
  slot: Slot,
  wanted: Slot,
  flags: { rerouted: boolean; lowered: boolean },
): ModelRoute {
  const b = s.slots[slot] as NonNullable<LlmSettings['slots'][Slot]>;
  const conn = connectionOf(s, b.connectionId);
  const out: ModelRoute = {
    driver: 'model',
    kind,
    bindingRole: role,
    slot,
    wanted,
    connectionId: b.connectionId,
    provider: conn?.kind ?? 'none',
    model: b.model,
    ...flags,
  };
  if (b.effort) out.effort = b.effort;
  return out;
}

/** Decide who answers a request of this kind right now (llm_providers.md 4.3). */
export function resolveRoute(kind: string, ctx: RouteContext, s: LlmSettings): RouteDecision {
  const hints = ctx.hints ?? {};
  const health = ctx.health ?? NO_HEALTH;
  const ready = ctx.readiness ?? 'call';
  const role = bindingOf(kind, hints);
  const builtin = (reason: BuiltinReason): BuiltinRoute => ({
    driver: 'builtin',
    kind,
    bindingRole: role,
    reason,
  });
  if (s.preset === 'off') return builtin('model_off');
  const b = s.bindings[role];
  if (b.mode === 'builtin') return builtin('role_builtin');
  const def = kindDef(kind, ctx.fallbackTier);
  let want: Slot | undefined;
  if (b.mode === 'fixed') want = b.slot ?? 'low';
  else if (s.advanced.highestForAnchors && def.highest) want = highestConfigured(s, health, ready);
  else want = tierOf(kind, s.tilt, hints, ctx.fallbackTier);
  if (!want) return builtin('not_configured');
  let slot = nearestConfigured(s, want, health, ready);
  if (!slot) return builtin('not_configured');
  let lowered = false;
  const reserved = ctx.reserved ?? isReservedKind(kind, hints);
  if (ctx.degradeLevel >= 2 && !reserved) {
    const lower = lowerConfigured(s, slot, health, ready);
    if (lower) {
      slot = lower;
      lowered = true;
    }
  }
  const connId = s.slots[slot]?.connectionId as string;
  if (health.isOpen(connId)) {
    const alt = fallbackChain(s, slot, health, ready).find(
      (t) => !health.isOpen(s.slots[t]?.connectionId as string),
    );
    return alt
      ? modelRoute(s, kind, role, alt, want, { rerouted: true, lowered })
      : builtin('connection_down');
  }
  return modelRoute(s, kind, role, slot, want, { rerouted: false, lowered });
}

/**
 * The same route one slot lower (budget: a reservation that does not fit tries the next
 * lower usable slot before the request is declined); undefined when there is none.
 */
export function lowerRoute(
  route: ModelRoute,
  s: LlmSettings,
  health: RouteHealth = NO_HEALTH,
): ModelRoute | undefined {
  for (const t of TIER_ORDER.slice(TIER_ORDER.indexOf(route.slot) + 1)) {
    if (!slotUsable(s, t, health)) continue;
    if (health.isOpen(s.slots[t]?.connectionId as string)) continue;
    return modelRoute(s, route.kind, route.bindingRole, t, route.wanted, {
      rerouted: route.rerouted,
      lowered: true,
    });
  }
  return undefined;
}

/** The current driver of every binding role, through its representative kind (screen A). */
export function routeDrivers(
  s: LlmSettings,
  ctx: RouteContext,
): Record<BindingRole, RouteDecision> {
  return Object.fromEntries(
    BINDING_ROLES.map((r) => [r, resolveRoute(ROLE_PROBE_KIND[r], { ...ctx, hints: {} }, s)]),
  ) as Record<BindingRole, RouteDecision>;
}
