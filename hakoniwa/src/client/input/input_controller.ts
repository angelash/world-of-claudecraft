// DOM keyboard and mouse input: key chords (KeyboardEvent.code plus Shift, Ctrl, Alt) and
// the middle and side mouse buttons go to the action layer (input_hub.ts), which decides what
// they mean in the active contexts; pointer clicks and hover on the world canvas, wheel zoom
// and the right-button drag that orbits the HD-2D camera (a right click without a drag stays
// the secondary click) go straight to the session. While a text field has the focus only Esc
// reaches the game (16.1). Pointer travel anywhere switches the glyphs back to keyboard and
// mouse (16.1). Thin DOM layer.

import { isTypingTarget } from '../../shared_ui/dom';
import { chordOf } from './actions';
import type { KeyChord } from './contexts';

export interface InputHandlers {
  /** a key chord went down or up; true when it was a binding (the default is prevented) */
  key(chord: KeyChord, phase: 'down' | 'up', repeat: boolean): boolean;
  /** a mouse button other than left and right (middle, side buttons) */
  mouseButton(
    button: number,
    phase: 'down' | 'up',
    mods: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean },
  ): boolean;
  /** pointer position (CSS px) and the distance it travelled since the last event */
  pointer(x: number, y: number, travel: number): void;
  /** focus left the page: release every held key */
  release(): void;
  /** primary click on the world at device-pixel coordinates */
  click(sx: number, sy: number, double: boolean): void;
  /** secondary (right) click on the world */
  secondary(sx: number, sy: number): void;
  /** pointer moved over the world (device pixels), or left it (null) */
  hover(sx: number | null, sy: number | null): void;
  zoom(delta: 1 | -1): void;
  /** right-button drag in CSS pixels: turn (dx) and tilt (dy) the camera */
  orbit(dxCss: number, dyCss: number): void;
}

/** Keys that press a focused button by default. */
const ACTIVATION_KEYS: ReadonlySet<string> = new Set(['Space', 'Enter', 'NumpadEnter']);

/** CSS pixels a right-button press must travel before it counts as a camera drag. */
export const ORBIT_THRESHOLD = 4;

export class InputController {
  private readonly off: (() => void)[] = [];
  private lastClick = 0;
  private drag: { x: number; y: number; moved: boolean } | null = null;
  /** time of the last right-button release, so its contextmenu event is not a second click */
  private lastRightUp = Number.NEGATIVE_INFINITY;
  private lastPointer: { x: number; y: number } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly h: InputHandlers,
    private readonly dpr: () => number,
  ) {
    const on = <K extends keyof WindowEventMap>(
      target: Window | HTMLElement,
      type: K,
      fn: (ev: WindowEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    on(window, 'keydown', (ev) => this.keyDown(ev));
    on(window, 'keyup', (ev) => this.keyUp(ev));
    on(window, 'blur', () => this.h.release());
    on(window, 'pointermove', (ev) => {
      const p = this.lastPointer;
      this.lastPointer = { x: ev.clientX, y: ev.clientY };
      const travel = p ? Math.hypot(ev.clientX - p.x, ev.clientY - p.y) : 0;
      this.h.pointer(ev.clientX, ev.clientY, travel);
    });
    on(window, 'pointerdown', (ev) => {
      if (ev.button === 1 || ev.button === 3 || ev.button === 4) {
        if (this.h.mouseButton(ev.button, 'down', ev)) ev.preventDefault();
      }
    });
    on(window, 'pointerup', (ev) => {
      if (ev.button === 1 || ev.button === 3 || ev.button === 4) {
        if (this.h.mouseButton(ev.button, 'up', ev)) ev.preventDefault();
      }
    });
    on(canvas, 'pointerdown', (ev) => {
      if (ev.button === 2) {
        this.drag = { x: ev.clientX, y: ev.clientY, moved: false };
        canvas.setPointerCapture?.(ev.pointerId);
        return;
      }
      if (ev.button !== 0) return;
      // Ctrl+click is the secondary click on macOS; its contextmenu event handles it.
      if (ev.ctrlKey) return;
      const now = ev.timeStamp;
      const double = now - this.lastClick < 320;
      this.lastClick = now;
      const p = this.devicePoint(ev);
      this.h.click(p.x, p.y, double);
    });
    on(canvas, 'pointermove', (ev) => {
      const d = this.drag;
      if (d) {
        const dx = ev.clientX - d.x;
        const dy = ev.clientY - d.y;
        if (!d.moved && Math.hypot(dx, dy) < ORBIT_THRESHOLD) return;
        d.moved = true;
        d.x = ev.clientX;
        d.y = ev.clientY;
        this.h.orbit(dx, dy);
        return;
      }
      const p = this.devicePoint(ev);
      this.h.hover(p.x, p.y);
    });
    on(canvas, 'pointerup', (ev) => {
      if (ev.button !== 2 || !this.drag) return;
      const moved = this.drag.moved;
      this.drag = null;
      this.lastRightUp = ev.timeStamp;
      canvas.releasePointerCapture?.(ev.pointerId);
      if (!moved) {
        const p = this.devicePoint(ev);
        this.h.secondary(p.x, p.y);
      }
    });
    // A lost capture or a cancelled pointer ends the drag, or every later move would orbit.
    on(canvas, 'pointercancel', () => {
      this.drag = null;
    });
    on(canvas, 'lostpointercapture', () => {
      this.drag = null;
    });
    on(canvas, 'pointerleave', () => this.h.hover(null, null));
    on(
      canvas,
      'wheel',
      (ev) => {
        ev.preventDefault();
        if (ev.deltaY !== 0) this.h.zoom(ev.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );
    on(canvas, 'contextmenu', (ev) => {
      ev.preventDefault();
      // A right button already answered on pointerup (or orbited); a context menu with no
      // right button behind it (Ctrl+click, long press) is the secondary click.
      if (this.drag || ev.timeStamp - this.lastRightUp < 500) return;
      const p = this.devicePoint(ev);
      this.h.secondary(p.x, p.y);
    });
  }

  private devicePoint(ev: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const k = this.dpr();
    return { x: (ev.clientX - r.left) * k, y: (ev.clientY - r.top) * k };
  }

  private keyDown(ev: KeyboardEvent): void {
    // typing: only Esc reaches the game (the field handles Enter itself)
    if (isTypingTarget(ev.target) && ev.code !== 'Escape') return;
    if (ev.metaKey) return;
    if (this.h.key(chordOf(ev), 'down', ev.repeat)) {
      ev.preventDefault();
      return;
    }
    // outside windows, Space and Enter never press a HUD button that kept the focus after a
    // click (they advance lines when talk shows; in a window they press its control)
    const inWindow = ev.target instanceof Element && !!ev.target.closest('.hk-window');
    if (!inWindow && ACTIVATION_KEYS.has(ev.code)) ev.preventDefault();
  }

  private keyUp(ev: KeyboardEvent): void {
    // a release always goes through, so a key held into a text field never sticks
    this.h.key(chordOf(ev), 'up', false);
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
  }
}
