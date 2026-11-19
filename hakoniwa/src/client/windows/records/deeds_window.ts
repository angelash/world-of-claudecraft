// Paints `ui_win_deeds` (ux_and_onboarding.md 6.3.1): the book of deeds, the titles and the
// pillar of the inner court. Thin painter over ./deeds_model.ts; it writes DOM and queues the
// records commands, nothing else. The book's paper follows its stage through a class, so the
// wording and the look change together (6.3.1: 外观与文本键随形态换，数据结构不变).

import { el } from '../../../shared_ui/dom';
import { t } from '../../../shared_ui/i18n';
import { actionButton, badge, empty, rebuilder, tabs } from '../kit';
import { placeholderWindow } from '../simple_windows';
import type { WindowContext } from '../window_context';
import type { WindowContent } from '../window_manager';
import { type DeedRow, type DeedsTab, deedsModel, type TitleRow, wearTarget } from './deeds_model';
import './records.css';

function deedCard(r: DeedRow): HTMLElement {
  return el('div', { className: `hk-card hk-deed${r.earned ? ' earned' : ' unearned'}` }, [
    el('div', { className: 'hk-card-head' }, [
      el('strong', { text: r.label }),
      el('span', { className: 'hk-row-inline' }, [
        r.feat ? badge(t('ui.win.deeds.feat')) : null,
        r.grade ? badge(r.grade, 'grade') : null,
      ]),
    ]),
    r.desc ? el('div', { className: 'hk-card-text', text: r.desc }) : null,
    r.branchNote ? el('div', { className: 'hk-muted', text: r.branchNote }) : null,
  ]);
}

function titleCard(ctx: WindowContext, r: TitleRow): HTMLElement {
  const ad = ctx.adapters.deeds;
  return el('div', { className: `hk-card hk-title-row${r.worn ? ' worn' : ''}` }, [
    el('div', { className: 'hk-card-head' }, [
      el('strong', { text: r.name }),
      el('span', { className: 'hk-row-inline' }, [
        badge(t(`ui.win.deeds.title_kind.${r.kind}`)),
        r.worn ? badge(t('ui.win.deeds.worn'), 'worn') : null,
        r.lost ? badge(t('ui.win.deeds.lost')) : null,
      ]),
    ]),
    el('div', { className: 'hk-muted', text: r.grantedBy }),
    el('div', { className: 'hk-muted', text: r.visibleTo }),
    el('div', { className: 'hk-muted', text: r.loss }),
    r.wearable && ad
      ? el('div', { className: 'hk-row' }, [
          actionButton(ctx, t(r.worn ? 'ui.win.deeds.take_off' : 'ui.win.deeds.wear'), () =>
            ad.wearTitle(ctx.view, wearTarget(r)),
          ),
        ])
      : null,
  ]);
}

export function deedsWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.deeds;
  if (!ad) return placeholderWindow();
  const body = el('div');
  let force = 0;
  const strip = tabs<DeedsTab>(
    [
      { id: 'deeds', label: t('ui.win.deeds.tab.deeds') },
      { id: 'titles', label: t('ui.win.deeds.tab.titles') },
      { id: 'pillar', label: t('ui.win.deeds.tab.pillar') },
    ],
    'deeds',
    () => {
      force++;
      update();
    },
  );
  const update = rebuilder(
    body,
    () => ({
      force,
      m: deedsModel({
        book: ad.book(ctx.view),
        tab: strip.current(),
        doorKeyed: ad.doorKeyed(ctx.view),
      }),
    }),
    ({ m }) => {
      body.append(
        el('div', { className: 'hk-deeds-head' }, [
          el('strong', { text: m.stageTitle }),
          el('span', { className: 'hk-muted', text: m.progress }),
          el('span', { className: 'hk-muted', text: m.fame }),
        ]),
      );
      if (m.nothingEarned) body.append(empty(m.nothingEarned));
      if (m.empty) {
        body.append(empty(m.empty));
        return;
      }
      if (m.tab === 'deeds') {
        for (const g of m.groups) {
          body.append(el('h3', { text: g.label }));
          for (const r of g.rows) body.append(deedCard(r));
        }
        return;
      }
      if (m.tab === 'titles') {
        for (const r of m.titles) body.append(titleCard(ctx, r));
        return;
      }
      for (const p of m.pillar) {
        body.append(
          el('div', { className: `hk-card hk-pillar-slot${p.deedId ? '' : ' free'}` }, [
            el('span', {
              className: 'hk-muted',
              text: t('ui.win.deeds.pillar_slot', { n: p.slot + 1 }),
            }),
            el('span', { text: p.label }),
            p.deedId
              ? actionButton(ctx, t('ui.win.deeds.erase'), () => ad.carve(ctx.view, null, p.slot))
              : null,
          ]),
        );
      }
      if (m.pillarFull) body.append(el('p', { className: 'hk-muted', text: m.pillarFull }));
      if (m.carvable.length) {
        body.append(el('h3', { text: t('ui.win.deeds.carve_which') }));
        body.append(
          el(
            'div',
            { className: 'hk-row' },
            m.carvable.map((c) => actionButton(ctx, c.label, () => ad.carve(ctx.view, c.id))),
          ),
        );
      }
    },
  );
  return { el: el('div', { className: 'hk-deeds hk-paper' }, [strip.strip, body]), update };
}
