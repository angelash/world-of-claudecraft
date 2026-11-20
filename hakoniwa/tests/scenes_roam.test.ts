// Roam nodes of the scene runner (onboarding_interaction.md 5): touch points picked within
// reach of their location, actions usable anywhere, standing choices taken by the node's timer
// from where the player stands, `once` points and the return to the hub, the view and the
// client query, the content checks, and replay determinism. Kernel only.

import { describe, expect, it } from 'vitest';
import { sceneProblems } from '../src/content/packs/scenes';
import { Engine, worldHash } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import { TICK_HZ } from '../src/core/time';
import { createGame } from '../src/game/create';
import {
  insideLocation,
  ROAM_REACH,
  roamPoints,
  roamProblems,
  type SceneDef,
  sceneView,
} from '../src/systems/scenes';
import { isWalkable, playerEntity } from '../src/systems/world';
import { liveMap } from '../src/systems/world/switches';
import { NARRATIVE_SYSTEMS, narrativeContent, recordLines } from './narrative_harness';

const MAP = 'divine_court';

/** A small scene on the antechamber: a hub of touch points and a standing stance. */
const SCENE: SceneDef = {
  id: 'zz_roam',
  title: 'roam',
  mapId: MAP,
  location: 'antechamber',
  start: 'intro',
  nodes: [
    { id: 'intro', lines: [{ speaker: 'narrator', text: 'intro' }], next: 'hub' },
    {
      id: 'hub',
      roam: { mapId: MAP },
      choices: [
        { id: 'mirror', label: 'mirror', at: 'spirit_mirror', once: true, to: 'mirror_node' },
        { id: 'board', label: 'board', at: 'number_board', once: true, to: 'board_node' },
        { id: 'think', label: 'think', to: 'think_node' },
        { id: 'sit', label: 'sit', at: 'bench', to: 'stance_intro' },
      ],
    },
    { id: 'mirror_node', lines: [{ speaker: 'narrator', text: 'mirror said' }], next: 'hub' },
    { id: 'board_node', lines: [{ speaker: 'narrator', text: 'board said' }], next: 'hub' },
    { id: 'think_node', lines: [{ speaker: 'narrator', text: 'think said' }], next: 'hub' },
    { id: 'stance_intro', lines: [{ speaker: 'narrator', text: 'voices' }], next: 'stance' },
    {
      id: 'stance',
      roam: { mapId: MAP },
      choices: [
        {
          id: 'press',
          label: 'press',
          at: 'curtain_near',
          stand: true,
          hidden: true,
          to: 'end',
          effects: [{ type: 'flag', key: 'zz_tier', value: 3 }],
        },
        {
          id: 'cough',
          label: 'cough',
          at: 'curtain_near',
          to: 'end',
          effects: [{ type: 'flag', key: 'zz_tier', value: 1 }],
        },
        {
          id: 'stay',
          label: 'stay',
          hidden: true,
          timeout: 2,
          to: 'end',
          effects: [{ type: 'flag', key: 'zz_tier', value: 0 }],
        },
      ],
    },
    { id: 'end', lines: [{ speaker: 'narrator', text: 'end' }], end: true },
  ],
};

function game(scenes: SceneDef[] = [SCENE]): Engine {
  const content = narrativeContent();
  const base = content.scenes.filter((s) => !s.id.startsWith('cut_p_'));
  const c = { ...content, scenes: [...base, ...scenes] } as ContentMap;
  return Engine.create(1, c, NARRATIVE_SYSTEMS, { aiMode: 'off' });
}

function location(g: Engine, id: string) {
  const loc = g.content.maps.find((m) => m.id === MAP)?.locations.find((l) => l.id === id);
  if (!loc) throw new Error(`no location ${id}`);
  return loc;
}

/** Put the player at a location's centre, or `outside` tiles to the left of its left edge. */
function standAt(g: Engine, id: string, outside = 0): void {
  const loc = location(g, id);
  const x = outside > 0 ? loc.x - outside : loc.x + loc.w / 2;
  g.queue('world.teleport', { entityId: 'player', mapId: MAP, x, y: loc.y + loc.h / 2 });
  g.step(1);
}

function start(g: Engine): void {
  g.queue('scenes.start', { sceneId: 'zz_roam' });
  g.step(1);
  g.queue('scenes.advance', {});
  g.step(1);
}

function waiting(g: Engine) {
  return sceneView(g.world, g.content)?.waiting;
}

function choose(g: Engine, choiceId: string): void {
  g.queue('scenes.choose', { choiceId });
  g.step(1);
}

describe('roam nodes (onboarding_interaction.md 5)', () => {
  it('waits in roam with the touch points and their locations in the view', () => {
    const g = game();
    start(g);
    const v = sceneView(g.world, g.content);
    expect(v?.waiting).toBe('roam');
    expect(v?.nodeId).toBe('hub');
    expect(v?.choices.find((c) => c.id === 'mirror')?.at).toBe('spirit_mirror');
    expect(v?.choices.find((c) => c.id === 'think')?.at).toBeUndefined();
  });

  it('takes a touch point only within reach of its location', () => {
    const g = game();
    start(g);
    standAt(g, 'bench');
    choose(g, 'mirror');
    // still on the hub: the mirror is out of reach from the bench
    expect(sceneView(g.world, g.content)?.nodeId).toBe('hub');
    standAt(g, 'spirit_mirror', ROAM_REACH + 1);
    choose(g, 'mirror');
    expect(sceneView(g.world, g.content)?.nodeId).toBe('hub');
    standAt(g, 'spirit_mirror', ROAM_REACH - 0.5);
    choose(g, 'mirror');
    const v = sceneView(g.world, g.content);
    expect(v?.nodeId).toBe('mirror_node');
    expect(v?.waiting).toBe('advance');
  });

  it('returns to the hub after the point, with a once point used up', () => {
    const g = game();
    const lines = recordLines(g);
    start(g);
    standAt(g, 'spirit_mirror');
    choose(g, 'mirror');
    g.queue('scenes.advance', {});
    g.step(1);
    const v = sceneView(g.world, g.content);
    expect(v?.nodeId).toBe('hub');
    expect(v?.waiting).toBe('roam');
    expect(v?.choices.map((c) => c.id)).not.toContain('mirror');
    expect(lines.map((l) => l.text)).toEqual(['intro', 'mirror said']);
  });

  it('lets an action without a location be used anywhere on the roam map', () => {
    const g = game();
    start(g);
    standAt(g, 'bench');
    choose(g, 'think');
    expect(sceneView(g.world, g.content)?.nodeId).toBe('think_node');
  });

  it('refuses a touch point from another map', () => {
    const g = game();
    start(g);
    g.queue('world.teleport', { entityId: 'player', mapId: 'earth_train', x: 9, y: 3 });
    g.step(1);
    choose(g, 'think');
    expect(sceneView(g.world, g.content)?.nodeId).toBe('hub');
  });

  it('never takes a standing choice by hand', () => {
    const g = game();
    start(g);
    standAt(g, 'bench');
    choose(g, 'sit');
    g.queue('scenes.advance', {});
    g.step(1);
    expect(waiting(g)).toBe('roam');
    standAt(g, 'curtain_near');
    choose(g, 'press');
    expect(sceneView(g.world, g.content)?.nodeId).toBe('stance');
  });

  it('takes the standing choice the player stands in when the timer runs out', () => {
    const g = game();
    // as in the prologue's stance: the antechamber's quest is on, so the curtain row is shut
    g.world.meta.flags['quest.q_p_m02_antechamber'] = 'active';
    start(g);
    standAt(g, 'bench');
    choose(g, 'sit');
    g.queue('scenes.advance', {});
    g.step(1);
    standAt(g, 'curtain_near');
    const player = playerEntity(g.world);
    const map = g.content.maps.find((entry) => entry.id === MAP);
    if (!player || !map) throw new Error('missing actual curtain stance fixture');
    const current = liveMap(map, g.world.meta.flags);
    expect(isWalkable(current, player.x, player.y)).toBe(true);
    expect(insideLocation(location(g, 'curtain_near'), player.x, player.y, 0)).toBe(true);
    const curtain = location(g, 'curtain');
    expect(isWalkable(current, curtain.x + curtain.w / 2, curtain.y + curtain.h / 2)).toBe(false);
    g.step(2 * TICK_HZ + 1);
    expect(g.world.meta.flags.zz_tier).toBe(3);
    expect(sceneView(g.world, g.content)?.nodeId).toBe('end');
  });

  it('takes the timed choice when the player stands in no standing place', () => {
    const g = game();
    start(g);
    standAt(g, 'bench');
    choose(g, 'sit');
    g.queue('scenes.advance', {});
    g.step(1);
    g.step(2 * TICK_HZ + 1);
    expect(g.world.meta.flags.zz_tier).toBe(0);
  });

  it('lets a touch point beside a standing place be used before the timer', () => {
    const g = game();
    start(g);
    standAt(g, 'bench');
    choose(g, 'sit');
    g.queue('scenes.advance', {});
    g.step(1);
    standAt(g, 'curtain_near');
    choose(g, 'cough');
    expect(g.world.meta.flags.zz_tier).toBe(1);
  });

  it('lists the points nearest first with their reach, standing places and timer', () => {
    const g = game();
    start(g);
    standAt(g, 'bench');
    const points = roamPoints(g.world, g.content);
    expect(points.map((p) => p.id)[0]).toBe('sit');
    expect(points.find((p) => p.id === 'sit')?.inReach).toBe(true);
    expect(points.find((p) => p.id === 'mirror')?.inReach).toBe(false);
    expect(points.find((p) => p.id === 'board')?.inReach).toBe(false);
    // the action usable anywhere comes after every touch point
    expect(points[points.length - 1]?.id).toBe('think');
    expect(points.find((p) => p.id === 'think')).toMatchObject({ location: '', inReach: true });
    choose(g, 'sit');
    g.queue('scenes.advance', {});
    g.step(1);
    const stance = roamPoints(g.world, g.content);
    expect(stance.find((p) => p.id === 'press')).toMatchObject({ stand: true, inReach: false });
    // the hidden timed choice is not a point
    expect(stance.map((p) => p.id)).not.toContain('stay');
  });

  it('gives no points outside a roam node', () => {
    const g = game();
    g.queue('scenes.start', { sceneId: 'zz_roam' });
    g.step(1);
    expect(waiting(g)).toBe('advance');
    expect(roamPoints(g.world, g.content)).toEqual([]);
  });

  it('never takes a hidden timed choice by hand (the timer takes it)', () => {
    const g = game();
    start(g);
    standAt(g, 'bench');
    choose(g, 'sit');
    g.queue('scenes.advance', {});
    g.step(1);
    choose(g, 'stay');
    expect(sceneView(g.world, g.content)?.nodeId).toBe('stance');
    expect(g.world.meta.flags.zz_tier).toBeUndefined();
  });

  it('stops a walk when a touch point is used', () => {
    const g = game();
    start(g);
    standAt(g, 'spirit_mirror');
    const p = playerEntity(g.world);
    g.queue('world.move_to', { entityId: 'player', x: (p?.x ?? 0) - 6, y: p?.y ?? 0 });
    g.step(1);
    expect(playerEntity(g.world)?.move).toBeTruthy();
    choose(g, 'mirror');
    expect(sceneView(g.world, g.content)?.nodeId).toBe('mirror_node');
    expect(playerEntity(g.world)?.move ?? null).toBeNull();
  });

  it('re-arms the timer when the timed choice closed meanwhile', () => {
    const scene: SceneDef = {
      id: 'zz_rearm',
      title: 'rearm',
      mapId: MAP,
      location: 'antechamber',
      start: 'hub',
      nodes: [
        {
          id: 'hub',
          roam: { mapId: MAP },
          choices: [
            { id: 'first', label: 'first', when: 'NOT zz_closed', timeout: 1, to: 'a' },
            { id: 'second', label: 'second', timeout: 3, to: 'b' },
          ],
        },
        { id: 'a', lines: [{ speaker: 'narrator', text: 'a' }], end: true },
        { id: 'b', lines: [{ speaker: 'narrator', text: 'b' }], end: true },
      ],
    };
    const g = game([scene]);
    g.queue('scenes.start', { sceneId: 'zz_rearm' });
    g.step(1);
    g.world.meta.flags.zz_closed = true;
    g.step(TICK_HZ + 2);
    // the first timer found its choice closed: the second one runs from then on
    expect(sceneView(g.world, g.content)?.nodeId).toBe('hub');
    g.step(3 * TICK_HZ + 2);
    expect(sceneView(g.world, g.content)?.nodeId).toBe('b');
  });

  it('replays the same way (positions and the timer only)', () => {
    const run = () => {
      const g = game();
      start(g);
      standAt(g, 'spirit_mirror');
      choose(g, 'mirror');
      g.queue('scenes.advance', {});
      g.step(1);
      standAt(g, 'bench');
      choose(g, 'sit');
      g.queue('scenes.advance', {});
      g.step(1);
      standAt(g, 'curtain_near');
      g.step(2 * TICK_HZ + 1);
      return worldHash(g.world);
    };
    expect(run()).toBe(run());
  });
});

describe('roam content checks (onboarding_interaction.md 5.4)', () => {
  const content = narrativeContent();
  const withNode = (node: SceneDef['nodes'][number]) =>
    roamProblems({
      maps: content.maps,
      scenes: [{ id: 'zz', title: 'zz', start: node.id, nodes: [node] }],
    });

  it('passes the shipped scenes', () => {
    expect(roamProblems(content)).toEqual([]);
  });

  it('accepts a hidden choice that a free answer is sorted into, and no other', () => {
    const scene: SceneDef = {
      id: 'zz_cls',
      title: 'cls',
      start: 'ask',
      nodes: [
        {
          id: 'ask',
          input: {
            prompt: 'p',
            to: 'menu',
            classify: { node: 'menu', choices: ['a'], fallback: 'b' },
          },
        },
        {
          id: 'menu',
          choices: [
            { id: 'a', label: 'a', hidden: true },
            { id: 'b', label: 'b', hidden: true },
            { id: 'c', label: 'c', hidden: true },
          ],
        },
      ],
    };
    const problems = sceneProblems(scene, content).join(String.fromCharCode(10));
    expect(problems).not.toContain('hidden choice a ');
    expect(problems).not.toContain('hidden choice b ');
    expect(problems).toContain('hidden choice c has neither a key, a timeout nor a classification');
  });

  it('keeps the curtain closed while the antechamber is walked (the hall opens at P6)', () => {
    const walkThrough = (antechamber: string | undefined) => {
      const g = createGame({ seed: 7, aiMode: 'off' });
      g.step(1);
      g.world.slices.scenes.current = null;
      if (antechamber) g.world.meta.flags['quest.q_p_m02_antechamber'] = antechamber;
      g.queue('world.teleport', { entityId: 'player', mapId: MAP, x: 16.5, y: 13.5 });
      g.step(1);
      g.queue('world.move_to', { entityId: 'player', x: 16.5, y: 5.5 });
      g.step(80);
      return playerEntity(g.world)?.y ?? 0;
    };
    // the antechamber's quest is active from the number tag to the end of the quarrel
    expect(walkThrough('active')).toBeGreaterThan(12.9);
    // before it and after it the curtain is just a doorway (act 6's court uses the hall)
    expect(walkThrough('done')).toBeLessThan(12);
    expect(walkThrough(undefined)).toBeLessThan(12);
  });

  it('flags lines, unknown maps and locations, standing without a place, and no timer', () => {
    expect(
      withNode({
        id: 'a',
        roam: { mapId: MAP },
        lines: [{ speaker: 'narrator', text: 'x' }],
        choices: [{ id: 'c', label: 'c' }],
      }).join('\n'),
    ).toContain('writes no lines');
    expect(
      withNode({ id: 'a', roam: { mapId: 'nowhere' }, choices: [{ id: 'c', label: 'c' }] }).join(
        '\n',
      ),
    ).toContain('not a known map');
    expect(
      withNode({
        id: 'a',
        roam: { mapId: MAP },
        choices: [{ id: 'c', label: 'c', at: 'nowhere' }],
      }).join('\n'),
    ).toContain('is not on');
    expect(
      withNode({
        id: 'a',
        roam: { mapId: MAP },
        choices: [
          { id: 's', label: 's', stand: true },
          { id: 'c', label: 'c' },
        ],
      }).join('\n'),
    ).toContain('needs at');
    expect(
      withNode({
        id: 'a',
        roam: { mapId: MAP },
        choices: [{ id: 's', label: 's', at: 'bench', stand: true }],
      }).join('\n'),
    ).toContain('no timed choice');
  });
});
