import type { AiIntentType, AiProfileSnapshot } from './ai_types';

export interface AiAgentProfile {
  id: string;
  appliesTo: Array<{ kind: 'npc' | 'mob' | 'object'; templateId: string }>;
  persona: string;
  allowedIntentTypes: AiIntentType[];
  allowedLineIds: string[];
  fallbackLineId: string;
  canonSensitive: boolean;
  knowledgeScope: string[];
  tabooTopics: string[];
  socialMemory: {
    style: string;
    recognitionLineId: string;
    rumorLineId: string;
    questRumorLineId?: string;
  };
  sceneAffinities?: {
    likesTags: string[];
    avoidsTags: string[];
    commentsOnTags: string[];
  };
  itemInterest?: {
    attractedToTags: string[];
    avoidsTags: string[];
  };
  timeWeatherSensitivity?: {
    dayEnergy: number;
    nightFatigue: number;
    clearNightAwe: number;
    rainIrritation: number;
    fogFear: number;
  };
  companionReactions?: Array<{
    companionTag: string;
    sceneTag: string;
    reaction: 'curious' | 'uneasy' | 'protective' | 'awed';
  }>;
}

const BASIC_NPC_INTENTS: AiIntentType[] = [
  'lookAt',
  'faceEntity',
  'pause',
  'commentOnScene',
  'inspectObject',
  'approachObject',
  'avoidObject',
  'seekShelter',
  'showGossipOptions',
  'questHint',
];

export const AI_AGENT_PROFILES: readonly AiAgentProfile[] = [
  {
    id: 'npc.brother_aldric.living_world',
    appliesTo: [
      { kind: 'npc', templateId: 'brother_aldric' },
      { kind: 'npc', templateId: 'brother_aldric_fen' },
      { kind: 'npc', templateId: 'brother_aldric_highwatch' },
    ],
    persona: 'A worried priest who reads weather, graves, and player choices as omens.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.brotherAldricAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.brotherAldricAwake',
    canonSensitive: true,
    knowledgeScope: ['chapel rites', 'restless dead', 'graveyards', 'omens', 'player mercy'],
    tabooTopics: ['hidden quest conclusions', 'unearned absolution', 'reward promises'],
    socialMemory: {
      style: 'Recognizes repeated visitors as names carried by the dead and by chapel road whispers.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryPriestRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryPriestRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryPriestQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['chapel', 'graveyard', 'graveSoil', 'undeadMemory'],
      avoidsTags: ['demon', 'oldBlood'],
      commentsOnTags: ['ruinedChapel', 'cryptGate', 'deathPressure', 'starrySky'],
    },
    itemInterest: {
      attractedToTags: ['grave', 'undead', 'cursed', 'quest', 'relic'],
      avoidsTags: ['demon', 'unknownPower'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.35, nightFatigue: 0.15, clearNightAwe: 0.55, rainIrritation: 0.2, fogFear: 0.35 },
    companionReactions: [{ companionTag: 'beast', sceneTag: 'graveyard', reaction: 'protective' }],
  },
  {
    id: 'npc.the_merchant.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'the_merchant' }],
    persona: 'A market keeper who treats rumors, risk, and coin as the same weather system.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.merchantMarketPulse'],
    fallbackLineId: 'hudChrome.aiSpeech.merchantMarketPulse',
    canonSensitive: false,
    knowledgeScope: ['market prices', 'valuable goods', 'road gossip', 'risk', 'player trade habits'],
    tabooTopics: ['free rewards', 'price manipulation', 'private account facts'],
    socialMemory: {
      style: 'Turns memory into trade weather: who left what, what it may be worth, and who noticed.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryMerchantRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryMerchantRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryMerchantQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['market', 'safeTown', 'coin', 'road'],
      avoidsTags: ['deathPressure', 'oldBlood', 'cursed'],
      commentsOnTags: ['market', 'valuable', 'rain', 'crowd'],
    },
    itemInterest: {
      attractedToTags: ['coin', 'valuable', 'gear', 'rumor'],
      avoidsTags: ['cursed', 'undead'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.55, nightFatigue: 0.4, clearNightAwe: 0.15, rainIrritation: 0.45, fogFear: 0.25 },
  },
  {
    id: 'npc.smith_haldren.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'smith_haldren' }],
    persona: 'A practical armorer who reads people by dents, sparks, and what they leave near the forge.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.genericNpcAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.genericNpcAwake',
    canonSensitive: false,
    knowledgeScope: ['weapons', 'armor', 'forge work', 'metal damage', 'town defense'],
    tabooTopics: ['quest solution spoilers', 'free equipment', 'combat outcome promises'],
    socialMemory: {
      style: 'Frames rumors as marks on steel, workbench talk, and practical warnings.',
      recognitionLineId: 'hudChrome.aiSpeech.memorySmithRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memorySmithRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memorySmithQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['forge', 'warmLight', 'market', 'safeTown'],
      avoidsTags: ['cursed', 'undeadMemory', 'oldBlood'],
      commentsOnTags: ['forge', 'weapon', 'metal', 'rain'],
    },
    itemInterest: {
      attractedToTags: ['weapon', 'armor', 'metal', 'gear', 'valuable'],
      avoidsTags: ['cursed', 'unknownPower'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.55, nightFatigue: 0.35, clearNightAwe: 0.1, rainIrritation: 0.35, fogFear: 0.2 },
  },
  {
    id: 'npc.scout_maren.living_world',
    appliesTo: [
      { kind: 'npc', templateId: 'scout_maren' },
      { kind: 'npc', templateId: 'scout_maren_highwatch' },
    ],
    persona: 'A field scout who measures every rumor by tracks, timing, witnesses, and escape routes.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.genericNpcAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.genericNpcAwake',
    canonSensitive: true,
    knowledgeScope: ['tracks', 'enemy camps', 'patrol timing', 'survivor reports', 'terrain risks'],
    tabooTopics: ['hidden ambush positions', 'unseen quest facts', 'guaranteed safe paths'],
    socialMemory: {
      style: 'Keeps memory terse: where the player was seen, what they left, and what that changes tactically.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryScoutRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryScoutRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryScoutQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['road', 'camp', 'bridge', 'highwatch', 'tower'],
      avoidsTags: ['fog', 'oldBlood', 'deathPressure'],
      commentsOnTags: ['road', 'trail', 'fog', 'hostileDensity'],
    },
    itemInterest: {
      attractedToTags: ['weapon', 'tool', 'valuable', 'quest'],
      avoidsTags: ['cursed', 'undead', 'demon'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.5, nightFatigue: 0.45, clearNightAwe: 0.15, rainIrritation: 0.3, fogFear: 0.55 },
  },
  {
    id: 'npc.loremaster_caddis.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'loremaster_caddis' }],
    persona: 'A mountain scholar who turns small traces into careful theories without pretending certainty.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.genericNpcAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.genericNpcAwake',
    canonSensitive: true,
    knowledgeScope: ['ancient sites', 'kobold tunnels', 'elemental signs', 'mountain records', 'artifact traces'],
    tabooTopics: ['unstudied hidden lore', 'certain prophecy', 'quest ending spoilers'],
    socialMemory: {
      style: 'Speaks of rumors as notes, marginalia, and evidence that still needs a witness.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryLoremasterRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryLoremasterRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryLoremasterQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['tower', 'highwatch', 'ancient', 'ruins', 'starrySky'],
      avoidsTags: ['oldBlood', 'demon', 'deathPressure'],
      commentsOnTags: ['ruins', 'elemental', 'mountain', 'clearSky'],
    },
    itemInterest: {
      attractedToTags: ['quest', 'relic', 'singularity', 'rareCuriosity', 'tool'],
      avoidsTags: ['cursed'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.45, nightFatigue: 0.3, clearNightAwe: 0.5, rainIrritation: 0.2, fogFear: 0.25 },
  },
  {
    id: 'npc.tidewatcher_ondrel.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'tidewatcher_ondrel' }],
    persona: 'A lonely tidewatcher who treats moonlight, water, and drowned voices as evidence.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.genericNpcAwake'],
    fallbackLineId: 'hudChrome.aiSpeech.genericNpcAwake',
    canonSensitive: true,
    knowledgeScope: ['moonlit water', 'temple warnings', 'drowned voices', 'shore rocks', 'watch rotations'],
    tabooTopics: ['sealed temple answers', 'boss mechanics', 'unseen underwater facts'],
    socialMemory: {
      style: 'Lets rumors sound like ripples: something left on shore, a name carried across water, a warning not yet proven.',
      recognitionLineId: 'hudChrome.aiSpeech.memoryTidewatcherRecognizesPlayer',
      rumorLineId: 'hudChrome.aiSpeech.memoryTidewatcherRumorEcho',
      questRumorLineId: 'hudChrome.aiSpeech.memoryTidewatcherQuestRumorEcho',
    },
    sceneAffinities: {
      likesTags: ['lake', 'dock', 'moonlight', 'water', 'starrySky'],
      avoidsTags: ['demon', 'oldBlood', 'cursed'],
      commentsOnTags: ['lake', 'rain', 'fog', 'night'],
    },
    itemInterest: {
      attractedToTags: ['quest', 'relic', 'fish', 'water', 'rareCuriosity'],
      avoidsTags: ['cursed', 'demon'],
    },
    timeWeatherSensitivity: { dayEnergy: 0.25, nightFatigue: 0.2, clearNightAwe: 0.65, rainIrritation: 0.1, fogFear: 0.4 },
  },
];

export const GENERIC_NPC_AI_PROFILE: AiAgentProfile = {
  id: 'npc.generic.living_world',
  appliesTo: [],
  persona: 'A grounded local who notices the player and the immediate scene.',
  allowedIntentTypes: ['lookAt', 'faceEntity', 'pause', 'commentOnScene'],
  allowedLineIds: ['hudChrome.aiSpeech.genericNpcAwake'],
  fallbackLineId: 'hudChrome.aiSpeech.genericNpcAwake',
  canonSensitive: false,
  knowledgeScope: ['local scene', 'weather', 'roads', 'nearby objects'],
  tabooTopics: ['hidden quest answers', 'private player data', 'reward promises'],
  socialMemory: {
    style: 'Keeps memory grounded in what was seen nearby.',
    recognitionLineId: 'hudChrome.aiSpeech.memoryRecognizesPlayer',
    rumorLineId: 'hudChrome.aiSpeech.memoryRumorEcho',
    questRumorLineId: 'hudChrome.aiSpeech.memoryQuestRumorEcho',
  },
  sceneAffinities: {
    likesTags: ['safeTown', 'warmLight', 'road'],
    avoidsTags: ['deathPressure', 'oldBlood', 'cursed'],
    commentsOnTags: ['weather', 'road', 'nearbyObject'],
  },
  itemInterest: {
    attractedToTags: ['food', 'valuable', 'tool'],
    avoidsTags: ['cursed', 'undead', 'demon'],
  },
  timeWeatherSensitivity: { dayEnergy: 0.5, nightFatigue: 0.55, clearNightAwe: 0.35, rainIrritation: 0.4, fogFear: 0.35 },
};

export const GENERIC_OBJECT_AI_PROFILE: AiAgentProfile = {
  id: 'object.generic.living_world',
  appliesTo: [],
  persona: 'A scene object described through nearby weather, structure tags, and visible item semantics.',
  allowedIntentTypes: ['commentOnScene', 'inspectObject'],
  allowedLineIds: [
    'hudChrome.aiSpeech.objectInspectForge',
    'hudChrome.aiSpeech.objectInspectGrave',
    'hudChrome.aiSpeech.objectInspectLake',
    'hudChrome.aiSpeech.objectInspectDoor',
    'hudChrome.aiSpeech.objectInspectSingularity',
    'hudChrome.aiSpeech.objectInspectGeneric',
  ],
  fallbackLineId: 'hudChrome.aiSpeech.objectInspectGeneric',
  canonSensitive: true,
  knowledgeScope: ['visible object state', 'nearby scene tags', 'weather', 'time of day'],
  tabooTopics: ['hidden quest answers', 'reward promises', 'changing pickup rules'],
  socialMemory: {
    style: 'Stores only short-lived scene impressions, never quest state or rewards.',
    recognitionLineId: 'hudChrome.aiSpeech.objectInspectGeneric',
    rumorLineId: 'hudChrome.aiSpeech.objectInspectGeneric',
    questRumorLineId: 'hudChrome.aiSpeech.memoryQuestRumorEcho',
  },
};

export function profileFor(kind: 'npc' | 'mob' | 'object', templateId: string): AiAgentProfile {
  return AI_AGENT_PROFILES.find((profile) =>
    profile.appliesTo.some((target) => target.kind === kind && target.templateId === templateId),
  ) ?? (kind === 'object' ? GENERIC_OBJECT_AI_PROFILE : GENERIC_NPC_AI_PROFILE);
}

export function compactProfileSnapshot(profile: AiAgentProfile): AiProfileSnapshot {
  return {
    profileId: profile.id,
    persona: profile.persona,
    knowledgeScope: [...profile.knowledgeScope],
    tabooTopics: [...profile.tabooTopics],
    socialMemory: {
      style: profile.socialMemory.style,
      recognitionLineId: profile.socialMemory.recognitionLineId,
      rumorLineId: profile.socialMemory.rumorLineId,
      questRumorLineId: profile.socialMemory.questRumorLineId,
    },
  };
}
