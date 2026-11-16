// The model service pill of the workbench status bar: the dev proxy's GET /api/llm/status as
// the dev transport reads it (src/ai/transports/dev_proxy.ts, DevProxyTransport.status),
// reduced to a state, a short detail line and a tooltip. Pure: the caller reads the status.

import { DEV_PROXY_CONNECTION_ID } from '../../ai/llm_config';
import type { DevProxyStatus } from '../../ai/transports/dev_proxy';

/** Reasons that mean nothing answered: no dev service, no fetch, or no readable status. */
const UNREACHABLE: ReadonlySet<string> = new Set([
  'network',
  'no_proxy',
  'no_transport',
  'bad_response',
]);

export interface LlmPill {
  /** available: a model answers; disabled: the proxy answers without one; unreachable: no proxy. */
  state: 'available' | 'disabled' | 'unreachable';
  /** Reason, slot models and the other served connections, joined with ' / '. */
  detail: string;
  /** Tooltip: the status itself, connections by id. */
  title: string;
}

export function summarizeDevProxy(s: DevProxyStatus): LlmPill {
  const others = (s.connections ?? [])
    .map((c) => c.id)
    .filter((id) => id !== DEV_PROXY_CONNECTION_ID);
  const title = JSON.stringify(
    { ...s, ...(s.connections ? { connections: s.connections.map((c) => c.id) } : {}) },
    null,
    2,
  );
  if (!s.available && UNREACHABLE.has(s.reason ?? '')) {
    return { state: 'unreachable', detail: s.reason ?? '', title };
  }
  const parts: string[] = [];
  if (s.reason) parts.push(s.reason);
  for (const [slot, model] of Object.entries(s.tiers ?? {})) {
    if (model) parts.push(`${slot} ${model}`);
  }
  parts.push(...others);
  return { state: s.available ? 'available' : 'disabled', detail: parts.join(' / '), title };
}
