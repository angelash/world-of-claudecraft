import { type Palette, UI_PALETTE } from './palettes';

const QUESTION_COLORS = new Set(['#1c1a24', '#3a3646', '#5aa8f0', '#58cce6']);

/** A pale blue question glyph keeps its specified hue instead of collapsing to ivory. */
export function uiMarkerPalette(id: string): Palette | null {
  if (id !== 'art_ico_marker_question') return null;
  return {
    ...UI_PALETTE,
    colors: UI_PALETTE.colors.filter((c) => QUESTION_COLORS.has(c.hex)),
  };
}
