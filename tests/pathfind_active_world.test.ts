import { afterEach, describe, expect, it, vi } from 'vitest';
import { customMapToWorldContent, newFlatCustomMap } from '../src/editor/custom_map';
import { thornhollowMap } from '../src/editor/shipped_thornhollow';
import { isBlocked } from '../src/sim/colliders';
import { BUILTIN_WORLD, getActiveWorldContent, setActiveWorldContent } from '../src/sim/data';
import { findPath } from '../src/sim/pathfind';

const originalWorld = getActiveWorldContent();
afterEach(() => setActiveWorldContent(originalWorld));

describe('pathfinding active-world road fallback', () => {
  it('uses the current map authored roads when the direct route is blocked', () => {
    const map = newFlatCustomMap('Road detour', 'authored_road_path', 0, {
      width: 400,
      height: 400,
    });
    const road = [
      { x: 113.125, z: -120 },
      { x: 113.125, z: 120 },
    ];
    map.content.roads = [road];
    const world = customMapToWorldContent(map);
    expect(world.roads).toEqual([road]);
    setActiveWorldContent(world);
    const destination = { x: 0, z: 150 };
    for (const point of [{ x: 0, z: -150 }, ...road, { x: road[0].x, z: 0 }, destination]) {
      expect(isBlocked(map.meta.seed, point.x, point.z, 0.5, true), JSON.stringify(point)).toBe(
        false,
      );
    }
    expect(getActiveWorldContent()).toBe(world);
    const legs = [{ x: 0, z: -150 }, ...road, destination];
    for (let leg = 1; leg < legs.length; leg++) {
      const a = legs[leg - 1];
      const b = legs[leg];
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
      for (let i = 1; i <= steps; i++) {
        const x = a.x + ((b.x - a.x) * i) / steps;
        const z = a.z + ((b.z - a.z) * i) / steps;
        expect(isBlocked(map.meta.seed, x, z, 0.5, true), JSON.stringify({ leg, x, z })).toBe(
          false,
        );
      }
    }
    expect(
      findPath({ x: 0, z: -150 }, destination, {
        seed: map.meta.seed,
        bodyRadius: 0.5,
        maxClimbSlope: Infinity,
        minGround: (x, z) => (Math.abs(x) < 20 && Math.abs(z) < 4 ? Infinity : -Infinity),
        maxSpan: 64,
        ignoreFences: true,
        roadFallback: true,
      }),
    ).toEqual([...road, destination]);
  });

  it('keeps an over-span roadless map route bounded without probing built-in road geometry', () => {
    expect(BUILTIN_WORLD.roads.length).toBeGreaterThan(0);
    const map = thornhollowMap('Thornhollow', 'roadless_path', 1);
    const world = customMapToWorldContent(map);
    expect(world.roads).toEqual([]);
    setActiveWorldContent(world);
    const minGround = vi.fn(() => {
      throw new Error('a roadless over-span fallback must not probe road geometry');
    });
    const destination = { x: 0, z: 150 };
    expect(
      findPath({ x: 0, z: -150 }, destination, {
        seed: map.meta.seed,
        bodyRadius: 0.5,
        maxClimbSlope: 1.5,
        minGround,
        maxSpan: 128,
        ignoreFences: true,
        roadFallback: true,
      }),
    ).toEqual([destination]);
    expect(minGround).not.toHaveBeenCalled();
  });
});
