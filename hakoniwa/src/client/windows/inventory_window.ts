// Inventory and equipment window: purse, eight equipment slots, bag grouped by kind.
// Equip, unequip and use go through the inventory system's commands. The DOM is rebuilt
// only when the holding actually changed.

import { clear, el } from '../../shared_ui/dom';
import { fmt, T } from '../../shared_ui/text';
import type { EquipSlot } from '../../systems/inventory';
import { buildInventoryView } from './inventory_view';
import type { WindowContext } from './window_context';
import type { WindowContent } from './window_manager';

export function inventoryWindow(ctx: WindowContext): WindowContent {
  const root = el('div', { className: 'hk-inv' });
  let lastSig = '';

  const render = () => {
    const owner = ctx.view.playerId();
    const holding = ctx.view.holding(owner);
    const sig = JSON.stringify(holding);
    if (sig === lastSig) return;
    lastSig = sig;
    const v = buildInventoryView(holding, (id) => ctx.view.itemDef(id));
    clear(root);
    root.append(
      el('div', { className: 'hk-inv-money' }, [
        el('span', { className: 'hk-muted', text: T.inventory.money }),
        el('strong', { text: v.money }),
      ]),
      el('h3', { text: T.inventory.equipped }),
      el(
        'div',
        { className: 'hk-inv-slots' },
        v.equipped.map((s) =>
          el('div', { className: `hk-inv-slot${s.itemId ? ' filled' : ''}` }, [
            el('span', { className: 'hk-muted', text: s.label }),
            el('span', {
              className: s.quality !== undefined ? `hk-q${s.quality}` : 'hk-muted',
              text: s.name ?? T.inventory.empty,
            }),
            s.itemId
              ? el('button', {
                  className: 'hk-btn hk-btn-small',
                  text: T.inventory.unequip,
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
          ]),
        ),
      ),
      el('h3', { text: T.inventory.bag }),
    );
    if (v.empty) {
      root.append(el('p', { className: 'hk-muted', text: T.inventory.bagEmpty }));
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
                text: fmt(T.inventory.count, { count: it.count }),
              }),
              ...it.actions.map((a) =>
                el('button', {
                  className: 'hk-btn hk-btn-small',
                  text: a === 'equip' ? T.inventory.equip : T.inventory.use,
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
      }
    }
  };

  return { el: root, update: render };
}
