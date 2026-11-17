// Implements `ui_hud_gauges` (ux_and_onboarding.md 5.2): the thin door-cost and taint bars
// under the player frame. Thin painter over ./gauges_model.ts; rebuilds only when the bars
// change and writes nothing otherwise.

import './hud_c.css';
import { clear, el } from '../../shared_ui/dom';
import type { GaugeBar } from './gauges_model';

export class Gauges {
  readonly el: HTMLElement;
  private sig = '';

  constructor() {
    this.el = el('div', { className: 'hk-gauges' });
    this.el.hidden = true;
  }

  update(bars: readonly GaugeBar[]): void {
    const sig = JSON.stringify(bars);
    if (sig === this.sig) return;
    this.sig = sig;
    this.el.hidden = bars.length === 0;
    clear(this.el);
    for (const b of bars) {
      const fill = el('div', { className: 'hk-gauge-fill' });
      fill.style.width = `${b.pct.toFixed(1)}%`;
      const track = el('div', { className: 'hk-gauge-track' }, [
        fill,
        ...b.ticks.map((p) => {
          const tick = el('span', { className: 'hk-gauge-tick' });
          tick.style.left = `${p}%`;
          return tick;
        }),
      ]);
      this.el.append(
        el('div', { className: `hk-gauge hk-gauge-${b.id}`, title: b.title }, [
          el('span', { className: 'hk-gauge-label', text: b.label }),
          track,
          b.state ? el('span', { className: 'hk-gauge-state', text: b.state }) : null,
        ]),
      );
    }
  }
}
