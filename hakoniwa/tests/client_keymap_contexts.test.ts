// Contextual key bindings and the rebinding core (ux_and_onboarding.md 16.1, 16.2, 16.6,
// the 23.1 M0 row on the contextual key table and the rebinding core; 23.2 key check): the default table has no
// conflicts within a context or against global, every context binds at least one action,
// cross-context reuse is allowed, locked slots can be neither cleared nor moved, Alt+F4 is refused, the
// system-reserved chords warn, rebinding back to the default removes the override, and
// overrides persist through SyncSettings.contextKeys.

import { describe, expect, it } from 'vitest';
import { checkPatch, normalizeSettings } from '../src/client/app/settings_schema';
import {
  BINDING_SLOTS,
  chordConflicts,
  chordEquals,
  chordFor,
  DEFAULT_CONTEXT_KEYMAP,
  INPUT_CONTEXTS,
  isForbiddenChord,
  isReservedChord,
  keymapConflicts,
  LOCKED_SLOTS,
  parseSlotKey,
  rebind,
  resetKeymap,
  resolveContextKeymap,
  slotKey,
} from '../src/client/input/contexts';

describe('default contextual key map', () => {
  it('covers every input context of 16.1', () => {
    expect([...INPUT_CONTEXTS]).toEqual([
      'global',
      'field',
      'dialogue',
      'creator',
      'window',
      'corridor',
      'lord',
      'battle',
      'continent',
      'travel',
      'court',
    ]);
    for (const c of INPUT_CONTEXTS) {
      expect(Object.keys(DEFAULT_CONTEXT_KEYMAP[c]).length, c).toBeGreaterThan(0);
    }
  });

  it('has no conflict inside a context or against global (23.2)', () => {
    expect(keymapConflicts(DEFAULT_CONTEXT_KEYMAP)).toEqual([]);
  });

  it('binds every action to at least one key, never to F12, Alt+F4 or Shift+Tab', () => {
    for (const c of INPUT_CONTEXTS) {
      for (const [action, b] of Object.entries(DEFAULT_CONTEXT_KEYMAP[c])) {
        expect(b.primary ?? b.secondary, `${c}.${action}`).toBeDefined();
        for (const slot of BINDING_SLOTS) {
          const chord = b[slot];
          if (!chord) continue;
          expect(isForbiddenChord(chord), `${c}.${action}`).toBe(false);
          expect(isReservedChord(chord), `${c}.${action}`).toBe(false);
        }
      }
    }
  });

  it('follows the 16.2 table on the rows the client already uses', () => {
    const m = DEFAULT_CONTEXT_KEYMAP;
    expect(m.global.menu?.primary).toEqual({ code: 'Escape' });
    expect(m.global.quick_save?.primary).toEqual({ code: 'F6' });
    expect(m.global.fullscreen).toEqual({
      primary: { code: 'Enter', alt: true },
      secondary: { code: 'F11' },
    });
    expect(m.field.interact?.primary).toEqual({ code: 'KeyE' });
    expect(m.field.win_inventory).toEqual({
      primary: { code: 'KeyI' },
      secondary: { code: 'KeyB' },
    });
    expect(m.field.target_prev?.primary).toEqual({ code: 'Tab', ctrl: true });
    // hotbar row one is 1 to 0, minus and equals (24.1: zoom moved off minus and equals)
    expect(m.field.hotbar_11?.primary).toEqual({ code: 'Minus' });
    expect(m.field.hotbar_12?.primary).toEqual({ code: 'Equal' });
    expect(m.field.zoom_in?.primary).toEqual({ code: 'NumpadAdd' });
    expect(m.corridor.prev_segment?.primary).toEqual({ code: 'KeyZ' });
  });

  it('allows the same key in two non-global contexts (16.6 rule 3)', () => {
    const z = { code: 'KeyZ' };
    expect(chordEquals(m('field', 'camera_turn_left'), z)).toBe(true);
    expect(chordEquals(m('corridor', 'prev_segment'), z)).toBe(true);
    expect(chordConflicts(DEFAULT_CONTEXT_KEYMAP, 'corridor', 'prev_segment', z)).toEqual([]);
  });
});

function m(context: (typeof INPUT_CONTEXTS)[number], action: string) {
  const c = chordFor(DEFAULT_CONTEXT_KEYMAP, context, action);
  if (!c) throw new Error(`${context}.${action} unbound`);
  return c;
}

describe('rebinding core', () => {
  it('rebinds a slot and resolves it over the default', () => {
    const r = rebind({}, 'field', 'interact', 'primary', { code: 'KeyF', shift: true });
    expect(r).toEqual({
      ok: true,
      overrides: { 'field.interact.primary': { code: 'KeyF', shift: true } },
      reserved: false,
    });
    if (!r.ok) return;
    const map = resolveContextKeymap(r.overrides);
    expect(map.field.interact?.primary).toEqual({ code: 'KeyF', shift: true });
    // other contexts and actions are untouched
    expect(map.corridor.open_door).toEqual(DEFAULT_CONTEXT_KEYMAP.corridor.open_door);
  });

  it('refuses a key another action of the same context uses, and one global uses', () => {
    const same = rebind({}, 'field', 'interact', 'primary', { code: 'KeyV' });
    expect(same).toEqual({
      ok: false,
      reason: 'conflict',
      conflicts: [{ context: 'field', action: 'appraise', slot: 'primary' }],
    });
    const global = rebind({}, 'corridor', 'open_door', 'primary', { code: 'F6' });
    expect(global).toMatchObject({
      ok: false,
      reason: 'conflict',
      conflicts: [{ context: 'global', action: 'quick_save', slot: 'primary' }],
    });
    // a global action clashes with any context
    const fromGlobal = rebind({}, 'global', 'help', 'primary', { code: 'KeyE' });
    expect(fromGlobal.ok).toBe(false);
  });

  it('lets an action reuse its own other slot key and a modifier make a new chord', () => {
    expect(rebind({}, 'field', 'move_up', 'primary', { code: 'ArrowUp' }).ok).toBe(true);
    expect(rebind({}, 'field', 'interact', 'primary', { code: 'KeyV', ctrl: true }).ok).toBe(true);
  });

  it('keeps locked slots on their default (16.6 rule 1), and refuses Alt+F4 (rule 4)', () => {
    expect([...LOCKED_SLOTS].sort()).toEqual(
      [
        'battle.select.primary',
        'continent.select.primary',
        'court.present.primary',
        'field.select.primary',
        'global.menu.primary',
        'lord.place.primary',
        'travel.pick_node.primary',
      ].sort(),
    );
    for (const key of LOCKED_SLOTS) {
      const [context, action] = key.split('.') as [(typeof INPUT_CONTEXTS)[number], string];
      expect(rebind({}, context, action, 'primary', null), key).toEqual({
        ok: false,
        reason: 'locked',
      });
      // moving it to another key is refused too: Esc stays the back action
      expect(rebind({}, context, action, 'primary', { code: 'F7' }), key).toEqual({
        ok: false,
        reason: 'locked',
      });
    }
    // the secondary slot of a locked action may be set and cleared
    expect(rebind({}, 'global', 'menu', 'secondary', { code: 'Backspace' }).ok).toBe(true);
    expect(rebind({}, 'field', 'mount', 'primary', { code: 'F4', alt: true })).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    // overrides of a locked slot and Alt+F4 are ignored when resolving
    const map = resolveContextKeymap({
      'global.menu.primary': { code: 'KeyQ' },
      'field.select.primary': null,
      'field.mount.primary': { code: 'F4', alt: true },
    });
    expect(map.global.menu?.primary).toEqual({ code: 'Escape' });
    expect(map.field.select?.primary).toEqual({ code: 'Mouse0' });
    expect(map.field.mount?.primary).toEqual({ code: 'KeyQ' });
    // own entries only: an inherited property name is no action
    expect(rebind({}, 'field', 'constructor', 'primary', { code: 'F7' })).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('warns on system-reserved chords but still allows them (16.6 rule 4)', () => {
    const r = rebind({}, 'field', 'mount', 'primary', { code: 'Tab', shift: true });
    expect(r).toMatchObject({ ok: true, reserved: true });
    expect(isReservedChord({ code: 'F12' })).toBe(true);
    expect(isReservedChord({ code: 'MetaLeft' })).toBe(true);
    expect(isReservedChord({ code: 'Tab', alt: true })).toBe(true);
    expect(isReservedChord({ code: 'Tab' })).toBe(false);
  });

  it('clears a slot with null and drops the override when the default comes back', () => {
    const cleared = rebind({}, 'field', 'win_inventory', 'secondary', null);
    expect(cleared).toMatchObject({
      ok: true,
      overrides: { 'field.win_inventory.secondary': null },
    });
    if (!cleared.ok) return;
    expect(resolveContextKeymap(cleared.overrides).field.win_inventory).toEqual({
      primary: { code: 'KeyI' },
    });
    const back = rebind(cleared.overrides, 'field', 'win_inventory', 'secondary', {
      code: 'KeyB',
    });
    expect(back).toMatchObject({ ok: true, overrides: {} });
  });

  it('refuses unknown actions and malformed key codes', () => {
    expect(rebind({}, 'field', 'fly', 'primary', { code: 'KeyF' })).toEqual({
      ok: false,
      reason: 'unknown',
    });
    expect(rebind({}, 'field', 'mount', 'primary', { code: 'not a code' })).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('resets every context or one (16.6 rule 7)', () => {
    const o = {
      'field.mount.primary': { code: 'KeyJ', ctrl: true },
      'corridor.leave.primary': { code: 'KeyQ' },
    };
    expect(resetKeymap(o)).toEqual({});
    expect(resetKeymap(o, 'field')).toEqual({ 'corridor.leave.primary': { code: 'KeyQ' } });
  });

  it('round-trips slot keys', () => {
    expect(slotKey('battle', 'hold', 'secondary')).toBe('battle.hold.secondary');
    expect(parseSlotKey('battle.hold.secondary')).toEqual({
      context: 'battle',
      action: 'hold',
      slot: 'secondary',
    });
    expect(parseSlotKey('nowhere.hold.primary')).toBeNull();
    expect(parseSlotKey('battle.hold.tertiary')).toBeNull();
  });
});

describe('persistence through the sync settings part (D-088)', () => {
  it('keeps valid overrides and drops bad ones one by one', () => {
    const n = normalizeSettings('sync', {
      version: 1,
      contextKeys: {
        'field.interact.primary': { code: 'KeyF', shift: true },
        'field.win_inventory.secondary': null,
        'global.menu.primary': null,
        'battle.select.primary': { code: 'KeyB' },
        'field.constructor.primary': { code: 'KeyB' },
        'field.party_ring.primary': { code: 'F4', alt: true },
        'field.fly.primary': { code: 'KeyF' },
        'field.mount.primary': { code: 'KeyQ', meta: true },
        'field.appraise.primary': { code: 'KeyV', shift: 'yes' },
      },
    });
    expect(n.values.contextKeys).toEqual({
      'field.interact.primary': { code: 'KeyF', shift: true },
      'field.win_inventory.secondary': null,
    });
    expect(n.issues.sort()).toEqual(
      [
        'contextKeys.battle.select.primary',
        'contextKeys.field.constructor.primary',
        'contextKeys.field.party_ring.primary',
        'contextKeys.field.appraise.primary',
        'contextKeys.field.fly.primary',
        'contextKeys.field.mount.primary',
        'contextKeys.global.menu.primary',
      ].sort(),
    );
  });

  it('keeps room for an override of every slot', () => {
    const all: Record<string, { code: string; ctrl: true }> = {};
    let i = 0;
    for (const c of INPUT_CONTEXTS)
      for (const a of Object.keys(DEFAULT_CONTEXT_KEYMAP[c]))
        for (const slot of BINDING_SLOTS) {
          const key = slotKey(c, a, slot);
          if (!LOCKED_SLOTS.has(key)) all[key] = { code: `F${(i++ % 24) + 1}`, ctrl: true };
        }
    const n = normalizeSettings('sync', { version: 1, contextKeys: all });
    expect(Object.keys(n.values.contextKeys).length).toBe(Object.keys(all).length);
    expect(n.issues).toEqual([]);
  });

  it('defaults to no overrides and accepts a strict patch', () => {
    expect(normalizeSettings('sync', { version: 1 }).values.contextKeys).toEqual({});
    expect(
      checkPatch('sync', { contextKeys: { 'corridor.leave.primary': { code: 'KeyQ' } } }),
    ).toEqual({ ok: true, patch: { contextKeys: { 'corridor.leave.primary': { code: 'KeyQ' } } } });
    expect(checkPatch('sync', { contextKeys: { 'global.menu.primary': null } })).toEqual({
      ok: false,
      field: 'contextKeys.global.menu.primary',
    });
  });

  it('resolves the stored overrides into the effective map', () => {
    const stored = normalizeSettings('sync', {
      version: 1,
      contextKeys: { 'field.interact.primary': { code: 'KeyF', shift: true } },
    }).values.contextKeys;
    expect(chordFor(resolveContextKeymap(stored), 'field', 'interact')).toEqual({
      code: 'KeyF',
      shift: true,
    });
  });
});
