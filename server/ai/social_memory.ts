import type { AiJobContextV1 } from './ai_types';

export interface AiNpcMemory {
  playerEntityId: number;
  playerName: string;
  templateId: string;
  interactionCount: number;
  affinity: number;
  lastInteractionAt: number;
  sceneIds: string[];
}

export interface AiRumorMemory {
  rumorId: string;
  sceneId: string;
  originSceneId: string;
  zoneId: string;
  itemId: string;
  subjectKind: 'item' | 'quest';
  questId?: string;
  sourcePlayerEntityId: number;
  lineIds: string[];
  strength: number;
  scope: 'scene' | 'region';
  createdAt: number;
  expiresAt: number;
}

export interface AiSocialMemoryStoreOptions {
  rumorTtlSeconds?: number;
}

export class AiSocialMemoryStore {
  private readonly npcMemories = new Map<string, AiNpcMemory>();
  private readonly rumors: AiRumorMemory[] = [];
  private readonly rumorTtlSeconds: number;
  private rumorSequence = 0;

  constructor(options: AiSocialMemoryStoreOptions = {}) {
    this.rumorTtlSeconds = Math.max(1, Math.floor(options.rumorTtlSeconds ?? 90));
  }

  noteNpcInteraction(context: AiJobContextV1, nowSeconds = 0): AiNpcMemory {
    const key = npcMemoryKey(context.player.entityId, context.entity.templateId);
    const prev = this.npcMemories.get(key);
    const sceneId = context.scene?.subsceneId ?? context.scene?.zoneId ?? 'unknown';
    const next: AiNpcMemory = {
      playerEntityId: context.player.entityId,
      playerName: context.player.name,
      templateId: context.entity.templateId,
      interactionCount: (prev?.interactionCount ?? 0) + 1,
      affinity: Math.min(1, (prev?.affinity ?? 0) + 0.08),
      lastInteractionAt: nowSeconds,
      sceneIds: mergeRecent(prev?.sceneIds ?? [], sceneId, 5),
    };
    this.npcMemories.set(key, next);
    return next;
  }

  noteItemRumor(input: {
    sceneId: string;
    zoneId?: string;
    itemId: string;
    sourcePlayerEntityId: number;
    lineIds: string[];
    nowSeconds: number;
  }): AiRumorMemory {
    this.pruneRumors(input.nowSeconds);
    const rumor: AiRumorMemory = {
      rumorId: `rumor-${++this.rumorSequence}`,
      sceneId: input.sceneId,
      originSceneId: input.sceneId,
      zoneId: input.zoneId ?? input.sceneId,
      itemId: input.itemId,
      subjectKind: 'item',
      sourcePlayerEntityId: input.sourcePlayerEntityId,
      lineIds: [...input.lineIds],
      strength: 1,
      scope: 'scene',
      createdAt: input.nowSeconds,
      expiresAt: input.nowSeconds + this.rumorTtlSeconds,
    };
    this.rumors.unshift(rumor);
    this.rumors.splice(12);
    return rumor;
  }

  noteQuestRumor(input: {
    sceneId: string;
    zoneId?: string;
    questId: string;
    sourcePlayerEntityId: number;
    lineIds: string[];
    nowSeconds: number;
  }): AiRumorMemory {
    this.pruneRumors(input.nowSeconds);
    const rumor: AiRumorMemory = {
      rumorId: `rumor-${++this.rumorSequence}`,
      sceneId: input.sceneId,
      originSceneId: input.sceneId,
      zoneId: input.zoneId ?? input.sceneId,
      itemId: input.questId,
      subjectKind: 'quest',
      questId: input.questId,
      sourcePlayerEntityId: input.sourcePlayerEntityId,
      lineIds: [...input.lineIds],
      strength: 1,
      scope: 'scene',
      createdAt: input.nowSeconds,
      expiresAt: input.nowSeconds + this.rumorTtlSeconds,
    };
    this.rumors.unshift(rumor);
    this.rumors.splice(12);
    return rumor;
  }

  rumorForScene(sceneId: string | null | undefined, playerEntityId: number, nowSeconds: number): AiRumorMemory | null {
    if (!sceneId) return null;
    this.pruneRumors(nowSeconds);
    const rumor = this.rumors.find((candidate) => candidate.sceneId === sceneId && candidate.sourcePlayerEntityId === playerEntityId);
    if (!rumor) return null;
    return this.activeRumorSnapshot(rumor, nowSeconds, 'scene', 1);
  }

  rumorForRegion(input: {
    zoneId: string | null | undefined;
    sceneId?: string | null;
    playerEntityId: number;
    nowSeconds: number;
  }): AiRumorMemory | null {
    if (!input.zoneId) return null;
    this.pruneRumors(input.nowSeconds);
    const rumor = this.rumors.find((candidate) =>
      candidate.zoneId === input.zoneId
      && candidate.sourcePlayerEntityId === input.playerEntityId
      && candidate.sceneId !== input.sceneId
    );
    if (!rumor) return null;
    return this.activeRumorSnapshot(rumor, input.nowSeconds, 'region', 0.65);
  }

  snapshot(): { npcMemories: AiNpcMemory[]; rumors: AiRumorMemory[] } {
    return {
      npcMemories: [...this.npcMemories.values()].map((memory) => ({ ...memory, sceneIds: [...memory.sceneIds] })),
      rumors: this.rumors.map((rumor) => ({ ...rumor, lineIds: [...rumor.lineIds] })),
    };
  }

  private pruneRumors(nowSeconds: number): void {
    for (let i = this.rumors.length - 1; i >= 0; i--) {
      if (this.rumors[i].expiresAt <= nowSeconds) this.rumors.splice(i, 1);
    }
  }

  private activeRumorSnapshot(
    rumor: AiRumorMemory,
    nowSeconds: number,
    scope: AiRumorMemory['scope'],
    propagationScale: number,
  ): AiRumorMemory {
    const age = Math.max(0, nowSeconds - rumor.createdAt);
    const localStrength = Math.max(0.15, 1 - age / this.rumorTtlSeconds);
    return {
      ...rumor,
      lineIds: [...rumor.lineIds],
      scope,
      strength: Math.max(0.1, localStrength * propagationScale),
    };
  }
}

export function npcMemoryKey(playerEntityId: number, templateId: string): string {
  return `${playerEntityId}:${templateId}`;
}

function mergeRecent(values: readonly string[], next: string, limit: number): string[] {
  return [next, ...values.filter((value) => value !== next)].slice(0, limit);
}
