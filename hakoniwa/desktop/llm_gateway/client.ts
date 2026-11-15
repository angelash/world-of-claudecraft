// The main process side of the gateway (docs/50_tech/release_engineering.md 2.1, 2.4): starts
// the utility process on first use, numbers each call and matches the reply, forwards a
// checked request together with its port, relays gateway problem pushes, and answers
// `unavailable` when the gateway exits or does not reply in time. A gateway crash never
// takes the window down; the next call starts a fresh gateway.

import {
  type FromGateway,
  type GatewayCallKind,
  type GatewayReason,
  parseFromGateway,
  type ToGateway,
} from './protocol';

/** The parts of an Electron UtilityProcess the client uses. */
export interface UtilityChild {
  postMessage(message: unknown, transfer?: unknown[]): void;
  on(event: 'message', listener: (message: unknown) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
  kill(): boolean;
}

export type GatewayReply = { ok: true; value: unknown } | { ok: false; reason: GatewayReason };

type CallBody<K extends GatewayCallKind> = Omit<Extract<ToGateway, { kind: K }>, 'id' | 'kind'>;

export interface GatewayClient {
  call<K extends GatewayCallKind>(kind: K, body: CallBody<K>): Promise<GatewayReply>;
  /** Forward a request the main guard already checked, with the renderer's port. */
  forward(spec: unknown, port: unknown): void;
  abort(requestId: string): void;
  dispose(): void;
}

export interface GatewayClientOptions {
  spawn: () => UtilityChild;
  onProblem?: (push: Extract<FromGateway, { kind: 'problem' }>) => void;
  log?: (message: string) => void;
  timeoutMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export const GATEWAY_CALL_TIMEOUT_MS = 10_000;

export function createGatewayClient(opts: GatewayClientOptions): GatewayClient {
  const timeoutMs = opts.timeoutMs ?? GATEWAY_CALL_TIMEOUT_MS;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const pending = new Map<number, { resolve: (r: GatewayReply) => void; timer: unknown }>();
  let child: UtilityChild | null = null;
  let nextId = 1;

  const settle = (id: number, reply: GatewayReply) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimer(p.timer);
    p.resolve(reply);
  };

  const ensure = (): UtilityChild => {
    if (child) return child;
    const c = opts.spawn();
    child = c;
    c.on('message', (raw: unknown) => {
      const msg = parseFromGateway(raw);
      if (!msg) {
        opts.log?.('gateway sent a malformed message');
        return;
      }
      if (msg.kind === 'reply') {
        settle(msg.id, msg.ok ? { ok: true, value: msg.value } : { ok: false, reason: msg.reason });
      } else {
        opts.onProblem?.(msg);
      }
    });
    c.on('exit', (code: number) => {
      if (child === c) child = null;
      opts.log?.(`gateway exited with code ${code}`);
      for (const id of [...pending.keys()]) settle(id, { ok: false, reason: 'unavailable' });
    });
    return c;
  };

  return {
    call(kind, body) {
      const id = nextId++;
      return new Promise<GatewayReply>((resolve) => {
        const timer = setTimer(() => settle(id, { ok: false, reason: 'unavailable' }), timeoutMs);
        pending.set(id, { resolve, timer });
        try {
          ensure().postMessage({ ...body, kind, id });
        } catch {
          settle(id, { ok: false, reason: 'unavailable' });
        }
      });
    },
    forward(spec, port) {
      ensure().postMessage({ kind: 'request', spec }, [port]);
    },
    abort(requestId) {
      if (child) child.postMessage({ kind: 'abort', requestId });
    },
    dispose() {
      const c = child;
      child = null;
      for (const id of [...pending.keys()]) settle(id, { ok: false, reason: 'unavailable' });
      c?.kill();
    },
  };
}
