// Map editor: every map row of every `maps` data file, drawn on a canvas. Brush,
// rectangle fill and colour pick for tiles; locations (rectangles), spawns and exits
// (with toLocation); walkability and connectivity overlays; map checks with jump-to;
// undo and redo per map; save through the workspace. Strokes and drags are batched
// into one undo step and written to the workspace when they end.

import type { TableSchema } from '../../content/pack';
import type { ExitDef, LocationDef, MapDef, SpawnDef, TileKind } from '../../systems/world/types';
import { fileShape, idOf, type Row } from '../content/rows';
import {
  append,
  button,
  checkbox,
  clear,
  fill,
  formRow,
  h,
  rafThrottle,
  typingInField,
} from '../shell/dom';
import type { EditorTool, ToolHost } from '../shell/tool';
import type { Workspace } from '../state/workspace';
import { T, TILE_LABELS } from '../text';
import type { History } from '../util/history';
import { drawMap, type MapOverlays, sizeCanvas } from './map_canvas';
import { type Components, checkMap, type MapIssue, walkComponents } from './map_checks';
import {
  addObject,
  blankMap,
  type Cell,
  charAt,
  fillRect,
  findObject,
  hitTest,
  isMapLike,
  legendUsage,
  lineCells,
  moveObject,
  newExit,
  newLocation,
  newSpawn,
  type ObjectRef,
  paintCells,
  rectBetween,
  removeLegend,
  removeObject,
  resizeMap,
  setLegend,
  uniqueId,
  updateObject,
} from './map_ops';
import { MapEditSession } from './map_session';
import { TILE_KINDS, tileColor } from './palette';

type ToolMode = 'select' | 'brush' | 'rect' | 'pick' | 'location' | 'spawn' | 'exit';

interface Entry {
  key: string;
  file: string;
  schema: TableSchema;
  index: number;
  row: Row;
  map: MapDef | null;
}

type Drag =
  | { mode: 'paint'; last: Cell }
  | { mode: 'rect' | 'location'; start: Cell }
  | { mode: 'move'; last: Cell };

const TOOL_KEYS: Record<string, ToolMode> = {
  v: 'select',
  b: 'brush',
  r: 'rect',
  i: 'pick',
  l: 'location',
  s: 'spawn',
  e: 'exit',
};

export class MapTool implements EditorTool {
  readonly id = 'map';
  readonly label = T.nav.map;
  private host!: ToolHost;
  private ws!: Workspace;
  private visible = false;
  private entries: Entry[] = [];
  private currentKey = '';
  private tool: ToolMode = 'brush';
  private brush = '.';
  private zoom = 20;
  private overlays: MapOverlays = {
    walk: false,
    components: false,
    grid: true,
    labels: true,
    issues: true,
  };
  private selection: ObjectRef | null = null;
  private hover: Cell | null = null;
  private focus: Cell | null = null;
  private preview: { x: number; y: number; w: number; h: number } | null = null;
  private drag: Drag | null = null;
  private issues: MapIssue[] = [];
  private issuesFor: MapDef | null = null;
  private comps: { map: MapDef; comps: Components } | null = null;
  private checkTimer = 0;
  private listEl!: HTMLElement;
  private toolbarEl!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private canvasWrap!: HTMLElement;
  private cursorEl!: HTMLElement;
  private sideEl!: HTMLElement;
  private readonly redraw = rafThrottle(() => this.draw());
  private readonly session = new MapEditSession({
    get: (key) => this.entries.find((e) => e.key === key)?.map ?? null,
    set: (key, map) => this.storeSet(key, map),
  });

  mount(root: HTMLElement, host: ToolHost): void {
    this.host = host;
    this.ws = host.ws;
    this.listEl = h('div', { class: 'schema-list' });
    this.toolbarEl = h('div', { class: 'toolbar wrap' });
    this.canvas = h('canvas', { class: 'map-canvas' });
    this.canvasWrap = h('div', { class: 'canvas-wrap' }, this.canvas);
    this.cursorEl = h('div', { class: 'muted small' });
    this.sideEl = h('div', { class: 'map-side' });
    append(
      root,
      h(
        'div',
        { class: 'map-tool' },
        h(
          'aside',
          { class: 'pane list-pane' },
          h('div', { class: 'pane-title', text: T.map.maps }),
          this.listEl,
        ),
        h(
          'section',
          { class: 'pane canvas-pane' },
          this.toolbarEl,
          this.canvasWrap,
          this.cursorEl,
          h('div', { class: 'muted small', text: T.map.shortcuts }),
        ),
        h('section', { class: 'pane side-pane' }, this.sideEl),
      ),
    );
    this.canvas.addEventListener('mousedown', (e) => this.onDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMove(e));
    this.canvas.addEventListener('mouseleave', () => {
      this.hover = null;
      this.redraw();
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mouseup', () => this.onUp());
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.ws.subscribe(() => {
      if (this.visible) this.sync();
    });
  }

  show(params: Record<string, string>): void {
    this.visible = true;
    this.collect();
    const wanted = this.entries.find(
      (e) => (!params.file || e.file === params.file) && e.map?.id === params.map,
    );
    if (wanted) this.setCurrent(wanted.key, false);
    else if (!this.current() && this.entries[0]) this.setCurrent(this.entries[0].key, false);
    this.session.reconcile(this.currentKey);
    const x = Number(params.x);
    const y = Number(params.y);
    this.focus =
      params.x !== undefined && Number.isFinite(x) && Number.isFinite(y)
        ? { x: Math.floor(x), y: Math.floor(y) }
        : null;
    this.renderAll();
    if (this.focus) this.scrollToCell(this.focus);
  }

  hide(): void {
    this.visible = false;
    this.cancelDrag();
  }

  // -------------------------------------------------------------------------
  // Model plumbing

  private collect(): void {
    const out: Entry[] = [];
    for (const schema of this.ws.schemasForTable('maps')) {
      const rows = this.ws.rows(schema) ?? [];
      rows.forEach((row, index) => {
        out.push({
          key: `${schema.file}#${index}`,
          file: schema.file,
          schema,
          index,
          row,
          map: isMapLike(row) ? row : null,
        });
      });
    }
    this.entries = out;
  }

  private current(): Entry | undefined {
    return this.entries.find((e) => e.key === this.currentKey);
  }

  private hist(): History<MapDef> | undefined {
    return this.session.history(this.currentKey);
  }

  private map(): MapDef | undefined {
    return this.session.present(this.currentKey);
  }

  private setCurrent(key: string, render = true): void {
    if (key === this.currentKey) return;
    this.cancelDrag();
    this.currentKey = key;
    this.selection = null;
    this.focus = null;
    this.issuesFor = null;
    this.session.reconcile(key);
    const map = this.map();
    if (map && !(this.brush in map.legend)) this.brush = Object.keys(map.legend)[0] ?? '.';
    const e = this.current();
    if (e?.map) this.host.setParams({ file: e.file, map: e.map.id });
    if (render) this.renderAll();
  }

  /** Workspace changed: re-read entries, keep the current map, adopt outside edits. */
  private sync(): void {
    const prev = this.current();
    this.collect();
    if (prev && !this.current()) {
      const same = this.entries.find((e) => e.file === prev.file && e.map?.id === prev.map?.id);
      this.currentKey = same?.key ?? this.entries[0]?.key ?? '';
    }
    this.session.reconcile(this.currentKey);
    this.renderAll();
  }

  /** Record an edit: written to the workspace now, or when the open stroke/drag ends. */
  private commit(next: MapDef): void {
    if (this.ws.readOnly) return;
    this.session.apply(this.currentKey, next);
    this.redraw();
  }

  /** The workspace side of the edit session: entries are rows of `maps` data files. */
  private storeSet(key: string, map: MapDef): void {
    const e = this.entries.find((x) => x.key === key);
    if (!e || this.ws.readOnly) return;
    const rows = [...(this.ws.rows(e.schema) ?? [])];
    rows[e.index] = map as unknown as Row;
    this.ws.setRows(e.schema, rows);
  }

  // -------------------------------------------------------------------------
  // Input

  private cellOf(ev: MouseEvent): Cell | null {
    const map = this.map();
    if (!map) return null;
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor((ev.clientX - r.left) / this.zoom);
    const y = Math.floor((ev.clientY - r.top) / this.zoom);
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
    return { x, y };
  }

  private onDown(ev: MouseEvent): void {
    const map = this.map();
    const cell = this.cellOf(ev);
    const key = this.currentKey;
    if (!map || !cell) return;
    this.focus = null;
    if (
      ev.button === 2 ||
      (ev.button === 0 && ev.altKey) ||
      (ev.button === 0 && this.tool === 'pick')
    ) {
      const ch = charAt(map, cell.x, cell.y);
      if (ch !== undefined) this.brush = ch;
      if (this.tool === 'pick') this.tool = 'brush';
      this.renderAll();
      return;
    }
    if (ev.button !== 0) return;
    const ro = this.ws.readOnly;
    if (this.tool === 'select' || ro) {
      this.selection = hitTest(map, cell.x, cell.y);
      if (this.selection && !ro) {
        this.session.begin(key);
        this.drag = { mode: 'move', last: cell };
      }
      this.renderSide();
      this.redraw();
      return;
    }
    switch (this.tool) {
      case 'brush':
        this.session.begin(key);
        this.drag = { mode: 'paint', last: cell };
        this.commit(paintCells(map, [cell], this.brush));
        break;
      case 'rect':
      case 'location':
        this.drag = { mode: this.tool, start: cell };
        this.preview = rectBetween(cell, cell);
        this.redraw();
        break;
      case 'spawn': {
        const sp = newSpawn(map, cell);
        this.selection = { kind: 'spawn', id: sp.id };
        this.commit(addObject(map, 'spawn', sp));
        break;
      }
      case 'exit': {
        const ex = newExit(map, cell);
        this.selection = { kind: 'exit', id: ex.id };
        this.commit(addObject(map, 'exit', ex));
        break;
      }
    }
  }

  private onMove(ev: MouseEvent): void {
    const cell = this.cellOf(ev);
    const map = this.map();
    if (!map) return;
    const changed = cell?.x !== this.hover?.x || cell?.y !== this.hover?.y;
    this.hover = cell;
    if (cell) {
      const ch = charAt(map, cell.x, cell.y) ?? '';
      const kind = map.legend[ch];
      this.cursorEl.textContent = `${T.map.cursor} ${cell.x}, ${cell.y} | "${ch}" ${kind ? (TILE_LABELS[kind] ?? kind) : ''}`;
    }
    const d = this.drag;
    if (d && cell && changed) {
      if (d.mode === 'paint') {
        this.commit(paintCells(map, lineCells(d.last, cell), this.brush));
        d.last = cell;
      } else if (d.mode === 'rect' || d.mode === 'location') {
        this.preview = rectBetween(d.start, cell);
      } else if (d.mode === 'move' && this.selection) {
        this.commit(moveObject(map, this.selection, cell.x - d.last.x, cell.y - d.last.y));
        d.last = cell;
      }
    }
    if (changed) this.redraw();
  }

  private onUp(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const map = this.map();
    if (!map) return;
    if (d.mode === 'paint' || d.mode === 'move') {
      this.session.end(this.currentKey);
      this.renderAll();
      return;
    }
    const rect = this.preview;
    this.preview = null;
    if (!rect) return;
    if (d.mode === 'rect') this.commit(fillRect(map, rect, this.brush));
    else {
      const loc = newLocation(map, rect);
      this.selection = { kind: 'location', id: loc.id };
      this.commit(addObject(map, 'location', loc));
    }
  }

  private cancelDrag(): void {
    if (!this.drag) return;
    this.drag = null;
    this.preview = null;
    this.session.cancel(this.currentKey);
    this.redraw();
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.visible || typingInField()) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && key === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (key === 'escape') {
      this.cancelDrag();
      this.selection = null;
      this.renderAll();
      return;
    }
    if ((key === 'delete' || key === 'backspace') && this.selection) {
      e.preventDefault();
      this.deleteSelection();
      return;
    }
    const tool = TOOL_KEYS[key];
    if (tool) {
      this.tool = tool;
      this.renderToolbar();
    }
  }

  private undo(): void {
    if (this.ws.readOnly) return;
    if (this.session.undo(this.currentKey)) this.renderAll();
  }

  private redo(): void {
    if (this.ws.readOnly) return;
    if (this.session.redo(this.currentKey)) this.renderAll();
  }

  private deleteSelection(): void {
    const map = this.map();
    if (!map || !this.selection) return;
    const next = removeObject(map, this.selection);
    this.selection = null;
    this.commit(next);
  }

  // -------------------------------------------------------------------------
  // Rendering

  private renderAll(): void {
    this.renderList();
    this.renderToolbar();
    this.renderSide();
    this.scheduleChecks();
    this.redraw();
  }

  private draw(): void {
    const map = this.map();
    if (!map) {
      const ctx = this.canvas.getContext('2d');
      ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    const ctx = sizeCanvas(this.canvas, map, this.zoom);
    if (!ctx) return;
    if (this.overlays.components && this.comps?.map !== map) {
      this.comps = { map, comps: walkComponents(map) };
    }
    drawMap(ctx, map, {
      tile: this.zoom,
      overlays: this.overlays,
      selection: this.selection,
      hover: this.hover,
      focus: this.focus,
      preview: this.preview,
      issues: this.issuesFor === map ? this.issues : [],
      comps: this.overlays.components ? (this.comps?.comps ?? null) : null,
    });
  }

  private scrollToCell(c: Cell): void {
    const z = this.zoom;
    this.canvasWrap.scrollTo({
      left: Math.max(0, c.x * z - this.canvasWrap.clientWidth / 2),
      top: Math.max(0, c.y * z - this.canvasWrap.clientHeight / 2),
    });
  }

  private renderList(): void {
    clear(this.listEl);
    const schemas = this.ws.schemasForTable('maps');
    if (schemas.length === 0 || this.entries.length === 0) {
      this.listEl.append(h('p', { class: 'muted', text: T.map.noMaps }));
    }
    for (const schema of schemas) {
      const dirty = this.ws.isDirty(schema.file);
      this.listEl.append(
        h(
          'div',
          { class: 'sub-title' },
          `data/${schema.file}`,
          dirty ? h('span', { class: 'badge warn', text: T.content.dirtyMark }) : null,
        ),
      );
      for (const e of this.entries.filter((x) => x.file === schema.file)) {
        const label = e.map
          ? `${e.map.name || e.map.id}`
          : `${idOf(e.row, e.schema.idField) ?? `#${e.index + 1}`}`;
        this.listEl.append(
          h(
            'button',
            {
              type: 'button',
              class: `schema-item${e.key === this.currentKey ? ' active' : ''}${e.map ? '' : ' bad'}`,
              on: { click: () => this.setCurrent(e.key) },
            },
            h('span', { class: 'schema-label', text: label }),
            h('span', {
              class: 'schema-meta',
              text: e.map ? `${e.map.id} | ${e.map.width}x${e.map.height}` : T.map.badMap,
            }),
          ),
        );
      }
      const single = fileShape(this.ws.data(schema.file), 'maps', schema.idField) === 'single';
      if (!this.ws.readOnly && !single) {
        this.listEl.append(button(T.map.newMap, () => this.newMap(schema), { class: 'small' }));
      }
    }
  }

  private renderToolbar(): void {
    const ro = this.ws.readOnly;
    const hist = this.hist();
    const e = this.current();
    const toolBtn = (mode: ToolMode, label: string) =>
      button(
        label,
        () => {
          this.tool = mode;
          this.renderToolbar();
        },
        {
          class: `tool-btn${this.tool === mode ? ' active' : ''}`,
          disabled: ro && mode !== 'select',
        },
      );
    const zoom = h('input', {
      type: 'range',
      min: 6,
      max: 40,
      step: 1,
      value: String(this.zoom),
      title: T.map.zoom,
    });
    zoom.addEventListener('input', () => {
      this.zoom = Number(zoom.value);
      this.redraw();
    });
    const ov = (key: keyof MapOverlays, label: string) =>
      checkbox(label, this.overlays[key], (v) => {
        this.overlays[key] = v;
        this.redraw();
      });
    const dirty = e ? this.ws.isDirty(e.file) : false;
    fill(
      this.toolbarEl,
      toolBtn('select', T.map.select),
      toolBtn('brush', T.map.brush),
      toolBtn('rect', T.map.rect),
      toolBtn('pick', T.map.pick),
      toolBtn('location', T.map.location),
      toolBtn('spawn', T.map.spawn),
      toolBtn('exit', T.map.exit),
      h('span', { class: 'sep' }),
      button(T.map.undo, () => this.undo(), { disabled: ro || !hist?.canUndo }),
      button(T.map.redo, () => this.redo(), { disabled: ro || !hist?.canRedo }),
      h('span', { class: 'sep' }),
      h('label', { class: 'check' }, T.map.zoom, zoom),
      ov('walk', T.map.overlayWalk),
      ov('components', T.map.overlayComponents),
      ov('grid', T.map.overlayGrid),
      ov('labels', T.map.overlayLabels),
      ov('issues', T.map.overlayIssues),
      h('span', { class: 'spacer' }),
      button(T.common.save, () => void this.save(), { class: 'primary', disabled: ro || !dirty }),
      button(T.common.discard, () => e && this.ws.discard(e.file), { disabled: !dirty }),
    );
  }

  private renderSide(): void {
    clear(this.sideEl);
    const e = this.current();
    const map = this.map();
    if (!e || !map) {
      if (e && !e.map) {
        this.sideEl.append(
          h('p', { class: 'bad', text: T.map.badMap }),
          button(T.checks.openTable, () =>
            this.host.navigate('content', {
              file: e.file,
              table: 'maps',
              row: idOf(e.row, e.schema.idField) ?? `#${e.index + 1}`,
            }),
          ),
        );
      }
      return;
    }
    append(
      this.sideEl,
      this.paletteSection(map),
      this.selectionSection(map),
      this.propsSection(map),
      this.checksSection(),
    );
  }

  private paletteSection(map: MapDef): HTMLElement {
    const ro = this.ws.readOnly;
    const usage = legendUsage(map);
    const list = h('div', { class: 'palette' });
    for (const ch of Object.keys(map.legend)) {
      const kind = map.legend[ch] as TileKind;
      list.append(
        h(
          'button',
          {
            type: 'button',
            class: `swatch-item${ch === this.brush ? ' active' : ''}`,
            title: `${T.map.tileCount} ${usage[ch] ?? 0}`,
            on: {
              click: () => {
                this.brush = ch;
                if (this.tool === 'select' || this.tool === 'pick') this.tool = 'brush';
                this.renderToolbar();
                this.renderSide();
              },
            },
          },
          h('span', { class: 'swatch', style: `background:${tileColor(kind)}` }),
          h('code', { text: ch }),
          ` ${TILE_LABELS[kind] ?? kind}`,
          h('span', { class: 'muted small', text: ` ${usage[ch] ?? 0}` }),
        ),
      );
    }
    const chInput = h('input', { type: 'text', maxLength: 1, class: 'char-input', disabled: ro });
    const kindSel = h('select', { disabled: ro });
    for (const k of TILE_KINDS)
      kindSel.append(h('option', { value: k, text: `${TILE_LABELS[k]} (${k})` }));
    const addBtn = button(
      T.map.legendAdd,
      () => {
        const ch = chInput.value;
        if (ch.length !== 1) {
          this.host.notify(T.map.legendCharInvalid, 'error');
          return;
        }
        this.brush = ch;
        this.commit(setLegend(map, ch, kindSel.value as TileKind));
      },
      { disabled: ro },
    );
    const removeBtn = button(
      T.map.legendRemove,
      () => {
        const next = removeLegend(map, this.brush);
        if (!next) {
          this.host.notify(T.map.legendInUse, 'error');
          return;
        }
        this.commit(next);
        this.brush = Object.keys(next.legend)[0] ?? '.';
      },
      { disabled: ro },
    );
    return h(
      'div',
      { class: 'side-section' },
      h('div', { class: 'sub-title', text: T.map.legend }),
      list,
      h('div', { class: 'inline' }, chInput, kindSel, addBtn),
      h('div', { class: 'inline' }, removeBtn),
    );
  }

  private propsSection(map: MapDef): HTMLElement {
    const ro = this.ws.readOnly;
    const text = (label: string, key: 'id' | 'name' | 'region') => {
      const el = h('input', { type: 'text', value: String(map[key] ?? ''), disabled: ro });
      el.addEventListener('change', () => this.commit({ ...map, [key]: el.value }));
      return formRow(label, el);
    };
    const wIn = h('input', {
      type: 'number',
      min: 1,
      max: 512,
      value: String(map.width),
      disabled: ro,
    });
    const hIn = h('input', {
      type: 'number',
      min: 1,
      max: 512,
      value: String(map.height),
      disabled: ro,
    });
    const resize = button(
      T.map.resize,
      () => {
        this.commit(resizeMap(map, Number(wIn.value), Number(hIn.value), this.brush));
      },
      { disabled: ro },
    );
    const sed = h('input', {
      type: 'number',
      min: 0,
      max: 7,
      value: map.sediment === undefined ? '' : String(map.sediment),
      disabled: ro,
    });
    sed.addEventListener('change', () => {
      const v = sed.value.trim();
      const next: MapDef = { ...map };
      if (v === '') delete next.sediment;
      else next.sediment = Number(v);
      this.commit(next);
    });
    const indoor = h('input', { type: 'checkbox', checked: !!map.indoor, disabled: ro });
    indoor.addEventListener('change', () => this.commit({ ...map, indoor: indoor.checked }));
    return h(
      'div',
      { class: 'side-section' },
      h('div', { class: 'sub-title', text: T.map.properties }),
      text(T.common.id, 'id'),
      text(T.common.name, 'name'),
      text(T.map.region, 'region'),
      formRow(`${T.map.width} x ${T.map.height}`, h('div', { class: 'inline' }, wIn, hIn, resize)),
      formRow(T.map.sediment, sed),
      formRow(T.map.indoor, indoor),
    );
  }

  private selectionSection(map: MapDef): HTMLElement {
    const box = h(
      'div',
      { class: 'side-section' },
      h('div', { class: 'sub-title', text: T.map.selection }),
    );
    const sel = this.selection;
    const obj = sel ? findObject(map, sel) : undefined;
    if (!sel || !obj) {
      box.append(h('p', { class: 'muted small', text: T.map.noSelectionHint }));
      return box;
    }
    const ro = this.ws.readOnly;
    const set = (patch: Record<string, unknown>) => {
      if (typeof patch.id === 'string' && patch.id !== sel.id) {
        this.selection = { kind: sel.kind, id: patch.id };
      }
      this.commit(updateObject(map, sel, patch));
    };
    const str = (label: string, key: string, value: unknown, optional = false) => {
      const el = h('input', {
        type: 'text',
        value: value === undefined ? '' : String(value),
        disabled: ro,
      });
      el.addEventListener('change', () =>
        set({ [key]: optional && el.value === '' ? undefined : el.value }),
      );
      return formRow(label, el);
    };
    const num = (label: string, key: string, value: unknown, optional = false) => {
      const el = h('input', {
        type: 'number',
        step: 'any',
        value: value === undefined ? '' : String(value),
        disabled: ro,
      });
      el.addEventListener('change', () => {
        const v = el.value.trim();
        if (v === '' && optional) set({ [key]: undefined });
        else if (Number.isFinite(Number(v)) && v !== '') set({ [key]: Number(v) });
      });
      return formRow(label, el);
    };
    const flags = (label: string, key: string, value: string[] | undefined) => {
      const el = h('input', {
        type: 'text',
        value: (value ?? []).join(', '),
        placeholder: T.map.flagsHelp,
        disabled: ro,
      });
      el.addEventListener('change', () => {
        const list = el.value
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean);
        set({ [key]: list.length ? list : undefined });
      });
      return formRow(label, el);
    };
    if (sel.kind === 'location') {
      const l = obj as LocationDef;
      append(
        box,
        str(T.common.id, 'id', l.id),
        str(T.common.name, 'name', l.name),
        str(T.map.locKind, 'kind', l.kind),
        num(T.map.x, 'x', l.x),
        num(T.map.y, 'y', l.y),
        num(T.map.w, 'w', l.w),
        num(T.map.h, 'h', l.h),
        flags(T.map.tags, 'tags', l.tags),
      );
    } else if (sel.kind === 'spawn') {
      const s = obj as SpawnDef;
      const kindSel = h('select', { disabled: ro });
      for (const k of ['monster', 'npc', 'object'])
        kindSel.append(h('option', { value: k, text: k }));
      kindSel.value = s.kind;
      kindSel.addEventListener('change', () => set({ kind: kindSel.value }));
      append(
        box,
        str(T.common.id, 'id', s.id),
        formRow(T.map.spawnKind, kindSel),
        str(T.map.spawnRef, 'ref', s.ref),
        num(T.map.x, 'x', s.x),
        num(T.map.y, 'y', s.y),
        num(T.map.spawnCount, 'count', s.count, true),
        num(T.map.spawnRadius, 'radius', s.radius, true),
        num(T.map.respawn, 'respawnMinutes', s.respawnMinutes, true),
        flags(T.map.requiresFlags, 'requiresFlags', s.requiresFlags),
      );
    } else {
      const x = obj as ExitDef;
      const maps = this.allMaps();
      const mapSel = h('select', { disabled: ro });
      mapSel.append(h('option', { value: '', text: T.common.unset }));
      for (const m of maps) mapSel.append(h('option', { value: m.id, text: `${m.id} ${m.name}` }));
      if (x.toMap && !maps.some((m) => m.id === x.toMap)) {
        mapSel.append(h('option', { value: x.toMap, text: `${x.toMap}${T.common.missingSuffix}` }));
      }
      mapSel.value = x.toMap;
      mapSel.addEventListener('change', () => set({ toMap: mapSel.value }));
      const target = maps.find((m) => m.id === x.toMap);
      const locSel = h('select', { disabled: ro });
      locSel.append(h('option', { value: '', text: T.common.unset }));
      for (const l of target?.locations ?? [])
        locSel.append(h('option', { value: l.id, text: `${l.id} ${l.name}` }));
      if (x.toLocation && !target?.locations.some((l) => l.id === x.toLocation)) {
        locSel.append(
          h('option', { value: x.toLocation, text: `${x.toLocation}${T.common.missingSuffix}` }),
        );
      }
      locSel.value = x.toLocation ?? '';
      locSel.addEventListener('change', () => set({ toLocation: locSel.value || undefined }));
      append(
        box,
        str(T.common.id, 'id', x.id),
        str(T.map.label, 'label', x.label),
        num(T.map.x, 'x', x.x),
        num(T.map.y, 'y', x.y),
        formRow(T.map.toMap, mapSel),
        formRow(
          T.map.toLocation,
          locSel,
          h('div', { class: 'field-note', text: `gate_${map.id}` }),
        ),
        num(T.map.toX, 'toX', x.toX),
        num(T.map.toY, 'toY', x.toY),
        flags(T.map.requiresFlags, 'requiresFlags', x.requiresFlags),
      );
    }
    box.append(
      button(T.common.remove, () => this.deleteSelection(), { class: 'danger', disabled: ro }),
    );
    return box;
  }

  private checksSection(): HTMLElement {
    const box = h(
      'div',
      { class: 'side-section' },
      h('div', { class: 'sub-title' }, `${T.map.checks}（${this.issues.length}）`),
    );
    const list = h('ul', { class: 'problem-list' });
    for (const i of this.issues) {
      list.append(
        h(
          'li',
          {
            class: `sev-${i.severity}${i.x !== undefined || i.ref ? ' link' : ''}`,
            on: {
              click: () => {
                if (i.ref) this.selection = i.ref;
                if (i.x !== undefined && i.y !== undefined) {
                  this.focus = { x: Math.floor(i.x), y: Math.floor(i.y) };
                  this.scrollToCell(this.focus);
                }
                this.renderSide();
                this.redraw();
              },
            },
          },
          h('span', { class: `sev ${i.severity}`, text: T.severity[i.severity] }),
          ` ${i.message}`,
        ),
      );
    }
    box.append(
      this.issues.length ? list : h('p', { class: 'muted small', text: T.content.noProblems }),
    );
    return box;
  }

  /** All maps (drafts included); the one being edited in its live state. */
  private allMaps(): MapDef[] {
    const present = this.map();
    const others = this.ws
      .content()
      .maps.filter((m) => isMapLike(m))
      .filter((m) => m.id !== present?.id);
    return present ? [...others, present] : others;
  }

  private scheduleChecks(): void {
    clearTimeout(this.checkTimer);
    this.checkTimer = window.setTimeout(() => {
      const map = this.map();
      if (!map || this.issuesFor === map) return;
      this.issues = checkMap(map, this.allMaps());
      this.issuesFor = map;
      if (this.visible) {
        this.renderSide();
        this.redraw();
      }
    }, 200);
  }

  private newMap(schema: TableSchema): void {
    const rows = [...(this.ws.rows(schema) ?? [])];
    const taken = this.ws.content().maps.map((m) => m.id);
    for (const r of rows) {
      const id = idOf(r, 'id');
      if (id) taken.push(id);
    }
    const id = uniqueId('new_map', taken);
    rows.push(blankMap(id, T.map.newMapName) as unknown as Row);
    this.ws.setRows(schema, rows);
    this.collect();
    const e = this.entries.find((x) => x.file === schema.file && x.map?.id === id);
    if (e) this.setCurrent(e.key);
  }

  private async save(): Promise<void> {
    const e = this.current();
    if (!e) return;
    const res = await this.ws.save(e.file);
    if (res.ok) this.host.notify(`${T.content.saved}：data/${e.file}`, 'ok');
    else this.host.notify(`${T.content.saveFailed}：${res.message}`, 'error');
  }
}
