// Implements `ui_win_party` (ux_and_onboarding.md 6.2.7) with PK-M1-15's additions: the
// whole roster grouped by where each companion is, the stance of each companion walking
// along (and for everyone at once), wait here or come along, and the one-way ironman switch
// behind an irreversible confirm (11.4, 6.4). Thin painter over ./party_window_model.ts.

import { el } from '../../../shared_ui/dom';
import { t } from '../../../shared_ui/i18n';
import { askConfirm } from '../../hud/confirm_pop';
import { actionButton, empty, progress, rebuilder } from '../kit';
import { placeholderWindow } from '../simple_windows';
import type { WindowContext } from '../window_context';
import type { WindowContent } from '../window_manager';
import { partyWindowModel } from './party_window_model';

export function partyWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.partyRoster;
  if (!ad) return placeholderWindow();
  const root = el('div', { className: 'hk-party' });
  const update = rebuilder(
    root,
    () =>
      partyWindowModel({
        roster: ad.roster(ctx.view),
        ironman: ad.ironman(ctx.view),
        tick: ctx.view.tick,
      }),
    (m) => {
      if (m.ironman) {
        root.append(
          el('div', { className: 'hk-card hk-ironman' }, [
            el('div', { text: m.ironman.text }),
            m.ironman.canTurnOff
              ? el('button', {
                  className: 'hk-btn hk-btn-small',
                  text: t('ui.win.party.ironman_turn_off'),
                  attrs: { type: 'button' },
                  on: {
                    click: () => {
                      void askConfirm({
                        title: t('ui.win.party.ironman_turn_off'),
                        body: m.ironman?.confirm ?? '',
                        irreversible: true,
                      }).then((yes) => {
                        if (yes) ctx.commands.queueAll(ad.ironmanOff(ctx.view));
                      });
                    },
                  },
                })
              : null,
          ]),
        );
      }
      if (m.empty) {
        root.append(empty(t('ui.win.party.empty_state')));
        return;
      }
      if (m.allOrders.length) {
        root.append(
          el('div', { className: 'hk-row' }, [
            el('span', { className: 'hk-muted', text: t('ui.win.party.all') }),
            ...m.allOrders.map((o) =>
              actionButton(ctx, o.label, () => ad.order(ctx.view, undefined, o.order)),
            ),
          ]),
        );
      }
      for (const g of m.groups) {
        root.append(el('h3', { text: g.label }));
        for (const c of g.rows) {
          root.append(
            el('div', { className: `hk-card${c.downed ? ' downed' : ''}` }, [
              el('div', { className: 'hk-card-head' }, [
                el('strong', { text: c.name }),
                el('span', { className: 'hk-badge', text: c.state }),
              ]),
              c.sub ? el('div', { className: 'hk-muted', text: c.sub }) : null,
              c.hp ? progress(c.hp.value, c.hp.max, c.hp.text, 'hk-bar-hp') : null,
              el('div', {
                className: 'hk-muted',
                text: [c.bond, c.rest, c.downed ? t('ui.win.party.downed') : '']
                  .filter(Boolean)
                  .join('  '),
              }),
              c.gate ? el('div', { className: 'hk-muted', text: c.gate }) : null,
              c.orders.length
                ? el('div', { className: 'hk-row' }, [
                    el('span', { className: 'hk-muted', text: t('ui.win.party.orders') }),
                    ...c.orders.map((o) =>
                      actionButton(ctx, o.label, () => ad.order(ctx.view, c.id, o.order), {
                        cls: o.active ? 'active' : '',
                      }),
                    ),
                  ])
                : null,
              c.wait
                ? el('div', { className: 'hk-row' }, [
                    actionButton(ctx, c.wait.label, () =>
                      ad.wait(ctx.view, c.id, !(c.wait as { on: boolean }).on),
                    ),
                  ])
                : null,
            ]),
          );
        }
      }
    },
  );
  return { el: root, update };
}
