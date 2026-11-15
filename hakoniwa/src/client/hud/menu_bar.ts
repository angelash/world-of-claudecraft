// Menu bar: one button per available window (feature flags decide which), highlighted
// while open. Rebuilt only when availability changes.

import type { FlagValue } from '../../core/contracts';
import { clear, el, setClass } from '../../shared_ui/dom';
import { T } from '../../shared_ui/text';
import {
  availabilityKey,
  availableWindows,
  type WindowId,
  windowTitle,
} from '../windows/window_registry';

export class MenuBar {
  readonly el: HTMLElement;
  private sig = '';
  private buttons = new Map<WindowId, HTMLButtonElement>();

  constructor(
    private readonly onToggle: (id: WindowId) => void,
    private readonly devMode: boolean,
  ) {
    this.el = el('nav', { className: 'hk-menubar', attrs: { 'aria-label': T.menuBar.menu } });
  }

  update(flags: Readonly<Record<string, FlagValue>>, isOpen: (id: WindowId) => boolean): void {
    const sig = availabilityKey(flags, this.devMode);
    if (sig !== this.sig) {
      this.sig = sig;
      clear(this.el);
      this.buttons.clear();
      for (const def of availableWindows(flags, this.devMode)) {
        if (!def.menuBar) continue;
        const label = windowTitle(def.id);
        const b = el('button', {
          className: 'hk-btn hk-menubar-btn',
          text: label,
          title: def.hotkey ? `${label} (${def.hotkey})` : label,
          attrs: { type: 'button' },
          on: { click: () => this.onToggle(def.id) },
        });
        this.buttons.set(def.id, b);
        this.el.append(b);
      }
      const menu = el('button', {
        className: 'hk-btn hk-menubar-btn',
        text: T.menuBar.menu,
        title: `${T.menuBar.menu} (Esc)`,
        attrs: { type: 'button' },
        on: { click: () => this.onToggle('menu') },
      });
      this.buttons.set('menu', menu);
      this.el.append(menu);
    }
    for (const [id, b] of this.buttons) setClass(b, 'active', isOpen(id));
  }
}
