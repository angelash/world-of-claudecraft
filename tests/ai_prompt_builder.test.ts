import { describe, expect, it } from 'vitest';
import type { AiJobContextV1 } from '../server/ai/ai_types';
import { buildCodexDecisionPrompt } from '../server/ai/prompt_builder';

const context: AiJobContextV1 = {
  schemaVersion: 1,
  jobId: 'prompt-job',
  trigger: 'npc_gossip_opened',
  entity: { kind: 'npc', entityId: 7, templateId: 'brother_aldric', name: 'Brother Aldric', level: 1, questIds: ['q_bones'], dead: false },
  player: { entityId: 1, name: 'Ari', level: 4, classId: 'hunter', activeQuestIds: ['q_bones'], completedQuestIds: [] },
  locale: 'en',
  scene: {
    zoneId: 'eastbrook_vale',
    subsceneId: 'fallen_chapel',
    biomeTags: ['vale', 'graveyard'],
    locationTags: ['questSite', 'dungeonEntrance'],
    structureTags: ['ruinedChapel', 'cryptGate'],
    environmentalTags: ['deathPressure', 'graveSoil'],
    nearbySemanticObjects: [],
    droppedItems: [],
    companions: [],
    time: { hour: 23, phase: 'night', isNight: true, tags: ['night'] },
    weather: { kind: 'fog', intensity: 0.8, tags: ['fog'] },
    light: { level: 'dark', tags: ['lowLight'] },
    mood: { dayEnergy: 0, nightFatigue: 0.7, clearNightAwe: 0, rainIrritation: 0, fogFear: 0.8 },
    recentSceneEvents: [],
    danger: { undeadPressure: 0.7, hostileDensity: 0.2, corpseDensity: 0, recentDeaths: 0, safeHavenScore: 0.1 },
  },
  familySemantics: null,
  questFacts: [{ questId: 'q_bones', visibility: 'currentObjective', summary: 'Gather bones.', source: 'quest-log' }],
  recentObservations: ['scene:fallen_chapel', 'tag:deathPressure'],
  allowedIntents: ['commentOnScene', 'inspectObject'],
  allowedLineIds: ['hudChrome.aiSpeech.brotherAldricAwake'],
  outputMode: 'line_id_only',
};

describe('AI Codex prompt builder', () => {
  it('includes hard rules, allowed line ids, scene danger, and visible quest facts', () => {
    const prompt = buildCodexDecisionPrompt(context);
    expect(prompt).toContain('Never change quest state');
    expect(prompt).toContain('Allowed lineIds: hudChrome.aiSpeech.brotherAldricAwake');
    expect(prompt).toContain('Scene: fallen_chapel');
    expect(prompt).toContain('deathPressure');
    expect(prompt).toContain('undead=0.70');
    expect(prompt).toContain('q_bones:currentObjective');
    expect(prompt).toContain('Return only JSON');
  });
});
