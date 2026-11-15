// Full-screen announcement banner: the Maker's revelations (colourless, glyphs turning
// into readable text), act titles, opened doors and battle results. Shown for a few
// seconds or until clicked; timing is driven by the session's HUD refresh.

import { el, setText } from '../../shared_ui/dom';
import type { BannerView } from '../view/adapters';

const SHOW_MS: Record<BannerView['kind'], number> = {
  maker: 8000,
  act: 4500,
  door: 3500,
  battle: 4000,
};

export class Banner {
  readonly el: HTMLElement;
  private title = el('div', { className: 'hk-bn-title' });
  private text = el('div', { className: 'hk-bn-text' });
  private until = 0;
  private queue: BannerView[] = [];

  constructor() {
    this.el = el(
      'div',
      { className: 'hk-bn', attrs: { role: 'status', 'aria-live': 'assertive' } },
      [this.title, this.text],
    );
    this.el.hidden = true;
    this.el.addEventListener('click', () => {
      this.until = 0;
    });
  }

  show(b: BannerView): void {
    this.queue.push(b);
  }

  update(nowMs: number): void {
    if (!this.el.hidden && nowMs < this.until) return;
    const next = this.queue.shift();
    if (!next) {
      this.el.hidden = true;
      return;
    }
    this.el.className = `hk-bn kind-${next.kind}`;
    setText(this.title, next.title);
    setText(this.text, next.text);
    this.text.hidden = !next.text;
    this.el.hidden = false;
    this.until = nowMs + SHOW_MS[next.kind];
  }
}

export class WarPrompt {
  readonly el: HTMLElement;
  private label = el('span');
  private sig = '';

  constructor(buttonText: string, onGo: () => void) {
    this.el = el('div', { className: 'hk-warprompt' }, [
      this.label,
      el('button', {
        className: 'hk-btn hk-btn-small hk-btn-primary',
        text: buttonText,
        attrs: { type: 'button' },
        on: { click: onGo },
      }),
    ]);
    this.el.hidden = true;
  }

  update(text: string | null): void {
    const sig = text ?? '';
    if (sig === this.sig) return;
    this.sig = sig;
    this.el.hidden = !text;
    setText(this.label, text ?? '');
  }
}
