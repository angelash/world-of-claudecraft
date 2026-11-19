// The onboarding scheduler (ux_and_onboarding.md 17.3, 17.4): which asked-for step may show
// now, and as what.
//
// 17.4: a step with danger first, then the one about the action at hand, then a system
// introduction; at least 90 real seconds between two cards, and at most 2 cards the player
// did not ask for in any 10 minutes (a card from a window the player opened is exempt from
// both); while a cutscene, a theatre scene or a dialogue holds the screen nothing shows but
// what the step marks as belonging to that scene; in a fight only combat bars and glows; a
// card that found no moment within 10 minutes is dropped and waits for the next trigger.
// 17.3: the guidance level filters. Full shows everything; brief leaves out the bars of the
// basic operations and shows a card as its title and first line with an 展开; off shows
// nothing but still records the step, so the card reaches the help window (17.7).
// 17.2: a card pauses the world when it is safe, and is a side card that does not pause
// otherwise. The scheduler decides; the session applies it.
// Pure: the caller passes `now`.

import type { HintGuidance } from '../hud/hint_model';
import { ownMandatory, type TutMethod, type TutStep } from './steps';

/** At least this long between two cards (17.4). */
export const CARD_GAP_MS = 90_000;
/** The window the card budget counts over, and how many cards fit in it (17.4). */
export const CARD_WINDOW_MS = 600_000;
export const CARD_BUDGET = 2;
/** A step that found no moment within this long is dropped (17.4). */
export const STALE_MS = 600_000;

/**
 * What the client shows for a step now: every method the level and the moment allow, together
 * (the board's glow with its card). A step with a card shows only when the card may.
 */
export interface TutShow {
  step: TutStep;
  bar: boolean;
  glow: boolean;
  notify: boolean;
  /** the card, or null; `modal` pauses the world, `brief` shows title and first line */
  card: { modal: boolean; brief: boolean } | null;
}

export interface SchedulerContext {
  guidance: HintGuidance;
  /** a cutscene, a theatre scene or a dialogue holds the screen */
  held: boolean;
  /** the player is fighting */
  combat: boolean;
  /** hostiles are near or a scene runs: a card may not pause the world */
  unsafe: boolean;
  /**
   * A side card is open (a modal one stops the scheduler altogether): another card waits,
   * bars, glows and notifications still show.
   */
  cardOpen?: boolean;
  /** categories the player muted ("此后不提示这类"): only a step's mandatory part shows */
  muted?: ReadonlySet<string>;
}

/** One step waiting for its moment. */
interface Waiting {
  step: TutStep;
  at: number;
  /** the player opened the window themselves: exempt from the card pacing (17.4) */
  asked: boolean;
}

/** The basic operations brief leaves out of the bars (17.3). */
export const BASIC_STEPS: ReadonlySet<string> = new Set([
  'tut_p_move',
  'tut_p_camera',
  'tut_p_interact',
  'tut_a1_wake',
  'tut_a1_target',
  'tut_a1_loot',
]);

/** Whether the guidance level lets a method show at all (17.3). */
export function methodAllowed(method: TutMethod, guidance: HintGuidance, stepId: string): boolean {
  if (guidance === 'off') return false;
  if (guidance === 'brief') {
    if (method === 'drill') return false;
    if (method === 'bar') return !BASIC_STEPS.has(stepId);
  }
  return method !== 'narr' && method !== 'env' && method !== 'slow' && method !== 'drill';
}

const PRIORITY_RANK = { danger: 0, action: 1, system: 2 } as const;

/** The methods of a step the level and the moment allow (empty: nothing to show now). */
export function shownMethods(step: TutStep, ctx: SchedulerContext): Set<TutMethod> {
  const out = new Set<TutMethod>();
  // the step's mandatory part shows at every level, muted or not (17.3, 17.5 "可跳: 否")
  const must = ownMandatory(step);
  if (must) out.add(must);
  if (step.silent) return out;
  if (ctx.muted?.has(step.category)) return out;
  // in a fight only the combat bars and glows show (17.4)
  if (ctx.combat && step.category !== 'combat') return out;
  for (const m of ['card', 'notify', 'bar', 'glow'] as const) {
    if (!step.methods.includes(m)) continue;
    if (!methodAllowed(m, ctx.guidance, step.id)) continue;
    if (ctx.combat && (m === 'card' || m === 'notify')) continue;
    out.add(m);
  }
  return out;
}

export class TutorialScheduler {
  private waiting: Waiting[] = [];
  private lastCard = Number.NEGATIVE_INFINITY;
  private cardTimes: number[] = [];

  /** Ask for a step; it waits for its moment. `asked`: the player opened the window. */
  ask(step: TutStep, now: number, asked = false): void {
    if (this.waiting.some((w) => w.step.id === step.id)) return;
    this.waiting.push({ step, at: now, asked });
  }

  /** Drop a step that is waiting (it completed before it ever showed). */
  drop(id: string): void {
    this.waiting = this.waiting.filter((w) => w.step.id !== id);
  }

  pending(): readonly string[] {
    return this.waiting.map((w) => w.step.id);
  }

  /** Whether a card may show now (the 90 s gap and the 2-per-10-minutes budget, 17.4). */
  private cardAllowed(now: number, asked: boolean): boolean {
    if (asked) return true;
    if (now - this.lastCard < CARD_GAP_MS) return false;
    return this.cardTimes.filter((t) => now - t < CARD_WINDOW_MS).length < CARD_BUDGET;
  }

  /**
   * What to show now, or null. The caller marks the step seen and tells the store; a step
   * that is shown leaves the queue.
   */
  next(now: number, ctx: SchedulerContext): TutShow | null {
    // drop what waited too long (17.4): the next trigger asks again
    this.waiting = this.waiting.filter((w) => now - w.at < STALE_MS);
    const ready = this.waiting
      .filter((w) => (ctx.held ? !!w.step.duringScene : true))
      .sort(
        (a, b) => PRIORITY_RANK[a.step.priority] - PRIORITY_RANK[b.step.priority] || a.at - b.at,
      );
    for (const w of ready) {
      const methods = shownMethods(w.step, ctx);
      if (methods.size === 0) continue;
      // a step taught by a card waits for the card's moment rather than lose it: the pacing
      // (17.4) and an open side card hold it back
      const wantsCard =
        w.step.methods.includes('card') &&
        (methodAllowed('card', ctx.guidance, w.step.id) || ownMandatory(w.step) === 'card') &&
        !ctx.muted?.has(w.step.category);
      if (wantsCard) {
        if (!methods.has('card') || ctx.cardOpen || !this.cardAllowed(now, w.asked)) continue;
      }
      this.waiting = this.waiting.filter((x) => x.step.id !== w.step.id);
      let card: TutShow['card'] = null;
      if (methods.has('card')) {
        this.lastCard = now;
        if (!w.asked) this.cardTimes.push(now);
        this.cardTimes = this.cardTimes.filter((t) => now - t < CARD_WINDOW_MS);
        // 17.2: a card pauses the world when it is safe, else it is a side card
        card = { modal: !ctx.unsafe && !ctx.held, brief: ctx.guidance === 'brief' };
      }
      return {
        step: w.step,
        bar: methods.has('bar'),
        glow: methods.has('glow'),
        notify: methods.has('notify'),
        card,
      };
    }
    return null;
  }
}
