// Narrative director (phase 75): Moira's fate channel (goddess_gm.md 8, D-035). An
// hourly tension reading decides between a coincidence (when things are too quiet)
// and a respite (when they are too hard). Moves come from a written menu, serve only
// the player's experience, never change combat results, never deliver locked lore,
// and each leaves a fate thread in the miracle ledger as Moira's quiet work.

import type { GameSystem, SystemContext } from '../../core/system';
import { TICKS_PER_GAME_HOUR } from '../../core/time';
import { recordIntervention } from '../goddess/state';
import { registerModifier } from '../modifiers';
import { actIndex } from '../quests/conditions';
import { conditionHolds } from '../quests/effects';
import { forceWeather, playerEntity, type Weather } from '../world';
import { bandFor, type DirectorMove, decide, rawTension, smooth } from './tension';

export * from './tension';

export interface DirectorItemDef {
  id: string;
  kind: 'coincidence' | 'respite';
  label: string;
  /** reveal-ledger condition */
  requires?: string;
  /** only on these maps (empty: anywhere) */
  maps?: string[];
  /** monster pressure factor on the player's map while it lasts */
  monsterFactor?: number;
  /** duration of modifiers and weather in game hours */
  hours?: number;
  weather?: Weather;
  /** one narration line */
  narration: string;
  flag?: { key: string; value: string | number | boolean };
  cooldownHours: number;
  /** Moira's power cost (1 to 5, with the flow) */
  power: number;
  weight?: number;
}

export interface DirectorSlice {
  tension: number;
  /** counters for the current hour */
  kills: number;
  deaths: number;
  threats: number;
  hoursLow: number;
  hoursHigh: number;
  lastCoincidenceTick: number;
  lastRespiteTick: number;
  /** item id -> tick it was last used */
  used: Record<string, number>;
  history: { tick: number; move: Exclude<DirectorMove, null>; item: string }[];
}

declare module '../../core/contracts' {
  interface WorldSlices {
    director: DirectorSlice;
  }
  interface ContentMap {
    directorMenu: DirectorItemDef[];
  }
  interface EventMap {
    'director.move': { move: 'coincidence' | 'respite'; itemId: string; tension: number };
  }
}

const HISTORY_LIMIT = 50;

function hoursSince(ctx: SystemContext, tick: number): number {
  return (ctx.tick - tick) / TICKS_PER_GAME_HOUR;
}

/** Pick a menu item for a move (deterministic score with a small seeded jitter). */
export function pickItem(
  ctx: SystemContext,
  move: Exclude<DirectorMove, null>,
): DirectorItemDef | null {
  const slice = ctx.world.slices.director;
  const mapId = playerEntity(ctx.world)?.mapId ?? '';
  const rng = ctx.rng('director');
  let best: { item: DirectorItemDef; score: number } | null = null;
  for (const item of ctx.content.directorMenu ?? []) {
    if (item.kind !== move) continue;
    if (item.maps && item.maps.length > 0 && !item.maps.includes(mapId)) continue;
    const last = slice.used[item.id];
    if (last !== undefined && hoursSince(ctx, last) < item.cooldownHours) continue;
    if (!conditionHolds(ctx, item.requires)) continue;
    const score = (item.weight ?? 1) + rng.range(0, 0.5);
    if (!best || score > best.score) best = { item, score };
  }
  return best?.item ?? null;
}

export function applyMove(
  ctx: SystemContext,
  move: Exclude<DirectorMove, null>,
  item: DirectorItemDef,
): void {
  const slice = ctx.world.slices.director;
  const mapId = playerEntity(ctx.world)?.mapId ?? '';
  const until = ctx.tick + Math.max(1, item.hours ?? 6) * TICKS_PER_GAME_HOUR;
  if (item.monsterFactor !== undefined && mapId) {
    registerModifier(ctx, {
      target: 'monster',
      key: mapId,
      factor: item.monsterFactor,
      untilTick: until,
      source: 'director',
      visibility: 'hidden',
      note: `命运：${item.label}`,
    });
  }
  if (item.weather) forceWeather(ctx, item.weather, until, 'director');
  ctx.emit('dialogue.line', {
    speakerId: 'narrator',
    speakerName: '',
    text: item.narration,
    kind: 'narrate',
  });
  if (item.flag) ctx.setFlag(item.flag.key, item.flag.value);
  slice.used[item.id] = ctx.tick;
  if (move === 'coincidence') {
    slice.lastCoincidenceTick = ctx.tick;
    ctx.setFlag('fate_threads', Number(ctx.flag('fate_threads') ?? 0) + 1);
  } else slice.lastRespiteTick = ctx.tick;
  slice.history.push({ tick: ctx.tick, move, item: item.id });
  if (slice.history.length > HISTORY_LIMIT) slice.history.shift();
  recordIntervention(ctx, {
    goddess: 'moira',
    action: move,
    mapId,
    power: item.power,
    sediment: Math.round(item.power * 0.01 * 100) / 100,
    public: false,
    breach: false,
    note: `莫伊拉安排的${move === 'coincidence' ? '巧合' : '喘息'}：${item.label}`,
  });
  ctx.emit('director.move', { move, itemId: item.id, tension: slice.tension });
}

function hourly(ctx: SystemContext): void {
  const slice = ctx.world.slices.director;
  const act = String(ctx.flag('act') ?? 'prologue');
  const idx = actIndex(act);
  const gaze = Math.max(
    0,
    ...Object.values(ctx.world.slices.goddess?.goddesses ?? {}).map((g) => g.gaze),
  );
  const beat = ctx.world.slices.quests?.lastBeatTick ?? 0;
  const raw = rawTension({
    kills: slice.kills,
    deaths: slice.deaths,
    threats: slice.threats,
    gaze,
    hoursSinceBeat: hoursSince(ctx, beat),
  });
  slice.tension = smooth(slice.tension, raw);
  slice.kills = 0;
  slice.deaths = 0;
  slice.threats = 0;
  ctx.setFlag('director.tension', Math.round(slice.tension));
  if (Number.isNaN(idx) || idx < 1 || idx > 5) return;
  const band = bandFor(act);
  slice.hoursLow = slice.tension < band.low ? slice.hoursLow + 1 : 0;
  slice.hoursHigh = slice.tension > band.high ? slice.hoursHigh + 1 : 0;
  if (ctx.world.slices.scenes?.current) return;
  const extra = Number(ctx.flag('goddess.moira.interest') ?? 0) >= 2 && act === 'act1' ? 1 : 0;
  const move = decide(
    slice.hoursLow,
    slice.hoursHigh,
    hoursSince(ctx, slice.lastCoincidenceTick),
    hoursSince(ctx, slice.lastRespiteTick),
    extra,
  );
  if (!move) return;
  const item = pickItem(ctx, move);
  if (!item) return;
  applyMove(ctx, move, item);
  if (move === 'coincidence') slice.hoursLow = 0;
  else slice.hoursHigh = 0;
}

export const system: GameSystem = {
  id: 'director',
  order: 75,

  init(ctx) {
    ctx.world.slices.director = {
      tension: 30,
      kills: 0,
      deaths: 0,
      threats: 0,
      hoursLow: 0,
      hoursHigh: 0,
      lastCoincidenceTick: 0,
      lastRespiteTick: 0,
      used: {},
      history: [],
    };
  },

  on: {
    'world.hour'(ctx) {
      hourly(ctx);
    },
    'entity.died'(ctx, e) {
      const slice = ctx.world.slices.director;
      const player = playerEntity(ctx.world);
      if (e.data.id === ctx.world.slices.world.playerId) {
        slice.deaths++;
        return;
      }
      if (player && e.data.mapId === player.mapId && e.data.kind === 'monster') slice.kills++;
    },
    'flag.changed'(ctx, e) {
      if (e.data.key.startsWith('combat.wave.') && e.data.value === 'go')
        ctx.world.slices.director.threats++;
    },
    'goddess.acted'(ctx, e) {
      const player = playerEntity(ctx.world);
      if (
        player &&
        e.data.mapId === player.mapId &&
        (e.data.action === 'calamity' || e.data.action === 'monster_tide')
      ) {
        ctx.world.slices.director.threats++;
      }
    },
  },
};
