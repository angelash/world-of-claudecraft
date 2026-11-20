import type { IncomingMessage } from 'node:http';
import { networkInterfaces } from 'node:os';

export function localAddress(address = ''): boolean {
  return address === '::1' || /^127\./.test(address) || /^::ffff:127\./.test(address);
}
export function allowedHosts(port: number): Set<string> {
  const names = ['localhost', '127.0.0.1', '[::1]'];
  for (const list of Object.values(networkInterfaces()))
    for (const n of list ?? []) if (n.family === 'IPv4') names.push(n.address);
  return new Set(names.map((host) => `${host}:${port}`));
}
export function normalizedPath(raw: string): string {
  let path = new URL(raw, 'http://local').pathname;
  for (let i = 0; i < 3; i++) {
    const decoded = decodeURIComponent(path);
    if (decoded === path) break;
    path = decoded;
  }
  return new URL(path.replaceAll('\\', '/'), 'http://local').pathname;
}
export function sameOrigin(req: IncomingMessage): boolean {
  return (
    req.headers.origin === `http://${req.headers.host}` &&
    (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin')
  );
}
