import type { Entity, SimEvent } from '../../src/sim/types';
import type { AiJobContextV1 } from './ai_types';
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
  return {
    type: 'aiSpeech',
    speakerId: speaker.id,
    speakerName: speaker.name,
    speech: { mode: 'lineId', lineId, values },
    source: 'fallback',
    reaction: {
      kind: 'inspect',
      sceneTags: context.scene ? [...new Set([...context.scene.locationTags, ...context.scene.structureTags, ...context.scene.environmentalTags])].slice(0, 8) : [],
    },
    pid: context.player.entityId,
  };
}
