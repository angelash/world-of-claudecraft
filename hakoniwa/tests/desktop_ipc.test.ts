// The desktop bridge and the model gateway skeleton (docs/50_tech/release_engineering.md
// 2.3 and 2.4, llm_providers.md 7): window.hk maps each method to exactly one hk:* channel
// and hands the page no event objects; the gateway re-checks every envelope from the main
// process (the second guard level), keeps keys in memory only and never returns one; the
// main-side gateway client numbers calls, times them out and survives a gateway exit.

import { describe, expect, it, vi } from 'vitest';
import { createHkBridge, type IpcRendererLike, REQUEST_GRACE_MS } from '../desktop/bridge';
import { HK } from '../desktop/ipc/channels';
import { HK_NAMES } from '../desktop/ipc/names';
import { checkKeyText, keyFromClipboard, last4, MAX_KEY_LENGTH } from '../desktop/key_entry/rules';
import { createGatewayClient } from '../desktop/llm_gateway/client';
import { createGatewayCore } from '../desktop/llm_gateway/core';
import { parseFromGateway, parseToGateway } from '../desktop/llm_gateway/protocol';
import { FakeChild, fakePort, flush } from './desktop_fakes';

function fakeIpc() {
  const calls: { op: string; channel: string; args: unknown[] }[] = [];
  const listeners = new Map<string, ((event: unknown, ...args: unknown[]) => void)[]>();
  const ipc: IpcRendererLike = {
    invoke: async (channel, ...args) => {
      calls.push({ op: 'invoke', channel, args });
      return { ok: true, value: channel };
    },
    send: (channel, ...args) => {
      calls.push({ op: 'send', channel, args });
    },
    postMessage: (channel, message, transfer) => {
      calls.push({ op: 'postMessage', channel, args: [message, transfer] });
    },
    on: (channel, listener) => {
      listeners.set(channel, [...(listeners.get(channel) ?? []), listener]);
    },
    removeListener: (channel, listener) => {
      listeners.set(
        channel,
        (listeners.get(channel) ?? []).filter((l) => l !== listener),
      );
    },
  };
  const emit = (channel: string, value: unknown) => {
    for (const l of listeners.get(channel) ?? []) l({ sender: 'ipcRenderer' }, value);
  };
  return { ipc, calls, listeners, emit };
}

describe('window.hk bridge', () => {
  it('exposes exactly the named groups and methods', () => {
    const hk = createHkBridge(fakeIpc().ipc);
    const shape = Object.fromEntries(
      Object.entries(hk).map(([k, v]) => [
        k,
        typeof v === 'function' ? 'fn' : Object.keys(v).sort(),
      ]),
    );
    expect(shape).toEqual({
      app: ['info'],
      saves: ['delete', 'importDemo', 'list', 'read', 'recoverables', 'restore', 'write'],
      settings: ['get', 'set'],
      llm: [
        'abort',
        'ledger',
        'models',
        'onProblem',
        'request',
        'secretClear',
        'secretEnter',
        'secretHas',
        'test',
        'wipe',
      ],
      steam: ['achieve', 'presence', 'stat', 'status'],
      diag: ['export'],
      crash: ['pending', 'send'],
      window: ['frameCap', 'mode'],
      shell: ['openExternal'],
      log: 'fn',
      onEvent: 'fn',
    });
  });

  it('maps each method to its own channel', async () => {
    const { ipc, calls } = fakeIpc();
    const hk = createHkBridge(ipc);
    const p = { x: 1 } as never;
    await hk.app.info();
    await hk.saves.list();
    await hk.saves.write(p);
    await hk.saves.read(p);
    await hk.saves.delete(p);
    await hk.saves.recoverables();
    await hk.saves.restore(p);
    await hk.saves.importDemo(p);
    await hk.settings.get(p);
    await hk.settings.set(p);
    hk.llm.abort('r1');
    await hk.llm.secretEnter(p);
    await hk.llm.secretHas(p);
    await hk.llm.secretClear(p);
    await hk.llm.models(p);
    await hk.llm.test(p);
    await hk.llm.ledger(p);
    await hk.llm.wipe();
    await hk.steam.achieve(p);
    await hk.steam.stat(p);
    await hk.steam.presence(p);
    await hk.steam.status();
    await hk.diag.export(p);
    await hk.crash.pending();
    await hk.crash.send(p);
    await hk.window.mode(p);
    await hk.window.frameCap(p);
    await hk.shell.openExternal(p);
    hk.log('warn', 'hello');
    expect(calls.map((c) => `${c.op} ${c.channel}`)).toEqual([
      'invoke hk:app.info',
      'invoke hk:save.list',
      'invoke hk:save.write',
      'invoke hk:save.read',
      'invoke hk:save.delete',
      'invoke hk:save.recoverables',
      'invoke hk:save.restore',
      'invoke hk:save.importDemo',
      'invoke hk:settings.get',
      'invoke hk:settings.set',
      'send hk:llm.abort',
      'invoke hk:llm.secret.enter',
      'invoke hk:llm.secret.has',
      'invoke hk:llm.secret.clear',
      'invoke hk:llm.models',
      'invoke hk:llm.test',
      'invoke hk:llm.ledger',
      'invoke hk:llm.wipe',
      'invoke hk:steam.achieve',
      'invoke hk:steam.stat',
      'invoke hk:steam.presence',
      'invoke hk:steam.status',
      'invoke hk:diag.export',
      'invoke hk:crash.pending',
      'invoke hk:crash.send',
      'invoke hk:window.mode',
      'invoke hk:window.frameCap',
      'invoke hk:shell.openExternal',
      'send hk:log',
    ]);
    // A method without a payload sends no argument at all.
    expect(calls[0]?.args).toEqual([]);
    expect(calls[2]?.args).toEqual([p]);
    expect(calls.at(-1)?.args).toEqual([{ level: 'warn', message: 'hello' }]);
    // Every channel the bridge uses is in the table, under the same name.
    for (const [k, name] of Object.entries(HK_NAMES)) {
      expect(HK[k as keyof typeof HK].name).toBe(name);
    }
  });

  it('streams a request over its own port and resolves with the receipt', async () => {
    const { ipc, calls } = fakeIpc();
    const ch = new MessageChannel();
    const hk = createHkBridge(ipc, () => ch);
    const deltas: string[] = [];
    const spec = { requestId: 'r1', timeoutMs: 1000 } as never;
    const pending = hk.llm.request(spec, (t) => deltas.push(t));
    const post = calls.find((c) => c.op === 'postMessage');
    expect(post?.channel).toBe('hk:llm.request');
    expect(post?.args[0]).toBe(spec);
    expect(post?.args[1]).toEqual([ch.port2]);
    ch.port2.postMessage({ t: 'delta', text: 'he' });
    ch.port2.postMessage({ t: 'delta', text: 'llo' });
    ch.port2.postMessage({ t: 'done', result: { ok: true, text: 'hello', latencyMs: 5 } });
    expect(await pending).toEqual({ ok: true, text: 'hello', latencyMs: 5 });
    expect(deltas).toEqual(['he', 'llo']);
    ch.port1.close();
  });

  it('answers timeout itself when no receipt arrives', async () => {
    vi.useFakeTimers();
    try {
      const ch = new MessageChannel();
      const hk = createHkBridge(fakeIpc().ipc, () => ch);
      const pending = hk.llm.request({ requestId: 'r2', timeoutMs: 1000 } as never);
      vi.advanceTimersByTime(1000 + REQUEST_GRACE_MS + 1);
      expect(await pending).toMatchObject({ ok: false, problem: 'timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('subscriptions relay the value only and can be removed', () => {
    const { ipc, emit, listeners } = fakeIpc();
    const hk = createHkBridge(ipc);
    const seen: unknown[] = [];
    const off = hk.onEvent((e) => seen.push(e));
    const offProblem = hk.llm.onProblem((p) => seen.push(p));
    emit('hk:event', { kind: 'blur' });
    emit('hk:llm.problem', { problem: 'not_configured' });
    expect(seen).toEqual([{ kind: 'blur' }, { problem: 'not_configured' }]);
    off();
    offProblem();
    expect(listeners.get('hk:event')).toEqual([]);
    expect(listeners.get('hk:llm.problem')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('gateway envelope (second guard level)', () => {
  it('accepts each known kind with exactly its fields', () => {
    const good = [
      { kind: 'request', spec: {} },
      { kind: 'abort', requestId: 'r1' },
      { kind: 'secret.put', id: 1, connectionId: 'c1', target: 'key', secret: 'x' },
      { kind: 'secret.put', id: 1, connectionId: 'c1', target: 'header:X-Org', secret: 'x' },
      { kind: 'secret.has', id: 2, connectionId: 'c1' },
      { kind: 'secret.clear', id: 3, connectionId: 'c1' },
      { kind: 'models', id: 4, connectionId: 'c1' },
      { kind: 'test', id: 5, connectionId: 'c1', depth: 'quick' },
      { kind: 'ledger', id: 6, window: 'run' },
      { kind: 'wipe', id: 7 },
    ];
    for (const m of good) expect(parseToGateway(m).ok, JSON.stringify(m)).toBe(true);
  });

  it('refuses unknown kinds, extra fields and bad values', () => {
    const bad = [
      null,
      'request',
      { kind: 'eval', code: '1' },
      { kind: 'secret.read', id: 1, connectionId: 'c1' },
      { kind: 'secret.has', id: 1, connectionId: 'c1', reveal: true },
      { kind: 'secret.has', id: 0, connectionId: 'c1' },
      { kind: 'secret.has', id: 1, connectionId: '../c1' },
      { kind: 'secret.put', id: 1, connectionId: 'c1', target: 'url', secret: 'x' },
      { kind: 'secret.put', id: 1, connectionId: 'c1', target: 'key', secret: '' },
      { kind: 'secret.put', id: 1, connectionId: 'c1', target: 'key', secret: 'x'.repeat(513) },
      { kind: 'request', spec: {}, url: 'https://evil.example' },
      { kind: 'ledger', id: 1, window: 'year' },
      { kind: 'toString' },
    ];
    for (const m of bad) expect(parseToGateway(m).ok, JSON.stringify(m)).toBe(false);
  });

  it('the main process accepts only well-formed gateway messages', () => {
    expect(parseFromGateway({ kind: 'reply', id: 1, ok: true, value: 3 })).toEqual({
      kind: 'reply',
      id: 1,
      ok: true,
      value: 3,
    });
    expect(
      parseFromGateway({ kind: 'reply', id: 1, ok: false, reason: 'not_implemented' }),
    ).toEqual({ kind: 'reply', id: 1, ok: false, reason: 'not_implemented' });
    expect(parseFromGateway({ kind: 'problem', problem: 'keychain_unavailable' })).toEqual({
      kind: 'problem',
      problem: 'keychain_unavailable',
    });
    expect(parseFromGateway({ kind: 'reply', id: 1, ok: false, reason: 'whatever' })).toBeNull();
    expect(parseFromGateway({ kind: 'problem', problem: 'made_up' })).toBeNull();
    expect(parseFromGateway({ kind: 'log', text: 'x' })).toBeNull();
  });
});

describe('gateway core (skeleton)', () => {
  const spec = (over: Record<string, unknown> = {}) => ({
    requestId: 'req-1',
    provider: 'anthropic',
    connectionId: 'c1',
    slot: 'mid',
    bindingRole: 'present_npc',
    model: 'some-model',
    segments: [{ role: 'rules', text: 'x' }],
    output: { schemaId: 's', schema: { type: 'object' }, maxTokens: 100 },
    timeoutMs: 1000,
    reserve: { usd: 0.01, tokens: 100 },
    ...over,
  });
  const result = (port: { messages: unknown[] }) =>
    (port.messages[0] as { result: { problem?: string; error?: { cls: string; message: string } } })
      .result;

  it('re-checks the spec shape on every request', () => {
    const core = createGatewayCore({ connections: () => [{ id: 'c1', enabled: true }] });
    const port = fakePort();
    expect(
      core.handle({ kind: 'request', spec: spec({ endpoint: 'https://x' }) }, [port]),
    ).toBeNull();
    expect(result(port)).toMatchObject({ error: { cls: 'bad_request' } });
    expect(result(port).problem).toBeUndefined();
    expect(port.closed).toBe(true);
  });

  it('answers not_configured for an unknown or disabled connection, and in the shell', () => {
    const core = createGatewayCore({
      connections: () => [
        { id: 'c1', enabled: true },
        { id: 'off', enabled: false },
      ],
    });
    for (const id of ['nope', 'off', 'c1']) {
      const port = fakePort();
      core.handle({ kind: 'request', spec: spec({ connectionId: id }) }, [port]);
      expect(result(port).problem, id).toBe('not_configured');
      expect(port.closed).toBe(true);
    }
  });

  it('wants exactly one port with a request and none with anything else', () => {
    const core = createGatewayCore();
    const a = fakePort();
    const b = fakePort();
    expect(core.handle({ kind: 'request', spec: spec() }, [a, b])).toBeNull();
    expect(a.closed && b.closed).toBe(true);
    expect(a.messages).toEqual([]);
    const stray = fakePort();
    expect(core.handle({ kind: 'secret.has', id: 1, connectionId: 'c1' }, [stray])).toMatchObject({
      ok: true,
    });
    expect(stray.closed).toBe(true);
  });

  it('keeps keys in memory and never returns one', () => {
    const core = createGatewayCore();
    const secret = 'hk-test-SECRET-VALUE-9911';
    const put = core.handle(
      { kind: 'secret.put', id: 1, connectionId: 'c1', target: 'key', secret },
      [],
    );
    expect(put).toEqual({
      kind: 'reply',
      id: 1,
      ok: true,
      value: { state: 'session_only', backend: 'memory_only', last4: '9911' },
    });
    const has = core.handle({ kind: 'secret.has', id: 2, connectionId: 'c1' }, []);
    expect(JSON.stringify([put, has])).not.toContain('SECRET-VALUE');
    expect(core.heldSecrets()).toEqual([secret]);
    expect(core.handle({ kind: 'secret.clear', id: 3, connectionId: 'c1' }, [])).toMatchObject({
      value: { state: 'none' },
    });
    core.handle({ kind: 'secret.put', id: 4, connectionId: 'c2', target: 'key', secret }, []);
    core.handle({ kind: 'wipe', id: 5 }, []);
    expect(core.heldSecrets()).toEqual([]);
    // A short key shows no last four at all.
    const short = core.handle(
      { kind: 'secret.put', id: 6, connectionId: 'c3', target: 'key', secret: 'abcdef' },
      [],
    );
    expect(short).toMatchObject({ value: { state: 'session_only' } });
    expect(JSON.stringify(short)).not.toContain('cdef');
  });

  it('refuses what the full gateway adds later', () => {
    const core = createGatewayCore();
    for (const m of [
      { kind: 'models', id: 1, connectionId: 'c1' },
      { kind: 'test', id: 2, connectionId: 'c1', depth: 'quick' },
      { kind: 'ledger', id: 3, window: 'hour' },
    ]) {
      expect(core.handle(m, [])).toMatchObject({ ok: false, reason: 'not_implemented' });
    }
    expect(core.handle({ kind: 'secret.has', id: 9, connectionId: 'c1', extra: 1 }, [])).toEqual({
      kind: 'reply',
      id: 9,
      ok: false,
      reason: 'bad_request',
    });
    expect(core.handle({ kind: 'nonsense' }, [])).toBeNull();
  });
});

describe('gateway client (main side)', () => {
  it('starts the gateway on first use and matches replies to calls', async () => {
    const children: FakeChild[] = [];
    const client = createGatewayClient({
      spawn: () => {
        const c = new FakeChild([]);
        children.push(c);
        return c;
      },
    });
    expect(children).toEqual([]);
    const [a, b] = await Promise.all([
      client.call('secret.has', { connectionId: 'c1' }),
      client.call('ledger', { window: 'day' }),
    ]);
    expect(a).toEqual({ ok: true, value: { state: 'none', backend: 'memory_only' } });
    expect(b).toEqual({ ok: false, reason: 'not_implemented' });
    expect(children.length).toBe(1);
  });

  it('answers unavailable on timeout and on a gateway exit, then starts a fresh gateway', async () => {
    const children: FakeChild[] = [];
    const silent = new FakeChild([]);
    silent.postMessage = () => {};
    let first = true;
    let fire: (() => void) | null = null;
    const client = createGatewayClient({
      spawn: () => {
        const c = first ? silent : new FakeChild([]);
        first = false;
        children.push(c);
        return c;
      },
      setTimer: (fn) => {
        fire = fn;
        return 1;
      },
      clearTimer: () => {},
    });
    const timedOut = client.call('secret.has', { connectionId: 'c1' });
    (fire as (() => void) | null)?.();
    expect(await timedOut).toEqual({ ok: false, reason: 'unavailable' });

    const lost = client.call('secret.has', { connectionId: 'c1' });
    silent.emit('exit', 1);
    expect(await lost).toEqual({ ok: false, reason: 'unavailable' });

    expect(await client.call('secret.has', { connectionId: 'c1' })).toMatchObject({ ok: true });
    expect(children.length).toBe(2);
  });

  it('ignores malformed gateway messages and relays problem pushes', async () => {
    const child = new FakeChild([]);
    const problems: unknown[] = [];
    const logs: string[] = [];
    const client = createGatewayClient({
      spawn: () => child,
      onProblem: (p) => problems.push(p),
      log: (m) => logs.push(m),
    });
    await client.call('wipe', {});
    child.emit('message', { kind: 'reply', id: 99, ok: true, value: 'stray' });
    child.emit('message', { kind: 'hack' });
    child.emit('message', { kind: 'problem', problem: 'keychain_unavailable', connectionId: 'c1' });
    await flush();
    expect(problems).toEqual([
      { kind: 'problem', problem: 'keychain_unavailable', connectionId: 'c1' },
    ]);
    expect(logs).toEqual(['gateway sent a malformed message']);
  });
});

describe('key entry rules', () => {
  it('accepts a plausible key and refuses empty, long, spaced or control text', () => {
    expect(checkKeyText('hk-test-abc_DEF.123')).toEqual({ ok: true });
    expect(checkKeyText('')).toEqual({ ok: false, reason: 'empty' });
    expect(checkKeyText(undefined)).toEqual({ ok: false, reason: 'empty' });
    expect(checkKeyText('x'.repeat(MAX_KEY_LENGTH))).toEqual({ ok: true });
    expect(checkKeyText('x'.repeat(MAX_KEY_LENGTH + 1))).toEqual({ ok: false, reason: 'too_long' });
    for (const code of [0x20, 0x09, 0x0a, 0x00, 0x7f, 0x85, 0xa0, 0x200b, 0x200d, 0x2028, 0x3000]) {
      expect(checkKeyText(`ab${String.fromCharCode(code)}cd`), code.toString(16)).toEqual({
        ok: false,
        reason: 'bad_chars',
      });
    }
  });

  it('trims pasted text and shows at most the last four of a long key', () => {
    expect(keyFromClipboard('  key-123\r\n')).toBe('key-123');
    expect(last4('abcdefghijkl')).toBe('ijkl');
    expect(last4('abcdefghijk')).toBeUndefined();
  });
});
