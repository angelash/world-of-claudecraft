// Implements `ui_hud_dungeon` (ux_and_onboarding.md 5.2): the field status bar under the
// tracker, shown while the player is in a dungeon, a nest or a trial. Thin painter over
// ./dungeon_bar_model.ts; rebuilds only when the row changes and writes nothing otherwise.

import '../windows/field/field.css';
import { clear, el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import type { DungeonBarRow } from './dungeon_bar_model';

export class DungeonBar {
  readonly el: HTMLElement;
  private sig = '';

  constructor() {
    this.el = el('div', {
      className: 'hk-dungeon-bar',
      attrs: { 'aria-label': t('ui.hud.dungeon.aria') },
    });
    this.el.hidden = true;
  }

  update(row: DungeonBarRow | null): void {
    const sig = JSON.stringify(row);
    if (sig === this.sig) return;
    this.sig = sig;
    this.el.hidden = !row;
    clear(this.el);
    if (!row) return;
    const parts: HTMLElement[] = [
      el('div', { className: 'hk-dungeon-name', text: row.name }),
      el('div', { className: 'hk-dungeon-row' }, [
        el('span', { className: 'hk-badge', text: row.form }),
        el('span', { className: 'hk-badge', text: row.state }),
      ]),
      el('div', {
        className: `hk-dungeon-party${row.overCap ? ' over' : ''}`,
        text: row.party,
      }),
    ];
    if (row.boss) parts.push(el('div', { className: 'hk-muted', text: row.boss }));
    if (row.leftItems) parts.push(el('div', { className: 'hk-muted', text: row.leftItems }));
    this.el.append(...parts);
  }
}
