// Focus navigation (ux_and_onboarding.md 1.3, 16.3 "windows and menus"; release_engineering.md
// 4.4): HUD windows and menus are navigated by direction. Given the focusable controls of the
// front window (or the title screen) as rectangles in reading order, a direction moves to the
// nearest control whose centre lies that way, weighing the off-axis distance double so a
// press goes to the control in line before one off to the side; with none that way the
// focus wraps to the far end along the same axis. `next` and `prev` walk the reading order.
// Pure: the painter measures the DOM.

import type { StickDir } from './pad_bindings';

export interface FocusRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FocusMove = StickDir | 'next' | 'prev';

const center = (r: FocusRect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** The control focus moves to, or null when there is none. */
export function moveFocus(
  rects: readonly FocusRect[],
  current: string | null,
  move: FocusMove,
): string | null {
  if (rects.length === 0) return null;
  const i = current ? rects.findIndex((r) => r.id === current) : -1;
  if (i < 0) return (rects[0] as FocusRect).id;
  if (move === 'next') return (rects[(i + 1) % rects.length] as FocusRect).id;
  if (move === 'prev') return (rects[(i - 1 + rects.length) % rects.length] as FocusRect).id;
  const from = center(rects[i] as FocusRect);
  const horizontal = move === 'left' || move === 'right';
  const sign = move === 'right' || move === 'down' ? 1 : -1;
  let best: { id: string; score: number } | null = null;
  for (const r of rects) {
    if (r.id === current) continue;
    const c = center(r);
    const along = (horizontal ? c.x - from.x : c.y - from.y) * sign;
    const across = Math.abs(horizontal ? c.y - from.y : c.x - from.x);
    if (along <= 1) continue;
    const score = along + across * 2;
    if (!best || score < best.score) best = { id: r.id, score };
  }
  if (best) return best.id;
  // wrap: the control farthest the other way, nearest in line
  let wrap: { id: string; score: number } | null = null;
  for (const r of rects) {
    if (r.id === current) continue;
    const c = center(r);
    const back = (horizontal ? from.x - c.x : from.y - c.y) * sign;
    const across = Math.abs(horizontal ? c.y - from.y : c.x - from.x);
    if (back <= 1) continue;
    const score = -back + across * 2;
    if (!wrap || score < wrap.score) wrap = { id: r.id, score };
  }
  return wrap?.id ?? current;
}
