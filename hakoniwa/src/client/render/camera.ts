// Units and the flat fallback's camera (art_pipeline.md 1.3 and 2.1): one tile is one
// metre is TILE_PX pixels everywhere (ground, walls, standees). The flat renderer looks
// straight down with integer zoom only, the camera position split into an integer
// world-pixel part (the low-resolution world canvas is drawn at it) and a fractional part
// (applied as a device-pixel offset when upscaling), and screen to world conversion for
// picking. The HD-2D camera lives in ../hd2d/view.ts. Pure; Node-tested.

export const TILE_PX = 16;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;

export interface Camera {
  /** device pixels per world pixel (integer) */
  zoom: number;
  /** world-pixel coordinates of the view's top-left corner (may be fractional) */
  x: number;
  y: number;
  /** viewport size in device pixels */
  viewW: number;
  viewH: number;
}

/** Default zoom: about 360 world pixels (22 tiles) of height, at least 1. */
export function defaultZoom(deviceW: number, deviceH: number): number {
  const byH = Math.round(deviceH / 360);
  const byW = Math.round(deviceW / 640);
  return clampZoom(Math.max(1, Math.min(byH, byW + 1)));
}

export function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(z)));
}

/** Size of the low-resolution world canvas, with a one-pixel margin for sub-pixel scrolling. */
export function logicalSize(
  deviceW: number,
  deviceH: number,
  zoom: number,
): { w: number; h: number } {
  return { w: Math.ceil(deviceW / zoom) + 2, h: Math.ceil(deviceH / zoom) + 2 };
}

/**
 * Camera top-left (world pixels) that centres `target` (tiles), clamped to the map.
 * A map smaller than the view is centred instead of clamped.
 */
export function followCamera(
  target: { x: number; y: number },
  mapW: number,
  mapH: number,
  deviceW: number,
  deviceH: number,
  zoom: number,
): { x: number; y: number } {
  const viewWpx = deviceW / zoom;
  const viewHpx = deviceH / zoom;
  const mapWpx = mapW * TILE_PX;
  const mapHpx = mapH * TILE_PX;
  const axis = (t: number, view: number, size: number) => {
    if (size <= view) return (size - view) / 2;
    return Math.max(0, Math.min(size - view, t * TILE_PX - view / 2));
  };
  return { x: axis(target.x, viewWpx, mapWpx), y: axis(target.y, viewHpx, mapHpx) };
}

/** Split a camera position into the integer world pixel and the device-pixel remainder. */
export function snapCamera(cam: Camera): { ix: number; iy: number; ox: number; oy: number } {
  const ix = Math.floor(cam.x);
  const iy = Math.floor(cam.y);
  return {
    ix,
    iy,
    ox: -Math.round((cam.x - ix) * cam.zoom),
    oy: -Math.round((cam.y - iy) * cam.zoom),
  };
}

/** Tile coordinates to device pixels. */
export function worldToScreen(cam: Camera, tx: number, ty: number): { sx: number; sy: number } {
  return { sx: (tx * TILE_PX - cam.x) * cam.zoom, sy: (ty * TILE_PX - cam.y) * cam.zoom };
}

/** Device pixels to tile coordinates. */
export function screenToWorld(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx / cam.zoom + cam.x) / TILE_PX, y: (sy / cam.zoom + cam.y) / TILE_PX };
}

/** Integer world-pixel position of a tile coordinate inside the low-resolution canvas. */
export function toLogical(
  ix: number,
  iy: number,
  tx: number,
  ty: number,
): { lx: number; ly: number } {
  return { lx: Math.round(tx * TILE_PX) - ix, ly: Math.round(ty * TILE_PX) - iy };
}

/** Visible tile range (inclusive start, exclusive end), clamped to the map. */
export function visibleTiles(
  cam: Camera,
  mapW: number,
  mapH: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const a = screenToWorld(cam, 0, 0);
  const b = screenToWorld(cam, cam.viewW, cam.viewH);
  return {
    x0: Math.max(0, Math.floor(a.x) - 1),
    y0: Math.max(0, Math.floor(a.y) - 1),
    x1: Math.min(mapW, Math.ceil(b.x) + 1),
    y1: Math.min(mapH, Math.ceil(b.y) + 3),
  };
}
