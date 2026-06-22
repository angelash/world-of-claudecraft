import type { Entity, SimEvent } from '../../src/sim/types';
import type { AiJobContextV1 } from './ai_types';
import { familyDirectorProjectionFor, mobFamilyFromValue } from './director_family_projection';
import { profileDirectorProjectionTags } from './profile_projection';
import type { AiNpcMemory, AiRumorMemory } from './social_memory';

export function topicReactionEvent(
  context: AiJobContextV1,
  speaker: Entity,
  memory: AiNpcMemory,
  rumor: AiRumorMemory | null,
): SimEvent | null {
  switch (context.topic) {
    case 'recent':
      return line(context, speaker, memory.interactionCount >= 2
        ? 'hudChrome.aiSpeech.topicRecentKnown'
        : 'hudChrome.aiSpeech.topicRecentFirstMeet', {
        speakerName: speaker.name,
        playerName: context.player.name,
        count: memory.interactionCount,
      });
    case 'rumor':
      if (rumor) return null;
      return line(context, speaker, 'hudChrome.aiSpeech.topicRumorQuiet', {
        speakerName: speaker.name,
        playerName: context.player.name,
      });
    case 'place':
      return line(context, speaker, 'hudChrome.aiSpeech.topicPlace', {
        speakerName: speaker.name,
        playerName: context.player.name,
      });
    case 'quest_hint':
      return line(context, speaker, context.questFacts.length > 0
        ? 'hudChrome.aiSpeech.topicQuestHint'
        : 'hudChrome.aiSpeech.topicQuestNoHint', {
        speakerName: speaker.name,
        playerName: context.player.name,
      });
    case 'greeting':
    case undefined:
      return null;
  }
}

function line(context: AiJobContextV1, speaker: Entity, lineId: string, values: Record<string, string | number>): SimEvent {
  const projection = topicDirectorProjection(context);
  return {
    type: 'aiSpeech',
    speakerId: speaker.id,
    speakerName: speaker.name,
    speech: { mode: 'lineId', lineId, values },
    source: 'local',
    reaction: {
      kind: projection?.reaction ?? 'inspect',
      ...(projection ? { targetItemId: projection.targetRef } : {}),
      sceneTags: topicSceneTags(context, projection?.reasonTags ?? []),
    },
    pid: context.player.entityId,
  };
}

function topicDirectorProjection(context: AiJobContextV1): { reaction: 'approach' | 'avoid' | 'inspect'; targetRef: string; reasonTags: string[] } | null {
  const family = mobFamilyFromValue(context.familySemantics?.family) ?? (context.entity.kind === 'npc' ? 'humanoid' : null);
  if (!family || !context.directorProposals) return null;
  for (const proposal of context.directorProposals.slice(0, 3)) {
    const projection = familyDirectorProjectionFor(proposal, { family });
    if (!projection) continue;
    return {
      reaction: projection.reaction,
      targetRef: proposal.targetRef,
      reasonTags: [
        ...profileDirectorProjectionTags(context.profile),
        ...projection.reasonTags,
      ],
    };
  }
  return null;
}

function topicSceneTags(context: AiJobContextV1, projectionTags: readonly string[]): string[] {
  return context.scene ? [...new Set([
    ...context.scene.locationTags,
    ...context.scene.structureTags,
    ...context.scene.environmentalTags,
    ...projectionTags,
  ])].slice(0, 8) : [...projectionTags].slice(0, 8);
}
