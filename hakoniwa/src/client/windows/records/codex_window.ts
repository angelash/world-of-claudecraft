// Paints `ui_win_codex` (ux_and_onboarding.md 6.3.2): the codex tabs and the recollection
// page. Thin painter over ./codex_model.ts. The replay button on the recollection page asks
// the session to play a scene read-only; without that callback the button is left out rather
// than shown dead (1.6), since replaying belongs to the cutscene player (PK-M1-34/55).

import { el } from '../../../shared_ui/dom';
import { t } from '../../../shared_ui/i18n';
import type { CodexTab } from '../../../systems/records';
import { DIAN_KNOWN_FLAG } from '../../hud/gauges_model';
import { flagOn } from '../../view/game_view';
import { empty, rebuilder, tabs } from '../kit';
import { placeholderWindow } from '../simple_windows';
import type { WindowContext } from '../window_context';
import type { WindowContent } from '../window_manager';
import { CODEX_TAB_ORDER, type CodexSubjectRow, codexModel } from './codex_model';
import './records.css';

function subjectCard(r: CodexSubjectRow): HTMLElement {
  return el('div', { className: 'hk-card hk-codex-row' }, [
    el('div', { className: 'hk-card-head' }, [
      el('strong', { text: r.name }),
      el('span', { className: 'hk-muted', text: [r.count, r.place].filter(Boolean).join('  ') }),
    ]),
    r.notes.length
      ? el(
          'ul',
          { className: 'hk-codex-notes' },
          r.notes.map((n) =>
            el('li', {}, [
              el('span', {
                className: 'hk-muted',
                text: t('ui.win.codex.note_source', { source: n.source }),
              }),
              ' ',
              n.text,
            ]),
          ),
        )
      : null,
  ]);
}

/**
 * The codex window. `replay` plays a seen scene read-only (the cutscene player's replay entry,
 * wired by the session); without it the recollection page lists the scenes with no button.
 */
export function codexWindow(ctx: WindowContext, replay?: (sceneId: string) => void): WindowContent {
  const ad = ctx.adapters.codex;
  if (!ad) return placeholderWindow();
  const body = el('div');
  let force = 0;
  const strip = tabs<CodexTab>(
    CODEX_TAB_ORDER.map((id) => ({ id, label: t(`ui.win.codex.tab.${id}`) })),
    'people',
    () => {
      force++;
      update();
    },
  );
  const update = rebuilder(
    body,
    () => {
      const tab = strip.current();
      return {
        force,
        m: codexModel({
          tab,
          rows: ad.page(ctx.view, tab),
          memories: tab === 'memories' ? ad.memories(ctx.view) : [],
          dianKnown: flagOn(ctx.view.flag(DIAN_KNOWN_FLAG)),
        }),
      };
    },
    ({ m }) => {
      body.append(el('div', { className: 'hk-muted hk-codex-count', text: m.recorded }));
      if (m.empty) {
        body.append(empty(m.empty));
        return;
      }
      if (m.tab === 'memories') {
        for (const g of m.memories) {
          body.append(el('h3', { text: g.label }));
          for (const r of g.rows) {
            body.append(
              el('div', { className: 'hk-card hk-codex-memory' }, [
                el('strong', { text: r.title }),
                replay
                  ? el('button', {
                      className: 'hk-btn hk-btn-small',
                      text: t('ui.win.codex.replay'),
                      attrs: { type: 'button' },
                      on: { click: () => replay(r.id) },
                    })
                  : null,
              ]),
            );
          }
        }
        return;
      }
      for (const r of m.rows) body.append(subjectCard(r));
    },
  );
  return { el: el('div', { className: 'hk-codex' }, [strip.strip, body]), update };
}
