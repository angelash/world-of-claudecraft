// Settings window: the large-model switch (AI residents and goddesses) with the proxy
// status, the degrade level and budget, and the energy-saving note; the display section
// picks the quality tier (art_pipeline.md 2.11) and the camera preset.

import { el, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import { QUALITY_IDS, type QualityId } from '../hd2d/quality';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

export function aiStatusText(s: ReturnType<WindowContext['settings']['ai']>): string {
  if (!s.enabled) return t('ui.set.llm.off');
  if (!s.available) return t('ui.set.llm.unavailable');
  const level = t(`ui.set.llm.level.${Math.max(0, Math.min(4, s.level))}`);
  const parts = [s.active ? t('ui.set.llm.on') : t('ui.set.llm.restart'), level];
  if (s.budgetCap)
    parts.push(
      t('ui.set.llm.budget', { used: (s.budgetUsed ?? 0).toFixed(2), cap: s.budgetCap.toFixed(2) }),
    );
  return parts.filter(Boolean).join('  ');
}

function displaySection(ctx: WindowContext): { el: HTMLElement; update(): void } {
  const select = el('select', { attrs: { id: 'hk-quality' } }) as HTMLSelectElement;
  for (const id of QUALITY_IDS) {
    const opt = el('option', {
      text: t(`ui.set.graphics.quality_name.${id}`),
      attrs: { value: id },
    });
    select.append(opt);
  }
  select.value = ctx.actions.display().quality;
  select.addEventListener('change', () => ctx.actions.setQuality(select.value as QualityId));
  const current = el('div', { className: 'hk-muted' });
  const street = el('button', { className: 'hk-btn', text: t('ui.set.graphics.view_street') });
  street.addEventListener('click', () => ctx.actions.setViewPreset('street'));
  const overview = el('button', { className: 'hk-btn', text: t('ui.set.graphics.view_overview') });
  overview.addEventListener('click', () => ctx.actions.setViewPreset('overview'));
  const root = el('div', {}, [
    el('h3', { text: t('ui.set.graphics.display') }),
    el('label', { className: 'hk-inv-row', attrs: { for: 'hk-quality' } }, [
      t('ui.set.graphics.quality'),
      select,
    ]),
    current,
    el('div', { className: 'hk-muted', text: t('ui.set.graphics.quality_hint') }),
    el('h3', { text: t('ui.set.graphics.view') }),
    el('div', { className: 'hk-inv-row' }, [street, overview]),
    el('div', { className: 'hk-muted', text: t('ui.set.graphics.view_hint') }),
  ]);
  return {
    el: root,
    update: () => {
      const d = ctx.actions.display();
      if (select.value !== d.quality && document.activeElement !== select) select.value = d.quality;
      const text = !d.webgl
        ? t('ui.set.graphics.no_webgl')
        : d.renderer === 'hd2d'
          ? t('ui.set.graphics.renderer_hd')
          : t('ui.set.graphics.renderer_flat');
      setText(current, text);
      street.toggleAttribute('disabled', d.renderer !== 'hd2d');
      overview.toggleAttribute('disabled', d.renderer !== 'hd2d');
    },
  };
}

export function settingsWindow(ctx: WindowContext): WindowContent {
  const display = displaySection(ctx);
  const box = el('input', { attrs: { type: 'checkbox', id: 'hk-ai-toggle' } });
  box.checked = ctx.settings.ai().enabled;
  box.addEventListener('change', () => ctx.settings.setAiEnabled(box.checked));
  const status = el('div', { className: 'hk-muted' });
  const root = el('div', { className: 'hk-settings' }, [
    el('h3', { text: t('ui.set.llm.title') }),
    el('label', { className: 'hk-inv-row', attrs: { for: 'hk-ai-toggle' } }, [
      box,
      t('ui.set.llm.enabled'),
    ]),
    status,
    el('div', { className: 'hk-muted', text: t('ui.set.llm.restart') }),
    el('div', { className: 'hk-muted', text: t('ui.set.llm.eco_hint') }),
    display.el,
  ]);
  return {
    el: root,
    update: () => {
      const s = ctx.settings.ai();
      if (box.checked !== s.enabled && document.activeElement !== box) box.checked = s.enabled;
      setText(status, t('ui.set.llm.status', { status: aiStatusText(s) }));
      display.update();
    },
  };
}
