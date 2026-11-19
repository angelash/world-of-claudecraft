// Small windows: `ui_win_saves` (ux_and_onboarding.md 6.2.13, the shared save list of
// ../hud/save_list.ts), `ui_win_menu` (6.2.14), and the placeholder shown by windows whose
// systems arrive in phase 2 (the help window is ./help_window.ts).

import { el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import { askConfirm } from '../hud/confirm_pop';
import { SaveList } from '../hud/save_list';
import { saveListModel } from '../hud/save_list_model';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

export function savesWindow(ctx: WindowContext): WindowContent {
  const list: SaveList = new SaveList({
    save: (slot) => {
      ctx.actions.saveTo(slot);
      list.invalidate();
    },
    load: (slot) => ctx.actions.loadFrom(slot),
    remove: (slot) => {
      const redraw = () => {
        list.invalidate();
        render();
      };
      ctx.saves.remove(slot).then(redraw, (err) => {
        console.warn('[saves] delete failed', err);
        redraw();
      });
    },
  });
  const render = () =>
    list.update(
      saveListModel({
        mode: 'game',
        list: ctx.saves.list(),
        problems: ctx.saves.problems(),
        block: ctx.actions.saveBlock(),
        run: { id: ctx.saves.runId, ironman: ctx.saves.ironman },
        manualLimit: ctx.saves.manualLimit,
      }),
    );
  const root = el('div', { className: 'hk-saves' }, [list.el]);
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
      void askConfirm({
        title: t('ui.win.menu.to_title'),
        // An ironman run saves on the way out (3.4.1); any other run loses unsaved progress.
        body: ctx.saves.ironman
          ? t('ui.win.menu.confirm_title_ironman')
          : t('ui.win.menu.confirm_title'),
      }).then((yes) => {
        if (yes) ctx.actions.toTitle();
      });
    }),
  ]);
  if (ctx.adapters.scene?.scene(ctx.view)?.restartable) {
    const restart = item(t('ui.mode.cutscene.restart'), () => {
      void askConfirm({
        title: t('ui.mode.cutscene.restart_title'),
        body: t('ui.mode.cutscene.restart_body'),
        irreversible: true,
      }).then((yes) => {
        // The command validates the current scene again if a queued transition won.
        if (!yes || !ctx.adapters.scene?.scene(ctx.view)?.restartable) return;
        ctx.commands.queue('scenes.restart', {});
        ctx.actions.closeWindow('menu');
      });
    });
    root.insertBefore(restart, root.lastElementChild);
  }
  return { el: root };
}

export function placeholderWindow(): WindowContent {
  return {
    el: el('p', { className: 'hk-muted hk-placeholder', text: t('ui.common.panel.pending') }),
  };
}
