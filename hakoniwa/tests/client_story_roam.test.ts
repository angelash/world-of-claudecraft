// The story controller across a roam node (onboarding_interaction.md 5.3), driven through the
// real scene adapter: while the player walks the panel is gone and the camera is the player's,
// but the run's light and music stay (no release), a touch point's lines continue the same
// stage, and the stage closes once the scene really ends.

import { describe, expect, it } from 'vitest';
import { createSceneAdapter } from '../src/client/adapters/social';
import { AssetResolver } from '../src/client/assets/resolver';
import { StoryController, type StoryInput } from '../src/client/hud/story/story_controller';
import { createGameView } from '../src/client/view/game_view';
import { createGame } from '../src/game/create';
import { sceneView } from '../src/systems/scenes';

function setup() {
  const g = createGame({ seed: 7, aiMode: 'off' });
  const scenes = createSceneAdapter();
  const calls: string[] = [];
  const c = new StoryController({ advanceScene: () => {}, advanceLoose: () => {} }, {
    music: (call: { id: string }) => calls.push(`music:${call.id}`),
    sfx: () => {},
    ambience: () => {},
    silence: () => {},
    release: () => calls.push('release'),
  } as never);
  const input = (now: number): StoryInput => {
    const view = createGameView(g);
    const scene = scenes.scene(view);
    return {
      now,
      scene,
      conversation: null,
      loose: null,
      playerId: 'player',
      speed: 'instant',
      autoSetting: false,
      calm: false,
      holdToToggle: false,
      skipKeyDown: false,
      resolver: AssetResolver.empty(),
      nameOf: (id) => id,
      letter: () => null,
      talkLayout: () => 'regular',
      talkSpeaker: (cv) => ({ id: cv.npcId, name: cv.name }),
      talkSubtitle: () => '',
      maxSay: 200,
      isBlocked: () => false,
      flags: g.world.meta.flags,
      roam: scene ? null : (scenes.roamScene?.(view) ?? null),
    };
  };
  return { g, c, calls, input };
}

describe('the story controller across a roam node', () => {
  it('keeps the light and the music while the player walks, then goes on in the same run', () => {
    const { g, c, calls, input } = setup();
    g.step(1);
    g.queue('scenes.choose', { choiceId: 'a' });
    g.step(1);
    // the last train's opening lights the car at midnight and starts the earth music
    c.frame(input(100));
    expect(sceneView(g.world, g.content)?.nodeId).toBe('n1_a');
    expect(c.stageNow()?.light?.preset).toBe('midnight');
    expect(calls).toContain('music:mus_pro_earth');
    g.queue('scenes.advance', {});
    g.step(1);
    expect(sceneView(g.world, g.content)?.waiting).toBe('roam');
    const roaming = c.frame(input(200));
    expect(roaming.mode).toBe('none');
    expect(roaming.cutscene).toBeNull();
    expect(c.stageNow()?.light?.preset).toBe('midnight');
    // the player walks with their own camera
    expect(c.stageNow()?.camera ?? null).toBeNull();
    expect(calls).not.toContain('release');
    // the phone (usable anywhere): its lines continue the same stage
    g.queue('scenes.choose', { choiceId: 'phone' });
    g.step(1);
    const after = c.frame(input(300));
    expect(after.mode).toBe('cutscene');
    expect(c.stageNow()?.light?.preset).toBe('midnight');
    expect(calls).not.toContain('release');
  });

  it('closes the stage once the scene ends', () => {
    const { g, c, calls, input } = setup();
    g.step(1);
    g.queue('scenes.choose', { choiceId: 'a' });
    g.step(1);
    c.frame(input(100));
    g.world.slices.scenes.current = null;
    const done = c.frame(input(200));
    expect(done.mode).toBe('none');
    expect(c.stageNow()).toBeNull();
    expect(calls).toContain('release');
  });
});
