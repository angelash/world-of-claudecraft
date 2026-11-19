// Flat UI glyphs share a small palette. Nearby encoder shades belong to one vote when
// reducing a stroke, and their contour stays neutral instead of turning ivory into brown.

import { outlineStats } from './checks';
import { labOf } from './color';
import { type Img, pack } from './image';
import { type OutlinePainter, type OutlineResult, outlineFrame } from './outline';
import { nearest, type Palette, type PaletteColor, UI_PALETTE } from './palettes';
import type { OutlinePolicy } from './template_specs';
import { uiMarkerPalette } from './ui_marker_palette';
import { uiSemanticPalette } from './ui_semantic_palette';

const NEUTRAL_OUTLINES = new Set([
  '#1c1a24',
  '#3a3646',
  '#6a6478',
  '#a8a2b4',
  '#e8e4ec',
  '#ffffff',
]);

export function uiGlyphOutlineColors(): PaletteColor[] {
  return UI_PALETTE.colors.filter((c) => NEUTRAL_OUTLINES.has(c.hex));
}

/** Window/menu glyphs are ivory and gray; only the corridor's light may use door gold. */
export function uiGlyphPalette(id: string): Palette {
  const semantic = uiSemanticPalette(id);
  if (semantic) return semantic;
  const marker = uiMarkerPalette(id);
  if (marker) return marker;
  if (id === 'art_ico_sys_cur_health') {
    // This symbol's specified fill is red. The general palette's brown is not a red shade.
    return {
      ...UI_PALETTE,
      colors: UI_PALETTE.colors.filter((c) => NEUTRAL_OUTLINES.has(c.hex) || c.hex === '#d83a3a'),
    };
  }
  if (!id.startsWith('art_ico_sys_win_')) return UI_PALETTE;
  return {
    ...UI_PALETTE,
    colors: UI_PALETTE.colors.filter(
      (c) =>
        NEUTRAL_OUTLINES.has(c.hex) ||
        c.hex === '#f4ead0' ||
        (id === 'art_ico_sys_win_doors' && c.hex === '#f0d890'),
    ),
  };
}

/** Preserve an existing conforming UI contour instead of dilating its diagonal steps again. */
export function outlineUiGlyph(
  src: Img,
  painter: OutlinePainter,
  policy: OutlinePolicy,
  big: boolean,
): OutlineResult {
  const s = outlineStats(src);
  if (s.rim > 0 && s.darker / s.rim >= 0.6 && s.doubled / s.rim <= 0.5) {
    return { img: src, padded: false, stripped: 0, added: 0 };
  }
  return outlineFrame(src, painter, policy, big);
}

/** Grouping changes votes only; the reducer still returns the original bucket's RGB mean. */
export function uiGlyphBucket(palette: Palette): (r: number, g: number, b: number) => number {
  const cache = new Map<number, number>();
  return (r, g, b) => {
    const px = pack(r, g, b, 255);
    let bucket = cache.get(px);
    if (bucket === undefined) {
      bucket = nearest(palette.colors, labOf(px)).color.px;
      cache.set(px, bucket);
    }
    return bucket;
  };
}
