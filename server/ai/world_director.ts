import type { Entity, SimEvent } from '../../src/sim/types';
import type { AiCreatureMemory } from './creature_memory';
import type { SceneFrameV1 } from './scene_frame';
import type { AiWorldTrace, AiWorldTraceKind } from './world_traces';

export type AiWorldDirectorMood = 'uncanny' | 'haunted' | 'hungry' | 'covetous' | 'stirred';
export type AiWorldDirectorProposalType = 'npcTopicShift' | 'campAlert' | 'traceEcho';

export type AiWorldDirectorLineId =
  | 'hudChrome.aiSpeech.worldDirectorUncanny'
  | 'hudChrome.aiSpeech.worldDirectorHaunted'
  | 'hudChrome.aiSpeech.worldDirectorHungry'
  | 'hudChrome.aiSpeech.worldDirectorCovetous'
  | 'hudChrome.aiSpeech.worldDirectorStirred';

export interface AiWorldDirectorState {
  stateId: string;
  sceneId: string;
  mood: AiWorldDirectorMood;
  proposalType: AiWorldDirectorProposalType;
  sourcePlayerEntityId: number;
  sourceRef: string;
  itemId: string;
  lineId: AiWorldDirectorLineId;
  heat: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  evidence: string[];
}

export interface AiWorldDirectorStoreOptions {
  stateTtlSeconds?: number;
  maxStates?: number;
}

export class AiWorldDirectorStore {
  private readonly states: AiWorldDirectorState[] = [];
  private readonly stateTtlSeconds: number;
  private readonly maxStates: number;
  private sequence = 0;

  constructor(options: AiWorldDirectorStoreOptions = {}) {
    this.stateTtlSeconds = Math.max(1, Math.floor(options.stateTtlSeconds ?? 180));
    this.maxStates = Math.max(1, Math.floor(options.maxStates ?? 24));
  }

  noteTrace(input: { trace: AiWorldTrace; nowSeconds: number }): AiWorldDirectorState {
    this.prune(input.nowSeconds);
    const mood = moodForTraceKind(input.trace.kind);
    return this.upsert({
      sceneId: input.trace.sceneId,
      mood,
      proposalType: proposalTypeForMood(mood),
      sourcePlayerEntityId: input.trace.sourcePlayerEntityId,
      sourceRef: input.trace.traceId,
      itemId: input.trace.itemId,
      heatGain: 0.35 + input.trace.strength * 0.65,
      evidence: [`trace:${input.trace.kind}`, ...input.trace.reasonLineIds.slice(0, 3)],
      nowSeconds: input.nowSeconds,
    });
  }

  noteCreatureMemory(input: {
    sceneId: string;
    itemId: string;
    memory: AiCreatureMemory;
    sourcePlayerEntityId: number;
    nowSeconds: number;
  }): AiWorldDirectorState | null {
    if (input.memory.interactionCount < 2) return null;
    this.prune(input.nowSeconds);
    return this.upsert({
      sceneId: input.sceneId,
      mood: 'uncanny',
      proposalType: 'campAlert',
      sourcePlayerEntityId: input.sourcePlayerEntityId,
      sourceRef: input.memory.memoryId,
      itemId: input.itemId,
      heatGain: Math.min(1, 0.4 + input.memory.interactionCount * 0.18),
      evidence: [`creatureMemory:${input.memory.templateId}`, ...input.memory.traits.slice(0, 3)],
      nowSeconds: input.nowSeconds,
    });
  }

  stateForScene(sceneId: string | null | undefined, playerEntityId: number, nowSeconds: number): AiWorldDirectorState | null {
    if (!sceneId) return null;
    this.prune(nowSeconds);
    const state = this.states.find((candidate) => candidate.sceneId === sceneId && candidate.sourcePlayerEntityId === playerEntityId);
    return state ? copyState(decayedState(state, nowSeconds, this.stateTtlSeconds)) : null;
  }

  snapshot(): AiWorldDirectorState[] {
    return this.states.map(copyState);
  }

  private upsert(input: {
    sceneId: string;
    mood: AiWorldDirectorMood;
    proposalType: AiWorldDirectorProposalType;
    sourcePlayerEntityId: number;
    sourceRef: string;
    itemId: string;
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
      return copyState(existing);
    }

    const state: AiWorldDirectorState = {
      stateId: `director-${++this.sequence}`,
      sceneId: input.sceneId,
      mood: input.mood,
      proposalType: input.proposalType,
      sourcePlayerEntityId: input.sourcePlayerEntityId,
      sourceRef: input.sourceRef,
      itemId: input.itemId,
      lineId: lineIdForMood(input.mood),
      heat: clamp01(input.heatGain),
      createdAt: input.nowSeconds,
      updatedAt: input.nowSeconds,
      expiresAt: input.nowSeconds + this.stateTtlSeconds,
      evidence: mergeRecent([], input.evidence, 8),
    };
    this.states.unshift(state);
    this.states.splice(this.maxStates);
    return copyState(state);
  }

  private prune(nowSeconds: number): void {
    for (let i = this.states.length - 1; i >= 0; i--) {
      if (this.states[i].expiresAt <= nowSeconds) this.states.splice(i, 1);
    }
  }
}

export function worldDirectorEvent(scene: SceneFrameV1 | null, speaker: Entity, state: AiWorldDirectorState | null, pid: number): SimEvent | null {
  if (!state) return null;
  return {
    type: 'aiSpeech',
    speakerId: speaker.id,
    speakerName: speaker.name,
    speech: {
      mode: 'lineId',
      lineId: state.lineId,
      values: {
        itemId: state.itemId,
        directorMood: state.mood,
        directorHeat: Math.round(state.heat * 100),
      },
    },
    source: 'fallback',
    reaction: {
      kind: state.mood === 'haunted' ? 'avoid' : 'inspect',
      targetItemId: state.itemId,
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
  }
}

function lineIdForMood(mood: AiWorldDirectorMood): AiWorldDirectorLineId {
  switch (mood) {
    case 'uncanny': return 'hudChrome.aiSpeech.worldDirectorUncanny';
    case 'haunted': return 'hudChrome.aiSpeech.worldDirectorHaunted';
    case 'hungry': return 'hudChrome.aiSpeech.worldDirectorHungry';
    case 'covetous': return 'hudChrome.aiSpeech.worldDirectorCovetous';
    case 'stirred': return 'hudChrome.aiSpeech.worldDirectorStirred';
  }
}

function decayedState(state: AiWorldDirectorState, nowSeconds: number, ttlSeconds: number): AiWorldDirectorState {
  const age = Math.max(0, nowSeconds - state.updatedAt);
  return {
    ...state,
    heat: Math.max(0.15, state.heat * (1 - age / ttlSeconds)),
    evidence: [...state.evidence],
  };
}

function mergeRecent(previous: readonly string[], next: readonly string[], limit: number): string[] {
  return [...next, ...previous.filter((value) => !next.includes(value))].slice(0, limit);
}

function copyState(state: AiWorldDirectorState): AiWorldDirectorState {
  return { ...state, evidence: [...state.evidence] };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
