// Implements `ui_hud_tracker` (ux_and_onboarding.md 14.2): the tracked quests under the
// minimap and the door pinned in the corridor. A click opens the quest log, a right click
// stops tracking (the pinned door unpins). Hidden when nothing is tracked. Thin painter over
// ./tracker_model.ts; rebuilds only when the model changes.

import './hud_c.css';
import { clear, el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import type { TrackerModel } from './tracker_model';

export interface TrackerHandlers {
  open(questId: string): void;
  untrack(questId: string): void;
  openDoor(doorId: string): void;
  unpinDoor(): void;
}

export class Tracker {
  readonly el: HTMLElement;
  private sig = '';
  handlers: TrackerHandlers | null = null;

  constructor() {
    this.el = el('div', {
      className: 'hk-tracker',
      attrs: { role: 'list', 'aria-label': t('ui.hud.tracker.title') },
    });
    this.el.hidden = true;
  }

  update(m: TrackerModel | null): void {
    const sig = JSON.stringify(m);
    if (sig === this.sig) return;
    this.sig = sig;
    this.el.hidden = !m;
    clear(this.el);
    if (!m) return;
    const how = t('ui.hud.tracker.how');
    for (const e of m.entries) {
      const item = el(
        'div',
        { className: 'hk-tracker-entry', title: how, attrs: { role: 'listitem' } },
        [
          el('div', { className: 'hk-tracker-name', text: e.title }),
          ...e.lines.map((l) =>
            el('div', { className: `hk-tracker-line${l.done ? ' done' : ''}`, text: l.text }),
          ),
          e.deadline ? el('div', { className: 'hk-tracker-deadline', text: e.deadline }) : null,
        ],
      );
      item.addEventListener('click', () => this.handlers?.open(e.id));
      item.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        this.handlers?.untrack(e.id);
      });
      this.el.append(item);
    }
    const d = m.door;
    if (d) {
      const item = el(
        'div',
        { className: 'hk-tracker-entry hk-tracker-door', attrs: { role: 'listitem' } },
        [
          el('div', {
            className: 'hk-tracker-name',
            text: t('ui.hud.tracker.door', { name: d.title }),
          }),
          ...d.keys.map((k) => el('div', { className: 'hk-tracker-line', text: k })),
        ],
      );
      item.addEventListener('click', () => this.handlers?.openDoor(d.id));
      item.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        this.handlers?.unpinDoor();
      });
      this.el.append(item);
    }
  }
}
