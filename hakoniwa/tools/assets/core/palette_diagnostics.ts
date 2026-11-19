import { deltaE, labOf } from './color';
import { getPx, type Img } from './image';

export interface LocalPaletteError {
  frame: number;
  region: [number, number, number, number];
  pixels: number;
  meanError: number;
}

/** Diagnostic only: measure the actual output, including dither and color-cap folding. */
export function paletteErrorEvidence(
  original: readonly Img[],
  processed: readonly Img[],
  keyMasks: readonly Uint8Array[],
): { meanError: number; localErrors: LocalPaletteError[] } {
  let sum = 0;
  let count = 0;
  const regions: LocalPaletteError[] = [];
  processed.forEach((image, frame) => {
    for (let by = 0; by < image.h; by += 16) {
      for (let bx = 0; bx < image.w; bx += 16) {
        let error = 0;
        let pixels = 0;
        const width = Math.min(16, image.w - bx);
        const height = Math.min(16, image.h - by);
        for (let y = by; y < by + height; y++) {
          for (let x = bx; x < bx + width; x++) {
            if (keyMasks[frame]?.[y * image.w + x]) continue;
            const before = getPx(original[frame]!, x, y);
            const after = getPx(image, x, y);
            if ((before & 255) < 128 || (after & 255) < 128) continue;
            error += deltaE(labOf(before), labOf(after));
            pixels++;
          }
        }
        sum += error;
        count += pixels;
        if (pixels > 0 && error / pixels > 0.07) {
          regions.push({
            frame,
            region: [bx, by, width, height],
            pixels,
            meanError: error / pixels,
          });
        }
      }
    }
  });
  regions.sort(
    (a, b) =>
      b.meanError - a.meanError ||
      a.frame - b.frame ||
      a.region[1] - b.region[1] ||
      a.region[0] - b.region[0],
  );
  return { meanError: count ? sum / count : 0, localErrors: regions.slice(0, 16) };
}
