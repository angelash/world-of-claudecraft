import { zoneAt } from '../../src/sim/data';
import type { Vec3 } from '../../src/sim/types';
import { dist2d } from '../../src/sim/types';
import { lightSemanticFor, timeSemanticAt, weatherSemanticAt } from './time_weather_model';
import type { LightSemantic, TimeSemantic, WeatherSemantic } from './time_weather_model';

export interface SceneAnchor {
  id: string;
  label: string;
  x: number;
  z: number;
  radius: number;
  biomeTags: string[];
  locationTags: string[];
  structureTags: string[];
  environmentalTags: string[];
}

export interface SceneSemantics {
  zoneId: string;
  subsceneId: string | null;
  biomeTags: string[];
  locationTags: string[];
  structureTags: string[];
  environmentalTags: string[];
  time: TimeSemantic;
  weather: WeatherSemantic;
  light: LightSemantic;
}

export const SCENE_ANCHORS: readonly SceneAnchor[] = [
  {
    id: 'eastbrook_forge',
    label: 'Eastbrook Forge',
    x: 8,
    z: 17,
    radius: 14,
    biomeTags: ['vale', 'town'],
    locationTags: ['town', 'marketEdge', 'safeTown'],
    structureTags: ['forge', 'stall', 'house'],
    environmentalTags: ['hotIron', 'sparks', 'workNoise', 'warmLight', 'safeTown'],
  },
  {
    id: 'fallen_chapel',
    label: 'Fallen Chapel',
    x: 80,
    z: 86,
    radius: 30,
    biomeTags: ['vale', 'graveyard'],
    locationTags: ['questSite', 'dungeonEntrance'],
    structureTags: ['ruinedChapel', 'cryptGate', 'brokenBell'],
    environmentalTags: ['graveSoil', 'oldStone', 'undeadMemory', 'deathPressure'],
  },
  {
    id: 'mirror_lake_dock',
    label: 'Mirror Lake Dock',
    x: -64,
    z: 60,
    radius: 24,
    biomeTags: ['vale', 'lake'],
    locationTags: ['dock', 'shore', 'fishing'],
    structureTags: ['dock', 'hut'],
    environmentalTags: ['fishSmell', 'openWater', 'quietRipples', 'moonlitWater'],
  },
  {
    id: 'fenbridge_bridge',
    label: 'Fenbridge Bridge',
    x: 0,
    z: 300,
    radius: 28,
    biomeTags: ['marsh', 'causeway'],
    locationTags: ['town', 'bridge', 'gate', 'safeTown'],
    structureTags: ['bridge', 'watchPost'],
    environmentalTags: ['wetWood', 'marshFog', 'chokePoint', 'insectNoise'],
  },
  {
    id: 'drowned_chapel_reeds',
    label: 'Drowned Chapel Reeds',
    x: 100,
    z: 435,
    radius: 36,
    biomeTags: ['marsh', 'graveyard', 'lake'],
    locationTags: ['questSite', 'shore'],
    structureTags: ['ruinedChapel', 'drownedStones'],
    environmentalTags: ['graveSoil', 'marshFog', 'wetStone', 'undeadMemory'],
  },
  {
    id: 'highwatch_tower',
    label: 'Highwatch Tower',
    x: 0,
    z: 660,
    radius: 30,
    biomeTags: ['peaks', 'highland'],
    locationTags: ['town', 'watchPost', 'gate', 'safeTown'],
    structureTags: ['tower', 'wall', 'forge'],
    environmentalTags: ['coldWind', 'highView', 'militaryOrder', 'thinAir'],
  },
  {
    id: 'abandoned_crypt_entrance',
    label: 'Abandoned Crypt Entrance',
    x: -152,
    z: 610,
    radius: 26,
    biomeTags: ['peaks', 'graveyard'],
    locationTags: ['dungeonEntrance', 'questSite'],
    structureTags: ['cryptGate', 'oldStone'],
    environmentalTags: ['sealedAir', 'deathPressure', 'graveSoil', 'oldBlood'],
  },
];

export function sceneSemanticsAt(pos: Vec3, simTimeSeconds: number): SceneSemantics {
  const zone = zoneAt(pos.z);
  const zoneId = zone.id;
  const anchor = nearestAnchor(pos);
  const baseBiomeTags = zoneId === 'eastbrook_vale'
    ? ['vale', 'forest']
    : zoneId === 'mirefen_marsh'
      ? ['marsh', 'wetland']
      : ['peaks', 'highland'];
  const time = timeSemanticAt(simTimeSeconds);
  const weather = weatherSemanticAt(zoneId, simTimeSeconds);
  const light = lightSemanticFor(time, weather);
  return {
    zoneId,
    subsceneId: anchor?.id ?? null,
    biomeTags: mergeUnique(baseBiomeTags, anchor?.biomeTags),
    locationTags: mergeUnique(anchor?.locationTags ?? [], dist2d(pos, { x: zone.hub.x, y: pos.y, z: zone.hub.z }) <= zone.hub.radius ? ['town', 'safeTown'] : []),
    structureTags: [...(anchor?.structureTags ?? [])],
    environmentalTags: mergeUnique([...(anchor?.environmentalTags ?? []), ...weather.tags, ...light.tags], time.tags),
    time,
    weather,
    light,
  };
}

function nearestAnchor(pos: Vec3): SceneAnchor | null {
  let best: SceneAnchor | null = null;
  let bestD = Infinity;
  for (const anchor of SCENE_ANCHORS) {
    const d = Math.hypot(anchor.x - pos.x, anchor.z - pos.z);
    if (d <= anchor.radius && d < bestD) {
      best = anchor;
      bestD = d;
    }
  }
  return best;
}

function mergeUnique(...sets: Array<readonly string[] | undefined>): string[] {
  return [...new Set(sets.flatMap((set) => [...(set ?? [])]))];
}
