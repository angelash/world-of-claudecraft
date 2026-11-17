// Client of the asset review desk routes (/api/assets*, tools/assets/review/routes.ts).
// The fetch function is injected so the calls are testable without a server. No DOM.

import type { FetchLike } from '../api/data_client';
import type { DeskListing, ManifestRecord, ReviewEvent, Status } from './asset_model';

export type DeskResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; details: string[] };

export interface AdoptRequest {
  id: string;
  keys: string[];
  reviewer: string;
  note: string;
  replace: boolean;
}

export interface ReviewRequest {
  id: string;
  status: Status;
  reasons: string[];
  note: string;
  reviewer: string;
}

export interface AssetDeskApi {
  list(): Promise<DeskResult<DeskListing>>;
  log(id: string): Promise<DeskResult<ReviewEvent[]>>;
  adopt(req: AdoptRequest): Promise<DeskResult<{ record: ManifestRecord; event: ReviewEvent }>>;
  review(req: ReviewRequest): Promise<DeskResult<{ record: ManifestRecord; event: ReviewEvent }>>;
}

async function call<T>(
  fetchFn: FetchLike,
  url: string,
  init: { method: string; body?: string; headers?: Record<string, string> } | undefined,
  pick: (body: Record<string, unknown>) => T,
): Promise<DeskResult<T>> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchFn(url, init);
  } catch {
    return { ok: false, error: 'network', details: [] };
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await res.text()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: 'not_json', details: [] };
  }
  if (!res.ok || body.ok !== true) {
    const details = Array.isArray(body.details) ? body.details.map(String) : [];
    return {
      ok: false,
      error: typeof body.error === 'string' ? body.error : `http_${res.status}`,
      details,
    };
  }
  return { ok: true, value: pick(body) };
}

export function createAssetDeskApi(fetchFn: FetchLike, base = ''): AssetDeskApi {
  const post = (body: unknown) => ({
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  return {
    list: () => call(fetchFn, `${base}/api/assets`, undefined, (b) => b as unknown as DeskListing),
    log: (id) =>
      call(fetchFn, `${base}/api/assets/log?id=${encodeURIComponent(id)}`, undefined, (b) =>
        Array.isArray(b.events) ? (b.events as ReviewEvent[]) : [],
      ),
    adopt: (req) =>
      call(fetchFn, `${base}/api/assets/adopt`, post(req), (b) => ({
        record: b.record as ManifestRecord,
        event: b.event as ReviewEvent,
      })),
    review: (req) =>
      call(fetchFn, `${base}/api/assets/review`, post(req), (b) => ({
        record: b.record as ManifestRecord,
        event: b.event as ReviewEvent,
      })),
  };
}
