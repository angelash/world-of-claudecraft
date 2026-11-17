// Implements `ui_mode_dialogue` (ux_and_onboarding.md 7): the bottom dialogue panel in the
// regular layout (a 128 portrait at the left, name, title, attitude, the last six lines,
// numbered options with their system tags, the free line with its counter, backlog and leave
// at the top right) or the story layout (no portrait; half-length busts above the panel, the
// speaker lit), and loose lines addressed to the player. Writes are elided; the typing line
// is the only text written every frame while it types. Thin painter over dialogue_model.ts.

import { el, setClass, setText } from '../../../shared_ui/dom';
import { t } from '../../../shared_ui/i18n';
import { installedResolver } from '../../assets/runtime';
import type { DialogueModel } from './dialogue_model';
import { counterText } from './dialogue_model';
import type { StoryHandlers } from './handlers';
import { resolvePortrait } from './portrait_plan';
import { type CropSource, PortraitView } from './portrait_view';

/** The regular layout's portrait box (64 px art at twice its size, 7.2). */
const PORTRAIT_BOX = { w: 128, h: 128 };
/** The story layout's bust box (256 by 384 art at its size, 7.2). */
const BUST_BOX = { w: 256, h: 384 };

/** A signature no model produces: the next render paints every part (first paint, reset). */
const UNPAINTED = '<unpainted>';

export class DialoguePanel {
  readonly el: HTMLElement;
  private readonly portrait: PortraitView;
  private readonly bust: PortraitView;
  private readonly busts = el('div', { className: 'hk-dlg2-busts' });
  private readonly name = el('div', { className: 'hk-dlg2-name' });
  private readonly sub = el('div', { className: 'hk-dlg2-sub' });
  private readonly attitude = el('span', { className: 'hk-dlg2-attitude' });
  private readonly lines = el('div', { className: 'hk-dlg2-lines' });
  private readonly pending = el('div', { className: 'hk-dlg2-pending' });
  private readonly farewell = el('div', { className: 'hk-dlg2-farewell' });
  private readonly options = el('div', { className: 'hk-dlg2-options' });
  private readonly sayRow: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly send: HTMLButtonElement;
  private readonly counter = el('span', { className: 'hk-dlg2-counter' });
  private readonly rejected = el('div', {
    className: 'hk-dlg2-rejected',
    attrs: { role: 'alert' },
  });
  private readonly hint = el('div', { className: 'hk-dlg2-hint' });
  private readonly backlogBtn: HTMLButtonElement;
  private readonly leaveBtn: HTMLButtonElement;
  private readonly head: HTMLElement;
  private lineSig = UNPAINTED;
  private optionSig = UNPAINTED;
  private lineEls: HTMLElement[] = [];
  private wasTyping = false;
  private mode: DialogueModel['mode'] | null = null;
  private lastKey = '';
  private lastSaid = 0;

  constructor(
    private readonly h: StoryHandlers,
    crop: CropSource,
  ) {
    this.portrait = new PortraitView(PORTRAIT_BOX, crop, 'hk-dlg2-portrait');
    this.bust = new PortraitView(BUST_BOX, crop, 'hk-dlg2-bust left lit');
    this.busts.append(this.bust.el);
    this.input = el('input', {
      className: 'hk-input hk-dlg2-input',
      attrs: { type: 'text', maxlength: '200' },
    });
    this.input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        this.submit();
      }
    });
    this.input.addEventListener('input', () => this.paintCounter());
    this.send = el('button', {
      className: 'hk-btn',
      attrs: { type: 'button' },
      on: { click: () => this.submit() },
    });
    this.sayRow = el('div', { className: 'hk-dlg2-say' }, [this.input, this.counter, this.send]);
    this.backlogBtn = el('button', {
      className: 'hk-btn hk-btn-small',
      attrs: { type: 'button' },
      on: { click: () => this.h.toggleBacklog() },
    });
    this.leaveBtn = el('button', {
      className: 'hk-btn hk-btn-small',
      attrs: { type: 'button' },
      on: { click: () => this.h.leave() },
    });
    this.head = el('div', { className: 'hk-dlg2-head' }, [
      el('div', { className: 'hk-dlg2-who' }, [
        el('div', { className: 'hk-dlg2-nameline' }, [this.name, this.attitude]),
        this.sub,
      ]),
      el('div', { className: 'hk-dlg2-buttons' }, [this.backlogBtn, this.leaveBtn]),
    ]);
    const panel = el('div', { className: 'hk-dlg2-panel' }, [
      this.portrait.el,
      el('div', { className: 'hk-dlg2-main' }, [
        this.head,
        this.lines,
        this.pending,
        this.farewell,
        this.options,
        this.sayRow,
        this.rejected,
        this.hint,
      ]),
    ]);
    this.el = el(
      'div',
      { className: 'hk-dlg2', attrs: { role: 'dialog', 'aria-live': 'polite' } },
      [this.busts, panel],
    );
    panel.addEventListener('click', (ev) => {
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
    // The text stays until the say is accepted, so a refused say keeps it (7.6).
    this.h.say(text);
  }

  private paintCounter(): void {
    setText(this.counter, counterText(Array.from(this.input.value).length, this.input.maxLength));
  }

  /** The say went through: clear the line. */
  clearInput(): void {
    this.input.value = '';
    this.paintCounter();
  }

  render(m: DialogueModel | null): void {
    if (!m) {
      if (!this.el.hidden) this.el.hidden = true;
      this.mode = null;
      // the next conversation paints from scratch: nothing of this one may stay on screen,
      // the half-typed words included
      this.lineSig = UNPAINTED;
      this.optionSig = UNPAINTED;
      if (this.input.value) this.clearInput();
      return;
    }
    this.el.hidden = false;
    if (this.mode !== m.mode) {
      this.mode = m.mode;
      this.lineSig = UNPAINTED;
    }
    const story = m.layout === 'story' && m.mode === 'talk';
    setClass(this.el, 'layout-story', story);
    setClass(this.el, 'layout-regular', !story);
    setClass(this.el, 'mode-loose', m.mode === 'loose');
    for (const k of ['divine', 'narrate', 'think'])
      setClass(this.el, `kind-${k}`, m.looseKind === k);
    const r = installedResolver();
    this.portrait.el.hidden = story || !m.speaker;
    this.busts.hidden = !story || !m.speaker;
    if (m.speaker) {
      if (story) this.bust.show(resolvePortrait(r, m.speaker, 'neutral', 'bust'));
      else this.portrait.show(resolvePortrait(r, m.speaker, 'neutral', 'portrait'));
    }
    this.head.hidden = m.mode === 'loose' && !m.name;
    setText(this.name, m.name);
    setText(this.sub, m.subtitle);
    this.sub.hidden = !m.subtitle;
    setText(this.attitude, m.attitude);
    this.attitude.hidden = !m.attitude;
    setText(this.backlogBtn, t('ui.mode.dialogue.backlog_button'));
    setText(this.leaveBtn, t('ui.mode.dialogue.leave'));
    this.backlogBtn.hidden = m.mode !== 'talk';
    this.leaveBtn.hidden = m.mode !== 'talk';
    this.paintLines(m);
    setText(this.pending, t('ui.mode.dialogue.thinking'));
    this.pending.hidden = !m.pending;
    setText(this.farewell, m.farewell);
    this.farewell.hidden = !m.farewell;
    this.paintOptions(m);
    this.sayRow.hidden = !m.input;
    if (m.input) {
      // The placeholder holds a {key:} glyph: re-read every frame so it follows the device.
      if (this.input.placeholder !== m.input.placeholder) {
        this.input.placeholder = m.input.placeholder;
        this.input.setAttribute('aria-label', m.input.placeholder);
      }
      if (this.input.maxLength !== m.input.max) this.input.maxLength = m.input.max;
      setText(this.send, t('ui.mode.dialogue.send'));
      if (m.said !== this.lastSaid) {
        this.lastSaid = m.said;
        this.clearInput();
      } else if (m.key !== this.lastKey) this.paintCounter();
    }
    setText(
      this.rejected,
      m.rejected ? t('ui.mode.dialogue.rejected', { reason: m.rejected }) : '',
    );
    this.rejected.hidden = !m.rejected;
    setText(this.hint, m.hint);
    this.hint.hidden = !m.hint;
    this.lastKey = m.key;
  }

  private paintLines(m: DialogueModel): void {
    const sig = m.lines
      .map((l) => `${l.id}|${l.who}|${l.kind}|${l.generated ? 1 : 0}|${l.blocked ? 1 : 0}`)
      .join('\n');
    const changed = sig !== this.lineSig;
    if (changed) {
      this.lineSig = sig;
      this.lineEls = [];
      this.lines.replaceChildren(
        ...m.lines.map((l) => {
          const text = el('span', { className: 'hk-dlg2-text' });
          this.lineEls.push(text);
          const row = el(
            'div',
            {
              className: `hk-dlg2-line kind-${l.kind}${l.mine ? ' mine' : ''}${l.blocked ? ' blocked' : ''}`,
            },
            [
              l.who && m.mode === 'talk'
                ? el('span', { className: 'hk-dlg2-line-who', text: l.who })
                : null,
              text,
              l.generated && !l.blocked ? aiBadge(() => this.h.block(l.sig)) : null,
            ],
          );
          return row;
        }),
      );
    }
    m.lines.forEach((l, i) => {
      const node = this.lineEls[i];
      if (node) setText(node, l.text);
    });
    // Scrolling reads the layout: when lines arrive and when typing ends, not on every typed
    // character (22: no forced layout on the per-frame path).
    const typingEnded = this.wasTyping && !m.typing;
    this.wasTyping = m.typing;
    if (changed || typingEnded) this.lines.scrollTop = this.lines.scrollHeight;
  }

  private paintOptions(m: DialogueModel): void {
    const sig = m.options.map((o) => `${o.id}|${o.label}|${o.tag}|${o.disabled}`).join('\n');
    if (sig === this.optionSig) return;
    this.optionSig = sig;
    this.options.replaceChildren(
      ...m.options.map((o) =>
        el(
          'button',
          {
            className: `hk-btn hk-dlg2-option${o.disabled ? ' disabled' : ''}`,
            title: o.disabled || o.hint,
            attrs: o.disabled ? { type: 'button', disabled: '' } : { type: 'button' },
            on: { click: () => this.h.choose(o.id) },
          },
          [
            el('span', { className: 'hk-dlg2-num', text: String(o.number) }),
            o.tag ? el('span', { className: 'hk-dlg2-tag', text: o.tag }) : null,
            el('span', { className: 'hk-dlg2-label', text: o.label }),
            o.disabled ? el('span', { className: 'hk-dlg2-why', text: o.disabled }) : null,
          ],
        ),
      ),
    );
  }
}

/** The AI mark of a generated line with its "block and flag" action (7.3). */
export function aiBadge(onBlock: () => void): HTMLElement {
  return el('span', { className: 'hk-ai-mark' }, [
    el('span', {
      className: 'hk-ai-badge',
      text: t('ui.common.ai.badge'),
      title: t('ui.common.ai.tooltip'),
    }),
    el('button', {
      className: 'hk-btn hk-btn-small hk-ai-block',
      text: t('ui.common.ai.block'),
      attrs: { type: 'button' },
      on: {
        click: (ev) => {
          ev.stopPropagation();
          onBlock();
        },
      },
    }),
  ]);
}
