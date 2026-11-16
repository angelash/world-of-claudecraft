// Story windows: the Thousand Doors corridor and the quest log.

import { el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import type { QuestView } from '../../systems/quests';
import { objectiveText } from '../adapters/social';
import { actionButton, badge, empty, rebuilder } from './kit';
import { placeholderWindow } from './simple_windows';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

const DOOR_ORDER: Record<string, number> = {
  openable: 0,
  opened: 1,
  hinted: 2,
  locked: 3,
  closed: 4,
  hidden: 5,
};

export function doorsWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.doors;
  if (!ad) return placeholderWindow();
  const root = el('div', { className: 'hk-doors' });
  const update = rebuilder(
    root,
    () =>
      ad
        .doors(ctx.view)
        .sort((a, b) => (DOOR_ORDER[a.state] ?? 9) - (DOOR_ORDER[b.state] ?? 9) || a.act - b.act),
    (doors) => {
      const opened = doors.filter((d) => d.state === 'opened').length;
      root.append(
        el('div', { className: 'hk-muted', text: t('ui.win.doors.seal', { n: opened }) }),
      );
      if (doors.length === 0) root.append(empty(t('ui.win.doors.empty_state')));
      for (const d of doors) {
        const head = el('div', { className: 'hk-card-head' }, [
          el('strong', { text: d.name }),
          el('span', { className: 'hk-row-inline' }, [
            badge(d.categoryName),
            badge(d.stateName, `door-${d.state}`),
            d.danger ? badge(t('ui.win.doors.danger'), 'danger') : null,
          ]),
        ]);
        const body: (HTMLElement | null)[] = [
          el('div', { className: 'hk-card-text', text: d.desc ?? d.hint }),
        ];
        if (d.keys.length) {
          body.push(
            el(
              'ul',
              { className: 'hk-keys' },
              d.keys.map((k) =>
                el('li', {
                  className: k.met ? 'met' : '',
                  text: k.need ? `${k.label} ${k.cur ?? 0}/${k.need}` : k.label,
                }),
              ),
            ),
          );
        }
        const buttons: HTMLElement[] = [];
        if (d.state === 'openable')
          buttons.push(
            actionButton(ctx, t('ui.win.doors.open'), () => ad.open(ctx.view, d.id), {
              cls: 'hk-btn-primary',
            }),
          );
        if (d.state === 'opened' && d.closable) {
          buttons.push(
            actionButton(ctx, t('ui.win.doors.close'), () => ad.close(ctx.view, d.id), {
              confirm: t('ui.win.doors.confirm_close'),
            }),
          );
        }
        if (buttons.length) body.push(el('div', { className: 'hk-row' }, buttons));
        root.append(el('div', { className: `hk-card door-${d.state}` }, [head, ...body]));
      }
    },
  );
  return { el: root, update };
}

function personaName(ctx: WindowContext, id: string | undefined): string {
  if (!id) return '';
  return ctx.view.content.npcs?.find((p) => p.id === id)?.name ?? id;
}

function questCard(ctx: WindowContext, q: QuestView, ready: boolean): HTMLElement {
  const ad = ctx.adapters.quests;
  const objectives = el(
    'ul',
    { className: 'hk-objectives' },
    q.objectives.map((o) =>
      el('li', { className: o.done ? 'met' : '' }, [
        `${objectiveText(o)}${o.optional ? t('ui.win.quests.optional') : ''}`,
        ...(o.options && !o.done && ad
          ? o.options.map((opt) =>
              actionButton(ctx, opt.label, () => ad.choose(ctx.view, q.id, opt.id), {
                cls: 'hk-btn-inline',
              }),
            )
          : []),
      ]),
    ),
  );
  const who = ready
    ? q.turnIn
      ? t('ui.win.quests.turn_in', { who: personaName(ctx, q.turnIn) })
      : ''
    : q.giver
      ? t('ui.win.quests.giver', { who: personaName(ctx, q.giver) })
      : '';
  return el('div', { className: `hk-card quest-${q.kind}${ready ? ' ready' : ''}` }, [
    el('div', { className: 'hk-card-head' }, [
      el('strong', { text: q.title }),
      badge(q.kind === 'main' ? t('ui.win.quests.main') : t('ui.win.quests.side'), q.kind),
    ]),
    el('div', { className: 'hk-card-text', text: q.stageDesc || q.desc }),
    objectives,
    who ? el('div', { className: 'hk-muted', text: who }) : null,
  ]);
}

export function questsWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.quests;
  if (!ad) return placeholderWindow();
  const root = el('div', { className: 'hk-quests' });
  const update = rebuilder(
    root,
    () => ad.log(ctx.view),
    (log) => {
      root.append(
        el('div', {
          className: 'hk-quests-act',
          text: t('ui.win.quests.act', { title: log.actTitle }),
        }),
      );
      if (!log.active.length && !log.ready.length && !log.done.length)
        root.append(empty(t('ui.win.quests.empty_state')));
      if (log.ready.length) {
        root.append(el('h3', { text: t('ui.win.quests.ready') }));
        for (const q of log.ready) root.append(questCard(ctx, q, true));
      }
      if (log.active.length) {
        root.append(el('h3', { text: t('ui.win.quests.active') }));
        for (const q of log.active) root.append(questCard(ctx, q, false));
      }
      if (log.done.length) {
        root.append(el('h3', { text: `${t('ui.win.quests.done')} ${log.done.length}` }));
        root.append(
          el(
            'ul',
            { className: 'hk-done-list' },
            log.done
              .slice(-12)
              .reverse()
              .map((q) => el('li', { text: q.title })),
          ),
        );
      }
    },
  );
  return { el: root, update };
}
