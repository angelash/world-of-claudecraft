import { NPCS, QUESTS } from '../../src/sim/data';
import type { Sim } from '../../src/sim/sim';
import { INTERACT_RANGE, dist2d } from '../../src/sim/types';
import type { SimEvent } from '../../src/sim/types';
import type { AiJobContextV1, AiProvider } from './ai_types';
import { aiEntityKind } from './ai_types';
import { classifyCanonSubject } from './canon_guard';
import { CodexCliProvider } from './codex_worker';
import { FakeAiProvider } from './fake_ai_provider';
import { validateAiDecision } from './intent_validator';
import { profileFor } from './profiles';

export interface AiLifeLayerOptions {
  enabled?: boolean;
  provider?: AiProvider;
  useCodex?: boolean;
}

export interface NpcAiInteractionRequest {
  sim: Sim;
  pid: number;
  npcId: number;
  locale: string;
  deliver(events: SimEvent[]): void;
}

export class AiLifeLayer {
  private readonly enabled: boolean;
  private readonly provider: AiProvider;
  private sequence = 0;

  constructor(options: AiLifeLayerOptions = {}) {
    this.enabled = options.enabled ?? process.env.AI_LIVING_WORLD_EXPERIMENT === '1';
    this.provider = options.provider ?? (options.useCodex || process.env.AI_CODEX_CLI === '1'
      ? new CodexCliProvider()
      : new FakeAiProvider());
  }

  async handleNpcInteraction(request: NpcAiInteractionRequest): Promise<void> {
    if (!this.enabled) return;
    const context = this.buildNpcContext(request);
    if (!context) return;
    const npc = request.sim.entities.get(request.npcId);
    if (!npc) return;
    const subject = classifyCanonSubject(npc);
    const decision = await this.provider.decide(context);
    const result = validateAiDecision({ decision, context, entity: npc, subject });
    if (result.ok && result.events.length > 0) {
      request.deliver(result.events);
    }
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
      trigger: 'npc_gossip_opened',
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
      questFacts,
      recentObservations: [],
      allowedIntents: profile.allowedIntentTypes,
      outputMode: 'line_id_only',
    };
  }
}

export function normalizeLocale(locale: string): string {
  const trimmed = locale.trim();
  return /^[a-z]{2}([_-][A-Z]{2})?$/.test(trimmed) ? trimmed : 'en';
}
