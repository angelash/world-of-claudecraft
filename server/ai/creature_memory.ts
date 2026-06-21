import type { Entity, SimEvent } from '../../src/sim/types';
import type { DroppedItemSemantic, SceneFrameV1 } from './scene_frame';
import { individualSpeechValuesFromTraits } from './singularity';
import type { IndividualAiProfile } from './singularity';

type AiSpeechReaction = NonNullable<Extract<SimEvent, { type: 'aiSpeech' }>['reaction']>;

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

export type AiCreaturePlanKind =
  | 'followScent'
  | 'collectObject'
  | 'guardPlace'
  | 'avoidPlayer'
  | 'watchSky'
  | 'omenWatch';

export interface AiCreaturePlan {
  planId: string;
  entityId: number;
  templateId: string;
  playerEntityId: number;
  kind: AiCreaturePlanKind;
  sceneId: string;
  itemId?: string;
  intensity: number;
  traits: string[];
  evidence: string[];
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface AiCreatureMemoryStoreOptions {
  memoryTtlSeconds?: number;
  maxMemories?: number;
  planTtlSeconds?: number;
  maxPlans?: number;
}

export class AiCreatureMemoryStore {
  private readonly memories = new Map<string, AiCreatureMemory>();
  private readonly plans = new Map<string, AiCreaturePlan>();
  private readonly memoryTtlSeconds: number;
  private readonly maxMemories: number;
  private readonly planTtlSeconds: number;
  private readonly maxPlans: number;

  constructor(options: AiCreatureMemoryStoreOptions = {}) {
    this.memoryTtlSeconds = Math.max(1, Math.floor(options.memoryTtlSeconds ?? 300));
    this.maxMemories = Math.max(1, Math.floor(options.maxMemories ?? 80));
    this.planTtlSeconds = Math.max(1, Math.floor(options.planTtlSeconds ?? 90));
    this.maxPlans = Math.max(1, Math.floor(options.maxPlans ?? 48));
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

  notePlan(input: {
    memory: AiCreatureMemory;
    entity: Entity;
    player: Entity;
    individual: IndividualAiProfile;
    scene: SceneFrameV1;
    item?: DroppedItemSemantic;
    trigger: 'item_discarded' | 'scene_inspected';
    nowSeconds: number;
  }): AiCreaturePlan | null {
    if (input.individual.tier !== 'singularity' || input.memory.interactionCount < 2) return null;
    this.prunePlans(input.nowSeconds);
    const sceneId = input.scene.subsceneId ?? input.scene.zoneId;
    const planId = creaturePlanKey(input.memory.memoryId, sceneId, input.item?.itemId ?? input.trigger);
    const previous = this.plans.get(planId);
    const kind = planKindFor(input.individual, input.scene, input.item);
    const evidence = mergeRecent(previous?.evidence ?? [], planEvidence(input.individual, input.scene, input.item, input.trigger), 8);
    const plan: AiCreaturePlan = {
      planId,
      entityId: input.entity.id,
      templateId: input.entity.templateId,
      playerEntityId: input.player.id,
      kind,
      sceneId,
      ...(input.item ? { itemId: input.item.itemId } : {}),
      intensity: clamp01(Math.max(previous?.intensity ?? 0, 0.35 + input.memory.interactionCount * 0.14 + input.individual.intensity * 0.25)),
      traits: mergeRecent(previous?.traits ?? [], input.individual.traits, 4),
      evidence,
      createdAt: previous?.createdAt ?? input.nowSeconds,
      updatedAt: input.nowSeconds,
      expiresAt: input.nowSeconds + this.planTtlSeconds,
    };
    this.plans.set(planId, plan);
    this.trimPlans();
    return copyPlan(plan);
  }

  snapshot(): AiCreatureMemory[] {
    return [...this.memories.values()].map(copyMemory);
  }

  planSnapshot(): AiCreaturePlan[] {
    return [...this.plans.values()].map(copyPlan);
  }

  private prune(nowSeconds: number): void {
    for (const [key, memory] of this.memories) {
      if (memory.expiresAt <= nowSeconds) this.memories.delete(key);
    }
  }

  private prunePlans(nowSeconds: number): void {
    for (const [key, plan] of this.plans) {
      if (plan.expiresAt <= nowSeconds) this.plans.delete(key);
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

  private trimPlans(): void {
    if (this.plans.size <= this.maxPlans) return;
    const overflow = this.plans.size - this.maxPlans;
    const oldest = [...this.plans.entries()]
      .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
      .slice(0, overflow);
    for (const [key] of oldest) this.plans.delete(key);
  }
}

export function singularityCreatureMemoryEvent(
  player: Entity,
  creature: Entity,
  item: DroppedItemSemantic,
  memory: AiCreatureMemory,
  plan: AiCreaturePlan | null = null,
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
      ...creaturePlanReactionMetadata(plan),
    },
    pid: player.id,
  };
}

export function singularityCreatureSceneMemoryEvent(
  player: Entity,
  creature: Entity,
  scene: SceneFrameV1,
  memory: AiCreatureMemory,
  plan: AiCreaturePlan | null = null,
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
      ...creaturePlanReactionMetadata(plan),
    },
    pid: player.id,
  };
}

export function creaturePlanReactionMetadata(plan: AiCreaturePlan | null): Partial<AiSpeechReaction> {
  if (!plan) return {};
  const targetEntityId = creaturePlanAttentionTargetEntityId(plan);
  return {
    ...(targetEntityId !== undefined ? { targetEntityId } : {}),
    planId: plan.planId,
    planKind: plan.kind,
    planIntensity: Math.round(plan.intensity * 100) / 100,
    planExpiresAt: plan.expiresAt,
  };
}

export function creatureMemoryKey(entityId: number, playerEntityId: number): string {
  return `${entityId}:${playerEntityId}`;
}

export function creaturePlanKey(memoryId: string, sceneId: string, subjectId: string): string {
  return `${memoryId}:${sceneId}:${subjectId}`;
}

function mergeRecent(previous: readonly string[], next: readonly string[], limit: number): string[] {
  return [...next, ...previous.filter((value) => !next.includes(value))].slice(0, limit);
}

function copyMemory(memory: AiCreatureMemory): AiCreatureMemory {
  return { ...memory, traits: [...memory.traits] };
}

function copyPlan(plan: AiCreaturePlan): AiCreaturePlan {
  return { ...plan, traits: [...plan.traits], evidence: [...plan.evidence] };
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

function planKindFor(
  individual: IndividualAiProfile,
  scene: SceneFrameV1,
  item: DroppedItemSemantic | undefined,
): AiCreaturePlanKind {
  const itemTags = new Set(item ? [...item.itemTags, ...item.smellTags, ...item.dangerTags, ...item.valueSignals] : []);
  if (individual.traits.includes('foodFixated') && (itemTags.has('food') || itemTags.has('meat') || itemTags.has('fish'))) return 'followScent';
  if (individual.traits.includes('collector') && item && (itemTags.has('valuable') || itemTags.has('coin') || itemTags.has('gear') || itemTags.has('shiny'))) return 'collectObject';
  if (individual.traits.includes('cowardly') && (scene.danger.hostileDensity >= 0.25 || scene.danger.undeadPressure >= 0.25)) return 'avoidPlayer';
  if (individual.traits.includes('stargazer') && scene.light.tags.includes('starrySky')) return 'watchSky';
  if (individual.traits.includes('omenSensitive')) return 'omenWatch';
  return 'guardPlace';
}

function planEvidence(
  individual: IndividualAiProfile,
  scene: SceneFrameV1,
  item: DroppedItemSemantic | undefined,
  trigger: 'item_discarded' | 'scene_inspected',
): string[] {
  return [
    `trigger:${trigger}`,
    ...individual.traits.map((trait) => `trait:${trait}`),
    ...(item ? [`item:${item.itemId}`, ...item.itemTags.slice(0, 3).map((tag) => `itemTag:${tag}`)] : []),
    ...sceneMemoryTags(scene).slice(0, 4).map((tag) => `scene:${tag}`),
  ];
}

function creaturePlanAttentionTargetEntityId(plan: AiCreaturePlan): number | undefined {
  switch (plan.kind) {
    case 'followScent':
    case 'collectObject':
    case 'guardPlace':
    case 'avoidPlayer':
    case 'omenWatch':
      return plan.playerEntityId;
    case 'watchSky':
      return undefined;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
