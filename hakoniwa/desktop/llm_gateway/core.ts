// The gateway's logic without the utility process around it (docs/50_tech/release_engineering.md
// 2.1, 2.4; llm_providers.md 7.3, 7.4). This is the skeleton: it runs the second guard
// level on every request (envelope, spec shape again, duplicate request ids, connection
// known and enabled) and answers on the request's port, keeps keys entered this run in
// memory only (the memory_only backend of 2.5), and refuses what the full gateway adds
// later (PK-M1-01): provider adapters from src/ai/providers, the guard items 4 to 6 and the
// spend book from src/ai/gateway, safeStorage, the ledger. No key ever leaves this module:
// replies carry at most the last four characters.

import { parseCallSpec } from '../../src/ai/providers/call_spec';
import { last4 } from '../key_entry/rules';
import { type FromGateway, failedResult, type KeyStatus, parseToGateway } from './protocol';

/** The part of a MessagePortMain the core uses. */
export interface PortLike {
  postMessage(message: unknown): void;
  close(): void;
}

/** A saved connection as the gateway sees it (llm_providers.md 4.1; settings come later). */
export interface GatewayConnection {
  id: string;
  enabled: boolean;
}

export interface GatewayCoreOptions {
  /** Saved connections; empty until the settings store (PK-M0-20) and PK-M1-01 land. */
  connections?: () => readonly GatewayConnection[];
}

export interface GatewayCore {
  /** Handle one message from the main process; returns the reply to post back, if any. */
  handle(raw: unknown, ports: readonly PortLike[]): FromGateway | null;
  /** Keys held this run, for log redaction inside the gateway only. */
  heldSecrets(): string[];
}

const SHELL_NOTE = 'gateway shell: provider adapters arrive with PK-M1-01';

function answer(port: PortLike, message: unknown): void {
  try {
    port.postMessage(message);
  } finally {
    port.close();
  }
}

export function createGatewayCore(opts: GatewayCoreOptions = {}): GatewayCore {
  const connections = opts.connections ?? (() => []);
  /** connectionId to target (`key` or `header:<name>`) to secret; memory only. */
  const secrets = new Map<string, Map<string, string>>();

  const status = (connectionId: string): KeyStatus => {
    const key = secrets.get(connectionId)?.get('key');
    if (!key) return { state: 'none', backend: 'memory_only' };
    const tail = last4(key);
    return { state: 'session_only', backend: 'memory_only', ...(tail ? { last4: tail } : {}) };
  };

  return {
    heldSecrets: () => [...secrets.values()].flatMap((m) => [...m.values()]),

    handle(raw, ports) {
      const parsed = parseToGateway(raw);
      if (!parsed.ok) {
        // Refuse; a port that came with a bad envelope gets a defect answer and is closed.
        for (const p of ports)
          answer(p, { t: 'error', result: failedResult('bad_request', 'bad envelope') });
        const id = (raw as { id?: unknown } | null)?.id;
        return typeof id === 'number' && Number.isInteger(id) && id > 0
          ? { kind: 'reply', id, ok: false, reason: 'bad_request' }
          : null;
      }
      const msg = parsed.msg;
      if (msg.kind === 'request') {
        if (ports.length !== 1) {
          for (const p of ports) p.close();
          return null;
        }
        const port = ports[0] as PortLike;
        const spec = parseCallSpec(msg.spec);
        if (!spec.ok) {
          answer(port, { t: 'error', result: failedResult('bad_request', spec.error) });
          return null;
        }
        const conn = connections().find((c) => c.id === spec.value.connectionId);
        if (!conn?.enabled) {
          answer(port, {
            t: 'error',
            result: failedResult('bad_request', 'connection not configured', 'not_configured'),
          });
          return null;
        }
        answer(port, {
          t: 'error',
          result: failedResult('bad_request', SHELL_NOTE, 'not_configured'),
        });
        return null;
      }
      for (const p of ports) p.close();
      switch (msg.kind) {
        case 'abort':
          // Nothing stays in flight in the shell: every request is answered at once.
          return null;
        case 'secret.put': {
          const forConn = secrets.get(msg.connectionId) ?? new Map<string, string>();
          forConn.set(msg.target, msg.secret);
          secrets.set(msg.connectionId, forConn);
          return { kind: 'reply', id: msg.id, ok: true, value: status(msg.connectionId) };
        }
        case 'secret.has':
          return { kind: 'reply', id: msg.id, ok: true, value: status(msg.connectionId) };
        case 'secret.clear':
          secrets.delete(msg.connectionId);
          return { kind: 'reply', id: msg.id, ok: true, value: status(msg.connectionId) };
        case 'wipe':
          secrets.clear();
          return { kind: 'reply', id: msg.id, ok: true, value: null };
        case 'models':
        case 'test':
        case 'ledger':
          return { kind: 'reply', id: msg.id, ok: false, reason: 'not_implemented' };
      }
    },
  };
}
