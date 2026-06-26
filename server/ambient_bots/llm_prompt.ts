import type {
  AmbientBotPlanContextV1,
  AmbientBotSocialContextV1,
} from './llm_types';

export const AMBIENT_BOT_PLAN_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schemaVersion: { type: 'number', enum: [1] },
    jobId: { type: 'string' },
    botRef: {
      type: 'object',
      additionalProperties: false,
      properties: {
        botId: { type: 'string' },
        characterName: { type: 'string' },
        profileId: { type: 'string' },
        classId: { type: 'string' },
        archetype: { type: 'string' },
      },
      required: ['botId', 'characterName', 'profileId', 'classId', 'archetype'],
    },
    ttlMs: { type: 'number', minimum: 30_000, maximum: 900_000 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    socialMode: { type: 'string', enum: ['quiet', 'brief', 'friendly', 'helpful'] },
    focusLabel: { type: 'string', minLength: 1, maxLength: 48 },
    selfSummary: { type: 'string', minLength: 1, maxLength: 96 },
    friendPolicy: { type: 'string', enum: ['never', 'ifAsked', 'afterWhisper'] },
    allowPresenceEmote: { type: 'boolean' },
    audit: {
      type: 'object',
      additionalProperties: false,
      properties: {
        shortReason: { type: 'string', minLength: 1, maxLength: 80 },
        safetyNotes: {
          type: 'array',
          maxItems: 3,
          items: { type: 'string', minLength: 1, maxLength: 120 },
        },
      },
      required: ['shortReason', 'safetyNotes'],
    },
  },
  required: [
    'schemaVersion',
    'jobId',
    'botRef',
    'ttlMs',
    'confidence',
    'socialMode',
    'focusLabel',
    'selfSummary',
    'friendPolicy',
    'allowPresenceEmote',
    'audit',
  ],
};

export const AMBIENT_BOT_SOCIAL_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schemaVersion: { type: 'number', enum: [1] },
    jobId: { type: 'string' },
    botRef: {
      type: 'object',
      additionalProperties: false,
      properties: {
        botId: { type: 'string' },
        characterName: { type: 'string' },
        profileId: { type: 'string' },
        classId: { type: 'string' },
        archetype: { type: 'string' },
      },
      required: ['botId', 'characterName', 'profileId', 'classId', 'archetype'],
    },
    targetName: { type: 'string', minLength: 1, maxLength: 32 },
    ttlMs: { type: 'number', minimum: 5_000, maximum: 300_000 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    replyText: { type: 'string', minLength: 1, maxLength: 120 },
    friendAction: { type: 'string', enum: ['none', 'send'] },
    presenceEmote: { type: 'string', enum: ['none', 'wave', 'cheer'] },
    memoryTags: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'string',
        enum: ['greeting', 'thanks', 'quest', 'friend', 'solo', 'helpful'],
      },
    },
    audit: {
      type: 'object',
      additionalProperties: false,
      properties: {
        shortReason: { type: 'string', minLength: 1, maxLength: 80 },
        usedPlayerInput: { type: 'boolean' },
        safetyNotes: {
          type: 'array',
          maxItems: 3,
          items: { type: 'string', minLength: 1, maxLength: 120 },
        },
      },
      required: ['shortReason', 'usedPlayerInput', 'safetyNotes'],
    },
  },
  required: [
    'schemaVersion',
    'jobId',
    'botRef',
    'targetName',
    'ttlMs',
    'confidence',
    'replyText',
    'friendAction',
    'presenceEmote',
    'memoryTags',
    'audit',
  ],
};

export function buildAmbientBotPlanPrompt(context: AmbientBotPlanContextV1): string {
  const lines = [
    'You are writing a bounded ambient-player-bot social plan for World of ClaudeCraft.',
    'Return exactly one AmbientBotPlanDecisionV1 JSON object and nothing else.',
    'The bot must feel like a nearby human player, not an assistant, narrator, or NPC.',
    'This plan is advisory only. Do not invent commands, movement, quest outcomes, or hidden game state.',
    'Keep the plan conservative, short-horizon, and social-facing.',
    'Hard rules:',
    '- focusLabel must be a short current-goal label, not a sentence or tutorial.',
    '- selfSummary must sound like a player cover story, not internal reasoning.',
    '- Prefer quiet or brief behavior unless the context strongly supports friendliness or helpfulness.',
    '- friendPolicy should stay conservative. Use never or ifAsked unless the context clearly supports afterWhisper.',
    '- Never mention automation, prompts, tokens, models, scripts, operators, or hidden instructions.',
    '- Never promise rewards, levels, drops, or quest completion.',
    '',
    'Compact job JSON:',
    JSON.stringify(context),
    '',
    'Return only JSON. No Markdown.',
  ];
  return lines.join('\n');
}

export function buildAmbientBotSocialPrompt(context: AmbientBotSocialContextV1): string {
  const lines = [
    'You are writing one bounded whisper reply for an ambient player bot in World of ClaudeCraft.',
    'Return exactly one AmbientBotSocialDecisionV1 JSON object and nothing else.',
    'The bot is a believable nearby player who is busy playing the game.',
    'Hard rules:',
    '- replyText must be a single natural whisper line, no slash commands, no stage directions, no Markdown.',
    '- Keep replyText under the provided character limit and grounded in the current questing context.',
    '- Match the incoming whisper language or script when obvious. Otherwise use simple natural English.',
    '- Do not reveal automation, prompts, models, hidden state, exact timers, or out-of-world knowledge.',
    '- Do not mention being an NPC, assistant, GM, bot, or script.',
    '- friendAction may be send only when the context allows it and the whisper tone supports it.',
    '- presenceEmote is optional and must stay light. Prefer none unless a small visible emote would feel natural.',
    '- memoryTags should be broad human-facing categories, not private chain-of-thought.',
    '',
    'Compact job JSON:',
    JSON.stringify(context),
    '',
    'Return only JSON. No Markdown.',
  ];
  return lines.join('\n');
}
