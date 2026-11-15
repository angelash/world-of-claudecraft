// Small windows: save slots, the Esc menu, controls help, and the placeholder shown by
// windows whose systems arrive in phase 2.

import { clear, el } from '../../shared_ui/dom';
import { fmt, T } from '../../shared_ui/text';
import { SLOT_IDS, type SlotId, slotLabel } from '../hud/save_slots';
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
    for (const slot of SLOT_IDS) {
      const meta = list[slot as SlotId];
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
                ? fmt(T.saves.meta, { date: meta.date, map: meta.mapName })
                : T.saves.empty,
            }),
          ]),
          btn(T.saves.save, () => {
            if (meta && !window.confirm(T.saves.confirmOverwrite)) return;
            ctx.actions.saveTo(slot);
            sig = '';
            render();
          }),
          btn(
            T.saves.load,
            () => {
              if (!window.confirm(T.saves.confirmLoad)) return;
              ctx.actions.loadFrom(slot);
            },
            !meta,
          ),
          btn(
            T.saves.remove,
            () => {
              if (!window.confirm(T.saves.confirmRemove)) return;
              ctx.saves.remove(slot);
              sig = '';
              render();
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
    item(T.menu.resume, () => ctx.actions.closeWindow('menu')),
    item(T.menu.saves, () => {
      ctx.actions.closeWindow('menu');
      ctx.actions.openWindow('saves');
    }),
    item(T.menu.settings, () => {
      ctx.actions.closeWindow('menu');
      ctx.actions.openWindow('settings');
    }),
    item(T.menu.help, () => {
      ctx.actions.closeWindow('menu');
      ctx.actions.openWindow('help');
    }),
    item(T.menu.toTitle, () => {
      if (window.confirm(T.menu.confirmTitle)) ctx.actions.toTitle();
    }),
  ]);
  return { el: root };
}

export function helpWindow(): WindowContent {
  return {
    el: el(
      'ul',
      { className: 'hk-help' },
      T.help.lines.map((l) => el('li', { text: l })),
    ),
  };
}

export function placeholderWindow(): WindowContent {
  return { el: el('p', { className: 'hk-muted hk-placeholder', text: T.windows.pendingPhase2 }) };
}
