// Save thumbnails (ux_and_onboarding.md 3.5: "存档时的世界截图，320×180"): a one-shot capture of
// the world canvases right after a frame that drew every layer. The WebGL world canvas keeps
// its picture only until the frame is composited, so the copy is taken in the same task as the
// render; the session forces a full redraw when a capture is asked for. Thin DOM; the store of
// the pictures is ../hud/slot_extras.ts.

import { THUMB_H, THUMB_W } from '../hud/slot_extras';

/** JPEG quality of a thumbnail (a 320x180 picture stays near 20 KB). */
export const THUMB_QUALITY = 0.72;

export class ThumbnailCapture {
  private waiting: ((url: string | null) => void)[] = [];

  /**
   * @param redraw asks the frame scheduler to redraw every layer on the next frame
   * @param timeoutMs a capture that no frame fulfils in time answers null
   */
  constructor(
    private readonly redraw: () => void,
    private readonly timeoutMs = 1500,
  ) {}

  /** A picture of the next fully drawn frame, or null (no frame in time, tainted canvas). */
  request(): Promise<string | null> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = (url: string | null) => {
        clearTimeout(timer);
        resolve(url);
      };
      this.waiting.push(done);
      this.redraw();
      timer = setTimeout(() => {
        const i = this.waiting.indexOf(done);
        if (i < 0) return;
        this.waiting.splice(i, 1);
        resolve(null);
      }, this.timeoutMs);
    });
  }

  get pending(): boolean {
    return this.waiting.length > 0;
  }

  /** Call right after a frame that drew both the world and the overlay layers. */
  frameDrawn(root: ParentNode): void {
    if (this.waiting.length === 0) return;
    const url = captureCanvases(root);
    const waiting = this.waiting;
    this.waiting = [];
    for (const w of waiting) w(url);
  }
}

/** The world canvases under `root`, composed in page order and cropped to 16:9. */
export function captureCanvases(root: ParentNode): string | null {
  const canvases = [...root.querySelectorAll<HTMLCanvasElement>('canvas.hk-world')];
  if (canvases.length === 0) return null;
  const out = document.createElement('canvas');
  out.width = THUMB_W;
  out.height = THUMB_H;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#0e0c16';
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  ctx.imageSmoothingEnabled = true;
  for (const c of canvases) {
    if (c.width === 0 || c.height === 0) continue;
    const crop = coverCrop(c.width, c.height, THUMB_W / THUMB_H);
    ctx.drawImage(c, crop.x, crop.y, crop.w, crop.h, 0, 0, THUMB_W, THUMB_H);
  }
  try {
    return out.toDataURL('image/jpeg', THUMB_QUALITY);
  } catch {
    return null;
  }
}

/** The centred source rectangle of aspect `aspect` that covers a `w` by `h` picture. */
export function coverCrop(
  w: number,
  h: number,
  aspect: number,
): { x: number; y: number; w: number; h: number } {
  if (w / h > aspect) {
    const cw = Math.round(h * aspect);
    return { x: Math.round((w - cw) / 2), y: 0, w: cw, h };
  }
  const ch = Math.round(w / aspect);
  return { x: 0, y: Math.round((h - ch) / 2), w, h: ch };
}
