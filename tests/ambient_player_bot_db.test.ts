import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AMBIENT_PLAYER_BOT_SCHEMA, normalizeAmbientPlayerBotRecord, PgAmbientPlayerBotDb } from '../server/ambient_player_bot_db';
import type { AmbientPlayerBotRecord } from '../server/ambient_bots/types';

function bot(): AmbientPlayerBotRecord {
  return {
    botId: 'bot-1',
    accountId: 11,
    characterId: 101,
    profileId: 'eastbrook_vale_warrior_newcomer',
    class: 'warrior',
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
    plannerState: { step: 'wolves' },
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
      character_id: 101,
      profile_id: 'eastbrook_vale_warrior_newcomer',
      class: 'warrior',
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
      planner_state: { step: 'wolves' },
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
