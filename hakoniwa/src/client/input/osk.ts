// The floating keyboard (release_engineering.md 4.4 "text input", 4.8; ux_and_onboarding.md
// 16.1, 19.2): a gamepad player types into a free-text field (the prologue's name, a free
// line to a goddess) on an on-screen key grid. Pages: Latin letters and digits, and a page of
// common Han characters read from the string table (ui.pop.osk.han_page), so a name in either
// script can be typed without a keyboard; the last row turns the page, types a space,
// deletes, submits an empty answer (the field's own default, for example the prologue's
// unnamed traveller) and finishes. The text never grows past the field's maximum length.
// Steam's own floating keyboard takes over when the platform offers it (a later package).
// Pure.

import type { StickDir } from './pad_bindings';

export type OskPage = 'latin' | 'han';
export const OSK_PAGES: readonly OskPage[] = ['latin', 'han'];

export type OskKey =
  | { kind: 'char'; ch: string }
  | { kind: 'page' }
  | { kind: 'caps' }
  | { kind: 'space' }
  | { kind: 'back' }
  | { kind: 'empty' }
  | { kind: 'done' };

export interface OskState {
  page: OskPage;
  row: number;
  col: number;
  text: string;
  maxLength: number;
  caps: boolean;
}

/** Han characters per row on the Han page. */
export const HAN_ROW = 10;

const LATIN_ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

const ACTION_ROW: readonly OskKey[] = [
  { kind: 'page' },
  { kind: 'caps' },
  { kind: 'space' },
  { kind: 'back' },
  { kind: 'empty' },
  { kind: 'done' },
];

/** The key grid of a page; `han` is the Han page's characters in order. */
export function oskRows(page: OskPage, han: string, caps: boolean): OskKey[][] {
  const rows: OskKey[][] = [];
  if (page === 'latin') {
    for (const r of LATIN_ROWS) {
      rows.push(Array.from(r, (ch) => ({ kind: 'char', ch: caps ? ch.toUpperCase() : ch })));
    }
  } else {
    const chars = Array.from(han).filter((c) => c.trim() !== '');
    for (let i = 0; i < chars.length; i += HAN_ROW) {
      rows.push(chars.slice(i, i + HAN_ROW).map((ch) => ({ kind: 'char', ch })));
    }
    if (rows.length === 0) rows.push([]);
  }
  rows.push([...ACTION_ROW]);
  return rows.filter((r) => r.length > 0);
}

export function openOsk(maxLength: number, page: OskPage = 'han'): OskState {
  return { page, row: 0, col: 0, text: '', maxLength: Math.max(1, maxLength), caps: false };
}

/** The key under the cursor. */
export function oskKeyAt(s: OskState, han: string): OskKey | undefined {
  const rows = oskRows(s.page, han, s.caps);
  return rows[Math.min(s.row, rows.length - 1)]?.[s.col];
}

/** Move the cursor; rows of different length keep the column in proportion; wraps. */
export function oskMove(s: OskState, dir: StickDir, han: string): OskState {
  const rows = oskRows(s.page, han, s.caps);
  const row = Math.min(s.row, rows.length - 1);
  const cur = rows[row] as OskKey[];
  if (dir === 'left' || dir === 'right') {
    const col = (s.col + (dir === 'right' ? 1 : -1) + cur.length) % cur.length;
    return { ...s, row, col };
  }
  const next = (row + (dir === 'down' ? 1 : -1) + rows.length) % rows.length;
  const target = rows[next] as OskKey[];
  const frac = cur.length > 1 ? s.col / (cur.length - 1) : 0;
  const col = Math.round(frac * Math.max(0, target.length - 1));
  return { ...s, row: next, col };
}

export type OskResult =
  | { type: 'edit'; state: OskState }
  | { type: 'submit'; text: string }
  | { type: 'cancel' };

/** Type one character, unless the text is at its maximum length. */
export function oskType(s: OskState, ch: string): OskState {
  if (Array.from(s.text).length + Array.from(ch).length > s.maxLength) return s;
  return { ...s, text: s.text + ch };
}

export function oskBackspace(s: OskState): OskState {
  const chars = Array.from(s.text);
  chars.pop();
  return { ...s, text: chars.join('') };
}

export function oskTurnPage(s: OskState, delta: number): OskState {
  const i = OSK_PAGES.indexOf(s.page);
  const page = OSK_PAGES[
    (((i + delta) % OSK_PAGES.length) + OSK_PAGES.length) % OSK_PAGES.length
  ] as OskPage;
  return { ...s, page, row: 0, col: 0 };
}

/** Press the key under the cursor. */
export function oskPress(s: OskState, han: string): OskResult {
  const key = oskKeyAt(s, han);
  if (!key) return { type: 'edit', state: s };
  switch (key.kind) {
    case 'char':
      return { type: 'edit', state: oskType(s, key.ch) };
    case 'space':
      return { type: 'edit', state: oskType(s, ' ') };
    case 'back':
      return { type: 'edit', state: oskBackspace(s) };
    case 'caps':
      return { type: 'edit', state: { ...s, caps: !s.caps } };
    case 'page': {
      const next = oskTurnPage(s, 1);
      const rows = oskRows(next.page, han, next.caps);
      // keep the cursor on the page key so pages can be flipped in a row
      return { type: 'edit', state: { ...next, row: rows.length - 1, col: 0 } };
    }
    case 'empty':
      return { type: 'submit', text: '' };
    case 'done':
      return { type: 'submit', text: s.text.trim() };
  }
}

/** B: delete a character, or close the keyboard when the text is already empty. */
export function oskBack(s: OskState): OskResult {
  if (s.text.length === 0) return { type: 'cancel' };
  return { type: 'edit', state: oskBackspace(s) };
}
