import type { AiIntentType } from './ai_types';

export interface AiAgentProfile {
  id: string;
  appliesTo: Array<{ kind: 'npc' | 'mob' | 'object'; templateId: string }>;
  persona: string;
  allowedIntentTypes: AiIntentType[];
  allowedLineIds: string[];
  fallbackLineId: string;
  canonSensitive: boolean;
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
];

export const GENERIC_NPC_AI_PROFILE: AiAgentProfile = {
  id: 'npc.generic.living_world',
  appliesTo: [],
  persona: 'A grounded local who notices the player and the immediate scene.',
  allowedIntentTypes: ['lookAt', 'faceEntity', 'pause', 'commentOnScene'],
  allowedLineIds: ['hudChrome.aiSpeech.genericNpcAwake'],
  fallbackLineId: 'hudChrome.aiSpeech.genericNpcAwake',
  canonSensitive: false,
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

export function profileFor(kind: 'npc' | 'mob' | 'object', templateId: string): AiAgentProfile {
  return AI_AGENT_PROFILES.find((profile) =>
    profile.appliesTo.some((target) => target.kind === kind && target.templateId === templateId),
  ) ?? GENERIC_NPC_AI_PROFILE;
}
