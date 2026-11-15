// Base address rules of a connection (docs/50_tech/llm_providers.md 5.4, 7.5, 17): a valid
// http or https URL without embedded credentials; cloud services need https unless the
// host is loopback or a private range; local services only accept loopback and private
// ranges; the web demo only accepts loopback. Compatible addresses not ending in /v1 get a
// hint. Pure (string parsing only); the settings model reuses it.

import type { LocalFlavor, ProviderKind } from './types';

export type AddressIssue =
  | 'invalid'
  | 'scheme'
  | 'credentials'
  | 'https_required'
  | 'not_local'
  | 'web_loopback_only';

export interface AddressCheck {
  ok: boolean;
  /** Normalised address (trimmed, no trailing slash) when valid. */
  url: string;
  issue?: AddressIssue;
  /** A compatible service address that does not end with /v1 (offer "append /v1"). */
  hintV1?: boolean;
}

function v4(host: string): number[] | undefined {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return undefined;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : undefined;
}

/** 127.0.0.0/8, ::1 and localhost. */
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h === '::1') return true;
  const p = v4(h);
  return p !== undefined && p[0] === 127;
}

/** Loopback, 10/8, 172.16/12, 192.168/16, link-local and IPv6 unique-local or link-local. */
export function isPrivateHost(hostname: string): boolean {
  if (isLoopbackHost(hostname)) return true;
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const p = v4(h);
  if (p) {
    const [a, b] = p as [number, number, number, number];
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  return /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h);
}

export function checkBaseUrl(
  raw: string,
  kind: ProviderKind,
  opts: { web?: boolean; flavor?: LocalFlavor } = {},
): AddressCheck {
  const url = raw.trim().replace(/\/+$/, '');
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, url, issue: 'invalid' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, url, issue: 'scheme' };
  if (u.username !== '' || u.password !== '') return { ok: false, url, issue: 'credentials' };
  const host = u.hostname;
  if (opts.web && !isLoopbackHost(host)) return { ok: false, url, issue: 'web_loopback_only' };
  if (kind === 'local' && !isPrivateHost(host)) return { ok: false, url, issue: 'not_local' };
  if (u.protocol === 'http:' && !isPrivateHost(host)) {
    return { ok: false, url, issue: 'https_required' };
  }
  const out: AddressCheck = { ok: true, url };
  const compat = kind === 'openai_compat' || (kind === 'local' && opts.flavor !== 'ollama');
  if (compat && !/\/v1$/.test(u.pathname.replace(/\/+$/, ''))) out.hintV1 = true;
  return out;
}
