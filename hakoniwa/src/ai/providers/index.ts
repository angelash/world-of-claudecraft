// Providers behind the LlmProvider seam and the pure provider adapters
// (docs/50_tech/llm_providers.md 2.2, 3):
// - TransportProvider: the runner's provider over an injected LlmTransport (the routed
//   LlmCallSpec path, and legacy requests turned into specs); NullProvider and MockProvider
//   for no model and tests.
// - none, anthropic, openai_compat, local: pure adapters from LlmCallSpec to a provider
//   request and back, shared by the desktop gateway, the dev proxy and headless hosts.
// - problems, capabilities, schema dialects, address rules, the spec check and the
//   connection test flow. Nothing here touches a network, a clock or the DOM.

export * from './adapters';
export * from './address';
export * from './anthropic';
export * from './call_spec';
export * from './capabilities';
export * from './connection_test';
export * from './guidance';
export * from './local';
export * from './mock';
export * from './none';
export * from './null';
export * from './openai_compat';
export * from './problems';
export * from './schema_dialect';
export {
  EMPTY_TURN,
  estimatedUsage,
  fillEstimatedInput,
  normalizeBaseUrl,
  stripThinking,
  visibleStreamText,
} from './shared';
export * from './transport_provider';
export * from './types';
