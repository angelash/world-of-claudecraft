import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AMBIENT_PLAYER_BOT_SCHEMA, normalizeAmbientPlayerBotRecord, PgAmbientPlayerBotDb } from '../server/ambient_player_bot_db';
import type { AmbientPlayerBotRecord } from '../server/ambient_bots/types';

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
    expect(AMBIENT_PLAYER_BOT_SCHEMA).toContain('CREATE INDEX IF NOT EXISTS ambient_player_bots_lifecycle');
    expect(AMBIENT_PLAYER_BOT_SCHEMA).toContain('CREATE UNIQUE INDEX IF NOT EXISTS ambient_player_bots_character');

    const dbSource = readFileSync(join(process.cwd(), 'server', 'db.ts'), 'utf8');
    expect(dbSource).toContain("import { AMBIENT_PLAYER_BOT_SCHEMA } from './ambient_player_bot_db'");
    expect(dbSource).toContain('await client.query(AMBIENT_PLAYER_BOT_SCHEMA);');
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
    const repo = new PgAmbientPlayerBotDb({ query });

    await repo.saveBot(bot());
    const listed = await repo.listBots();

    expect(queries[0]?.sql).toContain('INSERT INTO ambient_player_bots');
    expect(listed).toEqual([bot()]);
    expect(normalizeAmbientPlayerBotRecord(row)).toEqual(bot());
  });
});
