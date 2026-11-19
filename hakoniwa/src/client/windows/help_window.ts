// Implements `ui_win_help`, the help window (ux_and_onboarding.md 6.2.15, 17.7): the controls
// lines name the current device's keys, so each refresh renders them again and the list is
// rebuilt only when a line changed (the device or a binding changed). Given the onboarding's
// source (PK-M1-23) it adds two pages: the guidance cards seen so far, by layer, and the
// glossary of unlocked terms (renamed with the reveal stage, D-030). Without a source it is
// the controls list alone, as before. Thin painter over ./help_model.ts.

import { clear, el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import { HELP_TABS, type HelpSource, type HelpTab, helpModel, helpPagesModel } from './help_model';
import { tabs } from './kit';
import type { WindowContent } from './window_manager';

function controlsList(): { el: HTMLElement; update(): void } {
  const root = el('ul', { className: 'hk-help' });
  let sig: string | null = null;
  const update = () => {
    const m = helpModel();
    if (m.sig === sig) return;
    sig = m.sig;
    clear(root);
    for (const line of m.lines) root.append(el('li', { text: line }));
  };
  update();
  return { el: root, update };
}

export function helpWindow(source?: HelpSource): WindowContent {
  const controls = controlsList();
  if (!source) return { el: controls.el, update: controls.update };

  const page = el('div', { className: 'hk-help-page' });
  let sig = '';
  const strip = tabs<HelpTab>(
    HELP_TABS.map((id) => ({ id, label: t(`ui.win.help.tab.${id}`) })),
    'controls',
    () => {
      sig = '';
      update();
    },
  );

  function paintPages(tab: HelpTab): void {
    const m = helpPagesModel(tab, source as HelpSource);
    if (m.sig === sig) return;
    sig = m.sig;
    clear(page);
    page.append(el('p', { className: 'hk-muted', text: m.progress }));
    if (tab === 'cards') {
      if (m.cards.length === 0)
        page.append(
          el('p', { className: 'hk-muted hk-empty', text: t('ui.win.help.cards_empty') }),
        );
      for (const g of m.cards) {
        page.append(el('h3', { text: g.label }));
        for (const c of g.cards) {
          page.append(
            el('div', { className: 'hk-card hk-help-card' }, [
              el('strong', { text: c.title }),
              ...c.paragraphs.map((p) => el('p', { className: 'hk-card-text', text: p })),
            ]),
          );
        }
      }
      return;
    }
    if (m.glossary.length === 0)
      page.append(
        el('p', { className: 'hk-muted hk-empty', text: t('ui.win.help.glossary_empty') }),
      );
    const list = el('dl', { className: 'hk-glossary' });
    for (const row of m.glossary) {
      list.append(el('dt', { text: row.name }), el('dd', { text: row.body }));
    }
    page.append(list);
  }

  function update(): void {
    const tab = strip.current();
    if (tab === 'controls') {
      if (page.firstChild !== controls.el) {
        clear(page);
        page.append(controls.el);
        sig = '';
      }
      controls.update();
      return;
    }
    paintPages(tab);
  }

  update();
  return { el: el('div', { className: 'hk-help-window' }, [strip.strip, page]), update };
}
