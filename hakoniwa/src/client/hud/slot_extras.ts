// Client-side extras of a save slot for `ui_scr_load` and `ui_win_saves` (ux_and_onboarding.md
// 3.5, 6.2.13): the 320x180 thumbnail and the difficulty the slot was saved at. The save header
// has no field for either yet (release_engineering.md 5.2 keeps thumbnails as
// `thumbs/<slotId>.png` beside the slots, 5.3 lists the summary fields), so this build keeps
// them in the page's key-value storage, one record per slot. A record names the run and the
// real save time of the header it belongs to: a slot overwritten elsewhere (another machine,
// the cloud) never shows a stale picture. Thumbnails over a size cap are dropped (the slot then
// shows the neutral placeholder). Pure over the injected store; Node-tested.

import { SLOT_IDS, type SlotId } from '../../core/save';
import type { KeyValueStore } from './save_slots';

/** Storage key prefix of a slot's extras. */
export const EXTRAS_PREFIX = 'hakoniwa.slot_extras.';
/** A thumbnail data URL longer than this is not kept (about 72 KB of JPEG). */
export const MAX_THUMB_CHARS = 96_000;
/** Thumbnail size (ux_and_onboarding.md 3.5). */
export const THUMB_W = 320;
export const THUMB_H = 180;

export const DIFFICULTIES = ['story', 'standard', 'hard', 'legend'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === 'string' && (DIFFICULTIES as readonly string[]).includes(v);
}

export interface SlotExtras {
  runId: string;
  /** the header's real save time (ISO string): together with runId the header identity */
  savedAt: string;
  /** `data:image/...` URL, absent until captured */
  thumb?: string;
  difficulty?: Difficulty;
}

const SLOT_SET: ReadonlySet<string> = new Set(SLOT_IDS);
const THUMB = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/** A stored record, checked field by field; null when it is not one. */
export function parseExtras(text: string | null): SlotExtras | null {
  if (!text) return null;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.runId !== 'string' || typeof o.savedAt !== 'string') return null;
  const out: SlotExtras = { runId: o.runId, savedAt: o.savedAt };
  if (typeof o.thumb === 'string' && o.thumb.length <= MAX_THUMB_CHARS && THUMB.test(o.thumb))
    out.thumb = o.thumb;
  if (isDifficulty(o.difficulty)) out.difficulty = o.difficulty;
  return out;
}

export class SlotExtrasStore {
  constructor(private readonly kv: KeyValueStore | null) {}

  /** The extras of a slot when they belong to this header (run and save time), else null. */
  get(slot: SlotId, header: { runId: string; savedAt: string }): SlotExtras | null {
    const rec = parseExtras(this.read(slot));
    if (!rec || rec.runId !== header.runId || rec.savedAt !== header.savedAt) return null;
    return rec;
  }

  /** Start the record of a fresh save (a new header): drops whatever the slot held before. */
  begin(slot: SlotId, rec: SlotExtras): void {
    const clean: SlotExtras = { runId: rec.runId, savedAt: rec.savedAt };
    if (rec.difficulty && isDifficulty(rec.difficulty)) clean.difficulty = rec.difficulty;
    this.write(slot, clean);
  }

  /**
   * Attach a thumbnail to the slot's record if it still describes this header. Answers
   * whether it was kept (false: stale header, malformed or too large).
   */
  setThumb(slot: SlotId, header: { runId: string; savedAt: string }, thumb: string): boolean {
    const rec = this.get(slot, header);
    if (!rec || thumb.length > MAX_THUMB_CHARS || !THUMB.test(thumb)) return false;
    return this.write(slot, { ...rec, thumb });
  }

  remove(slot: SlotId): void {
    try {
      this.kv?.removeItem(EXTRAS_PREFIX + slot);
    } catch {
      // Storage refused: the record goes stale and is ignored by its header identity.
    }
  }

  /** Drop records of slots that no longer hold a matching header. */
  prune(headers: ReadonlyMap<SlotId, { runId: string; savedAt: string }>): void {
    for (const slot of SLOT_IDS) {
      const raw = this.read(slot);
      if (raw === null) continue;
      const rec = parseExtras(raw);
      const h = headers.get(slot);
      if (!rec || !h || rec.runId !== h.runId || rec.savedAt !== h.savedAt) this.remove(slot);
    }
  }

  private read(slot: SlotId): string | null {
    if (!this.kv || !SLOT_SET.has(slot)) return null;
    try {
      return this.kv.getItem(EXTRAS_PREFIX + slot);
    } catch {
      return null;
    }
  }

  private write(slot: SlotId, rec: SlotExtras): boolean {
    if (!this.kv || !SLOT_SET.has(slot)) return false;
    try {
      this.kv.setItem(EXTRAS_PREFIX + slot, JSON.stringify(rec));
      return true;
    } catch {
      // Quota: keep the record without its picture rather than nothing at all.
      if (!rec.thumb) return false;
      try {
        const { thumb: _drop, ...rest } = rec;
        this.kv.setItem(EXTRAS_PREFIX + slot, JSON.stringify(rest));
      } catch {
        // nothing more to try
      }
      return false;
    }
  }
}
