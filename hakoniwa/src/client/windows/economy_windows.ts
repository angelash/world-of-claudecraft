// Economy windows: the trade session with a merchant (opened by the dialogue option
// "交易", closed with economy.close_trade) and the trade company.

import { el } from '../../shared_ui/dom';
import { formatMoney, t } from '../../shared_ui/i18n';
import { actionButton, badge, empty, kv, rebuilder } from './kit';
import { placeholderWindow } from './simple_windows';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

export function tradeWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.trade;
  if (!ad) return placeholderWindow();
  const root = el('div', { className: 'hk-trade' });
  const update = rebuilder(
    root,
    () => ad.session(ctx.view),
    (s) => {
      if (!s) {
        ctx.actions.closeWindow('trade');
        return;
      }
      root.append(
        el('div', { className: 'hk-card-head' }, [
          el('strong', { text: t('ui.win.trade.market', { market: s.marketName }) }),
          el('span', {
            className: 'hk-gold',
            text: t('ui.win.trade.money', { money: formatMoney(s.money) }),
          }),
        ]),
        el('h3', { text: t('ui.win.trade.wares') }),
      );
      if (!s.wares.length) root.append(empty(t('ui.win.trade.empty_state')));
      for (const w of s.wares) {
        root.append(
          el('div', { className: 'hk-inv-row' }, [
            el('span', { className: 'hk-inv-name', text: w.name }),
            badge(t(w.stateLabel)),
            el('span', { className: 'hk-muted', text: t('ui.win.trade.stock', { n: w.stock }) }),
            el('span', { className: 'hk-gold', text: formatMoney(w.buy) }),
            actionButton(ctx, t('ui.win.trade.buy'), () => ad.buy(ctx.view, w.itemId, 1), {
              disabled: w.stock <= 0 || w.buy > s.money,
            }),
          ]),
        );
      }
      root.append(el('h3', { text: t('ui.win.trade.bag') }));
      if (!s.bag.length) root.append(empty(t('ui.win.trade.empty_bag')));
      for (const b of s.bag) {
        root.append(
          el('div', { className: 'hk-inv-row', title: t(b.reason) }, [
            el('span', { className: 'hk-inv-name', text: `${b.name} x${b.count}` }),
            el('span', {
              className: 'hk-gold',
              text: b.legal ? formatMoney(b.sell) : t('ui.win.trade.illegal'),
            }),
            actionButton(ctx, t('ui.win.trade.sell'), () => ad.sell(ctx.view, b.itemId, 1), {
              disabled: !b.legal,
            }),
          ]),
        );
      }
      root.append(
        el('div', { className: 'hk-row' }, [
          actionButton(ctx, t('ui.win.trade.close'), () => ad.close(ctx.view)),
        ]),
      );
    },
  );
  return {
    el: root,
    update,
    dispose: () => {
      if (ad.session(ctx.view)) ctx.commands.queueAll(ad.close(ctx.view));
    },
  };
}

export function companyWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.company;
  if (!ad) return placeholderWindow();
  const info = el('div');
  const amount = el('input', {
    className: 'hk-input',
    attrs: {
      type: 'number',
      min: '0',
      placeholder: t('ui.win.company.amount_placeholder'),
      'aria-label': t('ui.win.company.amount_placeholder'),
    },
  });
  const funds = el('div', { className: 'hk-row' }, [
    amount,
    actionButton(ctx, t('ui.win.company.deposit'), () => {
      const n = Math.floor(Number(amount.value));
      return n > 0 ? ad.funds(ctx.view, n) : [];
    }),
    actionButton(ctx, t('ui.win.company.withdraw'), () => {
      const n = Math.floor(Number(amount.value));
      return n > 0 ? ad.funds(ctx.view, -n) : [];
    }),
  ]);
  const updateInfo = rebuilder(
    info,
    () => ad.company(ctx.view),
    (c) => {
      if (!c.founded) {
        info.append(
          empty(t('ui.win.company.empty_state')),
          actionButton(ctx, t('ui.win.company.found'), () => ad.found(ctx.view), {
            cls: 'hk-btn-primary',
          }),
        );
        return;
      }
      info.append(
        el('div', { className: 'hk-card-head' }, [
          el('strong', { text: c.name }),
          el('span', {
            className: 'hk-gold',
            text: t('ui.win.company.funds', { money: formatMoney(c.funds) }),
          }),
        ]),
        el('div', {
          className: 'hk-muted',
          text: `${t('ui.win.company.scale', { n: c.scale })}  ${t('ui.win.company.partner', { p: Math.round(c.partnerShare * 100) })}`,
        }),
      );
      info.append(el('h3', { text: t('ui.win.company.stock') }));
      info.append(
        el(
          'div',
          { className: 'hk-kv-grid' },
          c.stock.length
            ? c.stock.map((s) => kv(s.name, String(s.count)))
            : [empty(t('ui.win.inventory.empty'))],
        ),
      );
      info.append(el('h3', { text: t('ui.win.company.recipes') }));
      for (const r of c.recipes) {
        const inputs = Object.entries(r.inputs)
          .map(([id, n]) => `${ctx.view.itemDef(id)?.name ?? id} x${n}`)
          .join('  ');
        info.append(
          el('div', { className: 'hk-inv-row' }, [
            el('span', { className: 'hk-inv-name', text: r.name, title: inputs }),
            el('span', {
              className: 'hk-muted',
              text: t('ui.win.company.days_left', { n: r.days }),
            }),
            r.unlocked
              ? actionButton(ctx, t('ui.win.company.produce'), () => ad.produce(ctx.view, r.id, 1))
              : badge(t('ui.win.company.locked')),
          ]),
        );
      }
      if (c.jobs.length) {
        info.append(el('h3', { text: t('ui.win.company.jobs') }));
        for (const j of c.jobs)
          info.append(
            kv(
              c.recipes.find((r) => r.id === j.recipeId)?.name ?? j.recipeId,
              t('ui.win.company.days_left', { n: j.daysLeft }),
            ),
          );
      }
      if (c.caravans.length) {
        info.append(el('h3', { text: t('ui.win.company.caravans') }));
        for (const cv of c.caravans)
          info.append(
            kv(
              t('ui.win.company.route', { from: cv.from, to: cv.to }),
              `${cv.status}  ${t('ui.win.company.days_left', { n: cv.daysLeft })}`,
            ),
          );
      }
      if (c.ledger.length) {
        info.append(el('h3', { text: t('ui.win.company.ledger') }));
        for (const l of c.ledger.slice(-8).reverse())
          info.append(kv(l.reason, formatMoney(l.delta)));
      }
    },
  );
  return {
    el: el('div', { className: 'hk-company' }, [info, funds]),
    update: () => {
      updateInfo();
      funds.hidden = !ad.company(ctx.view).founded;
    },
  };
}
