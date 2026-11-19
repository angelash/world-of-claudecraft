import { describe, expect, it } from 'vitest';
import { deltaE, hexToPx, labOf, lch } from '../tools/assets/core/color';
import { createImg, getPx, resizeNearest, setPx } from '../tools/assets/core/image';
import { CREATURE_PALETTE } from '../tools/assets/core/palettes';
import { processArt } from '../tools/assets/core/pipeline';
import { quantizeFrames } from '../tools/assets/core/quantize';

function item(id: string, color: string, accents = false, template = 'ico_item', patch?: string) {
  const logical = createImg(32, 32);
  for (let y = 6; y < 26; y++) {
    for (let x = 6; x < 26; x++) setPx(logical, x, y, hexToPx(color));
  }
  if (patch) {
    for (let y = 12; y < 20; y++) {
      for (let x = 12; x < 20; x++) setPx(logical, x, y, hexToPx(patch));
    }
  }
  if (accents) {
    setPx(logical, 10, 10, hexToPx('#805836'));
    setPx(logical, 20, 10, hexToPx('#f0e8d2'));
    setPx(logical, 10, 20, hexToPx('#d5d5d3'));
    setPx(logical, 16, 10, hexToPx('#ffffff'));
    setPx(logical, 20, 20, 0);
  }
  return processArt({
    id,
    template,
    templateDef: {
      canvas: '1024x1024',
      final: '32x32',
      grid: '1x1',
      background: '#ff00ff',
    },
    src: resizeNearest(logical, 1024, 1024),
    sourceFile: `art/icons/items/${id}.png`,
    sourceSha256: 'fixture',
    aigcLabel: 'none',
  });
}

describe('explicit item color semantics', () => {
  it('keeps the required red guild stamp red after encoder shade variation', () => {
    const result = item('art_ico_item_bounty_voucher', '#c44a3b');
    expect(result.problems.filter((p) => !p.warning)).toEqual([]);
    if (!result.img) throw new Error('Item image missing');
    expect(getPx(result.img, 16, 16)).toBe(hexToPx('#d4584c'));
    expect(result.meta.swatch).not.toContain('#c0582e');
    expect(result.meta.processing.itemSemanticPaletteSelection).toBeDefined();
  });

  it('reports the actual distance to the selected red rather than a nearer orange', () => {
    const result = item('art_ico_item_bounty_voucher', '#c44a3b');
    const source = labOf(hexToPx('#c44a3b'));
    const selectedError = deltaE(source, labOf(hexToPx('#d4584c')));
    const orangeError = deltaE(source, labOf(hexToPx('#c0582e')));
    expect(selectedError).toBeGreaterThan(orangeError);
    expect(result.meta.processing.quantError).toBe(Number(selectedError.toFixed(4)));
  });

  it('preserves paper, leather, neutral material and all alpha positions', () => {
    const selected = item('art_ico_item_bounty_voucher', '#c44a3b', true);
    const ordinary = item('art_ico_item_other_fixture', '#c44a3b', true);
    if (!selected.img || !ordinary.img) throw new Error('Item image missing');
    for (let i = 3; i < selected.img.data.length; i += 4) {
      expect(selected.img.data[i]).toBe(ordinary.img.data[i]);
    }
    for (const hex of ['#805836', '#f0e8d2']) {
      expect(selected.meta.swatch).toContain(hex);
    }
    expect(selected.meta.swatch).not.toContain('#f2cba8');
    expect(
      selected.meta.swatch.every((hex) => CREATURE_PALETTE.colors.some((c) => c.hex === hex)),
    ).toBe(true);
    expect(selected.meta.swatch.length).toBeLessThanOrEqual(32);
  });

  it('does not recolor an ordinary item with the same warm shade', () => {
    const result = item('art_ico_item_other_fixture', '#c44a3b');
    if (!result.img) throw new Error('Item image missing');
    expect(getPx(result.img, 16, 16)).toBe(hexToPx('#c0582e'));
    expect(result.meta.processing.itemSemanticPaletteSelection).toBeUndefined();
  });

  it('does not enable item semantics on other templates', () => {
    const result = item('art_ico_item_bounty_voucher', '#c44a3b', false, 'ico_skill');
    if (!result.img) throw new Error('Image missing');
    expect(getPx(result.img, 16, 16)).toBe(hexToPx('#c0582e'));
    expect(result.meta.processing.itemSemanticPaletteSelection).toBeUndefined();
  });

  it('retains the hard actual quantization-error rejection', () => {
    const result = item('art_ico_item_bounty_voucher', '#ff0000');
    expect(result.problems.some((p) => p.check === 'quant_error' && !p.warning)).toBe(true);
  });

  it('retains unrestricted nearest mapping in the generic quantizer', () => {
    const src = createImg(1, 1);
    setPx(src, 0, 0, hexToPx('#c44a3b'));
    const result = quantizeFrames([src], CREATURE_PALETTE);
    if (!result.frames[0]) throw new Error('Frame missing');
    expect(getPx(result.frames[0], 0, 0)).toBe(hexToPx('#c0582e'));
  });

  it('keeps a low-chroma grey-brown clay face from becoming blue metal', () => {
    const result = item('art_ico_item_mat_clay', '#9a8470', false, 'ico_item', '#96948e');
    if (!result.img) throw new Error('Clay image missing');
    const face = lch(labOf(getPx(result.img, 16, 16)));
    expect(face.H).toBeGreaterThanOrEqual(50);
    expect(face.H).toBeLessThanOrEqual(100);
    expect(result.meta.swatch).not.toContain('#8e949e');
    expect(result.problems.filter((p) => !p.warning)).toEqual([]);
  });

  it('does not replace muted clay faces with saturated peach or orange', () => {
    const result = item('art_ico_item_mat_clay', '#9a8470', false, 'ico_item', '#96948e');
    if (!result.img) throw new Error('Clay image missing');
    for (const [x, y] of [
      [16, 16],
      [9, 16],
    ] as const) {
      expect(lch(labOf(getPx(result.img, x, y))).C).toBeLessThanOrEqual(0.065);
    }
    expect(result.meta.swatch).not.toContain('#c88d64');
  });

  it('records the clay material policy and retains the actual error threshold', () => {
    const result = item('art_ico_item_mat_clay', '#9a8470', false, 'ico_item', '#96948e');
    expect(result.meta.processing.itemSemanticPaletteSelection).toBeDefined();
    expect(Number(result.meta.processing.quantError)).toBeGreaterThan(0);
    expect(Number(result.meta.processing.quantError)).toBeLessThanOrEqual(0.07);
  });

  it('keeps the neutral-material policy on unrelated items with the same source patch', () => {
    const result = item('art_ico_item_other_fixture', '#9a8470', false, 'ico_item', '#96948e');
    if (!result.img) throw new Error('Image missing');
    expect(getPx(result.img, 16, 16)).toBe(hexToPx('#8e949e'));
    expect(result.meta.processing.itemSemanticPaletteSelection).toBeUndefined();
  });

  it('preserves a wet white highlight, paper-like sand and every clay alpha position', () => {
    const selected = item('art_ico_item_mat_clay', '#9a8470', true, 'ico_item', '#96948e');
    const ordinary = item('art_ico_item_other_fixture', '#9a8470', true, 'ico_item', '#96948e');
    if (!selected.img || !ordinary.img) throw new Error('Image missing');
    for (let i = 3; i < selected.img.data.length; i += 4) {
      expect(selected.img.data[i]).toBe(ordinary.img.data[i]);
    }
    expect(selected.meta.swatch).toContain('#ffffff');
    expect(selected.meta.swatch).toContain('#f0e8d2');
    expect(
      selected.meta.swatch.every((hex) => CREATURE_PALETTE.colors.some((c) => c.hex === hex)),
    ).toBe(true);
    expect(selected.meta.swatch.length).toBeLessThanOrEqual(32);
  });
});
