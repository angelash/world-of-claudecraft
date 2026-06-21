import { describe, expect, it } from 'vitest';
import { droppedItemSemantic } from '../server/ai/scene_frame';
import { AiWorldTraceStore, worldTraceKindForItem, worldTraceLineId } from '../server/ai/world_traces';

describe('AI world traces', () => {
  it('classifies discarded item traces by strongest semantic signal', () => {
    expect(worldTraceKindForItem(droppedItemSemantic('roasted_boar', 0, 1)!, [])).toBe('food');
    expect(worldTraceKindForItem(droppedItemSemantic('gravecaller_sigil', 0, 1)!, [])).toBe('cursed');
    expect(worldTraceKindForItem(droppedItemSemantic('redbrook_blade', 0, 1)!, [])).toBe('valuable');
    expect(worldTraceKindForItem(
      droppedItemSemantic('roasted_boar', 0, 1)!,
      ['hudChrome.aiSpeech.singularityFoodFixated'],
    )).toBe('singularity');
  });

  it('maps trace kinds to scene inspection lineIds', () => {
    expect(worldTraceLineId('singularity')).toBe('hudChrome.aiSpeech.sceneTraceSingularity');
    expect(worldTraceLineId('cursed')).toBe('hudChrome.aiSpeech.sceneTraceCursed');
    expect(worldTraceLineId('food')).toBe('hudChrome.aiSpeech.sceneTraceFood');
    expect(worldTraceLineId('valuable')).toBe('hudChrome.aiSpeech.sceneTraceValuable');
    expect(worldTraceLineId('generic')).toBe('hudChrome.aiSpeech.sceneTraceGeneric');
  });

  it('keeps traces short-lived, scene-scoped, and source-player scoped', () => {
    const store = new AiWorldTraceStore({ traceTtlSeconds: 5 });
    const item = droppedItemSemantic('roasted_boar', 0, 1)!;
    const trace = store.noteItemTrace({
      sceneId: 'eastbrook_forge',
      zoneId: 'eastbrook_vale',
      item,
      sourcePlayerEntityId: 1,
      reasonLineIds: ['hudChrome.aiSpeech.itemInterestApproach'],
      nowSeconds: 10,
    });

    expect(trace).toMatchObject({
      kind: 'food',
      zoneId: 'eastbrook_vale',
      itemId: 'roasted_boar',
      lineId: 'hudChrome.aiSpeech.sceneTraceFood',
    });
    expect(store.traceForScene('eastbrook_forge', 1, 13)).toMatchObject({
      itemId: 'roasted_boar',
      strength: 0.4,
    });
    expect(store.traceForScene('mirror_lake_dock', 1, 13)).toBeNull();
    expect(store.traceForScene('eastbrook_forge', 2, 13)).toBeNull();
    expect(store.traceForScene('eastbrook_forge', 1, 15)).toBeNull();
  });
});
