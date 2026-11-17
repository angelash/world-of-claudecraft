// Virtual cursor painter (release_engineering.md 4.4; ux_and_onboarding.md 16.3): a pointer
// glyph at the gamepad cursor's position, shown only while the cursor is active. Thin DOM
// over input/virtual_cursor.ts.

import { el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import type { CursorState } from '../input/virtual_cursor';

export class VirtualCursorView {
  readonly el: HTMLElement;
  private last = '';

  constructor() {
    this.el = el('div', {
      className: 'hk-vcursor',
      attrs: { role: 'img', 'aria-label': t('ui.ovl.cursor.label') },
    });
    this.el.hidden = true;
  }

  render(c: CursorState | null): void {
    if (!c) {
      this.el.hidden = true;
      this.last = '';
      return;
    }
    const pos = `translate(${Math.round(c.x)}px, ${Math.round(c.y)}px)`;
    this.el.hidden = false;
    if (pos === this.last) return;
    this.last = pos;
    this.el.style.transform = pos;
  }
}
