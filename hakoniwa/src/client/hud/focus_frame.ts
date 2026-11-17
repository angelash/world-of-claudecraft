// Implements `ui_hud_focus` (ux_and_onboarding.md 5.2): the painter of the compact focus frame
// under the party frames (name, health, cast bar). Writes are elided. The rules live in
// ./focus_model.ts.

import './party_frames.css';
import { el, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import type { FocusRow } from './focus_model';
import { kindLabel } from './format';

function bar(cls: string): { el: HTMLElement; fill: HTMLElement; text: HTMLElement } {
  const fill = el('div', { className: 'hk-bar-fill' });
  const text = el('span', { className: 'hk-bar-text' });
  return { el: el('div', { className: `hk-bar ${cls}` }, [fill, text]), fill, text };
}

export class FocusFrame {
  readonly el: HTMLElement;
  private readonly name = el('div', { className: 'hk-party-name' });
  private readonly hp = bar('hk-bar-hp');
  private readonly cast = bar('hk-bar-cast');
  private key = '';

  constructor(onSelect: () => void) {
    this.el = el('div', { className: 'hk-focus', attrs: { role: 'button' } }, [
      el('div', { className: 'hk-party-head' }, [
        this.name,
        el('span', { className: 'hk-party-order', text: t('ui.hud.focus.label') }),
      ]),
      this.hp.el,
      this.cast.el,
    ]);
    this.el.addEventListener('click', onSelect);
    this.el.hidden = true;
  }

  update(row: FocusRow | null): void {
    const shown = !!row;
    if (this.el.hidden === shown) this.el.hidden = !shown;
    if (!row) {
      this.key = '';
      return;
    }
    const key = JSON.stringify(row);
    if (key === this.key) return;
    this.key = key;
    setText(this.name, row.name && row.name !== '?' ? row.name : kindLabel(row.kind));
    this.hp.el.hidden = !row.hp;
    if (row.hp) {
      const pct = row.hp.max > 0 ? (row.hp.value / row.hp.max) * 100 : 0;
      this.hp.fill.style.width = `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`;
      setText(this.hp.text, `${row.hp.value} / ${row.hp.max}`);
    }
    this.cast.el.hidden = !row.cast;
    if (row.cast) {
      this.cast.fill.style.width = `${(Math.max(0, Math.min(1, row.cast.progress)) * 100).toFixed(1)}%`;
      setText(this.cast.text, row.cast.name);
    }
  }
}
