// Implements `ui_hud_notify` (ux_and_onboarding.md 5.4): the painter of the notification queue.
// Critical notifications sit top centre and open their window on a click; important and normal
// ones stack on the right; the light line sits above the hotbar. The text is rendered with t()
// when a notification is drawn. Writes are elided on the frame key. The rules live in
// ./notify_model.ts.

import './notify.css';
import { clear, el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import {
  type Notification,
  type NotifyContext,
  type NotifyFrame,
  NotifyQueue,
  type NotifySpec,
} from './notify_model';

export class NotifyView {
  readonly queue = new NotifyQueue();
  /** critical notifications, top centre */
  readonly topEl = el('div', { className: 'hk-notify-top', attrs: { 'aria-live': 'polite' } });
  /** important and normal notifications, right side */
  readonly stackEl = el('div', { className: 'hk-notify-stack', attrs: { 'aria-live': 'polite' } });
  /** the light line above the hotbar */
  readonly lightEl = el('div', { className: 'hk-notify-light', attrs: { 'aria-live': 'polite' } });
  private key: string | null = null;

  constructor(private readonly onOpen: (windowId: string) => void) {
    this.lightEl.hidden = true;
  }

  push(spec: NotifySpec, now: number, ctx: NotifyContext): void {
    this.queue.push(spec, now);
    this.update(now, ctx);
  }

  clear(): void {
    this.queue.clear();
    this.key = null;
  }

  update(now: number, ctx: NotifyContext): void {
    const f = this.queue.frame(now, ctx);
    if (f.key === this.key) return;
    this.key = f.key;
    this.paint(f);
  }

  private item(n: Notification): HTMLElement {
    const node = el('div', {
      className: `hk-notify hk-notify-${n.level}${n.open ? ' clickable' : ''}`,
      text: t(n.text),
    });
    if (n.open) {
      const open = n.open;
      node.addEventListener('click', () => {
        this.queue.dismiss(n.id);
        this.key = null;
        node.remove();
        this.onOpen(open);
      });
    }
    return node;
  }

  private paint(f: NotifyFrame): void {
    clear(this.topEl);
    for (const n of f.top) this.topEl.append(this.item(n));
    clear(this.stackEl);
    for (const n of f.stack) this.stackEl.append(this.item(n));
    this.lightEl.hidden = !f.light;
    this.lightEl.textContent = f.light ? t(f.light.text) : '';
  }
}
