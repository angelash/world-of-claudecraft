// Development service as a Vite plugin (dev server only, `apply: 'serve'`):
//   GET  /api/llm/status   whether a model is reachable and which model serves each tier
//   POST /api/llm          neutral LlmRequest in, { ok, json, text, usage, model, stopReason, costUsd } out
//   GET  /api/data?file=   read a JSON file under hakoniwa/data/
//   PUT  /api/data?file=   write a JSON file under hakoniwa/data/ (the editor's formatJson:
//                          2-space indent, short values kept on one line, trailing newline)
//   POST /api/audit        append one AI audit record to hakoniwa/.local/audit.jsonl
//   GET  /api/audit        page through that log (?offset=&limit=&order=desc|asc&rotated=1)
// Credentials stay in this process's environment. By default only loopback clients are
// served (set allowRemote or HAKONIWA_DEV_API_REMOTE=1 to open it to the LAN, which also
// lets LAN devices spend the model budget and write data files).
// See docs/50_tech/architecture.md 9 and docs/50_tech/ai_architecture.md 11.1.

import { appendFile, mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { formatJson } from '../src/editor/util/json';
import { resolveDataPath } from './data_paths';
import { LlmService, type LlmServiceOptions, MAX_BODY_BYTES, parseLlmBody } from './llm_proxy';

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

export function createDevApiMiddleware(opts: DevApiOptions = {}): Middleware {
  const root = resolve(opts.root ?? HAKONIWA_ROOT);
  const dataRoot = join(root, 'data');
  const auditFile = join(root, '.local', 'audit.jsonl');
  const allowRemote = opts.allowRemote ?? process.env.HAKONIWA_DEV_API_REMOTE === '1';
  let llm = opts.llmService;
  const llmService = (): LlmService => {
    llm ??= new LlmService(opts.llm);
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
      const parsed = parseLlmBody(await readJsonBody(req, MAX_BODY_BYTES), svc.maxTokensCap);
      if (!parsed.ok)
        return send(res, 400, { ok: false, error: 'bad_request', message: parsed.error });
      const ctrl = new AbortController();
      res.on('close', () => {
        if (!res.writableFinished) ctrl.abort();
      });
      const out = await svc.complete(parsed.value, ctrl.signal);
      if (!res.writableEnded && !res.destroyed) send(res, out.status, out.payload);
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
