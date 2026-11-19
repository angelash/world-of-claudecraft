// Inventory and equipment window: purse, eight equipment slots, bag grouped by kind.
// Equip, unequip and use go through the inventory system's commands. A piece with its own
// record shows its durability, the maker's signature, its sediment grain and whether the
// attributes have lapsed (ux_and_onboarding.md 6.2.2). The DOM is rebuilt only when the
// holding actually changed.

import './inventory.css';
import { contentKey } from '../../core/content_key';
import { clear, el } from '../../shared_ui/dom';
import { t, tOr } from '../../shared_ui/i18n';
import type { EquipSlot } from '../../systems/inventory';
import { flagOn } from '../view/game_view';
import { buildInventoryView, type InstanceLine } from './inventory_view';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

/** A person's display name for a maker's signature (named people, then companions). */
function personName(ctx: WindowContext, id: string): string {
  for (const table of ['npcs', 'companions'] as const) {
    const rec = (ctx.view.content[table] as { id: string; name: string }[] | undefined)?.find(
      (r) => r.id === id,
    );
    if (rec) return tOr(contentKey(table, id, 'name'), rec.name);
  }
  return id;
}

/** The notes of a piece with its own record, one small line; lapsed pieces are marked. */
function instanceNotes(line: InstanceLine): HTMLElement {
  return el('div', {
    className: `hk-inv-inst${line.lapsed ? ' lapsed' : ''}`,
    text: line.notes.join('  '),
  });
}

export function inventoryWindow(ctx: WindowContext): WindowContent {
  const root = el('div', { className: 'hk-inv' });
  let lastSig = '';

  const render = () => {
    const owner = ctx.view.playerId();
    const holding = ctx.view.holding(owner);
    const dianKnown = flagOn(ctx.view.flag('term.dian_known'));
    const sig = JSON.stringify([holding, dianKnown]);
    if (sig === lastSig) return;
    lastSig = sig;
    const v = buildInventoryView(holding, (id) => ctx.view.itemDef(id), {
      personName: (id) => personName(ctx, id),
      dianKnown,
    });
    clear(root);
    root.append(
      el('div', { className: 'hk-inv-money' }, [
        el('span', { className: 'hk-muted', text: t('ui.win.inventory.money') }),
        el('strong', { text: v.money }),
      ]),
      el('h3', { text: t('ui.win.inventory.equipped') }),
      el(
        'div',
        { className: 'hk-inv-slots' },
        v.equipped.map((s) =>
          el('div', { className: `hk-inv-slot${s.itemId ? ' filled' : ''}` }, [
            el('span', { className: 'hk-muted', text: s.label }),
            el('span', {
              className: s.quality !== undefined ? `hk-q${s.quality}` : 'hk-muted',
              text: s.name ?? t('ui.win.inventory.empty'),
            }),
            s.itemId
              ? el('button', {
                  className: 'hk-btn hk-btn-small',
                  text: t('ui.win.inventory.unequip'),
                  attrs: { type: 'button' },
                  on: {
                    click: () =>
                      ctx.commands.queue('inventory.unequip', {
                        ownerId: owner,
                        slot: s.slot as EquipSlot,
                      }),
                  },
                })
              : null,
            s.instance ? instanceNotes(s.instance) : null,
          ]),
        ),
      ),
      el('h3', { text: t('ui.win.inventory.bag') }),
    );
    if (v.empty) {
      root.append(el('p', { className: 'hk-muted', text: t('ui.win.inventory.empty_state') }));
      return;
    }
    for (const g of v.groups) {
      root.append(el('div', { className: 'hk-inv-group', text: g.label }));
      for (const it of g.items) {
        root.append(
          el(
            'div',
            {
              className: 'hk-inv-row',
              title: [it.desc, it.levelNote, it.value].filter(Boolean).join('\n'),
            },
            [
              el('span', { className: `hk-inv-name hk-q${it.quality}`, text: it.name }),
              el('span', {
                className: 'hk-muted',
                text: t('ui.win.inventory.count', { count: it.count }),
              }),
              ...it.actions.map((a) =>
                el('button', {
                  className: 'hk-btn hk-btn-small',
                  text: a === 'equip' ? t('ui.win.inventory.equip') : t('ui.win.inventory.use'),
                  attrs: { type: 'button' },
                  on: {
                    click: () =>
                      a === 'equip'
                        ? ctx.commands.queue('inventory.equip', { ownerId: owner, itemId: it.id })
                        : ctx.commands.queue('inventory.use', { ownerId: owner, itemId: it.id }),
                  },
                }),
              ),
            ],
          ),
        );
        // each piece with its own record: its notes and its own equip button (the command
        // takes the instance, so the player chooses which sword goes on)
        for (const inst of it.instances) {
          root.append(
            el('div', { className: 'hk-inv-row hk-inv-inst-row' }, [
              instanceNotes(inst),
              it.actions.includes('equip')
                ? el('button', {
                    className: 'hk-btn hk-btn-small',
                    text: t('ui.win.inventory.equip'),
                    attrs: { type: 'button' },
                    on: {
                      click: () =>
                        ctx.commands.queue('inventory.equip', {
                          ownerId: owner,
                          itemId: it.id,
                          instanceId: inst.instanceId,
                        }),
                    },
                  })
                : null,
            ]),
          );
        }
        for (const note of it.parts) {
          root.append(el('div', { className: 'hk-inv-inst', text: note }));
        }
      }
    }
  };

  return { el: root, update: render };
}
