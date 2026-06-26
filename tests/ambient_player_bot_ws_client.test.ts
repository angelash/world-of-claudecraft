import { describe, expect, it } from 'vitest';
import { mergeEntities, mergeSelf } from '../server/ambient_bots/ws_client';

describe('ambient player bot ws client helpers', () => {
  it('preserves delta self fields that the server omits from later snapshots', () => {
    const merged = mergeSelf(
      {
        id: 1,
        x: 0,
        z: 0,
        inv: ['axe'],
        qlog: [{ questId: 'q_wolves', counts: [2], state: 'active' }],
        tal: { alloc: { spec: null, ranks: {}, choices: {} } },
        stats: { hp: 10 },
      },
      { id: 1, x: 5, z: 7 },
    );

    expect(merged).toEqual({
      id: 1,
      x: 5,
      z: 7,
      inv: ['axe'],
      qlog: [{ questId: 'q_wolves', counts: [2], state: 'active' }],
      tal: { alloc: { spec: null, ranks: {}, choices: {} } },
      stats: { hp: 10 },
    });
  });

  it('preserves entity identity fields and keep-list entries across delta snapshots', () => {
    const previous = new Map<number, Record<string, unknown>>([
      [5, { id: 5, k: 'player', nm: 'Alice', lv: 2, c: 'warrior' }],
      [8, { id: 8, nm: 'QuestGiver', k: 'npc' }],
    ]);

    const next = mergeEntities(previous, {
      ents: [{ id: 5, x: 10, z: 12 }],
      keep: [8],
    });

    expect(next.get(5)).toEqual({
      id: 5,
      k: 'player',
      nm: 'Alice',
      lv: 2,
      c: 'warrior',
      x: 10,
      z: 12,
    });
    expect(next.get(8)).toEqual({ id: 8, nm: 'QuestGiver', k: 'npc' });
  });
});
