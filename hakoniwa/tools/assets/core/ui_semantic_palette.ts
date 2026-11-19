// Frozen subject colors override the generic UI board only for these exact glyph IDs.
// Coin gold is explicitly #e0a832. Crimson and teal use existing canonical creature colors;
// the near-black UI contour remains #1c1a24. Each board has at most two fills plus contour.
import { type Palette, paletteColor } from './palettes';

const SUBJECT_COLORS: Readonly<Record<string, readonly string[]>> = {
  art_ico_div_emblem_merca: ['#1c1a24', '#a88a40', '#e0a832'],
  art_ico_div_emblem_valda: ['#1c1a24', '#8a1424', '#d83a3a'],
  art_ico_sys_ai_builtin: ['#1c1a24', '#2c706c', '#5aaa9e'],
};

export function uiSemanticPalette(id: string): Palette | null {
  const colors = Object.hasOwn(SUBJECT_COLORS, id) ? SUBJECT_COLORS[id] : undefined;
  return colors
    ? { id: `ui:${id}`, colors: colors.map((hex, i) => paletteColor(hex, 'ui', i)) }
    : null;
}
