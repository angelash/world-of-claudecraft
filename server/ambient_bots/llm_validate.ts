import type {
  AmbientBotLlmFriendPolicy,
  AmbientBotLlmMemoryTag,
  AmbientBotLlmPresenceEmote,
  AmbientBotLlmSocialMode,
  AmbientBotPlanContextV1,
  AmbientBotPlanDecisionV1,
  AmbientBotSocialContextV1,
  AmbientBotSocialDecisionV1,
} from './llm_types';

const PLAN_SOCIAL_MODES = new Set<AmbientBotLlmSocialMode>([
  'quiet',
  'brief',
  'friendly',
  'helpful',
]);
const FRIEND_POLICIES = new Set<AmbientBotLlmFriendPolicy>([
  'never',
  'ifAsked',
  'afterWhisper',
]);
const PRESENCE_EMOTES = new Set<AmbientBotLlmPresenceEmote>([
  'none',
  'wave',
  'cheer',
]);
const MEMORY_TAGS = new Set<AmbientBotLlmMemoryTag>([
  'greeting',
  'thanks',
  'quest',
  'friend',
  'solo',
  'helpful',
]);
const META_REPLY_PATTERN = /\b(bot|automation|assistant|system prompt|prompt|model|operator|script|token)\b/i;
const EXTERNAL_REPLY_PATTERN = /\b(http|www\.|discord|email|gmail)\b/i;

export function validateAmbientBotPlanDecision(
  value: unknown,
  context: AmbientBotPlanContextV1,
): AmbientBotPlanDecisionV1 {
  const record = requireRecord(value, 'plan decision');
  rejectUnexpectedKeys(record, [
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
  ], 'plan decision');
  const schemaVersion = requireLiteral(record.schemaVersion, 1, 'plan decision.schemaVersion');
  const jobId = requireString(record.jobId, 'plan decision.jobId');
  if (jobId !== context.jobId) throw new Error('plan decision jobId mismatch');
  const botRef = parseBotRef(record.botRef, 'plan decision.botRef');
  requireMatchingBotRef(botRef, context.botRef, 'plan decision.botRef');
  const ttlMs = requireNumberInRange(record.ttlMs, 'plan decision.ttlMs', 30_000, 900_000);
  const confidence = requireNumberInRange(record.confidence, 'plan decision.confidence', 0, 1);
  const socialMode = requireEnum(record.socialMode, PLAN_SOCIAL_MODES, 'plan decision.socialMode');
  const focusLabel = requireShortText(record.focusLabel, 'plan decision.focusLabel', 48);
  const selfSummary = requireShortText(record.selfSummary, 'plan decision.selfSummary', 96);
  const friendPolicy = requireEnum(record.friendPolicy, FRIEND_POLICIES, 'plan decision.friendPolicy');
  const allowPresenceEmote = requireBoolean(record.allowPresenceEmote, 'plan decision.allowPresenceEmote');
  const audit = parsePlanAudit(record.audit);
  return {
    schemaVersion,
    jobId,
    botRef,
    ttlMs,
    confidence,
    socialMode,
    focusLabel,
    selfSummary,
    friendPolicy,
    allowPresenceEmote,
    audit,
  };
}

export function validateAmbientBotSocialDecision(
  value: unknown,
  context: AmbientBotSocialContextV1,
): AmbientBotSocialDecisionV1 {
  const record = requireRecord(value, 'social decision');
  rejectUnexpectedKeys(record, [
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
  ], 'social decision');
  const schemaVersion = requireLiteral(record.schemaVersion, 1, 'social decision.schemaVersion');
  const jobId = requireString(record.jobId, 'social decision.jobId');
  if (jobId !== context.jobId) throw new Error('social decision jobId mismatch');
  const botRef = parseBotRef(record.botRef, 'social decision.botRef');
  requireMatchingBotRef(botRef, context.botRef, 'social decision.botRef');
  const targetName = requireString(record.targetName, 'social decision.targetName');
  if (targetName !== context.whisper.fromName) throw new Error('social decision targetName mismatch');
  const ttlMs = requireNumberInRange(record.ttlMs, 'social decision.ttlMs', 5_000, 300_000);
  const confidence = requireNumberInRange(record.confidence, 'social decision.confidence', 0, 1);
  const replyText = requireReplyText(record.replyText, context.constraints.maxReplyChars);
  const friendAction = requireString(record.friendAction, 'social decision.friendAction');
  if (friendAction !== 'none' && friendAction !== 'send') {
    throw new Error('social decision friendAction is invalid');
  }
  if (friendAction === 'send' && !context.constraints.allowFriendAdd) {
    throw new Error('social decision cannot send friend add in this context');
  }
  const presenceEmote = requireEnum(record.presenceEmote, PRESENCE_EMOTES, 'social decision.presenceEmote');
  if (presenceEmote !== 'none' && !context.constraints.allowPresenceEmote) {
    throw new Error('social decision cannot send presence emote in this context');
  }
  const memoryTags = requireMemoryTags(record.memoryTags);
  const audit = parseSocialAudit(record.audit);
  return {
    schemaVersion,
    jobId,
    botRef,
    targetName,
    ttlMs,
    confidence,
    replyText,
    friendAction,
    presenceEmote,
    memoryTags,
    audit,
  };
}

function parsePlanAudit(value: unknown): AmbientBotPlanDecisionV1['audit'] {
  const record = requireRecord(value, 'plan decision.audit');
  rejectUnexpectedKeys(record, ['shortReason', 'safetyNotes'], 'plan decision.audit');
  return {
    shortReason: requireShortText(record.shortReason, 'plan decision.audit.shortReason', 80),
    safetyNotes: requireStringArray(record.safetyNotes, 'plan decision.audit.safetyNotes', 3, 120),
  };
}

function parseSocialAudit(value: unknown): AmbientBotSocialDecisionV1['audit'] {
  const record = requireRecord(value, 'social decision.audit');
  rejectUnexpectedKeys(record, ['shortReason', 'usedPlayerInput', 'safetyNotes'], 'social decision.audit');
  return {
    shortReason: requireShortText(record.shortReason, 'social decision.audit.shortReason', 80),
    usedPlayerInput: requireBoolean(record.usedPlayerInput, 'social decision.audit.usedPlayerInput'),
    safetyNotes: requireStringArray(record.safetyNotes, 'social decision.audit.safetyNotes', 3, 120),
  };
}

function parseBotRef(
  value: unknown,
  path: string,
): AmbientBotPlanDecisionV1['botRef'] {
  const record = requireRecord(value, path);
  rejectUnexpectedKeys(record, ['botId', 'characterName', 'profileId', 'classId', 'archetype'], path);
  return {
    botId: requireString(record.botId, `${path}.botId`),
    characterName: requireString(record.characterName, `${path}.characterName`),
    profileId: requireString(record.profileId, `${path}.profileId`),
    classId: requireString(record.classId, `${path}.classId`) as AmbientBotPlanDecisionV1['botRef']['classId'],
    archetype: requireString(record.archetype, `${path}.archetype`) as AmbientBotPlanDecisionV1['botRef']['archetype'],
  };
}

function requireMatchingBotRef(
  actual: AmbientBotPlanDecisionV1['botRef'],
  expected: AmbientBotPlanContextV1['botRef'],
  path: string,
): void {
  if (
    actual.botId !== expected.botId
    || actual.characterName !== expected.characterName
    || actual.profileId !== expected.profileId
    || actual.classId !== expected.classId
    || actual.archetype !== expected.archetype
  ) {
    throw new Error(`${path} mismatch`);
  }
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function rejectUnexpectedKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) throw new Error(`${path}.${key} is not allowed`);
  }
}

function requireLiteral<T extends string | number>(
  value: unknown,
  expected: T,
  path: string,
): T {
  if (value !== expected) throw new Error(`${path} must be ${String(expected)}`);
  return expected;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be boolean`);
  return value;
}

function requireNumberInRange(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${path} is out of range`);
  }
  return value;
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  path: string,
): T {
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    throw new Error(`${path} is invalid`);
  }
  return value as T;
}

function requireShortText(value: unknown, path: string, maxLength: number): string {
  const text = requireString(value, path);
  if (text.length > maxLength) throw new Error(`${path} is too long`);
  if (/[\r\n]/.test(text)) throw new Error(`${path} must be single-line`);
  return text;
}

function requireReplyText(value: unknown, maxLength: number): string {
  const text = requireShortText(value, 'social decision.replyText', maxLength);
  if (text.startsWith('/')) throw new Error('social decision.replyText cannot start with slash');
  if (META_REPLY_PATTERN.test(text)) throw new Error('social decision.replyText contains meta disclosure');
  if (EXTERNAL_REPLY_PATTERN.test(text)) throw new Error('social decision.replyText contains external coordination');
  return text;
}

function requireStringArray(
  value: unknown,
  path: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  if (value.length > maxItems) throw new Error(`${path} has too many entries`);
  return value.map((entry, index) => requireShortText(entry, `${path}[${index}]`, maxLength));
}

function requireMemoryTags(value: unknown): AmbientBotLlmMemoryTag[] {
  if (!Array.isArray(value)) throw new Error('social decision.memoryTags must be an array');
  if (value.length > 4) throw new Error('social decision.memoryTags has too many entries');
  const tags: AmbientBotLlmMemoryTag[] = [];
  for (let i = 0; i < value.length; i++) {
    tags.push(requireEnum(value[i], MEMORY_TAGS, `social decision.memoryTags[${i}]`));
  }
  return [...new Set(tags)];
}
