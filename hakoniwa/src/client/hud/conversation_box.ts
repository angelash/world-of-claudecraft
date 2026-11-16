// Conversation box: the open talk with an NPC (dialogue system) with its recent lines,
// the options every system offered, a free-text line and a leave button; when no talk is
// open it shows loose lines addressed to the player (goddess speech, narration) one at a
// time, advanced with Space or a click.

import { clear, el, setClass, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import type { ConversationView } from '../view/adapters';
import type { DialogueLine } from './dialogue_queue';

export interface ConversationHandlers {
  choose(optionId: string): void;
  say(text: string): void;
  leave(): void;
  advanceLoose(): void;
}

export const VISIBLE_LINES = 6;

export class ConversationBox {
  readonly el: HTMLElement;
  private header = el('div', { className: 'hk-dlg-head' });
  private speaker = el('div', { className: 'hk-dlg-speaker' });
  private lines = el('div', { className: 'hk-dlg-lines' });
  private pending = el('div', {
    className: 'hk-dlg-pending',
    text: t('ui.mode.dialogue.thinking'),
  });
  private options = el('div', { className: 'hk-dlg-options' });
  private sayRow: HTMLElement;
  private input: HTMLInputElement;
  private hint = el('div', { className: 'hk-dlg-hint', text: t('ui.mode.dialogue.advance') });
  private sig = '';
  private mode: 'talk' | 'loose' | 'none' = 'none';

  constructor(
    private readonly h: ConversationHandlers,
    maxSay: number,
  ) {
    this.input = el('input', {
      className: 'hk-input',
      attrs: {
        type: 'text',
        placeholder: t('ui.mode.dialogue.placeholder'),
        'aria-label': t('ui.mode.dialogue.placeholder'),
        maxlength: String(maxSay),
      },
    });
    this.input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        const t = this.input.value.trim();
        if (t) {
          this.input.value = '';
          this.h.say(t);
        }
      }
    });
    this.sayRow = el('div', { className: 'hk-row hk-dlg-say' }, [
      this.input,
      el('button', {
        className: 'hk-btn',
        text: t('ui.mode.dialogue.send'),
        attrs: { type: 'button' },
        on: {
          click: () => {
            const t = this.input.value.trim();
            if (!t) return;
            this.input.value = '';
            this.h.say(t);
          },
        },
      }),
    ]);
    const leave = el('button', {
      className: 'hk-btn hk-btn-small',
      text: t('ui.mode.dialogue.leave'),
      attrs: { type: 'button' },
      on: { click: () => this.h.leave() },
    });
    this.header.append(this.speaker, leave);
    this.el = el('div', { className: 'hk-dlg', attrs: { role: 'dialog', 'aria-live': 'polite' } }, [
      this.header,
      this.lines,
      this.pending,
      this.options,
      this.sayRow,
      this.hint,
    ]);
    this.el.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      if (t.closest('button') || t.closest('input')) return;
      if (this.mode === 'loose') this.h.advanceLoose();
    });
    this.el.hidden = true;
  }

  get talking(): boolean {
    return this.mode === 'talk';
  }

  render(conv: ConversationView | null, loose: DialogueLine | null): void {
    if (conv) this.renderTalk(conv);
    else if (loose) this.renderLoose(loose);
    else {
      this.mode = 'none';
      this.sig = '';
      this.el.hidden = true;
    }
  }

  private renderTalk(c: ConversationView): void {
    const sig = `t|${c.npcId}|${c.lines.length}|${c.pending}|${c.options.map((o) => o.id).join(',')}`;
    this.el.hidden = false;
    this.mode = 'talk';
    if (sig === this.sig) return;
    this.sig = sig;
    for (const k of ['divine', 'narrate', 'think']) setClass(this.el, k, false);
    setClass(this.el, 'talk', true);
    this.header.hidden = false;
    setText(this.speaker, c.name);
    clear(this.lines);
    for (const l of c.lines.slice(-VISIBLE_LINES)) {
      this.lines.append(
        el(
          'div',
          { className: `hk-dlg-line kind-${l.kind}${l.speakerId === c.npcId ? '' : ' mine'}` },
          [
            el('span', { className: 'hk-dlg-who', text: l.speakerName }),
            el('span', { text: l.text }),
          ],
        ),
      );
    }
    this.lines.scrollTop = this.lines.scrollHeight;
    this.pending.hidden = !c.pending;
    clear(this.options);
    for (const o of c.options) {
      this.options.append(
        el('button', {
          className: `hk-btn hk-dlg-option sys-${o.system}`,
          text: o.label,
          title: o.hint ?? '',
          attrs: { type: 'button' },
          on: { click: () => this.h.choose(o.id) },
        }),
      );
    }
    this.sayRow.hidden = false;
    this.hint.hidden = true;
  }

  private renderLoose(line: DialogueLine): void {
    const text = t(line.text);
    const sig = `l|${line.speakerId}|${text}`;
    this.el.hidden = false;
    this.mode = 'loose';
    if (sig === this.sig) return;
    this.sig = sig;
    setClass(this.el, 'talk', false);
    setClass(this.el, 'divine', line.kind === 'divine');
    setClass(this.el, 'narrate', line.kind === 'narrate');
    setClass(this.el, 'think', line.kind === 'think');
    this.header.hidden = line.kind === 'narrate';
    setText(this.speaker, t(line.speakerName));
    clear(this.lines);
    this.lines.append(el('div', { className: 'hk-dlg-text', text }));
    this.pending.hidden = true;
    clear(this.options);
    this.sayRow.hidden = true;
    this.hint.hidden = false;
  }
}
