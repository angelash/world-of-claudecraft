import type { SimEvent } from '../src/sim/types';
import type {
  AiDecisionV1,
  AiJobContextV1,
  AiMemoryAuditRecord,
  AiProviderTimingSnapshot,
  AiValidationResult,
} from './ai/ai_types';

export const AI_AUDIT_WINDOWS = [
  { key: 'm1', labelKey: 'usage.window.1m', milliseconds: 60_000 },
  { key: 'm5', labelKey: 'usage.window.5m', milliseconds: 5 * 60_000 },
  { key: 'h1', labelKey: 'usage.window.1h', milliseconds: 60 * 60_000 },
  { key: 'h24', labelKey: 'usage.window.24h', milliseconds: 24 * 60 * 60_000 },
] as const;

export type AiAuditWindowKey = typeof AI_AUDIT_WINDOWS[number]['key'];
export type AiAuditStatus = 'accepted' | 'rejected' | 'provider_error' | 'local_reaction';
export type AiAuditProviderSource = 'codex' | 'fallback' | 'local' | 'provider';
export type AiAuditEntityKind = 'npc' | 'mob' | 'object' | 'system';

export interface AiAuditPlayerAction {
  kind: string;
  topic: string;
  labelKey: string;
  locale: string;
  protocol: {
    jobId: string;
    trigger: string;
    playerEntityId: number | null;
    entityKind: AiAuditEntityKind;
    entityId: number | null;
    templateId: string;
  };
}

export interface AiAuditEventSummary {
  type: string;
  pid: number | null;
  speakerId: number | null;
  speakerName: string;
  source: string;
  text: string;
  speechMode: string;
  lineId: string;
  language: string;
  speechText: string;
  targetEntityId: number | null;
  targetObjectId: number | null;
  targetItemId: string;
  reactionKind: string;
  raw: unknown;
  rawTruncated: boolean;
}

export interface AiAuditChain {
  playerAction: AiAuditPlayerAction;
  requestContext: {
    context: AiJobContextV1;
    promptText: string;
    promptTruncated: boolean;
  };
  provider: {
    source: AiAuditProviderSource;
    rawOutput: string;
    rawOutputTruncated: boolean;
    parsedDecision: AiDecisionV1 | null;
    timings?: AiProviderTimingSnapshot;
    error: string;
  };
  validation: {
    ok: boolean;
    reason: string;
    events: AiAuditEventSummary[];
  };
  delivered: {
    events: AiAuditEventSummary[];
    textSummary: string[];
  };
}

export interface AiAuditRecord {
  auditId: string;
  realm: string;
  jobId: string;
  trigger: string;
  entityKind: AiAuditEntityKind;
  entityId: number | null;
  templateId: string;
  playerEntityId: number | null;
  sceneId: string;
  zoneId: string;
  providerSource: AiAuditProviderSource;
  status: AiAuditStatus;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokenEstimate: boolean;
  outputMode: string;
  allowedIntentCount: number;
  allowedLineIdCount: number;
  memorySignalCount: number;
  directorProposalCount: number;
  sceneObjectCount: number;
  companionCount: number;
  lineIds: string[];
  intents: string[];
  memoryWriteRefs: string[];
  reason: string;
  error: string;
  providerTimings?: AiProviderTimingSnapshot;
  playerAction?: AiAuditPlayerAction;
  deliveredSummary?: string[];
  hasChain?: boolean;
  chain?: AiAuditChain;
  createdAt: string;
}

export interface AiAuditWindowSnapshot {
  key: AiAuditWindowKey;
  labelKey: string;
  milliseconds: number;
  providerJobs: number;
  accepted: number;
  rejected: number;
  providerErrors: number;
  /** Historical fallback records only. Real provider failures no longer synthesize fallback decisions. */
  fallbacks: number;
  localReactions: number;
  memoryWrites: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedTokens: boolean;
}

export interface AiAuditTokenTotals {
  providerJobs: number;
  localReactions: number;
  memoryWrites: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  averageProviderJobTokens: number;
  lastInputTokens: number;
  lastOutputTokens: number;
  lastTotalTokens: number;
  estimatedTokens: boolean;
}

export interface AiAuditSummary {
  generatedAt: string;
  windows: AiAuditWindowSnapshot[];
  totals: AiAuditTokenTotals;
}

export interface AiAuditSnapshot {
  summary: AiAuditSummary;
  recent: AiAuditRecord[];
}

export interface AiAuditCleanupResult {
  deletedRecords: number;
  retainedRecords: number;
}

export interface AiAuditSink {
  record(record: AiAuditRecord): void | Promise<void>;
}

interface WindowCounters {
  bucketMs: number;
  bucketStarts: number[];
  buckets: AiAuditCounterBucket[];
}

interface AiAuditCounterBucket {
  providerJobs: number;
  accepted: number;
  rejected: number;
  providerErrors: number;
  fallbacks: number;
  localReactions: number;
  memoryWrites: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedTokenRecords: number;
}

const AI_AUDIT_PROMPT_MAX_CHARS = 64_000;
const AI_AUDIT_RAW_OUTPUT_MAX_CHARS = 64_000;
const AI_AUDIT_RAW_EVENT_MAX_CHARS = 12_000;
const AI_AUDIT_TEXT_SUMMARY_MAX = 8;

const WINDOW_BUCKETS: Record<AiAuditWindowKey, { bucketMs: number; slots: number }> = {
  m1: { bucketMs: 1_000, slots: 60 },
  m5: { bucketMs: 5_000, slots: 60 },
  h1: { bucketMs: 60_000, slots: 60 },
  h24: { bucketMs: 60 * 60_000, slots: 24 },
};

function emptyBucket(): AiAuditCounterBucket {
  return {
    providerJobs: 0,
    accepted: 0,
    rejected: 0,
    providerErrors: 0,
    fallbacks: 0,
    localReactions: 0,
    memoryWrites: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedTokenRecords: 0,
  };
}

function newWindowCounters(window: AiAuditWindowKey): WindowCounters {
  const spec = WINDOW_BUCKETS[window];
  return {
    bucketMs: spec.bucketMs,
    bucketStarts: Array.from({ length: spec.slots }, () => Number.NEGATIVE_INFINITY),
    buckets: Array.from({ length: spec.slots }, emptyBucket),
  };
}

function bucketIndex(bucketStart: number, bucketMs: number, slots: number): number {
  const raw = Math.floor(bucketStart / bucketMs) % slots;
  return raw < 0 ? raw + slots : raw;
}

function addBucket(target: AiAuditCounterBucket, source: AiAuditCounterBucket): void {
  target.providerJobs += source.providerJobs;
  target.accepted += source.accepted;
  target.rejected += source.rejected;
  target.providerErrors += source.providerErrors;
  target.fallbacks += source.fallbacks;
  target.localReactions += source.localReactions;
  target.memoryWrites += source.memoryWrites;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.totalTokens += source.totalTokens;
  target.estimatedTokenRecords += source.estimatedTokenRecords;
}

function bucketForRecord(record: AiAuditRecord): AiAuditCounterBucket {
  const bucket = emptyBucket();
  if (record.status === 'local_reaction') {
    bucket.localReactions = 1;
  } else {
    bucket.providerJobs = 1;
  }
  if (record.status === 'accepted') bucket.accepted = 1;
  if (record.status === 'rejected') bucket.rejected = 1;
  if (record.status === 'provider_error') bucket.providerErrors = 1;
  if (record.providerSource === 'fallback') bucket.fallbacks = 1;
  bucket.memoryWrites = record.memoryWriteRefs.length;
  bucket.inputTokens = record.inputTokens;
  bucket.outputTokens = record.outputTokens;
  bucket.totalTokens = record.totalTokens;
  bucket.estimatedTokenRecords = record.tokenEstimate ? 1 : 0;
  return bucket;
}

function recordWindowCounter(counter: WindowCounters, at: number, bucket: AiAuditCounterBucket): void {
  const bucketStart = Math.floor(at / counter.bucketMs) * counter.bucketMs;
  const index = bucketIndex(bucketStart, counter.bucketMs, counter.buckets.length);
  if (counter.bucketStarts[index] !== bucketStart) {
    counter.bucketStarts[index] = bucketStart;
    counter.buckets[index] = emptyBucket();
  }
  addBucket(counter.buckets[index], bucket);
}

function sumWindow(counter: WindowCounters, now: number, windowMs: number): AiAuditCounterBucket {
  const cutoff = now - windowMs;
  const total = emptyBucket();
  for (let i = 0; i < counter.buckets.length; i++) {
    const bucketStart = counter.bucketStarts[i];
    if (bucketStart > now) continue;
    if (bucketStart + counter.bucketMs <= cutoff) continue;
    addBucket(total, counter.buckets[i]);
  }
  return total;
}

export class AiAuditRuntime implements AiAuditSink {
  private readonly windows: Record<AiAuditWindowKey, WindowCounters>;
  private totals = emptyBucket();
  private lastInputTokens = 0;
  private lastOutputTokens = 0;
  private lastTotalTokens = 0;

  constructor() {
    this.windows = {} as Record<AiAuditWindowKey, WindowCounters>;
    for (const window of AI_AUDIT_WINDOWS) this.windows[window.key] = newWindowCounters(window.key);
  }

  record(record: AiAuditRecord): void {
    const at = Date.parse(record.createdAt);
    const safeAt = Number.isFinite(at) ? at : Date.now();
    const bucket = bucketForRecord(record);
    for (const window of AI_AUDIT_WINDOWS) recordWindowCounter(this.windows[window.key], safeAt, bucket);
    addBucket(this.totals, bucket);
    this.lastInputTokens = record.inputTokens;
    this.lastOutputTokens = record.outputTokens;
    this.lastTotalTokens = record.totalTokens;
  }

  snapshot(now = Date.now()): AiAuditSummary {
    return {
      generatedAt: new Date(now).toISOString(),
      windows: AI_AUDIT_WINDOWS.map((window) => {
        const bucket = sumWindow(this.windows[window.key], now, window.milliseconds);
        return {
          ...window,
          providerJobs: bucket.providerJobs,
          accepted: bucket.accepted,
          rejected: bucket.rejected,
          providerErrors: bucket.providerErrors,
          fallbacks: bucket.fallbacks,
          localReactions: bucket.localReactions,
          memoryWrites: bucket.memoryWrites,
          inputTokens: bucket.inputTokens,
          outputTokens: bucket.outputTokens,
          totalTokens: bucket.totalTokens,
          estimatedTokens: bucket.estimatedTokenRecords > 0,
        };
      }),
      totals: {
        providerJobs: this.totals.providerJobs,
        localReactions: this.totals.localReactions,
        memoryWrites: this.totals.memoryWrites,
        inputTokens: this.totals.inputTokens,
        outputTokens: this.totals.outputTokens,
        totalTokens: this.totals.totalTokens,
        averageProviderJobTokens: this.totals.providerJobs > 0
          ? this.totals.totalTokens / this.totals.providerJobs
          : 0,
        lastInputTokens: this.lastInputTokens,
        lastOutputTokens: this.lastOutputTokens,
        lastTotalTokens: this.lastTotalTokens,
        estimatedTokens: this.totals.estimatedTokenRecords > 0,
      },
    };
  }

  reset(): void {
    for (const window of AI_AUDIT_WINDOWS) this.windows[window.key] = newWindowCounters(window.key);
    this.totals = emptyBucket();
    this.lastInputTokens = 0;
    this.lastOutputTokens = 0;
    this.lastTotalTokens = 0;
  }

  resetForTests(): void {
    this.reset();
  }
}

export function estimateAiTokens(value: unknown): number {
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? '';
  } catch {
    serialized = String(value);
  }
  return Math.max(0, Math.ceil(serialized.length / 4));
}

export function aiMemoryWriteRefs(records: readonly AiMemoryAuditRecord[] = []): string[] {
  return records.map((record) => `${record.kind}:${record.refId}`);
}

export function aiLineIdsFromDecision(decision: AiDecisionV1 | null): string[] {
  if (!decision) return [];
  return decision.speech
    .filter((speech) => speech.mode === 'lineId')
    .map((speech) => speech.lineId);
}

export function aiIntentsFromDecision(decision: AiDecisionV1 | null): string[] {
  return decision ? decision.intents.map((intent) => intent.type) : [];
}

export function aiAuditCountsFromContext(context: AiJobContextV1): {
  outputMode: string;
  allowedIntentCount: number;
  allowedLineIdCount: number;
  memorySignalCount: number;
  directorProposalCount: number;
  sceneObjectCount: number;
  companionCount: number;
} {
  return {
    outputMode: context.outputMode,
    allowedIntentCount: context.allowedIntents.length,
    allowedLineIdCount: context.allowedLineIds?.length ?? 0,
    memorySignalCount: context.memorySignals?.length ?? 0,
    directorProposalCount: context.directorProposals?.length ?? 0,
    sceneObjectCount: context.scene?.nearbySemanticObjects.length ?? 0,
    companionCount: context.scene?.companions.length ?? 0,
  };
}

export function createProviderAuditRecord(input: {
  auditId: string;
  realm: string;
  context: AiJobContextV1;
  providerSource: AiAuditProviderSource;
  latencyMs: number;
  decision: AiDecisionV1 | null;
  result: AiValidationResult | null;
  memoryWrites?: readonly AiMemoryAuditRecord[];
  providerError?: string;
  promptText?: string;
  rawOutput?: string;
  providerTimings?: AiProviderTimingSnapshot;
  deliveredEvents?: readonly SimEvent[];
  createdAt?: string;
}): AiAuditRecord {
  const providerError = input.providerError ?? '';
  const status: AiAuditStatus = providerError
    ? 'provider_error'
    : input.result?.ok
      ? 'accepted'
      : 'rejected';
  const inputTokens = estimateAiTokens(input.context);
  const outputTokens = providerError ? 0 : estimateAiTokens(input.decision);
  const playerAction = aiAuditPlayerActionFromContext(input.context);
  const deliveredEvents = [...(input.deliveredEvents ?? [])];
  const deliveredSummary = aiAuditDeliveredSummary(deliveredEvents);
  const chain = aiAuditChain({
    context: input.context,
    playerAction,
    providerSource: input.providerSource,
    decision: input.decision,
    result: input.result,
    providerError,
    promptText: input.promptText ?? '',
    rawOutput: input.rawOutput ?? '',
    providerTimings: input.providerTimings,
    deliveredEvents,
  });
  return {
    auditId: input.auditId,
    realm: input.realm,
    jobId: input.context.jobId,
    trigger: input.context.trigger,
    entityKind: input.context.entity.kind,
    entityId: input.context.entity.entityId,
    templateId: input.context.entity.templateId,
    playerEntityId: input.context.player.entityId,
    sceneId: input.context.scene?.subsceneId ?? input.context.scene?.zoneId ?? '',
    zoneId: input.context.scene?.zoneId ?? '',
    providerSource: input.providerSource,
    status,
    latencyMs: safeNumber(input.latencyMs),
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    tokenEstimate: true,
    ...aiAuditCountsFromContext(input.context),
    lineIds: aiLineIdsFromDecision(input.decision),
    intents: aiIntentsFromDecision(input.decision),
    memoryWriteRefs: aiMemoryWriteRefs(input.memoryWrites),
    reason: providerError
      ? `providerError:${providerError}`
      : input.result?.reason ?? input.decision?.audit.shortReason ?? '',
    error: providerError,
    ...(input.providerTimings ? { providerTimings: input.providerTimings } : {}),
    playerAction,
    deliveredSummary,
    hasChain: true,
    chain,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function createLocalAuditRecord(input: {
  auditId: string;
  realm: string;
  jobId: string;
  trigger: string;
  entityKind?: AiAuditEntityKind;
  entityId?: number | null;
  templateId?: string;
  playerEntityId?: number | null;
  sceneId?: string | null;
  zoneId?: string | null;
  lineIds?: readonly string[];
  intents?: readonly string[];
  memoryWrites?: readonly AiMemoryAuditRecord[];
  reason?: string;
  createdAt?: string;
}): AiAuditRecord {
  return {
    auditId: input.auditId,
    realm: input.realm,
    jobId: input.jobId,
    trigger: input.trigger,
    entityKind: input.entityKind ?? 'system',
    entityId: input.entityId ?? null,
    templateId: input.templateId ?? '',
    playerEntityId: input.playerEntityId ?? null,
    sceneId: input.sceneId ?? '',
    zoneId: input.zoneId ?? '',
    providerSource: 'local',
    status: 'local_reaction',
    latencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    tokenEstimate: true,
    outputMode: 'local_rule',
    allowedIntentCount: 0,
    allowedLineIdCount: 0,
    memorySignalCount: 0,
    directorProposalCount: 0,
    sceneObjectCount: 0,
    companionCount: 0,
    lineIds: [...(input.lineIds ?? [])],
    intents: [...(input.intents ?? [])],
    memoryWriteRefs: aiMemoryWriteRefs(input.memoryWrites),
    reason: input.reason ?? '',
    error: '',
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

function aiAuditChain(input: {
  context: AiJobContextV1;
  playerAction: AiAuditPlayerAction;
  providerSource: AiAuditProviderSource;
  decision: AiDecisionV1 | null;
  result: AiValidationResult | null;
  providerError: string;
  promptText: string;
  rawOutput: string;
  providerTimings?: AiProviderTimingSnapshot;
  deliveredEvents: readonly SimEvent[];
}): AiAuditChain {
  const prompt = truncateText(input.promptText, AI_AUDIT_PROMPT_MAX_CHARS);
  const rawOutput = truncateText(input.rawOutput, AI_AUDIT_RAW_OUTPUT_MAX_CHARS);
  const validationEvents = input.result?.events ?? [];
  return {
    playerAction: input.playerAction,
    requestContext: {
      context: input.context,
      promptText: prompt.text,
      promptTruncated: prompt.truncated,
    },
    provider: {
      source: input.providerSource,
      rawOutput: rawOutput.text,
      rawOutputTruncated: rawOutput.truncated,
      parsedDecision: input.decision,
      ...(input.providerTimings ? { timings: input.providerTimings } : {}),
      error: input.providerError,
    },
    validation: {
      ok: input.providerError ? false : Boolean(input.result?.ok),
      reason: input.providerError || input.result?.reason || input.decision?.audit.shortReason || '',
      events: validationEvents.map(aiAuditEventSummary),
    },
    delivered: {
      events: input.deliveredEvents.map(aiAuditEventSummary),
      textSummary: aiAuditDeliveredSummary(input.deliveredEvents),
    },
  };
}

function aiAuditPlayerActionFromContext(context: AiJobContextV1): AiAuditPlayerAction {
  const topic = context.topic ?? '';
  return {
    kind: context.trigger,
    topic,
    labelKey: aiAuditPlayerActionLabelKey(context.trigger, topic),
    locale: context.locale,
    protocol: {
      jobId: context.jobId,
      trigger: context.trigger,
      playerEntityId: context.player.entityId,
      entityKind: context.entity.kind,
      entityId: context.entity.entityId,
      templateId: context.entity.templateId,
    },
  };
}

function aiAuditPlayerActionLabelKey(trigger: string, topic: string): string {
  if (trigger === 'npc_gossip_opened') return 'usage.aiActionNpcGreeting';
  if (trigger === 'npc_question') {
    switch (topic) {
      case 'recent': return 'usage.aiActionNpcRecent';
      case 'rumor': return 'usage.aiActionNpcRumor';
      case 'place': return 'usage.aiActionNpcPlace';
      case 'quest_hint': return 'usage.aiActionNpcQuestHint';
      case 'greeting': return 'usage.aiActionNpcGreeting';
      default: return 'usage.aiActionNpcQuestion';
    }
  }
  if (trigger === 'object_inspected') return 'usage.aiActionObjectInspected';
  if (trigger === 'singularity_candidate') return 'usage.aiActionSingularityCandidate';
  if (trigger === 'pet_command') return 'usage.aiActionPetCommand';
  return 'usage.aiActionUnknown';
}

function aiAuditEventSummary(event: SimEvent): AiAuditEventSummary {
  const record = event as Record<string, unknown>;
  const speech = record.speech && typeof record.speech === 'object'
    ? record.speech as Record<string, unknown>
    : null;
  const reaction = record.reaction && typeof record.reaction === 'object'
    ? record.reaction as Record<string, unknown>
    : null;
  const raw = boundedJsonValue(event, AI_AUDIT_RAW_EVENT_MAX_CHARS);
  return {
    type: stringField(record.type),
    pid: nullableNumberField(record.pid),
    speakerId: nullableNumberField(record.speakerId),
    speakerName: stringField(record.speakerName),
    source: stringField(record.source),
    text: stringField(record.text),
    speechMode: stringField(speech?.mode),
    lineId: stringField(speech?.lineId),
    language: stringField(speech?.language),
    speechText: stringField(speech?.text),
    targetEntityId: nullableNumberField(reaction?.targetEntityId ?? record.targetId ?? record.entityId),
    targetObjectId: nullableNumberField(reaction?.targetObjectId),
    targetItemId: stringField(reaction?.targetItemId),
    reactionKind: stringField(reaction?.kind),
    raw: raw.value,
    rawTruncated: raw.truncated,
  };
}

function aiAuditDeliveredSummary(events: readonly SimEvent[]): string[] {
  return events
    .map(aiAuditEventText)
    .filter((text): text is string => Boolean(text))
    .slice(0, AI_AUDIT_TEXT_SUMMARY_MAX);
}

function aiAuditEventText(event: SimEvent): string | null {
  if (event.type === 'error') return event.text;
  if (event.type === 'loot') return event.text;
  if (event.type === 'aiSpeech') {
    if (event.speech.mode === 'dynamicText') return event.speech.text;
    return event.speech.lineId;
  }
  if (event.type === 'aiThinking') return `thinking:${event.speakerName}:${event.durationMs}`;
  return event.type;
}

function truncateText(value: string, maxLength: number): { text: string; truncated: boolean } {
  if (value.length <= maxLength) return { text: value, truncated: false };
  return { text: value.slice(0, maxLength), truncated: true };
}

function boundedJsonValue(value: unknown, maxLength: number): { value: unknown; truncated: boolean } {
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? '';
  } catch {
    serialized = String(value);
  }
  if (serialized.length <= maxLength) {
    try {
      return { value: JSON.parse(serialized), truncated: false };
    } catch {
      return { value: serialized, truncated: false };
    }
  }
  return {
    value: {
      truncatedJson: serialized.slice(0, maxLength),
      originalLength: serialized.length,
    },
    truncated: true,
  };
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableNumberField(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeNumber(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}
