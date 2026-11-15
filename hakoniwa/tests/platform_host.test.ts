// PlatformHost (docs/50_tech/release_engineering.md 2.2, 2.8, 5.2; llm_providers.md 6.2,
// 7.2): the desktop host over a real window.hk built by createHkBridge on a fake
// ipcRenderer, the web host over fake local storage and IndexedDB, the memory host for
// tests, and the choice between desktop and web. No DOM and no Electron.

import { describe, expect, it } from 'vitest';
import { createHkBridge, type HkBridge } from '../desktop/bridge';
import { HK_NAMES } from '../desktop/ipc/names';
import type { SaveBackend, SaveWriteRequest } from '../src/core/save/backend';
import { ContainerBackend } from '../src/core/save/container';
import { CONTAINER_VERSION, NO_FLAGS, SAVE_FORMAT, type SlotId } from '../src/core/save/header';
import { MemoryStorage } from '../src/core/save/memory_storage';
import { sha256Hex } from '../src/core/save/sha256';
import { createDesktopHost, isHkBridge } from '../src/platform/desktop_host';
import { isLoopbackEndpoint, type PlatformEvent } from '../src/platform/host';
import { createMemoryHost } from '../src/platform/memory_host';
import { platformKindOf, selectPlatformHost } from '../src/platform/select';
import { createWebHost, SETTINGS_MAX_CHARS, WEB_KEYS } from '../src/platform/web_host';
import { FakeStorage, fakeIndexedDB, fakeIpc } from './platform_fakes';

const RUN = 'r-0123abcd';

function saveRequest(slot: SlotId, text: string, runId = RUN): SaveWriteRequest {
  const bytes = new TextEncoder().encode(text);
  const sha256 = sha256Hex(bytes);
  return {
    runId,
    slotId: slot,
    files: [{ kind: 'snapshot', sha256, bytes }],
    header: {
      format: SAVE_FORMAT,
      container: CONTAINER_VERSION,
      worldVersion: 1,
      gameVersion: '0.1.0',
      contentVersion: 'c-test',
      renameVersion: 0,
      build: 'test',
      slot,
      label: text,
      runId,
      savedAt: '2026-11-16T00:00:00.000Z',
      tick: 10,
      flags: { ...NO_FLAGS },
      summary: { act: 'act1', map: 'borderstone' },
      files: { snapshot: { sha256, bytes: bytes.length }, segments: [], anchors: [] },
    },
  };
}

/** A main process stand-in: hk:save.* answered by a container, like PK-M0-16's handler. */
function mainProcessSaves(backend: SaveBackend) {
  return async (channel: string, payload: unknown): Promise<unknown> => {
    const p = payload as never;
    switch (channel) {
      case HK_NAMES.saveList:
        return { ok: true, value: await backend.list() };
      case HK_NAMES.saveWrite:
        return { ok: true, value: await backend.write(p) };
      case HK_NAMES.saveRead:
        return { ok: true, value: await backend.read(p) };
      case HK_NAMES.saveDelete:
        await backend.delete(p);
        return { ok: true, value: null };
      case HK_NAMES.saveRecoverables:
        return { ok: true, value: await backend.recoverables() };
      case HK_NAMES.saveRestore:
        return { ok: true, value: await backend.restore(p) };
      default:
        return { ok: false, reason: 'not_implemented' };
    }
  };
}

// ---------------------------------------------------------------------------

describe('desktop host', () => {
  it('maps every member to its named hk:* channel and payload', async () => {
    const f = fakeIpc();
    const host = createDesktopHost(createHkBridge(f.ipc));
    await host.info();
    await host.settings.get('sync');
    await host.settings.set('local', { quality: 'high' });
    await host.achievements.unlock('HK_ACT_1');
    await host.achievements.setStat('HK_STAT_DOORS', 3);
    await host.achievements.setPresence('status', 'act1');
    await host.achievements.status();
    await host.diagnostics.exportBundle({ logs: true, system: true, settings: false });
    await host.diagnostics.pendingCrash();
    await host.diagnostics.sendCrash('rep-1');
    await host.diagnostics.sendCrash('rep-2', true);
    await host.window.setMode('windowed');
    await host.window.setFrameCap(30);
    await host.window.openExternal('https://store.steampowered.com/');
    host.diagnostics.log('warn', 'renderer note');
    expect(f.invoked).toEqual([
      { channel: 'hk:app.info', args: [] },
      { channel: 'hk:settings.get', args: [{ part: 'sync' }] },
      { channel: 'hk:settings.set', args: [{ part: 'local', values: { quality: 'high' } }] },
      { channel: 'hk:steam.achieve', args: [{ api: 'HK_ACT_1' }] },
      { channel: 'hk:steam.stat', args: [{ name: 'HK_STAT_DOORS', value: 3 }] },
      { channel: 'hk:steam.presence', args: [{ key: 'status', value: 'act1' }] },
      { channel: 'hk:steam.status', args: [] },
      { channel: 'hk:diag.export', args: [{ logs: true, system: true, settings: false }] },
      { channel: 'hk:crash.pending', args: [] },
      { channel: 'hk:crash.send', args: [{ reportId: 'rep-1' }] },
      { channel: 'hk:crash.send', args: [{ reportId: 'rep-2', autoSend: true }] },
      { channel: 'hk:window.mode', args: [{ mode: 'windowed' }] },
      { channel: 'hk:window.frameCap', args: [{ cap: 30 }] },
      { channel: 'hk:shell.openExternal', args: [{ url: 'https://store.steampowered.com/' }] },
    ]);
    expect(f.sent).toEqual([
      { channel: 'hk:log', args: [{ level: 'warn', message: 'renderer note' }] },
    ]);
    expect(host.kind).toBe('desktop');
    expect(host.achievements.available).toBe(true);
  });

  it('passes saves through hk:save.* to the main-process container and back', async () => {
    const main = new ContainerBackend(new MemoryStorage(), {
      now: () => 0,
      writer: { id: 'w-desktop1', name: 'DESKTOP' },
    });
    const f = fakeIpc(mainProcessSaves(main));
    const host = createDesktopHost(createHkBridge(f.ipc));

    const req = saveRequest('manual_01', 'world at tick 10');
    const wrote = await host.saves.write(req);
    expect(wrote.ok).toBe(true);
    const sent = f.invoked.find((c) => c.channel === 'hk:save.write');
    expect(sent?.args[0]).toBe(req);

    const slots = await host.saves.list();
    expect(slots.map((s) => [s.slot, s.header?.label, s.header?.writerId])).toEqual([
      ['manual_01', 'world at tick 10', 'w-desktop1'],
    ]);
    const sha = req.files[0]?.sha256 as string;
    const read = await host.saves.read({ slotId: 'manual_01', hashes: [sha] });
    expect(read.ok && read.files.map((x) => [x.sha256, x.ok])).toEqual([[sha, true]]);
    expect(read.ok && new TextDecoder().decode(read.files[0]?.bytes ?? undefined)).toBe(
      'world at tick 10',
    );

    await host.saves.delete({ slotId: 'manual_01' });
    expect(await host.saves.list()).toEqual([]);
    expect(Array.isArray(await host.saves.recoverables())).toBe(true);
    const restored = await host.saves.restore({ candidateId: 'nope', slotId: 'manual_02' });
    expect(restored).toMatchObject({ ok: false, code: 'bad_request' });
  });

  it('turns channel refusals into the container failure shapes', async () => {
    const answers: Record<string, unknown> = {};
    const f = fakeIpc((ch) => answers[ch] ?? { ok: false, reason: 'not_implemented' });
    const host = createDesktopHost(createHkBridge(f.ipc));
    const req = saveRequest('quick', 'q');

    // The skeleton shell answers not_implemented: an I/O failure, never a crash.
    expect(await host.saves.write(req)).toEqual({
      ok: false,
      code: 'io',
      reason: 'hk:save.write refused: not_implemented',
    });
    expect(await host.saves.read({ slotId: 'quick', hashes: [] })).toMatchObject({
      ok: false,
      code: 'io',
    });
    expect(await host.saves.restore({ candidateId: 'x', slotId: 'quick' })).toMatchObject({
      ok: false,
      code: 'io',
    });
    await expect(host.saves.list()).rejects.toThrow('hk:save.list refused: not_implemented');
    await expect(host.saves.delete({ slotId: 'quick' })).rejects.toThrow(
      'hk:save.delete refused: not_implemented',
    );
    await expect(host.saves.recoverables()).rejects.toThrow('not_implemented');

    // Shape refusals at the guard are the caller's error.
    answers['hk:save.write'] = { ok: false, reason: 'too_large' };
    expect(await host.saves.write(req)).toMatchObject({ ok: false, code: 'bad_request' });
    answers['hk:save.write'] = { ok: false, reason: 'bad_request' };
    expect(await host.saves.write(req)).toMatchObject({ ok: false, code: 'bad_request' });
    answers['hk:save.write'] = { ok: false, reason: 'rate_limited' };
    expect(await host.saves.write(req)).toMatchObject({ ok: false, code: 'io' });

    // An accepted call with a value of the wrong shape is not trusted.
    answers['hk:save.write'] = { ok: true, value: 'written' };
    expect(await host.saves.write(req)).toMatchObject({ ok: false, code: 'io' });
    answers['hk:save.list'] = { ok: true, value: { slots: [] } };
    await expect(host.saves.list()).rejects.toThrow('unexpected shape');
  });

  it('hands the bridge model surface to the gateway route unchanged', () => {
    const hk = createHkBridge(fakeIpc().ipc);
    const host = createDesktopHost(hk);
    expect(host.llm.route).toBe('gateway');
    expect(host.llm.route === 'gateway' && host.llm.gateway).toBe(hk.llm);
  });

  it('reads the build from hk:app.info and accepts settings only as plain objects', async () => {
    const answers: Record<string, unknown> = {
      'hk:app.info': {
        ok: true,
        value: {
          version: '0.1.0',
          build: 'a1b2c3d',
          channel: 'internal',
          contentVersion: 'unknown',
          platform: 'win32',
        },
      },
      'hk:settings.get': { ok: true, value: null },
      'hk:settings.set': { ok: true, value: { volume: 0.5 } },
    };
    const f = fakeIpc((ch) => answers[ch] ?? { ok: false, reason: 'not_implemented' });
    const host = createDesktopHost(createHkBridge(f.ipc));
    expect(await host.info()).toEqual({
      kind: 'desktop',
      version: '0.1.0',
      build: 'a1b2c3d',
      channel: 'internal',
      contentVersion: 'unknown',
      platform: 'win32',
    });
    expect(await host.settings.get('sync')).toEqual({ ok: true, value: null });
    expect(await host.settings.set('sync', { volume: 0.5 })).toEqual({
      ok: true,
      value: { volume: 0.5 },
    });
    answers['hk:settings.get'] = { ok: true, value: [1, 2] };
    expect(await host.settings.get('sync')).toEqual({ ok: false, reason: 'failed' });
    answers['hk:settings.set'] = { ok: true, value: null };
    expect(await host.settings.set('sync', {})).toEqual({ ok: false, reason: 'failed' });
    answers['hk:settings.get'] = { ok: false, reason: 'not_implemented' };
    expect(await host.settings.get('local')).toEqual({ ok: false, reason: 'not_implemented' });
    answers['hk:app.info'] = { ok: false, reason: 'failed' };
    expect((await host.info()).build).toBe('unknown');
  });

  it('relays shell window events until unsubscribed', () => {
    const f = fakeIpc();
    const host = createDesktopHost(createHkBridge(f.ipc));
    const seen: PlatformEvent[] = [];
    const off = host.window.onEvent((e) => seen.push(e));
    f.push('hk:event', { kind: 'suspend' });
    f.push('hk:event', { kind: 'fullscreen', on: true });
    off();
    f.push('hk:event', { kind: 'resume' });
    expect(seen).toEqual([{ kind: 'suspend' }, { kind: 'fullscreen', on: true }]);
    expect(f.listenerCount('hk:event')).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('web host', () => {
  const page = (idb = fakeIndexedDB(), storage = new FakeStorage()) => {
    const warnings: unknown[][] = [];
    let n = 0;
    const host = createWebHost({
      version: '0.1.0',
      writerName: 'this browser',
      storage,
      indexedDB: idb.factory,
      now: () => 1_000,
      randomBytes: (k) => new Uint8Array(k).fill(0xab + n++),
      console: { error: () => {}, warn: (...a) => warnings.push(a), info: () => {} },
    });
    return { host, idb, storage, warnings };
  };

  it('keeps saves in IndexedDB across page loads, under one writer id', async () => {
    const first = page();
    expect(first.idb.opened).toEqual([]); // opened on first use, not at construction
    const req = saveRequest('auto_1', 'autosave');
    expect((await first.host.saves.write(req)).ok).toBe(true);
    expect(first.idb.opened).toEqual(['hakoniwa-saves']);
    expect(first.idb.keys('hakoniwa-saves')).toEqual([
      `runs/${RUN}/snap/${req.files[0]?.sha256}.hks`,
      'slots/auto_1.json',
    ]);
    const writer = first.storage.getItem(WEB_KEYS.writer);
    expect(writer).toBe(`w-${'ab'.repeat(8)}`);

    // A reload: a new host over the same browser profile sees the slot and keeps the id.
    const second = page(first.idb, first.storage);
    const [slot] = await second.host.saves.list();
    expect(slot?.header).toMatchObject({
      slot: 'auto_1',
      label: 'autosave',
      writerId: writer,
      writerName: 'this browser',
    });
    expect(second.storage.getItem(WEB_KEYS.writer)).toBe(writer);
    expect(second.warnings).toEqual([]);
  });

  it('falls back to memory saves when IndexedDB is missing or refuses to open', async () => {
    const denied = page(fakeIndexedDB({ failOpen: true }));
    expect((await denied.host.saves.write(saveRequest('quick', 'q'))).ok).toBe(true);
    expect((await denied.host.saves.list()).map((s) => s.slot)).toEqual(['quick']);
    expect(String(denied.warnings[0]?.[0])).toContain('IndexedDB unavailable');
    // Nothing reached the profile: a reload starts empty.
    const reload = page(fakeIndexedDB({ failOpen: true }), denied.storage);
    expect(await reload.host.saves.list()).toEqual([]);

    const warnings: unknown[] = [];
    const none = createWebHost({
      version: '0.1.0',
      writerName: 'x',
      indexedDB: null,
      storage: null,
      randomBytes: (k) => new Uint8Array(k),
      console: { error: () => {}, warn: (m) => warnings.push(m), info: () => {} },
    });
    expect((await none.saves.write(saveRequest('quick', 'q'))).ok).toBe(true);
    expect(String(warnings[0])).toContain('no IndexedDB');
  });

  it('stores each settings part as JSON in local storage', async () => {
    const { host, storage } = page();
    expect(await host.settings.get('sync')).toEqual({ ok: true, value: null });
    const values = { volume: { master: 0.8 }, language: 'zh-Hans', dropped: undefined };
    expect(await host.settings.set('sync', values)).toEqual({
      ok: true,
      value: { volume: { master: 0.8 }, language: 'zh-Hans' },
    });
    expect(storage.getItem('hakoniwa.settings.sync')).toBe(
      '{"volume":{"master":0.8},"language":"zh-Hans"}',
    );
    expect(await host.settings.get('sync')).toEqual({
      ok: true,
      value: { volume: { master: 0.8 }, language: 'zh-Hans' },
    });
    expect(await host.settings.get('local')).toEqual({ ok: true, value: null });
    expect(WEB_KEYS.settings('local')).toBe('hakoniwa.settings.local');
  });

  it('keeps an unreadable settings part as .bad and reads it as nothing stored', async () => {
    const { host, storage } = page();
    storage.setItem('hakoniwa.settings.local', '{"quality": "hi');
    expect(await host.settings.get('local')).toEqual({ ok: true, value: null });
    expect(storage.getItem('hakoniwa.settings.local')).toBeNull();
    expect(storage.getItem('hakoniwa.settings.local.bad')).toBe('{"quality": "hi');
    storage.setItem('hakoniwa.settings.sync', '[1,2]');
    expect(await host.settings.get('sync')).toEqual({ ok: true, value: null });
    expect(storage.getItem('hakoniwa.settings.sync.bad')).toBe('[1,2]');
  });

  it('refuses oversized, malformed and unstorable settings', async () => {
    const { host, storage } = page();
    const big = { text: 'x'.repeat(SETTINGS_MAX_CHARS) };
    expect(await host.settings.set('local', big)).toEqual({ ok: false, reason: 'too_large' });
    expect(await host.settings.set('other' as never, {})).toEqual({
      ok: false,
      reason: 'bad_request',
    });
    expect(await host.settings.set('local', [] as never)).toEqual({
      ok: false,
      reason: 'bad_request',
    });
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(await host.settings.set('local', loop)).toEqual({ ok: false, reason: 'bad_request' });
    storage.full = true;
    expect(await host.settings.set('local', { a: 1 })).toEqual({ ok: false, reason: 'failed' });
    expect(storage.getItem('hakoniwa.settings.local')).toBeNull();
  });

  it('reaches models only on this machine', () => {
    const { host } = page();
    expect(host.llm.route).toBe('loopback');
    if (host.llm.route !== 'loopback') return;
    for (const url of [
      'http://127.0.0.1:11434/v1',
      'http://localhost:1234/v1',
      'http://[::1]:8080',
      'https://localhost/v1',
    ]) {
      expect(host.llm.endpointAllowed(url), url).toBe(true);
    }
    for (const url of [
      'https://api.anthropic.com/v1',
      'https://api.openai.com/v1',
      'http://192.168.1.5:11434/v1',
      'http://10.0.0.2:8080',
      'http://localhost.example.com',
      'http://127.0.0.1.nip.io',
      'http://user:pass@localhost:1234',
      'file:///C:/models',
      'ws://localhost:1234',
      'not a url',
    ]) {
      expect(host.llm.endpointAllowed(url), url).toBe(false);
    }
    expect(isLoopbackEndpoint('http://127.0.0.1')).toBe(true);
  });

  it('has no store or shell and opens only https links in a new tab', async () => {
    const opened: string[] = [];
    const logged: string[] = [];
    const host = createWebHost({
      version: '0.1.0',
      writerName: 'x',
      openWindow: (url) => opened.push(url),
      console: {
        error: (m) => logged.push(`error ${m}`),
        warn: (m) => logged.push(`warn ${m}`),
        info: (m) => logged.push(`info ${m}`),
      },
    });
    expect(host.kind).toBe('web');
    expect(await host.info()).toMatchObject({ kind: 'web', channel: 'web', platform: 'web' });
    expect(host.achievements.available).toBe(false);
    for (const r of [
      await host.achievements.unlock('HK_ACT_1'),
      await host.achievements.setStat('HK_STAT_DOORS', 1),
      await host.achievements.setPresence('k', 'v'),
      await host.achievements.status(),
      await host.diagnostics.exportBundle({ logs: true, system: true, settings: false }),
      await host.diagnostics.pendingCrash(),
      await host.diagnostics.sendCrash('r'),
      await host.window.setMode('fullscreen'),
    ]) {
      expect(r).toEqual({ ok: false, reason: 'unavailable' });
    }
    expect(await host.window.setFrameCap(60)).toEqual({ ok: true, value: 60 });
    expect(await host.window.setFrameCap(45 as never)).toEqual({
      ok: false,
      reason: 'bad_request',
    });
    expect(await host.window.openExternal('https://store.steampowered.com/')).toEqual({
      ok: true,
      value: null,
    });
    expect(await host.window.openExternal('http://example.com/')).toEqual({
      ok: false,
      reason: 'bad_request',
    });
    expect(await host.window.openExternal('javascript:alert(1)')).toMatchObject({ ok: false });
    expect(opened).toEqual(['https://store.steampowered.com/']);
    host.diagnostics.log('info', 'a');
    host.diagnostics.log('warn', 'b');
    host.diagnostics.log('error', 'c');
    expect(logged).toEqual(['info a', 'warn b', 'error c']);
    const blocked = createWebHost({ version: '0', writerName: 'x', openWindow: () => null });
    expect(await blocked.window.openExternal('https://a.example/')).toEqual({
      ok: false,
      reason: 'failed',
    });
    const noTabs = createWebHost({ version: '0', writerName: 'x' });
    expect(await noTabs.window.openExternal('https://a.example/')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });
});

// ---------------------------------------------------------------------------

describe('memory host', () => {
  it('is deterministic: the same writes give identical slot headers', async () => {
    const run = async () => {
      const host = createMemoryHost();
      await host.saves.write(saveRequest('manual_03', 'one'));
      await host.saves.write(saveRequest('manual_03', 'two'));
      return (await host.saves.list()).map((s) => s.header);
    };
    const [a, b] = [await run(), await run()];
    expect(a).toEqual(b);
    expect(a[0]).toMatchObject({ generation: 2, label: 'two', writerId: 'w-00000000' });
    expect(a[0]?.headerSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('exposes its byte store so tests can cut the power mid-save', async () => {
    const host = createMemoryHost();
    host.storage.cutPowerAt(1);
    const r = await host.saves.write(saveRequest('quick', 'torn'));
    expect(r).toMatchObject({ ok: false, code: 'io' });
    host.storage.powerOn();
    expect(await host.saves.list()).toEqual([]);
  });

  it('scripts the gateway: deltas, the receipt, aborts and a not_configured default', async () => {
    const quiet = createMemoryHost();
    expect(quiet.llm.route).toBe('gateway');
    const spec = { requestId: 'q-1', connectionId: 'c1' } as never;
    expect(await quiet.gateway.request(spec)).toMatchObject({
      ok: false,
      problem: 'not_configured',
      error: { cls: 'bad_request' },
    });

    const host = createMemoryHost({
      llm: () => ({ deltas: ['hel', 'lo'], result: { ok: true, text: 'hello', latencyMs: 5 } }),
    });
    const deltas: string[] = [];
    const gw = host.llm.route === 'gateway' ? host.llm.gateway : null;
    expect(gw).toBe(host.gateway);
    expect(await gw?.request(spec, (t) => deltas.push(t))).toEqual({
      ok: true,
      text: 'hello',
      latencyMs: 5,
    });
    expect(deltas).toEqual(['hel', 'lo']);
    gw?.abort('q-1');
    expect(host.gateway.requests).toEqual([spec]);
    expect(host.gateway.aborted).toEqual(['q-1']);
    const problems: unknown[] = [];
    const off = gw?.onProblem((p) => problems.push(p));
    host.gateway.emitProblem({ problem: 'keychain_unavailable' });
    off?.();
    host.gateway.emitProblem({ problem: 'network' });
    expect(problems).toEqual([{ problem: 'keychain_unavailable' }]);
  });

  it('never holds a key: secret calls answer status only', async () => {
    const host = createMemoryHost();
    const gw = host.gateway;
    expect(await gw.secretHas({ connectionId: 'c1' })).toEqual({
      ok: true,
      value: { state: 'none', backend: 'memory_only' },
    });
    expect(await gw.secretEnter({ connectionId: 'c1' })).toEqual({
      ok: true,
      value: { state: 'session_only', backend: 'memory_only' },
    });
    expect(await gw.secretClear({ connectionId: 'c1' })).toEqual({
      ok: true,
      value: { state: 'none', backend: 'memory_only' },
    });
    await gw.secretEnter({ connectionId: 'c2' });
    expect(await gw.wipe()).toEqual({ ok: true, value: null });
    expect((await gw.secretHas({ connectionId: 'c2' })).ok && 'none').toBe('none');
    expect(await gw.models({ connectionId: 'c1' })).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('records store, log, link and window effects and emits window events', async () => {
    const host = createMemoryHost();
    await host.achievements.unlock('HK_ACT_1');
    await host.achievements.unlock('HK_ACT_1');
    await host.achievements.setStat('HK_STAT_DOORS', 4);
    await host.achievements.setPresence('status', 'act1');
    host.diagnostics.log('error', 'boom');
    await host.window.openExternal('https://example.com/');
    expect(await host.window.openExternal('http://example.com/')).toMatchObject({ ok: false });
    await host.window.setFrameCap('display');
    await host.window.setMode('fullscreen');
    expect(host.unlocked).toEqual(['HK_ACT_1']);
    expect([...host.stats]).toEqual([['HK_STAT_DOORS', 4]]);
    expect([...host.presence]).toEqual([['status', 'act1']]);
    expect(host.logs).toEqual([{ level: 'error', message: 'boom' }]);
    expect(host.opened).toEqual(['https://example.com/']);
    expect(host.frameCaps).toEqual(['display']);
    expect(host.modes).toEqual(['fullscreen']);
    const seen: PlatformEvent[] = [];
    const off = host.window.onEvent((e) => seen.push(e));
    host.emit({ kind: 'blur' });
    off();
    host.emit({ kind: 'focus' });
    expect(seen).toEqual([{ kind: 'blur' }]);

    const closed = createMemoryHost({ achievements: false });
    expect(closed.achievements.available).toBe(false);
    expect(await closed.achievements.unlock('HK_ACT_1')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('copies settings in and out, so callers cannot reach into the store', async () => {
    const host = createMemoryHost();
    const values = { keys: { up: 'w' } };
    await host.settings.set('sync', values);
    values.keys.up = 'z';
    const got = await host.settings.get('sync');
    expect(got).toEqual({ ok: true, value: { keys: { up: 'w' } } });
    if (got.ok && got.value) (got.value.keys as { up: string }).up = 'q';
    expect(host.settingsStore.get('sync')).toEqual({ keys: { up: 'w' } });
    expect(await host.settings.get('nope' as never)).toEqual({ ok: false, reason: 'bad_request' });
  });
});

// ---------------------------------------------------------------------------

describe('platform selection', () => {
  const web = { version: '0.1.0', writerName: 'x', indexedDB: null, storage: null };

  it('picks the desktop host when the preload exposed window.hk', () => {
    const hk: HkBridge = createHkBridge(fakeIpc().ipc);
    expect(isHkBridge(hk)).toBe(true);
    expect(platformKindOf({ hk })).toBe('desktop');
    const host = selectPlatformHost({ hk }, web);
    expect(host.kind).toBe('desktop');
    expect(host.llm.route === 'gateway' && host.llm.gateway).toBe(hk.llm);
  });

  it('picks the web host otherwise, including for a look-alike hk', () => {
    expect(platformKindOf({})).toBe('web');
    expect(selectPlatformHost({}, web).kind).toBe('web');
    for (const hk of [null, 1, 'hk', {}, { app: { info: () => 0 } }]) {
      expect(isHkBridge(hk)).toBe(false);
      expect(selectPlatformHost({ hk }, web).kind).toBe('web');
    }
  });
});
