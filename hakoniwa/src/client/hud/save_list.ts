// Implements the save list painter shared by `ui_scr_load` (ux_and_onboarding.md 3.5) and
// `ui_win_saves` (6.2.13): one row per slot with its thumbnail (or the neutral placeholder),
// lines, badges and buttons; asks through `ui_pop_confirm` where the model says so. Rebuilds
// only when the model's signature changes. Thin DOM over ./save_list_model.ts.

import './save_list.css';
import type { SlotId } from '../../core/save';
import { clear, el, setClass, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import { askConfirm } from './confirm_pop';
import type { SaveButton, SaveListModel, SaveRow } from './save_list_model';

export interface SaveListHandlers {
  save?(slot: SlotId): void;
  load(slot: SlotId): void;
  remove(slot: SlotId): void;
}

/** The model's signature with thumbnails reduced to a short fingerprint. */
export function saveListSignature(m: SaveListModel): string {
  return JSON.stringify(m, (k, v) =>
    k === 'thumb' && typeof v === 'string' ? `${v.length}:${v.slice(-24)}` : v,
  );
}

export class SaveList {
  readonly el: HTMLElement;
  private readonly notice = el('div', { className: 'hk-savelist-notice' });
  private readonly body = el('div', { className: 'hk-savelist-rows' });
  private sig = '';

  constructor(private readonly h: SaveListHandlers) {
    this.el = el('div', { className: 'hk-savelist' }, [this.notice, this.body]);
  }

  update(m: SaveListModel): void {
    const sig = saveListSignature(m);
    if (sig === this.sig) return;
    this.sig = sig;
    setText(this.notice, m.notice);
    this.notice.hidden = !m.notice;
    setClass(this.el, 'disabled', m.disabled);
    clear(this.body);
    if (m.empty) this.body.append(el('p', { className: 'hk-muted hk-empty', text: m.empty }));
    for (const r of m.rows) this.body.append(this.row(r, m.notice));
  }

  /** Forget the last picture (after an action whose result the list shows next). */
  invalidate(): void {
    this.sig = '';
  }

  private row(r: SaveRow, notice: string): HTMLElement {
    const thumb = el('div', { className: 'hk-savelist-thumb' });
    if (r.thumb) {
      thumb.append(
        el('img', { attrs: { src: r.thumb, alt: t('ui.scr.load.thumb_alt'), draggable: 'false' } }),
      );
    } else thumb.classList.add('placeholder');
    const buttons: HTMLElement[] = [];
    const add = (b: SaveButton | null, label: string, run: () => void, cls = '') => {
      if (!b) return;
      buttons.push(
        el('button', {
          className: `hk-btn hk-btn-small ${cls}`.trim(),
          text: label,
          title: b.reason,
          attrs: b.enabled ? { type: 'button' } : { type: 'button', disabled: '' },
          on: {
            click: () => {
              if (!b.enabled) return;
              if (!b.confirm) {
                run();
                return;
              }
              void askConfirm(b.confirm).then((yes) => {
                if (yes) run();
              });
            },
          },
        }),
      );
    };
    const h = this.h;
    if (h.save) add(r.save, t('ui.win.saves.save'), () => h.save?.(r.slot), 'hk-btn-primary');
    add(r.load, t('ui.win.saves.load'), () => h.load(r.slot));
    add(r.remove, t('ui.win.saves.remove'), () => h.remove(r.slot));
    const reason = [r.save, r.load].find((b) => b && !b.enabled && b.reason)?.reason ?? '';
    return el('div', { className: `hk-savelist-row state-${r.state}` }, [
      thumb,
      el('div', { className: 'hk-savelist-info' }, [
        el('div', { className: 'hk-savelist-head' }, [
          el('strong', { text: r.label }),
          ...r.badges.map((b) => el('span', { className: `hk-badge ${b.cls}`, text: b.text })),
        ]),
        ...r.lines.map((line) => el('div', { className: 'hk-savelist-line', text: line })),
        r.note ? el('div', { className: 'hk-savelist-note', text: r.note }) : null,
        reason && reason !== r.note && reason !== notice
          ? el('div', { className: 'hk-savelist-reason', text: reason })
          : null,
      ]),
      el('div', { className: 'hk-savelist-buttons' }, buttons),
    ]);
  }
}
