// Frozen item requirements can distinguish colors that unrestricted nearest mapping merges.
// Policies constrain the declared material or stamp using each original source pixel.
// No colors are added to the fixed creature palette, and other items keep their candidates.

import { type Lab, lch } from './color';
import type { PaletteColor } from './palettes';

export interface ItemSemanticPalettePolicy {
  metadata: {
    subject: string;
    sourceChromaMin?: number;
    sourceChromaMax?: number;
    candidateChromaMax?: number;
    sourceHue?: [number, number];
    candidateRamps: string[];
    excludedCandidates?: string[];
    extraCandidates?: string[];
    missingCandidates: string;
  };
  candidatesFor: (colors: readonly PaletteColor[], source: Lab) => readonly PaletteColor[];
}

function clayPalette(): ItemSemanticPalettePolicy {
  const sourceChromaMax = 0.06;
  const candidateChromaMax = 0.065;
  const candidateRamps = ['cloth_cream', 'leather', 'skin', 'hair'];
  const excludedCandidates = ['#b8bcc8', '#eceaf0'];
  const extraCandidates = ['#ffffff'];
  return {
    metadata: {
      subject: 'required grey-brown wet clay material',
      sourceChromaMax,
      candidateChromaMax,
      candidateRamps,
      excludedCandidates,
      extraCandidates,
      missingCandidates: 'nearest supplied palette fallback',
    },
    candidatesFor: (colors, source) => {
      if (lch(source).C > sourceChromaMax) return colors;
      const soil = colors.filter(
        (color) =>
          extraCandidates.includes(color.hex) ||
          (candidateRamps.includes(color.ramp) &&
            !excludedCandidates.includes(color.hex) &&
            lch(color.lab).C <= candidateChromaMax),
      );
      return soil.length > 0 ? soil : colors;
    },
  };
}

/** Frozen requirements distinguish the grey-brown clay and the bright red guild stamp. */
export function itemSemanticPaletteFor(assetId: string): ItemSemanticPalettePolicy | null {
  if (assetId === 'art_ico_item_mat_clay') return clayPalette();
  if (assetId !== 'art_ico_item_bounty_voucher') return null;
  const sourceChromaMin = 0.08;
  const sourceHue: [number, number] = [0, 45];
  const candidateRamps = ['cloth_red'];
  return {
    metadata: {
      subject: 'required red guild stamp',
      sourceChromaMin,
      sourceHue,
      candidateRamps,
      missingCandidates: 'nearest supplied palette fallback',
    },
    candidatesFor: (colors, source) => {
      const { C, H } = lch(source);
      if (C < sourceChromaMin || H < sourceHue[0] || H > sourceHue[1]) return colors;
      const red = colors.filter((color) => candidateRamps.includes(color.ramp));
      return red.length > 0 ? red : colors;
    },
  };
}
