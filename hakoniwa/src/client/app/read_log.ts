// The global read table and the fast-forward of read text (ux_and_onboarding.md 8.2, 8.3:
// every line already read may be run past; a line not read yet stops the fast-forward, and so
// does a choice, free input or an anchor). The table is client data like the tutorial store
// (17.8): it is kept per install, not per save, so a second run through the prologue skips
// what was read in the first; it never enters the world, the replay log or the determinism.
//
// A line's id is stable and short: a scene line is `s|<sceneId>|<nodeId>|<n>` (its written
// index in the node, so an improvised line of the same node reads as unread), a conversation
// or loose line `d|<speakerId>|<hash of the text>` (the text itself is not kept: the table
// stays small and holds no model text). At most READ_LOG_LIMIT ids are kept; when it is full
// the oldest quarter goes, so a long run never grows the record without bound and the lines
// read most recently survive. Pure over the injected store; Node-tested.

/** The page key the table lives under. */
export const READ_LOG_KEY = 'hakoniwa.read_log';
/** At most this many line ids are kept. */
export const READ_LOG_LIMIT = 20_000;
/** When the table is full, this share of the oldest ids goes. */
export const READ_LOG_EVICT = 0.25;

/** The store the table is kept in (the page's key-value storage; save_slots.ts KeyValueStore). */
export interface ReadLogStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 32-bit FNV-1a of a text, as hex: a line's short stand-in (no model text is kept). */
export function textDigest(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** The id of a scene line: its scene, node and written index (an improvised line has none). */
export function sceneLineId(
  sceneId: string,
  nodeId: string,
  line: number | undefined,
): string | null {
  if (!sceneId || !nodeId || line === undefined || !Number.isInteger(line) || line < 0) return null;
  return `s|${sceneId}|${nodeId}|${line}`;
}

/** The id of a conversation or loose line: its speaker and the digest of its text. */
export function talkLineId(speakerId: string, text: string): string | null {
  if (!text) return null;
  return `d|${speakerId}|${textDigest(text)}`;
}

export class ReadLog {
  /** insertion order: the oldest ids first (the eviction order) */
  private ids: string[] = [];
  private seen = new Set<string>();
  private dirty = false;

  constructor(private readonly store: ReadLogStore | null) {
    try {
      const raw = store?.getItem(READ_LOG_KEY);
      const list = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(list)) {
        for (const id of list) {
          if (typeof id !== 'string' || this.seen.has(id)) continue;
          this.ids.push(id);
          this.seen.add(id);
        }
      }
    } catch {
      // a damaged table starts empty: nothing is lost but the fast-forward
    }
    if (this.ids.length > READ_LOG_LIMIT) {
      this.ids = this.ids.slice(this.ids.length - READ_LOG_LIMIT);
      this.seen = new Set(this.ids);
      this.dirty = true;
    }
  }

  /** How many line ids the table holds. */
  get size(): number {
    return this.ids.length;
  }

  /** Whether this line was read before (an id of null, an unknown line, reads as unread). */
  isRead(id: string | null): boolean {
    return !!id && this.seen.has(id);
  }

  /** Record a line as read; false when it was already in the table (or has no id). */
  mark(id: string | null): boolean {
    if (!id || this.seen.has(id)) return false;
    this.ids.push(id);
    this.seen.add(id);
    if (this.ids.length > READ_LOG_LIMIT) {
      const drop = Math.max(1, Math.floor(READ_LOG_LIMIT * READ_LOG_EVICT));
      this.ids = this.ids.slice(drop);
      this.seen = new Set(this.ids);
    }
    this.dirty = true;
    return true;
  }

  /** Write the table out when it changed (the session calls it on a cadence and on exit). */
  flush(): void {
    if (!this.dirty || !this.store) return;
    this.dirty = false;
    try {
      this.store.setItem(READ_LOG_KEY, JSON.stringify(this.ids));
    } catch {
      // storage full or refused: the table stays in memory for this session
    }
  }

  /** Forget everything (the gameplay page's "reset the guidance record" neighbour). */
  clear(): void {
    if (this.ids.length === 0) return;
    this.ids = [];
    this.seen.clear();
    this.dirty = true;
  }
}

/**
 * The fast-forward presses at most once per this many milliseconds (8.2): fast, yet every
 * read line still flashes by, so a player can let go where they want to stop.
 */
export const SKIP_READ_STEP_MS = 50;

/** What the fast-forward looks at on the line in front of the player. */
export interface SkipReadInput {
  /** the skip-read key or button is down now (`dialogue.skip_read`) */
  held: boolean;
  /** the id of the line now showing, null when it has none (an improvised line) */
  lineId: string | null;
  /** the player must answer or act here: a choice, free input, the court, a letter */
  waitsForPlayer: boolean;
  /** the node is an anchor (8.3: skipping stops at anchors, they must be seen) */
  anchor: boolean;
  /** a model reply is still coming: nothing is read yet */
  pending?: boolean;
}

/**
 * Whether the fast-forward may run past the line in front of the player (8.2): only while its
 * key is held, only over a line read before, and never past a point the player must answer, an
 * anchor, or a line still being generated.
 */
export function skipAllowed(i: SkipReadInput): boolean {
  if (!i.held || i.waitsForPlayer || i.anchor || i.pending) return false;
  return !!i.lineId;
}

/** `skipAllowed` with the table doing the "read before" part. */
export function skipReadAllowed(
  log: ReadLog,
  i: Omit<SkipReadInput, 'lineId'> & {
    lineId: string | null;
  },
): boolean {
  return skipAllowed(i) && log.isRead(i.lineId);
}
