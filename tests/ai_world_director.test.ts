import { describe, expect, it } from 'vitest';
import { AiBossEncounterMemoryStore } from '../server/ai/boss_memory';
import type { AiCreatureMemory, AiCreaturePlan } from '../server/ai/creature_memory';
import { AiWorldDirectorStore, moodForTraceKind, worldDirectorEvent, worldDirectorProposalFromMemoryAudit } from '../server/ai/world_director';
import type { AiMemoryAuditRecord } from '../server/ai/ai_types';
import type { AiWorldTrace } from '../server/ai/world_traces';
import type { Entity } from '../src/sim/types';

const speaker = { id: 1, name: 'Ari', templateId: 'warrior', kind: 'player' } as Entity;

const creatureMemory = (interactionCount: number): AiCreatureMemory => ({
  memoryId: '22:1',
  entityId: 22,
  templateId: 'forest_wolf',
  playerEntityId: 1,
  playerName: 'Ari',
  interactionCount,
  traits: ['territorial'],
  firstSeenAt: 10,
  lastSeenAt: 12,
  expiresAt: 120,
});

const creaturePlan: AiCreaturePlan = {
  planId: '22:1:eastbrook_forge:roasted_boar',
  entityId: 22,
  templateId: 'forest_wolf',
  playerEntityId: 1,
  kind: 'followScent',
  sceneId: 'eastbrook_forge',
  itemId: 'roasted_boar',
  intensity: 0.92,
  traits: ['foodFixated', 'stargazer'],
  evidence: ['trigger:item_discarded', 'trait:foodFixated', 'item:roasted_boar'],
  createdAt: 12,
  updatedAt: 12,
  expiresAt: 100,
};

const persistedDirectorAudit = (overrides: Partial<AiMemoryAuditRecord> = {}): AiMemoryAuditRecord => ({
  kind: 'worldDirectorState',
  refId: 'persisted-director-covetous',
  scope: 'region',
  sceneId: 'eastbrook_forge',
  zoneId: 'eastbrook_vale',
  sourcePlayerEntityId: 1,
  itemId: 'redbrook_blade',
  subjectKind: 'item',
  lineIds: ['hudChrome.aiSpeech.worldDirectorCovetous'],
  salience: 0.72,
  createdAt: 12,
  expiresAt: 160,
  reason: 'persistedRestart:covetous:npcTopicShift',
  ...overrides,
});

function trace(kind: AiWorldTrace['kind'], itemId = 'roasted_boar'): AiWorldTrace {
  return {
    traceId: `trace-${kind}`,
    sceneId: 'eastbrook_forge',
    zoneId: 'eastbrook_vale',
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
      zoneId: 'eastbrook_vale',
      mood: 'hungry',
      proposalType: 'traceEcho',
      itemId: 'roasted_boar',
      lineId: 'hudChrome.aiSpeech.worldDirectorHungry',
      proposal: {
        proposalId: 'director-1:proposal',
        intent: 'echoTrace',
        status: 'preview',
        risk: 'low',
        targetRef: 'roasted_boar',
        sceneId: 'eastbrook_forge',
        zoneId: 'eastbrook_vale',
        suggestedLineId: 'hudChrome.aiSpeech.worldDirectorHungry',
        safetyNotes: expect.arrayContaining(['presentationOnly', 'noQuestMutation', 'noCombatMutation', 'noLootOrEconomyMutation']),
        reasonTags: expect.arrayContaining(['mood:hungry', 'subject:item', 'proposal:traceEcho', 'trace:food']),
      },
    });
    expect(store.stateForScene('eastbrook_forge', 1, 15)).toMatchObject({
      mood: 'hungry',
      heat: expect.any(Number),
      proposal: expect.objectContaining({ intent: 'echoTrace', intensity: expect.any(Number) }),
    });
    expect(store.stateForRegion({
      zoneId: 'eastbrook_vale',
      sceneId: 'mirror_lake_dock',
      playerEntityId: 1,
      nowSeconds: 15,
    })).toMatchObject({ mood: 'hungry', heat: expect.any(Number) });
    expect(store.stateForScene('eastbrook_forge', 2, 15)).toBeNull();
    expect(store.stateForScene('mirror_lake_dock', 1, 15)).toBeNull();
    expect(store.stateForScene('eastbrook_forge', 1, 20)).toBeNull();
  });

  it('lets adjacent zones read weak director echoes only when explicitly enabled', () => {
    const store = new AiWorldDirectorStore({ stateTtlSeconds: 30 });
    const state = store.noteTrace({ trace: trace('valuable', 'redbrook_blade'), nowSeconds: 10 });

    expect(store.stateForRegion({
      zoneId: 'mirefen_marsh',
      sceneId: 'fenbridge_bridge',
      playerEntityId: 1,
      nowSeconds: 14,
    })).toBeNull();

    const adjacent = store.stateForRegion({
      zoneId: 'mirefen_marsh',
      sceneId: 'fenbridge_bridge',
      playerEntityId: 1,
      nowSeconds: 14,
      includeAdjacentZones: true,
    });
    expect(adjacent).toMatchObject({
      stateId: state.stateId,
      mood: 'covetous',
      itemId: 'redbrook_blade',
      proposal: expect.objectContaining({
        proposalId: `${state.stateId}:adjacent:mirefen_marsh:proposal`,
        intent: 'nudgeNpcRumor',
        risk: 'low',
        reasonTags: expect.arrayContaining(['adjacentZone:eastbrook_vale->mirefen_marsh']),
        safetyNotes: expect.arrayContaining(['presentationOnly', 'noQuestMutation']),
      }),
    });
    expect(adjacent!.heat).toBeLessThan(state.heat);
    expect(adjacent!.proposal.intensity).toBeLessThan(state.proposal.intensity);
    expect(store.stateForRegion({
      zoneId: 'thornpeak_heights',
      sceneId: 'highwatch_tower',
      playerEntityId: 1,
      nowSeconds: 14,
      includeAdjacentZones: true,
    })).toBeNull();
    expect(store.stateForRegion({
      zoneId: 'mirefen_marsh',
      sceneId: 'fenbridge_bridge',
      playerEntityId: 2,
      nowSeconds: 14,
      includeAdjacentZones: true,
    })).toBeNull();
  });

  it('keeps long-running area state streams bounded by the configured budget', () => {
    const store = new AiWorldDirectorStore({ maxStates: 5, stateTtlSeconds: 7_200 });
    for (let i = 0; i < 40; i++) {
      store.noteTrace({
        trace: {
          ...trace(i % 2 === 0 ? 'food' : 'valuable', `item_${i}`),
          traceId: `trace-${i}`,
          sceneId: `scene_${i}`,
          zoneId: i % 3 === 0 ? 'eastbrook_vale' : 'mirefen_marsh',
        },
        nowSeconds: i * 90,
      });
    }

    const states = store.snapshot();
    expect(states).toHaveLength(5);
    expect(states.map((state) => state.itemId)).toEqual(['item_39', 'item_38', 'item_37', 'item_36', 'item_35']);
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

  it('restores read-only director proposals from persisted memory audits', () => {
    expect(worldDirectorProposalFromMemoryAudit(persistedDirectorAudit())).toMatchObject({
      proposalId: 'persisted-director-covetous:persisted-proposal',
      intent: 'nudgeNpcRumor',
      status: 'preview',
      risk: 'low',
      intensity: 0.72,
      targetRef: 'redbrook_blade',
      sceneId: 'eastbrook_forge',
      zoneId: 'eastbrook_vale',
      suggestedLineId: 'hudChrome.aiSpeech.worldDirectorCovetous',
      expiresAt: 160,
      reasonTags: expect.arrayContaining([
        'mood:covetous',
        'subject:item',
        'proposal:npcTopicShift',
        'persistedMemory',
      ]),
      safetyNotes: expect.arrayContaining(['presentationOnly', 'noQuestMutation', 'noCombatMutation', 'noLootOrEconomyMutation']),
    });
    expect(worldDirectorProposalFromMemoryAudit(persistedDirectorAudit({
      lineIds: ['hudChrome.aiSpeech.worldDirectorHungry'],
      itemId: 'roasted_boar',
      reason: 'persistedRestart:hungry:traceEcho',
    }))).toMatchObject({
      intent: 'echoTrace',
      targetRef: 'roasted_boar',
      reasonTags: expect.arrayContaining(['mood:hungry', 'proposal:traceEcho']),
    });
    expect(worldDirectorProposalFromMemoryAudit(persistedDirectorAudit({ kind: 'rumor' }))).toBeNull();
    expect(worldDirectorProposalFromMemoryAudit(persistedDirectorAudit({ lineIds: [] }))).toBeNull();
  });

  it('keeps director proposals refreshed and cloned with their state', () => {
    const store = new AiWorldDirectorStore();
    const first = store.noteTrace({ trace: trace('valuable', 'redbrook_blade'), nowSeconds: 10 });
    const second = store.noteTrace({
      trace: { ...trace('valuable', 'redbrook_blade'), traceId: 'trace-valuable-2', reasonLineIds: ['reason:glint', 'reason:market'] },
      nowSeconds: 20,
    });

    expect(second.stateId).toBe(first.stateId);
    expect(second.heat).toBeGreaterThan(first.heat);
    expect(second.proposal).toMatchObject({
      proposalId: `${first.stateId}:proposal`,
      intent: 'nudgeNpcRumor',
      targetRef: 'redbrook_blade',
      suggestedLineId: 'hudChrome.aiSpeech.worldDirectorCovetous',
      intensity: Math.round(second.heat * 100) / 100,
      reasonTags: expect.arrayContaining(['mood:covetous', 'proposal:npcTopicShift', 'reason:market']),
    });

    const [snapshot] = store.snapshot();
    snapshot.proposal.reasonTags.push('mutated-outside');
    snapshot.proposal.safetyNotes.length = 0;
    expect(store.snapshot()[0].proposal.reasonTags).not.toContain('mutated-outside');
    expect(store.snapshot()[0].proposal.safetyNotes).toContain('presentationOnly');
  });

  it('keeps a bounded read-only proposal lifecycle journal', () => {
    const store = new AiWorldDirectorStore({ maxStates: 2, stateTtlSeconds: 5, maxProposalAuditEntries: 8 });
    const first = store.noteTrace({ trace: trace('valuable', 'redbrook_blade'), nowSeconds: 10 });
    store.noteTrace({
      trace: { ...trace('valuable', 'redbrook_blade'), traceId: 'trace-valuable-2' },
      nowSeconds: 11,
    });
    store.noteTrace({ trace: trace('food', 'roasted_boar'), nowSeconds: 12 });
    store.noteTrace({ trace: trace('cursed', 'gravecaller_sigil'), nowSeconds: 13 });
    store.stateForScene('eastbrook_forge', 1, 20);

    const journal = store.proposalAuditSnapshot();
    expect(journal).toEqual(expect.arrayContaining([
      expect.objectContaining({
        lifecycle: 'created',
        stateId: first.stateId,
        proposalId: `${first.stateId}:proposal`,
        targetRef: 'redbrook_blade',
        intent: 'nudgeNpcRumor',
        safetyNotes: expect.arrayContaining(['presentationOnly', 'noQuestMutation']),
      }),
      expect.objectContaining({
        lifecycle: 'refreshed',
        stateId: first.stateId,
        targetRef: 'redbrook_blade',
      }),
      expect.objectContaining({
        lifecycle: 'evicted',
        targetRef: 'redbrook_blade',
      }),
      expect.objectContaining({
        lifecycle: 'expired',
        targetRef: 'gravecaller_sigil',
      }),
    ]));

    journal[0].reasonTags.push('mutated-outside');
    journal[0].safetyNotes.length = 0;
    const fresh = store.proposalAuditSnapshot();
    expect(fresh[0].reasonTags).not.toContain('mutated-outside');
    expect(fresh[0].safetyNotes).toContain('presentationOnly');
  });

  it('lets repeated singularity scene memories wake a scene director state without item targeting', () => {
    const store = new AiWorldDirectorStore();
    expect(store.noteCreatureSceneMemory({
      sceneId: 'eastbrook_forge',
      zoneId: 'eastbrook_vale',
      memory: creatureMemory(1),
      sourcePlayerEntityId: 1,
      nowSeconds: 10,
    })).toBeNull();

    const state = store.noteCreatureSceneMemory({
      sceneId: 'eastbrook_forge',
      zoneId: 'eastbrook_vale',
      memory: creatureMemory(2),
      plan: creaturePlan,
      sourcePlayerEntityId: 1,
      nowSeconds: 12,
    });
    expect(state).toMatchObject({
      sceneId: 'eastbrook_forge',
      zoneId: 'eastbrook_vale',
      mood: 'uncanny',
      proposalType: 'campAlert',
      itemId: 'eastbrook_forge',
      subjectKind: 'scene',
      lineId: 'hudChrome.aiSpeech.worldDirectorSceneUncanny',
      evidence: expect.arrayContaining(['creatureSceneMemory:forest_wolf', 'territorial', 'creaturePlan:followScent']),
    });
    const event = worldDirectorEvent(null, speaker, state, 1);
    expect(event?.type).toBe('aiSpeech');
    expect(event).toMatchObject({
      type: 'aiSpeech',
      speech: {
        lineId: 'hudChrome.aiSpeech.worldDirectorSceneUncanny',
        values: expect.objectContaining({ sceneId: 'eastbrook_forge', directorMood: 'uncanny' }),
      },
      pid: 1,
    });
    if (event?.type === 'aiSpeech') expect(event.reaction).not.toHaveProperty('targetItemId');
  });

  it('lets boss encounter memories become encounter director states', () => {
    const memories = new AiBossEncounterMemoryStore();
    const memory = memories.noteEncounter({
      sceneId: 'bandit_camp',
      entity: { id: 9, kind: 'mob', templateId: 'gorrak', name: 'Gorrak the Ruthless' } as Entity,
      scale: 'boss',
      outcome: 'defeated',
      sourcePlayerEntityId: 1,
      nowSeconds: 10,
      evidence: ['simEvent:death'],
    });
    const store = new AiWorldDirectorStore();
    const state = store.noteBossMemory({ memory, nowSeconds: 10 });
    expect(state).toMatchObject({
      sceneId: 'bandit_camp',
      mood: 'triumphant',
      proposalType: 'encounterEcho',
      itemId: 'gorrak',
      subjectKind: 'encounter',
      lineId: 'hudChrome.aiSpeech.worldDirectorBossDefeated',
      proposal: expect.objectContaining({
        intent: 'echoEncounterMemory',
        targetRef: 'gorrak',
        safetyNotes: expect.arrayContaining(['presentationOnly', 'noCombatMutation']),
      }),
    });
    expect(worldDirectorEvent(null, speaker, state, 1)).toMatchObject({
      type: 'aiSpeech',
      speech: {
        lineId: 'hudChrome.aiSpeech.worldDirectorBossDefeated',
        values: expect.objectContaining({ bossTemplateId: 'gorrak', directorMood: 'triumphant' }),
      },
      reaction: { kind: 'inspect' },
      pid: 1,
    });
  });

  it('lets completed quests become same-zone director echoes', () => {
    const store = new AiWorldDirectorStore({ stateTtlSeconds: 12 });
    const state = store.noteQuestCompletion({
      sceneId: 'eastbrook_forge',
      zoneId: 'eastbrook_vale',
      questId: 'q_wolves',
      sourcePlayerEntityId: 1,
      nowSeconds: 10,
    });

    expect(state).toMatchObject({
      sceneId: 'eastbrook_forge',
      zoneId: 'eastbrook_vale',
      mood: 'relieved',
      proposalType: 'questEcho',
      subjectKind: 'quest',
      itemId: 'q_wolves',
      lineId: 'hudChrome.aiSpeech.worldDirectorQuestComplete',
      proposal: expect.objectContaining({
        intent: 'echoQuestRelief',
        risk: 'low',
        targetRef: 'q_wolves',
        safetyNotes: expect.arrayContaining(['presentationOnly', 'noQuestMutation']),
      }),
    });
    expect(store.stateForRegion({
      zoneId: 'eastbrook_vale',
      sceneId: 'fallen_chapel',
      playerEntityId: 1,
      nowSeconds: 14,
    })).toMatchObject({ mood: 'relieved', heat: expect.any(Number) });
    expect(store.stateForRegion({
      zoneId: 'mirefen_marsh',
      sceneId: 'fenbridge_bridge',
      playerEntityId: 1,
      nowSeconds: 14,
    })).toBeNull();
    expect(store.stateForRegion({
      zoneId: 'eastbrook_vale',
      sceneId: 'fallen_chapel',
      playerEntityId: 2,
      nowSeconds: 14,
    })).toBeNull();
    expect(store.stateForRegion({
      zoneId: 'eastbrook_vale',
      sceneId: 'fallen_chapel',
      playerEntityId: 1,
      nowSeconds: 22,
    })).toBeNull();
    expect(worldDirectorEvent(null, speaker, state, 1)).toMatchObject({
      type: 'aiSpeech',
      speech: {
        lineId: 'hudChrome.aiSpeech.worldDirectorQuestComplete',
        values: expect.objectContaining({ questId: 'q_wolves', directorMood: 'relieved' }),
      },
      reaction: { kind: 'inspect' },
      pid: 1,
    });
  });
});
