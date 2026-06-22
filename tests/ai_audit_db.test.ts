import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AiAuditRecord } from '../server/ai_audit';
import { AI_AUDIT_SCHEMA, PgAiAuditDb, normalizeAiAuditRecord } from '../server/ai_audit_db';
import { REALM } from '../server/realm';

class FakePool {
  calls: Array<{ sql: string; values?: readonly unknown[] }> = [];
  payloadRows: Array<Record<string, unknown>> = [];

  async query(sql: string, values?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> {
    this.calls.push({ sql, values });
    if (sql.includes('INSERT INTO ai_audit_records') && values) {
      const payload = JSON.parse(String(values[29])) as Record<string, unknown>;
      this.payloadRows.push({ payload });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT payload')) {
      const limit = typeof values?.[1] === 'number' ? values[1] : 20;
      return { rows: this.payloadRows.slice(0, limit), rowCount: this.payloadRows.length };
    }
    return { rows: [], rowCount: 0 };
  }
}

const record: AiAuditRecord = {
  auditId: 'audit-1',
  realm: REALM,
  jobId: 'ai-1-2-3',
  trigger: 'npc_question',
  entityKind: 'npc',
  entityId: 22,
  templateId: 'brother_aldric',
  playerEntityId: 1,
  sceneId: 'fallen_chapel',
  zoneId: 'eastbrook_vale',
  providerSource: 'codex',
  status: 'accepted',
  latencyMs: 42.5,
  inputTokens: 100,
  outputTokens: 25,
  totalTokens: 125,
  tokenEstimate: true,
  outputMode: 'line_id_only',
  allowedIntentCount: 3,
  allowedLineIdCount: 8,
  memorySignalCount: 2,
  directorProposalCount: 1,
  sceneObjectCount: 4,
  companionCount: 1,
  lineIds: ['hudChrome.aiSpeech.brotherAldricAwake'],
  intents: ['commentOnScene'],
  memoryWriteRefs: ['npcInteraction:npc:1:brother_aldric'],
  reason: 'uses profile line',
  error: '',
  createdAt: '2026-06-22T00:00:00.000Z',
};

describe('AI audit DB', () => {
  it('defines additive schema and query indexes for persistent AI audit records', () => {
    expect(AI_AUDIT_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS ai_audit_records');
    expect(AI_AUDIT_SCHEMA).toContain('ALTER TABLE ai_audit_records ADD COLUMN IF NOT EXISTS realm');
    expect(AI_AUDIT_SCHEMA).toContain('CREATE UNIQUE INDEX IF NOT EXISTS ai_audit_records_audit_id');
    expect(AI_AUDIT_SCHEMA).toContain('CREATE INDEX IF NOT EXISTS ai_audit_records_created');
    expect(AI_AUDIT_SCHEMA).toContain('CREATE INDEX IF NOT EXISTS ai_audit_records_status_created');
    expect(AI_AUDIT_SCHEMA).toContain('CREATE INDEX IF NOT EXISTS ai_audit_records_player_created');
  });

  it('is included in the boot-time schema setup', () => {
    const dbSource = readFileSync('server/db.ts', 'utf8');
    expect(dbSource).toContain("import { AI_AUDIT_SCHEMA } from './ai_audit_db'");
    expect(dbSource).toContain('await client.query(AI_AUDIT_SCHEMA)');
  });

  it('saves and reloads realm-scoped audit records through JSON payloads', async () => {
    const pool = new FakePool();
    const db = new PgAiAuditDb(pool);

    await db.saveRecord(record);
    const insert = pool.calls[0];
    expect(insert.sql).toContain('ON CONFLICT (realm, audit_id) DO UPDATE SET');
    expect(insert.values).toEqual(expect.arrayContaining([
      REALM,
      'audit-1',
      'ai-1-2-3',
      'npc_question',
      'npc',
      22,
      'brother_aldric',
      1,
      'fallen_chapel',
      'eastbrook_vale',
      'codex',
      'accepted',
      42.5,
      100,
      25,
      125,
      true,
      'line_id_only',
      3,
      8,
      2,
      1,
      4,
      1,
      ['hudChrome.aiSpeech.brotherAldricAwake'],
      ['commentOnScene'],
      ['npcInteraction:npc:1:brother_aldric'],
      'uses profile line',
      '',
      JSON.stringify(record),
      '2026-06-22T00:00:00.000Z',
    ]));

    const loaded = await db.recentRecords(20);
    expect(loaded).toEqual([record]);
    const select = pool.calls[1];
    expect(select.sql).toContain('WHERE realm = $1');
    expect(select.sql).toContain('ORDER BY created_at DESC, id DESC');
    expect(select.values).toEqual([REALM, 20]);
  });

  it('clamps recent-record limits to a bounded admin query range', async () => {
    const pool = new FakePool();
    const db = new PgAiAuditDb(pool);

    await db.recentRecords(500);
    await db.recentRecords(-10);

    expect(pool.calls[0].values).toEqual([REALM, 100]);
    expect(pool.calls[1].values).toEqual([REALM, 1]);
  });

  it('normalizes persisted payloads and rejects invalid statuses', () => {
    expect(normalizeAiAuditRecord({ ...record, status: 'bad' })).toBeNull();
    const normalized = normalizeAiAuditRecord({
      ...record,
      entityKind: 'bad',
      providerSource: 'surprise',
      totalTokens: 0,
      lineIds: Array.from({ length: 40 }, (_, i) => `line-${i}`),
      createdAt: 'not-a-date',
    });

    expect(normalized).toEqual(expect.objectContaining({
      entityKind: 'system',
      providerSource: 'provider',
      totalTokens: 125,
      createdAt: '1970-01-01T00:00:00.000Z',
    }));
    expect(normalized?.lineIds).toHaveLength(24);
  });
});
