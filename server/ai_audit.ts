import type { AiDecisionV1, AiJobContextV1, AiMemoryAuditRecord, AiValidationResult } from './ai/ai_types';

export const AI_AUDIT_WINDOWS = [
  { key: 'm1', labelKey: 'usage.window.1m', milliseconds: 60_000 },
  { key: 'm5', labelKey: 'usage.window.5m', milliseconds: 5 * 60_000 },
  { key: 'h1', labelKey: 'usage.window.1h', milliseconds: 60 * 60_000 },
  { key: 'h24', labelKey: 'usage.window.24h', milliseconds: 24 * 60 * 60_000 },
] as const;

export type AiAuditWindowKey = typeof AI_AUDIT_WINDOWS[number]['key'];
export type AiAuditStatus = 'accepted' | 'rejected' | 'provider_error' | 'local_reaction';
export type AiAuditProviderSource = 'codex' | 'fake' | 'fallback' | 'local' | 'provider';
export type AiAuditEntityKind = 'npc' | 'mob' | 'object' | 'system';

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
  if (record.status === 'provider_error' || record.providerSource === 'fallback') bucket.fallbacks = 1;
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

  resetForTests(): void {
    for (const window of AI_AUDIT_WINDOWS) this.windows[window.key] = newWindowCounters(window.key);
    this.totals = emptyBucket();
    this.lastInputTokens = 0;
    this.lastOutputTokens = 0;
    this.lastTotalTokens = 0;
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
    providerSource: providerError ? 'fallback' : input.providerSource,
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
      ? `providerErrorFallback:${input.decision?.audit.shortReason ?? 'no fallback decision'}`
      : input.result?.reason ?? input.decision?.audit.shortReason ?? '',
    error: providerError,
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

function safeNumber(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}
