// Implements `ui_set_graphics` as far as this build goes (ux_and_onboarding.md 4.2): the
// quality tier with the standing line that quality never hides what the player acts on, the
// renderer actually running, and the street and overview camera presets. Display mode,
// resolution, frame cap, interface scale and brightness join with the desktop shell's
// window settings. Thin painter; the session applies the changes.

import { el, setText } from '../../../shared_ui/dom';
import { t } from '../../../shared_ui/i18n';
import { QUALITY_IDS, type QualityId } from '../../hd2d/quality';
import type { WindowContext } from '../window_context';
import type { SettingsPage } from './page';

export function graphicsPage(ctx: WindowContext): SettingsPage {
  const select = el('select', { attrs: { id: 'hk-quality' } });
  for (const id of QUALITY_IDS) {
    select.append(
      el('option', { text: t(`ui.set.graphics.quality_name.${id}`), attrs: { value: id } }),
    );
  }
  select.value = ctx.actions.display().quality;
  select.addEventListener('change', () => ctx.actions.setQuality(select.value as QualityId));
  const current = el('div', { className: 'hk-set-note' });
  const street = el('button', {
    className: 'hk-btn',
    text: t('ui.set.graphics.view_street'),
    attrs: { type: 'button' },
    on: { click: () => ctx.actions.setViewPreset('street') },
  });
  const overview = el('button', {
    className: 'hk-btn',
    text: t('ui.set.graphics.view_overview'),
    attrs: { type: 'button' },
    on: { click: () => ctx.actions.setViewPreset('overview') },
  });
  const viewHint = el('div', { className: 'hk-set-note' });
  const root = el('div', { className: 'hk-set-graphics' }, [
    el('h3', { text: t('ui.set.graphics.display') }),
    el('div', { className: 'hk-set-row' }, [
      el('label', { text: t('ui.set.graphics.quality'), attrs: { for: 'hk-quality' } }),
      select,
    ]),
    current,
    el('div', { className: 'hk-set-note', text: t('ui.set.graphics.quality_hint') }),
    el('h3', { text: t('ui.set.graphics.view') }),
    el('div', { className: 'hk-set-row' }, [street, overview]),
    viewHint,
  ]);
  return {
    el: root,
    update: () => {
      const d = ctx.actions.display();
      if (select.value !== d.quality && document.activeElement !== select) select.value = d.quality;
      setText(
        current,
        !d.webgl
          ? t('ui.set.graphics.no_webgl')
          : d.renderer === 'hd2d'
            ? t('ui.set.graphics.renderer_hd')
            : t('ui.set.graphics.renderer_flat'),
      );
      street.toggleAttribute('disabled', d.renderer !== 'hd2d');
      overview.toggleAttribute('disabled', d.renderer !== 'hd2d');
      // the hint names the camera keys of the current device
      setText(viewHint, t('ui.set.graphics.view_hint'));
    },
  };
}

/** Restore the page's defaults: the automatic quality tier and the overview preset. */
export function resetGraphics(ctx: WindowContext): void {
  ctx.actions.setQuality('auto');
  if (ctx.actions.display().renderer === 'hd2d') ctx.actions.setViewPreset('overview');
}
