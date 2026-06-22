import type { Pool } from 'pg';
import type {
  AiAuditEntityKind,
  AiAuditProviderSource,
  AiAuditRecord,
  AiAuditStatus,
} from './ai_audit';
import { REALM } from './realm';

const REALM_SQL_DEFAULT = REALM.replace(/'/g, "''");

export const AI_AUDIT_SCHEMA = `
CREATE TABLE IF NOT EXISTS ai_audit_records (
  id BIGSERIAL PRIMARY KEY,
  realm TEXT NOT NULL DEFAULT '${REALM_SQL_DEFAULT}',
  audit_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  entity_id INT,
  template_id TEXT NOT NULL DEFAULT '',
  player_entity_id INT,
  scene_id TEXT NOT NULL DEFAULT '',
  zone_id TEXT NOT NULL DEFAULT '',
  provider_source TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  latency_ms REAL NOT NULL DEFAULT 0,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  token_estimate BOOLEAN NOT NULL DEFAULT TRUE,
  output_mode TEXT NOT NULL DEFAULT '',
  allowed_intent_count INT NOT NULL DEFAULT 0,
  allowed_line_id_count INT NOT NULL DEFAULT 0,
  memory_signal_count INT NOT NULL DEFAULT 0,
  director_proposal_count INT NOT NULL DEFAULT 0,
  scene_object_count INT NOT NULL DEFAULT 0,
  companion_count INT NOT NULL DEFAULT 0,
  line_ids TEXT[] NOT NULL DEFAULT '{}',
  intents TEXT[] NOT NULL DEFAULT '{}',
  memory_write_refs TEXT[] NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE ai_audit_records ADD COLUMN IF NOT EXISTS realm TEXT NOT NULL DEFAULT '${REALM_SQL_DEFAULT}';
ALTER TABLE ai_audit_records ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS ai_audit_records_audit_id
  ON ai_audit_records (realm, audit_id);
CREATE INDEX IF NOT EXISTS ai_audit_records_created
  ON ai_audit_records (realm, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_audit_records_status_created
  ON ai_audit_records (realm, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_audit_records_trigger_created
  ON ai_audit_records (realm, trigger, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_audit_records_player_created
  ON ai_audit_records (realm, player_entity_id, created_at DESC);
`;

interface QueryablePool {
  query(sql: string, values?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
}

export class PgAiAuditDb {
  constructor(private readonly db: QueryablePool | Pool) {}

  async saveRecord(record: AiAuditRecord): Promise<void> {
    const normalized = normalizeAiAuditRecord(record);
    if (!normalized) return;
    await this.db.query(
      `INSERT INTO ai_audit_records (
         realm, audit_id, job_id, trigger, entity_kind, entity_id, template_id,
         player_entity_id, scene_id, zone_id, provider_source, status, latency_ms,
         input_tokens, output_tokens, total_tokens, token_estimate, output_mode,
         allowed_intent_count, allowed_line_id_count, memory_signal_count,
         director_proposal_count, scene_object_count, companion_count,
         line_ids, intents, memory_write_refs, reason, error, payload, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18,
         $19, $20, $21,
         $22, $23, $24,
         $25, $26, $27, $28, $29, $30, $31
       )
       ON CONFLICT (realm, audit_id) DO UPDATE SET
         job_id = EXCLUDED.job_id,
         trigger = EXCLUDED.trigger,
         entity_kind = EXCLUDED.entity_kind,
         entity_id = EXCLUDED.entity_id,
         template_id = EXCLUDED.template_id,
         player_entity_id = EXCLUDED.player_entity_id,
         scene_id = EXCLUDED.scene_id,
         zone_id = EXCLUDED.zone_id,
         provider_source = EXCLUDED.provider_source,
         status = EXCLUDED.status,
         latency_ms = EXCLUDED.latency_ms,
         input_tokens = EXCLUDED.input_tokens,
         output_tokens = EXCLUDED.output_tokens,
         total_tokens = EXCLUDED.total_tokens,
         token_estimate = EXCLUDED.token_estimate,
         output_mode = EXCLUDED.output_mode,
         allowed_intent_count = EXCLUDED.allowed_intent_count,
         allowed_line_id_count = EXCLUDED.allowed_line_id_count,
         memory_signal_count = EXCLUDED.memory_signal_count,
         director_proposal_count = EXCLUDED.director_proposal_count,
         scene_object_count = EXCLUDED.scene_object_count,
         companion_count = EXCLUDED.companion_count,
         line_ids = EXCLUDED.line_ids,
         intents = EXCLUDED.intents,
         memory_write_refs = EXCLUDED.memory_write_refs,
         reason = EXCLUDED.reason,
         error = EXCLUDED.error,
         payload = EXCLUDED.payload,
         created_at = EXCLUDED.created_at`,
      [
        REALM,
        normalized.auditId,
        normalized.jobId,
        normalized.trigger,
        normalized.entityKind,
        normalized.entityId,
        normalized.templateId,
        normalized.playerEntityId,
        normalized.sceneId,
        normalized.zoneId,
        normalized.providerSource,
        normalized.status,
        normalized.latencyMs,
        normalized.inputTokens,
        normalized.outputTokens,
        normalized.totalTokens,
        normalized.tokenEstimate,
        normalized.outputMode,
        normalized.allowedIntentCount,
        normalized.allowedLineIdCount,
        normalized.memorySignalCount,
        normalized.directorProposalCount,
        normalized.sceneObjectCount,
        normalized.companionCount,
        [...normalized.lineIds],
        [...normalized.intents],
        [...normalized.memoryWriteRefs],
        normalized.reason,
        normalized.error,
        JSON.stringify(normalized),
        normalized.createdAt,
      ],
    );
  }

  async recentRecords(limit = 20): Promise<AiAuditRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const res = await this.db.query(
      `SELECT payload
         FROM ai_audit_records
        WHERE realm = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2`,
      [REALM, safeLimit],
    );
    return res.rows
      .map((row) => normalizeAiAuditRecord(row.payload))
      .filter((record): record is AiAuditRecord => record !== null);
  }
}

export function normalizeAiAuditRecord(value: unknown): AiAuditRecord | null {
  if (!value || typeof value !== 'object') return null;
  const src = value as Record<string, unknown>;
  const auditId = textValue(src.auditId, 160);
  const jobId = textValue(src.jobId, 160);
  const trigger = textValue(src.trigger, 96);
  const entityKind = normalizeEntityKind(textValue(src.entityKind, 32));
  const providerSource = normalizeProviderSource(textValue(src.providerSource, 32));
  const status = normalizeStatus(textValue(src.status, 32));
  if (!auditId || !jobId || !trigger || !status) return null;
  const inputTokens = intValue(src.inputTokens);
  const outputTokens = intValue(src.outputTokens);
  const totalTokens = intValue(src.totalTokens);
  return {
    auditId,
    realm: textValue(src.realm, 96) || REALM,
    jobId,
    trigger,
    entityKind,
    entityId: nullableIntValue(src.entityId),
    templateId: textValue(src.templateId, 160),
    playerEntityId: nullableIntValue(src.playerEntityId),
    sceneId: textValue(src.sceneId, 160),
    zoneId: textValue(src.zoneId, 160),
    providerSource,
    status,
    latencyMs: numberValue(src.latencyMs),
    inputTokens,
    outputTokens,
    totalTokens: totalTokens > 0 ? totalTokens : inputTokens + outputTokens,
    tokenEstimate: typeof src.tokenEstimate === 'boolean' ? src.tokenEstimate : true,
    outputMode: textValue(src.outputMode, 80),
    allowedIntentCount: intValue(src.allowedIntentCount),
    allowedLineIdCount: intValue(src.allowedLineIdCount),
    memorySignalCount: intValue(src.memorySignalCount),
    directorProposalCount: intValue(src.directorProposalCount),
    sceneObjectCount: intValue(src.sceneObjectCount),
    companionCount: intValue(src.companionCount),
    lineIds: textArray(src.lineIds, 24, 180),
    intents: textArray(src.intents, 24, 80),
    memoryWriteRefs: textArray(src.memoryWriteRefs, 24, 180),
    reason: textValue(src.reason, 600),
    error: textValue(src.error, 600),
    createdAt: dateText(src.createdAt),
  };
}

function textValue(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, maxLength);
}

function textArray(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .slice(0, limit)
    .map((item) => item.slice(0, maxLength));
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function intValue(value: unknown): number {
  return Math.floor(numberValue(value));
}

function nullableIntValue(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.floor(value);
}

function dateText(value: unknown): string {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return new Date(0).toISOString();
}

function normalizeStatus(value: string): AiAuditStatus | null {
  switch (value) {
    case 'accepted':
    case 'rejected':
    case 'provider_error':
    case 'local_reaction':
      return value;
    default:
      return null;
  }
}

function normalizeProviderSource(value: string): AiAuditProviderSource {
  switch (value) {
    case 'codex':
    case 'fake':
    case 'fallback':
    case 'local':
    case 'provider':
      return value;
    default:
      return 'provider';
  }
}

function normalizeEntityKind(value: string): AiAuditEntityKind {
  switch (value) {
    case 'npc':
    case 'mob':
    case 'object':
    case 'system':
      return value;
    default:
      return 'system';
  }
}
