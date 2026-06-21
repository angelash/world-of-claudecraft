import { describe, expect, it } from 'vitest';
import {
  AiBossEncounterMemoryStore,
  AiBossEncounterPhaseCueStore,
  bossEncounterMemoryEvent,
  bossEncounterPhaseEvent,
  bossEncounterScale,
} from '../server/ai/boss_memory';
import type { Entity } from '../src/sim/types';

const gorrak = {
  id: 44,
  kind: 'mob',
  templateId: 'gorrak',
  name: 'Gorrak the Ruthless',
} as Entity;

describe('AI boss encounter memory', () => {
  it('classifies bosses, elites, and rares from mob templates', () => {
    expect(bossEncounterScale(gorrak)).toBe('boss');
    expect(bossEncounterScale({ ...gorrak, templateId: 'crypt_shambler' } as Entity)).toBe('elite');
    expect(bossEncounterScale({ ...gorrak, templateId: 'old_greyjaw' } as Entity)).toBe('rare');
    expect(bossEncounterScale({ ...gorrak, templateId: 'forest_wolf' } as Entity)).toBeNull();
  });

  it('stores source-scoped defeated and wipe memories with expiry', () => {
    const store = new AiBossEncounterMemoryStore({ memoryTtlSeconds: 10 });
    const defeated = store.noteEncounter({
      sceneId: 'bandit_camp',
      entity: gorrak,
      scale: 'boss',
      outcome: 'defeated',
      sourcePlayerEntityId: 1,
      nowSeconds: 5,
      evidence: ['simEvent:death'],
    });
    expect(defeated).toMatchObject({
      sceneId: 'bandit_camp',
      templateId: 'gorrak',
      outcome: 'defeated',
      lineId: 'hudChrome.aiSpeech.bossMemoryDefeated',
    });
    expect(store.memoryForScene('bandit_camp', 1, 8)).toMatchObject({ templateId: 'gorrak', heat: expect.any(Number) });
    expect(store.memoryForScene('bandit_camp', 2, 8)).toBeNull();
    expect(store.memoryForScene('other_scene', 1, 8)).toBeNull();
    expect(store.memoryForScene('bandit_camp', 1, 15)).toBeNull();

    const wipe = store.noteEncounter({
      sceneId: 'bandit_camp',
      entity: gorrak,
      scale: 'boss',
      outcome: 'wipe',
      sourcePlayerEntityId: 1,
      nowSeconds: 16,
      evidence: ['simEvent:playerDeath'],
    });
    expect(wipe.lineId).toBe('hudChrome.aiSpeech.bossMemoryWipe');
  });

  it('turns memories into personal aiSpeech events without gameplay fields', () => {
    const store = new AiBossEncounterMemoryStore();
    const memory = store.noteEncounter({
      sceneId: 'bandit_camp',
      entity: gorrak,
      scale: 'boss',
      outcome: 'defeated',
      sourcePlayerEntityId: 1,
      nowSeconds: 5,
      evidence: ['simEvent:death'],
    });

    expect(bossEncounterMemoryEvent(memory, gorrak, 1)).toMatchObject({
      type: 'aiSpeech',
      speakerId: gorrak.id,
      speech: {
        mode: 'lineId',
        lineId: 'hudChrome.aiSpeech.bossMemoryDefeated',
        values: expect.objectContaining({ bossTemplateId: 'gorrak', encounterOutcome: 'defeated' }),
      },
      reaction: { kind: 'inspect' },
      pid: 1,
    });
  });

  it('emits each encounter phase cue once per player and phase', () => {
    const store = new AiBossEncounterPhaseCueStore();
    const bloodied = store.noteDamagePhase({
      sceneId: 'bandit_camp',
      entity: { ...gorrak, hp: 45, maxHp: 100, dead: false } as Entity,
      scale: 'boss',
      sourcePlayerEntityId: 1,
      nowSeconds: 20,
      evidence: ['simEvent:damage'],
    });
    expect(bloodied).toMatchObject({
      sceneId: 'bandit_camp',
      templateId: 'gorrak',
      phase: 'bloodied',
      lineId: 'hudChrome.aiSpeech.bossPhaseBloodied',
      healthPct: 45,
    });
    expect(store.noteDamagePhase({
      sceneId: 'bandit_camp',
      entity: { ...gorrak, hp: 40, maxHp: 100, dead: false } as Entity,
      scale: 'boss',
      sourcePlayerEntityId: 1,
      nowSeconds: 21,
      evidence: ['simEvent:damage'],
    })).toBeNull();

    const desperate = store.noteDamagePhase({
      sceneId: 'bandit_camp',
      entity: { ...gorrak, hp: 18, maxHp: 100, dead: false } as Entity,
      scale: 'boss',
      sourcePlayerEntityId: 1,
      nowSeconds: 22,
      evidence: ['simEvent:damage'],
    });
    expect(desperate).toMatchObject({
      phase: 'desperate',
      lineId: 'hudChrome.aiSpeech.bossPhaseDesperate',
      healthPct: 18,
    });
  });

  it('turns phase cues into personal aiSpeech events without gameplay fields', () => {
    const store = new AiBossEncounterPhaseCueStore();
    const cue = store.noteDamagePhase({
      sceneId: 'bandit_camp',
      entity: { ...gorrak, hp: 19, maxHp: 100, dead: false } as Entity,
      scale: 'boss',
      sourcePlayerEntityId: 1,
      nowSeconds: 20,
      evidence: ['simEvent:damage'],
    })!;

    expect(bossEncounterPhaseEvent(cue, gorrak, 1)).toMatchObject({
      type: 'aiSpeech',
      speakerId: gorrak.id,
      speech: {
        mode: 'lineId',
        lineId: 'hudChrome.aiSpeech.bossPhaseDesperate',
        values: expect.objectContaining({ bossTemplateId: 'gorrak', encounterPhase: 'desperate', bossHealthPct: 19 }),
      },
      reaction: { kind: 'avoid' },
      pid: 1,
    });
  });
});
