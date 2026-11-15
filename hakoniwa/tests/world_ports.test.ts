// World ports for the entity fields only the world system writes (release_engineering.md
// 13.1): life, tags, movement orders and speed. Each port keeps the exact semantics of
// the direct writes it replaced, validates the entity id, and emits no event.

import { describe, expect, it } from 'vitest';
import type { ContentMap } from '../src/core/contracts';
import { Engine } from '../src/core/engine';
import type { GameSystem, SystemContext } from '../src/core/system';
import {
  haltEntity,
  playerEntity,
  setLife,
  setMoveSpeed,
  setTag,
  setTagValue,
  spawnEntity,
  tagValue,
  system as worldSystem,
} from '../src/systems/world';
import type { Entity, MapDef } from '../src/systems/world/types';

const FIELD: MapDef = {
  id: 'field',
  name: '试验田',
  region: 'test',
  width: 10,
  height: 6,
  rows: ['##########', '#........#', '#........#', '#........#', '#........#', '##########'],
  legend: { '#': 'wall', '.': 'grass' },
  locations: [],
  spawns: [],
  exits: [],
};

/** A world-only engine and a way to run code inside a system context. */
function makeWorld() {
  let job: ((ctx: SystemContext) => void) | null = null;
  const probe: GameSystem = {
    id: 'zz_probe',
    order: 999,
    tick(ctx) {
      job?.(ctx);
      job = null;
    },
  };
  const content = {
    maps: [FIELD],
    worldStarts: [{ mapId: 'field', x: 2.5, y: 2.5, priority: 0 }],
  } as unknown as ContentMap;
  const engine = Engine.create(3, content, [worldSystem, probe]);
  const run = <T>(fn: (ctx: SystemContext) => T): T => {
    let out: T | undefined;
    job = (ctx) => {
      out = fn(ctx);
    };
    engine.step(1);
    return out as T;
  };
  const player = (): Entity => playerEntity(engine.world) as Entity;
  return { engine, run, player };
}

/** Give the player a move order and an intent so halting has something to clear. */
function moving(e: Entity): void {
  e.move = { path: [{ x: 7.5, y: 3.5 }], goal: { x: 7.5, y: 3.5 }, arriveRadius: 0.2 };
  e.intent = { dx: 1, dy: 0 };
}

describe('world ports', () => {
  it('setLife kills an entity and drops its orders; revival leaves orders alone', () => {
    const { run, player } = makeWorld();
    const p = player();
    moving(p);
    expect(run((ctx) => setLife(ctx, p.id, false))).toBe(true);
    expect(p.alive).toBe(false);
    expect(p.move).toBeNull();
    expect(p.intent).toBeNull();
    moving(p);
    expect(run((ctx) => setLife(ctx, p.id, true))).toBe(true);
    expect(p.alive).toBe(true);
    expect(p.move).not.toBeNull();
    expect(p.intent).toEqual({ dx: 1, dy: 0 });
  });

  it('setTagValue replaces every prefix tag and appends the new value last', () => {
    const { run, player } = makeWorld();
    const p = player();
    p.tags = ['lvl:3', 'player', 'lvl:4', 'tier:1'];
    expect(run((ctx) => setTagValue(ctx, p.id, 'lvl', 7))).toBe(true);
    expect(p.tags).toEqual(['player', 'tier:1', 'lvl:7']);
    run((ctx) => setTagValue(ctx, p.id, 'tier', '2'));
    expect(p.tags).toEqual(['player', 'lvl:7', 'tier:2']);
    expect(tagValue(p, 'lvl')).toBe('7');
    expect(tagValue(p, 'tier')).toBe('2');
    expect(tagValue(p, 'class')).toBeUndefined();
  });

  it('setTag adds and removes a plain tag and leaves the list untouched otherwise', () => {
    const { run, player } = makeWorld();
    const p = player();
    p.tags = ['player'];
    run((ctx) => setTag(ctx, p.id, 'hostile', true));
    expect(p.tags).toEqual(['player', 'hostile']);
    const same = p.tags;
    run((ctx) => setTag(ctx, p.id, 'hostile', true));
    run((ctx) => setTag(ctx, p.id, 'friendly', false));
    expect(p.tags).toBe(same);
    run((ctx) => setTag(ctx, p.id, 'hostile', false));
    expect(p.tags).toEqual(['player']);
  });

  it('haltEntity clears the move order and the intent and nothing else', () => {
    const { run, player } = makeWorld();
    const p = player();
    moving(p);
    // the world tick walks the player first, so read the state inside the probe
    const snap = () => ({ x: p.x, y: p.y, alive: p.alive, speed: p.speed, tags: [...p.tags] });
    let at: ReturnType<typeof snap> | undefined;
    const halted = run((ctx) => {
      at = snap();
      return haltEntity(ctx, p.id);
    });
    expect(halted).toBe(true);
    expect(p.move).toBeNull();
    expect(p.intent).toBeNull();
    expect(snap()).toEqual(at);
  });

  it('setMoveSpeed sets the speed and clamps negatives to zero', () => {
    const { run, player } = makeWorld();
    const p = player();
    run((ctx) => setMoveSpeed(ctx, p.id, 1.75));
    expect(p.speed).toBe(1.75);
    run((ctx) => setMoveSpeed(ctx, p.id, -3));
    expect(p.speed).toBe(0);
  });

  it('every port rejects an unknown id without touching any entity', () => {
    const { engine, run } = makeWorld();
    const other = run((ctx) =>
      spawnEntity(ctx, {
        kind: 'monster',
        name: '野狼',
        mapId: 'field',
        x: 5.5,
        y: 3.5,
        faction: 'beast',
        appearance: { base: 'wolf', colors: ['#555555'] },
        tags: ['monster'],
      }),
    );
    const before = JSON.stringify(engine.world.slices.world.entities);
    const results = run((ctx) => [
      setLife(ctx, 'nobody', false),
      setTagValue(ctx, 'nobody', 'lvl', 1),
      setTag(ctx, 'nobody', 'hostile', true),
      haltEntity(ctx, 'nobody'),
      setMoveSpeed(ctx, 'nobody', 9),
    ]);
    expect(results).toEqual([false, false, false, false, false]);
    expect(JSON.stringify(engine.world.slices.world.entities)).toBe(before);
    expect(other.alive).toBe(true);
  });

  it('the ports emit no events', () => {
    const { engine, run, player } = makeWorld();
    const p = player();
    moving(p);
    const seq = engine.world.recent.length;
    run((ctx) => {
      setTagValue(ctx, p.id, 'lvl', 2);
      setTag(ctx, p.id, 'hostile', true);
      setMoveSpeed(ctx, p.id, 2);
      haltEntity(ctx, p.id);
      setLife(ctx, p.id, false);
      setLife(ctx, p.id, true);
    });
    expect(engine.world.recent.slice(seq).map((e) => e.kind)).toEqual([]);
  });
});
