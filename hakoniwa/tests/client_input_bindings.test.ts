// The key-binding check of ux_and_onboarding.md 23.2 and the gamepad rebinding rules of 16.6
// (PK-M1-07): the default key-mouse and gamepad tables have no conflict inside a context or
// against global; every action has a key-mouse binding and a gamepad binding (pad-only
// actions are listed); no player-visible string names a fixed key (every key is a
// `{key:<action>}` reference, and every reference resolves on both devices); the pad's
// confirm, back and Start are locked, A and B swap as a whole, the hotbar layers move as a
// group, and overrides persist through SyncSettings.padKeys.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkPatch, normalizeSettings } from '../src/client/app/settings_schema';
import {
  DEFAULT_CONTEXT_KEYMAP,
  HOTBAR_SIZE,
  INPUT_CONTEXTS,
  keymapConflicts,
} from '../src/client/input/contexts';
import {
  COMPOSITE_KEY_REFS,
  DEFAULT_KEY_TEXT_STATE,
  keyRefs,
  keyRefText,
} from '../src/client/input/glyphs';
import {
  DEFAULT_PAD_KEYMAP,
  HOTBAR_CLUSTER,
  hotbarLayers,
  hotbarSlotFor,
  hotbarSlotPosition,
  isRebindablePadSlot,
  LOCKED_PAD_SLOTS,
  PAD_ONLY_ACTIONS,
  padBindingFor,
  padCoverageGaps,
  padKeymapConflicts,
  rebindPad,
  resetPadKeymap,
  resolvePadKeymap,
} from '../src/client/input/pad_bindings';

const LOCALES = join(__dirname, '..', 'locales', 'zh-Hans');

function tables(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const f of readdirSync(LOCALES).filter((x) => x.endsWith('.json'))) {
    out[f] = JSON.parse(readFileSync(join(LOCALES, f), 'utf8'));
  }
  return out;
}

describe('23.2 key check: default bindings', () => {
  it('the key-mouse table has no conflict and covers the 16.2 rows of this package', () => {
    expect(keymapConflicts(DEFAULT_CONTEXT_KEYMAP)).toEqual([]);
    const m = DEFAULT_CONTEXT_KEYMAP;
    // 24 hotbar slots: 1 to =, then Shift (5.2)
    for (let i = 1; i <= HOTBAR_SIZE; i++)
      expect(m.field[`hotbar_${i}`], `hotbar_${i}`).toBeDefined();
    expect(m.field.hotbar_13?.primary).toEqual({ code: 'Digit1', shift: true });
    expect(m.field.hotbar_24?.primary).toEqual({ code: 'Equal', shift: true });
    // select self and party members 1 to 5: Alt+1 to Alt+6
    expect(m.field.select_self?.primary).toEqual({ code: 'Digit1', alt: true });
    expect(m.field.select_party_5?.primary).toEqual({ code: 'Digit6', alt: true });
    // window arrows and the previous tab
    expect(m.window.focus_up?.primary).toEqual({ code: 'ArrowUp' });
    expect(m.window.prev_tab?.primary).toEqual({ code: 'Tab', ctrl: true, shift: true });
    // battlefield camera pan and group recall (modeled for act 2)
    expect(m.battle.pan_left?.primary).toEqual({ code: 'ArrowLeft' });
    expect(m.battle.group_recall_3?.primary).toEqual({ code: 'Digit3' });
    // advancing lives in the dialogue context, stacked over the field while talk shows
    expect(m.field.advance).toBeUndefined();
    expect(m.dialogue.advance?.primary).toEqual({ code: 'Space' });
  });

  it('the gamepad table has no conflict inside a context or against global', () => {
    expect(padKeymapConflicts(DEFAULT_PAD_KEYMAP)).toEqual([]);
    // the A/B swap keeps it conflict-free
    expect(padKeymapConflicts(resolvePadKeymap({}, { swapConfirmBack: true }))).toEqual([]);
  });

  it('every action has a key-mouse binding and a gamepad binding', () => {
    for (const c of INPUT_CONTEXTS) {
      for (const [action, b] of Object.entries(DEFAULT_CONTEXT_KEYMAP[c])) {
        expect(b.primary ?? b.secondary, `${c}.${action} key`).toBeDefined();
        expect(padBindingFor(DEFAULT_PAD_KEYMAP, c, action), `${c}.${action} pad`).toBeDefined();
      }
      // pad-only actions are the listed ones, each with a binding
      for (const action of Object.keys(DEFAULT_PAD_KEYMAP[c])) {
        if (Object.hasOwn(DEFAULT_CONTEXT_KEYMAP[c], action)) continue;
        expect(PAD_ONLY_ACTIONS[c], `${c}.${action}`).toContain(action);
      }
      for (const action of PAD_ONLY_ACTIONS[c]) {
        expect(padBindingFor(DEFAULT_PAD_KEYMAP, c, action), `${c}.${action}`).toBeDefined();
      }
    }
    expect(padCoverageGaps()).toEqual([]);
  });

  it('a gap is reported: a key action without a pad binding, an unlisted pad action', () => {
    const broken = {
      ...DEFAULT_PAD_KEYMAP,
      field: {
        ...DEFAULT_PAD_KEYMAP.field,
        interact: {},
        sneak: { primary: DEFAULT_PAD_KEYMAP.field.appraise?.primary },
      },
    };
    expect(padCoverageGaps(broken)).toEqual([
      'field.interact: no pad binding',
      'field.sneak: pad-only action not listed',
    ]);
  });

  it('follows the 16.3 rows of the walking and fighting context', () => {
    const p = DEFAULT_PAD_KEYMAP.field;
    expect(p.interact?.primary).toEqual({ kind: 'button', chord: { button: 'a' } });
    expect(p.target_next?.primary).toEqual({ kind: 'button', chord: { button: 'rb' } });
    expect(p.target_prev?.primary).toEqual({ kind: 'button', chord: { button: 'lb' } });
    expect(p.party_ring?.primary).toEqual({ kind: 'button', chord: { button: 'lb', hold: true } });
    expect(p.mount?.primary).toEqual({ kind: 'button', chord: { button: 'rb', with: 'lb' } });
    expect(p.camera_reset?.primary).toEqual({ kind: 'button', chord: { button: 'y', hold: true } });
    expect(p.zoom_in?.primary).toEqual({ kind: 'stick', stick: 'right', dir: 'up', with: 'l3' });
    expect(p.ring_windows?.primary).toEqual({
      kind: 'button',
      chord: { button: 'view', hold: true },
    });
    expect(p.win_inventory?.primary).toEqual({ kind: 'ring', ring: 'windows' });
    expect(DEFAULT_PAD_KEYMAP.global.menu?.primary).toEqual({
      kind: 'button',
      chord: { button: 'start' },
    });
  });

  it('lays the 24 hotbar slots on three layers of eight cluster buttons (5.2)', () => {
    expect(hotbarLayers(DEFAULT_PAD_KEYMAP)).toEqual({ a: 'lt', b: 'rt' });
    expect(HOTBAR_CLUSTER).toEqual(['left', 'up', 'right', 'down', 'x', 'y', 'b', 'a']);
    expect(hotbarSlotPosition(1)).toEqual({ layer: 1, button: 'left' });
    expect(hotbarSlotPosition(8)).toEqual({ layer: 1, button: 'a' });
    expect(hotbarSlotPosition(9)).toEqual({ layer: 2, button: 'left' });
    expect(hotbarSlotPosition(24)).toEqual({ layer: 3, button: 'a' });
    expect(hotbarSlotPosition(25)).toBeNull();
    expect(hotbarSlotFor('up', true, false)).toBe(2);
    expect(hotbarSlotFor('up', false, true)).toBe(10);
    expect(hotbarSlotFor('up', true, true)).toBe(18);
    expect(hotbarSlotFor('up', false, false)).toBeNull();
    expect(hotbarSlotFor('start', true, false)).toBeNull();
  });
});

describe('23.2 key check: no fixed key names in the string tables', () => {
  // named keys anywhere; a lone Latin capital as a key only in the interface table (the
  // content and system tables use letters for ranks, "F 级")
  const NAMED =
    /\b(Esc|Tab|Enter|Shift|Ctrl|Alt|Home|End|PageUp|PageDown|Delete|Backspace|F\d{1,2}|WASD)\b|空格|回车|数字键|方向键|小键盘|加号|减号/;
  // a mouse button as a key, but not a pointer gesture (16.2: clicking the ground, dragging,
  // the wheel are no bindings)
  const MOUSE_KEY = /(?<!鼠标)(左键|右键|中键|侧键)(?!拖动|点)/;
  const LETTER = /(?<![A-Za-z0-9_{:.])[A-Z](?![A-Za-z0-9_])/;
  const KEY_NAME_KEYS = /^ui\.common\.(key|pad)\./;

  it('the scan catches the key names it is for', () => {
    expect(NAMED.test('空格 继续')).toBe(true);
    expect(NAMED.test('F6 快速存档')).toBe(true);
    expect(LETTER.test('E 交谈')).toBe(true);
    expect(LETTER.test('{key:field.interact} 交谈'.replace(/\{key:[a-z0-9_.]+\}/g, ''))).toBe(
      false,
    );
    expect(MOUSE_KEY.test('左键：选择我方部队')).toBe(true);
    expect(MOUSE_KEY.test('（右键取消）')).toBe(true);
    expect(MOUSE_KEY.test('鼠标左键点地面：走过去')).toBe(false);
    expect(MOUSE_KEY.test('右键拖动旋转')).toBe(false);
  });

  it('uses {key:} references instead of key names', () => {
    const hits: string[] = [];
    for (const [file, table] of Object.entries(tables())) {
      for (const [k, v] of Object.entries(table)) {
        if (typeof v !== 'string' || KEY_NAME_KEYS.test(k) || k.startsWith('ui.pop.osk.key.'))
          continue;
        const text = v.replace(/\{key:[a-z0-9_.]+\}/g, '');
        if (NAMED.test(text) || MOUSE_KEY.test(text) || (file === 'ui.json' && LETTER.test(text)))
          hits.push(`${k}: ${v}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('every {key:} reference names an action and renders on both devices', () => {
    const refs = new Set<string>();
    for (const table of Object.values(tables())) {
      for (const v of Object.values(table))
        if (typeof v === 'string') for (const r of keyRefs(v)) refs.add(r);
    }
    expect(refs.size).toBeGreaterThan(10);
    for (const ref of refs) {
      for (const device of ['kbm', 'pad'] as const) {
        const text = keyRefText(ref, { ...DEFAULT_KEY_TEXT_STATE, device });
        expect(text, `${ref} on ${device}`).toBeDefined();
        expect(text, `${ref} on ${device}`).not.toContain('{');
      }
    }
    for (const c of COMPOSITE_KEY_REFS) expect(keyRefText(c, DEFAULT_KEY_TEXT_STATE)).toBeDefined();
    expect(keyRefText('field.fly', DEFAULT_KEY_TEXT_STATE)).toBeUndefined();
  });
});

describe('gamepad rebinding (16.6 rule 5)', () => {
  it('locks confirm, back and Start, and refuses fixed stick, ring and hotbar entries', () => {
    expect([...LOCKED_PAD_SLOTS].sort()).toEqual([
      'global.back.primary',
      'global.menu.primary',
      'window.confirm.primary',
    ]);
    for (const key of LOCKED_PAD_SLOTS) {
      const [c, a] = key.split('.') as [(typeof INPUT_CONTEXTS)[number], string];
      expect(rebindPad({}, c, a, 'primary', { button: 'x' })).toEqual({
        ok: false,
        reason: 'locked',
      });
    }
    expect(rebindPad({}, 'field', 'zoom_in', 'primary', { button: 'x' })).toEqual({
      ok: false,
      reason: 'fixed',
    });
    expect(rebindPad({}, 'field', 'win_inventory', 'primary', { button: 'x' })).toMatchObject({
      reason: 'fixed',
    });
    expect(rebindPad({}, 'field', 'hotbar_3', 'primary', { button: 'x' })).toMatchObject({
      reason: 'fixed',
    });
    expect(rebindPad({}, 'field', 'fly', 'primary', { button: 'x' })).toEqual({
      ok: false,
      reason: 'unknown',
    });
    expect(isRebindablePadSlot('field', 'interact', 'secondary')).toBe(true);
  });

  it('refuses a chord the same context or global uses; frees it after a clear', () => {
    const clash = rebindPad({}, 'field', 'interact', 'primary', { button: 'x' });
    expect(clash).toEqual({
      ok: false,
      reason: 'conflict',
      conflicts: [{ context: 'field', action: 'appraise', slot: 'primary' }],
    });
    const global = rebindPad({}, 'field', 'interact', 'primary', { button: 'start' });
    expect(global).toMatchObject({
      reason: 'conflict',
      conflicts: [{ context: 'global', action: 'menu' }],
    });
    // a chord equal to a hotbar combo clashes with that slot
    const hot = rebindPad({}, 'field', 'appraise', 'primary', { button: 'up', with: 'lt' });
    expect(hot).toMatchObject({ reason: 'conflict', conflicts: [{ action: 'hotbar_2' }] });
    const cleared = rebindPad({}, 'field', 'appraise', 'primary', null);
    expect(cleared).toEqual({ ok: true, overrides: { 'field.appraise.primary': null } });
    if (!cleared.ok) return;
    const moved = rebindPad(cleared.overrides, 'field', 'interact', 'primary', { button: 'x' });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const map = resolvePadKeymap(moved.overrides);
    expect(map.field.interact?.primary).toEqual({ kind: 'button', chord: { button: 'x' } });
    expect(map.field.appraise?.primary).toBeUndefined();
    // back to the default drops the override
    expect(rebindPad({}, 'field', 'appraise', 'primary', { button: 'x' })).toEqual({
      ok: true,
      overrides: {},
    });
  });

  it('moves the hotbar layers as a group (LT group to LB once LB is free)', () => {
    expect(rebindPad({}, 'field', 'hotbar_layer_a', 'primary', { button: 'lb' })).toMatchObject({
      reason: 'conflict',
    });
    let o = {};
    for (const a of ['target_prev'] as const) {
      const r = rebindPad(o, 'field', a, 'primary', null);
      if (r.ok) o = r.overrides;
    }
    const r = rebindPad(o, 'field', 'hotbar_layer_a', 'primary', { button: 'lb' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const map = resolvePadKeymap(r.overrides);
    expect(hotbarLayers(map)).toEqual({ a: 'lb', b: 'rt' });
  });

  it('keeps a hotbar layer on a plain button off the cluster, never cleared; resets by context', () => {
    expect(rebindPad({}, 'field', 'hotbar_layer_a', 'primary', { button: 'up' })).toEqual({
      ok: false,
      reason: 'layer',
    });
    expect(
      rebindPad({}, 'field', 'hotbar_layer_b', 'primary', { button: 'l3', hold: true }),
    ).toEqual({
      ok: false,
      reason: 'layer',
    });
    expect(rebindPad({}, 'field', 'hotbar_layer_a', 'primary', null)).toEqual({
      ok: false,
      reason: 'layer',
    });
    expect(rebindPad({}, 'field', 'hotbar_layer_a', 'secondary', { button: 'l3' })).toMatchObject({
      reason: 'fixed',
    });
    // a stored bad layer override is ignored
    expect(
      hotbarLayers(resolvePadKeymap({ 'field.hotbar_layer_a.primary': { button: 'x' } })),
    ).toEqual({
      a: 'lt',
      b: 'rt',
    });
    const o = {
      'field.appraise.primary': { button: 'y' as const },
      'window.discard.primary': null,
    };
    expect(resetPadKeymap(o, 'field')).toEqual({ 'window.discard.primary': null });
    expect(resetPadKeymap(o)).toEqual({});
  });

  it('swaps A and B everywhere when asked', () => {
    const map = resolvePadKeymap({}, { swapConfirmBack: true });
    expect(map.window.confirm?.primary).toEqual({ kind: 'button', chord: { button: 'b' } });
    expect(map.global.back?.primary).toEqual({ kind: 'button', chord: { button: 'a' } });
    expect(map.field.interact?.primary).toEqual({ kind: 'button', chord: { button: 'b' } });
  });

  it('ignores bad overrides when resolving', () => {
    const map = resolvePadKeymap({
      'global.menu.primary': { button: 'x' },
      'field.zoom_in.primary': { button: 'x' },
      'field.appraise.primary': { button: 'nope' } as never,
      'field.mount.primary': { button: 'rb', with: 'rb' } as never,
    });
    expect(map.global.menu).toEqual(DEFAULT_PAD_KEYMAP.global.menu);
    expect(map.field.zoom_in).toEqual(DEFAULT_PAD_KEYMAP.field.zoom_in);
    expect(map.field.appraise).toEqual(DEFAULT_PAD_KEYMAP.field.appraise);
    expect(map.field.mount).toEqual(DEFAULT_PAD_KEYMAP.field.mount);
  });
});

describe('persistence through the sync settings part', () => {
  it('keeps valid pad overrides and drops bad ones one by one', () => {
    const n = normalizeSettings('sync', {
      version: 1,
      padKeys: {
        'field.appraise.primary': { button: 'y', hold: true },
        'field.mount.primary': null,
        'global.menu.primary': { button: 'x' },
        'field.zoom_in.primary': { button: 'x' },
        'field.fly.primary': { button: 'x' },
        'field.interact.primary': { button: 'a', with: 'a' },
        'field.interact.secondary': { button: 'a', extra: 1 },
      },
    });
    expect(n.values.padKeys).toEqual({
      'field.appraise.primary': { button: 'y', hold: true },
      'field.mount.primary': null,
    });
    expect(n.issues.filter((i) => i.startsWith('padKeys.')).length).toBe(5);
  });

  it('checks each input option and falls back field by field', () => {
    const n = normalizeSettings('sync', {
      version: 1,
      input: { softCone: 45, rumble: 101, holdSeconds: 0.2, glyphs: 'switch', invertPitch: true },
    });
    expect(n.values.input).toMatchObject({
      softCone: 60,
      rumble: 100,
      holdSeconds: 0.5,
      glyphs: 'switch',
      invertPitch: true,
    });
    expect(n.issues).toEqual(
      expect.arrayContaining(['input.softCone', 'input.rumble', 'input.holdSeconds']),
    );
    expect(checkPatch('sync', { input: { ...n.values.input, softCone: 90 } }).ok).toBe(true);
    expect(checkPatch('sync', { input: { ...n.values.input, softCone: 45 as never } })).toEqual({
      ok: false,
      field: 'input.softCone',
    });
  });
});
