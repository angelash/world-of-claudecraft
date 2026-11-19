import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createImg, getPx, pack, setPx } from '../tools/assets/core/image';
import { processArt } from '../tools/assets/core/pipeline';
import { importSpecFor } from '../tools/assets/core/template_specs';
import { makeSheet } from './art_fixtures';

const library = JSON.parse(
  readFileSync(join(__dirname, '..', 'assets', 'prompts', 'templates.json'), 'utf8'),
);

function driftingLoop(id: string) {
  const colors = [pack(168, 88, 48), pack(226, 155, 80), pack(142, 111, 48), pack(214, 190, 112)];
  const frames = Array.from({ length: 8 }, (_, frame) => {
    const image = createImg(64, 64);
    colors.forEach((color, leaf) => {
      const x = 14 + leaf * 10;
      const y = 9 + ((leaf * 12 + frame * 6) % 48);
      for (let dy = 0; dy < 3; dy++)
        for (let dx = 0; dx < 4; dx++) setPx(image, x + dx, y + dy, color);
    });
    return image;
  });
  return processArt({
    id,
    template: 'vfx_loop',
    templateDef: library.templates.vfx_loop,
    src: makeSheet([frames.slice(0, 4), frames.slice(4)], [64, 64], {
      block: 4,
      background: '#000000',
    }),
    sourceFile: 'drifting_loop_fixture.png',
    sourceSha256: 'c'.repeat(64),
    aigcLabel: 'none',
  });
}

describe('ambient particles crossing a cell', () => {
  it.each(['art_vfx_amb_falling_leaves', 'art_vfx_amb_petals'])(
    'keeps the fixed origin and the fall of %s',
    (id) => {
      const spec = importSpecFor('vfx_loop', library.templates.vfx_loop, id);
      expect(spec.anchor).toBe('none');
      expect(spec.anchorPx).toEqual([32, 32]);
      const result = driftingLoop(id);
      expect(result.problems.filter((problem) => !problem.warning)).toEqual([]);
      if (!result.img) throw new Error('Missing ambient loop image');
      expect(getPx(result.img, 15, 10) & 255).toBe(255);
      expect(getPx(result.img, 64 + 15, 16) & 255).toBe(255);
      expect(getPx(result.img, 64 + 15, 10) & 255).toBe(0);
      expect(getPx(result.img, 3 * 64 + 15, 64 + 52) & 255).toBe(255);
      expect(result.meta.frames.map((frame) => [frame.ax, frame.ay])).toEqual(
        Array.from({ length: 8 }, () => [32, 32]),
      );
    },
  );

  it.each(['art_vfx_amb_butterflies', 'art_vfx_amb_fireflies', 'art_vfx_school_fire_zone'])(
    'retains normal center placement for %s',
    (id) => {
      expect(importSpecFor('vfx_loop', library.templates.vfx_loop, id).anchor).toBe('center');
    },
  );
});
