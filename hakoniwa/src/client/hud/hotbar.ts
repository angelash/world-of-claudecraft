// Hotbar, `ui_hud_hotbar` (ux_and_onboarding.md 5.2): 24 slots filled from the combat
// adapter's ability bar (name, cost, cooldown sweep and seconds, usability with the reason
// as tooltip), laid out by hotbar_model.ts as two keyboard rows of 12 or three gamepad groups
// of 8 with the held layer's group lit; every slot shows the glyph of its current binding.
// Writes are elided; the cooldown sweep is a CSS height.

import { el, setClass, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import { HOTBAR_SIZE } from '../input/contexts';
import type { HotbarSlotView } from '../view/adapters';
import type { HotbarLayout } from './hotbar_model';

interface SlotEls {
  root: HTMLElement;
  key: HTMLElement;
  name: HTMLElement;
  cd: HTMLElement;
  secs: HTMLElement;
  title: string;
  height: string;
}

interface RowEls {
  root: HTMLElement;
  label: HTMLElement;
  slots: number[];
}

export class Hotbar {
  readonly el: HTMLElement;
  private slots: SlotEls[] = [];
  private rows: RowEls[] = [];
  private shape = '';

  constructor(onPress: (slot: number) => void) {
    this.el = el('div', { className: 'hk-hotbar', attrs: { role: 'toolbar' } });
    for (let i = 1; i <= HOTBAR_SIZE; i++) {
      const key = el('span', { className: 'hk-slot-key' });
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
        [key, name, cd, secs],
      );
      // the onboarding outlines a slot by this name (src/client/tutorial/glow.ts)
      root.dataset.hud = `hotbar_${i}`;
      this.slots.push({ root, key, name, cd, secs, title: label, height: '0%' });
    }
  }

  /** Arrange the rows or groups when the device or their visibility changes. */
  private arrange(layout: HotbarLayout): void {
    const shape = `${layout.device}:${layout.rows.map((r) => (r.visible ? 1 : 0)).join('')}`;
    if (shape === this.shape) return;
    this.shape = shape;
    for (const r of this.rows) r.root.remove();
    this.rows = layout.rows.map((row) => {
      const label = el('span', { className: 'hk-hotbar-layer' });
      const root = el('div', { className: `hk-hotbar-row ${layout.device}` }, [
        layout.device === 'pad' ? label : null,
        ...row.slots.map((s) => (this.slots[s - 1] as SlotEls).root),
      ]);
      root.hidden = !row.visible;
      this.el.append(root);
      return { root, label, slots: row.slots };
    });
    setClass(this.el, 'pad', layout.device === 'pad');
  }

  update(views: readonly HotbarSlotView[], layout: HotbarLayout): void {
    this.arrange(layout);
    layout.rows.forEach((row, i) => {
      const r = this.rows[i];
      if (!r) return;
      setText(r.label, row.label);
      setClass(r.root, 'active', row.active);
    });
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i] as SlotEls;
      const v = views.find((x) => x.slot === i + 1);
      setText(s.key, layout.keys[i] ?? '');
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
