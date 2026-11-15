// Story windows: the Thousand Doors corridor and the quest log.

import { el } from '../../shared_ui/dom';
import { fmt, T } from '../../shared_ui/text';
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
      root.append(el('div', { className: 'hk-muted', text: fmt(T.doors.seal, { n: opened }) }));
      if (doors.length === 0) root.append(empty(T.doors.none));
      for (const d of doors) {
        const head = el('div', { className: 'hk-card-head' }, [
          el('strong', { text: d.name }),
          el('span', { className: 'hk-row-inline' }, [
            badge(d.categoryName),
            badge(d.stateName, `door-${d.state}`),
            d.danger ? badge(T.doors.danger, 'danger') : null,
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
            actionButton(ctx, T.doors.open, () => ad.open(ctx.view, d.id), {
              cls: 'hk-btn-primary',
            }),
          );
        if (d.state === 'opened' && d.closable) {
          buttons.push(
            actionButton(ctx, T.doors.close, () => ad.close(ctx.view, d.id), {
              confirm: T.doors.confirmClose,
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
        `${objectiveText(o)}${o.optional ? T.quests.optional : ''}`,
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
      ? fmt(T.quests.turnIn, { who: personaName(ctx, q.turnIn) })
      : ''
    : q.giver
      ? fmt(T.quests.giver, { who: personaName(ctx, q.giver) })
      : '';
  return el('div', { className: `hk-card quest-${q.kind}${ready ? ' ready' : ''}` }, [
    el('div', { className: 'hk-card-head' }, [
      el('strong', { text: q.title }),
      badge(q.kind === 'main' ? T.quests.main : T.quests.side, q.kind),
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
        el('div', { className: 'hk-quests-act', text: fmt(T.quests.act, { title: log.actTitle }) }),
      );
      if (!log.active.length && !log.ready.length && !log.done.length)
        root.append(empty(T.quests.empty));
      if (log.ready.length) {
        root.append(el('h3', { text: T.quests.ready }));
        for (const q of log.ready) root.append(questCard(ctx, q, true));
      }
      if (log.active.length) {
        root.append(el('h3', { text: T.quests.active }));
        for (const q of log.active) root.append(questCard(ctx, q, false));
      }
      if (log.done.length) {
        root.append(el('h3', { text: `${T.quests.done} ${log.done.length}` }));
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
