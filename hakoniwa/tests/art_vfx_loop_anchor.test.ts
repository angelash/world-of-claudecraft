import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type FrameInput, placeFrames } from '../tools/assets/core/anchor';
import { hexToPx } from '../tools/assets/core/color';
import { contentBox, createImg, crop, getPx, type Img, setPx } from '../tools/assets/core/image';
import { importSpecFor } from '../tools/assets/core/template_specs';

const library = JSON.parse(
  readFileSync(join(__dirname, '..', 'assets', 'prompts', 'templates.json'), 'utf8'),
);
const grass = hexToPx('#7ad04a');
const mote = hexToPx('#c8f07a');

function rect(img: Img, x: number, y: number, w: number, h: number, color: number): void {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) setPx(img, x + dx, y + dy, color);
}

function input(images: Img[]) {
  const spec = importSpecFor('vfx_loop', library.templates.vfx_loop, 'art_vfx_test');
  const frames: FrameInput[] = images.map((img, i) => {
    const box = contentBox(img)!;
    return {
      col: i % 4,
      row: Math.floor(i / 4),
      def: spec.cells[Math.floor(i / 4)]![i % 4]!,
      img: crop(img, box.x, box.y, box.w, box.h),
      rel: [box.x, box.y],
    };
  });
  return { spec, frames };
}

function colorBox(img: Img, color: number) {
  const mask = createImg(img.w, img.h);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (getPx(img, x, y) === color) setPx(mask, x, y, color);
    }
  }
  return contentBox(mask);
}

describe('ground VFX loop anchoring', () => {
  it('keeps the grass fixed while its separate motes rise and preserves every pixel', () => {
    const { spec, frames } = input(
      [6, 8, 10, 12, 14, 12, 10, 8].map((y) => {
        const image = createImg(64, 64);
        rect(image, 22, 32, 12, 8, grass);
        rect(image, 18, y, 2, 2, mote);
        return image;
      }),
    );
    const originals = frames.map((frame) => frame.img.data.slice());
    const placed = placeFrames(frames, spec);
    expect(placed.problems).toEqual([]);
    expect(placed.frames.map((frame) => colorBox(frame.cell, grass))).toEqual(
      Array.from({ length: 8 }, () => ({ x: 26, y: 28, w: 12, h: 8 })),
    );
    for (const [i, frame] of placed.frames.entries()) {
      expect(
        frame.cell.data.filter((_, o) => o % 4 === 3 && frame.cell.data[o] === 255),
      ).toHaveLength(100);
      expect(frame.img.data).toEqual(originals[i]);
      expect(colorBox(frame.cell, mote)).toMatchObject({ w: 2, h: 2 });
    }
    expect(placed.frames.map((frame) => colorBox(frame.cell, mote)!.y)).toEqual([
      2, 4, 6, 8, 10, 8, 6, 4,
    ]);
  });

  it('centers the union of substantial grass tufts and keeps a distant mote', () => {
    const image = createImg(64, 64);
    for (const x of [14, 26, 38]) rect(image, x, 30, 5, 8, grass);
    setPx(image, 58, 10, mote);
    const { spec, frames } = input([image]);
    const placed = placeFrames(frames, spec);
    expect(placed.problems).toEqual([]);
    expect(colorBox(placed.frames[0]!.cell, grass)).toEqual({ x: 17, y: 28, w: 29, h: 8 });
    expect(colorBox(placed.frames[0]!.cell, mote)).toEqual({ x: 61, y: 8, w: 1, h: 1 });
  });

  it('rejects a real bounds violation instead of dropping an outlying particle', () => {
    const image = createImg(64, 64);
    rect(image, 2, 30, 12, 8, grass);
    setPx(image, 62, 10, mote);
    const { spec, frames } = input([image]);
    const placed = placeFrames(frames, spec);
    expect(placed.problems.some((problem) => problem.check === 'frame_bounds')).toBe(true);
    expect(colorBox(frames[0]!.img, mote)).not.toBeNull();
  });

  it('keeps existing centering for other VFX templates', () => {
    const image = createImg(64, 64);
    rect(image, 22, 32, 12, 8, grass);
    rect(image, 18, 6, 2, 2, mote);
    const { spec, frames } = input([image]);
    const placed = placeFrames(frames, { ...spec, template: 'vfx_medium' });
    expect(placed.problems).toEqual([]);
    expect(colorBox(placed.frames[0]!.cell, grass)).toEqual({ x: 28, y: 41, w: 12, h: 8 });
  });

  it('falls back to full bounds when the loop consists only of tiny particles', () => {
    const image = createImg(64, 64);
    rect(image, 18, 6, 2, 2, mote);
    rect(image, 30, 24, 2, 2, mote);
    const { spec, frames } = input([image]);
    const placed = placeFrames(frames, spec);
    expect(placed.problems).toEqual([]);
    expect(contentBox(placed.frames[0]!.cell)).toEqual({ x: 25, y: 22, w: 14, h: 20 });
  });
});
