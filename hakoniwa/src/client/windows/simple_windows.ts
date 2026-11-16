// Small windows: save slots, the Esc menu, controls help, and the placeholder shown by
// windows whose systems arrive in phase 2.

import { clear, el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import { LOAD_SLOTS, SLOT_IDS, type SlotId, slotLabel } from '../hud/save_slots';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

export function savesWindow(ctx: WindowContext): WindowContent {
  const root = el('div', { className: 'hk-saves' });
  let sig = '';
  const render = () => {
    const list = ctx.saves.list();
    const next = JSON.stringify(list);
    if (next === sig) return;
    sig = next;
    clear(root);
    for (const slot of LOAD_SLOTS) {
      const meta = list[slot as SlotId];
      // Autosave slots are written by the game only; they appear once they hold a save.
      const writable = SLOT_IDS.includes(slot);
      if (!writable && !meta) continue;
      const btn = (text: string, onClick: () => void, disabled = false) =>
        el('button', {
          className: 'hk-btn hk-btn-small',
          text,
          attrs: disabled ? { type: 'button', disabled: '' } : { type: 'button' },
          on: { click: onClick },
        });
      root.append(
        el('div', { className: 'hk-save-row' }, [
          el('div', { className: 'hk-save-info' }, [
            el('strong', { text: slotLabel(slot) }),
            el('span', {
              className: 'hk-muted',
              text: meta
                ? t('ui.win.saves.meta', { date: meta.date, map: meta.mapName })
                : t('ui.win.saves.empty'),
            }),
          ]),
          btn(
            t('ui.win.saves.save'),
            () => {
              if (meta && !window.confirm(t('ui.win.saves.confirm_overwrite'))) return;
              ctx.actions.saveTo(slot);
              sig = '';
              render();
            },
            !writable,
          ),
          btn(
            t('ui.win.saves.load'),
            () => {
              if (!window.confirm(t('ui.win.saves.confirm_load'))) return;
              ctx.actions.loadFrom(slot);
            },
            !meta,
          ),
          btn(
            t('ui.win.saves.remove'),
            () => {
              if (!window.confirm(t('ui.win.saves.confirm_remove'))) return;
              const redraw = () => {
                sig = '';
                render();
              };
              ctx.saves.remove(slot).then(redraw, (err) => {
                console.warn('[saves] delete failed', err);
                redraw();
              });
            },
            !meta,
          ),
        ]),
      );
    }
  };
  return { el: root, update: render };
}

export function menuWindow(ctx: WindowContext): WindowContent {
  const item = (text: string, onClick: () => void) =>
    el('button', {
      className: 'hk-btn hk-btn-wide',
      text,
      attrs: { type: 'button' },
      on: { click: onClick },
    });
  const root = el('div', { className: 'hk-menu' }, [
    item(t('ui.win.menu.resume'), () => ctx.actions.closeWindow('menu')),
    item(t('ui.win.menu.open_saves'), () => {
      ctx.actions.closeWindow('menu');
      ctx.actions.openWindow('saves');
    }),
    item(t('ui.win.menu.open_settings'), () => {
      ctx.actions.closeWindow('menu');
      ctx.actions.openWindow('settings');
    }),
    item(t('ui.win.menu.open_help'), () => {
      ctx.actions.closeWindow('menu');
      ctx.actions.openWindow('help');
    }),
    item(t('ui.win.menu.to_title'), () => {
      if (window.confirm(t('ui.win.menu.confirm_title'))) ctx.actions.toTitle();
    }),
  ]);
  return { el: root };
}

/** The help lines in order (ux_and_onboarding.md 17.7 replaces them with bound keys, PK-M1-07). */
const HELP_LINES = Array.from({ length: 16 }, (_, i) => `ui.win.help.line.${i}` as const);

export function helpWindow(): WindowContent {
  return {
    el: el(
      'ul',
      { className: 'hk-help' },
      HELP_LINES.map((k) => el('li', { text: t(k) })),
    ),
  };
}

export function placeholderWindow(): WindowContent {
  return {
    el: el('p', { className: 'hk-muted hk-placeholder', text: t('ui.common.panel.pending') }),
  };
}
