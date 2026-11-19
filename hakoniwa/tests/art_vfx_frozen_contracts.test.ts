import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type FrameInput, placeFrames } from '../tools/assets/core/anchor';
import { createImg, crop, type Img, opaqueCount, pack, setPx } from '../tools/assets/core/image';
import { processArt } from '../tools/assets/core/pipeline';
import { importSpecFor } from '../tools/assets/core/template_specs';
import { makeSheet } from './art_fixtures';

const library = JSON.parse(
  readFileSync(join(__dirname, '..', 'assets', 'prompts', 'templates.json'), 'utf8'),
);

function rectangle(image: Img, x: number, y: number, w: number, h: number, color: number) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) setPx(image, x + dx, y + dy, color);
}

function heldLight(id: string, blankLast = false, template = 'vfx_medium', whiteLast = false) {
  const scale = template === 'vfx_large' ? 2 : 1;
  const size = 64 * scale;
  const frames = Array.from({ length: 8 }, (_, i) => {
    const image = createImg(size, size);
    if (blankLast && i === 7) return image;
    if (whiteLast && i === 7) return createImg(size, size, pack(255, 255, 255));
    rectangle(image, 22 * scale, 18 * scale, 18 * scale, 28 * scale, pack(240, 192, 112));
    rectangle(image, 24 * scale, 20 * scale, 14 * scale, 24 * scale, pack(160, 112, 64));
    rectangle(image, 26 * scale, 22 * scale, 10 * scale, 20 * scale, pack(96, 60, 32));
    return image;
  });
  return processArt({
    id,
    template,
    templateDef: library.templates[template],
    src: makeSheet([frames.slice(0, 4), frames.slice(4)], [size, size], {
      block: 4 / scale,
      background: '#000000',
    }),
    sourceFile: 'held_light_fixture.png',
    sourceSha256: 'a'.repeat(64),
    aigcLabel: 'none',
  });
}

const HELD_ENDINGS = [
  ['art_vfx_cut_a1_talent_windows', 'vfx_large'],
  ['art_vfx_cut_white_in', 'vfx_large'],
  ['art_vfx_cut_trial_mirror_void', 'vfx_large'],
  ['art_vfx_cut_halo_stop', 'vfx_medium'],
  ['art_vfx_cut_one_way_door', 'vfx_large'],
  ['art_vfx_cut_stele_white', 'vfx_large'],
  ['art_vfx_cut_tile_crack', 'vfx_medium'],
] as const;

describe('frozen VFX requirements', () => {
  it.each([
    ['vfx_small', 4],
    ['vfx_medium', 5],
    ['vfx_large', 6],
    ['vfx_projectile', 4],
    ['vfx_loop', 4],
  ] as const)('enforces the prompt color cap for %s', (template, maximum) => {
    expect(importSpecFor(template, library.templates[template], 'art_vfx_test').maxColors).toBe(
      maximum,
    );
  });

  it.each(['art_vfx_door_sigil_flash', 'art_vfx_dian_mist'])(
    'keeps the narrower four-color contract for %s',
    (id) => {
      expect(importSpecFor('vfx_medium', library.templates.vfx_medium, id).maxColors).toBe(4);
    },
  );

  it('applies the four-color loop cap during actual quantization', () => {
    const colors = [
      pack(255, 255, 255),
      pack(255, 245, 200),
      pack(244, 222, 152),
      pack(230, 202, 112),
      pack(210, 182, 80),
      pack(182, 160, 64),
    ];
    const frames = Array.from({ length: 8 }, () => {
      const image = createImg(64, 64);
      colors.forEach((color, i) => {
        rectangle(image, 20 + i * 4, 28, 4, 8, color);
      });
      return image;
    });
    const result = processArt({
      id: 'art_vfx_amb_butterflies',
      template: 'vfx_loop',
      templateDef: library.templates.vfx_loop,
      src: makeSheet([frames.slice(0, 4), frames.slice(4)], [64, 64], {
        block: 4,
        background: '#000000',
      }),
      sourceFile: 'loop_color_fixture.png',
      sourceSha256: 'b'.repeat(64),
      aigcLabel: 'none',
    });
    expect(result.problems.filter((problem) => !problem.warning)).toEqual([]);
    expect(result.meta.swatch.length).toBeLessThanOrEqual(4);
  });

  it('preserves the declared final door light and holds its last frame', () => {
    const result = heldLight('art_vfx_cut_earth_door');
    expect(result.problems.filter((problem) => !problem.warning)).toEqual([]);
    expect(result.meta.frames).toHaveLength(8);
    expect(Object.values(result.meta.anims)).toHaveLength(1);
    expect(Object.values(result.meta.anims)[0]?.hold).toBe(true);
  });

  it.each(HELD_ENDINGS)('preserves the declared bright ending of %s', (id, template) => {
    const result = heldLight(id, false, template);
    expect(result.problems.filter((problem) => !problem.warning)).toEqual([]);
    expect(result.meta.frames).toHaveLength(8);
    expect(Object.values(result.meta.anims)).toEqual([
      expect.objectContaining({ frames: [0, 1, 2, 3, 4, 5, 6, 7], loop: false, hold: true }),
    ]);
  });

  it.each(HELD_ENDINGS)('rejects a missing required final frame of %s', (id, template) => {
    const result = heldLight(id, true, template);
    expect(
      result.problems.some((problem) => problem.check === 'grid_cells' && !problem.warning),
    ).toBe(true);
  });

  it('keeps the white-in final cell uniformly white from edge to edge', () => {
    const result = heldLight('art_vfx_cut_white_in', false, 'vfx_large', true);
    expect(result.problems.filter((problem) => !problem.warning)).toEqual([]);
    const last = result.meta.frames[7]!;
    const frame = crop(result.img!, last.x, last.y, last.w, last.h);
    expect(opaqueCount(frame)).toBe(128 * 128);
    expect(new Set(Array.from(frame.data))).toEqual(new Set([255]));
    expect(Object.values(result.meta.anims)[0]).toMatchObject({ loop: false, hold: true });
  });

  it('still rejects bright tails of ordinary large effects and unlisted cutscene effects', () => {
    for (const id of ['art_vfx_school_fire_cast', 'art_vfx_cut_unlisted_light']) {
      const result = heldLight(id, false, 'vfx_large');
      expect(
        result.problems.some((problem) => problem.check === 'vfx_fade' && !problem.warning),
      ).toBe(true);
      expect(Object.values(result.meta.anims)[0]?.hold).toBe(false);
    }
  });

  it('still requires unrelated casting effects to fade', () => {
    const result = heldLight('art_vfx_school_fire_cast');
    expect(result.problems.some((problem) => problem.check === 'vfx_fade')).toBe(true);
    expect(Object.values(result.meta.anims)).toHaveLength(1);
    expect(Object.values(result.meta.anims)[0]?.hold).toBe(false);
  });

  it('still rejects a missing final frame of the held door light', () => {
    const result = heldLight('art_vfx_cut_earth_door', true);
    expect(result.problems.some((problem) => problem.check === 'grid_cells')).toBe(true);
    expect(result.meta.frames.length).toBeLessThan(8);
  });

  it('keeps the crow flight positions with a stable cell-center origin', () => {
    const spec = importSpecFor('vfx_small', library.templates.vfx_small, 'art_vfx_amb_crow_shadow');
    const frames: FrameInput[] = Array.from({ length: 8 }, (_, i) => {
      const def = spec.cells[Math.floor(i / 4)]?.[i % 4];
      if (!def) throw new Error('Missing crow flight frame definition');
      return {
        col: i % 4,
        row: Math.floor(i / 4),
        def,
        img: createImg(8, 6, pack(154, 160, 170)),
        rel: [6 + i, 20 - i],
      };
    });
    const placed = placeFrames(frames, spec);
    expect(placed.problems).toEqual([]);
    expect(placed.frames.map((frame) => frame.at)).toEqual(frames.map((frame) => frame.rel));
    expect(placed.frames.map((frame) => frame.anchor)).toEqual(
      Array.from({ length: 8 }, () => [16, 16]),
    );
  });
});
