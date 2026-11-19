import { describe, expect, it } from 'vitest';
import { hexToPx, lightness, pxToHex } from '../tools/assets/core/color';
import { KEY_RAMP_COLORS } from '../tools/assets/core/doll_keys';
import { createImg, resizeNearest, setPx } from '../tools/assets/core/image';
import { OutlinePainter } from '../tools/assets/core/outline';
import { CREATURE_PALETTE, paletteColor } from '../tools/assets/core/palettes';
import { processArt } from '../tools/assets/core/pipeline';

const BROWN_SHADOWS = [
  '#2b2220',
  '#42281c',
  '#4a3226',
  '#623a26',
  '#6e4a30',
  '#8c3a24',
  '#3c2818',
  '#5e3e24',
  '#805836',
  '#865236',
];

describe('material color when adding outlines', () => {
  it.each(['normal', 'deep', 'lit'] as const)(
    'keeps a warm brown leather fill brown on the %s edge',
    (kind) => {
      const fill = hexToPx('#c0582e');
      const outline = new OutlinePainter(CREATURE_PALETTE.colors).colorFor(fill, kind);
      expect(BROWN_SHADOWS).toContain(pxToHex(outline));
      expect(lightness(outline)).toBeLessThan(lightness(fill));
    },
  );

  it('does not introduce a red grip through the production item importer', () => {
    const logical = createImg(32, 32);
    for (let y = 6; y < 26; y++) {
      for (let x = 8; x < 15; x++) setPx(logical, x, y, hexToPx('#c0582e'));
      for (let x = 21; x < 23; x++) setPx(logical, x, y, hexToPx('#f2cba8'));
    }
    const result = processArt({
      id: 'art_ico_item_brown_leather_fixture',
      template: 'ico_item',
      templateDef: {
        canvas: '1024x1024',
        final: '32x32',
        grid: '1x1',
        background: '#ff00ff',
      },
      src: resizeNearest(logical, 1024, 1024),
      sourceFile: 'art/icons/items/art_ico_item_brown_leather_fixture.png',
      sourceSha256: 'fixture',
      aigcLabel: 'none',
    });
    expect(result.problems.filter((p) => !p.warning)).toEqual([]);
    expect(result.meta.swatch).toContain('#c0582e');
    expect(result.meta.swatch).not.toContain('#5a1c22');
    if (!result.img) throw new Error('Item import did not produce an image');
    expect([result.img.w, result.img.h]).toEqual([32, 32]);
  });

  it('preserves intentionally red material outlines', () => {
    const painter = new OutlinePainter(CREATURE_PALETTE.colors);
    for (const kind of ['normal', 'deep', 'lit'] as const) {
      expect(['#5a1c22', '#9a2e30', '#8a1424']).toContain(
        pxToHex(painter.colorFor(hexToPx('#d4584c'), kind)),
      );
    }
  });

  it('keeps a neutral metal fill out of the red and brown families', () => {
    const painter = new OutlinePainter(CREATURE_PALETTE.colors);
    for (const kind of ['normal', 'deep', 'lit'] as const) {
      const value = pxToHex(painter.colorFor(hexToPx('#8e949e'), kind));
      expect(['#1a1420', '#26262e', '#46464e', '#3c4048', '#626872', '#2e2434']).toContain(value);
    }
  });

  it('uses an existing neutral shadow when a sparse palette has no darker brown', () => {
    const painter = new OutlinePainter([
      paletteColor('#c0582e', 'warm', 0),
      paletteColor('#26262e', 'neutral', 0),
    ]);
    for (const kind of ['normal', 'deep', 'lit'] as const) {
      expect(painter.colorFor(hexToPx('#c0582e'), kind)).toBe(hexToPx('#26262e'));
    }
  });

  it('retains recolorable paper-doll slot outlines', () => {
    const painter = new OutlinePainter(CREATURE_PALETTE.colors);
    const [dark, lit, fill] = KEY_RAMP_COLORS.primary;
    if (!dark || !lit || !fill) throw new Error('Primary key ramp needs three levels');
    expect(painter.colorFor(fill.px, 'normal')).toBe(dark.px);
    expect(painter.colorFor(fill.px, 'deep')).toBe(dark.px);
    expect(painter.colorFor(fill.px, 'lit')).toBe(lit.px);
  });
});
