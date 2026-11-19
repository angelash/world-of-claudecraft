import { describe, expect, it } from 'vitest';
import { createImg, opaqueCount, pack, setPx } from '../tools/assets/core/image';
import { processArt } from '../tools/assets/core/pipeline';

const def = { canvas: '1024x512', final: '64x64', grid: '4x2', background: '#000000' };
const arcane = 'art_vfx_school_arcane_cast';

function castingSheet(blankFrame = -1, pointSide = 8, smallPeak = true) {
  const img = createImg(1024, 512);
  for (let i = 0; i < 8; i++) {
    if (i === blankFrame) continue;
    const side = (i === 3 && smallPeak) || i === 6 || i === 7 ? pointSide : 40;
    const cx = (i % 4) * 256 + 128;
    const cy = Math.floor(i / 4) * 256 + 128;
    const color = i === 3 ? pack(255, 255, 255) : i % 2 ? pack(255, 122, 217) : pack(111, 227, 255);
    for (let y = cy - side / 2; y < cy + side / 2; y++)
      for (let x = cx - side / 2; x < cx + side / 2; x++) setPx(img, x, y, color);
  }
  return img;
}

function run(
  id = arcane,
  blankFrame = -1,
  pointSide = 8,
  template = 'vfx_medium',
  smallPeak = true,
) {
  return processArt({
    id,
    template,
    templateDef: def,
    src: castingSheet(blankFrame, pointSide, smallPeak),
    sourceFile: 'arcane_sparse_test.png',
    sourceSha256: 'a'.repeat(64),
    aigcLabel: 'none',
  });
}

describe('frozen arcane single-point and light-grain frames', () => {
  it('preserves the small white peak and late grains through the real import path', () => {
    const result = run();
    expect(result.problems.filter((p) => !p.warning)).toEqual([]);
    expect(result.meta.frames).toHaveLength(8);
    expect(result.img).not.toBeNull();
    if (!result.img) throw new Error('Expected a processed sprite sheet');
    const img = result.img;
    const areas = Array.from({ length: 8 }, (_, i) =>
      opaqueCount(img, { x: (i % 4) * 64, y: Math.floor(i / 4) * 64, w: 64, h: 64 }),
    );
    expect(areas.every((area) => area > 0)).toBe(true);
    expect(areas[3]).toBeLessThan(areas[2] ?? 0);
    expect(areas[6]).toBeLessThan(areas[5] ?? 0);
  });

  it.each([3, 6])('still rejects a truly blank declared sparse frame %i', (frame) => {
    const result = run(arcane, frame);
    expect(result.problems.some((p) => p.check === 'grid_cells')).toBe(true);
    expect(result.meta.frames.length).toBeLessThan(8);
  });

  it('keeps the generic occupancy guard for unrelated casting sheets', () => {
    const result = run('art_vfx_school_fire_cast');
    expect(result.problems.some((p) => p.check === 'grid_cells')).toBe(true);
    expect(result.meta.frames).toHaveLength(6);
  });

  it('does not apply the sparse casting contract to the arcane field loop', () => {
    const result = run('art_vfx_school_arcane_zone', -1, 8, 'vfx_loop');
    expect(result.problems.some((p) => p.check === 'grid_cells')).toBe(true);
  });

  it('does not invent a runtime pixel if a tiny source mark disappears in reduction', () => {
    const result = run(arcane, -1, 2);
    expect(result.problems.some((p) => !p.warning)).toBe(true);
  });

  it('preserves the declared fine snow before the final frost flecks', () => {
    const result = run('art_vfx_school_frost_cast', -1, 8, 'vfx_medium', false);
    expect(result.problems.filter((p) => !p.warning)).toEqual([]);
    expect(result.meta.frames).toHaveLength(8);
  });

  it('still rejects a truly empty fine-snow frame', () => {
    const result = run('art_vfx_school_frost_cast', 6, 8, 'vfx_medium', false);
    expect(result.problems.some((p) => p.check === 'grid_cells')).toBe(true);
  });

  it('retains late arcane hit grains at the actual 32-pixel runtime cell size', () => {
    const result = processArt({
      id: 'art_vfx_school_arcane_hit',
      template: 'vfx_small',
      templateDef: { ...def, final: '32x32' },
      src: castingSheet(-1, 8, false),
      sourceFile: 'arcane_hit_sparse_test.png',
      sourceSha256: 'a'.repeat(64),
      aigcLabel: 'none',
    });
    expect(result.problems.filter((p) => !p.warning)).toEqual([]);
    expect(result.meta.frames).toHaveLength(8);
    expect(result.meta.cell).toEqual([32, 32]);
  });

  it('still rejects an empty arcane hit grain frame', () => {
    const result = processArt({
      id: 'art_vfx_school_arcane_hit',
      template: 'vfx_small',
      templateDef: { ...def, final: '32x32' },
      src: castingSheet(6, 8, false),
      sourceFile: 'arcane_hit_sparse_test.png',
      sourceSha256: 'a'.repeat(64),
      aigcLabel: 'none',
    });
    expect(result.problems.some((p) => p.check === 'grid_cells')).toBe(true);
  });
});
