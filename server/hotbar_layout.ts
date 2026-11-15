// Per-character action-bar layout persistence, server side: the join-time read
// of the stored document, the per-profile merge of a client save, and the
// per-character FIFO database write. The document model and its bounds
// validation live in src/world_api/action_bar.ts (shared with the client); this
// module is what server/game.ts composes, so the coordinator carries one store
// field, one session-state spread, and one dispatch line.

import {
  ACTION_BAR_LAYOUT_LEGACY_PROFILE,
  type ActionBarLayoutProfiles,
  actionBarLayoutWire,
  sanitizeActionBarLayout,
  sanitizeActionBarLayoutProfile,
  sanitizeActionBarLayoutProfiles,
  withActionBarLayoutProfile,
} from '../src/world_api/action_bar';
import { type BackgroundDbGate, createBackgroundDbGate } from './background_db_gate';
import { setCharacterHotbarLayout } from './db';
import { createKeyedSerialWriter, KeyedSerialWriteAborted } from './serial_writer';

export interface HotbarLayoutState {
  // Frozen at join, serialized ONCE: the `hbl` self wire value (the v2 document
  // plus the desktop `forms` mirror for pre-profile clients) as JSON text, or
  // the text `null` when the character has never saved one (an explicit "seed
  // from local"). Self-scoped, never an entity/broadcast field; the heavy self
  // pass diffs the string against lastSent so it is sent exactly once and never
  // re-stringified, and a later client save never round-trips back here.
  initialHotbarLayoutJson: string;
  // Live: the stored document every save merges its ONE profile into, so a
  // touch save never clobbers the desktop arrangement (and vice versa).
  hotbarLayout: ActionBarLayoutProfiles | null;
}

/** Session state for a stored column value (untrusted at rest: re-validated
 *  here before it can wire out). Spread into the session at join and assigned
 *  again on a resume, whose auth handshake re-reads the row fresh. `live` is a
 *  document known to be at least as new as the row: a resume passes the
 *  session's own (this session is the character's only writer), a fresh join
 *  passes the store's still-pending document from the previous session, so a
 *  queued write that has not committed yet never regresses the merge base or
 *  the wire value. */
export function hotbarLayoutState(
  stored: unknown,
  live: ActionBarLayoutProfiles | null = null,
): HotbarLayoutState {
  const doc = live ?? sanitizeActionBarLayoutProfiles(stored);
  return {
    initialHotbarLayoutJson: JSON.stringify(doc ? actionBarLayoutWire(doc) : null),
    hotbarLayout: doc,
  };
}

/**
 * Merge one client save into the stored document. Returns the new document, or
 * null when the payload is dropped: a malformed/oversized layout, or a profile
 * name outside the known set. A save that names no profile comes from a
 * pre-profile client bundle and lands on the legacy (desktop) profile.
 */
export function mergeHotbarLayoutSave(
  current: ActionBarLayoutProfiles | null,
  msg: { profile?: unknown; layout?: unknown },
): ActionBarLayoutProfiles | null {
  const profile =
    msg.profile === undefined
      ? ACTION_BAR_LAYOUT_LEGACY_PROFILE
      : sanitizeActionBarLayoutProfile(msg.profile);
  if (profile === null) return null;
  const layout = sanitizeActionBarLayout(msg.layout);
  if (layout === null) return null;
  return withActionBarLayoutProfile(current, profile, layout);
}

export interface HotbarSession extends HotbarLayoutState {
  characterId: number;
  leaseNonce?: string;
}
interface PendingLayout {
  characterId: number;
  nonce?: string;
  doc: ActionBarLayoutProfiles;
  revision: number;
  nextWriteAt: number;
  timer?: ReturnType<typeof setTimeout>;
  running?: Promise<void>;
  controller: AbortController;
}
interface HotbarLayoutDeps {
  persist?: typeof setCharacterHotbarLayout;
  backgroundGate?: () => BackgroundDbGate | undefined;
  onLeaseLost?: (characterId: number, nonce?: string) => void;
  onError?: (error: unknown) => void;
}

/** Profile merges are coalesced per character and nonce. A trailing throttle
 * bounds continuous edits; transient failures retain the newest dirty document
 * for the next autosave, leave flush, or explicit retry. Only database execution
 * holds permits, never cooldown timers or the callers waiting for drainage. */
export class HotbarLayoutStore {
  private readonly queues = createKeyedSerialWriter<number>();
  private readonly writes = createBackgroundDbGate(2, 0);
  private readonly documents = new Map<number, PendingLayout>();
  private closing = false;
  private readonly cooldowns = new Map<
    number,
    { nonce?: string; until: number; timer: ReturnType<typeof setTimeout> }
  >();
  constructor(private readonly deps: HotbarLayoutDeps = {}) {}

  pending(characterId: number, nonce?: string): ActionBarLayoutProfiles | null {
    const entry = this.documents.get(characterId);
    return entry && entry.nonce === nonce ? entry.doc : null;
  }

  save(session: HotbarSession, msg: Record<string, unknown>): void {
    if (this.closing) return;
    const doc = mergeHotbarLayoutSave(session.hotbarLayout, msg);
    if (doc === null) return;
    session.hotbarLayout = doc;
    let entry = this.documents.get(session.characterId);
    if (entry && entry.nonce !== session.leaseNonce) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.controller.abort();
      entry = undefined;
    }
    if (!entry) {
      entry = {
        characterId: session.characterId,
        nonce: session.leaseNonce,
        doc,
        revision: 0,
        nextWriteAt:
          this.cooldowns.get(session.characterId)?.nonce === session.leaseNonce
            ? (this.cooldowns.get(session.characterId)?.until ?? 0)
            : 0,
        controller: new AbortController(),
      };
      this.documents.set(session.characterId, entry);
    }
    entry.doc = doc;
    entry.revision++;
    this.schedule(entry);
  }

  private current(entry: PendingLayout): boolean {
    return this.documents.get(entry.characterId) === entry;
  }

  private schedule(entry: PendingLayout, force = false): void {
    if (!this.current(entry) || entry.running) return;
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
    }
    const delay = entry.nextWriteAt - Date.now();
    if (!force && delay > 0) {
      if (!this.closing) {
        entry.timer = setTimeout(() => {
          entry.timer = undefined;
          this.schedule(entry);
        }, delay);
        entry.timer.unref?.();
      }
      return;
    }
    let succeeded = false;
    let attemptedRevision = entry.revision;
    const run = this.queues.enqueueCancellable(
      entry.characterId,
      entry.controller.signal,
      async () => {
        const local = await this.writes.acquire(entry.controller.signal);
        if (!local) return;
        try {
          const gate = this.deps.backgroundGate?.();
          const shared = gate ? await gate.acquire(entry.controller.signal) : undefined;
          if (gate && !shared) return;
          try {
            if (!this.current(entry)) return;
            const revision = entry.revision;
            attemptedRevision = revision;
            entry.nextWriteAt = Date.now() + 1000;
            const oldCooldown = this.cooldowns.get(entry.characterId);
            if (oldCooldown) clearTimeout(oldCooldown.timer);
            const cooldown = {
              nonce: entry.nonce,
              until: entry.nextWriteAt,
              timer: setTimeout(() => {
                if (this.cooldowns.get(entry.characterId) === cooldown)
                  this.cooldowns.delete(entry.characterId);
              }, 1000),
            };
            cooldown.timer.unref?.();
            this.cooldowns.set(entry.characterId, cooldown);
            const held = await (this.deps.persist ?? setCharacterHotbarLayout)(
              entry.characterId,
              entry.doc,
              entry.nonce,
            );
            if (!this.current(entry)) return;
            if (held === false) {
              this.documents.delete(entry.characterId);
              this.deps.onLeaseLost?.(entry.characterId, entry.nonce);
              return;
            }
            succeeded = true;
            if (entry.revision === revision) this.documents.delete(entry.characterId);
          } finally {
            shared?.release();
          }
        } finally {
          local.release();
        }
      },
    );
    entry.running = run.finally(() => {
      entry.running = undefined;
      if ((succeeded || entry.revision > attemptedRevision) && this.current(entry) && !this.closing)
        this.schedule(entry);
    });
    void entry.running.catch((error) => {
      if (error instanceof KeyedSerialWriteAborted) return;
      if (this.deps.onError) this.deps.onError(error);
      else console.error('failed to save hotbar layout:', error);
    });
  }

  async flush(session?: { characterId: number; leaseNonce?: string }): Promise<void> {
    const entries = session
      ? [this.documents.get(session.characterId)]
      : [...this.documents.values()];
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry || (session && entry.nonce !== session.leaseNonce)) return;
        while (this.current(entry)) {
          if (entry.timer) {
            clearTimeout(entry.timer);
            entry.timer = undefined;
          }
          if (!entry.running) this.schedule(entry, true);
          await entry.running;
        }
      }),
    );
  }

  async drain(): Promise<void> {
    this.closing = true;
    try {
      await this.flush();
    } finally {
      for (const cooldown of this.cooldowns.values()) clearTimeout(cooldown.timer);
      this.cooldowns.clear();
    }
  }
}
