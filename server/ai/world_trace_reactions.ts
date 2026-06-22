import type { Entity, SimEvent } from '../../src/sim/types';
import type { AiJobContextV1 } from './ai_types';
import type { AiWorldTrace, AiWorldTraceKind } from './world_traces';

export function worldTraceReactionEvent(context: AiJobContextV1, speaker: Entity, trace: AiWorldTrace | null): SimEvent | null {
  if (!trace) return null;
  const lineId = lineIdForTraceKind(trace.kind);
  return {
    type: 'aiSpeech',
    speakerId: speaker.id,
    speakerName: speaker.name,
    speech: {
      mode: 'lineId',
      lineId,
      values: {
        speakerName: speaker.name,
        playerName: context.player.name,
        itemId: trace.itemId,
        traceKind: trace.kind,
        traceStrength: Math.round(trace.strength * 100),
      },
    },
    source: 'local',
    reaction: {
      kind: reactionKindForTrace(trace.kind),
      targetItemId: trace.itemId,
      score: Math.round(trace.strength * 100) / 100,
      sceneTags: context.scene ? [...new Set([
        ...context.scene.locationTags,
        ...context.scene.structureTags,
        ...context.scene.environmentalTags,
        `trace:${trace.kind}`,
      ])].slice(0, 8) : [`trace:${trace.kind}`],
    },
    pid: context.player.entityId,
  };
}

function lineIdForTraceKind(kind: AiWorldTraceKind): string {
  switch (kind) {
    case 'singularity': return 'hudChrome.aiSpeech.worldTraceNpcSingularity';
    case 'cursed': return 'hudChrome.aiSpeech.worldTraceNpcCursed';
    case 'food': return 'hudChrome.aiSpeech.worldTraceNpcFood';
    case 'valuable': return 'hudChrome.aiSpeech.worldTraceNpcValuable';
    case 'generic': return 'hudChrome.aiSpeech.worldTraceNpcGeneric';
  }
}

function reactionKindForTrace(kind: AiWorldTraceKind): 'approach' | 'avoid' | 'inspect' {
  switch (kind) {
    case 'cursed': return 'avoid';
    case 'singularity': return 'inspect';
    case 'food': return 'inspect';
    case 'valuable': return 'inspect';
    case 'generic': return 'inspect';
  }
}
