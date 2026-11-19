import { clear, el } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import { COLOR_MODES, type ColorMode, TEXT_SCALES, type TextScale } from '../app/settings_schema';
import { GLYPH_SETTINGS } from '../input/input_settings';
import { paletteFor } from '../render/palette_modes';
import type { WindowPrefs } from '../windows/window_context';
import { FIRST_RUN_PAGES, firstRunPatch } from './first_run_model';

export interface FirstRunOptions {
  prefs: WindowPrefs;
  done: boolean;
  complete(): boolean | undefined;
  desktop?: boolean;
  connect?(kind: 'cloud' | 'local'): void;
}

export class FirstRunScreen {
  readonly el = el('section', {
    className: 'hk-first-run',
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('ui.scr.first.title') },
  });
  private page = 0;
  private draft;
  private ai: 'builtin' | 'cloud' | 'local' = 'builtin';
  private error = '';

  constructor(
    parent: HTMLElement,
    private readonly options: FirstRunOptions,
    private readonly closed: () => void,
  ) {
    this.draft = structuredClone(options.prefs.sync);
    parent.append(this.el);
    this.paint();
  }

  private choice(
    label: string,
    value: string,
    selected: boolean,
    on: () => void,
    disabled = false,
  ): HTMLElement {
    return el('button', {
      className: `hk-btn${selected ? ' hk-btn-primary' : ''}`,
      text: label,
      attrs: {
        type: 'button',
        role: 'radio',
        'aria-checked': String(selected),
        ...(disabled ? { disabled: '' } : {}),
      },
      dataset: { choice: value },
      on: { click: on },
    });
  }

  private paint(): void {
    clear(this.el);
    const page = FIRST_RUN_PAGES[this.page] ?? 'ai';
    const card = el('div', { className: 'hk-first-run-card' }, [
      el('p', {
        className: 'hk-muted',
        text: t('ui.scr.first.page', { n: this.page + 1, total: FIRST_RUN_PAGES.length }),
      }),
      el('h2', { text: t(`ui.scr.first.${page}`) }),
    ]);
    if (page === 'language') {
      card.append(el('p', { text: t('ui.set.language.name.zh_hans') }));
      const sizes = el('div', {
        className: 'hk-row',
        attrs: { role: 'radiogroup', 'aria-label': t('ui.set.access.text_scale') },
      });
      for (const [i, scale] of TEXT_SCALES.entries())
        sizes.append(
          this.choice(
            t(`ui.set.access.text_scale_opt.${['small', 'standard', 'large', 'xlarge'][i]}`),
            String(scale),
            this.draft.accessibility.textScale === scale,
            () => {
              this.draft.accessibility.textScale = scale as TextScale;
              this.paint();
            },
          ),
        );
      const preview = el('p', { className: 'hk-first-preview', text: t('ui.scr.first.preview') });
      preview.style.fontSize = `${16 * this.draft.accessibility.textScale}px`;
      card.append(sizes, preview);
    } else if (page === 'visibility') {
      const colors = el('div', {
        className: 'hk-row',
        attrs: { role: 'radiogroup', 'aria-label': t('ui.set.access.color_mode') },
      });
      for (const mode of COLOR_MODES)
        colors.append(
          this.choice(
            t(`ui.set.access.color_mode_opt.${mode}`),
            mode,
            this.draft.accessibility.colorMode === mode,
            () => {
              this.draft.accessibility.colorMode = mode as ColorMode;
              this.paint();
            },
          ),
        );
      const label = el('label', { className: 'hk-row' });
      const box = el('input', { attrs: { type: 'checkbox' } });
      box.checked = this.draft.accessibility.reduceFlashing === 'on';
      box.addEventListener('change', () => {
        this.draft.accessibility.reduceFlashing = box.checked ? 'on' : 'system';
      });
      label.append(box, el('span', { text: t('ui.set.access.reduce_flashing') }));
      card.append(
        colors,
        el('p', {
          className: 'hk-set-note',
          text: t(`ui.set.access.color_mode_note.${this.draft.accessibility.colorMode}`),
        }),
        label,
      );
      const palette = paletteFor(this.draft.accessibility.colorMode);
      const sample = el('div', { className: 'hk-first-vision-sample' });
      for (const color of [palette.rings.hostile, palette.rings.friendly, palette.rings.neutral]) {
        const ring = el('span', {
          className: 'hk-first-sample-ring',
          attrs: { 'aria-hidden': 'true' },
        });
        ring.style.borderColor = `#${color.toString(16).padStart(6, '0')}`;
        sample.append(ring);
      }
      const warning = el('span', {
        className: 'hk-first-sample-warning',
        attrs: { 'aria-hidden': 'true' },
      });
      warning.style.borderColor = palette.warnings.hostile.edge;
      warning.style.backgroundColor = palette.warnings.hostile.fill;
      sample.append(warning);
      card.append(sample);
    } else if (page === 'input') {
      const pad =
        typeof navigator.getGamepads === 'function' && [...navigator.getGamepads()].some(Boolean);
      card.append(el('p', { text: t(pad ? 'ui.scr.first.pad' : 'ui.scr.first.mouse') }));
      const select = el('select', {
        className: 'hk-input',
        attrs: { 'aria-label': t('ui.set.controls.opt.glyphs') },
      });
      for (const glyph of GLYPH_SETTINGS)
        select.append(
          el('option', { text: t(`ui.set.controls.family.${glyph}`), attrs: { value: glyph } }),
        );
      select.value = this.draft.input.glyphs;
      select.addEventListener('change', () => {
        if (GLYPH_SETTINGS.includes(select.value as never))
          this.draft.input.glyphs = select.value as typeof this.draft.input.glyphs;
      });
      card.append(select, el('p', { className: 'hk-muted', text: t('ui.scr.first.input_note') }));
    } else {
      card.append(el('p', { text: t('ui.scr.first.ai_body') }));
      const cards = el('div', {
        className: 'hk-first-ai',
        attrs: { role: 'radiogroup', 'aria-label': t('ui.scr.first.ai') },
      });
      for (const kind of ['builtin', 'cloud', 'local'] as const) {
        const available =
          kind === 'builtin' ||
          (!!this.options.connect && (kind !== 'cloud' || !!this.options.desktop));
        const key = kind === 'cloud' ? 'connect' : kind;
        cards.append(
          el('div', { className: 'hk-card' }, [
            this.choice(
              t(`ui.scr.first.${key}`),
              kind,
              this.ai === kind,
              () => {
                this.ai = kind;
                this.paint();
              },
              !available,
            ),
            el('p', { className: 'hk-muted', text: t(`ui.scr.first.${key}_note`) }),
            kind === 'cloud' && !this.options.desktop
              ? el('p', { className: 'hk-muted', text: t('ui.scr.first.desktop_only') })
              : null,
          ]),
        );
      }
      card.append(cards);
    }
    if (this.error)
      card.append(el('p', { className: 'hk-error', attrs: { role: 'alert' }, text: this.error }));
    card.append(el('p', { className: 'hk-muted', text: t('ui.scr.first.reset_note') }));
    card.append(
      el('div', { className: 'hk-row' }, [
        el('button', {
          className: 'hk-btn',
          text: t(page === 'ai' ? 'ui.scr.first.later' : 'ui.scr.first.skip'),
          attrs: { type: 'button' },
          on: { click: () => this.advance(true) },
        }),
        el('button', {
          className: 'hk-btn hk-btn-primary',
          text: t(
            page === 'ai'
              ? this.ai === 'builtin'
                ? 'ui.scr.first.done'
                : 'ui.scr.first.connect_now'
              : 'ui.scr.first.next',
          ),
          attrs: { type: 'button' },
          on: { click: () => this.advance(false) },
        }),
      ]),
    );
    this.el.append(card);
    card.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
  }

  private advance(skipped: boolean): void {
    const page = FIRST_RUN_PAGES[this.page] ?? 'ai';
    const patch = firstRunPatch(page, this.draft, skipped);
    if (Object.keys(patch).length && !this.options.prefs.updateSync(patch)) {
      this.error = t('ui.scr.first.save_failed');
      this.paint();
      return;
    }
    this.draft = structuredClone(this.options.prefs.sync);
    if (this.page < FIRST_RUN_PAGES.length - 1) {
      this.page += 1;
      this.paint();
      return;
    }
    if (this.options.complete() === false) {
      this.error = t('ui.scr.first.save_failed');
      this.paint();
      return;
    }
    this.dispose();
    this.closed();
    if (!skipped && this.ai !== 'builtin') this.options.connect?.(this.ai);
  }

  dispose(): void {
    this.el.remove();
  }
}
