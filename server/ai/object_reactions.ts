import type { Entity, SimEvent } from '../../src/sim/types';
import type { AiJobContextV1 } from './ai_types';
import { itemSemanticFor } from './item_interest';

const OBJECT_INSPECT_LINE_IDS = [
  'hudChrome.aiSpeech.objectInspectForge',
  'hudChrome.aiSpeech.objectInspectGrave',
  'hudChrome.aiSpeech.objectInspectLake',
  'hudChrome.aiSpeech.objectInspectDoor',
  'hudChrome.aiSpeech.objectInspectSingularity',
  'hudChrome.aiSpeech.objectInspectGeneric',
] as const;

export type ObjectInspectLineId = typeof OBJECT_INSPECT_LINE_IDS[number];

export function objectInspectionLineIds(): string[] {
  return [...OBJECT_INSPECT_LINE_IDS];
}

export function objectInspectionEvent(context: AiJobContextV1, object: Entity): SimEvent | null {
  if (object.kind !== 'object' || !context.scene) return null;
  const itemId = object.objectItemId ?? undefined;
  const itemSemantic = itemId ? itemSemanticFor(itemId) : null;
  const lineId = lineIdForObject(context, object, itemSemantic?.itemTags ?? [], itemSemantic?.dangerTags ?? []);
  const sceneTags = [...new Set([
    ...context.scene.locationTags,
    ...context.scene.structureTags,
    ...context.scene.environmentalTags,
  ])].slice(0, 8);
  const values: Record<string, string | number> = {
    objectEntityId: object.id,
    objectTemplateId: object.templateId,
    objectName: object.name,
    sceneId: context.scene.subsceneId ?? context.scene.zoneId,
  };
  if (itemId) values.itemId = itemId;
  const reaction = itemId
    ? { kind: 'inspect' as const, targetItemId: itemId, targetObjectId: object.id, sceneTags }
    : { kind: 'inspect' as const, targetObjectId: object.id, sceneTags };
  return {
    type: 'aiSpeech',
    speakerId: object.id,
    speakerName: object.name,
    speech: { mode: 'lineId', lineId, values },
    source: 'local',
    reaction,
    pid: context.player.entityId,
  };
}

function lineIdForObject(
  context: AiJobContextV1,
  object: Entity,
  itemTags: readonly string[],
  dangerTags: readonly string[],
): ObjectInspectLineId {
  const scene = context.scene;
  if (object.dungeonId || object.templateId === 'dungeon_door' || object.templateId === 'dungeon_exit') {
    return 'hudChrome.aiSpeech.objectInspectDoor';
  }
  const tags = new Set([
    ...itemTags,
    ...dangerTags,
    ...(scene?.locationTags ?? []),
    ...(scene?.structureTags ?? []),
    ...(scene?.environmentalTags ?? []),
  ]);
  if (tags.has('singularity') || tags.has('unknownPower')) return 'hudChrome.aiSpeech.objectInspectSingularity';
  if (tags.has('grave') || tags.has('cursed') || tags.has('undead') || tags.has('undeadMemory') || tags.has('deathPressure') || tags.has('graveSoil') || tags.has('cryptGate')) {
    return 'hudChrome.aiSpeech.objectInspectGrave';
  }
  if (tags.has('forge') || tags.has('hotIron') || tags.has('weapon') || tags.has('armor') || tags.has('metal')) {
    return 'hudChrome.aiSpeech.objectInspectForge';
  }
  if (tags.has('dock') || tags.has('shore') || tags.has('fishing') || tags.has('openWater') || tags.has('moonlitWater') || tags.has('fishSmell')) {
    return 'hudChrome.aiSpeech.objectInspectLake';
  }
  return 'hudChrome.aiSpeech.objectInspectGeneric';
}
