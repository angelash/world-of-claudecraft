// Editor workspace and dev-service client: reading through /api/data with a graceful
// read-only fallback, drafts (persisted across reloads), content rebuilt with drafts
// and validated by the real validateContent, saving, and the data file formatter.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allPacks, allSchemas, buildContent, validateContent } from '../src/content';
import type { TableSchema } from '../src/content/pack';
import {
  createDataApi,
  type DataApi,
  type FetchLike,
  type ReadResult,
  summarizeLlm,
  type WriteResult,
} from '../src/editor/api/data_client';
import { fileShape, patchArrayTable, rowsOf, withRows } from '../src/editor/content/rows';
import { formatRoute, parseRoute } from '../src/editor/shell/route';
import { staticDataFiles } from '../src/editor/state/static_data';
import { type StorageLike, Workspace } from '../src/editor/state/workspace';
import { cloneJson, deepEqual, formatJson } from '../src/editor/util/json';
import type { MapDef } from '../src/systems/world/types';

const MAP_FILE = 'world/maps_test.json';

class MemoryStorage implements StorageLike {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

/** In-memory dev service: files under data/, or "down" to simulate a plain Vite server. */
class FakeApi implements DataApi {
  writes: { file: string; data: unknown }[] = [];
  constructor(
    public files: Record<string, unknown>,
    public down = false,
  ) {}
  async read(file: string): Promise<ReadResult> {
    if (this.down) return { ok: false, reason: 'unavailable', message: 'down' };
    if (!(file in this.files)) return { ok: false, reason: 'missing', message: 'no such file' };
    return { ok: true, data: cloneJson(this.files[file]) };
  }
  async write(file: string, data: unknown): Promise<WriteResult> {
    if (this.down) return { ok: false, reason: 'unavailable', message: 'down' };
    this.files[file] = cloneJson(data);
    this.writes.push({ file, data });
    return { ok: true };
  }
  async remove(file: string): Promise<WriteResult> {
    if (this.down) return { ok: false, reason: 'unavailable', message: 'down' };
    if (!(file in this.files)) return { ok: false, reason: 'error', message: 'not_found' };
    delete this.files[file];
    return { ok: true };
  }
  async llmStatus() {
    return { reachable: false as const, message: 'n/a' };
  }
}

/** A dev service holding every bundled data file. */
function fullApi(): FakeApi {
  return new FakeApi(cloneJson(staticDataFiles()));
}

function makeWorkspace(api: DataApi, storage = new MemoryStorage()) {
  const statics = staticDataFiles();
  return new Workspace({
    api,
    schemas: allSchemas(),
    packs: allPacks(),
    baseContent: buildContent(),
    staticFiles: statics,
    storage,
  });
}

function mapsSchema(): TableSchema {
  const s = allSchemas().find((x) => x.file === MAP_FILE);
  if (!s) throw new Error('world maps schema missing');
  return s;
}

describe('static data', () => {
  it('bundles every data file keyed by its path under data/', () => {
    const files = staticDataFiles();
    expect(Object.keys(files)).toContain(MAP_FILE);
    const onDisk = JSON.parse(readFileSync(join(__dirname, '..', 'data', MAP_FILE), 'utf8'));
    expect(files[MAP_FILE]).toEqual(onDisk);
  });
});

describe('Workspace', () => {
  it('loads files through the dev service and starts clean', async () => {
    const api = fullApi();
    const ws = makeWorkspace(api);
    await ws.init();
    expect(ws.apiState).toBe('available');
    expect(ws.readOnly).toBe(false);
    expect(ws.file(MAP_FILE)?.source).toBe('api');
    expect(ws.dirtyFiles()).toEqual([]);
    expect(ws.problems()).toEqual(validateContent(buildContent()));
  });

  it('falls back to the bundled files read-only when the service is down', async () => {
    const ws = makeWorkspace(new FakeApi({}, true));
    await ws.init();
    expect(ws.apiState).toBe('unavailable');
    expect(ws.readOnly).toBe(true);
    expect(ws.file(MAP_FILE)?.source).toBe('static');
    expect(rowsOf(ws.data(MAP_FILE), 'maps')?.[0]?.id).toBe('testfield');
    ws.setData(MAP_FILE, []);
    expect(ws.dirtyFiles()).toEqual([]);
    expect((await ws.save(MAP_FILE)).ok).toBe(true);
  });

  it('keeps the service available when it answers with an error for one file', async () => {
    const api = new FakeApi({});
    api.read = async () => ({ ok: false, reason: 'error', message: 'invalid_json_on_disk' });
    const ws = makeWorkspace(api);
    await ws.init();
    expect(ws.apiState).toBe('available');
    expect(ws.file(MAP_FILE)?.error).toBe('invalid_json_on_disk');
    expect(ws.file(MAP_FILE)?.source).toBe('static');
  });

  it('marks a file missing when the service answers but the file does not exist', async () => {
    const ws = makeWorkspace(new FakeApi({}));
    await ws.init();
    expect(ws.apiState).toBe('available');
    expect(ws.file(MAP_FILE)?.source).toBe('missing');
    expect(ws.data(MAP_FILE)).toBeUndefined();
  });

  it('rebuilds content with drafts so validateContent sees unsaved edits', async () => {
    const ws = makeWorkspace(fullApi());
    await ws.init();
    const schema = mapsSchema();
    const rows = ws.rows(schema) as unknown as MapDef[];
    const broken: MapDef = {
      ...(rows[0] as MapDef),
      exits: [{ id: 'x', x: 1, y: 1, toMap: 'nowhere', toX: 0, toY: 0, label: 'x' }],
    };
    ws.setRows(schema, [broken as unknown as Record<string, unknown>]);
    expect(ws.dirtyFiles()).toEqual([MAP_FILE]);
    const built = buildContent();
    expect(ws.content().maps).toHaveLength(built.maps.length);
    const edited = ws.content().maps.find((m) => m.id === 'testfield');
    expect(edited?.exits[0]?.toMap).toBe('nowhere');
    // The rows from the edited file sit where the file's rows were.
    expect(ws.content().maps.map((m) => m.id)).toEqual(built.maps.map((m) => m.id));
    expect(ws.problems()).toContain('map testfield: exit x -> unknown map nowhere');
    expect(validateContent(built)).not.toContain('map testfield: exit x -> unknown map nowhere');
    // The built content of the page is never mutated.
    expect(built.maps.find((m) => m.id === 'testfield')?.exits).toEqual([]);
    ws.setRows(schema, rows as unknown as Record<string, unknown>[]);
    expect(ws.dirtyFiles()).toEqual([]);
    expect(ws.problems()).toEqual(validateContent(built));
  });

  it('reports a crashing pack validator instead of throwing', async () => {
    const ws = makeWorkspace(fullApi());
    await ws.init();
    ws.setRows(mapsSchema(), [{ id: 'half', name: 'half-edited' }]);
    const problems = ws.problems();
    expect(problems.some((p) => p.includes('world'))).toBe(true);
  });

  it('collects ids for ref fields, with drafts', async () => {
    const ws = makeWorkspace(fullApi());
    await ws.init();
    const before = ws.tableIds('maps') ?? new Set<string>();
    expect(before.has('testfield')).toBe(true);
    expect(before.has('second')).toBe(false);
    const rows = ws.rows(mapsSchema()) as Record<string, unknown>[];
    ws.setRows(mapsSchema(), [...rows, { ...(rows[0] as object), id: 'second' }]);
    const after = ws.tableIds('maps') ?? new Set<string>();
    expect(after.has('second')).toBe(true);
    expect(after.size).toBe(before.size + 1);
    expect(ws.tableIds('no_such_table')).toBeUndefined();
  });

  it('saves drafts through the dev service and clears them', async () => {
    const api = fullApi();
    const storage = new MemoryStorage();
    const ws = makeWorkspace(api, storage);
    await ws.init();
    const rows = ws.rows(mapsSchema()) as Record<string, unknown>[];
    ws.setRows(mapsSchema(), [{ ...(rows[0] as object), name: '改名原野' }]);
    expect(storage.length).toBe(1);
    const res = await ws.save(MAP_FILE);
    expect(res.ok).toBe(true);
    expect(api.writes).toHaveLength(1);
    expect((api.files[MAP_FILE] as MapDef[])[0]?.name).toBe('改名原野');
    expect(ws.dirtyFiles()).toEqual([]);
    expect(storage.length).toBe(0);
  });

  it('keeps the draft when saving fails and drops to read-only when the service vanishes', async () => {
    const api = fullApi();
    const ws = makeWorkspace(api);
    await ws.init();
    ws.setRows(mapsSchema(), []);
    api.down = true;
    const res = await ws.save(MAP_FILE);
    expect(res.ok).toBe(false);
    expect(ws.isDirty(MAP_FILE)).toBe(true);
    expect(ws.readOnly).toBe(true);
  });

  it('restores drafts from storage after a reload and flags stale ones', async () => {
    const storage = new MemoryStorage();
    const api = fullApi();
    const first = makeWorkspace(api, storage);
    await first.init();
    first.setRows(mapsSchema(), []);
    const second = makeWorkspace(api, storage);
    await second.init();
    expect(second.restoredDrafts).toEqual([MAP_FILE]);
    expect(second.rows(mapsSchema())).toEqual([]);
    expect(second.file(MAP_FILE)?.staleDraft).toBe(false);
    // Someone changes the file on disk: the restored draft is marked stale.
    api.files[MAP_FILE] = [...(api.files[MAP_FILE] as unknown[]), { id: 'other' }];
    const third = makeWorkspace(api, storage);
    await third.init();
    expect(third.file(MAP_FILE)?.staleDraft).toBe(true);
  });

  it('notifies subscribers and bumps the revision on change', async () => {
    const ws = makeWorkspace(fullApi());
    let calls = 0;
    ws.subscribe(() => calls++);
    await ws.init();
    const r0 = ws.revision;
    ws.setRows(mapsSchema(), []);
    expect(calls).toBe(2);
    expect(ws.revision).toBe(r0 + 1);
    ws.discard(MAP_FILE);
    expect(ws.isDirty(MAP_FILE)).toBe(false);
  });

  it('lists every data file with drafts overlaid', async () => {
    const ws = makeWorkspace(fullApi());
    await ws.init();
    ws.setData(MAP_FILE, [{ id: 'only' }]);
    expect(ws.allData().get(MAP_FILE)).toEqual([{ id: 'only' }]);
  });
});

describe('rows and patching', () => {
  it('reads rows from array files and from { table: [...] } files', () => {
    expect(rowsOf([{ id: 'a' }], 'items')).toEqual([{ id: 'a' }]);
    expect(rowsOf({ items: [{ id: 'b' }], other: 1 }, 'items')).toEqual([{ id: 'b' }]);
    expect(rowsOf({ config: true }, 'items')).toBeNull();
    expect(withRows({ items: [], other: 1 }, 'items', [{ id: 'c' }])).toEqual({
      items: [{ id: 'c' }],
      other: 1,
    });
    expect(withRows([{ id: 'x' }], 'items', [])).toEqual([]);
  });

  it('treats an object with an id as a single-row file and keeps that shape', () => {
    const map = { id: 'seal_ruins', name: 'x', rows: [] };
    expect(fileShape(map, 'maps')).toBe('single');
    expect(fileShape({ maps: [] }, 'maps')).toBe('keyed');
    expect(fileShape([], 'maps')).toBe('array');
    expect(fileShape({ config: 1 }, 'maps')).toBe('other');
    expect(fileShape({ key: 'k' }, 'maps', 'key')).toBe('single');
    expect(rowsOf(map, 'maps')).toEqual([map]);
    expect(withRows(map, 'maps', [{ ...map, name: 'y' }])).toEqual({ ...map, name: 'y' });
    expect(withRows(map, 'maps', [])).toBe(map);
  });

  it('rebuilds content from a draft of a single-row file in place', async () => {
    const single = { id: 'solo', name: 'S', items: true };
    const statics = { 'solo/one.json': single };
    const schema: TableSchema = {
      table: 'solos',
      label: 's',
      file: 'solo/one.json',
      idField: 'id',
      fields: [],
    };
    const ws = new Workspace({
      api: new FakeApi(cloneJson(statics)),
      schemas: [schema],
      packs: [],
      baseContent: { solos: [{ id: 'before' }, single, { id: 'after' }] } as never,
      staticFiles: statics,
    });
    await ws.init();
    ws.setRows(schema, [{ ...single, name: 'S2' }]);
    expect(ws.data('solo/one.json')).toEqual({ id: 'solo', name: 'S2', items: true });
    const solos = (ws.content() as unknown as { solos: { id: string; name?: string }[] }).solos;
    expect(solos.map((r) => r.id)).toEqual(['before', 'solo', 'after']);
    expect(solos[1]?.name).toBe('S2');
  });

  it("replaces a file's rows in place by identity or id, appending when none matched", () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const c = { id: 'c' };
    const base = [a, b, c];
    expect(
      patchArrayTable(base, { table: 't', idField: 'id', previous: [b], rows: [{ id: 'b2' }] }),
    ).toEqual([a, { id: 'b2' }, c]);
    expect(
      patchArrayTable(base, {
        table: 't',
        idField: 'id',
        previous: [{ id: 'a' }, { id: 'c' }],
        rows: [],
      }),
    ).toEqual([b]);
    expect(
      patchArrayTable(base, { table: 't', idField: 'id', previous: [], rows: [{ id: 'd' }] }),
    ).toEqual([a, b, c, { id: 'd' }]);
  });
});

describe('data client', () => {
  function fakeFetch(
    handler: (
      url: string,
      init?: { method?: string; body?: string },
    ) => { status: number; type?: string; body: string } | Error,
  ): FetchLike {
    return async (url, init) => {
      const r = handler(url, init);
      if (r instanceof Error) throw r;
      return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        headers: {
          get: (n: string) => (n.toLowerCase() === 'content-type' ? (r.type ?? null) : null),
        },
        text: async () => r.body,
      };
    };
  }

  it('reads JSON files and encodes the path', async () => {
    let seen = '';
    const api = createDataApi(
      fakeFetch((url) => {
        seen = url;
        return { status: 200, type: 'application/json', body: '[1,2]' };
      }),
    );
    expect(await api.read('world/a b.json')).toEqual({ ok: true, data: [1, 2] });
    expect(seen).toBe('/api/data?file=world%2Fa%20b.json');
  });

  it('tells a missing file from a missing route', async () => {
    const missing = createDataApi(
      fakeFetch(() => ({ status: 404, type: 'application/json', body: '{"error":"no file"}' })),
    );
    expect(await missing.read('x.json')).toEqual({
      ok: false,
      reason: 'missing',
      message: 'no file',
    });
    const plain404 = createDataApi(
      fakeFetch(() => ({ status: 404, type: 'text/plain', body: 'Not Found' })),
    );
    expect((await plain404.read('x.json')).ok).toBe(false);
    expect(await plain404.read('x.json')).toMatchObject({ reason: 'unavailable' });
    const htmlFallback = createDataApi(
      fakeFetch(() => ({ status: 200, type: 'text/html', body: '<!doctype html>' })),
    );
    expect(await htmlFallback.read('x.json')).toMatchObject({ reason: 'unavailable' });
    const network = createDataApi(fakeFetch(() => new Error('ECONNREFUSED')));
    expect(await network.read('x.json')).toMatchObject({ reason: 'unavailable' });
  });

  it('writes formatted JSON with PUT and reports server errors', async () => {
    let body = '';
    let method = '';
    const api = createDataApi(
      fakeFetch((_url, init) => {
        method = init?.method ?? '';
        body = init?.body ?? '';
        return { status: 204, body: '' };
      }),
    );
    expect(await api.write('a.json', [{ id: 'x' }])).toEqual({ ok: true });
    expect(method).toBe('PUT');
    expect(JSON.parse(body)).toEqual([{ id: 'x' }]);
    const refused = createDataApi(
      fakeFetch(() => ({
        status: 400,
        type: 'application/json',
        body: '{"ok":false,"error":"traversal"}',
      })),
    );
    expect(await refused.write('../x.json', 1)).toEqual({
      ok: false,
      reason: 'error',
      message: 'traversal',
    });
    const remote = createDataApi(
      fakeFetch(() => ({
        status: 403,
        type: 'application/json',
        body: '{"ok":false,"error":"forbidden","message":"dev api serves loopback only"}',
      })),
    );
    expect(await remote.write('a.json', 1)).toEqual({
      ok: false,
      reason: 'unavailable',
      message: 'dev api serves loopback only',
    });
    expect(await remote.read('a.json')).toMatchObject({ reason: 'unavailable' });
  });

  it('summarises the model status loosely', async () => {
    expect(summarizeLlm({ enabled: false, provider: 'anthropic' })).toEqual({
      enabled: false,
      detail: 'anthropic',
    });
    expect(
      summarizeLlm({
        available: false,
        reason: 'no_credentials',
        tiers: { top: 'm1', low: 'm3' },
        serverFallback: {},
      }),
    ).toEqual({ enabled: false, detail: 'no_credentials / top m1 / low m3' });
    expect(summarizeLlm({ available: true, model: 'm' })).toEqual({ enabled: true, detail: 'm' });
    expect(summarizeLlm(null)).toEqual({ enabled: null, detail: '' });
    const api = createDataApi(
      fakeFetch(() => ({ status: 200, type: 'application/json', body: '{"enabled":true}' })),
    );
    expect(await api.llmStatus()).toEqual({ reachable: true, data: { enabled: true } });
  });
});

describe('formatJson', () => {
  it('reproduces the hand-written style of the bundled map file byte for byte', () => {
    const text = readFileSync(join(__dirname, '..', 'data', MAP_FILE), 'utf8');
    expect(formatJson(JSON.parse(text))).toBe(text.replace(/\r\n/g, '\n'));
  });

  it('round-trips and drops undefined keys', () => {
    const v = { a: [1, 2], b: { c: 'x', d: undefined }, e: [{ f: [true, null] }] };
    expect(JSON.parse(formatJson([v]))).toEqual([
      { a: [1, 2], b: { c: 'x' }, e: [{ f: [true, null] }] },
    ]);
  });

  it('wraps values that do not fit in the width', () => {
    const long = { rows: ['x'.repeat(60), 'y'.repeat(60)] };
    const text = formatJson([{ id: 'm', ...long }]);
    expect(text).toContain(`"rows": [\n      "${'x'.repeat(60)}",`);
  });

  it('deepEqual ignores key order and undefined keys', () => {
    expect(deepEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(deepEqual({ a: 1, x: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual({ a: [] }, { a: {} })).toBe(false);
  });
});

describe('routes', () => {
  it('parses and formats tool routes with params', () => {
    expect(parseRoute('', 'content')).toEqual({ tool: 'content', params: {} });
    expect(parseRoute('#/map?map=testfield&file=world%2Fmaps_test.json', 'content')).toEqual({
      tool: 'map',
      params: { map: 'testfield', file: 'world/maps_test.json' },
    });
    const r = { tool: 'content', params: { file: 'a/b.json', row: 'x y', empty: '' } };
    expect(parseRoute(formatRoute(r), 'z')).toEqual({
      tool: 'content',
      params: { file: 'a/b.json', row: 'x y' },
    });
  });
});
