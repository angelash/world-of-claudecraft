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
  semanticObjects: SceneAnchorObject[];
}

export interface SceneAnchorObject {
  id: string;
  label: string;
  tags: string[];
  featureTags: string[];
  affordanceTags: string[];
  dx?: number;
  dz?: number;
  radius?: number;
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
    radius: 36,
    biomeTags: ['vale', 'town'],
    locationTags: ['town', 'marketEdge', 'safeTown'],
    structureTags: ['forge', 'stall', 'house'],
    environmentalTags: ['hotIron', 'sparks', 'workNoise', 'warmLight', 'safeTown'],
    semanticObjects: [
      { id: 'eastbrook_forge_hearth', label: 'Forge Hearth', tags: ['forge', 'hotIron', 'sparks', 'workNoise'], featureTags: ['orangeCoals', 'hammerMarks', 'sootBlackenedStone'], affordanceTags: ['warmHands', 'repairGear', 'avoidHeat'], dx: 0, dz: 0, radius: 10 },
      { id: 'eastbrook_smithy_house', label: 'Smithy House', tags: ['house', 'warmLight', 'safeTown', 'livedIn'], featureTags: ['litWindows', 'smokeCurl', 'stackedFirewood'], affordanceTags: ['seekShelter', 'askForHelp', 'restNearDoor'], dx: -5, dz: 4, radius: 12 },
      { id: 'eastbrook_market_stall', label: 'Market Stall', tags: ['stall', 'marketEdge', 'coin', 'footTraffic'], featureTags: ['hangingCloth', 'countingTray', 'scuffedCounter'], affordanceTags: ['haggle', 'sniffGoods', 'watchCrowd'], dx: 7, dz: -3, radius: 11 },
      { id: 'eastbrook_apothecary_bench', label: 'Apothecary Bench', tags: ['alchemy', 'herb', 'safeTown', 'quiet'], featureTags: ['dryingBundles', 'glassVials', 'mortarDust'], affordanceTags: ['sniffHerbs', 'askRemedy', 'handleCarefully'], dx: 3, dz: -20, radius: 12 },
      { id: 'eastbrook_wayside_shrine', label: 'Wayside Shrine', tags: ['shrine', 'prayerMemory', 'quiet', 'safeTown'], featureTags: ['waxDrips', 'prayerRibbons', 'weatheredIcon'], affordanceTags: ['offerPrayer', 'lowerVoice', 'readInscription'], dx: -22, dz: -27, radius: 12 },
    ],
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
    semanticObjects: [
      { id: 'fallen_chapel_altar', label: 'Broken Chapel Altar', tags: ['ruinedChapel', 'oldStone', 'graveSoil', 'prayerMemory'], featureTags: ['crackedSlate', 'meltedCandles', 'freshScratches'], affordanceTags: ['prayUneasily', 'inspectOfferings', 'avoidDesecration'], dx: -2, dz: 1, radius: 18 },
      { id: 'fallen_chapel_bell', label: 'Broken Bell', tags: ['brokenBell', 'oldStone', 'silence', 'undeadMemory'], featureTags: ['splitBronze', 'ropeFray', 'birdDroppings'], affordanceTags: ['listenForEcho', 'startleAtSound', 'hideBehindStone'], dx: 5, dz: -6, radius: 14 },
      { id: 'fallen_crypt_gate', label: 'Crypt Gate', tags: ['cryptGate', 'sealedAir', 'deathPressure', 'dungeonEntrance'], featureTags: ['rustedBars', 'coldDraft', 'boneDust'], affordanceTags: ['hesitateAtThreshold', 'guardEntrance', 'fleeFromDark'], dx: 0, dz: 10, radius: 16 },
    ],
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
    semanticObjects: [
      { id: 'mirror_lake_planks', label: 'Weathered Dock Planks', tags: ['dock', 'wetWood', 'fishSmell', 'footTraffic'], featureTags: ['slickBoards', 'ropeCoils', 'fishScales'], affordanceTags: ['sniffFish', 'paceCarefully', 'peerBelow'], dx: 0, dz: 0, radius: 16 },
      { id: 'mirror_lake_hut', label: 'Lake Hut', tags: ['hut', 'shore', 'shelter', 'fishing'], featureTags: ['patchedRoof', 'netHooks', 'oilLamp'], affordanceTags: ['seekShelter', 'borrowBait', 'listenAtDoor'], dx: -6, dz: 5, radius: 14 },
      { id: 'mirror_lake_waterline', label: 'Quiet Waterline', tags: ['openWater', 'quietRipples', 'moonlitWater', 'reflection'], featureTags: ['softRipples', 'silverReflections', 'muddyBank'], affordanceTags: ['drinkWater', 'watchReflection', 'avoidDeepWater'], dx: 8, dz: -4, radius: 18 },
    ],
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
    semanticObjects: [
      { id: 'fenbridge_planks', label: 'Fenbridge Planks', tags: ['bridge', 'wetWood', 'chokePoint', 'footTraffic'], featureTags: ['muddyBootprints', 'looseBoards', 'waterStains'], affordanceTags: ['blockPath', 'listenForSteps', 'crossCarefully'], dx: 0, dz: 0, radius: 18 },
      { id: 'fenbridge_gatepost', label: 'Gatepost', tags: ['gate', 'watchPost', 'militaryOrder', 'safeTown'], featureTags: ['knifeMarks', 'watchLantern', 'postedNotice'], affordanceTags: ['standGuard', 'readNotice', 'signalTown'], dx: -7, dz: 4, radius: 14 },
      { id: 'fenbridge_reeds', label: 'Marsh Reeds', tags: ['marshFog', 'insectNoise', 'shore', 'lowVisibility'], featureTags: ['tallReeds', 'buzzingGnats', 'mudChannels'], affordanceTags: ['hideInReeds', 'avoidBitingInsects', 'trackRipples'], dx: 8, dz: -5, radius: 16 },
    ],
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
    semanticObjects: [
      { id: 'drowned_chapel_stones', label: 'Drowned Chapel Stones', tags: ['ruinedChapel', 'drownedStones', 'wetStone', 'graveSoil'], featureTags: ['waterlineStains', 'lichenScript', 'sunkenTiles'], affordanceTags: ['stepAroundWater', 'readOldMarks', 'feelWatched'], dx: 0, dz: 0, radius: 20 },
      { id: 'drowned_reed_bed', label: 'Reed Bed', tags: ['marshFog', 'shore', 'lowVisibility', 'insectNoise'], featureTags: ['bentReeds', 'floatingPollen', 'hiddenTracks'], affordanceTags: ['hideInReeds', 'trackMovement', 'avoidAmbush'], dx: 9, dz: -4, radius: 18 },
    ],
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
    semanticObjects: [
      { id: 'highwatch_tower_wall', label: 'Tower Wall', tags: ['tower', 'wall', 'highView', 'militaryOrder'], featureTags: ['windCutStone', 'arrowSlits', 'frostEdges'], affordanceTags: ['scanRoad', 'takeCover', 'leanIntoWind'], dx: 0, dz: 0, radius: 18 },
      { id: 'highwatch_signal_fire', label: 'Signal Fire', tags: ['watchPost', 'coldWind', 'warning', 'safeTown'], featureTags: ['stackedPitch', 'smokeTrail', 'charredBasin'], affordanceTags: ['warmHands', 'signalDanger', 'watchSmoke'], dx: 7, dz: -5, radius: 14 },
      { id: 'highwatch_field_forge', label: 'Field Forge', tags: ['forge', 'hotIron', 'militaryOrder', 'workNoise'], featureTags: ['travelAnvil', 'dentedHelms', 'coalCrate'], affordanceTags: ['repairGear', 'warmHands', 'watchSoldiers'], dx: -6, dz: 6, radius: 12 },
    ],
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
    semanticObjects: [
      { id: 'abandoned_crypt_gate', label: 'Abandoned Crypt Gate', tags: ['cryptGate', 'sealedAir', 'oldStone', 'dungeonEntrance'], featureTags: ['ironFrost', 'scratchedWarnings', 'breathMist'], affordanceTags: ['hesitateAtThreshold', 'guardEntrance', 'listenForDead'], dx: 0, dz: 0, radius: 18 },
      { id: 'abandoned_crypt_steps', label: 'Sunken Steps', tags: ['oldStone', 'graveSoil', 'oldBlood', 'deathPressure'], featureTags: ['bloodDarkGrout', 'unevenSteps', 'boneChips'], affordanceTags: ['backAway', 'followTracks', 'feelWatched'], dx: 4, dz: 7, radius: 14 },
    ],
  },
];

export function sceneSemanticsAt(pos: Vec3, simTimeSeconds: number): SceneSemantics {
  const zone = zoneAt(pos.z);
  const zoneId = zone.id;
  const anchor = sceneAnchorAt(pos);
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

export function sceneAnchorAt(pos: Vec3): SceneAnchor | null {
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
