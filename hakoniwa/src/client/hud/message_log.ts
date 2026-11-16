// Message log panel: formatted event lines with a category class, capped length,
// auto-scroll unless the reader scrolled up.

import { el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import type { LogLine } from './log_format';

export const MAX_LOG_LINES = 200;

export class MessageLog {
  readonly el: HTMLElement;
  private list: HTMLElement;

  constructor() {
    this.list = el('div', {
      className: 'hk-log-list',
      attrs: { role: 'log', 'aria-live': 'polite' },
    });
    this.el = el('div', { className: 'hk-panel hk-log' }, [
      el('div', { className: 'hk-log-title', text: t('ui.hud.log.title') }),
      this.list,
    ]);
  }

  push(line: LogLine): void {
    const stick = this.list.scrollTop + this.list.clientHeight >= this.list.scrollHeight - 8;
    this.list.append(el('div', { className: `hk-log-line log-${line.category}`, text: line.text }));
    while (this.list.childElementCount > MAX_LOG_LINES) this.list.firstElementChild?.remove();
    if (stick) this.list.scrollTop = this.list.scrollHeight;
  }
}
