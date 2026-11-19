import { describe, expect, it } from 'vitest';
import { locateCells } from '../tools/assets/core/cells';
import { createImg, getPx, pack, setPx } from '../tools/assets/core/image';
import { keyBackground } from '../tools/assets/core/keying';
import { processArt } from '../tools/assets/core/pipeline';
import { importSpecFor } from '../tools/assets/core/template_specs';

describe('additive effect black key', () => {
  it('removes every one-level RGB encoding variant of black', () => {
    const src = createImg(8, 1);
    for (let i = 0; i < 8; i++) setPx(src, i, 0, pack(i & 1, (i >> 1) & 1, (i >> 2) & 1, 255));
    const keyed = keyBackground(src, 'black', { checkEdges: false });
    expect([...keyed.img.data]).toEqual(new Array(32).fill(0));
    expect(src.data[7 * 4 + 3]).toBe(255);
  });

  it('retains dim colored effects above the encoding noise and preserves their RGB', () => {
    const colors = [
      pack(0, 2, 0, 255),
      pack(42, 32, 56, 255),
      pack(74, 58, 98, 255),
      pack(126, 110, 63, 255),
    ];
    const src = createImg(colors.length, 1);
    colors.forEach((color, i) => {
      setPx(src, i, 0, color);
    });
    const keyed = keyBackground(src, 'black', { checkEdges: false });
    expect(colors.map((_, i) => getPx(keyed.img, i, 0))).toEqual(colors);
  });

  it.each(['none', 'magenta'] as const)(
    'keeps near-black subject pixels when keying is %s',
    (mode) => {
      const src = createImg(3, 3, pack(0, 1, 0, 255));
      expect([...keyBackground(src, mode, { checkEdges: false }).img.data]).toEqual([...src.data]);
    },
  );

  it('does not let black encoding noise create false edge or grid-crossing failures', () => {
    const src = createImg(128, 64, pack(1, 1, 0, 255));
    for (let frame = 0; frame < 8; frame++) {
      const cx = (frame % 4) * 32 + 16;
      const cy = Math.floor(frame / 4) * 32 + 16;
      for (let y = cy - 4; y <= cy + 4; y++)
        for (let x = cx - 4; x <= cx + 4; x++) setPx(src, x, y, pack(240, 216, 144, 255));
    }
    const spec = importSpecFor(
      'vfx_loop',
      {
        canvas: '1024x512',
        final: '64x64',
        grid: '4x2',
        background: '#000000',
      },
      'art_test_loop',
    );
    const keyed = keyBackground(src, 'black', { checkEdges: true });
    expect(keyed.problems).toEqual([]);
    const cells = locateCells(keyed.img, spec.cells, { search: true });
    expect(cells.problems).toEqual([]);
    expect(cells.cells.flat().map((cell) => cell.pixels)).toEqual(new Array(8).fill(81));

    // A real stripe across a boundary must still be rejected.
    for (let y = 0; y < src.h; y++)
      for (let x = 27; x <= 37; x++) setPx(src, x, y, pack(106, 90, 138, 255));
    const crossed = keyBackground(src, 'black', { checkEdges: true });
    expect(crossed.problems.some((p) => p.check === 'touches_edge')).toBe(true);
    expect(
      locateCells(crossed.img, spec.cells, { search: true }).problems.some(
        (p) => p.check === 'grid_cells',
      ),
    ).toBe(true);
  });

  it('retains a nearly disappeared last flash frame, but rejects an empty one', () => {
    const src = createImg(1024, 512);
    const def = { canvas: '1024x512', final: '32x32', grid: '4x2', background: '#000000' };
    const spec = importSpecFor('vfx_small', def, 'art_vfx_door_sigil_flash');
    for (let frame = 0; frame < 8; frame++) {
      const side = frame === 7 ? 8 : 60;
      const cx = (frame % 4) * 256 + 128;
      const cy = Math.floor(frame / 4) * 256 + 128;
      for (let y = cy - side / 2; y < cy + side / 2; y++)
        for (let x = cx - side / 2; x < cx + side / 2; x++)
          setPx(src, x, y, pack(126, 110, 63, 255));
    }
    expect(locateCells(src, spec.cells, { search: true }).problems).not.toEqual([]);
    const faded = locateCells(src, spec.cells, { search: true, fadingLastFrame: true });
    expect(faded.problems).toEqual([]);
    expect(faded.cells[1]?.[3]?.pixels).toBe(64);
    for (let y = 380; y < 388; y++) for (let x = 892; x < 900; x++) setPx(src, x, y, 0);
    expect(
      locateCells(src, spec.cells, { search: true, fadingLastFrame: true }).problems.some(
        (p) => p.check === 'grid_cells',
      ),
    ).toBe(true);
  });

  it('applies the template color cap and the narrower named effect contracts', () => {
    const def = { canvas: '1024x512', final: '64x64', grid: '4x2', background: '#000000' };
    const src = createImg(128, 64);
    const colors = [
      pack(42, 32, 56),
      pack(58, 44, 74),
      pack(74, 58, 98),
      pack(90, 74, 118),
      pack(106, 90, 138),
      pack(126, 110, 160),
    ];
    for (let frame = 0; frame < 8; frame++)
      for (let y = 8; y < 24; y++)
        for (let x = 7; x < 25; x++)
          setPx(
            src,
            (frame % 4) * 32 + x,
            Math.floor(frame / 4) * 32 + y,
            colors[Math.floor((x - 7) / 3)]!,
          );
    const run = (id: string) =>
      processArt({
        id,
        template: 'vfx_loop',
        templateDef: def,
        src,
        sourceFile: 'test.png',
        sourceSha256: 'a'.repeat(64),
        aigcLabel: 'none',
      });
    expect(run('art_vfx_dian_mist').meta.swatch.sort()).toEqual(['#2a2038', '#4a3a62', '#6a5a8a']);
    expect(
      importSpecFor('vfx_small', { ...def, final: '32x32' }, 'art_vfx_door_sigil_flash').maxColors,
    ).toBe(4);
    expect(run('art_vfx_unrestricted').meta.swatch).toHaveLength(4);
  });
});
