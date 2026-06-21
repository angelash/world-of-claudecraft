import type { Entity, SimEvent } from '../../src/sim/types';
import type { AiJobContextV1 } from './ai_types';
import type { AiNpcMemory, AiRumorMemory } from './social_memory';

export function memoryReactionEvent(
  context: AiJobContextV1,
  speaker: Entity,
  memory: AiNpcMemory,
  rumor: AiRumorMemory | null,
): SimEvent | null {
  if (rumor) {
    return line(context, speaker, 'hudChrome.aiSpeech.memoryRumorEcho', {
      speakerName: speaker.name,
      playerName: context.player.name,
      itemId: rumor.itemId,
    });
  }
  if (memory.interactionCount >= 2) {
    return line(context, speaker, 'hudChrome.aiSpeech.memoryRecognizesPlayer', {
      speakerName: speaker.name,
      playerName: context.player.name,
      count: memory.interactionCount,
    });
  }
  return null;
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
