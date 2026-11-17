// Implements the model of `ui_hud_hint` (ux_and_onboarding.md 17.2, the bar): the one-line hint bar
// bottom centre, a key glyph plus one sentence. One hint at a time (the next waits); a hint ends
// when its action is done or after 12 s, then fades. In combat only combat hints show; during
// cutscenes and dialogue hints only wait (17.4). The guidance level filters (17.3): off shows
// none, brief leaves out the basic-operation hints (move, camera, interact, select, pick up).
// Each hint id shows once per session; a waiting hint older than 10 minutes is dropped (17.4).
// Until the tutorial store keeps what was seen (17.8, PK-M1-23), "once" lasts one session.
// Also the first two prologue and act 1 triggers that need no tutorial store (17.5 tut_p_move,
// tut_p_interact). Pure; Node-tested. The painter is ./hint_bar.ts.

import type { KeyText } from '../../core/text';
import { tr } from '../../core/text';

export type HintCategory = 'basic' | 'system' | 'combat';
export type HintGuidance = 'full' | 'brief' | 'off';

export interface HintSpec {
  id: string;
  /** the sentence, usually with a {key:} glyph (at most 20 characters, 19.2) */
  text: KeyText;
  category: HintCategory;
}

/** A hint ends after this long even when its action is not done (17.2). */
export const HINT_MS = 12_000;
/** The fade after a hint ends (1.4: notifications slide in 160 ms; a fade reads calmer). */
export const HINT_FADE_MS = 400;
/** A hint that found no moment to show within this long is dropped (17.4). */
export const HINT_STALE_MS = 600_000;

export interface HintContext {
  guidance: HintGuidance;
  /** the player is fighting: only combat hints show */
  combat: boolean;
  /** a cutscene, theatre scene or dialogue is open: hints wait */
  held: boolean;
}

export interface HintFrame {
  hint: HintSpec | null;
  /** the hint has ended and is fading out */
  fading: boolean;
}

interface Current {
  spec: HintSpec;
  shownAt: number;
  endedAt: number | null;
}

/** Whether the guidance level lets a hint of this category show (17.3). */
export function hintAllowed(category: HintCategory, guidance: HintGuidance): boolean {
  if (guidance === 'off') return false;
  if (guidance === 'brief') return category !== 'basic';
  return true;
}

export class HintBar {
  private current: Current | null = null;
  private waiting: { spec: HintSpec; at: number }[] = [];
  private readonly seen = new Set<string>();
  private readonly done = new Set<string>();

  /**
   * Ask for a hint; false when it already showed (or finished) this session or the guidance
   * level leaves it out. A hint asked for while another shows waits its turn.
   */
  show(spec: HintSpec, now: number, guidance: HintGuidance): boolean {
    if (!hintAllowed(spec.category, guidance)) return false;
    if (this.seen.has(spec.id) || this.done.has(spec.id)) return false;
    if (this.current?.spec.id === spec.id || this.waiting.some((w) => w.spec.id === spec.id))
      return false;
    this.waiting.push({ spec, at: now });
    return true;
  }

  /** The hint's action is done: it ends now (or never shows when still waiting). */
  finish(id: string, now: number): void {
    this.done.add(id);
    this.waiting = this.waiting.filter((w) => w.spec.id !== id);
    if (this.current?.spec.id === id && this.current.endedAt === null) this.current.endedAt = now;
  }

  /** Whether a hint has finished or shown this session. */
  spent(id: string): boolean {
    return this.done.has(id) || this.seen.has(id);
  }

  frame(now: number, ctx: HintContext): HintFrame {
    const cur = this.current;
    if (cur) {
      if (cur.endedAt === null && now - cur.shownAt >= HINT_MS) cur.endedAt = now;
      if (cur.endedAt !== null && now - cur.endedAt >= HINT_FADE_MS) this.current = null;
    }
    this.waiting = this.waiting.filter(
      (w) => now - w.at < HINT_STALE_MS && hintAllowed(w.spec.category, ctx.guidance),
    );
    if (!this.current && !ctx.held) {
      const i = this.waiting.findIndex((w) => !ctx.combat || w.spec.category === 'combat');
      const next = i >= 0 ? this.waiting[i] : undefined;
      if (next) {
        this.waiting.splice(i, 1);
        this.seen.add(next.spec.id);
        this.current = { spec: next.spec, shownAt: now, endedAt: null };
      }
    }
    const c = this.current;
    if (!c || ctx.held || !hintAllowed(c.spec.category, ctx.guidance)) {
      return { hint: null, fading: false };
    }
    // a non-combat hint already showing steps aside while a fight lasts
    if (ctx.combat && c.spec.category !== 'combat') return { hint: null, fading: false };
    return { hint: c.spec, fading: c.endedAt !== null };
  }
}

// ---------------------------------------------------------------------------
// First prologue and act 1 hints (17.5), without the tutorial store

/** Acts the first-step hints belong to (17.5: the prologue and act 1 rows). */
export const EARLY_ACTS: ReadonlySet<string> = new Set(['prologue', 'act1']);
/** No movement for this long after the player can move: the move hint (tut_p_move). */
export const MOVE_IDLE_MS = 2000;
/** Moving this far (map units, metres) finishes the move hint (tut_p_move). */
export const MOVE_DONE = 3;

export const HINT_MOVE: HintSpec = {
  id: 'move',
  text: tr('ui.hud.hint.move'),
  category: 'basic',
};

export const HINT_TALK: HintSpec = {
  id: 'talk',
  text: tr('ui.hud.hint.talk'),
  category: 'basic',
};

export interface HintTriggerInput {
  now: number;
  /** the act flag ('prologue', 'act1', ...) */
  act: string;
  /** the player's position, null while there is none */
  pos: { x: number; y: number } | null;
  /** a scene or a dialogue holds the player */
  held: boolean;
  /** someone the player could talk to is near */
  talkableNear: boolean;
  /** a conversation is open */
  talking: boolean;
}

/** The two first-step triggers; each answers the hints to ask for and the ids now done. */
export class HintTriggers {
  private origin: { x: number; y: number; at: number } | null = null;

  update(i: HintTriggerInput): { ask: HintSpec[]; done: string[] } {
    const ask: HintSpec[] = [];
    const done: string[] = [];
    if (!EARLY_ACTS.has(i.act) || !i.pos) return { ask, done };
    if (i.held) {
      // the clock for "has not moved" starts when the player can move
      if (this.origin) this.origin.at = i.now;
      return { ask, done };
    }
    if (!this.origin) this.origin = { x: i.pos.x, y: i.pos.y, at: i.now };
    const moved = Math.hypot(i.pos.x - this.origin.x, i.pos.y - this.origin.y);
    if (moved >= MOVE_DONE) done.push(HINT_MOVE.id);
    else if (moved < 0.5 && i.now - this.origin.at >= MOVE_IDLE_MS) ask.push(HINT_MOVE);
    if (i.talking) done.push(HINT_TALK.id);
    else if (i.talkableNear) ask.push(HINT_TALK);
    return { ask, done };
  }
}
