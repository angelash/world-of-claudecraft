// Dev-mode window: world clock, weather, player position, AI queue, all flags (filter and
// set through the core flag.set command), map teleport through world.teleport, and the
// most recent events. Never registered outside dev mode.

import type { FlagValue } from '../../core/contracts';
import { clear, el, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import { formatDate, formatTime, weatherLabel } from '../hud/format';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

/** Parse a typed flag value: true, false, numbers, otherwise the raw string. */
export function parseFlagValue(raw: string): FlagValue {
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t !== '' && Number.isFinite(Number(t))) return Number(t);
  return t;
}

export function debugWindow(ctx: WindowContext): WindowContent {
  const stats = el('dl', { className: 'hk-debug-stats' });
  const statCells = new Map<string, HTMLElement>();
  const addStat = (key: string, label: string) => {
    const dd = el('dd');
    statCells.set(key, dd);
    stats.append(el('dt', { text: label }), dd);
  };
  addStat('tick', t('ui.win.debug.tick'));
  addStat('calendar', t('ui.win.debug.calendar'));
  addStat('weather', t('ui.win.debug.weather'));
  addStat('map', t('ui.win.debug.map'));
  addStat('pos', t('ui.win.debug.position'));
  addStat('entities', t('ui.win.debug.entities'));
  addStat('ai', t('ui.win.debug.ai_mode'));
  addStat('pending', t('ui.win.debug.ai_pending'));

  const filter = el('input', {
    className: 'hk-input',
    attrs: { placeholder: t('ui.win.debug.filter'), type: 'text' },
  });
  const keyIn = el('input', {
    className: 'hk-input',
    attrs: { placeholder: t('ui.win.debug.key'), type: 'text' },
  });
  const valIn = el('input', {
    className: 'hk-input',
    attrs: { placeholder: t('ui.win.debug.value'), type: 'text' },
  });
  const setBtn = el('button', {
    className: 'hk-btn',
    text: t('ui.win.debug.set_flag'),
    attrs: { type: 'button' },
    on: {
      click: () => {
        const key = keyIn.value.trim();
        if (!key) return;
        ctx.commands.queue('flag.set', { key, value: parseFlagValue(valIn.value) });
      },
    },
  });
  const flagList = el('div', { className: 'hk-debug-flags' });

  const mapSel = el('select', { className: 'hk-input' });
  for (const m of ctx.view.maps())
    mapSel.append(el('option', { text: `${m.name} (${m.id})`, attrs: { value: m.id } }));
  const tpBtn = el('button', {
    className: 'hk-btn',
    text: t('ui.win.debug.teleport'),
    attrs: { type: 'button' },
    on: {
      click: () => {
        const map = ctx.view.map(mapSel.value);
        if (!map) return;
        const loc = map.locations[0];
        const x = loc ? loc.x + loc.w / 2 : map.width / 2;
        const y = loc ? loc.y + loc.h / 2 : map.height / 2;
        ctx.commands.queue('world.teleport', {
          entityId: ctx.view.playerId(),
          mapId: map.id,
          x,
          y,
        });
      },
    },
  });
  const events = el('ol', { className: 'hk-debug-events' });

  const root = el('div', { className: 'hk-debug' }, [
    stats,
    el('h3', { text: t('ui.win.debug.flags') }),
    el('div', { className: 'hk-row' }, [filter]),
    flagList,
    el('div', { className: 'hk-row' }, [keyIn, valIn, setBtn]),
    el('h3', { text: t('ui.win.debug.teleport') }),
    el('div', { className: 'hk-row' }, [mapSel, tpBtn]),
    el('h3', { text: t('ui.win.debug.recent_events') }),
    events,
  ]);

  let flagSig = '';
  let eventSig = -1;
  const update = () => {
    const v = ctx.view;
    const cal = v.calendar();
    const p = v.player();
    setText(statCells.get('tick') as HTMLElement, String(v.tick));
    setText(statCells.get('calendar') as HTMLElement, `${formatDate(cal)} ${formatTime(cal)}`);
    setText(statCells.get('weather') as HTMLElement, weatherLabel(v.weather()));
    setText(
      statCells.get('map') as HTMLElement,
      p ? `${v.map(p.mapId)?.name ?? ''} (${p.mapId})` : '',
    );
    setText(statCells.get('pos') as HTMLElement, p ? `${p.x.toFixed(2)}, ${p.y.toFixed(2)}` : '');
    setText(statCells.get('entities') as HTMLElement, String(v.entityCount()));
    setText(statCells.get('ai') as HTMLElement, v.aiMode());
    setText(statCells.get('pending') as HTMLElement, String(v.aiPendingCount()));

    const flags = v.flags();
    const q = filter.value.trim();
    const sig = `${q}|${JSON.stringify(flags)}`;
    if (sig !== flagSig) {
      flagSig = sig;
      clear(flagList);
      const keys = Object.keys(flags)
        .filter((k) => !q || k.includes(q))
        .sort();
      if (keys.length === 0)
        flagList.append(el('p', { className: 'hk-muted', text: t('ui.win.debug.empty_state') }));
      for (const k of keys) {
        flagList.append(
          el(
            'div',
            {
              className: 'hk-debug-flag',
              on: {
                click: () => {
                  keyIn.value = k;
                  valIn.value = String(flags[k]);
                },
              },
            },
            [el('span', { text: k }), el('code', { text: String(flags[k]) })],
          ),
        );
      }
    }
    const recent = v.recentEvents();
    const last = recent[recent.length - 1]?.seq ?? 0;
    if (last !== eventSig) {
      eventSig = last;
      clear(events);
      for (const ev of recent.slice(-25).reverse()) {
        events.append(el('li', { text: `${ev.tick}  ${ev.kind}` }));
      }
    }
  };
  filter.addEventListener('input', update);
  return { el: root, update };
}
