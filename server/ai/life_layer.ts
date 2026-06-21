import { NPCS, QUESTS } from '../../src/sim/data';
import type { Sim } from '../../src/sim/sim';
import type { AiNpcInteractionTopic } from '../../src/world_api';
import { INTERACT_RANGE, dist2d } from '../../src/sim/types';
import type { Entity, SimEvent } from '../../src/sim/types';
import type { AiDecisionV1, AiJobContextV1, AiProvider } from './ai_types';
import { aiEntityKind } from './ai_types';
import {
  AiBossEncounterMemoryStore,
  AiBossEncounterPhaseCueStore,
  bossEncounterMemoryEvent,
  bossEncounterPhaseEvent,
  bossEncounterScale,
} from './boss_memory';
import type { AiBossEncounterMemory, AiBossEncounterPhaseCue } from './boss_memory';
import { classifyCanonSubject } from './canon_guard';
import { CodexCliProvider } from './codex_worker';
import { companionReactionEvents } from './companion_reactions';
import { AiCreatureMemoryStore, singularityCreatureMemoryEvent } from './creature_memory';
import type { AiCreatureMemory } from './creature_memory';
import { AiDecisionJournal } from './decision_journal';
import type { AiDecisionJournalEntry } from './decision_journal';
import { compactFamilySemanticsForEntity } from './family_semantics';
import { FakeAiProvider } from './fake_ai_provider';
import { nearbyReactionCandidates, rankItemReactions } from './item_interest';
import { validateAiDecision } from './intent_validator';
import { memoryReactionEvent } from './memory_reactions';
import { objectInspectionEvent, objectInspectionLineIds } from './object_reactions';
import { compactProfileSnapshot, profileFor } from './profiles';
import { topicReactionEvent } from './question_reactions';
import { droppedItemSemantic, sceneFrameFor } from './scene_frame';
import { sceneInspectionEvent } from './scene_inspection';
import { sceneAwarenessEvent } from './scene_reactions';
import { AiSocialMemoryStore } from './social_memory';
import type { AiNpcMemory, AiRumorMemory } from './social_memory';
import { AiWorldDirectorStore, worldDirectorEvent } from './world_director';
import type { AiWorldDirectorState } from './world_director';
import { AiWorldTraceStore } from './world_traces';
import type { AiWorldTrace } from './world_traces';
import { worldTraceReactionEvent } from './world_trace_reactions';

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

export interface ObjectAiInspectionRequest {
  sim: Sim;
  pid: number;
  objectId: number;
  locale: string;
  deliver(events: SimEvent[]): void;
}

export interface SceneAiInspectionRequest {
  sim: Sim;
  pid: number;
  locale: string;
  deliver(events: SimEvent[]): void;
}

export class AiLifeLayer {
  private readonly enabled: boolean;
  private readonly provider: AiProvider;
  private readonly journal: AiDecisionJournal;
  private readonly socialMemory = new AiSocialMemoryStore();
  private readonly worldTraces = new AiWorldTraceStore();
  private readonly creatureMemory = new AiCreatureMemoryStore();
  private readonly bossMemory = new AiBossEncounterMemoryStore();
  private readonly bossPhaseCues = new AiBossEncounterPhaseCueStore();
  private readonly worldDirector = new AiWorldDirectorStore();
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

  worldTraceDiagnostics(): AiWorldTrace[] {
    return this.worldTraces.snapshot();
  }

  creatureMemoryDiagnostics(): AiCreatureMemory[] {
    return this.creatureMemory.snapshot();
  }

  bossMemoryDiagnostics(): AiBossEncounterMemory[] {
    return this.bossMemory.snapshot();
  }

  bossPhaseCueDiagnostics(): AiBossEncounterPhaseCue[] {
    return this.bossPhaseCues.snapshot();
  }

  worldDirectorDiagnostics(): AiWorldDirectorState[] {
    return this.worldDirector.snapshot();
  }

  handleSimEvents(request: { sim: Sim; events: SimEvent[] }): SimEvent[] {
    if (!this.enabled || request.events.length === 0) return [];
    const out: SimEvent[] = [];
    for (const event of request.events) {
      if (event.type === 'questDone') {
        const player = this.playerForPid(request.sim, event.pid);
        const quest = QUESTS[event.questId];
        if (!player || !quest) continue;
        const scene = sceneFrameFor(request.sim, player.pos);
        const sceneId = scene.subsceneId ?? scene.zoneId;
        const lineId = 'hudChrome.aiSpeech.memoryQuestRumorEcho';
        this.socialMemory.noteQuestRumor({
          sceneId,
          zoneId: scene.zoneId,
          questId: event.questId,
          sourcePlayerEntityId: player.id,
          lineIds: [lineId],
          nowSeconds: request.sim.time,
        });
        this.journal.recordLocalReaction({
          jobId: `quest-rumor-${player.id}-${++this.sequence}`,
          trigger: 'quest_completed',
          entityId: player.id,
          templateId: player.templateId,
          playerEntityId: player.id,
          reason: `questDone:${event.questId}`,
          lineIds: [lineId],
          intents: ['rememberQuestFact', 'spreadRumor'],
          sceneId,
        });
        continue;
      }
      if (event.type === 'damage') {
        if (event.kind !== 'hit' || event.amount <= 0) continue;
        const target = request.sim.entities.get(event.targetId);
        if (!target || target.kind !== 'mob') continue;
        const scale = bossEncounterScale(target);
        if (!scale) continue;
        const source = request.sim.entities.get(event.sourceId);
        const sourcePlayer = this.playerForEncounterSource(request.sim, source) ?? this.playerForPid(request.sim, target.tappedById);
        if (!sourcePlayer) continue;
        const scene = sceneFrameFor(request.sim, target.pos);
        const sceneId = scene.subsceneId ?? scene.zoneId;
        const cue = this.bossPhaseCues.noteDamagePhase({
          sceneId,
          entity: target,
          scale,
          sourcePlayerEntityId: sourcePlayer.id,
          nowSeconds: request.sim.time,
          evidence: [`simEvent:damage`, `source:${source?.templateId ?? 'unknown'}`, `amount:${event.amount}`],
        });
        if (!cue) continue;
        this.journal.recordLocalReaction({
          jobId: `encounter-phase-${sourcePlayer.id}-${++this.sequence}`,
          trigger: 'encounter_memory',
          entityId: target.id,
          templateId: target.templateId,
          playerEntityId: sourcePlayer.id,
          reason: `bossPhase:${cue.phase}:${target.templateId}`,
          lineIds: [cue.lineId],
          intents: ['readEncounterPhase', 'commentOnScene'],
          sceneId,
        });
        out.push(bossEncounterPhaseEvent(cue, target, sourcePlayer.id));
        continue;
      }
      if (event.type !== 'death') continue;
      const dead = request.sim.entities.get(event.entityId);
      const killer = request.sim.entities.get(event.killerId);
      if (!dead) continue;

      if (dead.kind === 'mob') {
        const scale = bossEncounterScale(dead);
        if (!scale) continue;
        const sourcePlayer = this.playerForEncounterSource(request.sim, killer) ?? this.playerForPid(request.sim, dead.tappedById);
        if (!sourcePlayer) continue;
        const scene = sceneFrameFor(request.sim, dead.pos);
        const sceneId = scene.subsceneId ?? scene.zoneId;
        const memory = this.bossMemory.noteEncounter({
          sceneId,
          entity: dead,
          scale,
          outcome: 'defeated',
          sourcePlayerEntityId: sourcePlayer.id,
          nowSeconds: request.sim.time,
          evidence: [`simEvent:death`, `killer:${killer?.templateId ?? 'unknown'}`],
        });
        this.worldDirector.noteBossMemory({ memory, nowSeconds: request.sim.time });
        this.journal.recordLocalReaction({
          jobId: `encounter-${sourcePlayer.id}-${++this.sequence}`,
          trigger: 'encounter_memory',
          entityId: dead.id,
          templateId: dead.templateId,
          playerEntityId: sourcePlayer.id,
          reason: `boss:${memory.outcome}:${dead.templateId}`,
          lineIds: [memory.lineId],
          intents: ['rememberEncounter', 'readWorldDirectorState'],
          sceneId,
        });
        out.push(bossEncounterMemoryEvent(memory, dead, sourcePlayer.id));
      } else if (dead.kind === 'player' && killer?.kind === 'mob') {
        const scale = bossEncounterScale(killer);
        if (!scale) continue;
        const scene = sceneFrameFor(request.sim, killer.pos);
        const sceneId = scene.subsceneId ?? scene.zoneId;
        const memory = this.bossMemory.noteEncounter({
          sceneId,
          entity: killer,
          scale,
          outcome: 'wipe',
          sourcePlayerEntityId: dead.id,
          nowSeconds: request.sim.time,
          evidence: [`simEvent:playerDeath`, `killer:${killer.templateId}`],
        });
        this.worldDirector.noteBossMemory({ memory, nowSeconds: request.sim.time });
        this.journal.recordLocalReaction({
          jobId: `encounter-${dead.id}-${++this.sequence}`,
          trigger: 'encounter_memory',
          entityId: killer.id,
          templateId: killer.templateId,
          playerEntityId: dead.id,
          reason: `boss:${memory.outcome}:${killer.templateId}`,
          lineIds: [memory.lineId],
          intents: ['rememberEncounter', 'readWorldDirectorState'],
          sceneId,
        });
        out.push(bossEncounterMemoryEvent(memory, killer, dead.id));
      }
    }
    return out;
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
    const trace = this.worldTraces.traceForScene(context.scene?.subsceneId ?? context.scene?.zoneId, request.pid, request.sim.time);
    if (trace) context.recentObservations.push(`worldTrace:${trace.kind}:${trace.itemId}:${trace.strength.toFixed(2)}`);
    const directorState = this.worldDirector.stateForScene(context.scene?.subsceneId ?? context.scene?.zoneId, request.pid, request.sim.time);
    if (directorState) context.recentObservations.push(`worldDirector:${directorState.mood}:${directorState.itemId}:${directorState.heat.toFixed(2)}`);
    const encounterMemory = this.bossMemory.memoryForScene(context.scene?.subsceneId ?? context.scene?.zoneId, request.pid, request.sim.time);
    if (encounterMemory) context.recentObservations.push(`bossMemory:${encounterMemory.outcome}:${encounterMemory.templateId}:${encounterMemory.heat.toFixed(2)}`);
    const sceneId = context.scene?.subsceneId ?? context.scene?.zoneId;
    const zoneId = context.scene?.zoneId ?? sceneId;
    const sceneRumor = this.socialMemory.rumorForScene(sceneId, request.pid, request.sim.time);
    const regionRumor = sceneRumor ? null : this.socialMemory.rumorForRegion({
      zoneId,
      sceneId,
      playerEntityId: request.pid,
      nowSeconds: request.sim.time,
    });
    const rumor = sceneRumor ?? regionRumor;
    if (sceneRumor) context.recentObservations.push(`${sceneRumor.subjectKind}SceneRumor:${sceneRumor.itemId}:${sceneRumor.strength.toFixed(2)}`);
    if (regionRumor) context.recentObservations.push(`${regionRumor.subjectKind}RegionRumor:${regionRumor.originSceneId}:${regionRumor.itemId}:${regionRumor.strength.toFixed(2)}`);
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
      const traceEvent = worldTraceReactionEvent(context, npc, trace);
      if (traceEvent) events.push(traceEvent);
      const directorEvent = request.topic === 'place'
        ? worldDirectorEvent(context.scene ?? null, npc, directorState, request.pid)
        : null;
      if (directorEvent) events.push(directorEvent);
      events.push(...companionReactionEvents(context));
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
    const sceneId = scene.subsceneId ?? scene.zoneId;
    const reactionLineIds = reactions.map((reaction) => reaction.lineId);
    const trace = this.worldTraces.noteItemTrace({
      sceneId,
      item: dropped,
      sourcePlayerEntityId: request.pid,
      reasonLineIds: reactionLineIds,
      nowSeconds: request.sim.time,
    });
    if (trace) this.worldDirector.noteTrace({ trace, nowSeconds: request.sim.time });
    if (reactions.length > 0) {
      this.socialMemory.noteItemRumor({
        sceneId,
        zoneId: scene.zoneId,
        itemId: dropped.itemId,
        sourcePlayerEntityId: request.pid,
        lineIds: reactionLineIds,
        nowSeconds: request.sim.time,
      });
    }
    if (reactions.length > 0 || trace) {
      this.journal.recordLocalReaction({
        jobId: `local-${request.pid}-${++this.sequence}`,
        trigger: 'item_discarded',
        entityId: player.id,
        templateId: player.templateId,
        playerEntityId: request.pid,
        reason: `discarded:${request.itemId}`,
        lineIds: trace ? [...reactionLineIds, trace.lineId] : reactionLineIds,
        intents: trace ? [...reactions.map((reaction) => reaction.reaction), 'leaveWorldTrace'] : reactions.map((reaction) => reaction.reaction),
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
    for (const reaction of reactions) {
      if (reaction.individual?.tier !== 'singularity') continue;
      const memory = this.creatureMemory.noteSingularityReaction({
        entity: reaction.entity,
        player,
        individual: reaction.individual,
        nowSeconds: request.sim.time,
      });
      const memoryEvent = singularityCreatureMemoryEvent(player, reaction.entity, dropped, memory);
      if (memoryEvent) events.push(memoryEvent);
      this.worldDirector.noteCreatureMemory({
        sceneId,
        itemId: dropped.itemId,
        memory,
        sourcePlayerEntityId: request.pid,
        nowSeconds: request.sim.time,
      });
    }
    if (events.length > 0) request.deliver(events);
  }

  handleObjectInspection(request: ObjectAiInspectionRequest): void {
    if (!this.enabled) return;
    const context = this.buildObjectContext(request);
    if (!context) return;
    const object = request.sim.entities.get(request.objectId);
    if (!object || object.kind !== 'object') return;
    const event = objectInspectionEvent(context, object);
    if (!event) return;
    const events: SimEvent[] = [event];
    events.push(...companionReactionEvents(context));
    const lineIds = event.type === 'aiSpeech' && event.speech.mode === 'lineId' ? [event.speech.lineId] : [];
    const inspectedItem = object.objectItemId ? droppedItemSemantic(object.objectItemId, 0, request.pid) : null;
    if (inspectedItem && context.scene) {
      const reactions = rankItemReactions(
        context.scene,
        inspectedItem,
        nearbyReactionCandidates(context.scene, request.sim.entities.values(), object),
        { worldSeed: request.sim.cfg.seed },
      ).slice(0, 2);
      lineIds.push(...reactions.map((reaction) => reaction.lineId));
      this.socialMemory.noteItemRumor({
        sceneId: context.scene.subsceneId ?? context.scene.zoneId,
        zoneId: context.scene.zoneId,
        itemId: inspectedItem.itemId,
        sourcePlayerEntityId: request.pid,
        lineIds,
        nowSeconds: request.sim.time,
      });
      events.push(...reactions.map((reaction) => ({
        type: 'aiSpeech' as const,
        speakerId: reaction.entity.id,
        speakerName: reaction.entity.name,
        speech: {
          mode: 'lineId' as const,
          lineId: reaction.lineId,
          values: {
            speakerName: reaction.entity.name,
            itemId: inspectedItem.itemId,
            reaction: reaction.reaction,
            score: Math.round(reaction.score * 100),
          },
        },
        source: 'fallback' as const,
        reaction: {
          kind: reaction.reaction,
          targetItemId: inspectedItem.itemId,
          targetObjectId: object.id,
          score: Math.round(reaction.score * 100) / 100,
          sceneTags: [...new Set([...context.scene!.locationTags, ...context.scene!.structureTags, ...context.scene!.environmentalTags])].slice(0, 8),
          individualTier: reaction.individual?.tier,
          individualTraits: reaction.individual?.traits,
        },
        pid: request.pid,
      })));
    }
    this.journal.recordLocalReaction({
      jobId: context.jobId,
      trigger: 'object_inspected',
      entityId: object.id,
      templateId: object.templateId,
      playerEntityId: request.pid,
      reason: `inspect:${object.objectItemId ?? object.templateId}`,
      lineIds,
      intents: ['inspectObject', 'commentOnScene'],
      sceneId: context.scene?.subsceneId ?? context.scene?.zoneId ?? null,
    });
    request.deliver(events);
  }

  handleSceneInspection(request: SceneAiInspectionRequest): void {
    if (!this.enabled) return;
    const player = request.sim.entities.get(request.pid);
    if (!player) return;
    const scene = sceneFrameFor(request.sim, player.pos);
    const sceneId = scene.subsceneId ?? scene.zoneId;
    const trace = this.worldTraces.traceForScene(sceneId, request.pid, request.sim.time);
    const directorState = this.worldDirector.stateForScene(sceneId, request.pid, request.sim.time);
    const encounterMemory = this.bossMemory.memoryForScene(sceneId, request.pid, request.sim.time);
    const event = sceneInspectionEvent(scene, player, trace);
    const events: SimEvent[] = [event];
    const lineIds = event.type === 'aiSpeech' && event.speech.mode === 'lineId' ? [event.speech.lineId] : [];
    if (trace) {
      const tracedItem = droppedItemSemantic(trace.itemId, Math.max(0, request.sim.time - trace.createdAt), trace.sourcePlayerEntityId);
      if (tracedItem) {
        const reactions = rankItemReactions(
          scene,
          tracedItem,
          nearbyReactionCandidates(scene, request.sim.entities.values(), player),
          { worldSeed: request.sim.cfg.seed },
        ).slice(0, 2);
        lineIds.push(...reactions.map((reaction) => reaction.lineId));
        events.push(...reactions.map((reaction) => ({
          type: 'aiSpeech' as const,
          speakerId: reaction.entity.id,
          speakerName: reaction.entity.name,
          speech: {
            mode: 'lineId' as const,
            lineId: reaction.lineId,
            values: {
              speakerName: reaction.entity.name,
              itemId: tracedItem.itemId,
              traceKind: trace.kind,
              reaction: reaction.reaction,
              score: Math.round(reaction.score * 100),
            },
          },
          source: 'fallback' as const,
          reaction: {
            kind: reaction.reaction,
            targetItemId: tracedItem.itemId,
            score: Math.round(reaction.score * 100) / 100,
            sceneTags: [...new Set([...scene.locationTags, ...scene.structureTags, ...scene.environmentalTags, `trace:${trace.kind}`])].slice(0, 8),
            individualTier: reaction.individual?.tier,
            individualTraits: reaction.individual?.traits,
          },
          pid: request.pid,
        })));
      }
    }
    if (!trace) {
      if (encounterMemory) {
        const memoryEvent = bossEncounterMemoryEvent(encounterMemory, player, request.pid);
        events.push(memoryEvent);
        lineIds.push(encounterMemory.lineId);
      }
      const directorEvent = worldDirectorEvent(scene, player, directorState, request.pid);
      if (directorEvent) {
        events.push(directorEvent);
        if (directorEvent.type === 'aiSpeech' && directorEvent.speech.mode === 'lineId') lineIds.push(directorEvent.speech.lineId);
      }
    }
    this.journal.recordLocalReaction({
      jobId: `scene-${request.pid}-${++this.sequence}`,
      trigger: 'scene_inspected',
      entityId: player.id,
      templateId: player.templateId,
      playerEntityId: request.pid,
      reason: `inspectScene:${scene.subsceneId ?? scene.zoneId}`,
      lineIds,
      intents: [
        'inspectObject',
        'commentOnScene',
        ...(trace ? ['reactToWorldTrace'] : []),
        ...(encounterMemory ? ['readEncounterMemory'] : []),
        ...(!trace && directorState ? ['readWorldDirectorState'] : []),
      ],
      sceneId,
    });
    request.deliver(events);
  }

  private playerForEncounterSource(sim: Sim, source: Entity | undefined): Entity | null {
    if (!source) return null;
    if (source.kind === 'player') return this.playerForPid(sim, source.id);
    if (source.kind === 'mob' && source.ownerId !== null) return this.playerForPid(sim, source.ownerId);
    return null;
  }

  private playerForPid(sim: Sim, pid: number | null | undefined): Entity | null {
    if (pid === null || pid === undefined) return null;
    const entity = sim.entities.get(pid);
    return entity?.kind === 'player' ? entity : null;
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

  private buildObjectContext(request: ObjectAiInspectionRequest): AiJobContextV1 | null {
    const player = request.sim.entities.get(request.pid);
    const object = request.sim.entities.get(request.objectId);
    const meta = request.sim.meta(request.pid);
    if (!player || !object || !meta || object.kind !== 'object' || !object.lootable) return null;
    if (dist2d(player.pos, object.pos) > INTERACT_RANGE + 2) return null;
    const kind = aiEntityKind(object);
    if (!kind) return null;
    const profile = profileFor(kind, object.templateId);
    const scene = sceneFrameFor(request.sim, object.pos);
    const questFacts = object.objectItemId
      ? Object.values(QUESTS)
        .map((quest) => {
          const relevant = quest.objectives.some((objective) =>
            (objective.type === 'collect' && objective.itemId === object.objectItemId)
            || (objective.type === 'interact' && objective.targetObjectItemId === object.objectItemId),
          );
          if (!relevant) return null;
          const state = request.sim.questState(quest.id, request.pid);
          if (state !== 'active' && state !== 'ready') return null;
          return {
            questId: quest.id,
            visibility: state === 'active' ? 'currentObjective' as const : 'knownToPlayer' as const,
            summary: quest.name,
            source: 'quest-log',
          };
        })
        .filter((fact): fact is NonNullable<typeof fact> => fact !== null)
      : [];
    return {
      schemaVersion: 1,
      jobId: `ai-${request.pid}-${request.objectId}-${++this.sequence}`,
      trigger: 'object_inspected',
      entity: {
        kind,
        entityId: object.id,
        templateId: object.templateId,
        name: object.name,
        level: object.level,
        questIds: [...object.questIds],
        dead: object.dead,
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
      profile: compactProfileSnapshot(profile),
      scene,
      familySemantics: null,
      questFacts,
      recentObservations: [
        `object:${object.objectItemId ?? object.templateId}`,
        `scene:${scene.subsceneId ?? scene.zoneId}`,
        ...scene.environmentalTags.slice(0, 4).map((tag) => `tag:${tag}`),
      ],
      allowedIntents: profile.allowedIntentTypes,
      allowedLineIds: objectInspectionLineIds(),
      outputMode: 'line_id_only',
    };
  }
}

export function normalizeLocale(locale: string): string {
  const trimmed = locale.trim();
  return /^[a-z]{2}([_-][A-Z]{2})?$/.test(trimmed) ? trimmed : 'en';
}
