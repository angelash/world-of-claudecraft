// Gamepad bindings per input context and their rebinding core (ux_and_onboarding.md 16.3,
// 16.5, 16.6 rule 5; release_engineering.md 4.4). Buttons are named by position in the W3C
// standard mapping and labelled Xbox style (A is the bottom face button); glyphs.ts shows
// them per controller family. A pad binding is one of:
// - a button chord: a tap, a long press (`hold`), or a press while another button is held
//   (`with`); these are the rebindable slots;
// - a stick gesture: a push of the left or right stick in one direction, optionally while a
//   button is held (L3 plus the right stick zooms and turns the camera), or the analog stick
//   itself (movement, camera orbit, scrolling);
// - a ring: the action is a sector of a radial menu (radial.ts) the context opens;
// - nav: the action is reached through a navigation affordance of the same context or of
//   global (an option cursor, the focus of a window, the menu window);
// - a hotbar slot: the 24 slots are the cross hotbar (5.2), eight cluster buttons under
//   three layers (LT held, RT held, both held), see HOTBAR_CLUSTER.
// Every key-mouse action (contexts.ts) has a pad binding, and every pad-only action is
// listed in PAD_ONLY_ACTIONS (23.2 key check). Rebinding follows 16.6: confirm, back and
// Start are locked, confirm and back can be swapped as a whole, the hotbar layers move as a
// group (rebind hotbar_layer_a or hotbar_layer_b), conflicts are checked within one context
// and against global. Overrides live in SyncSettings.padKeys by `<context>.<action>.<slot>`.
// Pure, no DOM.

import {
  BINDING_SLOTS,
  type BindingSlot,
  DEFAULT_CONTEXT_KEYMAP,
  HOTBAR_SIZE,
  INPUT_CONTEXTS,
  type InputContext,
  slotKey,
} from './contexts';

/** Buttons in W3C standard-mapping order (index = Gamepad.buttons index). */
export const PAD_BUTTONS = [
  'a',
  'b',
  'x',
  'y',
  'lb',
  'rb',
  'lt',
  'rt',
  'view',
  'start',
  'l3',
  'r3',
  'up',
  'down',
  'left',
  'right',
] as const;
export type PadButton = (typeof PAD_BUTTONS)[number];

export function isPadButton(v: unknown): v is PadButton {
  return typeof v === 'string' && (PAD_BUTTONS as readonly string[]).includes(v);
}

export interface PadChord {
  button: PadButton;
  /** a long press (hold time from the input settings) */
  hold?: boolean;
  /** pressed while this button is held */
  with?: PadButton;
}

export type StickId = 'left' | 'right';
export type StickDir = 'up' | 'down' | 'left' | 'right';
export const STICK_DIRS: readonly StickDir[] = ['up', 'down', 'left', 'right'];

/** The radial menus of 16.5 plus the battlefield's group ring. */
export type RingId = 'windows' | 'items' | 'party' | 'action' | 'groups';

export type PadBinding =
  | { kind: 'button'; chord: PadChord }
  | { kind: 'stick'; stick: StickId; dir?: StickDir; with?: PadButton }
  | { kind: 'ring'; ring: RingId }
  | { kind: 'nav'; via: string }
  | { kind: 'hotbar'; slot: number };

export interface PadActionBinding {
  primary?: PadBinding;
  secondary?: PadBinding;
}

export type PadKeymap = Readonly<
  Record<InputContext, Readonly<Record<string, Readonly<PadActionBinding>>>>
>;

/**
 * The eight cluster buttons of one hotbar layer, in slot order: the d-pad left, up, right,
 * down, then the face buttons left, top, right, bottom (the cross hotbar convention).
 */
export const HOTBAR_CLUSTER: readonly PadButton[] = [
  'left',
  'up',
  'right',
  'down',
  'x',
  'y',
  'b',
  'a',
];
/** Slots per hotbar layer. */
export const HOTBAR_LAYER = 8;

const b = (button: PadButton, mods: Omit<PadChord, 'button'> = {}): PadBinding => ({
  kind: 'button',
  chord: { button, ...mods },
});
const stick = (s: StickId, dir?: StickDir, withButton?: PadButton): PadBinding => {
  const out: PadBinding = { kind: 'stick', stick: s };
  if (dir) out.dir = dir;
  if (withButton) out.with = withButton;
  return out;
};
const ring = (r: RingId): PadBinding => ({ kind: 'ring', ring: r });
const nav = (via: string): PadBinding => ({ kind: 'nav', via });
const one = (primary: PadBinding, secondary?: PadBinding): PadActionBinding =>
  secondary ? { primary, secondary } : { primary };
const range = (
  prefix: string,
  n: number,
  make: (i: number) => PadActionBinding,
): Record<string, PadActionBinding> =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i + 1}`, make(i)]));

const FIELD_WINDOW_RING = [
  'win_character',
  'win_inventory',
  'win_doors',
  'win_quests',
  'win_atlas',
  'win_deeds',
  'win_codex',
  'win_craft',
  'win_party',
  'win_beasts',
  'win_rumors',
  'win_goddess',
  'win_letters',
  'win_company',
  'win_territory',
  'win_council',
  'win_army',
  'win_strategy',
];

/**
 * Default gamepad bindings (16.3). The lord, battle, continent, travel and court rows are the
 * act 2 and later layouts, modeled for the key check and wired by the packages that build
 * those modes.
 */
export const DEFAULT_PAD_KEYMAP: PadKeymap = {
  global: {
    menu: one(b('start')),
    back: one(b('b')),
    help: one(nav('menu')),
    quick_save: one(nav('menu')),
    quick_load: one(nav('menu')),
    hide_ui: one(b('y', { with: 'view' })),
    fullscreen: one(b('l3', { with: 'view' })),
    debug: one(b('r3', { with: 'view' })),
  },
  field: {
    move_up: one(stick('left', 'up')),
    move_down: one(stick('left', 'down')),
    move_left: one(stick('left', 'left')),
    move_right: one(stick('left', 'right')),
    camera_orbit: one(stick('right')),
    select: one(b('r3')),
    interact: one(b('a')),
    focus: one(b('r3', { hold: true })),
    camera_turn_left: one(stick('right', 'left', 'l3')),
    camera_turn_right: one(stick('right', 'right', 'l3')),
    camera_toggle: one(b('l3')),
    camera_reset: one(b('y', { hold: true })),
    zoom_in: one(stick('right', 'up', 'l3')),
    zoom_out: one(stick('right', 'down', 'l3')),
    target_next: one(b('rb')),
    target_prev: one(b('lb')),
    appraise: one(b('x')),
    mount: one(b('rb', { with: 'lb' })),
    party_ring: one(b('lb', { hold: true })),
    pause: one(b('start', { with: 'view' })),
    slow_down: one(b('left', { with: 'view' })),
    speed_up: one(b('right', { with: 'view' })),
    wait: one(b('down', { with: 'view' })),
    select_self: one(nav('party_next')),
    ...range('select_party_', 5, () => one(nav('party_next'))),
    ...range('hotbar_', HOTBAR_SIZE, (i) => one({ kind: 'hotbar', slot: i + 1 })),
    hotbar_layer_a: one(b('lt')),
    hotbar_layer_b: one(b('rt')),
    win_map: one(b('view')),
    ...Object.fromEntries(FIELD_WINDOW_RING.map((a) => [a, one(ring('windows'))])),
    ring_windows: one(b('view', { hold: true })),
    ring_items: one(b('down', { hold: true })),
    item_1: one(b('down')),
    party_prev: one(b('left')),
    party_next: one(b('right')),
  },
  dialogue: {
    advance: one(b('a')),
    recall: one(stick('right', 'up')),
    auto_advance: one(b('x')),
    hide_text: one(b('r3')),
    reach_out: one(b('rb')),
    ...range('option_', 9, () => one(nav('option_next'))),
    option_prev: one(b('up'), stick('left', 'up')),
    option_next: one(b('down'), stick('left', 'down')),
    free_input: one(b('y')),
    // a long Y: the AI mark of the newest generated line (7.3); a tap stays free input
    ai_mark: one(b('y', { hold: true })),
  },
  creator: {
    row_prev: one(b('up'), stick('left', 'up')),
    row_next: one(b('down'), stick('left', 'down')),
    cycle_prev: one(b('left'), stick('left', 'left')),
    cycle_next: one(b('right'), stick('left', 'right')),
    page_prev: one(b('lb')),
    page_next: one(b('rb')),
    turn_left: one(b('lt'), stick('right', 'left')),
    turn_right: one(b('rt'), stick('right', 'right')),
    randomize: one(b('x')),
    reset_look: one(b('y')),
    done: one(b('a')),
  },
  window: {
    focus_next: one(nav('focus_down')),
    focus_up: one(b('up'), stick('left', 'up')),
    focus_down: one(b('down'), stick('left', 'down')),
    focus_left: one(b('left'), stick('left', 'left')),
    focus_right: one(b('right'), stick('left', 'right')),
    confirm: one(b('a')),
    next_tab: one(b('rb')),
    prev_tab: one(b('lb')),
    discard: one(b('y')),
    context_menu: one(b('x')),
    page_next: one(b('rt')),
    page_prev: one(b('lt')),
    scroll: one(stick('right')),
    detail: one(b('view')),
    cursor_toggle: one(b('r3')),
  },
  corridor: {
    move_up: one(b('up'), stick('left', 'up')),
    move_down: one(b('down'), stick('left', 'down')),
    move_left: one(b('left'), stick('left', 'left')),
    move_right: one(b('right'), stick('left', 'right')),
    prev_segment: one(b('lb')),
    next_segment: one(b('rb')),
    open_door: one(b('a', { hold: true })),
    pin_tracker: one(b('x')),
    leave: one(nav('back')),
    door_card: one(b('y')),
    filter_prev: one(b('lt')),
    filter_next: one(b('rt')),
  },
  lord: {
    pan_up: one(stick('right', 'up')),
    pan_down: one(stick('right', 'down')),
    pan_left: one(stick('right', 'left')),
    pan_right: one(stick('right', 'right')),
    cursor: one(stick('left')),
    rotate_building: one(b('x')),
    place: one(b('a')),
    layer_cycle: one(b('y')),
    pause: one(b('down')),
    speed_slow: one(b('left')),
    speed_mid: one(b('up')),
    speed_fast: one(b('right')),
    category_prev: one(b('lb')),
    category_next: one(b('rb')),
    place_repeat: one(b('rt')),
  },
  battle: {
    cursor: one(stick('left')),
    select: one(b('a')),
    order: one(nav('select')),
    attack_move: one(b('x')),
    hold: one(b('y', { hold: true })),
    retreat: one(b('x', { with: 'rb' })),
    formation_ring: one(b('y')),
    ...range('group_set_', 4, () => one(ring('groups'))),
    ...range('group_recall_', 4, (i) => one(b((['up', 'right', 'down', 'left'] as const)[i]))),
    pan_up: one(stick('right', 'up')),
    pan_down: one(stick('right', 'down')),
    pan_left: one(stick('right', 'left')),
    pan_right: one(stick('right', 'right')),
    pause: one(b('rt')),
    slow_motion: one(b('rt', { hold: true })),
    mode_toggle: one(b('view')),
    delegate: one(b('a', { with: 'rb' })),
    regiment_view: one(b('r3')),
    ring_groups: one(b('lt', { hold: true })),
    regiment_prev: one(b('lb')),
    regiment_next: one(b('rb')),
  },
  continent: {
    cursor: one(stick('left')),
    select: one(b('a')),
    move_order: one(nav('select')),
    pause: one(b('view')),
    speed_slow: one(b('lt')),
    speed_mid: one(b('rt', { with: 'lt' })),
    speed_fast: one(b('rt')),
    layer_cycle: one(b('y')),
    action_ring: one(b('x')),
    prev_army: one(b('lb')),
    next_army: one(b('rb')),
    panel_prev: one(b('left')),
    panel_next: one(b('right')),
  },
  travel: {
    cursor: one(stick('left')),
    pick_node: one(b('a')),
    ...range('method_', 4, (i) => one(b((['up', 'right', 'down', 'left'] as const)[i]))),
    depart: one(b('a', { hold: true })),
    stop_next: one(b('x')),
  },
  court: {
    present: one(b('a')),
    submit: one(b('y')),
    call_witness: one(b('x')),
    panel_prev: one(b('lb')),
    panel_next: one(b('rb')),
  },
};

/**
 * Actions only the pad has, per context: ring openers, cursors, option and focus
 * navigation, the hotbar layer buttons and the back button (key-mouse players have the
 * menu bar, the pointer, number keys and Esc for these).
 */
export const PAD_ONLY_ACTIONS: Readonly<Record<InputContext, readonly string[]>> = {
  global: ['back'],
  field: [
    'camera_orbit',
    'hotbar_layer_a',
    'hotbar_layer_b',
    'ring_windows',
    'ring_items',
    'item_1',
    'party_prev',
    'party_next',
  ],
  dialogue: ['option_prev', 'option_next', 'free_input'],
  creator: [],
  window: ['page_next', 'page_prev', 'scroll', 'detail', 'cursor_toggle'],
  corridor: ['door_card', 'filter_prev', 'filter_next'],
  lord: ['cursor', 'category_prev', 'category_next', 'place_repeat'],
  battle: ['cursor', 'ring_groups', 'regiment_prev', 'regiment_next'],
  continent: ['cursor', 'panel_prev', 'panel_next'],
  travel: ['cursor'],
  court: ['call_witness', 'panel_prev', 'panel_next'],
};

/** Slots that keep their default (16.6 rule 5): menu confirm, back and Start. */
export const LOCKED_PAD_SLOTS: ReadonlySet<string> = new Set([
  'window.confirm.primary',
  'global.back.primary',
  'global.menu.primary',
]);

/** The hotbar layer buttons (5.2): layer one, layer two, both together for layer three. */
export interface HotbarLayers {
  a: PadButton;
  b: PadButton;
}

/** The hotbar layer buttons of a keymap. */
export function hotbarLayers(map: PadKeymap): HotbarLayers {
  const a = buttonChord(map.field.hotbar_layer_a?.primary);
  const bb = buttonChord(map.field.hotbar_layer_b?.primary);
  return { a: a?.button ?? 'lt', b: bb?.button ?? 'rt' };
}

/** The layer (1, 2 or 3) and cluster button of hotbar slot 1 to 24. */
export function hotbarSlotPosition(slot: number): { layer: 1 | 2 | 3; button: PadButton } | null {
  if (!Number.isInteger(slot) || slot < 1 || slot > HOTBAR_SIZE) return null;
  const layer = (Math.floor((slot - 1) / HOTBAR_LAYER) + 1) as 1 | 2 | 3;
  return { layer, button: HOTBAR_CLUSTER[(slot - 1) % HOTBAR_LAYER] as PadButton };
}

/** The hotbar slot a cluster button picks under the held layers, or null. */
export function hotbarSlotFor(button: PadButton, layerA: boolean, layerB: boolean): number | null {
  const i = HOTBAR_CLUSTER.indexOf(button);
  if (i < 0 || (!layerA && !layerB)) return null;
  const layer = layerA && layerB ? 3 : layerA ? 1 : 2;
  return (layer - 1) * HOTBAR_LAYER + i + 1;
}

function buttonChord(binding: PadBinding | undefined): PadChord | undefined {
  return binding?.kind === 'button' ? binding.chord : undefined;
}

export function padChordEquals(x: PadChord, y: PadChord): boolean {
  return x.button === y.button && !!x.hold === !!y.hold && (x.with ?? null) === (y.with ?? null);
}

/** One pad slot override: a chord rebinds a button slot, null clears it. */
export type PadSlotOverride = PadChord | null;
export type PadKeyOverrides = Readonly<Record<string, PadSlotOverride>>;

/** The default pad binding of `context`.`action` (own entries only), or undefined. */
export function defaultPadBinding(
  context: InputContext,
  action: string,
  defaults: PadKeymap = DEFAULT_PAD_KEYMAP,
): Readonly<PadActionBinding> | undefined {
  const table = defaults[context];
  return table && Object.hasOwn(table, action) ? table[action] : undefined;
}

/** True when `<context>.<action>.<slot>` is a button slot an override may change. */
export function isRebindablePadSlot(
  context: InputContext,
  action: string,
  slot: BindingSlot,
  defaults: PadKeymap = DEFAULT_PAD_KEYMAP,
): boolean {
  const def = defaultPadBinding(context, action, defaults);
  if (!def || LOCKED_PAD_SLOTS.has(slotKey(context, action, slot))) return false;
  if (isLayerAction(context, action) && slot !== 'primary') return false;
  const current = def[slot];
  // an empty slot of an action whose other slot is a button may take a button too
  const other = def[slot === 'primary' ? 'secondary' : 'primary'];
  return current ? current.kind === 'button' : other?.kind === 'button';
}

/** The hotbar layer buttons are field actions of their own (5.2). */
export function isLayerAction(context: InputContext, action: string): boolean {
  return context === 'field' && (action === 'hotbar_layer_a' || action === 'hotbar_layer_b');
}

/**
 * Can `value` override this slot? A rebindable slot, a well-formed chord or null; a hotbar
 * layer moves to a plain button that is not one of the eight cluster buttons (those are the
 * slots themselves) and cannot be cleared.
 */
export function isValidPadOverride(
  context: InputContext,
  action: string,
  slot: BindingSlot,
  value: unknown,
  defaults: PadKeymap = DEFAULT_PAD_KEYMAP,
): value is PadSlotOverride {
  if (!isRebindablePadSlot(context, action, slot, defaults)) return false;
  if (value === null) return !isLayerAction(context, action);
  if (!isPadChord(value)) return false;
  if (!isLayerAction(context, action)) return true;
  return !value.hold && !value.with && !HOTBAR_CLUSTER.includes(value.button);
}

/** Swap A and B in a chord (16.6 rule 5: confirm and back swap as a whole). */
function swapAB(c: PadChord): PadChord {
  const sw = (x: PadButton): PadButton => (x === 'a' ? 'b' : x === 'b' ? 'a' : x);
  const out: PadChord = { button: sw(c.button) };
  if (c.hold) out.hold = true;
  if (c.with) out.with = sw(c.with);
  return out;
}

export interface ResolvePadOptions {
  /** swap confirm (A) and back (B) everywhere */
  swapConfirmBack?: boolean;
}

/**
 * The effective pad keymap: defaults with every valid override applied (unknown, locked,
 * non-button or malformed overrides are ignored), then A and B swapped when asked.
 */
export function resolvePadKeymap(
  overrides: PadKeyOverrides,
  opts: ResolvePadOptions = {},
  defaults: PadKeymap = DEFAULT_PAD_KEYMAP,
): PadKeymap {
  const out = {} as Record<InputContext, Record<string, PadActionBinding>>;
  for (const context of INPUT_CONTEXTS) {
    const actions: Record<string, PadActionBinding> = {};
    for (const [action, binding] of Object.entries(defaults[context])) {
      const next: PadActionBinding = {};
      for (const slot of BINDING_SLOTS) {
        const key = slotKey(context, action, slot);
        const o = Object.hasOwn(overrides, key) ? overrides[key] : undefined;
        let chosen: PadBinding | undefined = binding[slot];
        if (o !== undefined && isValidPadOverride(context, action, slot, o, defaults)) {
          chosen = o === null ? undefined : { kind: 'button', chord: { ...o } };
        }
        if (chosen) next[slot] = copyBinding(chosen, opts.swapConfirmBack === true);
      }
      actions[action] = next;
    }
    out[context] = actions;
  }
  return out;
}

function copyBinding(x: PadBinding, swap: boolean): PadBinding {
  switch (x.kind) {
    case 'button':
      return { kind: 'button', chord: swap ? swapAB(x.chord) : { ...x.chord } };
    case 'stick': {
      const w = x.with && swap ? swapAB({ button: x.with }).button : x.with;
      const out: PadBinding = { kind: 'stick', stick: x.stick };
      if (x.dir) out.dir = x.dir;
      if (w) out.with = w;
      return out;
    }
    default:
      return { ...x };
  }
}

/** A well-formed chord: known buttons, a modifier other than the button itself. */
export function isPadChord(v: unknown): v is PadChord {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const c = v as Record<string, unknown>;
  if (!isPadButton(c.button)) return false;
  if (c.hold !== undefined && typeof c.hold !== 'boolean') return false;
  if (c.with !== undefined && (!isPadButton(c.with) || c.with === c.button)) return false;
  return Object.keys(c).every((k) => k === 'button' || k === 'hold' || k === 'with');
}

/** The button chords a binding occupies (hotbar slots expand to their layer chords). */
export function bindingChords(x: PadBinding | undefined, layers: HotbarLayers): PadChord[] {
  if (!x) return [];
  if (x.kind === 'button') return [x.chord];
  if (x.kind === 'hotbar') {
    const pos = hotbarSlotPosition(x.slot);
    if (!pos || pos.layer === 3) return [];
    return [{ button: pos.button, with: pos.layer === 1 ? layers.a : layers.b }];
  }
  return [];
}

export interface PadBoundSlot {
  context: InputContext;
  action: string;
  slot: BindingSlot;
}

/** Every slot whose chords include `chord`. */
export function padChordUsers(map: PadKeymap, chord: PadChord): PadBoundSlot[] {
  const layers = hotbarLayers(map);
  const out: PadBoundSlot[] = [];
  for (const context of INPUT_CONTEXTS) {
    for (const [action, binding] of Object.entries(map[context])) {
      for (const slot of BINDING_SLOTS) {
        if (bindingChords(binding[slot], layers).some((c) => padChordEquals(c, chord))) {
          out.push({ context, action, slot });
        }
      }
    }
  }
  return out;
}

/** The slots `chord` clashes with for `context`.`action` (same context, or global). */
export function padChordConflicts(
  map: PadKeymap,
  context: InputContext,
  action: string,
  chord: PadChord,
): PadBoundSlot[] {
  return padChordUsers(map, chord).filter((u) => {
    if (u.context === context) return u.action !== action;
    return u.context === 'global' || context === 'global';
  });
}

/** Every conflicting pair of a pad keymap (the default must have none, 23.2). */
export function padKeymapConflicts(map: PadKeymap): [PadBoundSlot, PadBoundSlot][] {
  const layers = hotbarLayers(map);
  const out: [PadBoundSlot, PadBoundSlot][] = [];
  for (const context of INPUT_CONTEXTS) {
    for (const [action, binding] of Object.entries(map[context])) {
      for (const slot of BINDING_SLOTS) {
        for (const c of bindingChords(binding[slot], layers)) {
          for (const other of padChordConflicts(map, context, action, c)) {
            const x = INPUT_CONTEXTS.indexOf(context);
            const y = INPUT_CONTEXTS.indexOf(other.context);
            if (x < y || (x === y && action < other.action)) {
              out.push([{ context, action, slot }, other]);
            }
          }
        }
      }
    }
  }
  return out;
}

export type PadRebindResult =
  | { ok: true; overrides: PadKeyOverrides }
  | { ok: false; reason: 'unknown' | 'locked' | 'fixed' | 'layer' }
  | { ok: false; reason: 'conflict'; conflicts: PadBoundSlot[] };

/**
 * Rebind or clear one pad slot (16.6 rule 5). Locked slots are refused; stick, ring, nav and
 * hotbar entries are fixed (the hotbar moves through its layer buttons); a chord another
 * action of this context or of global uses is refused with the clashing slots. A chord equal
 * to the default removes the override.
 */
export function rebindPad(
  overrides: PadKeyOverrides,
  context: InputContext,
  action: string,
  slot: BindingSlot,
  chord: PadChord | null,
  defaults: PadKeymap = DEFAULT_PAD_KEYMAP,
): PadRebindResult {
  const def = defaultPadBinding(context, action, defaults);
  if (!def || (chord !== null && !isPadChord(chord))) return { ok: false, reason: 'unknown' };
  const key = slotKey(context, action, slot);
  if (LOCKED_PAD_SLOTS.has(key)) return { ok: false, reason: 'locked' };
  if (!isRebindablePadSlot(context, action, slot, defaults)) return { ok: false, reason: 'fixed' };
  if (!isValidPadOverride(context, action, slot, chord, defaults))
    return { ok: false, reason: 'layer' };
  if (chord) {
    const map = resolvePadKeymap(overrides, {}, defaults);
    const conflicts = padChordConflicts(map, context, action, chord);
    if (conflicts.length > 0) return { ok: false, reason: 'conflict', conflicts };
  }
  const next: Record<string, PadSlotOverride> = { ...overrides };
  const original = def[slot];
  const isDefault =
    chord === null
      ? !original
      : original?.kind === 'button' && padChordEquals(chord, original.chord);
  if (isDefault) delete next[key];
  else next[key] = chord ? { ...chord } : null;
  return { ok: true, overrides: next };
}

/** Every key-mouse action without a pad binding, and every unknown pad-only action (23.2). */
export function padCoverageGaps(map: PadKeymap = DEFAULT_PAD_KEYMAP): string[] {
  const gaps: string[] = [];
  for (const context of INPUT_CONTEXTS) {
    for (const action of Object.keys(DEFAULT_CONTEXT_KEYMAP[context])) {
      const p = map[context][action];
      if (!p?.primary && !p?.secondary) gaps.push(`${context}.${action}: no pad binding`);
    }
    for (const [action, binding] of Object.entries(map[context])) {
      const inKeys = Object.hasOwn(DEFAULT_CONTEXT_KEYMAP[context], action);
      if (!inKeys && !PAD_ONLY_ACTIONS[context].includes(action)) {
        gaps.push(`${context}.${action}: pad-only action not listed`);
      }
      for (const slot of BINDING_SLOTS) {
        const x = binding[slot];
        if (x?.kind !== 'nav') continue;
        const target = map[context][x.via] ?? map.global[x.via];
        const direct = [target?.primary, target?.secondary].some(
          (t) => t?.kind === 'button' || t?.kind === 'stick',
        );
        if (!direct) gaps.push(`${context}.${action}: nav via ${x.via} has no button`);
      }
    }
  }
  return gaps;
}

/** The first binding of `context`.`action`, primary first. */
export function padBindingFor(
  map: PadKeymap,
  context: InputContext,
  action: string,
): PadBinding | undefined {
  const x = map[context]?.[action];
  return x?.primary ?? x?.secondary;
}

/** Restore the pad defaults (16.6 rule 7): every context, or only `context`. */
export function resetPadKeymap(
  overrides: PadKeyOverrides,
  context?: InputContext,
): PadKeyOverrides {
  if (!context) return {};
  const out: Record<string, PadSlotOverride> = {};
  for (const [key, v] of Object.entries(overrides))
    if (!key.startsWith(`${context}.`)) out[key] = v;
  return out;
}
