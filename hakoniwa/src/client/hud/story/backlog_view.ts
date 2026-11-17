// Painter of the backlog overlay (回看) of `ui_mode_dialogue` and `ui_mode_cutscene`
// (ux_and_onboarding.md 7.3, 8.2): the run's history, scrolled to the end when it opens.
// Read-only: entries cannot be chosen again. Rebuilds only when the entries change.

import { el, setText } from '../../../shared_ui/dom';
import type { BacklogModel } from './story_controller';

export class BacklogView {
  readonly el: HTMLElement;
  private title = el('div', { className: 'hk-backlog-title' });
  private list = el('div', { className: 'hk-backlog-list' });
  private hint = el('div', { className: 'hk-backlog-hint' });
  private sig = '';
  private readonly closeBtn: HTMLButtonElement;

  constructor(onClose: () => void) {
    const close = el('button', {
      className: 'hk-btn hk-btn-small hk-backlog-close',
      attrs: { type: 'button' },
      on: { click: () => onClose() },
    });
    this.closeBtn = close;
    this.el = el('div', { className: 'hk-backlog', attrs: { role: 'log' } }, [
      el('div', { className: 'hk-backlog-head' }, [this.title, close]),
      this.list,
      this.hint,
    ]);
    this.el.hidden = true;
  }

  render(m: BacklogModel | null, closeLabel: string): void {
    if (!m) {
      if (!this.el.hidden) this.el.hidden = true;
      this.sig = '';
      return;
    }
    const opening = this.el.hidden;
    this.el.hidden = false;
    setText(this.title, m.title);
    setText(this.hint, m.hint);
    setText(this.closeBtn, closeLabel);
    const sig = JSON.stringify(m.entries);
    if (sig === this.sig && !opening) return;
    this.sig = sig;
    this.list.replaceChildren(
      ...m.entries.map((e) =>
        el('div', { className: `hk-backlog-entry kind-${e.kind} line-${e.lineKind}` }, [
          e.speaker ? el('span', { className: 'hk-backlog-who', text: e.speaker }) : null,
          el('span', { className: 'hk-backlog-text', text: e.text }),
        ]),
      ),
    );
    this.list.scrollTop = this.list.scrollHeight;
  }
}
