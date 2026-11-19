// Supplemental catalog icon. Its surrounding label, tooltip and interaction remain intact;
// a missing or undecoded bitmap simply hides this canvas. Pixel uploads happen on a new
// id, size or installed-art revision, never on an idle HUD frame.

import { assetRevision } from '../assets/runtime';
import { contentIconPixels, fitIconPixels, type IconKind } from '../assets/surface_art';
import { makeCanvas } from '../render/canvas_util';

export class ArtIcon {
  readonly el: HTMLCanvasElement;
  private key = '';

  constructor(private readonly size = 24) {
    this.el = makeCanvas(size, size);
    this.el.className = 'hk-art-icon';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.style.imageRendering = 'pixelated';
    this.el.style.flex = '0 0 auto';
    this.el.style.width = `${size}px`;
    this.el.style.height = `${size}px`;
    this.el.hidden = true;
  }

  show(kind: IconKind, contentId: string | null): void {
    const key = `${assetRevision()}:${kind}:${contentId ?? ''}`;
    if (key === this.key) return;
    this.key = key;
    const art = contentId ? contentIconPixels(kind, contentId) : null;
    this.el.hidden = !art;
    if (!art) return;
    const context = this.el.getContext('2d');
    if (!context) {
      this.el.hidden = true;
      return;
    }
    const pixels = fitIconPixels(art.pixels, this.size);
    context.imageSmoothingEnabled = false;
    context.putImageData(
      new ImageData(new Uint8ClampedArray(pixels.rgba), pixels.w, pixels.h),
      0,
      0,
    );
  }
}
