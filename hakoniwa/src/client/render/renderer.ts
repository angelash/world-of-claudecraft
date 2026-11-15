// Renderer seam (art_pipeline.md 2.1): the session hands a Scene to whichever backend is
// installed: the HD-2D scene (src/client/hd2d/, Three.js) or the flat Canvas2D fallback
// used without WebGL or when the player picks the flat quality tier. Both project the
// same view request; picking, ground clicks and quality switching go through here.

import type { QualitySettings } from '../hd2d/quality';
import type { MapContext } from './map_context';
import type { Scene } from './scene';

/** Screen-space box of an entity drawn in the last frame (device pixels), for picking. */
export interface HitBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** depth key; the front-most box wins a pick */
  sortY: number;
}

export interface WorldRenderer {
  readonly kind: 'hd2d' | 'flat';
  /** topmost canvas: receives pointer input */
  readonly canvas: HTMLCanvasElement;
  /** canvas size in device pixels */
  readonly deviceW: number;
  readonly deviceH: number;
  readonly dpr: number;
  /** add the renderer's canvases to a container */
  mount(parent: HTMLElement): void;
  resize(cssW: number, cssH: number, dpr: number): void;
  /** Prepare per-map caches (baked ground, buildings, standees). */
  setMap(ctx: MapContext): void;
  render(scene: Scene): void;
  hitBoxes(): readonly HitBox[];
  /** the ground point (tiles) under a device pixel of the last frame's view */
  screenToGround(sx: number, sy: number): { x: number; y: number } | null;
  setQuality(q: QualitySettings): void;
  /** release GPU and canvas resources and remove the canvases */
  dispose(): void;
}
