import { ITEMS, MOBS } from '../../src/sim/data';
import type { Sim } from '../../src/sim/sim';
import type { Entity, Vec3 } from '../../src/sim/types';
import { dist2d } from '../../src/sim/types';
import { itemSemanticFor } from './item_interest';
import { sceneSemanticsAt } from './scene_semantics';
import type { LightSemantic, TimeSemantic, WeatherSemantic } from './time_weather_model';
import { timeWeatherMood } from './time_weather_model';

export interface SceneObjectSemantic {
  objectId: string;
  entityId: number;
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
    companions: nearbyCompanions(sim, pos),
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
  const out: SceneObjectSemantic[] = [];
  for (const entity of sim.entities.values()) {
    if (entity.kind !== 'object' || !entity.objectItemId) continue;
    const distance = dist2d(pos, entity.pos);
    if (distance > OBJECT_RADIUS) continue;
    const semantic = itemSemanticFor(entity.objectItemId);
    out.push({
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

function nearbyCompanions(sim: Sim, pos: Vec3): CompanionSemantic[] {
  const out: CompanionSemantic[] = [];
  for (const entity of sim.entities.values()) {
    if (entity.kind !== 'mob' || entity.ownerId === null) continue;
    const distance = dist2d(pos, entity.pos);
    if (distance > COMPANION_RADIUS) continue;
    const family = MOBS[entity.templateId]?.family ?? null;
    out.push({
      entityId: entity.id,
      templateId: entity.templateId,
      displayName: entity.name,
      family,
      tags: family ? ['pet', family] : ['pet'],
    });
  }
  return out;
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
