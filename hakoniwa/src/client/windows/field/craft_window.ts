// Implements `ui_win_craft` (ux_and_onboarding.md 6.3.3) and `ui_win_gather` (6.3.4). Thin
// painters over ./craft_model.ts. The craft window lists the livelihoods on the left and the
// recipes by family on the right; the batch count is held in a persistent input so a refresh
// never steals focus (6.1). The gather panel shows the nodes in reach with a gather button.

import { contentKey } from '../../../core/content_key';
import { el } from '../../../shared_ui/dom';
import { t, tOr } from '../../../shared_ui/i18n';
import { DIAN_KNOWN_FLAG } from '../../hud/dungeon_bar_model';
import { flagOn } from '../../view/game_view';
import { actionButton, empty, progress, rebuilder } from '../kit';
import { placeholderWindow } from '../simple_windows';
import type { WindowContext } from '../window_context';
import type { WindowContent } from '../window_manager';
import { clampRuns, craftModel, gatherModel, SKILL_UP_STEPS } from './craft_model';

const itemName = (ctx: WindowContext) => (id: string) =>
  tOr(contentKey('items', id, 'name'), ctx.view.itemDef(id)?.name ?? id);

/** A four-step bar of filled and empty marks (shape, not colour, carries the band). */
function steps(filled: number): HTMLElement {
  const max = SKILL_UP_STEPS.always;
  return el(
    'span',
    { className: 'hk-steps', attrs: { 'aria-hidden': 'true' } },
    Array.from({ length: max }, (_, i) =>
      el('span', { className: `hk-step${i < filled ? ' on' : ''}` }),
    ),
  );
}

export function craftWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.craft;
  if (!ad) return placeholderWindow();
  const runs = el('input', {
    className: 'hk-input hk-craft-runs',
    attrs: {
      type: 'number',
      min: '1',
      value: '1',
      'aria-label': t('ui.win.craft.runs'),
    },
  });
  const body = el('div', { className: 'hk-craft-body' });
  const update = rebuilder(
    body,
    () =>
      craftModel({
        livelihoods: ad.livelihoods(ctx.view),
        recipes: ad.recipes(ctx.view),
        maxRuns: ad.maxRuns(ctx.view),
        itemName: itemName(ctx),
        recipeName: (id, fallback) => tOr(contentKey('recipes', id, 'name'), fallback),
      }),
    (m) => {
      runs.max = String(m.maxRuns);
      if (m.empty) {
        body.append(empty(t('ui.win.craft.empty_state')));
        return;
      }
      const left = el('div', { className: 'hk-craft-skills' }, [
        el('h3', { text: t('ui.win.craft.livelihoods') }),
        ...m.livelihoods.map((l) =>
          el('div', { className: 'hk-craft-skill' }, [
            el('div', { className: 'hk-card-head' }, [
              el('strong', { text: l.name }),
              el('span', { className: 'hk-badge', text: l.tier }),
            ]),
            progress(l.pct, 100, l.skill),
          ]),
        ),
        m.drunk ? el('div', { className: 'hk-muted', text: m.drunk }) : null,
      ]);
      const right = el('div', { className: 'hk-craft-recipes' }, [
        el('h3', { text: t('ui.win.craft.recipes') }),
      ]);
      if (m.families.length === 0) right.append(empty(t('ui.win.craft.no_recipes')));
      for (const f of m.families) {
        right.append(el('div', { className: 'hk-inv-group', text: f.family }));
        for (const r of f.recipes) {
          right.append(
            el('div', { className: 'hk-card hk-recipe' }, [
              el('div', { className: 'hk-card-head' }, [el('strong', { text: r.name })]),
              el(
                'ul',
                { className: 'hk-recipe-mats' },
                r.materials.map((x) =>
                  el('li', { className: x.short ? 'short' : '' }, [
                    x.name,
                    ' ',
                    x.count,
                    x.short ? el('span', { text: t('ui.win.craft.short') }) : null,
                  ]),
                ),
              ),
              el('div', { className: 'hk-muted', text: r.station }),
              r.masterwork ? el('div', { className: 'hk-muted', text: r.masterwork }) : null,
              el('div', { className: 'hk-row' }, [
                el('span', { text: r.skillUp.label }),
                steps(r.skillUp.steps),
              ]),
              el('div', { className: 'hk-row' }, [
                actionButton(
                  ctx,
                  t('ui.win.craft.make'),
                  () => ad.craft(ctx.view, r.id, clampRuns(Number(runs.value), m.maxRuns)),
                  { disabled: !r.canCraft, title: r.reason },
                ),
                r.reason ? el('span', { className: 'hk-muted', text: r.reason }) : null,
              ]),
            ]),
          );
        }
      }
      body.append(left, right);
    },
  );
  const root = el('div', { className: 'hk-craft' }, [
    el('div', { className: 'hk-row' }, [
      el('label', { className: 'hk-muted', text: t('ui.win.craft.runs') }),
      runs,
    ]),
    body,
  ]);
  return { el: root, update };
}

export function gatherWindow(ctx: WindowContext): WindowContent {
  const ad = ctx.adapters.gather;
  if (!ad) return placeholderWindow();
  const root = el('div', { className: 'hk-gather' });
  const update = rebuilder(
    root,
    () =>
      gatherModel({
        nodes: ad.nodes(ctx.view),
        dianKnown: flagOn(ctx.view.flag(DIAN_KNOWN_FLAG)),
        itemName: itemName(ctx),
        nodeName: (id, fallback) => tOr(contentKey('gatherNodes', id, 'name'), fallback),
      }),
    (nodes) => {
      if (nodes.length === 0) {
        root.append(empty(t('ui.win.gather.empty_state')));
        return;
      }
      for (const n of nodes) {
        root.append(
          el('div', { className: 'hk-card hk-node' }, [
            el('div', { className: 'hk-card-head' }, [
              el('strong', { text: n.name }),
              el('span', { className: 'hk-badge', text: n.kind }),
            ]),
            el('div', { text: n.tiers }),
            el('div', { className: 'hk-muted', text: n.tool }),
            el('div', { className: n.taintWarn ? 'hk-node-taint warn' : 'hk-muted' }, [
              n.taint,
              n.taintWarn ? el('span', { text: n.taintWarnText }) : null,
            ]),
            n.yieldText ? el('div', { text: n.yieldText }) : null,
            el('div', { className: 'hk-muted', text: n.respawn }),
            el('div', { className: 'hk-row' }, [
              actionButton(ctx, t('ui.win.gather.gather'), () => ad.gather(ctx.view, n.id), {
                disabled: !n.canGather,
                title: n.reason,
              }),
              n.reason ? el('span', { className: 'hk-muted', text: n.reason }) : null,
            ]),
          ]),
        );
      }
    },
  );
  return { el: root, update };
}
