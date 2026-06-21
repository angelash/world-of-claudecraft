import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AiMemoryAuditRecord } from '../server/ai/ai_types';
import { AI_MEMORY_SCHEMA, PgAiMemoryDb, normalizeAiMemoryAuditRecord } from '../server/ai_memory_db';
import { REALM } from '../server/realm';

class FakePool {
  calls: Array<{ sql: string; values?: readonly unknown[] }> = [];
  payloadRows: Array<Record<string, unknown>> = [];
  rowCount = 0;

  async query(sql: string, values?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> {
    this.calls.push({ sql, values });
    if (sql.includes('INSERT INTO ai_memory_records') && values) {
      const payload = JSON.parse(String(values[17])) as Record<string, unknown>;
      this.payloadRows.push({ payload });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT payload')) {
      const rows = this.filteredPayloadRows(values);
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('DELETE FROM ai_memory_records')) return { rows: [], rowCount: this.rowCount };
    return { rows: [], rowCount: 0 };
  }

  private filteredPayloadRows(values?: readonly unknown[]): Array<Record<string, unknown>> {
    if (!values) return this.payloadRows;
    const sourcePlayerEntityId = typeof values[1] === 'number' ? values[1] : null;
    const sceneId = typeof values[2] === 'string' ? values[2] : '';
    const zoneId = typeof values[3] === 'string' ? values[3] : '';
    const kinds = Array.isArray(values[4]) ? new Set(values[4].filter((value): value is string => typeof value === 'string')) : null;
    const scopes = Array.isArray(values[5]) ? new Set(values[5].filter((value): value is string => typeof value === 'string')) : null;
    const nowSeconds = typeof values[6] === 'number' ? values[6] : 0;
    const limit = typeof values[7] === 'number' ? values[7] : 20;
    return this.payloadRows
      .filter((row) => {
        const payload = row.payload as Partial<AiMemoryAuditRecord> | undefined;
        if (!payload || sourcePlayerEntityId === null || payload.sourcePlayerEntityId !== sourcePlayerEntityId) return false;
        if (kinds && (!payload.kind || !kinds.has(payload.kind))) return false;
        if (scopes && (!payload.scope || !scopes.has(payload.scope))) return false;
        if (typeof payload.expiresAt === 'number' && payload.expiresAt <= nowSeconds) return false;
        if (!sceneId && !zoneId) return true;
        if (sceneId && payload.sceneId === sceneId) return true;
        return Boolean(zoneId && payload.scope === 'region' && payload.zoneId === zoneId);
      })
      .sort((a, b) => {
        const left = a.payload as Partial<AiMemoryAuditRecord>;
        const right = b.payload as Partial<AiMemoryAuditRecord>;
        return (right.salience ?? 0) - (left.salience ?? 0)
          || (right.createdAt ?? 0) - (left.createdAt ?? 0);
      })
      .slice(0, Math.max(1, limit));
  }
}

const record: AiMemoryAuditRecord = {
  kind: 'rumor',
  refId: 'rumor-1',
  scope: 'region',
  sceneId: 'eastbrook_forge',
  zoneId: 'eastbrook_vale',
  sourcePlayerEntityId: 437,
  itemId: 'redbrook_blade',
  subjectKind: 'item',
  lineIds: ['hudChrome.aiSpeech.itemInterestInspect'],
  salience: 0.75,
  createdAt: 12,
  expiresAt: 102,
  reason: 'discarded:redbrook_blade',
};

describe('AI memory DB', () => {
  it('defines additive schema and query indexes for persistent living-world memory', () => {
    expect(AI_MEMORY_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS ai_memory_records');
    expect(AI_MEMORY_SCHEMA).toContain('ALTER TABLE ai_memory_records ADD COLUMN IF NOT EXISTS realm');
    expect(AI_MEMORY_SCHEMA).toContain('CREATE UNIQUE INDEX IF NOT EXISTS ai_memory_records_ref');
    expect(AI_MEMORY_SCHEMA).toContain('CREATE INDEX IF NOT EXISTS ai_memory_records_player_scene');
    expect(AI_MEMORY_SCHEMA).toContain('CREATE INDEX IF NOT EXISTS ai_memory_records_player_zone');
  });

  it('is included in the boot-time schema setup', () => {
    const dbSource = readFileSync('server/db.ts', 'utf8');
    expect(dbSource).toContain("import { AI_MEMORY_SCHEMA } from './ai_memory_db'");
    expect(dbSource).toContain('await client.query(AI_MEMORY_SCHEMA)');
  });

  it('saves and reloads audit records through JSON payloads without widening gameplay authority', async () => {
    const pool = new FakePool();
    const db = new PgAiMemoryDb(pool);

    await db.saveRecords([record]);
    const insert = pool.calls[0];
    expect(insert.sql).toContain('ON CONFLICT (realm, kind, ref_id, source_player_entity_id) DO UPDATE');
    expect(insert.values).toEqual(expect.arrayContaining([
      'rumor',
      'rumor-1',
      'region',
      'eastbrook_forge',
      'eastbrook_vale',
      437,
      'redbrook_blade',
      'item',
      ['hudChrome.aiSpeech.itemInterestInspect'],
      0.75,
      12,
      102,
      'discarded:redbrook_blade',
      JSON.stringify(record),
    ]));

    const loaded = await db.loadRecords({
      sourcePlayerEntityId: 437,
      nowSeconds: 20,
      zoneId: 'eastbrook_vale',
      kinds: ['rumor'],
      scopes: ['region'],
    });

    expect(loaded).toEqual([record]);
    const select = pool.calls[1];
    expect(select.sql).toContain('source_player_entity_id = $2');
    expect(select.sql).toContain('sim_expires_at > $7');
  });

  it('loads same-scene records and same-zone region records while isolating players and expired rows', async () => {
    const pool = new FakePool();
    pool.payloadRows = [
      {
        payload: {
          ...record,
          refId: 'scene-match',
          scope: 'scene',
          sceneId: 'mirror_lake_dock',
          zoneId: 'eastbrook_vale',
          salience: 0.6,
        },
      },
      {
        payload: {
          ...record,
          refId: 'region-match',
          scope: 'region',
          sceneId: 'eastbrook_forge',
          zoneId: 'eastbrook_vale',
          salience: 0.9,
        },
      },
      {
        payload: {
          ...record,
          refId: 'other-player',
          sourcePlayerEntityId: 438,
          scope: 'region',
          zoneId: 'eastbrook_vale',
          salience: 1,
        },
      },
      {
        payload: {
          ...record,
          refId: 'expired-region',
          scope: 'region',
          zoneId: 'eastbrook_vale',
          expiresAt: 19,
          salience: 1,
        },
      },
      {
        payload: {
          ...record,
          refId: 'wrong-zone',
          scope: 'region',
          sceneId: 'mirefen_reeds',
          zoneId: 'mirefen_marsh',
          salience: 1,
        },
      },
    ];
    const db = new PgAiMemoryDb(pool);

    const loaded = await db.loadRecords({
      sourcePlayerEntityId: 437,
      nowSeconds: 20,
      sceneId: 'mirror_lake_dock',
      zoneId: 'eastbrook_vale',
      limit: 10,
    });

    expect(loaded.map((entry) => entry.refId)).toEqual(['region-match', 'scene-match']);
    expect(pool.calls[0].sql).toContain("scope = 'region' AND zone_id = $4");
  });

  it('normalizes persisted payloads and drops malformed rows', () => {
    expect(normalizeAiMemoryAuditRecord({ ...record, salience: 2 })).toMatchObject({ salience: 1 });
    expect(normalizeAiMemoryAuditRecord({ ...record, kind: 'questReward' })).toBeNull();
    expect(normalizeAiMemoryAuditRecord({ ...record, sourcePlayerEntityId: '437' })).toBeNull();
  });

  it('prunes expired records in bounded batches', async () => {
    const pool = new FakePool();
    pool.rowCount = 3;
    const db = new PgAiMemoryDb(pool);

    await expect(db.pruneExpired(300, 50)).resolves.toBe(3);
    expect(pool.calls[0].sql).toContain('DELETE FROM ai_memory_records');
    expect(pool.calls[0].values).toEqual(expect.arrayContaining([300, 50]));
  });

  it('clears all persisted AI memory records for the current realm only', async () => {
    const pool = new FakePool();
    pool.rowCount = 9;
    const db = new PgAiMemoryDb(pool);

    await expect(db.clearRecords()).resolves.toBe(9);

    expect(pool.calls[0].sql).toContain('DELETE FROM ai_memory_records');
    expect(pool.calls[0].sql).toContain('WHERE realm = $1');
    expect(pool.calls[0].sql).not.toContain('characters');
    expect(pool.calls[0].values).toEqual([REALM]);
  });
});
