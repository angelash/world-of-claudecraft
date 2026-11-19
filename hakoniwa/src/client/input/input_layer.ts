// The session's input layer (release_engineering.md 4.4; ux_and_onboarding.md 16): wires the
// keyboard and mouse controller and the gamepad poll into the action layer (input_hub.ts),
// and is the hub's DOM side: focus navigation in the front window (focus_nav.ts), scrolling,
// clicks under the virtual cursor, hiding the interface, full screen, the gamepad's option
// cursor highlight, and the overlay painters (radial menu, floating keyboard, virtual
// cursor). It installs the live `{key:}` resolver so every string names the current device's
// keys. Thin DOM layer: the rules live in the pure input modules.

import { isTypingTarget } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import { confirmOpen } from '../hud/confirm_pop';
import { exitChoiceOpen } from '../hud/exit_choice_pop';
import { FloatingKeyboard } from '../hud/floating_keyboard';
import { type HotbarLayout, hotbarLayout } from '../hud/hotbar_model';
import { RadialMenu } from '../hud/radial_menu';
import { VirtualCursorView } from '../hud/virtual_cursor';
import { answerTutorialCard, tutorialCardState } from '../tutorial/card_pop';
import { type CardButtons, cardButtons, cardPadAnswer } from './card_pad';
import type { ContextKeyOverrides, InputContext } from './contexts';
import { resolveContextKeymap } from './contexts';
import { type FocusMove, type FocusRect, moveFocus } from './focus_nav';
import type { PadSnapshot } from './gamepad';
import { readGamepad } from './gamepad_poller';
import { installKeyText, type KeyTextState, type LayoutMap } from './glyphs';
import { InputController } from './input_controller';
import {
  type GameSink,
  type HubChange,
  InputHub,
  RING_OPENER_POINTER,
  type UiSink,
} from './input_hub';
import type { InputSettings } from './input_settings';
import { type PadKeyOverrides, type RingId, resolvePadKeymap } from './pad_bindings';

/** The slice of the sync settings the input layer reads. */
export interface InputSettingsSource {
  contextKeys: ContextKeyOverrides;
  padKeys: PadKeyOverrides;
  input: InputSettings;
  accessibility: { holdToToggle: boolean };
}

/** The game sink plus what the painters read from it (src/client/app/player_input.ts). */
export interface InputGame extends GameSink {
  configure(settings: InputSettings): void;
  optionCursor(): { kind: 'scene' | 'conversation'; index: number; count: number } | null;
  click(sx: number, sy: number, double: boolean, shift?: boolean): void;
}

export interface InputLayerDeps {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  dpr: () => number;
  windowsRoot: HTMLElement;
  game: InputGame;
  settings: () => InputSettingsSource;
  /** world pointer handlers (the session's hover, zoom, orbit and right click) */
  pointer: {
    secondary(sx: number, sy: number): void;
    hover(sx: number | null, sy: number | null): void;
    zoom(delta: 1 | -1): void;
    orbit(dxCss: number, dyCss: number): void;
  };
  /** glyphs or the held hotbar layer changed: repaint the HUD */
  glyphsChanged(): void;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
const PAD_FOCUS = 'hk-pad-focus';

export class InputLayer implements UiSink {
  readonly hub: InputHub;
  private readonly kbm: InputController;
  private readonly radial = new RadialMenu();
  private readonly osk = new FloatingKeyboard();
  private readonly cursorView = new VirtualCursorView();
  private readonly overlay: HTMLElement;
  private layout: LayoutMap | null = null;
  private padConnected = false;
  private topWindow: Element | null = null;
  private optionSig = '';
  private settingsSig = '';
  private stackSeen: readonly InputContext[] = ['field', 'global'];
  /** the pad's guidance-card route (cardPad): buttons down last frame, the B hold start */
  private cardPrev: CardButtons | null = null;
  private cardBackSince: number | null = null;
  /** a ring took a mouse press: the click or context menu that follows it reaches nothing */
  private swallowClick = false;
  /**
   * A mouse press while a ring opened by key or from the HUD shows (5.2, 16.5): the left
   * button picks, the right button cancels, and nothing under the pointer (the world, a HUD
   * button) sees the press.
   */
  private readonly onPointerCapture = (ev: PointerEvent) => {
    this.swallowClick = false;
    if (ev.button !== 0 && ev.button !== 2) return;
    if (!this.hub.pointerButton(ev.button)) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.swallowClick = true;
  };
  private readonly onClickCapture = (ev: MouseEvent) => {
    if (!this.swallowClick) return;
    this.swallowClick = false;
    ev.preventDefault();
    ev.stopPropagation();
  };

  constructor(private readonly d: InputLayerDeps) {
    this.hub = new InputHub(
      d.game,
      this,
      () => t('ui.pop.osk.han_page'),
      () => t('ui.hud.wheel.more'),
    );
    this.overlay = document.createElement('div');
    this.overlay.className = 'hk-input-overlay';
    this.overlay.append(this.radial.el, this.osk.el, this.cursorView.el);
    d.root.append(this.overlay);
    this.configure();
    // a button still held from the title screen (the A that started the game) is not a press
    this.hub.consumeHeld(readGamepad(), performance.now());
    this.kbm = new InputController(
      d.canvas,
      {
        key: (chord, phase, repeat) => this.hub.key(chord, phase, repeat),
        mouseButton: (button, phase, mods) => this.hub.mouseButton(button, phase, mods),
        pointer: (x, y, travel) => this.hub.pointer(x, y, travel, performance.now()),
        release: () => this.hub.releaseAll(),
        click: (sx, sy, dbl, shift) => d.game.click(sx, sy, dbl, shift),
        secondary: (sx, sy) => d.pointer.secondary(sx, sy),
        hover: (sx, sy) => d.pointer.hover(sx, sy),
        zoom: (delta) => d.pointer.zoom(delta),
        orbit: (dx, dy) => d.pointer.orbit(dx, dy),
      },
      d.dpr,
    );
    installKeyText(() => this.keyTextState());
    window.addEventListener('pointerdown', this.onPointerCapture, true);
    window.addEventListener('click', this.onClickCapture, true);
    window.addEventListener('contextmenu', this.onClickCapture, true);
    const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?(): Promise<LayoutMap> } })
      .keyboard;
    kb?.getLayoutMap?.()
      .then((m) => {
        this.layout = m;
        d.glyphsChanged();
      })
      .catch(() => {});
  }

  /** Read the bindings and options again (call after the settings change). */
  configure(): void {
    const s = this.d.settings();
    const sig = JSON.stringify([s.contextKeys, s.padKeys, s.input, s.accessibility.holdToToggle]);
    if (sig === this.settingsSig) return;
    this.settingsSig = sig;
    this.hub.configure(
      resolveContextKeymap(s.contextKeys),
      resolvePadKeymap(s.padKeys, { swapConfirmBack: s.input.swapConfirmBack }),
      s.input,
      s.accessibility.holdToToggle,
    );
    this.d.game.configure(s.input);
  }

  /**
   * What `{key:}` references and the hotbar glyphs read. The context stack is the one seen
   * at the last poll: reading the live stack from inside t() would render the world's text
   * again (and could recurse through a line that holds a `{key:}` of its own).
   */
  keyTextState(): KeyTextState {
    const maps = this.hub.keymaps;
    return {
      device: this.hub.device,
      family: this.hub.family,
      kbm: maps.kbm,
      pad: maps.pad,
      stack: this.stackSeen,
      layout: this.layout,
    };
  }

  hotbarLayout(filled: ReadonlySet<number>): HotbarLayout {
    return hotbarLayout(this.keyTextState(), filled, this.hub.layers);
  }

  /** Every animation frame: poll the pad, keep the pad's focus and option cursor shown. */
  frame(nowMs: number): void {
    const snap = readGamepad();
    if (confirmOpen() || exitChoiceOpen()) {
      // the confirm popup (and the gate's destination chooser) read the pad themselves (6.4);
      // nothing they pressed reaches the game, even a button still held when one closes
      this.hub.consumeHeld(snap, nowMs);
      return;
    }
    // a modal guidance card pauses the world and takes the pad (17.2, 18.5): A or B answers
    // "知道了", Y "此后不提示这类", X expands; nothing it pressed reaches the game
    const card = tutorialCardState();
    if (card === 'modal') {
      this.cardPad(snap, nowMs, true);
      this.hub.consumeHeld(snap, nowMs);
      return;
    }
    if (card === 'side') this.cardPad(snap, nowMs, false);
    else this.cardPrev = null;
    if (snap || this.padConnected) {
      this.padConnected = !!snap;
      this.hub.padFrame(snap, nowMs);
    }
    this.stackSeen = this.hub.stack();
    this.followTopWindow();
    if (this.hub.device !== 'pad') {
      if (this.optionSig) this.clearPadFocus();
      return;
    }
    this.paintOptionCursor();
  }

  releaseAll(): void {
    this.hub.releaseAll();
  }

  /**
   * The guidance card on the pad. Modal: the card takes the pad (cardPadAnswer). Side card
   * (it leaves the pad to the game): a long press of back answers "知道了"; the press's tap
   * still reaches the game as usual.
   */
  private cardPad(snap: PadSnapshot | null, nowMs: number, modal: boolean): void {
    const now = cardButtons(snap, this.hub.confirmButton, this.hub.backButton);
    // the first frame only records what was already down (the press that led here)
    const prev = this.cardPrev ?? now;
    this.cardPrev = now;
    if (modal) {
      this.cardBackSince = null;
      const answer = cardPadAnswer(prev, now);
      if (answer) answerTutorialCard(answer);
      return;
    }
    if (!now.back) {
      this.cardBackSince = null;
      return;
    }
    // only a fresh press counts (a back still held from before never answers the card)
    if (!prev.back) this.cardBackSince = nowMs;
    const since = this.cardBackSince;
    if (since !== null && nowMs - since >= this.hub.settings.holdSeconds * 1000) {
      this.cardBackSince = null;
      answerTutorialCard('ok');
    }
  }

  /**
   * Open a ring from a HUD element (the party frame's right click opens that companion's
   * orders, ux_and_onboarding.md 5.2): the mouse points, a click picks, a right click or Esc
   * cancels. False when the ring has nothing to offer.
   */
  openRing(ring: RingId, target?: string): boolean {
    return this.hub.openRing(ring, RING_OPENER_POINTER, target);
  }

  /** Whether a held action's key or button is down now (`dialogue.skip_read`). */
  actionHeld(context: InputContext, action: string): boolean {
    return this.hub.actionHeld(context, action);
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.onPointerCapture, true);
    window.removeEventListener('click', this.onClickCapture, true);
    window.removeEventListener('contextmenu', this.onClickCapture, true);
    this.kbm.dispose();
    this.hub.closeOsk();
    this.hub.closeRing();
    this.overlay.remove();
    this.clearPadFocus();
    installKeyText(null);
  }

  // -------------------------------------------------------------------------
  // the pad's focus

  /** The front window (highest stacking order), or null. */
  private frontWindow(): HTMLElement | null {
    let best: HTMLElement | null = null;
    let z = Number.NEGATIVE_INFINITY;
    for (const w of this.d.windowsRoot.querySelectorAll<HTMLElement>('.hk-window')) {
      const wz = Number(w.style.zIndex || 0);
      if (wz >= z) {
        z = wz;
        best = w;
      }
    }
    return best;
  }

  private focusables(scope: Element): HTMLElement[] {
    return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (e) => e.getClientRects().length > 0,
    );
  }

  /**
   * A window opened or came to the front: the focus goes to its first control (not a text
   * field, so typing never starts by itself and the game keys keep working), for keyboard
   * players as for the pad (18.5: windows are reached with Tab and the arrows). A field the
   * player is typing in elsewhere keeps the focus.
   */
  private followTopWindow(): void {
    const top = this.frontWindow();
    if (top === this.topWindow) return;
    this.topWindow = top;
    if (!top) return;
    const active = document.activeElement;
    if (active && (top.contains(active) || isTypingTarget(active))) return;
    const first = this.focusables(top).find(
      (e) => !e.classList.contains('hk-window-close') && !isTypingTarget(e),
    );
    if (first) this.setFocus(first);
  }

  private setFocus(e: HTMLElement): void {
    for (const old of document.querySelectorAll(`.${PAD_FOCUS}`)) old.classList.remove(PAD_FOCUS);
    e.focus({ preventScroll: false });
    e.scrollIntoView?.({ block: 'nearest' });
    if (this.hub.device === 'pad') e.classList.add(PAD_FOCUS);
  }

  private clearPadFocus(): void {
    this.optionSig = '';
    for (const old of document.querySelectorAll(`.${PAD_FOCUS}`)) old.classList.remove(PAD_FOCUS);
  }

  private paintOptionCursor(): void {
    if (this.frontWindow()) return;
    const c = this.d.game.optionCursor();
    const sel = c?.kind === 'scene' ? '.hk-cut-choice' : '.hk-dlg2-option';
    const list = c ? [...this.d.root.querySelectorAll<HTMLElement>(sel)] : [];
    const target = c ? list[c.index] : undefined;
    const sig = target ? `${c?.kind}/${c?.index}/${list.length}` : '';
    if (sig === this.optionSig && (!target || target.classList.contains(PAD_FOCUS))) return;
    this.optionSig = sig;
    for (const old of this.d.root.querySelectorAll(`.${PAD_FOCUS}`))
      old.classList.remove(PAD_FOCUS);
    target?.classList.add(PAD_FOCUS);
  }

  // -------------------------------------------------------------------------
  // UiSink

  focusMove(move: FocusMove): boolean {
    const scope = this.frontWindow();
    if (!scope) return false;
    const list = this.focusables(scope);
    if (list.length === 0) return false;
    const rects: FocusRect[] = list.map((e, i) => {
      const r = e.getBoundingClientRect();
      return { id: String(i), x: r.left, y: r.top, w: r.width, h: r.height };
    });
    const active = document.activeElement as HTMLElement | null;
    const cur = active ? list.indexOf(active) : -1;
    const next = moveFocus(rects, cur >= 0 ? String(cur) : null, move);
    const e = next === null ? undefined : list[Number(next)];
    if (!e) return false;
    this.setFocus(e);
    return true;
  }

  focusActivate(): boolean {
    const scope = this.frontWindow();
    const a = document.activeElement as HTMLElement | null;
    if (!scope || !a || !scope.contains(a)) return false;
    a.click();
    return true;
  }

  focusAction(kind: 'context_menu' | 'discard' | 'detail'): boolean {
    const scope = this.frontWindow();
    const a = document.activeElement as HTMLElement | null;
    if (!scope || !a || !scope.contains(a) || kind !== 'context_menu') return false;
    const r = a.getBoundingClientRect();
    return !a.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
      }),
    );
  }

  tab(delta: 1 | -1): boolean {
    const scope = this.frontWindow();
    if (!scope) return false;
    const tabs = [...scope.querySelectorAll<HTMLElement>('[role="tab"]')];
    if (tabs.length === 0) return false;
    const i = tabs.findIndex((x) => x.getAttribute('aria-selected') === 'true');
    const next = tabs[(Math.max(0, i) + delta + tabs.length) % tabs.length];
    next?.click();
    if (next) this.setFocus(next);
    return !!next;
  }

  page(delta: 1 | -1): boolean {
    return this.tab(delta);
  }

  scroll(dx: number, dy: number): void {
    const scope = this.frontWindow();
    const body = scope?.querySelector<HTMLElement>('.hk-window-body') ?? scope;
    body?.scrollBy({ left: dx, top: dy });
  }

  cursorClick(x: number, y: number): void {
    const target = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!target) return;
    if (target === this.d.canvas) {
      const p = this.devicePoint(x, y);
      this.d.game.click(p.x, p.y, false);
      return;
    }
    const control = target.closest<HTMLElement>(FOCUSABLE) ?? target;
    control.focus?.();
    control.click();
  }

  cursorMoved(x: number, y: number): void {
    const target = document.elementFromPoint(x, y);
    if (target !== this.d.canvas) {
      this.d.pointer.hover(null, null);
      return;
    }
    const p = this.devicePoint(x, y);
    this.d.pointer.hover(p.x, p.y);
  }

  private devicePoint(x: number, y: number): { x: number; y: number } {
    const r = this.d.canvas.getBoundingClientRect();
    const k = this.d.dpr();
    return { x: (x - r.left) * k, y: (y - r.top) * k };
  }

  private paintOsk(): void {
    this.osk.render(this.hub.osk, this.d.game.textTarget()?.prompt ?? '', {
      family: this.hub.family,
      confirm: this.hub.confirmButton,
      back: this.hub.backButton,
    });
  }

  hideUi(): void {
    this.d.root.classList.toggle('hk-ui-hidden');
  }

  fullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  viewport(): { w: number; h: number } {
    return { w: window.innerWidth, h: window.innerHeight };
  }

  changed(what: HubChange): void {
    switch (what) {
      case 'radial':
        this.radial.render(this.hub.radial);
        return;
      case 'osk':
        this.paintOsk();
        return;
      case 'cursor':
        this.cursorView.render(this.hub.cursor);
        return;
      case 'device':
        if (this.hub.device !== 'pad') this.clearPadFocus();
        else this.topWindow = null;
        this.paintOsk();
        this.cursorView.render(this.hub.cursor);
        this.d.glyphsChanged();
        return;
      case 'layers':
        this.d.glyphsChanged();
        return;
    }
  }
}
