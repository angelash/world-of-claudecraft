// The gateway's logic without the utility process around it (docs/50_tech/release_engineering.md
// 2.1, 2.4; llm_providers.md 7.3, 7.4). It checks every envelope and spec before handing
// execution to the runtime. Credentials stay in the utility process for this run only;
// statuses carry at most the last four characters. Without a runtime it remains a closed
// shell for the isolated IPC fixtures.

import { connectionFingerprint } from '../../src/ai/gateway/guard';
import { parseCallSpec } from '../../src/ai/providers/call_spec';
import type { ConnectionPublic } from '../../src/ai/providers/types';
import { last4 } from '../key_entry/rules';
import { type FromGateway, failedResult, type KeyStatus, parseToGateway } from './protocol';
import type { createGatewayRuntime } from './runtime';

/** The part of a MessagePortMain the core uses. */
export interface PortLike {
  postMessage(message: unknown): void;
  close(): void;
}

/** A saved connection as the envelope guard sees it (llm_providers.md 4.1). */
export interface GatewayConnection
  extends Partial<
    Pick<ConnectionPublic, 'kind' | 'flavor' | 'baseUrl' | 'auth' | 'extraHeaderNames'>
  > {
  id: string;
  enabled: boolean;
}

export interface GatewayCoreOptions {
  /** Saved connections, read only in the utility process. */
  connections?: () => readonly GatewayConnection[];
  runtime?: ReturnType<typeof createGatewayRuntime>;
  /** Async call replies are posted on the parent port, never returned to the game page. */
  emit?: (reply: FromGateway) => void;
}

export interface GatewayCore {
  /** Handle one message from the main process; returns the reply to post back, if any. */
  handle(raw: unknown, ports: readonly PortLike[]): FromGateway | null;
  /** Keys held this run, for log redaction inside the gateway only. */
  heldSecrets(): string[];
  /** Internal utility-process lookup; never exposed through a message or renderer bridge. */
  secretForRequest(
    connectionId: string,
    target: string,
    requestedFingerprint: string,
  ): string | undefined;
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
  const fingerprints = new Map<string, string>();
  const fingerprint = (id: string): string => {
    const conn = connections().find((c) => c.id === id && c.enabled);
    if (!conn?.kind || !conn.baseUrl || !conn.auth || !conn.extraHeaderNames) return '';
    return connectionFingerprint({
      kind: conn.kind,
      flavor: conn.flavor,
      baseUrl: conn.baseUrl,
      auth: conn.auth,
      extraHeaderNames: conn.extraHeaderNames,
    });
  };
  const validSecrets = (id: string, requestedFingerprint: string) => {
    if (opts.runtime) {
      const currentFingerprint = fingerprint(id);
      if (
        !currentFingerprint ||
        requestedFingerprint !== currentFingerprint ||
        fingerprints.get(id) !== currentFingerprint
      ) {
        return undefined;
      }
    }
    return secrets.get(id);
  };

  const status = (connectionId: string): KeyStatus => {
    const key = validSecrets(connectionId, fingerprint(connectionId))?.get('key');
    if (!key) return { state: 'none', backend: 'memory_only' };
    const tail = last4(key);
    return { state: 'session_only', backend: 'memory_only', ...(tail ? { last4: tail } : {}) };
  };

  return {
    heldSecrets: () => [...secrets.values()].flatMap((m) => [...m.values()]),
    secretForRequest: (id, target, requestedFingerprint) =>
      validSecrets(id, requestedFingerprint)?.get(target),

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
        if (opts.runtime) {
          const closable = port as PortLike & {
            on?: (event: 'close', listener: () => void) => void;
          };
          closable.on?.('close', () => opts.runtime?.abort(spec.value.requestId));
          void opts.runtime
            .call(spec.value)
            .then((result) => {
              try {
                answer(port, { t: result.ok ? 'done' : 'error', result });
              } catch {
                /* renderer closed */
              }
            })
            .catch(() => {
              try {
                answer(port, {
                  t: 'error',
                  result: failedResult('network', 'gateway request failed', 'network'),
                });
              } catch {
                /* renderer closed */
              }
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
        case 'suspend':
          opts.runtime?.abortAll();
          return { kind: 'reply', id: msg.id, ok: true, value: null };
        case 'scope':
          return {
            kind: 'reply',
            id: msg.id,
            ok: true,
            value: opts.runtime?.setScope(msg.runId) ?? true,
          };
        case 'abort':
          opts.runtime?.abort(msg.requestId);
          return null;
        case 'secret.put': {
          const fp = fingerprint(msg.connectionId);
          if (opts.runtime && !fp)
            return { kind: 'reply', id: msg.id, ok: false, reason: 'bad_request' };
          if (opts.runtime && fingerprints.get(msg.connectionId) !== fp)
            secrets.delete(msg.connectionId);
          const forConn = secrets.get(msg.connectionId) ?? new Map<string, string>();
          forConn.set(msg.target, msg.secret);
          secrets.set(msg.connectionId, forConn);
          fingerprints.set(msg.connectionId, fp);
          return { kind: 'reply', id: msg.id, ok: true, value: status(msg.connectionId) };
        }
        case 'secret.has':
          return { kind: 'reply', id: msg.id, ok: true, value: status(msg.connectionId) };
        case 'secret.clear':
          opts.runtime?.abortConnection(msg.connectionId);
          secrets.delete(msg.connectionId);
          fingerprints.delete(msg.connectionId);
          return { kind: 'reply', id: msg.id, ok: true, value: status(msg.connectionId) };
        case 'wipe':
          opts.runtime?.abortAll();
          secrets.clear();
          fingerprints.clear();
          return { kind: 'reply', id: msg.id, ok: true, value: null };
        case 'models':
        case 'test':
        case 'ledger':
          if (opts.runtime && opts.emit) {
            const task =
              msg.kind === 'models'
                ? opts.runtime.models(msg.connectionId)
                : msg.kind === 'test'
                  ? opts.runtime.test(msg.connectionId, msg.depth, msg.models)
                  : Promise.resolve(opts.runtime.ledger(msg.window));
            void task
              .then((value) => opts.emit?.({ kind: 'reply', id: msg.id, ok: true, value }))
              .catch(() =>
                opts.emit?.({ kind: 'reply', id: msg.id, ok: false, reason: 'unavailable' }),
              );
            return null;
          }
          return { kind: 'reply', id: msg.id, ok: false, reason: 'not_implemented' };
      }
    },
  };
}
