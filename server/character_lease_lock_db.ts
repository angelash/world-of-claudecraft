import type { QueryResult } from 'pg';

export async function lockCharacterLeaseForSave(
  query: (text: string, values?: unknown[]) => Promise<QueryResult>,
  characterId: number,
  leaseNonce: string,
  holder: string,
): Promise<boolean> {
  // The row lock is the save fence. A takeover uses INSERT ... ON CONFLICT UPDATE
  // on this same primary-key row, so it must wait until the save transaction has
  // written the character and committed. If the takeover committed first, this
  // SELECT wakes on the rotated row and the holder + nonce predicate misses.
  // Checking expiry here also prevents a paused process from writing after its
  // lease has naturally lapsed but before another process has reclaimed it.
  const lease = await query(
    `SELECT 1
       FROM character_leases
      WHERE character_id = $1
        AND holder = $2
        AND nonce = $3
        AND expires_at > now()
      FOR UPDATE`,
    [characterId, holder, leaseNonce],
  );
  return lease.rows.length > 0;
}
