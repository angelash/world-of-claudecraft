// A modeless player information card. It does not stop the world or steal held input.
// Keyboard/pad window navigation can focus its normal buttons; Esc belongs to the session.

import { clear, el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import './player_popups.css';

export class PlayerPopupShell {
  readonly el: HTMLElement;
  readonly body = el('div', { className: 'hk-player-popup-body' });
  private title: HTMLElement;

  constructor(parent: HTMLElement, id: string, close: () => void) {
    this.title = el('h2', { className: 'hk-player-popup-title' });
    const closeButton = el('button', {
      className: 'hk-btn hk-btn-small',
      text: t('ui.common.panel.close'),
      attrs: { type: 'button' },
      on: { click: close },
    });
    this.el = el(
      'section',
      {
        className: `hk-player-popup ${id}`,
        attrs: { role: 'dialog', 'aria-modal': 'false' },
        dataset: { hud: id, inputWindow: '' },
      },
      [el('header', { className: 'hk-card-head' }, [this.title, closeButton]), this.body],
    );
    parent.append(this.el);
    this.el.hidden = true;
  }

  show(title: string): void {
    this.title.textContent = title;
    this.el.setAttribute('aria-label', title);
    clear(this.body);
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }
  dispose(): void {
    this.el.remove();
  }
}
