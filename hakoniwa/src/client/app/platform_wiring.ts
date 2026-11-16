// Small pieces main.ts needs to put the client on PlatformHost (release_engineering.md 2.2,
// 2.8): the page's local storage when the browser lets the page use it, and the model spend
// already booked by the desktop gateway (llm_providers.md 8.4), read once to seed the AI
// budget. Pure over what is passed in (the page scope, PlatformHost.llm).

import type { CapWindow, Cost } from '../../ai/budget';
import type { KeyValueLike, PlatformLlm } from '../../platform';

/** window.localStorage, or null when reading it throws or a write is refused. */
export function pageStorage(scope: { readonly localStorage?: unknown }): KeyValueLike | null {
  try {
    const s = scope.localStorage as KeyValueLike | undefined;
    if (!s) return null;
    const probe = '__hakoniwa_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/**
 * Windows seeded from the gateway. Not `run`: hk:llm.ledger carries no save line id, so its
 * run total may belong to another save line (llm_providers.md 4.7).
 */
const WINDOWS: readonly CapWindow[] = ['hour', 'day'];

function costOf(v: unknown): Cost | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as { tokens?: unknown; usd?: unknown; used?: unknown };
  if (o.used !== undefined) return costOf(o.used);
  if (typeof o.tokens !== 'number' || !Number.isFinite(o.tokens) || o.tokens < 0) return null;
  const cost: Cost = { tokens: o.tokens };
  if (typeof o.usd === 'number' && Number.isFinite(o.usd) && o.usd >= 0) cost.usd = o.usd;
  return cost;
}

/**
 * The gateway's hour and day totals (hk:llm.ledger), as the AI bridge seeds its budget with:
 * a window answers `{ tokens, usd? }` or a snapshot with that under `used`. Null on the web
 * (no gateway) and while the gateway has no ledger yet (it answers not_implemented).
 */
export async function gatewayLedger(
  llm: PlatformLlm,
): Promise<Partial<Record<CapWindow, Cost>> | null> {
  if (llm.route !== 'gateway') return null;
  const out: Partial<Record<CapWindow, Cost>> = {};
  for (const window of WINDOWS) {
    try {
      const r = await llm.gateway.ledger({ window });
      const cost = r.ok ? costOf(r.value) : null;
      if (cost) out[window] = cost;
    } catch {
      // A window that cannot be read is not seeded.
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}
