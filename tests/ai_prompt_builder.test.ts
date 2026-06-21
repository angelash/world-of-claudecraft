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
  topic: 'rumor',
  profile: {
    profileId: 'npc.brother_aldric.living_world',
    persona: 'A worried priest who reads weather, graves, and player choices as omens.',
    knowledgeScope: ['chapel rites', 'restless dead'],
    tabooTopics: ['hidden quest conclusions'],
    socialMemory: {
      style: 'Recognizes repeated visitors as names carried by the dead and by chapel road whispers.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryPriestRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryPriestRumorEcho',
    },
  },
  scene: {
    zoneId: 'eastbrook_vale',
    subsceneId: 'fallen_chapel',
    biomeTags: ['vale', 'graveyard'],
    locationTags: ['questSite', 'dungeonEntrance'],
    structureTags: ['ruinedChapel', 'cryptGate'],
    environmentalTags: ['deathPressure', 'graveSoil'],
    nearbySemanticObjects: [{
      source: 'sceneAnchor',
      objectId: 'fallen_crypt_gate',
      entityId: null,
      templateId: 'scene_anchor:fallen_crypt_gate',
      displayName: 'Crypt Gate',
      tags: ['cryptGate', 'sealedAir', 'deathPressure', 'dungeonEntrance'],
      featureTags: ['rustedBars', 'coldDraft', 'boneDust'],
      affordanceTags: ['hesitateAtThreshold', 'guardEntrance', 'fleeFromDark'],
      distance: 6.5,
    }],
    droppedItems: [{
      itemId: 'gravecaller_sigil',
      displayName: 'Gravecaller Sigil',
      itemTags: ['quest', 'grave'],
      rarity: 'quest',
      freshnessSeconds: 4,
      ownerEntityId: 1,
      smellTags: [],
      dangerTags: ['undead', 'cursed'],
      valueSignals: ['story'],
    }],
    companions: [{
      entityId: 22,
      templateId: 'forest_wolf',
      displayName: 'Fang',
      family: 'beast',
      tags: ['pet', 'beast'],
    }],
    time: { hour: 23, phase: 'night', isNight: true, tags: ['night'] },
    weather: { kind: 'fog', intensity: 0.8, tags: ['fog'] },
    light: { level: 'dark', tags: ['lowLight'] },
    mood: { dayEnergy: 0, nightFatigue: 0.7, clearNightAwe: 0, rainIrritation: 0, fogFear: 0.8 },
    recentSceneEvents: ['playerDiscarded:gravecaller_sigil'],
    danger: { undeadPressure: 0.7, hostileDensity: 0.2, corpseDensity: 0, recentDeaths: 0, safeHavenScore: 0.1 },
  },
  familySemantics: null,
  questFacts: [{ questId: 'q_bones', visibility: 'currentObjective', summary: 'Gather bones.', source: 'quest-log' }],
  recentObservations: ['scene:fallen_chapel', 'tag:deathPressure', 'creaturePlan:followScent', 'planEvidence:trait:foodFixated'],
  memorySignals: [{
    kind: 'rumor',
    refId: 'rumor-7',
    scope: 'region',
    sceneId: 'eastbrook_forge',
    zoneId: 'eastbrook_vale',
    sourcePlayerEntityId: 1,
    itemId: 'roasted_boar',
    subjectKind: 'item',
    lineIds: ['hudChrome.aiSpeech.itemInterestApproach'],
    salience: 0.65,
    createdAt: 12,
    expiresAt: 102,
    reason: 'readRegionRumor',
  }],
  allowedIntents: ['commentOnScene', 'inspectObject'],
  allowedLineIds: ['hudChrome.aiSpeech.brotherAldricAwake'],
  outputMode: 'line_id_only',
};

describe('AI Codex prompt builder', () => {
  it('includes hard rules, allowed line ids, scene danger, and visible quest facts', () => {
    const prompt = buildCodexDecisionPrompt(context);
    expect(prompt).toContain('Never change quest state');
    expect(prompt).toContain('Use only lineId speech when outputMode is line_id_only');
    expect(prompt).toContain('Use dynamicText only when outputMode is dynamic_text_experiment or mixed_living_world');
    expect(prompt).toContain('Allowed lineIds: hudChrome.aiSpeech.brotherAldricAwake');
    expect(prompt).toContain('Scene: fallen_chapel');
    expect(prompt).toContain('deathPressure');
    expect(prompt).toContain('undead=0.70');
    expect(prompt).toContain('q_bones:currentObjective');
    expect(prompt).toContain('Topic: rumor');
    expect(prompt).toContain('Profile: npc.brother_aldric.living_world');
    expect(prompt).toContain('Knowledge scope: chapel rites, restless dead');
    expect(prompt).toContain('Taboo topics: hidden quest conclusions');
    expect(prompt).toContain('Social memory style: Recognizes repeated visitors');
    expect(prompt).toContain('Time/weather mood: dayEnergy=0.00, nightFatigue=0.70');
    expect(prompt).toContain('Nearby semantic objects: fallen_crypt_gate:Crypt Gate[sceneAnchor](tags=cryptGate/sealedAir/deathPressure/dungeonEntrance; features=rustedBars/coldDraft/boneDust; affordances=hesitateAtThreshold/guardEntrance/fleeFromDark; 6.5yd)');
    expect(prompt).toContain('Dropped items: gravecaller_sigil:Gravecaller Sigil(quest/grave/undead/cursed/story, fresh=4s)');
    expect(prompt).toContain('Companions: Fang:forest_wolf:beast(pet/beast)');
    expect(prompt).toContain('Recent scene events: playerDiscarded:gravecaller_sigil');
    expect(prompt).toContain('Recent observations: scene:fallen_chapel, tag:deathPressure, creaturePlan:followScent, planEvidence:trait:foodFixated');
    expect(prompt).toContain('Memory signals: rumor:rumor-7:region:salience=0.65:readRegionRumor');
    expect(prompt).toContain('Return only JSON');
  });
});
