// Scene entry must retain the player's approach position when the scene opts in.
// The raven introduction is triggered on the shaft's outer edge, not at its centre.

import { describe, expect, it } from 'vitest';
import { AssetResolver } from '../src/client/assets/resolver';
import { StoryController, type StoryInput } from '../src/client/hud/story/story_controller';
import { buildContent } from '../src/content';
import { sceneProblems, pack as scenesPack } from '../src/content/packs/scenes';
import { deserializeWorld, Engine, serializeWorld, stateHash, worldHash } from '../src/core';
import type { GameSystem } from '../src/core/system';
import { createGame } from '../src/game/create';
import { allSystems } from '../src/game/registry';
import { type SceneDef, system as scenes, sceneView } from '../src/systems/scenes';
import { playerEntity, system as world } from '../src/systems/world';

const RAVEN_MAP = 'seal_ruins_depths';
const RAVEN_SCENE = 'cut_a1_raven';

function position(game: Engine) {
  const player = playerEntity(game.world);
  if (!player) throw new Error('no player');
  return { mapId: player.mapId, x: player.x, y: player.y };
}

function ravenAttackers(game: Engine): string[] {
  const playerId = game.world.slices.world.playerId;
  return Object.values(game.world.slices.combat.units)
    .filter((unit) => unit.monsterId === 'raven_flock' && unit.target === playerId)
    .map((unit) => unit.id)
    .sort();
}

function fixtureScene(over: Partial<SceneDef> = {}): SceneDef {
  return {
    id: 'zz_scene_placement',
    title: '入场站位',
    mapId: RAVEN_MAP,
    location: 'nest_shaft',
    keepPosition: true,
    summary: '越过巢井外沿，停下来观察。',
    start: 'first',
    nodes: [
      { id: 'first', lines: [{ speaker: 'narrator', text: '井边传来振翅声。' }], next: 'second' },
      { id: 'second', lines: [{ speaker: 'narrator', text: '灰落在石阶上。' }], next: 'anchor' },
      {
        id: 'anchor',
        lines: [{ speaker: 'narrator', text: '你停步望去。' }],
        anchor: true,
        next: 'last',
      },
      { id: 'last', lines: [{ speaker: 'narrator', text: '继续前行。' }], end: true },
    ],
    ...over,
  };
}

function fixtureGame(
  over: Partial<SceneDef> = {},
  at = { mapId: RAVEN_MAP, x: 34.5, y: 24.5 },
): Engine {
  const content = {
    ...buildContent(),
    quests: [],
    acts: [],
    scenes: [fixtureScene(over)],
    worldStarts: [{ ...at, priority: 100 }],
  };
  return Engine.create(20261119, content, [world, scenes], { aiMode: 'off' });
}

function startFixture(game: Engine): void {
  game.queue('scenes.start', { sceneId: 'zz_scene_placement' });
  game.step(1);
}

function storyInput(game: Engine, now: number): StoryInput {
  return {
    now,
    scene: sceneView(game.world, game.content),
    conversation: null,
    loose: null,
    playerId: game.world.slices.world.playerId,
    speed: 'instant',
    autoSetting: false,
    calm: false,
    holdToToggle: false,
    skipKeyDown: false,
    resolver: AssetResolver.empty(),
    nameOf: (id) => id,
    letter: () => null,
    talkLayout: () => 'regular',
    talkSpeaker: (conversation) => ({ id: conversation.npcId, name: conversation.name }),
    talkSubtitle: () => '',
    maxSay: 200,
    isBlocked: () => false,
  };
}

describe('scene entry placement', () => {
  it('keeps a real walking approach at the raven trigger edge and stops movement', () => {
    const base = buildContent();
    const content = {
      ...base,
      quests: [],
      scenes: base.scenes.filter((scene) => scene.id === RAVEN_SCENE),
      acts: base.acts.map((act) => ({ ...act, clock: undefined })),
      worldStarts: [{ mapId: RAVEN_MAP, x: 33.5, y: 28.5, priority: 100 }],
    };
    type Approach = { position: ReturnType<typeof position>; moving: boolean };
    const approaches: Approach[] = [];
    const probe: GameSystem = {
      id: 'scene_entry_probe',
      order: 84,
      tick(ctx) {
        const player = playerEntity(ctx.world);
        if (!player) throw new Error('no player');
        approaches.push({
          position: { mapId: player.mapId, x: player.x, y: player.y },
          moving: !!player.move,
        });
      },
    };
    const game = createGame({ content, systems: [...allSystems(), probe], aiMode: 'off' });
    expect(
      Object.values(game.world.slices.combat.units).filter(
        (unit) =>
          unit.monsterId === 'raven_flock' &&
          game.world.slices.world.entities[unit.id]?.mapId === RAVEN_MAP,
      ).length,
    ).toBeGreaterThan(0);
    Object.assign(game.world.meta.flags, { act: 'act1', a1_ash_met: true });
    const entries: { before: Approach; after: ReturnType<typeof position> }[] = [];
    game.onEvents((events) => {
      if (
        !events.some(
          (event) => event.kind === 'scene.started' && event.data.sceneId === RAVEN_SCENE,
        )
      )
        return;
      const before = approaches.at(-1);
      if (!before) throw new Error('no approach sample');
      entries.push({ before, after: position(game) });
    });
    game.queue('world.move_to', {
      entityId: game.world.slices.world.playerId,
      x: 33.5,
      y: 24.5,
    });
    for (let tick = 0; tick < 50 && entries.length === 0; tick++) game.step(1);

    expect(entries).toHaveLength(1);
    const entry = entries[0];
    if (!entry) throw new Error('raven introduction did not start');
    // atPlace permits one tile beyond the location; this is the real southern trigger edge.
    expect(entry.before.position.y).toBeGreaterThan(26);
    expect(entry.before.position.y).toBeLessThanOrEqual(27);
    expect(entry.before.moving).toBe(true);
    expect(entry.after).toEqual(entry.before.position);
    expect(playerEntity(game.world)?.move).toBeNull();
    expect(playerEntity(game.world)?.intent).toBeNull();
    expect(ravenAttackers(game)).toEqual([]);
    game.step(5);
    expect(position(game)).toEqual(entry.after);
    expect(ravenAttackers(game)).toEqual([]);
  });

  it.each([
    { where: 'inside the location', x: 34.5, y: 24.5 },
    { where: 'inside the trigger margin', x: 34.5, y: 26.5 },
  ])('keeps coordinates $where for an opted-in direct request', ({ x, y }) => {
    const game = fixtureGame({}, { mapId: RAVEN_MAP, x, y });
    const before = position(game);
    game.queue('world.set_intent', { entityId: game.world.slices.world.playerId, dx: 1, dy: 0 });
    startFixture(game);
    expect(position(game)).toEqual(before);
    expect(playerEntity(game.world)?.move).toBeNull();
    expect(playerEntity(game.world)?.intent).toBeNull();
  });

  it.each([undefined, false])(
    'uses the original anchor when keepPosition is %s',
    (keepPosition) => {
      const game = fixtureGame({ keepPosition });
      startFixture(game);
      expect(position(game)).toEqual({ mapId: RAVEN_MAP, x: 33.5, y: 17.5 });
    },
  );

  it('uses the original anchor for an opted-in request outside the location on the same map', () => {
    const game = fixtureGame({}, { mapId: RAVEN_MAP, x: 34.5, y: 28.5 });
    startFixture(game);
    expect(position(game)).toEqual({ mapId: RAVEN_MAP, x: 33.5, y: 17.5 });
  });

  it('uses the original anchor for an opted-in request from another map', () => {
    const game = fixtureGame({}, { mapId: 'divine_court', x: 10.5, y: 13.5 });
    startFixture(game);
    expect(position(game)).toEqual({ mapId: RAVEN_MAP, x: 33.5, y: 17.5 });
  });

  it('does not treat an unknown location as permission to preserve the whole map', () => {
    const game = fixtureGame({ location: 'zz_missing' });
    startFixture(game);
    // teleportPlayer's existing fallback for an unknown location is the map centre.
    expect(position(game)).toEqual({ mapId: RAVEN_MAP, x: 24.5, y: 20.5 });
  });

  it('does not place again after save/resume, skipping to an anchor or advancing', () => {
    const game = fixtureGame();
    startFixture(game);
    // Move outside the original place while its scene remains active. Any accidental
    // re-entry during resume/skip would now return to the centre and be observable.
    game.queue('world.move_to', { entityId: game.world.slices.world.playerId, x: 34.5, y: 28.5 });
    game.step(50);
    const before = position(game);
    expect(before.y).toBe(28.5);
    const resumed = Engine.resume(
      deserializeWorld(serializeWorld(game.world)),
      game.content,
      game.systems,
    );
    expect(position(resumed)).toEqual(before);
    expect(stateHash(resumed.world)).toBe(stateHash(game.world));
    let starts = 0;
    resumed.onEvents((events) => {
      starts += events.filter((event) => event.kind === 'scene.started').length;
    });
    const story = new StoryController(
      {
        advanceScene: () => resumed.queue('scenes.advance', {}),
        advanceLoose() {},
      },
      { music() {}, sfx() {}, ambience() {}, silence() {}, release() {} },
    );
    story.frame(storyInput(resumed, 0));
    expect(story.skip(1)).toBe(true);
    for (let frame = 2; frame < 8 && story.isSkipping; frame++) {
      story.frame(storyInput(resumed, frame));
      resumed.step(1);
      expect(position(resumed)).toEqual(before);
    }
    expect(story.isSkipping).toBe(false);
    expect(resumed.world.slices.scenes.current?.nodeId).toBe('anchor');
    resumed.queue('scenes.advance', {});
    resumed.step(1);
    resumed.queue('scenes.advance', {});
    resumed.step(1);
    expect(resumed.world.slices.scenes.current).toBeNull();
    expect(position(resumed)).toEqual(before);
    expect(starts).toBe(0);
  });

  it('replays scene entry and advancement from the same snapshot with identical hashes', () => {
    const game = fixtureGame();
    const snapshot = deserializeWorld(serializeWorld(game.world));
    game.queue('world.move_to', { entityId: game.world.slices.world.playerId, x: 34.5, y: 25.5 });
    game.step(1);
    const approach = position(game);
    startFixture(game);
    expect(position(game)).toEqual(approach);
    game.queue('scenes.advance', {});
    game.step(1);
    game.queue('scenes.advance', {});
    game.step(1);
    const replay = Engine.replayFrom(snapshot, game.content, game.systems, game.world.log, {
      aiMode: 'off',
    });
    replay.step(game.tick);
    expect(position(replay)).toEqual(approach);
    expect(worldHash(replay.world)).toBe(worldHash(game.world));
    expect(stateHash(replay.world)).toBe(stateHash(game.world));
  });
});

describe('scene placement authoring', () => {
  it('exposes the placement opt-in as a boolean in the scene editor schema', () => {
    const schema = scenesPack.schemas?.find((schema) => schema.table === 'scenes');
    expect(schema?.fields.find((field) => field.key === 'keepPosition')).toMatchObject({
      type: 'boolean',
    });
  });

  it.each([
    { over: { keepPosition: 'yes' }, problem: 'keepPosition must be boolean' },
    { over: { mapId: undefined }, problem: 'keepPosition needs a map and location' },
    { over: { location: undefined }, problem: 'keepPosition needs a map and location' },
    { over: { mapId: 'zz_missing' }, problem: 'keepPosition names unknown map zz_missing' },
    { over: { location: 'zz_missing' }, problem: 'keepPosition names unknown location zz_missing' },
  ])('rejects invalid placement authoring: $problem', ({ over, problem }) => {
    const invalid = { ...fixtureScene(), ...over } as unknown as SceneDef;
    expect(sceneProblems(invalid, buildContent()).join('\n')).toContain(problem);
  });
});
