// The settings model and the renderer's SettingsStore (docs/50_tech/release_engineering.md
// 5.2, 13.10; D-088): typed defaults of both parts, per-field checks, versions and migration,
// the one-time move of the three legacy local storage keys, round trips through the memory
// and web hosts (corrupt web parts kept as .bad), and the llm partition shared with the AI
// bridge through one write queue.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_AI_SWITCH_KEY, readLlmPartition } from '../src/ai/llm_config/migrate';
import { SETTINGS_VERSION as LLM_SETTINGS_VERSION } from '../src/ai/llm_config/settings';
import { AiBridge } from '../src/client/app/ai_bridge';
import { gatewayLedger, pageStorage } from '../src/client/app/platform_wiring';
import {
  checkPatch,
  defaultSettings,
  KEY_ACTIONS,
  type LocalSettings,
  normalizeSettings,
  SETTINGS_VERSION,
  type SyncSettings,
} from '../src/client/app/settings_schema';
import { LEGACY_KEYS, SettingsStore } from '../src/client/app/settings_store';
import { DEFAULT_VOLUMES } from '../src/client/audio/bus_model';
import { QUALITY_IDS } from '../src/client/hd2d/quality';
import { createMemoryHost } from '../src/platform/memory_host';
import { createWebHost, WEB_KEYS } from '../src/platform/web_host';
import { localConn, preset } from './fixtures/llm_config/fixtures';
import { FakeStorage, fakeIndexedDB } from './platform_fakes';

function kv(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

function webHost(storage = new FakeStorage()) {
  const host = createWebHost({
    version: '0.1.0',
    writerName: 'browser',
    storage,
    indexedDB: fakeIndexedDB().factory,
    randomBytes: (k) => new Uint8Array(k).fill(7),
  });
  return { host, storage };
}

const SYNC_DEFAULTS: SyncSettings = {
  version: 1,
  keys: {},
  contextKeys: {},
  padKeys: {},
  input: {
    padDeadInner: 0.15,
    padDeadOuter: 0.95,
    cameraSensitivity: 1,
    invertPitch: false,
    softLock: true,
    softLockKbm: false,
    softCone: 60,
    lockOnCast: true,
    rumble: 100,
    swapConfirmBack: false,
    glyphs: 'auto',
    holdSeconds: 0.5,
  },
  language: 'zh-Hans',
  accessibility: {
    colorMode: 'standard',
    textScale: 1,
    largeDialogue: false,
    reduceFlashing: 'system',
    holdToToggle: false,
    captionSize: 'standard',
    captionBackdrop: 75,
    captionPosition: 'bottom',
    captionColors: true,
  },
  subtitles: 'important',
  volume: { master: 100, music: 70, ambience: 80, sfx: 90, ui: 70, background: 'lower' },
  gameplay: { textSpeed: 30, autoAdvance: false, guidance: 'full' },
  audio: {
    output: 'stereo',
    dynamicRange: 'full',
    combatMusic: true,
    dialogueBlips: true,
    llmThinking: true,
    reduceLoud: false,
  },
};

const LOCAL_DEFAULTS: LocalSettings = {
  version: 1,
  onboardingDone: false,
  quality: 'auto',
  view: null,
  window: { mode: null, bounds: null, maximized: false },
  gpu: 'high_performance',
  frameCap: 60,
  installId: null,
  audioDevice: null,
};

/** A value other than the default for every field of each part. */
const SYNC_CHANGED: Omit<SyncSettings, 'version'> = {
  keys: { KeyQ: { action: 'interact' }, KeyE: null, Digit0: { action: 'hotbar', slot: 9 } },
  contextKeys: {
    'field.interact.primary': { code: 'KeyF', shift: true },
    'field.win_inventory.secondary': null,
  },
  padKeys: { 'field.appraise.primary': { button: 'y', hold: true }, 'field.mount.primary': null },
  input: {
    padDeadInner: 0.2,
    padDeadOuter: 0.9,
    cameraSensitivity: 1.5,
    invertPitch: true,
    softLock: false,
    softLockKbm: true,
    softCone: 90,
    lockOnCast: false,
    rumble: 40,
    swapConfirmBack: true,
    glyphs: 'playstation',
    holdSeconds: 0.8,
  },
  language: 'en',
  accessibility: {
    colorMode: 'red_green',
    textScale: 1.3,
    largeDialogue: true,
    reduceFlashing: 'on',
    holdToToggle: true,
    captionSize: 'xlarge',
    captionBackdrop: 100,
    captionPosition: 'top',
    captionColors: false,
  },
  subtitles: 'all',
  volume: { master: 50, music: 0, ambience: 10, sfx: 100, ui: 33, background: 'mute' },
  gameplay: { textSpeed: 'instant', autoAdvance: true, guidance: 'brief' },
  audio: {
    output: 'mono',
    dynamicRange: 'night',
    combatMusic: false,
    dialogueBlips: false,
    llmThinking: false,
    reduceLoud: true,
  },
};

const LOCAL_CHANGED: Omit<LocalSettings, 'version'> = {
  onboardingDone: true,
  quality: 'low',
  view: { stepIndex: 3, pitch: 64, yaw: 135 },
  window: { mode: 'windowed', bounds: { x: 10, y: 20, width: 1280, height: 720 }, maximized: true },
  gpu: 'system',
  frameCap: 30,
  installId: '0123456789abcdef',
  audioDevice: 'speakers-2',
  llm: { version: 1, preset: 'off' },
};

describe('settings schema', () => {
  it('has typed defaults for every field of both parts', () => {
    expect(defaultSettings('sync')).toEqual(SYNC_DEFAULTS);
    expect(defaultSettings('local')).toEqual(LOCAL_DEFAULTS);
    // Volumes come from the audio bus table, quality ids from the quality module.
    expect(SYNC_DEFAULTS.volume).toMatchObject(DEFAULT_VOLUMES);
    expect(QUALITY_IDS).toContain(LOCAL_DEFAULTS.quality);
    expect(SETTINGS_VERSION).toEqual({ sync: 1, local: 1 });
    expect(normalizeSettings('sync', null)).toMatchObject({
      values: SYNC_DEFAULTS,
      from: 'none',
      readOnly: false,
      issues: [],
    });
  });

  it('checks each field on its own: a bad value takes its default, the rest stay', () => {
    const n = normalizeSettings('sync', {
      version: 1,
      ...SYNC_CHANGED,
      language: 'klingon',
      accessibility: { ...SYNC_CHANGED.accessibility, textScale: 2, extra: true },
      volume: { ...SYNC_CHANGED.volume, music: 101, sfx: 12.5 },
      keys: {
        KeyQ: { action: 'interact' },
        KeyR: { action: 'fly' },
        Digit1: { action: 'hotbar' },
        KeyT: { action: 'menu', slot: 2 },
        '../x': null,
      },
    });
    expect(n.values.language).toBe('zh-Hans');
    expect(n.values.accessibility).toEqual({ ...SYNC_CHANGED.accessibility, textScale: 1 });
    expect(n.values.volume).toEqual({ ...SYNC_CHANGED.volume, music: 70, sfx: 90 });
    expect(n.values.keys).toEqual({ KeyQ: { action: 'interact' } });
    expect(n.values.subtitles).toBe('all');
    expect(n.issues.sort()).toEqual(
      [
        'language',
        'accessibility.textScale',
        'volume.music',
        'volume.sfx',
        'keys.KeyR',
        'keys.Digit1',
        'keys.KeyT',
        'keys.?',
      ].sort(),
    );

    const l = normalizeSettings('local', {
      version: 1,
      ...LOCAL_CHANGED,
      quality: 'ultra',
      view: { stepIndex: 99, pitch: 64, yaw: 0 },
      window: { mode: 'borderless', bounds: { x: 0, y: 0, width: 5, height: 5 }, maximized: 1 },
      frameCap: 144,
      gpu: 'discrete',
      installId: 'NOT-HEX',
      audioDevice: 42,
      onboardingDone: 'done',
      llm: 'on',
    });
    expect(l.values).toEqual({ ...LOCAL_DEFAULTS });
    expect(l.issues.sort()).toEqual(
      [
        'quality',
        'view',
        'window.mode',
        'window.bounds',
        'window.maximized',
        'frameCap',
        'gpu',
        'installId',
        'audioDevice',
        'onboardingDone',
        'llm',
      ].sort(),
    );
  });

  it('keeps unknown top-level fields and drops unknown fields inside known ones', () => {
    const n = normalizeSettings('local', {
      version: 1,
      quality: 'mid',
      futureFeature: { on: true },
      window: { mode: 'windowed', bounds: null, maximized: false, tabs: 3 },
    });
    expect(n.extra).toEqual({ futureFeature: { on: true } });
    expect(n.values.window).toEqual({ mode: 'windowed', bounds: null, maximized: false });
  });

  it('every key action is one the default key map binds', () => {
    for (const a of ['move_up', 'interact', 'hotbar', 'quick_save', 'view_reset']) {
      expect(KEY_ACTIONS.has(a as never), a).toBe(true);
    }
    // A patch is strict: a bad entry inside a structure refuses the whole field.
    expect(checkPatch('sync', { keys: { KeyQ: { action: 'hotbar', slot: 10 } } })).toEqual({
      ok: false,
      field: 'keys.KeyQ',
    });
    expect(
      checkPatch('sync', {
        accessibility: { ...SYNC_DEFAULTS.accessibility, textScale: 3 as never },
      }),
    ).toEqual({ ok: false, field: 'accessibility.textScale' });
    expect(checkPatch('sync', { keys: { KeyQ: { action: 'hotbar', slot: 9 } } })).toEqual({
      ok: true,
      patch: { keys: { KeyQ: { action: 'hotbar', slot: 9 } } },
    });
  });

  it('accepts a full turn of the camera and keeps local fields out of the sync part', () => {
    expect(checkPatch('local', { view: { stepIndex: 0, pitch: 36, yaw: 360 } }).ok).toBe(true);
    expect(checkPatch('local', { view: { stepIndex: 0, pitch: 36, yaw: 361 } }).ok).toBe(false);
    const n = normalizeSettings('sync', {
      version: 1,
      llm: { preset: 'single' },
      quality: 'low',
      futureSync: 1,
    });
    expect(n.extra).toEqual({ futureSync: 1 });
    expect(n.issues.sort()).toEqual(['llm', 'quality']);
  });

  it('migrates step by step from the stored version; a newer part is read-only', () => {
    const order: number[] = [];
    const migrations = {
      sync: {},
      local: {
        0: (r: Record<string, unknown>) => {
          order.push(0);
          return { ...r, quality: r.graphics };
        },
        1: (r: Record<string, unknown>) => {
          order.push(1);
          return { ...r, frameCap: r.fps === 'max' ? 'display' : 60 };
        },
      },
    };
    const versions = { sync: 1, local: 2 };
    const n = normalizeSettings('local', { graphics: 'low', fps: 'max' }, { migrations, versions });
    expect(order).toEqual([0, 1]);
    expect(n.from).toBe(0);
    expect(n.values).toMatchObject({ version: 2, quality: 'low', frameCap: 'display' });
    expect(n.extra).toEqual({ graphics: 'low', fps: 'max' });

    order.length = 0;
    const one = normalizeSettings('local', { version: 1, fps: 'max' }, { migrations, versions });
    expect(order).toEqual([1]);
    expect(one.values.frameCap).toBe('display');

    const newer = normalizeSettings(
      'local',
      { version: 3, quality: 'mid', added: 1 },
      {
        migrations,
        versions,
      },
    );
    expect(order).toEqual([1]);
    expect(newer).toMatchObject({
      readOnly: true,
      from: 3,
      values: { version: 3, quality: 'mid' },
    });
    expect(newer.raw).toEqual({ version: 3, quality: 'mid', added: 1 });

    // The shipped table: a part without a version has the version 1 layout.
    expect(normalizeSettings('local', { quality: 'flat' })).toMatchObject({
      from: 0,
      readOnly: false,
      values: { version: 1, quality: 'flat' },
    });
    expect(() =>
      normalizeSettings('sync', { version: 1 }, { migrations, versions: { sync: 2, local: 2 } }),
    ).toThrow(/no settings migration/);
  });
});

describe('SettingsStore', () => {
  it('round-trips every field of both parts through the host', async () => {
    const host = createMemoryHost();
    const a = await SettingsStore.open(host.settings);
    expect(a.sync).toEqual(SYNC_DEFAULTS);
    expect(a.local).toEqual(LOCAL_DEFAULTS);
    expect(host.settingsStore.size).toBe(0); // nothing written until something changes

    expect(a.updateSync(SYNC_CHANGED)).toBe(true);
    expect(a.updateLocal(LOCAL_CHANGED)).toBe(true);
    await a.flush();
    expect(host.settingsStore.get('sync')).toEqual({ version: 1, ...SYNC_CHANGED });
    expect(host.settingsStore.get('local')).toEqual({ version: 1, ...LOCAL_CHANGED });

    const b = await SettingsStore.open(host.settings);
    expect(b.sync).toEqual({ version: 1, ...SYNC_CHANGED });
    expect(b.local).toEqual({ version: 1, ...LOCAL_CHANGED });
  });

  it('refuses a bad patch whole and keeps unknown stored fields on write', async () => {
    const host = createMemoryHost();
    await host.settings.set('local', { version: 1, quality: 'mid', fromNewerBuild: [1, 2] });
    const s = await SettingsStore.open(host.settings);
    expect(s.updateLocal({ quality: 'ultra' as never, frameCap: 30 })).toBe(false);
    expect(s.updateLocal({ nope: 1 } as never)).toBe(false);
    expect(s.local.frameCap).toBe(60);
    expect(s.updateLocal({ frameCap: 30 })).toBe(true);
    await s.flush();
    expect(host.settingsStore.get('local')).toMatchObject({
      quality: 'mid',
      frameCap: 30,
      fromNewerBuild: [1, 2],
    });
  });

  it('coalesces writes and keeps a change made while a write is in flight', async () => {
    const host = createMemoryHost();
    const s = await SettingsStore.open(host.settings);
    const sent: Record<string, unknown>[] = [];
    const set = host.settings.set;
    let hold: (() => void) | null = null;
    host.settings.set = async (part, values) => {
      sent.push(values);
      if (hold === null && sent.length === 2) {
        // The second write waits until a newer change has been made.
        await new Promise<void>((r) => {
          hold = r;
        });
      }
      return set(part, values);
    };
    s.updateLocal({ quality: 'low' });
    s.updateLocal({ quality: 'mid' });
    s.updateLocal({ frameCap: 'display' });
    await s.flush();
    expect(sent.length).toBe(1);
    expect(host.settingsStore.get('local')).toMatchObject({ quality: 'mid', frameCap: 'display' });

    s.updateLocal({ quality: 'high' });
    const flushing = s.flush();
    while (hold === null) await new Promise((r) => setTimeout(r, 0));
    // The write of 'high' is in flight now; this change lands after it.
    s.updateLocal({ gpu: 'system' });
    (hold as () => void)();
    await flushing;
    // The in-flight answer (without the gpu change) did not overwrite the newer value.
    expect(s.local).toMatchObject({ quality: 'high', gpu: 'system' });
    await s.flush();
    expect(sent.length).toBe(3);
    expect(sent[1]).toMatchObject({ quality: 'high', gpu: 'high_performance' });
    expect(host.settingsStore.get('local')).toMatchObject({ quality: 'high', gpu: 'system' });
  });

  it('a write that throws does not stop the writes queued after it', async () => {
    const host = createMemoryHost();
    const s = await SettingsStore.open(host.settings);
    const set = host.settings.set;
    let n = 0;
    host.settings.set = async (part, values) => {
      if (n++ === 0) throw new Error('ipc gone');
      return set(part, values);
    };
    s.updateSync({ language: 'en' });
    await s.flush();
    expect(host.settingsStore.get('sync')).toBeUndefined();
    s.updateSync({ subtitles: 'off' });
    await s.flush();
    expect(host.settingsStore.get('sync')).toMatchObject({ language: 'en', subtitles: 'off' });
  });

  it('never writes a part it could not migrate', async () => {
    const host = createMemoryHost();
    const stored = { version: 1, quality: 'mid' };
    await host.settings.set('local', stored);
    const logs: string[] = [];
    // A build whose table lacks the step from version 1: the part cannot be read.
    const schema = { migrations: { sync: {}, local: {} }, versions: { sync: 1, local: 2 } };
    const s = await SettingsStore.open(host.settings, {
      schema,
      legacy: kv({ [LEGACY_KEYS.quality]: '"low"' }),
      log: (m) => logs.push(m),
    });
    expect(s.readOnly('local')).toBe(true);
    expect(s.local.quality).toBe('auto'); // defaults for this run
    s.updateLocal({ frameCap: 30 });
    await s.flush();
    expect(host.settingsStore.get('local')).toEqual(stored);
    expect(logs.some((m) => m.includes('could not be migrated'))).toBe(true);
  });

  it('uses a part from a newer version but never writes it', async () => {
    const host = createMemoryHost();
    const stored = { version: 9, quality: 'mid', newThing: true };
    await host.settings.set('local', stored);
    const s = await SettingsStore.open(host.settings);
    expect(s.readOnly('local')).toBe(true);
    expect(s.readOnly('sync')).toBe(false);
    expect(s.fromNewerVersion()).toBe(true);
    expect(s.local.quality).toBe('mid');
    expect(s.updateLocal({ quality: 'low' })).toBe(true);
    expect(s.local.quality).toBe('low'); // this run only
    await s.flush();
    expect(host.settingsStore.get('local')).toEqual(stored);
    expect(await s.llmPartStore().set('local', { llm: { preset: 'off' } })).toEqual({
      ok: false,
      reason: 'read_only',
    });
  });

  it('never writes a part the host could not read', async () => {
    const host = createMemoryHost();
    host.settings.get = async () => ({ ok: false, reason: 'unavailable' });
    let writes = 0;
    host.settings.set = async () => {
      writes++;
      return { ok: false, reason: 'failed' };
    };
    const s = await SettingsStore.open(host.settings, { legacy: kv({ 'hk.quality': '"low"' }) });
    expect(s.readOnly('sync') && s.readOnly('local')).toBe(true);
    s.updateSync({ language: 'en' });
    await s.flush();
    expect(writes).toBe(0);
    expect(await s.llmPartStore().get('local')).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('legacy keys (once)', () => {
  it('moves hk.quality and hk.view into the local part and removes the keys', async () => {
    const host = createMemoryHost();
    const view = { stepIndex: 4, pitch: 50, yaw: 90 };
    const legacy = kv({
      [LEGACY_KEYS.quality]: JSON.stringify('flat'),
      [LEGACY_KEYS.view]: JSON.stringify(view),
      unrelated: 'x',
    });
    const s = await SettingsStore.open(host.settings, { legacy });
    expect(s.local).toMatchObject({ quality: 'flat', view });
    expect(host.settingsStore.get('local')).toMatchObject({ quality: 'flat', view });
    expect([...legacy.m.keys()]).toEqual(['unrelated']);
    // A second start finds nothing to move.
    const again = await SettingsStore.open(host.settings, { legacy });
    expect(again.local).toMatchObject({ quality: 'flat', view });
  });

  it('a field already stored wins; bad legacy values are dropped', async () => {
    const host = createMemoryHost();
    await host.settings.set('local', { version: 1, quality: 'high' });
    const legacy = kv({ [LEGACY_KEYS.quality]: '"low"', [LEGACY_KEYS.view]: '{broken' });
    const s = await SettingsStore.open(host.settings, { legacy });
    expect(s.local.quality).toBe('high');
    expect(s.local.view).toBeNull();
    expect(legacy.m.size).toBe(0);
  });

  it('keeps the keys when the move cannot be written', async () => {
    const host = createMemoryHost();
    host.settings.set = async () => ({ ok: false, reason: 'failed' });
    const legacy = kv({ [LEGACY_KEYS.quality]: '"mid"', [LEGACY_KEYS.aiSwitch]: 'off' });
    const s = await SettingsStore.open(host.settings, { legacy });
    expect(s.local.quality).toBe('mid'); // in use for this run
    expect([...legacy.m.keys()].sort()).toEqual([LEGACY_KEYS.aiSwitch, LEGACY_KEYS.quality].sort());
  });

  it('moves the legacy model switch through the model settings migration', async () => {
    expect(LEGACY_KEYS.aiSwitch).toBe(LEGACY_AI_SWITCH_KEY);
    const expected = JSON.parse(
      JSON.stringify(readLlmPartition(null, { legacySwitch: 'off' }).settings),
    );
    expect(expected).toMatchObject({ version: LLM_SETTINGS_VERSION, preset: 'off' });

    // 'off' migrates everywhere: it never depends on the dev proxy.
    for (const defer of [false, true]) {
      const host = createMemoryHost();
      const legacy = kv({ [LEGACY_KEYS.aiSwitch]: 'off' });
      const s = await SettingsStore.open(host.settings, { legacy, deferLegacyAiOn: defer });
      expect(s.local.llm).toEqual(expected);
      expect(host.settingsStore.get('local')?.llm).toEqual(expected);
      expect(legacy.m.size).toBe(0);
    }

    // 'on' without a dev proxy (production builds) becomes "off" too, per llm_providers 4.7.
    const prod = createMemoryHost();
    const onKv = kv({ [LEGACY_KEYS.aiSwitch]: 'on' });
    await SettingsStore.open(prod.settings, { legacy: onKv, web: true });
    expect(prod.settingsStore.get('local')?.llm).toMatchObject({ preset: 'off' });
    expect(onKv.m.size).toBe(0);

    // Development builds leave 'on' for the AI bridge, which asks the dev proxy first.
    const dev = createMemoryHost();
    const devKv = kv({ [LEGACY_KEYS.aiSwitch]: 'on' });
    const ds = await SettingsStore.open(dev.settings, { legacy: devKv, deferLegacyAiOn: true });
    expect(ds.local.llm).toBeUndefined();
    expect(dev.settingsStore.size).toBe(0);
    expect(devKv.m.get(LEGACY_KEYS.aiSwitch)).toBe('on');

    // Once the partition exists, the switch is stale and goes; the partition is untouched.
    const llm = { version: 1, preset: 'single', tilt: 'standard' };
    await dev.settings.set('local', { version: 1, llm });
    const later = await SettingsStore.open(dev.settings, { legacy: devKv, deferLegacyAiOn: true });
    expect(later.local.llm).toEqual(llm);
    expect(devKv.m.size).toBe(0);
  });
});

describe('web host settings (D-088)', () => {
  it('round-trips both parts under hakoniwa.settings.sync and .local', async () => {
    const { host, storage } = webHost();
    const s = await SettingsStore.open(host.settings);
    s.updateSync({ language: 'zh-Hant', subtitles: 'off' });
    s.updateLocal({ quality: 'mid', frameCap: 'display' });
    await s.flush();
    expect(JSON.parse(storage.getItem(WEB_KEYS.settings('sync')) ?? 'null')).toMatchObject({
      version: 1,
      language: 'zh-Hant',
      subtitles: 'off',
    });
    expect(JSON.parse(storage.getItem(WEB_KEYS.settings('local')) ?? 'null')).toMatchObject({
      version: 1,
      quality: 'mid',
      frameCap: 'display',
    });
    const reload = await SettingsStore.open(webHost(storage).host.settings);
    expect(reload.sync).toMatchObject({ language: 'zh-Hant', subtitles: 'off' });
    expect(reload.local).toMatchObject({ quality: 'mid', frameCap: 'display' });
  });

  it('a corrupt part is kept as .bad and reads as defaults', async () => {
    const storage = new FakeStorage();
    storage.setItem(WEB_KEYS.settings('sync'), '{"version":1,"language":');
    storage.setItem(WEB_KEYS.settings('local'), '[1,2,3]');
    const s = await SettingsStore.open(webHost(storage).host.settings);
    expect(s.sync).toEqual(SYNC_DEFAULTS);
    expect(s.local).toEqual(LOCAL_DEFAULTS);
    expect(storage.getItem(`${WEB_KEYS.settings('sync')}.bad`)).toBe('{"version":1,"language":');
    expect(storage.getItem(`${WEB_KEYS.settings('local')}.bad`)).toBe('[1,2,3]');
    expect(storage.getItem(WEB_KEYS.settings('sync'))).toBeNull();
    s.updateSync({ language: 'en' });
    await s.flush();
    expect(JSON.parse(storage.getItem(WEB_KEYS.settings('sync')) ?? 'null')).toMatchObject({
      language: 'en',
    });
  });

  it('reports where saves and settings live', async () => {
    expect(await webHost().host.durability()).toEqual({ saves: true, settings: true });
    const none = createWebHost({
      version: '0.1.0',
      writerName: 'x',
      storage: null,
      indexedDB: null,
      randomBytes: (k) => new Uint8Array(k),
    });
    expect(await none.durability()).toEqual({ saves: false, settings: false });
    const denied = createWebHost({
      version: '0.1.0',
      writerName: 'x',
      storage: new FakeStorage(),
      indexedDB: fakeIndexedDB({ failOpen: true }).factory,
      randomBytes: (k) => new Uint8Array(k),
      console: { error: () => {}, warn: () => {}, info: () => {} },
    });
    expect(await denied.durability()).toEqual({ saves: false, settings: true });
    expect(await createMemoryHost().durability()).toEqual({ saves: false, settings: false });
  });
});

describe('the llm partition and the AI bridge', () => {
  it('the bridge writes only its partition, and later writes never clobber it', async () => {
    const host = createMemoryHost();
    const s = await SettingsStore.open(host.settings);
    s.updateLocal({ quality: 'low' });
    await s.flush();
    const bridge = new AiBridge(kv(), { platform: 'web', settingsStore: s.llmPartStore() });
    await bridge.probe();
    const local = preset(
      {
        preset: 'local',
        connectionId: 'conn_local',
        models: { high: 'qwen3:14b', low: 'qwen3:8b' },
      },
      localConn(),
    );
    expect(bridge.setSettings(local).ok).toBe(true);
    await bridge.flush();
    expect(host.settingsStore.get('local')).toMatchObject({
      quality: 'low',
      llm: { preset: 'local' },
    });
    expect(s.local.llm).toMatchObject({ preset: 'local' });
    // A settings change after the bridge wrote keeps the bridge's partition.
    s.updateLocal({ frameCap: 30 });
    await s.flush();
    expect(host.settingsStore.get('local')).toMatchObject({
      quality: 'low',
      frameCap: 30,
      llm: { preset: 'local' },
    });
    // A fresh start reads it back through the same path.
    const s2 = await SettingsStore.open(host.settings);
    const b2 = new AiBridge(kv(), { platform: 'web', settingsStore: s2.llmPartStore() });
    await b2.probe();
    expect(b2.settings().preset).toBe('local');
    expect(await s2.llmPartStore().set('local', { llm: 'x' })).toEqual({
      ok: false,
      reason: 'bad_request',
    });
  });
});

describe('platform wiring', () => {
  it('uses local storage only when the page may write it', () => {
    const storage = new FakeStorage();
    expect(pageStorage({ localStorage: storage })).toBe(storage);
    expect(storage.map.size).toBe(0);
    storage.full = true;
    expect(pageStorage({ localStorage: storage })).toBeNull();
    expect(pageStorage({})).toBeNull();
    const throwing = {
      get localStorage(): never {
        throw new Error('SecurityError');
      },
    };
    expect(pageStorage(throwing)).toBeNull();
  });

  it('seeds the budget from the gateway ledger when it answers, else nothing', async () => {
    const answers: Record<string, unknown> = {
      hour: { ok: true, value: { used: { tokens: 1200, usd: 0.5 } } },
      day: { ok: true, value: { tokens: 9000 } },
      run: { ok: false, reason: 'not_implemented' },
    };
    const gateway = {
      ledger: async ({ window }: { window: string }) => answers[window],
    } as never;
    expect(await gatewayLedger({ route: 'gateway', gateway })).toEqual({
      hour: { tokens: 1200, usd: 0.5 },
      day: { tokens: 9000 },
    });
    const none = { ledger: async () => ({ ok: false, reason: 'not_implemented' }) } as never;
    expect(await gatewayLedger({ route: 'gateway', gateway: none })).toBeNull();
    expect(await gatewayLedger({ route: 'loopback', endpointAllowed: () => true })).toBeNull();
  });
});

describe('purity', () => {
  it('the schema and the store touch no DOM, clock or randomness', () => {
    for (const file of ['settings_schema.ts', 'settings_store.ts']) {
      const code = readFileSync(join(__dirname, '..', 'src', 'client', 'app', file), 'utf8')
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // String contents (field paths such as `window.mode` are data, not the DOM).
        .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, "''");
      expect(code, file).not.toMatch(
        /\b(window\.|document\.|localStorage|indexedDB|Date\.now|Math\.random|performance\.)/,
      );
    }
  });
});
