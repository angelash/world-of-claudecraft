// Draggable, closable window frames. Each window id maps to a factory that builds its
// content; availability follows the feature flags (window_registry.ts). Open windows are
// refreshed at a low rate by the session, never per frame. Thin DOM layer.

import type { FlagValue } from '../../core/contracts';
import { clear, el } from '../../shared_ui/dom';
import { T } from '../../shared_ui/text';
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
    const content = factory(close);
    const titleBar = el('div', { className: 'hk-window-title' }, [
      el('span', { text: windowTitle(id) }),
      el('button', {
        className: 'hk-window-close',
        title: T.windows.close,
        attrs: { 'aria-label': T.windows.close, type: 'button' },
        on: { click: close },
      }),
    ]);
    const body = el('div', { className: 'hk-window-body' }, [content.el]);
    const frame = el(
      'section',
      {
        className: `hk-window hk-window-${id}`,
        attrs: { role: 'dialog', 'aria-label': windowTitle(id) },
      },
      [titleBar, body],
    );
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
