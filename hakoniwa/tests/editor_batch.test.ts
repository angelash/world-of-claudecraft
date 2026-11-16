// Batch view model (src/editor/batch/batch_model.ts): listing, the row diff and todo list
// of a staged batch, record edits and the fill step, the V1 to V10 input with the batch
// applied, the promote gate, the promotion plan and the detection of a promotion that a
// page reload cut short.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import {
  batchList,
  batchView,
  bundledPaths,
  dirtyTargets,
  editedIds,
  editRecord,
  filledBatch,
  finishWrites,
  flattenText,
  interpretBatchFile,
  interruptedPromotion,
  promoteBlock,
  promotedIndex,
  promotePlan,
  runKey,
  splitFindings,
  stagedIndex,
  targetFiles,
  todoOf,
  validationInput,
} from '../src/editor/batch/batch_model';
import { rowsOf } from '../src/editor/content/rows';
import { staticDataFiles } from '../src/editor/state/static_data';
import { cloneJson } from '../src/editor/util/json';
import {
  applyBatch,
  type BatchIndex,
  readIndex,
  type StagedBatch,
} from '../tools/content/catalog/batch';
import { runValidators } from '../tools/content/validators';
import type { ValidatorResult } from '../tools/content/validators/types';

const ITEMS = 'combat/items.json';
const NAME = 'content_test_items_01';

function dataFiles(): Map<string, unknown> {
  return new Map(Object.entries(cloneJson(staticDataFiles())));
}

function realItem(files: ReadonlyMap<string, unknown>, id: string): Record<string, unknown> {
  const row = rowsOf(files.get(ITEMS), 'items')?.find((r) => r.id === id);
  if (!row) throw new Error(`no item ${id}`);
  return cloneJson(row);
}

/** A staged batch over the real items: one changed, one unchanged, one new without desc. */
function fixture(files = dataFiles()): StagedBatch {
  const rusty = { ...realItem(files, 'rusty_shortsword'), value: 12 };
  const longsword = realItem(files, 'recruit_longsword');
  return {
    batch: NAME,
    status: 'staged',
    scope: 'test catalog section 3.8',
    depends: [],
    parts: [
      {
        mapping: 'gathering.dian_sources',
        catalog: 'docs/40_design/content/catalog_gathering_crafting.md',
        section: '3.8',
        target: { file: ITEMS, table: 'items' },
        records: [
          rusty,
          longsword,
          {
            id: 'src_test_light',
            name: 'Test sediment',
            kind: 'material',
            quality: 1,
            value: 3,
            tags: ['tainted'],
          },
        ],
        unmapped: [
          { id: 'src_test_light', column: '去处', value: 'recipes' },
          { id: 'src_test_light', column: '备注', value: 'designer note', note: 'own note' },
        ],
        todo: [],
      },
    ],
    steps: [
      { step: 1, name: 'scope', at: '2026-11-01', note: 'test' },
      {
        step: 2,
        name: 'extract',
        at: '2026-11-01',
        command: 'node tools/content/import_catalog.ts extract',
      },
    ],
  };
}

function green(): ValidatorResult[] {
  return [
    { id: 'V1', title: 'schema', findings: [], errors: 0, warnings: 0, infos: 0, ok: true },
    {
      id: 'V2',
      title: 'references',
      findings: [{ level: 'warning', message: 'w' }],
      errors: 0,
      warnings: 1,
      infos: 0,
      ok: true,
    },
  ];
}

function filled(batch = fixture()): StagedBatch {
  const res = editRecord(
    batch,
    0,
    2,
    JSON.stringify({ ...batch.parts[0]?.records[2], desc: 'A grey sediment.' }),
  );
  if (!res.ok) throw new Error(res.error);
  return res.batch;
}

describe('batch listing and loading', () => {
  it('lists index entries plus bundled files the index does not name', () => {
    const index: BatchIndex = {
      batches: [
        { batch: 'content_a_items_01', status: 'staged', file: '_staging/content_a_items_01.json' },
      ],
    };
    const paths = bundledPaths([
      '/data/_staging/index.json',
      '/data/_staging/content_a_items_01.json',
      '/data/_staging/content_b_items_01.json',
    ]);
    expect([...paths.keys()]).toEqual([
      '_staging/index.json',
      '_staging/content_a_items_01.json',
      '_staging/content_b_items_01.json',
    ]);
    expect(batchList(index, paths.keys())).toEqual([
      { batch: 'content_a_items_01', status: 'staged', file: '_staging/content_a_items_01.json' },
      { batch: 'content_b_items_01', status: 'staged', file: '_staging/content_b_items_01.json' },
    ]);
    expect(batchList(index, ['_batches/content_c_items_01.json', 'world/x.json'])).toEqual([
      index.batches[0],
      { batch: 'content_c_items_01', status: 'promoted', file: '_batches/content_c_items_01.json' },
    ]);
    expect(batchList(readIndex(undefined))).toEqual([]);
  });

  it('tells a staged file, a batch record and a broken file apart', () => {
    const staged = interpretBatchFile(fixture());
    expect(staged.kind).toBe('staged');
    const plan = promotePlan(
      filled(),
      dataFiles(),
      readIndex(undefined),
      green(),
      'M0',
      '2026-11-16',
    );
    expect(interpretBatchFile(plan.record).kind).toBe('record');
    const bad = interpretBatchFile({ batch: 'Bad Name', parts: [] });
    expect(bad.kind).toBe('bad');
    expect(bad.kind === 'bad' && bad.problems).toEqual(['bad batch name', 'no parts']);
    // optional arrays missing on disk come back empty
    const { steps: _s, depends: _d, ...bare } = fixture();
    const loaded = interpretBatchFile(bare);
    expect(loaded.kind === 'staged' && loaded.batch.steps).toEqual([]);
    expect(loaded.kind === 'staged' && loaded.batch.depends).toEqual([]);
  });
});

describe('batch view', () => {
  it('diffs every record against the current data, with unmapped cells and todo', () => {
    const view = batchView(fixture(), dataFiles());
    expect(view.totals).toEqual({ added: 1, changed: 1, unchanged: 1 });
    const records = view.parts[0]?.records ?? [];
    expect(records.map((r) => [r.id, r.state])).toEqual([
      ['rusty_shortsword', 'changed'],
      ['recruit_longsword', 'unchanged'],
      ['src_test_light', 'added'],
    ]);
    expect(records[0]?.fields).toEqual(['value']);
    // the mapping's column note fills in, an extraction note wins
    expect(records[2]?.unmapped).toEqual([
      {
        id: 'src_test_light',
        column: '去处',
        value: 'recipes',
        note: 'uses belong to the recipe batches',
      },
      { id: 'src_test_light', column: '备注', value: 'designer note', note: 'own note' },
    ]);
    expect(records[2]?.todo.map((t) => t.field)).toEqual(['desc']);
    expect(records[0]?.todo).toEqual([]);
    expect(view.todo).toEqual(todoOf(fixture()));
    expect(view.parts[0]?.title).toBe('sediment source materials (src_) to items');
  });

  it('lists the required fields a record still lacks', () => {
    expect(todoOf(fixture())).toEqual([
      { id: 'src_test_light', field: 'desc', reason: 'required field not filled' },
    ]);
    expect(todoOf(filled())).toEqual([]);
  });
});

describe('record edits and the fill step', () => {
  it('replaces a record from JSON text and refuses bad edits', () => {
    const batch = fixture();
    const ok = editRecord(batch, 0, 1, JSON.stringify({ id: 'recruit_longsword', value: 1 }));
    expect(ok.ok && ok.batch.parts[0]?.records[1]).toEqual({ id: 'recruit_longsword', value: 1 });
    // the original is untouched
    expect(batch.parts[0]?.records[1]?.value).not.toBe(1);
    expect(editRecord(batch, 0, 1, '{ nope')).toMatchObject({ ok: false, error: 'json' });
    expect(editRecord(batch, 0, 1, '[1]')).toMatchObject({ ok: false, error: 'not_object' });
    expect(editRecord(batch, 0, 1, '{"name":"x"}')).toMatchObject({
      ok: false,
      error: 'no_id',
      detail: 'id',
    });
    expect(editRecord(batch, 0, 1, '{"id":"rusty_shortsword"}')).toMatchObject({
      ok: false,
      error: 'duplicate_id',
      detail: 'rusty_shortsword',
    });
    expect(editRecord(batch, 3, 0, '{"id":"x"}').ok).toBe(false);
  });

  it('records the fill step, drops the old validation and updates the index entry', () => {
    const before: StagedBatch = {
      ...fixture(),
      status: 'validated',
      validation: { milestone: 'M0', at: '2026-11-02', ok: true, results: [] },
    };
    const after = filled(before);
    expect(editedIds(before, after)).toEqual(['src_test_light']);
    const saved = filledBatch(after, '2026-11-16', editedIds(before, after));
    expect(saved.status).toBe('staged');
    expect('validation' in saved).toBe(false);
    expect(saved.steps.at(-1)).toEqual({
      step: 3,
      name: 'fill',
      at: '2026-11-16',
      note: 'filled in the editor batch view: src_test_light',
    });
    expect(saved.steps.length).toBe(before.steps.length + 1);
    const index = stagedIndex(readIndex(undefined), saved);
    expect(index.batches).toEqual([
      { batch: NAME, status: 'staged', file: `_staging/${NAME}.json` },
    ]);
  });
});

describe('validation input', () => {
  it('validates the data as if the batch were promoted, with the lazy inputs injected', () => {
    const files = dataFiles();
    const batch = filled(fixture(files));
    const base = buildContent();
    let flagsSeen: unknown = null;
    const input = validationInput({ content: base, files, packs: [] }, batch, 2, {
      codeSources: { 'game/x.ts': '' },
      initialFlags: (content) => {
        flagsSeen = content;
        return { act: 'prologue' };
      },
      endingRoutes: ['route_a'],
      routeProblems: () => ['p1'],
      uiText: { 'a.b': 'text' },
    });
    const items = input.content.items as { id: string; value: number }[];
    expect(items.find((i) => i.id === 'src_test_light')).toBeTruthy();
    expect(items.find((i) => i.id === 'rusty_shortsword')?.value).toBe(12);
    // the base content is not touched
    expect(base.items.find((i) => i.id === 'src_test_light')).toBeUndefined();
    expect(rowsOf(input.files.get(ITEMS), 'items')?.some((r) => r.id === 'src_test_light')).toBe(
      true,
    );
    expect(rowsOf(files.get(ITEMS), 'items')?.some((r) => r.id === 'src_test_light')).toBe(false);
    expect(flagsSeen).toBe(input.content);
    expect(input).toMatchObject({
      milestone: 2,
      initialFlags: { act: 'prologue' },
      endingRoutes: ['route_a'],
      routeProblems: ['p1'],
      uiText: { 'a.b': 'text' },
      codeSources: { 'game/x.ts': '' },
    });
    expect(input.assetIds).toBeUndefined();
  });

  it('survives failing lazy inputs', () => {
    const files = dataFiles();
    const input = validationInput(
      { content: buildContent(), files, packs: [] },
      fixture(files),
      0,
      {
        initialFlags: () => {
          throw new Error('no world');
        },
        routeProblems: () => {
          throw new Error('bad routes');
        },
      },
    );
    expect(input.initialFlags).toBeUndefined();
    expect(input.routeProblems).toEqual(['route table check crashed: bad routes']);
  });

  it('feeds the shared validators', () => {
    const files = dataFiles();
    const input = validationInput(
      { content: buildContent(), files, packs: [] },
      filled(fixture(files)),
      0,
    );
    const results = runValidators(input, ['V1', 'V3']);
    expect(results.map((r) => r.id)).toEqual(['V1', 'V3']);
    for (const r of results)
      expect(r.findings.filter((f) => f.message.startsWith('validator crashed'))).toEqual([]);
  });

  it('flattens interface text and splits findings by level', () => {
    expect(flattenText({ a: { b: 'x', c: { d: 'y' } }, e: 1 })).toEqual({
      'a.b': 'x',
      'a.c.d': 'y',
    });
    const r: ValidatorResult = {
      id: 'V4',
      title: 'registry',
      findings: [
        { level: 'warning', message: 'w' },
        { level: 'error', message: 'e' },
        { level: 'info', message: 'i' },
      ],
      errors: 1,
      warnings: 1,
      infos: 1,
      ok: false,
    };
    const s = splitFindings(r);
    expect([s.errors, s.warnings, s.infos].map((l) => l.map((f) => f.message))).toEqual([
      ['e'],
      ['w'],
      ['i'],
    ]);
  });

  it('keys a run on the workspace revision, the milestone and the batch', () => {
    const batch = fixture();
    const key = runKey(3, 'M0', batch);
    expect(runKey(3, 'M0', fixture())).toBe(key);
    expect(runKey(4, 'M0', batch)).not.toBe(key);
    expect(runKey(3, 'M1', batch)).not.toBe(key);
    expect(runKey(3, 'M0', filled(batch))).not.toBe(key);
  });
});

describe('promotion', () => {
  const base = {
    writable: true,
    dirty: false,
    dirtyTargets: [] as string[],
    todo: 0,
    run: { key: 'k', ok: true },
    key: 'k',
  };

  it('gates on the service, saved edits, target drafts, todo and a fresh green run', () => {
    expect(promoteBlock(base)).toBeNull();
    expect(promoteBlock({ ...base, writable: false })).toBe('readonly');
    expect(promoteBlock({ ...base, dirty: true })).toBe('dirty');
    expect(promoteBlock({ ...base, dirtyTargets: [ITEMS] })).toBe('dirty_target');
    expect(promoteBlock({ ...base, todo: 1 })).toBe('todo');
    expect(promoteBlock({ ...base, run: null })).toBe('not_run');
    expect(promoteBlock({ ...base, key: 'other' })).toBe('stale');
    expect(promoteBlock({ ...base, run: { key: 'k', ok: false } })).toBe('failing');
  });

  it('blocks only target drafts the promotion would not write as they are', () => {
    const files = dataFiles();
    const batch = filled(fixture(files));
    expect(targetFiles(batch)).toEqual([ITEMS]);
    expect(dirtyTargets(batch, files, () => false)).toEqual([]);
    // an unrelated draft of the target file
    expect(dirtyTargets(batch, files, (f) => f === ITEMS)).toEqual([ITEMS]);
    // a draft that already is the merged file (a save cut short by a reload)
    const merged = applyBatch(files, batch);
    expect(dirtyTargets(batch, merged, (f) => f === ITEMS)).toEqual([]);
  });

  it('plans the merged files, the record with steps 4 and 5, the index and the removal', () => {
    const files = dataFiles();
    const batch = filled(fixture(files));
    const index: BatchIndex = {
      batches: [{ batch: NAME, status: 'staged', file: `_staging/${NAME}.json` }],
    };
    expect(() => promotePlan(batch, files, index, [], 'M0', '2026-11-16')).toThrow();
    expect(() =>
      promotePlan(
        batch,
        files,
        index,
        [{ ...(green()[0] as ValidatorResult), ok: false, errors: 1 }],
        'M0',
        'x',
      ),
    ).toThrow();
    expect(() => promotePlan(fixture(files), files, index, green(), 'M0', 'x')).toThrow(
      /required field/,
    );
    const plan = promotePlan(batch, files, index, green(), 'M1', '2026-11-16');
    expect(plan.writes.map((w) => w.file)).toEqual([ITEMS]);
    const rows = rowsOf(plan.writes[0]?.data, 'items') ?? [];
    expect(rows.find((r) => r.id === 'src_test_light')?.desc).toBe('A grey sediment.');
    expect(rows.find((r) => r.id === 'rusty_shortsword')?.value).toBe(12);
    expect(rows.length).toBe((rowsOf(files.get(ITEMS), 'items') ?? []).length + 1);
    expect(plan.record).toMatchObject({
      batch: NAME,
      status: 'promoted',
      files: [ITEMS],
      added: ['src_test_light'],
      changed: [{ id: 'rusty_shortsword', fields: ['value'] }],
      removed: [],
      validation: { milestone: 'M1', at: '2026-11-16', ok: true },
    });
    expect(plan.record.steps.slice(-2).map((s) => [s.step, s.name])).toEqual([
      [4, 'validate'],
      [5, 'promote'],
    ]);
    expect(plan.record.steps.slice(0, batch.steps.length)).toEqual(batch.steps);
    expect(plan.recordPath).toBe(`_batches/${NAME}.json`);
    expect(plan.staged).toBe(`_staging/${NAME}.json`);
    expect(plan.index.batches).toEqual([
      { batch: NAME, status: 'promoted', file: `_batches/${NAME}.json` },
    ]);
    expect(promotedIndex(index, NAME)).toEqual(plan.index);
    // finishing again over the merged files writes the same data (idempotent)
    const merged = new Map(files);
    for (const w of plan.writes) merged.set(w.file, w.data);
    expect(finishWrites(batch, merged)).toEqual(plan.writes);
  });

  it('recognises a promotion a page reload cut short', () => {
    const files = dataFiles();
    const batch = filled(fixture(files));
    const plan = promotePlan(batch, files, readIndex(undefined), green(), 'M0', '2026-11-16');
    expect(interruptedPromotion(batch, plan.record)).toBe(true);
    // a batch re-extracted under the same name has fresh steps
    const fresh: StagedBatch = {
      ...batch,
      steps: [{ step: 1, name: 'scope', at: '2026-12-01' }],
    };
    expect(interruptedPromotion(fresh, plan.record)).toBe(false);
    // the staged file is gone: only an index entry still staged means unfinished
    const staged = { batch: NAME, status: 'staged' as const, file: `_staging/${NAME}.json` };
    expect(interruptedPromotion(null, plan.record, staged)).toBe(true);
    expect(interruptedPromotion(null, plan.record, { ...staged, status: 'promoted' })).toBe(false);
    expect(interruptedPromotion(null, plan.record)).toBe(false);
    // a record whose last step is not the promotion, or no record at all
    const verified = {
      ...plan.record,
      steps: [...plan.record.steps, { step: 6, name: 'verify', at: 'x' }],
    };
    expect(interruptedPromotion(batch, verified)).toBe(false);
    expect(interruptedPromotion(batch, undefined)).toBe(false);
    expect(interruptedPromotion(batch, batch)).toBe(false);
  });
});
