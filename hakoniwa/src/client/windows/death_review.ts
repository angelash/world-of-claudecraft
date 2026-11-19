import { TICKS_PER_GAME_MINUTE } from '../../core/time';
import { el } from '../../shared_ui/dom';
import { formatMoney, t } from '../../shared_ui/i18n';
import type { DeathReviewModel } from './death_review_model';
import { empty, kv } from './kit';

export function paintDeathReview(root: HTMLElement, m: DeathReviewModel, close: () => void): void {
  root.append(kv(t('ui.pop.death.destination'), m.destination));
  root.append(
    kv(
      t('ui.pop.death.elapsed'),
      t('ui.pop.death.duration', { n: m.elapsed / TICKS_PER_GAME_MINUTE }),
    ),
  );
  root.append(kv(t('ui.pop.death.money'), formatMoney(m.lostMoney)));
  root.append(kv(t('ui.pop.death.witnesses'), t('ui.pop.death.count', { n: m.witnesses })));
  if (m.items.length || m.lostMoney > 0) {
    root.append(el('h3', { text: t('ui.pop.death.left_at', { place: m.leftAt }) }));
    for (const item of m.items)
      root.append(el('div', { text: t('ui.pop.death.item', { name: item.name, n: item.count }) }));
  }
  root.append(el('h3', { text: t('ui.pop.death.last_hits') }));
  if (!m.damage.length) root.append(empty(t('ui.pop.death.no_hits')));
  for (const d of m.damage)
    root.append(
      el('div', { className: 'hk-death-hit' }, [
        el('span', { text: d.source }),
        el('span', { className: 'hk-muted', text: d.ability }),
        el('span', { text: t('ui.pop.death.damage', { n: d.amount }) }),
      ]),
    );
  root.append(
    el('p', {
      className: 'hk-muted',
      text: m.returned
        ? t('ui.pop.death.returned')
        : t('ui.pop.death.waiting', { n: m.remaining / TICKS_PER_GAME_MINUTE }),
    }),
  );
  root.append(
    el('button', {
      className: 'hk-btn hk-btn-primary',
      text: t(m.returned ? 'ui.pop.death.continue' : 'ui.pop.death.reforming'),
      attrs: { type: 'button', ...(m.returned ? {} : { disabled: '' }) },
      on: { click: close },
    }),
  );
}
