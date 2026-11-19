// Frozen asset-specific requirements supplement the color caps in the template rules.
import { type Palette, paletteColor } from './palettes';

/** Zero-based frames declared as a single point, late light grains or fine falling snow. */
export function vfxSparseFramesFor(assetId: string): readonly number[] | undefined {
  if (assetId === 'art_vfx_school_arcane_cast') return [3, 6];
  if (assetId === 'art_vfx_school_frost_cast' || assetId === 'art_vfx_school_arcane_hit')
    return [6];
  return undefined;
}

export function vfxColorCapFor(assetId: string): number | undefined {
  return assetId === 'art_vfx_door_sigil_flash' || assetId === 'art_vfx_dian_mist' ? 4 : undefined;
}

/** Written cutscene endings that stay visible, overriding the template's generic fade. */
const HELD_FINAL_LIGHTS: ReadonlySet<string> = new Set([
  'art_vfx_cut_earth_door',
  'art_vfx_cut_a1_talent_windows',
  'art_vfx_cut_white_in',
  'art_vfx_cut_trial_mirror_void',
  'art_vfx_cut_halo_stop',
  'art_vfx_cut_one_way_door',
  'art_vfx_cut_stele_white',
  'art_vfx_cut_tile_crack',
]);

export function vfxKeepsFinalLight(assetId: string): boolean {
  return HELD_FINAL_LIGHTS.has(assetId);
}

/** White-in explicitly fills its whole final cell, including its edges. */
export function vfxFillsCell(assetId: string): boolean {
  return assetId === 'art_vfx_cut_white_in';
}

/** Traveling subjects keep cell-relative motion; centering the group would cancel it. */
export function vfxMovesInCell(assetId: string): boolean {
  return (
    assetId === 'art_vfx_amb_crow_shadow' ||
    assetId === 'art_vfx_amb_falling_leaves' ||
    assetId === 'art_vfx_amb_petals'
  );
}

/** Preserve the specified semantic hues and bright edges instead of averaging them away. */
export function vfxPaletteFor(assetId: string): Palette | null {
  const colors =
    assetId === 'art_vfx_door_sigil_flash'
      ? ['#75643a', '#b19a56', '#f0d890', '#fffae8']
      : assetId === 'art_vfx_dian_mist'
        ? ['#2a2038', '#4a3a62', '#6a5a8a']
        : assetId === 'art_vfx_school_arcane_projectile'
          ? ['#030203', '#fa22fb', '#00ffff', '#ffffff']
          : null;
  return colors
    ? { id: `vfx:${assetId}`, colors: colors.map((hex, i) => paletteColor(hex, 'vfx', i)) }
    : null;
}
