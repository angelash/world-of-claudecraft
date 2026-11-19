import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type FrameInput, placeFrames } from '../tools/assets/core/anchor';
import { hexToPx } from '../tools/assets/core/color';
import { contentBox, createImg, crop, type Img, setPx } from '../tools/assets/core/image';
import { processArt } from '../tools/assets/core/pipeline';
import { importSpecFor } from '../tools/assets/core/template_specs';
import { makeSheet } from './art_fixtures';

const library = JSON.parse(
  readFileSync(join(__dirname, '..', 'assets', 'prompts', 'templates.json'), 'utf8'),
);

function prop(top: number): Img {
  const image = createImg(48, 64);
  for (let y = top; y < top + 20; y++) {
    for (let x = 16; x < 32; x++) setPx(image, x, y, hexToPx('#9a7448'));
  }
  return image;
}

function frames(template: string): {
  spec: ReturnType<typeof importSpecFor>;
  frames: FrameInput[];
} {
  const spec = importSpecFor(template, library.templates[template], 'art_mon_test_r');
  const row = template === 'prop_medium' ? 0 : 1;
  return {
    spec,
    frames: [20, 24].map((y, col) => ({
      col,
      row,
      def: spec.cells[row]![col]!,
      img: createImg(8, 8, hexToPx('#9a7448')),
      rel: [20, y],
    })),
  };
}

describe('art foot anchoring', () => {
  it('imports independent prop variants onto the floor without clipping either variant', () => {
    const src = makeSheet(
      [
        [prop(16), prop(24)],
        [prop(20), prop(28)],
      ],
      [48, 64],
      { block: 8 },
    );
    const result = processArt({
      id: 'art_prop_test',
      template: 'prop_medium',
      templateDef: library.templates.prop_medium,
      style: 'lothar_plain',
      styleAnchors: library.styles.lothar_plain.palette,
      src,
      sourceFile: 'art/props/art_prop_test.png',
      sourceSha256: 'a'.repeat(64),
      aigcLabel: 'none',
    });
    expect(result.problems.filter((p) => p.check === 'frame_bounds')).toEqual([]);
    expect(result.meta.frames).toHaveLength(4);
    for (const frame of result.meta.frames) {
      const image = crop(result.img!, frame.x, frame.y, frame.w, frame.h);
      const box = contentBox(image)!;
      expect(box.y + box.h - 1).toBe(63);
      expect(box.h).toBe(22);
    }
  });

  it('keeps vertical motion between frames of a real animation', () => {
    const { spec, frames: input } = frames('mon_small');
    const result = placeFrames(input, spec);
    expect(result.frames[1]!.at[1] - result.frames[0]!.at[1]).toBe(4);
    expect(result.problems).toEqual([]);
  });

  it('keeps a flying animation at its supplied height', () => {
    const { spec, frames: input } = frames('mon_flying');
    const result = placeFrames(input, spec);
    expect(result.frames.map((f) => f.at[1])).toEqual([20, 24]);
  });

  it('still rejects static content that is actually taller than its cell', () => {
    const { spec, frames: input } = frames('prop_medium');
    input[0]!.img = createImg(8, 65, hexToPx('#9a7448'));
    const result = placeFrames(input.slice(0, 1), spec);
    expect(result.problems.some((p) => p.check === 'frame_bounds')).toBe(true);
  });
});
