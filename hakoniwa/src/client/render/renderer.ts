// Renderer seam (decision A-04): the session hands a Scene to whatever backend is
// installed. Canvas2D is the first backend; a Three.js orthographic sprite batch can
// implement the same interface later without touching the session, HUD or input.

import type { MapDef } from '../../systems/world/types';
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
  readonly canvas: HTMLCanvasElement;
  /** canvas size in device pixels */
  readonly deviceW: number;
  readonly deviceH: number;
  readonly dpr: number;
  resize(cssW: number, cssH: number, dpr: number): void;
  /** Prepare per-map caches (baked ground, roofs). */
  setMap(map: MapDef): void;
  render(scene: Scene): void;
  hitBoxes(): readonly HitBox[];
  dispose(): void;
}
