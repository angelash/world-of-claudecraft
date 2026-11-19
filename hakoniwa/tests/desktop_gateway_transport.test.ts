import { describe, expect, it } from 'vitest';
import { createGatewayCore } from '../desktop/llm_gateway/core';
import { createNetSender } from '../desktop/llm_gateway/net_send';
import { createGatewayRuntime } from '../desktop/llm_gateway/runtime';
import { connectionFingerprint } from '../src/ai/gateway/guard';
import { defaultSettings } from '../src/ai/llm_config/settings';
import { profileFor } from '../src/ai/providers/capabilities';
import { simpleSpec } from './fixtures/llm/specs';
import { anthropicConn, compatConn, localConn } from './fixtures/llm_config/fixtures';

describe('utility message and network boundaries', () => {
  it('runs the real adapter through an actual checked message port and delivers one receipt', async () => {
    const s = defaultSettings();
    s.preset = 'custom';
    s.connections = [localConn('conn_local', ['qwen3:14b'])];
    const runtime = createGatewayRuntime({
      settings: () => s,
      secret: () => undefined,
      send: async () => ({
        status: 200,
        body: JSON.stringify({
          model: 'qwen3:14b',
          message: { content: '{"commands":[]}' },
          done: true,
          prompt_eval_count: 1,
          eval_count: 3,
        }),
        headers: {},
        latencyMs: 1,
      }),
    });
    const core = createGatewayCore({
      connections: () => [{ id: 'conn_local', enabled: true }],
      runtime,
    });
    const answer = await new Promise<unknown>((resolve) => {
      const reply = core.handle(
        {
          kind: 'request',
          spec: simpleSpec({ provider: 'local', connectionId: 'conn_local', model: 'qwen3:14b' }),
        },
        [{ postMessage: resolve, close() {} }],
      );
      expect(reply).toBeNull();
    });
    expect(answer).toMatchObject({ t: 'done', result: { ok: true, json: { commands: [] } } });
    expect(
      core.handle(
        {
          kind: 'secret.put',
          id: 3,
          connectionId: 'conn_local',
          target: 'key',
          secret: 'contains spaces',
        },
        [],
      ),
    ).toMatchObject({ ok: false });
  });

  it('does not follow redirects, omits browser credentials and bounds the response bytes', async () => {
    let init: RequestInit | undefined;
    const send = createNetSender(async (_url, options) => {
      init = options;
      return new Response('fixture');
    });
    expect(
      (
        await send(
          {
            method: 'POST',
            url: 'https://provider.example.invalid',
            headers: {},
            body: '{}',
            read: 'json',
          },
          new AbortController().signal,
        )
      ).body,
    ).toBe('fixture');
    expect(init).toMatchObject({ redirect: 'error', credentials: 'omit' });
    const oversized = createNetSender(
      async () => new Response(new Uint8Array(4 * 1024 * 1024 + 1)),
    );
    await expect(
      oversized(
        { method: 'GET', url: 'https://provider.example.invalid', headers: {}, read: 'json' },
        new AbortController().signal,
      ),
    ).rejects.toThrow('bounded');
  });

  it('binds entered credentials to endpoint and auth routing at the utility boundary', async () => {
    const s = defaultSettings();
    s.preset = 'custom';
    const original = {
      ...compatConn('conn_boundary'),
      models: [profileFor('openai_compat', 'fixture-model')],
    };
    s.connections = [structuredClone(original)];
    s.consentedConnectionIds = [original.id];
    s.caps.hour = { tokens: 1000000 };
    s.caps.day = { tokens: 1000000 };
    let sends = 0;
    let core: ReturnType<typeof createGatewayCore>;
    const runtime = createGatewayRuntime({
      settings: () => s,
      secret: (id, target, requestedFingerprint) =>
        core.secretForRequest(id, target, requestedFingerprint),
      send: async () => {
        sends++;
        return { status: 200, body: '{"data":[]}', headers: {}, latencyMs: 1 };
      },
    });
    core = createGatewayCore({
      connections: () => s.connections.map((c) => ({ ...c, enabled: true })),
      runtime,
    });
    const put = () =>
      core.handle(
        {
          kind: 'secret.put',
          id: 2,
          connectionId: original.id,
          target: 'key',
          secret: 'opaque-entered-value-7788',
        },
        [],
      );
    expect(put()).toMatchObject({ ok: true });
    for (const mutation of [
      { baseUrl: 'https://attacker.example.invalid/v1' },
      { baseUrl: 'https://api.example.com:8443/v1' },
      { baseUrl: 'https://api.example.com/another' },
      { auth: { scheme: 'custom_header' as const, headerName: 'X-New-Key' } },
      { extraHeaderNames: ['X-New-Header'] },
    ]) {
      s.connections = [{ ...structuredClone(original), ...mutation }];
      expect(
        core.secretForRequest(original.id, 'key', connectionFingerprint(original)),
      ).toBeUndefined();
      await runtime.models(original.id);
      await runtime.test(original.id, 'quick');
      const answer = await runtime.call(
        simpleSpec({
          provider: 'openai_compat',
          connectionId: original.id,
          model: 'fixture-model',
        }),
      );
      expect(answer.ok).toBe(false);
      expect(sends).toBe(0);
    }
    s.connections = [
      {
        ...structuredClone(original),
        models: [...original.models, profileFor('openai_compat', 'another-model')],
      },
    ];
    expect(core.secretForRequest(original.id, 'key', connectionFingerprint(original))).toBe(
      'opaque-entered-value-7788',
    );
    await runtime.models(original.id);
    expect(sends).toBe(1);
  });

  it.each(['call', 'models', 'test'] as const)(
    'binds credentials to the captured route when current settings change during %s',
    async (operation) => {
      const s = defaultSettings();
      s.preset = 'custom';
      const original = compatConn('conn_boundary', [{ model: 'fixture-model' }]);
      s.connections = [original];
      s.consentedConnectionIds = [original.id];
      s.caps.hour = { tokens: 1000000 };
      s.caps.day = { tokens: 1000000 };
      let core: ReturnType<typeof createGatewayCore>;
      const sent: string[] = [];
      const runtime = createGatewayRuntime({
        settings: () => s,
        secret: (id, target, requestedFingerprint) =>
          core.secretForRequest(id, target, requestedFingerprint),
        send: async (request) => {
          sent.push(request.url);
          return { status: 200, headers: {}, latencyMs: 1, body: '{"data":[]}' };
        },
      });
      core = createGatewayCore({
        connections: () => [{ ...original, enabled: true }],
        runtime,
      });
      expect(
        core.handle(
          {
            kind: 'secret.put',
            id: 1,
            connectionId: original.id,
            target: 'key',
            secret: 'opaque-boundary-value-7788',
          },
          [],
        ),
      ).toMatchObject({ ok: true });
      // Runtime captured an attacker route before the utility re-read restored settings.
      s.connections = [{ ...original, baseUrl: 'https://attacker.example.invalid/v1' }];
      if (operation === 'call') {
        await runtime.call(
          simpleSpec({
            provider: 'openai_compat',
            connectionId: original.id,
            model: 'fixture-model',
          }),
        );
      } else if (operation === 'models') await runtime.models(original.id);
      else await runtime.test(original.id, 'quick');
      expect(sent).toEqual([]);
      s.connections = [original];
      await runtime.models(original.id);
      expect(sent).toEqual([`${original.baseUrl}/models`]);
    },
  );

  it.each(['key', 'header:X-Org'] as const)(
    'filters every credential used by a multi-page listing after %s rotation',
    async (target) => {
      const a = 'AAAAAAAAAAAA1111';
      const b = 'BBBBBBBBBBBB2222';
      const s = defaultSettings();
      const c = anthropicConn('conn_pages', {
        extraHeaderNames: target === 'key' ? [] : ['X-Org'],
      });
      s.connections = [c];
      let core: ReturnType<typeof createGatewayCore>;
      const header = target === 'key' ? 'x-api-key' : 'X-Org';
      const used: string[] = [];
      const put = (keyTarget: string, secret: string) =>
        core.handle(
          { kind: 'secret.put', id: 1, connectionId: c.id, target: keyTarget, secret },
          [],
        );
      const runtime = createGatewayRuntime({
        settings: () => s,
        secret: (id, keyTarget, requestedFingerprint) =>
          core.secretForRequest(id, keyTarget, requestedFingerprint),
        send: async (request) => {
          used.push(request.headers[header] ?? '');
          const first = used.length === 1;
          if (first) expect(put(target, b)).toMatchObject({ ok: true });
          return {
            status: 200,
            headers: {},
            latencyMs: 1,
            body: JSON.stringify(
              first
                ? { data: [], has_more: true, last_id: 'page1' }
                : { data: [{ id: b }], has_more: false },
            ),
          };
        },
      });
      core = createGatewayCore({
        connections: () => [{ ...c, enabled: true }],
        runtime,
      });
      expect(put('key', target === 'key' ? a : 'CCCCCCCCCCCC3333')).toMatchObject({ ok: true });
      if (target !== 'key') expect(put(target, a)).toMatchObject({ ok: true });
      const listing = await runtime.models(c.id);
      expect(used).toEqual([a, b]);
      expect(listing).toMatchObject({ ok: false, models: [], problem: 'bad_output' });
      expect(JSON.stringify(listing)).not.toContain(b);
    },
  );
});
