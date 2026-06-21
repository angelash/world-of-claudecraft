import type { Entity, SimEvent } from '../../src/sim/types';
import type { AiNpcInteractionTopic } from '../../src/world_api';
import type { CompactFamilySemantics } from './family_semantics';
import type { SceneFrameV1 } from './scene_frame';

export type AiEntityKind = 'npc' | 'mob' | 'object';
export type AiOutputMode = 'line_id_only' | 'dynamic_text_experiment' | 'mixed_living_world';

export interface AiEntitySnapshot {
  kind: AiEntityKind;
  entityId: number;
  templateId: string;
  name: string;
  level: number;
  questIds: string[];
  dead: boolean;
}

export interface AiPlayerSnapshot {
  entityId: number;
  name: string;
  level: number;
  classId: string;
  activeQuestIds: string[];
  completedQuestIds: string[];
}

export interface AiQuestFact {
  questId: string;
  visibility: 'knownToPlayer' | 'currentObjective' | 'nearbyClue' | 'rumored';
  summary: string;
  stageId?: string;
  source: string;
}

export interface AiProfileSnapshot {
  profileId: string;
  persona: string;
  knowledgeScope: string[];
  tabooTopics: string[];
  socialMemory?: {
    style: string;
    recognitionLineId: string;
    rumorLineId: string;
  };
}

export interface AiJobContextV1 {
  schemaVersion: 1;
  jobId: string;
  trigger: 'npc_gossip_opened' | 'npc_question' | 'object_inspected' | 'singularity_candidate';
  entity: AiEntitySnapshot;
  player: AiPlayerSnapshot;
  locale: string;
  topic?: AiNpcInteractionTopic;
  profile?: AiProfileSnapshot;
  scene?: SceneFrameV1;
  familySemantics?: CompactFamilySemantics | null;
  questFacts: AiQuestFact[];
  recentObservations: string[];
  allowedIntents: AiIntentType[];
  allowedLineIds?: string[];
  outputMode: AiOutputMode;
}

export type AiIntentType =
  | 'lookAt'
  | 'faceEntity'
  | 'emote'
  | 'pause'
  | 'commentOnScene'
  | 'approachObject'
  | 'avoidObject'
  | 'inspectObject'
  | 'seekShelter'
  | 'showGossipOptions'
  | 'questHint';

export type AiSpeech =
  | { mode: 'lineId'; lineId: string; values?: Record<string, string | number> }
  | { mode: 'dynamicText'; language: string; text: string };

export interface AiDecisionV1 {
  schemaVersion: 1;
  jobId: string;
  entityRef: { kind: AiEntityKind; entityId: number; templateId: string };
  ttlMs: number;
  confidence: number;
  speech: AiSpeech[];
  intents: Array<{ type: AiIntentType; lineId?: string }>;
  audit: {
    shortReason: string;
    usedPlayerInput: boolean;
    safetyNotes: string[];
  };
}

export interface AiProvider {
  decide(context: AiJobContextV1): Promise<AiDecisionV1>;
}

export interface AiValidationResult {
  ok: boolean;
  events: SimEvent[];
  reason?: string;
}

export function aiEntityKind(entity: Entity): AiEntityKind | null {
  if (entity.kind === 'npc' || entity.kind === 'mob' || entity.kind === 'object') return entity.kind;
  return null;
}
