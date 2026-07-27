import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// db.ts builds a pg Pool and requires DATABASE_URL at import time; stub both so
// the module loads and every lease query goes through a spy we can assert on.
// Same idiom as save_character_and_market.test.ts.
const dbMock = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgres://test/test';
});
vi.mock('pg', () => ({
  Pool: function Pool() {
    return { query: dbMock.query, connect: dbMock.connect };
  },
}));

import {
  acquireCharacterLease,
  heartbeatCharacterLeases,
  LEASE_TTL_SECONDS,
  openMarketWriteGate,
  PROCESS_LEASE_HOLDER,
  releaseAllCharacterLeases,
  releaseCharacterLease,
  saveCharacterAndMarketState,
  saveCharacterState,
  setCharacterHotbarLayout,
} from '../server/db';
import { REALM } from '../server/realm';
import type { CharacterState, MailSave, MarketSave } from '../src/sim/sim';
import type { ActionBarLayout } from '../src/world_api/action_bar';

// The load-bearing values are pinned as bare literals below, never as the same
// constant re-derived from itself. The TTL is 90 seconds (three missed 30s
// autosave heartbeats); a fresh acquire reports true on rowCount 1 and MUST
// report false (fail closed) on rowCount 0. Every acquire stamps a nonce and the
// fenced release matches on it.
beforeEach(() => {
  dbMock.query.mockReset();
  dbMock.query.mockResolvedValue({ rows: [], rowCount: 1 } as any);
});

const firstSql = () => String(dbMock.query.mock.calls[0][0]);
const firstParams = () => dbMock.query.mock.calls[0][1] as unknown[];

describe('PROCESS_LEASE_HOLDER', () => {
  it('is the realm name plus a per-boot UUID suffix', () => {
    expect(PROCESS_LEASE_HOLDER.startsWith(`${REALM}#`)).toBe(true);
    const suffix = PROCESS_LEASE_HOLDER.slice(REALM.length + 1);
    // A per-boot UUID keeps two processes accidentally on the same realm name
    // from sharing a holder (the exact double-load accident the lease guards).
    expect(suffix).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('LEASE_TTL_SECONDS', () => {
  it('is 90 seconds (three missed 30s autosave heartbeats)', () => {
    expect(LEASE_TTL_SECONDS).toBe(90);
  });
});

describe('acquireCharacterLease', () => {
  it('upserts the lease with the nonce column, expiry-or-own predicate, and TTL interval', async () => {
    const ok = await acquireCharacterLease(42, 100, 'nonce-1');
    expect(ok).toBe(true);

    const sql = firstSql();
    expect(sql).toContain(
      'INSERT INTO character_leases (character_id, realm, holder, nonce, account_id, acquired_at, heartbeat_at, expires_at)',
    );
    expect(sql).toContain('ON CONFLICT (character_id) DO UPDATE');
    // The fence: every acquire re-stamps the nonce, so a later release keyed to an
    // older nonce is a no-op.
    expect(sql).toContain('nonce = EXCLUDED.nonce');
    // The reclaim arm (expired) OR the same-holder arm (a linkdead resume on this
    // process re-extends its own lease). A live foreign lease matches no arm even
    // for the same account, so the upsert touches nothing and rowCount stays 0.
    expect(sql).toContain(
      'WHERE character_leases.expires_at < now() OR character_leases.holder = EXCLUDED.holder',
    );
    expect(sql).not.toContain('character_leases.account_id = EXCLUDED.account_id');
    expect(sql).toContain('make_interval(secs => $6)');
    // Params: character id, this process realm, the default holder, the nonce, the account id, the 90s TTL.
    expect(firstParams()).toEqual([42, REALM, PROCESS_LEASE_HOLDER, 'nonce-1', 100, 90]);
  });

  it('passes an explicit holder through instead of the process default', async () => {
    await acquireCharacterLease(7, 100, 'nonce-x', 'other-holder');
    expect(firstParams()).toEqual([7, REALM, 'other-holder', 'nonce-x', 100, 90]);
  });

  it('returns false (fail closed) when the upsert changes no row', async () => {
    dbMock.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
    expect(await acquireCharacterLease(42, 100, 'nonce-1')).toBe(false);
  });

  it('returns false when rowCount is absent rather than truthily defaulting', async () => {
    dbMock.query.mockResolvedValueOnce({ rows: [] } as any);
    expect(await acquireCharacterLease(42, 100, 'nonce-1')).toBe(false);
  });
});

describe('releaseCharacterLease', () => {
  it('fences the delete on the nonce when one is given', async () => {
    await releaseCharacterLease(42, 'nonce-1');
    expect(firstSql()).toBe(
      'DELETE FROM character_leases WHERE character_id = $1 AND holder = $2 AND nonce = $3',
    );
    expect(firstParams()).toEqual([42, PROCESS_LEASE_HOLDER, 'nonce-1']);
  });

  it('deletes on holder alone when no nonce is given (unfenced arm for nonce-less sessions)', async () => {
    await releaseCharacterLease(42);
    expect(firstSql()).toBe('DELETE FROM character_leases WHERE character_id = $1 AND holder = $2');
    expect(firstParams()).toEqual([42, PROCESS_LEASE_HOLDER]);
  });

  it('passes an explicit holder through with the nonce', async () => {
    await releaseCharacterLease(7, 'nonce-y', 'other-holder');
    expect(firstParams()).toEqual([7, 'other-holder', 'nonce-y']);
  });
});

describe('heartbeatCharacterLeases', () => {
  it('extends every lease held by this process in one statement', async () => {
    await heartbeatCharacterLeases();
    const sql = firstSql();
    expect(sql).toContain('UPDATE character_leases');
    expect(sql).toContain('make_interval(secs => $2)');
    expect(sql).toContain('WHERE holder = $1');
    // A lease already reclaimed by another holder is not matched, so this can
    // never steal one back.
    expect(firstParams()).toEqual([PROCESS_LEASE_HOLDER, 90]);
  });

  it('passes an explicit holder through', async () => {
    await heartbeatCharacterLeases('other-holder');
    expect(firstParams()).toEqual(['other-holder', 90]);
  });
});

describe('releaseAllCharacterLeases', () => {
  it('drops every lease held by this process (shutdown sweep)', async () => {
    await releaseAllCharacterLeases();
    expect(firstSql()).toBe('DELETE FROM character_leases WHERE holder = $1');
    expect(firstParams()).toEqual([PROCESS_LEASE_HOLDER]);
  });
});

describe('shutdown wiring (source pin)', () => {
  it('main.ts drains the bank ledger and deed records, then sweeps leases, then closes the pool', () => {
    // The shutdown closure in server/main.ts is not unit-drivable, so pin its
    // ordering by source. The load-bearing order is: endAllPlaySessions() (close
    // the play-session rows), then bankLedgerIdle() (flush every queued audit row
    // WHILE this process still holds the leases), then releaseAllCharacterLeases(),
    // then pool.end() (both drain and sweep need a live pool). Draining BEFORE the
    // sweep matters: once the leases drop, a replacement process can load the same
    // character and write new bank_ledger rows, and any rows still queued here would
    // flush AFTER them with higher insertion ids, inverting the id order the offline
    // audit replays by (false negative_net / purchased_regression alarms). The
    // deed-records FIFO drains in the same window: a queued character_deeds insert
    // rejected by pool.end() would go missing until that character's next login
    // (the join reconcile is the only heal). Match the awaited CALL forms so a
    // prose mention in a comment never shifts an index.
    const src = readFileSync(new URL('../server/main.ts', import.meta.url), 'utf8');
    const saveAll = src.indexOf("await game.saveAll('shutdown')");
    const endSessions = src.indexOf('await game.endAllPlaySessions(');
    const sweep = src.indexOf('await releaseAllCharacterLeases(');
    const ledgerDrain = src.indexOf('await bankLedgerIdle()');
    const deedsDrain = src.indexOf('await deedRecordsIdle()');
    const poolEnd = src.indexOf('await pool.end()');
    // The shutdown save runs FIRST, while this process still holds every lease:
    // the saves are lease-fenced (a live holder + nonce row lock before the UPDATE),
    // so a reorder below the sweep would fence out EVERY shutdown save (no lock match,
    // nothing persisted) and silently drop all in-flight state on each restart.
    expect(saveAll).toBeGreaterThan(-1);
    expect(endSessions).toBeGreaterThan(saveAll);
    expect(ledgerDrain).toBeGreaterThan(endSessions);
    expect(deedsDrain).toBeGreaterThan(endSessions);
    expect(sweep).toBeGreaterThan(saveAll);
    expect(sweep).toBeGreaterThan(ledgerDrain);
    expect(sweep).toBeGreaterThan(deedsDrain);
    expect(poolEnd).toBeGreaterThan(sweep);
  });
});

// A checked-out-client stub for the save fns that run their write on a
// pool.connect() client (saveCharacterState via runWithStatementTimeout, and
// saveCharacterAndMarketState directly). A lease SELECT can match or miss, and
// the character UPDATE reports the given rowCount; every other statement
// resolves harmlessly.
function checkedOutClient(
  options: { leaseMatch?: boolean; updateRowCount?: number | undefined } = {},
) {
  const { leaseMatch = true, updateRowCount = 1 } = options;
  const query = vi.fn(async (sql: string, _values?: unknown[]) =>
    /SELECT 1[\s\S]*FROM character_leases/i.test(String(sql))
      ? ({ rows: leaseMatch ? [{ '?column?': 1 }] : [], rowCount: leaseMatch ? 1 : 0 } as any)
      : /UPDATE characters/i.test(String(sql))
        ? ({ rows: [], rowCount: updateRowCount } as any)
        : ({ rows: [], rowCount: 0 } as any),
  );
  const release = vi.fn();
  return { query, release };
}

const STATE = {
  level: 7,
  questLog: [],
  questsDone: [],
  inventory: [],
} as unknown as CharacterState;
const MARKET = { listings: [], collections: {} } as unknown as MarketSave;
const MAIL = { mail: [], nextMailId: 1 } as unknown as MailSave;
const HOTBAR_LAYOUT: ActionBarLayout = {
  v: 1,
  forms: { normal: { bar: [{ type: 'ability', id: 'heroic_strike' }] } },
};

describe('acquireCharacterLease fail-closed form', () => {
  it('never permits a same-account foreign-holder reclaim before expiry', async () => {
    await acquireCharacterLease(42, 100, 'nonce-1');
    const sql = firstSql();
    expect(sql).not.toContain('character_leases.account_id = EXCLUDED.account_id');
    expect(sql).toContain(
      'WHERE character_leases.expires_at < now() OR character_leases.holder = EXCLUDED.holder',
    );
  });
});

describe('saveCharacterState lease fence', () => {
  beforeEach(() => {
    dbMock.connect.mockReset();
  });

  it('locks and validates the live holder + nonce + expiry before writing', async () => {
    const client = checkedOutClient();
    dbMock.connect.mockResolvedValueOnce(client as any);

    const ok = await saveCharacterState(42, 7, STATE, 'nonce-1');
    expect(ok).toBe(true);

    const stmts = client.query.mock.calls.map((c) => String(c[0]));
    const leaseLockIndex = stmts.findIndex((s) => /FROM character_leases/i.test(s));
    const characterUpdateIndex = stmts.findIndex((s) => /UPDATE characters/i.test(s));
    const updates = stmts.filter((s) => /UPDATE characters/i.test(s));
    // The lease row is locked before the character write. A concurrent takeover's
    // ON CONFLICT update must wait until this transaction commits, so it cannot
    // rotate the nonce between validation and the state write.
    expect(leaseLockIndex).toBeGreaterThan(-1);
    expect(characterUpdateIndex).toBeGreaterThan(leaseLockIndex);
    expect(updates).toHaveLength(1);
    const leaseLockCall = client.query.mock.calls[leaseLockIndex];
    expect(String(leaseLockCall[0])).toContain('FOR UPDATE');
    expect(String(leaseLockCall[0])).toContain('expires_at > now()');
    expect(leaseLockCall[1]).toEqual([42, PROCESS_LEASE_HOLDER, 'nonce-1']);
    const updateCall = client.query.mock.calls[characterUpdateIndex];
    expect(String(updateCall[0])).not.toContain('EXISTS');
    expect(updateCall[1]).toEqual([42, 7, expect.any(String)]);
    // The write runs on the checked-out client, never the bare pool.
    expect(dbMock.query).not.toHaveBeenCalled();
  });

  it('resolves false and skips the character write when the lease lock does not match', async () => {
    const client = checkedOutClient({ leaseMatch: false });
    dbMock.connect.mockResolvedValueOnce(client as any);
    expect(await saveCharacterState(42, 7, STATE, 'nonce-1')).toBe(false);
    expect(client.query.mock.calls.some((c) => /UPDATE characters/i.test(String(c[0])))).toBe(
      false,
    );
  });

  it('resolves true when the locked lease row matches and the write lands', async () => {
    const client = checkedOutClient();
    dbMock.connect.mockResolvedValueOnce(client as any);
    expect(await saveCharacterState(42, 7, STATE, 'nonce-1')).toBe(true);
  });

  it('the no-nonce legacy path issues an unfenced UPDATE and resolves true even on rowCount 0', async () => {
    const client = checkedOutClient({ updateRowCount: 0 });
    dbMock.connect.mockResolvedValueOnce(client as any);

    const ok = await saveCharacterState(42, 7, STATE);
    // Legacy path returns true regardless of rowCount (unconditional write, as before).
    expect(ok).toBe(true);
    const updateCall = client.query.mock.calls.find((c) => /UPDATE characters/i.test(String(c[0])));
    // No lease fence, and the params stop at the JSON state (no holder / nonce).
    expect(String(updateCall?.[0])).not.toContain('EXISTS');
    expect(updateCall?.[1]).toEqual([42, 7, expect.any(String)]);
  });
});

describe('setCharacterHotbarLayout lease fence', () => {
  beforeEach(() => {
    dbMock.connect.mockReset();
  });

  it('locks the live holder and nonce before writing the layout', async () => {
    const client = checkedOutClient();
    dbMock.connect.mockResolvedValueOnce(client as any);

    const ok = await setCharacterHotbarLayout(42, HOTBAR_LAYOUT, 'nonce-1');
    expect(ok).toBe(true);
    const stmts = client.query.mock.calls.map((call) => String(call[0]));
    const leaseLockIndex = stmts.findIndex((sql) => /FROM character_leases/i.test(sql));
    const characterUpdateIndex = stmts.findIndex((sql) => /UPDATE characters/i.test(sql));
    expect(leaseLockIndex).toBeGreaterThan(-1);
    expect(characterUpdateIndex).toBeGreaterThan(leaseLockIndex);
    expect(String(client.query.mock.calls[leaseLockIndex][0])).toContain('FOR UPDATE');
    expect(client.query.mock.calls[leaseLockIndex][1]).toEqual([
      42,
      PROCESS_LEASE_HOLDER,
      'nonce-1',
    ]);
    expect(client.query.mock.calls[characterUpdateIndex][1]).toEqual([
      42,
      JSON.stringify(HOTBAR_LAYOUT),
    ]);
    expect(dbMock.query).not.toHaveBeenCalled();
  });

  it('returns false and skips the layout update when the lease no longer matches', async () => {
    const client = checkedOutClient({ leaseMatch: false });
    dbMock.connect.mockResolvedValueOnce(client as any);

    await expect(setCharacterHotbarLayout(42, HOTBAR_LAYOUT, 'stale-nonce')).resolves.toBe(false);
    expect(client.query.mock.calls.some((call) => /UPDATE characters/i.test(String(call[0])))).toBe(
      false,
    );
  });
});

describe('saveCharacterAndMarketState lease fence', () => {
  beforeEach(() => {
    dbMock.connect.mockReset();
    // The escrow flush writes the realm-market row, so it is gated on the boot
    // backfill; open the gate so the transaction runs.
    openMarketWriteGate();
  });

  it('the happy path writes both world_state escrows then COMMIT and resolves true', async () => {
    const client = checkedOutClient();
    dbMock.connect.mockResolvedValueOnce(client as any);

    const ok = await saveCharacterAndMarketState(42, 7, STATE, MARKET, MAIL, 'nonce-1');
    expect(ok).toBe(true);

    const stmts = client.query.mock.calls.map((c) => String(c[0]));
    // Both escrow halves (Market + Ravenpost mail), then COMMIT, no ROLLBACK.
    expect(stmts.filter((s) => /world_state/i.test(s))).toHaveLength(2);
    expect(stmts.some((s) => /^COMMIT/.test(s))).toBe(true);
    expect(stmts.some((s) => /ROLLBACK/.test(s))).toBe(false);
  });

  it('a lease-lock miss rolls back, writes neither the character nor escrow, and resolves false', async () => {
    const client = checkedOutClient({ leaseMatch: false });
    dbMock.connect.mockResolvedValueOnce(client as any);

    const ok = await saveCharacterAndMarketState(42, 7, STATE, MARKET, MAIL, 'nonce-1');
    expect(ok).toBe(false);

    const stmts = client.query.mock.calls.map((c) => String(c[0]));
    // The bag half never landed, so the shared Market / Ravenpost escrow must not be
    // overwritten by this displaced session: neither world_state upsert runs.
    expect(stmts.some((s) => /world_state/i.test(s))).toBe(false);
    expect(stmts.some((s) => /UPDATE characters/i.test(s))).toBe(false);
    expect(stmts.some((s) => /ROLLBACK/.test(s))).toBe(true);
    expect(stmts.some((s) => /^COMMIT/.test(s))).toBe(false);
  });

  it('a stale nonce cannot clobber the reclaimed character or escrow', async () => {
    // An expiry-based foreign reclaim rotated the lease nonce before this displaced save
    // locked the row, so the holder + stale nonce + expiry SELECT matches no row.
    const client = checkedOutClient({ leaseMatch: false });
    dbMock.connect.mockResolvedValueOnce(client as any);

    const ok = await saveCharacterAndMarketState(42, 7, STATE, MARKET, MAIL, 'stale-nonce');
    expect(ok).toBe(false);

    const leaseCall = client.query.mock.calls.find((c) =>
      /FROM character_leases/i.test(String(c[0])),
    );
    expect(String(leaseCall?.[0])).toContain('FOR UPDATE');
    expect(leaseCall?.[1]).toEqual([42, PROCESS_LEASE_HOLDER, 'stale-nonce']);
    // No further writes after the miss: no escrow upsert, no COMMIT.
    const stmts = client.query.mock.calls.map((c) => String(c[0]));
    expect(stmts.some((s) => /world_state/i.test(s))).toBe(false);
    expect(stmts.some((s) => /^COMMIT/.test(s))).toBe(false);
  });
});
