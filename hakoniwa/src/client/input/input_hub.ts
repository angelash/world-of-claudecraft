// The input hub: one place where key-mouse chords and gamepad snapshots become actions
// (release_engineering.md 4.4; ux_and_onboarding.md 16). It tracks the last device (glyphs
// follow it, 16.1), resolves chords and pad events through the active context stack
// (actions.ts) and the effective bindings (contexts.ts, pad_bindings.ts), and owns the
// overlays a gamepad needs: the floating keyboard (osk.ts), the radial menus (radial.ts) and
// the virtual cursor (virtual_cursor.ts). Game actions go to a GameSink (the client's
// PlayerInput); focus navigation, scrolling, cursor clicks and other DOM work go to a UiSink.
//
// Pad button semantics: a chord with a modifier fires when its button goes down while the
// modifier is held (the modifier's own tap is then suppressed); a button with a long-press
// binding or used as a modifier waits: released before the hold time it is a tap, held past
// it a long press; any other button fires on press, and navigation actions repeat while
// held. Whether a button waits, and what its long press does, is decided by the first
// context of the stack that binds it (plus global), so a binding further down never changes
// how a window's or a conversation's buttons feel. The hotbar layers (LT, RT, both) turn the
// eight cluster buttons into hotbar slots 1 to 24; with hold-to-toggle (18.5) a tap of a
// layer button latches it. Confirm and back in the overlays follow the A/B swap. Buttons
// already held when the hub starts or releases everything count only once they are let go.
// Pure: time and snapshots come in from the caller.

import {
  actionLive,
  actionsForChord,
  type BoundAction,
  contextStack,
  type InputSurface,
  isMoveAction,
  mouseChord,
} from './actions';
import {
  type ContextKeymap,
  DEFAULT_CONTEXT_KEYMAP,
  type InputContext,
  type KeyChord,
} from './contexts';
import { DeviceTracker, type GlyphFamily, glyphFamily, type InputDevice } from './device';
import type { FocusMove } from './focus_nav';
import { type PadEvent, type PadFrame, PadReader, type PadSnapshot, type Vec } from './gamepad';
import { defaultInputSettings, type InputSettings } from './input_settings';
import { type Intent, isZero, sameIntent } from './keymap';
import {
  type OskResult,
  type OskState,
  openOsk,
  oskBack,
  oskMove,
  oskPress,
  oskTurnPage,
  oskType,
} from './osk';
import {
  DEFAULT_PAD_KEYMAP,
  HOTBAR_CLUSTER,
  hotbarLayers,
  hotbarSlotFor,
  type PadBinding,
  type PadButton,
  type PadKeymap,
  type RingId,
  type StickDir,
  type StickId,
} from './pad_bindings';
import {
  openRing,
  pickRing,
  pointMouse,
  pointStick,
  type RadialState,
  type RingSector,
  turnPage,
} from './radial';
import { type CursorState, centeredCursor, moveCursor } from './virtual_cursor';

/** A free-text field the floating keyboard can type into. */
export interface TextTarget {
  prompt: string;
  maxLength: number;
}

/** The game side of input (src/client/app/player_input.ts). */
export interface GameSink {
  surface(): InputSurface;
  intent(i: Intent): void;
  /** Run an action; false when it does not apply right now (the stack falls through). */
  action(context: InputContext, action: string, device: InputDevice): boolean;
  /** Camera orbit in right-drag pixels. */
  orbit(dx: number, dy: number): void;
  textTarget(): TextTarget | null;
  submitText(text: string): void;
  /** The sectors of a ring; `target` names whom it acts for (a companion, party_ring.ts). */
  ringSectors(ring: RingId, target?: string): RingSector[];
  /**
   * A sector was picked. A follow-up ring to open answers (the party ring's "single order",
   * then the member), else nothing.
   */
  ringChoose(ring: RingId, id: string, target?: string): RingFollow | undefined | void;
  /** The title of a ring opened for a target (undefined: the ring's own title). */
  ringTitle?(ring: RingId, target?: string): string | undefined;
  /** A ring opened or closed (the world slows in a fight while one is open). */
  ringOpen(open: boolean): void;
  deviceChanged(device: InputDevice): void;
}

/** The ring a pick opens next (radial.ts RadialState.target). */
export interface RingFollow {
  ring: RingId;
  target: string;
}

/**
 * Openers of rings no held button closes: a click on the HUD (`pointer`, picked with the
 * mouse) and a follow-up ring (`pad:chain`, picked with the stick and A). Both stay open
 * until a pick or a cancel, like a ring under hold-to-toggle.
 */
export const RING_OPENER_POINTER = 'pointer';
export const RING_OPENER_CHAIN = 'pad:chain';

/**
 * Actions read as held state (actionHeld), never dispatched: skipping read lines lasts as
 * long as its key or button is down (the story layer polls it each frame). `skip_read` has no
 * default binding until the story controller reads the read table (src/client/app/read_log.ts);
 * the hub already treats it as held state wherever a binding names it.
 */
export const HELD_ACTIONS: ReadonlySet<string> = new Set(['dialogue.skip_read']);

/** What changed for the painters. */
export type HubChange = 'device' | 'osk' | 'radial' | 'cursor' | 'layers';

/** The DOM side of input (src/client/input/input_layer.ts). */
export interface UiSink {
  focusMove(move: FocusMove): boolean;
  /** press the focused control (A, Enter) */
  focusActivate(): boolean;
  /** X, Y and View on a focused control: its secondary, third and detail actions */
  focusAction(kind: 'context_menu' | 'discard' | 'detail'): boolean;
  tab(delta: 1 | -1): boolean;
  page(delta: 1 | -1): boolean;
  scroll(dx: number, dy: number): void;
  cursorClick(x: number, y: number): void;
  cursorMoved(x: number, y: number): void;
  hideUi(): void;
  fullscreen(): void;
  viewport(): { w: number; h: number };
  changed(what: HubChange): void;
}

/** Window-context actions the UiSink runs. */
const WINDOW_ACTIONS: Readonly<Record<string, (ui: UiSink) => boolean>> = {
  focus_next: (ui) => ui.focusMove('next'),
  focus_up: (ui) => ui.focusMove('up'),
  focus_down: (ui) => ui.focusMove('down'),
  focus_left: (ui) => ui.focusMove('left'),
  focus_right: (ui) => ui.focusMove('right'),
  confirm: (ui) => ui.focusActivate(),
  next_tab: (ui) => ui.tab(1),
  prev_tab: (ui) => ui.tab(-1),
  page_next: (ui) => ui.page(1),
  page_prev: (ui) => ui.page(-1),
  discard: (ui) => ui.focusAction('discard'),
  context_menu: (ui) => ui.focusAction('context_menu'),
  detail: (ui) => ui.focusAction('detail'),
};

/** Actions that repeat while their button or stick stays pushed. */
const REPEATABLE: ReadonlySet<string> = new Set([
  'focus_up',
  'focus_down',
  'focus_left',
  'focus_right',
  'focus_next',
  'option_prev',
  'option_next',
  // the spirit mirror's rows and options (3.4.3)
  'row_prev',
  'row_next',
  'cycle_prev',
  'cycle_next',
  'zoom_in',
  'zoom_out',
  'camera_turn_left',
  'camera_turn_right',
]);

/** Ring openers: holding the action's binding opens the ring, releasing picks. */
const RING_OF: Readonly<Record<string, RingId>> = {
  'field.ring_windows': 'windows',
  'field.ring_items': 'items',
  'field.party_ring': 'party',
  'battle.ring_groups': 'groups',
  'continent.action_ring': 'action',
};

/** Right-stick camera orbit speed: right-drag pixels per second at full deflection. */
export const ORBIT_PX_PER_S = 360;
/** Right-stick window scroll speed in CSS pixels per second. */
export const SCROLL_PX_PER_S = 900;

interface Press {
  /** waits for release or the hold time */
  deferred: boolean;
  /** a combo used it as a modifier (or it was held before): its own tap and hold are off */
  comboed: boolean;
  holdFired: boolean;
  /** the action a repeat re-fires */
  repeat?: BoundAction;
}

const ZERO: Intent = { dx: 0, dy: 0 };
const CONSUMED = (): Press => ({ deferred: true, comboed: true, holdFired: true });

export class InputHub {
  readonly devices = new DeviceTracker();
  readonly reader = new PadReader();
  private kbm: ContextKeymap = DEFAULT_CONTEXT_KEYMAP;
  private pad: PadKeymap = DEFAULT_PAD_KEYMAP;
  private opts: InputSettings = defaultInputSettings();
  private holdToToggle = false;
  private padId: string | null = null;
  /** KeyboardEvent.code to the movement action it holds */
  private keysHeld = new Map<string, string>();
  /** every key and mouse-button code down now (held actions read it) */
  private codesDown = new Set<string>();
  private padMove: Intent = ZERO;
  private sentMove: Intent = ZERO;
  private presses = new Map<PadButton, Press>();
  private lastNow: number | null = null;
  private layerState = { a: false, b: false };
  /** hotbar layers latched by a tap (hold-to-toggle, 18.5) */
  private latched = { a: false, b: false };
  osk: OskState | null = null;
  radial: RadialState | null = null;
  /** the virtual cursor, while it shows */
  cursor: CursorState | null = null;
  private cursorMode = false;

  constructor(
    private readonly game: GameSink,
    private readonly ui: UiSink,
    /** the Han page of the floating keyboard (ui.pop.osk.han_page) */
    private readonly hanPage: () => string,
    private readonly moreLabel: () => string,
  ) {}

  configure(kbm: ContextKeymap, pad: PadKeymap, opts: InputSettings, holdToToggle: boolean): void {
    this.kbm = kbm;
    this.pad = pad;
    this.opts = opts;
    this.holdToToggle = holdToToggle;
    if (!holdToToggle) this.latched = { a: false, b: false };
    this.reader.options = {
      ...this.reader.options,
      deadInner: opts.padDeadInner,
      deadOuter: opts.padDeadOuter,
      holdMs: Math.round(opts.holdSeconds * 1000),
    };
  }

  get device(): InputDevice {
    return this.devices.device;
  }

  get family(): GlyphFamily {
    return glyphFamily(this.opts.glyphs, this.padId);
  }

  get keymaps(): { kbm: ContextKeymap; pad: PadKeymap } {
    return { kbm: this.kbm, pad: this.pad };
  }

  get settings(): InputSettings {
    return this.opts;
  }

  /** Hotbar layers held or latched right now (the HUD shows the matching group). */
  get layers(): { a: boolean; b: boolean } {
    return this.layerState;
  }

  /** The button that confirms in menus and overlays (A, or B when swapped). */
  get confirmButton(): PadButton {
    return buttonOf(this.pad.window.confirm?.primary) ?? 'a';
  }

  /** The button that goes back (B, or A when swapped). */
  get backButton(): PadButton {
    return buttonOf(this.pad.global.back?.primary) ?? 'b';
  }

  /** The active contexts, first wins. */
  stack(): InputContext[] {
    return contextStack(this.game.surface(), this.device);
  }

  /**
   * Whether a held action's key or button is down now (`dialogue.skip_read`): the story layer
   * polls it each frame. Only while the action is live in the current stack.
   */
  actionHeld(context: InputContext, action: string): boolean {
    const stack = this.stack();
    if (!stack.includes(context) || !actionLive(stack, context, action)) return false;
    return heldNow(
      {
        kbm: this.kbm,
        pad: this.pad,
        codes: this.codesDown,
        padDown: (b) => this.reader.isDown(b),
      },
      context,
      action,
    );
  }

  // -------------------------------------------------------------------------
  // keyboard and mouse

  /** A key or mouse-button chord; true when it was an input binding (prevent the default). */
  key(chord: KeyChord, phase: 'down' | 'up', repeat = false): boolean {
    if (phase === 'up') return this.keyUp(chord);
    this.codesDown.add(chord.code);
    if (this.devices.key()) this.deviceChanged();
    if (this.osk) this.closeOsk();
    // an open ring: Esc cancels it; with hold-to-toggle its own key picks
    const open = this.radial;
    if (open && !repeat) {
      if (chord.code === 'Escape') {
        this.closeRing();
        return true;
      }
      if (open.opener === `key:${chord.code}`) {
        this.pick();
        return true;
      }
    }
    const stack = this.stack();
    // movement keys are held; Shift held while walking still walks
    const move = this.moveFor(stack, chord);
    if (move) {
      this.keysHeld.set(chord.code, move);
      this.updateMove();
      return true;
    }
    let hits = actionsForChord(this.kbm, stack, chord);
    // the numpad's Enter is Enter
    if (hits.length === 0 && chord.code === 'NumpadEnter')
      hits = actionsForChord(this.kbm, stack, { ...chord, code: 'Enter' });
    if (hits.length === 0) return false;
    // a held action is state, not an event (actionHeld): the key is taken, nothing runs
    if (hits.some((h) => HELD_ACTIONS.has(`${h.context}.${h.action}`))) return true;
    if (repeat) {
      const r = hits.find((h) => REPEATABLE.has(h.action));
      if (r) this.dispatch(r.context, r.action, 'kbm');
      return true;
    }
    for (const h of hits) {
      const ring = RING_OF[`${h.context}.${h.action}`];
      if (ring) {
        if (this.openRingFor(ring, `key:${chord.code}`)) return true;
        continue;
      }
      if (this.dispatch(h.context, h.action, 'kbm')) return true;
    }
    return true;
  }

  private keyUp(chord: KeyChord): boolean {
    this.codesDown.delete(chord.code);
    let used = false;
    if (this.keysHeld.delete(chord.code)) {
      this.updateMove();
      used = true;
    }
    const r = this.radial;
    if (r && r.opener === `key:${chord.code}` && !r.sticky) {
      this.pick();
      used = true;
    }
    return used;
  }

  /** A mouse button as a chord (middle and side buttons; left and right stay pointer clicks). */
  mouseButton(button: number, phase: 'down' | 'up', mods: Parameters<typeof mouseChord>[1] = {}) {
    return this.key(mouseChord(button, mods), phase);
  }

  /** Pointer position and travel (CSS px): device switching and mouse ring pointing. */
  pointer(x: number, y: number, travel: number, nowMs = this.lastNow ?? 0): void {
    if (this.devices.pointer(travel, nowMs)) this.deviceChanged();
    const r = this.radial;
    if (r && (r.opener.startsWith('key:') || r.opener === RING_OPENER_POINTER)) {
      const v = this.ui.viewport();
      this.setRadial(pointMouse(r, x - v.w / 2, y - v.h / 2, this.moreLabel()));
    }
  }

  /**
   * The movement action a chord holds: the chord's first binding in the stack when that is a
   * move (a window's arrows move its focus, not the player), or, for a chord bound to
   * nothing, the move of the same key without Shift (Shift held while walking still walks).
   */
  private moveFor(stack: readonly InputContext[], chord: KeyChord): string | null {
    const first = actionsForChord(this.kbm, stack, chord)[0];
    if (first) return isMoveAction(first.action) ? first.action : null;
    if (chord.ctrl || chord.alt) return null;
    const plain = actionsForChord(this.kbm, stack, { code: chord.code })[0];
    return plain && isMoveAction(plain.action) ? plain.action : null;
  }

  // -------------------------------------------------------------------------
  // gamepad

  /** One gamepad poll (null when no pad is connected). */
  padFrame(snap: PadSnapshot | null, nowMs: number): PadFrame {
    const dt = this.lastNow === null ? 0 : Math.max(0, Math.min(100, nowMs - this.lastNow));
    this.lastNow = nowMs;
    if (snap) this.padId = snap.id;
    const frame = this.reader.read(snap, nowMs);
    if (frame.active && this.devices.pad()) this.deviceChanged();
    for (const ev of frame.events) this.padEvent(ev);
    this.analog(frame, dt);
    this.updateLayers();
    return frame;
  }

  /**
   * Read a first snapshot without acting on it: buttons already held (the A that started
   * the game on the title screen) count only after they are let go.
   */
  consumeHeld(snap: PadSnapshot | null, nowMs: number): void {
    this.lastNow = nowMs;
    if (snap) this.padId = snap.id;
    for (const ev of this.reader.read(snap, nowMs).events) {
      if (ev.type === 'down') this.presses.set(ev.button, CONSUMED());
    }
  }

  private padEvent(ev: PadEvent): void {
    if (this.osk) {
      this.oskEvent(ev);
      return;
    }
    if (this.radial) {
      this.radialEvent(ev);
      return;
    }
    if (this.cursorActive() && this.cursorEvent(ev)) return;
    switch (ev.type) {
      case 'down':
        this.padDown(ev.button);
        break;
      case 'hold':
        this.padHold(ev.button);
        break;
      case 'up':
        this.padUp(ev.button);
        break;
      case 'repeat': {
        const p = this.presses.get(ev.button);
        if (p?.repeat) this.dispatch(p.repeat.context, p.repeat.action, 'pad');
        break;
      }
      case 'gesture':
        this.padGesture(ev.stick, ev.dir, ev.repeat);
        break;
    }
  }

  /** The bindings of `context` that are live in `stack`, each slot. */
  private *live(
    stack: readonly InputContext[],
    contexts: readonly InputContext[] = stack,
  ): Generator<{ context: InputContext; action: string; x: PadBinding }> {
    for (const context of contexts) {
      for (const [action, binding] of Object.entries(this.pad[context])) {
        if (!actionLive(stack, context, action)) continue;
        for (const x of [binding.primary, binding.secondary]) if (x) yield { context, action, x };
      }
    }
  }

  /** Does `context` bind `button` in any way (tap, hold, modifier, stick modifier)? */
  private binds(stack: readonly InputContext[], context: InputContext, button: PadButton): boolean {
    if (context === 'field' && this.hotbarActive(stack)) {
      const layers = hotbarLayers(this.pad);
      if (button === layers.a || button === layers.b || HOTBAR_CLUSTER.includes(button))
        return true;
    }
    for (const { x } of this.live(stack, [context])) {
      if (x.kind === 'button' && (x.chord.button === button || x.chord.with === button))
        return true;
      if (x.kind === 'stick' && x.with === button) return true;
    }
    return false;
  }

  /** The contexts that decide how `button` behaves: the first that binds it, plus global. */
  private owners(stack: readonly InputContext[], button: PadButton): InputContext[] {
    const first = stack.find((c) => c !== 'global' && this.binds(stack, c, button));
    return first ? [first, 'global'] : ['global'];
  }

  private layerHeld(which: 'a' | 'b', except?: PadButton): boolean {
    const layers = hotbarLayers(this.pad);
    const b = layers[which];
    return (this.reader.isDown(b) && b !== except) || this.latched[which];
  }

  private padDown(button: PadButton): void {
    const stack = this.stack();
    // the cross hotbar: a cluster button under a held (or latched) layer
    if (this.hotbarActive(stack) && HOTBAR_CLUSTER.includes(button)) {
      const a = this.layerHeld('a', button);
      const b = this.layerHeld('b', button);
      const slot = hotbarSlotFor(button, a, b);
      if (slot !== null) {
        const layers = hotbarLayers(this.pad);
        this.markComboed(layers.a);
        this.markComboed(layers.b);
        this.presses.set(button, { deferred: false, comboed: false, holdFired: false });
        this.dispatch('field', `hotbar_${slot}`, 'pad');
        return;
      }
    }
    // a chord pressed while its modifier is held
    for (const { context, action, x } of this.live(stack)) {
      if (x.kind !== 'button') continue;
      const c = x.chord;
      if (c.button !== button || c.hold || !c.with || !this.reader.isDown(c.with)) continue;
      this.markComboed(c.with);
      this.presses.set(button, { deferred: false, comboed: false, holdFired: false });
      if (this.dispatch(context, action, 'pad')) return;
    }
    if (this.deferredIn(stack, button)) {
      this.presses.set(button, { deferred: true, comboed: false, holdFired: false });
      return;
    }
    const fired = this.fireTap(stack, button);
    this.presses.set(button, {
      deferred: false,
      comboed: false,
      holdFired: false,
      repeat: fired && REPEATABLE.has(fired.action) ? fired : undefined,
    });
  }

  private padHold(button: PadButton): void {
    const p = this.presses.get(button);
    if (!p?.deferred || p.comboed) return;
    if (this.fireHold(this.stack(), button, true)) p.holdFired = true;
  }

  /** Fire the long press of `button` in its owning contexts (rings only when `rings`). */
  private fireHold(stack: readonly InputContext[], button: PadButton, rings: boolean): boolean {
    for (const { context, action, x } of this.live(stack, this.owners(stack, button))) {
      if (x.kind !== 'button' || x.chord.button !== button || !x.chord.hold || x.chord.with)
        continue;
      const ring = RING_OF[`${context}.${action}`];
      if (ring) {
        if (rings && this.openRingFor(ring, `pad:${button}`)) return true;
        continue;
      }
      if (this.dispatch(context, action, 'pad')) return true;
    }
    return false;
  }

  /** Whether the owning contexts give `button` a tap of its own (not only a long press). */
  private hasTap(stack: readonly InputContext[], button: PadButton): boolean {
    for (const { x } of this.live(stack, this.owners(stack, button)))
      if (isTap(x, button)) return true;
    return false;
  }

  private padUp(button: PadButton): void {
    const p = this.presses.get(button);
    this.presses.delete(button);
    if (!p?.deferred || p.comboed || p.holdFired) return;
    const stack = this.stack();
    // hold-to-toggle: a tap of a hotbar layer button latches that layer (18.5)
    if (this.holdToToggle && this.hotbarActive(stack)) {
      const layers = hotbarLayers(this.pad);
      const which = button === layers.a ? 'a' : button === layers.b ? 'b' : null;
      if (which) {
        this.latched = { ...this.latched, [which]: !this.latched[which] };
        return;
      }
    }
    // hold-to-toggle (18.5): a button whose owners give it only a long press (the corridor's
    // door opening) does it on a tap; a ring keeps opening on the long press, held open
    if (this.holdToToggle && !this.hasTap(stack, button) && this.fireHold(stack, button, false))
      return;
    this.fireTap(stack, button);
  }

  private padGesture(stick: StickId, dir: StickDir, repeat: boolean): void {
    const stack = this.stack();
    const modifiers = this.stickModifiers(stack, stick);
    for (const { context, action, x } of this.live(stack)) {
      if (isMoveAction(action) && context === 'field') continue;
      if (repeat && !REPEATABLE.has(action)) continue;
      if (x.kind !== 'stick' || x.stick !== stick || x.dir !== dir) continue;
      if (x.with) {
        if (!this.reader.isDown(x.with)) continue;
      } else if (modifiers.some((m) => this.reader.isDown(m))) continue;
      if (x.with) this.markComboed(x.with);
      if (this.dispatch(context, action, 'pad')) return;
    }
  }

  /** Buttons that modify `stick` gestures in the stack (L3 for the camera). */
  private stickModifiers(stack: readonly InputContext[], stick: StickId): PadButton[] {
    const out: PadButton[] = [];
    for (const { x } of this.live(stack)) {
      if (x.kind === 'stick' && x.stick === stick && x.with) out.push(x.with);
    }
    return out;
  }

  private markComboed(button: PadButton): void {
    const p = this.presses.get(button);
    if (p) p.comboed = true;
  }

  /** Does `button` wait for release or the hold time? Decided by its owning contexts. */
  private deferredIn(stack: readonly InputContext[], button: PadButton): boolean {
    const owners = this.owners(stack, button);
    if (owners.includes('field') && this.hotbarActive(stack)) {
      const layers = hotbarLayers(this.pad);
      if (button === layers.a || button === layers.b) return true;
    }
    for (const { x } of this.live(stack, owners)) {
      if (x.kind === 'button') {
        if (x.chord.with === button) return true;
        if (x.chord.button === button && x.chord.hold) return true;
      } else if (x.kind === 'stick' && x.with === button) return true;
    }
    return false;
  }

  /** Fire the tap binding of `button`, falling through the stack; the action that ran. */
  private fireTap(stack: readonly InputContext[], button: PadButton): BoundAction | null {
    for (const { context, action, x } of this.live(stack)) {
      if (!isTap(x, button)) continue;
      if (this.dispatch(context, action, 'pad')) return { context, action };
    }
    return null;
  }

  private hotbarActive(stack: readonly InputContext[]): boolean {
    return stack[0] === 'field' || (stack[0] === 'dialogue' && stack.includes('field'));
  }

  private updateLayers(): void {
    const on = this.hotbarActive(this.stack());
    const a = on && this.layerHeld('a');
    const b = on && this.layerHeld('b');
    if (a !== this.layerState.a || b !== this.layerState.b) {
      this.layerState = { a, b };
      this.ui.changed('layers');
    }
  }

  // -------------------------------------------------------------------------
  // analog: movement, camera, scrolling, the cursor and ring pointing

  private analog(frame: PadFrame, dtMs: number): void {
    if (this.radial) {
      const s =
        Math.hypot(frame.left.x, frame.left.y) >= Math.hypot(frame.right.x, frame.right.y)
          ? frame.left
          : frame.right;
      if (this.radial.opener.startsWith('pad:'))
        this.setRadial(pointStick(this.radial, s.x, s.y, this.moreLabel()));
      this.setPadMove(ZERO);
      return;
    }
    if (this.osk) {
      // the field it types into went away (the scene moved on, the talk ended)
      if (!this.game.textTarget()) this.closeOsk();
      this.setPadMove(ZERO);
      return;
    }
    const surface = this.game.surface();
    const stack = this.stack();
    if (this.cursorActive()) {
      const stick: Vec = surface.placing ? frame.left : frame.right;
      this.moveCursorBy(stick, dtMs);
      this.setPadMove(ZERO);
      return;
    }
    if (this.cursor) {
      // placement ended (or the keyboard took over): the cursor goes
      this.cursor = null;
      this.ui.changed('cursor');
    }
    const fieldOn = this.hotbarActive(stack);
    // an open conversation takes the stick for its options (1.3: dialogue is a mode)
    this.setPadMove(fieldOn && !surface.conversation ? frame.move : ZERO);
    const r = frame.right;
    if (r.x === 0 && r.y === 0) return;
    if (stack[0] === 'window') {
      const k = (SCROLL_PX_PER_S * dtMs) / 1000;
      this.ui.scroll(r.x * k, r.y * k);
      return;
    }
    if (!fieldOn || this.stickModifiers(stack, 'right').some((m) => this.reader.isDown(m))) return;
    const k = (ORBIT_PX_PER_S * this.opts.cameraSensitivity * dtMs) / 1000;
    this.game.orbit(r.x * k, (this.opts.invertPitch ? -r.y : r.y) * k);
  }

  private setPadMove(i: Intent): void {
    this.padMove = i;
    this.updateMove();
  }

  private updateMove(): void {
    let dx = 0;
    let dy = 0;
    for (const a of new Set(this.keysHeld.values())) {
      if (a === 'move_right') dx++;
      if (a === 'move_left') dx--;
      if (a === 'move_down') dy++;
      if (a === 'move_up') dy--;
    }
    const kbm = { dx: Math.sign(dx), dy: Math.sign(dy) };
    const i = isZero(this.padMove) ? kbm : this.padMove;
    if (sameIntent(i, this.sentMove)) return;
    this.sentMove = { ...i };
    this.game.intent(i);
  }

  // -------------------------------------------------------------------------
  // dispatch

  /** Run one action: window and display actions on the UI side, the rest in the game. */
  dispatch(context: InputContext, action: string, device: InputDevice): boolean {
    // held actions are polled (actionHeld); their press owns the button and runs nothing
    if (HELD_ACTIONS.has(`${context}.${action}`)) return true;
    if (context === 'window') {
      if (action === 'cursor_toggle') return this.toggleCursor();
      const run = WINDOW_ACTIONS[action];
      if (run) {
        // a pad's window actions own their buttons even when there is nothing to do
        const done = run(this.ui);
        return done || device === 'pad';
      }
    }
    if (context === 'global' && action === 'hide_ui') {
      this.ui.hideUi();
      return true;
    }
    if (context === 'global' && action === 'fullscreen') {
      this.ui.fullscreen();
      return true;
    }
    if (device === 'pad' && context === 'dialogue') {
      const scene = this.game.surface().scene;
      if (action === 'free_input' || (action === 'advance' && scene === 'input')) {
        const target = this.game.textTarget();
        if (!target) return false;
        this.osk = openOsk(target.maxLength);
        this.ui.changed('osk');
        return true;
      }
    }
    if (context === 'global' && action === 'back' && this.cursorMode) {
      this.cursorMode = false;
      this.cursor = null;
      this.ui.changed('cursor');
      return true;
    }
    return this.game.action(context, action, device);
  }

  // -------------------------------------------------------------------------
  // the floating keyboard

  private oskEvent(ev: PadEvent): void {
    const s = this.osk;
    if (!s) return;
    const han = this.hanPage();
    const nav = (dir: StickDir) => this.setOsk({ type: 'edit', state: oskMove(s, dir, han) });
    if (ev.type === 'gesture') {
      nav(ev.dir);
      return;
    }
    if (ev.type !== 'down' && ev.type !== 'repeat') return;
    const b = ev.button;
    if (b === 'up' || b === 'down' || b === 'left' || b === 'right') {
      nav(b);
      return;
    }
    if (ev.type === 'repeat') {
      if (b === this.backButton) this.setOsk(oskBack(s));
      return;
    }
    if (b === this.confirmButton) this.setOsk(oskPress(s, han));
    else if (b === this.backButton) this.setOsk(oskBack(s));
    else if (b === 'x') this.setOsk({ type: 'edit', state: oskType(s, ' ') });
    else if (b === 'y' || b === 'rb') this.setOsk({ type: 'edit', state: oskTurnPage(s, 1) });
    else if (b === 'lb') this.setOsk({ type: 'edit', state: oskTurnPage(s, -1) });
    else if (b === 'start') this.setOsk({ type: 'submit', text: s.text.trim() });
  }

  private setOsk(r: OskResult): void {
    if (r.type === 'edit') {
      this.osk = r.state;
    } else {
      this.osk = null;
      if (r.type === 'submit') this.game.submitText(r.text);
    }
    this.ui.changed('osk');
  }

  closeOsk(): void {
    if (!this.osk) return;
    this.osk = null;
    this.ui.changed('osk');
  }

  // -------------------------------------------------------------------------
  // radial menus

  /**
   * Open a ring from outside the bindings: a HUD element (the party frame's right click opens
   * that companion's orders, ux_and_onboarding.md 5.2), with `pointer` as the opener: it
   * stays open, the mouse points, a left click picks and a right click or Esc cancels
   * (pointerButton). False when the ring has nothing to offer. Replaces an open ring.
   */
  openRing(ring: RingId, opener: string = RING_OPENER_POINTER, target?: string): boolean {
    this.closeRing();
    const sticky = opener === RING_OPENER_POINTER || opener === RING_OPENER_CHAIN;
    return this.openRingFor(ring, opener, target, sticky || this.holdToToggle);
  }

  private openRingFor(
    ring: RingId,
    opener: string,
    target?: string,
    sticky = this.holdToToggle,
  ): boolean {
    const sectors = this.game.ringSectors(ring, target);
    if (sectors.length === 0) return false;
    const title = this.game.ringTitle?.(ring, target);
    this.radial = openRing(ring, sectors, opener, sticky, target, title);
    this.game.ringOpen(true);
    this.setPadMove(ZERO);
    this.ui.changed('radial');
    return true;
  }

  /**
   * A mouse button while a ring opened by key or by the HUD is open: the left button picks
   * the pointed sector (nothing pointed cancels), the right button cancels. True when a ring
   * took the click (the click then reaches nothing else).
   */
  pointerButton(button: number): boolean {
    const r = this.radial;
    if (!r || r.opener.startsWith('pad:')) return false;
    if (button === 0) this.pick();
    else if (button === 2) this.closeRing();
    else return false;
    return true;
  }

  private radialEvent(ev: PadEvent): void {
    const r = this.radial;
    if (!r) return;
    if (ev.type === 'up') {
      this.presses.delete(ev.button);
      if (r.opener === `pad:${ev.button}` && !r.sticky) this.pick();
      return;
    }
    if (ev.type !== 'down') return;
    // presses made while the ring is open never act after it closes
    this.presses.set(ev.button, CONSUMED());
    if (ev.button === this.confirmButton) this.pick();
    else if (ev.button === this.backButton) this.closeRing();
    else if (ev.button === 'rb') this.setRadial(turnPage(r, 1));
    else if (ev.button === 'lb' && r.opener !== 'pad:lb') this.setRadial(turnPage(r, -1));
  }

  private pick(): void {
    const r = this.radial;
    if (!r) return;
    const res = pickRing(r, this.moreLabel());
    if (res.type === 'page') {
      this.setRadial(res.state);
      return;
    }
    if (res.type === 'none' && r.sticky) return;
    this.closeRing();
    if (res.type !== 'pick') return;
    const next = this.game.ringChoose(r.ring, res.id, r.target);
    // a follow-up ring (the party ring's "single order", then the member) opens at once,
    // picked with the stick and A on the pad, with the mouse otherwise
    if (next) {
      const opener = this.device === 'pad' ? RING_OPENER_CHAIN : RING_OPENER_POINTER;
      this.openRingFor(next.ring, opener, next.target, true);
    }
  }

  closeRing(): void {
    if (!this.radial) return;
    this.radial = null;
    this.game.ringOpen(false);
    this.ui.changed('radial');
  }

  private setRadial(next: RadialState): void {
    if (next === this.radial) return;
    this.radial = next;
    this.ui.changed('radial');
  }

  // -------------------------------------------------------------------------
  // the virtual cursor

  private cursorActive(): boolean {
    if (this.device !== 'pad') return false;
    return this.cursorMode || this.game.surface().placing;
  }

  private toggleCursor(): boolean {
    this.cursorMode = !this.cursorMode;
    const v = this.ui.viewport();
    this.cursor = this.cursorMode ? (this.cursor ?? centeredCursor(v.w, v.h)) : null;
    this.ui.changed('cursor');
    return true;
  }

  private moveCursorBy(stick: Vec, dtMs: number): void {
    const v = this.ui.viewport();
    const from = this.cursor ?? centeredCursor(v.w, v.h);
    const next = moveCursor(from, stick, dtMs, v, this.opts.cameraSensitivity);
    if (next === this.cursor) return;
    this.cursor = next;
    this.ui.cursorMoved(next.x, next.y);
    this.ui.changed('cursor');
  }

  /** A press while the cursor shows: confirm clicks under it, R3 or back leave cursor mode. */
  private cursorEvent(ev: PadEvent): boolean {
    if (ev.type !== 'down') return false;
    const v = this.ui.viewport();
    const c = this.cursor ?? centeredCursor(v.w, v.h);
    if (ev.button === this.confirmButton) {
      this.cursor = c;
      this.presses.set(ev.button, CONSUMED());
      this.ui.cursorClick(c.x, c.y);
      return true;
    }
    if (this.cursorMode && (ev.button === 'r3' || ev.button === this.backButton)) {
      this.cursorMode = false;
      this.cursor = null;
      this.presses.set(ev.button, CONSUMED());
      this.ui.changed('cursor');
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------

  private deviceChanged(): void {
    if (this.device === 'kbm' && this.cursor && !this.cursorMode) this.cursor = null;
    this.game.deviceChanged(this.device);
    this.ui.changed('device');
  }

  /**
   * Release every held key and button (window blur, pause, a modal): movement stops, and a
   * pad button still held counts again only after it is let go (holding View and Start to
   * pause must not pause and resume on every poll).
   */
  releaseAll(): void {
    this.keysHeld.clear();
    this.codesDown.clear();
    this.presses.clear();
    for (const b of this.reader.held()) this.presses.set(b, CONSUMED());
    this.padMove = ZERO;
    this.updateMove();
    this.closeRing();
  }
}

// -------------------------------------------------------------------------
// held actions

export interface HeldSource {
  kbm: ContextKeymap;
  pad: PadKeymap;
  /** key and mouse-button codes down now */
  codes: ReadonlySet<string>;
  /** whether a pad button is down now */
  padDown(button: PadButton): boolean;
}

/**
 * Whether an action's key or pad button is down now, through the effective bindings (so it
 * follows rebinding): a key chord counts when its key is down (modifiers are not checked: a
 * held Ctrl is the chord of the Ctrl key itself); a pad chord when its button is down, and
 * its modifier with it.
 */
export function heldNow(src: HeldSource, context: InputContext, action: string): boolean {
  const k = src.kbm[context]?.[action];
  for (const c of [k?.primary, k?.secondary]) if (c && src.codes.has(c.code)) return true;
  const p = src.pad[context]?.[action];
  for (const x of [p?.primary, p?.secondary]) {
    if (x?.kind !== 'button') continue;
    if (src.padDown(x.chord.button) && (!x.chord.with || src.padDown(x.chord.with))) return true;
  }
  return false;
}

function isTap(x: PadBinding | undefined, button: PadButton): boolean {
  return x?.kind === 'button' && x.chord.button === button && !x.chord.hold && !x.chord.with;
}

function buttonOf(x: PadBinding | undefined): PadButton | undefined {
  return x?.kind === 'button' && !x.chord.hold && !x.chord.with ? x.chord.button : undefined;
}
