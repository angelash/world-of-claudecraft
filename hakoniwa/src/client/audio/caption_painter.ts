// Caption painter: the thin DOM side of ./captions.ts (audio_direction.md 10.4). It writes the
// board's lines centred at the bottom or top of the screen, placed and stacked by
// ./audio_settings.ts `captionPlace` so they never cover what a player acts on (the
// notifications, the dialogue panel, a cutscene's card and choices; UX-6), and redraws only
// when the board's stamp, the style or the placement changes. The style (size, backdrop
// opacity, position, coloured important lines, high contrast) comes from the accessibility page
// through `captionStyle` (ux_and_onboarding.md 18.4). Styles are inline so the painter needs no
// stylesheet entry.

import { clear, el } from '../../shared_ui/dom';
import { t, tOr } from '../../shared_ui/i18n';
import {
  type CaptionScreen,
  type CaptionStyle,
  captionPlace,
  DEFAULT_CAPTION_STYLE,
} from './audio_settings';
import type { CaptionLine } from './captions';

/** Line colours: important lines warm, the others plain; one colour when colours are off. */
const IMPORTANT_COLOR = '#f2e2b8';
const PLAIN_COLOR = '#d8d4cc';
const HIGH_CONTRAST_COLOR = '#ffffff';

export class CaptionPainter {
  private readonly box: HTMLDivElement;
  private stamp = -1;
  private styleKey = '';

  constructor(root: HTMLElement) {
    this.box = el('div', {
      className: 'hk-captions',
      attrs: { role: 'status', 'aria-live': 'polite' },
    });
    const s = this.box.style;
    s.position = 'absolute';
    s.left = '50%';
    s.transform = 'translateX(-50%)';
    s.display = 'flex';
    s.flexDirection = 'column';
    s.alignItems = 'center';
    s.gap = '4px';
    s.pointerEvents = 'none';
    root.append(this.box);
  }

  /** Draw the lines when the board, the style or the placement changed since the last call. */
  paint(
    lines: readonly CaptionLine[],
    stamp: number,
    style: CaptionStyle = DEFAULT_CAPTION_STYLE,
    screen: CaptionScreen = 'field',
  ): void {
    const key = `${style.fontPx}|${style.backdrop}|${style.position}|${style.colors}|${style.highContrast}|${screen}`;
    if (stamp === this.stamp && key === this.styleKey) return;
    this.stamp = stamp;
    if (key !== this.styleKey) {
      this.styleKey = key;
      const place = captionPlace(style.position, screen);
      const s = this.box.style;
      s.top = place.top;
      s.bottom = place.bottom;
      s.zIndex = String(place.z);
    }
    clear(this.box);
    for (const line of lines) {
      const text = tOr(`ui.ovl.caption.${line.cap}`, '');
      if (!text) continue;
      const shown = line.dir
        ? t('ui.ovl.caption.line_directed', { dir: t(`ui.ovl.caption.dir.${line.dir}`), text })
        : t('ui.ovl.caption.line_plain', { text });
      const row = el('div', { className: 'hk-caption', text: shown });
      const r = row.style;
      r.padding = '2px 10px';
      r.borderRadius = '4px';
      r.background = `rgba(${style.highContrast ? '0, 0, 0' : '8, 6, 14'}, ${style.backdrop})`;
      // without a backdrop a dark outline keeps the text readable over any picture
      r.textShadow = style.backdrop < 0.5 ? '0 0 3px #000, 0 0 3px #000' : '';
      r.color = style.highContrast
        ? HIGH_CONTRAST_COLOR
        : style.colors && line.level === 'important'
          ? IMPORTANT_COLOR
          : PLAIN_COLOR;
      r.fontSize = `${style.fontPx}px`;
      r.whiteSpace = 'nowrap';
      this.box.append(row);
    }
  }

  dispose(): void {
    this.box.remove();
  }
}
