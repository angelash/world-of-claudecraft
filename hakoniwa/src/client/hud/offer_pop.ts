// The painter of `ui_pop_offer` (ux_and_onboarding.md 6.4): a half-modal panel with her
// account in words, the receipts of past exchanges and the offering form. Thin: the rules are
// in ./offer_pop_model.ts. Opened from the coin badge (`ui_hud_coin`) and from the goddess
// window's offering section.

import './hud_extra.css';
import { clear, el, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import type { OfferPopInput, OfferPopModel, OfferWant } from './offer_pop_model';
import { offerPopModel } from './offer_pop_model';

export interface OfferPopHandlers {
  /** read the popup's data (the session reads the adapter and its receipts) */
  model(): OfferPopInput;
  /** send an offering: one held item, a blessing or news */
  offer(itemId: string, want: OfferWant): void;
  close(): void;
}

export class OfferPop {
  readonly el: HTMLElement;
  private readonly account: HTMLElement;
  private readonly history: HTMLElement;
  private readonly select: HTMLSelectElement;
  private readonly buttons: HTMLButtonElement[];
  private readonly blocked: HTMLElement;
  private sig = '';
  private open = false;

  constructor(private readonly h: OfferPopHandlers) {
    this.account = el('div', { className: 'hk-offer-account' });
    this.history = el('div', { className: 'hk-offer-history' });
    this.select = el('select', {
      className: 'hk-input',
      attrs: { 'aria-label': t('ui.pop.offer.pick') },
    });
    this.blocked = el('div', { className: 'hk-offer-blocked' });
    const m = offerPopModel(h.model());
    this.buttons = m.wants.map((w) =>
      el('button', {
        className: 'hk-btn hk-btn-small',
        text: w.label,
        attrs: { type: 'button' },
        on: {
          click: () => {
            if (this.select.value) this.h.offer(this.select.value, w.id);
          },
        },
      }),
    );
    this.el = el(
      'div',
      { className: 'hk-offer-pop', attrs: { role: 'dialog', 'aria-label': m.title } },
      [
        el('div', { className: 'hk-offer-head' }, [
          el('strong', { text: m.title }),
          el('button', {
            className: 'hk-btn hk-btn-small',
            text: t('ui.common.panel.close'),
            attrs: { type: 'button' },
            on: { click: () => h.close() },
          }),
        ]),
        this.account,
        this.history,
        el('div', { className: 'hk-offer-form' }, [this.select, ...this.buttons]),
        this.blocked,
      ],
    );
    this.el.hidden = true;
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.el.hidden = !open;
    if (open) this.update();
  }

  get isOpen(): boolean {
    return this.open;
  }

  update(): void {
    if (!this.open) return;
    const m: OfferPopModel = offerPopModel(this.h.model());
    const sig = JSON.stringify(m);
    if (sig === this.sig) return;
    this.sig = sig;
    setText(this.account, m.account);
    clear(this.history);
    if (m.historyEmpty) {
      this.history.append(el('p', { className: 'hk-muted', text: m.historyEmpty }));
    }
    for (const r of m.receipts) {
      this.history.append(
        el('div', { className: `hk-offer-receipt${r.ok ? '' : ' refused'}`, text: r.text }),
      );
    }
    const keep = this.select.value;
    clear(this.select);
    for (const o of m.options) {
      this.select.append(el('option', { text: o.label, attrs: { value: o.id } }));
    }
    if (m.options.some((o) => o.id === keep)) this.select.value = keep;
    this.select.disabled = !m.canOffer;
    for (const b of this.buttons) b.disabled = !m.canOffer;
    setText(this.blocked, m.blocked);
  }
}
