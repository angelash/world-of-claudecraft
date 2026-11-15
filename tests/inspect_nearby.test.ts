import { describe, expect, it, vi } from 'vitest';
import { type InspectWorld, inspectNearby } from '../src/game/inspect_nearby';
import { type Entity, INTERACT_RANGE } from '../src/sim/types';

function entity(id: number, x: number, lootable = true, kind = 'object'): Entity {
  return { id, kind, lootable, pos: { x, y: 100, z: 0 } } as Entity;
}

function world(entities: Entity[]): InspectWorld {
  return {
    player: { pos: { x: 0, y: 0, z: 0 } } as Entity,
    entities: new Map(entities.map((value) => [value.id, value])),
    aiInspectObject: vi.fn(),
    aiInspectScene: vi.fn(),
  };
}

describe('inspectNearby', () => {
  it('inspects the closest lootable object with the requested language', () => {
    const fixture = world([
      entity(1, 0.1, false),
      entity(2, 0.2, true, 'npc'),
      entity(3, 3),
      entity(4, 2),
    ]);
    inspectNearby(fixture, 'zh_CN');
    expect(fixture.aiInspectObject).toHaveBeenCalledExactlyOnceWith(4, 'zh_CN');
    expect(fixture.aiInspectScene).not.toHaveBeenCalled();
  });

  it('retains the first object when horizontal distances tie', () => {
    const fixture = world([entity(7, 2), entity(6, -2)]);
    inspectNearby(fixture, 'en');
    expect(fixture.aiInspectObject).toHaveBeenCalledExactlyOnceWith(7, 'en');
    expect(fixture.aiInspectScene).not.toHaveBeenCalled();
  });

  it('retains the object allowance just inside the strict outer boundary', () => {
    const fixture = world([entity(3, INTERACT_RANGE + 0.5)]);
    inspectNearby(fixture, 'en');
    expect(fixture.aiInspectObject).toHaveBeenCalledExactlyOnceWith(3, 'en');
    expect(fixture.aiInspectScene).not.toHaveBeenCalled();
  });

  it('falls back to the scene at the strict outer boundary or without objects', () => {
    for (const entities of [[], [entity(3, INTERACT_RANGE + 1)]]) {
      const fixture = world(entities);
      inspectNearby(fixture, 'ja_JP');
      expect(fixture.aiInspectScene).toHaveBeenCalledExactlyOnceWith('ja_JP');
      expect(fixture.aiInspectObject).not.toHaveBeenCalled();
    }
  });
});
