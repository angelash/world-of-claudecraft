import { describe, expect, it } from 'vitest';
import type { AiJobContextV1 } from '../server/ai/ai_types';
import { compactFamilySemanticsForMob } from '../server/ai/family_semantics';
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
    speechFingerprint: {
      sentenceRhythm: 'soft, elliptical, usually one short warning plus one omen image',
      addressStyle: 'uses the player name sparingly, otherwise says friend or keeps address unspoken',
      favoriteStarts: ['Keep your voice low', 'The graves do not like'],
      sensoryBias: ['cold air', 'grave soil'],
      avoidedPhrases: ['overall', 'this means'],
    },
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
  directorProposals: [{
    proposalId: 'director-1:proposal',
    intent: 'nudgeNpcRumor',
    status: 'preview',
    risk: 'low',
    intensity: 0.66,
    targetRef: 'gravecaller_sigil',
    sceneId: 'fallen_chapel',
    zoneId: 'eastbrook_vale',
    suggestedLineId: 'hudChrome.aiSpeech.worldDirectorHaunted',
    expiresAt: 144,
    reasonTags: ['mood:haunted', 'subject:item', 'proposal:npcTopicShift', 'trace:cursed'],
    safetyNotes: ['presentationOnly', 'noQuestMutation', 'noCombatMutation', 'noLootOrEconomyMutation'],
  }],
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
    expect(prompt).toContain('When dynamicText is allowed, follow speechFingerprint over generic assistant phrasing');
    expect(prompt).toContain('Speech rhythm target: soft, elliptical, usually one short warning plus one omen image.');
    expect(prompt).toContain('Address style target: uses the player name sparingly');
    expect(prompt).toContain('If you need an opening, lean toward this voice: Keep your voice low / The graves do not like.');
    expect(prompt).toContain('Favor concrete sensory anchors such as cold air, grave soil.');
    expect(prompt).toContain('Never use or echo these phrases unless the scene literally demands them: overall, this means.');
    expect(prompt).toContain('Intent targetEntityId/targetObjectId values must be visible in job.json');
    expect(prompt).toContain('Director proposals and memory signals are read-only context');
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
    expect(prompt).toContain('Speech fingerprint: rhythm=soft, elliptical, usually one short warning plus one omen image');
    expect(prompt).toContain('address=uses the player name sparingly');
    expect(prompt).toContain('"speechFingerprint"');
    expect(prompt).toContain('"starts":["Keep your voice low","The graves do not like"]');
    expect(prompt).toContain('Time/weather mood: dayEnergy=0.00, nightFatigue=0.70');
    expect(prompt).toContain('Nearby semantic objects: fallen_crypt_gate:Crypt Gate[sceneAnchor](tags=cryptGate/sealedAir/deathPressure/dungeonEntrance; features=rustedBars/coldDraft/boneDust; affordances=hesitateAtThreshold/guardEntrance/fleeFromDark; 6.5yd)');
    expect(prompt).toContain('Dropped items: gravecaller_sigil:Gravecaller Sigil(quest/grave/undead/cursed/story, fresh=4s)');
    expect(prompt).toContain('Companions: Fang:forest_wolf:beast(pet/beast)');
    expect(prompt).toContain('Recent scene events: playerDiscarded:gravecaller_sigil');
    expect(prompt).toContain('Recent observations: scene:fallen_chapel, tag:deathPressure, creaturePlan:followScent, planEvidence:trait:foodFixated');
    expect(prompt).toContain('Director proposals: nudgeNpcRumor:preview:low:intensity=0.66:target=gravecaller_sigil:scene=fallen_chapel:zone=eastbrook_vale');
    expect(prompt).toContain('reasons=mood:haunted/subject:item/proposal:npcTopicShift/trace:cursed');
    expect(prompt).toContain('safety=presentationOnly/noQuestMutation/noCombatMutation/noLootOrEconomyMutation');
    expect(prompt).toContain('Director family projection (humanoid): nudgeNpcRumor:avoid:curiosity=0.02:fear=0.42');
    expect(prompt).toContain('directorProjection:mortalFear/director:nudgeNpcRumor/family:humanoid');
    expect(prompt).toContain('profile=profileProjection:riteOmen');
    expect(prompt).toContain('Memory signals: rumor:rumor-7:region:salience=0.65:readRegionRumor');
    expect(prompt).toContain('Return only JSON');
  });

  it('builds a pet-command prompt without quest, director, or object clutter', () => {
    const petContext: AiJobContextV1 = {
      ...context,
      trigger: 'pet_command',
      topic: 'recent',
      entity: { kind: 'mob', entityId: 22, templateId: 'forest_wolf', name: 'Fang', level: 4, questIds: [], dead: false },
      familySemantics: compactFamilySemanticsForMob('forest_wolf'),
      allowedIntents: ['commandPetDefensive', 'commandPetAttack', 'commandPetIgnore'],
      allowedLineIds: [],
      outputMode: 'mixed_living_world',
    };

    const npcPrompt = buildCodexDecisionPrompt(context);
    const petPrompt = buildCodexDecisionPrompt(petContext);

    expect(petPrompt).toContain('Trigger focus: Pet command');
    expect(petPrompt).toContain('Treat job.topic as the command text or command category');
    expect(petPrompt).toContain('Allowed intents: commandPetDefensive, commandPetAttack, commandPetIgnore');
    expect(petPrompt).toContain('Family: Beast');
    expect(petPrompt).toContain('Family speech fingerprint: rhythm=sniff, hesitate, react');
    expect(petPrompt).toContain('Speech rhythm target: sniff, hesitate, react; if words appear, keep them broken and territorial.');
    expect(petPrompt).toContain('If you need an opening, lean toward this voice: Sniffs hard / Hackles rise / Circles once.');
    expect(petPrompt).toContain('Favor concrete sensory anchors such as scent, blood warmth, fur bristle, ground vibration.');
    expect(petPrompt).toContain('"speechFingerprint"');
    expect(petPrompt).toContain('Scene: fallen_chapel');
    expect(petPrompt).not.toContain('Quest facts visible to player');
    expect(petPrompt).not.toContain('Director proposals:');
    expect(petPrompt).not.toContain('Memory signals:');
    expect(petPrompt).not.toContain('Nearby semantic objects:');
    expect(petPrompt).not.toContain('"questFacts"');
    expect(petPrompt).not.toContain('"directorProposals"');
    expect(petPrompt.length).toBeLessThan(npcPrompt.length);
  });

  it('adds explicit repair guidance for active provider retry prompts', () => {
    const repairContext: AiJobContextV1 = {
      ...context,
      trigger: 'active_poll',
      outputMode: 'mixed_living_world',
      questFacts: [],
      recentObservations: [
        'providerRejected:dynamic speech too thin',
        'providerRepair:writeOneConcreteGroundedLine',
        'providerRepair:avoidVagueSensoryQuestions',
        'scene:fallen_chapel',
      ],
    };

    const prompt = buildCodexDecisionPrompt(repairContext);

    expect(prompt).toContain('Repair pass: the previous dynamicText candidate was rejected because "dynamic speech too thin". Rewrite once with a concrete visible hook.');
    expect(prompt).toContain('Do not repeat the rejected shape. Avoid vague sensory questions, generic recent-event openers, and meta explanations.');
    expect(prompt).toContain('Recent observations: providerRejected:dynamic speech too thin, providerRepair:writeOneConcreteGroundedLine');
    expect(prompt.indexOf('Repair pass:')).toBeLessThan(prompt.indexOf('Speech rhythm target:'));
  });

  it('keeps singularity creature prompts focused on family instincts and scene stimulus', () => {
    const singularityContext: AiJobContextV1 = {
      ...context,
      trigger: 'singularity_candidate',
      entity: { kind: 'mob', entityId: 33, templateId: 'forest_wolf', name: 'Old Fang', level: 5, questIds: [], dead: false },
      familySemantics: compactFamilySemanticsForMob('forest_wolf'),
      allowedIntents: ['approachObject', 'avoidObject', 'inspectObject', 'commentOnScene'],
      allowedLineIds: ['hudChrome.aiSpeech.singularityFoodFixated'],
      outputMode: 'mixed_living_world',
    };

    const prompt = buildCodexDecisionPrompt(singularityContext);

    expect(prompt).toContain('Trigger focus: Singularity creature reaction');
    expect(prompt).toContain('Prioritize family instinct, dropped item tags, scene danger, time/weather, and memory signals');
    expect(prompt).toContain('Family: Beast');
    expect(prompt).toContain('Family speech fingerprint: rhythm=sniff, hesitate, react');
    expect(prompt).toContain('Dropped items: gravecaller_sigil:Gravecaller Sigil');
    expect(prompt).toContain('Director proposals: nudgeNpcRumor:preview:low');
    expect(prompt).toContain('Memory signals: rumor:rumor-7:region');
    expect(prompt).not.toContain('Quest facts visible to player');
    expect(prompt).not.toContain('q_bones:currentObjective');
    expect(prompt).not.toContain('"questFacts"');
  });
});
