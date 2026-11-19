// Implements `ui_pop_tutorial`, the guidance card (ux_and_onboarding.md 6.4, 17.2): a modal
// dialog when the moment is safe (the session pauses the world while it shows), a side card
// that does not pause otherwise. Title, up to three paragraphs, "知道了" and "此后不提示这类";
// at the brief level an "展开" shows what the first sentence held back. A modal card's focus enters the first button on
// open and goes back to where it was on close (18.7); Esc answers "知道了". Thin painter over
// ./card_model.ts; the DOM is written only when the card changes.

import './tutorial.css';
import { el, setText } from '../../shared_ui/dom';
import { type CardAnswer, type TutorialCard, tutorialCard } from './card_model';
import type { TutStep } from './steps';

/** The card on screen now, for the input layer's pad route (one card shows at a time). */
let live: TutorialCardPop | null = null;

/**
 * The card on screen and how it shows: 'modal' pauses the world and takes the pad (A or B
 * answers "知道了", Y "此后不提示这类", X expands), 'side' leaves the pad to the game.
 */
export function tutorialCardState(): 'modal' | 'side' | null {
  if (!live?.showing) return null;
  return live.modal ? 'modal' : 'side';
}

/** Answer the card on screen (or expand it); false when none shows. */
export function answerTutorialCard(a: CardAnswer | 'expand'): boolean {
  const c = live;
  if (!c?.showing) return false;
  c.press(a);
  return true;
}

interface OpenCard {
  step: TutStep;
  modal: boolean;
  brief: boolean;
  expanded: boolean;
  onAnswer: (answer: CardAnswer) => void;
  returnFocus: Element | null;
}

export class TutorialCardPop {
  readonly el: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly expandBtn: HTMLButtonElement;
  private readonly okBtn: HTMLButtonElement;
  private readonly muteBtn: HTMLButtonElement;
  private open: OpenCard | null = null;
  private sig = '';

  constructor(parent: HTMLElement) {
    this.titleEl = el('h3', { className: 'hk-tut-title', attrs: { id: 'hk-tut-title' } });
    this.bodyEl = el('div', { className: 'hk-tut-body' });
    this.expandBtn = el('button', {
      className: 'hk-btn hk-btn-small hk-tut-expand',
      attrs: { type: 'button' },
      on: { click: () => this.expand() },
    });
    this.okBtn = el('button', {
      className: 'hk-btn hk-tut-ok',
      attrs: { type: 'button' },
      on: { click: () => this.answer('ok') },
    });
    this.muteBtn = el('button', {
      className: 'hk-btn hk-btn-small hk-tut-mute',
      attrs: { type: 'button' },
      on: { click: () => this.answer('mute') },
    });
    this.el = el(
      'div',
      {
        className: 'hk-tut-card',
        attrs: { role: 'dialog', 'aria-labelledby': 'hk-tut-title' },
        on: {
          keydown: (e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              this.answer('ok');
              return;
            }
            // Enter and Space press the focused card button (the game would otherwise keep
            // them: the card is not a window, 18.5)
            const b = e.target;
            if ((e.key === 'Enter' || e.key === ' ') && b instanceof HTMLButtonElement) {
              e.preventDefault();
              e.stopPropagation();
              b.click();
            }
          },
        },
      },
      [
        this.titleEl,
        this.bodyEl,
        this.expandBtn,
        el('div', { className: 'hk-tut-buttons' }, [this.muteBtn, this.okBtn]),
      ],
    );
    this.el.hidden = true;
    parent.append(this.el);
  }

  /** A card is showing. */
  get showing(): boolean {
    return this.open !== null;
  }

  /** It pauses the world (the session reads this to hold the clock). */
  get modal(): boolean {
    return !!this.open?.modal;
  }

  get stepId(): string | null {
    return this.open?.step.id ?? null;
  }

  show(
    step: TutStep,
    opts: { modal: boolean; brief: boolean },
    onAnswer: (a: CardAnswer) => void,
  ): void {
    if (this.open) this.answer('ok');
    // only a modal card takes the focus (18.7); a side card leaves the player's input alone
    const active = opts.modal && typeof document !== 'undefined' ? document.activeElement : null;
    this.open = { step, ...opts, expanded: false, onAnswer, returnFocus: active };
    live = this;
    this.paint();
    this.el.hidden = false;
    if (opts.modal) this.okBtn.focus();
  }

  /** Repaint (the language or a key glyph changed). */
  refresh(): void {
    if (this.open) this.paint();
  }

  /** Close without an answer (the session ended, the step completed underneath it). */
  close(): void {
    const o = this.open;
    if (!o) return;
    this.open = null;
    if (live === this) live = null;
    this.el.hidden = true;
    this.sig = '';
    (o.returnFocus as HTMLElement | null)?.focus?.();
  }

  /** A pad or keyboard answer from outside the card's buttons (the input layer). */
  press(a: CardAnswer | 'expand'): void {
    if (a === 'expand') this.expand();
    else this.answer(a);
  }

  private expand(): void {
    if (!this.open) return;
    this.open.expanded = true;
    this.paint();
  }

  private answer(a: CardAnswer): void {
    const o = this.open;
    if (!o) return;
    this.close();
    o.onAnswer(a);
  }

  private paint(): void {
    const o = this.open;
    if (!o) return;
    const card: TutorialCard = tutorialCard({
      step: o.step,
      modal: o.modal,
      brief: o.brief,
      expanded: o.expanded,
    });
    const next = JSON.stringify(card);
    if (next === this.sig) return;
    this.sig = next;
    setText(this.titleEl, card.title);
    this.bodyEl.replaceChildren(
      ...card.paragraphs.map((p) => el('p', { className: 'hk-tut-para', text: p })),
    );
    setText(this.expandBtn, card.expand);
    this.expandBtn.hidden = !card.hidden;
    setText(this.okBtn, card.ok);
    setText(this.muteBtn, card.mute);
    this.el.setAttribute('aria-modal', String(card.modal));
    this.el.classList.toggle('side', !card.modal);
  }

  dispose(): void {
    this.close();
    this.el.remove();
  }
}
