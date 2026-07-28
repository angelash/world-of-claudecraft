import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AmbientPlayerBotRecord } from '../server/ambient_bots/types';
import {
  AMBIENT_PLAYER_BOT_SCHEMA,
  normalizeAmbientPlayerBotRecord,
  PgAmbientPlayerBotDb,
} from '../server/ambient_player_bot_db';

function bot(): AmbientPlayerBotRecord {
  const authTokenExpiresAtMs = Date.parse('2026-01-02T03:04:05.000Z');
  const lastRunnerAtMs = Date.parse('2026-01-02T06:07:08.000Z');
  return {
    botId: 'bot-1',
    accountId: 11,
    accountUsername: 'bot_user',
    accountPassword: 'BotPassword123',
    characterId: 101,
    characterName: 'Branoraaa',
    profileId: 'eastbrook_vale_warrior_newcomer',
    class: 'warrior',
    authToken: 'token-1',
    authTokenExpiresAtMs,
    lifecycleStatus: 'ready',
    provisionState: 'ready',
    levelBand: { min: 1, max: 7 },
    preferredZoneIds: ['eastbrook_vale'],
    lastKnownZoneId: 'eastbrook_vale',
    lastKnownLevel: 3,
    lastKnownX: 4,
    lastKnownZ: 5,
    assignedClusterId: null,
    assignedPlayerCharacterId: null,
    cooldownUntilMs: null,
    reservationUntilMs: null,
    lastRunnerError: '',
    lastRunnerAtMs,
    plannerState: { step: 'wolves' },
    runnerState: { pid: 42 },
    socialState: { mood: 'quiet' },
  };
}

describe('ambient player bot registry schema', () => {
  it('defines the table and is wired into ensureSchema()', () => {
    expect(AMBIENT_PLAYER_BOT_SCHEMA).toContain('CREATE TABLE IF NOT EXISTS ambient_player_bots');
    expect(AMBIENT_PLAYER_BOT_SCHEMA).toContain(
      'CREATE INDEX IF NOT EXISTS ambient_player_bots_lifecycle',
    );
    expect(AMBIENT_PLAYER_BOT_SCHEMA).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS ambient_player_bots_character',
    );
    expect(AMBIENT_PLAYER_BOT_SCHEMA).toContain('credential_key_id TEXT');
    expect(AMBIENT_PLAYER_BOT_SCHEMA).toContain('credential_ciphertext TEXT');
    expect(AMBIENT_PLAYER_BOT_SCHEMA).toContain('credential_iv TEXT');
    expect(AMBIENT_PLAYER_BOT_SCHEMA).toContain('credential_auth_tag TEXT');

    const dbSource = readFileSync(join(process.cwd(), 'server', 'db.ts'), 'utf8');
    expect(dbSource).toContain(
      "import { AMBIENT_PLAYER_BOT_SCHEMA } from './ambient_player_bot_db'",
    );
    expect(dbSource).toContain('await client.query(AMBIENT_PLAYER_BOT_SCHEMA);');
  });

  it('fails closed when ambient bots are enabled without a credential key', () => {
    expect(
      () =>
        new PgAmbientPlayerBotDb(
          { query: vi.fn() },
          { env: { AMBIENT_PLAYER_BOTS_EXPERIMENT: '1' } },
        ),
    ).toThrow('AMBIENT_PLAYER_BOT_CREDENTIAL_KEY');
  });

  it('stores credentials only in an AES-GCM envelope when a primary key is configured', async () => {
    const queries: { sql: string; values?: readonly unknown[] }[] = [];
    const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
      queries.push({ sql, values });
      return { rows: [] };
    });
    const repo = new PgAmbientPlayerBotDb({ query }, { env: credentialEnv('current', 7) });

    await repo.saveBot(bot());

    const values = queries[0]?.values ?? [];
    expect(values).not.toContain('BotPassword123');
    expect(values).not.toContain('token-1');
    expect(values[4]).toBe('');
    expect(values[9]).toBe('');
    expect(values[29]).toBe('current');
    expect(values[30]).toEqual(expect.any(String));
    expect(values[31]).toEqual(expect.any(String));
    expect(values[32]).toEqual(expect.any(String));
  });

  it('reads a legacy plaintext row, backfills its envelope, and clears plaintext', async () => {
    const row = persistedRow();
    const queries: { sql: string; values?: readonly unknown[] }[] = [];
    const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
      queries.push({ sql, values });
      return sql.includes('SELECT') ? { rows: [row] } : { rows: [], rowCount: 1 };
    });
    const repo = new PgAmbientPlayerBotDb({ query }, { env: credentialEnv('current', 8) });

    await expect(repo.listBots()).resolves.toEqual([bot()]);

    const backfill = queries.find((entry) => entry.sql.includes('UPDATE ambient_player_bots'));
    expect(backfill?.sql).toContain("account_password = ''");
    expect(backfill?.sql).toContain("auth_token = ''");
    expect(backfill?.values?.[2]).toBe('current');
    expect(backfill?.values?.slice(2, 6)).not.toContain('BotPassword123');
    expect(backfill?.values?.slice(2, 6)).not.toContain('token-1');
    expect(backfill?.values?.slice(6, 8)).toEqual(['BotPassword123', 'token-1']);
  });

  it('prefers newer plaintext credentials left by an older process over a stale envelope', async () => {
    const oldEnvelope = await savedEnvelope('current', 8);
    const latestBot = {
      ...bot(),
      accountPassword: 'NewBotPassword456',
      authToken: 'new-token-2',
    };
    const mixedRow = {
      ...oldEnvelope,
      account_password: latestBot.accountPassword,
      auth_token: latestBot.authToken,
    };
    const queries: { sql: string; values?: readonly unknown[] }[] = [];
    const repo = new PgAmbientPlayerBotDb(
      {
        query: vi.fn(async (sql: string, values?: readonly unknown[]) => {
          queries.push({ sql, values });
          return sql.includes('SELECT') ? { rows: [mixedRow] } : { rows: [], rowCount: 1 };
        }),
      },
      { env: credentialEnv('current', 8) },
    );

    await expect(repo.listBots()).resolves.toEqual([latestBot]);
    const backfill = queries.find((entry) => entry.sql.includes('UPDATE ambient_player_bots'));
    expect(backfill?.values?.slice(6, 8)).toEqual([latestBot.accountPassword, latestBot.authToken]);
    expect(backfill?.values?.slice(2, 6)).not.toContain(latestBot.accountPassword);
    expect(backfill?.values?.slice(2, 6)).not.toContain(latestBot.authToken);
  });

  it('uses CAS for backfill and returns a concurrent save instead of overwriting it', async () => {
    const latestBot = {
      ...bot(),
      accountPassword: 'NewBotPassword456',
      authToken: 'new-token-2',
    };
    const latestRow = await savedEnvelope('current', 8, latestBot);
    const queries: { sql: string; values?: readonly unknown[] }[] = [];
    let selectCount = 0;
    const repo = new PgAmbientPlayerBotDb(
      {
        query: vi.fn(async (sql: string, values?: readonly unknown[]) => {
          queries.push({ sql, values });
          if (sql.includes('SELECT')) {
            selectCount++;
            return { rows: [selectCount === 1 ? persistedRow() : latestRow] };
          }
          if (sql.includes('UPDATE ambient_player_bots')) return { rows: [], rowCount: 0 };
          return { rows: [] };
        }),
      },
      { env: credentialEnv('current', 8) },
    );

    await expect(repo.listBots()).resolves.toEqual([latestBot]);

    const cas = queries.find((entry) => entry.sql.includes('UPDATE ambient_player_bots'));
    expect(cas?.sql).toContain('account_password IS NOT DISTINCT FROM $7');
    expect(cas?.sql).toContain('auth_token IS NOT DISTINCT FROM $8');
    expect(cas?.sql).toContain('credential_key_id IS NOT DISTINCT FROM $9');
    expect(cas?.sql).toContain('credential_ciphertext IS NOT DISTINCT FROM $10');
    expect(cas?.sql).toContain('credential_iv IS NOT DISTINCT FROM $11');
    expect(cas?.sql).toContain('credential_auth_tag IS NOT DISTINCT FROM $12');
    expect(cas?.sql).toContain('credential_version IS NOT DISTINCT FROM $13');
    expect(cas?.values?.slice(6)).toEqual(['BotPassword123', 'token-1', '', '', '', '', 1]);
    expect(selectCount).toBe(2);
  });

  it('fails closed after one reread when credential migration keeps losing CAS', async () => {
    let selectCount = 0;
    let updateCount = 0;
    const repo = new PgAmbientPlayerBotDb(
      {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('SELECT')) {
            selectCount++;
            return { rows: [persistedRow()] };
          }
          if (sql.includes('UPDATE ambient_player_bots')) {
            updateCount++;
            return { rows: [], rowCount: 0 };
          }
          return { rows: [] };
        }),
      },
      { env: credentialEnv('current', 8) },
    );

    await expect(repo.listBots()).rejects.toThrow(
      'credentials changed concurrently during migration',
    );
    expect(selectCount).toBe(2);
    expect(updateCount).toBe(2);
  });

  it('bounds plaintext backfill work per directory read', async () => {
    const rows = Array.from({ length: 55 }, (_, index) => ({
      ...persistedRow(),
      bot_id: `bot-${index + 1}`,
    }));
    const queries: { sql: string; values?: readonly unknown[] }[] = [];
    const repo = new PgAmbientPlayerBotDb(
      {
        query: vi.fn(async (sql: string, values?: readonly unknown[]) => {
          queries.push({ sql, values });
          return sql.includes('SELECT') ? { rows } : { rows: [], rowCount: 1 };
        }),
      },
      { env: credentialEnv('current', 8) },
    );

    await expect(repo.listBots()).resolves.toHaveLength(55);

    expect(
      queries.filter((entry) => entry.sql.includes('UPDATE ambient_player_bots')),
    ).toHaveLength(50);
  });

  it('decrypts an old key id, rotates to the primary key, and clears legacy fields', async () => {
    const oldInsert: { values?: readonly unknown[] } = {};
    const oldRepo = new PgAmbientPlayerBotDb(
      {
        query: vi.fn(async (_sql: string, values?: readonly unknown[]) => {
          oldInsert.values = values;
          return { rows: [] };
        }),
      },
      { env: credentialEnv('old', 9) },
    );
    await oldRepo.saveBot(bot());

    const oldValues = oldInsert.values ?? [];
    const encryptedRow = {
      ...persistedRow(),
      account_password: '',
      auth_token: '',
      credential_key_id: oldValues[29],
      credential_ciphertext: oldValues[30],
      credential_iv: oldValues[31],
      credential_auth_tag: oldValues[32],
    };
    const queries: { sql: string; values?: readonly unknown[] }[] = [];
    const env = credentialEnv('current', 10);
    env.AMBIENT_PLAYER_BOT_CREDENTIAL_PREVIOUS_KEYS = JSON.stringify({
      old: Buffer.alloc(32, 9).toString('base64'),
    });
    const rotatedRepo = new PgAmbientPlayerBotDb(
      {
        query: vi.fn(async (sql: string, values?: readonly unknown[]) => {
          queries.push({ sql, values });
          return sql.includes('SELECT') ? { rows: [encryptedRow] } : { rows: [], rowCount: 1 };
        }),
      },
      { env },
    );

    await expect(rotatedRepo.listBots()).resolves.toEqual([bot()]);

    const rotation = queries.find((entry) => entry.sql.includes('UPDATE ambient_player_bots'));
    expect(rotation?.values?.[2]).toBe('current');
    expect(rotation?.values?.[3]).not.toBe(oldValues[30]);
  });

  it('fails closed when an encrypted row references an unavailable key id', async () => {
    const query = vi.fn(async () => ({
      rows: [
        {
          ...persistedRow(),
          account_password: '',
          auth_token: '',
          credential_key_id: 'missing',
          credential_ciphertext: Buffer.from('ciphertext').toString('base64'),
          credential_iv: Buffer.alloc(12).toString('base64'),
          credential_auth_tag: Buffer.alloc(16).toString('base64'),
        },
      ],
    }));
    const repo = new PgAmbientPlayerBotDb({ query }, { env: credentialEnv('current', 11) });

    await expect(repo.listBots()).rejects.toThrow('credential key id missing is unavailable');
  });

  it('rejects a tampered AES-GCM ciphertext', async () => {
    const envelope = await savedEnvelope('current', 12);
    const tampered = Buffer.from(String(envelope.credential_ciphertext), 'base64');
    tampered[0] = (tampered[0] ?? 0) ^ 1;
    const repo = encryptedRowRepo(
      {
        ...envelope,
        credential_ciphertext: tampered.toString('base64'),
      },
      credentialEnv('current', 12),
    );

    await expect(repo.listBots()).rejects.toThrow('credential envelope authentication failed');
  });

  it('binds the credential envelope to its realm and bot id through AAD', async () => {
    const envelope = await savedEnvelope('current', 13);
    const repo = encryptedRowRepo({ ...envelope, bot_id: 'bot-2' }, credentialEnv('current', 13));

    await expect(repo.listBots()).rejects.toThrow('credential envelope authentication failed');
  });

  it('normalizes persisted rows and round-trips through the repository shape', async () => {
    const queries: { sql: string; values?: readonly unknown[] }[] = [];
    const row = {
      bot_id: 'bot-1',
      account_id: 11,
      account_username: 'bot_user',
      account_password: 'BotPassword123',
      character_id: 101,
      character_name: 'Branoraaa',
      profile_id: 'eastbrook_vale_warrior_newcomer',
      class: 'warrior',
      auth_token: 'token-1',
      auth_token_expires_at: new Date('2026-01-02T03:04:05.000Z'),
      lifecycle_status: 'ready',
      provision_state: 'ready',
      level_band_min: 1,
      level_band_max: 7,
      preferred_zone_ids: ['eastbrook_vale'],
      last_known_zone_id: 'eastbrook_vale',
      last_known_level: 3,
      last_known_x: 4,
      last_known_z: 5,
      assigned_cluster_id: null,
      assigned_player_character_id: null,
      cooldown_until: null,
      reservation_until: null,
      last_runner_error: '',
      last_runner_at: new Date('2026-01-02T06:07:08.000Z'),
      planner_state: { step: 'wolves' },
      runner_state: { pid: 42 },
      social_state: { mood: 'quiet' },
    };
    const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
      queries.push({ sql, values });
      return sql.includes('SELECT') ? { rows: [row] } : { rows: [] };
    });
    const repo = new PgAmbientPlayerBotDb({ query }, { env: {} });

    await repo.saveBot(bot());
    const listed = await repo.listBots();

    expect(queries[0]?.sql).toContain('INSERT INTO ambient_player_bots');
    expect(listed).toEqual([bot()]);
    expect(normalizeAmbientPlayerBotRecord(row)).toEqual(bot());
  });
});

function credentialEnv(keyId: string, fill: number): NodeJS.ProcessEnv {
  return {
    AMBIENT_PLAYER_BOTS_EXPERIMENT: '1',
    AMBIENT_PLAYER_BOT_CREDENTIAL_KEY_ID: keyId,
    AMBIENT_PLAYER_BOT_CREDENTIAL_KEY: Buffer.alloc(32, fill).toString('base64'),
  };
}

function persistedRow(): Record<string, unknown> {
  return {
    bot_id: 'bot-1',
    account_id: 11,
    account_username: 'bot_user',
    account_password: 'BotPassword123',
    character_id: 101,
    character_name: 'Branoraaa',
    profile_id: 'eastbrook_vale_warrior_newcomer',
    class: 'warrior',
    auth_token: 'token-1',
    auth_token_expires_at: new Date('2026-01-02T03:04:05.000Z'),
    lifecycle_status: 'ready',
    provision_state: 'ready',
    level_band_min: 1,
    level_band_max: 7,
    preferred_zone_ids: ['eastbrook_vale'],
    last_known_zone_id: 'eastbrook_vale',
    last_known_level: 3,
    last_known_x: 4,
    last_known_z: 5,
    assigned_cluster_id: null,
    assigned_player_character_id: null,
    cooldown_until: null,
    reservation_until: null,
    last_runner_error: '',
    last_runner_at: new Date('2026-01-02T06:07:08.000Z'),
    planner_state: { step: 'wolves' },
    runner_state: { pid: 42 },
    social_state: { mood: 'quiet' },
  };
}

async function savedEnvelope(
  keyId: string,
  fill: number,
  record: AmbientPlayerBotRecord = bot(),
): Promise<Record<string, unknown>> {
  let values: readonly unknown[] = [];
  const repo = new PgAmbientPlayerBotDb(
    {
      query: vi.fn(async (_sql: string, queryValues?: readonly unknown[]) => {
        values = queryValues ?? [];
        return { rows: [] };
      }),
    },
    { env: credentialEnv(keyId, fill) },
  );
  await repo.saveBot(record);
  return {
    ...persistedRow(),
    account_password: '',
    auth_token: '',
    credential_key_id: values[29],
    credential_ciphertext: values[30],
    credential_iv: values[31],
    credential_auth_tag: values[32],
    credential_version: values[33],
  };
}

function encryptedRowRepo(
  row: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): PgAmbientPlayerBotDb {
  return new PgAmbientPlayerBotDb(
    {
      query: vi.fn(async (sql: string) =>
        sql.includes('SELECT') ? { rows: [row] } : { rows: [] },
      ),
    },
    { env },
  );
}
