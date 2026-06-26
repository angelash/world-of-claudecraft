import type { Pool } from 'pg';
import type { AmbientBotLifecycleStatus, AmbientBotProvisionState, AmbientPlayerBotRecord } from './ambient_bots/types';
import type { PlayerClass } from '../src/sim/types';
import { REALM } from './realm';

const REALM_SQL_DEFAULT = REALM.replace(/'/g, "''");

export const AMBIENT_PLAYER_BOT_SCHEMA = `
CREATE TABLE IF NOT EXISTS ambient_player_bots (
  realm TEXT NOT NULL DEFAULT '${REALM_SQL_DEFAULT}',
  bot_id TEXT NOT NULL,
  account_id INT REFERENCES accounts(id) ON DELETE SET NULL,
  character_id INT REFERENCES characters(id) ON DELETE SET NULL,
  profile_id TEXT NOT NULL,
  class TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'ready',
  provision_state TEXT NOT NULL DEFAULT 'needsAccount',
  level_band_min INT NOT NULL DEFAULT 1,
  level_band_max INT NOT NULL DEFAULT 7,
  preferred_zone_ids TEXT[] NOT NULL DEFAULT '{}',
  last_known_zone_id TEXT NOT NULL DEFAULT '',
  last_known_level INT NOT NULL DEFAULT 1,
  last_known_x REAL,
  last_known_z REAL,
  assigned_cluster_id TEXT,
  assigned_player_character_id INT,
  cooldown_until TIMESTAMPTZ,
  reservation_until TIMESTAMPTZ,
  planner_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  social_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (realm, bot_id)
);
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS realm TEXT NOT NULL DEFAULT '${REALM_SQL_DEFAULT}';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS account_id INT REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS character_id INT REFERENCES characters(id) ON DELETE SET NULL;
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS profile_id TEXT NOT NULL DEFAULT '';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS class TEXT NOT NULL DEFAULT 'warrior';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS provision_state TEXT NOT NULL DEFAULT 'needsAccount';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS level_band_min INT NOT NULL DEFAULT 1;
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS level_band_max INT NOT NULL DEFAULT 7;
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS preferred_zone_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS last_known_zone_id TEXT NOT NULL DEFAULT '';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS last_known_level INT NOT NULL DEFAULT 1;
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS last_known_x REAL;
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS last_known_z REAL;
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS assigned_cluster_id TEXT;
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS assigned_player_character_id INT;
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS reservation_until TIMESTAMPTZ;
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS planner_state JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS social_state JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS ambient_player_bots_lifecycle
  ON ambient_player_bots (realm, lifecycle_status, provision_state, updated_at DESC);
CREATE INDEX IF NOT EXISTS ambient_player_bots_zone_level
  ON ambient_player_bots (realm, last_known_zone_id, last_known_level, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ambient_player_bots_account
  ON ambient_player_bots (realm, account_id) WHERE account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ambient_player_bots_character
  ON ambient_player_bots (realm, character_id) WHERE character_id IS NOT NULL;
`;

interface QueryablePool {
  query(sql: string, values?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export class PgAmbientPlayerBotDb {
  constructor(private readonly db: QueryablePool | Pool) {}

  async listBots(): Promise<AmbientPlayerBotRecord[]> {
    const res = await this.db.query(
      `SELECT bot_id, account_id, character_id, profile_id, class, lifecycle_status, provision_state,
              level_band_min, level_band_max, preferred_zone_ids, last_known_zone_id,
              last_known_level, last_known_x, last_known_z, assigned_cluster_id,
              assigned_player_character_id, cooldown_until, reservation_until,
              planner_state, social_state
         FROM ambient_player_bots
        WHERE realm = $1
        ORDER BY updated_at DESC, bot_id ASC`,
      [REALM],
    );
    return res.rows
      .map((row) => normalizeAmbientPlayerBotRecord(row))
      .filter((row): row is AmbientPlayerBotRecord => row !== null);
  }

  async saveBot(record: AmbientPlayerBotRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO ambient_player_bots (
         realm, bot_id, account_id, character_id, profile_id, class,
         lifecycle_status, provision_state, level_band_min, level_band_max,
         preferred_zone_ids, last_known_zone_id, last_known_level, last_known_x,
         last_known_z, assigned_cluster_id, assigned_player_character_id,
         cooldown_until, reservation_until, planner_state, social_state, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13, $14,
         $15, $16, $17,
         $18, $19, $20, $21, now()
       )
       ON CONFLICT (realm, bot_id) DO UPDATE SET
         account_id = EXCLUDED.account_id,
         character_id = EXCLUDED.character_id,
         profile_id = EXCLUDED.profile_id,
         class = EXCLUDED.class,
         lifecycle_status = EXCLUDED.lifecycle_status,
         provision_state = EXCLUDED.provision_state,
         level_band_min = EXCLUDED.level_band_min,
         level_band_max = EXCLUDED.level_band_max,
         preferred_zone_ids = EXCLUDED.preferred_zone_ids,
         last_known_zone_id = EXCLUDED.last_known_zone_id,
         last_known_level = EXCLUDED.last_known_level,
         last_known_x = EXCLUDED.last_known_x,
         last_known_z = EXCLUDED.last_known_z,
         assigned_cluster_id = EXCLUDED.assigned_cluster_id,
         assigned_player_character_id = EXCLUDED.assigned_player_character_id,
         cooldown_until = EXCLUDED.cooldown_until,
         reservation_until = EXCLUDED.reservation_until,
         planner_state = EXCLUDED.planner_state,
         social_state = EXCLUDED.social_state,
         updated_at = now()`,
      [
        REALM,
        record.botId,
        record.accountId,
        record.characterId,
        record.profileId,
        record.class,
        record.lifecycleStatus,
        record.provisionState,
        record.levelBand.min,
        record.levelBand.max,
        [...record.preferredZoneIds],
        record.lastKnownZoneId,
        record.lastKnownLevel,
        record.lastKnownX,
        record.lastKnownZ,
        record.assignedClusterId,
        record.assignedPlayerCharacterId,
        msToIso(record.cooldownUntilMs),
        msToIso(record.reservationUntilMs),
        JSON.stringify(record.plannerState),
        JSON.stringify(record.socialState),
      ],
    );
  }
}

export function normalizeAmbientPlayerBotRecord(value: unknown): AmbientPlayerBotRecord | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const botId = textValue(row.bot_id ?? row.botId, 160);
  const profileId = textValue(row.profile_id ?? row.profileId, 160);
  const cls = playerClassValue(row.class);
  const lifecycleStatus = lifecycleValue(row.lifecycle_status ?? row.lifecycleStatus);
  const provisionState = provisionValue(row.provision_state ?? row.provisionState);
  if (!botId || !profileId || !cls) return null;
  return {
    botId,
    accountId: nullableInt(row.account_id ?? row.accountId),
    characterId: nullableInt(row.character_id ?? row.characterId),
    profileId,
    class: cls,
    lifecycleStatus,
    provisionState,
    levelBand: {
      min: Math.max(1, intValue(row.level_band_min ?? row.levelBandMin, 1)),
      max: Math.max(1, intValue(row.level_band_max ?? row.levelBandMax, 7)),
    },
    preferredZoneIds: textArray(row.preferred_zone_ids ?? row.preferredZoneIds, 16, 80),
    lastKnownZoneId: textValue(row.last_known_zone_id ?? row.lastKnownZoneId, 80),
    lastKnownLevel: Math.max(1, intValue(row.last_known_level ?? row.lastKnownLevel, 1)),
    lastKnownX: nullableNumber(row.last_known_x ?? row.lastKnownX),
    lastKnownZ: nullableNumber(row.last_known_z ?? row.lastKnownZ),
    assignedClusterId: textValue(row.assigned_cluster_id ?? row.assignedClusterId, 160) || null,
    assignedPlayerCharacterId: nullableInt(
      row.assigned_player_character_id ?? row.assignedPlayerCharacterId,
    ),
    cooldownUntilMs: nullableDateMs(row.cooldown_until ?? row.cooldownUntilMs),
    reservationUntilMs: nullableDateMs(row.reservation_until ?? row.reservationUntilMs),
    plannerState: objectValue(row.planner_state ?? row.plannerState),
    socialState: objectValue(row.social_state ?? row.socialState),
  };
}

function playerClassValue(value: unknown): PlayerClass | null {
  switch (value) {
    case 'warrior':
    case 'paladin':
    case 'hunter':
    case 'rogue':
    case 'priest':
    case 'shaman':
    case 'mage':
    case 'warlock':
    case 'druid':
      return value;
    default:
      return null;
  }
}

function lifecycleValue(value: unknown): AmbientBotLifecycleStatus {
  switch (value) {
    case 'reserved':
    case 'online':
    case 'cooldown':
    case 'retired':
      return value;
    default:
      return 'ready';
  }
}

function provisionValue(value: unknown): AmbientBotProvisionState {
  switch (value) {
    case 'needsCharacter':
    case 'ready':
    case 'retired':
      return value;
    default:
      return 'needsAccount';
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function textValue(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function textArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .slice(0, maxItems)
    .map((entry) => entry.slice(0, maxLen));
}

function intValue(value: unknown, fallback = 0): number {
  const raw = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(raw) ? Math.floor(raw) : fallback;
}

function nullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = Number(value);
  return Number.isFinite(raw) ? Math.floor(raw) : null;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = Number(value);
  return Number.isFinite(raw) ? raw : null;
}

function nullableDateMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function msToIso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}
