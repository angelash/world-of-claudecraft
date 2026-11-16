// Client for the dev service (docs/50_tech/architecture.md 9):
//   GET  /api/data?file=<path under data/>   read a JSON data file
//   PUT  /api/data?file=<path under data/>   write it back (JSON body)
//   DELETE /api/data?file=<path under data/_staging/>   remove a staged batch file
// (The model proxy's status comes through the dev transport; see shell/llm_pill.ts.)
// The fetch function is injected so the response interpretation is unit-tested.
// A missing route is told apart from a missing file: the dev service answers in JSON,
// while a plain Vite server answers 404 text or its HTML fallback.

import { formatJson } from '../util/json';

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<FetchResponseLike>;

export type ReadResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: 'missing' | 'unavailable' | 'error'; message: string };

export type WriteResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'error'; message: string };

export interface DataApi {
  read(file: string): Promise<ReadResult>;
  write(file: string, data: unknown): Promise<WriteResult>;
  /** Remove a file (the dev service only removes staged batch files under data/_staging/). */
  remove(file: string): Promise<WriteResult>;
}

const JSON_HEADERS = { Accept: 'application/json' };

function isJsonResponse(res: FetchResponseLike): boolean {
  return (res.headers.get('content-type') ?? '').toLowerCase().includes('json');
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** Best-effort error text from a JSON error body ({ message } preferred, else { error }). */
function errorText(value: unknown, fallback: string): string {
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message) return o.message;
    if (typeof o.error === 'string' && o.error) return o.error;
  }
  return fallback;
}

export function dataUrl(base: string, file: string): string {
  return `${base}/api/data?file=${encodeURIComponent(file)}`;
}

export function createDataApi(
  fetchFn: FetchLike,
  base = '',
  messages = { network: 'network error', notJson: 'not JSON', http: (s: number) => `HTTP ${s}` },
): DataApi {
  /** A write or remove response: a JSON error body is the service's refusal. */
  async function writeOutcome(res: FetchResponseLike): Promise<WriteResult> {
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => '');
    const parsed = parseJson(text);
    if (!isJsonResponse(res) || !parsed.ok) {
      return { ok: false, reason: 'unavailable', message: messages.http(res.status) };
    }
    const message = errorText(parsed.value, messages.http(res.status));
    return { ok: false, reason: res.status === 403 ? 'unavailable' : 'error', message };
  }

  return {
    async read(file) {
      let res: FetchResponseLike;
      try {
        res = await fetchFn(dataUrl(base, file), { headers: JSON_HEADERS });
      } catch {
        return { ok: false, reason: 'unavailable', message: messages.network };
      }
      const text = await res.text().catch(() => '');
      const parsed = parseJson(text);
      if (res.ok) {
        // A 200 that is not JSON is the Vite HTML fallback: the route does not exist.
        if (!parsed.ok) return { ok: false, reason: 'unavailable', message: messages.notJson };
        return { ok: true, data: parsed.value };
      }
      if (!isJsonResponse(res) || !parsed.ok) {
        return { ok: false, reason: 'unavailable', message: messages.http(res.status) };
      }
      const message = errorText(parsed.value, messages.http(res.status));
      // 403: the service refuses this client (it serves loopback only): treat as absent.
      const reason = res.status === 404 ? 'missing' : res.status === 403 ? 'unavailable' : 'error';
      return { ok: false, reason, message };
    },

    async write(file, data) {
      let res: FetchResponseLike;
      try {
        res = await fetchFn(dataUrl(base, file), {
          method: 'PUT',
          headers: { ...JSON_HEADERS, 'Content-Type': 'application/json' },
          body: formatJson(data),
        });
      } catch {
        return { ok: false, reason: 'unavailable', message: messages.network };
      }
      return writeOutcome(res);
    },

    async remove(file) {
      let res: FetchResponseLike;
      try {
        res = await fetchFn(dataUrl(base, file), { method: 'DELETE', headers: JSON_HEADERS });
      } catch {
        return { ok: false, reason: 'unavailable', message: messages.network };
      }
      return writeOutcome(res);
    },
  };
}

/** GET /api/audit: one page of the on-disk AI audit log (newest first). */
export async function fetchAuditPage(
  fetchFn: FetchLike,
  q: { offset: number; limit: number; rotated: boolean },
  base = '',
): Promise<{ ok: true; body: unknown } | { ok: false; message: string }> {
  const url = `${base}/api/audit?offset=${q.offset}&limit=${q.limit}${q.rotated ? '&rotated=1' : ''}`;
  let res: FetchResponseLike;
  try {
    res = await fetchFn(url, { headers: JSON_HEADERS });
  } catch {
    return { ok: false, message: 'network' };
  }
  const parsed = parseJson(await res.text().catch(() => ''));
  if (!res.ok || !parsed.ok) return { ok: false, message: `HTTP ${res.status}` };
  return { ok: true, body: parsed.value };
}
