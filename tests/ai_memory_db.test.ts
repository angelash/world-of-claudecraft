import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AiMemoryAuditRecord } from '../server/ai/ai_types';
import { AI_MEMORY_SCHEMA, PgAiMemoryDb, normalizeAiMemoryAuditRecord } from '../server/ai_memory_db';

class FakePool {
  calls: Array<{ sql: string; values?: readonly unknown[] }> = [];
  payloadRows: Array<Record<string, unknown>> = [];
  rowCount = 0;

  async query(sql: string, values?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> {
    this.calls.push({ sql, values });
    if (sql.includes('INSERT INTO ai_memory_records') && values) {
      const payload = JSON.parse(String(values[17])) as Record<string, unknown>;
      this.payloadRows = [{ payload }];
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT payload')) return { rows: this.payloadRows, rowCount: this.payloadRows.length };
    if (sql.includes('DELETE FROM ai_memory_records')) return { rows: [], rowCount: this.rowCount };
    return { rows: [], rowCount: 0 };
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
});
