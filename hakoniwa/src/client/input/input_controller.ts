// DOM input: keyboard bindings, pointer clicks and hover on the world canvas, wheel zoom,
// and the right-button drag that orbits the HD-2D camera (a right click without a drag
// stays the secondary click).
// Turns raw events into intents and actions for the session; the rules (bindings, intent
// math, picking) live in the pure keymap and picking modules.

import { isTypingTarget } from '../../shared_ui/dom';
import {
  type Action,
  type Binding,
  bindingFor,
  type Intent,
  intentFromHeld,
  MOVE_ACTIONS,
  sameIntent,
} from './keymap';

export interface InputHandlers {
  /** movement intent changed (zero intent when every key is released) */
  intent(i: Intent): void;
  /** a non-movement action key went down */
  action(action: Action, binding: Binding): void;
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

/** CSS pixels a right-button press must travel before it counts as a camera drag. */
export const ORBIT_THRESHOLD = 4;

export class InputController {
  private held = new Set<Action>();
  private lastIntent: Intent | null = null;
  private readonly off: (() => void)[] = [];
  private lastClick = 0;
  private drag: { x: number; y: number; moved: boolean } | null = null;
  /** time of the last right-button release, so its contextmenu event is not a second click */
  private lastRightUp = Number.NEGATIVE_INFINITY;

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
    on(window, 'blur', () => this.releaseAll());
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
    if (isTypingTarget(ev.target)) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const b = bindingFor(ev.code);
    if (!b) return;
    ev.preventDefault();
    if (MOVE_ACTIONS.has(b.action)) {
      this.held.add(b.action);
      this.emitIntent();
      return;
    }
    if (ev.repeat) return;
    this.h.action(b.action, b);
  }

  private keyUp(ev: KeyboardEvent): void {
    const b = bindingFor(ev.code);
    if (!b || !MOVE_ACTIONS.has(b.action)) return;
    this.held.delete(b.action);
    this.emitIntent();
  }

  private emitIntent(): void {
    const i = intentFromHeld(this.held);
    if (sameIntent(i, this.lastIntent)) return;
    this.lastIntent = i;
    this.h.intent(i);
  }

  /** Drop every held key (window blur, opening a modal) and stop. */
  releaseAll(): void {
    if (this.held.size === 0) return;
    this.held.clear();
    this.emitIntent();
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
  }
}
