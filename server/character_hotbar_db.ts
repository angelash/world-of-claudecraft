// Dedicated, bounded layout writes share the character-before-lease order
// with live blob saves. JSON validation and coalescing belong to the store.
import type { ActionBarLayoutProfiles } from '../src/world_api/action_bar';
import { PROCESS_LEASE_HOLDER } from './character_lease_db';
import { lockCharacterLeaseForSave } from './character_lease_lock_db';
import { pool } from './db';
import { cancelDetachedBackend } from './db_backend_cancel';
import { createDbTransactionDeadline } from './db_transaction_deadline';

export async function setCharacterHotbarLayout(
  characterId: number,
  layout: ActionBarLayoutProfiles,
  leaseNonce?: string,
): Promise<boolean> {
  const json = JSON.stringify(layout);
  if (leaseNonce === undefined) {
    const res = await pool.query('UPDATE characters SET hotbar_layout = $2::jsonb WHERE id = $1', [
      characterId,
      json,
    ]);
    return (res.rowCount ?? 0) > 0;
  }
  const tx = createDbTransactionDeadline(await pool.connect(), {
    operation: 'hotbar layout save',
    timeoutMs: 10_000,
    cancelBackend: cancelDetachedBackend,
  });
  try {
    await tx.query('BEGIN');
    await tx.query(
      "SET LOCAL statement_timeout = '5s'; SET LOCAL lock_timeout = '2s'; SET LOCAL idle_in_transaction_session_timeout = '5s'",
    );
    const character = await tx.query('SELECT 1 FROM characters WHERE id = $1 FOR NO KEY UPDATE', [
      characterId,
    ]);
    if (
      character.rows.length === 0 ||
      !(await lockCharacterLeaseForSave(
        tx.query.bind(tx),
        characterId,
        leaseNonce,
        PROCESS_LEASE_HOLDER,
      ))
    ) {
      await tx.rollback();
      return false;
    }
    const res = await tx.query('UPDATE characters SET hotbar_layout = $2::jsonb WHERE id = $1', [
      characterId,
      json,
    ]);
    await tx.commit();
    return (res.rowCount ?? 0) > 0;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.release();
  }
}
