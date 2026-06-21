import type { AiIntentType } from './ai_types';

export interface AiAgentProfile {
  id: string;
  appliesTo: Array<{ kind: 'npc' | 'mob' | 'object'; templateId: string }>;
  persona: string;
  allowedIntentTypes: AiIntentType[];
  allowedLineIds: string[];
  fallbackLineId: string;
  canonSensitive: boolean;
}

const BASIC_NPC_INTENTS: AiIntentType[] = ['lookAt', 'faceEntity', 'pause', 'commentOnScene', 'showGossipOptions', 'questHint'];

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
  },
  {
    id: 'npc.the_merchant.living_world',
    appliesTo: [{ kind: 'npc', templateId: 'the_merchant' }],
    persona: 'A market keeper who treats rumors, risk, and coin as the same weather system.',
    allowedIntentTypes: BASIC_NPC_INTENTS,
    allowedLineIds: ['hudChrome.aiSpeech.merchantMarketPulse'],
    fallbackLineId: 'hudChrome.aiSpeech.merchantMarketPulse',
    canonSensitive: false,
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
};

export function profileFor(kind: 'npc' | 'mob' | 'object', templateId: string): AiAgentProfile {
  return AI_AGENT_PROFILES.find((profile) =>
    profile.appliesTo.some((target) => target.kind === kind && target.templateId === templateId),
  ) ?? GENERIC_NPC_AI_PROFILE;
}
