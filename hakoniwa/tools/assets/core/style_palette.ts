import { reservedExempt } from './checks';
import type { Palette } from './palettes';

/** Ordinary material highlights use the pack's anchors; appended semantic colors need a subject. */
export function styleQuantizationPalette(
  palette: Palette,
  assetId: string,
  style: string | null | undefined,
): Palette {
  if (!palette.id.startsWith('style:') || reservedExempt(assetId, style)) return palette;
  // A reserved color explicitly declared as an anchor remains in its anchor ramp. The unchanged
  // reserved-share validator still rejects an excessive share of that color after import.
  const colors = palette.colors.filter((c) => c.ramp !== 'reserved');
  return colors.length === palette.colors.length ? palette : { ...palette, colors };
}
