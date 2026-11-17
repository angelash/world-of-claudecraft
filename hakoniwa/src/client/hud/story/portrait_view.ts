// Painter of a portrait plan (./portrait_plan.ts) for `ui_mode_dialogue` and `ui_mode_cutscene`:
// approved art drawn from its processed image at a whole multiple of its size with
// `image-rendering: pixelated` (art_pipeline.md 3.6), the bust with its expression overlay
// placed by the frames' anchors, the standee crop of the speaker's entity (the session's
// sprite cache), a plate with the name's first character, or the empty frame. Redraws only
// when the plan changes. Thin DOM layer.

import { el } from '../../../shared_ui/dom';
import type { ResolvedFrame } from '../../assets/resolver';
import { type PortraitPlan, pixelScale, planKey } from './portrait_plan';

/** The standee crop of an entity (the session's sprite cache), or null. */
export type CropSource = (entityId: string, size: number) => HTMLCanvasElement | null;

const images = new Map<string, HTMLImageElement>();

function image(src: string, onLoad: () => void): HTMLImageElement {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = src;
    images.set(src, img);
  }
  if (!img.complete) img.addEventListener('load', onLoad, { once: true });
  return img;
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  f: ResolvedFrame,
  img: HTMLImageElement,
  x: number,
  y: number,
  k: number,
): void {
  const r = f.frame;
  ctx.save();
  if (f.flipX) {
    ctx.translate(x + r.w * k, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w * k, r.h * k);
  } else ctx.drawImage(img, r.x, r.y, r.w, r.h, x, y, r.w * k, r.h * k);
  ctx.restore();
}

export class PortraitView {
  readonly el: HTMLElement;
  private key = '';

  constructor(
    private readonly box: { w: number; h: number },
    private readonly crop: CropSource,
    cls = '',
  ) {
    this.el = el('div', { className: `hk-story-portrait ${cls}`.trim() });
  }

  show(plan: PortraitPlan | null): void {
    const key = plan ? planKey(plan) : '';
    if (key === this.key) return;
    this.key = key;
    this.el.replaceChildren();
    this.el.classList.toggle('empty-frame', plan?.kind === 'empty');
    if (!plan || plan.kind === 'empty') return;
    if (plan.kind === 'plate') {
      this.el.append(el('div', { className: 'hk-story-plate', text: plan.initial }));
      return;
    }
    if (plan.kind === 'crop') {
      const c = this.crop(plan.entityId, Math.min(this.box.w, this.box.h));
      if (c) {
        c.className = 'hk-story-canvas';
        this.el.append(c);
      }
      return;
    }
    const canvas = el('canvas', { className: 'hk-story-canvas' });
    canvas.width = this.box.w;
    canvas.height = this.box.h;
    this.el.append(canvas);
    const paint = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (plan.kind === 'portrait') {
        const f = plan.frame;
        const img = image(f.image, paint);
        if (!img.complete) return;
        const k = pixelScale(Math.max(f.frame.w, f.frame.h), Math.min(this.box.w, this.box.h));
        const x = Math.floor((this.box.w - f.frame.w * k) / 2);
        const y = Math.floor((this.box.h - f.frame.h * k) / 2);
        drawFrame(ctx, f, img, x, y, k);
        return;
      }
      const b = plan.base;
      const img = image(b.image, paint);
      if (!img.complete) return;
      const k = pixelScale(b.frame.h, this.box.h);
      const x = Math.floor((this.box.w - b.frame.w * k) / 2);
      const y = this.box.h - b.frame.h * k;
      drawFrame(ctx, b, img, x, y, k);
      const e = plan.expression;
      if (!e) return;
      const ei = image(e.image, paint);
      if (!ei.complete) return;
      // The face anchor of the base and of the overlay meet (art_pipeline 3.6); without
      // anchors the overlay sits at the top centre.
      const ex =
        b.ax !== null && e.ax !== null
          ? x + (b.ax - e.ax) * k
          : x + Math.floor(((b.frame.w - e.frame.w) * k) / 2);
      const ey = b.ay !== null && e.ay !== null ? y + (b.ay - e.ay) * k : y;
      drawFrame(ctx, e, ei, ex, ey, k);
    };
    paint();
  }
}
