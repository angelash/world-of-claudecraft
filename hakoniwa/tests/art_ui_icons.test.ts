import { describe, expect, it } from 'vitest';
import { outlineStats } from '../tools/assets/core/checks';
import { hexToPx } from '../tools/assets/core/color';
import { createImg, getPx, type Img, isOpaque, setPx } from '../tools/assets/core/image';
import { processArt } from '../tools/assets/core/pipeline';

function importGlyph(src: Img, id = 'art_ico_sys_test') {
  return processArt({
    id,
    template: 'ico_ui',
    templateDef: {
      canvas: '1024x1024',
      final: '24x24',
      grid: '1x1',
      background: '#ff00ff',
    },
    src,
    sourceFile: 'art/icons/ui/art_ico_sys_test.png',
    sourceSha256: 'fixture',
    aigcLabel: 'none',
  });
}

describe('UI glyph import', () => {
  it('keeps an ivory glyph neutral when adding its one-pixel outline', () => {
    const src = createImg(384, 384);
    for (let y = 96; y < 288; y++) {
      for (let x = 96; x < 288; x++) setPx(src, x, y, hexToPx('#f0ece0'));
    }
    const result = importGlyph(src);
    expect(result.problems.filter((p) => !p.warning)).toEqual([]);
    expect(result.meta.swatch).toContain('#f4ead0');
    expect(result.meta.swatch).not.toContain('#6a4a30');
    expect(result.meta.swatch).not.toContain('#a88a40');
    expect([result.img!.w, result.img!.h]).toEqual([24, 24]);
  });

  it('counts nearby ivory shades together before choosing a downsampled stroke color', () => {
    const src = createImg(384, 384);
    // The visible stroke is mostly ivory; encoder variation splits it across RGB buckets.
    for (let y = 96; y < 288; y++) {
      for (let x = 144; x < 192; x++) {
        const row = y % 16;
        const color = row < 5 ? '#efe8d8' : row < 10 ? '#f7e8d8' : '#6a6478';
        setPx(src, x, y, hexToPx(color));
      }
    }
    const result = importGlyph(src);
    expect(result.meta.swatch).toContain('#f4ead0');
    // Every center-line pixel still carries the continuous light stroke.
    const frame = result.meta.frames[0]!;
    for (let y = 8; y < 16; y++) {
      expect(getPx(result.img!, frame.ax ?? 12, y)).toBe(hexToPx('#f4ead0'));
    }
  });

  it('preserves semantic UI accent fills and transparent space between symbols', () => {
    const src = createImg(384, 384);
    for (let y = 96; y < 288; y++) {
      for (let x = 80; x < 144; x++) setPx(src, x, y, hexToPx('#d83a3a'));
      for (let x = 240; x < 304; x++) setPx(src, x, y, hexToPx('#f0d890'));
    }
    const result = importGlyph(src);
    expect(result.problems.filter((p) => !p.warning)).toEqual([]);
    expect(result.meta.swatch).toContain('#d83a3a');
    expect(result.meta.swatch).toContain('#f0d890');
    expect(result.meta.swatch).not.toContain('#6a4a30');
    expect(getPx(result.img!, 12, 12)).toBe(0);
    expect(result.meta.swatch).not.toContain('#000000');
  });

  it('keeps a slightly warmer menu-line gray out of the brown semantic palette entries', () => {
    const src = createImg(384, 384);
    for (let y = 96; y < 288; y++) {
      for (let x = 96; x < 288; x++) setPx(src, x, y, hexToPx('#59525a'));
    }
    const result = importGlyph(src, 'art_ico_sys_win_character');
    expect(result.meta.swatch).not.toContain('#6a4a30');
    expect(result.meta.swatch).not.toContain('#a88a40');
  });

  it('retains intentional brown fills outside the monochrome window-menu family', () => {
    const src = createImg(384, 384);
    for (let y = 96; y < 288; y++) {
      for (let x = 96; x < 288; x++) setPx(src, x, y, hexToPx('#6a4a30'));
    }
    expect(importGlyph(src).meta.swatch).toContain('#6a4a30');
  });

  it('keeps a shaded health heart red and preserves its already valid diagonal outline', () => {
    const rows = [
      '....dddd....dddd....',
      '...dRRRRd..dRRRRd...',
      '.ddRRRRRRddRRRRRRd..',
      '.dRRhhRRRRRRRRRRRRd.',
      'dRRhhRRRRRRRRRRRRbbd',
      'dRRhRRRRRRRRRRRRRbbd',
      'dRRRRRRRRRRRRRRRRbbd',
      'dRRRRRRRRRRRRRRRbbbd',
      'ddRRRRRRRRRRRRRRbbd.',
      '.ddRRRRRRRRRRRRbbdd.',
      '..ddRRRRRRRRRRbbdd..',
      '...ddRRRRRRRRbbdd...',
      '....ddRRRRRRbbdd....',
      '.....ddRRRRbbdd.....',
      '......ddRRbbdd......',
      '.......ddbbdd.......',
      '........ddd.........',
      '.........d..........',
    ];
    const colors: Record<string, string> = {
      d: '#151515',
      R: '#d83a3a',
      h: '#fac0c0',
      b: '#962525',
    };
    const src = createImg(384, 384);
    rows.forEach((row, y) => {
      [...row].forEach((c, x) => {
        if (c === '.') return;
        for (let dy = 0; dy < 16; dy++) {
          for (let dx = 0; dx < 16; dx++) {
            setPx(src, (x + 2) * 16 + dx, (y + 3) * 16 + dy, hexToPx(colors[c]!));
          }
        }
      });
    });
    const result = importGlyph(src, 'art_ico_sys_cur_health');
    expect(result.problems.filter((p) => !p.warning)).toEqual([]);
    expect(result.meta.swatch).toContain('#d83a3a');
    expect(result.meta.swatch).not.toContain('#6a4a30');
    expect(result.meta.swatch).not.toContain('#a88a40');
    const outline = outlineStats(result.img!);
    expect(outline.darker / outline.rim).toBeGreaterThanOrEqual(0.6);
    expect(outline.doubled / outline.rim).toBeLessThanOrEqual(0.5);
    expect(result.meta.swatch.some((hex) => ['#e8e4ec', '#ffffff'].includes(hex))).toBe(true);
    const final = result.img;
    if (!final) throw new Error('UI glyph import did not produce an image');
    rows.forEach((row, y) => {
      [...row].forEach((c, x) => {
        expect(isOpaque(final, x + 2, y + 3)).toBe(c !== '.');
      });
    });
  });
});
