// FakeKeystore (docs/50_tech/llm_providers.md 6.1, 16.1): the key store a desktop gateway
// test runs against. Three modes: 'available' (saved like the OS keychain, kept across a
// restart), 'memory_only' (session only, keychain_unavailable), 'write_fail' (nothing is
// kept). The game side only ever sees KeyStatus (at most the last four characters); read()
// is the gateway's single-request access. Pure.

import type { KeyStatus } from '../llm_config/settings';
import { keychainProblem } from '../providers/problems';

export type KeystoreMode = 'available' | 'memory_only' | 'write_fail';

interface Stored {
  secrets: Map<string, string>;
  savedAt: string;
  sessionOnly: boolean;
}

export class FakeKeystore {
  private readonly store = new Map<string, Stored>();

  constructor(
    public mode: KeystoreMode = 'available',
    private readonly nowIso: () => string = () => '2026-11-16T00:00:00.000Z',
  ) {}

  private backend(): KeyStatus['backend'] {
    return this.mode === 'available' ? 'os_keychain' : 'memory_only';
  }

  /** The problem the store raises for the settings page (keychain_unavailable or none). */
  problem(): 'keychain_unavailable' | undefined {
    return keychainProblem(this.backend());
  }

  /** Save the key (target 'key') or an extra header value ('header:<name>'). */
  put(
    connectionId: string,
    target: string,
    secret: string,
  ): { ok: true; status: KeyStatus } | { ok: false; error: 'write_failed' } {
    if (this.mode === 'write_fail') return { ok: false, error: 'write_failed' };
    const s = this.store.get(connectionId) ?? {
      secrets: new Map<string, string>(),
      savedAt: this.nowIso(),
      sessionOnly: this.mode === 'memory_only',
    };
    s.secrets.set(target, secret);
    s.savedAt = this.nowIso();
    s.sessionOnly = this.mode === 'memory_only';
    this.store.set(connectionId, s);
    return { ok: true, status: this.has(connectionId) };
  }

  has(connectionId: string): KeyStatus {
    const s = this.store.get(connectionId);
    const key = s?.secrets.get('key');
    if (!s || key === undefined) return { state: 'none', backend: this.backend() };
    return {
      state: s.sessionOnly ? 'session_only' : 'saved',
      last4: key.slice(-4),
      savedAt: s.savedAt,
      backend: this.backend(),
    };
  }

  clear(connectionId: string): KeyStatus {
    this.store.delete(connectionId);
    return this.has(connectionId);
  }

  /** Gateway side: the secret for one request, never handed to the game. */
  read(connectionId: string, target = 'key'): string | undefined {
    return this.store.get(connectionId)?.secrets.get(target);
  }

  /** A restart of the app: session-only keys are gone, keychain keys stay. */
  restart(): void {
    for (const [id, s] of this.store) if (s.sessionOnly) this.store.delete(id);
  }
}
