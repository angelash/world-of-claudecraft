// Shared editor state: the data files every tool edits, their unsaved drafts, the dev
// service status, and the content rebuilt with all drafts applied (validated with the
// real validateContent). Drafts are mirrored to session storage, so a Vite reload after
// a save (or an accidental refresh) never loses other unsaved files.
// Pure: no DOM; the data API and storage are injected.

import { validateContent } from '../../content';
import type { ContentPack, TableSchema } from '../../content/pack';
import type { ContentMap } from '../../core/contracts';
import type { DataApi } from '../api/data_client';
import { type FilePatch, idOf, patchContent, type Row, rowsOf, withRows } from '../content/rows';
import { fmt, T } from '../text';
import { deepEqual, errorMessage, hashText } from '../util/json';

export type ApiState = 'unknown' | 'available' | 'unavailable';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export interface FileState {
  file: string;
  /** where `original` came from */
  source: 'api' | 'static' | 'missing';
  /** the file as on disk (undefined when missing) */
  original: unknown;
  hasDraft: boolean;
  draft: unknown;
  /** the draft was restored from storage but the file changed on disk since */
  staleDraft: boolean;
  error?: string;
}

export interface WorkspaceOptions {
  api: DataApi;
  schemas: readonly TableSchema[];
  packs: readonly ContentPack[];
  /** content as built from the bundled packs */
  baseContent: ContentMap;
  /** bundled data files, keyed by path under data/ */
  staticFiles: Record<string, unknown>;
  storage?: StorageLike;
}

export type SaveResult = { ok: true } | { ok: false; message: string };

const DRAFT_PREFIX = 'hakoniwa.editor.draft:';

export class Workspace {
  apiState: ApiState = 'unknown';
  apiMessage = '';
  restoredDrafts: string[] = [];
  readonly schemas: readonly TableSchema[];
  readonly packs: readonly ContentPack[];
  readonly baseContent: ContentMap;
  readonly staticFiles: Record<string, unknown>;
  private readonly api: DataApi;
  private readonly storage?: StorageLike;
  private readonly files = new Map<string, FileState>();
  private readonly listeners = new Set<() => void>();
  private contentCache: ContentMap | null = null;
  private problemCache: string[] | null = null;
  private version = 0;

  constructor(opts: WorkspaceOptions) {
    this.api = opts.api;
    this.schemas = opts.schemas;
    this.packs = opts.packs;
    this.baseContent = opts.baseContent;
    this.staticFiles = opts.staticFiles;
    this.storage = opts.storage;
  }

  get readOnly(): boolean {
    return this.apiState !== 'available';
  }

  /** Increments on every change; tools compare it to skip redundant renders. */
  get revision(): number {
    return this.version;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Distinct data files named by the schemas, in schema order. */
  schemaFiles(): string[] {
    return [...new Set(this.schemas.map((s) => s.file))];
  }

  schemasForTable(table: string): TableSchema[] {
    return this.schemas.filter((s) => s.table === table);
  }

  schemaFor(file: string, table: string): TableSchema | undefined {
    return this.schemas.find((s) => s.file === file && s.table === table);
  }

  /** Load every schema file (dev service first, bundle as fallback), then restore drafts. */
  async init(): Promise<void> {
    const files = this.schemaFiles();
    if (files.length === 0) await this.probe();
    for (const f of files) await this.loadFile(f);
    this.restoreDrafts();
    this.changed();
  }

  /** Re-detect the dev service and reload files without drafts. */
  async retry(): Promise<void> {
    this.apiState = 'unknown';
    const files = this.schemaFiles();
    if (files.length === 0) await this.probe();
    for (const f of files) {
      const st = this.files.get(f);
      await this.loadFile(f, st?.hasDraft ? st : undefined);
    }
    this.changed();
  }

  /** Reload one file from disk. Its draft is kept unless `dropDraft`. */
  async reload(file: string, dropDraft = false): Promise<void> {
    const st = this.files.get(file);
    await this.loadFile(file, st && !dropDraft && st.hasDraft ? st : undefined);
    if (dropDraft) this.clearStoredDraft(file);
    this.changed();
  }

  file(file: string): FileState | undefined {
    return this.files.get(file);
  }

  /** Current data of a file: its draft when there is one, else the disk version. */
  data(file: string): unknown {
    const st = this.files.get(file);
    if (!st) return this.staticFiles[file];
    return st.hasDraft ? st.draft : st.original;
  }

  isDirty(file: string): boolean {
    return this.files.get(file)?.hasDraft ?? false;
  }

  dirtyFiles(): string[] {
    return [...this.files.values()].filter((s) => s.hasDraft).map((s) => s.file);
  }

  /** Set a file's data. Setting it back to the disk version clears the draft. */
  setData(file: string, data: unknown): void {
    if (this.readOnly) return;
    let st = this.files.get(file);
    if (!st) {
      st = this.blankState(file, 'missing', undefined);
      this.files.set(file, st);
    }
    if (deepEqual(data, st.original)) {
      st.hasDraft = false;
      st.draft = undefined;
      st.staleDraft = false;
      this.clearStoredDraft(file);
    } else {
      st.hasDraft = true;
      st.draft = data;
      this.storeDraft(st);
    }
    this.changed();
  }

  rows(schema: TableSchema): Row[] | null {
    return rowsOf(this.data(schema.file), schema.table, schema.idField);
  }

  setRows(schema: TableSchema, rows: Row[]): void {
    const current = this.data(schema.file);
    this.setData(
      schema.file,
      withRows(current === undefined ? [] : current, schema.table, rows, schema.idField),
    );
  }

  discard(file: string): void {
    const st = this.files.get(file);
    if (!st?.hasDraft) return;
    st.hasDraft = false;
    st.draft = undefined;
    st.staleDraft = false;
    this.clearStoredDraft(file);
    this.changed();
  }

  async save(file: string): Promise<SaveResult> {
    const st = this.files.get(file);
    if (!st?.hasDraft) return { ok: true };
    if (this.readOnly) return { ok: false, message: T.readOnlyBanner };
    const data = st.draft;
    const res = await this.api.write(file, data);
    if (!res.ok) {
      if (res.reason === 'unavailable') {
        this.apiState = 'unavailable';
        this.apiMessage = res.message;
        this.changed();
      }
      return { ok: false, message: res.message };
    }
    // The draft may have changed while the request was in flight.
    st.original = data;
    st.source = 'api';
    if (st.draft === data) {
      st.hasDraft = false;
      st.draft = undefined;
      st.staleDraft = false;
      this.clearStoredDraft(file);
    } else this.storeDraft(st);
    this.changed();
    return { ok: true };
  }

  /** Content as it would be built from disk plus every draft. */
  content(): ContentMap {
    if (this.contentCache) return this.contentCache;
    const patches: FilePatch[] = [];
    for (const schema of this.schemas) {
      const st = this.files.get(schema.file);
      if (!st?.hasDraft) continue;
      const rows = rowsOf(st.draft, schema.table, schema.idField);
      if (!rows) continue;
      const previous = [
        ...(rowsOf(this.staticFiles[schema.file], schema.table, schema.idField) ?? []),
        ...(rowsOf(st.original, schema.table, schema.idField) ?? []),
      ];
      patches.push({ table: schema.table, idField: schema.idField, previous, rows });
    }
    this.contentCache = patches.length ? patchContent(this.baseContent, patches) : this.baseContent;
    return this.contentCache;
  }

  /**
   * validateContent over content(), with each pack validator isolated: a validator
   * that throws on half-edited data is reported as a problem instead of hiding the
   * others. Same checks, same order as validateContent.
   */
  problems(): string[] {
    if (this.problemCache) return this.problemCache;
    const content = this.content();
    const out: string[] = [];
    try {
      // validateContent with no packs runs only its generic checks (unique ids).
      out.push(...validateContent(content, []));
    } catch (e) {
      out.push(fmt(T.checks.genericCrashed, { message: errorMessage(e) }));
    }
    for (const pack of this.packs) {
      try {
        out.push(...(pack.validate?.(content) ?? []));
      } catch (e) {
        out.push(fmt(T.checks.validatorCrashed, { pack: pack.id, message: errorMessage(e) }));
      }
    }
    this.problemCache = out;
    return out;
  }

  /** Ids of a content table (with drafts), for ref fields. */
  tableIds(table: string): ReadonlySet<string> | undefined {
    const rows = (this.content() as unknown as Record<string, unknown>)[table];
    if (!Array.isArray(rows)) return undefined;
    const idField = this.schemasForTable(table)[0]?.idField ?? 'id';
    const out = new Set<string>();
    for (const r of rows) {
      const id = idOf(r, idField);
      if (id !== undefined) out.add(id);
    }
    return out;
  }

  /** Every data file: bundled ones overlaid with loaded data and drafts. */
  allData(): Map<string, unknown> {
    const out = new Map<string, unknown>();
    for (const [k, v] of Object.entries(this.staticFiles)) out.set(k, v);
    for (const st of this.files.values()) {
      const v = st.hasDraft ? st.draft : st.original;
      if (v === undefined) out.delete(st.file);
      else out.set(st.file, v);
    }
    return new Map([...out.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }

  // -------------------------------------------------------------------------

  private changed(): void {
    this.version++;
    this.contentCache = null;
    this.problemCache = null;
    for (const fn of this.listeners) fn();
  }

  private blankState(file: string, source: FileState['source'], original: unknown): FileState {
    return { file, source, original, hasDraft: false, draft: undefined, staleDraft: false };
  }

  private async probe(): Promise<void> {
    const res = await this.api.read('_probe.json');
    this.noteApi(res.ok || res.reason !== 'unavailable', res.ok ? '' : res.message);
  }

  private noteApi(available: boolean, message: string): void {
    if (available) {
      this.apiState = 'available';
      this.apiMessage = '';
    } else if (this.apiState !== 'available') {
      this.apiState = 'unavailable';
      this.apiMessage = message;
    }
  }

  private async loadFile(file: string, keepDraftFrom?: FileState): Promise<void> {
    const res = await this.api.read(file);
    let st: FileState;
    if (res.ok) {
      this.noteApi(true, '');
      st = this.blankState(file, 'api', res.data);
    } else if (res.reason === 'missing') {
      this.noteApi(true, '');
      st = this.blankState(file, 'missing', undefined);
    } else {
      // 'error': the service answered (for example the file on disk is not valid JSON);
      // 'unavailable': no service. Either way show the bundled copy.
      this.noteApi(res.reason === 'error', res.message);
      const bundled = this.staticFiles[file];
      st = this.blankState(file, bundled === undefined ? 'missing' : 'static', bundled);
      if (res.reason === 'error') st.error = res.message;
    }
    if (keepDraftFrom?.hasDraft) {
      st.hasDraft = !deepEqual(keepDraftFrom.draft, st.original);
      st.draft = st.hasDraft ? keepDraftFrom.draft : undefined;
      st.staleDraft = keepDraftFrom.staleDraft || !deepEqual(keepDraftFrom.original, st.original);
    }
    this.files.set(file, st);
  }

  private storeDraft(st: FileState): void {
    if (!this.storage) return;
    try {
      const base = hashText(JSON.stringify(st.original ?? null));
      this.storage.setItem(DRAFT_PREFIX + st.file, JSON.stringify({ base, data: st.draft }));
    } catch {
      // storage full or disabled: drafts still live in memory
    }
  }

  private clearStoredDraft(file: string): void {
    try {
      this.storage?.removeItem(DRAFT_PREFIX + file);
    } catch {
      // ignore
    }
  }

  private restoreDrafts(): void {
    this.restoredDrafts = [];
    const storage = this.storage;
    if (!storage || this.readOnly) return;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(DRAFT_PREFIX)) keys.push(k);
    }
    for (const key of keys) {
      const file = key.slice(DRAFT_PREFIX.length);
      let parsed: { base?: string; data?: unknown };
      try {
        parsed = JSON.parse(storage.getItem(key) ?? 'null') as { base?: string; data?: unknown };
      } catch {
        storage.removeItem(key);
        continue;
      }
      if (!parsed || parsed.data === undefined) {
        storage.removeItem(key);
        continue;
      }
      let st = this.files.get(file);
      if (!st) {
        const bundled = this.staticFiles[file];
        st = this.blankState(file, bundled === undefined ? 'missing' : 'static', bundled);
        this.files.set(file, st);
      }
      if (deepEqual(parsed.data, st.original)) {
        storage.removeItem(key);
        continue;
      }
      st.hasDraft = true;
      st.draft = parsed.data;
      st.staleDraft = parsed.base !== hashText(JSON.stringify(st.original ?? null));
      this.restoredDrafts.push(file);
    }
  }
}
