import type { AiDecisionV1, AiJobContextV1, AiMemoryAuditRecord, AiValidationResult } from './ai_types';
import { cloneMemoryAudit } from './memory_audit';

export type AiDecisionJournalStatus = 'accepted' | 'rejected' | 'provider_error' | 'local_reaction';

export interface AiDecisionJournalEntry {
  sequence: number;
  jobId: string;
  trigger: AiJobContextV1['trigger'] | 'item_discarded' | 'scene_inspected' | 'encounter_memory' | 'quest_completed';
  entityId: number;
  templateId: string;
  playerEntityId: number;
  status: AiDecisionJournalStatus;
  reason?: string;
  lineIds: string[];
  intents: string[];
  sceneId?: string | null;
  memoryWrites: AiMemoryAuditRecord[];
}

type AiDecisionJournalLocalInput =
  Omit<AiDecisionJournalEntry, 'sequence' | 'status' | 'memoryWrites'>
  & { memoryWrites?: readonly AiMemoryAuditRecord[] };

export class AiDecisionJournal {
  private readonly limit: number;
  private readonly entries: AiDecisionJournalEntry[] = [];
  private sequence = 0;

  constructor(limit = 80) {
    this.limit = Math.max(1, Math.floor(limit));
  }

  recordDecision(
    context: AiJobContextV1,
    decision: AiDecisionV1,
    result: AiValidationResult,
    memoryWrites: readonly AiMemoryAuditRecord[] = [],
  ): void {
    this.push({
      sequence: ++this.sequence,
      jobId: context.jobId,
      trigger: context.trigger,
      entityId: context.entity.entityId,
      templateId: context.entity.templateId,
      playerEntityId: context.player.entityId,
      status: result.ok ? 'accepted' : 'rejected',
      reason: result.reason,
      lineIds: decision.speech.filter((speech) => speech.mode === 'lineId').map((speech) => speech.lineId),
      intents: decision.intents.map((intent) => intent.type),
      sceneId: context.scene?.subsceneId ?? context.scene?.zoneId ?? null,
      memoryWrites: memoryWrites.map(cloneMemoryAudit),
    });
  }

  recordProviderError(context: AiJobContextV1, reason: string, memoryWrites: readonly AiMemoryAuditRecord[] = []): void {
    this.push({
      sequence: ++this.sequence,
      jobId: context.jobId,
      trigger: context.trigger,
      entityId: context.entity.entityId,
      templateId: context.entity.templateId,
      playerEntityId: context.player.entityId,
      status: 'provider_error',
      reason,
      lineIds: [],
      intents: [],
      sceneId: context.scene?.subsceneId ?? context.scene?.zoneId ?? null,
      memoryWrites: memoryWrites.map(cloneMemoryAudit),
    });
  }

  recordLocalReaction(entry: AiDecisionJournalLocalInput): void {
    this.push({
      ...entry,
      sequence: ++this.sequence,
      status: 'local_reaction',
      memoryWrites: (entry.memoryWrites ?? []).map(cloneMemoryAudit),
    });
  }

  snapshot(): AiDecisionJournalEntry[] {
    return this.entries.map((entry) => ({
      ...entry,
      lineIds: [...entry.lineIds],
      intents: [...entry.intents],
      memoryWrites: entry.memoryWrites.map(cloneMemoryAudit),
    }));
  }

  clear(): number {
    const count = this.entries.length;
    this.entries.splice(0);
    return count;
  }

  private push(entry: AiDecisionJournalEntry): void {
    this.entries.push(entry);
    while (this.entries.length > this.limit) this.entries.shift();
  }
}
