import { describe, expect, it } from 'vitest';
import { AiWorldDirectorStore, moodForTraceKind, worldDirectorEvent } from '../server/ai/world_director';
import type { AiWorldTrace } from '../server/ai/world_traces';
import type { Entity } from '../src/sim/types';

const speaker = { id: 1, name: 'Ari', templateId: 'warrior', kind: 'player' } as Entity;

function trace(kind: AiWorldTrace['kind'], itemId = 'roasted_boar'): AiWorldTrace {
  return {
    traceId: `trace-${kind}`,
    sceneId: 'eastbrook_forge',
    kind,
    itemId,
    itemDisplayName: itemId,
    sourcePlayerEntityId: 1,
    lineId: 'hudChrome.aiSpeech.sceneTraceGeneric',
    reasonLineIds: [`reason:${kind}`],
    strength: 0.8,
    createdAt: 10,
    expiresAt: 100,
  };
}

describe('AI world director', () => {
  it('maps trace kinds into short-term area moods', () => {
    expect(moodForTraceKind('singularity')).toBe('uncanny');
    expect(moodForTraceKind('cursed')).toBe('haunted');
    expect(moodForTraceKind('food')).toBe('hungry');
    expect(moodForTraceKind('valuable')).toBe('covetous');
    expect(moodForTraceKind('generic')).toBe('stirred');
  });

  it('keeps source-scoped states alive briefly after the source trace', () => {
    const store = new AiWorldDirectorStore({ stateTtlSeconds: 10 });
    const state = store.noteTrace({ trace: trace('food'), nowSeconds: 10 });
    expect(state).toMatchObject({
      sceneId: 'eastbrook_forge',
      mood: 'hungry',
      proposalType: 'traceEcho',
      itemId: 'roasted_boar',
      lineId: 'hudChrome.aiSpeech.worldDirectorHungry',
    });
    expect(store.stateForScene('eastbrook_forge', 1, 15)).toMatchObject({ mood: 'hungry', heat: expect.any(Number) });
    expect(store.stateForScene('eastbrook_forge', 2, 15)).toBeNull();
    expect(store.stateForScene('mirror_lake_dock', 1, 15)).toBeNull();
    expect(store.stateForScene('eastbrook_forge', 1, 20)).toBeNull();
  });

  it('turns active director states into personal aiSpeech events', () => {
    const store = new AiWorldDirectorStore();
    const state = store.noteTrace({ trace: trace('cursed', 'gravecaller_sigil'), nowSeconds: 10 });
    expect(worldDirectorEvent(null, speaker, state, 1)).toMatchObject({
      type: 'aiSpeech',
      speech: {
        lineId: 'hudChrome.aiSpeech.worldDirectorHaunted',
        values: expect.objectContaining({ itemId: 'gravecaller_sigil', directorMood: 'haunted' }),
      },
      reaction: { kind: 'avoid', targetItemId: 'gravecaller_sigil' },
      pid: 1,
    });
    expect(worldDirectorEvent(null, speaker, null, 1)).toBeNull();
  });
});
