// `TutorialStore` (ux_and_onboarding.md 17.8): the client's onboarding record. Per step,
// whether it has been shown and whether it is done; the guidance level (17.3); and the
// "此后不提示这类" muted categories. The per-step record and the guidance level travel with
// the save's client segment (`snapshot` and `restore`, never the world state, never the
// replay log); the muted categories hold across saves (17.3), so they live in one small
// record of their own over an injected key-value store. Every field read back is checked
// field by field: a damaged or foreign segment restores as empty, never throws. Pure.

import type { HintGuidance } from '../hud/hint_model';
import type { KeyValueStore } from '../hud/save_slots';
import { TUT_CATEGORIES, type TutCategory, type TutStep } from './steps';

/** The key of the cross-save muted-categories record. */
export const MUTED_KEY = 'hakoniwa.tutorial.muted';
/** Version of the client-segment payload. */
export const TUTORIAL_SNAPSHOT_VERSION = 1;

export const GUIDANCE: readonly HintGuidance[] = ['full', 'brief', 'off'];

/** What the save's client segment carries for the onboarding (17.8). */
export interface TutorialSnapshot {
  v: number;
  guidance: HintGuidance;
  /** shown at least once, sorted */
  seen: string[];
  /** completed, sorted */
  done: string[];
}

const STEP_ID = /^tut_[a-z0-9_]{1,60}$/;
const MAX_IDS = 512;

function isGuidance(v: unknown): v is HintGuidance {
  return typeof v === 'string' && (GUIDANCE as readonly string[]).includes(v);
}

function isCategory(v: unknown): v is TutCategory {
  return typeof v === 'string' && (TUT_CATEGORIES as readonly string[]).includes(v);
}

/** The ids of a list that look like step ids (ids of a newer build are kept as they are). */
function idList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const x of v) {
    if (typeof x === 'string' && STEP_ID.test(x)) out.add(x);
    if (out.size >= MAX_IDS) break;
  }
  return [...out].sort();
}

/** A client-segment payload checked field by field; null when it is not one. */
export function parseSnapshot(raw: unknown): TutorialSnapshot | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== TUTORIAL_SNAPSHOT_VERSION) return null;
  return {
    v: TUTORIAL_SNAPSHOT_VERSION,
    guidance: isGuidance(o.guidance) ? o.guidance : 'full',
    seen: idList(o.seen),
    done: idList(o.done),
  };
}

export interface TutorialStoreOptions {
  /** where the muted categories are kept (none: they last this session) */
  kv?: KeyValueStore | null;
  /** the level a new run starts with (the new game page) */
  guidance?: HintGuidance;
}

export class TutorialStore {
  private seenIds = new Set<string>();
  private doneIds = new Set<string>();
  private level: HintGuidance;
  private muted = new Set<TutCategory>();
  private readonly kv: KeyValueStore | null;

  constructor(opts: TutorialStoreOptions = {}) {
    this.kv = opts.kv ?? null;
    this.level = opts.guidance ?? 'full';
    this.loadMuted();
  }

  get guidance(): HintGuidance {
    return this.level;
  }

  setGuidance(level: HintGuidance): boolean {
    if (!isGuidance(level)) return false;
    this.level = level;
    return true;
  }

  isSeen(id: string): boolean {
    return this.seenIds.has(id);
  }

  isDone(id: string): boolean {
    return this.doneIds.has(id);
  }

  markSeen(id: string): void {
    if (STEP_ID.test(id)) this.seenIds.add(id);
  }

  /** A step completes once (17.4). */
  markDone(id: string): void {
    if (STEP_ID.test(id)) this.doneIds.add(id);
  }

  isMuted(category: TutCategory): boolean {
    return this.muted.has(category);
  }

  mutedCategories(): TutCategory[] {
    return TUT_CATEGORIES.filter((c) => this.muted.has(c));
  }

  mute(category: TutCategory): void {
    if (!isCategory(category) || this.muted.has(category)) return;
    this.muted.add(category);
    this.saveMuted();
  }

  unmute(category: TutCategory): void {
    if (!this.muted.delete(category)) return;
    this.saveMuted();
  }

  /** "重置引导记录" (4.5): every step may show again, and no category stays muted. */
  reset(): void {
    this.seenIds.clear();
    this.doneIds.clear();
    this.muted.clear();
    this.saveMuted();
  }

  /** Steps done out of the steps that count toward the progress (tut_p_reach does not). */
  progress(steps: readonly TutStep[]): { done: number; of: number } {
    const counted = steps.filter((s) => s.progress);
    return { done: counted.filter((s) => this.doneIds.has(s.id)).length, of: counted.length };
  }

  /**
   * The steps a loaded record had shown but not finished: the session marks them shown again
   * so their "seen" and timed completions can still end them (17.8).
   */
  pendingSeen(steps: readonly TutStep[]): string[] {
    return steps.filter((s) => this.seenIds.has(s.id) && !this.doneIds.has(s.id)).map((s) => s.id);
  }

  /** The save's client-segment payload (17.8). */
  snapshot(): TutorialSnapshot {
    return {
      v: TUTORIAL_SNAPSHOT_VERSION,
      guidance: this.level,
      seen: [...this.seenIds].sort(),
      done: [...this.doneIds].sort(),
    };
  }

  /**
   * Take a loaded save's payload. False (the record starts empty, the guidance level is
   * kept) when it is missing or not a payload this build reads.
   */
  restore(raw: unknown): boolean {
    const snap = parseSnapshot(raw);
    this.seenIds = new Set(snap?.seen ?? []);
    this.doneIds = new Set(snap?.done ?? []);
    if (snap) this.level = snap.guidance;
    return !!snap;
  }

  private loadMuted(): void {
    let text: string | null = null;
    try {
      text = this.kv?.getItem(MUTED_KEY) ?? null;
    } catch {
      text = null;
    }
    if (!text) return;
    try {
      const o = JSON.parse(text) as unknown;
      const list = (o as { muted?: unknown } | null)?.muted;
      if (Array.isArray(list)) for (const c of list) if (isCategory(c)) this.muted.add(c);
    } catch {
      // a damaged record reads as nothing muted
    }
  }

  private saveMuted(): void {
    try {
      this.kv?.setItem(MUTED_KEY, JSON.stringify({ v: 1, muted: this.mutedCategories() }));
    } catch {
      // storage refused: the categories stay muted for this session
    }
  }
}
