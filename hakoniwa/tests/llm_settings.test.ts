// The settings model (docs/50_tech/llm_providers.md 4.1, 4.4, 4.7, 5.4, 16.2): the four
// presets write the slots and bindings of 4.4 and 4.5; addresses follow the rules (cloud needs
// HTTPS, plain HTTP only for loopback and private ranges, the web demo only loopback and only
// local services, no credentials in the address); the legacy on/off switch migrates; settings
// from a newer version are read-only. Plus the client bridge's use of them.

import { describe, expect, it } from 'vitest';
import { BINDING_ROLES } from '../src/ai/contracts';
import {
  LEGACY_AI_SWITCH_KEY,
  migrateSettings,
  readLlmPartition,
  writeLlmPartition,
} from '../src/ai/llm_config/migrate';
import {
  ANTHROPIC_SINGLE,
  ANTHROPIC_TIERED,
  applyPreset,
  detectPreset,
  sharesFor,
} from '../src/ai/llm_config/presets';
import {
  consentPending,
  defaultSettings,
  enabledModels,
  isCloudConnection,
  SETTINGS_VERSION,
  validateSettings,
} from '../src/ai/llm_config/settings';
import { AiBridge, displayLevel } from '../src/client/app/ai_bridge';
import {
  anthropicConn,
  compatConn,
  localConn,
  preset,
  withConns,
} from './fixtures/llm_config/fixtures';

function store(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const modes = (s: ReturnType<typeof defaultSettings>) =>
  Object.fromEntries(BINDING_ROLES.map((r) => [r, s.bindings[r]]));

describe('the four presets (4.4, 4.5)', () => {
  it('off: no slots, every role on the built-in AI, connections and caps kept', () => {
    const base = preset({ preset: 'tiered', connectionId: 'conn_a' });
    const off = applyPreset(base, { preset: 'off' });
    expect(off.preset).toBe('off');
    expect(off.slots).toEqual({});
    expect(BINDING_ROLES.every((r) => off.bindings[r].mode === 'builtin')).toBe(true);
    expect(off.connections).toEqual(base.connections);
    expect(off.caps).toEqual(base.caps);
    expect(detectPreset(off)).toBe('off');
    expect(defaultSettings().preset).toBe('off');
  });

  it('single: one model in all three slots, every role routed; Haiku recommended, Sonnet for quality', () => {
    const s = preset({ preset: 'single', connectionId: 'conn_a' });
    expect(ANTHROPIC_SINGLE).toEqual({
      recommended: 'claude-haiku-5-5',
      quality: 'claude-sonnet-5-5',
    });
    for (const slot of ['top', 'mid', 'low'] as const) {
      expect(s.slots[slot]).toEqual({ connectionId: 'conn_a', model: 'claude-haiku-5-5' });
    }
    expect(BINDING_ROLES.every((r) => s.bindings[r].mode === 'route')).toBe(true);
    expect(detectPreset(s)).toBe('single');
    const q = preset({ preset: 'single', connectionId: 'conn_a', quality: true });
    expect(q.slots.top?.model).toBe('claude-sonnet-5-5');
    const compat = preset(
      { preset: 'single', connectionId: 'conn_compat', model: 'chat-small' },
      compatConn(),
    );
    expect(compat.slots.low).toEqual({ connectionId: 'conn_compat', model: 'chat-small' });
    // A compatible service names no model by default: nothing is filled.
    expect(preset({ preset: 'single', connectionId: 'conn_compat' }, compatConn()).slots).toEqual(
      {},
    );
  });

  it('tiered: Opus, Sonnet, Haiku for standard and generous; frugal leaves the top slot empty', () => {
    expect(ANTHROPIC_TIERED.standard).toEqual({
      top: 'claude-opus-5-5',
      mid: 'claude-sonnet-5-5',
      low: 'claude-haiku-5-5',
    });
    const std = preset({ preset: 'tiered', connectionId: 'conn_a' });
    expect(std.tilt).toBe('standard');
    expect(std.slots.top?.model).toBe('claude-opus-5-5');
    expect(std.slots.mid?.model).toBe('claude-sonnet-5-5');
    expect(std.slots.low?.model).toBe('claude-haiku-5-5');
    expect(BINDING_ROLES.every((r) => std.bindings[r].mode === 'route')).toBe(true);
    const gen = preset({ preset: 'tiered', connectionId: 'conn_a', tilt: 'generous' });
    expect(gen.tilt).toBe('generous');
    expect(gen.slots).toEqual(std.slots);
    const fru = preset({ preset: 'tiered', connectionId: 'conn_a', tilt: 'frugal' });
    expect(fru.slots.top).toBeUndefined();
    expect(fru.slots.mid?.model).toBe('claude-sonnet-5-5');
    expect(fru.slots.low?.model).toBe('claude-haiku-5-5');
    for (const s of [std, gen, fru]) expect(detectPreset(s)).toBe('tiered');
    const models = { top: 'chat-large', mid: 'chat-large', low: 'chat-small' };
    const compat = preset(
      { preset: 'tiered', connectionId: 'conn_compat', tilt: 'frugal', models },
      compatConn(),
    );
    expect(compat.slots.top).toBeUndefined();
    expect(models.top).toBe('chat-large');
  });

  it('local: 14B class on top and mid, 7B class on low; goddess and court reviewer on the built-in AI', () => {
    const s = preset(
      {
        preset: 'local',
        connectionId: 'conn_local',
        models: { high: 'qwen3:14b', low: 'qwen3:8b' },
      },
      localConn(),
    );
    expect(s.slots).toEqual({
      top: { connectionId: 'conn_local', model: 'qwen3:14b' },
      mid: { connectionId: 'conn_local', model: 'qwen3:14b' },
      low: { connectionId: 'conn_local', model: 'qwen3:8b' },
    });
    expect(modes(s)).toEqual({
      goddess: { mode: 'builtin' },
      core_npc: { mode: 'route' },
      present_npc: { mode: 'fixed', slot: 'low' },
      offstage_batch: { mode: 'fixed', slot: 'low' },
      ruler_general: { mode: 'route' },
      court_reviewer: { mode: 'builtin' },
    });
    expect(detectPreset(s)).toBe('local');
  });

  it('any later edit shows as custom, and the share structure follows the preset (8.4)', () => {
    const s = preset({ preset: 'tiered', connectionId: 'conn_a' });
    const edited = { ...s, bindings: { ...s.bindings, goddess: { mode: 'builtin' as const } } };
    expect(detectPreset(edited)).toBe('custom');
    const effort = {
      ...s,
      slots: {
        ...s.slots,
        top: { connectionId: 'conn_a', model: 'claude-opus-5-5', effort: 'high' as const },
      },
    };
    expect(detectPreset(effort)).toBe('custom');
    expect(sharesFor(s).map((p) => [p.id, p.share])).toEqual([
      ['goddess', 0.65],
      ['core_npc', 0.2],
      ['ruler_general', 0.1],
      ['present_npc+offstage_batch', 0.05],
    ]);
    expect(
      sharesFor(preset({ preset: 'single', connectionId: 'conn_a' })).find(
        (p) => p.id === 'core_npc',
      )?.share,
    ).toBe(0.55);
    const local = preset(
      {
        preset: 'local',
        connectionId: 'conn_local',
        models: { high: 'qwen3:14b', low: 'qwen3:8b' },
      },
      localConn(),
    );
    expect(sharesFor(local).find((p) => p.id === 'core_npc')?.share).toBe(0.6);
    const override = { ...s, caps: { ...s.caps, roleShares: { goddess: 0.5 } } };
    expect(sharesFor(override)).toEqual([{ id: 'goddess', roles: ['goddess'], share: 0.5 }]);
  });
});

describe('address validation (5.4, 7.5, 17)', () => {
  const issueOf = (conn: unknown, web = false) => {
    const v = validateSettings({ connections: [conn] }, { web });
    return { kept: v.settings.connections.length, codes: v.issues.map((i) => i.code) };
  };

  it('cloud services need HTTPS; plain HTTP only reaches loopback and private ranges', () => {
    expect(issueOf({ ...anthropicConn(), baseUrl: 'http://api.anthropic.com' })).toEqual({
      kept: 0,
      codes: ['https_required'],
    });
    expect(issueOf({ ...compatConn(), baseUrl: 'http://api.example.com/v1' })).toEqual({
      kept: 0,
      codes: ['https_required'],
    });
    expect(issueOf({ ...compatConn(), baseUrl: 'http://192.168.1.20:8000/v1' })).toEqual({
      kept: 1,
      codes: [],
    });
    expect(issueOf({ ...compatConn(), baseUrl: 'http://10.0.0.5/v1' }).kept).toBe(1);
    expect(issueOf({ ...compatConn(), baseUrl: 'https://api.example.com/v1' }).kept).toBe(1);
    expect(issueOf(localConn('conn_l', ['m'], 'http://127.0.0.1:11434')).kept).toBe(1);
    expect(issueOf(localConn('conn_l', ['m'], 'http://203.0.113.9:11434'))).toEqual({
      kept: 0,
      codes: ['not_local'],
    });
  });

  it('the web demo accepts only local services on loopback', () => {
    expect(issueOf(localConn('conn_l', ['m'], 'http://127.0.0.1:11434'), true)).toEqual({
      kept: 1,
      codes: [],
    });
    expect(issueOf(localConn('conn_l', ['m'], 'http://localhost:1234/v1'), true).kept).toBe(1);
    expect(issueOf(localConn('conn_l', ['m'], 'http://192.168.1.5:11434'), true)).toEqual({
      kept: 0,
      codes: ['web_loopback_only'],
    });
    expect(issueOf(anthropicConn(), true)).toEqual({ kept: 0, codes: ['cloud_in_web'] });
    expect(issueOf(compatConn('conn_c', undefined, 'http://127.0.0.1:8000/v1'), true)).toEqual({
      kept: 0,
      codes: ['cloud_in_web'],
    });
  });

  it('rejects credentials in the address, other schemes and garbage', () => {
    expect(
      issueOf({ ...compatConn(), baseUrl: 'https://user:pass@api.example.com/v1' }).codes,
    ).toEqual(['credentials']);
    expect(issueOf({ ...compatConn(), baseUrl: 'ftp://api.example.com' }).codes).toEqual([
      'scheme',
    ]);
    expect(issueOf({ ...compatConn(), baseUrl: 'not a url' }).codes).toEqual(['invalid']);
    expect(issueOf({ id: 'bad id', kind: 'anthropic' }).codes).toEqual(['bad_connection']);
    expect(issueOf({ ...anthropicConn(), kind: 'none' }).codes).toEqual(['bad_connection']);
  });

  it('drops slots on unknown connections or models the connection does not enable', () => {
    const v = validateSettings({
      ...preset({ preset: 'tiered', connectionId: 'conn_a' }),
      slots: {
        top: { connectionId: 'conn_a', model: 'claude-opus-5-5' },
        mid: { connectionId: 'conn_nowhere', model: 'x' },
        low: { connectionId: 'conn_a', model: 'gpt-9' },
      },
    });
    expect(v.settings.slots).toEqual({ top: { connectionId: 'conn_a', model: 'claude-opus-5-5' } });
    expect(v.issues.map((i) => `${i.path}:${i.code}`)).toEqual([
      'slots.mid.connectionId:unknown_connection',
      'slots.low.model:model_not_enabled',
    ]);
    expect(v.ok).toBe(false);
    expect(enabledModels(anthropicConn())).toEqual([
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
    ]);
  });

  it('requires hour and day caps once a cloud connection is bound, locks developer mode, drops unknown fields', () => {
    const s = preset({ preset: 'tiered', connectionId: 'conn_a' });
    const noCaps = validateSettings({ ...s, caps: { displayCurrency: 'USD' } });
    expect(noCaps.issues.map((i) => i.code)).toEqual(['cap_required', 'cap_required']);
    expect(noCaps.ok).toBe(false);
    const local = preset(
      {
        preset: 'local',
        connectionId: 'conn_local',
        models: { high: 'qwen3:14b', low: 'qwen3:8b' },
      },
      localConn(),
    );
    expect(validateSettings({ ...local, caps: { displayCurrency: 'USD' } }).ok).toBe(true);
    const dev = validateSettings({
      ...s,
      privacy: { ...s.privacy, developerMode: true },
      extra: 1,
    });
    expect(dev.settings.privacy.developerMode).toBe(false);
    expect(dev.issues.map((i) => i.code)).toEqual(['developer_mode_locked']);
    expect('extra' in dev.settings).toBe(false);
    expect(
      validateSettings(
        { ...s, privacy: { ...s.privacy, developerMode: true } },
        { internalBuild: true },
      ).settings.privacy.developerMode,
    ).toBe(true);
    const consent = validateSettings({
      ...s,
      consentedConnectionIds: ['conn_a', 'conn_gone', 'conn_a'],
    });
    expect(consent.settings.consentedConnectionIds).toEqual(['conn_a']);
    expect(consentPending({ ...s, consentedConnectionIds: [] })).toEqual(['conn_a']);
    expect(isCloudConnection(compatConn('c', undefined, 'http://192.168.0.2/v1'))).toBe(false);
  });
});

describe('migration and versions (4.7)', () => {
  const devFacts = {
    available: true,
    tiers: { top: 'claude-opus-5-5', mid: 'claude-sonnet-5-5', low: 'claude-haiku-5-5' },
    connections: [anthropicConn('dev_proxy', { keyState: 'none' })],
  };

  it('migrates the legacy switch: on with a dev proxy becomes custom dev proxy, otherwise off', () => {
    const on = migrateSettings(undefined, { legacySwitch: 'on', devProxy: devFacts });
    expect(on.from).toBe('legacy');
    expect(on.settings.preset).toBe('custom');
    expect(on.settings.slots).toEqual({
      top: { connectionId: 'dev_proxy', model: 'claude-opus-5-5' },
      mid: { connectionId: 'dev_proxy', model: 'claude-sonnet-5-5' },
      low: { connectionId: 'dev_proxy', model: 'claude-haiku-5-5' },
    });
    expect(BINDING_ROLES.every((r) => on.settings.bindings[r].mode === 'route')).toBe(true);
    expect(on.settings.consentedConnectionIds).toEqual(['dev_proxy']);
    expect(on.settings.connections[0]?.keyState).toBe('saved');
    expect(on.settings.caps.hour).toEqual({ usd: 1 });
    expect(on.settings.caps.day).toEqual({ usd: 3 });
    expect(
      migrateSettings(undefined, { legacySwitch: 'off', devProxy: devFacts }).settings.preset,
    ).toBe('off');
    expect(
      migrateSettings(undefined, {
        legacySwitch: 'on',
        devProxy: { ...devFacts, available: false },
      }).settings.preset,
    ).toBe('off');
    expect(migrateSettings(undefined, { legacySwitch: 'on' }).settings.preset).toBe('off');
    // The legacy switch defaulted to on when unset.
    const unset = migrateSettings(undefined, { legacySwitch: null, devProxy: devFacts });
    expect([unset.from, unset.settings.preset]).toEqual(['none', 'custom']);
    expect(migrateSettings(undefined).settings).toEqual(defaultSettings());
  });

  it('reads settings of a newer version without writing them back', () => {
    const s = preset({ preset: 'tiered', connectionId: 'conn_a' });
    const newer = migrateSettings({ ...s, version: SETTINGS_VERSION + 1, futureField: true });
    expect(newer.readOnly).toBe(true);
    expect(newer.notice).toBe('newer_version');
    expect(newer.settings.slots).toEqual(s.slots);
    const same = migrateSettings(JSON.parse(JSON.stringify(s)));
    expect(same.readOnly).toBe(false);
    expect(same.settings).toEqual(s);
  });

  it('keeps the model settings as the llm partition of the local settings part', () => {
    const s = preset({ preset: 'tiered', connectionId: 'conn_a' });
    expect(readLlmPartition(null).settings).toEqual(defaultSettings());
    expect(readLlmPartition({ graphics: 'high' }).from).toBe('none');
    expect(readLlmPartition({ llm: JSON.parse(JSON.stringify(s)) }).settings).toEqual(s);
    const written = writeLlmPartition({ graphics: 'high', llm: { old: true } }, s);
    expect(Object.keys(written)).toEqual(['graphics', 'llm']);
    expect(written.graphics).toBe('high');
    expect(readLlmPartition(written).settings).toEqual(s);
    expect(Object.keys(writeLlmPartition(null, s))).toEqual(['llm']);
  });

  it('the client bridge reads and writes that partition, never overwrites newer settings, and keeps the legacy switch', async () => {
    const s = preset({ preset: 'tiered', connectionId: 'conn_a' });
    const gateway = {
      route: 'gateway' as const,
      gateway: { request: async () => ({ ok: false, latencyMs: 0 }), abort: () => {} },
    };
    /** A settings store shaped like PlatformHost.settings, holding the local part. */
    function parts(initial: Record<string, unknown> | null) {
      const box = { value: initial, writes: 0 };
      const settingsStore = {
        get: async () => ({ ok: true as const, value: box.value }),
        set: async (_p: 'local', v: Record<string, unknown>) => {
          box.value = v;
          box.writes++;
          return { ok: true as const, value: v };
        },
      };
      return { box, settingsStore };
    }

    const newer = parts({ graphics: 'high', llm: { ...s, version: SETTINGS_VERSION + 1 } });
    const b1 = new AiBridge(store(), {
      platform: 'desktop',
      llm: gateway,
      settingsStore: newer.settingsStore,
    });
    await b1.probe();
    expect(b1.enabled).toBe(true);
    expect(b1.setSettings(applyPreset(s, { preset: 'off' })).ok).toBe(false);
    await b1.flush();
    expect(newer.box.writes).toBe(0);

    const p2 = parts({ graphics: 'low', llm: JSON.parse(JSON.stringify(s)) });
    const b2 = new AiBridge(store(), {
      platform: 'desktop',
      llm: gateway,
      settingsStore: p2.settingsStore,
    });
    await b2.probe();
    expect(b2.mode()).toBe('external');
    b2.setAiEnabled(false);
    await b2.flush();
    expect([b2.enabled, b2.mode()]).toEqual([false, 'off']);
    expect(p2.box.value).toMatchObject({ graphics: 'low', llm: { preset: 'off' } });
    b2.setAiEnabled(true);
    await b2.flush();
    expect(b2.settings().preset).toBe('tiered');
    expect(b2.settings().slots).toEqual(s.slots);
    expect(b2.mode()).toBe('external');

    // Without a platform store the local part sits under the web host's key; the legacy
    // switch alone (no dev proxy) migrates to off.
    const kv = store({ [LEGACY_AI_SWITCH_KEY]: 'on' });
    const web = new AiBridge(kv, { platform: 'web' });
    await web.probe();
    expect([web.enabled, web.mode()]).toEqual([false, 'off']);
    // The web demo cannot take a cloud connection at all (D-081).
    const refused = web.setSettings(withConns(anthropicConn()));
    expect(refused.ok).toBe(false);
    expect(refused.issues.map((i) => i.code)).toEqual(['cloud_in_web']);
    const local = preset(
      {
        preset: 'local',
        connectionId: 'conn_local',
        models: { high: 'qwen3:14b', low: 'qwen3:8b' },
      },
      localConn(),
    );
    expect(web.setSettings(local).ok).toBe(true);
    await web.flush();
    expect(JSON.parse(kv.m.get('hakoniwa.settings.local') as string).llm.preset).toBe('local');
    expect(kv.m.has('hakoniwa.llm.settings')).toBe(false);
    expect(web.mode()).toBe('external');
    expect([0, 1, 3, 4, 6, 7, 8, 9].map(displayLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
});
