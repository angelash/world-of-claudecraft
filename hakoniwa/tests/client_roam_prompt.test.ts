// The client side of roam nodes (onboarding_interaction.md 5.3): the scene adapter hands the
// player back control (no panel) while a roam node is open and lists the touch points, and the
// interact key takes the touch point in reach through the interact adapter, else an action
// usable anywhere (the phone). The world prompt is in tests/client_roam_field_prompt.test.ts.

import { describe, expect, it } from 'vitest';
import { createInteractAdapter, createSceneAdapter } from '../src/client/adapters/social';
import { createGameView } from '../src/client/view/game_view';
import type { Engine } from '../src/core';
import { createGame } from '../src/game/create';
import { sceneView } from '../src/systems/scenes';

/** A new game on the last train, standing in the car (the first roam node). */
function onTheTrain(): Engine {
  const g = createGame({ seed: 7, aiMode: 'off' });
  g.step(1);
  g.queue('scenes.choose', { choiceId: 'a' });
  g.step(1);
  for (let i = 0; i < 10 && sceneView(g.world, g.content)?.waiting !== 'roam'; i++) {
    g.queue('scenes.advance', {});
    g.step(1);
  }
  return g;
}

function standAt(g: Engine, location: string): void {
  const loc = g.content.maps
    .find((m) => m.id === 'earth_train')
    ?.locations.find((l) => l.id === location);
  if (!loc) throw new Error(location);
  g.queue('world.teleport', {
    entityId: 'player',
    mapId: 'earth_train',
    x: loc.x + loc.w / 2,
    y: loc.y + loc.h / 2,
  });
  g.step(1);
}

describe('roam nodes on the client', () => {
  it('shows no scene panel while the player walks, and lists the touch points', () => {
    const g = onTheTrain();
    const view = createGameView(g);
    const scenes = createSceneAdapter();
    expect(sceneView(g.world, g.content)?.waiting).toBe('roam');
    expect(scenes.scene(view)).toBeNull();
    expect(scenes.roam?.(view).map((p) => p.id)).toEqual(
      expect.arrayContaining(['window', 'drunk', 'badge', 'phone']),
    );
  });

  it('takes the touch point in reach through the interact adapter too (no prompt module needed)', () => {
    const g = onTheTrain();
    standAt(g, 'opposite');
    const cmds = createInteractAdapter().interact(createGameView(g), null);
    expect(cmds).toEqual([{ kind: 'scenes.choose', data: { choiceId: 'drunk' } }]);
    standAt(g, 'gangway');
    expect(createInteractAdapter().interact(createGameView(g), null)).toEqual([
      { kind: 'scenes.choose', data: { choiceId: 'phone' } },
    ]);
  });
});
