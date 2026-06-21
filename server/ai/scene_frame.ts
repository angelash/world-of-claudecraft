import { ITEMS, MOBS, NPCS } from '../../src/sim/data';
import type { Sim } from '../../src/sim/sim';
import type { Entity, Vec3 } from '../../src/sim/types';
import { dist2d } from '../../src/sim/types';
import { itemSemanticFor } from './item_interest';
import { sceneAnchorAt, sceneSemanticsAt } from './scene_semantics';
import type { LightSemantic, TimeSemantic, WeatherSemantic } from './time_weather_model';
import { timeWeatherMood } from './time_weather_model';

export interface SceneObjectSemantic {
  source: 'entity' | 'sceneAnchor';
  objectId: string;
  entityId: number | null;
  templateId: string;
  displayName: string;
  tags: string[];
  distance: number;
}

export interface DroppedItemSemantic {
  itemId: string;
  displayName: string;
  itemTags: string[];
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'quest' | 'unknown';
  freshnessSeconds: number;
  ownerEntityId: number | null;
  smellTags: string[];
  dangerTags: string[];
  valueSignals: string[];
}

export interface CompanionSemantic {
  entityId: number;
  templateId: string;
  displayName: string;
  tags: string[];
  family: string | null;
}

export interface SceneDangerSemantic {
  undeadPressure: number;
  hostileDensity: number;
  corpseDensity: number;
  recentDeaths: number;
  safeHavenScore: number;
}

export interface SceneFrameV1 {
  zoneId: string;
  subsceneId: string | null;
  biomeTags: string[];
  locationTags: string[];
  structureTags: string[];
  environmentalTags: string[];
  nearbySemanticObjects: SceneObjectSemantic[];
  droppedItems: DroppedItemSemantic[];
  companions: CompanionSemantic[];
  time: TimeSemantic;
  weather: WeatherSemantic;
  light: LightSemantic;
  mood: ReturnType<typeof timeWeatherMood>;
  recentSceneEvents: string[];
  danger: SceneDangerSemantic;
}

export interface SceneFrameOptions {
  droppedItems?: DroppedItemSemantic[];
  recentSceneEvents?: string[];
  excludeEntityIds?: readonly number[];
}

const OBJECT_RADIUS = 28;
const DANGER_RADIUS = 36;
const COMPANION_RADIUS = 18;

export function sceneFrameFor(sim: Sim, pos: Vec3, options: SceneFrameOptions = {}): SceneFrameV1 {
  const scene = sceneSemanticsAt(pos, sim.time);
  return {
    ...scene,
    nearbySemanticObjects: nearbyObjects(sim, pos),
    droppedItems: options.droppedItems ?? [],
    companions: nearbyCompanions(sim, pos, new Set(options.excludeEntityIds ?? [])),
    mood: timeWeatherMood(scene.time, scene.weather, scene.light),
    recentSceneEvents: options.recentSceneEvents ?? [],
    danger: sceneDanger(sim, pos, scene.locationTags, scene.environmentalTags),
  };
}

export function droppedItemSemantic(itemId: string, freshnessSeconds: number, ownerEntityId: number | null): DroppedItemSemantic | null {
  const item = ITEMS[itemId];
  if (!item) return null;
  const semantic = itemSemanticFor(itemId);
  return {
    itemId,
    displayName: item.name,
    itemTags: semantic.itemTags,
    rarity: item.kind === 'quest' ? 'quest' : item.quality === 'poor' ? 'common' : item.quality ?? 'common',
    freshnessSeconds,
    ownerEntityId,
    smellTags: semantic.smellTags,
    dangerTags: semantic.dangerTags,
    valueSignals: semantic.valueSignals,
  };
}

function nearbyObjects(sim: Sim, pos: Vec3): SceneObjectSemantic[] {
  const out: SceneObjectSemantic[] = nearbyAnchorObjects(pos);
  for (const entity of sim.entities.values()) {
    if (entity.kind !== 'object' || !entity.objectItemId) continue;
    const distance = dist2d(pos, entity.pos);
    if (distance > OBJECT_RADIUS) continue;
    const semantic = itemSemanticFor(entity.objectItemId);
    out.push({
      source: 'entity',
      objectId: entity.objectItemId,
      entityId: entity.id,
      templateId: entity.templateId,
      displayName: ITEMS[entity.objectItemId]?.name ?? entity.name,
      tags: semantic.itemTags,
      distance: Math.round(distance * 10) / 10,
    });
  }
  return out.sort((a, b) => a.distance - b.distance).slice(0, 8);
}

function nearbyAnchorObjects(pos: Vec3): SceneObjectSemantic[] {
  const anchor = sceneAnchorAt(pos);
  if (!anchor) return [];
  return anchor.semanticObjects
    .map((object) => {
      const objectPos = { x: anchor.x + (object.dx ?? 0), y: pos.y, z: anchor.z + (object.dz ?? 0) };
      return {
        source: 'sceneAnchor' as const,
        objectId: object.id,
        entityId: null,
        templateId: `scene_anchor:${object.id}`,
        displayName: object.label,
        tags: object.tags,
        distance: Math.round(dist2d(pos, objectPos) * 10) / 10,
      };
    })
    .filter((object) => object.distance <= (anchor.semanticObjects.find((candidate) => candidate.id === object.objectId)?.radius ?? anchor.radius));
}

function nearbyCompanions(sim: Sim, pos: Vec3, excludeEntityIds: ReadonlySet<number>): CompanionSemantic[] {
  const out: Array<{ companion: CompanionSemantic; distance: number; priority: number }> = [];
  for (const entity of sim.entities.values()) {
    if (excludeEntityIds.has(entity.id) || entity.dead) continue;
    const distance = dist2d(pos, entity.pos);
    if (distance > COMPANION_RADIUS) continue;
    if (entity.kind === 'mob' && entity.ownerId !== null) {
      const family = MOBS[entity.templateId]?.family ?? null;
      out.push({
        companion: {
          entityId: entity.id,
          templateId: entity.templateId,
          displayName: entity.name,
          family,
          tags: family ? ['pet', family] : ['pet'],
        },
        distance,
        priority: 0,
      });
      continue;
    }
    if (entity.kind !== 'npc' || !isNpcCompanionLike(entity)) continue;
    out.push({
      companion: {
        entityId: entity.id,
        templateId: entity.templateId,
        displayName: NPCS[entity.templateId]?.name ?? entity.name,
        family: 'humanoid',
        tags: npcCompanionTags(entity),
      },
      distance,
      priority: npcCompanionPriority(entity),
    });
  }
  return out
    .sort((a, b) => a.priority - b.priority || a.distance - b.distance || a.companion.entityId - b.companion.entityId)
    .slice(0, 6)
    .map((entry) => entry.companion);
}

function isNpcCompanionLike(entity: Entity): boolean {
  if (entity.kind !== 'npc') return false;
  return entity.questIds.length > 0
    || entity.vendorItems.length > 0
    || isHighStatusNpc(entity)
    || isInjured(entity);
}

function npcCompanionTags(entity: Entity): string[] {
  const tags = ['npc', 'humanoid'];
  if (entity.questIds.length > 0) tags.push('questNpc');
  if (entity.vendorItems.length > 0) tags.push('vendor');
  if (isHighStatusNpc(entity)) tags.push('highStatus');
  if (isInjured(entity)) tags.push('injured');
  if (dist2d(entity.pos, entity.spawnPos) > 10) tags.push('escortLike');
  return tags;
}

function npcCompanionPriority(entity: Entity): number {
  if (isInjured(entity)) return 1;
  if (isHighStatusNpc(entity)) return 2;
  if (entity.questIds.length > 0) return 3;
  return 4;
}

function isInjured(entity: Entity): boolean {
  return entity.maxHp > 0 && entity.hp > 0 && entity.hp / entity.maxHp <= 0.55;
}

function isHighStatusNpc(entity: Entity): boolean {
  const npc = NPCS[entity.templateId];
  if (!npc) return false;
  return /(marshal|captain|warden|tidewatcher|loremaster|quartermaster|master|keeper)/i.test(`${npc.name} ${npc.title}`);
}

function sceneDanger(sim: Sim, pos: Vec3, locationTags: string[], environmentalTags: string[]): SceneDangerSemantic {
  let undead = environmentalTags.includes('deathPressure') || environmentalTags.includes('undeadMemory') ? 2 : 0;
  let hostile = 0;
  let corpses = 0;
  for (const entity of sim.entities.values()) {
    if (dist2d(pos, entity.pos) > DANGER_RADIUS) continue;
    if (entity.kind === 'mob') {
      const family = MOBS[entity.templateId]?.family;
      if (family === 'undead') undead += entity.dead ? 0.5 : 1;
      if (entity.hostile && !entity.dead) hostile += 1;
      if (entity.dead) corpses += 1;
    }
  }
  const safeHavenScore = locationTags.includes('safeTown') ? 0.85 : locationTags.includes('town') ? 0.65 : 0.1;
  return {
    undeadPressure: Math.min(1, undead / 6),
    hostileDensity: Math.min(1, hostile / 8),
    corpseDensity: Math.min(1, corpses / 5),
    recentDeaths: 0,
    safeHavenScore,
  };
}
