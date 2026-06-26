import { existsSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { newDb } from 'pg-mem';

const require = createRequire(import.meta.url);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(scriptsDir, '..');

function queryResult(command = 'SELECT', rowCount = 0, rows = []) {
  return { command, rowCount, oid: 0, rows, fields: [] };
}

function sanitizeSql(sql) {
  return sql
    .replace(/DO\s+\$\$[\s\S]*?END\s+\$\$;?/gi, '')
    .replace(/\s+text_pattern_ops\b/gi, '')
    .replace(/\s+AND\s+lower\(username\)\s+~\s+\('\^'\s+\|\|\s+\$2\s+\|\|\s+'\[0-9\]\+\$'\)/gi, '')
    .trim();
}

function specialQueryResult(sql) {
  if (/^\s*select\s+pg_advisory_xact_lock\s*\(/i.test(sql)) {
    return queryResult('SELECT', 1, [{}]);
  }
  if (
    /^\s*update\s+play_sessions\s+ps\s+set\s+ended_at\s*=\s*ps\.started_at/iu.test(sql)
  ) {
    return queryResult('UPDATE', 0, []);
  }
  return null;
}

function respondQuery(result, values, callback) {
  if (typeof values === 'function') {
    values(null, result);
    return undefined;
  }
  if (typeof callback === 'function') {
    callback(null, result);
    return undefined;
  }
  return Promise.resolve(result);
}

function patchPgClass(Base) {
  return class extends Base {
    query(text, values, callback) {
      const sql =
        typeof text === 'string'
          ? text
          : text && typeof text.text === 'string'
            ? text.text
            : '';
      const direct = sql ? specialQueryResult(sql) : null;
      if (direct) return respondQuery(direct, values, callback);
      if (!sql) return super.query(text, values, callback);

      const sanitized = sanitizeSql(sql);
      if (!sanitized) {
        return respondQuery(queryResult('NOOP', 0, []), values, callback);
      }
      const sanitizedDirect = specialQueryResult(sanitized);
      if (sanitizedDirect) return respondQuery(sanitizedDirect, values, callback);

      let nextText = text;
      if (sanitized !== sql) {
        nextText =
          typeof text === 'string'
            ? sanitized
            : {
                ...text,
                text: sanitized,
              };
      }
      return super.query(nextText, values, callback);
    }
  };
}

export function createAmbientBotPgMemShim() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = db.adapters.createPg();
  const pgShim = {
    ...adapter,
    Pool: patchPgClass(adapter.Pool),
    Client: patchPgClass(adapter.Client),
  };
  return { db, pgShim };
}

export function installPgShim(pgShim) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'pg') return pgShim;
    return originalLoad.call(this, request, parent, isMain);
  };
  return () => {
    Module._load = originalLoad;
  };
}

export async function buildAmbientBotServerBundle() {
  const privateImpl = path.join(REPO_ROOT, 'private', 'bot_detector', 'src', 'index.ts');
  const stubImpl = path.join(REPO_ROOT, 'server', 'bot_detector', 'stub.ts');
  const tempDir = mkdtempSync(path.join(tmpdir(), 'woc-ambient-pgmem-'));
  const outfile = path.join(tempDir, 'server.cjs');
  await esbuild.build({
    entryPoints: [path.join(REPO_ROOT, 'server/main.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['pg', 'pg-native', 'bufferutil', 'utf-8-validate'],
    alias: {
      '#bot-detector': existsSync(privateImpl) ? privateImpl : stubImpl,
    },
    outfile,
  });
  return outfile;
}

export async function api(baseUrl, route, opts = {}, token = null) {
  const res = await fetch(baseUrl + route, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

export async function waitForServerStatus(baseUrl, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const status = await api(baseUrl, '/api/status');
      if (status.status === 200 && status.body.ok) return status.body;
      lastError = new Error(`status returned ${status.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError ?? new Error('timed out waiting for /api/status');
}

export async function ensureAdminAccount({ baseUrl, pgShim, username, password }) {
  const registered = await api(baseUrl, '/api/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (registered.status !== 200 && registered.status !== 409) {
    throw new Error(
      `admin bootstrap register failed: status=${registered.status} error=${registered.body.error ?? 'unknown'}`,
    );
  }

  const pool = new pgShim.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const updated = await pool.query(
      'UPDATE accounts SET is_admin = TRUE WHERE username = $1 RETURNING id',
      [username],
    );
    if ((updated.rowCount ?? 0) < 1) {
      throw new Error(`admin bootstrap could not promote "${username}"`);
    }
  } finally {
    await pool.end();
  }

  const login = await api(baseUrl, '/admin/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (login.status !== 200 || !login.body.success || !login.body.data?.token) {
    throw new Error(
      `admin bootstrap login failed: status=${login.status} error=${login.body.error ?? 'unknown'}`,
    );
  }
  return login.body.data.token;
}

export function requireBuiltBundle(bundlePath) {
  return require(bundlePath);
}
