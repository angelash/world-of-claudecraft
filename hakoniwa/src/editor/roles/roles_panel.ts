// Role view panel of the inspector: a list of NPCs and goddesses and, for the selected
// one, every read-only query the social and narrative systems offer (role_model.ts).
// Thin DOM layer.

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { append, h } from '../shell/dom';
import { T } from '../text';
import { type RoleEntry, roleEntries, roleSections } from './role_model';

export class RolesPanel {
  private selected: { kind: RoleEntry['kind']; id: string } | null = null;
  private filter = '';
  private readonly collapsed = new Set<string>();

  select(kind: RoleEntry['kind'], id: string): void {
    this.selected = { kind, id };
  }

  render(el: HTMLElement, world: World, content: ContentMap, rerender: () => void): void {
    const entries = roleEntries(world, content);
    if (entries.length === 0) {
      el.append(h('p', { class: 'muted', text: T.roles.none }));
      return;
    }
    const q = this.filter.trim().toLowerCase();
    const filterIn = h('input', {
      type: 'search',
      value: this.filter,
      placeholder: T.roles.filter,
    });
    filterIn.addEventListener('change', () => {
      this.filter = filterIn.value;
      rerender();
    });
    const list = h('div', { class: 'schema-list' }, filterIn);
    for (const e of entries) {
      if (q && !`${e.id} ${e.name}`.toLowerCase().includes(q)) continue;
      const active = this.selected?.kind === e.kind && this.selected.id === e.id;
      list.append(
        h(
          'button',
          {
            type: 'button',
            class: `schema-item${active ? ' active' : ''}`,
            on: {
              click: () => {
                this.select(e.kind, e.id);
                rerender();
              },
            },
          },
          h('span', { class: 'schema-label', text: e.name }),
          h('span', {
            class: 'schema-meta',
            text: `${e.kind === 'npc' ? T.roles.kindNpc : T.roles.kindGoddess} | ${e.id}`,
          }),
        ),
      );
    }
    const detail = h('div', { class: 'detail' });
    const entry = entries.find((x) => x.kind === this.selected?.kind && x.id === this.selected.id);
    if (!entry) detail.append(h('p', { class: 'muted', text: T.roles.pick }));
    else {
      detail.append(h('div', { class: 'pane-title', text: `${entry.name}（${entry.id}）` }));
      for (const s of roleSections(world, content, entry)) {
        const key = `${entry.kind}:${s.title}`;
        const box = h(
          'details',
          { open: !this.collapsed.has(key) },
          h('summary', { text: s.title }),
        );
        box.addEventListener('toggle', () => {
          if (box.open) this.collapsed.delete(key);
          else this.collapsed.add(key);
        });
        if (s.error) box.append(h('p', { class: 'bad', text: `${T.roles.error}：${s.error}` }));
        else if (Array.isArray(s.value) && s.value.every((x) => typeof x === 'string')) {
          const ul = h('ul', { class: 'problem-list' });
          for (const line of s.value as string[]) ul.append(h('li', { text: line }));
          box.append(s.value.length ? ul : h('p', { class: 'muted', text: T.common.empty }));
        } else box.append(h('pre', { class: 'json', text: JSON.stringify(s.value, null, 2) }));
        detail.append(box);
      }
    }
    append(el, h('div', { class: 'roles-split' }, list, detail));
  }
}
