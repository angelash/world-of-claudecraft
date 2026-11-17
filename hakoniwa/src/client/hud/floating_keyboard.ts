// Floating keyboard painter (release_engineering.md 4.4 text input; ux_and_onboarding.md
// 16.1): the field's prompt, the text typed so far with its length against the maximum, the
// key grid of input/osk.ts with the cursor key outlined, and the button hint in the active
// controller's glyphs. Thin DOM; repainted only when the keyboard state changes.

import { clear, el, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import type { GlyphFamily } from '../input/device';
import { padButtonText } from '../input/glyphs';
import { type OskKey, type OskState, oskRows } from '../input/osk';
import type { PadButton } from '../input/pad_bindings';

function keyLabel(k: OskKey): string {
  return k.kind === 'char' ? k.ch : t(`ui.pop.osk.key.${k.kind}`);
}

export class FloatingKeyboard {
  readonly el: HTMLElement;
  private prompt = el('div', { className: 'hk-osk-prompt' });
  private text = el('div', { className: 'hk-osk-text' });
  private count = el('div', { className: 'hk-osk-count' });
  private grid = el('div', { className: 'hk-osk-grid' });
  private hint = el('div', { className: 'hk-osk-hint' });
  private sig = '';

  constructor() {
    this.el = el(
      'div',
      { className: 'hk-osk', attrs: { role: 'dialog', 'aria-label': t('ui.pop.osk.title') } },
      [
        this.prompt,
        el('div', { className: 'hk-osk-line' }, [this.text, this.count]),
        this.grid,
        this.hint,
      ],
    );
    this.el.hidden = true;
  }

  render(
    s: OskState | null,
    prompt: string,
    pad: { family: GlyphFamily; confirm: PadButton; back: PadButton },
  ): void {
    const { family } = pad;
    if (!s) {
      this.el.hidden = true;
      this.sig = '';
      return;
    }
    const sig = `${prompt}/${s.page}/${s.caps}/${s.row}/${s.col}/${s.text}/${family}/${pad.confirm}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.el.hidden = false;
    setText(this.prompt, prompt || t('ui.pop.osk.title'));
    setText(this.text, s.text);
    setText(this.count, t('ui.pop.osk.count', { n: Array.from(s.text).length, max: s.maxLength }));
    setText(
      this.hint,
      t('ui.pop.osk.hint', {
        a: padButtonText(pad.confirm, family),
        b: padButtonText(pad.back, family),
        y: padButtonText('y', family),
        start: padButtonText('start', family),
      }),
    );
    clear(this.grid);
    const rows = oskRows(s.page, t('ui.pop.osk.han_page'), s.caps);
    rows.forEach((row, r) => {
      const line = el('div', { className: 'hk-osk-row' });
      row.forEach((k, c) => {
        line.append(
          el('span', {
            className: `hk-osk-key kind-${k.kind}${r === s.row && c === s.col ? ' on' : ''}`,
            text: keyLabel(k),
          }),
        );
      });
      this.grid.append(line);
    });
  }
}
