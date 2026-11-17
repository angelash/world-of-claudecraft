// Caption painter: the thin DOM side of ./captions.ts (audio_direction.md 10.4). It writes the
// board's lines at the bottom centre of the screen, above the world and below the windows,
// and redraws only when the board's stamp changes. A minimal display for M1: the accessibility
// page and the caption styling (size, background opacity, speaker colours) belong to the
// interface packages (PK-M1-23). Styles are inline so the painter needs no stylesheet entry.

import { clear, el } from '../../shared_ui/dom';
import { t, tOr } from '../../shared_ui/i18n';
import type { CaptionLine } from './captions';

export class CaptionPainter {
  private readonly box: HTMLDivElement;
  private stamp = -1;

  constructor(root: HTMLElement) {
    this.box = el('div', {
      className: 'hk-captions',
      attrs: { role: 'status', 'aria-live': 'polite' },
    });
    const s = this.box.style;
    s.position = 'absolute';
    s.left = '50%';
    s.bottom = '18vh';
    s.transform = 'translateX(-50%)';
    s.display = 'flex';
    s.flexDirection = 'column';
    s.alignItems = 'center';
    s.gap = '4px';
    s.pointerEvents = 'none';
    s.zIndex = '55';
    root.append(this.box);
  }

  /** Draw the lines when the board changed since the last call. */
  paint(lines: readonly CaptionLine[], stamp: number): void {
    if (stamp === this.stamp) return;
    this.stamp = stamp;
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
      r.background = 'rgba(8, 6, 14, 0.72)';
      r.color = line.level === 'important' ? '#f2e2b8' : '#d8d4cc';
      r.fontSize = '15px';
      r.whiteSpace = 'nowrap';
      this.box.append(row);
    }
  }

  dispose(): void {
    this.box.remove();
  }
}
