import { describe, expect, it } from 'vitest';
import { Engine } from '../src/core';
import { TICKS_PER_GAME_DAY } from '../src/core/time';
import type { QuestDef } from '../src/systems/quests/types';
import { NARRATIVE_SYSTEMS, narrativeContent, playThrough } from './narrative_harness';

describe('the isolated narrative driver waits through the real clock', () => {
  it('uses the player time commands to open a week-gated main quest', () => {
    const content = narrativeContent();
    content.scenes = [];
    content.acts = [
      { id: 'act1', index: 1, title: 'x', clock: { weeks: 2 } },
      { id: 'epilogue', index: 7, title: 'x' },
    ];
    content.quests = [
      {
        id: 'zz_clock_quest',
        act: 'act1',
        kind: 'main',
        title: 'x',
        desc: 'x',
        trigger: 'act == act1 AND act_week >= 2',
        stages: [{ id: 'waited', desc: 'x', objectives: [{ type: 'wait', hours: 1, label: 'x' }] }],
        rewards: [{ type: 'act', act: 'epilogue' }],
      } as QuestDef,
    ];
    const g = Engine.create(23, content, NARRATIVE_SYSTEMS, { aiMode: 'off' });
    g.queue('flag.set', { key: 'act', value: 'act1' });
    g.queue('world.teleport', { entityId: 'player', mapId: 'borderstone', x: 48.5, y: 32.5 });
    g.step(2);
    playThrough(g);
    expect(g.world.meta.flags.act).toBe('epilogue');
    expect(g.tick).toBeGreaterThan(5 * TICKS_PER_GAME_DAY);
    expect(g.world.log.some((entry) => entry.command.kind === 'time.skip')).toBe(true);
  });
});
