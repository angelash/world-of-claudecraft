// The 'none' adapter: no model. Every answer is a failure without a player problem code (the
// runner turns it into decline(model_off)), so a route that lands on it declines at once and
// the deterministic fallback runs on the next tick, on the same code path as a configured
// model (docs/50_tech/ai_architecture.md 2.3.1; D-010). It never builds a request: a
// transport for 'none' answers locally through noneResult.

import type { LlmCallResult } from '../contracts';
import { newStreamState } from './shared';
import type { AdapterError, ModelListing, ProviderAdapter } from './types';

/** The model is off by choice: no problem code, nothing to fix (decline reason model_off). */
const MODEL_OFF: AdapterError = { cls: 'model_unavailable', message: 'model_off' };

/** The receipt a 'none' route answers with, without any request. */
export function noneResult(latencyMs = 0): LlmCallResult {
  return { ok: false, error: { cls: MODEL_OFF.cls, message: MODEL_OFF.message }, latencyMs };
}

function noRequest(): never {
  throw new Error('the none provider never sends a request');
}

export const noneAdapter: ProviderAdapter = {
  kind: 'none',
  build: noRequest,
  parse: (_status, _body, latencyMs) => noneResult(latencyMs),
  startStream: () => ({ ...newStreamState('none', 'prompt_only'), done: true }),
  parseStreamEvent: (state) => ({ state, events: [{ t: 'done' }] }),
  endStream: (_state, latencyMs) => noneResult(latencyMs),
  classify: () => ({ ...MODEL_OFF }),
  listModels: noRequest,
  parseModels: (_status, _body, conn): ModelListing => ({
    connectionId: conn.id,
    ok: false,
    models: [],
  }),
  probe: noRequest,
};
