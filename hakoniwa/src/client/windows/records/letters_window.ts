// Paints `ui_win_letters` (ux_and_onboarding.md 6.3.8): the letters received, on paper. Thin
// painter over ./letters_model.ts. Opening a letter marks it read; its attachments and the
// replies still open queue the records commands.

import { contentKey } from '../../../core/content_key';
import { el } from '../../../shared_ui/dom';
import { t, tOr } from '../../../shared_ui/i18n';
import { flagOn } from '../../view/game_view';
import { actionButton, badge, empty, rebuilder, tabs } from '../kit';
import { placeholderWindow } from '../simple_windows';
import type { WindowContext } from '../window_context';
import type { WindowContent } from '../window_manager';
import { type LetterRow, type LettersTab, lettersModel, MESSENGER_FLAG } from './letters_model';
import './records.css';

function itemName(ctx: WindowContext, id: string): string {
  const raw = ctx.view.itemDef(id)?.name ?? id;
  return tOr(contentKey('items', id, 'name'), raw);
}

export function lettersWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.letters;
  if (!ad) return placeholderWindow();
  const body = el('div');
  let openId: string | null = null;
  let force = 0;
  const sendingOpen = () => flagOn(ctx.view.flag(MESSENGER_FLAG));
  const strip = tabs<LettersTab>(
    [
      { id: 'inbox', label: t('ui.win.letters.tab.inbox') },
      { id: 'outbox', label: t('ui.win.letters.tab.outbox') },
    ],
    'inbox',
    () => {
      force++;
      update();
    },
  );
  const open = (r: LetterRow) => {
    openId = openId === r.id ? null : r.id;
    if (openId && r.unread) ctx.commands.queueAll(ad.read(ctx.view, r.id));
    force++;
    update();
  };
  const letterCard = (r: LetterRow): HTMLElement => {
    const shown = openId === r.id;
    return el('div', { className: `hk-card hk-letter${r.unread ? ' unread' : ''}` }, [
      el(
        'div',
        {
          className: 'hk-card-head hk-letter-head',
          on: { click: () => open(r) },
          attrs: { role: 'button', tabindex: '0' },
        },
        [
          el('strong', { text: r.subject }),
          el('span', { className: 'hk-row-inline' }, [
            badge(r.seal),
            r.unread ? badge(t('ui.win.letters.unread'), 'unread') : null,
          ]),
        ],
      ),
      el('div', {
        className: 'hk-muted',
        text: [t('ui.win.letters.from', { who: r.sender }), r.arrived, r.state]
          .filter(Boolean)
          .join('  '),
      }),
      shown
        ? el('div', { className: 'hk-letter-body' }, [
            ...r.body.map((p) => el('p', { className: 'hk-letter-para', text: p })),
            r.attachments.length
              ? el('div', { className: 'hk-row' }, [
                  el('span', { className: 'hk-muted', text: t('ui.win.letters.attachments') }),
                  ...r.attachments.map((a) => badge(a.label)),
                  r.canTake
                    ? actionButton(ctx, t('ui.win.letters.take'), () =>
                        ad.takeAttachment(ctx.view, r.id),
                      )
                    : null,
                ])
              : null,
            r.reply ? el('div', { className: 'hk-muted', text: r.reply }) : null,
            r.replies.length
              ? el('div', { className: 'hk-row' }, [
                  el('span', { className: 'hk-muted', text: t('ui.win.letters.reply') }),
                  ...r.replies.map((x) =>
                    actionButton(ctx, x.label, () => ad.reply(ctx.view, r.id, x.id)),
                  ),
                ])
              : null,
          ])
        : null,
    ]);
  };
  const update = rebuilder(
    body,
    () => ({
      force,
      openId,
      m: lettersModel({
        inbox: ad.inbox(ctx.view),
        tab: strip.current(),
        openId,
        sendingOpen: sendingOpen(),
        itemName: (id) => itemName(ctx, id),
      }),
    }),
    ({ m }) => {
      if (m.empty) {
        body.append(empty(m.empty));
        return;
      }
      for (const r of m.rows) body.append(letterCard(r));
    },
  );
  const root = el('div', { className: 'hk-letters hk-paper' }, [strip.strip, body]);
  return {
    el: root,
    update: () => {
      // the sending tab appears only once the messenger's door is open (1.6)
      strip.strip.hidden = !sendingOpen();
      update();
    },
  };
}
