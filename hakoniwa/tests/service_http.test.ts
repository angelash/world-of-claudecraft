import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizedPath } from '../tools/service/access';
import { startSupervisor } from '../tools/service/supervisor';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'hk-service-'));
  const worker = {
    port: 0,
    starts: 0,
    async start() {
      this.port = 1;
      this.starts++;
    },
    async stop() {
      this.port = 0;
    },
  };
  const service = await startSupervisor(dir, dir, 0, () => worker);
  const address = service.server.address() as { port: number };
  cleanup.push(async () => {
    await service.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${address.port}`;
  const token = readFileSync(join(dir, 'control.token'), 'utf8');
  const post = (action: string, data: object, headers: Record<string, string> = {}) =>
    fetch(url + '/_service/' + action, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, ...headers },
      body: JSON.stringify(data),
    });
  return { dir, worker, service, url, token, post };
}
describe('managed service actual HTTP control', () => {
  it('waits for an in-flight stop on shutdown and never starts an orphan replacement', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hk-service-lifecycle-'));
    let releaseStop: (() => void) | null = null;
    let stopStarted = false;
    const worker = {
      port: 1,
      starts: 0,
      async start() {
        this.starts++;
      },
      async stop() {
        stopStarted = true;
        if (this.port)
          await new Promise<void>((resolve) => {
            releaseStop = resolve;
          });
        this.port = 0;
      },
    };
    const service = await startSupervisor(dir, dir, 0, () => worker);
    const port = (service.server.address() as { port: number }).port;
    await fetch(`http://127.0.0.1:${port}/_service/restart`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + readFileSync(join(dir, 'control.token'), 'utf8'),
        'content-type': 'application/json',
      },
      body: '{}',
    });
    while (!stopStarted) await new Promise((resolve) => setTimeout(resolve, 25));
    let closed = false;
    const close = service.close().then(() => {
      closed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(closed).toBe(false);
    (releaseStop as (() => void) | null)?.();
    await close;
    expect(worker.starts).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });
  it('durably interrupts a request and denies implicit resume from another restart request', async () => {
    const f = await fixture();
    const request = await (await f.post('restart', { reason: 'test' })).json();
    const interrupted = await f.post('interrupt', { requestId: request.requestId });
    expect(interrupted.status).toBe(200);
    expect(JSON.parse(readFileSync(join(f.dir, 'restart.json'), 'utf8')).phase).toBe('paused');
    expect((await (await f.post('restart', { reason: 'next task' })).json()).phase).toBe('paused');
    expect(f.worker.starts).toBe(1);
    expect((await f.post('resume', { requestId: 'old' })).status).toBe(409);
    const resumed = await (await f.post('resume', { requestId: request.requestId })).json();
    expect(resumed.deadline - resumed.updatedAt).toBe(5000);
    await f.post('interrupt', { requestId: request.requestId });
  });
  it('requires a local bearer or local HttpOnly session plus exact same origin for writes', async () => {
    const f = await fixture();
    const pending = await (await f.post('restart', {})).json();
    const status = await fetch(f.url + '/_service/state');
    const text = await status.text();
    expect(text).not.toContain(f.token);
    const cookie = status.headers.get('set-cookie')!.split(';')[0]!;
    const json = JSON.stringify({ requestId: pending.requestId });
    const opts = {
      method: 'POST',
      headers: { cookie, origin: 'https://evil.invalid', 'content-type': 'application/json' },
      body: json,
    };
    expect((await fetch(f.url + '/_service/interrupt', opts)).status).toBe(403);
    opts.headers.origin = f.url;
    expect((await fetch(f.url + '/_service/interrupt', opts)).status).toBe(200);
  });
  it('denies encoded/case-varied private paths and rebinding Hosts', async () => {
    const f = await fixture();
    for (const path of [
      '/.LOCAL/service/control.token',
      '/@fs/F:/foo/%2elOcAl/control.token',
      '/%252elocal/control.token',
      '/.git/config',
    ])
      expect((await fetch(f.url + path)).status).toBe(403);
    const forbiddenHostStatus = await new Promise<number>((resolve) => {
      request(f.url + '/_service/state', { headers: { host: 'evil.invalid' } }, (res) => {
        res.resume();
        resolve(res.statusCode!);
      }).end();
    });
    expect(forbiddenHostStatus).toBe(403);
    expect(normalizedPath('/safe/%2e%2e/%61pi/data')).toBe('/api/data');
  });
  it('refuses an occupied public port before touching state or starting a worker', async () => {
    const f = await fixture();
    const before = readFileSync(join(f.dir, 'restart.json'));
    const address = f.service.server.address() as { port: number };
    await expect(startSupervisor(f.dir, f.dir, address.port, () => f.worker)).rejects.toThrow(
      /EADDRINUSE/,
    );
    expect(readFileSync(join(f.dir, 'restart.json'))).toEqual(before);
    expect(f.worker.starts).toBe(1);
  });
  it('enforces the SSE client cap and reclaims closed streams', async () => {
    const f = await fixture();
    const requests = Array.from({ length: 32 }, () => new AbortController());
    try {
      for (const controller of requests)
        expect(
          (await fetch(f.url + '/_service/events', { signal: controller.signal })).status,
        ).toBe(200);
      expect((await fetch(f.url + '/_service/events')).status).toBe(503);
    } finally {
      for (const controller of requests) controller.abort();
    }
  });
});
