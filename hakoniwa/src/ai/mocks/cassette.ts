// CassetteTransport (docs/50_tech/llm_providers.md 16.1; release_engineering.md 10.8):
// record mode passes calls through to a real transport and stores each receipt under the
// hash of the normalised request (model, prompt segments, output schema and parameters;
// never the request id, the reservation, the timeout or the routing labels); replay mode
// answers by hash and fails the test on a miss. Recorded receipts are scrubbed: provider
// request ids dropped, key-like strings and bearer tokens replaced. Pure.

import type { AbortSignalLike, LlmCallResult, LlmCallSpec, LlmTransport } from '../contracts';

export interface CassetteEntry {
  hash: string;
  model: string;
  purpose?: string;
  result: LlmCallResult;
}

export interface Cassette {
  version: 1;
  entries: CassetteEntry[];
}

const KEY_LIKE = /\b(sk-[A-Za-z0-9_-]{8,}|sk-ant-[A-Za-z0-9_-]+)/g;
const BEARER = /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi;

/** Deep copy with key-like strings and bearer tokens replaced. */
export function scrubSecrets<T>(v: T): T {
  if (typeof v === 'string') {
    return v.replace(KEY_LIKE, '[redacted]').replace(BEARER, '$1[redacted]') as T;
  }
  if (Array.isArray(v)) return v.map((x) => scrubSecrets(x)) as T;
  if (typeof v === 'object' && v !== null) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubSecrets(x)])) as T;
  }
  return v;
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (typeof v === 'object' && v !== null) {
    const keys = Object.keys(v).sort();
    return `{${keys
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

/** 64-bit FNV-1a over UTF-16 code units, as 16 hex digits. */
function fnv64(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c ^ (h1 >>> 7), 0x01000193) >>> 0;
  }
  return h2.toString(16).padStart(8, '0') + h1.toString(16).padStart(8, '0');
}

/** The cassette key of a spec: what the provider would see, nothing run-specific. */
export function specHash(spec: LlmCallSpec): string {
  return fnv64(
    canonical({
      provider: spec.provider,
      model: spec.model,
      segments: spec.segments,
      output: spec.output,
      effort: spec.effort,
      stream: spec.stream === true,
    }),
  );
}

export interface CassetteOptions {
  mode: 'record' | 'replay';
  cassette?: Cassette;
  /** The real transport (record mode). */
  inner?: LlmTransport;
  /** Replay miss: throw (default, fails the test) or answer a failed receipt. */
  onMiss?: 'throw' | 'fail';
}

export class CassetteTransport implements LlmTransport {
  private readonly entries: CassetteEntry[];

  constructor(private readonly opts: CassetteOptions) {
    this.entries = [...(opts.cassette?.entries ?? [])];
  }

  /** The tape as it stands (record mode adds to it). */
  get cassette(): Cassette {
    return { version: 1, entries: this.entries.map((e) => ({ ...e })) };
  }

  async send(
    spec: LlmCallSpec,
    opts: { signal?: AbortSignalLike; onDelta?: (text: string) => void } = {},
  ): Promise<LlmCallResult> {
    const hash = specHash(spec);
    if (this.opts.mode === 'replay') {
      const hit = this.entries.find((e) => e.hash === hash);
      if (hit) return structuredClone(hit.result);
      if ((this.opts.onMiss ?? 'throw') === 'throw') {
        throw new Error(`cassette miss for ${spec.purpose ?? spec.requestId} (${hash})`);
      }
      return { ok: false, error: { cls: 'bad_request', message: 'cassette miss' }, latencyMs: 0 };
    }
    if (!this.opts.inner) throw new Error('a recording cassette needs an inner transport');
    const result = await this.opts.inner.send(spec, opts);
    const { providerRequestId: _drop, ...rest } = result;
    const clean = scrubSecrets(rest) as LlmCallResult;
    const entry: CassetteEntry = { hash, model: spec.model, result: clean };
    if (spec.purpose) entry.purpose = spec.purpose;
    const at = this.entries.findIndex((e) => e.hash === hash);
    if (at >= 0) this.entries[at] = entry;
    else this.entries.push(entry);
    return result;
  }
}
