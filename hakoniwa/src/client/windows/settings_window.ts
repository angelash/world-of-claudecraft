// Implements `ui_win_settings`, which opens the settings shell `ui_scr_settings`
// (ux_and_onboarding.md 4.1, 6.2.17): the pages this build paints as vertical tabs on the left
// (window tab keys and the pad's LB and RB step through them), the page on the right, and
// "restore this page's defaults" at the bottom. Pages: `ui_set_graphics`, `ui_set_audio`
// (PK-M1-06), `ui_set_controls`, `ui_set_gameplay` (first part), `ui_set_llm` (the model switch
// until PK-M1-02) and `ui_set_language`; accessibility and data join with their packages
// (shell_model.ts PAGE_OWNERS). A page is built when first shown and kept. Thin painter over
// ./settings/shell_model.ts.

import './settings/settings.css';
import { el, setClass, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import { askConfirm } from '../hud/confirm_pop';
import { audioPage } from './settings/audio_page';
import { controlsPage } from './settings/controls_page';
import { gameplayPage } from './settings/gameplay_page';
import { graphicsPage, resetGraphics } from './settings/graphics_page';
import { languagePage } from './settings/language_page';
import { llmPage } from './settings/llm_page';
import type { SettingsPage, SettingsPageFactory } from './settings/page';
import {
  hasPageDefaults,
  initialPage,
  pageDefaultsPatch,
  type SettingsPageId,
  settingsTabs,
} from './settings/shell_model';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

/** The page painters of this build (a page without one is not shown, 1.6). */
const PAINTERS: Partial<Record<SettingsPageId, SettingsPageFactory>> = {
  graphics: graphicsPage,
  audio: audioPage,
  controls: controlsPage,
  gameplay: gameplayPage,
  llm: llmPage,
  language: languagePage,
};

/** The page the next settings window opens on (the last one shown). */
let lastPage: SettingsPageId | null = null;

export function settingsWindow(ctx: WindowContext): WindowContent {
  const tabs = settingsTabs(new Set(Object.keys(PAINTERS) as SettingsPageId[]));
  let current = initialPage(tabs, lastPage) as SettingsPageId;
  const built = new Map<SettingsPageId, SettingsPage>();
  let error = '';

  const pageHost = el('div', { className: 'hk-set-page', attrs: { role: 'tabpanel' } });
  const status = el('div', { className: 'hk-set-status' });
  const reset = el('button', {
    className: 'hk-btn hk-btn-small',
    text: t('ui.scr.settings.reset_page'),
    attrs: { type: 'button' },
    on: { click: () => void resetPage() },
  });
  const tabButtons = tabs.map((tab) =>
    el('button', {
      className: 'hk-set-tab',
      text: t(tab.labelKey),
      dataset: { page: tab.id },
      attrs: { type: 'button', role: 'tab', 'aria-selected': String(tab.id === current) },
      on: { click: () => show(tab.id) },
    }),
  );
  const root = el('div', { className: 'hk-set-shell' }, [
    el(
      'nav',
      {
        className: 'hk-set-tabs',
        attrs: { role: 'tablist', 'aria-orientation': 'vertical' },
      },
      tabButtons,
    ),
    el('div', { className: 'hk-set-main' }, [
      pageHost,
      el('div', { className: 'hk-set-foot' }, [status, reset]),
    ]),
  ]);

  function page(id: SettingsPageId): SettingsPage {
    let p = built.get(id);
    if (!p) {
      p = (PAINTERS[id] as SettingsPageFactory)(ctx);
      built.set(id, p);
    }
    return p;
  }

  function show(id: SettingsPageId): void {
    current = id;
    lastPage = id;
    error = '';
    for (const b of tabButtons) b.setAttribute('aria-selected', String(b.dataset.page === id));
    const p = page(id);
    pageHost.replaceChildren(p.el);
    p.update();
    update();
  }

  async function resetPage(): Promise<void> {
    const id = current;
    const label = t(`ui.set.${id}.tab`);
    const yes = await askConfirm({
      title: t('ui.scr.settings.reset_page'),
      body: t('ui.scr.settings.reset_body', { page: label }),
    });
    if (!yes) return;
    if (id === 'graphics') resetGraphics(ctx);
    else {
      const patch = pageDefaultsPatch(id, ctx.prefs.sync);
      if (patch && !ctx.prefs.updateSync(patch)) {
        error = t('ui.win.settings.error_state', { reason: t('ui.scr.settings.invalid') });
      }
    }
    // a page keeps its own state (recording, pickers): build it again from the stored values
    built.get(id)?.dispose?.();
    built.delete(id);
    show(id);
  }

  function update(): void {
    built.get(current)?.update();
    reset.hidden = !hasPageDefaults(current);
    const note = error || (ctx.prefs.readOnly('sync') ? t('ui.scr.settings.newer_version') : '');
    setText(status, note);
    setClass(status, 'error', !!error);
  }

  show(current);
  return {
    el: root,
    update,
    dispose: () => {
      for (const p of built.values()) p.dispose?.();
      built.clear();
    },
  };
}
