import { describe, expect, it } from 'vitest';
import { clearChangedRouteConsent } from '../src/ai/llm_config/route_consent';
import { defaultSettings } from '../src/ai/llm_config/settings';
import { LlmSettingsController } from '../src/client/windows/llm/controller';
import { createMemoryHost } from '../src/platform/memory_host';
import { compatConn, localConn } from './fixtures/llm_config/fixtures';

describe('platform-backed model settings', () => {
  it('drops old consent and key metadata on endpoint edits even when an IPC patch tries to retain them', () => {
    const before = defaultSettings();
    const connection = compatConn('conn_approved');
    before.connections = [connection];
    before.consentedConnectionIds = ['conn_approved'];
    const next = {
      ...before,
      connections: [{ ...connection, baseUrl: 'https://another.example.invalid/v1' }],
    };
    const edited = clearChangedRouteConsent(before, next);
    expect(edited.consentedConnectionIds).toEqual([]);
    expect(edited.connections[0]?.keyState).toBe('none');
    expect(
      clearChangedRouteConsent(before, {
        ...before,
        connections: [{ ...connection, models: [] }],
      }).consentedConnectionIds,
    ).toEqual(['conn_approved']);
  });
  it('adds a connection without enabling it, isolates key entry, then explicitly enables a capped and consented model', async () => {
    const host = createMemoryHost();
    await host.settings.set('local', { quality: 'low' });
    const c = new LlmSettingsController(host);
    await c.load();
    await c.connection({ ...compatConn('fixture_cloud'), keyState: 'none' });
    expect(c.settings.preset).toBe('off');
    await c.enterKey('fixture_cloud');
    expect(c.settings.connections[0]?.keyState).toBe('session_only');
    await expect(
      c.use('fixture_cloud', 'chat-large', { hour: {}, day: {}, displayCurrency: 'USD' }, false),
    ).rejects.toThrow('consent');
    await c.use(
      'fixture_cloud',
      'chat-large',
      { hour: { tokens: 10000 }, day: { tokens: 100000 }, displayCurrency: 'USD' },
      true,
    );
    expect(c.settings.slots.mid?.model).toBe('chat-large');
    expect(c.settings.consentedConnectionIds).toEqual(['fixture_cloud']);
    const persisted = await host.settings.get('local');
    expect(persisted.ok && persisted.value?.quality).toBe('low');
    expect(JSON.stringify(persisted)).not.toMatch(/secret|password|credential/);
    await c.remove('fixture_cloud');
    expect(c.settings.connections).toEqual([]);
    expect(c.settings.slots).toEqual({});
  });

  it('keeps newer settings read-only and permits a local model without cloud consent', async () => {
    const host = createMemoryHost();
    const c = new LlmSettingsController(host);
    await c.load();
    await c.connection(localConn());
    await c.use('conn_local', 'qwen3:14b', { hour: {}, day: {}, displayCurrency: 'USD' }, false);
    expect(c.settings.preset).toBe('single');
    await c.off();
    expect(c.settings.preset).toBe('off');
    await host.settings.set('local', { llm: { version: 999 } });
    await c.load();
    await expect(c.off()).rejects.toThrow('read_only');
  });
});
