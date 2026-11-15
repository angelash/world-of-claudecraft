// The desktop shell's security checklist (docs/50_tech/release_engineering.md 2.6) and the
// hk:* channel contract (2.3), checked without starting Electron: pure policy values are
// pinned directly, and desktop/shell.ts runs against the fake Electron in desktop_fakes.ts
// so the window options, protocol, permission, navigation, IPC guard and key entry wiring
// are asserted on the objects the shell actually creates.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppFile } from '../desktop/app_protocol';
import { HK, HK_CHANNEL_NAMES, KEY_ENTRY, KEY_ENTRY_CHANNEL_NAMES } from '../desktop/ipc/channels';
import { guardCall } from '../desktop/ipc/guard';
import { createHandlers, handlerCoverage } from '../desktop/ipc/handlers';
import { createRotatingLog, MAX_LOG_MESSAGE, redact } from '../desktop/logging';
import { userDataDir } from '../desktop/paths';
import { RateLimiter } from '../desktop/rate_limit';
import {
  ALLOWED_PERMISSIONS,
  APP_SCHEMES,
  BUILD_CHANNELS,
  CONTENT_SECURITY_POLICY,
  CSP_DIRECTIVES,
  devToolsAllowed,
  EXTERNAL_HOSTS,
  externalUrlAllowed,
  GAME_ORIGIN,
  GAME_URL,
  gpuSwitches,
  isTrustedSender,
  KEY_ENTRY_URL,
  navigationAllowed,
  RELEASE_FUSES,
  remoteDebuggingRejected,
  resolveBuildInfo,
  SECURE_WEB_PREFERENCES,
} from '../desktop/security';
import { startShell } from '../desktop/shell';
import {
  type FakeElectron,
  fakeInstall,
  fakePort,
  flush,
  ipcEvent,
  makeFakeElectron,
  navEvent,
} from './desktop_fakes';

async function boot(
  init: { packaged?: boolean; lock?: boolean; argv?: string[]; env?: Record<string, string> } = {},
  stamp: Record<string, unknown> | null = null,
) {
  const install = fakeInstall();
  const fake = makeFakeElectron({
    appData: install.appData,
    packaged: init.packaged,
    lock: init.lock,
  });
  const handle = startShell(
    fake,
    install.options({
      argv: init.argv ?? ['electron', 'main.cjs'],
      env: init.env ?? {},
      stamp,
    }),
  );
  fake.makeReady();
  await handle.ready;
  return { fake, handle, install };
}

const gameWindow = (fake: FakeElectron) => {
  const w = fake.windows[0];
  if (!w) throw new Error('no game window');
  return w;
};

async function invoke(
  fake: FakeElectron,
  name: string,
  payload?: unknown,
  from = GAME_URL,
  id = 1,
) {
  const h = fake.ipcHandlers.get(name);
  if (!h) throw new Error(`no handler for ${name}`);
  const args = payload === undefined ? [] : [payload];
  return h(ipcEvent(from, id), ...args);
}

// ---------------------------------------------------------------------------

describe('2.6 webPreferences', () => {
  it('pins every secure preference', () => {
    expect(SECURE_WEB_PREFERENCES).toEqual({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false,
    });
    expect(Object.isFrozen(SECURE_WEB_PREFERENCES)).toBe(true);
  });

  it('the game window the shell creates carries them, its preload, and the page from app://', async () => {
    const { fake, install } = await boot();
    const w = gameWindow(fake);
    const prefs = w.options.webPreferences ?? {};
    for (const [k, v] of Object.entries(SECURE_WEB_PREFERENCES)) {
      expect(prefs[k as keyof typeof prefs], k).toBe(v);
    }
    expect(prefs.preload).toBe(install.options().preload);
    expect(w.options.show).toBe(false);
    expect(w.loaded).toEqual([GAME_URL]);
    expect(w.loaded.some((u) => u.startsWith('file:'))).toBe(false);
  });

  it('developer tools follow the build channel', () => {
    expect(BUILD_CHANNELS.filter(devToolsAllowed)).toEqual(['internal', 'e2e']);
  });

  it('a packaged Steam build creates its window with developer tools off and F12 inert', async () => {
    const { fake } = await boot({ packaged: true }, { channel: 'steam', build: 'a1b2c3d' });
    const w = gameWindow(fake);
    expect(w.options.webPreferences?.devTools).toBe(false);
    expect(w.options.fullscreen).toBe(true);
    const ev = navEvent('');
    w.webContents.emit('before-input-event', ev, { type: 'keyDown', key: 'F12', code: 'F12' });
    expect(w.webContents.devTools).toBe(false);
    expect(ev.prevented).toBe(false);
  });

  it('an internal development run allows developer tools and starts windowed', async () => {
    const { fake } = await boot();
    const w = gameWindow(fake);
    expect(w.options.webPreferences?.devTools).toBe(true);
    expect(w.options.fullscreen).toBe(false);
    w.webContents.emit('before-input-event', navEvent(''), { type: 'keyDown', key: 'F12' });
    expect(w.webContents.devTools).toBe(true);
  });

  it('F11 and Alt+Enter toggle fullscreen', async () => {
    const { fake } = await boot();
    const w = gameWindow(fake);
    w.webContents.emit('before-input-event', navEvent(''), { type: 'keyDown', key: 'F11' });
    expect(w.fullscreen).toBe(true);
    w.webContents.emit('before-input-event', navEvent(''), {
      type: 'keyDown',
      key: 'Enter',
      alt: true,
    });
    expect(w.fullscreen).toBe(false);
  });
});

describe('2.6 page source', () => {
  it('registers app:// with exactly standard, secure, fetch and code cache, before ready', async () => {
    expect(APP_SCHEMES).toEqual([
      {
        scheme: 'app',
        privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true },
      },
    ]);
    const install = fakeInstall();
    const fake = makeFakeElectron({ appData: install.appData });
    const handle = startShell(fake, install.options());
    expect(fake.schemes).toEqual([APP_SCHEMES]);
    expect(fake.protocolHandlers.size).toBe(0);
    expect(fake.windows).toEqual([]);
    fake.makeReady();
    await handle.ready;
    expect([...fake.protocolHandlers.keys()]).toEqual(['app']);
  });

  it('serves the built game with the content security policy on every response', async () => {
    const { fake } = await boot();
    const serve = fake.protocolHandlers.get('app');
    if (!serve) throw new Error('no app handler');
    const get = (url: string, method = 'GET') => serve({ url, method } as Request);
    for (const url of [
      'app://hakoniwa/index.html',
      'app://hakoniwa/',
      'app://hakoniwa/assets/main.js',
    ]) {
      const res = await get(url);
      expect(res.status, url).toBe(200);
      expect(res.headers.get('Content-Security-Policy')).toBe(CONTENT_SECURITY_POLICY);
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    }
    const refused = [
      'app://hakoniwa/missing.js',
      'app://hakoniwa/api/llm/status',
      'app://hakoniwa/..%2F..%2Fsecret.txt',
      'app://hakoniwa/%2e%2e/secret.txt',
      'app://hakoniwa/..%5C..%5Csecret.txt',
      'app://other/index.html',
    ];
    for (const url of refused) {
      const res = await get(url);
      expect(res.status, url).toBe(404);
      expect(res.headers.get('Content-Security-Policy')).toBe(CONTENT_SECURITY_POLICY);
    }
    expect((await get('app://hakoniwa/index.html', 'POST')).status).toBe(405);
  });

  it('maps each host to its own root and nothing outside it', () => {
    const roots = { hakoniwa: join('/r', 'game'), 'key-entry': join('/r', 'key') };
    const files = new Set([join('/r', 'game', 'index.html'), join('/r', 'key', 'index.html')]);
    const isFile = (p: string) => files.has(p);
    expect(resolveAppFile(GAME_URL, roots, isFile)).toBe(join('/r', 'game', 'index.html'));
    expect(resolveAppFile(KEY_ENTRY_URL, roots, isFile)).toBe(join('/r', 'key', 'index.html'));
    expect(resolveAppFile('app://key-entry/../game/index.html', roots, isFile)).toBeNull();
    expect(resolveAppFile('app://key-entry/%2E%2E%2Fgame%2Findex.html', roots, isFile)).toBeNull();
    expect(resolveAppFile('file:///r/game/index.html', roots, isFile)).toBeNull();
    expect(resolveAppFile('app://hakoniwa/%00', roots, isFile)).toBeNull();
    expect(resolveAppFile('app://hakoniwa/%E0%A4%A', roots, isFile)).toBeNull();
  });
});

describe('2.6 content security policy', () => {
  it('is exactly the checklist policy', () => {
    expect(CSP_DIRECTIVES).toEqual([
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ]);
    expect(CONTENT_SECURITY_POLICY).toBe(CSP_DIRECTIVES.join('; '));
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-eval');
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:/);
  });
});

describe('2.6 navigation and new windows', () => {
  const targets = [
    GAME_URL,
    'app://hakoniwa/other.html',
    KEY_ENTRY_URL,
    'https://example.com/',
    'http://127.0.0.1:5180/',
    'file:///C:/Windows/win.ini',
    'javascript:alert(1)',
    'data:text/html,hi',
  ];

  it('the rule allows no navigation at all', () => {
    for (const url of targets) expect(navigationAllowed(url), url).toBe(false);
  });

  it('every web contents blocks will-navigate, will-redirect and will-frame-navigate', async () => {
    const { fake } = await boot();
    void invoke(fake, HK.llmSecretEnter.name, { connectionId: 'c1' });
    await flush();
    expect(fake.windows.length).toBe(2);
    for (const w of fake.windows) {
      for (const event of ['will-navigate', 'will-redirect', 'will-frame-navigate']) {
        expect(w.webContents.count(event), event).toBe(1);
        for (const url of targets) {
          const ev = navEvent(url);
          w.webContents.emit(event, ev);
          expect(ev.prevented, `${event} ${url}`).toBe(true);
        }
      }
      const attach = navEvent('');
      w.webContents.emit('will-attach-webview', attach, {}, {});
      expect(attach.prevented).toBe(true);
      for (const url of targets)
        expect(w.webContents.openHandler?.({ url })).toEqual({ action: 'deny' });
    }
  });
});

describe('2.6 permissions', () => {
  it('grants fullscreen and pointer lock only', async () => {
    expect([...ALLOWED_PERMISSIONS].sort()).toEqual(['fullscreen', 'pointerLock']);
    const { fake } = await boot();
    const asked = [
      'fullscreen',
      'pointerLock',
      'media',
      'geolocation',
      'notifications',
      'clipboard-read',
      'clipboard-sanitized-write',
      'openExternal',
      'display-capture',
      'keyboardLock',
      'window-management',
      'fileSystem',
      'unknown',
    ];
    const granted: string[] = [];
    for (const p of asked) {
      fake.permission.request?.({}, p, (ok) => {
        if (ok) granted.push(p);
      });
      expect(fake.permission.check?.({}, p), p).toBe(p === 'fullscreen' || p === 'pointerLock');
    }
    expect(granted).toEqual(['fullscreen', 'pointerLock']);
    expect(fake.permission.device?.()).toBe(false);
  });
});

describe('2.6 fuses, remote debugging and environment', () => {
  it('pins the release fuses', () => {
    expect(RELEASE_FUSES).toEqual({
      runAsNode: false,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
      enableCookieEncryption: true,
    });
  });

  it('only the e2e channel accepts a remote debugging port', () => {
    const argv = ['hakoniwa.exe', '--remote-debugging-port=9222'];
    for (const ch of BUILD_CHANNELS)
      expect(remoteDebuggingRejected(argv, ch), ch).toBe(ch !== 'e2e');
    expect(remoteDebuggingRejected(['x', '--remote-debugging-port', '9222'], 'steam')).toBe(true);
    expect(remoteDebuggingRejected(['x', '--inspect-brk'], 'steam')).toBe(false);
  });

  it('a Steam build started with a debugging port exits before doing anything', async () => {
    const { fake, handle } = await boot(
      { packaged: true, argv: ['hakoniwa.exe', '--remote-debugging-port=9222'] },
      { channel: 'steam' },
    );
    expect(handle.started).toBe(false);
    expect(fake.exitCodes).toEqual([1]);
    expect(fake.calls).toEqual([]);
    expect(fake.windows).toEqual([]);
    expect(fake.ipcHandlers.size).toBe(0);
  });

  it('an e2e build with a debugging port starts normally', async () => {
    const { fake, handle } = await boot(
      { packaged: true, argv: ['hakoniwa.exe', '--remote-debugging-port=9222'] },
      { channel: 'e2e' },
    );
    expect(handle.started).toBe(true);
    expect(fake.windows.length).toBe(1);
  });

  it('a packaged build trusts its stamp and ignores the environment', () => {
    const env = { HK_CHANNEL: 'e2e' };
    expect(
      resolveBuildInfo({ packaged: true, version: '1.0.0', stamp: { channel: 'steam-demo' }, env })
        .channel,
    ).toBe('steam-demo');
    expect(resolveBuildInfo({ packaged: true, version: '1.0.0', stamp: null, env }).channel).toBe(
      'steam',
    );
    expect(
      resolveBuildInfo({ packaged: true, version: '1.0.0', stamp: { channel: 'nightly' }, env })
        .channel,
    ).toBe('steam');
    expect(resolveBuildInfo({ packaged: false, version: '0.1.0', env }).channel).toBe('e2e');
    expect(resolveBuildInfo({ packaged: false, version: '0.1.0', env: {} }).channel).toBe(
      'internal',
    );
    expect(
      resolveBuildInfo({ packaged: false, version: '0.1.0', env: { HK_CHANNEL: 'prod' } }).channel,
    ).toBe('internal');
  });

  it('the GPU preference has the one rescue switch', async () => {
    expect(gpuSwitches({})).toEqual(['force_high_performance_gpu']);
    expect(gpuSwitches({ HK_DISABLE_GPU_FORCE: '1' })).toEqual([]);
    const a = await boot();
    expect(a.fake.switches).toEqual(['force_high_performance_gpu']);
    const b = await boot({ env: { HK_DISABLE_GPU_FORCE: '1' } });
    expect(b.fake.switches).toEqual([]);
  });
});

describe('2.6 single instance and user data', () => {
  it('fixes the user data directory before taking the lock', async () => {
    const { fake, install } = await boot();
    expect(fake.calls.indexOf('setPath:userData')).toBeLessThan(
      fake.calls.indexOf('requestSingleInstanceLock'),
    );
    expect(fake.paths.userData).toBe(userDataDir(install.appData));
    expect(fake.paths.userData?.endsWith('HakoniwaChronicle')).toBe(true);
  });

  it('a second launch quits without a window', async () => {
    const { fake, handle } = await boot({ lock: false });
    expect(handle.started).toBe(false);
    expect(fake.quitCalls).toBe(1);
    expect(fake.windows).toEqual([]);
    expect(fake.schemes).toEqual([]);
  });

  it('the running instance restores and focuses its window on second-instance', async () => {
    const { fake } = await boot();
    const w = gameWindow(fake);
    w.minimized = true;
    fake.appEvents.emit('second-instance', {}, ['hakoniwa.exe']);
    expect(w.minimized).toBe(false);
    expect(w.focused).toBe(1);
  });
});

describe('2.6 log redaction', () => {
  it('scrubs key shapes, bearer tokens and credential headers', () => {
    const lines = [
      'key sk-ant-api03-AbCdEf_123-xyz rejected',
      'openai sk-proj-1234567890abcdef',
      'auth: Bearer abc.def.ghi',
      'headers {"x-api-key":"k-123456789"}',
      'Authorization: Bearer zzz',
      'api-key=qwerty12345',
    ];
    const out = lines.map((l) => redact(l));
    expect(out[0]).toBe('key sk-ant-[redacted] rejected');
    expect(out[1]).toBe('openai sk-[redacted]');
    expect(out[2]).toBe('auth: Bearer [redacted]');
    expect(out[3]).toBe('headers {"x-api-key":"[redacted]"}');
    expect(out[4]).toBe('Authorization: Bearer [redacted]');
    expect(out[5]).toBe('api-key=[redacted]');
    for (const o of out) expect(o).not.toMatch(/AbCdEf|1234567890|abc\.def|k-1234|zzz|qwerty/);
  });

  it('scrubs any fragment of a held key, and keeps ordinary text', () => {
    const held = 'hk0TESTxKEYxVALUEx9z8y7w6v';
    const msg = `provider said: invalid token ...xKEYxVALUEx9z8... for request r-1`;
    const out = redact(msg, [held]);
    expect(out).not.toContain('KEYxVALUE');
    expect(out).toContain('provider said: invalid token');
    expect(out).toContain('for request r-1');
    expect(redact('plain line, no secrets', [held])).toBe('plain line, no secrets');
    expect(redact('short pin 4321 here', ['4321'])).toBe('short pin [redacted] here');
  });

  it('keeps one line per call and caps its length', () => {
    expect(redact('a\nb\r\nc\u0000d')).toBe('a b c d');
    expect(redact('x'.repeat(MAX_LOG_MESSAGE + 50)).length).toBe(MAX_LOG_MESSAGE + 3);
  });

  it('rotates at the size limit and keeps one archive', () => {
    const files = new Map<string, string>();
    const fs = {
      appendFileSync: (p: string, d: string) => files.set(p, (files.get(p) ?? '') + d),
      statSync: (p: string) => ({ size: (files.get(p) ?? '').length }),
      renameSync: (a: string, b: string) => {
        files.set(b, files.get(a) ?? '');
        files.delete(a);
      },
      existsSync: (p: string) => files.has(p),
    };
    const log = createRotatingLog({ file: 'main.log', fs, maxBytes: 200, now: () => new Date(0) });
    for (let i = 0; i < 6; i++) log.write('info', 'main', `line ${i} ${'x'.repeat(40)}`);
    expect([...files.keys()].sort()).toEqual(['main.log', 'main.log.1']);
    expect((files.get('main.log') ?? '').length).toBeLessThanOrEqual(200);
    expect(files.get('main.log')).toContain('line 5');
  });

  it('a renderer log line with a key shape lands redacted in renderer.log', async () => {
    const { fake, handle } = await boot();
    const send = fake.ipcListeners.get(HK.log.name);
    send?.(ipcEvent(GAME_URL, 1), { level: 'warn', message: 'boom sk-ant-api03-LEAKED999' });
    const file = handle.layout()?.rendererLog ?? '';
    const text = readFileSync(file, 'utf8');
    expect(text).toContain('sk-ant-[redacted]');
    expect(text).not.toContain('LEAKED999');
  });
});

// ---------------------------------------------------------------------------
// 2.3 channel contract.

describe('2.3 channel whitelist', () => {
  it('pins the channel list', () => {
    expect(HK_CHANNEL_NAMES).toEqual([
      'hk:app.info',
      'hk:save.list',
      'hk:save.write',
      'hk:save.read',
      'hk:save.delete',
      'hk:save.recoverables',
      'hk:save.restore',
      'hk:save.importDemo',
      'hk:settings.get',
      'hk:settings.set',
      'hk:llm.request',
      'hk:llm.abort',
      'hk:llm.secret.enter',
      'hk:llm.secret.has',
      'hk:llm.secret.clear',
      'hk:llm.models',
      'hk:llm.test',
      'hk:llm.ledger',
      'hk:llm.wipe',
      'hk:llm.problem',
      'hk:steam.achieve',
      'hk:steam.stat',
      'hk:steam.presence',
      'hk:steam.status',
      'hk:diag.export',
      'hk:crash.pending',
      'hk:crash.send',
      'hk:window.mode',
      'hk:window.frameCap',
      'hk:shell.openExternal',
      'hk:log',
      'hk:event',
    ]);
    expect(KEY_ENTRY_CHANNEL_NAMES).toEqual(['hk:key.submit', 'hk:key.paste', 'hk:key.cancel']);
    const all = [...HK_CHANNEL_NAMES, ...KEY_ENTRY_CHANNEL_NAMES];
    expect(new Set(all).size).toBe(all.length);
    for (const n of all) expect(n.startsWith('hk:')).toBe(true);
  });

  it('the shell registers exactly the table, by kind, and nothing else', async () => {
    const { fake } = await boot();
    const defs = Object.values(HK);
    const invokes = defs.filter((d) => d.kind === 'invoke').map((d) => d.name);
    const listens = defs.filter((d) => d.kind === 'send' || d.kind === 'port').map((d) => d.name);
    expect([...fake.ipcHandlers.keys()].sort()).toEqual(
      [...invokes, KEY_ENTRY.submit.name, KEY_ENTRY.paste.name].sort(),
    );
    expect([...fake.ipcListeners.keys()].sort()).toEqual(
      [...listens, KEY_ENTRY.cancel.name].sort(),
    );
    expect(defs.filter((d) => d.kind === 'push').map((d) => d.name)).toEqual([
      'hk:llm.problem',
      'hk:event',
    ]);
  });

  it('every invoke and send channel has exactly one handler', () => {
    const handlers = createHandlers({
      build: resolveBuildInfo({ packaged: false, version: '0', env: {} }),
      platform: 'win32',
      gateway: {
        call: async () => ({ ok: true, value: null }),
        forward() {},
        abort() {},
        dispose() {},
      },
      enterKey: async () => ({ ok: false, reason: 'busy' }),
      openExternal: async () => {},
      setFullScreen: () => {},
      isFullScreen: () => false,
      rendererLog: { write() {} },
    });
    expect(handlerCoverage(handlers)).toEqual({ missing: [], extra: [] });
  });
});

describe('2.3 sender check', () => {
  it('trusts only the top frame of the expected origin', () => {
    expect(isTrustedSender({ url: GAME_URL, parent: null }, GAME_ORIGIN)).toBe(true);
    expect(isTrustedSender({ url: 'app://hakoniwa/a/b.html?x#y' }, GAME_ORIGIN)).toBe(true);
    expect(isTrustedSender({ url: GAME_URL, parent: {} }, GAME_ORIGIN)).toBe(false);
    expect(isTrustedSender(null, GAME_ORIGIN)).toBe(false);
    expect(isTrustedSender({ url: KEY_ENTRY_URL }, GAME_ORIGIN)).toBe(false);
    expect(isTrustedSender({ url: 'app://hakoniwa.evil/index.html' }, GAME_ORIGIN)).toBe(false);
    expect(isTrustedSender({ url: 'http://127.0.0.1:5180/' }, GAME_ORIGIN)).toBe(false);
    expect(isTrustedSender({ url: 'not a url' }, GAME_ORIGIN)).toBe(false);
  });

  it('refuses game channels from any other page before the handler runs', async () => {
    const { fake } = await boot();
    for (const from of [KEY_ENTRY_URL, 'https://example.com/', 'file:///C:/x.html']) {
      expect(await invoke(fake, HK.appInfo.name, undefined, from)).toEqual({
        ok: false,
        reason: 'forbidden',
      });
    }
    const h = fake.ipcHandlers.get(HK.appInfo.name);
    expect(await h?.(ipcEvent(GAME_URL, 1, { parent: {} }))).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await h?.(ipcEvent(GAME_URL, 1, { frame: null }))).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await invoke(fake, HK.appInfo.name)).toMatchObject({
      ok: true,
      value: { channel: 'internal', platform: 'win32' },
    });
  });

  it('refuses key entry channels from the game page and from a stale key window', async () => {
    const { fake } = await boot();
    const game = gameWindow(fake);
    expect(
      await invoke(
        fake,
        KEY_ENTRY.submit.name,
        { secret: 'k'.repeat(20) },
        GAME_URL,
        game.webContents.id,
      ),
    ).toEqual({ ok: false, reason: 'failed' });
    // No key window is open: even the key entry origin is refused.
    expect(
      await invoke(fake, KEY_ENTRY.submit.name, { secret: 'k'.repeat(20) }, KEY_ENTRY_URL, 999),
    ).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(fake.children.flatMap((c) => c.received)).toEqual([]);
  });
});

describe('2.3 parameter checks', () => {
  const ctx = { origin: GAME_ORIGIN, limiter: new RateLimiter(() => 0) };
  const frame = { url: GAME_URL, parent: null };
  const check = (def: (typeof HK)[keyof typeof HK], payload?: unknown) =>
    guardCall(def as never, frame, payload === undefined ? [] : [payload], {
      ...ctx,
      limiter: new RateLimiter(() => 0),
    });
  const sha = 'a'.repeat(64);

  const cases: [keyof typeof HK, unknown[], unknown[]][] = [
    ['appInfo', [undefined], [{}, 'x']],
    [
      'saveWrite',
      [
        {
          runId: 'r-0123abcd',
          slotId: 'manual_07',
          files: [{ sha256: sha, kind: 'snapshot', bytes: new Uint8Array(4) }],
          header: { format: 'hakoniwa-save', container: 1 },
        },
      ],
      [
        { runId: 'r-0123abcd', slotId: 'manual_21', files: [], header: {} },
        { runId: '../evil', slotId: 'quick', files: [], header: {} },
        {
          runId: 'r-0123abcd',
          slotId: 'quick',
          files: [{ sha256: 'zz', kind: 'snapshot', bytes: new Uint8Array(1) }],
          header: {},
        },
        {
          runId: 'r-0123abcd',
          slotId: 'quick',
          files: [{ sha256: sha, kind: 'exe', bytes: new Uint8Array(1) }],
          header: {},
        },
        {
          runId: 'r-0123abcd',
          slotId: 'quick',
          files: [{ sha256: sha, kind: 'snapshot', bytes: 'text' }],
          header: {},
        },
        { runId: 'r-0123abcd', slotId: 'quick', files: [], header: {}, path: 'C:/' },
      ],
    ],
    [
      'saveRead',
      [{ slotId: 'auto_1', hashes: [sha] }],
      [
        { slotId: 'auto_9', hashes: [] },
        { slotId: 'quick', hashes: ['../x'] },
        { slotId: 'quick' },
      ],
    ],
    ['saveDelete', [{ slotId: 'ironman' }], [{ slotId: 'slots/quick' }, { slot: 'quick' }]],
    ['settingsGet', [{ part: 'sync' }, { part: 'local' }], [{ part: 'secrets' }, {}]],
    [
      'settingsSet',
      [{ part: 'local', values: { quality: 'mid', window: { w: 1280 } } }],
      [
        { part: 'local', values: { f: () => 1 } },
        { part: 'local', values: { n: Number.NaN } },
      ],
    ],
    [
      'llmSecretEnter',
      [{ connectionId: 'c1' }, { connectionId: 'conn_2', target: 'header:X-Org' }],
      [
        { connectionId: 'c 1' },
        { connectionId: 'c1', target: 'header:' },
        { connectionId: 'c1', secret: 'sk-x' },
      ],
    ],
    [
      'llmTest',
      [
        { connectionId: 'c1', depth: 'quick' },
        { connectionId: 'c1', depth: 'deep', models: ['m'] },
      ],
      [
        { connectionId: 'c1', depth: 'full' },
        { connectionId: 'c1', depth: 'quick', models: Array(9).fill('m') },
      ],
    ],
    ['llmLedger', [{ window: 'day' }], [{ window: 'week' }]],
    ['steamAchieve', [{ api: 'HK_ACT1_DONE' }], [{ api: 'ACH_X' }, { api: 'HK_lower' }]],
    ['windowMode', [{ mode: 'windowed' }], [{ mode: 'borderless' }]],
    ['windowFrameCap', [{ cap: 30 }, { cap: 'display' }], [{ cap: 144 }, { cap: '60' }]],
    [
      'shellOpenExternal',
      [{ url: 'https://steamcommunity.com/app/1' }],
      [{ url: 'short' }, { url: 7 }],
    ],
    [
      'log',
      [{ level: 'warn', message: 'x' }],
      [
        { level: 'debug', message: 'x' },
        { level: 'info', message: 'y'.repeat(8001) },
      ],
    ],
  ];

  it.each(cases)('%s accepts its payloads and refuses malformed ones', (key, good, bad) => {
    const def = HK[key];
    for (const p of good) expect(check(def, p).ok, JSON.stringify(p)).toBe(true);
    for (const p of bad) {
      const r = check(def, p);
      expect(r.ok, JSON.stringify(p)?.slice(0, 80)).toBe(false);
    }
  });

  it('refuses a second argument', () => {
    const r = guardCall(HK.appInfo as never, frame, [undefined, 'extra'], ctx);
    expect(r).toMatchObject({ ok: false, reason: 'bad_request' });
  });

  it('caps payload sizes per channel', () => {
    const huge = new Uint8Array(64 * 1024 * 1024 + 1);
    const r = check(HK.saveWrite, {
      runId: 'r-0123abcd',
      slotId: 'quick',
      files: [{ sha256: sha, kind: 'snapshot', bytes: huge }],
      header: {},
    });
    expect(r).toMatchObject({ ok: false, reason: 'too_large' });
    expect(
      check(HK.settingsSet, { part: 'local', values: { s: 'x'.repeat(200_000) } }),
    ).toMatchObject({
      ok: false,
      reason: 'too_large',
    });
  });

  it('never echoes a refused value in the error', () => {
    const r = check(HK.llmSecretEnter, { connectionId: 'c1', secret: 'sk-ant-SHOULDNOTAPPEAR' });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain('SHOULDNOTAPPEAR');
  });

  it('rate limits hk:log at 50 a second and model probes at 10 a minute shared', () => {
    let t = 0;
    const limiter = new RateLimiter(() => t);
    const call = (def: (typeof HK)[keyof typeof HK], p: unknown) =>
      guardCall(def as never, frame, [p], { origin: GAME_ORIGIN, limiter });
    const logs = Array.from({ length: 51 }, () => call(HK.log, { level: 'info', message: 'x' }).ok);
    expect(logs.filter(Boolean).length).toBe(50);
    t = 1000;
    expect(call(HK.log, { level: 'info', message: 'x' }).ok).toBe(true);
    const probes = Array.from({ length: 6 }, () => [
      call(HK.llmModels, { connectionId: 'c1' }).ok,
      call(HK.llmTest, { connectionId: 'c1', depth: 'quick' }).ok,
    ]).flat();
    expect(probes.filter(Boolean).length).toBe(10);
    expect(call(HK.llmModels, { connectionId: 'c1' })).toMatchObject({ reason: 'rate_limited' });
    t += 60_000;
    expect(call(HK.llmModels, { connectionId: 'c1' }).ok).toBe(true);
  });
});

describe('hk:llm.request (main guard: items 1 to 3 of llm_providers.md 7.4)', () => {
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
  const send = async (payload: unknown, ports = [fakePort()], from = GAME_URL) => {
    const { fake } = await boot();
    fake.ipcListeners.get(HK.llmRequest.name)?.(ipcEvent(from, 1, { ports }), payload);
    await flush();
    return { fake, ports };
  };
  const answer = (port: { messages: unknown[] }) =>
    port.messages[0] as {
      t: string;
      result: { ok: boolean; problem?: string; error?: { cls: string } };
    };

  it('answers not_configured for a well-formed spec while no connection is saved', async () => {
    const { fake, ports } = await send(spec());
    const port = ports[0];
    if (!port) throw new Error('no port');
    expect(answer(port)).toMatchObject({
      t: 'error',
      result: { ok: false, problem: 'not_configured' },
    });
    expect(port.closed).toBe(true);
    expect(fake.children).toEqual([]);
  });

  it('refuses extra fields, addresses, headers and oversized specs as defects', async () => {
    for (const bad of [
      spec({ url: 'https://evil.example/v1' }),
      spec({ headers: { 'x-api-key': 'k' } }),
      spec({ segments: Array(65).fill({ role: 'turn', text: 'x' }) }),
      spec({ segments: [{ role: 'turn', text: 'x'.repeat(270 * 1024) }] }),
      'not an object',
    ]) {
      const { ports, fake } = await send(bad);
      const port = ports[0];
      if (!port) throw new Error('no port');
      expect(answer(port)).toMatchObject({
        t: 'error',
        result: { ok: false, error: { cls: 'bad_request' } },
      });
      expect(answer(port).result.problem).toBeUndefined();
      expect(port.closed).toBe(true);
      expect(fake.children).toEqual([]);
    }
  });

  it('closes the port of an untrusted sender without answering', async () => {
    const { ports } = await send(spec(), [fakePort()], 'https://example.com/');
    expect(ports[0]?.messages).toEqual([]);
    expect(ports[0]?.closed).toBe(true);
  });

  it('wants exactly one port', async () => {
    const two = [fakePort(), fakePort()];
    await send(spec(), two);
    for (const p of two) expect(p.closed).toBe(true);
    const { fake } = await boot();
    expect(() =>
      fake.ipcListeners.get(HK.llmRequest.name)?.(ipcEvent(GAME_URL, 1, { ports: [] }), spec()),
    ).not.toThrow();
  });
});

describe('hk:shell.openExternal', () => {
  it('opens https links to listed hosts only', async () => {
    expect([...EXTERNAL_HOSTS]).toContain('console.anthropic.com');
    const { fake } = await boot();
    const open = (url: string) => invoke(fake, HK.shellOpenExternal.name, { url });
    expect(await open('https://console.anthropic.com/settings/keys')).toEqual({
      ok: true,
      value: null,
    });
    for (const url of [
      'http://console.anthropic.com/',
      'https://console.anthropic.com.evil.example/',
      'https://user:pw@steamcommunity.com/',
      'https://steamcommunity.com:8443/',
      'https://example.com/',
      'file:///C:/Windows/System32/calc.exe',
      'javascript:alert(1)',
    ]) {
      expect(externalUrlAllowed(url), url).toBe(false);
      expect(await open(url), url).toEqual({ ok: false, reason: 'forbidden' });
    }
    expect(await open('https://STORE.steampowered.com/app/1?q=a b')).toEqual({
      ok: true,
      value: null,
    });
    expect(fake.opened).toEqual([
      'https://console.anthropic.com/settings/keys',
      'https://store.steampowered.com/app/1?q=a%20b',
    ]);
  });
});

describe('key entry window (llm_providers.md 5.5; release_engineering.md 2.5)', () => {
  it('opens one modal, isolated window from its own origin and returns only the status', async () => {
    const { fake, handle, install } = await boot();
    const game = gameWindow(fake);
    const pending = invoke(fake, HK.llmSecretEnter.name, { connectionId: 'c1' });
    await flush();
    expect(await invoke(fake, HK.llmSecretEnter.name, { connectionId: 'c2' })).toEqual({
      ok: false,
      reason: 'busy',
    });
    const keyWin = fake.windows[1];
    if (!keyWin) throw new Error('no key window');
    const prefs = keyWin.options.webPreferences ?? {};
    for (const [k, v] of Object.entries(SECURE_WEB_PREFERENCES))
      expect(prefs[k as keyof typeof prefs]).toBe(v);
    expect(prefs.devTools).toBe(false);
    expect(prefs.preload).toBe(install.options().keyEntryPreload);
    expect(keyWin.options.modal).toBe(true);
    expect(keyWin.options.parent).toBe(game);
    expect(keyWin.loaded).toEqual([KEY_ENTRY_URL]);

    const secret = 'hk-test-0000-FAKEKEYVALUE-7788';
    const from = (url: string, id: number) => (payload?: unknown) =>
      fake.ipcHandlers.get(KEY_ENTRY.submit.name)?.(ipcEvent(url, id), payload);
    // The game page cannot submit, even while the key window is open.
    expect(await from(GAME_URL, game.webContents.id)({ secret })).toEqual({
      ok: false,
      reason: 'failed',
    });
    // A bad key gets a reason code, never the key back.
    const bad = await from(KEY_ENTRY_URL, keyWin.webContents.id)({ secret: 'has space' });
    expect(bad).toEqual({ ok: false, reason: 'bad_chars' });
    expect(await from(KEY_ENTRY_URL, keyWin.webContents.id)({ secret })).toEqual({ ok: true });
    const result = await pending;
    expect(result).toEqual({
      ok: true,
      value: { state: 'session_only', backend: 'memory_only', last4: '7788' },
    });
    expect(keyWin.destroyed).toBe(true);

    // Nothing the game page can read carries the key: answers, pushes, logs.
    const has = await invoke(fake, HK.llmSecretHas.name, { connectionId: 'c1' });
    const seen = JSON.stringify([result, has, game.webContents.sent]);
    expect(seen).not.toContain('FAKEKEYVALUE');
    const mainLog = readFileSync(handle.layout()?.mainLog ?? '', 'utf8');
    expect(mainLog).not.toContain('FAKEKEYVALUE');
  });

  it('paste reads the clipboard in the main process', async () => {
    const { fake } = await boot();
    const pending = invoke(fake, HK.llmSecretEnter.name, { connectionId: 'c9' });
    await flush();
    const keyWin = fake.windows[1];
    if (!keyWin) throw new Error('no key window');
    fake.clipboardText = '  pasted-key-value-0042\n';
    const paste = fake.ipcHandlers.get(KEY_ENTRY.paste.name);
    expect(await paste?.(ipcEvent(KEY_ENTRY_URL, keyWin.webContents.id))).toEqual({ ok: true });
    expect(await pending).toMatchObject({ ok: true, value: { last4: '0042' } });
  });

  it('cancel closes the window and reports the current status', async () => {
    const { fake } = await boot();
    const pending = invoke(fake, HK.llmSecretEnter.name, { connectionId: 'c3' });
    await flush();
    const keyWin = fake.windows[1];
    if (!keyWin) throw new Error('no key window');
    fake.ipcListeners.get(KEY_ENTRY.cancel.name)?.(ipcEvent(KEY_ENTRY_URL, keyWin.webContents.id));
    expect(await pending).toEqual({ ok: true, value: { state: 'none', backend: 'memory_only' } });
  });
});
