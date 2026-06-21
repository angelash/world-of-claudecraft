import { MOBS } from '../../src/sim/data';
import type { Entity, SimEvent } from '../../src/sim/types';

export type AiBossEncounterOutcome = 'defeated' | 'wipe';
export type AiBossEncounterScale = 'boss' | 'elite' | 'rare';
export type AiBossEncounterPhase = 'bloodied' | 'desperate';

export type AiBossEncounterLineId =
  | 'hudChrome.aiSpeech.bossMemoryDefeated'
  | 'hudChrome.aiSpeech.bossMemoryWipe';

export type AiBossEncounterPhaseLineId =
  | 'hudChrome.aiSpeech.bossPhaseBloodied'
  | 'hudChrome.aiSpeech.bossPhaseDesperate';

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

export interface AiBossEncounterPhaseCue {
  cueId: string;
  sceneId: string;
  templateId: string;
  entityId: number;
  entityName: string;
  scale: AiBossEncounterScale;
  phase: AiBossEncounterPhase;
  sourcePlayerEntityId: number;
  lineId: AiBossEncounterPhaseLineId;
  healthPct: number;
  heat: number;
  createdAt: number;
  expiresAt: number;
  evidence: string[];
}

export interface AiBossEncounterMemoryStoreOptions {
  memoryTtlSeconds?: number;
  maxMemories?: number;
}

export interface AiBossEncounterPhaseCueStoreOptions {
  cueTtlSeconds?: number;
  maxCues?: number;
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

export class AiBossEncounterPhaseCueStore {
  private readonly cues: AiBossEncounterPhaseCue[] = [];
  private readonly cueTtlSeconds: number;
  private readonly maxCues: number;
  private sequence = 0;

  constructor(options: AiBossEncounterPhaseCueStoreOptions = {}) {
    this.cueTtlSeconds = Math.max(1, Math.floor(options.cueTtlSeconds ?? 180));
    this.maxCues = Math.max(1, Math.floor(options.maxCues ?? 48));
  }

  noteDamagePhase(input: {
    sceneId: string;
    entity: Entity;
    scale: AiBossEncounterScale;
    sourcePlayerEntityId: number;
    nowSeconds: number;
    evidence: string[];
  }): AiBossEncounterPhaseCue | null {
    this.prune(input.nowSeconds);
    if (input.entity.dead || input.entity.maxHp <= 0 || input.entity.hp <= 0) return null;
    const phase = phaseForHealth(input.entity.hp / input.entity.maxHp);
    if (!phase) return null;
    const existing = this.cues.find((cue) =>
      cue.entityId === input.entity.id
      && cue.templateId === input.entity.templateId
      && cue.sourcePlayerEntityId === input.sourcePlayerEntityId
      && cue.phase === phase,
    );
    if (existing) return null;

    const healthPct = Math.max(1, Math.min(99, Math.round((input.entity.hp / input.entity.maxHp) * 100)));
    const cue: AiBossEncounterPhaseCue = {
      cueId: `boss-phase-${++this.sequence}`,
      sceneId: input.sceneId,
      templateId: input.entity.templateId,
      entityId: input.entity.id,
      entityName: input.entity.name,
      scale: input.scale,
      phase,
      sourcePlayerEntityId: input.sourcePlayerEntityId,
      lineId: lineIdForPhase(phase),
      healthPct,
      heat: heatForPhase(input.scale, phase),
      createdAt: input.nowSeconds,
      expiresAt: input.nowSeconds + this.cueTtlSeconds,
      evidence: mergeRecent([], input.evidence, 8),
    };
    this.cues.unshift(cue);
    this.cues.splice(this.maxCues);
    return copyPhaseCue(cue);
  }

  snapshot(): AiBossEncounterPhaseCue[] {
    return this.cues.map(copyPhaseCue);
  }

  private prune(nowSeconds: number): void {
    for (let i = this.cues.length - 1; i >= 0; i--) {
      if (this.cues[i].expiresAt <= nowSeconds) this.cues.splice(i, 1);
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

export function bossEncounterPhaseEvent(cue: AiBossEncounterPhaseCue, speaker: Entity, pid: number): SimEvent {
  return {
    type: 'aiSpeech',
    speakerId: speaker.id,
    speakerName: speaker.name,
    speech: {
      mode: 'lineId',
      lineId: cue.lineId,
      values: {
        bossTemplateId: cue.templateId,
        bossName: cue.entityName,
        encounterPhase: cue.phase,
        bossHealthPct: cue.healthPct,
        encounterHeat: Math.round(cue.heat * 100),
      },
    },
    source: 'fallback',
    reaction: {
      kind: cue.phase === 'desperate' ? 'avoid' : 'inspect',
      score: Math.round(cue.heat * 100) / 100,
      sceneTags: [`encounterPhase:${cue.phase}`, `scale:${cue.scale}`],
    },
    pid,
  };
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

function phaseForHealth(hpFraction: number): AiBossEncounterPhase | null {
  if (hpFraction <= 0.2) return 'desperate';
  if (hpFraction <= 0.5) return 'bloodied';
  return null;
}

function lineIdForPhase(phase: AiBossEncounterPhase): AiBossEncounterPhaseLineId {
  switch (phase) {
    case 'bloodied': return 'hudChrome.aiSpeech.bossPhaseBloodied';
    case 'desperate': return 'hudChrome.aiSpeech.bossPhaseDesperate';
  }
}

function lineIdForOutcome(outcome: AiBossEncounterOutcome): AiBossEncounterLineId {
  switch (outcome) {
    case 'defeated': return 'hudChrome.aiSpeech.bossMemoryDefeated';
    case 'wipe': return 'hudChrome.aiSpeech.bossMemoryWipe';
  }
}

function heatForPhase(scale: AiBossEncounterScale, phase: AiBossEncounterPhase): number {
  const base = scale === 'boss' ? 0.82 : scale === 'elite' ? 0.66 : 0.52;
  return phase === 'desperate' ? Math.min(1, base + 0.12) : base;
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

function copyPhaseCue(cue: AiBossEncounterPhaseCue): AiBossEncounterPhaseCue {
  return { ...cue, evidence: [...cue.evidence] };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
