export type TimePhase = 'dawn' | 'day' | 'dusk' | 'night';
export type WeatherKind = 'clear' | 'rain' | 'fog' | 'wind' | 'snow';

export interface TimeSemantic {
  hour: number;
  phase: TimePhase;
  isNight: boolean;
  tags: string[];
}

export interface WeatherSemantic {
  kind: WeatherKind;
  intensity: number;
  tags: string[];
}

export interface LightSemantic {
  level: 'bright' | 'dim' | 'dark';
  tags: string[];
}

export interface TimeWeatherMood {
  dayEnergy: number;
  nightFatigue: number;
  clearNightAwe: number;
  rainIrritation: number;
  fogFear: number;
}

const GAME_DAY_SECONDS = 24 * 60;
const WEATHER_BLOCK_SECONDS = 5 * 60;

export function timeSemanticAt(simTimeSeconds: number): TimeSemantic {
  const hour = ((simTimeSeconds % GAME_DAY_SECONDS) + GAME_DAY_SECONDS) % GAME_DAY_SECONDS / 60;
  const phase: TimePhase = hour < 5 ? 'night' : hour < 7 ? 'dawn' : hour < 19 ? 'day' : hour < 21 ? 'dusk' : 'night';
  const tags: string[] = [phase];
  if (phase === 'night') tags.push('starsPossible', 'tiredMortals');
  if (phase === 'dawn') tags.push('coolAir', 'wakingWorld');
  if (phase === 'dusk') tags.push('longShadows', 'workdayEnding');
  if (phase === 'day') tags.push('highVisibility', 'dailyRoutine');
  return { hour: Math.round(hour * 10) / 10, phase, isNight: phase === 'night', tags };
}

export function weatherSemanticAt(zoneId: string, simTimeSeconds: number): WeatherSemantic {
  const block = Math.floor(simTimeSeconds / WEATHER_BLOCK_SECONDS);
  const roll = positiveHash(`${zoneId}:${block}`) % 100;
  if (zoneId === 'thornpeak_heights' && roll >= 70) return { kind: 'snow', intensity: 0.65, tags: ['snow', 'coldWind', 'poorFooting'] };
  if (zoneId === 'mirefen_marsh' && roll >= 60) return { kind: 'fog', intensity: 0.75, tags: ['fog', 'wetWood', 'insectNoise', 'lowVisibility'] };
  if (roll >= 76) return { kind: 'rain', intensity: 0.7, tags: ['rain', 'wetMud', 'shelterWanted'] };
  if (roll >= 63) return { kind: 'wind', intensity: 0.55, tags: ['wind', 'movingBranches'] };
  return { kind: 'clear', intensity: 0.2, tags: ['clearSky'] };
}

export function lightSemanticFor(time: TimeSemantic, weather: WeatherSemantic): LightSemantic {
  if (time.phase === 'night') {
    return weather.kind === 'clear'
      ? { level: 'dark', tags: ['moonlight', 'starrySky'] }
      : { level: 'dark', tags: ['lowLight', 'hiddenSky'] };
  }
  if (time.phase === 'dawn' || time.phase === 'dusk' || weather.kind === 'fog' || weather.kind === 'rain') {
    return { level: 'dim', tags: ['softLight'] };
  }
  return { level: 'bright', tags: ['sunlit'] };
}

export function timeWeatherMood(time: TimeSemantic, weather: WeatherSemantic, light: LightSemantic): TimeWeatherMood {
  return {
    dayEnergy: time.phase === 'day' ? 0.7 : time.phase === 'dawn' ? 0.45 : 0.2,
    nightFatigue: time.isNight ? 0.65 : time.phase === 'dusk' ? 0.35 : 0.1,
    clearNightAwe: time.isNight && light.tags.includes('starrySky') ? 0.8 : 0,
    rainIrritation: weather.kind === 'rain' ? weather.intensity : 0,
    fogFear: weather.kind === 'fog' ? weather.intensity : 0,
  };
}

function positiveHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
