// The autoplayer on roam nodes (onboarding_interaction.md 5.3, src/game/autoplay/scene_roam.ts):
// it walks to touch points before using them, stands where a standing choice wants it and waits
// out the timer, and so plays the real prologue from a new game into act 1 with player commands
// only (no teleport).

import { describe, expect, it } from 'vitest';
import { TICK_HZ } from '../src/core/time';
import { Autoplayer } from '../src/game/autoplay';
import { roamStep } from '../src/game/autoplay/scene_roam';
import { createGame } from '../src/game/create';
import { sceneView } from '../src/systems/scenes';
import { playerEntity } from '../src/systems/world';
import { CHEATS } from './playthrough/harness';

describe('autoplay on roam nodes', () => {
  it('walks to a touch point out of reach, then uses it', () => {
    const engine = createGame({ seed: 7, aiMode: 'off' });
    engine.step(1);
    // the opening: the last train, then the car is a roam node
    engine.queue('scenes.choose', { choiceId: 'a' });
    engine.step(1);
    for (let i = 0; i < 10 && sceneView(engine.world, engine.content)?.waiting !== 'roam'; i++) {
      engine.queue('scenes.advance', {});
      engine.step(1);
    }
    const sv = sceneView(engine.world, engine.content);
    expect(sv?.waiting).toBe('roam');
    if (!sv) return;
    const far = roamStep(engine.world, engine.content, sv, () => 'window');
    // the player starts on the seat: the window is a few steps away
    expect(far.kind).toBe('walk');
    const anywhere = roamStep(engine.world, engine.content, sv, () => 'phone');
    expect(anywhere).toEqual({ kind: 'choose', choiceId: 'phone' });
    expect(playerEntity(engine.world)?.mapId).toBe('earth_train');
  });

  it(
    'plays the real prologue into act 1 with player commands only',
    () => {
      const engine = createGame({ seed: 20261115, aiMode: 'off' });
      const bot = new Autoplayer(engine);
      const result = bot.run({
        maxTicks: 30 * 60 * TICK_HZ,
        until: (e) => e.world.meta.flags.act === 'act1',
      });
      expect(result.stuck).toBeUndefined();
      expect(engine.world.meta.flags.act).toBe('act1');
      expect(engine.world.meta.flags.p_mirror_done).toBe(true);
      expect(engine.world.meta.flags.p_eavesdrop_level).toBeDefined();
      for (const cheat of CHEATS) expect(result.commands[cheat] ?? 0, cheat).toBe(0);
      // the roam nodes were walked, not skipped: the bot sent movement during the prologue
      expect(result.commands['world.move_to'] ?? 0).toBeGreaterThan(0);
    },
    5 * 60 * 1000,
  );
});
