// Radial menu painter, `ui_hud_wheel` (ux_and_onboarding.md 16.5): the open ring's sectors
// around a centre that names the ring; the highlighted sector grows and is outlined (text
// and outline, never colour alone). Thin DOM over input/radial.ts; repainted only when the
// ring state changes.

import { clear, el, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import { pageSectors, type RadialState } from '../input/radial';

/** Ring radius in CSS pixels (sector centres). */
const RADIUS = 120;

export class RadialMenu {
  readonly el: HTMLElement;
  private title = el('div', { className: 'hk-wheel-title' });
  private hint = el('div', { className: 'hk-wheel-hint' });
  private ring = el('div', { className: 'hk-wheel-ring' });
  private sig = '';

  constructor() {
    this.el = el('div', { className: 'hk-wheel', attrs: { role: 'menu' } }, [
      this.ring,
      el('div', { className: 'hk-wheel-center' }, [this.title, this.hint]),
    ]);
    this.el.hidden = true;
  }

  render(s: RadialState | null): void {
    if (!s) {
      this.el.hidden = true;
      this.sig = '';
      return;
    }
    const more = t('ui.hud.wheel.more');
    const sectors = pageSectors(s.sectors, s.page, more);
    const sig = `${s.ring}/${s.page}/${s.highlight}/${sectors.map((x) => x.id).join(',')}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.el.hidden = false;
    setText(this.title, t(`ui.hud.wheel.title.${s.ring}`));
    setText(this.hint, s.highlight === null ? t('ui.hud.wheel.cancel') : '');
    this.el.setAttribute('aria-label', t(`ui.hud.wheel.title.${s.ring}`));
    clear(this.ring);
    sectors.forEach((sector, i) => {
      // sector 0 straight up, then clockwise
      const a = (i / sectors.length) * Math.PI * 2;
      const x = Math.sin(a) * RADIUS;
      const y = -Math.cos(a) * RADIUS;
      const node = el('div', {
        className: `hk-wheel-sector${i === s.highlight ? ' on' : ''}${sector.disabled ? ' off' : ''}`,
        text: sector.label,
        attrs: { role: 'menuitem', 'aria-disabled': sector.disabled ? 'true' : 'false' },
      });
      node.style.transform = `translate(calc(${x.toFixed(1)}px - 50%), calc(${y.toFixed(1)}px - 50%))`;
      this.ring.append(node);
    });
  }
}
