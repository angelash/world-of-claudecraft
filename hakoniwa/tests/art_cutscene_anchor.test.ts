import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hexToPx } from '../tools/assets/core/color';
import { contentBox, createImg, crop, opaqueCount, setPx } from '../tools/assets/core/image';
import { processArt } from '../tools/assets/core/pipeline';
import { makeSheet } from './art_fixtures';

const library = JSON.parse(
  readFileSync(join(__dirname, '..', 'assets', 'prompts', 'templates.json'), 'utf8'),
);

/** A complete asymmetric close-up, with distinct edges to expose any clipping. */
function closeup() {
  const img = createImg(128, 192);
  for (let y = 48; y < 144; y++) {
    for (let x = 20; x < 108; x++) setPx(img, x, y, hexToPx('#9a7448'));
  }
  for (let y = 112; y < 140; y++) {
    for (let x = 28; x < 44; x++) setPx(img, x, y, hexToPx('#c5bca7'));
  }
  return img;
}

function importProp(id: string, template = 'prop_huge') {
  return processArt({
    id,
    template,
    templateDef: library.templates[template],
    style: 'lothar_plain',
    styleAnchors: library.styles.lothar_plain.palette,
    src: makeSheet([[closeup()]], [128, 192], { block: 8 }),
    sourceFile: `${id}.png`,
    sourceSha256: 'c'.repeat(64),
    aigcLabel: 'none',
  });
}

describe('cutscene close-up anchor contracts', () => {
  it.each(['art_prop_cut_brun_glove', 'art_prop_cut_door_mark', 'art_prop_cut_door_mark_2'])(
    'keeps the whole %s subject inside the central square',
    (id) => {
      const result = importProp(id);
      expect(result.problems.filter((problem) => !problem.warning)).toEqual([]);
      expect(result.img).not.toBeNull();
      const img = result.img!;
      const box = contentBox(img)!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(32);
      expect(box.x + box.w).toBeLessThanOrEqual(128);
      expect(box.y + box.h).toBeLessThanOrEqual(160);
      expect(Math.abs(box.x + box.w / 2 - 64)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.y + box.h / 2 - 96)).toBeLessThanOrEqual(1);
      expect(opaqueCount(crop(img, 0, 32, 128, 128))).toBe(opaqueCount(img));
      expect(result.meta.frames[0]).toMatchObject({ ax: 64, ay: 96, w: 128, h: 192 });
      expect(result.meta.source.sha256).toBe('c'.repeat(64));
    },
  );

  it('preserves pixels and colors rather than clipping or changing the close-up to fit', () => {
    const centered = importProp('art_prop_cut_brun_glove').img!;
    const grounded = importProp('art_prop_landmark_tree').img!;
    const pixels = (img: typeof centered) => {
      const counts = new Map<string, number>();
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i + 3]! < 128) continue;
        const color = Array.from(img.data.subarray(i, i + 4)).join(',');
        counts.set(color, (counts.get(color) ?? 0) + 1);
      }
      return [...counts].sort(([a], [b]) => a.localeCompare(b));
    };
    expect(pixels(centered)).toEqual(pixels(grounded));
  });

  it.each([
    ['art_prop_landmark_tree', 'prop_huge'],
    ['art_prop_cut_unlisted', 'prop_huge'],
    ['art_bld_town_monument', 'bld_landmark'],
  ])('keeps %s on its ordinary foot anchor', (id, template) => {
    const result = importProp(id, template);
    expect(result.problems.filter((problem) => !problem.warning)).toEqual([]);
    const box = contentBox(result.img!)!;
    expect(box.y + box.h - 1).toBe(191);
    expect(result.meta.frames[0]).toMatchObject({ ax: 64, ay: 191 });
  });
});
