import { MOBS } from '../../src/sim/data';
import type { Entity, SimEvent } from '../../src/sim/types';

export type AiBossEncounterOutcome = 'defeated' | 'wipe';
export type AiBossEncounterScale = 'boss' | 'elite' | 'rare';

export type AiBossEncounterLineId =
  | 'hudChrome.aiSpeech.bossMemoryDefeated'
  | 'hudChrome.aiSpeech.bossMemoryWipe';

export interface AiBossEncounterMemory {
  memoryId: string;
  sceneId: string;
  templateId: string;
  entityId: number;
  entityName: string;
  scale: AiBossEncounterScale;
  outcome: AiBossEncounterOutcome;
  sourcePlayerEntityId: number;
  lineId: AiBossEncounterLineId;
  heat: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  evidence: string[];
}

export interface AiBossEncounterMemoryStoreOptions {
  memoryTtlSeconds?: number;
  maxMemories?: number;
}

export class AiBossEncounterMemoryStore {
  private readonly memories: AiBossEncounterMemory[] = [];
  private readonly memoryTtlSeconds: number;
  private readonly maxMemories: number;
  private sequence = 0;

  constructor(options: AiBossEncounterMemoryStoreOptions = {}) {
    this.memoryTtlSeconds = Math.max(1, Math.floor(options.memoryTtlSeconds ?? 300));
    this.maxMemories = Math.max(1, Math.floor(options.maxMemories ?? 24));
  }

  noteEncounter(input: {
    sceneId: string;
    entity: Entity;
    scale: AiBossEncounterScale;
    outcome: AiBossEncounterOutcome;
    sourcePlayerEntityId: number;
    nowSeconds: number;
    evidence: string[];
  }): AiBossEncounterMemory {
    this.prune(input.nowSeconds);
    const existing = this.memories.find((candidate) =>
      candidate.sceneId === input.sceneId
      && candidate.templateId === input.entity.templateId
      && candidate.sourcePlayerEntityId === input.sourcePlayerEntityId
      && candidate.outcome === input.outcome,
    );
    if (existing) {
      existing.entityId = input.entity.id;
      existing.entityName = input.entity.name;
      existing.scale = input.scale;
      existing.heat = clamp01(existing.heat + heatFor(input.scale, input.outcome) * 0.35);
      existing.updatedAt = input.nowSeconds;
      existing.expiresAt = input.nowSeconds + this.memoryTtlSeconds;
      existing.evidence = mergeRecent(existing.evidence, input.evidence, 8);
      return copyMemory(existing);
    }

    const memory: AiBossEncounterMemory = {
      memoryId: `boss-memory-${++this.sequence}`,
      sceneId: input.sceneId,
      templateId: input.entity.templateId,
      entityId: input.entity.id,
      entityName: input.entity.name,
      scale: input.scale,
      outcome: input.outcome,
      sourcePlayerEntityId: input.sourcePlayerEntityId,
      lineId: lineIdForOutcome(input.outcome),
      heat: heatFor(input.scale, input.outcome),
      createdAt: input.nowSeconds,
      updatedAt: input.nowSeconds,
      expiresAt: input.nowSeconds + this.memoryTtlSeconds,
      evidence: mergeRecent([], input.evidence, 8),
    };
    this.memories.unshift(memory);
    this.memories.splice(this.maxMemories);
    return copyMemory(memory);
  }

  memoryForScene(sceneId: string | null | undefined, playerEntityId: number, nowSeconds: number): AiBossEncounterMemory | null {
    if (!sceneId) return null;
    this.prune(nowSeconds);
    const memory = this.memories.find((candidate) => candidate.sceneId === sceneId && candidate.sourcePlayerEntityId === playerEntityId);
    if (!memory) return null;
    const age = Math.max(0, nowSeconds - memory.updatedAt);
    return {
      ...copyMemory(memory),
      heat: Math.max(0.18, memory.heat * (1 - age / this.memoryTtlSeconds)),
    };
  }

  snapshot(): AiBossEncounterMemory[] {
    return this.memories.map(copyMemory);
  }

  private prune(nowSeconds: number): void {
    for (let i = this.memories.length - 1; i >= 0; i--) {
      if (this.memories[i].expiresAt <= nowSeconds) this.memories.splice(i, 1);
    }
  }
}

export function bossEncounterScale(entity: Entity): AiBossEncounterScale | null {
  if (entity.kind !== 'mob') return null;
  const template = MOBS[entity.templateId];
  if (!template) return null;
  if (template.boss) return 'boss';
  if (template.elite) return 'elite';
  if (template.rare) return 'rare';
  return null;
}

export function bossEncounterMemoryEvent(memory: AiBossEncounterMemory, speaker: Entity, pid: number): SimEvent {
  return {
    type: 'aiSpeech',
    speakerId: speaker.id,
    speakerName: speaker.name,
    speech: {
      mode: 'lineId',
      lineId: memory.lineId,
      values: {
        bossTemplateId: memory.templateId,
        bossName: memory.entityName,
        encounterOutcome: memory.outcome,
        encounterHeat: Math.round(memory.heat * 100),
      },
    },
    source: 'fallback',
    reaction: {
      kind: memory.outcome === 'wipe' ? 'avoid' : 'inspect',
      score: Math.round(memory.heat * 100) / 100,
      sceneTags: [`encounter:${memory.outcome}`, `scale:${memory.scale}`],
    },
    pid,
  };
}

function lineIdForOutcome(outcome: AiBossEncounterOutcome): AiBossEncounterLineId {
  switch (outcome) {
    case 'defeated': return 'hudChrome.aiSpeech.bossMemoryDefeated';
    case 'wipe': return 'hudChrome.aiSpeech.bossMemoryWipe';
  }
}

function heatFor(scale: AiBossEncounterScale, outcome: AiBossEncounterOutcome): number {
  const base = scale === 'boss' ? 0.95 : scale === 'elite' ? 0.72 : 0.58;
  return outcome === 'wipe' ? Math.min(1, base + 0.05) : base;
}

function mergeRecent(previous: readonly string[], next: readonly string[], limit: number): string[] {
  return [...next, ...previous.filter((value) => !next.includes(value))].slice(0, limit);
}

function copyMemory(memory: AiBossEncounterMemory): AiBossEncounterMemory {
  return { ...memory, evidence: [...memory.evidence] };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
