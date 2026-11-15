// The app:// page source (docs/50_tech/release_engineering.md 2.6 "page source"): maps
// app://hakoniwa/<path> to the built game and app://key-entry/<path> to the key entry page,
// refuses anything outside those roots, and has no fallback page: a missing file is a 404,
// so a stray request (for example the dev model proxy probe) never receives index.html.
// Every response carries the content security policy.

import { isAbsolute, join, relative } from 'node:path';
import { CONTENT_SECURITY_POLICY } from './security';

/** Host to absolute directory. */
export type ProtocolRoots = Readonly<Record<string, string>>;

function inside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * The file an app:// URL names, or null. `isFile` answers whether a path is an existing
 * regular file (node:fs in the shell, a set in tests).
 */
export function resolveAppFile(
  url: string,
  roots: ProtocolRoots,
  isFile: (path: string) => boolean,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'app:') return null;
  if (!Object.hasOwn(roots, parsed.host)) return null;
  const root = roots[parsed.host] as string;
  let path: string;
  try {
    path = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (path.includes('\0')) return null;
  if (path === '/' || path === '') path = '/index.html';
  const candidate = join(root, path);
  if (!inside(root, candidate)) return null;
  return isFile(candidate) ? candidate : null;
}

/** Headers every app:// response carries. */
export const APP_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
});

/** A copy of `response` with the app headers added (fetched responses are immutable). */
export function withAppHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(APP_RESPONSE_HEADERS)) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function notFoundResponse(status = 404): Response {
  return new Response('not found', { status, headers: { ...APP_RESPONSE_HEADERS } });
}

/**
 * Serve one app:// request: GET and HEAD only, the resolved file through `fetchFile`
 * (net.fetch of a file URL in the shell, which sets the MIME type), headers added.
 */
export async function serveAppRequest(
  request: { url: string; method: string },
  roots: ProtocolRoots,
  deps: { isFile: (path: string) => boolean; fetchFile: (path: string) => Promise<Response> },
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return notFoundResponse(405);
  const file = resolveAppFile(request.url, roots, deps.isFile);
  if (!file) return notFoundResponse();
  try {
    return withAppHeaders(await deps.fetchFile(file));
  } catch {
    return notFoundResponse();
  }
}
