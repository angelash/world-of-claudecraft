// The settings shell `ui_scr_settings` and its pages (ux_and_onboarding.md 4.1, 4.4, 4.5, 4.8,
// 6.2.15; PK-M1-22): the page registry (only painted pages show, 4.1 order, tab stepping,
// restore-defaults patches), the controls page model (contexts gated by what the player has
// reached, a label for every action of both default keymaps, binding with clashes, "replace",
// key recording, pad chords from pickers, option patches, export and import), the gameplay
// page model, the help lines that follow the current device, and the web-safe window tab keys.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkPatch, defaultSettings, GUIDANCE_LEVELS } from '../src/client/app/settings_schema';
import { defaultAudioOptions } from '../src/client/audio/audio_settings';
import {
  chordConflicts,
  DEFAULT_CONTEXT_KEYMAP,
  INPUT_CONTEXTS,
  keymapConflicts,
  resolveContextKeymap,
} from '../src/client/input/contexts';
import { GLYPH_SETTINGS } from '../src/client/input/device';
import { DEFAULT_KEY_TEXT_STATE, installKeyText } from '../src/client/input/glyphs';
import { defaultInputSettings } from '../src/client/input/input_settings';
import { DEFAULT_PAD_KEYMAP, resolvePadKeymap } from '../src/client/input/pad_bindings';
import { HELP_LINE_KEYS, helpModel } from '../src/client/windows/help_model';
import {
  actionLabelRef,
  actionVisible,
  bindKey,
  bindPad,
  CONTROLS_FORMAT,
  conflictLabel,
  contextActions,
  exportControls,
  importControls,
  keyRows,
  OPTION_KEYS,
  optionPatch,
  optionRows,
  padChordFrom,
  padPressOf,
  padRows,
  recordedKey,
  recordedMouse,
  replaceKey,
  replacePad,
  slotShown,
  visibleContexts,
} from '../src/client/windows/settings/controls_model';
import {
  DIFFICULTIES,
  difficultyOf,
  gameplayPageModel,
  gameplayPatch,
} from '../src/client/windows/settings/gameplay_model';
import {
  hasPageDefaults,
  initialPage,
  PAGE_OWNERS,
  pageDefaultsPatch,
  SETTINGS_PAGES,
  settingsTabs,
  stepTab,
} from '../src/client/windows/settings/shell_model';

const UI = JSON.parse(
  readFileSync(join(__dirname, '..', 'locales', 'zh-Hans', 'ui.json'), 'utf8'),
) as Record<string, string>;

const NO_FLAGS = {};
const sync = defaultSettings('sync');

describe('settings shell registry (4.1)', () => {
  it('lists the eight pages of 4.1 in order, each with a tab text key and an owner', () => {
    expect(SETTINGS_PAGES).toEqual([
      'graphics',
      'audio',
      'controls',
      'gameplay',
      'llm',
      'access',
      'language',
      'data',
    ]);
    for (const p of SETTINGS_PAGES) {
      expect(UI[`ui.set.${p}.tab`], p).toBeTruthy();
      expect(PAGE_OWNERS[p]).toMatch(/^PK-M1-\d+$/);
    }
  });

  it('shows only the painted pages, in 4.1 order (no empty shells, 1.6)', () => {
    const tabs = settingsTabs(new Set(['language', 'graphics', 'controls'] as const));
    expect(tabs.map((t) => t.id)).toEqual(['graphics', 'controls', 'language']);
    expect(tabs[1]).toEqual({
      id: 'controls',
      uiId: 'ui_set_controls',
      labelKey: 'ui.set.controls.tab',
    });
    expect(settingsTabs(new Set())).toEqual([]);
  });

  it('opens on the remembered page when it shows, else the first, and steps with wrap', () => {
    const tabs = settingsTabs(new Set(['graphics', 'controls', 'gameplay'] as const));
    expect(initialPage(tabs, 'gameplay')).toBe('gameplay');
    expect(initialPage(tabs, 'audio')).toBe('graphics');
    expect(initialPage(tabs, null)).toBe('graphics');
    expect(initialPage([], 'graphics')).toBeNull();
    expect(stepTab(tabs, 'graphics', 1)).toBe('controls');
    expect(stepTab(tabs, 'gameplay', 1)).toBe('graphics');
    expect(stepTab(tabs, 'graphics', -1)).toBe('gameplay');
    expect(stepTab(tabs, 'controls', -4)).toBe('graphics');
  });

  it('restores each page to valid defaults; pages without store values give none', () => {
    const changed = {
      ...sync,
      contextKeys: { 'field.interact.primary': { code: 'KeyF' } },
      padKeys: { 'field.appraise.primary': { button: 'y' as const } },
      input: { ...sync.input, rumble: 10, glyphs: 'switch' as const },
      accessibility: { ...sync.accessibility, holdToToggle: true, textScale: 1.3 as const },
      gameplay: { textSpeed: 'instant' as const, autoAdvance: true, guidance: 'off' as const },
      language: 'en' as const,
    };
    const controls = pageDefaultsPatch('controls', changed);
    expect(controls).toEqual({
      contextKeys: {},
      padKeys: {},
      input: defaultInputSettings(),
      // only the hold switch of the accessibility block belongs to the controls page
      accessibility: { ...changed.accessibility, holdToToggle: false },
    });
    expect(pageDefaultsPatch('gameplay', changed)).toEqual({
      gameplay: { textSpeed: 30, autoAdvance: false, guidance: 'full' },
    });
    expect(pageDefaultsPatch('language', changed)).toEqual({ language: 'zh-Hans' });
    const audio = pageDefaultsPatch('audio', changed);
    expect(audio?.audio).toEqual(defaultAudioOptions());
    expect(audio?.volume?.master).toBe(100);
    for (const p of ['audio', 'controls', 'gameplay', 'language'] as const) {
      const patch = pageDefaultsPatch(p, changed);
      expect(patch && checkPatch('sync', patch).ok, p).toBe(true);
    }
    expect(pageDefaultsPatch('graphics', changed)).toBeNull();
    expect(pageDefaultsPatch('llm', changed)).toBeNull();
    expect(hasPageDefaults('graphics')).toBe(true);
    expect(hasPageDefaults('audio')).toBe(true);
    expect(hasPageDefaults('llm')).toBe(false);
  });
});

describe('controls page: contexts and labels (4.4, 1.5, 16.6)', () => {
  it('lists only the contexts the player has reached', () => {
    expect(visibleContexts(NO_FLAGS)).toEqual(['global', 'field', 'dialogue', 'window']);
    expect(visibleContexts({ 'feature.door_corridor': true })).toContain('corridor');
    expect(visibleContexts({ 'feature.village': true })).toContain('lord');
    expect(visibleContexts({ 'feature.rts': true })).toContain('battle');
    expect(visibleContexts({ 'feature.slg': true })).toContain('continent');
    expect(visibleContexts({ act: 'act1' })).not.toContain('travel');
    expect(visibleContexts({ act: 'act2' })).toContain('travel');
    expect(visibleContexts({ a6_court_open: true })).toContain('court');
    expect(
      visibleContexts({
        'feature.door_corridor': true,
        'feature.city': true,
        'feature.rts': true,
        'feature.slg': true,
        act: 'act6',
        a6_court_open: true,
      }),
    ).toEqual([...INPUT_CONTEXTS]);
  });

  it('shows window keys only for windows the player can open, the debug key only in dev', () => {
    expect(actionVisible('field', 'win_quests', NO_FLAGS, false)).toBe(true);
    expect(actionVisible('field', 'win_doors', NO_FLAGS, false)).toBe(false);
    expect(actionVisible('field', 'win_doors', { 'feature.door_corridor': true }, false)).toBe(
      true,
    );
    // a planned window (not built yet) never shows its key
    expect(actionVisible('field', 'win_deeds', NO_FLAGS, false)).toBe(false);
    expect(actionVisible('field', 'win_strategy', NO_FLAGS, false)).toBe(false);
    expect(actionVisible('global', 'debug', NO_FLAGS, false)).toBe(false);
    expect(actionVisible('global', 'debug', NO_FLAGS, true)).toBe(true);
    expect(actionVisible('field', 'interact', NO_FLAGS, false)).toBe(true);
  });

  it('has a label text key for every action of both default keymaps in every context', () => {
    const missing: string[] = [];
    for (const c of INPUT_CONTEXTS) {
      expect(UI[`ui.set.controls.context.${c}_label`], c).toBeTruthy();
      for (const a of contextActions(c)) {
        const ref = actionLabelRef(a);
        if (!UI[ref.key]) missing.push(`${c}.${a} -> ${ref.key}`);
      }
    }
    expect(missing).toEqual([]);
    expect(actionLabelRef('hotbar_13')).toEqual({
      key: 'ui.set.controls.action.hotbar_n',
      params: { n: 13 },
    });
    expect(actionLabelRef('win_quests')).toEqual({ key: 'ui.win.quests.title' });
    // the layer actions end in a letter, not a number
    expect(actionLabelRef('hotbar_layer_a').key).toBe('ui.set.controls.action.hotbar_layer_a');
  });

  it('lists every key-table action and every pad-only action of a context once', () => {
    const field = contextActions('field');
    expect(new Set(field).size).toBe(field.length);
    for (const a of Object.keys(DEFAULT_CONTEXT_KEYMAP.field)) expect(field).toContain(a);
    for (const a of Object.keys(DEFAULT_PAD_KEYMAP.field)) expect(field).toContain(a);
    expect(field.indexOf('move_up')).toBe(0);
  });
});

describe('controls page: key rows, recording and binding', () => {
  it('builds key rows with both slots, locks and changes', () => {
    const rows = keyRows('field', {}, { flags: NO_FLAGS, devMode: false });
    const interact = rows.find((r) => r.action === 'interact');
    expect(interact?.label).toBe(UI['ui.set.controls.action.interact']);
    expect(interact?.slots.map((s) => s.slot)).toEqual(['primary', 'secondary']);
    expect(interact?.slots[0]).toMatchObject({
      key: 'field.interact.primary',
      text: 'E',
      empty: false,
      locked: false,
      changed: false,
    });
    expect(interact?.slots[1]).toMatchObject({ empty: true, text: UI['ui.common.key.unbound'] });
    expect(rows.find((r) => r.action === 'select')?.slots[0]?.locked).toBe(true);
    expect(rows.some((r) => r.action === 'win_doors')).toBe(false);
    const changed = keyRows(
      'field',
      { 'field.interact.primary': { code: 'KeyF' } },
      { flags: NO_FLAGS, devMode: false, marked: new Set(['field.interact.primary']) },
    ).find((r) => r.action === 'interact');
    expect(changed?.slots[0]).toMatchObject({ text: 'F', changed: true, conflict: true });
  });

  it('reads a key press while recording: Esc cancels, Delete clears, modifiers wait', () => {
    expect(recordedKey({ code: 'Escape' })).toEqual({ kind: 'cancel' });
    expect(recordedKey({ code: 'Delete' })).toEqual({ kind: 'clear' });
    expect(recordedKey({ code: 'ShiftLeft', shiftKey: true })).toEqual({ kind: 'wait' });
    expect(recordedKey({ code: 'KeyA', shiftKey: true, ctrlKey: true })).toEqual({
      kind: 'chord',
      chord: { code: 'KeyA', shift: true, ctrl: true },
    });
    // Shift+Escape is an ordinary chord, not the cancel
    expect(recordedKey({ code: 'Escape', shiftKey: true }).kind).toBe('chord');
    expect(recordedMouse(0)).toEqual({ kind: 'wait' });
    expect(recordedMouse(2, { altKey: true })).toEqual({
      kind: 'chord',
      chord: { code: 'Mouse2', alt: true },
    });
    expect(recordedMouse(5)).toEqual({ kind: 'wait' });
  });

  it('binds a free key, refuses a locked slot, and returns clashes with their slots', () => {
    const at = { context: 'field' as const, action: 'interact', slot: 'secondary' as const };
    const free = bindKey({}, at, { code: 'KeyN', alt: true });
    expect(free).toEqual({
      kind: 'bound',
      overrides: { 'field.interact.secondary': { code: 'KeyN', alt: true } },
      reserved: false,
    });
    const locked = bindKey(
      {},
      { context: 'field', action: 'select', slot: 'primary' },
      { code: 'KeyQ' },
    );
    expect(locked).toEqual({ kind: 'refused', reason: 'locked' });
    const clash = bindKey({}, at, { code: 'KeyC' });
    expect(clash).toEqual({
      kind: 'conflict',
      chord: { code: 'KeyC' },
      conflicts: [{ context: 'field', action: 'win_character', slot: 'primary' }],
    });
    // a global key clashes from any context
    const global = bindKey({}, at, { code: 'F1' });
    expect(global.kind === 'conflict' && global.conflicts).toEqual([
      { context: 'global', action: 'help', slot: 'primary' },
    ]);
    const reserved = bindKey({}, at, { code: 'F12' });
    expect(reserved.kind === 'bound' && reserved.reserved).toBe(true);
    expect(bindKey({}, at, { code: 'F4', alt: true })).toEqual({
      kind: 'refused',
      reason: 'forbidden',
    });
  });

  it('replace clears the clashing slot first and leaves the keymap free of clashes', () => {
    const at = { context: 'field' as const, action: 'interact', slot: 'primary' as const };
    const clash = bindKey({}, at, { code: 'KeyC' });
    if (clash.kind !== 'conflict') throw new Error('expected a clash');
    const out = replaceKey({}, at, clash.chord as { code: string }, clash.conflicts);
    expect(out.kind).toBe('bound');
    if (out.kind !== 'bound') return;
    expect(out.overrides).toEqual({
      'field.win_character.primary': null,
      'field.interact.primary': { code: 'KeyC' },
    });
    const map = resolveContextKeymap(out.overrides);
    expect(map.field.interact?.primary).toEqual({ code: 'KeyC' });
    expect(map.field.win_character?.primary).toBeUndefined();
    expect(keymapConflicts(map)).toEqual([]);
  });

  it('refuses replace when a clashing slot is locked (it cannot be cleared)', () => {
    const at = { context: 'field' as const, action: 'interact', slot: 'secondary' as const };
    const clash = bindKey({}, at, { code: 'Mouse0' });
    expect(clash.kind).toBe('conflict');
    if (clash.kind !== 'conflict') return;
    expect(clash.conflicts).toContainEqual({ context: 'field', action: 'select', slot: 'primary' });
    expect(replaceKey({}, at, { code: 'Mouse0' }, clash.conflicts)).toEqual({
      kind: 'refused',
      reason: 'locked',
    });
  });

  it('names a clash with a layer not reached yet only as a feature not open (1.5)', () => {
    const at = { context: 'field' as const, action: 'interact', slot: 'secondary' as const };
    const clash = bindKey({}, at, { code: 'KeyN', shift: true });
    expect(clash.kind === 'conflict' && clash.conflicts).toEqual([
      { context: 'field', action: 'win_strategy', slot: 'primary' },
    ]);
    const c = { context: 'field' as const, action: 'win_strategy' };
    expect(slotShown(c, NO_FLAGS, false)).toBe(false);
    expect(conflictLabel(c, slotShown(c, NO_FLAGS, false))).toBe(
      UI['ui.set.controls.conflict_hidden'],
    );
    expect(slotShown(c, { 'feature.slg': true }, false)).toBe(true);
    expect(conflictLabel(c, true)).toContain(UI['ui.win.strategy.title']);
    expect(slotShown({ context: 'battle', action: 'hold' }, NO_FLAGS, false)).toBe(false);
  });

  it('clearing a slot through Delete stores an unbinding override', () => {
    const at = { context: 'field' as const, action: 'interact', slot: 'primary' as const };
    const out = bindKey({}, at, null);
    expect(out).toEqual({
      kind: 'bound',
      overrides: { 'field.interact.primary': null },
      reserved: false,
    });
  });
});

describe('controls page: pad rows and pad slots', () => {
  const padOpts = {
    flags: NO_FLAGS,
    devMode: false,
    family: 'xbox' as const,
    swapConfirmBack: false,
  };

  it('shows button slots as editable and fixed bindings as fixed, empty fixed slots left out', () => {
    const rows = padRows('field', {}, padOpts);
    const interact = rows.find((r) => r.action === 'interact');
    expect(interact?.slots[0]).toMatchObject({
      slot: 'primary',
      text: 'A',
      rebindable: true,
      chord: { button: 'a' },
    });
    const hotbar = rows.find((r) => r.action === 'hotbar_1');
    expect(hotbar?.slots.every((s) => !s.rebindable)).toBe(true);
    expect(hotbar?.slots.length).toBe(1);
    const move = rows.find((r) => r.action === 'move_up');
    expect(move?.slots[0]?.rebindable).toBe(false);
    expect(move?.slots[0]?.chord).toBeNull();
    // confirm and back swapped: the window confirm shows B
    const swapped = padRows('window', {}, { ...padOpts, swapConfirmBack: true });
    expect(swapped.find((r) => r.action === 'confirm')?.slots[0]?.text).toBe('B');
  });

  it('turns picker choices into chords and back', () => {
    expect(padChordFrom('y', 'tap')).toEqual({ button: 'y' });
    expect(padChordFrom('y', 'hold')).toEqual({ button: 'y', hold: true });
    expect(padChordFrom('a', 'lb')).toEqual({ button: 'a', with: 'lb' });
    expect(padChordFrom('lb', 'lb')).toBeNull();
    expect(padPressOf({ button: 'a', with: 'lb' })).toBe('lb');
    expect(padPressOf({ button: 'a', hold: true })).toBe('hold');
    expect(padPressOf(null)).toBe('tap');
  });

  it('binds a pad slot, reports a clash and replaces it', () => {
    const at = { context: 'field' as const, action: 'appraise', slot: 'primary' as const };
    const clash = bindPad({}, at, { button: 'y', hold: true });
    expect(clash).toEqual({
      kind: 'conflict',
      chord: { button: 'y', hold: true },
      conflicts: [{ context: 'field', action: 'camera_reset', slot: 'primary' }],
    });
    if (clash.kind !== 'conflict') return;
    const out = replacePad({}, at, clash.chord, clash.conflicts);
    expect(out).toEqual({
      kind: 'bound',
      overrides: {
        'field.camera_reset.primary': null,
        'field.appraise.primary': { button: 'y', hold: true },
      },
    });
    if (out.kind !== 'bound') return;
    const map = resolvePadKeymap(out.overrides);
    expect(map.field.appraise?.primary).toEqual({
      kind: 'button',
      chord: { button: 'y', hold: true },
    });
    expect(map.field.camera_reset?.primary).toBeUndefined();
    expect(
      bindPad({}, { context: 'field', action: 'hotbar_1', slot: 'primary' }, { button: 'a' }),
    ).toEqual({ kind: 'refused', reason: 'fixed' });
    expect(
      bindPad({}, { context: 'window', action: 'confirm', slot: 'primary' }, { button: 'x' }),
    ).toEqual({ kind: 'refused', reason: 'locked' });
  });
});

describe('controls page: options, export and import', () => {
  it('lists the pad options, the key-mouse soft target and the long-press group', () => {
    const groups = optionRows(sync.input, false);
    expect(groups.pad.map((r) => r.field)).toEqual([
      'padDeadInner',
      'padDeadOuter',
      'cameraSensitivity',
      'invertPitch',
      'softLock',
      'softCone',
      'lockOnCast',
      'rumble',
      'swapConfirmBack',
      'glyphs',
    ]);
    expect(groups.kbm.map((r) => r.field)).toEqual(['softLockKbm']);
    expect(groups.hold.map((r) => r.field)).toEqual(['holdSeconds', 'holdToToggle']);
    const rumble = groups.pad.find((r) => r.field === 'rumble');
    expect(rumble).toMatchObject({ kind: 'range', min: 0, max: 100, step: 5, value: 100 });
    const glyphs = groups.pad.find((r) => r.field === 'glyphs');
    expect(glyphs?.kind === 'choice' && glyphs.options.map((o) => o.value)).toEqual([
      ...GLYPH_SETTINGS,
    ]);
    for (const k of Object.values(OPTION_KEYS))
      expect(UI[`ui.set.controls.opt.${k}`], k).toBeTruthy();
    for (const g of GLYPH_SETTINGS) expect(UI[`ui.set.controls.family.${g}`], g).toBeTruthy();
  });

  it('snaps and clamps ranges, checks choices, and writes the hold switch to accessibility', () => {
    expect(optionPatch(sync, 'rumble', 47)?.input?.rumble).toBe(45);
    expect(optionPatch(sync, 'rumble', 140)?.input?.rumble).toBe(100);
    expect(optionPatch(sync, 'holdSeconds', '0.34')?.input?.holdSeconds).toBe(0.3);
    expect(optionPatch(sync, 'padDeadInner', 0.9)?.input?.padDeadInner).toBe(0.5);
    expect(optionPatch(sync, 'rumble', 'loud')).toBeNull();
    expect(optionPatch(sync, 'softCone', '90')?.input?.softCone).toBe(90);
    expect(optionPatch(sync, 'softCone', '45')).toBeNull();
    expect(optionPatch(sync, 'glyphs', 'switch')?.input?.glyphs).toBe('switch');
    expect(optionPatch(sync, 'glyphs', 'sega')).toBeNull();
    expect(optionPatch(sync, 'invertPitch', true)?.input?.invertPitch).toBe(true);
    expect(optionPatch(sync, 'invertPitch', 'yes')).toBeNull();
    const hold = optionPatch(sync, 'holdToToggle', true);
    expect(hold).toEqual({ accessibility: { ...sync.accessibility, holdToToggle: true } });
    for (const p of [
      optionPatch(sync, 'rumble', 47),
      optionPatch(sync, 'holdSeconds', 1.49),
      optionPatch(sync, 'cameraSensitivity', 2.6),
      hold,
    ]) {
      expect(p && checkPatch('sync', p).ok).toBe(true);
    }
    // a patch carries the other options unchanged
    expect(optionPatch(sync, 'rumble', 50)?.input).toEqual({ ...sync.input, rumble: 50 });
  });

  it('exports a scheme that imports back to the same values', () => {
    const changed = {
      contextKeys: {
        'field.interact.primary': { code: 'KeyF', shift: true },
        'field.mount.primary': null,
      },
      padKeys: { 'field.appraise.primary': { button: 'y' as const } },
      input: { ...sync.input, rumble: 40, glyphs: 'playstation' as const },
    };
    const text = exportControls(changed);
    expect(JSON.parse(text).format).toBe(CONTROLS_FORMAT);
    const back = importControls(text);
    expect(back).toEqual({ ok: true, patch: changed });
  });

  it('refuses bad JSON, other formats, newer versions and any invalid entry', () => {
    expect(importControls('{not json')).toEqual({ ok: false, reason: 'json' });
    expect(importControls('[]')).toEqual({ ok: false, reason: 'format' });
    expect(importControls(JSON.stringify({ format: 'other', version: 1 }))).toEqual({
      ok: false,
      reason: 'format',
    });
    expect(
      importControls(JSON.stringify({ format: CONTROLS_FORMAT, version: 9, input: {} })),
    ).toEqual({ ok: false, reason: 'newer' });
    expect(importControls(JSON.stringify({ format: CONTROLS_FORMAT, version: 1 }))).toEqual({
      ok: false,
      reason: 'format',
    });
    // one locked slot refuses the whole file
    const locked = JSON.stringify({
      format: CONTROLS_FORMAT,
      version: 1,
      contextKeys: { 'field.interact.primary': { code: 'KeyF' }, 'global.menu.primary': null },
    });
    expect(importControls(locked)).toEqual({ ok: false, reason: 'invalid' });
    const badInput = JSON.stringify({
      format: CONTROLS_FORMAT,
      version: 1,
      input: { ...sync.input, rumble: 500 },
    });
    expect(importControls(badInput)).toEqual({ ok: false, reason: 'invalid' });
    // entries valid one by one that bind one key to two actions of a context (F is the party
    // ring's key in the field): the rebind conflict check refuses the whole file (16.6)
    const clash = JSON.stringify({
      format: CONTROLS_FORMAT,
      version: 1,
      contextKeys: { 'field.interact.primary': { code: 'KeyF' } },
    });
    expect(importControls(clash)).toEqual({ ok: false, reason: 'conflict' });
    for (const r of ['json', 'format', 'newer', 'invalid', 'conflict'])
      expect(UI[`ui.set.controls.import_error.${r}`], r).toBeTruthy();
  });
});

describe('gameplay page model (4.5 first part)', () => {
  it('reads the difficulty flag, standard when a world has none', () => {
    expect(difficultyOf(undefined)).toBe('standard');
    expect(difficultyOf('legend')).toBe('legend');
    expect(difficultyOf('nightmare')).toBe('standard');
    for (const d of DIFFICULTIES) {
      expect(gameplayPageModel(sync.gameplay, d).difficulty).toContain(
        UI[`ui.set.gameplay.difficulty_name.${d}`],
      );
    }
  });

  it('offers the three speeds and guidance levels with the current values', () => {
    const m = gameplayPageModel({ textSpeed: 60, autoAdvance: true, guidance: 'brief' }, 'hard');
    expect(m.textSpeed.value).toBe(60);
    expect(m.textSpeed.options.map((o) => o.value)).toEqual([30, 60, 'instant']);
    expect(m.autoAdvance).toBe(true);
    expect(m.guidance.options.map((o) => o.value)).toEqual([...GUIDANCE_LEVELS]);
    expect(m.guidance.note).toBe(UI['ui.set.gameplay.guidance_note.brief']);
  });

  it('patches one field and refuses values that are not valid', () => {
    const g = sync.gameplay;
    expect(gameplayPatch(g, 'textSpeed', '60')).toEqual({ gameplay: { ...g, textSpeed: 60 } });
    expect(gameplayPatch(g, 'textSpeed', 'instant')?.gameplay?.textSpeed).toBe('instant');
    expect(gameplayPatch(g, 'textSpeed', '45')).toBeNull();
    expect(gameplayPatch(g, 'autoAdvance', true)?.gameplay?.autoAdvance).toBe(true);
    expect(gameplayPatch(g, 'autoAdvance', 'yes')).toBeNull();
    expect(gameplayPatch(g, 'guidance', 'off')?.gameplay?.guidance).toBe('off');
    expect(gameplayPatch(g, 'guidance', 'none')).toBeNull();
    const p = gameplayPatch(g, 'guidance', 'brief');
    expect(p && checkPatch('sync', p).ok).toBe(true);
  });
});

describe('help lines follow the current device (6.2.15, PK-M1-07 leftover)', () => {
  afterEach(() => installKeyText(null));

  it('renders every line again with the current bindings, so a device switch changes them', () => {
    installKeyText(null);
    const kbm = helpModel();
    expect(kbm.lines).toHaveLength(HELP_LINE_KEYS.length);
    // the interact line names E on the keyboard
    expect(kbm.lines[4]).toContain('E');
    installKeyText(() => ({ ...DEFAULT_KEY_TEXT_STATE, device: 'pad', family: 'playstation' }));
    const pad = helpModel();
    expect(pad.sig).not.toBe(kbm.sig);
    expect(pad.lines[4]).not.toBe(kbm.lines[4]);
    expect(pad.lines[4]).toContain(UI['ui.common.pad.playstation.a']);
    // nothing changed: the same signature, so the window keeps its list
    expect(helpModel().sig).toBe(pad.sig);
  });
});

describe('window tab keys that the browser does not take (PK-M1-07 leftover)', () => {
  it('binds Ctrl+] and Ctrl+[ as the second slot of the window tab actions', () => {
    expect(DEFAULT_CONTEXT_KEYMAP.window.next_tab).toEqual({
      primary: { code: 'Tab', ctrl: true },
      secondary: { code: 'BracketRight', ctrl: true },
    });
    expect(DEFAULT_CONTEXT_KEYMAP.window.prev_tab).toEqual({
      primary: { code: 'Tab', ctrl: true, shift: true },
      secondary: { code: 'BracketLeft', ctrl: true },
    });
    expect(
      chordConflicts(DEFAULT_CONTEXT_KEYMAP, 'window', 'next_tab', {
        code: 'BracketRight',
        ctrl: true,
      }),
    ).toEqual([]);
    expect(keymapConflicts(DEFAULT_CONTEXT_KEYMAP)).toEqual([]);
  });
});
