import { describe, expect, it } from 'vitest';
import { hexToPx, lightness } from '../tools/assets/core/color';
import { createImg, getPx, setPx } from '../tools/assets/core/image';
import { RESERVED_SEMANTIC_HEX } from '../tools/assets/core/palettes';
import { processArt } from '../tools/assets/core/pipeline';

const ANCHORS = ['#2e5a30', '#5a3e2a', '#e0d8a0'];

function importScene(
  id: string,
  color: string,
  style = 'wild_forest',
  anchors = ANCHORS,
  patches = false,
) {
  const src = createImg(384, 216);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const fill =
        patches && x >= 32 && x < 160 && y >= 32 && y < 160
          ? '#efd78f'
          : patches && x >= 200 && x < 320 && y >= 120 && y < 200
            ? '#5a3e2a'
            : color;
      setPx(src, x, y, hexToPx(fill));
    }
  }
  return processArt({
    id,
    template: 'bg_cg',
    templateDef: { canvas: '384x216', final: '96x54', grid: '1x1', background: 'opaque' },
    style,
    styleAnchors: anchors,
    src,
    sourceFile: `art/backgrounds/cg/${id}.png`,
    sourceSha256: 'fixture',
    aigcLabel: 'none',
  });
}

describe('style palette semantic colors', () => {
  it('maps ordinary forest light through its declared anchors without introducing magic colors', () => {
    const result = importScene('art_style_wild_forest', '#2e5a30', 'wild_forest', ANCHORS, true);
    expect(result.problems.filter((p) => !p.warning)).toEqual([]);
    expect(result.meta.swatch.some((hex) => RESERVED_SEMANTIC_HEX.includes(hex))).toBe(false);
    const img = result.img;
    if (!img) throw new Error('Scene import did not produce an image');
    expect([img.w, img.h]).toEqual([96, 54]);
    expect(lightness(getPx(img, 20, 20))).toBeGreaterThan(lightness(getPx(img, 80, 5)));
    expect(getPx(img, 66, 40)).toBe(hexToPx('#5a3e2a'));
  });

  it('preserves door gold for a subject that explicitly uses it', () => {
    const result = importScene('art_bg_wild_forest_door', '#f0d890');
    expect(result.meta.swatch).toContain('#f0d890');
    expect(result.problems.filter((p) => !p.warning)).toEqual([]);
  });

  it('preserves reserved colors for the divine-court pack', () => {
    const result = importScene('art_bg_court_scene', '#fff4d6', 'divine_court');
    expect(result.meta.swatch).toContain('#fff4d6');
    expect(result.problems.filter((p) => !p.warning)).toEqual([]);
  });

  it('retains explicitly declared anchor colors and still rejects their forbidden large share', () => {
    const result = importScene('art_bg_forest_scene', '#4a3a62', 'wild_forest', [
      ...ANCHORS,
      '#4a3a62',
    ]);
    expect(result.meta.swatch).toContain('#4a3a62');
    expect(result.problems.some((p) => p.check === 'reserved_share' && !p.warning)).toBe(true);
  });
});
