import type { AiMemoryAuditRecord, AiMemoryAuditScope } from './ai_types';
import type { AiBossEncounterMemory } from './boss_memory';
import type { AiCreatureMemory } from './creature_memory';
import type { AiRumorMemory } from './social_memory';
import type { AiWorldDirectorState } from './world_director';
import type { AiWorldTrace } from './world_traces';

export function npcInteractionMemoryAudit(input: {
  playerEntityId: number;
  templateId: string;
  interactionCount: number;
  sceneId: string | null | undefined;
  lineIds?: readonly string[];
  reason: string;
  nowSeconds: number;
}): AiMemoryAuditRecord {
  return {
    kind: 'npcInteraction',
    refId: `npc:${input.playerEntityId}:${input.templateId}`,
    scope: 'entity',
    ...(input.sceneId ? { sceneId: input.sceneId } : {}),
    sourcePlayerEntityId: input.playerEntityId,
    templateId: input.templateId,
    lineIds: [...(input.lineIds ?? [])],
    salience: clamp01(0.2 + input.interactionCount * 0.12),
    createdAt: input.nowSeconds,
    reason: `${input.reason}:count:${input.interactionCount}`,
  };
}

export function rumorMemoryAudit(rumor: AiRumorMemory, reason: string): AiMemoryAuditRecord {
  return {
    kind: 'rumor',
    refId: rumor.rumorId,
    scope: rumor.scope,
    sceneId: rumor.sceneId,
    zoneId: rumor.zoneId,
    sourcePlayerEntityId: rumor.sourcePlayerEntityId,
    itemId: rumor.itemId,
    ...(rumor.questId ? { questId: rumor.questId } : {}),
    subjectKind: rumor.subjectKind,
    lineIds: [...rumor.lineIds],
    salience: clamp01(rumor.strength),
    createdAt: rumor.createdAt,
    expiresAt: rumor.expiresAt,
    reason,
  };
}

export function worldTraceMemoryAudit(trace: AiWorldTrace, reason: string): AiMemoryAuditRecord {
  return {
    kind: 'worldTrace',
    refId: trace.traceId,
    scope: 'scene',
    sceneId: trace.sceneId,
    zoneId: trace.zoneId,
    sourcePlayerEntityId: trace.sourcePlayerEntityId,
    itemId: trace.itemId,
    subjectKind: 'item',
    lineIds: [trace.lineId, ...trace.reasonLineIds],
    salience: clamp01(trace.strength),
    createdAt: trace.createdAt,
    expiresAt: trace.expiresAt,
    reason,
  };
}

export function creatureMemoryAudit(input: {
  memory: AiCreatureMemory;
  sceneId: string;
  itemId?: string;
  reason: string;
}): AiMemoryAuditRecord {
  return {
    kind: 'creatureMemory',
    refId: input.memory.memoryId,
    scope: 'entity',
    sceneId: input.sceneId,
    sourcePlayerEntityId: input.memory.playerEntityId,
    entityId: input.memory.entityId,
    templateId: input.memory.templateId,
    ...(input.itemId ? { itemId: input.itemId } : {}),
    lineIds: [],
    salience: clamp01(0.25 + input.memory.interactionCount * 0.16),
    createdAt: input.memory.firstSeenAt,
    expiresAt: input.memory.expiresAt,
    reason: `${input.reason}:${input.memory.traits.slice(0, 3).join('/') || 'no-traits'}`,
  };
}

export function bossMemoryAudit(memory: AiBossEncounterMemory, reason: string): AiMemoryAuditRecord {
  return {
    kind: 'bossMemory',
    refId: memory.memoryId,
    scope: 'encounter',
    sceneId: memory.sceneId,
    sourcePlayerEntityId: memory.sourcePlayerEntityId,
    entityId: memory.entityId,
    templateId: memory.templateId,
    itemId: memory.templateId,
    subjectKind: 'encounter',
    lineIds: [memory.lineId],
    salience: clamp01(memory.heat),
    createdAt: memory.createdAt,
    expiresAt: memory.expiresAt,
    reason: `${reason}:${memory.outcome}:${memory.scale}`,
  };
}

export function worldDirectorMemoryAudit(state: AiWorldDirectorState, reason: string): AiMemoryAuditRecord {
  return {
    kind: 'worldDirectorState',
    refId: state.stateId,
    scope: directorScope(state.proposalType),
    sceneId: state.sceneId,
    zoneId: state.zoneId,
    sourcePlayerEntityId: state.sourcePlayerEntityId,
    itemId: state.itemId,
    ...(state.subjectTemplateId ? { templateId: state.subjectTemplateId } : {}),
    subjectKind: state.subjectKind,
    lineIds: [state.lineId],
    salience: clamp01(state.heat),
    createdAt: state.createdAt,
    expiresAt: state.expiresAt,
    reason: `${reason}:${state.mood}:${state.proposalType}`,
  };
}

export function cloneMemoryAudit(record: AiMemoryAuditRecord): AiMemoryAuditRecord {
  return { ...record, lineIds: [...record.lineIds] };
}

function directorScope(proposalType: AiWorldDirectorState['proposalType']): AiMemoryAuditScope {
  return proposalType === 'encounterEcho' ? 'encounter' : 'region';
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
