// Implements `ui_win_board`, the commission board (ux_and_onboarding.md 6.3.7). It is not on
// the menu bar: the player opens it standing at a board. Thin painter over ./board_model.ts;
// the rule rows (rank, pay, cut, deadline) and the client's claims are drawn apart (UX-4).
// Abandoning asks first (it costs the default penalty).

import { calendarAt } from '../../../core/time';
import { el } from '../../../shared_ui/dom';
import { t, tOr } from '../../../shared_ui/i18n';
import { askConfirm } from '../../hud/confirm_pop';
import { actionButton, empty, rebuilder } from '../kit';
import { placeholderWindow } from '../simple_windows';
import type { WindowContext } from '../window_context';
import type { WindowContent } from '../window_manager';
import { boardModel, type PostingRow } from './board_model';

function personName(id: string): string {
  return tOr(`c.npcs.${id}.name`, tOr(`c.companions.${id}.name`, id));
}

/** Days left to a deadline (a calendar day index), counted from today. */
function daysLeft(deadline: number, tick: number): number {
  return Math.max(0, deadline - calendarAt(tick).dayIndex);
}

export function boardWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.board;
  if (!ad) return placeholderWindow();
  const root = el('div', { className: 'hk-board' });

  const posting = (p: PostingRow, held: boolean): HTMLElement =>
    el('div', { className: `hk-card hk-posting${p.urgent || p.emergency ? ' urgent' : ''}` }, [
      el('div', { className: 'hk-card-head' }, [
        el('strong', { text: p.title }),
        el('span', { className: 'hk-badge', text: p.rank }),
        p.emergency
          ? el('span', { className: 'hk-badge hk-urgent', text: t('ui.win.board.emergency') })
          : p.urgent
            ? el('span', { className: 'hk-badge hk-urgent', text: t('ui.win.board.urgent') })
            : null,
      ]),
      // the rule row: what the guild guarantees
      el('div', { className: 'hk-posting-rule' }, [
        el('div', { className: 'hk-muted', text: t('ui.win.board.rule_label') }),
        el('div', { text: p.giver }),
        el('div', { text: p.place }),
        el('div', { text: p.reward }),
        p.cut ? el('div', { className: 'hk-muted', text: p.cut }) : null,
        el('div', { text: p.deadline }),
        p.needs ? el('div', { className: 'hk-muted', text: p.needs }) : null,
      ]),
      // the client's own words, kept apart and labelled
      p.claims.length
        ? el(
            'ul',
            { className: 'hk-posting-claims hk-sayings' },
            p.claims.map((c) => el('li', { text: c })),
          )
        : null,
      el('div', { className: 'hk-row' }, [
        held
          ? actionButton(ctx, t('ui.win.board.turn_in'), () => ad.turnIn(ctx.view, p.id), {
              disabled: !p.canTurnIn,
              title: p.reason,
            })
          : actionButton(ctx, t('ui.win.board.accept'), () => ad.accept(ctx.view, p.id), {
              disabled: !p.canAccept,
              title: p.reason,
            }),
        held
          ? el('button', {
              className: 'hk-btn hk-btn-small',
              text: t('ui.win.board.abandon'),
              attrs: { type: 'button' },
              on: {
                click: () => {
                  void askConfirm({
                    title: t('ui.win.board.abandon'),
                    body: t('ui.win.board.abandon_body', { title: p.title }),
                  }).then((yes) => {
                    if (yes) ctx.commands.queueAll(ad.abandon(ctx.view, p.id));
                  });
                },
              },
            })
          : null,
        p.reason ? el('span', { className: 'hk-muted', text: p.reason }) : null,
      ]),
    ]);

  const update = rebuilder(
    root,
    () => {
      const id = ad.boardHere(ctx.view);
      const v = id ? ad.board(ctx.view, id) : null;
      return v
        ? boardModel({
            view: v,
            giverName: personName,
            daysLeft: (d) => daysLeft(d, ctx.view.tick),
            ready: (id) => ad.ready(ctx.view, id),
          })
        : null;
    },
    (m) => {
      if (!m) {
        root.append(empty(t('ui.win.board.not_here')));
        return;
      }
      root.append(
        el('h3', { text: m.title }),
        el('div', { className: 'hk-board-rank' }, [
          el('strong', { text: m.rank }),
          el('span', { className: 'hk-muted', text: m.heldCount }),
        ]),
      );
      if (m.progress.length) {
        root.append(
          el('div', { className: 'hk-muted', text: t('ui.win.board.progress_title') }),
          el(
            'ul',
            { className: 'hk-board-progress' },
            m.progress.map((n) =>
              el('li', { className: n.met ? 'met' : '' }, [
                el('span', { text: t(n.met ? 'ui.win.board.met' : 'ui.win.board.unmet') }),
                ' ',
                n.label,
              ]),
            ),
          ),
        );
      }
      root.append(el('h3', { text: t('ui.win.board.postings') }));
      if (m.empty) root.append(empty(t('ui.win.board.empty_state')));
      for (const p of m.postings) root.append(posting(p, false));
      if (m.accepted.length) {
        root.append(el('h3', { text: t('ui.win.board.accepted') }));
        for (const p of m.accepted) root.append(posting(p, true));
      }
    },
  );
  return { el: root, update };
}
