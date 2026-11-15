// Content editor: every TableSchema from the content packs, its data file read through
// the dev service, a sortable and searchable row table, and a form generated from the
// schema fields. Edits become workspace drafts; saving shows a review (row diff, field
// problems, validateContent over all drafts) and writes the file back. Thin DOM layer
// over form_model.ts, diff.ts and the Workspace.

import type { FieldSchema, TableSchema } from '../../content/pack';
import { blankMap } from '../map/map_ops';
import { append, button, clear, fill, formRow, h } from '../shell/dom';
import type { EditorTool, ToolHost } from '../shell/tool';
import type { Workspace } from '../state/workspace';
import { fmt, T } from '../text';
import { deepEqual, errorMessage } from '../util/json';
import { diffRows, isEmptyDiff } from './diff';
import {
  cellText,
  copyRow,
  extraFields,
  filterRows,
  formatValue,
  listMode,
  newRow,
  parseValue,
  type RowProblem,
  type RowTemplate,
  setField,
  sortIndices,
  tableColumns,
  validateField,
  validateRows,
  withExtraFields,
} from './form_model';
import { fileShape, idOf, type Row, rowsOf } from './rows';

const ROW_TEMPLATES: Record<string, RowTemplate> = {
  maps: (id) => blankMap(id, T.map.newMapName) as unknown as Row,
};

const MAX_TABLE_ROWS = 500;
const MAX_PROBLEMS = 200;

export class ContentTool implements EditorTool {
  readonly id = 'content';
  readonly label = T.nav.content;
  private host!: ToolHost;
  private ws!: Workspace;
  private visible = false;
  private schema: TableSchema | null = null;
  private selected = -1;
  private query = '';
  private sortKey = '';
  private sortDir: 'asc' | 'desc' = 'asc';
  /** the row object the form was built from (to detect external changes) */
  private formRow: unknown = undefined;
  private formSchema: TableSchema | null = null;
  private reviewOpen = false;
  private listEl!: HTMLElement;
  private headerEl!: HTMLElement;
  private toolbarEl!: HTMLElement;
  private noticeEl!: HTMLElement;
  private reviewEl!: HTMLElement;
  private tableEl!: HTMLElement;
  private problemsEl!: HTMLElement;
  private formEl!: HTMLElement;
  private searchInput!: HTMLInputElement;

  mount(root: HTMLElement, host: ToolHost): void {
    this.host = host;
    this.ws = host.ws;
    this.listEl = h('div', { class: 'schema-list' });
    this.headerEl = h('div', { class: 'pane-title' });
    this.searchInput = h('input', { type: 'search', placeholder: T.content.searchPlaceholder });
    this.searchInput.addEventListener('input', () => {
      this.query = this.searchInput.value;
      this.renderTable();
    });
    this.toolbarEl = h('div', { class: 'toolbar' });
    this.noticeEl = h('div', { class: 'notices' });
    this.reviewEl = h('div', { class: 'review', hidden: true });
    this.tableEl = h('div', { class: 'table-wrap' });
    this.problemsEl = h('div', { class: 'problems' });
    this.formEl = h('div', { class: 'form' });
    append(
      root,
      h(
        'div',
        { class: 'content-tool' },
        h(
          'aside',
          { class: 'pane list-pane' },
          h('div', { class: 'pane-title', text: T.content.tables }),
          this.listEl,
        ),
        h(
          'section',
          { class: 'pane table-pane' },
          this.headerEl,
          this.toolbarEl,
          this.noticeEl,
          this.reviewEl,
          this.tableEl,
          this.problemsEl,
        ),
        h('section', { class: 'pane form-pane' }, this.formEl),
      ),
    );
    this.ws.subscribe(() => {
      if (this.visible) this.refresh();
    });
    root.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.openReview();
      }
    });
  }

  show(params: Record<string, string>): void {
    this.visible = true;
    const file = params.file;
    const table = params.table;
    let schema: TableSchema | undefined;
    if (file) {
      schema =
        (table ? this.ws.schemaFor(file, table) : undefined) ??
        this.ws.schemas.find((s) => s.file === file);
    } else if (table) schema = this.ws.schemasForTable(table)[0];
    if (schema && schema !== this.schema) this.selectSchema(schema);
    else if (!this.schema && this.ws.schemas[0]) this.selectSchema(this.ws.schemas[0]);
    if (params.row && this.schema) {
      const rows = this.ws.rows(this.schema) ?? [];
      const byIndex = /^#(\d+)$/.exec(params.row);
      const idx = byIndex
        ? Number(byIndex[1]) - 1
        : rows.findIndex((r) => idOf(r, (this.schema as TableSchema).idField) === params.row);
      if (idx >= 0 && idx < rows.length) this.selectRow(idx);
    }
    this.refresh();
    if (params.field) {
      const el = this.formEl.querySelector<HTMLElement>(
        `[data-field="${CSS.escape(params.field)}"]`,
      );
      el?.scrollIntoView({ block: 'center' });
      el?.querySelector<HTMLElement>('input, textarea, select')?.focus();
    }
  }

  hide(): void {
    this.visible = false;
  }

  // -------------------------------------------------------------------------
  // Selection

  private selectSchema(schema: TableSchema): void {
    this.schema = schema;
    this.selected = -1;
    this.query = '';
    this.searchInput.value = '';
    this.sortKey = '';
    this.reviewOpen = false;
    this.formRow = undefined;
    this.formSchema = null;
    this.syncParams();
  }

  private selectRow(index: number): void {
    this.selected = index;
    this.formRow = undefined;
    this.syncParams();
  }

  private syncParams(): void {
    const s = this.schema;
    if (!s) return;
    const rows = this.ws.rows(s) ?? [];
    const row = rows[this.selected];
    const id = row ? (idOf(row, s.idField) ?? `#${this.selected + 1}`) : '';
    this.host.setParams({ file: s.file, table: s.table, row: id });
  }

  // -------------------------------------------------------------------------
  // Rendering

  private refresh(): void {
    this.renderList();
    this.renderHeader();
    this.renderNotices();
    this.renderTable();
    this.renderProblems();
    if (this.reviewOpen) this.renderReview();
    // Rebuild the form only when its row changed underneath it (selection, discard,
    // reload, an edit from the map editor); the form's own edits keep focus.
    const key = this.formKey();
    if (
      this.formSchema !== this.schema ||
      (key !== this.formRow && !deepEqual(key, this.formRow))
    ) {
      this.renderForm();
    } else this.formRow = key;
  }

  /** The value the form shows: the selected row, or the whole file when not row-shaped. */
  private formKey(): unknown {
    const s = this.schema;
    if (!s) return undefined;
    const data = this.ws.data(s.file);
    const rows = rowsOf(data, s.table, s.idField);
    return rows ? rows[this.selected] : data;
  }

  private refs = (table: string) => this.ws.tableIds(table);

  private fileProblems(schema: TableSchema): RowProblem[] {
    const rows = this.ws.rows(schema);
    return rows ? validateRows(schema, rows, this.refs) : [];
  }

  private renderList(): void {
    clear(this.listEl);
    if (this.ws.schemas.length === 0) {
      this.listEl.append(h('p', { class: 'muted', text: T.content.noSchemas }));
      return;
    }
    for (const s of this.ws.schemas) {
      const rows = this.ws.rows(s);
      const probs = this.fileProblems(s).length;
      const item = h(
        'button',
        {
          type: 'button',
          class: `schema-item${s === this.schema ? ' active' : ''}`,
          on: {
            click: () => {
              this.selectSchema(s);
              this.refresh();
            },
          },
        },
        h('span', { class: 'schema-label', text: s.label }),
        h('span', { class: 'schema-meta', text: `${s.table} | ${s.file}` }),
        h(
          'span',
          { class: 'schema-badges' },
          rows ? h('span', { class: 'badge', text: `${rows.length} ${T.content.rows}` }) : null,
          probs ? h('span', { class: 'badge bad', text: String(probs) }) : null,
          this.ws.isDirty(s.file)
            ? h('span', { class: 'badge warn', text: T.content.dirtyMark })
            : null,
        ),
      );
      this.listEl.append(item);
    }
  }

  private renderHeader(): void {
    const s = this.schema;
    if (!s) {
      fill(this.headerEl, T.content.pickTable);
      clear(this.toolbarEl);
      return;
    }
    fill(
      this.headerEl,
      h('strong', { text: s.label }),
      h('span', { class: 'muted', text: ` ${s.table} | data/${s.file}` }),
      this.ws.isDirty(s.file)
        ? h('span', { class: 'badge warn', text: T.content.dirtyMark })
        : null,
    );
    const ro = this.ws.readOnly;
    const rows = this.ws.rows(s);
    const dirty = this.ws.isDirty(s.file);
    const hasRow = !!rows && this.selected >= 0 && this.selected < rows.length;
    // A single-row file (one map per file) always holds exactly one row.
    const single = fileShape(this.ws.data(s.file), s.table, s.idField) === 'single';
    fill(
      this.toolbarEl,
      this.searchInput,
      button(T.common.add, () => this.addRow(), { disabled: ro || !rows || single }),
      button(T.common.copy, () => this.copySelected(), { disabled: ro || !hasRow || single }),
      button(T.common.remove, () => this.deleteSelected(), {
        disabled: ro || !hasRow || single,
        class: 'danger',
      }),
      h('span', { class: 'spacer' }),
      button(T.common.save, () => this.openReview(), { disabled: ro || !dirty, class: 'primary' }),
      button(T.common.discard, () => this.discard(), { disabled: !dirty }),
      button(T.common.reload, () => void this.ws.reload(s.file)),
    );
  }

  private renderNotices(): void {
    clear(this.noticeEl);
    const s = this.schema;
    if (!s) return;
    const st = this.ws.file(s.file);
    const data = this.ws.data(s.file);
    if (st?.staleDraft)
      this.noticeEl.append(h('div', { class: 'notice warn', text: T.content.staleDraft }));
    if (st?.error) this.noticeEl.append(h('div', { class: 'notice bad', text: st.error }));
    if (data === undefined) {
      this.noticeEl.append(
        h(
          'div',
          { class: 'notice warn' },
          T.content.fileMissing,
          ' ',
          this.ws.readOnly
            ? null
            : button(T.content.fileMissingCreate, () => this.ws.setData(s.file, [])),
        ),
      );
    } else if (!rowsOf(data, s.table, s.idField)) {
      this.noticeEl.append(h('div', { class: 'notice', text: T.content.fileNotRows }));
    }
  }

  private renderTable(): void {
    clear(this.tableEl);
    const s = this.schema;
    if (!s) return;
    const rows = this.ws.rows(s);
    if (!rows) return;
    const cols = tableColumns(s);
    const fieldOf = (k: string) => s.fields.find((f) => f.key === k);
    let idx = filterRows(s, rows, this.query);
    if (this.sortKey) idx = sortIndices(rows, idx, this.sortKey, this.sortDir);
    const problemRows = new Set(this.fileProblems(s).map((p) => p.index));
    const head = h('tr', null);
    for (const c of cols) {
      const arrow = this.sortKey === c ? (this.sortDir === 'asc' ? ' ^' : ' v') : '';
      head.append(
        h('th', {
          text: `${fieldOf(c)?.label ?? c}${arrow}`,
          title: T.content.sortHint,
          on: {
            click: () => {
              if (this.sortKey === c) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
              else {
                this.sortKey = c;
                this.sortDir = 'asc';
              }
              this.renderTable();
            },
          },
        }),
      );
    }
    const body = h('tbody', null);
    for (const i of idx.slice(0, MAX_TABLE_ROWS)) {
      const row = rows[i] as Row;
      const tr = h('tr', {
        class: `${i === this.selected ? 'selected' : ''}${problemRows.has(i) ? ' has-problem' : ''}`,
        on: {
          click: () => {
            this.selectRow(i);
            this.refresh();
          },
        },
      });
      for (const c of cols) tr.append(h('td', { text: cellText(fieldOf(c), row[c]) }));
      body.append(tr);
    }
    this.tableEl.append(h('table', { class: 'grid' }, h('thead', null, head), body));
    if (idx.length > MAX_TABLE_ROWS) {
      this.tableEl.append(h('p', { class: 'muted', text: `${MAX_TABLE_ROWS} / ${idx.length}` }));
    }
  }

  private renderProblems(): void {
    clear(this.problemsEl);
    const s = this.schema;
    if (!s) return;
    const fieldProbs = this.fileProblems(s);
    const contentProbs = this.ws.problems();
    const fieldList = h('ul', { class: 'problem-list' });
    for (const p of fieldProbs.slice(0, MAX_PROBLEMS)) {
      const label = s.fields.find((f) => f.key === p.field)?.label ?? p.field;
      fieldList.append(
        h(
          'li',
          {
            class: 'link',
            on: {
              click: () => {
                this.selectRow(p.index);
                this.refresh();
              },
            },
          },
          `${p.id ?? fmt(T.content.rowIndex, { n: p.index + 1 })} | ${label}：${p.message}`,
        ),
      );
    }
    const contentList = h('ul', { class: 'problem-list' });
    for (const p of contentProbs.slice(0, MAX_PROBLEMS)) contentList.append(h('li', { text: p }));
    append(
      this.problemsEl,
      h('div', { class: 'sub-title', text: `${T.content.fieldProblems}（${fieldProbs.length}）` }),
      fieldProbs.length ? fieldList : h('p', { class: 'muted', text: T.content.noProblems }),
      h('div', {
        class: 'sub-title',
        text: `${T.content.contentProblems}（${contentProbs.length}）`,
      }),
      contentProbs.length ? contentList : h('p', { class: 'muted', text: T.content.noProblems }),
    );
  }

  // -------------------------------------------------------------------------
  // Form

  private renderForm(): void {
    clear(this.formEl);
    const s = this.schema;
    this.formSchema = s;
    if (!s) return;
    const data = this.ws.data(s.file);
    const rows = rowsOf(data, s.table, s.idField);
    this.formRow = this.formKey();
    if (data !== undefined && !rows) {
      this.renderRawForm(s, data);
      return;
    }
    const row = rows?.[this.selected];
    if (!row) {
      this.formEl.append(h('p', { class: 'muted', text: T.content.noSelection }));
      return;
    }
    const ro = this.ws.readOnly;
    this.formEl.append(
      h('div', {
        class: 'pane-title',
        text: `${idOf(row, s.idField) ?? ''} ${s.nameField ? String(row[s.nameField] ?? '') : ''}`,
      }),
    );
    for (const field of s.fields) this.formEl.append(this.fieldControl(s, field, row, ro));
    // Undeclared keys (for example a map's sediment) stay editable as one JSON object.
    const extras = extraFields(s, row);
    const extraArea = h('textarea', {
      class: 'mono',
      rows: Math.min(10, Math.max(2, JSON.stringify(extras, null, 2).split('\n').length)),
      value: Object.keys(extras).length ? JSON.stringify(extras, null, 2) : '',
      disabled: ro,
    });
    const extraNote = h('div', { class: 'field-note' }, T.content.extraFieldsHelp);
    extraArea.addEventListener('input', () => {
      const text = extraArea.value.trim();
      let parsed: unknown = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch (e) {
        extraNote.textContent = fmt(T.field.badJsonDetail, { detail: errorMessage(e) });
        extraNote.className = 'field-note bad';
        return;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        extraNote.textContent = T.field.badJson;
        extraNote.className = 'field-note bad';
        return;
      }
      extraNote.textContent = T.content.extraFieldsHelp;
      extraNote.className = 'field-note';
      this.updateRow((r) => withExtraFields(s, r, parsed as Row));
    });
    this.formEl.append(formRow(T.content.extraFields, extraArea, extraNote));
  }

  private renderRawForm(s: TableSchema, data: unknown): void {
    const area = h('textarea', {
      class: 'mono raw-json',
      value: JSON.stringify(data, null, 2),
      disabled: this.ws.readOnly,
    });
    const note = h('div', { class: 'field-note' });
    area.addEventListener('input', () => {
      try {
        const parsed = JSON.parse(area.value);
        note.textContent = '';
        note.className = 'field-note';
        this.formRow = parsed;
        this.ws.setData(s.file, parsed);
      } catch (e) {
        note.textContent = fmt(T.field.badJsonDetail, { detail: errorMessage(e) });
        note.className = 'field-note bad';
      }
    });
    append(this.formEl, h('div', { class: 'pane-title', text: T.content.rawJson }), area, note);
  }

  private fieldControl(s: TableSchema, field: FieldSchema, row: Row, ro: boolean): HTMLElement {
    const value = row[field.key];
    const note = h('div', { class: 'field-note' });
    const showProblems = (v: unknown) => {
      const probs = validateField(field, v, this.refs);
      note.textContent = probs.map((p) => p.message).join('；') || field.help || '';
      note.className = probs.length ? 'field-note bad' : 'field-note';
    };
    const commit = (raw: string) => {
      const prev = (this.ws.rows(s) ?? [])[this.selected]?.[field.key];
      const r = parseValue(field, raw, prev);
      if (!r.ok) {
        note.textContent = r.error;
        note.className = 'field-note bad';
        return;
      }
      showProblems(r.value);
      this.updateRow((cur) => setField(cur, field.key, r.value));
      if (field.key === s.idField) this.syncParams();
    };
    let control: HTMLElement;
    switch (field.type) {
      case 'boolean': {
        const opts = [
          { value: '', label: T.common.unset },
          { value: 'true', label: T.common.yes },
          { value: 'false', label: T.common.no },
        ];
        control = this.selectControl(opts, formatValue(field, value), commit, ro);
        break;
      }
      case 'enum': {
        const opts = [{ value: '', label: T.common.unset }];
        for (const o of field.options ?? []) opts.push({ value: o, label: o });
        control = this.selectControl(opts, formatValue(field, value), commit, ro);
        break;
      }
      case 'ref': {
        const ids = field.refTable ? this.ws.tableIds(field.refTable) : undefined;
        if (!ids) {
          control = this.inputControl('text', formatValue(field, value), commit, ro);
          break;
        }
        const opts = [{ value: '', label: T.common.unset }];
        for (const id of [...ids].sort()) opts.push({ value: id, label: id });
        control = this.selectControl(opts, formatValue(field, value), commit, ro);
        break;
      }
      case 'text':
        control = this.areaControl(formatValue(field, value), commit, ro, false);
        break;
      case 'list':
        control = this.areaControl(
          formatValue(field, value),
          commit,
          ro,
          listMode(value) === 'json',
        );
        break;
      case 'json':
        control = this.areaControl(formatValue(field, value), commit, ro, true);
        break;
      case 'number':
        control = this.inputControl('text', formatValue(field, value), commit, ro);
        control.setAttribute('inputmode', 'decimal');
        break;
      default:
        control = this.inputControl('text', formatValue(field, value), commit, ro);
    }
    showProblems(value);
    const label = `${field.label}${field.required ? ' *' : ''}`;
    const rowEl = formRow(label, control, note);
    rowEl.setAttribute('data-field', field.key);
    rowEl.title = `${field.key} (${field.type}${field.refTable ? ` -> ${field.refTable}` : ''})`;
    return rowEl;
  }

  private inputControl(
    type: string,
    value: string,
    commit: (raw: string) => void,
    ro: boolean,
  ): HTMLInputElement {
    const el = h('input', { type, value, disabled: ro });
    el.addEventListener('input', () => commit(el.value));
    return el;
  }

  private areaControl(
    value: string,
    commit: (raw: string) => void,
    ro: boolean,
    mono: boolean,
  ): HTMLTextAreaElement {
    const lines = value.split('\n').length;
    const el = h('textarea', {
      value,
      rows: Math.min(16, Math.max(2, lines)),
      disabled: ro,
      class: mono ? 'mono' : '',
    });
    el.addEventListener('input', () => commit(el.value));
    return el;
  }

  private selectControl(
    opts: { value: string; label: string }[],
    value: string,
    commit: (raw: string) => void,
    ro: boolean,
  ): HTMLSelectElement {
    if (value !== '' && !opts.some((o) => o.value === value)) {
      opts.push({ value, label: `${value}${T.common.missingSuffix}` });
    }
    const el = h('select', { disabled: ro });
    for (const o of opts) el.append(h('option', { value: o.value, text: o.label }));
    el.value = value;
    el.addEventListener('change', () => commit(el.value));
    return el;
  }

  private updateRow(fn: (row: Row) => Row): void {
    const s = this.schema;
    if (!s || this.ws.readOnly) return;
    const rows = [...(this.ws.rows(s) ?? [])];
    const cur = rows[this.selected];
    if (!cur) return;
    const next = fn(cur);
    rows[this.selected] = next;
    // Mark the new row as the form's own, so the refresh keeps the inputs (and focus).
    this.formRow = next;
    this.ws.setRows(s, rows);
  }

  // -------------------------------------------------------------------------
  // Row commands

  private addRow(): void {
    const s = this.schema;
    if (!s) return;
    const rows = [...(this.ws.rows(s) ?? [])];
    rows.push(newRow(s, rows, ROW_TEMPLATES));
    this.selected = rows.length - 1;
    this.formRow = undefined;
    this.query = '';
    this.searchInput.value = '';
    this.ws.setRows(s, rows);
    this.syncParams();
  }

  private copySelected(): void {
    const s = this.schema;
    if (!s) return;
    const rows = [...(this.ws.rows(s) ?? [])];
    const cur = rows[this.selected];
    if (!cur) return;
    rows.splice(this.selected + 1, 0, copyRow(s, cur, rows));
    this.selected += 1;
    this.formRow = undefined;
    this.ws.setRows(s, rows);
    this.syncParams();
  }

  private deleteSelected(): void {
    const s = this.schema;
    if (!s) return;
    const rows = [...(this.ws.rows(s) ?? [])];
    const cur = rows[this.selected];
    if (!cur) return;
    const id = idOf(cur, s.idField) ?? fmt(T.content.rowIndex, { n: this.selected + 1 });
    if (!window.confirm(fmt(T.content.confirmDelete, { id }))) return;
    rows.splice(this.selected, 1);
    this.selected = Math.min(this.selected, rows.length - 1);
    this.formRow = undefined;
    this.ws.setRows(s, rows);
    this.syncParams();
  }

  private discard(): void {
    const s = this.schema;
    if (!s) return;
    this.ws.discard(s.file);
    this.reviewOpen = false;
    this.reviewEl.hidden = true;
    this.formRow = undefined;
    this.host.notify(T.content.discarded);
  }

  // -------------------------------------------------------------------------
  // Save review

  private openReview(): void {
    const s = this.schema;
    if (!s || this.ws.readOnly || !this.ws.isDirty(s.file)) return;
    this.reviewOpen = true;
    this.renderReview();
  }

  private renderReview(): void {
    const s = this.schema;
    if (!s || !this.ws.isDirty(s.file)) {
      this.reviewOpen = false;
      this.reviewEl.hidden = true;
      return;
    }
    this.reviewEl.hidden = false;
    const st = this.ws.file(s.file);
    const before = rowsOf(st?.original, s.table, s.idField);
    const after = this.ws.rows(s);
    const body = h('div', { class: 'review-body' });
    if (before && after) {
      const d = diffRows(before, after, s.idField);
      if (isEmptyDiff(d)) body.append(h('p', { text: T.content.reviewNoChanges }));
      else {
        const ul = h('ul', null);
        if (d.added.length)
          ul.append(h('li', { text: `${T.content.diffAdded}：${d.added.join(', ')}` }));
        if (d.removed.length)
          ul.append(h('li', { text: `${T.content.diffRemoved}：${d.removed.join(', ')}` }));
        for (const c of d.changed) {
          ul.append(
            h('li', { text: `${T.content.diffChanged}：${c.id}（${c.fields.join(', ')}）` }),
          );
        }
        if (d.reordered) ul.append(h('li', { text: T.content.diffReordered }));
        body.append(ul);
      }
    } else body.append(h('p', { text: T.content.diffWhole }));
    // Every dirty file is saved one at a time; other drafts still count for validation.
    const otherDirty = this.ws.dirtyFiles().filter((f) => f !== s.file);
    if (otherDirty.length) {
      body.append(
        h('p', {
          class: 'muted',
          text: fmt(T.content.otherDrafts, { files: otherDirty.join(', ') }),
        }),
      );
    }
    const fieldErrors = this.fileProblems(s).length;
    const contentErrors = this.ws.problems().length;
    if (fieldErrors + contentErrors > 0) {
      body.append(
        h('p', {
          class: 'bad',
          text: `${T.content.reviewHasErrors} ${T.content.fieldProblems} ${fieldErrors}，${T.content.problemsTitle} ${contentErrors}`,
        }),
      );
    }
    fill(
      this.reviewEl,
      h('div', { class: 'sub-title', text: `${T.content.reviewTitle}：data/${s.file}` }),
      body,
      h(
        'div',
        { class: 'toolbar' },
        button(T.content.reviewConfirm, () => void this.save(), { class: 'primary' }),
        button(T.common.cancel, () => {
          this.reviewOpen = false;
          this.reviewEl.hidden = true;
        }),
      ),
    );
  }

  private async save(): Promise<void> {
    const s = this.schema;
    if (!s) return;
    const res = await this.ws.save(s.file);
    this.reviewOpen = false;
    this.reviewEl.hidden = true;
    if (res.ok) this.host.notify(`${T.content.saved}：data/${s.file}`, 'ok');
    else this.host.notify(`${T.content.saveFailed}：${res.message}`, 'error');
  }
}
