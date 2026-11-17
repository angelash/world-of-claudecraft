// Small DOM kit shared by the gameplay windows: signature-elided rebuilds, key-value
// rows, badges, progress bars, tab strips and buttons that queue adapter commands.

import { clear, el } from '../../shared_ui/dom';
import type { ClientCommand } from '../view/game_view';
import type { WindowContext } from './window_context';

/** Rebuild `root` with `render(data)` only when `compute()` returns different data. */
export function rebuilder<T>(
  root: HTMLElement,
  compute: () => T,
  render: (data: T) => void,
): () => void {
  let sig = '';
  return () => {
    const data = compute();
    const next = JSON.stringify(data) ?? '';
    if (next === sig) return;
    sig = next;
    clear(root);
    render(data);
  };
}

export function kv(label: string, value: string, cls = ''): HTMLElement {
  return el('div', { className: `hk-kv ${cls}`.trim() }, [
    el('span', { className: 'hk-muted', text: label }),
    el('span', { text: value }),
  ]);
}

export function badge(text: string, cls = ''): HTMLElement {
  return el('span', { className: `hk-badge ${cls}`.trim(), text });
}

export function progress(value: number, max: number, text: string, cls = ''): HTMLElement {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = el('div', { className: 'hk-bar-fill' });
  fill.style.width = `${pct.toFixed(1)}%`;
  return el('div', { className: `hk-bar ${cls}`.trim() }, [
    fill,
    el('span', { className: 'hk-bar-text', text }),
  ]);
}

export function actionButton(
  ctx: WindowContext,
  label: string,
  make: () => readonly ClientCommand[] | null | undefined,
  opts: { disabled?: boolean; title?: string; cls?: string; confirm?: string } = {},
): HTMLButtonElement {
  return el('button', {
    className: `hk-btn hk-btn-small ${opts.cls ?? ''}`.trim(),
    text: label,
    title: opts.title ?? '',
    attrs: opts.disabled ? { type: 'button', disabled: '' } : { type: 'button' },
    on: {
      click: () => {
        if (opts.confirm && !window.confirm(opts.confirm)) return;
        const cmds = make();
        if (cmds?.length) ctx.commands.queueAll(cmds);
      },
    },
  });
}

/** Tab strip; returns the strip and the body element whose content the caller renders. */
export function tabs<K extends string>(
  items: readonly { id: K; label: string }[],
  initial: K,
  onChange: (id: K) => void,
): { strip: HTMLElement; current: () => K } {
  let cur = initial;
  const strip = el('div', { className: 'hk-tabs', attrs: { role: 'tablist' } });
  const buttons = items.map((it) => {
    // aria-selected marks the current tab: the window tab keys and the pad's LB and RB step
    // from it (input_layer.ts tab)
    const b = el('button', {
      className: `hk-tab${it.id === cur ? ' active' : ''}`,
      text: it.label,
      attrs: { type: 'button', role: 'tab', 'aria-selected': String(it.id === cur) },
      on: {
        click: () => {
          cur = it.id;
          for (const x of buttons) {
            x.classList.toggle('active', x === b);
            x.setAttribute('aria-selected', String(x === b));
          }
          onChange(cur);
        },
      },
    });
    return b;
  });
  strip.append(...buttons);
  return { strip, current: () => cur };
}

export function empty(text: string): HTMLElement {
  return el('p', { className: 'hk-muted hk-empty', text });
}
