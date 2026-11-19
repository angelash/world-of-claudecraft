// The tide-night panel painter (act1_borderstone.md 8; the shape of ./gauges.ts): a column on
// the right under the tracker while the night runs, the dawn summary with a close button after
// it. Every line names its state in words and marks the player's line and the surge's face
// with words, never colour alone. Thin: the rules are in ./tide_panel_model.ts; the DOM is
// rebuilt only when the row changes.

import './hud_extra.css';
import { clear, el } from '../../shared_ui/dom';
import { listSeparator, t } from '../../shared_ui/i18n';
import type { TidePanelRow } from './tide_panel_model';

export class TidePanel {
  readonly el: HTMLElement;
  private sig = '';

  /** `onClose(night)`: the player closed the dawn summary of that night. */
  constructor(private readonly onClose: (night: string) => void) {
    this.el = el('section', {
      className: 'hk-tide',
      attrs: { 'aria-label': t('ui.hud.tide.aria'), 'aria-live': 'polite' },
    });
    this.el.hidden = true;
  }

  update(row: TidePanelRow | null): void {
    const sig = row ? JSON.stringify(row) : '';
    if (sig === this.sig) return;
    this.sig = sig;
    clear(this.el);
    this.el.hidden = !row;
    if (!row) return;
    this.el.append(
      el('div', { className: 'hk-tide-head' }, [
        el('strong', { text: row.title }),
        el('span', { className: 'hk-tide-phase', text: row.phase }),
      ]),
    );
    for (const l of row.lines) {
      const marks = [
        l.player ? t('ui.hud.tide.you_here') : '',
        l.weakest ? t('ui.hud.tide.surge_here') : '',
      ].filter(Boolean);
      this.el.append(
        el('div', { className: `hk-tide-line ${l.state}` }, [
          el('span', { className: 'hk-tide-name', text: l.name }),
          el('span', { className: 'hk-tide-state', text: l.stateLabel }),
          marks.length ? el('span', { className: 'hk-tide-mark', text: marks.join(' ') }) : null,
          l.damaged.length
            ? el('div', {
                className: 'hk-tide-damaged',
                text: t('ui.hud.tide.damaged', { places: l.damaged.join(listSeparator('list')) }),
              })
            : null,
        ]),
      );
    }
    const s = row.summary;
    if (!s) return;
    const list = (
      key: 'ui.hud.tide.named' | 'ui.hud.tide.injured' | 'ui.hud.tide.buildings',
      names: string[],
    ) =>
      names.length
        ? el('div', { text: t(key, { names: names.join(listSeparator('list')) }) })
        : null;
    this.el.append(
      el('div', { className: 'hk-tide-summary' }, [
        el('div', { className: 'hk-tide-survival', text: s.survival }),
        el('div', { text: s.civilians }),
        list('ui.hud.tide.named', s.named),
        list('ui.hud.tide.injured', s.injured),
        list('ui.hud.tide.buildings', s.buildings),
        el('button', {
          className: 'hk-btn hk-btn-small',
          text: t('ui.common.panel.close'),
          attrs: { type: 'button' },
          on: { click: () => this.onClose(row.night) },
        }),
      ]),
    );
  }
}
