// Implements `ui_win_dungeon` (ux_and_onboarding.md 6.3.10) and `ui_win_beasts` (6.3.5). Thin
// painters over ./dungeon_model.ts and ./beasts_model.ts. Disposing of a dungeon and letting a
// beast go both ask first: each is a choice that closes something off (6.4).

import { contentKey } from '../../../core/content_key';
import { el } from '../../../shared_ui/dom';
import { t, tOr } from '../../../shared_ui/i18n';
import { askConfirm } from '../../hud/confirm_pop';
import { DIAN_KNOWN_FLAG } from '../../hud/dungeon_bar_model';
import { flagOn } from '../../view/game_view';
import { actionButton, empty, rebuilder } from '../kit';
import { placeholderWindow } from '../simple_windows';
import type { WindowContext } from '../window_context';
import type { WindowContent } from '../window_manager';
import { beastsModel } from './beasts_model';
import { dungeonModel } from './dungeon_model';

function confirmButton(label: string, title: string, body: string, run: () => void): HTMLElement {
  return el('button', {
    className: 'hk-btn hk-btn-small',
    text: label,
    attrs: { type: 'button' },
    on: {
      click: () => {
        void askConfirm({ title, body, irreversible: true }).then((yes) => {
          if (yes) run();
        });
      },
    },
  });
}

export function dungeonWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.dungeon;
  if (!ad) return placeholderWindow();
  const root = el('div', { className: 'hk-dungeons' });
  const update = rebuilder(
    root,
    () =>
      dungeonModel({
        list: ad.dungeons(ctx.view),
        dianKnown: flagOn(ctx.view.flag(DIAN_KNOWN_FLAG)),
        tick: ctx.view.tick,
        bossName: (id) => tOr(contentKey('monsters', id, 'name'), id),
      }),
    (m) => {
      if (m.empty) {
        root.append(empty(t('ui.win.dungeon.empty_state')));
        return;
      }
      for (const d of m.rows) {
        root.append(
          el('div', { className: 'hk-card hk-dungeon' }, [
            el('div', { className: 'hk-card-head' }, [
              el('strong', { text: d.name }),
              el('span', { className: 'hk-badge', text: d.form }),
              el('span', { className: 'hk-badge', text: d.state }),
            ]),
            el('div', { className: 'hk-muted', text: d.place }),
            d.overflow ? el('div', { text: d.overflow }) : null,
            el('div', { text: d.disposition }),
            el('div', { className: 'hk-muted', text: [d.cap, d.clear].join('  ') }),
            d.bosses.length
              ? el(
                  'ul',
                  { className: 'hk-sayings' },
                  d.bosses.map((b) => el('li', { text: b.label })),
                )
              : null,
            d.unexplored ? el('div', { className: 'hk-muted', text: d.unexplored }) : null,
            d.lost ? el('div', { className: 'hk-muted', text: d.lost }) : null,
            d.choices.length
              ? el(
                  'div',
                  { className: 'hk-row' },
                  d.choices.map((c) =>
                    confirmButton(c.label, d.name, c.confirm, () =>
                      ctx.commands.queueAll(ad.setDisposition(ctx.view, d.id, c.choice)),
                    ),
                  ),
                )
              : null,
          ]),
        );
      }
    },
  );
  return { el: root, update };
}

export function beastsWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.beasts;
  if (!ad) return placeholderWindow();
  const root = el('div', { className: 'hk-beasts' });
  const update = rebuilder(
    root,
    () =>
      beastsModel({
        pets: ad.pets(ctx.view),
        mounts: ad.mounts(ctx.view),
        speciesName: (id) => tOr(contentKey('pets', id, 'name'), id),
      }),
    (m) => {
      root.append(el('h3', { text: t('ui.win.beasts.pets') }));
      if (m.petsEmpty) root.append(empty(t('ui.win.beasts.empty_state')));
      for (const p of m.pets) {
        root.append(
          el('div', { className: 'hk-card hk-pet' }, [
            el('div', { className: 'hk-card-head' }, [
              el('strong', { text: p.name }),
              el('span', { className: 'hk-badge', text: p.kind }),
            ]),
            el('div', { className: 'hk-muted', text: [p.state, p.hp].filter(Boolean).join('  ') }),
            p.guarding ? el('div', { className: 'hk-muted', text: p.guarding }) : null,
            p.canRelease
              ? el('div', { className: 'hk-row' }, [
                  confirmButton(
                    t('ui.win.beasts.release'),
                    p.name,
                    t('ui.win.beasts.release_body', { name: p.name }),
                    () => ctx.commands.queueAll(ad.release(ctx.view, p.id)),
                  ),
                ])
              : null,
          ]),
        );
      }
      root.append(el('h3', { text: t('ui.win.beasts.mounts') }));
      if (m.mountsEmpty) root.append(empty(t('ui.win.beasts.no_mounts')));
      for (const mt of m.mounts) {
        root.append(
          el('div', { className: `hk-card hk-mount${mt.active ? ' active' : ''}` }, [
            el('div', { className: 'hk-card-head' }, [
              el('strong', { text: mt.name }),
              mt.active
                ? el('span', { className: 'hk-badge', text: t('ui.win.beasts.riding') })
                : null,
            ]),
            el('div', { className: 'hk-muted', text: mt.stats }),
            el('div', { className: 'hk-row' }, [
              mt.active
                ? actionButton(ctx, t('ui.win.beasts.dismount'), () => ad.ride(ctx.view, null))
                : actionButton(ctx, t('ui.win.beasts.ride'), () => ad.ride(ctx.view, mt.id)),
            ]),
          ]),
        );
      }
    },
  );
  return { el: root, update };
}
