// Implements `ui_set_language` (ux_and_onboarding.md 4.8): the interface language (1.0 ships
// Simplified Chinese only; Traditional Chinese and English join in 1.x) and the one line on
// the model's prompts. Thin painter over shell_model.ts.

import { el } from '../../../shared_ui/dom';
import { t } from '../../../shared_ui/i18n';
import type { Language } from '../../app/settings_schema';
import type { WindowContext } from '../window_context';
import type { SettingsPage } from './page';
import { SHIPPED_LANGUAGES } from './shell_model';

/** The name of each interface language, in its own words (text keys are lowercase). */
const LANGUAGE_NAMES = {
  'zh-Hans': 'ui.set.language.name.zh_hans',
  'zh-Hant': 'ui.set.language.name.zh_hant',
  en: 'ui.set.language.name.en',
} as const satisfies Record<Language, string>;

export function languagePage(ctx: WindowContext): SettingsPage {
  const select = el('select', { attrs: { id: 'hk-language' } });
  for (const lang of SHIPPED_LANGUAGES) {
    select.append(el('option', { text: t(LANGUAGE_NAMES[lang]), attrs: { value: lang } }));
  }
  select.addEventListener('change', () => {
    ctx.prefs.updateSync({ language: select.value as Language });
  });
  const root = el('div', { className: 'hk-set-language' }, [
    el('div', { className: 'hk-set-row' }, [
      el('label', { text: t('ui.set.language.label'), attrs: { for: 'hk-language' } }),
      select,
    ]),
    el('div', { className: 'hk-set-note', text: t('ui.set.language.model_note') }),
    el('div', { className: 'hk-set-note', text: t('ui.set.language.format_note') }),
  ]);
  return {
    el: root,
    update: () => {
      const lang = ctx.prefs.sync.language;
      // a language this build does not ship yet shows as the source language
      const shown = SHIPPED_LANGUAGES.includes(lang) ? lang : 'zh-Hans';
      if (select.value !== shown && document.activeElement !== select) select.value = shown;
    },
  };
}
