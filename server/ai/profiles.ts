import type { AiIntentType, AiProfileSnapshot, AiSpeechFingerprint } from './ai_types';
import { buildForkAiProfilePack } from './fork_pack';

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
  speechFingerprint?: AiSpeechFingerprint;
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

const PET_COMMAND_INTENTS: AiIntentType[] = [
  'commandPetPassive',
  'commandPetDefensive',
  'commandPetAggressive',
  'commandPetAttack',
  'commandPetTaunt',
  'commandPetIgnore',
];

const SPEECH_FINGERPRINTS = {
  priest: {
    sentenceRhythm: 'soft, elliptical, usually one short warning plus one omen image',
    addressStyle: 'uses the player name sparingly, otherwise says friend or keeps address unspoken',
    favoriteStarts: ['Keep your voice low', 'The graves do not like', 'I felt the air turn'],
    sensoryBias: ['cold air', 'grave soil', 'bells', 'omens'],
    avoidedPhrases: ['overall', 'this means', 'I would suggest'],
  },
  merchant: {
    sentenceRhythm: 'quick appraisal, half warning and half bargain, rarely more than one comma',
    addressStyle: 'calls the player friend, traveler, or by name when making a point',
    favoriteStarts: ['That has a price', 'Road talk says', 'If you are buying trouble'],
    sensoryBias: ['coin weight', 'mud on boots', 'market noise', 'rain on canvas'],
    avoidedPhrases: ['to summarize', 'from this we can see', 'my recommendation'],
  },
  commander: {
    sentenceRhythm: 'terse order language, one concrete risk, then a practical next move',
    addressStyle: 'uses rank-neutral direct address, rarely flatters',
    favoriteStarts: ['Eyes open', 'Hold a moment', 'That road is not quiet'],
    sensoryBias: ['footprints', 'watch posts', 'weapon wear', 'silence on roads'],
    avoidedPhrases: ['interesting point', 'overall', 'I think you should'],
  },
  herbalist: {
    sentenceRhythm: 'precise and quiet, like a field note spoken under breath',
    addressStyle: 'uses patient, traveler, or the player name when concern is personal',
    favoriteStarts: ['Smell that', 'Do not touch it yet', 'The leaves are telling on it'],
    sensoryBias: ['bitter sap', 'venom', 'breath tone', 'wet leaves'],
    avoidedPhrases: ['clearly indicates', 'it is important to note', 'I would recommend'],
  },
  tidewatcher: {
    sentenceRhythm: 'weathered, indirect, with water signs standing in for certainty',
    addressStyle: 'calls the player by name only when the warning is intimate',
    favoriteStarts: ['Water carries that', 'Hear the reeds', 'Moonlight does not lie clean'],
    sensoryBias: ['ripples', 'reeds', 'fish smell', 'moonlit water'],
    avoidedPhrases: ['this suggests', 'in conclusion', 'therefore'],
  },
  smith: {
    sentenceRhythm: 'practical workshop speech, blunt image first, judgment second',
    addressStyle: 'uses traveler, worker, or the player name with dry familiarity',
    favoriteStarts: ['Steel would complain', 'That mark is not honest', 'I know that sound'],
    sensoryBias: ['sparks', 'dents', 'stone dust', 'hot iron'],
    avoidedPhrases: ['overall', 'it can be inferred', 'I would suggest'],
  },
  scholar: {
    sentenceRhythm: 'careful theory, one caveat, then a small concrete clue',
    addressStyle: 'keeps address formal unless memory has made the player familiar',
    favoriteStarts: ['If the marks are honest', 'I would not call it proof', 'That pattern is older than it looks'],
    sensoryBias: ['marginal notes', 'old stone', 'star maps', 'artifact traces'],
    avoidedPhrases: ['definitely proves', 'as an AI', 'to summarize'],
  },
  creature: {
    sentenceRhythm: 'fragmented, instinct-first, often body language before words',
    addressStyle: 'does not use polite address; notices scent, threat, food, or territory',
    favoriteStarts: ['Sniffs once', 'Backs a step', 'Stares too long'],
    sensoryBias: ['scent', 'vibration', 'hunger', 'fear'],
    avoidedPhrases: ['I would suggest', 'overall', 'this means'],
  },
  scout: {
    sentenceRhythm: 'quiet field speech, one sign noticed, then one restrained warning',
    addressStyle: 'uses the player name only if urgency makes it useful',
    favoriteStarts: ['Track is fresh', 'Do you hear that', 'Step light'],
    sensoryBias: ['bent grass', 'old tracks', 'wind shift', 'animal silence'],
    avoidedPhrases: ['from my perspective', 'overall', 'I would recommend'],
  },
  object: {
    sentenceRhythm: 'short inspection prose, visible detail first, no inner monologue',
    addressStyle: 'does not address the player unless the object has visible writing or omen-like presence',
    favoriteStarts: ['The surface shows', 'A cold seam runs', 'Dust gathers'],
    sensoryBias: ['texture', 'marks', 'smell', 'light'],
    avoidedPhrases: ['it seems like', 'you should', 'overall'],
  },
  generic: {
    sentenceRhythm: 'plain local speech, one grounded observation, no lecture',
    addressStyle: 'uses traveler, friend, or the player name only when natural',
    favoriteStarts: ['Wait', 'Something is off', 'I saw that'],
    sensoryBias: ['weather', 'road dust', 'nearby movement', 'voices'],
    avoidedPhrases: ['overall', 'therefore', 'my recommendation'],
  },
} satisfies Record<string, AiSpeechFingerprint>;

type SpeechFingerprintKey = keyof typeof SPEECH_FINGERPRINTS;

export const AI_AGENT_PROFILES: readonly AiAgentProfile[] = buildForkAiProfilePack(BASIC_NPC_INTENTS);

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

export const GENERIC_MOB_AI_PROFILE: AiAgentProfile = {
  id: 'mob.generic.living_world',
  appliesTo: [],
  persona: 'A creature ruled by family instinct, immediate scene pressure, and rare individual quirks.',
  allowedIntentTypes: ['lookAt', 'faceEntity', 'pause', 'commentOnScene', 'inspectObject', 'approachObject', 'avoidObject', 'seekShelter', ...PET_COMMAND_INTENTS],
  allowedLineIds: [
    'hudChrome.aiSpeech.itemInterestApproach',
    'hudChrome.aiSpeech.itemInterestAvoid',
    'hudChrome.aiSpeech.itemInterestInspect',
    'hudChrome.aiSpeech.singularityApproach',
    'hudChrome.aiSpeech.singularityAvoid',
    'hudChrome.aiSpeech.singularityInspect',
    'hudChrome.aiSpeech.singularityFoodFixated',
    'hudChrome.aiSpeech.singularityCollector',
    'hudChrome.aiSpeech.singularityOmenSensitive',
    'hudChrome.aiSpeech.singularityCowardly',
    'hudChrome.aiSpeech.singularityTerritorial',
    'hudChrome.aiSpeech.singularityVengeful',
    'hudChrome.aiSpeech.singularityStargazer',
    'hudChrome.aiSpeech.singularityRemembersPlayer',
    'hudChrome.aiSpeech.singularityRemembersScene',
    'hudChrome.aiSpeech.familySceneApproach',
    'hudChrome.aiSpeech.familySceneAvoid',
    'hudChrome.aiSpeech.familySceneInspect',
    'hudChrome.aiSpeech.familySceneBeastUneasy',
    'hudChrome.aiSpeech.familySceneUndeadDrawn',
    'hudChrome.aiSpeech.familySceneElementalResonance',
    'hudChrome.aiSpeech.familySceneDemonAmused',
  ],
  fallbackLineId: 'hudChrome.aiSpeech.itemInterestInspect',
  canonSensitive: false,
  knowledgeScope: ['visible creature family instinct', 'nearby dropped objects', 'weather', 'time of day', 'immediate danger'],
  tabooTopics: ['quest truth', 'reward promises', 'private player data', 'combat outcome guarantees'],
  socialMemory: {
    style: 'Keeps only creature-level impressions: scent, fear, possession, repeated player patterns, and scene pressure.',
    recognitionLineId: 'hudChrome.aiSpeech.singularityRemembersPlayer',
    rumorLineId: 'hudChrome.aiSpeech.singularityRemembersScene',
  },
  sceneAffinities: {
    likesTags: ['camp', 'food', 'water', 'starrySky', 'undeadMemory'],
    avoidsTags: ['safeTown', 'forge', 'fire', 'holy', 'deathPressure'],
    commentsOnTags: ['weather', 'nearbyObject', 'hostileDensity', 'rain', 'fog', 'night'],
  },
  itemInterest: {
    attractedToTags: ['food', 'meat', 'fish', 'valuable', 'trophy', 'relic', 'singularity'],
    avoidsTags: ['fire', 'holy', 'cursed', 'unknownPower'],
  },
  timeWeatherSensitivity: { dayEnergy: 0.45, nightFatigue: 0.35, clearNightAwe: 0.3, rainIrritation: 0.25, fogFear: 0.45 },
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
  ) ?? (kind === 'object'
    ? GENERIC_OBJECT_AI_PROFILE
    : kind === 'mob'
      ? GENERIC_MOB_AI_PROFILE
      : GENERIC_NPC_AI_PROFILE);
}

export function compactProfileSnapshot(profile: AiAgentProfile): AiProfileSnapshot {
  return {
    profileId: profile.id,
    persona: profile.persona,
    knowledgeScope: [...profile.knowledgeScope],
    tabooTopics: [...profile.tabooTopics],
    speechFingerprint: speechFingerprintForProfile(profile),
    socialMemory: {
      style: profile.socialMemory.style,
      recognitionLineId: profile.socialMemory.recognitionLineId,
      rumorLineId: profile.socialMemory.rumorLineId,
      questRumorLineId: profile.socialMemory.questRumorLineId,
    },
  };
}

export function speechFingerprintForProfile(profile: AiAgentProfile): AiSpeechFingerprint {
  return cloneSpeechFingerprint(profile.speechFingerprint ?? SPEECH_FINGERPRINTS[speechFingerprintKeyForProfile(profile)]);
}

function speechFingerprintKeyForProfile(profile: AiAgentProfile): SpeechFingerprintKey {
  if (profile.id.startsWith('object.')) return 'object';
  if (profile.id.startsWith('mob.')) return 'creature';

  const text = [
    profile.id,
    profile.persona,
    ...profile.knowledgeScope,
    ...profile.tabooTopics,
    profile.socialMemory.style,
  ].join(' ').toLowerCase();

  if (/(brother|priest|chapel|grave|dead|undead|omen|rite|absolution)/.test(text)) return 'priest';
  if (/(merchant|trader|provisioner|quartermaster|market|coin|supply|store|price|trade)/.test(text)) return 'merchant';
  if (/(apothecary|herbalist|herb|venom|poultice|plant|remedy|poison)/.test(text)) return 'herbalist';
  if (/(fisher|tide|lake|water|dock|shore|reed|moonlit|drowned|murloc)/.test(text)) return 'tidewatcher';
  if (/(smith|armorer|foreman|forge|steel|anvil|blade|armor|ore|mine)/.test(text)) return 'smith';
  if (/(ranger|scout|glade|trail|tracks|forest|warden of the woods)/.test(text)) return 'scout';
  if (/(marshal|captain|warden|patrol|watch|military|guard|defense|gate)/.test(text)) return 'commander';
  if (/(loremaster|scholar|ancient|artifact|record|archive|theory)/.test(text)) return 'scholar';
  return 'generic';
}

function cloneSpeechFingerprint(fingerprint: AiSpeechFingerprint): AiSpeechFingerprint {
  return {
    sentenceRhythm: fingerprint.sentenceRhythm,
    addressStyle: fingerprint.addressStyle,
    favoriteStarts: [...fingerprint.favoriteStarts],
    sensoryBias: [...fingerprint.sensoryBias],
    avoidedPhrases: [...fingerprint.avoidedPhrases],
  };
}
