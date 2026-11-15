// Model ids, tier defaults and the price table (US dollars per million tokens), shared by
// the runner's budget (estimates) and the dev proxy (settlement). Prices follow
// docs/50_tech/ai_architecture.md 10.2 and Anthropic's published rates for 2026-11;
// recheck against the official price list before shipping. The proxy only calls models
// listed here (model whitelist, docs/50_tech/ai_architecture.md 11.1).

import type { LlmUsage, ModelTier } from './contracts';

export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  /** Prompts above this many tokens use the long-prompt rate card (Haiku 5.5). */
  longPromptThreshold?: number;
  longPrompt?: Omit<ModelPrice, 'longPromptThreshold' | 'longPrompt' | 'serverFallback'>;
  /** Whether the server-side refusal fallback (fallbacks: 'default') may be requested. */
  serverFallback: boolean;
}

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  'claude-opus-5-5': {
    input: 4,
    output: 20,
    cacheRead: 0.2,
    cacheWrite5m: 5,
    cacheWrite1h: 8,
    serverFallback: true,
  },
  'claude-sonnet-5-5': {
    input: 2,
    output: 10,
    cacheRead: 0.1,
    cacheWrite5m: 2.5,
    cacheWrite1h: 4,
    serverFallback: true,
  },
  'claude-haiku-5-5': {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite5m: 0.125,
    cacheWrite1h: 0.2,
    longPromptThreshold: 100_000,
    longPrompt: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite5m: 0.625, cacheWrite1h: 1 },
    serverFallback: false,
  },
  // Documented server-side fallback targets; priced so a fallback answer settles correctly.
  'claude-opus-5': {
    input: 5,
    output: 25,
    cacheRead: 0.5,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10,
    serverFallback: false,
  },
  'claude-sonnet-5': {
    input: 2,
    output: 10,
    cacheRead: 0.2,
    cacheWrite5m: 2.5,
    cacheWrite1h: 4,
    serverFallback: false,
  },
};

/** Models the proxy may be configured to call (fallback targets are not callable directly). */
export const CALLABLE_MODELS: readonly string[] = [
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
];

/** Recommended preset (Q-004): Opus 5.5 top, Sonnet 5.5 mid, Haiku 5.5 low. */
export const DEFAULT_TIER_MODELS: Readonly<Record<ModelTier, string>> = {
  top: 'claude-opus-5-5',
  mid: 'claude-sonnet-5-5',
  low: 'claude-haiku-5-5',
};

export function priceOf(model: string): ModelPrice | undefined {
  return MODEL_PRICES[model];
}

/** Total prompt size as billed: uncached + cache reads + cache writes. */
export function promptTokens(u: LlmUsage): number {
  return u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens;
}

/** Cost in US dollars of one call. Unknown models cost 0 (callers fall back to estimates). */
export function costUsd(model: string, u: LlmUsage): number {
  const p = priceOf(model);
  if (!p) return 0;
  const card =
    p.longPrompt && p.longPromptThreshold !== undefined && promptTokens(u) > p.longPromptThreshold
      ? p.longPrompt
      : p;
  const write1h = Math.min(u.cacheCreation1hInputTokens ?? 0, u.cacheCreationInputTokens);
  const write5m = u.cacheCreationInputTokens - write1h;
  const usd =
    u.inputTokens * card.input +
    u.outputTokens * card.output +
    u.cacheReadInputTokens * card.cacheRead +
    write5m * card.cacheWrite5m +
    write1h * card.cacheWrite1h;
  return usd / 1_000_000;
}

/** Rough token estimate for budgeting: CJK characters count about 1.3, other characters 0.3. */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (
      (c >= 0x3000 && c <= 0x9fff) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xff00 && c <= 0xffef)
    )
      cjk++;
    else other++;
  }
  return Math.ceil(cjk * 1.3 + other * 0.3);
}

/**
 * Worst-case reservation for a call: estimated input at the full (uncached) rate plus 15
 * percent, and the whole output cap (thinking counts toward it).
 */
export function estimateCallUsd(model: string, inputText: string, maxTokens: number): number {
  const input = Math.ceil(estimateTokens(inputText) * 1.15);
  return costUsd(model, {
    inputTokens: input,
    outputTokens: maxTokens,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  });
}
