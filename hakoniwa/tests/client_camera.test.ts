import { describe, expect, it } from 'vitest';
import {
  type Camera,
  clampZoom,
  defaultZoom,
  followCamera,
  logicalSize,
  MAX_ZOOM,
  screenToWorld,
  snapCamera,
  TILE_PX,
  toLogical,
  visibleTiles,
  worldToScreen,
} from '../src/client/render/camera';

describe('client camera', () => {
  it('picks an integer default zoom from the device size', () => {
    expect(defaultZoom(1920, 1080)).toBe(3);
    expect(defaultZoom(1366, 768)).toBe(2);
    expect(defaultZoom(3840, 2160)).toBe(MAX_ZOOM);
    expect(defaultZoom(320, 200)).toBe(1);
    expect(Number.isInteger(defaultZoom(1280, 720))).toBe(true);
  });

  it('clamps zoom to whole steps inside the allowed range', () => {
    expect(clampZoom(0)).toBe(1);
    expect(clampZoom(2.4)).toBe(2);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
  });

  it('sizes the low-resolution canvas with a margin for sub-pixel scrolling', () => {
    expect(logicalSize(1920, 1080, 2)).toEqual({ w: 962, h: 542 });
    expect(logicalSize(1001, 601, 2)).toEqual({ w: 503, h: 303 });
  });

  it('centres the target and clamps to the map edges', () => {
    // 100x100 tile map, 960x540 world-pixel view at zoom 2 on a 1920x1080 screen.
    const mid = followCamera({ x: 50, y: 50 }, 100, 100, 1920, 1080, 2);
    expect(mid).toEqual({ x: 50 * TILE_PX - 480, y: 50 * TILE_PX - 270 });
    const corner = followCamera({ x: 1, y: 1 }, 100, 100, 1920, 1080, 2);
    expect(corner).toEqual({ x: 0, y: 0 });
    const far = followCamera({ x: 99, y: 99 }, 100, 100, 1920, 1080, 2);
    expect(far).toEqual({ x: 100 * TILE_PX - 960, y: 100 * TILE_PX - 540 });
  });

  it('centres a map smaller than the view instead of clamping', () => {
    const c = followCamera({ x: 3, y: 3 }, 20, 12, 1920, 1080, 2);
    expect(c.x).toBe((20 * TILE_PX - 960) / 2);
    expect(c.y).toBe((12 * TILE_PX - 540) / 2);
    expect(c.x).toBeLessThan(0);
  });

  it('splits the camera into an integer world pixel and a device-pixel offset', () => {
    const cam: Camera = { zoom: 3, x: 100.5, y: -7.25, viewW: 900, viewH: 600 };
    const s = snapCamera(cam);
    expect(s.ix).toBe(100);
    expect(s.iy).toBe(-8);
    expect(s.ox).toBe(-2); // -round(0.5 * 3) = -2 (round half up of 1.5)
    expect(s.oy).toBe(-2); // -round(0.75 * 3)
    for (const v of [s.ix, s.iy, s.ox, s.oy]) expect(Number.isInteger(v)).toBe(true);
  });

  it('round-trips between world and screen coordinates', () => {
    const cam: Camera = { zoom: 2, x: 37.5, y: 12, viewW: 800, viewH: 600 };
    for (const [tx, ty] of [
      [3.25, 4.5],
      [0, 0],
      [17.875, 9.0625],
    ] as const) {
      const s = worldToScreen(cam, tx, ty);
      const w = screenToWorld(cam, s.sx, s.sy);
      expect(w.x).toBeCloseTo(tx, 9);
      expect(w.y).toBeCloseTo(ty, 9);
    }
    // The view's top-left corner is the camera position.
    expect(screenToWorld(cam, 0, 0)).toEqual({ x: 37.5 / TILE_PX, y: 12 / TILE_PX });
  });

  it('places tile coordinates on integer logical pixels', () => {
    expect(toLogical(10, 20, 2.5, 3.03)).toEqual({ lx: 30, ly: 28 });
  });

  it('limits the visible tile range to the map', () => {
    const cam: Camera = { zoom: 2, x: 0, y: 0, viewW: 640, viewH: 320 };
    const v = visibleTiles(cam, 15, 8);
    expect(v.x0).toBe(0);
    expect(v.y0).toBe(0);
    expect(v.x1).toBe(15);
    expect(v.y1).toBe(8);
  });
});
