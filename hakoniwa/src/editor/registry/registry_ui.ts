// Variable registry view (release_engineering.md 7.5): search the world-state variable
// registry, read one definition (kind, scope, act, range, values, aliases, the registered
// writers and readers), and see who really reads and writes it in the content (quests and
// scenes first), each use linked to its row in the content tool. Names the content uses
// that the registry does not resolve are listed on their own (V4 errors). Thin DOM layer
// over registry_model.ts.

import { collectFlagUses } from '../../content/registry_refs';
import type { FamilyDef, FlagRegistry } from '../../core/registry';
import { type RowLocator, rowLocator } from '../checks/row_locator';
import { targetLinks } from '../checks/target_links';
import { append, button, fill, h } from '../shell/dom';
import type { EditorTool, ToolHost } from '../shell/tool';
import type { Workspace } from '../state/workspace';
import { fmt, T } from '../text';
import { errorMessage } from '../util/json';
import {
  indexUses,
  type RegistryEntry,
  type ResolvedUse,
  registryEntries,
  registryOf,
  type SearchHit,
  searchRegistry,
  type UseIndex,
  useCounts,
  usesOf,
  valueText,
} from './registry_model';

const LIST_LIMIT = 300;

interface Built {
  revision: number;
  registry: FlagRegistry;
  entries: RegistryEntry[];
  index: UseIndex;
  counts: Map<string, number>;
  locate: RowLocator;
}

export class RegistryTool implements EditorTool {
  readonly id = 'registry';
  readonly label = T.nav.registry;
  private host!: ToolHost;
  private ws!: Workspace;
  private built: Built | null = null;
  private query = '';
  private selected = '';
  private view: 'detail' | 'unresolved' = 'detail';
  private searchEl!: HTMLInputElement;
  private summaryEl!: HTMLElement;
  private listEl!: HTMLElement;
  private detailEl!: HTMLElement;

  mount(root: HTMLElement, host: ToolHost): void {
    this.host = host;
    this.ws = host.ws;
    this.searchEl = h('input', {
      type: 'search',
      placeholder: T.registry.search,
      attrs: { 'aria-label': T.registry.search },
    });
    this.searchEl.addEventListener('input', () => {
      this.query = this.searchEl.value;
      this.renderList();
    });
    this.summaryEl = h('div', { class: 'summary' });
    this.listEl = h('div', { class: 'schema-list' });
    this.detailEl = h('div', { class: 'detail' });
    append(
      root,
      h(
        'div',
        { class: 'registry-tool pane' },
        h(
          'div',
          { class: 'roles-split' },
          h(
            'div',
            null,
            h('div', { class: 'toolbar' }, this.searchEl),
            this.summaryEl,
            this.listEl,
          ),
          this.detailEl,
        ),
      ),
    );
  }

  show(params: Record<string, string>): void {
    if (params.name !== undefined) {
      this.selected = params.name;
      this.view = 'detail';
    }
    if (params.q !== undefined) this.query = params.q;
    this.searchEl.value = this.query;
    this.render();
  }

  hide(): void {}

  private data(): Built | null {
    if (this.built && this.built.revision === this.ws.revision) return this.built;
    try {
      const content = this.ws.content();
      const registry = registryOf(content);
      const index = indexUses(collectFlagUses(content).uses, registry);
      this.built = {
        revision: this.ws.revision,
        registry,
        entries: registryEntries(registry),
        index,
        counts: useCounts(index),
        locate: rowLocator(this.ws.schemas, this.ws.allData()),
      };
    } catch (e) {
      this.built = null;
      this.host.notify(errorMessage(e), 'error');
    }
    return this.built;
  }

  private render(): void {
    this.renderList();
    this.renderDetail();
  }

  private renderList(): void {
    const b = this.data();
    if (!b) {
      fill(this.listEl);
      fill(this.summaryEl);
      return;
    }
    const hits = searchRegistry(b.registry, b.entries, this.query);
    const shown = hits.slice(0, LIST_LIMIT);
    fill(
      this.summaryEl,
      h('span', {
        class: 'muted',
        text: fmt(T.registry.results, { shown: hits.length, total: b.entries.length }),
      }),
      ' ',
      button(
        fmt(T.registry.unresolvedButton, { n: b.index.unresolved.length }),
        () => {
          this.view = 'unresolved';
          this.render();
        },
        {
          class: `chip${this.view === 'unresolved' ? ' active' : ''}${b.index.unresolved.length ? ' bad' : ''}`,
        },
      ),
    );
    fill(
      this.listEl,
      ...shown.map((hit) => this.listItem(hit, b)),
      hits.length > LIST_LIMIT
        ? h('p', { class: 'muted small', text: fmt(T.registry.truncated, { n: LIST_LIMIT }) })
        : null,
      hits.length === 0 ? h('p', { class: 'muted', text: T.registry.noMatch }) : null,
    );
  }

  private listItem(hit: SearchHit, b: Built): HTMLElement {
    const { entry } = hit;
    const match =
      hit.match === 'alias'
        ? fmt(T.registry.matchAlias, { text: hit.text })
        : hit.match === 'label'
          ? fmt(T.registry.matchLabel, { text: hit.text })
          : hit.match === 'resolved' && hit.text !== entry.name
            ? fmt(T.registry.matchResolved, { text: hit.text })
            : '';
    const meta = [
      fmt(T.registry.meta, {
        kind: entry.family ? `${T.registry.kindFamily} ${entry.def.kind}` : entry.def.kind,
        scope: entry.def.scope,
        act: entry.def.act ?? T.common.none,
        n: b.counts.get(entry.name) ?? 0,
      }),
      match,
    ]
      .filter((s) => s !== '')
      .join(' | ');
    return h(
      'button',
      {
        type: 'button',
        class: `schema-item${entry.name === this.selected && this.view === 'detail' ? ' active' : ''}`,
        on: { click: () => this.select(entry.name) },
      },
      h('span', { class: 'mono', text: entry.name }),
      h('span', { class: 'schema-meta', text: meta }),
    );
  }

  private select(name: string): void {
    this.selected = name;
    this.view = 'detail';
    const params: Record<string, string> = { name };
    if (this.query.trim() !== '') params.q = this.query;
    this.host.setParams(params);
    this.render();
  }

  private renderDetail(): void {
    const b = this.data();
    if (!b) {
      fill(this.detailEl);
      return;
    }
    if (this.view === 'unresolved') {
      this.renderUnresolved(b);
      return;
    }
    const entry = b.entries.find((e) => e.name === this.selected);
    if (!entry) {
      fill(this.detailEl, h('p', { class: 'muted', text: T.registry.pick }));
      return;
    }
    const def = entry.def;
    const list = (xs: readonly string[]) => (xs.length ? xs.join(', ') : T.common.none);
    const yesNo = (v: boolean) => (v ? T.common.yes : T.common.no);
    const range = def.range
      ? fmt(T.registry.rangeText, {
          lo: def.range[0] ?? T.registry.unbounded,
          hi: def.range[1] ?? T.registry.unbounded,
        })
      : T.registry.unbounded;
    const rows: [string, string][] = [
      [T.registry.fieldName, def.name],
      [
        T.registry.fieldKind,
        entry.family
          ? `${T.registry.kindFamily}，${def.kind}`
          : `${T.registry.kindVar}，${def.kind}`,
      ],
      [T.registry.fieldScope, def.scope],
      [T.registry.fieldAct, def.act === null ? T.common.none : String(def.act)],
      [T.registry.fieldRange, range],
      [T.registry.fieldStep, def.step === null ? T.common.none : String(def.step)],
      [T.registry.fieldDefault, def.default === null ? T.common.none : valueText(def.default)],
      [T.registry.fieldValues, def.values ? list(def.values) : T.common.none],
      [T.registry.fieldAliases, list(def.aliases)],
      [T.registry.fieldWriters, list(def.writers)],
      [T.registry.fieldReaders, list(def.readers)],
      [T.registry.fieldDerive, def.derive ?? T.common.none],
      [T.registry.fieldMonotone, yesNo(def.monotone)],
      [T.registry.fieldVisibility, def.visibility],
      [T.registry.fieldAi, def.ai],
      [T.registry.fieldLabel, def.label],
      [T.registry.fieldSource, def.source],
    ];
    if (entry.family) {
      const slots = (def as FamilyDef).slots.map((s) =>
        fmt(T.registry.slot, {
          name: s.name,
          domain: s.domain ?? T.common.none,
          keys: s.keys ? s.keys.join(', ') : T.registry.slotAnyKey,
        }),
      );
      rows.push([T.registry.fieldSlots, slots.join('；') || T.common.none]);
    }
    const kv = h('table', { class: 'grid kv' });
    for (const [k, v] of rows) kv.append(h('tr', null, h('th', { text: k }), h('td', { text: v })));

    const uses = usesOf(b.index, entry.name);
    const story = h('div', { class: 'inline wrap' });
    const storyChip = (table: string, id: string) => {
      const t = b.locate(table, id);
      return t.kind === 'row'
        ? button(
            id,
            () => this.host.navigate('content', { file: t.file, table: t.table, row: t.id }),
            { class: 'chip' },
          )
        : h('span', { class: 'chip', text: id });
    };
    if (uses.quests.length) {
      story.append(
        h('span', { class: 'muted', text: `${T.registry.questsLabel}：` }),
        ...uses.quests.map((id) => storyChip('quests', id)),
      );
    }
    if (uses.scenes.length) {
      story.append(
        h('span', { class: 'muted', text: `${T.registry.scenesLabel}：` }),
        ...uses.scenes.map((id) => storyChip('scenes', id)),
      );
    }
    fill(
      this.detailEl,
      h('div', { class: 'pane-title mono', text: entry.name }),
      h('div', { class: 'sub-title', text: T.registry.registryTitle }),
      kv,
      h('div', { class: 'sub-title', text: T.registry.usesTitle }),
      uses.quests.length || uses.scenes.length
        ? h('div', null, h('div', { class: 'muted small', text: T.registry.storyTitle }), story)
        : null,
      h('div', {
        class: 'sub-title',
        text: fmt(T.registry.writesTitle, { n: uses.writes.length }),
      }),
      this.usesTable(uses.writes, b),
      h('div', { class: 'sub-title', text: fmt(T.registry.readsTitle, { n: uses.reads.length }) }),
      this.usesTable(uses.reads, b),
    );
  }

  private usesTable(uses: readonly ResolvedUse[], b: Built): HTMLElement {
    if (uses.length === 0) return h('p', { class: 'muted', text: T.registry.noUses });
    const table = h('table', { class: 'grid' });
    table.append(
      h(
        'tr',
        null,
        ...[
          T.registry.colTable,
          T.registry.colRow,
          T.registry.colPath,
          T.registry.colVia,
          T.registry.colName,
          T.registry.colDetail,
          T.registry.colAct,
          T.registry.colOpen,
        ].map((t) => h('th', { text: t })),
      ),
    );
    for (const u of uses) {
      const detail =
        u.expr ??
        [u.op ?? '', u.value === undefined ? '' : valueText(u.value)]
          .filter((s) => s !== '')
          .join(' ');
      table.append(
        h(
          'tr',
          null,
          h('td', { text: u.table }),
          h('td', { class: 'mono', text: u.row }),
          h('td', { class: 'mono small', text: u.path }),
          h('td', { text: u.via }),
          h('td', {
            class: 'mono',
            text: u.alias ? `${u.name} ${T.registry.viaAlias}` : u.canonical,
          }),
          h('td', { class: 'mono small', text: detail }),
          h('td', { text: u.act === null ? '' : String(u.act) }),
          h('td', null, ...targetLinks(b.locate(u.table, u.row, u.path), this.host)),
        ),
      );
    }
    return h('div', { class: 'table-wrap' }, table);
  }

  private renderUnresolved(b: Built): void {
    const list = b.index.unresolved;
    const body: HTMLElement[] = [];
    for (const { name, uses } of list) {
      const table = h('table', { class: 'grid' });
      for (const u of uses) {
        table.append(
          h(
            'tr',
            null,
            h('td', { text: u.kind === 'write' ? T.quests.writes : T.quests.reads }),
            h('td', { text: u.table }),
            h('td', { class: 'mono', text: u.row }),
            h('td', { class: 'mono small', text: u.path }),
            h('td', { text: u.via }),
            h('td', null, ...targetLinks(b.locate(u.table, u.row, u.path), this.host)),
          ),
        );
      }
      body.push(
        h(
          'details',
          null,
          h('summary', {
            text: `${name}（${fmt(T.registry.unresolvedUses, { n: uses.length })}）`,
          }),
          table,
        ),
      );
    }
    fill(
      this.detailEl,
      h(
        'div',
        { class: 'toolbar' },
        button(T.registry.back, () => {
          this.view = 'detail';
          this.render();
        }),
      ),
      h('div', {
        class: `pane-title${list.length ? ' bad' : ''}`,
        text: fmt(T.registry.unresolvedTitle, { n: list.length }),
      }),
      list.length
        ? h('div', null, ...body)
        : h('p', { class: 'ok', text: T.registry.unresolvedNone }),
    );
  }
}
