// The four provider adapters by kind (docs/50_tech/llm_providers.md 3.1). The desktop
// gateway, the dev proxy, the web demo's local transport and headless hosts all take their
// adapter from here; none of them carries a second copy of the translation code.

import { anthropicAdapter } from './anthropic';
import { localAdapter } from './local';
import { noneAdapter } from './none';
import { openaiCompatAdapter } from './openai_compat';
import type { ProviderAdapter, ProviderKind } from './types';

export const ADAPTERS: Readonly<Record<ProviderKind, ProviderAdapter>> = {
  none: noneAdapter,
  anthropic: anthropicAdapter,
  openai_compat: openaiCompatAdapter,
  local: localAdapter,
};

export function adapterFor(kind: ProviderKind): ProviderAdapter {
  return ADAPTERS[kind];
}
