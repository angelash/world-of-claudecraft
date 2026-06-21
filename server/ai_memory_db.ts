import type { Pool } from 'pg';
import type { AiMemoryAuditRecord, AiMemoryAuditScope } from './ai/ai_types';
import { REALM } from './realm';

const REALM_SQL_DEFAULT = REALM.replace(/'/g, "''");

export const AI_MEMORY_SCHEMA = `
CREATE TABLE IF NOT EXISTS ai_memory_records (
  id BIGSERIAL PRIMARY KEY,
  realm TEXT NOT NULL DEFAULT '${REALM_SQL_DEFAULT}',
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  scene_id TEXT NOT NULL DEFAULT '',
  zone_id TEXT NOT NULL DEFAULT '',
  source_player_entity_id INT NOT NULL,
  entity_id INT,
  template_id TEXT NOT NULL DEFAULT '',
  item_id TEXT NOT NULL DEFAULT '',
  quest_id TEXT NOT NULL DEFAULT '',
  subject_kind TEXT NOT NULL DEFAULT '',
  line_ids TEXT[] NOT NULL DEFAULT '{}',
  salience REAL NOT NULL DEFAULT 0,
  sim_created_at REAL,
  sim_expires_at REAL,
  reason TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE ai_memory_records ADD COLUMN IF NOT EXISTS realm TEXT NOT NULL DEFAULT '${REALM_SQL_DEFAULT}';
ALTER TABLE ai_memory_records ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS ai_memory_records_ref
  ON ai_memory_records (realm, kind, ref_id, source_player_entity_id);
CREATE INDEX IF NOT EXISTS ai_memory_records_player_scene
  ON ai_memory_records (realm, source_player_entity_id, scene_id, kind, sim_expires_at DESC);
CREATE INDEX IF NOT EXISTS ai_memory_records_player_zone
  ON ai_memory_records (realm, source_player_entity_id, zone_id, scope, sim_expires_at DESC);
CREATE INDEX IF NOT EXISTS ai_memory_records_template
  ON ai_memory_records (realm, kind, template_id, sim_expires_at DESC);
`;

export interface AiMemoryDbQuery {
  sourcePlayerEntityId: number;
  nowSeconds: number;
  sceneId?: string | null;
  zoneId?: string | null;
  kinds?: readonly AiMemoryAuditRecord['kind'][];
  scopes?: readonly AiMemoryAuditScope[];
  limit?: number;
}

interface QueryablePool {
  query(sql: string, values?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
}

export class PgAiMemoryDb {
  constructor(private readonly db: QueryablePool | Pool) {}

  async saveRecords(records: readonly AiMemoryAuditRecord[]): Promise<void> {
    for (const record of records) {
      await this.db.query(
        `INSERT INTO ai_memory_records (
           realm, kind, ref_id, scope, scene_id, zone_id, source_player_entity_id,
           entity_id, template_id, item_id, quest_id, subject_kind, line_ids, salience,
           sim_created_at, sim_expires_at, reason, payload, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12, $13, $14,
           $15, $16, $17, $18, now()
         )
         ON CONFLICT (realm, kind, ref_id, source_player_entity_id) DO UPDATE SET
           scope = EXCLUDED.scope,
           scene_id = EXCLUDED.scene_id,
           zone_id = EXCLUDED.zone_id,
           entity_id = EXCLUDED.entity_id,
           template_id = EXCLUDED.template_id,
           item_id = EXCLUDED.item_id,
           quest_id = EXCLUDED.quest_id,
           subject_kind = EXCLUDED.subject_kind,
           line_ids = EXCLUDED.line_ids,
           salience = EXCLUDED.salience,
           sim_created_at = EXCLUDED.sim_created_at,
           sim_expires_at = EXCLUDED.sim_expires_at,
           reason = EXCLUDED.reason,
           payload = EXCLUDED.payload,
           updated_at = now()`,
        [
          REALM,
          record.kind,
          record.refId,
          record.scope,
          record.sceneId ?? '',
          record.zoneId ?? '',
          record.sourcePlayerEntityId,
          record.entityId ?? null,
          record.templateId ?? '',
          record.itemId ?? '',
          record.questId ?? '',
          record.subjectKind ?? '',
          [...record.lineIds],
          record.salience,
          record.createdAt ?? null,
          record.expiresAt ?? null,
          record.reason,
          JSON.stringify(record),
        ],
      );
    }
  }

  async loadRecords(query: AiMemoryDbQuery): Promise<AiMemoryAuditRecord[]> {
    const limit = Math.max(1, Math.min(100, Math.floor(query.limit ?? 20)));
    const res = await this.db.query(
      `SELECT payload
         FROM ai_memory_records
        WHERE realm = $1
          AND source_player_entity_id = $2
          AND (
            ($3::text = '' AND $4::text = '')
            OR ($3::text <> '' AND scene_id = $3)
            OR ($4::text <> '' AND scope = 'region' AND zone_id = $4)
          )
          AND ($5::text[] IS NULL OR kind = ANY($5::text[]))
          AND ($6::text[] IS NULL OR scope = ANY($6::text[]))
          AND (sim_expires_at IS NULL OR sim_expires_at > $7)
        ORDER BY salience DESC, COALESCE(sim_created_at, 0) DESC, updated_at DESC
        LIMIT $8`,
      [
        REALM,
        query.sourcePlayerEntityId,
        query.sceneId ?? '',
        query.zoneId ?? '',
        query.kinds && query.kinds.length > 0 ? [...query.kinds] : null,
        query.scopes && query.scopes.length > 0 ? [...query.scopes] : null,
        query.nowSeconds,
        limit,
      ],
    );
    return res.rows
      .map((row) => normalizeAiMemoryAuditRecord(row.payload))
      .filter((record): record is AiMemoryAuditRecord => record !== null);
  }

  async pruneExpired(nowSeconds: number, batchSize = 500): Promise<number> {
    const res = await this.db.query(
      `DELETE FROM ai_memory_records
        WHERE realm = $1
          AND sim_expires_at IS NOT NULL
          AND sim_expires_at <= $2
          AND id IN (
            SELECT id FROM ai_memory_records
             WHERE realm = $1
               AND sim_expires_at IS NOT NULL
               AND sim_expires_at <= $2
             ORDER BY sim_expires_at ASC
             LIMIT $3
          )`,
      [REALM, nowSeconds, Math.max(1, Math.min(5000, Math.floor(batchSize)))],
    );
    return res.rowCount ?? 0;
  }
}

export function normalizeAiMemoryAuditRecord(value: unknown): AiMemoryAuditRecord | null {
  if (!value || typeof value !== 'object') return null;
  const src = value as Record<string, unknown>;
  const kind = stringValue(src.kind);
  const refId = stringValue(src.refId);
  const scope = stringValue(src.scope);
  const sourcePlayerEntityId = numberValue(src.sourcePlayerEntityId);
  const salience = numberValue(src.salience);
  const reason = stringValue(src.reason);
  if (!isMemoryKind(kind) || !isMemoryScope(scope) || !refId || sourcePlayerEntityId === null || salience === null || !reason) return null;
  return {
    kind,
    refId,
    scope,
    ...(stringValue(src.sceneId) ? { sceneId: stringValue(src.sceneId) } : {}),
    ...(stringValue(src.zoneId) ? { zoneId: stringValue(src.zoneId) } : {}),
    sourcePlayerEntityId,
    ...(numberValue(src.entityId) !== null ? { entityId: numberValue(src.entityId)! } : {}),
    ...(stringValue(src.templateId) ? { templateId: stringValue(src.templateId) } : {}),
    ...(stringValue(src.itemId) ? { itemId: stringValue(src.itemId) } : {}),
    ...(stringValue(src.questId) ? { questId: stringValue(src.questId) } : {}),
    ...(isSubjectKind(stringValue(src.subjectKind)) ? { subjectKind: stringValue(src.subjectKind) as AiMemoryAuditRecord['subjectKind'] } : {}),
    lineIds: stringArray(src.lineIds),
    salience: Math.max(0, Math.min(1, salience)),
    ...(numberValue(src.createdAt) !== null ? { createdAt: numberValue(src.createdAt)! } : {}),
    ...(numberValue(src.expiresAt) !== null ? { expiresAt: numberValue(src.expiresAt)! } : {}),
    reason,
  };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function isMemoryKind(value: string): value is AiMemoryAuditRecord['kind'] {
  return value === 'npcInteraction'
    || value === 'rumor'
    || value === 'worldTrace'
    || value === 'creatureMemory'
    || value === 'bossMemory'
    || value === 'worldDirectorState';
}

function isMemoryScope(value: string): value is AiMemoryAuditScope {
  return value === 'entity' || value === 'scene' || value === 'region' || value === 'encounter';
}

function isSubjectKind(value: string): value is NonNullable<AiMemoryAuditRecord['subjectKind']> {
  return value === 'item' || value === 'quest' || value === 'encounter';
}
