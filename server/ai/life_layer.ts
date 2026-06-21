import { NPCS, QUESTS } from '../../src/sim/data';
import type { Sim } from '../../src/sim/sim';
import type { AiNpcInteractionTopic } from '../../src/world_api';
import { INTERACT_RANGE, dist2d } from '../../src/sim/types';
import type { SimEvent } from '../../src/sim/types';
import type { AiDecisionV1, AiJobContextV1, AiProvider } from './ai_types';
import { aiEntityKind } from './ai_types';
import { classifyCanonSubject } from './canon_guard';
import { CodexCliProvider } from './codex_worker';
import { AiDecisionJournal } from './decision_journal';
import type { AiDecisionJournalEntry } from './decision_journal';
import { compactFamilySemanticsForEntity } from './family_semantics';
import { FakeAiProvider } from './fake_ai_provider';
import { nearbyReactionCandidates, rankItemReactions } from './item_interest';
import { validateAiDecision } from './intent_validator';
import { memoryReactionEvent } from './memory_reactions';
import { compactProfileSnapshot, profileFor } from './profiles';
import { topicReactionEvent } from './question_reactions';
import { droppedItemSemantic, sceneFrameFor } from './scene_frame';
import { sceneAwarenessEvent } from './scene_reactions';
import { AiSocialMemoryStore } from './social_memory';
import type { AiNpcMemory, AiRumorMemory } from './social_memory';

export interface AiLifeLayerOptions {
  enabled?: boolean;
  provider?: AiProvider;
  useCodex?: boolean;
  journalSize?: number;
}

export interface NpcAiInteractionRequest {
  sim: Sim;
  pid: number;
  npcId: number;
  locale: string;
  topic?: AiNpcInteractionTopic;
  deliver(events: SimEvent[]): void;
}

export interface ItemDiscardedAiRequest {
  sim: Sim;
  pid: number;
  itemId: string;
  count: number;
  deliver(events: SimEvent[]): void;
}

export class AiLifeLayer {
  private readonly enabled: boolean;
  private readonly provider: AiProvider;
  private readonly journal: AiDecisionJournal;
  private readonly socialMemory = new AiSocialMemoryStore();
  private sequence = 0;

  constructor(options: AiLifeLayerOptions = {}) {
    this.enabled = options.enabled ?? process.env.AI_LIVING_WORLD_EXPERIMENT === '1';
    this.provider = options.provider ?? (options.useCodex || process.env.AI_CODEX_CLI === '1'
      ? new CodexCliProvider()
      : new FakeAiProvider());
    this.journal = new AiDecisionJournal(options.journalSize);
  }

  diagnostics(): AiDecisionJournalEntry[] {
    return this.journal.snapshot();
  }

  memoryDiagnostics(): { npcMemories: AiNpcMemory[]; rumors: AiRumorMemory[] } {
    return this.socialMemory.snapshot();
  }

  async handleNpcInteraction(request: NpcAiInteractionRequest): Promise<void> {
    if (!this.enabled) return;
    const context = this.buildNpcContext(request);
    if (!context) return;
    const npc = request.sim.entities.get(request.npcId);
    if (!npc) return;
    const subject = classifyCanonSubject(npc);
    const memory = this.socialMemory.noteNpcInteraction(context, request.sim.time);
    context.recentObservations.push(`npcMemory:${memory.interactionCount}`);
    const rumor = this.socialMemory.rumorForScene(context.scene?.subsceneId ?? context.scene?.zoneId, request.pid, request.sim.time);
    if (rumor) context.recentObservations.push(`sceneRumor:${rumor.itemId}:${rumor.strength.toFixed(2)}`);
    let decision: AiDecisionV1;
    try {
      decision = await this.provider.decide(context);
    } catch (err) {
      this.journal.recordProviderError(context, err instanceof Error ? err.message : String(err));
      throw err;
    }
    const result = validateAiDecision({ decision, context, entity: npc, subject });
    this.journal.recordDecision(context, decision, result);
    if (result.ok) {
      const events = [...result.events];
      const sceneEvent = sceneAwarenessEvent(context, npc);
      if (sceneEvent) events.push(sceneEvent);
      const memoryEvent = memoryReactionEvent(context, npc, memory, rumor);
      if (memoryEvent) events.push(memoryEvent);
      const topicEvent = topicReactionEvent(context, npc, memory, rumor);
      if (topicEvent) events.push(topicEvent);
      if (events.length > 0) request.deliver(events);
    }
  }

  handleItemDiscarded(request: ItemDiscardedAiRequest): void {
    if (!this.enabled) return;
    const player = request.sim.entities.get(request.pid);
    if (!player || request.count <= 0) return;
    const dropped = droppedItemSemantic(request.itemId, 0, request.pid);
    if (!dropped) return;
    const scene = sceneFrameFor(request.sim, player.pos, {
      droppedItems: [dropped],
      recentSceneEvents: [`playerDiscarded:${request.itemId}`],
    });
    const candidates = nearbyReactionCandidates(scene, request.sim.entities.values(), player);
    const reactions = rankItemReactions(scene, dropped, candidates, { worldSeed: request.sim.cfg.seed }).slice(0, 2);
    if (reactions.length > 0) {
      const sceneId = scene.subsceneId ?? scene.zoneId;
      this.socialMemory.noteItemRumor({
        sceneId,
        itemId: dropped.itemId,
        sourcePlayerEntityId: request.pid,
        lineIds: reactions.map((reaction) => reaction.lineId),
        nowSeconds: request.sim.time,
      });
      this.journal.recordLocalReaction({
        jobId: `local-${request.pid}-${++this.sequence}`,
        trigger: 'item_discarded',
        entityId: player.id,
        templateId: player.templateId,
        playerEntityId: request.pid,
        reason: `discarded:${request.itemId}`,
        lineIds: reactions.map((reaction) => reaction.lineId),
        intents: reactions.map((reaction) => reaction.reaction),
        sceneId,
      });
    }
    const events: SimEvent[] = reactions.map((reaction) => ({
      type: 'aiSpeech',
      speakerId: reaction.entity.id,
      speakerName: reaction.entity.name,
      speech: {
        mode: 'lineId',
        lineId: reaction.lineId,
        values: {
          speakerName: reaction.entity.name,
          itemId: dropped.itemId,
          reaction: reaction.reaction,
          score: Math.round(reaction.score * 100),
        },
      },
      source: 'fallback',
      reaction: {
        kind: reaction.reaction,
        targetItemId: dropped.itemId,
        score: Math.round(reaction.score * 100) / 100,
        sceneTags: [...new Set([...scene.locationTags, ...scene.structureTags, ...scene.environmentalTags])].slice(0, 8),
        individualTier: reaction.individual?.tier,
        individualTraits: reaction.individual?.traits,
      },
      pid: request.pid,
    }));
    if (events.length > 0) request.deliver(events);
  }

  private buildNpcContext(request: NpcAiInteractionRequest): AiJobContextV1 | null {
    const player = request.sim.entities.get(request.pid);
    const npc = request.sim.entities.get(request.npcId);
    const meta = request.sim.meta(request.pid);
    if (!player || !npc || !meta || npc.kind !== 'npc') return null;
    if (dist2d(player.pos, npc.pos) > INTERACT_RANGE + 2) return null;
    const kind = aiEntityKind(npc);
    if (!kind) return null;
    const profile = profileFor(kind, npc.templateId);
    const scene = sceneFrameFor(request.sim, npc.pos);
    const questFacts = npc.questIds
      .map((questId) => {
        const quest = QUESTS[questId];
        if (!quest) return null;
        const state = request.sim.questState(questId, request.pid);
        if (state === 'unavailable') return null;
        return {
          questId,
          visibility: state === 'active' ? 'currentObjective' as const : 'knownToPlayer' as const,
          summary: quest.name,
          source: 'quest-log',
        };
      })
      .filter((fact): fact is NonNullable<typeof fact> => fact !== null);
    const npcDef = NPCS[npc.templateId];
    return {
      schemaVersion: 1,
      jobId: `ai-${request.pid}-${request.npcId}-${++this.sequence}`,
      trigger: request.topic && request.topic !== 'greeting' ? 'npc_question' : 'npc_gossip_opened',
      entity: {
        kind,
        entityId: npc.id,
        templateId: npc.templateId,
        name: npcDef?.name ?? npc.name,
        level: npc.level,
        questIds: [...npc.questIds],
        dead: npc.dead,
      },
      player: {
        entityId: player.id,
        name: player.name,
        level: player.level,
        classId: player.templateId,
        activeQuestIds: [...meta.questLog.keys()],
        completedQuestIds: [...meta.questsDone],
      },
      locale: normalizeLocale(request.locale),
      topic: request.topic ?? 'greeting',
      profile: compactProfileSnapshot(profile),
      scene,
      familySemantics: compactFamilySemanticsForEntity(npc),
      questFacts,
      recentObservations: [
        `playerQuestion:${request.topic ?? 'greeting'}`,
        `scene:${scene.subsceneId ?? scene.zoneId}`,
        ...scene.environmentalTags.slice(0, 4).map((tag) => `tag:${tag}`),
      ],
      allowedIntents: profile.allowedIntentTypes,
      allowedLineIds: profile.allowedLineIds,
      outputMode: 'line_id_only',
    };
  }
}

export function normalizeLocale(locale: string): string {
  const trimmed = locale.trim();
  return /^[a-z]{2}([_-][A-Z]{2})?$/.test(trimmed) ? trimmed : 'en';
}
