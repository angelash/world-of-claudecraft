import { describe, expect, it } from 'vitest';
import { deltaE, hexToPx, labOf } from '../tools/assets/core/color';
import { createImg, getPx, resizeNearest, setPx } from '../tools/assets/core/image';
import { OutlinePainter } from '../tools/assets/core/outline';
import { CREATURE_PALETTE, paletteColor } from '../tools/assets/core/palettes';
import { processArt } from '../tools/assets/core/pipeline';
import { quantizeFrames } from '../tools/assets/core/quantize';

function item(color: string, accents = false) {
  const logical = createImg(32, 32);
  for (let y = 6; y < 26; y++) {
    for (let x = 6; x < 26; x++) setPx(logical, x, y, hexToPx(color));
  }
  if (accents) {
    setPx(logical, 12, 12, hexToPx('#c0582e'));
    setPx(logical, 19, 19, hexToPx('#f2cba8'));
  }
  return processArt({
    id: 'art_ico_item_neutral_material_fixture',
    template: 'ico_item',
    templateDef: {
      canvas: '1024x1024',
      final: '32x32',
      grid: '1x1',
      background: '#ff00ff',
    },
    src: resizeNearest(logical, 1024, 1024),
    sourceFile: 'art/icons/items/art_ico_item_neutral_material_fixture.png',
    sourceSha256: 'fixture',
    aigcLabel: 'none',
  });
}

describe('neutral item material color', () => {
  it('keeps the light-grey silk shade from becoming peach skin', () => {
    const result = item('#d5d5d3');
    expect(result.problems.filter((p) => !p.warning)).toEqual([]);
    expect(result.meta.swatch).not.toContain('#f2cba8');
    for (const hex of result.meta.swatch) {
      const lab = labOf(hexToPx(hex));
      expect(Math.hypot(lab[1], lab[2]), hex).toBeLessThanOrEqual(0.031);
    }
  });

  it('does not add chromatic edges around already neutral white metal', () => {
    const result = item('#e6eaee');
    for (const hex of result.meta.swatch) {
      const lab = labOf(hexToPx(hex));
      expect(Math.hypot(lab[1], lab[2]), hex).toBeLessThanOrEqual(0.031);
    }
  });

  it('reports the actual error to the chosen color instead of the unrestricted minimum', () => {
    const result = item('#d5d5d3');
    if (!result.img) throw new Error('Item import did not produce an image');
    const actual = deltaE(labOf(hexToPx('#d5d5d3')), labOf(getPx(result.img, 16, 16)));
    expect(result.meta.processing.quantError).toBe(Number(actual.toFixed(4)));
    expect(actual).toBeGreaterThan(0);
  });

  it('preserves intentional colored details on a mostly neutral item', () => {
    const result = item('#d5d5d3', true);
    expect(result.meta.swatch).toContain('#c0582e');
    expect(result.meta.swatch).toContain('#f2cba8');
  });

  it('does not desaturate an intentional skin-colored material', () => {
    const result = item('#e0ad84');
    if (!result.img) throw new Error('Item import did not produce an image');
    expect(getPx(result.img, 16, 16)).toBe(hexToPx('#e0ad84'));
  });

  it('retains ordinary nearest-color behavior when no material policy is requested', () => {
    const src = createImg(1, 1);
    setPx(src, 0, 0, hexToPx('#d5d5d3'));
    const result = quantizeFrames([src], CREATURE_PALETTE);
    const frame = result.frames[0];
    if (!frame) throw new Error('Quantization did not return a frame');
    expect(getPx(frame, 0, 0)).toBe(hexToPx('#f2cba8'));
  });

  it('still rejects an actual quantization error above the hard limit', () => {
    const result = item('#00ff00');
    expect(result.problems.some((p) => p.check === 'quant_error' && !p.warning)).toBe(true);
  });

  it('does not invent a neutral shadow when a sparse palette has none', () => {
    const only = paletteColor('#7a1c30', 'only', 0);
    const result = new OutlinePainter([only]).colorFor(hexToPx('#d5d5d3'), 'normal');
    expect(result).toBe(only.px);
  });
});
