// Hotbar: nine slots on the number keys, filled from the combat adapter's ability bar:
// name, cost, cooldown sweep and seconds, usability with the reason as tooltip. Writes
// are elided; the cooldown sweep is a CSS height.

import { el, setClass, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import type { HotbarSlotView } from '../view/adapters';

interface SlotEls {
  root: HTMLElement;
  name: HTMLElement;
  cd: HTMLElement;
  secs: HTMLElement;
  title: string;
  height: string;
}

export class Hotbar {
  readonly el: HTMLElement;
  private slots: SlotEls[] = [];

  constructor(onPress: (slot: number) => void) {
    this.el = el('div', { className: 'hk-hotbar', attrs: { role: 'toolbar' } });
    for (let i = 1; i <= 9; i++) {
      const name = el('span', { className: 'hk-slot-name', text: t('ui.hud.hotbar.empty') });
      const cd = el('span', { className: 'hk-slot-cd' });
      const secs = el('span', { className: 'hk-slot-secs' });
      const label = t('ui.hud.hotbar.slot', { n: i });
      const root = el(
        'button',
        {
          className: 'hk-slot empty',
          title: label,
          attrs: { type: 'button', 'aria-label': label },
          on: { click: () => onPress(i) },
        },
        [el('span', { className: 'hk-slot-key', text: String(i) }), name, cd, secs],
      );
      this.slots.push({ root, name, cd, secs, title: label, height: '0%' });
      this.el.append(root);
    }
  }

  update(views: readonly HotbarSlotView[]): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i] as SlotEls;
      const v = views.find((x) => x.slot === i + 1);
      setText(s.name, v?.abilityId ? v.name : t('ui.hud.hotbar.empty'));
      setClass(s.root, 'empty', !v?.abilityId);
      setClass(s.root, 'unusable', !!v?.abilityId && !v.usable);
      const pct = v && v.cooldownTotal > 0 ? Math.min(1, v.cooldown / v.cooldownTotal) : 0;
      const h = `${(pct * 100).toFixed(0)}%`;
      if (h !== s.height) {
        s.height = h;
        s.cd.style.height = h;
      }
      setText(s.secs, v && v.cooldown >= 1 ? String(Math.ceil(v.cooldown)) : '');
      const title = v?.abilityId
        ? [v.name, v.cost, v.desc, v.usable ? '' : v.reason].filter(Boolean).join('\n')
        : t('ui.hud.hotbar.slot', { n: i + 1 });
      if (title !== s.title) {
        s.title = title;
        s.root.title = title;
      }
    }
  }

  flash(slot: number): void {
    const s = this.slots[slot - 1];
    if (!s) return;
    s.root.animate([{ filter: 'brightness(1.9)' }, { filter: 'none' }], { duration: 200 });
  }
}
