// Contract test: the editor's data client and workspace against the real dev service
// middleware (tools/dev_api.ts) over HTTP, on a temporary data root.

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allPacks, buildContent } from '../src/content';
import type { TableSchema } from '../src/content/pack';
import { createDataApi, type FetchLike, fetchAuditPage } from '../src/editor/api/data_client';
import { parseHistoryPage } from '../src/editor/audit/audit_model';
import { staticDataFiles } from '../src/editor/state/static_data';
import { Workspace } from '../src/editor/state/workspace';
import { createDevApiMiddleware, pageAuditLines } from '../tools/dev_api';

let root = '';
let server: Server;
let base = '';

const ITEMS: TableSchema = {
  table: 'items',
  label: '物品',
  file: 'test/items.json',
  idField: 'id',
  fields: [{ key: 'id', label: 'ID', type: 'string', required: true }],
};

const fetchLike: FetchLike = (url, init) => fetch(url, init);

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'hakoniwa-editor-'));
  await mkdir(join(root, 'data', 'test'), { recursive: true });
  await writeFile(join(root, 'data', 'test', 'items.json'), '[{"id":"a"}]\n', 'utf8');
  await writeFile(join(root, 'data', 'test', 'broken.json'), '[{', 'utf8');
  const mw = createDevApiMiddleware({ root, allowRemote: false });
  server = createServer((req, res) =>
    mw(req, res, () => {
      res.statusCode = 404;
      res.setHeader('content-type', 'text/plain');
      res.end('Not Found');
    }),
  );
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await rm(root, { recursive: true, force: true });
});

describe('editor against tools/dev_api.ts', () => {
  it('reads, reports missing and invalid files, and refuses traversal', async () => {
    const api = createDataApi(fetchLike, base);
    expect(await api.read('test/items.json')).toEqual({ ok: true, data: [{ id: 'a' }] });
    expect(await api.read('test/none.json')).toMatchObject({ ok: false, reason: 'missing' });
    expect(await api.read('test/broken.json')).toMatchObject({ ok: false, reason: 'error' });
    expect(await api.read('../secret.json')).toMatchObject({ ok: false, reason: 'error' });
  });

  it('writes JSON files, creating folders', async () => {
    const api = createDataApi(fetchLike, base);
    expect(await api.write('new/dir/x.json', [{ id: 'x' }])).toEqual({ ok: true });
    const text = await readFile(join(root, 'data', 'new', 'dir', 'x.json'), 'utf8');
    expect(JSON.parse(text)).toEqual([{ id: 'x' }]);
  });

  it('removes staged batch files only (DELETE /api/data)', async () => {
    const api = createDataApi(fetchLike, base);
    const staging = join(root, 'data', '_staging');
    await mkdir(join(staging, 'content_dir_items_01.json'), { recursive: true });
    await writeFile(join(staging, 'index.json'), '{"batches":[]}', 'utf8');
    const staged = join(staging, 'content_test_items_01.json');
    await writeFile(staged, '{"batch":"content_test_items_01"}', 'utf8');
    expect(await api.remove('_staging/content_test_items_01.json')).toEqual({ ok: true });
    expect(existsSync(staged)).toBe(false);
    // gone now: 404
    const again = await fetch(`${base}/api/data?file=_staging%2Fcontent_test_items_01.json`, {
      method: 'DELETE',
    });
    expect(again.status).toBe(404);
    expect(await again.json()).toMatchObject({ ok: false, error: 'not_found' });
    expect(await api.remove('_staging/content_none_items_01.json')).toMatchObject({
      ok: false,
      reason: 'error',
      message: 'not_found',
    });
    // the batch index and files not named like a batch stay
    expect(await api.remove('_staging/index.json')).toMatchObject({
      ok: false,
      message: 'not_staging',
    });
    expect(existsSync(join(staging, 'index.json'))).toBe(true);
    expect(await api.remove('_staging/none.json')).toMatchObject({
      ok: false,
      message: 'not_staging',
    });
    // any other data file is refused and stays on disk
    const refused = await fetch(`${base}/api/data?file=test%2Fitems.json`, { method: 'DELETE' });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ ok: false, error: 'not_staging' });
    expect(await api.remove('test/items.json')).toMatchObject({
      ok: false,
      message: 'not_staging',
    });
    expect(existsSync(join(root, 'data', 'test', 'items.json'))).toBe(true);
    expect(await api.remove('_staging/../test/items.json')).toMatchObject({
      ok: false,
      message: 'traversal',
    });
    expect(await api.remove('_staging/content_dir_items_01.json')).toMatchObject({
      ok: false,
      message: 'not_file',
    });
  });

  it('is told apart from a server without the dev service', async () => {
    const api = createDataApi(fetchLike, `${base}/nothing-here`);
    expect(await api.read('test/items.json')).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('drives a full workspace load, edit and save', async () => {
    const api = createDataApi(fetchLike, base);
    const ws = new Workspace({
      api,
      schemas: [ITEMS],
      packs: allPacks(),
      baseContent: buildContent(),
      staticFiles: {},
    });
    await ws.init();
    expect(ws.apiState).toBe('available');
    ws.setRows(ITEMS, [{ id: 'a' }, { id: 'b' }]);
    expect(ws.content().items.map((i) => i.id)).toContain('b');
    expect((await ws.save(ITEMS.file)).ok).toBe(true);
    const onDisk = JSON.parse(await readFile(join(root, 'data', 'test', 'items.json'), 'utf8'));
    expect(onDisk).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(ws.dirtyFiles()).toEqual([]);
  });

  it('writes data files in the hand-written style (the editor formatter), byte for byte', async () => {
    const api = createDataApi(fetchLike, base);
    const original = await readFile(
      join(__dirname, '..', 'data', 'world', 'maps_test.json'),
      'utf8',
    );
    expect(
      await api.write('world/maps_test.json', staticDataFiles()['world/maps_test.json']),
    ).toEqual({ ok: true });
    const written = await readFile(join(root, 'data', 'world', 'maps_test.json'), 'utf8');
    expect(written).toBe(original.split('\r\n').join('\n'));
  });

  it('pages the audit log newest first through GET /api/audit', async () => {
    for (const id of ['audit1', 'audit2', 'audit3']) {
      const res = await fetch(`${base}/api/audit`, {
        method: 'POST',
        body: JSON.stringify({ auditId: id }),
      });
      expect(res.status).toBe(200);
    }
    await writeFile(join(root, '.local', 'audit.jsonl'), 'not json\n', { flag: 'a' });
    const first = await fetchAuditPage(fetchLike, { offset: 0, limit: 2, rotated: false }, base);
    expect(first.ok).toBe(true);
    const page = first.ok ? parseHistoryPage(first.body) : null;
    expect(page?.total).toBe(3);
    expect(page?.skipped).toBe(1);
    expect(page?.records.map((r) => r.auditId)).toEqual(['audit3', 'audit2']);
    expect(typeof page?.records[0]?.receivedAt).toBe('string');
    const second = await fetchAuditPage(fetchLike, { offset: 2, limit: 2, rotated: false }, base);
    expect(second.ok && parseHistoryPage(second.body)?.records.map((r) => r.auditId)).toEqual([
      'audit1',
    ]);
    const rotated = await fetchAuditPage(fetchLike, { offset: 0, limit: 2, rotated: true }, base);
    expect(rotated.ok && parseHistoryPage(rotated.body)?.total).toBe(0);
  });
});

describe('pageAuditLines', () => {
  const text = ['{"auditId":"a"}', '', '[1]', '{"auditId":"b"}', 'oops', '{"auditId":"c"}'].join(
    '\n',
  );

  it('counts valid records, skips bad lines and clamps the window', () => {
    const p = pageAuditLines(text);
    expect(p).toMatchObject({ total: 3, skipped: 2, offset: 0, limit: 100 });
    expect(p.records).toEqual([{ auditId: 'c' }, { auditId: 'b' }, { auditId: 'a' }]);
    expect(pageAuditLines(text, { order: 'asc', offset: 1, limit: 1 }).records).toEqual([
      { auditId: 'b' },
    ]);
    expect(pageAuditLines(text, { limit: 0 }).limit).toBe(1);
    expect(pageAuditLines(text, { limit: 99999 }).limit).toBe(1000);
    expect(pageAuditLines(text, { offset: Number.NaN }).offset).toBe(0);
    expect(pageAuditLines('').total).toBe(0);
  });
});
