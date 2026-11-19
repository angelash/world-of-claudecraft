// The inner-court page shares the territory window, including its empty settlement state.
// Storage and display buttons send the owning system's commands, never move inventory here.

import { el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import {
  courtDisplayCommand,
  courtMoveCommand,
  courtPanelData,
  courtStorageCommand,
  courtTakeCommand,
} from '../adapters/interface_closure';
import { actionButton, empty, kv, rebuilder } from './kit';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

export function courtPanel(ctx: WindowContext): WindowContent {
  const root = el('section', { className: 'hk-court-panel', dataset: { hud: 'court_panel' } });
  const update = rebuilder(
    root,
    () => courtPanelData(ctx.view),
    (m) => {
      root.hidden = !m;
      if (!m) return;
      root.append(el('h3', { text: t('ui.win.territory.court.title') }));
      const reason =
        m.cooldown > 0
          ? t('ui.win.territory.court.cooldown', { t: m.cooldown })
          : t('ui.win.territory.court.near_door');
      root.append(
        actionButton(
          ctx,
          t(m.inside ? 'ui.win.territory.leave_court' : 'ui.win.territory.enter_court'),
          () => courtMoveCommand(m.inside),
          { disabled: !m.inside && !m.enterable, title: m.inside || m.enterable ? '' : reason },
        ),
      );
      if (!m.inside && !m.enterable) root.append(empty(reason));
      root.append(
        kv(t('ui.win.territory.court.storage'), t('ui.win.territory.court.capacity', m.storage)),
      );
      if (!m.inside) return;
      const room = m.cases.find((c) => c.used < c.slots);
      for (const item of m.pack) {
        root.append(
          el('div', { className: 'hk-row' }, [
            el('span', {
              text: t('ui.win.territory.court.item_count', { name: item.name, n: item.count }),
            }),
            actionButton(ctx, t('ui.win.territory.court.deposit'), () =>
              courtStorageCommand(m.siteId, item.id, 'deposit'),
            ),
            actionButton(
              ctx,
              t('ui.win.territory.court.display'),
              () => (room ? courtDisplayCommand(item.id, room.id) : []),
              {
                disabled: !room,
                title: room ? '' : t('ui.win.territory.court.display_full'),
              },
            ),
          ]),
        );
      }
      root.append(el('h4', { text: t('ui.win.territory.court.stored') }));
      if (!m.stock.length) root.append(empty(t('ui.win.territory.court.storage_empty')));
      for (const item of m.stock)
        root.append(
          el('div', { className: 'hk-row' }, [
            el('span', {
              text: t('ui.win.territory.court.item_count', { name: item.name, n: item.count }),
            }),
            actionButton(ctx, t('ui.win.territory.court.withdraw'), () =>
              courtStorageCommand(m.siteId, item.id, 'withdraw'),
            ),
          ]),
        );
      root.append(el('h4', { text: t('ui.win.territory.court.display_title') }));
      for (const [i, c] of m.cases.entries()) {
        root.append(
          kv(
            t('ui.win.territory.court.case', { n: i + 1 }),
            t('ui.win.territory.court.capacity', { used: c.used, cap: c.slots }),
          ),
        );
        for (const piece of m.entries.filter((e) => e.caseId === c.id))
          root.append(
            el('div', { className: 'hk-row' }, [
              el('span', { text: piece.name }),
              piece.remaining === null
                ? actionButton(ctx, t('ui.win.territory.court.take_down'), () =>
                    courtTakeCommand(piece.id),
                  )
                : el('span', {
                    className: 'hk-muted',
                    text: t('ui.win.territory.court.take_pending', { t: piece.remaining }),
                  }),
            ]),
          );
      }
      root.append(el('p', { className: 'hk-muted', text: t('ui.win.territory.court.take_note') }));
    },
  );
  return { el: root, update };
}
