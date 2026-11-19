// The desktop settings files and save handlers (docs/50_tech/release_engineering.md 2.3, 2.7,
// 5.2, 13.10; llm_providers.md 4.7, 7.4): settings.sync.json and settings.local.json written
// atomically with per-field checks, a corrupt file backed up as .bad, newer files never
// overwritten, the shell's own window and frame cap fields, the GPU preference, the llm
// partition behind the model request guard, and hk:save.* over the file save container, all
// driven through desktop/shell.ts with the fake Electron and a temp user data directory.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createHkBridge } from '../desktop/bridge';
import { HK } from '../desktop/ipc/channels';
import { createHandlers } from '../desktop/ipc/handlers';
import { BAD_SUFFIX, storageLayout, userDataDir } from '../desktop/paths';
import { gpuSwitches, resolveBuildInfo } from '../desktop/security';
import {
  checkLlmPartition,
  nodeSettingsIo,
  openDesktopSettings,
  type SettingsFileIo,
} from '../desktop/settings';
import { type ShellOptions, startShell } from '../desktop/shell';
import { initialPlacement, nextWindowSettings, visibleOn } from '../desktop/window_state';
import { defaultSettings } from '../src/client/app/settings_schema';
import { SettingsStore } from '../src/client/app/settings_store';
import { defaultInputSettings } from '../src/client/input/input_settings';
import type { SaveWriteRequest } from '../src/core/save/backend';
import { CONTAINER_VERSION, NO_FLAGS, SAVE_FORMAT, type SlotId } from '../src/core/save/header';
import { sha256Hex } from '../src/core/save/sha256';
import { createDesktopHost } from '../src/platform/desktop_host';
import {
  type FakeElectron,
  type FakeWindowInstance,
  fakeInstall,
  fakePort,
  flush,
  GAME_PAGE,
  ipcEvent,
  makeFakeElectron,
} from './desktop_fakes';
import { anthropicConn, preset } from './fixtures/llm_config/fixtures';
import { fakeIpc } from './platform_fakes';

const RUN = 'r-0123abcd';

function saveRequest(slot: SlotId, text: string): SaveWriteRequest {
  const bytes = new TextEncoder().encode(text);
  const sha256 = sha256Hex(bytes);
  return {
    runId: RUN,
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
      runId: RUN,
      savedAt: '2026-11-16T00:00:00.000Z',
      tick: 10,
      flags: { ...NO_FLAGS },
      summary: { act: 'act1', map: 'borderstone' },
      files: { snapshot: { sha256, bytes: bytes.length }, segments: [], anchors: [] },
    },
  };
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'hk-settings-'));
}

const quiet = () => {};

function files(dir: string) {
  return {
    path: (part: 'sync' | 'local') => join(dir, `settings.${part}.json`),
    read: (part: 'sync' | 'local') =>
      JSON.parse(readFileSync(join(dir, `settings.${part}.json`), 'utf8')) as Record<
        string,
        unknown
      >,
  };
}

// ---------------------------------------------------------------------------
// The settings files on their own.

describe('desktop settings files', () => {
  it('answers null until written, then round-trips every field of both parts', async () => {
    const dir = tempDir();
    const f = files(dir);
    const s = openDesktopSettings({ path: f.path, log: quiet, internalBuild: false });
    expect(s.get('sync')).toBeNull();
    expect(s.get('local')).toBeNull();
    expect(s.local()).toEqual(defaultSettings('local'));

    const sync = {
      version: 1,
      keys: { KeyQ: { action: 'interact' } },
      contextKeys: { 'field.interact.primary': { code: 'KeyF' } },
      padKeys: { 'field.appraise.primary': { button: 'y' } },
      input: { ...defaultInputSettings(), softCone: 40, glyphs: 'switch' },
      language: 'en',
      accessibility: {
        colorMode: 'high_contrast',
        textScale: 1.15,
        largeDialogue: true,
        reduceFlashing: 'off',
        holdToToggle: true,
        captionSize: 'large',
        captionBackdrop: 50,
        captionPosition: 'top',
        captionColors: false,
      },
      subtitles: 'off',
      volume: { master: 1, music: 2, ambience: 3, sfx: 4, ui: 5, background: 'normal' },
      gameplay: { textSpeed: 60, autoAdvance: true, guidance: 'off' },
      audio: {
        output: 'mono',
        dynamicRange: 'night',
        combatMusic: false,
        dialogueBlips: true,
        llmThinking: false,
        reduceLoud: true,
      },
    };
    const wrote = await s.set('sync', sync);
    expect(wrote).toEqual({ ok: true, value: sync });
    expect(f.read('sync')).toEqual(sync);
    const local = {
      version: 1,
      quality: 'flat',
      view: { stepIndex: 2, pitch: 40, yaw: 10 },
      gpu: 'system',
      frameCap: 'display',
    };
    expect((await s.set('local', local)).ok).toBe(true);
    expect(f.read('local')).toEqual({ ...defaultSettings('local'), ...local });
    expect(readdirSync(dir).sort()).toEqual(['settings.local.json', 'settings.sync.json']);

    const again = openDesktopSettings({ path: f.path, log: quiet, internalBuild: false });
    expect(again.get('sync')).toEqual(sync);
    expect(again.local()).toMatchObject(local);
  });

  it('checks every field: bad values fall back, unknown top-level fields stay', async () => {
    const f = files(tempDir());
    const s = openDesktopSettings({ path: f.path, log: quiet, internalBuild: false });
    const r = await s.set('local', {
      version: 1,
      quality: 'ultra',
      frameCap: 144,
      future: { x: 1 },
      window: {
        mode: 'windowed',
        bounds: { x: 1, y: 2, width: 900, height: 600 },
        maximized: true,
      },
      installId: 'feedfeedfeedfeed',
    });
    expect(r.ok).toBe(true);
    const stored = f.read('local');
    expect(stored).toMatchObject({ quality: 'auto', frameCap: 60, future: { x: 1 } });
    // The page never writes the shell's own fields.
    expect(stored.window).toEqual({ mode: null, bounds: null, maximized: false });
    expect(stored.installId).toBeNull();
    expect(await s.set('local', { version: 2 })).toEqual({ ok: false, reason: 'bad_request' });
    expect(await s.set('sync', 'nope')).toEqual({ ok: false, reason: 'bad_request' });
  });

  it('reads a file saved with a byte order mark', () => {
    const f = files(tempDir());
    writeFileSync(f.path('local'), `\uFEFF${JSON.stringify({ version: 1, quality: 'low' })}`);
    const s = openDesktopSettings({ path: f.path, log: quiet, internalBuild: false });
    expect(s.local().quality).toBe('low');
    expect(existsSync(f.path('local') + BAD_SUFFIX)).toBe(false);
  });

  it('keeps a corrupt file as .bad, reads defaults, and writes a fresh file next', async () => {
    const dir = tempDir();
    const f = files(dir);
    writeFileSync(f.path('local'), '{"version":1,"quality":');
    writeFileSync(f.path('sync'), '"just a string"');
    const logs: string[] = [];
    const s = openDesktopSettings({
      path: f.path,
      log: (_l, m) => logs.push(m),
      internalBuild: false,
    });
    expect(s.get('local')).toBeNull();
    expect(s.get('sync')).toBeNull();
    expect(s.local()).toEqual(defaultSettings('local'));
    expect(readFileSync(f.path('local') + BAD_SUFFIX, 'utf8')).toBe('{"version":1,"quality":');
    expect(readFileSync(f.path('sync') + BAD_SUFFIX, 'utf8')).toBe('"just a string"');
    expect(existsSync(f.path('local'))).toBe(false);
    expect(logs.filter((m) => m.includes('.bad')).length).toBe(2);
    expect((await s.set('local', { version: 1, quality: 'mid' })).ok).toBe(true);
    expect(f.read('local')).toMatchObject({ quality: 'mid' });
    // The renderer's store sees the defaults too.
    const store = await SettingsStore.open({
      get: async (part) => ({ ok: true, value: s.get(part) }),
      set: (part, values) => s.set(part, values),
    });
    expect(store.local.quality).toBe('mid');
    expect(store.sync).toEqual(defaultSettings('sync'));
  });

  it('serves a file from a newer version but never writes over it', async () => {
    const f = files(tempDir());
    const newer = { version: 7, quality: 'mid', added: [1] };
    writeFileSync(f.path('local'), JSON.stringify(newer));
    const s = openDesktopSettings({ path: f.path, log: quiet, internalBuild: false });
    expect(s.get('local')).toEqual(newer);
    expect(await s.set('local', { version: 1, quality: 'low' })).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(await s.patchLocal({ frameCap: 30 })).toEqual({ ok: false, reason: 'failed' });
    expect(f.read('local')).toEqual(newer);
  });

  it('writes through a temp file and keeps the old file when a write fails', async () => {
    const dir = tempDir();
    const f = files(dir);
    const real = nodeSettingsIo([]);
    let fail = false;
    const io: SettingsFileIo = {
      ...real,
      writeAtomic: async (path, text) => {
        if (fail) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
        await real.writeAtomic(path, text);
      },
    };
    const s = openDesktopSettings({ path: f.path, io, log: quiet, internalBuild: false });
    expect((await s.set('sync', { version: 1, language: 'en' })).ok).toBe(true);
    expect(readdirSync(dir)).toEqual(['settings.sync.json']);
    fail = true;
    expect(await s.set('sync', { version: 1, language: 'zh-Hant' })).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(s.get('sync')).toMatchObject({ language: 'en' });
    expect(f.read('sync')).toMatchObject({ language: 'en' });
  });

  it('checks the llm partition with the model settings rules and knows saved connections', async () => {
    const f = files(tempDir());
    const s = openDesktopSettings({ path: f.path, log: quiet, internalBuild: false });
    const llm = preset({ preset: 'single', connectionId: 'conn_a' }, anthropicConn());
    const dirty = {
      ...llm,
      junk: 1,
      privacy: { ...llm.privacy, developerMode: true },
    };
    expect((await s.set('local', { version: 1, llm: dirty })).ok).toBe(true);
    const stored = f.read('local').llm as Record<string, unknown>;
    expect(stored.junk).toBeUndefined();
    expect((stored.privacy as { developerMode: boolean }).developerMode).toBe(false);
    expect(s.connectionConfigured('conn_a')).toBe(true);
    expect(s.connectionConfigured('conn_b')).toBe(false);
    // A connection without enabled models is not configured.
    await s.set('local', {
      version: 1,
      llm: { ...llm, connections: [anthropicConn('conn_a', { models: [] })] },
    });
    expect(s.connectionConfigured('conn_a')).toBe(false);

    // Internal builds may keep developer mode (AQ-15); a newer partition is kept as it is.
    expect(
      (checkLlmPartition({ llm: dirty }, { internalBuild: true }).llm as typeof llm).privacy
        .developerMode,
    ).toBe(true);
    const future = { llm: { version: 99, whatever: true } };
    expect(checkLlmPartition(future, { internalBuild: false })).toEqual(future);
    // The page cannot slip an unchecked partition past by calling it newer.
    const sneaky = {
      version: 99,
      connections: [anthropicConn('conn_x')],
      privacy: { developerMode: true },
    };
    expect((await s.set('local', { version: 1, llm: sneaky })).ok).toBe(true);
    expect(f.read('local').llm).toBeUndefined();
    expect(s.connectionConfigured('conn_x')).toBe(false);
    expect(checkLlmPartition({ llm: 'x', a: 1 }, { internalBuild: false })).toEqual({ a: 1 });
  });
});

describe('window placement', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  it('opens where it was, or centred when that display is gone', () => {
    const stored = {
      mode: 'windowed' as const,
      bounds: { x: 100, y: 80, width: 1280, height: 720 },
      maximized: false,
    };
    const opts = { packaged: true, workAreas: [area], minWidth: 960, minHeight: 540 };
    expect(initialPlacement(stored, opts)).toEqual({
      fullscreen: false,
      bounds: { x: 100, y: 80, width: 1280, height: 720 },
      maximize: false,
    });
    const gone = { ...stored, bounds: { x: 2500, y: 80, width: 1280, height: 720 } };
    expect(initialPlacement(gone, opts).bounds).toEqual({ width: 1280, height: 720 });
    expect(initialPlacement(gone, { ...opts, workAreas: null }).bounds).toEqual({
      width: 1280,
      height: 720,
    });
    expect(visibleOn({ x: 1850, y: 0, width: 800, height: 600 }, [area])).toBe(false);
    // First start: fullscreen when packaged, windowed in development.
    const fresh = { mode: null, bounds: null, maximized: false };
    expect(initialPlacement(fresh, opts).fullscreen).toBe(true);
    expect(initialPlacement(fresh, { ...opts, packaged: false }).fullscreen).toBe(false);
  });

  it('records bounds in windowed use only and the mode only when toggled', () => {
    const stored = { mode: null, bounds: null, maximized: false };
    const seen = {
      fullscreen: false,
      maximized: false,
      minimized: false,
      normalBounds: { x: 1.4, y: 2.6, width: 1000, height: 700 },
    };
    expect(nextWindowSettings(stored, seen, false)).toEqual({
      mode: null,
      bounds: { x: 1, y: 3, width: 1000, height: 700 },
      maximized: false,
    });
    expect(nextWindowSettings(stored, { ...seen, fullscreen: true }, true)).toEqual({
      ...stored,
      mode: 'fullscreen',
    });
    expect(nextWindowSettings(stored, { ...seen, minimized: true }, false)).toEqual(stored);
  });
});

// ---------------------------------------------------------------------------
// Through the shell, with the fake Electron.

interface BoundsWindow extends FakeWindowInstance {
  bounds: { x: number; y: number; width: number; height: number };
  maximized: boolean;
}

function withBounds(fake: FakeElectron): void {
  const Base = fake.BrowserWindow as unknown as new (o: Record<string, unknown>) => object;
  class Win extends Base {
    bounds: { x: number; y: number; width: number; height: number };
    maximized = false;
    constructor(o: Record<string, unknown>) {
      super(o);
      this.bounds = {
        x: (o.x as number) ?? 50,
        y: (o.y as number) ?? 50,
        width: o.width as number,
        height: o.height as number,
      };
    }
    getNormalBounds() {
      return { ...this.bounds };
    }
    isMaximized() {
      return this.maximized;
    }
    maximize() {
      this.maximized = true;
    }
  }
  fake.BrowserWindow = Win as never;
  fake.screen = { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }] };
}

async function boot(
  install = fakeInstall(),
  extra: Partial<ShellOptions> & { packaged?: boolean; fill?: number } = {},
) {
  const { fill = 0xab, packaged, ...options } = extra;
  const fake = makeFakeElectron({ appData: install.appData, packaged });
  withBounds(fake);
  const handle = startShell(
    fake,
    install.options({
      randomBytes: (n) => new Uint8Array(n).fill(fill),
      windowSaveDelayMs: 0,
      ...options,
    }),
  );
  fake.makeReady();
  await handle.ready;
  await handle.settings()?.flush();
  const userData = userDataDir(install.appData);
  const invoke = async (name: string, payload?: unknown) => {
    const h = fake.ipcHandlers.get(name);
    if (!h) throw new Error(`no handler for ${name}`);
    return payload === undefined ? h(ipcEvent(GAME_PAGE, 1)) : h(ipcEvent(GAME_PAGE, 1), payload);
  };
  const game = fake.windows[0] as BoundsWindow;
  /** A desktop PlatformHost whose window.hk reaches this shell's real handlers. */
  const platform = () => {
    const ipc = fakeIpc();
    ipc.ipc.invoke = async (channel: string, ...args: unknown[]) =>
      invoke(channel, args.length ? args[0] : undefined);
    return createDesktopHost(createHkBridge(ipc.ipc));
  };
  return { fake, handle, install, userData, invoke, game, platform };
}

describe('hk:settings.* through the shell', () => {
  it('stores both parts in the user data directory and answers them back', async () => {
    const { invoke, userData, handle } = await boot();
    expect(await invoke(HK.settingsGet.name, { part: 'sync' })).toEqual({ ok: true, value: null });
    const r = (await invoke(HK.settingsSet.name, {
      part: 'sync',
      values: { version: 1, language: 'en', subtitles: 'all' },
    })) as { ok: boolean; value: Record<string, unknown> };
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ language: 'en', subtitles: 'all', volume: { master: 100 } });
    const layout = storageLayout(userData);
    expect(JSON.parse(readFileSync(layout.settingsSync, 'utf8'))).toEqual(r.value);
    expect(await invoke(HK.settingsGet.name, { part: 'sync' })).toEqual(r);
    // The local part holds the install id the shell made for the save writer.
    expect(handle.settings()?.local().installId).toBe('ab'.repeat(8));
  });

  it('the renderer store round-trips through the desktop host and the real handlers', async () => {
    const { invoke, install } = await boot();
    const ipc = fakeIpc((_channel, _payload) => undefined);
    // Route the bridge's invokes to the shell's handlers.
    ipc.ipc.invoke = async (channel: string, ...args: unknown[]) =>
      invoke(channel, args.length ? args[0] : undefined);
    const host = createDesktopHost(createHkBridge(ipc.ipc));
    const store = await SettingsStore.open(host.settings);
    store.updateSync({ language: 'zh-Hant', volume: { ...store.sync.volume, music: 10 } });
    store.updateLocal({ quality: 'low', frameCap: 30 });
    await store.flush();
    expect(store.local.installId).toBe('ab'.repeat(8)); // the shell's field came back

    const next = await boot(install);
    const ipc2 = fakeIpc();
    ipc2.ipc.invoke = async (channel: string, ...args: unknown[]) =>
      next.invoke(channel, args.length ? args[0] : undefined);
    const again = await SettingsStore.open(createDesktopHost(createHkBridge(ipc2.ipc)).settings);
    expect(again.sync).toMatchObject({ language: 'zh-Hant', volume: { music: 10 } });
    expect(again.local).toMatchObject({ quality: 'low', frameCap: 30 });
  });

  it('a corrupt settings file at start is kept as .bad and the game gets defaults', async () => {
    const install = fakeInstall();
    const userData = userDataDir(install.appData);
    mkdirSync(userData, { recursive: true });
    const layout = storageLayout(userData);
    writeFileSync(layout.settingsLocal, 'not json at all');
    const { invoke } = await boot(install);
    expect(readFileSync(layout.settingsLocal + BAD_SUFFIX, 'utf8')).toBe('not json at all');
    // The install id made at start is the only thing written so far.
    const local = (await invoke(HK.settingsGet.name, { part: 'local' })) as {
      value: Record<string, unknown>;
    };
    expect(local.value).toEqual({ ...defaultSettings('local'), installId: 'ab'.repeat(8) });
  });

  it('the GPU preference picks the Chromium switch at start', async () => {
    expect(gpuSwitches({}, 'system')).toEqual([]);
    const install = fakeInstall();
    const first = await boot(install);
    expect(first.fake.switches).toEqual(['force_high_performance_gpu']);
    await first.invoke(HK.settingsSet.name, {
      part: 'local',
      values: { version: 1, gpu: 'system' },
    });
    const second = await boot(install);
    expect(second.fake.switches).toEqual([]);
  });

  it('remembers the window position, size and fullscreen choice', async () => {
    const install = fakeInstall();
    const a = await boot(install);
    expect(a.game.options.fullscreen).toBe(false); // development run, first start
    a.game.bounds = { x: 222, y: 111, width: 1100, height: 650 };
    a.game.emit('move');
    a.game.emit('resize');
    await flush();
    await a.handle.settings()?.flush();
    expect(a.handle.settings()?.local().window).toEqual({
      mode: null,
      bounds: { x: 222, y: 111, width: 1100, height: 650 },
      maximized: false,
    });

    const b = await boot(install);
    expect(b.game.options).toMatchObject({ x: 222, y: 111, width: 1100, height: 650 });
    expect(b.game.options.fullscreen).toBe(false);
    // F11 is the player's choice: the next start opens fullscreen even in development.
    b.game.webContents.emit(
      'before-input-event',
      { preventDefault() {} },
      { type: 'keyDown', key: 'F11' },
    );
    await b.handle.settings()?.flush();
    expect(b.handle.settings()?.local().window.mode).toBe('fullscreen');
    const c = await boot(install);
    expect(c.game.options.fullscreen).toBe(true);
    // hk:window.mode records the choice too.
    await c.invoke(HK.windowMode.name, { mode: 'windowed' });
    await c.handle.settings()?.flush();
    expect(c.handle.settings()?.local().window.mode).toBe('windowed');
  });

  it('keeps the frame cap the page stored; hk:window.frameCap only applies it', async () => {
    const install = fakeInstall();
    const a = await boot(install);
    const store = await SettingsStore.open(a.platform().settings);
    store.updateLocal({ frameCap: 30 });
    await store.flush();
    // Applying another cap does not change what is stored (one writer: the page).
    expect(await a.invoke(HK.windowFrameCap.name, { cap: 'display' })).toEqual({
      ok: true,
      value: 'display',
    });
    await a.handle.settings()?.flush();
    expect(a.handle.settings()?.local().frameCap).toBe(30);
    // A later page write of another field keeps it.
    store.updateLocal({ quality: 'mid' });
    await store.flush();
    const b = await boot(install);
    expect(b.handle.settings()?.local()).toMatchObject({ frameCap: 30, quality: 'mid' });
  });

  it('the shell frame cap starts from the stored value and follows page writes', async () => {
    const f = files(tempDir());
    writeFileSync(f.path('local'), JSON.stringify({ version: 1, frameCap: 30 }));
    const settings = openDesktopSettings({ path: f.path, log: quiet, internalBuild: false });
    const deps = {
      build: resolveBuildInfo({ packaged: false, version: '0', env: {} }),
      platform: 'win32',
      gateway: {
        call: async () => ({ ok: true as const, value: null }),
        forward() {},
        abort() {},
        dispose() {},
      },
      enterKey: async () => ({ ok: false as const, reason: 'busy' as const }),
      openExternal: async () => {},
      setFullScreen: () => {},
      isFullScreen: () => false,
      rendererLog: { write() {} },
    };
    const handlers = createHandlers({ ...deps, settings });
    expect(handlers.frameCap()).toBe(30);
    await handlers.invoke.settingsSet?.({
      part: 'local',
      values: { version: 1, frameCap: 'display' },
    });
    expect(handlers.frameCap()).toBe('display');
    // Without the settings files and the saves the channels answer unavailable.
    const bare = createHandlers(deps);
    expect(await bare.invoke.settingsGet?.({ part: 'sync' })).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(await bare.invoke.saveList?.(undefined as never)).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('moves the legacy keys on the first desktop start, after the shell wrote the file', async () => {
    const { platform, handle } = await boot();
    // The shell already wrote a complete local part (defaults and the install id).
    expect(handle.settings()?.get('local')).toMatchObject({ quality: 'auto', view: null });
    const legacy = new Map([
      ['hk.quality', '"flat"'],
      ['hk.view', JSON.stringify({ stepIndex: 1, pitch: 70, yaw: 45 })],
    ]);
    const kv = {
      getItem: (k: string) => legacy.get(k) ?? null,
      removeItem: (k: string) => void legacy.delete(k),
    };
    const store = await SettingsStore.open(platform().settings, { legacy: kv });
    expect(store.local).toMatchObject({
      quality: 'flat',
      view: { stepIndex: 1, pitch: 70, yaw: 45 },
    });
    expect(handle.settings()?.local()).toMatchObject({
      quality: 'flat',
      installId: 'ab'.repeat(8),
    });
    expect(legacy.size).toBe(0);
  });

  it('an unreadable settings file is reported, so the page never writes it', async () => {
    const install = fakeInstall();
    const layout = storageLayout(userDataDir(install.appData));
    // A directory where the file should be: reading fails with something other than ENOENT.
    mkdirSync(layout.settingsSync, { recursive: true });
    const { invoke, platform } = await boot(install);
    expect(await invoke(HK.settingsGet.name, { part: 'sync' })).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    const store = await SettingsStore.open(platform().settings);
    expect(store.readOnly('sync')).toBe(true);
    expect(store.readOnly('local')).toBe(false);
    expect(await invoke(HK.settingsSet.name, { part: 'sync', values: { version: 1 } })).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('waits for settings writes and saves in progress before quitting', async () => {
    const { fake, handle } = await boot();
    const settings = handle.settings();
    if (!settings) throw new Error('no settings');
    void settings.patchLocal({ frameCap: 'display' });
    const ev = {
      prevented: false,
      preventDefault() {
        ev.prevented = true;
      },
    };
    fake.appEvents.emit('will-quit', ev);
    expect(ev.prevented).toBe(true);
    expect(fake.quitCalls).toBe(0);
    await settings.flush();
    await flush();
    expect(fake.quitCalls).toBe(1);
    expect(settings.local().frameCap).toBe('display');
    // The second will-quit (from that quit) goes through.
    const again = {
      prevented: false,
      preventDefault() {
        again.prevented = true;
      },
    };
    fake.appEvents.emit('will-quit', again);
    expect(again.prevented).toBe(false);
  });

  it('forwards a model request only for a saved connection with enabled models', async () => {
    const spec = {
      requestId: 'req-1',
      provider: 'anthropic',
      connectionId: 'conn_a',
      slot: 'mid',
      bindingRole: 'present_npc',
      model: 'claude-haiku-5-5',
      segments: [{ role: 'rules', text: 'x' }],
      output: { schemaId: 's', schema: { type: 'object' }, maxTokens: 100 },
      timeoutMs: 1000,
      reserve: { usd: 0.01, tokens: 100 },
    };
    const send = (fake: FakeElectron) => {
      const port = fakePort();
      fake.ipcListeners.get(HK.llmRequest.name)?.(ipcEvent(GAME_PAGE, 1, { ports: [port] }), spec);
      return port;
    };
    const install = fakeInstall();
    const a = await boot(install);
    const refused = send(a.fake);
    await flush();
    expect(refused.messages[0]).toMatchObject({ result: { problem: 'not_configured' } });
    expect(a.fake.children).toEqual([]);

    const llm = preset({ preset: 'single', connectionId: 'conn_a' }, anthropicConn());
    await a.invoke(HK.settingsSet.name, { part: 'local', values: { version: 1, llm } });
    send(a.fake);
    await flush();
    expect(a.fake.children.length).toBe(1); // passed the main guard, on to the gateway
  });
});

describe('hk:save.* through the shell', () => {
  it('saves, lists, reads and deletes files under <userData>/saves', async () => {
    const { invoke, userData, install } = await boot();
    const ipc = fakeIpc();
    ipc.ipc.invoke = async (channel: string, ...args: unknown[]) =>
      invoke(channel, args.length ? args[0] : undefined);
    const host = createDesktopHost(createHkBridge(ipc.ipc));
    expect(await host.durability()).toEqual({ saves: true, settings: true });
    expect(await host.saves.list()).toEqual([]);

    const req = saveRequest('manual_01', 'world at tick 10');
    const wrote = await host.saves.write(req);
    expect(wrote).toMatchObject({
      ok: true,
      header: { slot: 'manual_01', writerId: `w-${'ab'.repeat(8)}`, writerName: hostname() },
    });
    const sha = req.files[0]?.sha256 as string;
    const layout = storageLayout(userData);
    expect(existsSync(layout.snapshot(RUN, sha))).toBe(true);
    expect(existsSync(layout.slotHeader('manual_01'))).toBe(true);

    const slots = await host.saves.list();
    expect(slots.map((s) => [s.slot, s.header?.label])).toEqual([
      ['manual_01', 'world at tick 10'],
    ]);
    const read = await host.saves.read({ slotId: 'manual_01', hashes: [sha] });
    expect(read.ok && new TextDecoder().decode(read.files[0]?.bytes ?? undefined)).toBe(
      'world at tick 10',
    );
    // Only files the slot references can be read; failures come back in the container's shape.
    const other = sha256Hex(new TextEncoder().encode('elsewhere'));
    expect(await host.saves.read({ slotId: 'manual_01', hashes: [other] })).toMatchObject({
      ok: false,
      code: 'not_referenced',
    });
    const bad = saveRequest('quick', 'q');
    (bad.files[0] as { sha256: string }).sha256 = other;
    expect(await host.saves.write(bad)).toMatchObject({ ok: false });

    expect(Array.isArray(await host.saves.recoverables())).toBe(true);
    expect(await host.saves.restore({ candidateId: 'nope', slotId: 'manual_02' })).toMatchObject({
      ok: false,
      code: 'bad_request',
    });
    await host.saves.delete({ slotId: 'manual_01' });
    expect(await host.saves.list()).toEqual([]);
    expect(await invoke(HK.saveImportDemo.name, { candidateId: 'x' })).toEqual({
      ok: false,
      reason: 'not_implemented',
    });

    // The same machine keeps its writer id across starts (other random bytes this time).
    const next = await boot(install, { fill: 0xcd });
    const ipc2 = fakeIpc();
    ipc2.ipc.invoke = async (channel: string, ...args: unknown[]) =>
      next.invoke(channel, args.length ? args[0] : undefined);
    const host2 = createDesktopHost(createHkBridge(ipc2.ipc));
    const second = await host2.saves.write(saveRequest('quick', 'again'));
    expect(second).toMatchObject({ ok: true, header: { writerId: `w-${'ab'.repeat(8)}` } });
  });

  it('refuses malformed save payloads before the container sees them', async () => {
    const { invoke } = await boot();
    expect(await invoke(HK.saveRead.name, { slotId: 'manual_99', hashes: [] })).toEqual({
      ok: false,
      reason: 'bad_request',
    });
    expect(await invoke(HK.saveDelete.name, { slotId: '../slots/quick' })).toEqual({
      ok: false,
      reason: 'bad_request',
    });
  });
});

describe('desktop imports from the client', () => {
  it('the main process takes only the pure settings schema from src/client', () => {
    const DESKTOP = join(__dirname, '..', 'desktop');
    const CLIENT = join(__dirname, '..', 'src', 'client');
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (e.isDirectory()) return e.name === 'dist' ? [] : walk(join(dir, e.name));
        return e.name.endsWith('.ts') ? [join(dir, e.name)] : [];
      });
    const into: string[] = [];
    for (const file of walk(DESKTOP)) {
      for (const m of readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)) {
        const target = resolve(dirname(file), m[1] as string);
        const rel = relative(CLIENT, target);
        if (!rel.startsWith('..')) into.push(rel.split(/[\\/]/).join('/'));
      }
    }
    expect([...new Set(into)].sort()).toEqual(['app/settings_schema']);
    // And the schema itself reaches only pure client modules (no DOM, no three.js).
    const schema = readFileSync(join(CLIENT, 'app', 'settings_schema.ts'), 'utf8');
    const deps = [...schema.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
    expect(deps).toEqual([
      '../audio/audio_settings',
      '../audio/bus_model',
      '../hd2d/quality',
      '../hd2d/view',
      '../input/contexts',
      '../input/input_settings',
      '../input/keymap',
      '../input/pad_bindings',
    ]);
  });
});
