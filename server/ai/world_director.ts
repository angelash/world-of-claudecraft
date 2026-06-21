import type { Entity, SimEvent } from '../../src/sim/types';
import type { AiMemoryAuditRecord } from './ai_types';
import type { AiBossEncounterMemory } from './boss_memory';
import type { AiCreatureMemory, AiCreaturePlan } from './creature_memory';
import type { SceneFrameV1 } from './scene_frame';
import type { AiWorldTrace, AiWorldTraceKind } from './world_traces';

export type AiWorldDirectorMood = 'uncanny' | 'haunted' | 'hungry' | 'covetous' | 'stirred' | 'triumphant' | 'dread' | 'relieved';
export type AiWorldDirectorProposalType = 'npcTopicShift' | 'campAlert' | 'traceEcho' | 'encounterEcho' | 'questEcho';
export type AiWorldDirectorProposalIntent =
  | 'nudgeNpcRumor'
  | 'raiseCampCaution'
  | 'echoTrace'
  | 'echoEncounterMemory'
  | 'echoQuestRelief';

export type AiWorldDirectorLineId =
  | 'hudChrome.aiSpeech.worldDirectorUncanny'
  | 'hudChrome.aiSpeech.worldDirectorSceneUncanny'
  | 'hudChrome.aiSpeech.worldDirectorHaunted'
  | 'hudChrome.aiSpeech.worldDirectorHungry'
  | 'hudChrome.aiSpeech.worldDirectorCovetous'
  | 'hudChrome.aiSpeech.worldDirectorStirred'
  | 'hudChrome.aiSpeech.worldDirectorBossDefeated'
  | 'hudChrome.aiSpeech.worldDirectorBossWipe'
  | 'hudChrome.aiSpeech.worldDirectorQuestComplete';

export interface AiWorldDirectorState {
  stateId: string;
  sceneId: string;
  zoneId: string;
  mood: AiWorldDirectorMood;
  proposalType: AiWorldDirectorProposalType;
  sourcePlayerEntityId: number;
  sourceRef: string;
  itemId: string;
  subjectKind: 'item' | 'encounter' | 'quest' | 'scene';
  subjectTemplateId?: string;
  subjectName?: string;
  lineId: AiWorldDirectorLineId;
  heat: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  evidence: string[];
  proposal: AiWorldDirectorProposal;
}

export interface AiWorldDirectorProposal {
  proposalId: string;
  intent: AiWorldDirectorProposalIntent;
  status: 'preview';
  risk: 'low';
  intensity: number;
  targetRef: string;
  sceneId: string;
  zoneId: string;
  suggestedLineId: AiWorldDirectorLineId;
  expiresAt: number;
  reasonTags: string[];
  safetyNotes: string[];
}

export type AiWorldDirectorProposalAuditLifecycle = 'created' | 'refreshed' | 'expired' | 'evicted';

export interface AiWorldDirectorProposalAuditEntry {
  auditId: string;
  lifecycle: AiWorldDirectorProposalAuditLifecycle;
  observedAt: number;
  stateId: string;
  proposalId: string;
  sourcePlayerEntityId: number;
  sourceRef: string;
  mood: AiWorldDirectorMood;
  proposalType: AiWorldDirectorProposalType;
  subjectKind: AiWorldDirectorState['subjectKind'];
  targetRef: string;
  sceneId: string;
  zoneId: string;
  intent: AiWorldDirectorProposalIntent;
  status: AiWorldDirectorProposal['status'];
  risk: AiWorldDirectorProposal['risk'];
  intensity: number;
  suggestedLineId: AiWorldDirectorLineId;
  expiresAt: number;
  reasonTags: string[];
  safetyNotes: string[];
}

export interface AiWorldDirectorStoreOptions {
  stateTtlSeconds?: number;
  maxStates?: number;
  maxProposalAuditEntries?: number;
}

const ADJACENT_ZONE_IDS: Record<string, readonly string[]> = {
  eastbrook_vale: ['mirefen_marsh'],
  mirefen_marsh: ['eastbrook_vale', 'thornpeak_heights'],
  thornpeak_heights: ['mirefen_marsh'],
};

const ADJACENT_ZONE_INTENSITY_SCALE = 0.35;

export class AiWorldDirectorStore {
  private readonly states: AiWorldDirectorState[] = [];
  private readonly proposalAuditEntries: AiWorldDirectorProposalAuditEntry[] = [];
  private readonly stateTtlSeconds: number;
  private readonly maxStates: number;
  private readonly maxProposalAuditEntries: number;
  private sequence = 0;
  private proposalAuditSequence = 0;

  constructor(options: AiWorldDirectorStoreOptions = {}) {
    this.stateTtlSeconds = Math.max(1, Math.floor(options.stateTtlSeconds ?? 180));
    this.maxStates = Math.max(1, Math.floor(options.maxStates ?? 24));
    this.maxProposalAuditEntries = Math.max(1, Math.floor(options.maxProposalAuditEntries ?? 64));
  }

  noteTrace(input: { trace: AiWorldTrace; nowSeconds: number }): AiWorldDirectorState {
    this.prune(input.nowSeconds);
    const mood = moodForTraceKind(input.trace.kind);
    return this.upsert({
      sceneId: input.trace.sceneId,
      zoneId: input.trace.zoneId,
      mood,
      proposalType: proposalTypeForMood(mood),
      sourcePlayerEntityId: input.trace.sourcePlayerEntityId,
      sourceRef: input.trace.traceId,
      itemId: input.trace.itemId,
      subjectKind: 'item',
      subjectName: input.trace.itemDisplayName,
      heatGain: 0.35 + input.trace.strength * 0.65,
      evidence: [`trace:${input.trace.kind}`, ...input.trace.reasonLineIds.slice(0, 3)],
      nowSeconds: input.nowSeconds,
    });
  }

  noteCreatureMemory(input: {
    sceneId: string;
    itemId: string;
    memory: AiCreatureMemory;
    plan?: AiCreaturePlan | null;
    sourcePlayerEntityId: number;
    nowSeconds: number;
  }): AiWorldDirectorState | null {
    if (input.memory.interactionCount < 2) return null;
    this.prune(input.nowSeconds);
    return this.upsert({
      sceneId: input.sceneId,
      zoneId: input.sceneId,
      mood: 'uncanny',
      proposalType: 'campAlert',
      sourcePlayerEntityId: input.sourcePlayerEntityId,
      sourceRef: input.memory.memoryId,
      itemId: input.itemId,
      subjectKind: 'item',
      heatGain: Math.min(1, 0.4 + input.memory.interactionCount * 0.18),
      evidence: creatureMemoryEvidence(input.memory, input.plan),
      nowSeconds: input.nowSeconds,
    });
  }

  noteCreatureSceneMemory(input: {
    sceneId: string;
    zoneId: string;
    memory: AiCreatureMemory;
    plan?: AiCreaturePlan | null;
    sourcePlayerEntityId: number;
    nowSeconds: number;
  }): AiWorldDirectorState | null {
    if (input.memory.interactionCount < 2) return null;
    this.prune(input.nowSeconds);
    return this.upsert({
      sceneId: input.sceneId,
      zoneId: input.zoneId,
      mood: 'uncanny',
      proposalType: 'campAlert',
      sourcePlayerEntityId: input.sourcePlayerEntityId,
      sourceRef: `scene:${input.memory.memoryId}`,
      itemId: input.sceneId,
      subjectKind: 'scene',
      lineId: 'hudChrome.aiSpeech.worldDirectorSceneUncanny',
      heatGain: Math.min(1, 0.35 + input.memory.interactionCount * 0.16),
      evidence: creatureMemoryEvidence(input.memory, input.plan, 'creatureSceneMemory'),
      nowSeconds: input.nowSeconds,
    });
  }

  noteBossMemory(input: { memory: AiBossEncounterMemory; nowSeconds: number }): AiWorldDirectorState {
    this.prune(input.nowSeconds);
    const mood: AiWorldDirectorMood = input.memory.outcome === 'defeated' ? 'triumphant' : 'dread';
    return this.upsert({
      sceneId: input.memory.sceneId,
      zoneId: input.memory.sceneId,
      mood,
      proposalType: 'encounterEcho',
      sourcePlayerEntityId: input.memory.sourcePlayerEntityId,
      sourceRef: input.memory.memoryId,
      itemId: input.memory.templateId,
      subjectKind: 'encounter',
      subjectTemplateId: input.memory.templateId,
      subjectName: input.memory.entityName,
      heatGain: input.memory.heat,
      evidence: [`bossMemory:${input.memory.outcome}`, `scale:${input.memory.scale}`, ...input.memory.evidence.slice(0, 3)],
      nowSeconds: input.nowSeconds,
    });
  }

  noteQuestCompletion(input: {
    sceneId: string;
    zoneId: string;
    questId: string;
    sourcePlayerEntityId: number;
    nowSeconds: number;
  }): AiWorldDirectorState {
    this.prune(input.nowSeconds);
    return this.upsert({
      sceneId: input.sceneId,
      zoneId: input.zoneId,
      mood: 'relieved',
      proposalType: 'questEcho',
      sourcePlayerEntityId: input.sourcePlayerEntityId,
      sourceRef: `questDone:${input.questId}`,
      itemId: input.questId,
      subjectKind: 'quest',
      heatGain: 0.55,
      evidence: [`questDone:${input.questId}`],
      nowSeconds: input.nowSeconds,
    });
  }

  stateForScene(sceneId: string | null | undefined, playerEntityId: number, nowSeconds: number): AiWorldDirectorState | null {
    if (!sceneId) return null;
    this.prune(nowSeconds);
    const state = this.states.find((candidate) => candidate.sceneId === sceneId && candidate.sourcePlayerEntityId === playerEntityId);
    return state ? copyState(decayedState(state, nowSeconds, this.stateTtlSeconds)) : null;
  }

  stateForRegion(input: {
    zoneId: string | null | undefined;
    sceneId?: string | null;
    playerEntityId: number;
    nowSeconds: number;
    includeAdjacentZones?: boolean;
  }): AiWorldDirectorState | null {
    if (!input.zoneId) return null;
    this.prune(input.nowSeconds);
    const state = this.states.find((candidate) =>
      candidate.zoneId === input.zoneId
      && candidate.sourcePlayerEntityId === input.playerEntityId
      && candidate.sceneId !== input.sceneId
    );
    if (state) return copyState(decayedState(state, input.nowSeconds, this.stateTtlSeconds));
    if (!input.includeAdjacentZones) return null;
    const adjacentState = this.states.find((candidate) =>
      candidate.sourcePlayerEntityId === input.playerEntityId
      && candidate.sceneId !== input.sceneId
      && zonesAreAdjacent(candidate.zoneId, input.zoneId!));
    return adjacentState
      ? copyState(adjacentZoneState(decayedState(adjacentState, input.nowSeconds, this.stateTtlSeconds), input.zoneId))
      : null;
  }

  snapshot(): AiWorldDirectorState[] {
    return this.states.map(copyState);
  }

  proposalAuditSnapshot(): AiWorldDirectorProposalAuditEntry[] {
    return this.proposalAuditEntries.map(copyProposalAuditEntry);
  }

  clearStates(nowSeconds: number): number {
    const count = this.states.length;
    for (const state of this.states) this.recordProposalAudit(state, 'evicted', nowSeconds);
    this.states.splice(0);
    return count;
  }

  private upsert(input: {
    sceneId: string;
    zoneId?: string;
    mood: AiWorldDirectorMood;
    proposalType: AiWorldDirectorProposalType;
    sourcePlayerEntityId: number;
    sourceRef: string;
    itemId: string;
    subjectKind: 'item' | 'encounter' | 'quest' | 'scene';
    lineId?: AiWorldDirectorLineId;
    subjectTemplateId?: string;
    subjectName?: string;
    heatGain: number;
    evidence: string[];
    nowSeconds: number;
  }): AiWorldDirectorState {
    const existing = this.states.find((candidate) =>
      candidate.sceneId === input.sceneId
      && candidate.sourcePlayerEntityId === input.sourcePlayerEntityId
      && candidate.mood === input.mood
      && candidate.itemId === input.itemId,
    );
    if (existing) {
      existing.heat = clamp01(existing.heat + input.heatGain * 0.35);
      existing.updatedAt = input.nowSeconds;
      existing.expiresAt = input.nowSeconds + this.stateTtlSeconds;
      existing.evidence = mergeRecent(existing.evidence, input.evidence, 8);
      existing.proposal = proposalForState(existing);
      this.recordProposalAudit(existing, 'refreshed', input.nowSeconds);
      return copyState(existing);
    }

    const stateCore: Omit<AiWorldDirectorState, 'proposal'> = {
      stateId: `director-${++this.sequence}`,
      sceneId: input.sceneId,
      zoneId: input.zoneId ?? input.sceneId,
      mood: input.mood,
      proposalType: input.proposalType,
      sourcePlayerEntityId: input.sourcePlayerEntityId,
      sourceRef: input.sourceRef,
      itemId: input.itemId,
      subjectKind: input.subjectKind,
      ...(input.subjectTemplateId ? { subjectTemplateId: input.subjectTemplateId } : {}),
      ...(input.subjectName ? { subjectName: input.subjectName } : {}),
      lineId: input.lineId ?? lineIdForMood(input.mood),
      heat: clamp01(input.heatGain),
      createdAt: input.nowSeconds,
      updatedAt: input.nowSeconds,
      expiresAt: input.nowSeconds + this.stateTtlSeconds,
      evidence: mergeRecent([], input.evidence, 8),
    };
    const state: AiWorldDirectorState = { ...stateCore, proposal: proposalForState(stateCore) };
    this.states.unshift(state);
    this.recordProposalAudit(state, 'created', input.nowSeconds);
    for (const evicted of this.states.splice(this.maxStates)) {
      this.recordProposalAudit(evicted, 'evicted', input.nowSeconds);
    }
    return copyState(state);
  }

  private prune(nowSeconds: number): void {
    for (let i = this.states.length - 1; i >= 0; i--) {
      if (this.states[i].expiresAt <= nowSeconds) {
        this.recordProposalAudit(this.states[i], 'expired', nowSeconds);
        this.states.splice(i, 1);
      }
    }
  }

  private recordProposalAudit(
    state: AiWorldDirectorState,
    lifecycle: AiWorldDirectorProposalAuditLifecycle,
    observedAt: number,
  ): void {
    this.proposalAuditEntries.unshift({
      auditId: `director-audit-${++this.proposalAuditSequence}`,
      lifecycle,
      observedAt,
      stateId: state.stateId,
      proposalId: state.proposal.proposalId,
      sourcePlayerEntityId: state.sourcePlayerEntityId,
      sourceRef: state.sourceRef,
      mood: state.mood,
      proposalType: state.proposalType,
      subjectKind: state.subjectKind,
      targetRef: state.proposal.targetRef,
      sceneId: state.proposal.sceneId,
      zoneId: state.proposal.zoneId,
      intent: state.proposal.intent,
      status: state.proposal.status,
      risk: state.proposal.risk,
      intensity: state.proposal.intensity,
      suggestedLineId: state.proposal.suggestedLineId,
      expiresAt: state.proposal.expiresAt,
      reasonTags: [...state.proposal.reasonTags],
      safetyNotes: [...state.proposal.safetyNotes],
    });
    this.proposalAuditEntries.splice(this.maxProposalAuditEntries);
  }
}

export function worldDirectorEvent(scene: SceneFrameV1 | null, speaker: Entity, state: AiWorldDirectorState | null, pid: number): SimEvent | null {
  if (!state) return null;
  const encounter = state.subjectKind === 'encounter';
  const quest = state.subjectKind === 'quest';
  const sceneSubject = state.subjectKind === 'scene';
  return {
    type: 'aiSpeech',
    speakerId: speaker.id,
    speakerName: speaker.name,
    speech: {
      mode: 'lineId',
      lineId: state.lineId,
      values: {
        ...(quest ? { questId: state.itemId } : sceneSubject ? { sceneId: state.sceneId } : { itemId: state.itemId }),
        ...(state.subjectName ? { itemName: state.subjectName } : {}),
        ...(encounter ? {
          bossTemplateId: state.subjectTemplateId ?? state.itemId,
          bossName: state.subjectName ?? state.itemId,
        } : {}),
        directorMood: state.mood,
        directorHeat: Math.round(state.heat * 100),
      },
    },
    source: 'fallback',
    reaction: {
      kind: state.mood === 'haunted' || state.mood === 'dread' ? 'avoid' : 'inspect',
      ...(encounter || quest || sceneSubject ? {} : { targetItemId: state.itemId }),
      score: Math.round(state.heat * 100) / 100,
      sceneTags: scene ? [...new Set([
        ...scene.locationTags,
        ...scene.structureTags,
        ...scene.environmentalTags,
        `director:${state.mood}`,
      ])].slice(0, 8) : [`director:${state.mood}`],
    },
    pid,
  };
}

export function worldDirectorEventFromMemoryAudit(
  scene: SceneFrameV1 | null,
  speaker: Entity,
  record: AiMemoryAuditRecord | null,
  pid: number,
): SimEvent | null {
  if (!record || record.kind !== 'worldDirectorState') return null;
  const lineId = record.lineIds.find(isWorldDirectorLineId);
  if (!lineId) return null;
  const mood = moodFromAuditReason(record.reason) ?? moodForLineId(lineId);
  const encounter = record.subjectKind === 'encounter';
  const quest = record.subjectKind === 'quest';
  const sceneSubject = record.subjectKind === 'scene';
  const subjectId = quest
    ? record.questId || record.itemId
    : sceneSubject
      ? record.sceneId || record.itemId
      : record.itemId || record.templateId;
  if (!subjectId) return null;
  return {
    type: 'aiSpeech',
    speakerId: speaker.id,
    speakerName: speaker.name,
    speech: {
      mode: 'lineId',
      lineId,
      values: {
        ...(quest ? { questId: subjectId } : sceneSubject ? { sceneId: subjectId } : { itemId: subjectId }),
        ...(encounter ? {
          bossTemplateId: record.templateId || record.itemId || subjectId,
          bossName: record.templateId || record.itemId || subjectId,
        } : {}),
        directorMood: mood,
        directorHeat: Math.round(record.salience * 100),
      },
    },
    source: 'fallback',
    reaction: {
      kind: mood === 'haunted' || mood === 'dread' ? 'avoid' : 'inspect',
      ...(encounter || quest || sceneSubject ? {} : { targetItemId: subjectId }),
      score: Math.round(record.salience * 100) / 100,
      sceneTags: scene ? [...new Set([
        `director:${mood}`,
        'persistedMemory',
        ...scene.locationTags,
        ...scene.structureTags,
        ...scene.environmentalTags,
      ])].slice(0, 8) : [`director:${mood}`, 'persistedMemory'],
    },
    pid,
  };
}

export function worldDirectorProposalFromMemoryAudit(record: AiMemoryAuditRecord | null): AiWorldDirectorProposal | null {
  if (!record || record.kind !== 'worldDirectorState') return null;
  const lineId = record.lineIds.find(isWorldDirectorLineId);
  if (!lineId) return null;
  const mood = moodFromAuditReason(record.reason) ?? moodForLineId(lineId);
  const proposalType = proposalTypeFromAuditReason(record.reason) ?? proposalTypeForMood(mood);
  const targetRef = record.questId || record.itemId || record.templateId || record.sceneId;
  const sceneId = record.sceneId ?? record.zoneId ?? '';
  const zoneId = record.zoneId ?? sceneId;
  if (!targetRef || !sceneId || !zoneId) return null;
  const stateLike: Omit<AiWorldDirectorState, 'proposal'> = {
    stateId: record.refId,
    sceneId,
    zoneId,
    mood,
    proposalType,
    sourcePlayerEntityId: record.sourcePlayerEntityId,
    sourceRef: record.refId,
    itemId: targetRef,
    subjectKind: record.subjectKind ?? 'item',
    ...(record.templateId ? { subjectTemplateId: record.templateId } : {}),
    lineId,
    heat: clamp01(record.salience),
    createdAt: record.createdAt ?? 0,
    updatedAt: record.createdAt ?? 0,
    expiresAt: record.expiresAt ?? Number.MAX_SAFE_INTEGER,
    evidence: ['persistedMemory', record.reason],
  };
  return {
    ...proposalForState(stateLike),
    proposalId: `${record.refId}:persisted-proposal`,
  };
}

export function moodForTraceKind(kind: AiWorldTraceKind): AiWorldDirectorMood {
  switch (kind) {
    case 'singularity': return 'uncanny';
    case 'cursed': return 'haunted';
    case 'food': return 'hungry';
    case 'valuable': return 'covetous';
    case 'generic': return 'stirred';
  }
}

function proposalTypeForMood(mood: AiWorldDirectorMood): AiWorldDirectorProposalType {
  switch (mood) {
    case 'haunted': return 'campAlert';
    case 'uncanny': return 'campAlert';
    case 'hungry': return 'traceEcho';
    case 'covetous': return 'npcTopicShift';
    case 'stirred': return 'traceEcho';
    case 'triumphant': return 'encounterEcho';
    case 'dread': return 'encounterEcho';
    case 'relieved': return 'questEcho';
  }
}

function lineIdForMood(mood: AiWorldDirectorMood): AiWorldDirectorLineId {
  switch (mood) {
    case 'uncanny': return 'hudChrome.aiSpeech.worldDirectorUncanny';
    case 'haunted': return 'hudChrome.aiSpeech.worldDirectorHaunted';
    case 'hungry': return 'hudChrome.aiSpeech.worldDirectorHungry';
    case 'covetous': return 'hudChrome.aiSpeech.worldDirectorCovetous';
    case 'stirred': return 'hudChrome.aiSpeech.worldDirectorStirred';
    case 'triumphant': return 'hudChrome.aiSpeech.worldDirectorBossDefeated';
    case 'dread': return 'hudChrome.aiSpeech.worldDirectorBossWipe';
    case 'relieved': return 'hudChrome.aiSpeech.worldDirectorQuestComplete';
  }
}

function isWorldDirectorLineId(value: string): value is AiWorldDirectorLineId {
  switch (value) {
    case 'hudChrome.aiSpeech.worldDirectorUncanny':
    case 'hudChrome.aiSpeech.worldDirectorSceneUncanny':
    case 'hudChrome.aiSpeech.worldDirectorHaunted':
    case 'hudChrome.aiSpeech.worldDirectorHungry':
    case 'hudChrome.aiSpeech.worldDirectorCovetous':
    case 'hudChrome.aiSpeech.worldDirectorStirred':
    case 'hudChrome.aiSpeech.worldDirectorBossDefeated':
    case 'hudChrome.aiSpeech.worldDirectorBossWipe':
    case 'hudChrome.aiSpeech.worldDirectorQuestComplete':
      return true;
    default:
      return false;
  }
}

function moodForLineId(lineId: AiWorldDirectorLineId): AiWorldDirectorMood {
  switch (lineId) {
    case 'hudChrome.aiSpeech.worldDirectorUncanny':
    case 'hudChrome.aiSpeech.worldDirectorSceneUncanny':
      return 'uncanny';
    case 'hudChrome.aiSpeech.worldDirectorHaunted':
      return 'haunted';
    case 'hudChrome.aiSpeech.worldDirectorHungry':
      return 'hungry';
    case 'hudChrome.aiSpeech.worldDirectorCovetous':
      return 'covetous';
    case 'hudChrome.aiSpeech.worldDirectorStirred':
      return 'stirred';
    case 'hudChrome.aiSpeech.worldDirectorBossDefeated':
      return 'triumphant';
    case 'hudChrome.aiSpeech.worldDirectorBossWipe':
      return 'dread';
    case 'hudChrome.aiSpeech.worldDirectorQuestComplete':
      return 'relieved';
  }
}

function moodFromAuditReason(reason: string): AiWorldDirectorMood | null {
  const match = /:([a-z]+):(?:npcTopicShift|campAlert|traceEcho|encounterEcho|questEcho)$/.exec(reason);
  const mood = match?.[1] ?? '';
  switch (mood) {
    case 'uncanny':
    case 'haunted':
    case 'hungry':
    case 'covetous':
    case 'stirred':
    case 'triumphant':
    case 'dread':
    case 'relieved':
      return mood;
    default:
      return null;
  }
}

function proposalTypeFromAuditReason(reason: string): AiWorldDirectorProposalType | null {
  const match = /:(npcTopicShift|campAlert|traceEcho|encounterEcho|questEcho)$/.exec(reason);
  const proposalType = match?.[1] ?? '';
  switch (proposalType) {
    case 'npcTopicShift':
    case 'campAlert':
    case 'traceEcho':
    case 'encounterEcho':
    case 'questEcho':
      return proposalType;
    default:
      return null;
  }
}

function creatureMemoryEvidence(
  memory: AiCreatureMemory,
  plan: AiCreaturePlan | null | undefined,
  prefix = 'creatureMemory',
): string[] {
  return [
    `${prefix}:${memory.templateId}`,
    ...memory.traits.slice(0, 3),
    ...(plan ? [`creaturePlan:${plan.kind}`, ...plan.evidence.slice(0, 3)] : []),
  ];
}

function decayedState(state: AiWorldDirectorState, nowSeconds: number, ttlSeconds: number): AiWorldDirectorState {
  const heat = Math.max(0.15, state.heat * (1 - Math.max(0, nowSeconds - state.updatedAt) / ttlSeconds));
  const decayed = {
    ...state,
    heat,
    evidence: [...state.evidence],
    proposal: copyProposal(state.proposal),
  };
  decayed.proposal = {
    ...decayed.proposal,
    intensity: Math.round(heat * 100) / 100,
  };
  return decayed;
}

function adjacentZoneState(state: AiWorldDirectorState, targetZoneId: string): AiWorldDirectorState {
  const heat = Math.max(0.05, Math.round(state.heat * ADJACENT_ZONE_INTENSITY_SCALE * 100) / 100);
  const evidence = mergeRecent(state.evidence, [`adjacentZone:${state.zoneId}->${targetZoneId}`], 8);
  const adjacent: AiWorldDirectorState = {
    ...state,
    heat,
    evidence,
    proposal: copyProposal(state.proposal),
  };
  adjacent.proposal = {
    ...proposalForState(adjacent),
    proposalId: `${state.stateId}:adjacent:${targetZoneId}:proposal`,
  };
  return adjacent;
}

function zonesAreAdjacent(sourceZoneId: string, targetZoneId: string): boolean {
  return ADJACENT_ZONE_IDS[sourceZoneId]?.includes(targetZoneId) ?? false;
}

function mergeRecent(previous: readonly string[], next: readonly string[], limit: number): string[] {
  return [...next, ...previous.filter((value) => !next.includes(value))].slice(0, limit);
}

function copyState(state: AiWorldDirectorState): AiWorldDirectorState {
  return { ...state, evidence: [...state.evidence], proposal: copyProposal(state.proposal) };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function proposalForState(state: Omit<AiWorldDirectorState, 'proposal'>): AiWorldDirectorProposal {
  return {
    proposalId: `${state.stateId}:proposal`,
    intent: proposalIntentForState(state),
    status: 'preview',
    risk: 'low',
    intensity: Math.round(state.heat * 100) / 100,
    targetRef: state.itemId,
    sceneId: state.sceneId,
    zoneId: state.zoneId,
    suggestedLineId: state.lineId,
    expiresAt: state.expiresAt,
    reasonTags: proposalReasonTags(state),
    safetyNotes: [
      'presentationOnly',
      'noQuestMutation',
      'noCombatMutation',
      'noLootOrEconomyMutation',
    ],
  };
}

function proposalIntentForState(state: Omit<AiWorldDirectorState, 'proposal'>): AiWorldDirectorProposalIntent {
  switch (state.proposalType) {
    case 'npcTopicShift': return 'nudgeNpcRumor';
    case 'campAlert': return 'raiseCampCaution';
    case 'traceEcho': return 'echoTrace';
    case 'encounterEcho': return 'echoEncounterMemory';
    case 'questEcho': return 'echoQuestRelief';
  }
}

function proposalReasonTags(state: Omit<AiWorldDirectorState, 'proposal'>): string[] {
  return [...new Set([
    `mood:${state.mood}`,
    `subject:${state.subjectKind}`,
    `proposal:${state.proposalType}`,
    ...state.evidence,
  ])].slice(0, 8);
}

function copyProposal(proposal: AiWorldDirectorProposal): AiWorldDirectorProposal {
  return {
    ...proposal,
    reasonTags: [...proposal.reasonTags],
    safetyNotes: [...proposal.safetyNotes],
  };
}

function copyProposalAuditEntry(entry: AiWorldDirectorProposalAuditEntry): AiWorldDirectorProposalAuditEntry {
  return {
    ...entry,
    reasonTags: [...entry.reasonTags],
    safetyNotes: [...entry.safetyNotes],
  };
}
