// The model of `ui_mode_creator`, the spirit mirror (ux_and_onboarding.md 3.4.3): four pages
// (body, face, hair, outfit), each a few option rows of cells; the focused row cycles with the
// arrows or the pad, "随机" draws a look, "还原" returns to the look the mirror opened with,
// "照好了" closes it with the result. The preview standee turns through four directions. Any
// combination is valid (no error state). Pure: the painter (creator_panel.ts) only writes DOM,
// the session supplies the random source and the clock.

import { t, tOr } from '../../../shared_ui/i18n';
import type { Dir } from '../../sprites/anim_spec';
import {
  CREATOR_HAIR_COLORS,
  CREATOR_PALETTES,
  CREATOR_ROWS,
  CREATOR_SKINS,
  type CreatorLook,
  type CreatorRow,
  optionId,
  randomLook,
  rowIndex,
  rowSize,
  withRow,
} from './creator_look';

export const CREATOR_PAGES: readonly { id: string; rows: readonly CreatorRow[] }[] = [
  { id: 'body', rows: ['sex', 'body'] },
  { id: 'face', rows: ['eyes', 'mouth', 'skin'] },
  { id: 'hair', rows: ['hair', 'hairColor'] },
  { id: 'outfit', rows: ['outfit', 'palette'] },
];

/** Preview directions, turned in this order (the four views of D-078). */
export const PREVIEW_DIRS: readonly Dir[] = ['down', 'right', 'up', 'left'];

export interface CreatorState {
  look: CreatorLook;
  /** the look the mirror opened with ("还原") */
  initial: CreatorLook;
  page: number;
  row: number;
  /** index into PREVIEW_DIRS */
  facing: number;
}

export function openCreator(look: CreatorLook): CreatorState {
  return { look, initial: look, page: 0, row: 0, facing: 0 };
}

function rowsOf(s: CreatorState): readonly CreatorRow[] {
  return CREATOR_PAGES[s.page]?.rows ?? [];
}

/** The focused option row. */
export function focusedRow(s: CreatorState): CreatorRow {
  return rowsOf(s)[s.row] ?? 'sex';
}

export type CreatorAction =
  | { type: 'page'; delta: 1 | -1 }
  | { type: 'goto_page'; page: number }
  | { type: 'row'; delta: 1 | -1 }
  | { type: 'cycle'; delta: 1 | -1 }
  | { type: 'pick'; row: CreatorRow; index: number }
  | { type: 'random'; rand: () => number }
  | { type: 'reset' }
  | { type: 'turn'; delta: 1 | -1 };

export function creatorReduce(s: CreatorState, a: CreatorAction): CreatorState {
  const pages = CREATOR_PAGES.length;
  switch (a.type) {
    case 'page':
      return { ...s, page: (s.page + a.delta + pages) % pages, row: 0 };
    case 'goto_page':
      return a.page >= 0 && a.page < pages ? { ...s, page: a.page, row: 0 } : s;
    case 'row': {
      const n = rowsOf(s).length;
      return n > 0 ? { ...s, row: (s.row + a.delta + n) % n } : s;
    }
    case 'cycle': {
      const row = focusedRow(s);
      return { ...s, look: withRow(s.look, row, rowIndex(s.look, row) + a.delta) };
    }
    case 'pick': {
      const page = CREATOR_PAGES.findIndex((p) => p.rows.includes(a.row));
      if (page < 0 || a.index < 0 || a.index >= rowSize(a.row)) return s;
      const row = CREATOR_PAGES[page]?.rows.indexOf(a.row) ?? 0;
      return { ...s, page, row, look: withRow(s.look, a.row, a.index) };
    }
    case 'random':
      return { ...s, look: randomLook(a.rand) };
    case 'reset':
      return { ...s, look: s.initial };
    case 'turn':
      return { ...s, facing: (s.facing + a.delta + PREVIEW_DIRS.length) % PREVIEW_DIRS.length };
  }
}

export interface CreatorCell {
  index: number;
  label: string;
  /** a colour swatch (skin, hair colour, palette) */
  swatch: string[] | null;
  selected: boolean;
}

export interface CreatorRowView {
  id: CreatorRow;
  label: string;
  focused: boolean;
  cells: CreatorCell[];
}

export interface CreatorView {
  key: string;
  title: string;
  pages: { label: string; active: boolean }[];
  rows: CreatorRowView[];
  /** preview facing */
  dir: Dir;
  /** the preview's accessible name */
  preview: string;
  random: string;
  reset: string;
  done: string;
  turnLeft: string;
  turnRight: string;
  /** what the mirror shows when the part art is not in yet (placeholder note) */
  note: string;
}

function swatchOf(row: CreatorRow, i: number): string[] | null {
  if (row === 'skin') return [CREATOR_SKINS[i] ?? '#000000'];
  if (row === 'hairColor') return [CREATOR_HAIR_COLORS[i] ?? '#000000'];
  if (row === 'palette') return [...(CREATOR_PALETTES[i] ?? [])];
  return null;
}

/** Rows whose cells are named options (the others are colour swatches). */
type NamedRow = Exclude<CreatorRow, 'skin' | 'hairColor' | 'palette'>;

function cellLabel(row: CreatorRow, i: number): string {
  if (swatchOf(row, i)) return t('ui.mode.creator.swatch', { n: i + 1 });
  const id = optionId(row, i);
  return tOr(`ui.mode.creator.opt.${row as NamedRow}.${id}`, id);
}

/** A row's label key part (text keys are lower case with underscores). */
function rowKey(row: CreatorRow): Exclude<CreatorRow, 'hairColor'> | 'hair_color' {
  return row === 'hairColor' ? 'hair_color' : row;
}

export function creatorView(s: CreatorState, hasArt: boolean): CreatorView {
  const rows = rowsOf(s).map((row, r) => ({
    id: row,
    label: t(`ui.mode.creator.row.${rowKey(row)}`),
    focused: r === s.row,
    cells: Array.from({ length: rowSize(row) }, (_, i) => ({
      index: i,
      label: cellLabel(row, i),
      swatch: swatchOf(row, i),
      selected: rowIndex(s.look, row) === i,
    })),
  }));
  return {
    key: `${CREATOR_ROWS.map((r) => rowIndex(s.look, r)).join('.')}|${s.page}|${s.row}|${s.facing}`,
    title: t('ui.mode.creator.title'),
    pages: CREATOR_PAGES.map((p, i) => ({
      label: t(`ui.mode.creator.page.${p.id}`),
      active: i === s.page,
    })),
    rows,
    dir: PREVIEW_DIRS[s.facing] ?? 'down',
    preview: t('ui.mode.creator.preview'),
    random: t('ui.mode.creator.random'),
    reset: t('ui.mode.creator.reset'),
    done: t('ui.mode.creator.done'),
    turnLeft: t('ui.mode.creator.turn_left'),
    turnRight: t('ui.mode.creator.turn_right'),
    note: hasArt ? '' : t('ui.mode.creator.placeholder_note'),
  };
}
