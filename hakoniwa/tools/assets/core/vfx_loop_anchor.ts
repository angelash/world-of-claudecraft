import { type Box, contentBox, type Img, isOpaque } from './image';

/** Measure the body without letting detached tiny motes move the ground effect's origin.
 * Components only affect measurement. Every pixel still goes through normal placement
 * and the full-image bounds check; this never filters, crops or edits the image.
 */
export function vfxLoopCoreBox(img: Img): Box | null {
  const seen = new Uint8Array(img.w * img.h);
  const components: { box: Box; pixels: number }[] = [];
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const start = y * img.w + x;
      if (seen[start] || !isOpaque(img, x, y)) continue;
      seen[start] = 1;
      const todo = [start];
      let pixels = 0;
      let x0 = x;
      let x1 = x;
      let y0 = y;
      let y1 = y;
      while (todo.length > 0) {
        const pos = todo.pop()!;
        const px = pos % img.w;
        const py = Math.floor(pos / img.w);
        pixels++;
        x0 = Math.min(x0, px);
        x1 = Math.max(x1, px);
        y0 = Math.min(y0, py);
        y1 = Math.max(y1, py);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= img.w || ny >= img.h) continue;
            const next = ny * img.w + nx;
            if (seen[next] || !isOpaque(img, nx, ny)) continue;
            seen[next] = 1;
            todo.push(next);
          }
        }
      }
      components.push({ box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, pixels });
    }
  }
  const largest = components.reduce((max, component) => Math.max(max, component.pixels), 0);
  // Keep the union of substantial tufts, curls or ring segments, not just the largest.
  const minimum = Math.max(5, Math.ceil(largest * 0.05));
  const body = components.filter((component) => component.pixels >= minimum);
  if (body.length === 0) return contentBox(img);
  const x0 = Math.min(...body.map(({ box }) => box.x));
  const y0 = Math.min(...body.map(({ box }) => box.y));
  const x1 = Math.max(...body.map(({ box }) => box.x + box.w));
  const y1 = Math.max(...body.map(({ box }) => box.y + box.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
