// Social windows: the rumor book and reputation, and the goddesses with the divine record and
// Merca's coin offering. The party window lives in ./field/party_window.ts (roster, ironman).

import { clear, el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import { coinCommand } from '../hud/coin_badge_model';
import { actionButton, badge, empty, rebuilder, tabs } from './kit';
import { placeholderWindow } from './simple_windows';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

export function rumorsWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.rumors;
  if (!ad) return placeholderWindow();
  const body = el('div');
  let force = 0;
  const tabStrip = tabs(
    [
      { id: 'book', label: t('ui.win.rumors.book') },
      { id: 'rep', label: t('ui.win.rumors.reputation') },
    ],
    'book',
    () => {
      force++;
      update();
    },
  );
  const update = rebuilder(
    body,
    () =>
      tabStrip.current() === 'book'
        ? { tab: 'book' as const, force, rumors: ad.rumors(ctx.view) }
        : { tab: 'rep' as const, force, rep: ad.reputation(ctx.view) },
    (d) => {
      if (d.tab === 'book') {
        const list = [...d.rumors].sort((a, b) => b.tick - a.tick);
        if (list.length === 0) body.append(empty(t('ui.win.rumors.empty_state')));
        for (const r of list) {
          body.append(
            el('div', { className: `hk-card${r.aboutPlayer ? ' about-you' : ''}` }, [
              el('div', { className: 'hk-card-text', text: r.text }),
              el('div', { className: 'hk-row-inline hk-muted' }, [
                t('ui.win.rumors.from', { name: r.fromName }),
                '  ',
                t('ui.win.rumors.credibility', { c: r.credibility }),
                r.aboutPlayer ? badge(t('ui.win.rumors.about_you'), 'you') : null,
              ]),
            ]),
          );
        }
        return;
      }
      for (const [title, list] of [
        [t('ui.win.rumors.regions'), d.rep.regions],
        [t('ui.win.rumors.factions'), d.rep.factions],
      ] as const) {
        body.append(el('h3', { text: title }));
        for (const r of list) {
          body.append(
            el('div', { className: 'hk-card' }, [
              el('div', { className: 'hk-card-head' }, [
                el('strong', { text: r.name }),
                badge(r.label),
              ]),
              el('div', {
                className: 'hk-muted',
                text: [
                  t('ui.win.rumors.fame', { band: r.fameBand }),
                  t('ui.win.rumors.opinion', { band: r.opinionBand }),
                  t('ui.win.rumors.estimate', { e: r.estimate }),
                ].join('  '),
              }),
              r.mainstream.length
                ? el(
                    'ul',
                    { className: 'hk-sayings' },
                    r.mainstream.slice(0, 3).map((s) => el('li', { text: s })),
                  )
                : null,
            ]),
          );
        }
      }
    },
  );
  return { el: el('div', { className: 'hk-rumors' }, [tabStrip.strip, body]), update };
}

export function goddessWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.goddess;
  if (!ad) return placeholderWindow();
  const list = el('div');
  const record = el('div');
  const offerBox = el('div', { className: 'hk-card hk-offer' });
  const select = el('select', {
    className: 'hk-input',
    attrs: { 'aria-label': t('ui.win.goddess.pick') },
  });
  let selectSig = '';
  const fillSelect = () => {
    const h = ctx.view.holding(ctx.view.playerId());
    const items = Object.entries(h.items).filter(([id, n]) => n > 0 && id !== 'merca_coin');
    const sig = JSON.stringify(items);
    if (sig === selectSig) return;
    selectSig = sig;
    const keep = select.value;
    clear(select);
    for (const [id, n] of items) {
      select.append(
        el('option', { text: `${ctx.view.itemDef(id)?.name ?? id} x${n}`, attrs: { value: id } }),
      );
    }
    if (items.some(([id]) => id === keep)) select.value = keep;
  };
  offerBox.append(
    el('div', { className: 'hk-card-head' }, [
      el('strong', { text: t('ui.win.goddess.offer_title') }),
    ]),
    el('div', { className: 'hk-row' }, [
      // the coin reaches her (goddess.coin): the badge shows, and it opens her account
      actionButton(ctx, t('ui.win.goddess.use_coin'), () => [coinCommand()]),
    ]),
    el('div', { className: 'hk-row' }, [
      select,
      actionButton(ctx, t('ui.win.goddess.blessing'), () =>
        select.value ? ad.offer(ctx.view, select.value, 'blessing') : [],
      ),
      actionButton(ctx, t('ui.win.goddess.intel'), () =>
        select.value ? ad.offer(ctx.view, select.value, 'intel') : [],
      ),
    ]),
  );
  const updateList = rebuilder(
    list,
    () => ad.goddesses(ctx.view),
    (gs) => {
      for (const g of gs) {
        list.append(
          el('div', { className: `hk-card goddess${g.departed ? ' departed' : ''}` }, [
            el('div', { className: 'hk-card-head' }, [
              el('strong', { text: g.honorific ?? g.name }),
              g.honorific ? null : el('span', { className: 'hk-muted', text: g.title }),
            ]),
            el('div', {
              className: 'hk-muted',
              text: [
                t('ui.win.goddess.gaze', { band: g.gazeBand }),
                t('ui.win.goddess.relation', { band: g.relationBand }),
                g.departed ? t('ui.win.goddess.departed') : '',
              ]
                .filter(Boolean)
                .join('  '),
            }),
            g.knownActions.length
              ? el(
                  'ul',
                  { className: 'hk-sayings' },
                  g.knownActions.slice(-3).map((a) => el('li', { text: a.note })),
                )
              : null,
          ]),
        );
      }
    },
  );
  const updateRecord = rebuilder(
    record,
    () => ({
      rev: ad.revelations(ctx.view),
      rec: ad
        .record(ctx.view)
        .filter((r) => r.public)
        .slice(-12),
    }),
    (d) => {
      record.append(el('h3', { text: t('ui.win.goddess.revelations') }));
      if (!d.rev.length) record.append(empty(t('ui.win.goddess.empty_state')));
      for (const r of d.rev)
        record.append(el('div', { className: 'hk-card hk-revelation', text: r.text }));
      record.append(el('h3', { text: t('ui.win.goddess.seen') }));
      if (!d.rec.length) record.append(empty(t('ui.win.goddess.empty_state')));
      for (const r of [...d.rec].reverse())
        record.append(el('div', { className: 'hk-card-text', text: r.note }));
    },
  );
  const root = el('div', { className: 'hk-goddess' }, [list, offerBox, record]);
  return {
    el: root,
    update: () => {
      updateList();
      const can = ad.canOffer(ctx.view);
      offerBox.hidden = !can;
      if (can) fillSelect();
      updateRecord();
    },
  };
}
