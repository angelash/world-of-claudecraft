import type { Entity, SimEvent } from '../../src/sim/types';
import type { AiNpcInteractionTopic } from '../../src/world_api';
import type { CompactFamilySemantics } from './family_semantics';
import type { SceneFrameV1 } from './scene_frame';
import type { AiWorldDirectorProposal } from './world_director';

export type AiEntityKind = 'npc' | 'mob' | 'object';
export type AiOutputMode = 'line_id_only' | 'dynamic_text_experiment' | 'mixed_living_world';
export type AiMemoryAuditKind =
  | 'npcInteraction'
  | 'rumor'
  | 'worldTrace'
  | 'creatureMemory'
  | 'bossMemory'
  | 'worldDirectorState';

export type AiMemoryAuditScope = 'entity' | 'scene' | 'region' | 'encounter';

export interface AiMemoryAuditRecord {
  kind: AiMemoryAuditKind;
  refId: string;
  scope: AiMemoryAuditScope;
  sceneId?: string;
  zoneId?: string;
  sourcePlayerEntityId: number;
  entityId?: number;
  templateId?: string;
  itemId?: string;
  questId?: string;
  subjectKind?: 'item' | 'quest' | 'encounter' | 'scene';
  lineIds: string[];
  salience: number;
  createdAt?: number;
  expiresAt?: number;
  reason: string;
}

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

export interface AiSpeechFingerprint {
  sentenceRhythm: string;
  addressStyle: string;
  favoriteStarts: string[];
  sensoryBias: string[];
  avoidedPhrases: string[];
}

export interface AiProfileSnapshot {
  profileId: string;
  persona: string;
  knowledgeScope: string[];
  tabooTopics: string[];
  speechFingerprint?: AiSpeechFingerprint;
  socialMemory?: {
    style: string;
    recognitionLineId: string;
    rumorLineId: string;
    questRumorLineId?: string;
  };
}

export interface AiJobContextV1 {
  schemaVersion: 1;
  jobId: string;
  trigger:
    | 'npc_gossip_opened'
    | 'npc_question'
    | 'object_inspected'
    | 'singularity_candidate'
    | 'pet_command'
    | 'active_poll'
    | 'active_event';
  entity: AiEntitySnapshot;
  player: AiPlayerSnapshot;
  locale: string;
  topic?: AiNpcInteractionTopic;
  profile?: AiProfileSnapshot;
  scene?: SceneFrameV1;
  familySemantics?: CompactFamilySemantics | null;
  questFacts: AiQuestFact[];
  recentObservations: string[];
  memorySignals?: AiMemoryAuditRecord[];
  directorProposals?: AiWorldDirectorProposal[];
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
  | 'questHint'
  | 'commandPetPassive'
  | 'commandPetDefensive'
  | 'commandPetAggressive'
  | 'commandPetAttack'
  | 'commandPetTaunt'
  | 'commandPetIgnore';

export type AiSpeech =
  | { mode: 'lineId'; lineId: string; values?: Record<string, string | number> }
  | { mode: 'dynamicText'; language: string; text: string };

export interface AiIntent {
  type: AiIntentType;
  lineId?: string;
  targetEntityId?: number;
  targetObjectId?: number;
  targetItemId?: string;
  seconds?: number;
}

export interface AiDecisionV1 {
  schemaVersion: 1;
  jobId: string;
  entityRef: { kind: AiEntityKind; entityId: number; templateId: string };
  ttlMs: number;
  confidence: number;
  speech: AiSpeech[];
  intents: AiIntent[];
  audit: {
    shortReason: string;
    usedPlayerInput: boolean;
    safetyNotes: string[];
  };
}

export interface AiProviderTimingStep {
  key: string;
  label: string;
  ms: number;
}

export interface AiProviderTimingSnapshot {
  provider: string;
  totalMs: number;
  steps: AiProviderTimingStep[];
}

export interface AiProviderDecisionResult {
  decision: AiDecisionV1;
  promptText?: string;
  rawOutput?: string;
  providerTimings?: AiProviderTimingSnapshot;
}

export type AiProviderOutput = AiDecisionV1 | AiProviderDecisionResult;

export interface AiProvider {
  decide(context: AiJobContextV1): Promise<AiProviderOutput>;
  warmup?(): void;
  close?(): void;
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
