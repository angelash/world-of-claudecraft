// Electron net is available in utility processes. Redirects and oversized answers fail closed.

import type { AdapterHttpRequest, AdapterHttpResponse } from '../../src/ai/providers/types';

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export function createNetSender(fetcher: typeof fetch, now: () => number = Date.now) {
  return async (request: AdapterHttpRequest, signal: AbortSignal): Promise<AdapterHttpResponse> => {
    const start = now();
    const res = await fetcher(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal,
      redirect: 'error',
      credentials: 'omit',
    });
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new Error('model response exceeds the bounded gateway buffer');
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      status: res.status,
      body: new TextDecoder().decode(bytes),
      headers: Object.fromEntries(res.headers.entries()),
      latencyMs: now() - start,
    };
  };
}
