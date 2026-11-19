// Evaluating the onboarding catalogue against the running world (ux_and_onboarding.md 17.5
// triggers and completions, 17.8 "the triggers read the view's flags and the event stream").
// A frame gives the flags as they are, the events of this step, the client signals that are
// true right now, which windows are open and whether a fight or a scene holds the player; the
// answer is which steps to ask for and which are done. A step fires once: the store keeps
// what has been seen and done. Pure: the caller passes `now`, so Node tests drive it.

import type { AnyWorldEvent, FlagValue } from '../../core/contracts';
import { TUT_STEPS } from './catalog';
import {
  type EventCond,
  type EventWhere,
  PLAYER,
  type TutCond,
  type TutCondOp,
  type TutSignal,
  type TutStep,
  type TutWindow,
} from './steps';
import type { TutorialStore } from './store';

export interface TutFrame {
  now: number;
  /** the act flag ('prologue', 'act1', ...) */
  act: string;
  flags: Readonly<Record<string, FlagValue>>;
  /** the events of this step (the session passes what the engine just emitted) */
  newEvents: readonly AnyWorldEvent[];
  /** the signals that hold right now */
  signals: ReadonlySet<TutSignal>;
  openWindows: ReadonlySet<TutWindow>;
  combat: boolean;
  /** a cutscene, a theatre scene or a dialogue holds the screen */
  held: boolean;
  /** the player's entity id: an event field compared with `PLAYER` reads this */
  playerId: string;
  /** what an item id is (the `item_kind` and `equippable` tests); absent: those never hold */
  item?: (itemId: string) => TutItemInfo | undefined;
}

/** The two facts the onboarding asks about an item (from `GameView.itemDef`). */
export interface TutItemInfo {
  kind: string;
  /** it has an equipment slot */
  equippable: boolean;
}

export interface TutEvaluation {
  /** steps whose trigger fired now and that have neither shown nor completed */
  ask: TutStep[];
  /** steps whose completion fired now */
  done: string[];
}

/** A comparison; `PLAYER` on the right reads the frame's player id. */
export function compare(
  op: TutCondOp,
  left: unknown,
  right: FlagValue | undefined,
  frame?: Pick<TutFrame, 'playerId' | 'item'>,
): boolean {
  const r = right === PLAYER ? frame?.playerId : right;
  if (op === 'truthy') return left !== undefined && left !== false && left !== 0 && left !== '';
  if (op === 'falsy') return left === undefined || left === false || left === 0 || left === '';
  if (op === 'eq') return left === r;
  if (op === 'ne') return left !== r;
  if (op === 'prefix')
    return typeof left === 'string' && typeof r === 'string' && left.startsWith(r);
  if (op === 'suffix') return typeof left === 'string' && typeof r === 'string' && left.endsWith(r);
  if (op === 'item_kind')
    return typeof left === 'string' && frame?.item?.(left)?.kind === r && r !== undefined;
  if (op === 'equippable') return typeof left === 'string' && !!frame?.item?.(left)?.equippable;
  const a = typeof left === 'number' ? left : Number(left);
  const b = typeof r === 'number' ? r : Number(r);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (op === 'gte') return a >= b;
  if (op === 'gt') return a > b;
  if (op === 'lte') return a <= b;
  return a < b;
}

function whereHolds(ev: AnyWorldEvent, where: readonly EventWhere[], frame: TutFrame): boolean {
  const data = ev.data as Record<string, unknown>;
  return where.every((w) => compare(w.op, data[w.field], w.value, frame));
}

function eventsMatching(frame: TutFrame, cond: EventCond): AnyWorldEvent[] {
  return frame.newEvents.filter(
    (e) => e.kind === cond.event && (!cond.where || whereHolds(e, cond.where, frame)),
  );
}

/** Per-step bookkeeping a condition needs across frames (timers and counts). */
interface Bookkeeping {
  /** when a `timer` condition's signal was first seen, per condition key */
  since: Map<string, number>;
  /** how many matching events a `count` condition has seen, per condition key */
  counts: Map<string, number>;
  /** when the step was shown (the `seen` and `elapsed` completions) */
  shownAt: Map<string, number>;
}

function condKey(stepId: string, cond: TutCond, slot: string): string {
  return `${stepId}|${slot}|${JSON.stringify(cond)}`;
}

export class TutorialTriggers {
  private readonly book: Bookkeeping = {
    since: new Map(),
    counts: new Map(),
    shownAt: new Map(),
  };

  constructor(private readonly steps: readonly TutStep[] = TUT_STEPS) {}

  /** The step has been shown: its `seen` and `elapsed` completions start counting. */
  markShown(id: string, now: number): void {
    if (!this.book.shownAt.has(id)) this.book.shownAt.set(id, now);
  }

  /** Whether a condition holds on this frame. */
  private holds(step: TutStep, cond: TutCond, frame: TutFrame, slot: string): boolean {
    switch (cond.kind) {
      case 'flag':
        return compare(cond.op, frame.flags[cond.flag], cond.value, frame);
      case 'event':
        return eventsMatching(frame, cond).length > 0;
      case 'signal':
        return frame.signals.has(cond.signal);
      case 'window':
        return frame.openWindows.has(cond.win);
      case 'timer': {
        const key = condKey(step.id, cond, slot);
        if (cond.until && frame.signals.has(cond.until)) {
          this.book.since.delete(key);
          return false;
        }
        if (!frame.signals.has(cond.signal)) {
          this.book.since.delete(key);
          return false;
        }
        const since = this.book.since.get(key);
        if (since === undefined) {
          this.book.since.set(key, frame.now);
          return cond.ms <= 0;
        }
        return frame.now - since >= cond.ms;
      }
      case 'count': {
        const key = condKey(step.id, cond, slot);
        const seen = (this.book.counts.get(key) ?? 0) + eventsMatching(frame, cond.event).length;
        this.book.counts.set(key, seen);
        return seen >= cond.n;
      }
      case 'seen':
        return this.book.shownAt.has(step.id);
      case 'elapsed': {
        const at = this.book.shownAt.get(step.id);
        return at !== undefined && frame.now - at >= cond.ms;
      }
      case 'story':
        // the story or the written content teaches it: nothing in the client ends it
        return false;
      case 'any':
        return cond.of.some((c, i) => this.holds(step, c, frame, `${slot}.${i}`));
      default:
        return false;
    }
  }

  /** Whether a step's act is the act the world is in ('any' runs in every act). */
  private inAct(step: TutStep, act: string): boolean {
    if (step.act === 'any') return true;
    if (step.act === 'p') return act === 'prologue';
    return act === 'act1';
  }

  /** Evaluate the catalogue: what to ask for and what is done. */
  update(frame: TutFrame, store: TutorialStore): TutEvaluation {
    const ask: TutStep[] = [];
    const done: string[] = [];
    for (const step of this.steps) {
      if (store.isDone(step.id)) continue;
      // a window the player opened completes the step whatever its own completion says
      if (step.windowOnOpen && frame.openWindows.has(step.windowOnOpen)) {
        done.push(step.id);
        continue;
      }
      const shown = this.book.shownAt.has(step.id) || store.isSeen(step.id);
      if (shown && this.holds(step, step.done, frame, 'done')) {
        done.push(step.id);
        continue;
      }
      if (shown) continue;
      if (!this.inAct(step, frame.act)) continue;
      if (step.requires && !store.isDone(step.requires)) continue;
      // a step whose completion already holds before it ever showed is spent silently
      if (this.holds(step, step.trigger, frame, 'trigger')) ask.push(step);
    }
    return { ask, done };
  }
}
