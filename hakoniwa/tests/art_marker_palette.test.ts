import { describe, expect, it } from 'vitest';
import { hexToPx } from '../tools/assets/core/color';
import { createImg, isOpaque, setPx } from '../tools/assets/core/image';
import { processArt } from '../tools/assets/core/pipeline';

function question(id: string, main = '#b0e0f0', shade = '#639bc9') {
  const rows = [
    '................',
    '................',
    '.....dddddd.....',
    '....dbbbbbbd....',
    '...dbbdddbbbd...',
    '...dbbd..dbbd...',
    '....dd..dbbbd...',
    '.......dbbsd....',
    '......dbbsd.....',
    '......dbbd......',
    '.......dd.......',
    '................',
    '.......dd.......',
    '......dbbd......',
    '.......dd.......',
    '................',
  ];
  const colors = { d: '#151515', b: main, s: shade };
  const src = createImg(384, 384);
  rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === '.') return;
      const color = colors[c as keyof typeof colors];
      for (let dy = 0; dy < 24; dy++) {
        for (let dx = 0; dx < 24; dx++) {
          setPx(src, x * 24 + dx, y * 24 + dy, hexToPx(color));
        }
      }
    });
  });
  return processArt({
    id,
    template: 'ico_marker',
    templateDef: {
      canvas: '384x384',
      final: '16x16',
      grid: '1x1',
      background: '#ff00ff',
    },
    src,
    sourceFile: `art/icons/markers/${id}.png`,
    sourceSha256: 'fixture',
    aigcLabel: 'none',
  });
}

describe('marker color import', () => {
  it('keeps the pale blue question symbol chromatic through the real import pipeline', () => {
    const result = question('art_ico_marker_question');
    expect(result.problems.filter((p) => !p.warning)).toEqual([]);
    expect(result.meta.swatch.some((c) => ['#5aa8f0', '#58cce6'].includes(c))).toBe(true);
    expect(result.meta.swatch).not.toContain('#e8e4ec');
  });

  it('preserves the hook, separate dot and transparent gaps during color selection', () => {
    const colored = question('art_ico_marker_question');
    const ordinary = question('art_ico_marker_test');
    if (!colored.img || !ordinary.img) throw new Error('Marker import produced no image');
    expect([colored.img.w, colored.img.h]).toEqual([16, 16]);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        expect(isOpaque(colored.img, x, y)).toBe(isOpaque(ordinary.img, x, y));
      }
    }
  });

  it('leaves other marker color requirements available', () => {
    const ordinary = question('art_ico_marker_test', '#d83a3a', '#f0d890');
    expect(ordinary.problems.filter((p) => !p.warning)).toEqual([]);
    expect(ordinary.meta.swatch).toContain('#d83a3a');
    expect(ordinary.meta.swatch).toContain('#f0d890');
  });
});
