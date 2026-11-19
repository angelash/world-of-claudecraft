// Implements `ui_mode_corridor` (ux_and_onboarding.md 9) opened by `ui_win_doors` (K): the
// full-screen Thousand Doors corridor in its flat diagram form (9.1), with the door mirror of
// the front hall, the filter tabs, the segments with their wings and end halls, and the door
// card. The window manager runs it as a mode (window_registry.ts `mode`): every other window
// closes, the world pauses, the corridor input context takes the keys (prev and next segment,
// move, open, pin, filters, leave). Opening a door is a plain button here; the long-press
// ritual and the open-door card `ui_pop_door` are PK-M1-57. Thin painter over
// ./corridor_model.ts.

import './corridor.css';
import type { TextParam } from '../../../core/text';
import { clear, el } from '../../../shared_ui/dom';
import { t } from '../../../shared_ui/i18n';
import { ArtIcon } from '../../hud/art_icon';
import { askConfirm } from '../../hud/confirm_pop';
import type { ClientCommand } from '../../view/game_view';
import type { WindowContext } from '../window_context';
import type { WindowContent } from '../window_manager';
import { windowTitle } from '../window_registry';
import {
  type CorridorFilter,
  type CorridorModel,
  type CorridorState,
  corridorModel,
  type DoorCard,
  type DoorNode,
  doorCommandResult,
  moveSelection,
  stepFilter,
  stepSegment,
} from './corridor_model';

/** A door with keys left to find can be pinned to the tracker (9.4). */
function pinnable(c: DoorCard): boolean {
  return c.shape === 'crack' || c.shape === 'glimpse' || c.shape === 'openable';
}

export function corridorMode(ctx: WindowContext): WindowContent {
  const st: CorridorState = { filter: 'all', selected: null, pinned: null, refused: null };
  /** the last event seq when the player's door command went out; null when none waits */
  let pending: number | null = null;
  let pendingDoor: string | null = null;
  let model: CorridorModel | null = null;
  let sig = '';

  const head = el('div', { className: 'hk-cor-head' });
  const map = el('div', { className: 'hk-cor-map', attrs: { role: 'list' } });
  const cardEl = el('aside', { className: 'hk-cor-card', attrs: { 'aria-live': 'polite' } });
  const foot = el('div', { className: 'hk-cor-foot' });
  const root = el('div', { className: 'hk-corridor' }, [
    el('div', { className: 'hk-cor-main' }, [head, map, foot]),
    cardEl,
  ]);

  const lastSeq = (): number => {
    const ev = ctx.view.recentEvents();
    return ev.length ? (ev[ev.length - 1]?.seq ?? 0) : 0;
  };

  const send = (doorId: string, cmds: readonly ClientCommand[]) => {
    if (!cmds.length) return;
    pending = lastSeq();
    pendingDoor = doorId;
    st.refused = null;
    ctx.commands.queueAll(cmds);
    // the world is paused in the corridor: run the tick that settles the command now
    ctx.actions.runQueued();
    update();
  };

  const open = (doorId: string) => {
    const ad = ctx.adapters.doors;
    if (ad) send(doorId, ad.open(ctx.view, doorId));
  };

  const close = (doorId: string, title: string) => {
    const ad = ctx.adapters.doors;
    if (!ad) return;
    void askConfirm({
      title: t('ui.win.doors.confirm_close'),
      body: `${title}\n${t('ui.mode.corridor.confirm_close_body')}`,
      confirmLabel: t('ui.win.doors.close'),
      irreversible: true,
    }).then((yes) => {
      if (yes) send(doorId, ad.close(ctx.view, doorId));
    });
  };

  const togglePin = (doorId: string) => {
    ctx.tracker.pinDoor(ctx.tracker.pinnedDoor === doorId ? null : doorId);
    update();
  };

  const select = (id: string | null) => {
    if (!id || id === st.selected) return;
    st.selected = id;
    update();
    map.querySelector<HTMLElement>(`[data-door="${CSS.escape(id)}"]`)?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  };

  const setFilter = (f: CorridorFilter) => {
    st.filter = f;
    update();
  };

  const doorButton = (n: DoorNode): HTMLElement => {
    const b = el(
      'button',
      {
        className: `hk-cor-door shape-${n.shape}${n.selected ? ' selected' : ''}${n.danger ? ' danger' : ''}`,
        title: n.title,
        dataset: { door: n.id },
        attrs: {
          type: 'button',
          role: 'listitem',
          'aria-pressed': n.selected ? 'true' : 'false',
        },
        on: { click: () => select(n.id) },
      },
      [
        el('span', { className: 'hk-cor-glyph', attrs: { 'aria-hidden': 'true' } }),
        el('span', { className: 'hk-cor-door-name', text: n.label }),
        el('span', { className: 'hk-cor-door-mark', text: n.mark }),
        n.keys ? el('span', { className: 'hk-cor-door-keys', text: n.keys }) : null,
        n.danger
          ? el('span', { className: 'hk-cor-door-danger', text: t('ui.win.doors.danger') })
          : null,
        n.pinned
          ? el('span', { className: 'hk-cor-pin', text: t('ui.mode.corridor.pinned') })
          : null,
      ],
    );
    return b;
  };

  const paintCard = (c: DoorCard | null) => {
    clear(cardEl);
    if (!c) return;
    const icon = new ArtIcon(32);
    icon.show('door', c.shape === 'crack' ? null : c.id);
    const buttons: HTMLElement[] = [];
    if (c.canOpen)
      buttons.push(
        el('button', {
          className: 'hk-btn hk-btn-primary',
          text: t('ui.win.doors.open'),
          attrs: { type: 'button' },
          on: { click: () => open(c.id) },
        }),
      );
    if (c.canClose)
      buttons.push(
        el('button', {
          className: 'hk-btn',
          text: t('ui.win.doors.close'),
          attrs: { type: 'button' },
          on: { click: () => close(c.id, c.title) },
        }),
      );
    if (pinnable(c))
      buttons.push(
        el('button', {
          className: 'hk-btn',
          text: t(c.pinned ? 'ui.mode.corridor.unpin' : 'ui.mode.corridor.pin'),
          attrs: { type: 'button' },
          on: { click: () => togglePin(c.id) },
        }),
      );
    const parts: (HTMLElement | null)[] = [
      el('div', { className: `hk-cor-card-title shape-${c.shape}` }, [
        icon.el,
        el('span', { className: 'hk-cor-glyph', attrs: { 'aria-hidden': 'true' } }),
        el('strong', { text: c.title }),
      ]),
      el('div', { className: 'hk-muted', text: c.place }),
      el('div', { className: 'hk-cor-card-tags' }, [
        el('span', { className: 'hk-badge', text: c.state }),
        el('span', {
          className: 'hk-badge',
          text: t('ui.mode.corridor.category', { name: c.category }),
        }),
        c.danger ? el('span', { className: 'hk-badge danger', text: c.danger }) : null,
      ]),
      c.cost ? el('p', { className: 'hk-muted', text: c.cost }) : null,
      c.excluded.length
        ? el('div', { className: 'hk-cor-sect' }, [
            el('h4', { text: t('ui.mode.corridor.card.exclusive') }),
            ...c.excluded.map((name) => el('p', { text: name })),
          ])
        : null,
      c.effect
        ? el('div', { className: 'hk-cor-sect' }, [
            el('h4', { text: t('ui.mode.corridor.effect') }),
            el('p', { text: c.effect }),
          ])
        : null,
      c.hint
        ? el('div', { className: 'hk-cor-sect' }, [
            el('h4', { text: t('ui.mode.corridor.hint') }),
            el('p', { className: 'hk-cor-hint', text: c.hint }),
          ])
        : null,
      el('div', { className: 'hk-cor-sect' }, [
        el('h4', { text: t('ui.mode.corridor.keys_title') }),
        c.keys.length
          ? el(
              'ul',
              { className: 'hk-cor-keys' },
              c.keys.map((k) =>
                el('li', { className: k.met ? 'met' : '' }, [
                  el('span', { className: 'hk-cor-key-mark', text: k.mark }),
                  el('span', { text: k.text }),
                  k.questId
                    ? el('button', {
                        className: 'hk-btn hk-btn-small',
                        text: t('ui.mode.corridor.card.where'),
                        attrs: { type: 'button' },
                        on: {
                          click: () => {
                            if (k.questId && !ctx.tracker.isTracked(k.questId))
                              ctx.tracker.toggle(k.questId);
                            ctx.actions.closeWindow('doors');
                            ctx.actions.openWindow('quests');
                          },
                        },
                      })
                    : null,
                ]),
              ),
            )
          : el('p', { className: 'hk-muted', text: t('ui.mode.corridor.no_keys') }),
        c.keysLeft ? el('p', { className: 'hk-muted', text: c.keysLeft }) : null,
      ]),
      c.refusal ? el('p', { className: 'hk-cor-refusal', text: c.refusal }) : null,
      pending !== null
        ? el('p', { className: 'hk-muted', text: t('ui.mode.corridor.opening') })
        : null,
      buttons.length ? el('div', { className: 'hk-row hk-cor-actions' }, buttons) : null,
    ];
    cardEl.append(...parts.filter((x): x is HTMLElement => x !== null));
  };

  const paint = (m: CorridorModel) => {
    clear(head);
    clear(map);
    const mirror = el('div', { className: 'hk-cor-mirror' }, [
      el('strong', { text: t('ui.mode.corridor.mirror_title') }),
      el('span', { text: m.mirror.rank }),
      el('span', { text: m.mirror.blockage }),
      el('span', { text: m.mirror.fatigue }),
    ]);
    const tabs = el(
      'div',
      { className: 'hk-tabs hk-cor-filters', attrs: { role: 'tablist' } },
      m.filters.map((f) =>
        el('button', {
          className: `hk-tab${f.id === m.filter ? ' active' : ''}`,
          text: t('ui.mode.corridor.filter_count', { label: f.label, n: f.count }),
          attrs: {
            type: 'button',
            role: 'tab',
            'aria-selected': f.id === m.filter ? 'true' : 'false',
          },
          on: { click: () => setFilter(f.id) },
        }),
      ),
    );
    const leave = el('button', {
      className: 'hk-btn hk-cor-leave',
      text: t('ui.mode.corridor.leave'),
      attrs: { type: 'button' },
      on: { click: () => ctx.actions.closeWindow('doors') },
    });
    head.append(
      el('h2', { className: 'hk-cor-title', text: windowTitle('doors') }),
      mirror,
      tabs,
      leave,
    );
    if (m.empty) map.append(el('p', { className: 'hk-muted hk-empty', text: m.empty }));
    for (const s of m.sections) {
      const rows: HTMLElement[] = s.wings.map((w) =>
        el('div', { className: `hk-cor-wing wing-${w.wing}` }, [
          el('div', { className: 'hk-cor-wing-name', text: w.label }),
          el('div', { className: 'hk-cor-doors' }, w.doors.map(doorButton)),
        ]),
      );
      if (s.hall.length)
        rows.push(
          el('div', { className: 'hk-cor-wing hk-cor-hall' }, [
            el('div', {
              className: 'hk-cor-wing-name',
              text: t('ui.mode.corridor.place_hall', { segment: s.title }),
            }),
            el('div', { className: 'hk-cor-doors' }, s.hall.map(doorButton)),
          ]),
        );
      map.append(
        el('section', { className: 'hk-cor-seg' }, [
          el('div', { className: 'hk-cor-seg-title', text: s.title }),
          ...rows,
        ]),
      );
    }
    paintCard(m.card);
  };

  function update(): void {
    const ad = ctx.adapters.corridor;
    if (!ad) return;
    if (pending !== null) {
      const res = doorCommandResult(ctx.view.recentEvents(), pending);
      if (res) {
        pending = null;
        if (!res.ok && pendingDoor)
          st.refused = { doorId: pendingDoor, reason: t(res.reason as TextParam) };
        pendingDoor = null;
      }
    }
    st.pinned = ctx.tracker.pinnedDoor;
    model = corridorModel(ad.corridor(ctx.view), st);
    st.selected = model.selected;
    const next = JSON.stringify([model, pending !== null]);
    // the hint line names the current device's keys: written every refresh, elided by text
    const controls = t('ui.mode.corridor.controls');
    if (foot.textContent !== controls) foot.textContent = controls;
    if (next === sig) return;
    sig = next;
    paint(model);
  }

  const action = (name: string): boolean => {
    const m = model;
    if (!m) return false;
    switch (name) {
      case 'move_up':
      case 'move_left':
        select(moveSelection(m.order, m.selected, -1));
        return true;
      case 'move_down':
      case 'move_right':
        select(moveSelection(m.order, m.selected, 1));
        return true;
      case 'prev_segment':
        select(stepSegment(m, m.selected, -1));
        return true;
      case 'next_segment':
        select(stepSegment(m, m.selected, 1));
        return true;
      case 'open_door':
        if (m.card?.canOpen) open(m.card.id);
        return true;
      case 'pin_tracker':
        if (m.card && pinnable(m.card)) togglePin(m.card.id);
        return true;
      case 'filter_prev':
        setFilter(stepFilter(m.filter, -1));
        return true;
      case 'filter_next':
        setFilter(stepFilter(m.filter, 1));
        return true;
      case 'door_card':
        cardEl.querySelector<HTMLElement>('button')?.focus();
        return true;
      default:
        return false;
    }
  };

  return { el: root, update, action };
}
