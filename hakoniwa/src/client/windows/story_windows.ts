// Story windows: `ui_win_doors` (K), which opens the corridor mode `ui_mode_corridor`
// (./corridor/corridor_mode.ts), and `ui_win_quests` (L), the quest log of
// ux_and_onboarding.md 14.1: tabs by kind, kind badges, the act and its week, explicit
// deadlines, the ended tab with what happened afterwards and the path taken, choice answers
// and the tracking toggle. Thin painter over ./quest_log_model.ts.

import './quest_log.css';
import { contentKey } from '../../core/content_key';
import { el } from '../../shared_ui/dom';
import { t, tOr } from '../../shared_ui/i18n';
import { corridorMode } from './corridor/corridor_mode';
import { actionButton, badge, empty, rebuilder } from './kit';
import { type QuestRow, type QuestTab, questLogModel } from './quest_log_model';
import { placeholderWindow } from './simple_windows';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

export function doorsWindow(ctx: WindowContext): WindowContent {
  if (!ctx.adapters.corridor || !ctx.adapters.doors) return placeholderWindow();
  return corridorMode(ctx);
}

function personaName(ctx: WindowContext, id: string): string {
  const raw = ctx.view.content.npcs?.find((p) => p.id === id)?.name ?? id;
  return tOr(contentKey('npcs', id, 'name'), raw);
}

function questCard(ctx: WindowContext, r: QuestRow, onTrack: (id: string) => void): HTMLElement {
  const ad = ctx.adapters.quests;
  const objectives = r.objectives.length
    ? el(
        'ul',
        { className: 'hk-objectives' },
        r.objectives.map((o) =>
          el('li', { className: o.done ? 'met' : '' }, [
            `${o.text}${o.optional ? t('ui.win.quests.optional') : ''}`,
            ...(ad
              ? o.options.map((opt) =>
                  actionButton(ctx, opt.label, () => ad.choose(ctx.view, r.id, opt.id), {
                    cls: 'hk-btn-inline',
                  }),
                )
              : []),
          ]),
        ),
      )
    : null;
  const track = r.trackable
    ? el('button', {
        className: `hk-btn hk-btn-small${r.tracked ? ' active' : ''}`,
        text: t(r.tracked ? 'ui.win.quests.untrack' : 'ui.win.quests.track'),
        attrs: { type: 'button', 'aria-pressed': r.tracked ? 'true' : 'false' },
        on: { click: () => onTrack(r.id) },
      })
    : null;
  return el('div', { className: `hk-card quest-${r.kind}${r.ready ? ' ready' : ''}` }, [
    el('div', { className: 'hk-card-head' }, [
      el('strong', { text: r.title }),
      el('span', { className: 'hk-row-inline' }, [
        badge(r.kindLabel, `kind-${r.kind}`),
        r.ready ? badge(t('ui.win.quests.ready'), 'ready') : null,
        r.tracked ? badge(t('ui.win.quests.tracking'), 'tracking') : null,
      ]),
    ]),
    el('div', { className: 'hk-card-text', text: r.text }),
    objectives,
    r.deadline ? el('div', { className: 'hk-quest-deadline', text: r.deadline }) : null,
    r.outcome ? el('div', { className: 'hk-quest-outcome', text: r.outcome }) : null,
    r.path ? el('div', { className: 'hk-muted', text: r.path }) : null,
    r.who ? el('div', { className: 'hk-muted', text: r.who }) : null,
    track ? el('div', { className: 'hk-row' }, [track]) : null,
  ]);
}

export function questsWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.quests;
  if (!ad) return placeholderWindow();
  let tab: QuestTab = 'main';
  /** a toggle refused because five quests are tracked by hand (shown once) */
  let full = false;
  const root = el('div', { className: 'hk-quests' });
  const detail = ctx.adapters.questDetail;
  const onTrack = (id: string) => {
    full = !ctx.tracker.toggle(id);
    update();
  };
  const update = rebuilder(
    root,
    () => ({
      m: questLogModel(ad.log(ctx.view), {
        tab,
        actWeek: detail?.actWeek(ctx.view) ?? 0,
        detail: (id) => detail?.detail(ctx.view, id) ?? null,
        tracked: (id) => ctx.tracker.isTracked(id),
        personName: (id) => personaName(ctx, id),
      }),
      full,
      v: ctx.tracker.version,
    }),
    ({ m, full: refused }) => {
      root.append(el('div', { className: 'hk-quests-act', text: m.header }));
      root.append(
        el(
          'div',
          { className: 'hk-tabs', attrs: { role: 'tablist' } },
          m.tabs.map((x) =>
            el('button', {
              className: `hk-tab${x.id === m.tab ? ' active' : ''}`,
              text:
                x.count > 0
                  ? t('ui.win.quests.tab_count', { label: x.label, n: x.count })
                  : x.label,
              attrs: {
                type: 'button',
                role: 'tab',
                'aria-selected': x.id === m.tab ? 'true' : 'false',
              },
              on: {
                click: () => {
                  tab = x.id;
                  full = false;
                  update();
                },
              },
            }),
          ),
        ),
      );
      if (refused)
        root.append(el('p', { className: 'hk-quest-note', text: t('ui.win.quests.track_full') }));
      if (m.empty) root.append(empty(m.empty));
      for (const r of m.rows) root.append(questCard(ctx, r, onTrack));
    },
  );
  return { el: root, update };
}
