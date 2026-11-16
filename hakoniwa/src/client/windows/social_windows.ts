// Social windows: the rumor book and reputation, the party, and the goddesses with the
// divine record and Merca's coin offering.

import { clear, el } from '../../shared_ui/dom';
import { t as renderText } from '../../shared_ui/i18n';
import { fmt, T } from '../../shared_ui/text';
import { orderName, type PartyOrder } from '../../systems/party';
import { actionButton, badge, empty, progress, rebuilder, tabs } from './kit';
import { placeholderWindow } from './simple_windows';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

export function rumorsWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.rumors;
  if (!ad) return placeholderWindow();
  const body = el('div');
  let force = 0;
  const t = tabs(
    [
      { id: 'book', label: T.rumors.book },
      { id: 'rep', label: T.rumors.reputation },
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
      t.current() === 'book'
        ? { tab: 'book' as const, force, rumors: ad.rumors(ctx.view) }
        : { tab: 'rep' as const, force, rep: ad.reputation(ctx.view) },
    (d) => {
      if (d.tab === 'book') {
        const list = [...d.rumors].sort((a, b) => b.tick - a.tick);
        if (list.length === 0) body.append(empty(T.rumors.none));
        for (const r of list) {
          body.append(
            el('div', { className: `hk-card${r.aboutPlayer ? ' about-you' : ''}` }, [
              el('div', { className: 'hk-card-text', text: r.text }),
              el('div', { className: 'hk-row-inline hk-muted' }, [
                fmt(T.rumors.from, { name: r.fromName }),
                '  ',
                fmt(T.rumors.credibility, { c: r.credibility }),
                r.aboutPlayer ? badge(T.rumors.aboutYou, 'you') : null,
              ]),
            ]),
          );
        }
        return;
      }
      for (const [title, list] of [
        [T.rumors.regions, d.rep.regions],
        [T.rumors.factions, d.rep.factions],
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
                  fmt(T.rumors.fame, { band: r.fameBand }),
                  fmt(T.rumors.opinion, { band: r.opinionBand }),
                  fmt(T.rumors.estimate, { e: r.estimate }),
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
  return { el: el('div', { className: 'hk-rumors' }, [t.strip, body]), update };
}

const ORDERS: PartyOrder[] = ['follow', 'assist', 'passive', 'stay'];

export function partyWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.party;
  if (!ad) return placeholderWindow();
  const root = el('div', { className: 'hk-party' });
  const update = rebuilder(
    root,
    () => ad.companions(ctx.view),
    (list) => {
      if (list.length === 0) {
        root.append(empty(T.party.none));
        return;
      }
      root.append(
        el('div', { className: 'hk-row' }, [
          el('span', { className: 'hk-muted', text: T.party.all }),
          ...ORDERS.map((o) =>
            actionButton(ctx, renderText(orderName(o)), () => ad.order(ctx.view, undefined, o)),
          ),
        ]),
      );
      for (const c of list) {
        const u = c.unit;
        root.append(
          el('div', { className: `hk-card${c.downed ? ' downed' : ''}` }, [
            el('div', { className: 'hk-card-head' }, [
              el('strong', { text: c.name }),
              el('span', {
                className: 'hk-muted',
                text: [c.title, c.className, c.role].filter(Boolean).join('  '),
              }),
            ]),
            u ? progress(u.hp, u.maxHp, `${u.hp} / ${u.maxHp}`, 'hk-bar-hp') : null,
            el('div', {
              className: 'hk-muted',
              text: [
                fmt(T.party.bond, { n: c.bond }),
                c.nextThreshold !== null ? fmt(T.party.nextBond, { n: c.nextThreshold }) : '',
                c.downed ? T.party.downed : '',
              ]
                .filter(Boolean)
                .join('  '),
            }),
            el('div', { className: 'hk-row' }, [
              el('span', { className: 'hk-muted', text: T.party.orders }),
              ...ORDERS.map((o) =>
                actionButton(ctx, renderText(orderName(o)), () => ad.order(ctx.view, c.id, o), {
                  cls: c.order === o ? 'active' : '',
                }),
              ),
            ]),
          ]),
        );
      }
    },
  );
  return { el: root, update };
}

export function goddessWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.goddess;
  if (!ad) return placeholderWindow();
  const list = el('div');
  const record = el('div');
  const offerBox = el('div', { className: 'hk-card hk-offer' });
  const select = el('select', { className: 'hk-input', attrs: { 'aria-label': T.goddess.pick } });
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
    el('div', { className: 'hk-card-head' }, [el('strong', { text: T.goddess.offerTitle })]),
    el('div', { className: 'hk-row' }, [
      select,
      actionButton(ctx, T.goddess.blessing, () =>
        select.value ? ad.offer(ctx.view, select.value, 'blessing') : [],
      ),
      actionButton(ctx, T.goddess.intel, () =>
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
                fmt(T.goddess.gaze, { band: g.gazeBand }),
                fmt(T.goddess.relation, { band: g.relationBand }),
                g.departed ? T.goddess.departed : '',
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
      record.append(el('h3', { text: T.goddess.revelations }));
      if (!d.rev.length) record.append(empty(T.goddess.none));
      for (const r of d.rev)
        record.append(el('div', { className: 'hk-card hk-revelation', text: r.text }));
      record.append(el('h3', { text: T.goddess.seen }));
      if (!d.rec.length) record.append(empty(T.goddess.none));
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
