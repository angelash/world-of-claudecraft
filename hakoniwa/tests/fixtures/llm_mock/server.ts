// The local mock model service as a real HTTP server on loopback (release_engineering.md
// 10.8): wraps the pure handler of src/ai/mocks/mock_service.ts so end-to-end runs (desktop
// gateway, web demo local transport, dev proxy) can talk to "Anthropic" and an "OpenAI
// compatible" service without a network or a key. Streams are written event by event.

import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createMockService,
  type MockService,
  type MockServiceOptions,
} from '../../../src/ai/mocks/mock_service';

export interface MockLlmServer {
  /** Base address, for example http://127.0.0.1:53211 (Anthropic) or .../v1 (compatible). */
  url: string;
  service: MockService;
  close(): Promise<void>;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    req.on('data', (c: Buffer) => parts.push(c));
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}

export async function startMockLlmServer(opts: MockServiceOptions = {}): Promise<MockLlmServer> {
  const service = createMockService(opts);
  const server = createServer((req, res) => {
    readBody(req)
      .then((body) => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers[k.toLowerCase()] = v;
        }
        const out = service.handle({
          method: req.method ?? 'GET',
          path: req.url ?? '/',
          headers,
          body,
        });
        res.writeHead(out.status, out.headers);
        for (const chunk of out.chunks) res.write(chunk);
        res.end();
      })
      .catch(() => {
        res.writeHead(500);
        res.end();
      });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    service,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
