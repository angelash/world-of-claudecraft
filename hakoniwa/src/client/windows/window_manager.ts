// Draggable, closable window frames. Each window id maps to a factory that builds its
// content; availability follows the feature flags (window_registry.ts). Open windows are
// refreshed at a low rate by the session, never per frame. A window def marked `mode` opens as
// an interface mode instead (ux_and_onboarding.md 1.3; the corridor first). Thin DOM layer.

import type { FlagValue } from '../../core/contracts';
import { clear, el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import {
  cascadePos,
  clampWindowPos,
  isWindowAvailable,
  type WindowId,
  windowDef,
  windowTitle,
} from './window_registry';

export interface WindowContent {
  el: HTMLElement;
  /** called a few times per second while open */
  update?(): void;
  /** called every animation frame while open (canvas windows such as the battlefield) */
  frame?(nowMs: number): void;
  dispose?(): void;
  /** a mode's input action (its context's actions, input/contexts.ts); true when handled */
  action?(name: string): boolean;
}

export type WindowFactory = (close: () => void) => WindowContent;

interface OpenWindow {
  id: WindowId;
  frame: HTMLElement;
  content: WindowContent;
}

export interface AvailabilitySource {
  flags(): Readonly<Record<string, FlagValue>>;
  devMode: boolean;
}

export class WindowManager {
  readonly root: HTMLElement;
  private factories = new Map<WindowId, WindowFactory>();
  private open = new Map<WindowId, OpenWindow>();
  private positions = new Map<WindowId, { x: number; y: number }>();
  private order: WindowId[] = [];
  private z = 10;
  private opened = 0;
  /** notified when the set of open windows changes (menu bar highlights) */
  onChange: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    private readonly avail: AvailabilitySource,
  ) {
    this.root = el('div', { className: 'hk-windows' });
    parent.append(this.root);
  }

  register(id: WindowId, factory: WindowFactory): void {
    this.factories.set(id, factory);
  }

  available(id: WindowId): boolean {
    return isWindowAvailable(windowDef(id), this.avail.flags(), this.avail.devMode);
  }

  isOpen(id: WindowId): boolean {
    return this.open.has(id);
  }

  get anyOpen(): boolean {
    return this.open.size > 0;
  }

  toggle(id: WindowId): void {
    if (this.isOpen(id)) this.close(id);
    else this.show(id);
  }

  show(id: WindowId): boolean {
    const existing = this.open.get(id);
    if (existing) {
      this.focus(existing);
      return true;
    }
    if (!this.available(id)) return false;
    const factory = this.factories.get(id);
    if (!factory) return false;
    const def = windowDef(id);
    const close = () => this.close(id);
    if (def.mode) return this.showMode(id, factory(close));
    // A plain window never opens behind a mode (1.3): asking for one (a notification or the
    // tracker clicked, a link out of the corridor card) leaves the mode first.
    const mode = this.modeOpen;
    if (mode) this.close(mode);
    const content = factory(close);
    // the title bar's "？" shows the window's own help entry (6.1, 17.7)
    const help = el('p', { className: 'hk-window-help', text: t(def.helpKey) });
    help.hidden = true;
    const helpButton = el('button', {
      className: 'hk-window-help-btn',
      text: t('ui.common.panel.help_mark'),
      title: t('ui.common.panel.help'),
      attrs: { 'aria-label': t('ui.common.panel.help'), 'aria-expanded': 'false', type: 'button' },
      on: {
        click: () => {
          help.hidden = !help.hidden;
          helpButton.setAttribute('aria-expanded', String(!help.hidden));
        },
      },
    });
    const titleBar = el('div', { className: 'hk-window-title' }, [
      el('span', { text: windowTitle(id) }),
      el('span', { className: 'hk-window-actions' }, [
        helpButton,
        el('button', {
          className: 'hk-window-close',
          title: t('ui.common.panel.close'),
          attrs: { 'aria-label': t('ui.common.panel.close'), type: 'button' },
          on: { click: close },
        }),
      ]),
    ]);
    const body = el('div', { className: 'hk-window-body' }, [help, content.el]);
    const frame = el(
      'section',
      {
        className: `hk-window hk-window-${id}`,
        attrs: { role: 'dialog', 'aria-label': windowTitle(id) },
      },
      [titleBar, body],
    );
    // the onboarding outlines a window by this name (src/client/tutorial/glow.ts)
    frame.dataset.hud = `win_${id}`;
    frame.style.width = `${def.width}px`;
    const pos = this.positions.get(id) ?? cascadePos(this.opened++, def.width, window.innerWidth);
    const clamped = clampWindowPos(pos.x, pos.y, def.width, window.innerWidth, window.innerHeight);
    frame.style.left = `${clamped.x}px`;
    frame.style.top = `${clamped.y}px`;
    this.root.append(frame);
    const ow: OpenWindow = { id, frame, content };
    this.open.set(id, ow);
    this.makeDraggable(ow, titleBar, def.width);
    frame.addEventListener('pointerdown', () => this.focus(ow));
    this.focus(ow);
    content.update?.();
    this.onChange?.();
    return true;
  }

  /**
   * An interface mode (1.3): every other window closes, the content fills the screen with no
   * title bar or drag, and it stays the front layer until it closes (Esc, its own leave key).
   */
  private showMode(id: WindowId, content: WindowContent): boolean {
    this.closeAll();
    const frame = el(
      'section',
      {
        className: `hk-mode-layer hk-mode-${id}`,
        attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': windowTitle(id) },
      },
      [content.el],
    );
    this.root.append(frame);
    const ow: OpenWindow = { id, frame, content };
    this.open.set(id, ow);
    this.focus(ow);
    content.update?.();
    this.onChange?.();
    return true;
  }

  /** The open interface mode, if any (it pauses the world and owns the input). */
  get modeOpen(): WindowId | null {
    for (const id of this.open.keys()) if (windowDef(id).mode) return id;
    return null;
  }

  /** A mode, or a pausing window (settings, saves, menu, help), is open (1.3). */
  get holdsWorld(): boolean {
    for (const id of this.open.keys()) {
      const d = windowDef(id);
      if (d.mode || d.pauses) return true;
    }
    return false;
  }

  /** Run an action of the open mode's input context; `leave` closes the mode. */
  modeAction(action: string): boolean {
    const id = this.modeOpen;
    if (!id) return false;
    if (action === 'leave') {
      this.close(id);
      return true;
    }
    return this.open.get(id)?.content.action?.(action) ?? false;
  }

  close(id: WindowId): void {
    const ow = this.open.get(id);
    if (!ow) return;
    ow.content.dispose?.();
    ow.frame.remove();
    this.open.delete(id);
    this.order = this.order.filter((x) => x !== id);
    this.onChange?.();
  }

  /** Close the front-most window; false when none is open. */
  closeTop(): boolean {
    const top = this.order[this.order.length - 1];
    if (!top) return false;
    this.close(top);
    return true;
  }

  closeAll(): void {
    for (const id of [...this.open.keys()]) this.close(id);
  }

  update(): void {
    for (const ow of this.open.values()) ow.content.update?.();
  }

  /** Per-frame hook for open canvas windows. */
  frame(nowMs: number): void {
    for (const ow of this.open.values()) ow.content.frame?.(nowMs);
  }

  /** Close windows whose features were locked again (flags changed). */
  refreshAvailability(): void {
    for (const id of [...this.open.keys()]) if (!this.available(id)) this.close(id);
  }

  dispose(): void {
    this.closeAll();
    clear(this.root);
    this.root.remove();
  }

  private focus(ow: OpenWindow): void {
    ow.frame.style.zIndex = String(++this.z);
    this.order = this.order.filter((x) => x !== ow.id);
    this.order.push(ow.id);
  }

  private makeDraggable(ow: OpenWindow, handle: HTMLElement, width: number): void {
    let start: { px: number; py: number; x: number; y: number } | null = null;
    handle.addEventListener('pointerdown', (ev) => {
      if ((ev.target as HTMLElement).closest('button')) return;
      start = {
        px: ev.clientX,
        py: ev.clientY,
        x: ow.frame.offsetLeft,
        y: ow.frame.offsetTop,
      };
      handle.setPointerCapture(ev.pointerId);
    });
    handle.addEventListener('pointermove', (ev) => {
      if (!start) return;
      const p = clampWindowPos(
        start.x + ev.clientX - start.px,
        start.y + ev.clientY - start.py,
        width,
        window.innerWidth,
        window.innerHeight,
      );
      ow.frame.style.left = `${p.x}px`;
      ow.frame.style.top = `${p.y}px`;
    });
    const end = (ev: PointerEvent) => {
      if (!start) return;
      start = null;
      handle.releasePointerCapture(ev.pointerId);
      this.positions.set(ow.id, { x: ow.frame.offsetLeft, y: ow.frame.offsetTop });
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
}
