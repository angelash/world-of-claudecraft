// Model ids, tier defaults and the price table (currency units per million tokens), shared
// by the runner's budget (estimates) and the dev proxy (settlement). Prices come from the
// price book data/llm/price_book.json (docs/50_tech/ai_architecture.md 10.2 and
// docs/50_tech/llm_providers.md 3.8); the official price list is authoritative. The proxy
// only calls models listed here (model whitelist, docs/50_tech/ai_architecture.md 11.1).

import knownModels from '../../data/llm/known_models.json';
import priceBook from '../../data/llm/price_book.json';
import type { LlmUsage, ModelTier, ProviderId } from './contracts';
import type { PriceCard } from './providers/types';

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

interface RawPrice {
  input: number;
  cacheRead: number;
  cacheWrite5m?: number;
  cacheWrite1h?: number;
  output: number;
  longPromptThreshold?: number;
  longPrompt?: Omit<RawPrice, 'longPromptThreshold' | 'longPrompt' | 'fallbackTarget'>;
  /** Server-side fallback targets: priced so a fallback answer settles, never callable. */
  fallbackTarget?: boolean;
}

interface PriceBook {
  fx: { cnyPerUsd: number };
  providers: {
    anthropic: {
      currency: 'USD';
      consoleUrl: string;
      dataPolicyUrl: string;
      models: Record<string, RawPrice>;
    };
    openai_compat: { models: Record<string, RawPrice> };
    local: { currency: 'USD'; default: RawPrice; models: Record<string, RawPrice> };
  };
}

const BOOK = priceBook as unknown as PriceBook;

/** Anthropic models whose server-side refusal fallback is requested (D-079 AQ-16). */
const SERVER_FALLBACK_MODELS: ReadonlySet<string> = new Set(
  Object.entries(
    (
      knownModels as {
        anthropic: { models: Record<string, { capability: { serverFallback: boolean } }> };
      }
    ).anthropic.models,
  )
    .filter(([, m]) => m.capability.serverFallback)
    .map(([id]) => id),
);

function toModelPrice(model: string, p: RawPrice): ModelPrice {
  const out: ModelPrice = {
    input: p.input,
    output: p.output,
    cacheRead: p.cacheRead,
    cacheWrite5m: p.cacheWrite5m ?? p.input,
    cacheWrite1h: p.cacheWrite1h ?? p.input,
    serverFallback: SERVER_FALLBACK_MODELS.has(model),
  };
  if (p.longPromptThreshold !== undefined && p.longPrompt) {
    out.longPromptThreshold = p.longPromptThreshold;
    out.longPrompt = {
      input: p.longPrompt.input,
      output: p.longPrompt.output,
      cacheRead: p.longPrompt.cacheRead,
      cacheWrite5m: p.longPrompt.cacheWrite5m ?? p.longPrompt.input,
      cacheWrite1h: p.longPrompt.cacheWrite1h ?? p.longPrompt.input,
    };
  }
  return out;
}

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = Object.fromEntries(
  Object.entries(BOOK.providers.anthropic.models).map(([m, p]) => [m, toModelPrice(m, p)]),
);

/** Reference exchange rate shipped with the price book (the player may override it). */
export const FX_CNY_PER_USD: number = BOOK.fx.cnyPerUsd;

/** Provider console and data policy links: the only addresses a fix button may open. */
export const PROVIDER_LINKS: Readonly<
  Partial<Record<ProviderId, { console: string; dataPolicy: string }>>
> = {
  anthropic: {
    console: BOOK.providers.anthropic.consoleUrl,
    dataPolicy: BOOK.providers.anthropic.dataPolicyUrl,
  },
};

/**
 * The shipped price card of a model: Anthropic rows from the price book, zero for local
 * services, none for compatible services (the player enters those prices).
 */
export function priceCardOf(kind: ProviderId, model: string): PriceCard | undefined {
  if (kind === 'local') {
    const p = BOOK.providers.local.models[model] ?? BOOK.providers.local.default;
    return { currency: 'USD', input: p.input, cacheRead: p.cacheRead, output: p.output };
  }
  if (kind !== 'anthropic') return undefined;
  const p = BOOK.providers.anthropic.models[model];
  if (!p || p.fallbackTarget) return undefined;
  const card: PriceCard = {
    currency: 'USD',
    input: p.input,
    cacheRead: p.cacheRead,
    output: p.output,
  };
  if (p.cacheWrite5m !== undefined) card.cacheWrite5m = p.cacheWrite5m;
  if (p.cacheWrite1h !== undefined) card.cacheWrite1h = p.cacheWrite1h;
  if (p.longPromptThreshold !== undefined && p.longPrompt) {
    card.longPromptThreshold = p.longPromptThreshold;
    card.longPrompt = { ...p.longPrompt };
  }
  return card;
}

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

/**
 * Cost in US dollars of one call under a connection's price card (llm_providers.md 3.8):
 * long-prompt card above its threshold, one-hour cache writes at their own price, missing
 * write prices at the input price; CNY cards convert at `cnyPerUsd`.
 */
export function costWithCard(card: PriceCard, u: LlmUsage, cnyPerUsd = FX_CNY_PER_USD): number {
  const use =
    card.longPrompt &&
    card.longPromptThreshold !== undefined &&
    promptTokens(u) > card.longPromptThreshold
      ? card.longPrompt
      : card;
  const write1h = Math.min(u.cacheCreation1hInputTokens ?? 0, u.cacheCreationInputTokens);
  const write5m = u.cacheCreationInputTokens - write1h;
  const amount =
    u.inputTokens * use.input +
    u.outputTokens * use.output +
    u.cacheReadInputTokens * use.cacheRead +
    write5m * (use.cacheWrite5m ?? use.input) +
    write1h * (use.cacheWrite1h ?? use.input);
  const usd = amount / 1_000_000;
  return card.currency === 'CNY' ? usd / cnyPerUsd : usd;
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
