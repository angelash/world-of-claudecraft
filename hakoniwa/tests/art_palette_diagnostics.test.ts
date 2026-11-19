import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { hexToPx } from '../tools/assets/core/color';
import { createImg, setPx } from '../tools/assets/core/image';
import { CREATURE_PALETTE, paletteColor } from '../tools/assets/core/palettes';
import { processArt } from '../tools/assets/core/pipeline';
import * as quantizer from '../tools/assets/core/quantize';
import { quantizeFrames } from '../tools/assets/core/quantize';
import { makeSheet } from './art_fixtures';

describe('local palette conversion evidence', () => {
  it('does not ignore a reported color-cap failure in the post-outline stage', () => {
    const library = JSON.parse(
      readFileSync(join(__dirname, '..', 'assets/prompts/templates.json'), 'utf8'),
    );
    const frame = createImg(32, 32);
    for (let y = 8; y < 24; y++) {
      for (let x = 8; x < 24; x++) setPx(frame, x, y, hexToPx('#9a7448'));
    }
    const original = quantizer.quantizeFrames;
    let calls = 0;
    const spy = vi.spyOn(quantizer, 'quantizeFrames').mockImplementation((...args) => {
      const result = original(...args);
      calls++;
      return calls === 2 ? { ...result, meanError: 0.12, folded: 1 } : result;
    });
    try {
      const result = processArt({
        id: 'art_prop_fixture',
        template: 'prop_small',
        templateDef: library.templates.prop_small,
        style: 'lothar_plain',
        styleAnchors: library.styles.lothar_plain.palette,
        src: makeSheet(
          [
            [frame, frame],
            [frame, frame],
          ],
          [32, 32],
          { block: 8 },
        ),
        sourceFile: 'art/props/art_prop_fixture.png',
        sourceSha256: 'a'.repeat(64),
        aigcLabel: 'none',
      });
      expect(calls).toBe(2);
      expect(
        result.problems.some(
          (p) => p.check === 'quant_error' && p.message.startsWith('post-outline:'),
        ),
      ).toBe(true);
      expect(result.meta.processing.postOutlineQuantization).toMatchObject({
        quantError: 0.12,
        folded: 1,
      });
    } finally {
      spy.mockRestore();
    }
  });
  it('measures final color loss after the color cap instead of reporting zero error', () => {
    const image = createImg(32, 32, hexToPx('#9a2e30'));
    for (let y = 0; y < 32; y++) {
      for (let x = 16; x < 32; x++) setPx(image, x, y, hexToPx('#2e4a88'));
    }
    const result = quantizeFrames([image], CREATURE_PALETTE, { maxColors: 1 });
    expect(result.nearestMeanError).toBe(0);
    expect(result.meanError).toBeGreaterThan(0.07);
    expect(result.folded).toBe(1);
  });
  it('reports a damaged minority region even when global mean error passes', () => {
    const image = createImg(100, 100, hexToPx('#ffffff'));
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) setPx(image, x, y, hexToPx('#6e4a30'));
    }
    const result = quantizeFrames([image], {
      id: 'fixture',
      colors: [paletteColor('#ffffff', 'white', 0), paletteColor('#2a2438', 'violet', 0)],
    });
    expect(result.meanError).toBeLessThan(0.07);
    expect(result.localErrors[0]?.frame).toBe(0);
    expect(result.localErrors[0]?.region).toEqual([0, 0, 16, 16]);
    expect(result.localErrors[0]?.meanError).toBeGreaterThan(0.07);
    expect(result.localErrors[0]?.pixels).toBe(256);
  });

  it('does not mark correctly mapped blocks as color damage', () => {
    const image = createImg(32, 32, hexToPx('#ffffff'));
    const result = quantizeFrames([image], {
      id: 'fixture',
      colors: [paletteColor('#ffffff', 'white', 0)],
    });
    expect(result.localErrors).toEqual([]);
    expect(result.meanError).toBe(0);
  });
});
