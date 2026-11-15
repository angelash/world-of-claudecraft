// Opt-in real-Postgres coverage for character save and lease-reclaim ordering.
// The default suite stays DB-free. Set TEST_DATABASE_URL to a disposable local
// PostgreSQL database to exercise the production db.ts functions.

import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { materialSourceConnection } from '../server/material_source_connection';
import type { CharacterState } from '../src/sim/sim';

const DB_URL = process.env.TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

type DbModule = typeof import('../server/db');

interface Fixture {
  accountId: number;
  characterId: number;
}

describeDb('character lease save ordering (real Postgres)', () => {
  let control: Pool;
  let db: DbModule;
  let realm: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    db = await import('../server/db');
    ({ REALM: realm } = await import('../server/realm'));
    control = new Pool({ ...materialSourceConnection(DB_URL as string), max: 4 });
    await db.ensureSchema();
  }, 120_000);

  afterAll(async () => {
    if (control) await control.end();
    if (db) await db.pool.end();
  });

  function state(marker: string): CharacterState {
    return {
      level: 10,
      questLog: [],
      questsDone: [],
      inventory: [],
      marker,
    } as unknown as CharacterState;
  }

  async function seedFixture(): Promise<Fixture> {
    const suffix = randomUUID().replaceAll('-', '');
    const account = await control.query(
      `INSERT INTO accounts (username, password_hash)
       VALUES ($1, $2)
       RETURNING id`,
      [`lease_pg_${suffix}`, 'integration-test-only'],
    );
    const accountId = Number(account.rows[0].id);
    const character = await control.query(
      `INSERT INTO characters (account_id, name, class, realm, level, state)
       VALUES ($1, $2, 'warrior', $3, 10, $4::jsonb)
       RETURNING id`,
      [accountId, `LeasePg${suffix}`, realm, JSON.stringify(state('S0'))],
    );
    return { accountId, characterId: Number(character.rows[0].id) };
  }

  async function cleanupFixture(fixture: Fixture): Promise<void> {
    await control.query('DELETE FROM accounts WHERE id = $1', [fixture.accountId]);
  }

  async function installDelayTrigger(options: {
    table: 'characters' | 'character_leases';
    idColumn: 'id' | 'character_id';
    characterId: number;
    lockKey: number;
    suffix: string;
  }): Promise<() => Promise<void>> {
    const functionName = `lease_test_delay_fn_${process.pid}_${options.suffix}`;
    const triggerName = `lease_test_delay_tr_${process.pid}_${options.suffix}`;
    await control.query(`
      CREATE FUNCTION ${functionName}() RETURNS trigger
      LANGUAGE plpgsql AS $body$
      BEGIN
        IF NEW.${options.idColumn} = ${options.characterId} THEN
          PERFORM pg_advisory_xact_lock(${options.lockKey});
          PERFORM pg_sleep(0.75);
        END IF;
        RETURN NEW;
      END
      $body$;
      CREATE TRIGGER ${triggerName}
      BEFORE UPDATE ON ${options.table}
      FOR EACH ROW EXECUTE FUNCTION ${functionName}();
    `);
    return async () => {
      await control.query(`DROP TRIGGER IF EXISTS ${triggerName} ON ${options.table}`);
      await control.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
    };
  }

  async function waitUntilAdvisoryLockHeld(lockKey: number): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const observer = await control.connect();
      try {
        const result = await observer.query('SELECT pg_try_advisory_lock($1) AS acquired', [
          lockKey,
        ]);
        if (result.rows[0].acquired === false) return;
        await observer.query('SELECT pg_advisory_unlock($1)', [lockKey]);
      } finally {
        observer.release();
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`timed out waiting for advisory lock ${lockKey}`);
  }

  async function expectStillPending<T>(promise: Promise<T>): Promise<void> {
    let settled = false;
    void promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(settled).toBe(false);
  }

  it('save-first commits S1 and a live foreign holder cannot reclaim the lease', async () => {
    const fixture = await seedFixture();
    const oldNonce = randomUUID();
    const newNonce = randomUUID();
    const lockKey = 1_500_000_000 + (fixture.characterId % 400_000_000);
    let removeTrigger: (() => Promise<void>) | undefined;
    try {
      expect(await db.acquireCharacterLease(fixture.characterId, fixture.accountId, oldNonce)).toBe(
        true,
      );
      removeTrigger = await installDelayTrigger({
        table: 'characters',
        idColumn: 'id',
        characterId: fixture.characterId,
        lockKey,
        suffix: 'save_first',
      });

      const save = db.saveCharacterState(fixture.characterId, 11, state('S1'), oldNonce);
      await waitUntilAdvisoryLockHeld(lockKey);
      const acquire = db.acquireCharacterLease(
        fixture.characterId,
        fixture.accountId,
        newNonce,
        `replacement-holder-${process.pid}`,
      );

      await expectStillPending(acquire);
      await expect(save).resolves.toBe(true);
      await expect(acquire).resolves.toBe(false);

      const postAcquire = await db.getCharacter(fixture.accountId, fixture.characterId);
      expect(postAcquire?.level).toBe(11);
      expect(postAcquire?.state).toMatchObject({ marker: 'S1' });
      await expect(
        db.saveCharacterState(fixture.characterId, 12, state('S2'), oldNonce),
      ).resolves.toBe(true);
      expect((await db.getCharacter(fixture.accountId, fixture.characterId))?.state).toMatchObject({
        marker: 'S2',
      });
    } finally {
      if (removeTrigger) await removeTrigger();
      await cleanupFixture(fixture);
    }
  }, 20_000);

  it('an expired lease can be reclaimed before the old save can lock or write', async () => {
    const fixture = await seedFixture();
    const oldNonce = randomUUID();
    const newNonce = randomUUID();
    const lockKey = 1_900_000_000 + (fixture.characterId % 200_000_000);
    let removeTrigger: (() => Promise<void>) | undefined;
    try {
      expect(await db.acquireCharacterLease(fixture.characterId, fixture.accountId, oldNonce)).toBe(
        true,
      );
      await control.query(
        `UPDATE character_leases
            SET expires_at = now() - interval '1 second'
          WHERE character_id = $1`,
        [fixture.characterId],
      );
      removeTrigger = await installDelayTrigger({
        table: 'character_leases',
        idColumn: 'character_id',
        characterId: fixture.characterId,
        lockKey,
        suffix: 'acquire_first',
      });

      const acquire = db.acquireCharacterLease(
        fixture.characterId,
        fixture.accountId,
        newNonce,
        `replacement-holder-${process.pid}`,
      );
      await waitUntilAdvisoryLockHeld(lockKey);
      const staleSave = db.saveCharacterState(fixture.characterId, 12, state('STALE'), oldNonce);

      // The old row is already expired, so the stale save fails its
      // holder + nonce + expiry fence immediately even while the replacement
      // transaction is still inside its update trigger.
      await expect(staleSave).resolves.toBe(false);
      await expect(acquire).resolves.toBe(true);
      const loaded = await db.getCharacter(fixture.accountId, fixture.characterId);
      expect(loaded?.level).toBe(10);
      expect(loaded?.state).toMatchObject({ marker: 'S0' });
    } finally {
      if (removeTrigger) await removeTrigger();
      await cleanupFixture(fixture);
    }
  }, 20_000);
});
