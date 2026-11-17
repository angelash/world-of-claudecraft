// Implements `ui_mode_cutscene` (ux_and_onboarding.md 8; catalog_cutscenes.md 13): the
// cutscene player in its three presentations. Theater: the world dimmed under a full-screen
// card (lines, numbered choices, free input, court evidence). Staged: letterbox bars at 2:1
// over the world and the lines as subtitles. Illustration: a full-screen still (a dark
// vignette when the still is missing) with captions. Busts stand above the text, the speaker
// lit; the letter step shows a letter on paper; a fade covers the picture; a shake moves it
// once. The toolbar holds auto, hide text, backlog and skip. Irreversible choices ask first
// (`ui_pop_confirm`). Writes are elided. Thin painter over cutscene_model.ts.

import { clear, el, setClass, setText } from '../../../shared_ui/dom';
import { t } from '../../../shared_ui/i18n';
import { installedResolver } from '../../assets/runtime';
import { askConfirm } from '../confirm_pop';
import type { CutsceneModel } from './cutscene_model';
import { aiBadge } from './dialogue_panel';
import type { StoryHandlers } from './handlers';
import { resolvePortrait } from './portrait_plan';
import { type CropSource, PortraitView } from './portrait_view';

const BUST_BOX = { w: 256, h: 384 };
/** A signature no model produces: the next render paints every part (first paint, reset). */
const UNPAINTED = '<unpainted>';
/** A sent answer the node did not take (refused) gets its input row back after this long. */
const RETRY_MS = 1500;

export class CutscenePlayer {
  readonly el: HTMLElement;
  private readonly still = el('div', { className: 'hk-cut-still' });
  private readonly busts = el('div', { className: 'hk-cut-busts' });
  private readonly left: PortraitView;
  private readonly right: PortraitView;
  private readonly captions = el('div', { className: 'hk-cut-captions' });
  private readonly title = el('div', { className: 'hk-cut-title' });
  private readonly lines = el('div', { className: 'hk-cut-lines' });
  private readonly court = el('div', { className: 'hk-cut-court' });
  private readonly prompt = el('div', { className: 'hk-cut-prompt' });
  private readonly choices = el('div', { className: 'hk-cut-choices' });
  private readonly inputRow: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly submitBtn: HTMLButtonElement;
  private readonly queued = el('div', { className: 'hk-cut-queued' });
  private readonly hint = el('div', { className: 'hk-cut-hint' });
  private readonly autoBtn: HTMLButtonElement;
  private readonly hideBtn: HTMLButtonElement;
  private readonly backlogBtn: HTMLButtonElement;
  private readonly skipBtn: HTMLButtonElement;
  private readonly skipFill = el('span', { className: 'hk-cut-skip-fill' });
  private readonly skipText = el('span', { className: 'hk-cut-skip-text' });
  private readonly status = el('div', { className: 'hk-cut-status' });
  private readonly letter = el('div', { className: 'hk-cut-letter', attrs: { role: 'document' } });
  private readonly fade = el('div', { className: 'hk-cut-fade' });
  private readonly card: HTMLElement;
  private lineSig = UNPAINTED;
  private lineEls: HTMLElement[] = [];
  private choiceSig = UNPAINTED;
  private letterSig = UNPAINTED;
  private captionSig = UNPAINTED;
  private stillSrc: string | null = UNPAINTED;
  private inputKey = UNPAINTED;
  private shook = '';
  /** when the last answer was sent (the row returns after RETRY_MS if the node stays) */
  private submittedAt = 0;

  constructor(
    private readonly h: StoryHandlers,
    crop: CropSource,
  ) {
    this.left = new PortraitView(BUST_BOX, crop, 'hk-cut-bust left');
    this.right = new PortraitView(BUST_BOX, crop, 'hk-cut-bust right');
    this.busts.append(this.left.el, this.right.el);
    this.input = el('input', { className: 'hk-input hk-cut-input', attrs: { type: 'text' } });
    this.input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        this.submit();
      }
    });
    this.submitBtn = el('button', {
      className: 'hk-btn hk-btn-primary',
      attrs: { type: 'button' },
      on: { click: () => this.submit() },
    });
    this.inputRow = el('div', { className: 'hk-cut-input-row' }, [this.input, this.submitBtn]);
    const tool = (on: () => void) =>
      el('button', {
        className: 'hk-btn hk-btn-small hk-cut-tool',
        attrs: { type: 'button' },
        on: { click: on },
      });
    this.autoBtn = tool(() => this.h.toggleAuto());
    this.hideBtn = tool(() => this.h.toggleHidden());
    this.backlogBtn = tool(() => this.h.toggleBacklog());
    this.skipBtn = el(
      'button',
      {
        className: 'hk-btn hk-btn-small hk-cut-tool hk-cut-skip',
        attrs: { type: 'button' },
        on: { click: () => this.h.skip() },
      },
      [this.skipFill, this.skipText],
    );
    this.card = el('div', { className: 'hk-cut-card' }, [
      this.title,
      this.lines,
      this.court,
      this.prompt,
      this.choices,
      this.inputRow,
      el('div', { className: 'hk-cut-foot' }, [
        this.queued,
        this.status,
        this.hint,
        el('div', { className: 'hk-cut-tools' }, [
          this.autoBtn,
          this.hideBtn,
          this.backlogBtn,
          this.skipBtn,
        ]),
      ]),
    ]);
    this.el = el('div', { className: 'hk-cut', attrs: { role: 'dialog', 'aria-live': 'polite' } }, [
      this.still,
      el('div', { className: 'hk-cut-bar top' }),
      el('div', { className: 'hk-cut-bar bottom' }),
      this.busts,
      this.captions,
      this.card,
      this.letter,
      this.fade,
    ]);
    this.el.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement;
      if (target.closest('button') || target.closest('input')) return;
      this.h.advance();
    });
    this.el.hidden = true;
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  private submit(): void {
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = '';
    // Hide the row at once so a second Enter cannot resubmit before the node changes; a
    // refused answer leaves the node as it was, so the row comes back after a moment.
    this.inputRow.hidden = true;
    this.submittedAt = performance.now();
    this.h.submitScene(text);
  }

  render(m: CutsceneModel | null): void {
    if (!m) {
      if (!this.el.hidden) this.el.hidden = true;
      // the next scene paints from scratch: nothing of this one may stay on screen
      this.lineSig = UNPAINTED;
      this.choiceSig = UNPAINTED;
      this.inputKey = UNPAINTED;
      this.letterSig = UNPAINTED;
      this.captionSig = UNPAINTED;
      this.stillSrc = UNPAINTED;
      return;
    }
    this.el.hidden = false;
    for (const p of ['staged', 'theater', 'illustration'])
      setClass(this.el, `pres-${p}`, m.presentation === p);
    setClass(this.el, 'text-hidden', m.hidden);
    setClass(this.el, 'skipping', m.skipping);
    setClass(this.el, 'with-letter', !!m.letter);
    this.paintStill(m);
    this.paintBusts(m);
    this.paintCaptions(m);
    setText(this.title, m.title);
    this.title.hidden = m.presentation !== 'theater';
    this.paintLines(m);
    setText(this.court, m.court ?? '');
    this.court.hidden = !m.court;
    this.paintChoices(m);
    this.paintInput(m);
    setText(this.queued, m.queued ?? '');
    setText(
      this.status,
      m.skipping ? t('ui.mode.cutscene.skipping') : m.auto ? t('ui.mode.cutscene.auto_on') : '',
    );
    setText(this.hint, m.hidden ? t('ui.mode.cutscene.hidden_hint') : m.hint);
    setText(this.autoBtn, t('ui.mode.cutscene.auto'));
    setClass(this.autoBtn, 'active', m.auto);
    setText(this.hideBtn, t('ui.mode.cutscene.hide'));
    setText(this.backlogBtn, t('ui.mode.cutscene.backlog'));
    setText(this.skipText, t('ui.mode.cutscene.skip'));
    this.skipBtn.title = t('ui.mode.cutscene.skip_hint');
    this.skipBtn.hidden = !m.canSkip;
    this.skipFill.style.width = `${Math.round(m.skipHold * 100)}%`;
    this.paintLetter(m);
    const fade = m.fade ?? '';
    setClass(this.fade, 'black', fade === 'black');
    setClass(this.fade, 'white', fade === 'white');
    setClass(this.fade, 'soft', fade === 'soft');
    this.fade.hidden = !fade;
    const shakeKey = m.shake ? `${m.key}|${m.shake}` : '';
    if (shakeKey && shakeKey !== this.shook) {
      this.shook = shakeKey;
      this.el.classList.remove('shake-1', 'shake-2', 'shake-3');
      // restart the animation
      void this.el.offsetWidth;
      this.el.classList.add(`shake-${m.shake}`);
    }
  }

  private paintStill(m: CutsceneModel): void {
    const src = m.presentation === 'illustration' ? m.still : null;
    if (src === this.stillSrc) return;
    this.stillSrc = src;
    this.still.style.backgroundImage = src ? `url("${src}")` : '';
    setClass(this.still, 'vignette', m.presentation === 'illustration' && !src);
  }

  private paintBusts(m: CutsceneModel): void {
    const r = installedResolver();
    const left = m.busts.find((b) => b.side === 'left');
    const right = m.busts.find((b) => b.side === 'right');
    for (const [view, b] of [
      [this.left, left],
      [this.right, right],
    ] as const) {
      view.el.hidden = !b;
      if (!b) {
        view.show(null);
        continue;
      }
      view.show(resolvePortrait(r, { id: b.who, name: b.name }, b.expression, 'bust'));
      setClass(view.el, 'lit', b.lit);
    }
  }

  private paintCaptions(m: CutsceneModel): void {
    const sig = m.captions.join('\n');
    if (sig === this.captionSig) return;
    this.captionSig = sig;
    this.captions.replaceChildren(
      ...m.captions.map((c) => el('div', { className: 'hk-cut-caption', text: c })),
    );
  }

  private paintLines(m: CutsceneModel): void {
    const sig = m.lines
      .map((l, i) => `${i}|${l.speaker}|${l.kind}|${l.generated ? 1 : 0}|${l.blocked ? 1 : 0}`)
      .join('\n');
    let changed = sig !== this.lineSig;
    if (changed) {
      this.lineSig = sig;
      this.lineEls = [];
      clear(this.lines);
      for (const l of m.lines) {
        const text = el('span', { className: 'hk-cut-text' });
        this.lineEls.push(text);
        this.lines.append(
          el('div', { className: `hk-cut-line kind-${l.kind}${l.blocked ? ' blocked' : ''}` }, [
            l.speaker ? el('span', { className: 'hk-cut-speaker', text: l.speaker }) : null,
            text,
            l.generated && !l.blocked ? aiBadge(() => this.h.block(l.sig)) : null,
          ]),
        );
      }
    }
    m.lines.forEach((l, i) => {
      const node = this.lineEls[i];
      if (node && node.textContent !== l.text) {
        node.textContent = l.text;
        changed = true;
      }
    });
    // Scrolling reads the layout: only when the text changed, never on an idle frame (22).
    if (changed) this.lines.scrollTop = this.lines.scrollHeight;
  }

  private paintChoices(m: CutsceneModel): void {
    const sig = m.choices.map((c) => `${c.id}|${c.label}|${c.confirm ? 1 : 0}`).join('\n');
    if (sig === this.choiceSig) return;
    this.choiceSig = sig;
    clear(this.choices);
    for (const c of m.choices) {
      this.choices.append(
        el(
          'button',
          {
            className: `hk-btn hk-cut-choice${c.confirm ? ' key-choice' : ''}`,
            title: c.hint ?? '',
            attrs: { type: 'button' },
            on: { click: () => this.choose(c.id, c.label, c.confirm) },
          },
          [el('span', { className: 'hk-cut-num', text: String(c.number) }), c.label],
        ),
      );
    }
  }

  /** Pick a choice; an irreversible one asks first (catalog 2.2 `确认`). */
  private choose(id: string, label: string, confirm: boolean): void {
    if (!confirm) {
      this.h.chooseScene(id);
      return;
    }
    void askConfirmChoice(label).then((ok) => {
      if (ok) this.h.chooseScene(id);
    });
  }

  private paintInput(m: CutsceneModel): void {
    const key = m.input ? `${m.key}|${m.input.prompt}` : '';
    this.prompt.hidden = !m.input;
    setText(this.prompt, m.input?.prompt ?? '');
    setText(this.submitBtn, t('ui.mode.cutscene.submit'));
    const placeholder = t('ui.mode.cutscene.placeholder');
    if (this.input.placeholder !== placeholder) {
      this.input.placeholder = placeholder;
      this.input.setAttribute('aria-label', placeholder);
    }
    if (key === this.inputKey) {
      if (m.input && this.inputRow.hidden && performance.now() - this.submittedAt > RETRY_MS) {
        this.inputRow.hidden = false;
        queueMicrotask(() => this.input.focus());
      }
      return;
    }
    this.inputKey = key;
    this.inputRow.hidden = !m.input;
    if (m.input) {
      this.input.maxLength = m.input.maxLength;
      this.input.value = '';
      queueMicrotask(() => this.input.focus());
    }
  }

  private paintLetter(m: CutsceneModel): void {
    const l = m.letter;
    const sig = l ? JSON.stringify(l) : '';
    if (sig === this.letterSig) return;
    this.letterSig = sig;
    this.letter.hidden = !l;
    clear(this.letter);
    if (!l) return;
    this.letter.append(
      el('div', { className: 'hk-cut-letter-head' }, [
        el('div', { className: 'hk-cut-letter-subject', text: l.subject }),
        l.seal ? el('span', { className: 'hk-cut-letter-seal', text: l.seal }) : null,
      ]),
      el('div', {
        className: 'hk-cut-letter-from',
        text: t('ui.mode.cutscene.letter.from', { name: l.sender }),
      }),
      ...l.paragraphs.map((p) => el('p', { className: 'hk-cut-letter-p', text: p })),
      el('div', { className: 'hk-cut-letter-hint', text: l.hint }),
    );
  }
}

/** Ask before an irreversible choice (ux 7.4): it closes some possibilities, never says which. */
export function askConfirmChoice(label: string): Promise<boolean> {
  return askConfirm({
    title: label,
    body: t('ui.mode.cutscene.confirm_body'),
    irreversible: true,
  });
}
