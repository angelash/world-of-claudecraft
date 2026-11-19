// The onboarding at run time (ux_and_onboarding.md 17): the one object the game session owns.
// Each HUD refresh it evaluates the catalogue (./triggers.ts), records what fired and what
// completed in the store (./store.ts), lets the scheduler (./scheduler.ts) pick what may show,
// and hands it to the presenters: bars to the committed hint bar (`HintBarView.show`, the API
// its header reserves for the catalogue), outlines to the glow painter, cards to the card
// popup, notifications back to the session. A step the level turns off or the player muted
// is still recorded as seen, so its card reaches the help window (17.3, 17.7); its mandatory
// part (17.5 "可跳: 否") shows anyway. The world is paused while a modal card shows (17.2):
// the session reads `holdsWorld`; a side card pauses nothing, takes no focus and lets danger
// bars and glows through. The session forwards only the events in `TUT_EVENT_KINDS`.

import type { AnyWorldEvent, FlagValue } from '../../core/contracts';
import { type KeyText, tr } from '../../core/text';
import { t } from '../../shared_ui/i18n';
import type { HintCategory, HintContext, HintGuidance } from '../hud/hint_model';
import type { KeyValueStore } from '../hud/save_slots';
import type { HelpSource } from '../windows/help_model';
import { TutorialCardPop } from './card_pop';
import { stepById, TUT_STEPS } from './catalog';
import { GlowPainter } from './glow';
import { BASIC_STEPS, TutorialScheduler } from './scheduler';
import {
  barIdOf,
  endsWhenSeen,
  keyBase,
  ownMandatory,
  type TutSignal,
  type TutStep,
  type TutWindow,
  windowsOf,
} from './steps';
import { TutorialStore } from './store';
import { type TutFrame, type TutItemInfo, TutorialTriggers } from './triggers';

/** The hint bar as the onboarding uses it (structurally `HintBarView`, ../hud/hint_bar.ts). */
export interface TutorialBarHost {
  show(
    id: string,
    text: KeyText,
    opts: { category?: HintCategory; guidance: HintGuidance; now: number },
  ): boolean;
  readonly bar: { finish(id: string, now: number): void };
}

export interface TutorialDeps {
  /** the HUD root: the card popup mounts here and the glow finds its `data-hud` targets */
  root: HTMLElement;
  bar: TutorialBarHost;
  /** show a notification line (the 通知 method; the session picks the HUD notification) */
  notify(text: string, stepId: string): void;
  /** where the cross-save muted categories are kept (none: this session only) */
  kv?: KeyValueStore | null;
  /** the guidance level a new run starts with */
  guidance?: HintGuidance;
}

/** One HUD refresh's view of the world for the onboarding. */
export interface TutorialInput {
  /** the act flag ('prologue', 'act1', ...) */
  act: string;
  flags: Readonly<Record<string, FlagValue>>;
  /** the engine's events since the last call */
  newEvents: readonly AnyWorldEvent[];
  /** the level signals true right now (see TUT_SIGNALS) */
  signals: ReadonlySet<TutSignal>;
  openWindows: ReadonlySet<TutWindow>;
  combat: boolean;
  /** a cutscene, a theatre scene or a dialogue holds the screen */
  held: boolean;
  /** hostiles near: a card may not pause the world (17.2) */
  danger: boolean;
  /** the player's position and map, for the move and stand-still timers (null: none) */
  pos: { x: number; y: number; mapId: string } | null;
  /** reduce flashing (18.8): the glow is a static outline */
  reduceFlashing: boolean;
  /** the player's entity id (events filtered to the player compare against it) */
  playerId: string;
  /** what an item id is, for the "evidence gained" and "wearable gained" steps */
  item?: (itemId: string) => TutItemInfo | undefined;
}

/** Moving this far from where the player could first move counts as moving (17.5 tut_p_move). */
const MOVE_DONE = 3;

function hintCategory(step: TutStep): HintCategory {
  if (BASIC_STEPS.has(step.id)) return 'basic';
  return step.category === 'combat' ? 'combat' : 'system';
}

export class TutorialSession {
  readonly store: TutorialStore;
  private readonly scheduler = new TutorialScheduler();
  private triggers = new TutorialTriggers(TUT_STEPS);
  private readonly card: TutorialCardPop;
  private readonly glow: GlowPainter;
  /** one-frame signals the session fired since the last refresh */
  private pulses = new Set<TutSignal>();
  /** windows opened since the last refresh (they complete steps, 17.5) */
  private opened = new Set<TutWindow>();
  /** bars asked and not yet finished, by step id */
  private bars = new Set<string>();
  private origin: { x: number; y: number; mapId: string } | null = null;
  private moved = false;
  /** steps a loaded save had shown but not finished: shown again from the next refresh */
  private restoredSeen: string[] = [];

  constructor(private readonly deps: TutorialDeps) {
    this.store = new TutorialStore({ kv: deps.kv ?? null, guidance: deps.guidance });
    this.card = new TutorialCardPop(deps.root);
    this.glow = new GlowPainter(deps.root);
  }

  get guidance(): HintGuidance {
    return this.store.guidance;
  }

  setGuidance(level: HintGuidance): void {
    this.store.setGuidance(level);
  }

  /** A modal card shows: the world stands still (17.2). */
  holdsWorld(): boolean {
    return this.card.showing && this.card.modal;
  }

  /** A one-off client signal (the menu opened, a key choice made, ...): read on the next refresh. */
  signal(name: TutSignal): void {
    this.pulses.add(name);
  }

  /** The player opened a window: steps it completes end, cards it asks for skip the pacing. */
  onWindowOpened(id: TutWindow): void {
    this.opened.add(id);
  }

  /**
   * The hint bar's context with the scene hold lifted while one of the onboarding's own
   * in-scene bars waits or shows (the quarrel's three distances, the fall).
   */
  hintContext(base: HintContext): HintContext {
    if (!base.held) return base;
    for (const id of this.bars) {
      if (stepById(id)?.duringScene) return { ...base, held: false };
    }
    return base;
  }

  /** The HUD refresh. */
  frame(now: number, input: TutorialInput): void {
    // a loaded save's steps that showed but did not finish count as shown from now (17.8)
    for (const id of this.restoredSeen) this.triggers.markShown(id, now);
    this.restoredSeen = [];
    const signals = new Set<TutSignal>([...input.signals, ...this.pulses]);
    this.trackMovement(input, signals);
    const openWindows = new Set<TutWindow>([...input.openWindows, ...this.opened]);
    const frame: TutFrame = {
      now,
      act: input.act,
      flags: input.flags,
      newEvents: input.newEvents,
      signals,
      openWindows,
      combat: input.combat,
      held: input.held,
      playerId: input.playerId,
    };
    if (input.item) frame.item = input.item;
    const r = this.triggers.update(frame, this.store);
    this.pulses = new Set();
    const fresh = this.opened;
    this.opened = new Set();
    for (const id of r.done) this.complete(id, now);
    const level = this.store.guidance;
    for (const step of r.ask) {
      const quiet = level === 'off' || this.store.isMuted(step.category) || !!step.silent;
      if (quiet && !ownMandatory(step)) {
        // recorded for the help window, never shown (17.3)
        this.recordShown(step, now);
        continue;
      }
      // a card the player asked for by opening its window skips the card pacing (17.4)
      const byWindow = windowsOf(step.trigger).some((w) => fresh.has(w));
      this.scheduler.ask(step, now, byWindow);
    }
    // only a modal card stops the rest; beside a side card danger bars and glows still show
    const show =
      this.card.showing && this.card.modal
        ? null
        : this.scheduler.next(now, {
            guidance: level,
            held: input.held,
            combat: input.combat,
            unsafe: input.danger || input.combat || input.held,
            cardOpen: this.card.showing,
            muted: new Set(this.store.mutedCategories()),
          });
    if (show) this.present(show.step, show, now, input.reduceFlashing);
    this.glow.frame(now);
  }

  private present(
    step: TutStep,
    show: {
      bar: boolean;
      glow: boolean;
      notify: boolean;
      card: { modal: boolean; brief: boolean } | null;
    },
    now: number,
    reduceFlashing: boolean,
  ): void {
    this.recordShown(step, now);
    const level = this.store.guidance;
    if (show.bar) {
      const key = step.barKey ?? `${keyBase(step.id)}.bar`;
      if (
        this.deps.bar.show(barIdOf(step), tr(key), {
          category: hintCategory(step),
          guidance: level,
          now,
        })
      )
        this.bars.add(step.id);
    }
    if (show.glow && step.glowTarget) this.glow.start(step.glowTarget, now, reduceFlashing);
    if (show.notify) this.deps.notify(t(`${keyBase(step.id)}.notify`), step.id);
    if (show.card) {
      this.card.show(step, show.card, (answer) => {
        if (answer === 'mute') this.store.mute(step.category);
      });
    }
  }

  private recordShown(step: TutStep, now: number): void {
    this.store.markSeen(step.id);
    this.triggers.markShown(step.id, now);
  }

  private complete(id: string, now: number): void {
    this.store.markDone(id);
    this.scheduler.drop(id);
    const step = stepById(id);
    // a card the step showed stays until the player answers it; a bar whose step ends on being
    // seen runs its own 12 s (finishing it now would cut it short, or drop it unshown)
    if (step && this.bars.delete(id) && !endsWhenSeen(step))
      this.deps.bar.bar.finish(barIdOf(step), now);
  }

  /** The move and stand-still signals from the player's position (17.5 move, wake). */
  private trackMovement(input: TutorialInput, signals: Set<TutSignal>): void {
    const p = input.pos;
    if (!p || input.held) {
      this.origin = null;
      this.moved = false;
      return;
    }
    if (!this.origin || this.origin.mapId !== p.mapId) {
      this.origin = { ...p };
      this.moved = false;
    }
    if (!this.moved && Math.hypot(p.x - this.origin.x, p.y - this.origin.y) >= MOVE_DONE)
      this.moved = true;
    signals.add('can_move');
    if (this.moved) signals.add('moved');
  }

  /** The save's client-segment payload (17.8). */
  snapshot(): unknown {
    return this.store.snapshot();
  }

  /** A loaded save's payload; the run's records start over (fresh timers and counts). */
  restore(raw: unknown): boolean {
    this.triggers = new TutorialTriggers(TUT_STEPS);
    this.card.close();
    this.bars.clear();
    const ok = this.store.restore(raw);
    this.restoredSeen = this.store.pendingSeen(TUT_STEPS);
    return ok;
  }

  /** The cards the help window lists (17.7): every card step that has shown. */
  seenCards(): TutStep[] {
    return TUT_STEPS.filter((s) => s.methods.includes('card') && this.store.isSeen(s.id));
  }

  /** What the help window's card and glossary pages read (17.7). */
  helpSource(flags: () => Readonly<Record<string, FlagValue>>): HelpSource {
    return {
      flags,
      stepSeen: (id) => this.store.isSeen(id),
      seenCards: () => this.seenCards(),
      progress: () => this.store.progress(TUT_STEPS),
    };
  }

  dispose(): void {
    this.card.dispose();
    this.glow.dispose();
  }
}
