// The painter of `ui_hud_coin` (ux_and_onboarding.md 5.2): a small coin button at the bottom
// right, shown only while the coin is in use. Thin: every rule is in ./coin_badge_model.ts,
// and nothing is written when the row has not changed.

import './hud_extra.css';
import { el, setClass, setText } from '../../shared_ui/dom';
import type { CoinBadgeRow } from './coin_badge_model';

export class CoinBadge {
  readonly el: HTMLElement;
  private readonly button: HTMLButtonElement;
  private sig = '';

  constructor(onOpen: () => void) {
    this.button = el('button', {
      className: 'hk-coin-badge',
      attrs: { type: 'button' },
      on: { click: onOpen },
    });
    this.el = el('div', { className: 'hk-coin' }, [this.button]);
    this.el.hidden = true;
  }

  update(row: CoinBadgeRow | null): void {
    const sig = row ? `${row.spin}|${row.label}|${row.title}` : '';
    if (sig === this.sig) return;
    this.sig = sig;
    this.el.hidden = !row;
    if (!row) return;
    setText(this.button, row.label);
    this.button.setAttribute('aria-label', row.title);
    this.button.title = row.title;
    setClass(this.button, 'spin', row.spin);
    setClass(this.button, 'still', !row.spin);
  }
}
