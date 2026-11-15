// LlmCallSpec helpers: the shape check every receiving side runs (the gateway guard's item 2
// and the dev proxy: agreed fields only, bounded size and segment count, no address or
// header ever accepted; docs/50_tech/llm_providers.md 7.4) and the bridge from the runner's
// legacy LlmRequest (rules, persona, turn) to neutral segments.

import type {
  BindingRole,
  CacheTtl,
  LlmCallSpec,
  LlmRequest,
  PromptSegment,
  ProviderId,
  SegmentCache,
  SegmentRole,
  Slot,
} from '../contracts';
import { BINDING_ROLES, PROVIDER_IDS } from '../contracts';

export const MAX_SPEC_BYTES = 256 * 1024;
export const MAX_SPEC_SEGMENTS = 64;
/** The gateway caps output at this many tokens (llm_providers.md 7.4 item 4). */
export const SPEC_MAX_TOKENS_CAP = 16_000;
/** Timeouts are clamped to this (7.4 item 7). */
export const SPEC_MAX_TIMEOUT_MS = 300_000;

const SPEC_KEYS = new Set([
  'requestId',
  'provider',
  'connectionId',
  'slot',
  'bindingRole',
  'model',
  'segments',
  'output',
  'effort',
  'stream',
  'timeoutMs',
  'reserve',
  'purpose',
]);
const SEGMENT_KEYS = new Set(['role', 'text', 'cache', 'opaque']);
const OUTPUT_KEYS = new Set(['schemaId', 'schemaVersion', 'schema', 'maxTokens', 'constants']);

/**
 * Opaque provider blocks may only be thinking blocks with string fields: anything else (an
 * image or document with a URL source) would carry an address past the guard (7.4 item 2).
 */
function opaqueBlockOk(b: unknown): boolean {
  if (!isObj(b)) return false;
  const allowed =
    b.type === 'thinking'
      ? ['type', 'thinking', 'signature']
      : b.type === 'redacted_thinking'
        ? ['type', 'data']
        : undefined;
  if (!allowed) return false;
  return Object.entries(b).every(([k, v]) => allowed.includes(k) && typeof v === 'string');
}
const ROLES: readonly SegmentRole[] = [
  'rules',
  'persona',
  'private',
  'history_user',
  'history_assistant',
  'operator',
  'player_data',
  'turn',
];

export type SpecParse = { ok: true; value: LlmCallSpec } | { ok: false; error: string };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function extraKey(o: Record<string, unknown>, allowed: ReadonlySet<string>): string | undefined {
  return Object.keys(o).find((k) => !allowed.has(k));
}

/**
 * Validate a received spec: exactly the agreed fields (an extra field is a defect), at most
 * 64 segments and 256 KiB serialised; maxTokens is clamped to 16000 and the timeout to 300
 * seconds. Errors are developer text.
 */
export function parseCallSpec(raw: unknown, serializedBytes?: number): SpecParse {
  if (!isObj(raw)) return { ok: false, error: 'spec must be an object' };
  const extra = extraKey(raw, SPEC_KEYS);
  if (extra) return { ok: false, error: `unexpected field ${extra}` };
  const bytes = serializedBytes ?? new TextEncoder().encode(JSON.stringify(raw)).length;
  if (bytes > MAX_SPEC_BYTES) return { ok: false, error: 'spec too large' };
  const s = raw;
  if (typeof s.requestId !== 'string' || s.requestId === '' || s.requestId.length > 96) {
    return { ok: false, error: 'bad requestId' };
  }
  if (!PROVIDER_IDS.includes(s.provider as ProviderId)) return { ok: false, error: 'bad provider' };
  if (typeof s.connectionId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(s.connectionId)) {
    return { ok: false, error: 'bad connectionId' };
  }
  if (s.slot !== 'top' && s.slot !== 'mid' && s.slot !== 'low')
    return { ok: false, error: 'bad slot' };
  if (!BINDING_ROLES.includes(s.bindingRole as BindingRole)) {
    return { ok: false, error: 'bad bindingRole' };
  }
  if (typeof s.model !== 'string' || s.model === '' || s.model.length > 200) {
    return { ok: false, error: 'bad model' };
  }
  if (!Array.isArray(s.segments) || s.segments.length === 0) {
    return { ok: false, error: 'segments must be a non-empty array' };
  }
  if (s.segments.length > MAX_SPEC_SEGMENTS) return { ok: false, error: 'too many segments' };
  const segments: PromptSegment[] = [];
  for (const seg of s.segments) {
    if (!isObj(seg) || extraKey(seg, SEGMENT_KEYS)) return { ok: false, error: 'bad segment' };
    if (!ROLES.includes(seg.role as SegmentRole) || typeof seg.text !== 'string') {
      return { ok: false, error: 'bad segment' };
    }
    const out: PromptSegment = { role: seg.role as SegmentRole, text: seg.text };
    if (seg.cache !== undefined) {
      if (seg.cache !== 'none' && seg.cache !== 'short' && seg.cache !== 'long') {
        return { ok: false, error: 'bad segment cache' };
      }
      out.cache = seg.cache as SegmentCache;
    }
    if (seg.opaque !== undefined) {
      const o = seg.opaque;
      if (
        seg.role !== 'history_assistant' ||
        !isObj(o) ||
        !PROVIDER_IDS.includes(o.provider as ProviderId) ||
        !Array.isArray(o.blocks) ||
        !o.blocks.every(opaqueBlockOk)
      ) {
        return { ok: false, error: 'bad segment opaque' };
      }
      out.opaque = {
        provider: o.provider as ProviderId,
        blocks: o.blocks,
        ...(typeof o.model === 'string' ? { model: o.model } : {}),
      };
    }
    segments.push(out);
  }
  const o = s.output;
  if (!isObj(o) || extraKey(o, OUTPUT_KEYS)) return { ok: false, error: 'bad output' };
  if (typeof o.schemaId !== 'string' || o.schemaId === '')
    return { ok: false, error: 'bad schemaId' };
  if (!isObj(o.schema) || o.schema.type !== 'object') {
    return { ok: false, error: 'output schema must be an object schema' };
  }
  let constants: Record<string, string | number | boolean> | undefined;
  if (o.constants !== undefined) {
    if (
      !isObj(o.constants) ||
      !Object.values(o.constants).every((v) => ['string', 'number', 'boolean'].includes(typeof v))
    ) {
      return { ok: false, error: 'bad output constants' };
    }
    constants = o.constants as Record<string, string | number | boolean>;
  }
  const mt = o.maxTokens;
  if (typeof mt !== 'number' || !Number.isInteger(mt) || mt < 1) {
    return { ok: false, error: 'bad maxTokens' };
  }
  if (
    s.effort !== undefined &&
    s.effort !== 'low' &&
    s.effort !== 'medium' &&
    s.effort !== 'high'
  ) {
    return { ok: false, error: 'bad effort' };
  }
  if (s.stream !== undefined && typeof s.stream !== 'boolean')
    return { ok: false, error: 'bad stream' };
  if (typeof s.timeoutMs !== 'number' || !(s.timeoutMs > 0)) {
    return { ok: false, error: 'bad timeoutMs' };
  }
  const r = s.reserve;
  if (!isObj(r) || typeof r.usd !== 'number' || typeof r.tokens !== 'number') {
    return { ok: false, error: 'bad reserve' };
  }
  const value: LlmCallSpec = {
    requestId: s.requestId,
    provider: s.provider as ProviderId,
    connectionId: s.connectionId,
    slot: s.slot as Slot,
    bindingRole: s.bindingRole as BindingRole,
    model: s.model,
    segments,
    output: {
      schemaId: o.schemaId,
      schema: o.schema,
      maxTokens: Math.min(mt, SPEC_MAX_TOKENS_CAP),
      ...(typeof o.schemaVersion === 'string' ? { schemaVersion: o.schemaVersion } : {}),
    },
    timeoutMs: Math.min(s.timeoutMs, SPEC_MAX_TIMEOUT_MS),
    reserve: { usd: r.usd, tokens: r.tokens },
  };
  if (constants) value.output.constants = constants;
  if (s.effort !== undefined) value.effort = s.effort as LlmCallSpec['effort'];
  if (s.stream !== undefined) value.stream = s.stream;
  if (typeof s.purpose === 'string') value.purpose = s.purpose.slice(0, 120);
  return { ok: true, value };
}

/** Route facts the legacy request does not carry. */
export interface SpecRoute {
  provider: ProviderId;
  connectionId: string;
  bindingRole: BindingRole;
  model: string;
  timeoutMs: number;
  reserve?: { usd: number; tokens: number };
  slot?: Slot;
  stream?: boolean;
  attempt?: number;
}

function cacheOf(ttl: CacheTtl | undefined): SegmentCache {
  return ttl === '1h' ? 'long' : 'short';
}

/**
 * The runner's legacy request as a neutral spec: the rules text and the persona text are
 * cached system segments (the persona only when not blank), the volatile context is the turn.
 */
export function callSpecFromRequest(req: LlmRequest, route: SpecRoute): LlmCallSpec {
  const cache = cacheOf(req.cacheTtl);
  const segments: PromptSegment[] = [{ role: 'rules', text: req.system, cache }];
  if (req.stable !== undefined && req.stable.trim() !== '') {
    segments.push({ role: 'persona', text: req.stable, cache });
  }
  segments.push({ role: 'turn', text: req.context });
  const spec: LlmCallSpec = {
    requestId: `${req.requestId ?? 'req'}#${route.attempt ?? 1}`,
    provider: route.provider,
    connectionId: route.connectionId,
    slot: route.slot ?? req.tier,
    bindingRole: route.bindingRole,
    model: route.model,
    segments,
    output: {
      schemaId: req.purpose.split('/')[0] || 'output',
      schema: req.schema,
      maxTokens: req.maxTokens,
    },
    timeoutMs: route.timeoutMs,
    reserve: route.reserve ?? { usd: 0, tokens: 0 },
    purpose: req.purpose,
  };
  if (req.effort) spec.effort = req.effort;
  if (route.stream !== undefined) spec.stream = route.stream;
  return spec;
}
