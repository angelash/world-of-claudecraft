// Renderer seam (art_pipeline.md 2.1): the session hands a Scene to whichever backend is
// installed: the HD-2D scene (src/client/hd2d/, Three.js) or the flat Canvas2D fallback
// used without WebGL or when the player picks the flat quality tier. Both project the
// same view request; picking, ground clicks and quality switching go through here. Frames
// are drawn on demand (release_engineering.md 6.3): a still picture is not redrawn.

import type { QualitySettings } from '../hd2d/quality';
import type { FrameLayers } from './frame_scheduler';
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
  /**
   * Draw a frame. The session calls this only when the frame scheduler finds the frame
   * dirty (frame_scheduler.ts); `layers` names what changed, and a backend may keep the
   * other layer's last picture (the HD-2D world pass or its overlay canvas). Omitted means
   * every layer.
   */
  render(scene: Scene, layers?: Readonly<FrameLayers>): void;
  hitBoxes(): readonly HitBox[];
  /** the ground point (tiles) under a device pixel of the last frame's view */
  screenToGround(sx: number, sy: number): { x: number; y: number } | null;
  setQuality(q: QualitySettings): void;
  /** release GPU and canvas resources and remove the canvases */
  dispose(): void;
}
