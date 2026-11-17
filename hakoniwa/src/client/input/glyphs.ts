// Key glyphs (ux_and_onboarding.md 16.1, 16.6 rule 6, 20.3; release_engineering.md 4.4):
// the text of a key-mouse chord (key caps by physical key, with the keyboard layout's own
// character when the host can read it, US labels otherwise), of a pad binding in the active
// controller family, and of a `{key:<action>}` reference in any string: the current
// device's binding of that action, so no text ever names a fixed key. A reference is
// `<context>.<action>`, a bare `<action>` (looked up through the active contexts), or one of
// the composite references below (movement, the option range, cancel). Pure; the client
// installs a live resolver into t() with installKeyText.

import { setKeyText, t } from '../../shared_ui/i18n';
import {
  type ContextKeymap,
  chordFor,
  DEFAULT_CONTEXT_KEYMAP,
  INPUT_CONTEXTS,
  type InputContext,
  type KeyChord,
} from './contexts';
import type { GlyphFamily, InputDevice } from './device';
import {
  DEFAULT_PAD_KEYMAP,
  type HotbarLayers,
  hotbarLayers,
  hotbarSlotPosition,
  type PadBinding,
  type PadButton,
  type PadChord,
  type PadKeymap,
  padBindingFor,
  type RingId,
} from './pad_bindings';

/** A keyboard layout map: KeyboardEvent.code to the character the key types. */
export type LayoutMap = ReadonlyMap<string, string>;

const NAMED_KEYS: Readonly<Record<string, string>> = {
  Space: 'space',
  Enter: 'enter',
  NumpadEnter: 'enter',
  Escape: 'escape',
  Tab: 'tab',
  Backspace: 'backspace',
  Delete: 'delete',
  Insert: 'insert',
  Home: 'home',
  End: 'end',
  PageUp: 'page_up',
  PageDown: 'page_down',
  Pause: 'pause',
  ArrowUp: 'arrow_up',
  ArrowDown: 'arrow_down',
  ArrowLeft: 'arrow_left',
  ArrowRight: 'arrow_right',
  NumpadAdd: 'numpad_add',
  NumpadSubtract: 'numpad_subtract',
  NumpadMultiply: 'numpad_multiply',
  NumpadDivide: 'numpad_divide',
  NumpadDecimal: 'numpad_decimal',
  Mouse0: 'mouse0',
  Mouse1: 'mouse1',
  Mouse2: 'mouse2',
  Mouse3: 'mouse3',
  Mouse4: 'mouse4',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
  ControlLeft: 'ctrl',
  ControlRight: 'ctrl',
  AltLeft: 'alt',
  AltRight: 'alt',
  CapsLock: 'caps_lock',
  ContextMenu: 'context_menu',
};

/** US-layout characters of the punctuation keys. */
const US_CHARS: Readonly<Record<string, string>> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/** The cap of one key (no modifiers). */
export function keyCapText(code: string, layout?: LayoutMap | null): string {
  const named = NAMED_KEYS[code];
  if (named) return t(`ui.common.key.${named}`);
  const numpad = /^Numpad(\d)$/.exec(code);
  if (numpad) return t('ui.common.key.numpad', { n: numpad[1] as string });
  const fromLayout = layout?.get(code);
  if (fromLayout?.trim()) return fromLayout.toUpperCase();
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1] as string;
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1] as string;
  if (/^F\d{1,2}$/.test(code)) return code;
  return US_CHARS[code] ?? code;
}

/** A key-mouse chord: modifiers then the key ("Shift+1"). */
export function chordText(c: KeyChord, layout?: LayoutMap | null): string {
  let out = keyCapText(c.code, layout);
  if (c.alt) out = t('ui.common.key.combo', { a: t('ui.common.key.alt'), b: out });
  if (c.shift) out = t('ui.common.key.combo', { a: t('ui.common.key.shift'), b: out });
  if (c.ctrl) out = t('ui.common.key.combo', { a: t('ui.common.key.ctrl'), b: out });
  return out;
}

/** One pad button in a controller family. */
export function padButtonText(button: PadButton, family: GlyphFamily): string {
  return t(`ui.common.pad.${family}.${button}`);
}

export function padChordText(c: PadChord, family: GlyphFamily): string {
  let out = padButtonText(c.button, family);
  if (c.with) out = t('ui.common.key.combo', { a: padButtonText(c.with, family), b: out });
  if (c.hold) out = t('ui.common.pad.hold', { b: out });
  return out;
}

/** A pad binding of `context` in `map`: button, stick, ring opener, nav affordance, hotbar. */
export function padBindingText(
  x: PadBinding | undefined,
  family: GlyphFamily,
  map: PadKeymap,
  context: InputContext,
  layers: HotbarLayers = hotbarLayers(map),
  depth = 0,
): string {
  if (!x || depth > 3) return t('ui.common.key.unbound');
  switch (x.kind) {
    case 'button':
      return padChordText(x.chord, family);
    case 'stick': {
      let out = t(`ui.common.pad.stick.${x.stick}`);
      if (x.dir) out = t('ui.common.pad.stick_dir', { s: out, d: t(`ui.common.pad.dir.${x.dir}`) });
      if (x.with) out = t('ui.common.key.combo', { a: padButtonText(x.with, family), b: out });
      return out;
    }
    case 'ring': {
      const opener = RING_OPENERS[x.ring];
      return padBindingText(
        padBindingFor(map, opener.context, opener.action),
        family,
        map,
        opener.context,
        layers,
        depth + 1,
      );
    }
    case 'nav': {
      const own = map[context]?.[x.via] ? context : 'global';
      return padBindingText(padBindingFor(map, own, x.via), family, map, own, layers, depth + 1);
    }
    case 'hotbar': {
      const pos = hotbarSlotPosition(x.slot);
      if (!pos) return t('ui.common.key.unbound');
      const layer =
        pos.layer === 3
          ? t('ui.common.key.combo', {
              a: padButtonText(layers.a, family),
              b: padButtonText(layers.b, family),
            })
          : padButtonText(pos.layer === 1 ? layers.a : layers.b, family);
      return t('ui.common.key.combo', { a: layer, b: padButtonText(pos.button, family) });
    }
  }
}

/** The action whose button opens each ring (16.5). */
export const RING_OPENERS: Readonly<Record<RingId, { context: InputContext; action: string }>> = {
  windows: { context: 'field', action: 'ring_windows' },
  items: { context: 'field', action: 'ring_items' },
  party: { context: 'field', action: 'party_ring' },
  action: { context: 'continent', action: 'action_ring' },
  groups: { context: 'battle', action: 'ring_groups' },
};

/** What a `{key:}` reference reads: the device, the family and the live bindings. */
export interface KeyTextState {
  device: InputDevice;
  family: GlyphFamily;
  kbm: ContextKeymap;
  pad: PadKeymap;
  /** the active contexts, first wins (actions.ts contextStack) */
  stack: readonly InputContext[];
  layout?: LayoutMap | null;
}

export const DEFAULT_KEY_TEXT_STATE: KeyTextState = {
  device: 'kbm',
  family: 'xbox',
  kbm: DEFAULT_CONTEXT_KEYMAP,
  pad: DEFAULT_PAD_KEYMAP,
  stack: ['field', 'global'],
};

/** Composite references: one text for a group of actions, per device. */
const COMPOSITES: Readonly<
  Record<string, { kbm: (s: KeyTextState) => string; pad: (s: KeyTextState) => string }>
> = {
  'field.move': {
    kbm: (s) => {
      const caps = ['move_up', 'move_left', 'move_down', 'move_right'].map((a) =>
        actionText(s, 'field', a, 'kbm'),
      );
      return caps.every((c) => c.length === 1) ? caps.join('') : caps.join(t('ui.common.key.list'));
    },
    pad: (s) => padBindingText({ kind: 'stick', stick: 'left' }, s.family, s.pad, 'field'),
  },
  'dialogue.choose': {
    kbm: (s) =>
      t('ui.common.key.range', {
        a: actionText(s, 'dialogue', 'option_1', 'kbm'),
        b: actionText(s, 'dialogue', 'option_9', 'kbm'),
      }),
    pad: (s) =>
      t('ui.common.key.pair', {
        a: actionText(s, 'dialogue', 'option_prev', 'pad'),
        b: actionText(s, 'dialogue', 'option_next', 'pad'),
      }),
  },
  'global.cancel': {
    kbm: (s) => actionText(s, 'global', 'menu', 'kbm'),
    pad: (s) => actionText(s, 'global', 'back', 'pad'),
  },
};

/** The text of one action's binding on one device. */
export function actionText(
  s: KeyTextState,
  context: InputContext,
  action: string,
  device: InputDevice = s.device,
): string {
  if (device === 'pad') {
    const x = padBindingFor(s.pad, context, action);
    if (x) return padBindingText(x, s.family, s.pad, context);
    // a key-mouse-only action falls back to its key
  }
  const c = chordFor(s.kbm, context, action);
  return c ? chordText(c, s.layout) : t('ui.common.key.unbound');
}

/** The context that binds `action` first: the active stack, then every context. */
function contextOf(s: KeyTextState, action: string): InputContext | null {
  const order = [...s.stack, ...INPUT_CONTEXTS.filter((c) => !s.stack.includes(c))];
  for (const c of order) {
    if (Object.hasOwn(s.kbm[c], action) || Object.hasOwn(s.pad[c], action)) return c;
  }
  return null;
}

/** The text of a `{key:<ref>}` reference, or undefined when it names no action. */
export function keyRefText(ref: string, s: KeyTextState): string | undefined {
  const composite = COMPOSITES[ref];
  if (composite) return s.device === 'pad' ? composite.pad(s) : composite.kbm(s);
  const dot = ref.indexOf('.');
  const head = dot > 0 ? ref.slice(0, dot) : '';
  if ((INPUT_CONTEXTS as readonly string[]).includes(head)) {
    const context = head as InputContext;
    const action = ref.slice(dot + 1);
    if (!Object.hasOwn(s.kbm[context], action) && !Object.hasOwn(s.pad[context], action)) {
      return undefined;
    }
    return actionText(s, context, action);
  }
  const context = contextOf(s, ref);
  return context ? actionText(s, context, ref) : undefined;
}

/** Every composite reference name (the text check accepts them). */
export const COMPOSITE_KEY_REFS: readonly string[] = Object.keys(COMPOSITES);

/**
 * Install a live `{key:}` resolver into t() (null restores the default bindings). A reference
 * met while one is being resolved stays as written (no recursion through the state reader).
 */
export function installKeyText(state: (() => KeyTextState) | null): void {
  const read = state ?? (() => DEFAULT_KEY_TEXT_STATE);
  let busy = false;
  setKeyText((ref) => {
    if (busy) return undefined;
    busy = true;
    try {
      return keyRefText(ref, read());
    } finally {
      busy = false;
    }
  });
}

/** Every `{key:<ref>}` reference in a template. */
export function keyRefs(template: string): string[] {
  return [...template.matchAll(/\{key:([a-z0-9_.]+)\}/g)].map((m) => m[1] as string);
}
