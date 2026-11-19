// The save's client segment (ux_and_onboarding.md 4.1, 17.8; release_engineering.md 5): what
// the interface keeps with a run but the world never reads. The guidance level and the steps
// seen and done (the tutorial store), the quests and the door the tracker follows, and the
// player's notes on evidence (6.3.11 `annotate`), and which act-1 windows have opened (1.5,
// ../windows/window_unlocks.ts). It rides in the slot header's opaque
// `client` field (src/core/save/header.ts), so it is never part of the world, the replay log or
// the state hash, and a load restores it beside the world. Bounded: over the size cap the
// largest optional parts go first (the tracker's history, then the notes), so the guidance and
// the steps survive; only a segment still over the cap is not written. Pure; Node-tested.

import type { EvidenceNoteStore } from '../view/adapters';

/** Version of the segment's shape. */
export const CLIENT_SEGMENT_VERSION = 1;
/** A segment longer than this (JSON characters) is not written. */
export const CLIENT_SEGMENT_MAX_CHARS = 32_000;
/** A note on a piece of evidence (19.2: notes at most 40 characters). */
export const NOTE_MAX_CHARS = 40;
/** Notes kept per run (the act-1 evidence is a handful; the cap only bounds the record). */
export const NOTES_MAX = 200;

// a type alias (not an interface) so it is a plain JSON record to the kernel's opaque field
export type ClientSegment = {
  v: typeof CLIENT_SEGMENT_VERSION;
  /** the tutorial store's snapshot (src/client/tutorial/store.ts validates it) */
  tutorial?: unknown;
  /** the tracker's snapshot (../hud/tracker_model.ts validates it) */
  tracker?: unknown;
  /** notes on evidence by item id */
  notes?: Record<string, string>;
  /** the act-1 windows opened so far */
  unlocks?: string[];
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Field-checked notes: string values only, each cut to the note length, at most NOTES_MAX. */
export function parseNotes(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObj(raw)) return out;
  let n = 0;
  for (const [id, text] of Object.entries(raw)) {
    if (n >= NOTES_MAX) break;
    if (typeof text !== 'string' || !text || id.length > 64) continue;
    out[id] = [...text].slice(0, NOTE_MAX_CHARS).join('');
    n++;
  }
  return out;
}

/** A stored segment, or null when it is not one of this version (an older or newer shape). */
export function parseClientSegment(raw: unknown): ClientSegment | null {
  if (!isObj(raw) || raw.v !== CLIENT_SEGMENT_VERSION) return null;
  const out: ClientSegment = { v: CLIENT_SEGMENT_VERSION };
  if (raw.tutorial !== undefined) out.tutorial = raw.tutorial;
  if (raw.tracker !== undefined) out.tracker = raw.tracker;
  const notes = parseNotes(raw.notes);
  if (Object.keys(notes).length > 0) out.notes = notes;
  if (Array.isArray(raw.unlocks))
    out.unlocks = raw.unlocks.filter((x): x is string => typeof x === 'string').slice(0, 32);
  return out;
}

const fits = (seg: ClientSegment) => JSON.stringify(seg).length <= CLIENT_SEGMENT_MAX_CHARS;

/**
 * The segment to write. Over the cap the tracker goes first, then the notes; null only when
 * the rest (guidance, steps, openings) still does not fit.
 */
export function buildClientSegment(parts: {
  tutorial?: unknown;
  tracker?: unknown;
  notes?: Readonly<Record<string, string>>;
  unlocks?: readonly string[];
}): ClientSegment | null {
  const seg: ClientSegment = { v: CLIENT_SEGMENT_VERSION };
  if (parts.tutorial !== undefined) seg.tutorial = parts.tutorial;
  if (parts.unlocks && parts.unlocks.length > 0) seg.unlocks = [...parts.unlocks];
  if (parts.tracker !== undefined) seg.tracker = parts.tracker;
  const notes = parseNotes(parts.notes);
  if (Object.keys(notes).length > 0) seg.notes = notes;
  if (fits(seg)) return seg;
  delete seg.tracker;
  if (fits(seg)) return seg;
  delete seg.notes;
  return fits(seg) ? seg : null;
}

/** The evidence notes of the running session (the evidence window's store). */
export class EvidenceNotes implements EvidenceNoteStore {
  private notes: Record<string, string> = {};

  note(itemId: string): string {
    return this.notes[itemId] ?? '';
  }

  setNote(itemId: string, text: string): void {
    const clean = [...text.trim()].slice(0, NOTE_MAX_CHARS).join('');
    if (!clean) {
      delete this.notes[itemId];
      return;
    }
    if (!(itemId in this.notes) && Object.keys(this.notes).length >= NOTES_MAX) return;
    this.notes[itemId] = clean;
  }

  snapshot(): Record<string, string> {
    return { ...this.notes };
  }

  restore(raw: unknown): void {
    this.notes = parseNotes(raw);
  }
}
