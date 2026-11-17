// Implements the model of `ui_set_controls`, the controls and rebinding page
// (ux_and_onboarding.md 4.4, 16.6): the contexts the player has reached (later modes stay out
// of the list until they open, 1.5), each context's key-mouse rows (primary and secondary
// slot) and pad rows, the label of every action, binding and clearing a slot through the
// rebinding cores of src/client/input/ (rebind, rebindPad) with the clashing slots marked and
// a "replace" that clears them first, the gamepad and long-press options, and the export and
// import of a controls scheme as JSON. Pure; Node-tested. The painter is controls_page.ts.

import type { FlagValue } from '../../../core/contracts';
import { t } from '../../../shared_ui/i18n';
import { checkPatch, type SyncPatch, type SyncSettings } from '../../app/settings_schema';
import {
  BINDING_SLOTS,
  type BindingSlot,
  type BoundSlot,
  type ContextKeyOverrides,
  DEFAULT_CONTEXT_KEYMAP,
  INPUT_CONTEXTS,
  type InputContext,
  type KeyChord,
  keymapConflicts,
  LOCKED_SLOTS,
  rebind,
  resolveContextKeymap,
  slotKey,
} from '../../input/contexts';
import { GLYPH_FAMILIES, GLYPH_SETTINGS, type GlyphFamily } from '../../input/device';
import { chordText, padBindingText } from '../../input/glyphs';
import { INPUT_RANGES, type InputSettings } from '../../input/input_settings';
import {
  DEFAULT_PAD_KEYMAP,
  isRebindablePadSlot,
  LOCKED_PAD_SLOTS,
  PAD_BUTTONS,
  type PadButton,
  type PadChord,
  type PadKeyOverrides,
  padKeymapConflicts,
  rebindPad,
  resolvePadKeymap,
} from '../../input/pad_bindings';
import { SOFT_CONES } from '../../input/soft_target';
import { flagOn } from '../../view/game_view';
import { isWindowAvailable, PLANNED_WINDOWS, WINDOW_DEFS, type WindowId } from '../window_registry';

// ---------------------------------------------------------------------------
// Which contexts and actions show (linear release, 1.5: no key hint for a layer not open)

type Flags = Readonly<Record<string, FlagValue>>;

/** Acts from act 2 on: the travel mode opens there (1.5). */
const LATER_ACTS = new Set(['act2', 'act3', 'act4', 'act5', 'act6', 'epilogue']);

/** The flags that open a context's mode (1.5); contexts not listed are always shown. */
const CONTEXT_GATES: Partial<Record<InputContext, (f: Flags) => boolean>> = {
  corridor: (f) => flagOn(f['feature.door_corridor']),
  lord: (f) => flagOn(f['feature.city']) || flagOn(f['feature.village']),
  battle: (f) => flagOn(f['feature.rts']),
  continent: (f) => flagOn(f['feature.slg']),
  travel: (f) => LATER_ACTS.has(String(f.act ?? '')),
  court: (f) => flagOn(f.a6_court_open),
};

/** The contexts the page lists, in 16.1 order. */
export function visibleContexts(flags: Flags): InputContext[] {
  return INPUT_CONTEXTS.filter((c) => CONTEXT_GATES[c]?.(flags) ?? true);
}

const BUILT_WINDOWS: ReadonlySet<string> = new Set(WINDOW_DEFS.map((d) => d.id));
const PLANNED: ReadonlySet<string> = new Set(PLANNED_WINDOWS.map((d) => d.id));

/** The window a field action opens (`win_<id>`), or null. */
export function windowOfAction(action: string): string | null {
  const m = /^win_([a-z]+)$/.exec(action);
  return m ? (m[1] as string) : null;
}

/** Whether an action's row shows: window keys only for windows the player can open. */
export function actionVisible(
  context: InputContext,
  action: string,
  flags: Flags,
  devMode: boolean,
): boolean {
  if (context === 'global' && action === 'debug') return devMode;
  const win = context === 'field' ? windowOfAction(action) : null;
  if (!win) return true;
  if (!BUILT_WINDOWS.has(win)) return false;
  const def = WINDOW_DEFS.find((d) => d.id === (win as WindowId));
  return !!def && isWindowAvailable(def, flags, devMode);
}

/** Action names of a context: the key table's order, then pad-only actions. */
export function contextActions(context: InputContext): string[] {
  const out = Object.keys(DEFAULT_CONTEXT_KEYMAP[context]);
  for (const a of Object.keys(DEFAULT_PAD_KEYMAP[context])) if (!out.includes(a)) out.push(a);
  return out;
}

// ---------------------------------------------------------------------------
// Labels

/** Numbered action families: one label template with {n}. */
const NUMBERED = [
  'hotbar',
  'select_party',
  'item',
  'option',
  'group_set',
  'group_recall',
  'method',
] as const;

export interface LabelRef {
  key: string;
  params?: Record<string, number>;
}

/** The text key of an action's label (window keys read the window title). */
export function actionLabelRef(action: string): LabelRef {
  const win = windowOfAction(action);
  if (win && (BUILT_WINDOWS.has(win) || PLANNED.has(win))) return { key: `ui.win.${win}.title` };
  const m = /^([a-z_]+)_(\d+)$/.exec(action);
  if (m && (NUMBERED as readonly string[]).includes(m[1] as string)) {
    return { key: `ui.set.controls.action.${m[1]}_n`, params: { n: Number(m[2]) } };
  }
  return { key: `ui.set.controls.action.${action}` };
}

export function actionLabel(action: string): string {
  const r = actionLabelRef(action);
  return t(r.key, r.params);
}

export function contextLabel(context: InputContext): string {
  // the _label suffix keeps a context id such as `window` out of the generated key list as a bare
  // word (the architecture guard reads DOM globals in src/core)
  return t(`ui.set.controls.context.${context}_label`);
}

/** Whether a slot's context and action are open to the player (its name may be shown). */
export function slotShown(
  c: Pick<BoundSlot, 'context' | 'action'>,
  flags: Flags,
  devMode: boolean,
): boolean {
  return (
    visibleContexts(flags).includes(c.context) && actionVisible(c.context, c.action, flags, devMode)
  );
}

/**
 * "context: action" of a clashing slot; an action of a layer the player has not reached is
 * named only as "a feature not open yet" (1.5: no early view of later layers).
 */
export function conflictLabel(c: Pick<BoundSlot, 'context' | 'action'>, shown = true): string {
  if (!shown) return t('ui.set.controls.conflict_hidden');
  return t('ui.set.controls.conflict_item', {
    context: contextLabel(c.context),
    action: actionLabel(c.action),
  });
}

// ---------------------------------------------------------------------------
// Key-mouse rows

export interface KeySlotView {
  slot: BindingSlot;
  /** `<context>.<action>.<slot>` */
  key: string;
  text: string;
  empty: boolean;
  /** Esc's main slot and the pick clicks keep their default (16.6 rule 1) */
  locked: boolean;
  /** the player changed it */
  changed: boolean;
  /** marked: it clashes with the chord being bound */
  conflict: boolean;
}

export interface KeyRowView {
  action: string;
  label: string;
  slots: KeySlotView[];
}

export interface RowOptions {
  flags: Flags;
  devMode: boolean;
  /** slot keys to mark as clashing */
  marked?: ReadonlySet<string>;
}

export function keyRows(
  context: InputContext,
  overrides: ContextKeyOverrides,
  opts: RowOptions,
): KeyRowView[] {
  const map = resolveContextKeymap(overrides);
  const out: KeyRowView[] = [];
  for (const action of Object.keys(DEFAULT_CONTEXT_KEYMAP[context])) {
    if (!actionVisible(context, action, opts.flags, opts.devMode)) continue;
    const binding = map[context][action] ?? {};
    out.push({
      action,
      label: actionLabel(action),
      slots: BINDING_SLOTS.map((slot) => {
        const key = slotKey(context, action, slot);
        const chord = binding[slot];
        return {
          slot,
          key,
          text: chord ? chordText(chord) : t('ui.common.key.unbound'),
          empty: !chord,
          locked: LOCKED_SLOTS.has(key),
          changed: Object.hasOwn(overrides, key),
          conflict: !!opts.marked?.has(key),
        };
      }),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pad rows

export interface PadSlotView {
  slot: BindingSlot;
  key: string;
  text: string;
  empty: boolean;
  /** a button slot the player may change (sticks, rings, nav and hotbar entries are fixed) */
  rebindable: boolean;
  /** the slot's chord when it is a button binding */
  chord: PadChord | null;
  changed: boolean;
  conflict: boolean;
}

export interface PadRowView {
  action: string;
  label: string;
  slots: PadSlotView[];
}

export function padRows(
  context: InputContext,
  overrides: PadKeyOverrides,
  opts: RowOptions & { family: GlyphFamily; swapConfirmBack: boolean },
): PadRowView[] {
  const map = resolvePadKeymap(overrides, { swapConfirmBack: opts.swapConfirmBack });
  const out: PadRowView[] = [];
  for (const action of Object.keys(DEFAULT_PAD_KEYMAP[context])) {
    if (!actionVisible(context, action, opts.flags, opts.devMode)) continue;
    const binding = map[context][action] ?? {};
    const slots: PadSlotView[] = [];
    for (const slot of BINDING_SLOTS) {
      const key = slotKey(context, action, slot);
      const x = binding[slot];
      const rebindable = isRebindablePadSlot(context, action, slot);
      // an empty slot nobody can fill is left out of the row
      if (!x && !rebindable) continue;
      slots.push({
        slot,
        key,
        text: x ? padBindingText(x, opts.family, map, context) : t('ui.common.key.unbound'),
        empty: !x,
        rebindable,
        chord: x?.kind === 'button' ? { ...x.chord } : null,
        changed: Object.hasOwn(overrides, key),
        conflict: !!opts.marked?.has(key),
      });
    }
    out.push({ action, label: actionLabel(action), slots });
  }
  return out;
}

/** The family the pad rows draw: the setting, or Xbox style while it is automatic. */
export function rowFamily(setting: InputSettings['glyphs']): GlyphFamily {
  return setting === 'auto' ? 'xbox' : setting;
}

// ---------------------------------------------------------------------------
// Recording a key

/** What a key press means while a slot is recording (4.4: Esc cancels, Delete clears). */
export type RecordedKey =
  | { kind: 'cancel' }
  | { kind: 'clear' }
  | { kind: 'chord'; chord: KeyChord }
  | { kind: 'wait' };

const MODIFIER_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

export function recordedKey(ev: {
  code: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}): RecordedKey {
  const plain = !ev.shiftKey && !ev.ctrlKey && !ev.altKey;
  if (ev.code === 'Escape' && plain) return { kind: 'cancel' };
  if (ev.code === 'Delete' && plain) return { kind: 'clear' };
  // a modifier alone waits for the key it modifies
  if (MODIFIER_CODES.has(ev.code) || !ev.code) return { kind: 'wait' };
  const chord: KeyChord = { code: ev.code };
  if (ev.shiftKey) chord.shift = true;
  if (ev.ctrlKey) chord.ctrl = true;
  if (ev.altKey) chord.alt = true;
  return { kind: 'chord', chord };
}

/** A mouse button while recording: the middle, back and forward buttons and the right one. */
export function recordedMouse(
  button: number,
  mods: { shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean } = {},
): RecordedKey {
  if (button < 1 || button > 4) return { kind: 'wait' };
  return recordedKey({ code: `Mouse${button}`, ...mods });
}

export interface SlotRef {
  context: InputContext;
  action: string;
  slot: BindingSlot;
}

export type KeyBindOutcome =
  | { kind: 'bound'; overrides: ContextKeyOverrides; reserved: boolean }
  | { kind: 'conflict'; chord: KeyChord; conflicts: BoundSlot[] }
  | { kind: 'refused'; reason: 'unknown' | 'locked' | 'forbidden' };

/** Bind or clear one key slot (rebind); a clash comes back with the clashing slots. */
export function bindKey(
  overrides: ContextKeyOverrides,
  at: SlotRef,
  chord: KeyChord | null,
): KeyBindOutcome {
  const r = rebind(overrides, at.context, at.action, at.slot, chord);
  if (r.ok) return { kind: 'bound', overrides: r.overrides, reserved: r.reserved };
  if (r.reason === 'conflict')
    return { kind: 'conflict', chord: chord as KeyChord, conflicts: r.conflicts };
  return { kind: 'refused', reason: r.reason };
}

/**
 * "Replace" (4.4): clear every clashing slot, then bind. Refused (nothing changes) when a
 * clashing slot is locked, so it cannot be cleared.
 */
export function replaceKey(
  overrides: ContextKeyOverrides,
  at: SlotRef,
  chord: KeyChord,
  conflicts: readonly BoundSlot[],
): KeyBindOutcome {
  let next = overrides;
  for (const c of conflicts) {
    const cleared = rebind(next, c.context, c.action, c.slot, null);
    if (!cleared.ok) return { kind: 'refused', reason: 'locked' };
    next = cleared.overrides;
  }
  return bindKey(next, at, chord);
}

// ---------------------------------------------------------------------------
// Pad slots: picked from lists (a button, then tap, long press or "with" another button)

/** How a pad chord is pressed: a tap, a long press, or while another button is held. */
export type PadPress = 'tap' | 'hold' | PadButton;

export function padPressOf(c: PadChord | null): PadPress {
  if (!c) return 'tap';
  if (c.hold) return 'hold';
  return c.with ?? 'tap';
}

/** The chord a button and a press make, or null when they cannot combine. */
export function padChordFrom(button: PadButton, press: PadPress): PadChord | null {
  if (press === 'tap') return { button };
  if (press === 'hold') return { button, hold: true };
  return press === button ? null : { button, with: press };
}

/** Every button, for the pickers. */
export const PAD_PICK_BUTTONS: readonly PadButton[] = PAD_BUTTONS;

export type PadBindOutcome =
  | { kind: 'bound'; overrides: PadKeyOverrides }
  | { kind: 'conflict'; chord: PadChord; conflicts: BoundSlot[] }
  | { kind: 'refused'; reason: 'unknown' | 'locked' | 'fixed' | 'layer' };

export function bindPad(
  overrides: PadKeyOverrides,
  at: SlotRef,
  chord: PadChord | null,
): PadBindOutcome {
  const r = rebindPad(overrides, at.context, at.action, at.slot, chord);
  if (r.ok) return { kind: 'bound', overrides: r.overrides };
  if (r.reason === 'conflict')
    return { kind: 'conflict', chord: chord as PadChord, conflicts: r.conflicts };
  return { kind: 'refused', reason: r.reason };
}

/** "Replace" for a pad slot: clear the clashing slots, then bind. */
export function replacePad(
  overrides: PadKeyOverrides,
  at: SlotRef,
  chord: PadChord,
  conflicts: readonly BoundSlot[],
): PadBindOutcome {
  let next = overrides;
  for (const c of conflicts) {
    if (LOCKED_PAD_SLOTS.has(slotKey(c.context, c.action, c.slot))) {
      return { kind: 'refused', reason: 'locked' };
    }
    const cleared = rebindPad(next, c.context, c.action, c.slot, null);
    if (!cleared.ok) return { kind: 'refused', reason: 'locked' };
    next = cleared.overrides;
  }
  return bindPad(next, at, chord);
}

/** The text of a refusal. */
export function refusalText(reason: string): string {
  switch (reason) {
    case 'locked':
      return t('ui.set.controls.refused.locked');
    case 'forbidden':
      return t('ui.set.controls.refused.forbidden');
    case 'fixed':
      return t('ui.set.controls.refused.fixed');
    case 'layer':
      return t('ui.set.controls.refused.layer');
    default:
      return t('ui.set.controls.refused.unknown');
  }
}

// ---------------------------------------------------------------------------
// Options (4.4: gamepad options and long press)

export type OptionField = keyof InputSettings | 'holdToToggle';

/** The text key segment of each option (keys are lowercase with underscores). */
export const OPTION_KEYS = {
  padDeadInner: 'pad_dead_inner',
  padDeadOuter: 'pad_dead_outer',
  cameraSensitivity: 'camera_sensitivity',
  invertPitch: 'invert_pitch',
  softLock: 'soft_lock',
  softLockKbm: 'soft_lock_kbm',
  softCone: 'soft_cone',
  lockOnCast: 'lock_on_cast',
  rumble: 'rumble',
  swapConfirmBack: 'swap_confirm_back',
  glyphs: 'glyphs',
  holdSeconds: 'hold_seconds',
  holdToToggle: 'hold_to_toggle',
} as const satisfies Record<OptionField, string>;

function optionLabel(field: OptionField): string {
  return t(`ui.set.controls.opt.${OPTION_KEYS[field]}`);
}

export type OptionRow =
  | {
      field: OptionField;
      kind: 'range';
      label: string;
      min: number;
      max: number;
      step: number;
      value: number;
      text: string;
    }
  | { field: OptionField; kind: 'toggle'; label: string; value: boolean }
  | {
      field: OptionField;
      kind: 'choice';
      label: string;
      value: string;
      options: { value: string; label: string }[];
    };

const RANGE_STEPS: Readonly<Record<keyof typeof INPUT_RANGES, number>> = {
  padDeadInner: 0.05,
  padDeadOuter: 0.05,
  cameraSensitivity: 0.25,
  rumble: 5,
  holdSeconds: 0.1,
};

function rangeText(field: keyof typeof INPUT_RANGES, v: number): string {
  switch (field) {
    case 'padDeadInner':
    case 'padDeadOuter':
      return t('ui.set.controls.unit.percent', { n: Math.round(v * 100) });
    case 'cameraSensitivity':
      return t('ui.set.controls.unit.times', { n: Math.round(v * 100) / 100 });
    case 'holdSeconds':
      return t('ui.set.controls.unit.seconds', { n: Math.round(v * 10) / 10 });
    default:
      return t('ui.set.controls.unit.plain', { n: Math.round(v) });
  }
}

function range(field: keyof typeof INPUT_RANGES, input: InputSettings): OptionRow {
  const [min, max] = INPUT_RANGES[field];
  const value = input[field];
  return {
    field,
    kind: 'range',
    label: optionLabel(field),
    min,
    max,
    step: RANGE_STEPS[field],
    value,
    text: rangeText(field, value),
  };
}

function toggle(field: OptionField, value: boolean): OptionRow {
  return { field, kind: 'toggle', label: optionLabel(field), value };
}

/** The gamepad options, the key-mouse soft-target switch and the long-press group. */
export function optionRows(
  input: InputSettings,
  holdToToggle: boolean,
): { pad: OptionRow[]; kbm: OptionRow[]; hold: OptionRow[] } {
  return {
    pad: [
      range('padDeadInner', input),
      range('padDeadOuter', input),
      range('cameraSensitivity', input),
      toggle('invertPitch', input.invertPitch),
      toggle('softLock', input.softLock),
      {
        field: 'softCone',
        kind: 'choice',
        label: optionLabel('softCone'),
        value: String(input.softCone),
        options: SOFT_CONES.map((c) => ({
          value: String(c),
          label: t('ui.set.controls.unit.degrees', { n: c }),
        })),
      },
      toggle('lockOnCast', input.lockOnCast),
      range('rumble', input),
      toggle('swapConfirmBack', input.swapConfirmBack),
      {
        field: 'glyphs',
        kind: 'choice',
        label: optionLabel('glyphs'),
        value: input.glyphs,
        options: GLYPH_SETTINGS.map((g) => ({
          value: g,
          label: t(`ui.set.controls.family.${g}`),
        })),
      },
    ],
    kbm: [toggle('softLockKbm', input.softLockKbm)],
    hold: [range('holdSeconds', input), toggle('holdToToggle', holdToToggle)],
  };
}

/**
 * The settings patch for one option change from a control's raw value (a range snaps to its
 * step inside its range; a choice must be one of its values), or null when the value is not
 * valid.
 */
export function optionPatch(
  sync: Pick<SyncSettings, 'input' | 'accessibility'>,
  field: OptionField,
  raw: string | number | boolean,
): SyncPatch | null {
  if (field === 'holdToToggle') {
    if (typeof raw !== 'boolean') return null;
    return { accessibility: { ...sync.accessibility, holdToToggle: raw } };
  }
  const input: InputSettings = { ...sync.input };
  if (field in INPUT_RANGES) {
    const f = field as keyof typeof INPUT_RANGES;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return null;
    const [min, max] = INPUT_RANGES[f];
    const step = RANGE_STEPS[f];
    const snapped = Math.round((Math.max(min, Math.min(max, n)) - min) / step) * step + min;
    input[f] = Math.max(min, Math.min(max, Math.round(snapped * 1000) / 1000));
  } else if (field === 'softCone') {
    const n = Number(raw);
    if (!(SOFT_CONES as readonly number[]).includes(n)) return null;
    input.softCone = n as InputSettings['softCone'];
  } else if (field === 'glyphs') {
    if (!(GLYPH_SETTINGS as readonly unknown[]).includes(raw)) return null;
    input.glyphs = raw as InputSettings['glyphs'];
  } else {
    if (typeof raw !== 'boolean') return null;
    (input as unknown as Record<string, boolean>)[field] = raw;
  }
  return { input };
}

// ---------------------------------------------------------------------------
// Export and import (4.4 "scheme")

export const CONTROLS_FORMAT = 'hakoniwa-controls';
export const CONTROLS_FORMAT_VERSION = 1;

/** The scheme as JSON: key and pad overrides and the input options. */
export function exportControls(
  sync: Pick<SyncSettings, 'contextKeys' | 'padKeys' | 'input'>,
): string {
  return JSON.stringify(
    {
      format: CONTROLS_FORMAT,
      version: CONTROLS_FORMAT_VERSION,
      contextKeys: sync.contextKeys,
      padKeys: sync.padKeys,
      input: sync.input,
    },
    null,
    2,
  );
}

export type ImportResult =
  | { ok: true; patch: SyncPatch }
  | { ok: false; reason: 'json' | 'format' | 'newer' | 'invalid' | 'conflict' };

/**
 * Read an exported scheme. Every entry is checked strictly by the settings schema: one bad
 * key or option refuses the whole file (nothing half-applied).
 */
export function importControls(text: string): ImportResult {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    return { ok: false, reason: 'format' };
  const o = v as Record<string, unknown>;
  if (o.format !== CONTROLS_FORMAT) return { ok: false, reason: 'format' };
  if (typeof o.version !== 'number' || !Number.isInteger(o.version) || o.version < 1) {
    return { ok: false, reason: 'format' };
  }
  if (o.version > CONTROLS_FORMAT_VERSION) return { ok: false, reason: 'newer' };
  const patch: Record<string, unknown> = {};
  for (const k of ['contextKeys', 'padKeys', 'input'] as const) if (k in o) patch[k] = o[k];
  if (Object.keys(patch).length === 0) return { ok: false, reason: 'format' };
  const checked = checkPatch('sync', patch as SyncPatch);
  if (!checked.ok) return { ok: false, reason: 'invalid' };
  // Each entry may be valid alone and the scheme still bind one key to two actions of a
  // context: the same conflict check a rebind runs (16.6) refuses the whole file.
  const keys = checked.patch.contextKeys;
  if (keys && keymapConflicts(resolveContextKeymap(keys)).length > 0) {
    return { ok: false, reason: 'conflict' };
  }
  const pads = checked.patch.padKeys;
  const swap = checked.patch.input?.swapConfirmBack ?? false;
  if (pads && padKeymapConflicts(resolvePadKeymap(pads, { swapConfirmBack: swap })).length > 0) {
    return { ok: false, reason: 'conflict' };
  }
  return { ok: true, patch: checked.patch };
}

export function importErrorText(reason: Exclude<ImportResult, { ok: true }>['reason']): string {
  return t(`ui.set.controls.import_error.${reason}`);
}

/** Every glyph family, for tests and the picker. */
export const FAMILIES: readonly GlyphFamily[] = GLYPH_FAMILIES;
