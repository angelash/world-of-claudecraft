// Territory window: pick a settlement, found it, read its state (stage, population,
// food, happiness, security, health, treasury, storage, autonomy), list its buildings,
// pick a building from the build menu to place on the world map (placement preview is
// drawn by the renderer from previewPlacement), toggle policies, enter or leave the court.

import { clear, el } from '../../shared_ui/dom';
import { formatMoney } from '../../shared_ui/i18n';
import { fmt, T } from '../../shared_ui/text';
import { actionButton, badge, empty, kv, rebuilder } from './kit';
import { placeholderWindow } from './simple_windows';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

export function territoryWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.territory;
  if (!ad) return placeholderWindow();
  const select = el('select', { className: 'hk-input', attrs: { 'aria-label': T.territory.site } });
  const body = el('div');
  let siteSig = '';
  let chosen = '';
  const fillSites = () => {
    const sites = ad.sites(ctx.view).filter((s) => s.usable);
    const sig = JSON.stringify(sites);
    if (sig === siteSig) return;
    siteSig = sig;
    clear(select);
    for (const s of sites) select.append(el('option', { text: s.name, attrs: { value: s.id } }));
    const here = sites.find((s) => s.mapId === ctx.view.player()?.mapId);
    chosen = sites.some((s) => s.id === chosen) ? chosen : (here?.id ?? sites[0]?.id ?? '');
    select.value = chosen;
  };
  select.addEventListener('change', () => {
    chosen = select.value;
    render();
  });
  const render = rebuilder(
    body,
    () => {
      const site = ad.sites(ctx.view).find((s) => s.id === chosen);
      return {
        site,
        here: ctx.view.player()?.mapId,
        settlement: site ? ad.settlement(ctx.view, site.id) : null,
        menu: site ? ad.buildMenu(ctx.view, site.id) : [],
        court: !!ctx.view.flag('feature.inner_court'),
      };
    },
    (d) => {
      if (d.court) {
        body.append(
          el('div', { className: 'hk-row' }, [
            actionButton(ctx, T.territory.enterCourt, () => ad.enterCourt(ctx.view)),
            actionButton(ctx, T.territory.leaveCourt, () => ad.leaveCourt(ctx.view)),
          ]),
        );
      }
      if (!d.site) {
        body.append(empty(T.territory.noSite));
        return;
      }
      const s = d.settlement;
      if (!s?.active) {
        body.append(
          actionButton(ctx, T.territory.found, () => ad.found(ctx.view, d.site?.id ?? ''), {
            cls: 'hk-btn-primary',
          }),
        );
        if (!s) return;
      }
      body.append(
        el('div', { className: 'hk-card-head' }, [
          el('strong', { text: s.name }),
          badge(fmt(T.territory.stage, { stage: s.stageName })),
        ]),
        el('div', { className: 'hk-kv-grid' }, [
          kv(
            T.territory.site,
            fmt(T.territory.population, { n: s.population.total, cap: s.population.cap }),
          ),
          kv('', fmt(T.territory.food, { n: Math.floor(s.foodDays) })),
          kv('', fmt(T.territory.happiness, { n: Math.round(s.happiness) })),
          kv('', fmt(T.territory.security, { n: Math.round(s.security) })),
          kv('', fmt(T.territory.health, { n: Math.round(s.health) })),
          kv('', fmt(T.territory.treasury, { money: formatMoney(s.treasury) })),
          kv(
            '',
            fmt(T.territory.storage, { used: Math.round(s.storage.used), cap: s.storage.cap }),
          ),
          kv('', fmt(T.territory.autonomy, { n: Math.round(s.autonomy.value) })),
        ]),
      );
      if (s.status.length)
        body.append(el('div', { className: 'hk-muted', text: s.status.join('  ') }));
      body.append(el('h3', { text: T.territory.buildings }));
      if (!s.buildings.length) body.append(empty(T.inventory.empty));
      for (const b of s.buildings) {
        body.append(
          el('div', { className: 'hk-inv-row' }, [
            el('span', { className: 'hk-inv-name', text: b.name, title: b.note }),
            el('span', {
              className: 'hk-muted',
              text:
                b.status === 'active'
                  ? b.note
                  : fmt(T.territory.progress, { p: Math.round(b.progress * 100) }),
            }),
            b.status !== 'active'
              ? actionButton(ctx, T.territory.cancelBuilding, () => ad.cancel(ctx.view, s.id, b.id))
              : null,
          ]),
        );
      }
      body.append(el('h3', { text: T.territory.build }));
      const onMap = d.here === s.mapId;
      if (!onMap) {
        body.append(
          empty(fmt(T.territory.wrongMap, { map: ctx.view.map(s.mapId)?.name ?? s.mapId })),
        );
      }
      for (const m of d.menu) {
        body.append(
          el('div', { className: 'hk-inv-row', title: m.desc }, [
            el('span', { className: 'hk-inv-name', text: `${m.name} ${m.w}x${m.h}` }),
            el('span', {
              className: 'hk-muted',
              text: m.available ? m.cost : fmt(T.territory.unavailable, { reason: m.reason }),
            }),
            el('button', {
              className: 'hk-btn hk-btn-small',
              text: T.territory.build,
              attrs: m.available && onMap ? { type: 'button' } : { type: 'button', disabled: '' },
              on: { click: () => ctx.actions.beginPlacement(s.id, m.id, m.name) },
            }),
          ]),
        );
      }
      if (s.policies.length) {
        body.append(el('h3', { text: T.territory.policies }));
        for (const p of s.policies) {
          body.append(
            el('label', { className: 'hk-inv-row', title: p.desc }, [
              el('input', {
                attrs: p.enabled ? { type: 'checkbox', checked: '' } : { type: 'checkbox' },
                on: {
                  change: (ev) =>
                    ctx.commands.queueAll(
                      ad.policy(ctx.view, s.id, p.id, (ev.target as HTMLInputElement).checked),
                    ),
                },
              }),
              el('span', { className: 'hk-inv-name', text: p.name }),
            ]),
          );
        }
      }
    },
  );
  return {
    el: el('div', { className: 'hk-territory' }, [
      el('div', { className: 'hk-row' }, [select]),
      body,
    ]),
    update: () => {
      fillSites();
      render();
    },
  };
}
