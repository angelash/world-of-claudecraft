// Contextual key bindings and the rebinding core (ux_and_onboarding.md 16.1, 16.2, 16.6).
// `keymap.ts` keeps the single-context map input_controller.ts reads today; this module is
// the M0 surface above it (24.2 item 1): every input context, the default key-mouse table per
// context and action with two slots (primary, secondary), conflict detection scoped to one
// context plus global (16.6 rule 3: one key may bind different actions in different
// contexts), and the pure functions that rebind, clear and reset slots. Overrides are keyed
// `<context>.<action>.<slot>` and stored in the sync settings part as SyncSettings.contextKeys
// (settings_schema.ts), shared by every save (16.6 rule 7). Locked slots (Esc's back action,
// the left-click pick of every context) keep their default chord: they can be neither
// cleared nor moved, only given a second key. Pure, no DOM. PK-M1-07 builds the per-context
// input layer, the gamepad table, the glyphs for {key:<action>} and the rebinding screen.

/** Every input context (16.1); conflicts are checked within one and against 'global'. */
export const INPUT_CONTEXTS = [
  'global',
  'field',
  'dialogue',
  'window',
  'corridor',
  'lord',
  'battle',
  'continent',
  'travel',
  'court',
] as const;
export type InputContext = (typeof INPUT_CONTEXTS)[number];

export const BINDING_SLOTS = ['primary', 'secondary'] as const;
export type BindingSlot = (typeof BINDING_SLOTS)[number];

/**
 * One binding: a KeyboardEvent.code (or Mouse0 to Mouse4 for MouseEvent.button) with
 * optional modifiers (16.6 rule 2: Shift, Ctrl, Alt combine; no key sequences).
 */
export interface KeyChord {
  code: string;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
}

/** The two slots of one action (16.6 rule 1); an effective slot may be cleared. */
export interface ActionBinding {
  primary?: KeyChord;
  secondary?: KeyChord;
}

/** Bindings per context and action. */
export type ContextKeymap = Readonly<
  Record<InputContext, Readonly<Record<string, Readonly<ActionBinding>>>>
>;

/** A KeyboardEvent.code, or a mouse button Mouse0 to Mouse4. */
export const CHORD_CODE = /^[A-Za-z][A-Za-z0-9]{0,31}$/;

const k = (code: string, mods: Omit<KeyChord, 'code'> = {}): KeyChord => ({ code, ...mods });
const two = (primary: KeyChord, secondary?: KeyChord): ActionBinding =>
  secondary ? { primary, secondary } : { primary };

/**
 * Default key-mouse bindings (16.2). Esc is the one global back action ("menu, back, close");
 * contexts never bind it again. Rows the design lists as pointer gestures (drags, the wheel,
 * edge panning) or as held modifiers (Shift to place continuously) are not rebindable keys
 * and stay out; hotbar slots past 12 and the gamepad table arrive with PK-M1-07.
 */
export const DEFAULT_CONTEXT_KEYMAP: ContextKeymap = {
  global: {
    menu: two(k('Escape')),
    help: two(k('F1')),
    quick_save: two(k('F6')),
    quick_load: two(k('F9')),
    hide_ui: two(k('F10')),
    fullscreen: two(k('Enter', { alt: true }), k('F11')),
    debug: two(k('Backquote'), k('F3')),
  },
  field: {
    move_up: two(k('KeyW'), k('ArrowUp')),
    move_down: two(k('KeyS'), k('ArrowDown')),
    move_left: two(k('KeyA'), k('ArrowLeft')),
    move_right: two(k('KeyD'), k('ArrowRight')),
    select: two(k('Mouse0')),
    interact: two(k('KeyE')),
    focus: two(k('Mouse0', { shift: true })),
    camera_turn_left: two(k('KeyZ')),
    camera_turn_right: two(k('KeyX')),
    camera_toggle: two(k('KeyG')),
    camera_reset: two(k('Home')),
    zoom_in: two(k('NumpadAdd'), k('PageUp')),
    zoom_out: two(k('NumpadSubtract'), k('PageDown')),
    target_next: two(k('Tab')),
    target_prev: two(k('Tab', { ctrl: true })),
    appraise: two(k('KeyV')),
    mount: two(k('KeyQ')),
    party_ring: two(k('KeyF'), k('Mouse1')),
    advance: two(k('Space'), k('Enter')),
    pause: two(k('KeyP'), k('Pause')),
    slow_down: two(k('BracketLeft')),
    speed_up: two(k('BracketRight')),
    wait: two(k('KeyP', { shift: true })),
    ...hotbarRow(),
    win_character: two(k('KeyC')),
    win_inventory: two(k('KeyI'), k('KeyB')),
    win_doors: two(k('KeyK')),
    win_quests: two(k('KeyL')),
    win_map: two(k('KeyM')),
    win_atlas: two(k('KeyN')),
    win_deeds: two(k('KeyJ')),
    win_codex: two(k('KeyU')),
    win_craft: two(k('KeyT')),
    win_party: two(k('KeyO')),
    win_beasts: two(k('KeyO', { shift: true })),
    win_rumors: two(k('KeyR')),
    win_goddess: two(k('KeyY')),
    win_letters: two(k('KeyH')),
    win_company: two(k('KeyI', { shift: true })),
    win_territory: two(k('KeyM', { shift: true })),
    win_council: two(k('KeyJ', { shift: true })),
    win_army: two(k('KeyR', { shift: true })),
    win_strategy: two(k('KeyN', { shift: true })),
  },
  dialogue: {
    advance: two(k('Space'), k('Enter')),
    recall: two(k('PageUp')),
    auto_advance: two(k('KeyA')),
    hide_text: two(k('KeyH')),
    ...Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [`option_${i + 1}`, two(k(`Digit${i + 1}`))]),
    ),
  },
  window: {
    focus_next: two(k('Tab')),
    confirm: two(k('Enter')),
    next_tab: two(k('Tab', { ctrl: true })),
    discard: two(k('Delete')),
    context_menu: two(k('Mouse2')),
  },
  corridor: {
    move_up: two(k('KeyW'), k('ArrowUp')),
    move_down: two(k('KeyS'), k('ArrowDown')),
    move_left: two(k('KeyA'), k('ArrowLeft')),
    move_right: two(k('KeyD'), k('ArrowRight')),
    prev_segment: two(k('KeyZ')),
    next_segment: two(k('KeyX')),
    open_door: two(k('KeyE')),
    pin_tracker: two(k('KeyF')),
    leave: two(k('KeyK')),
  },
  lord: {
    pan_up: two(k('KeyW')),
    pan_down: two(k('KeyS')),
    pan_left: two(k('KeyA')),
    pan_right: two(k('KeyD')),
    rotate_building: two(k('KeyR')),
    place: two(k('Mouse0')),
    layer_cycle: two(k('Tab')),
    pause: two(k('Space')),
    speed_slow: two(k('Digit1')),
    speed_mid: two(k('Digit2')),
    speed_fast: two(k('Digit3')),
  },
  battle: {
    select: two(k('Mouse0')),
    order: two(k('Mouse2')),
    attack_move: two(k('KeyA')),
    hold: two(k('KeyH')),
    retreat: two(k('KeyR', { shift: true })),
    formation_ring: two(k('KeyF')),
    ...Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [
        `hero_ability_${i + 1}`,
        two(k(`Digit${(i + 1) % 10}`)),
      ]),
    ),
    ...Object.fromEntries(
      Array.from({ length: 4 }, (_, i) => [
        `group_set_${i + 1}`,
        two(k(`Digit${i + 1}`, { ctrl: true })),
      ]),
    ),
    pause: two(k('Space')),
    slow_motion: two(k('Space', { shift: true })),
    mode_toggle: two(k('Tab')),
    delegate: two(k('KeyG')),
    regiment_view: two(k('KeyV')),
  },
  continent: {
    select: two(k('Mouse0')),
    move_order: two(k('Mouse2')),
    pause: two(k('Space')),
    speed_slow: two(k('Digit1')),
    speed_mid: two(k('Digit2')),
    speed_fast: two(k('Digit3')),
    layer_cycle: two(k('Tab')),
    action_ring: two(k('KeyF')),
    prev_army: two(k('KeyQ')),
    next_army: two(k('KeyE')),
  },
  travel: {
    pick_node: two(k('Mouse0')),
    method_1: two(k('Digit1')),
    method_2: two(k('Digit2')),
    method_3: two(k('Digit3')),
    method_4: two(k('Digit4')),
    depart: two(k('Enter')),
    stop_next: two(k('Space')),
  },
  court: {
    present: two(k('Mouse0')),
    submit: two(k('Enter')),
  },
};

/** Hotbar row one (16.2): 1 to 0, minus and equals; secondary keys are numpad 1 to 9. */
function hotbarRow(): Record<string, ActionBinding> {
  const codes = [
    'Digit1',
    'Digit2',
    'Digit3',
    'Digit4',
    'Digit5',
    'Digit6',
    'Digit7',
    'Digit8',
    'Digit9',
    'Digit0',
    'Minus',
    'Equal',
  ];
  const out: Record<string, ActionBinding> = {};
  codes.forEach((code, i) => {
    out[`hotbar_${i + 1}`] = two(k(code), i < 9 ? k(`Numpad${i + 1}`) : undefined);
  });
  return out;
}

/**
 * Slots that keep their default chord (16.6 rule 1): Esc's main slot and the left-click
 * pick of every context that has one. They can be neither cleared nor rebound; the other
 * slot of the same action is free.
 */
export const LOCKED_SLOTS: ReadonlySet<string> = new Set([
  'global.menu.primary',
  'field.select.primary',
  'lord.place.primary',
  'battle.select.primary',
  'continent.select.primary',
  'travel.pick_node.primary',
  'court.present.primary',
]);

/** The default binding of `context`.`action` (own entries only), or undefined. */
export function defaultBinding(
  context: InputContext,
  action: string,
  defaults: ContextKeymap = DEFAULT_CONTEXT_KEYMAP,
): Readonly<ActionBinding> | undefined {
  const table = defaults[context];
  return table && Object.hasOwn(table, action) ? table[action] : undefined;
}

/** The override and lock key of one slot: `<context>.<action>.<slot>`. */
export function slotKey(context: InputContext, action: string, slot: BindingSlot): string {
  return `${context}.${action}.${slot}`;
}

/** The parts of a slot key, or null when it names no context and slot. */
export function parseSlotKey(
  key: string,
): { context: InputContext; action: string; slot: BindingSlot } | null {
  const m = /^([a-z]+)\.([a-z0-9_]+)\.(primary|secondary)$/.exec(key);
  if (!m || !(INPUT_CONTEXTS as readonly string[]).includes(m[1] as string)) return null;
  return { context: m[1] as InputContext, action: m[2] as string, slot: m[3] as BindingSlot };
}

/** True when two chords are the same key with the same modifiers. */
export function chordEquals(a: KeyChord, b: KeyChord): boolean {
  return (
    a.code === b.code && !!a.shift === !!b.shift && !!a.ctrl === !!b.ctrl && !!a.alt === !!b.alt
  );
}

/**
 * Chords the system or Steam already claim (16.6 rule 4; 16.2: Shift+Tab, Alt+Tab, the
 * Windows key, F12): warn, still allow.
 */
export function isReservedChord(c: KeyChord): boolean {
  if (c.code === 'Tab' && ((c.shift && !c.ctrl && !c.alt) || (c.alt && !c.ctrl))) return true;
  if (c.code === 'F12') return true;
  return c.code === 'MetaLeft' || c.code === 'MetaRight';
}

/** The one chord refused outright (16.6 rule 4): Alt+F4. */
export function isForbiddenChord(c: KeyChord): boolean {
  return c.code === 'F4' && !!c.alt;
}

export interface BoundSlot {
  context: InputContext;
  action: string;
  slot: BindingSlot;
}

/** Every slot bound to `chord` in `map`, in context and table order. */
export function chordUsers(map: ContextKeymap, chord: KeyChord): BoundSlot[] {
  const out: BoundSlot[] = [];
  for (const context of INPUT_CONTEXTS) {
    for (const [action, binding] of Object.entries(map[context])) {
      for (const slot of BINDING_SLOTS) {
        const c = binding[slot];
        if (c && chordEquals(c, chord)) out.push({ context, action, slot });
      }
    }
  }
  return out;
}

/**
 * The slots `chord` would clash with when bound to `context`.`action` (16.6 rule 3): any
 * other action in the same context, and any action in global (or, for a global action, in
 * any context). The action's own other slot never clashes.
 */
export function chordConflicts(
  map: ContextKeymap,
  context: InputContext,
  action: string,
  chord: KeyChord,
): BoundSlot[] {
  return chordUsers(map, chord).filter((u) => {
    if (u.context === context) return u.action !== action;
    return u.context === 'global' || context === 'global';
  });
}

/** Every conflicting pair in a keymap (the default table must have none, 23.2). */
export function keymapConflicts(map: ContextKeymap): [BoundSlot, BoundSlot][] {
  const out: [BoundSlot, BoundSlot][] = [];
  for (const context of INPUT_CONTEXTS) {
    for (const [action, binding] of Object.entries(map[context])) {
      for (const slot of BINDING_SLOTS) {
        const c = binding[slot];
        if (!c) continue;
        for (const other of chordConflicts(map, context, action, c)) {
          // report each pair once: from the slot that comes first in context order
          const a = INPUT_CONTEXTS.indexOf(context);
          const b = INPUT_CONTEXTS.indexOf(other.context);
          if (a < b || (a === b && action < other.action)) {
            out.push([{ context, action, slot }, other]);
          }
        }
      }
    }
  }
  return out;
}

/** One slot override: a chord rebinds it, null clears it. */
export type SlotOverride = KeyChord | null;

/** Overrides by slot key (SyncSettings.keys). */
export type ContextKeyOverrides = Readonly<Record<string, SlotOverride>>;

/**
 * The effective keymap: defaults with every override applied. Overrides of unknown
 * contexts, actions or slots, overrides of a locked slot, and Alt+F4 are ignored.
 */
export function resolveContextKeymap(
  overrides: ContextKeyOverrides,
  defaults: ContextKeymap = DEFAULT_CONTEXT_KEYMAP,
): ContextKeymap {
  const out = {} as Record<InputContext, Record<string, ActionBinding>>;
  for (const context of INPUT_CONTEXTS) {
    const actions: Record<string, ActionBinding> = {};
    for (const [action, binding] of Object.entries(defaults[context])) {
      const next: ActionBinding = {};
      for (const slot of BINDING_SLOTS) {
        const key = slotKey(context, action, slot);
        const o = Object.hasOwn(overrides, key) ? overrides[key] : undefined;
        const ignored =
          o === undefined || LOCKED_SLOTS.has(key) || (o !== null && isForbiddenChord(o));
        const chosen = ignored ? binding[slot] : o;
        if (chosen) next[slot] = { ...chosen };
      }
      actions[action] = next;
    }
    out[context] = actions;
  }
  return out;
}

export type RebindResult =
  | { ok: true; overrides: ContextKeyOverrides; reserved: boolean }
  | { ok: false; reason: 'unknown' | 'locked' | 'forbidden' }
  | { ok: false; reason: 'conflict'; conflicts: BoundSlot[] };

/**
 * Rebind or clear one slot (16.6): an unknown action or slot, any change to a locked slot,
 * and Alt+F4 are refused; a chord another action in this context or in global already uses
 * is refused with the clashing slots (the screen offers to swap them); a reserved chord
 * (Shift+Tab, Alt+Tab, F12, the Windows key) is allowed with `reserved` set so the screen can
 * warn. Rebinding a slot back to its default removes the override.
 */
export function rebind(
  overrides: ContextKeyOverrides,
  context: InputContext,
  action: string,
  slot: BindingSlot,
  chord: KeyChord | null,
  defaults: ContextKeymap = DEFAULT_CONTEXT_KEYMAP,
): RebindResult {
  const def = defaultBinding(context, action, defaults);
  if (!def || !CHORD_CODE.test(chord?.code ?? 'Ok')) return { ok: false, reason: 'unknown' };
  const key = slotKey(context, action, slot);
  if (LOCKED_SLOTS.has(key)) return { ok: false, reason: 'locked' };
  if (chord && isForbiddenChord(chord)) return { ok: false, reason: 'forbidden' };
  if (chord) {
    const conflicts = chordConflicts(
      resolveContextKeymap(overrides, defaults),
      context,
      action,
      chord,
    );
    if (conflicts.length > 0) return { ok: false, reason: 'conflict', conflicts };
  }
  const next: Record<string, SlotOverride> = { ...overrides };
  const original = def[slot];
  const isDefault = chord === null ? !original : !!original && chordEquals(chord, original);
  if (isDefault) delete next[key];
  else next[key] = chord ? { ...chord } : null;
  return { ok: true, overrides: next, reserved: !!chord && isReservedChord(chord) };
}

/** Restore defaults (16.6 rule 7): every context, or only `context`. */
export function resetKeymap(
  overrides: ContextKeyOverrides,
  context?: InputContext,
): ContextKeyOverrides {
  if (!context) return {};
  const out: Record<string, SlotOverride> = {};
  for (const [key, v] of Object.entries(overrides))
    if (!key.startsWith(`${context}.`)) out[key] = v;
  return out;
}

/** The chord bound to `context`.`action` (primary first), for {key:<action>} rendering. */
export function chordFor(
  map: ContextKeymap,
  context: InputContext,
  action: string,
): KeyChord | undefined {
  const b = map[context]?.[action];
  return b?.primary ?? b?.secondary;
}
