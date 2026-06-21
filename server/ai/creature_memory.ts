import type { Entity, SimEvent } from '../../src/sim/types';
import type { DroppedItemSemantic, SceneFrameV1 } from './scene_frame';
import { individualSpeechValuesFromTraits } from './singularity';
import type { IndividualAiProfile } from './singularity';

export interface AiCreatureMemory {
  memoryId: string;
  entityId: number;
  templateId: string;
  playerEntityId: number;
  playerName: string;
  interactionCount: number;
  traits: string[];
  firstSeenAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

export interface AiCreatureMemoryStoreOptions {
  memoryTtlSeconds?: number;
  maxMemories?: number;
}

export class AiCreatureMemoryStore {
  private readonly memories = new Map<string, AiCreatureMemory>();
  private readonly memoryTtlSeconds: number;
  private readonly maxMemories: number;

  constructor(options: AiCreatureMemoryStoreOptions = {}) {
    this.memoryTtlSeconds = Math.max(1, Math.floor(options.memoryTtlSeconds ?? 300));
    this.maxMemories = Math.max(1, Math.floor(options.maxMemories ?? 80));
  }

  noteSingularityReaction(input: {
    entity: Entity;
    player: Entity;
    individual: IndividualAiProfile;
    nowSeconds: number;
  }): AiCreatureMemory {
    this.prune(input.nowSeconds);
    const key = creatureMemoryKey(input.entity.id, input.player.id);
    const prev = this.memories.get(key);
    const next: AiCreatureMemory = {
      memoryId: key,
      entityId: input.entity.id,
      templateId: input.entity.templateId,
      playerEntityId: input.player.id,
      playerName: input.player.name,
      interactionCount: (prev?.interactionCount ?? 0) + 1,
      traits: mergeRecent(prev?.traits ?? [], input.individual.traits, 4),
      firstSeenAt: prev?.firstSeenAt ?? input.nowSeconds,
      lastSeenAt: input.nowSeconds,
      expiresAt: input.nowSeconds + this.memoryTtlSeconds,
    };
    this.memories.set(key, next);
    this.trimMemories();
    return copyMemory(next);
  }

  snapshot(): AiCreatureMemory[] {
    return [...this.memories.values()].map(copyMemory);
  }

  private prune(nowSeconds: number): void {
    for (const [key, memory] of this.memories) {
      if (memory.expiresAt <= nowSeconds) this.memories.delete(key);
    }
  }

  private trimMemories(): void {
    if (this.memories.size <= this.maxMemories) return;
    const overflow = this.memories.size - this.maxMemories;
    const oldest = [...this.memories.entries()]
      .sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt)
      .slice(0, overflow);
    for (const [key] of oldest) this.memories.delete(key);
  }
}

export function singularityCreatureMemoryEvent(
  player: Entity,
  creature: Entity,
  item: DroppedItemSemantic,
  memory: AiCreatureMemory,
): SimEvent | null {
  if (memory.interactionCount < 2) return null;
  return {
    type: 'aiSpeech',
    speakerId: creature.id,
    speakerName: creature.name,
    speech: {
      mode: 'lineId',
      lineId: 'hudChrome.aiSpeech.singularityRemembersPlayer',
      values: {
        speakerName: creature.name,
        speakerTemplateId: creature.templateId,
        playerName: player.name,
        itemId: item.itemId,
        interactionCount: memory.interactionCount,
        ...individualSpeechValuesFromTraits(memory.traits),
      },
    },
    source: 'fallback',
    reaction: {
      kind: 'inspect',
      targetItemId: item.itemId,
      score: Math.min(1, 0.55 + memory.interactionCount * 0.12),
      individualTier: 'singularity',
      individualTraits: memory.traits,
    },
    pid: player.id,
  };
}

export function singularityCreatureSceneMemoryEvent(
  player: Entity,
  creature: Entity,
  scene: SceneFrameV1,
  memory: AiCreatureMemory,
): SimEvent | null {
  if (memory.interactionCount < 2) return null;
  return {
    type: 'aiSpeech',
    speakerId: creature.id,
    speakerName: creature.name,
    speech: {
      mode: 'lineId',
      lineId: 'hudChrome.aiSpeech.singularityRemembersScene',
      values: {
        speakerName: creature.name,
        speakerTemplateId: creature.templateId,
        playerName: player.name,
        sceneId: scene.subsceneId ?? scene.zoneId,
        interactionCount: memory.interactionCount,
        ...individualSpeechValuesFromTraits(memory.traits),
      },
    },
    source: 'fallback',
    reaction: {
      kind: 'inspect',
      score: Math.min(1, 0.5 + memory.interactionCount * 0.12),
      sceneTags: sceneMemoryTags(scene),
      individualTier: 'singularity',
      individualTraits: memory.traits,
    },
    pid: player.id,
  };
}

export function creatureMemoryKey(entityId: number, playerEntityId: number): string {
  return `${entityId}:${playerEntityId}`;
}

function mergeRecent(previous: readonly string[], next: readonly string[], limit: number): string[] {
  return [...next, ...previous.filter((value) => !next.includes(value))].slice(0, limit);
}

function copyMemory(memory: AiCreatureMemory): AiCreatureMemory {
  return { ...memory, traits: [...memory.traits] };
}

function sceneMemoryTags(scene: SceneFrameV1): string[] {
  return [...new Set([
    ...scene.structureTags.slice(0, 2),
    ...scene.environmentalTags,
    ...scene.locationTags,
    ...scene.time.tags,
    ...scene.weather.tags,
    ...scene.light.tags,
  ])].slice(0, 8);
}
