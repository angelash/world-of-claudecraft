// Model settings operations over PlatformHost. The controller never accepts a credential.

import { applyPreset } from '../../../ai/llm_config/presets';
import {
  defaultSettings,
  type LlmSettings,
  validateSettings,
} from '../../../ai/llm_config/settings';
import type { ConnectionPublic } from '../../../ai/providers/types';
import type { PlatformHost } from '../../../platform';

export class LlmSettingsController {
  private local: Record<string, unknown> = {};
  settings: LlmSettings = defaultSettings();
  readOnly = false;

  constructor(
    private readonly host: PlatformHost,
    private readonly changed?: () => void,
  ) {}

  async load(): Promise<void> {
    const result = await this.host.settings.get('local');
    if (!result.ok) {
      this.readOnly = true;
      throw new Error('unavailable');
    }
    this.local = result.value ?? {};
    const raw = this.local.llm as { version?: unknown } | undefined;
    this.readOnly = typeof raw?.version === 'number' && raw.version > 1;
    this.settings = validateSettings(raw, { web: this.host.kind === 'web' }).settings;
    if (this.host.llm.route === 'gateway') {
      for (const connection of this.settings.connections) {
        const result = await this.host.llm.gateway.secretHas({ connectionId: connection.id });
        if (!result.ok) continue;
        connection.keyState = result.value.state;
        connection.keyLast4 = result.value.last4;
      }
    }
  }

  async save(next: LlmSettings): Promise<void> {
    if (this.readOnly) throw new Error('read_only');
    const checked = validateSettings(next, { web: this.host.kind === 'web' });
    if (!checked.ok) throw new Error('bad_settings');
    // Re-read before updating so unrelated graphics, accessibility and window settings survive.
    const current = await this.host.settings.get('local');
    if (!current.ok) throw new Error('unavailable');
    const result = await this.host.settings.set('local', {
      ...(current.value ?? {}),
      llm: checked.settings,
    });
    if (!result.ok) throw new Error('save_failed');
    this.local = result.value;
    this.settings = validateSettings(result.value.llm, { web: this.host.kind === 'web' }).settings;
    this.changed?.();
  }

  async connection(connection: ConnectionPublic): Promise<void> {
    const next = {
      ...this.settings,
      connections: [...this.settings.connections.filter((c) => c.id !== connection.id), connection],
    };
    await this.save(next);
  }

  async remove(connectionId: string): Promise<void> {
    if (this.host.llm.route === 'gateway') {
      const removed = await this.host.llm.gateway.secretClear({ connectionId });
      if (!removed.ok) throw new Error('clear_failed');
    }
    const slots = { ...this.settings.slots };
    for (const slot of ['top', 'mid', 'low'] as const)
      if (slots[slot]?.connectionId === connectionId) delete slots[slot];
    await this.save({
      ...this.settings,
      slots,
      connections: this.settings.connections.filter((c) => c.id !== connectionId),
      consentedConnectionIds: this.settings.consentedConnectionIds.filter(
        (id) => id !== connectionId,
      ),
    });
  }

  async enterKey(connectionId: string): Promise<void> {
    if (this.host.llm.route !== 'gateway') throw new Error('desktop_only');
    const reply = await this.host.llm.gateway.secretEnter({ connectionId });
    if (!reply.ok) throw new Error('key_failed');
    const conn = this.settings.connections.find((c) => c.id === connectionId);
    if (!conn) throw new Error('unknown_connection');
    await this.connection({ ...conn, keyState: reply.value.state, keyLast4: reply.value.last4 });
  }

  async clearKey(connectionId: string): Promise<void> {
    if (this.host.llm.route !== 'gateway') throw new Error('desktop_only');
    const reply = await this.host.llm.gateway.secretClear({ connectionId });
    if (!reply.ok) throw new Error('clear_failed');
    const conn = this.settings.connections.find((c) => c.id === connectionId);
    if (conn) await this.connection({ ...conn, keyState: 'none', keyLast4: undefined });
  }

  async use(
    connectionId: string,
    model: string,
    caps: LlmSettings['caps'],
    consent: boolean,
  ): Promise<void> {
    const conn = this.settings.connections.find((c) => c.id === connectionId);
    if (!conn) throw new Error('unknown_connection');
    if (conn.kind !== 'local' && !consent) throw new Error('consent_required');
    const base = {
      ...this.settings,
      caps,
      consentedConnectionIds: consent
        ? [...new Set([...this.settings.consentedConnectionIds, connectionId])]
        : this.settings.consentedConnectionIds,
    };
    await this.save(applyPreset(base, { preset: 'single', connectionId, model }));
  }

  async off(): Promise<void> {
    await this.save(applyPreset(this.settings, { preset: 'off' }));
  }

  async test(connectionId: string): Promise<unknown> {
    if (this.host.llm.route !== 'gateway') throw new Error('desktop_only');
    const r = await this.host.llm.gateway.test({ connectionId, depth: 'quick' });
    if (!r.ok) throw new Error('test_failed');
    return r.value;
  }

  async ledger(): Promise<unknown> {
    if (this.host.llm.route !== 'gateway') throw new Error('desktop_only');
    const r = await this.host.llm.gateway.ledger({ window: 'hour' });
    if (!r.ok) throw new Error('ledger_failed');
    return r.value;
  }
}
