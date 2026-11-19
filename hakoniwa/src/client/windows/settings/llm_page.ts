// The model page of the settings shell (`ui_set_llm`, ux_and_onboarding.md 4.6) as this build
// has it: the large-model switch with the proxy status, the degrade level and budget, and the
// energy-saving note. PK-M1-02 replaces it with screens A to J (src/client/windows/llm/).

import { el, setText } from '../../../shared_ui/dom';
import { t } from '../../../shared_ui/i18n';
import type { WindowContext } from '../window_context';
import type { SettingsPage } from './page';

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

export function llmPage(ctx: WindowContext): SettingsPage {
  const box = el('input', { attrs: { type: 'checkbox', id: 'hk-ai-toggle' } });
  box.checked = ctx.settings.ai().enabled;
  box.addEventListener('change', () => ctx.settings.setAiEnabled(box.checked));
  const status = el('div', { className: 'hk-set-note' });
  const root = el('div', { className: 'hk-set-llm' }, [
    el('h3', { text: t('ui.set.llm.title') }),
    el('div', { className: 'hk-set-row' }, [
      box,
      el('label', { text: t('ui.set.llm.enabled'), attrs: { for: 'hk-ai-toggle' } }),
    ]),
    status,
    el('div', { className: 'hk-set-note', text: t('ui.set.llm.restart') }),
    el('div', { className: 'hk-set-note', text: t('ui.set.llm.eco_hint') }),
    ctx.openModelSettings
      ? el('button', {
          className: 'hk-btn',
          text: t('ui.llm.config.manage'),
          attrs: { type: 'button' },
          on: { click: () => ctx.openModelSettings?.() },
        })
      : null,
  ]);
  return {
    el: root,
    update: () => {
      const s = ctx.settings.ai();
      if (box.checked !== s.enabled && document.activeElement !== box) box.checked = s.enabled;
      setText(status, t('ui.set.llm.status', { status: aiStatusText(s) }));
    },
  };
}
