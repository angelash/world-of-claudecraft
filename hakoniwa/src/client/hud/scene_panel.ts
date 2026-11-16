// Full-screen scene panel: plays the scenes system's current node (prologue, dreams,
// court debates). Lines, numbered choices, free-text input; Space, Enter or a click
// advances. The world behind is dimmed and player movement is held by the session.

import { clear, el, setClass, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import type { ScenePanelModel } from './scene_model';

export interface ScenePanelHandlers {
  advance(): void;
  choose(choiceId: string): void;
  submit(text: string): void;
}

export class ScenePanel {
  readonly el: HTMLElement;
  private title = el('div', { className: 'hk-scene-title' });
  private lines = el('div', { className: 'hk-scene-lines' });
  private choices = el('div', { className: 'hk-scene-choices' });
  private inputRow: HTMLElement;
  private input: HTMLInputElement;
  private prompt = el('div', { className: 'hk-scene-prompt' });
  private court = el('div', { className: 'hk-scene-court' });
  private hint = el('div', { className: 'hk-scene-hint' });
  private queued = el('div', { className: 'hk-scene-queued' });
  private key = '';
  private mode: ScenePanelModel['mode'] | null = null;
  /** renders since the input row was hidden by a submit on an unchanged node */
  private hiddenRenders = 0;

  constructor(private readonly h: ScenePanelHandlers) {
    this.input = el('input', {
      className: 'hk-input hk-scene-input',
      attrs: {
        type: 'text',
        placeholder: t('ui.mode.cutscene.placeholder'),
        'aria-label': t('ui.mode.cutscene.placeholder'),
      },
    });
    this.input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        this.submit();
      }
    });
    this.inputRow = el('div', { className: 'hk-scene-input-row' }, [
      this.input,
      el('button', {
        className: 'hk-btn hk-btn-primary',
        text: t('ui.mode.cutscene.submit'),
        attrs: { type: 'button' },
        on: { click: () => this.submit() },
      }),
    ]);
    const card = el('div', { className: 'hk-scene-card' }, [
      this.title,
      this.lines,
      this.court,
      this.prompt,
      this.choices,
      this.inputRow,
      el('div', { className: 'hk-scene-foot' }, [this.queued, this.hint]),
    ]);
    this.el = el(
      'div',
      { className: 'hk-scene', attrs: { role: 'dialog', 'aria-live': 'polite' } },
      [card],
    );
    card.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      if (t.closest('button') || t.closest('input')) return;
      if (this.mode === 'advance') this.h.advance();
    });
    this.el.hidden = true;
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  render(m: ScenePanelModel | null): void {
    this.el.hidden = !m;
    if (!m) {
      this.key = '';
      this.mode = null;
      return;
    }
    this.mode = m.mode;
    if (m.key === this.key) {
      // A rejected submit leaves the node unchanged: offer the input again after a moment.
      if (m.input && this.inputRow.hidden && ++this.hiddenRenders > 6) {
        this.hiddenRenders = 0;
        this.inputRow.hidden = false;
      }
      return;
    }
    this.hiddenRenders = 0;
    const wasInput = this.inputRow.hidden === false;
    this.key = m.key;
    setText(this.title, m.title);
    clear(this.lines);
    for (const l of m.lines) {
      this.lines.append(
        el('div', { className: `hk-scene-line kind-${l.kind}` }, [
          l.speaker ? el('span', { className: 'hk-scene-speaker', text: l.speaker }) : null,
          el('span', { className: 'hk-scene-text', text: l.text }),
        ]),
      );
    }
    this.lines.scrollTop = this.lines.scrollHeight;
    setText(this.court, m.court ?? '');
    this.court.hidden = !m.court;
    clear(this.choices);
    for (const c of m.choices) {
      this.choices.append(
        el(
          'button',
          {
            className: 'hk-btn hk-scene-choice',
            title: c.hint ?? '',
            attrs: { type: 'button' },
            on: { click: () => this.h.choose(c.id) },
          },
          [el('span', { className: 'hk-scene-num', text: String(c.number) }), c.label],
        ),
      );
    }
    this.inputRow.hidden = !m.input;
    this.prompt.hidden = !m.input;
    setText(this.prompt, m.input?.prompt ?? '');
    if (m.input) {
      this.input.maxLength = m.input.maxLength;
      if (!wasInput) {
        this.input.value = '';
        queueMicrotask(() => this.input.focus());
      }
    }
    setText(this.hint, m.hint);
    setText(this.queued, m.queued ?? '');
    setClass(this.el, 'resolving', m.mode === 'resolve');
  }

  private submit(): void {
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = '';
    // Hide the row at once so a second Enter cannot resubmit before the node changes.
    this.inputRow.hidden = true;
    this.h.submit(text);
  }
}
