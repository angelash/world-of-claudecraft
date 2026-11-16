// Batch view (release_engineering.md 7.3 and 7.5): open a staged batch of data/_staging/,
// compare its records with the workspace's data, fill fields record by record and save
// the staged file (step 3), run V1 to V10 with the batch applied (step 4) and promote it
// into data/ (step 5). A promoted batch shows its record from data/_batches/. Thin DOM
// layer over batch_model.ts; reads and writes go through the dev service (/api/data),
// with the page's bundled copy of data/_staging/ as a read-only fallback.

import {
  type BatchIndex,
  type BatchIndexEntry,
  type BatchRecord,
  type BatchStatus,
  type BatchStep,
  INDEX_FILE,
  readIndex,
  recordFile,
  type StagedBatch,
  stagingFile,
} from '../../../tools/content/catalog/batch';
import type { Finding, ValidatorResult } from '../../../tools/content/validators/types';
import type { DataApi } from '../api/data_client';
import { type RowLocator, rowLocator, topField } from '../checks/row_locator';
import type { IssueTarget } from '../checks/rules';
import { targetLinks } from '../checks/target_links';
import { loadCodeSources } from '../quests/code_sources';
import { append, button, fill, h, select } from '../shell/dom';
import type { EditorTool, ToolHost } from '../shell/tool';
import type { Workspace } from '../state/workspace';
import { fmt, T } from '../text';
import { deepEqual, errorMessage, formatJson } from '../util/json';
import {
  type BatchView,
  batchList,
  batchView,
  bundledPaths,
  dirtyTargets,
  editedIds,
  editRecord,
  filledBatch,
  finishWrites,
  interpretBatchFile,
  interruptedPromotion,
  MILESTONES,
  type PartView,
  type PromoteBlock,
  promoteBlock,
  promotedIndex,
  promotePlan,
  type RecordView,
  runKey,
  splitFindings,
  stagedIndex,
  targetFiles,
  todoOf,
  validationInput,
} from './batch_model';

type ValidatorsModule = typeof import('../../../tools/content/validators');

// The page's copy of data/_staging/. Lazy on purpose: the dev server reloads the page when
// a module the page has loaded changes on disk, so an eager copy would reload the page on
// every save of a staged file or of the index. Adding or removing a staged file still
// reloads (the glob changes), which is why removing it is the last step of a promotion.
const BUNDLED = import.meta.glob<unknown>('/data/_staging/*.json', { import: 'default' });

type FileRead = { ok: true; data: unknown } | { ok: false; missing: boolean; message: string };

interface Run {
  key: string;
  ok: boolean;
  milestone: string;
  results: ValidatorResult[];
}

const today = (): string => new Date().toISOString().slice(0, 10);

const STATUS_LABEL: Record<BatchStatus, string> = {
  staged: T.batch.statusStaged,
  validated: T.batch.statusValidated,
  promoted: T.batch.statusPromoted,
};

const STEP_LABEL: Record<BatchStep['name'], string> = {
  scope: T.batch.stepScope,
  extract: T.batch.stepExtract,
  fill: T.batch.stepFill,
  validate: T.batch.stepValidate,
  promote: T.batch.stepPromote,
  verify: T.batch.stepVerify,
  report: T.batch.stepReport,
};

export class BatchTool implements EditorTool {
  readonly id = 'batch';
  readonly label = T.nav.batch;
  private host!: ToolHost;
  private ws!: Workspace;
  private visible = false;
  private listed = false;
  private source: 'api' | 'static' = 'api';
  private index: BatchIndex = { batches: [] };
  private entries: BatchIndexEntry[] = [];
  private name = '';
  /** the staged file as on disk, and with the author's applied edits */
  private saved: StagedBatch | null = null;
  private batch: StagedBatch | null = null;
  private record: BatchRecord | null = null;
  private interrupted = false;
  private loadError = '';
  private milestone: string = MILESTONES[0];
  private run: Run | null = null;
  private busy: '' | 'loading' | 'running' | 'saving' | 'promoting' = '';
  /** unapplied textarea text, open record panels and edit errors, by `part/record` */
  private readonly drafts = new Map<string, string>();
  private readonly openRecords = new Set<string>();
  private readonly recordErrors = new Map<string, string>();
  private readonly recordEls = new Map<string, HTMLDetailsElement>();
  /** record id to its `part/record` key, rebuilt with every staged render */
  private recordKeys = new Map<string, string>();
  private validators: Promise<ValidatorsModule> | null = null;
  private codeSources: Promise<Record<string, string>> | null = null;
  private renderTimer = 0;
  private paneEl!: HTMLElement;
  private toolbarEl!: HTMLElement;
  private bodyEl!: HTMLElement;

  constructor(private readonly api: DataApi) {}

  mount(root: HTMLElement, host: ToolHost): void {
    this.host = host;
    this.ws = host.ws;
    this.toolbarEl = h('div', { class: 'toolbar wrap' });
    this.bodyEl = h('div');
    this.paneEl = h('div', { class: 'batch-tool pane' }, this.toolbarEl, this.bodyEl);
    append(root, this.paneEl);
    // The diff and the promote gate follow the workspace (drafts, saves elsewhere).
    this.ws.subscribe(() => {
      if (!this.visible) return;
      clearTimeout(this.renderTimer);
      this.renderTimer = window.setTimeout(() => this.render(), 200);
    });
  }

  show(params: Record<string, string>): void {
    this.visible = true;
    if (params.milestone && (MILESTONES as readonly string[]).includes(params.milestone))
      this.milestone = params.milestone;
    const want = params.batch ?? this.name;
    if (this.busy === 'loading') return;
    if (!this.listed) void this.loadList(want);
    else if (want && want !== this.name) void this.open(want);
    else this.render();
  }

  hide(): void {
    this.visible = false;
  }

  // -------------------------------------------------------------------------
  // State

  private get writable(): boolean {
    return this.source === 'api' && !this.ws.readOnly;
  }

  private get dirty(): boolean {
    return !!this.batch && !!this.saved && !deepEqual(this.batch, this.saved);
  }

  private currentKey(): string {
    return this.batch ? runKey(this.ws.revision, this.milestone, this.batch) : '';
  }

  private block(): PromoteBlock | null {
    if (!this.batch) return 'readonly';
    return promoteBlock({
      writable: this.writable,
      dirty: this.dirty,
      dirtyTargets: dirtyTargets(this.batch, this.ws.allData(), (f) => this.ws.isDirty(f)),
      todo: todoOf(this.batch).length,
      run: this.run ? { key: this.run.key, ok: this.run.ok } : null,
      key: this.currentKey(),
    });
  }

  private blockText(b: PromoteBlock): string {
    switch (b) {
      case 'readonly':
        return T.batch.blockReadonly;
      case 'dirty':
        return T.batch.blockDirty;
      case 'dirty_target': {
        const files = this.batch
          ? dirtyTargets(this.batch, this.ws.allData(), (f) => this.ws.isDirty(f))
          : [];
        return fmt(T.batch.blockDirtyTarget, { files: files.join(', ') });
      }
      case 'todo':
        return fmt(T.batch.blockTodo, { n: this.batch ? todoOf(this.batch).length : 0 });
      case 'not_run':
        return T.batch.blockNotRun;
      case 'stale':
        return T.batch.blockStale;
      case 'failing':
        return T.batch.blockFailing;
    }
  }

  private params(): Record<string, string> {
    const p: Record<string, string> = { milestone: this.milestone };
    if (this.name) p.batch = this.name;
    return p;
  }

  private confirmDiscard(): boolean {
    return !this.dirty || window.confirm(fmt(T.batch.discardConfirm, { batch: this.name }));
  }

  // -------------------------------------------------------------------------
  // Reading

  private async readFile(file: string): Promise<FileRead> {
    if (this.source === 'api') {
      const res = await this.api.read(file);
      if (res.ok) return { ok: true, data: res.data };
      return { ok: false, missing: res.reason === 'missing', message: res.message };
    }
    const load = BUNDLED[`/data/${file}`];
    if (!load) return { ok: false, missing: true, message: '' };
    return { ok: true, data: await load() };
  }

  /** The index as on disk now (the command line importer may have changed it). */
  private async freshIndex(): Promise<BatchIndex | null> {
    const res = await this.api.read(INDEX_FILE);
    if (res.ok) return readIndex(res.data);
    if (res.reason === 'missing') return readIndex(undefined);
    this.host.notify(fmt(T.batch.loadFailed, { file: INDEX_FILE, message: res.message }), 'error');
    return null;
  }

  private async loadList(want = this.name): Promise<void> {
    this.busy = 'loading';
    this.render();
    try {
      const res = await this.api.read(INDEX_FILE);
      if (res.ok || res.reason === 'missing') {
        this.source = 'api';
        this.index = readIndex(res.ok ? res.data : undefined);
        this.entries = batchList(this.index);
      } else if (res.reason === 'unavailable') {
        this.source = 'static';
        const paths = bundledPaths(Object.keys(BUNDLED));
        const key = paths.get(INDEX_FILE);
        this.index = readIndex(key ? await BUNDLED[key]?.() : undefined);
        this.entries = batchList(this.index, paths.keys());
      } else {
        this.source = 'api';
        this.index = readIndex(undefined);
        this.entries = [];
        this.host.notify(
          fmt(T.batch.loadFailed, { file: INDEX_FILE, message: res.message }),
          'error',
        );
      }
    } catch (e) {
      this.host.notify(errorMessage(e), 'error');
    }
    this.listed = true;
    this.busy = '';
    const pick = want || this.entries[0]?.batch || '';
    if (pick) await this.open(pick);
    else {
      this.clearSelection('');
      this.render();
    }
  }

  private clearSelection(name: string): void {
    this.name = name;
    this.saved = null;
    this.batch = null;
    this.record = null;
    this.interrupted = false;
    this.loadError = '';
    this.run = null;
    this.drafts.clear();
    this.openRecords.clear();
    this.recordErrors.clear();
  }

  private async open(name: string): Promise<void> {
    this.clearSelection(name);
    this.busy = 'loading';
    this.render();
    const entry = this.entries.find((e) => e.batch === name);
    try {
      const staged = await this.readFile(stagingFile(name));
      if (staged.ok) {
        const loaded = interpretBatchFile(staged.data);
        if (loaded.kind === 'staged') {
          this.saved = loaded.batch;
          this.batch = loaded.batch;
          // A promotion that stopped half way leaves its record next to the staged file.
          if (this.source === 'api') {
            const rec = await this.readFile(recordFile(name));
            if (rec.ok && interpretBatchFile(rec.data).kind === 'record') {
              this.interrupted = interruptedPromotion(loaded.batch, rec.data);
              if (this.interrupted) this.record = rec.data as BatchRecord;
            }
          }
        } else if (loaded.kind === 'record') this.record = loaded.record;
        else {
          this.loadError = fmt(T.batch.badBatch, { problems: loaded.problems.join('; ') });
        }
      } else if (!staged.missing) {
        this.loadError = fmt(T.batch.loadFailed, {
          file: stagingFile(name),
          message: staged.message,
        });
      } else {
        const rec = await this.readFile(recordFile(name));
        const loaded = rec.ok ? interpretBatchFile(rec.data) : null;
        if (loaded?.kind === 'record') {
          this.record = loaded.record;
          this.interrupted = interruptedPromotion(null, loaded.record, entry);
        } else if (loaded?.kind === 'bad') {
          this.loadError = fmt(T.batch.badBatch, { problems: loaded.problems.join('; ') });
        } else if (this.source === 'static') {
          this.loadError = fmt(T.batch.recordUnavailable, { file: recordFile(name) });
        } else if (!rec.ok && !rec.missing) {
          this.loadError = fmt(T.batch.loadFailed, {
            file: recordFile(name),
            message: rec.message,
          });
        } else {
          this.loadError = fmt(T.batch.missingFile, { file: entry?.file ?? stagingFile(name) });
        }
      }
    } catch (e) {
      this.loadError = errorMessage(e);
    }
    this.busy = '';
    if (this.visible) this.host.setParams(this.params());
    this.render();
  }

  // -------------------------------------------------------------------------
  // Step 3: fill

  private applyRecord(part: number, rec: number, text: string): void {
    if (!this.batch) return;
    const key = `${part}/${rec}`;
    const res = editRecord(this.batch, part, rec, text);
    if (!res.ok) {
      const msg =
        res.error === 'json'
          ? fmt(T.batch.recordBadJson, { message: res.detail })
          : res.error === 'not_object'
            ? T.batch.recordNotObject
            : res.error === 'no_id'
              ? fmt(T.batch.recordNoId, { field: res.detail })
              : fmt(T.batch.recordDuplicate, { id: res.detail });
      this.recordErrors.set(key, msg);
      this.render();
      return;
    }
    this.batch = res.batch;
    this.drafts.delete(key);
    this.recordErrors.delete(key);
    const view = batchView(this.batch, this.ws.allData());
    this.host.notify(
      fmt(T.batch.recordApplied, { id: view.parts[part]?.records[rec]?.id ?? '?' }),
      'ok',
    );
    this.render();
  }

  private discard(): void {
    if (!this.confirmDiscard()) return;
    this.batch = this.saved;
    this.drafts.clear();
    this.recordErrors.clear();
    this.render();
  }

  private async save(): Promise<void> {
    const batch = this.batch;
    const saved = this.saved;
    if (!batch || !saved || !this.writable || this.busy) return;
    const next = filledBatch(batch, today(), editedIds(saved, batch));
    const file = stagingFile(next.batch);
    this.busy = 'saving';
    this.render();
    try {
      const res = await this.api.write(file, next);
      if (!res.ok) {
        this.host.notify(fmt(T.batch.saveFailed, { file, message: res.message }), 'error');
        return;
      }
      this.saved = next;
      this.batch = next;
      const current = await this.freshIndex();
      if (!current) return;
      this.index = current;
      const index = stagedIndex(current, next);
      if (!deepEqual(index, current)) {
        const r = await this.api.write(INDEX_FILE, index);
        if (!r.ok) {
          this.host.notify(
            fmt(T.batch.writeFailed, { file: INDEX_FILE, message: r.message }),
            'error',
          );
          return;
        }
        this.index = index;
        this.entries = batchList(index);
      }
      this.host.notify(fmt(T.batch.saved, { file }), 'ok');
    } catch (e) {
      this.host.notify(errorMessage(e), 'error');
    } finally {
      this.busy = '';
      this.render();
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: validate

  private async validate(batch: StagedBatch, milestone: string): Promise<ValidatorResult[]> {
    this.validators ??= import('../../../tools/content/validators');
    this.codeSources ??= loadCodeSources();
    const [v, codeSources, game, autoplay, routes, text] = await Promise.all([
      this.validators,
      this.codeSources,
      import('../../game/create'),
      import('../../game/autoplay'),
      import('../../game/autoplay/routes'),
      import('../../shared_ui/i18n'),
    ]);
    const input = validationInput(
      { content: this.ws.content(), files: this.ws.allData(), packs: this.ws.packs },
      batch,
      v.milestoneIndex(milestone),
      {
        codeSources,
        initialFlags: (content) => ({
          ...game.createGame({ aiMode: 'off', content }).world.meta.flags,
        }),
        endingRoutes: [...autoplay.ENDING_ROUTES],
        routeProblems: (content) => routes.routeProblems(content),
        uiText: { ...text.SOURCE_TABLE },
      },
    );
    return v.runValidators(input);
  }

  private async runValidators(): Promise<void> {
    const batch = this.batch;
    if (!batch || this.busy) return;
    const milestone = this.milestone;
    const key = runKey(this.ws.revision, milestone, batch);
    this.busy = 'running';
    this.render();
    try {
      const results = await this.validate(batch, milestone);
      this.run = { key, ok: results.every((r) => r.ok), milestone, results };
    } catch (e) {
      this.host.notify(fmt(T.batch.runFailed, { message: errorMessage(e) }), 'error');
    } finally {
      this.busy = '';
      this.render();
    }
  }

  // -------------------------------------------------------------------------
  // Step 5: promote

  private async promote(): Promise<void> {
    const batch = this.batch;
    const saved = this.saved;
    // an interrupted promotion is finished, never promoted again (its record would lose
    // the diff, now that the records are merged)
    if (!batch || !saved || this.busy || this.interrupted) return;
    const block = this.block();
    if (block) {
      this.host.notify(this.blockText(block), 'error');
      return;
    }
    const name = batch.batch;
    const files = targetFiles(batch)
      .map((f) => `data/${f}`)
      .join(', ');
    if (
      !window.confirm(fmt(T.batch.promoteConfirm, { batch: name, files, record: recordFile(name) }))
    )
      return;
    this.busy = 'promoting';
    this.render();
    try {
      // The staged file on disk must still be the one that was validated.
      const disk = await this.api.read(stagingFile(name));
      if (!disk.ok) {
        this.host.notify(
          fmt(T.batch.loadFailed, { file: stagingFile(name), message: disk.message }),
          'error',
        );
        return;
      }
      if (!deepEqual(disk.data, saved)) {
        this.host.notify(T.batch.changedOnDisk, 'error');
        this.busy = '';
        await this.open(name);
        return;
      }
      // Validate again against the current data.
      const milestone = this.milestone;
      const key = runKey(this.ws.revision, milestone, batch);
      const results = await this.validate(batch, milestone);
      this.run = { key, ok: results.every((r) => r.ok), milestone, results };
      if (!this.run.ok || todoOf(batch).length > 0) {
        this.host.notify(T.batch.revalidateFailed, 'error');
        return;
      }
      if (key !== runKey(this.ws.revision, milestone, batch)) {
        this.host.notify(T.batch.blockStale, 'error');
        return;
      }
      const plan = promotePlan(
        batch,
        this.ws.allData(),
        this.index,
        results,
        milestone,
        today(),
        this.ws.schemas,
      );
      // The record first: it marks the promotion, so one cut short by a page reload (a
      // data file write reloads the dev page) can be finished from the view.
      const rec = await this.api.write(plan.recordPath, plan.record);
      if (!rec.ok) {
        this.host.notify(
          fmt(T.batch.writeFailed, { file: plan.recordPath, message: rec.message }),
          'error',
        );
        return;
      }
      this.record = plan.record;
      if (!(await this.finishPromotion(batch, name))) return;
      this.host.notify(fmt(T.batch.promoted, { batch: name, record: plan.recordPath }), 'ok');
      this.busy = '';
      await this.loadList(name);
    } catch (e) {
      this.host.notify(errorMessage(e), 'error');
    } finally {
      this.busy = '';
      this.render();
    }
  }

  /**
   * The rest of a promotion once its record is written, every step idempotent: merge the
   * records into the target files (saved together), mark the index entry promoted, and
   * remove the staged file last (removing it reloads the dev page). Stops at the first
   * failure and reports it.
   */
  private async finishPromotion(batch: StagedBatch | null, name: string): Promise<boolean> {
    if (batch) {
      const writes = finishWrites(batch, this.ws.allData());
      for (const w of writes) this.ws.setData(w.file, w.data);
      const saves = await Promise.all(
        writes.map(async (w) => ({ file: w.file, res: await this.ws.save(w.file) })),
      );
      for (const s of saves) {
        if (!s.res.ok) {
          this.host.notify(
            fmt(T.batch.writeFailed, { file: s.file, message: s.res.message }),
            'error',
          );
          return false;
        }
      }
    }
    const current = await this.freshIndex();
    if (!current) return false;
    this.index = current;
    const index = promotedIndex(current, name);
    if (!deepEqual(index, current)) {
      const res = await this.api.write(INDEX_FILE, index);
      if (!res.ok) {
        this.host.notify(
          fmt(T.batch.writeFailed, { file: INDEX_FILE, message: res.message }),
          'error',
        );
        return false;
      }
      this.index = index;
      this.entries = batchList(index);
    }
    if (batch) {
      const res = await this.api.remove(stagingFile(name));
      if (!res.ok) {
        this.host.notify(
          fmt(T.batch.removeFailed, { file: stagingFile(name), message: res.message }),
          'error',
        );
        return false;
      }
    }
    return true;
  }

  private async finish(): Promise<void> {
    if (!this.interrupted || this.busy) return;
    if (!this.writable) {
      this.host.notify(T.batch.blockReadonly, 'error');
      return;
    }
    const batch = this.saved;
    if (batch) {
      const dirty = dirtyTargets(batch, this.ws.allData(), (f) => this.ws.isDirty(f));
      if (dirty.length) {
        this.host.notify(fmt(T.batch.blockDirtyTarget, { files: dirty.join(', ') }), 'error');
        return;
      }
    }
    const name = this.name;
    this.busy = 'promoting';
    this.render();
    try {
      if (await this.finishPromotion(batch, name)) {
        this.host.notify(fmt(T.batch.finished, { batch: name }), 'ok');
        this.busy = '';
        await this.loadList(name);
      }
    } catch (e) {
      this.host.notify(errorMessage(e), 'error');
    } finally {
      this.busy = '';
      this.render();
    }
  }

  // -------------------------------------------------------------------------
  // Rendering

  private render(): void {
    if (!this.toolbarEl) return;
    const top = this.paneEl.scrollTop;
    this.renderToolbar();
    this.recordEls.clear();
    fill(this.bodyEl, ...this.body());
    this.paneEl.scrollTop = top;
  }

  private renderToolbar(): void {
    const busy = this.busy !== '';
    const options = this.entries.map((e) => ({
      value: e.batch,
      label: `${e.batch}（${STATUS_LABEL[e.status] ?? e.status}）`,
    }));
    if (this.name && !options.some((o) => o.value === this.name))
      options.unshift({ value: this.name, label: this.name });
    const block = this.batch ? this.block() : null;
    fill(
      this.toolbarEl,
      h('span', { class: 'muted', text: T.batch.pick }),
      options.length
        ? select(options, this.name, (v) => {
            if (!this.confirmDiscard()) {
              this.renderToolbar();
              return;
            }
            void this.open(v);
          })
        : null,
      button(T.common.reload, () => {
        if (this.confirmDiscard()) void this.loadList(this.name);
      }),
      h('span', { class: 'sep' }),
      h('span', { class: 'muted', text: T.batch.milestone }),
      select(
        MILESTONES.map((m) => ({ value: m, label: m })),
        this.milestone,
        (v) => {
          this.milestone = v;
          this.host.setParams(this.params());
          this.render();
        },
      ),
      button(
        this.busy === 'running' ? T.batch.running : T.batch.run,
        () => void this.runValidators(),
        { class: 'primary', disabled: busy || !this.batch },
      ),
      this.batch && !this.interrupted
        ? button(
            this.busy === 'promoting' ? T.batch.promoting : T.batch.promote,
            () => void this.promote(),
            {
              disabled: busy || block !== null,
              title: block ? this.blockText(block) : '',
            },
          )
        : null,
      this.interrupted
        ? button(T.batch.finish, () => void this.finish(), {
            class: 'primary',
            disabled: busy || !this.writable,
          })
        : null,
      h('span', { class: 'spacer' }),
      h('span', {
        class: this.source === 'api' ? 'muted small' : 'bad small',
        text: this.source === 'api' ? T.batch.sourceApi : T.batch.sourceStatic,
      }),
    );
  }

  private body(): (HTMLElement | null)[] {
    if (this.busy === 'loading' && !this.batch && !this.record)
      return [h('p', { class: 'muted', text: T.common.loading })];
    if (!this.name && this.entries.length === 0)
      return [h('p', { class: 'muted', text: T.batch.noBatches })];
    const out: (HTMLElement | null)[] = [];
    if (this.loadError) out.push(h('p', { class: 'bad', text: this.loadError }));
    if (this.interrupted && this.record) {
      out.push(
        h('div', {
          class: 'notice warn',
          text: fmt(T.batch.interrupted, { record: recordFile(this.record.batch) }),
        }),
      );
    }
    if (this.batch) out.push(...this.stagedBody(this.batch));
    else if (this.record) out.push(...this.recordBody(this.record));
    return out;
  }

  private kvTable(rows: [string, string][]): HTMLElement {
    const t = h('table', { class: 'grid kv' });
    for (const [k, v] of rows) t.append(h('tr', null, h('th', { text: k }), h('td', { text: v })));
    return t;
  }

  private stepsTable(steps: readonly BatchStep[]): HTMLElement {
    if (steps.length === 0) return h('p', { class: 'muted', text: T.batch.noSteps });
    const t = h('table', { class: 'grid' });
    t.append(
      h(
        'tr',
        null,
        ...[
          T.batch.colStep,
          T.batch.colStepName,
          T.batch.colDate,
          T.batch.colCommand,
          T.batch.colNote,
        ].map((s) => h('th', { text: s })),
      ),
    );
    for (const s of steps) {
      t.append(
        h(
          'tr',
          null,
          h('td', { text: String(s.step) }),
          h('td', { text: STEP_LABEL[s.name] ?? s.name }),
          h('td', { text: s.at }),
          h('td', { class: 'mono small', text: s.command ?? '' }),
          h('td', { text: s.note ?? '' }),
        ),
      );
    }
    return h('div', { class: 'table-wrap' }, t);
  }

  private stagedBody(batch: StagedBatch): HTMLElement[] {
    const view = batchView(batch, this.ws.allData());
    const locate = rowLocator(this.ws.schemas, this.ws.allData());
    this.recordKeys = new Map();
    for (const p of view.parts)
      for (const r of p.records)
        if (!this.recordKeys.has(r.id)) this.recordKeys.set(r.id, `${p.index}/${r.index}`);
    const out: HTMLElement[] = [
      h('div', { class: 'pane-title mono', text: batch.batch }),
      this.kvTable([
        [T.batch.status, STATUS_LABEL[batch.status] ?? batch.status],
        [T.batch.scope, batch.scope],
        [T.batch.depends, batch.depends.length ? batch.depends.join(', ') : T.common.none],
      ]),
      h(
        'details',
        { open: true },
        h('summary', { text: T.batch.stepsTitle }),
        this.stepsTable(batch.steps),
      ),
    ];
    if (this.dirty && this.saved) {
      out.push(
        h(
          'div',
          { class: 'notice warn' },
          h('span', {
            text: fmt(T.batch.dirty, { ids: editedIds(this.saved, batch).join(', ') }),
          }),
          ' ',
          button(T.batch.save, () => void this.save(), {
            class: 'primary',
            disabled: this.busy !== '' || !this.writable,
            title: this.writable ? '' : T.batch.blockReadonly,
          }),
          button(T.batch.discard, () => this.discard(), { disabled: this.busy !== '' }),
        ),
      );
    }
    out.push(this.diffSection(view), this.todoSection(view), this.runSection(batch, locate));
    out.push(
      h('div', { class: 'sub-title', text: fmt(T.batch.partsTitle, { n: view.parts.length }) }),
      ...view.parts.map((p) => this.partSection(p, locate)),
    );
    return out;
  }

  private diffSection(view: BatchView): HTMLElement {
    const box = h(
      'div',
      null,
      h('div', { class: 'sub-title', text: T.batch.diffTitle }),
      h('p', { class: 'muted', text: fmt(T.batch.diffSummary, view.totals) }),
    );
    for (const p of view.parts) {
      const d = p.diff;
      const ul = h('ul', { class: 'problem-list' });
      if (d.added.length)
        ul.append(h('li', { text: `${T.batch.diffAdded}：${d.added.join(', ')}` }));
      for (const c of d.changed)
        ul.append(h('li', { text: `${T.batch.diffChanged}：${c.id}（${c.fields.join(', ')}）` }));
      if (d.unchanged.length)
        ul.append(
          h('li', { class: 'muted', text: `${T.batch.diffUnchanged}：${d.unchanged.join(', ')}` }),
        );
      box.append(
        h('div', {
          class: 'mono small',
          text: fmt(T.batch.diffPart, { file: d.file, table: d.table }),
        }),
        ul,
      );
    }
    return box;
  }

  private todoSection(view: BatchView): HTMLElement {
    const box = h(
      'div',
      null,
      h('div', { class: 'sub-title', text: fmt(T.batch.todoTitle, { n: view.todo.length }) }),
    );
    if (view.todo.length === 0) {
      box.append(h('p', { class: 'ok', text: T.batch.todoNone }));
      return box;
    }
    const ul = h('ul', { class: 'problem-list' });
    for (const t of view.todo) {
      ul.append(
        h(
          'li',
          null,
          fmt(T.batch.todoItem, { id: t.id, field: t.field }),
          ' ',
          this.recordLink(t.id),
        ),
      );
    }
    box.append(ul);
    return box;
  }

  /** A button that opens a batch record's panel (findings and todo items point at it). */
  private recordLink(id: string): HTMLElement | null {
    const key = this.recordKeys.get(id);
    if (key === undefined) return null;
    return button(
      fmt(T.batch.showRecord, { id }),
      () => {
        this.openRecords.add(key);
        const el = this.recordEls.get(key);
        if (el) {
          el.open = true;
          el.scrollIntoView({ block: 'start' });
        }
      },
      { class: 'link small' },
    );
  }

  private runSection(batch: StagedBatch, locate: RowLocator): HTMLElement {
    const box = h('div', null);
    if (this.busy === 'running' || (this.busy === 'promoting' && !this.run)) {
      box.append(
        h('div', { class: 'sub-title', text: T.batch.run }),
        h('p', { class: 'muted', text: T.batch.running }),
      );
      return box;
    }
    const run = this.run;
    if (!run) {
      box.append(
        h('div', { class: 'sub-title', text: T.batch.run }),
        h('p', { class: 'muted', text: T.batch.notRun }),
      );
      return box;
    }
    box.append(
      h('div', {
        class: `sub-title ${run.ok ? 'ok' : 'bad'}`,
        text: fmt(T.batch.resultTitle, {
          milestone: run.milestone,
          result: run.ok ? T.batch.allGreen : T.batch.failing,
        }),
      }),
    );
    if (run.key !== runKey(this.ws.revision, this.milestone, batch))
      box.append(h('div', { class: 'notice warn', text: T.batch.stale }));
    const t = h('table', { class: 'grid' });
    t.append(
      h(
        'tr',
        null,
        ...[T.batch.colValidator, T.batch.colStatus, T.batch.colErrors, T.batch.colWarnings].map(
          (s) => h('th', { text: s }),
        ),
      ),
    );
    for (const r of run.results) {
      t.append(
        h(
          'tr',
          null,
          h('td', { class: 'mono', text: `${r.id} ${r.title}` }),
          h(
            'td',
            null,
            h('span', {
              class: `sev ${r.ok ? 'info' : 'error'}`,
              text: r.ok ? T.batch.statusOk : T.batch.statusFail,
            }),
          ),
          h('td', { text: String(r.errors) }),
          h('td', { text: String(r.warnings) }),
        ),
      );
    }
    box.append(t);
    for (const r of run.results) {
      if (r.findings.length === 0) continue;
      const { errors, warnings, infos } = splitFindings(r);
      const panel = h(
        'details',
        { open: errors.length > 0 },
        h('summary', {
          text: `${r.id} ${r.title}：${fmt(T.batch.errorsTitle, { n: errors.length })}，${fmt(T.batch.warningsTitle, { n: warnings.length })}`,
        }),
      );
      if (errors.length) panel.append(this.findingList(errors, locate));
      if (warnings.length)
        panel.append(
          h(
            'details',
            null,
            h('summary', { text: fmt(T.batch.warningsTitle, { n: warnings.length }) }),
            this.findingList(warnings, locate),
          ),
        );
      if (infos.length)
        panel.append(
          h(
            'details',
            null,
            h('summary', { text: fmt(T.batch.infosTitle, { n: infos.length }) }),
            this.findingList(infos, locate),
          ),
        );
      box.append(panel);
    }
    return box;
  }

  private findingTarget(f: Finding, locate: RowLocator): IssueTarget {
    if (f.table && f.row) {
      if (f.file)
        return { kind: 'row', file: f.file, table: f.table, id: f.row, field: topField(f.path) };
      return locate(f.table, f.row, f.path);
    }
    if (f.file) return { kind: 'file', file: f.file };
    return { kind: 'none' };
  }

  private findingList(findings: readonly Finding[], locate: RowLocator): HTMLElement {
    const ul = h('ul', { class: 'problem-list' });
    for (const f of findings) {
      ul.append(
        h(
          'li',
          null,
          h('span', { class: `sev ${f.level}`, text: T.severity[f.level] }),
          ' ',
          f.message,
          ' ',
          ...targetLinks(this.findingTarget(f, locate), this.host),
          f.row ? this.recordLink(f.row) : null,
        ),
      );
    }
    return ul;
  }

  private partSection(p: PartView, locate: RowLocator): HTMLElement {
    const part = p.part;
    return h(
      'details',
      { open: true },
      h('summary', {
        text: fmt(T.batch.part, {
          mapping: part.mapping,
          catalog: part.catalog,
          section: part.section,
          file: part.target.file,
          table: part.target.table,
        }),
      }),
      p.title ? h('p', { class: 'muted small', text: p.title }) : null,
      h('div', { class: 'muted', text: fmt(T.batch.recordsTitle, { n: p.records.length }) }),
      ...p.records.map((r) => this.recordPanel(p, r, locate)),
    );
  }

  private recordPanel(p: PartView, r: RecordView, locate: RowLocator): HTMLElement {
    const key = `${p.index}/${r.index}`;
    const stateLabel =
      r.state === 'added'
        ? T.batch.stateAdded
        : r.state === 'changed'
          ? T.batch.stateChanged
          : T.batch.stateUnchanged;
    const panel = h(
      'details',
      { class: 'flag-detail', open: this.openRecords.has(key) },
      h(
        'summary',
        null,
        h('span', { class: 'mono', text: r.id }),
        h('span', {
          class: `badge${r.state === 'added' ? '' : r.state === 'changed' ? ' warn' : ''}`,
          text: stateLabel,
        }),
        r.todo.length
          ? h('span', {
              class: 'badge bad',
              text: fmt(T.batch.todoFields, { fields: r.todo.map((t) => t.field).join(', ') }),
            })
          : null,
      ),
    );
    panel.addEventListener('toggle', () => {
      if (panel.open) this.openRecords.add(key);
      else this.openRecords.delete(key);
    });
    this.recordEls.set(key, panel);
    if (r.fields.length)
      panel.append(
        h('p', {
          class: 'small',
          text: fmt(T.batch.changedFields, { fields: r.fields.join(', ') }),
        }),
      );
    if (r.unmapped.length) {
      const ul = h('ul', { class: 'problem-list' });
      for (const u of r.unmapped) {
        ul.append(
          h(
            'li',
            null,
            fmt(T.batch.unmappedItem, { column: u.column, value: u.value }),
            u.note ? h('span', { class: 'muted small', text: ` (${u.note})` }) : null,
          ),
        );
      }
      panel.append(h('div', { class: 'muted small', text: T.batch.unmappedTitle }), ul);
    }
    const original = formatJson(r.record);
    const text = this.drafts.get(key) ?? original;
    const area = h('textarea', {
      class: 'mono',
      rows: Math.min(30, text.split('\n').length + 1),
      readOnly: !this.writable,
      attrs: { 'aria-label': T.batch.recordJson, spellcheck: 'false' },
    });
    area.value = text;
    area.addEventListener('input', () => {
      if (area.value === original) this.drafts.delete(key);
      else this.drafts.set(key, area.value);
    });
    const error = this.recordErrors.get(key);
    const current = r.state === 'added' ? null : locate(p.part.target.table, r.id);
    append(
      panel,
      h('div', { class: 'muted small', text: T.batch.recordJson }),
      area,
      error ? h('p', { class: 'bad small', text: error }) : null,
      h(
        'div',
        { class: 'toolbar' },
        button(T.batch.applyRecord, () => this.applyRecord(p.index, r.index, area.value), {
          disabled: !this.writable || this.busy !== '',
        }),
        button(
          T.batch.resetRecord,
          () => {
            this.drafts.delete(key);
            this.recordErrors.delete(key);
            this.render();
          },
          { disabled: !this.writable },
        ),
        current && current.kind === 'row'
          ? button(
              T.batch.openCurrent,
              () =>
                this.host.navigate('content', {
                  file: current.file,
                  table: current.table,
                  row: current.id,
                }),
              { class: 'link small' },
            )
          : null,
      ),
    );
    return panel;
  }

  private recordBody(record: BatchRecord): HTMLElement[] {
    const v = record.validation;
    return [
      h('div', { class: 'pane-title mono', text: `${record.batch}：${T.batch.recordTitle}` }),
      this.kvTable([
        [T.batch.status, STATUS_LABEL[record.status] ?? record.status],
        [T.batch.scope, record.scope],
        [T.batch.depends, record.depends.length ? record.depends.join(', ') : T.common.none],
        [T.batch.recordFiles, record.files.map((f) => `data/${f}`).join(', ') || T.common.none],
        [
          T.batch.recordSources,
          record.sources.map((s) => `${s.mapping}（${s.catalog} ${s.section}）`).join('；') ||
            T.common.none,
        ],
        [T.batch.recordAdded, record.added.join(', ') || T.common.none],
        [
          T.batch.recordChanged,
          record.changed.map((c) => `${c.id}（${c.fields.join(', ')}）`).join('；') ||
            T.common.none,
        ],
        [
          T.batch.stepValidate,
          v
            ? fmt(T.batch.recordValidation, {
                milestone: v.milestone,
                at: v.at,
                result: v.ok ? T.batch.allGreen : T.batch.failing,
              })
            : T.batch.notValidated,
        ],
      ]),
      h('div', { class: 'sub-title', text: T.batch.stepsTitle }),
      this.stepsTable(record.steps),
    ];
  }
}
