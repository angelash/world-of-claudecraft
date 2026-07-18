import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import type { PlayerClass } from '../src/sim/types';
import type {
  AmbientBotLifecycleStatus,
  AmbientBotProvisionState,
  AmbientPlayerBotRecord,
} from './ambient_bots/types';
import { REALM } from './realm';

const REALM_SQL_DEFAULT = REALM.replace(/'/g, "''");
const MAX_CREDENTIAL_BACKFILLS_PER_LIST = 50;

export const AMBIENT_PLAYER_BOT_SCHEMA = `
CREATE TABLE IF NOT EXISTS ambient_player_bots (
  realm TEXT NOT NULL DEFAULT '${REALM_SQL_DEFAULT}',
  bot_id TEXT NOT NULL,
  account_id INT REFERENCES accounts(id) ON DELETE SET NULL,
  account_username TEXT NOT NULL DEFAULT '',
  account_password TEXT NOT NULL DEFAULT '',
  credential_key_id TEXT NOT NULL DEFAULT '',
  credential_ciphertext TEXT NOT NULL DEFAULT '',
  credential_iv TEXT NOT NULL DEFAULT '',
  credential_auth_tag TEXT NOT NULL DEFAULT '',
  credential_version INT NOT NULL DEFAULT 1,
  character_id INT REFERENCES characters(id) ON DELETE SET NULL,
  character_name TEXT NOT NULL DEFAULT '',
  profile_id TEXT NOT NULL,
  class TEXT NOT NULL,
  auth_token TEXT NOT NULL DEFAULT '',
  auth_token_expires_at TIMESTAMPTZ,
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
  last_runner_error TEXT NOT NULL DEFAULT '',
  last_runner_at TIMESTAMPTZ,
  planner_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  runner_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  social_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (realm, bot_id)
);
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS realm TEXT NOT NULL DEFAULT '${REALM_SQL_DEFAULT}';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS account_id INT REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS account_username TEXT NOT NULL DEFAULT '';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS account_password TEXT NOT NULL DEFAULT '';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS credential_key_id TEXT NOT NULL DEFAULT '';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS credential_ciphertext TEXT NOT NULL DEFAULT '';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS credential_iv TEXT NOT NULL DEFAULT '';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS credential_auth_tag TEXT NOT NULL DEFAULT '';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS credential_version INT NOT NULL DEFAULT 1;
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS character_id INT REFERENCES characters(id) ON DELETE SET NULL;
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS character_name TEXT NOT NULL DEFAULT '';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS profile_id TEXT NOT NULL DEFAULT '';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS class TEXT NOT NULL DEFAULT 'warrior';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS auth_token TEXT NOT NULL DEFAULT '';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS auth_token_expires_at TIMESTAMPTZ;
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
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS last_runner_error TEXT NOT NULL DEFAULT '';
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS last_runner_at TIMESTAMPTZ;
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS planner_state JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ambient_player_bots ADD COLUMN IF NOT EXISTS runner_state JSONB NOT NULL DEFAULT '{}'::jsonb;
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
  query(
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
}

export interface PgAmbientPlayerBotDbOptions {
  env?: NodeJS.ProcessEnv;
}

interface AmbientCredentialKeyring {
  primaryKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
}

interface AmbientCredentialEnvelope {
  keyId: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  version: 1;
}

interface AmbientCredentials {
  accountPassword: string;
  authToken: string;
}

export class PgAmbientPlayerBotDb {
  private readonly credentialKeyring: AmbientCredentialKeyring | null;

  constructor(
    private readonly db: QueryablePool | Pool,
    options: PgAmbientPlayerBotDbOptions = {},
  ) {
    const env = options.env ?? process.env;
    this.credentialKeyring = ambientCredentialKeyringFromEnv(env);
    if (env.AMBIENT_PLAYER_BOTS_EXPERIMENT === '1' && this.credentialKeyring === null) {
      throw new Error(
        'AMBIENT_PLAYER_BOT_CREDENTIAL_KEY is required when AMBIENT_PLAYER_BOTS_EXPERIMENT=1',
      );
    }
  }

  async listBots(): Promise<AmbientPlayerBotRecord[]> {
    const res = await this.db.query(
      `SELECT bot_id, account_id, account_username, account_password,
              credential_key_id, credential_ciphertext, credential_iv, credential_auth_tag,
              credential_version, character_id, character_name,
              profile_id, class, auth_token, auth_token_expires_at, lifecycle_status, provision_state,
              level_band_min, level_band_max, preferred_zone_ids, last_known_zone_id,
              last_known_level, last_known_x, last_known_z, assigned_cluster_id,
              assigned_player_character_id, cooldown_until, reservation_until,
              last_runner_error, last_runner_at, planner_state, runner_state, social_state
         FROM ambient_player_bots
        WHERE realm = $1
        ORDER BY updated_at DESC, bot_id ASC`,
      [REALM],
    );
    const records: AmbientPlayerBotRecord[] = [];
    let backfillsRemaining = MAX_CREDENTIAL_BACKFILLS_PER_LIST;
    for (const row of res.rows) {
      const record = await this.recordFromRow(row, () => {
        if (backfillsRemaining <= 0) return false;
        backfillsRemaining--;
        return true;
      });
      if (record) records.push(record);
    }
    return records;
  }

  async saveBot(record: AmbientPlayerBotRecord): Promise<void> {
    const envelope = this.credentialKeyring
      ? encryptAmbientCredentials(this.credentialKeyring, record.botId, {
          accountPassword: record.accountPassword,
          authToken: record.authToken,
        })
      : null;
    await this.db.query(
      `INSERT INTO ambient_player_bots (
         realm, bot_id, account_id, account_username, account_password, character_id, character_name,
         profile_id, class, auth_token, auth_token_expires_at, lifecycle_status, provision_state,
         level_band_min, level_band_max, preferred_zone_ids, last_known_zone_id,
         last_known_level, last_known_x, last_known_z, assigned_cluster_id, assigned_player_character_id,
         cooldown_until, reservation_until, last_runner_error, last_runner_at,
         planner_state, runner_state, social_state,
         credential_key_id, credential_ciphertext, credential_iv, credential_auth_tag,
         credential_version, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17,
         $18, $19, $20, $21, $22,
         $23, $24, $25, $26,
         $27, $28, $29,
         $30, $31, $32, $33,
         $34, now()
       )
       ON CONFLICT (realm, bot_id) DO UPDATE SET
         account_id = EXCLUDED.account_id,
         account_username = EXCLUDED.account_username,
         account_password = EXCLUDED.account_password,
         character_id = EXCLUDED.character_id,
         character_name = EXCLUDED.character_name,
         profile_id = EXCLUDED.profile_id,
         class = EXCLUDED.class,
         auth_token = EXCLUDED.auth_token,
         auth_token_expires_at = EXCLUDED.auth_token_expires_at,
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
         last_runner_error = EXCLUDED.last_runner_error,
         last_runner_at = EXCLUDED.last_runner_at,
         planner_state = EXCLUDED.planner_state,
         runner_state = EXCLUDED.runner_state,
         social_state = EXCLUDED.social_state,
         credential_key_id = EXCLUDED.credential_key_id,
         credential_ciphertext = EXCLUDED.credential_ciphertext,
         credential_iv = EXCLUDED.credential_iv,
         credential_auth_tag = EXCLUDED.credential_auth_tag,
         credential_version = EXCLUDED.credential_version,
         updated_at = now()`,
      [
        REALM,
        record.botId,
        record.accountId,
        record.accountUsername,
        envelope ? '' : record.accountPassword,
        record.characterId,
        record.characterName,
        record.profileId,
        record.class,
        envelope ? '' : record.authToken,
        msToIso(record.authTokenExpiresAtMs),
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
        record.lastRunnerError,
        msToIso(record.lastRunnerAtMs),
        JSON.stringify(record.plannerState),
        JSON.stringify(record.runnerState),
        JSON.stringify(record.socialState),
        envelope?.keyId ?? '',
        envelope?.ciphertext ?? '',
        envelope?.iv ?? '',
        envelope?.authTag ?? '',
        envelope?.version ?? 1,
      ],
    );
  }

  async botByCharacterId(characterId: number): Promise<AmbientPlayerBotRecord | null> {
    const res = await this.db.query(
      `SELECT bot_id, account_id, account_username, account_password,
              credential_key_id, credential_ciphertext, credential_iv, credential_auth_tag,
              credential_version, character_id, character_name,
              profile_id, class, auth_token, auth_token_expires_at, lifecycle_status, provision_state,
              level_band_min, level_band_max, preferred_zone_ids, last_known_zone_id,
              last_known_level, last_known_x, last_known_z, assigned_cluster_id,
              assigned_player_character_id, cooldown_until, reservation_until,
              last_runner_error, last_runner_at, planner_state, runner_state, social_state
         FROM ambient_player_bots
        WHERE realm = $1 AND character_id = $2
        LIMIT 1`,
      [REALM, characterId],
    );
    return this.recordFromRow(res.rows[0] ?? null);
  }

  private async recordFromRow(
    row: Record<string, unknown> | null,
    claimBackfill: () => boolean = () => true,
    casMissRetriesRemaining = 1,
  ): Promise<AmbientPlayerBotRecord | null> {
    if (!row) return null;
    const botId = textValue(row.bot_id ?? row.botId, 160);
    if (!botId) return null;

    const envelope = credentialEnvelopeFromRow(row);
    const legacyCredentials: AmbientCredentials = {
      accountPassword: textValue(row.account_password ?? row.accountPassword, 120),
      authToken: textValue(row.auth_token ?? row.authToken, 160),
    };
    const hasLegacyCredentials =
      legacyCredentials.accountPassword.length > 0 || legacyCredentials.authToken.length > 0;
    let credentials: AmbientCredentials;
    let shouldBackfill = false;
    if (envelope) {
      if (!this.credentialKeyring) {
        throw new Error(
          `ambient bot ${botId} has encrypted credentials but no keyring is configured`,
        );
      }
      // During a mixed-version rollout an older process can write a newer
      // plaintext password/token while leaving the envelope columns untouched.
      // Non-empty legacy fields therefore represent the newest generation and
      // must win; immediately seal them into the current primary envelope.
      if (hasLegacyCredentials) {
        credentials = legacyCredentials;
        shouldBackfill = true;
      } else {
        credentials = decryptAmbientCredentials(this.credentialKeyring, botId, envelope);
        shouldBackfill = envelope.keyId !== this.credentialKeyring.primaryKeyId;
      }
    } else {
      credentials = legacyCredentials;
      shouldBackfill = this.credentialKeyring !== null && hasLegacyCredentials;
    }

    if (shouldBackfill && this.credentialKeyring && claimBackfill()) {
      const updated = await this.persistCredentialEnvelope(botId, credentials, row);
      if (!updated) {
        if (casMissRetriesRemaining <= 0) {
          throw new Error(`ambient bot ${botId} credentials changed concurrently during migration`);
        }
        const latest = await this.rowByBotId(botId);
        return this.recordFromRow(latest, () => true, casMissRetriesRemaining - 1);
      }
    }
    return normalizeAmbientPlayerBotRecord({
      ...row,
      account_password: credentials.accountPassword,
      auth_token: credentials.authToken,
    });
  }

  private async persistCredentialEnvelope(
    botId: string,
    credentials: AmbientCredentials,
    observedRow: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.credentialKeyring) return false;
    const envelope = encryptAmbientCredentials(this.credentialKeyring, botId, credentials);
    const observed = credentialPersistenceState(observedRow);
    const result = await this.db.query(
      `UPDATE ambient_player_bots
          SET credential_key_id = $3,
              credential_ciphertext = $4,
              credential_iv = $5,
              credential_auth_tag = $6,
              credential_version = 1,
              account_password = '',
              auth_token = '',
              updated_at = now()
        WHERE realm = $1 AND bot_id = $2
          AND account_password IS NOT DISTINCT FROM $7
          AND auth_token IS NOT DISTINCT FROM $8
          AND credential_key_id IS NOT DISTINCT FROM $9
          AND credential_ciphertext IS NOT DISTINCT FROM $10
          AND credential_iv IS NOT DISTINCT FROM $11
          AND credential_auth_tag IS NOT DISTINCT FROM $12
          AND credential_version IS NOT DISTINCT FROM $13`,
      [
        REALM,
        botId,
        envelope.keyId,
        envelope.ciphertext,
        envelope.iv,
        envelope.authTag,
        observed.accountPassword,
        observed.authToken,
        observed.keyId,
        observed.ciphertext,
        observed.iv,
        observed.authTag,
        observed.version,
      ],
    );
    return result.rowCount === 1;
  }

  private async rowByBotId(botId: string): Promise<Record<string, unknown> | null> {
    const res = await this.db.query(
      `SELECT *
         FROM ambient_player_bots
        WHERE realm = $1 AND bot_id = $2
        LIMIT 1`,
      [REALM, botId],
    );
    return res.rows[0] ?? null;
  }
}

interface AmbientCredentialPersistenceState {
  accountPassword: string;
  authToken: string;
  keyId: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  version: number;
}

function credentialPersistenceState(
  row: Record<string, unknown>,
): AmbientCredentialPersistenceState {
  const versionValue = row.credential_version ?? row.credentialVersion;
  return {
    accountPassword: textValue(row.account_password ?? row.accountPassword, 120),
    authToken: textValue(row.auth_token ?? row.authToken, 160),
    keyId: textValue(row.credential_key_id ?? row.credentialKeyId, 64),
    ciphertext: textValue(row.credential_ciphertext ?? row.credentialCiphertext, 2_048),
    iv: textValue(row.credential_iv ?? row.credentialIv, 64),
    authTag: textValue(row.credential_auth_tag ?? row.credentialAuthTag, 64),
    version: versionValue === undefined || versionValue === null ? 1 : intValue(versionValue, 0),
  };
}

function ambientCredentialKeyringFromEnv(env: NodeJS.ProcessEnv): AmbientCredentialKeyring | null {
  const primaryMaterial = env.AMBIENT_PLAYER_BOT_CREDENTIAL_KEY?.trim();
  if (!primaryMaterial) return null;
  const primaryKeyId = validateCredentialKeyId(
    env.AMBIENT_PLAYER_BOT_CREDENTIAL_KEY_ID?.trim() || 'primary',
  );
  const keys = new Map<string, Buffer>();
  const previousRaw = env.AMBIENT_PLAYER_BOT_CREDENTIAL_PREVIOUS_KEYS?.trim();
  if (previousRaw) {
    let previous: unknown;
    try {
      previous = JSON.parse(previousRaw);
    } catch {
      throw new Error('AMBIENT_PLAYER_BOT_CREDENTIAL_PREVIOUS_KEYS must be a JSON object');
    }
    if (!previous || typeof previous !== 'object' || Array.isArray(previous)) {
      throw new Error('AMBIENT_PLAYER_BOT_CREDENTIAL_PREVIOUS_KEYS must be a JSON object');
    }
    for (const [keyId, material] of Object.entries(previous)) {
      if (typeof material !== 'string') {
        throw new Error(`ambient bot credential key ${keyId} must be a string`);
      }
      keys.set(validateCredentialKeyId(keyId), decodeCredentialKey(material, keyId));
    }
  }
  keys.set(primaryKeyId, decodeCredentialKey(primaryMaterial, primaryKeyId));
  return { primaryKeyId, keys };
}

function validateCredentialKeyId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) {
    throw new Error('ambient bot credential key id must use 1 to 64 safe characters');
  }
  return value;
}

function decodeCredentialKey(material: string, keyId: string): Buffer {
  const trimmed = material.trim();
  const key = /^[a-f0-9]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, 'hex')
    : Buffer.from(trimmed, 'base64');
  if (key.length !== 32) {
    throw new Error(`ambient bot credential key ${keyId} must decode to exactly 32 bytes`);
  }
  return key;
}

function credentialEnvelopeFromRow(row: Record<string, unknown>): AmbientCredentialEnvelope | null {
  const keyId = textValue(row.credential_key_id ?? row.credentialKeyId, 64);
  const ciphertext = textValue(row.credential_ciphertext ?? row.credentialCiphertext, 2_048);
  const iv = textValue(row.credential_iv ?? row.credentialIv, 64);
  const authTag = textValue(row.credential_auth_tag ?? row.credentialAuthTag, 64);
  const present = keyId.length > 0 || ciphertext.length > 0 || iv.length > 0 || authTag.length > 0;
  if (!present) return null;
  if (!keyId || !ciphertext || !iv || !authTag) {
    throw new Error('ambient bot credential envelope is incomplete');
  }
  const versionValue = row.credential_version ?? row.credentialVersion;
  const version =
    versionValue === undefined || versionValue === null ? 1 : intValue(versionValue, 0);
  if (version !== 1) {
    throw new Error(`ambient bot credential envelope version ${version} is unsupported`);
  }
  return { keyId, ciphertext, iv, authTag, version: 1 };
}

function encryptAmbientCredentials(
  keyring: AmbientCredentialKeyring,
  botId: string,
  credentials: AmbientCredentials,
): AmbientCredentialEnvelope {
  const key = keyring.keys.get(keyring.primaryKeyId);
  if (!key) throw new Error('ambient bot primary credential key is unavailable');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(credentialAad(botId));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final(),
  ]);
  return {
    keyId: keyring.primaryKeyId,
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    version: 1,
  };
}

function decryptAmbientCredentials(
  keyring: AmbientCredentialKeyring,
  botId: string,
  envelope: AmbientCredentialEnvelope,
): AmbientCredentials {
  const key = keyring.keys.get(envelope.keyId);
  if (!key) {
    throw new Error(`ambient bot credential key id ${envelope.keyId} is unavailable`);
  }
  try {
    const iv = Buffer.from(envelope.iv, 'base64');
    const authTag = Buffer.from(envelope.authTag, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length > 1_024) {
      throw new Error('invalid envelope bounds');
    }
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(credentialAad(botId));
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      'utf8',
    );
    const parsed = JSON.parse(plaintext) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid credential payload');
    }
    const payload = parsed as Record<string, unknown>;
    if (typeof payload.accountPassword !== 'string' || typeof payload.authToken !== 'string') {
      throw new Error('invalid credential payload');
    }
    if (payload.accountPassword.length > 120 || payload.authToken.length > 160) {
      throw new Error('credential payload exceeds bounds');
    }
    return {
      accountPassword: payload.accountPassword,
      authToken: payload.authToken,
    };
  } catch {
    throw new Error(`ambient bot ${botId} credential envelope authentication failed`);
  }
}

function credentialAad(botId: string): Buffer {
  return Buffer.from(`ambient-player-bot:${REALM}:${botId}:v1`, 'utf8');
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
    accountUsername: textValue(row.account_username ?? row.accountUsername, 120),
    accountPassword: textValue(row.account_password ?? row.accountPassword, 120),
    characterId: nullableInt(row.character_id ?? row.characterId),
    characterName: textValue(row.character_name ?? row.characterName, 32),
    profileId,
    class: cls,
    authToken: textValue(row.auth_token ?? row.authToken, 160),
    authTokenExpiresAtMs: nullableDateMs(row.auth_token_expires_at ?? row.authTokenExpiresAtMs),
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
    lastRunnerError: textValue(row.last_runner_error ?? row.lastRunnerError, 400),
    lastRunnerAtMs: nullableDateMs(row.last_runner_at ?? row.lastRunnerAtMs),
    plannerState: objectValue(row.planner_state ?? row.plannerState),
    runnerState: objectValue(row.runner_state ?? row.runnerState),
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
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function msToIso(value: number | null): string | null {
  return value === null || !Number.isFinite(value) ? null : new Date(value).toISOString();
}
