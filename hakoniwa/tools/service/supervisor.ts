import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  request as proxyRequest,
  type ServerResponse,
} from 'node:http';
import { join } from 'node:path';
import { allowedHosts, localAddress, normalizedPath, sameOrigin } from './access';
import {
  beginRestart,
  finishRestart,
  interruptRestart,
  type RestartState,
  requestRestart,
  resumeRestart,
} from './restart_state';
import { serviceStore } from './store';
import { WorkerHost } from './worker_host';

export const MAX_EVENT_CLIENTS = 32;
const MAX_BUFFERED_BYTES = 64 * 1024;
const MAX_SESSIONS = 64;
function send(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}
function equal(a: string, b: string): boolean {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > 4096) throw new Error('Request body too large');
  }
  const value: unknown = JSON.parse(data || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid request');
  return value as Record<string, unknown>;
}
interface ManagedWorker {
  port: number;
  start(): Promise<void>;
  stop(): Promise<void>;
}
export async function startSupervisor(
  root: string,
  stateDir = join(root, '.local/service'),
  port = 5180,
  workerFactory = (exited: () => void): ManagedWorker => new WorkerHost(root, stateDir, exited),
) {
  let store: ReturnType<typeof serviceStore>;
  let state: RestartState;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let operation: Promise<void> | null = null;
  let busy = false,
    closing = false,
    startup = true;
  const bootId = randomUUID();
  let hosts = allowedHosts(port);
  const clients = new Set<ServerResponse>();
  const sessions = new Map<string, number>();
  const worker = workerFactory(() => {
    if (!closing && !busy && !startup) {
      // An unplanned crash is announced through the same five-second, interruptible path.
      commit(requestRestart(state, 'worker exited', randomUUID(), Date.now()));
    }
  });
  const view = () => ({ ...state, bootId, workerReady: worker.port > 0, serverTime: Date.now() });
  const frame = () => `data: ${JSON.stringify(view())}\n\n`;
  const write = (res: ServerResponse, text: string) => {
    if (res.destroyed || res.writableLength > MAX_BUFFERED_BYTES || !res.write(text)) {
      clients.delete(res);
      res.destroy();
    }
  };
  const broadcast = () => {
    const text = frame();
    for (const res of clients) write(res, text);
  };
  function commit(next: RestartState) {
    if (next === state) return;
    // Durable before acknowledging interruption, notifying browsers or opening a new timer.
    store.save(next);
    state = next;
    if (timer) clearTimeout(timer);
    timer = null;
    broadcast();
    if (state.phase === 'countdown')
      timer = setTimeout(
        () => {
          operation = restart().finally(() => {
            operation = null;
          });
        },
        Math.max(0, state.deadline! - Date.now()),
      );
  }
  async function restart() {
    const next = beginRestart(state, Date.now());
    if (next === state || busy || closing) return;
    busy = true;
    try {
      commit(next);
      await worker.stop();
      if (closing) return;
      await worker.start();
      if (closing) {
        await worker.stop();
        return;
      }
      commit(finishRestart(state, true, Date.now()));
    } catch (err) {
      console.error('[service] restart failed', err);
      commit(finishRestart(state, false, Date.now()));
    } finally {
      busy = false;
    }
  }
  function browserAuthorized(req: IncomingMessage) {
    const token = /(?:^|;\s*)hk_service=([a-f0-9]+)/.exec(req.headers.cookie ?? '')?.[1];
    return (
      localAddress(req.socket.remoteAddress) &&
      !!token &&
      (sessions.get(token) ?? 0) > Date.now() &&
      sameOrigin(req)
    );
  }
  async function handle(req: IncomingMessage, res: ServerResponse) {
    if (!hosts.has(req.headers.host ?? '')) return send(res, 403, { error: 'invalid_host' });
    let path: string;
    try {
      path = normalizedPath(req.url ?? '/');
    } catch {
      return send(res, 400, { error: 'invalid_path' });
    }
    if (path.split('/').some((p) => ['.local', '.git'].includes(p.toLowerCase())))
      return send(res, 403, { error: 'private_path' });
    if (path.startsWith('/_service/')) {
      if (req.method === 'GET' && path === '/_service/state') {
        const old = /(?:^|;\s*)hk_service=([a-f0-9]+)/.exec(req.headers.cookie ?? '')?.[1];
        if (
          localAddress(req.socket.remoteAddress) &&
          (!old || (sessions.get(old) ?? 0) <= Date.now())
        ) {
          for (const [key, expiry] of sessions) if (expiry <= Date.now()) sessions.delete(key);
          if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value!);
          const token = randomBytes(24).toString('hex');
          sessions.set(token, Date.now() + 24 * 60 * 60 * 1000);
          res.setHeader(
            'set-cookie',
            `hk_service=${token}; HttpOnly; SameSite=Strict; Path=/_service/`,
          );
        }
        return send(res, 200, view());
      }
      if (req.method === 'GET' && path === '/_service/events') {
        if (clients.size >= MAX_EVENT_CLIENTS) return send(res, 503, { error: 'client_limit' });
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        });
        clients.add(res);
        res.on('close', () => clients.delete(res));
        res.on('error', () => clients.delete(res));
        write(res, frame());
        return;
      }
      if (
        req.method !== 'POST' ||
        !['/_service/restart', '/_service/interrupt', '/_service/resume'].includes(path)
      )
        return send(res, 404, { error: 'not_found' });
      const cli =
        localAddress(req.socket.remoteAddress) &&
        equal(req.headers.authorization ?? '', `Bearer ${store.token}`);
      if ((!cli && !browserAuthorized(req)) || (path === '/_service/restart' && !cli))
        return send(res, 403, { error: 'unauthorized' });
      if (!req.headers['content-type']?.startsWith('application/json'))
        return send(res, 415, { error: 'json_required' });
      const data = await body(req);
      if (path === '/_service/restart') {
        const reason = typeof data.reason === 'string' ? data.reason : 'project logic updated';
        commit(requestRestart(state, reason, randomUUID(), Date.now()));
      } else {
        if (typeof data.requestId !== 'string' || data.requestId !== state.requestId)
          return send(res, 409, { error: 'stale_request' });
        const next =
          path === '/_service/interrupt'
            ? interruptRestart(state, data.requestId, Date.now())
            : resumeRestart(state, data.requestId, Date.now());
        if (next === state) return send(res, 409, { error: 'invalid_phase', ...view() });
        commit(next);
      }
      return send(res, 200, view());
    }
    // Preserve the existing dev API's loopback boundary across the loopback proxy hop.
    if (path.toLowerCase().startsWith('/api/') || path.toLowerCase() === '/api') {
      if (!localAddress(req.socket.remoteAddress))
        return send(res, 403, { error: 'local_api_only' });
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? '') &&
        req.headers.origin &&
        !sameOrigin(req)
      )
        return send(res, 403, { error: 'cross_origin' });
    }
    if (!worker.port) {
      res.setHeader('retry-after', '2');
      return send(res, 503, { error: 'worker_unavailable' });
    }
    const headers = { ...req.headers };
    delete headers.forwarded;
    for (const key of Object.keys(headers)) if (key.startsWith('x-forwarded-')) delete headers[key];
    const upstream = proxyRequest(
      { host: '127.0.0.1', port: worker.port, path: req.url, method: req.method, headers },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) send(res, 502, { error: 'worker_disconnected' });
      else res.destroy();
    });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => {
      if (!res.writableEnded) upstream.destroy();
    });
    req.pipe(upstream);
  }
  const server = createServer((req, res) => {
    void handle(req, res).catch((err) => {
      console.error('[service] request failed', err);
      if (!res.headersSent) send(res, 400, { error: 'invalid_request' });
      else res.destroy();
    });
  });
  server.maxConnections = 128;
  server.headersTimeout = 10000;
  server.requestTimeout = 60000;
  // Claim the fixed public port before starting anything; never kill an existing listener.
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (typeof address === 'object' && address) hosts = allowedHosts(address.port);
  try {
    store = serviceStore(stateDir);
    state = store.state;
    store.save(state);
    await worker.start();
  } catch (err) {
    server.close();
    throw err;
  }
  startup = false;
  const heartbeat = setInterval(() => {
    for (const res of clients) write(res, ': heartbeat\n\n');
  }, 15000);
  console.log(`[service] ready on :${port}, supervisor ${process.pid}, worker ${worker.port}`);
  return {
    server,
    state: view,
    async close() {
      closing = true;
      if (timer) clearTimeout(timer);
      clearInterval(heartbeat);
      for (const res of clients) res.end();
      if (operation) await operation;
      await worker.stop();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
