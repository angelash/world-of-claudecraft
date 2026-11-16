// Development service as a Vite plugin (dev server only, `apply: 'serve'`):
//   GET  /api/llm/status   whether a model is reachable, which model serves each tier, and
//                          the served connections with their capability records
//   POST /api/llm          an LlmCallSpec in, an LlmCallResult (with a problem code on
//                          failure) out (docs/50_tech/llm_providers.md 3.1, 10, 12; the game's
//                          DevProxyTransport); or the legacy LlmRequest in, { ok, json, text,
//                          usage, model, stopReason, costUsd } out (only the editor workbench's
//                          ProxyProvider still sends it)
//   POST /api/llm/test     { connectionId, depth, models? } in, ConnectionTestReport out
//   GET  /api/llm/models   ?connectionId= (default dev_proxy), ModelListing out
//   GET  /api/data?file=   read a JSON file under hakoniwa/data/
//   PUT  /api/data?file=   write a JSON file under hakoniwa/data/ (the editor's formatJson:
//                          2-space indent, short values kept on one line, trailing newline)
//   DELETE /api/data?file= remove a staged batch file (only data/_staging/<batch>.json)
//   POST /api/audit        append one AI audit record to hakoniwa/.local/audit.jsonl
//   GET  /api/audit        page through that log (?offset=&limit=&order=desc|asc&rotated=1)
// Credentials stay in this process's environment. By default only loopback clients are
// served (set allowRemote or HAKONIWA_DEV_API_REMOTE=1 to open it to the LAN, which also
// lets LAN devices spend the model budget and write data files).
// See docs/50_tech/architecture.md 9 and docs/50_tech/ai_architecture.md 11.1.

import {
  appendFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { parseCallSpec } from '../src/ai/providers/call_spec';
import { formatJson } from '../src/editor/util/json';
import { resolveDataPath } from './data_paths';
import {
  DEV_PROXY_CONNECTION_ID,
  LlmService,
  type LlmServiceOptions,
  MAX_BODY_BYTES,
  parseLlmBody,
  parseTestBody,
} from './llm_proxy';

/** hakoniwa/ (this file lives in hakoniwa/tools/). */
export const HAKONIWA_ROOT = fileURLToPath(new URL('..', import.meta.url));

const DATA_MAX_BYTES = 4 * 1024 * 1024;
const AUDIT_MAX_BYTES = 1024 * 1024;
const AUDIT_ROTATE_BYTES = 32 * 1024 * 1024;
const AUDIT_PAGE_DEFAULT = 100;
const AUDIT_PAGE_MAX = 1000;

export function rotatedAuditFile(file: string): string {
  return file.replace(/\.jsonl$/, '.1.jsonl');
}

export interface AuditPage {
  /** valid records in the file */
  total: number;
  offset: number;
  limit: number;
  /** lines that are not a JSON object */
  skipped: number;
  records: unknown[];
}

/**
 * One page of a JSON-lines audit log. `desc` (the default) counts the offset from the
 * newest record; limit is clamped to 1..1000.
 */
export function pageAuditLines(
  text: string,
  opts: { offset?: number; limit?: number; order?: 'asc' | 'desc' } = {},
): AuditPage {
  const records: unknown[] = [];
  let skipped = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const v = JSON.parse(line) as unknown;
      if (v && typeof v === 'object' && !Array.isArray(v)) records.push(v);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  const finite = (v: number | undefined, d: number) => (Number.isFinite(v) ? (v as number) : d);
  const offset = Math.max(0, Math.floor(finite(opts.offset, 0)));
  const limit = Math.min(
    AUDIT_PAGE_MAX,
    Math.max(1, Math.floor(finite(opts.limit, AUDIT_PAGE_DEFAULT))),
  );
  const ordered = opts.order === 'asc' ? records : [...records].reverse();
  return {
    total: records.length,
    offset,
    limit,
    skipped,
    records: ordered.slice(offset, offset + limit),
  };
}

export interface DevApiOptions {
  /** Project root holding data/ and .local/; defaults to hakoniwa/. */
  root?: string;
  /** Serve non-loopback clients too (default: env HAKONIWA_DEV_API_REMOTE === '1'). */
  allowRemote?: boolean;
  llm?: LlmServiceOptions;
  /** Injected for tests; defaults to a service built from `llm`. */
  llmService?: LlmService;
}

export type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void;

export function devApi(opts: DevApiOptions = {}): Plugin {
  return {
    name: 'hakoniwa-dev-api',
    apply: 'serve',
    configureServer(server) {
      const logger = server.config.logger;
      server.middlewares.use(
        createDevApiMiddleware({
          ...opts,
          llm: { log: (line) => logger.info(line), ...opts.llm },
        }),
      );
    },
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(text);
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    req.on('data', (chunk: Buffer) => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true;
        reject(new HttpError(413, 'body_too_large'));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!failed) resolveBody(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => {
      if (!failed) reject(err);
    });
  });
}

async function readJsonBody(req: IncomingMessage, limit: number): Promise<unknown> {
  const text = await readBody(req, limit);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

export function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  return address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.');
}

/** Whether `full` stays inside `root` after resolving symlinks of the deepest existing part. */
async function insideRealRoot(root: string, full: string): Promise<boolean> {
  let realRoot: string;
  try {
    realRoot = await realpath(root);
  } catch {
    return true; // the data root does not exist yet; nothing can point outside it
  }
  let probe = full;
  for (;;) {
    try {
      const real = await realpath(probe);
      return (
        real === realRoot || real.startsWith(realRoot.endsWith(sep) ? realRoot : realRoot + sep)
      );
    } catch {
      const parent = dirname(probe);
      if (parent === probe) return false;
      probe = parent;
    }
  }
}

/** A POST /api/llm body in the LlmCallSpec shape (the legacy body has no segments). */
function isSpecBody(raw: unknown): boolean {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    Array.isArray((raw as { segments?: unknown }).segments)
  );
}

const PROBE_LIMITED = {
  ok: false,
  error: 'rate_limited',
  problem: 'rate_limited',
  message: 'at most 10 test or listing calls per minute',
};
const NO_CONNECTION = {
  ok: false,
  error: 'not_configured',
  problem: 'not_configured',
  message: 'unknown connection',
};

export function createDevApiMiddleware(opts: DevApiOptions = {}): Middleware {
  const root = resolve(opts.root ?? HAKONIWA_ROOT);
  const dataRoot = join(root, 'data');
  const auditFile = join(root, '.local', 'audit.jsonl');
  const allowRemote = opts.allowRemote ?? process.env.HAKONIWA_DEV_API_REMOTE === '1';
  let llm = opts.llmService;
  const llmService = (): LlmService => {
    llm ??= new LlmService({ connectionsFile: join(root, '.local', 'llm_dev.json'), ...opts.llm });
    return llm;
  };

  const routes: Record<
    string,
    (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void>
  > = {
    'GET /api/llm/status': async (_req, res) => {
      send(res, 200, await llmService().status());
    },

    'POST /api/llm': async (req, res) => {
      const svc = llmService();
      const raw = await readJsonBody(req, MAX_BODY_BYTES);
      const ctrl = new AbortController();
      res.on('close', () => {
        if (!res.writableFinished) ctrl.abort();
      });
      if (isSpecBody(raw)) {
        // The LlmCallSpec contract: a malformed spec is a defect (no player problem code).
        const spec = parseCallSpec(raw);
        if (!spec.ok) {
          return send(res, 400, {
            ok: false,
            error: { cls: 'bad_request', message: spec.error },
            latencyMs: 0,
          });
        }
        const result = await svc.completeSpec(spec.value, ctrl.signal);
        if (!res.writableEnded && !res.destroyed) send(res, 200, result);
        return;
      }
      const parsed = parseLlmBody(raw, svc.maxTokensCap);
      if (!parsed.ok)
        return send(res, 400, { ok: false, error: 'bad_request', message: parsed.error });
      const out = await svc.complete(parsed.value, ctrl.signal);
      if (!res.writableEnded && !res.destroyed) send(res, out.status, out.payload);
    },

    'POST /api/llm/test': async (req, res) => {
      const svc = llmService();
      const body = parseTestBody(await readJsonBody(req, 16 * 1024));
      if (!body.ok) return send(res, 400, { ok: false, error: 'bad_request', message: body.error });
      if (!svc.allowProbe()) return send(res, 429, PROBE_LIMITED);
      const report = await svc.testConnection(body.value);
      if (!report) return send(res, 404, NO_CONNECTION);
      send(res, 200, report);
    },

    'GET /api/llm/models': async (_req, res, url) => {
      const svc = llmService();
      const id = url.searchParams.get('connectionId') ?? DEV_PROXY_CONNECTION_ID;
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
        return send(res, 400, { ok: false, error: 'bad_request', message: 'bad connectionId' });
      }
      if (!svc.allowProbe()) return send(res, 429, PROBE_LIMITED);
      const listing = await svc.listModels(id);
      if (!listing) return send(res, 404, NO_CONNECTION);
      send(res, 200, listing);
    },

    'GET /api/data': async (_req, res, url) => {
      const p = resolveDataPath(dataRoot, url.searchParams.get('file'));
      if (!p.ok) return send(res, 400, { ok: false, error: p.reason });
      if (!(await insideRealRoot(dataRoot, p.path)))
        return send(res, 400, { ok: false, error: 'outside' });
      let text: string;
      try {
        text = await readFile(p.path, 'utf8');
      } catch {
        return send(res, 404, { ok: false, error: 'not_found' });
      }
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        return send(res, 422, { ok: false, error: 'invalid_json_on_disk' });
      }
      send(res, 200, value);
    },

    'PUT /api/data': async (req, res, url) => {
      const p = resolveDataPath(dataRoot, url.searchParams.get('file'));
      if (!p.ok) return send(res, 400, { ok: false, error: p.reason });
      const value = await readJsonBody(req, DATA_MAX_BYTES);
      if (!(await insideRealRoot(dataRoot, p.path)))
        return send(res, 400, { ok: false, error: 'outside' });
      await mkdir(dirname(p.path), { recursive: true });
      const tmp = `${p.path}.${process.pid}.tmp`;
      // The editor's formatter keeps the hand-written style of the data files.
      await writeFile(tmp, formatJson(value), 'utf8');
      await rename(tmp, p.path);
      send(res, 200, { ok: true, file: p.rel });
    },

    // Only staged batch files (release_engineering.md 7.3): a promotion removes its file.
    'DELETE /api/data': async (_req, res, url) => {
      const p = resolveDataPath(dataRoot, url.searchParams.get('file'));
      if (!p.ok) return send(res, 400, { ok: false, error: p.reason });
      // only a staged batch file (_staging/<batch>.json), never the index or a nested file
      if (!/^_staging\/content_[a-z0-9]+_[a-z0-9_]+_[0-9]{2}\.json$/.test(p.rel))
        return send(res, 400, { ok: false, error: 'not_staging' });
      if (
        !(await insideRealRoot(dataRoot, p.path)) ||
        !(await insideRealRoot(join(dataRoot, '_staging'), p.path))
      )
        return send(res, 400, { ok: false, error: 'not_staging' });
      try {
        if (!(await lstat(p.path)).isFile())
          return send(res, 400, { ok: false, error: 'not_file' });
      } catch {
        return send(res, 404, { ok: false, error: 'not_found' });
      }
      await unlink(p.path);
      send(res, 200, { ok: true, file: p.rel });
    },

    'POST /api/audit': async (req, res) => {
      const record = await readJsonBody(req, AUDIT_MAX_BYTES);
      if (typeof record !== 'object' || record === null || Array.isArray(record)) {
        return send(res, 400, { ok: false, error: 'record_must_be_object' });
      }
      await mkdir(dirname(auditFile), { recursive: true });
      try {
        if ((await stat(auditFile)).size > AUDIT_ROTATE_BYTES) {
          await rename(auditFile, rotatedAuditFile(auditFile));
        }
      } catch {
        // no log yet
      }
      const line = JSON.stringify({ receivedAt: new Date().toISOString(), ...record });
      await appendFile(auditFile, `${line}\n`, 'utf8');
      send(res, 200, { ok: true });
    },

    'GET /api/audit': async (_req, res, url) => {
      const file =
        url.searchParams.get('rotated') === '1' ? rotatedAuditFile(auditFile) : auditFile;
      let text = '';
      try {
        text = await readFile(file, 'utf8');
      } catch {
        // no log yet: an empty page
      }
      send(res, 200, {
        ok: true,
        ...pageAuditLines(text, {
          offset: Number(url.searchParams.get('offset') ?? 0),
          limit: Number(url.searchParams.get('limit') ?? AUDIT_PAGE_DEFAULT),
          order: url.searchParams.get('order') === 'asc' ? 'asc' : 'desc',
        }),
      });
    },
  };

  return (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return next();
    const handler = routes[`${req.method ?? 'GET'} ${url.pathname}`];
    if (!handler) return next();
    if (!allowRemote && !isLoopback(req.socket.remoteAddress)) {
      return send(res, 403, {
        ok: false,
        error: 'forbidden',
        message: 'dev api serves loopback only',
      });
    }
    handler(req, res, url).catch((err: unknown) => {
      if (res.writableEnded || res.destroyed) return;
      if (err instanceof HttpError) send(res, err.status, { ok: false, error: err.code });
      else send(res, 500, { ok: false, error: 'internal' });
    });
  };
}
