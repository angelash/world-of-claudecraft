// Test harness for the tide night (PK-M1-52): the real game with every system and the
// registry guard on, an hour-coarse clock (the long tier of a time skip) the tests switch on
// and off, a small emitter for the dungeon events the surge rules listen to, and the steps of
// a night (stand at a place, begin, wait for a stage, bring the colossus down, wait for dawn).
// The pacing profiles (the player's interventions over act 1 drawn per seed) live here too,
// shared by tests/tide_pacing.test.ts and the playthrough run.

import { expect } from 'vitest';
import type { Engine } from '../src/core';
import { ok } from '../src/core';
import type { AnyWorldEvent, CommandSource, ContentMap, FlagValue } from '../src/core/contracts';
import { hashSeed, Rng } from '../src/core/rng';
import type { GameSystem } from '../src/core/system';
import { TICKS_PER_GAME_HOUR } from '../src/core/time';
import { createGame } from '../src/game/create';
import { allSystems } from '../src/game/registry';
import { applyEffects } from '../src/systems/quests/effects';
import { readTide } from '../src/systems/tide';
import { mapById } from '../src/systems/world';

declare module '../src/core/contracts' {
  interface CommandMap {
    'zz.overflow': { dungeonId: string; toMap?: string };
    'zz.nest': { nestId: string; stage: number };
    'zz.seek': { reason: 'player' | 'mark' | 'threat' };
    'zz.compute': Record<string, never>;
  }
}

export const SCRIPT: CommandSource = { type: 'script', script: 'test' };
export const NPC_SOURCE: CommandSource = { type: 'system', system: 'npc' };
export const H = TICKS_PER_GAME_HOUR;

export function strideSystem(state: { on: boolean }): GameSystem {
  return {
    id: 'zz_stride',
    order: 1,
    clock(world) {
      if (!state.on) return null;
      const t = world.meta.tick;
      return { stride: H - (t % H), hold: null };
    },
  };
}

/** Emits the dungeon events the surge rules listen to (the dungeons system's own events). */
export const zzEmitter: GameSystem = {
  id: 'zz_emitter',
  order: 991,
  commands: {
    'zz.overflow'(ctx, d) {
      ctx.emit(
        'dungeon.overflow',
        d.toMap ? { dungeonId: d.dungeonId, toMap: d.toMap } : { dungeonId: d.dungeonId },
      );
      return ok();
    },
    'zz.nest'(ctx, d) {
      ctx.emit('dungeon.nest_stage', { nestId: d.nestId, stage: d.stage, from: d.stage - 1 });
      return ok();
    },
    // the colossus turns on a door (combat's own event, boss/door_seek.ts)
    'zz.seek'(ctx, d) {
      ctx.emit('combat.door_seek', { entityId: 'zz_colossus', targetId: null, reason: d.reason });
      return ok();
    },
    // a scene's `compute tide_attribution` effect
    'zz.compute'(ctx) {
      applyEffects(ctx, [{ type: 'compute', fn: 'tide_attribution' }]);
      return ok();
    },
  },
};

/** The line of a post place, as the dusk scene names it in `a1_tide_post`. */
export const POST_LINE: Record<string, string> = {
  north_gate: 'north',
  east_gate: 'east',
  south_gate: 'south',
  west_field: 'west',
};

export interface T {
  g: Engine;
  events: AnyWorldEvent[];
  stride: { on: boolean };
}

export const flags = (t: T): Record<string, FlagValue> => t.g.world.meta.flags;
export const night = (t: T) => readTide(t.g.world)?.night;
export const ofKind = <K extends AnyWorldEvent['kind']>(t: T, kind: K) =>
  t.events.filter((e): e is Extract<AnyWorldEvent, { kind: K }> => e.kind === kind);

/** A game in act 1, the story state given as flags (what the quests and disputes wrote). */
export function game(seed = 7, state: Record<string, FlagValue> = {}, content?: ContentMap): T {
  const stride = { on: false };
  const g = createGame({
    seed,
    aiMode: 'off',
    flagPolicy: 'throw',
    content,
    systems: [...allSystems(), strideSystem(stride), zzEmitter],
  });
  const events: AnyWorldEvent[] = [];
  g.onEvents((evs) => events.push(...evs));
  g.queue('flag.set', { key: 'act', value: 'act1' }, SCRIPT);
  for (const [key, value] of Object.entries(state)) g.queue('flag.set', { key, value }, SCRIPT);
  g.step(2);
  stride.on = true;
  return { g, events, stride };
}

export function set(t: T, key: string, value: FlagValue): void {
  t.g.queue('flag.set', { key, value }, SCRIPT);
  t.g.step(1);
}

/** Stand the player at a location of the night's map (the middle of its rectangle). */
export function stand(t: T, place: string, mapId = 'borderstone'): void {
  const map = mapById(t.g.content, mapId);
  const l = map?.locations.find((x) => x.id === place);
  if (!l) throw new Error(`no ${place}`);
  const entityId = t.g.world.slices.world.playerId;
  t.g.queue('world.teleport', { entityId, mapId, x: l.x + l.w / 2, y: l.y + l.h / 2 }, SCRIPT);
  t.g.step(1);
}

export function begin(t: T): void {
  set(t, 'a1_tide_night', true);
}

export function untilStage(t: T, stage: number, max = 40): void {
  for (let i = 0; i < max && flags(t).a1_tide_stage !== stage; i++) t.g.step(1);
  expect(flags(t).a1_tide_stage).toBe(stage);
}

/** The player brings the colossus down (combat writes this flag on the boss's death). */
export function fell(t: T): void {
  set(t, 'boss.dian_colossus.defeated', true);
}

export function toDawn(t: T, max = 40): void {
  for (let i = 0; i < max && !flags(t).a1_beast_tide_cleared; i++) t.g.step(1);
  expect(flags(t).a1_beast_tide_cleared).toBe(true);
}

/**
 * The rest of a night already begun: the post through the waves; at the gate before midnight
 * when the colossus comes (it goes for the player in range when it arrives), unless `away`.
 */
export function playNight(t: T, post: string, opts: { away?: boolean } = {}): void {
  untilStage(t, 2);
  stand(t, opts.away ? post : 'north_gate');
  untilStage(t, 3);
  fell(t);
  toDawn(t);
}

/**
 * A whole night: the player at `post` through the waves (the dusk scene's post names its
 * line; the waves pass in hour-coarse steps, so the post stands for the player's place), near
 * the gate when the colossus comes unless `away`.
 */
export function wholeNight(t: T, post: string, opts: { away?: boolean } = {}): void {
  stand(t, post);
  const line = POST_LINE[post];
  if (line) set(t, 'a1_tide_post', line);
  begin(t);
  playNight(t, post, opts);
}

// ---------------------------------------------------------------------------
// pacing profiles

/** What the player did over act 1, as the flags the node quests and the prep would write. */
export interface Profile {
  state: Record<string, FlagValue>;
  post: string;
  away: boolean;
}

const pick = <V>(rng: Rng, weighted: [V, number][]): V => {
  const total = weighted.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [v, w] of weighted) {
    r -= w;
    if (r <= 0) return v;
  }
  return (weighted[weighted.length - 1] as [V, number])[0];
};

/**
 * A regular route through act 1 (the packet's pacing assumptions): each preparation and each
 * dispute intervention drawn with a share, the trust of the people in a plausible band, the
 * post at dusk, and whether the player is near the gate when the colossus comes.
 */
export function routeProfile(seed: number): Profile {
  const rng = new Rng({ s: hashSeed(seed, 'tide.pacing.route') });
  const s: Record<string, FlagValue> = {};
  const p = (share: number) => rng.next() < share;
  // A1-M11 preparations and the side quests behind them
  if (p(0.7)) s['a1_tide_prep.east_fence'] = true;
  if (p(0.5)) s.a1_culvert_sealed = true;
  if (p(0.4)) s.a1_graveyard_purified = true;
  if (p(0.5)) s.a1_barto_family_safe = true;
  if (p(0.4)) s.a1_boro_calmed = true;
  if (p(0.3)) s.a1_jed_exposed = true;
  if (p(0.3)) s.a1_mill_owner = 'orphanage';
  // the forest dispute: the node facts the runner settles on at dusk
  const forest = pick(rng, [
    ['restored', 0.3],
    ['partial', 0.3],
    ['expelled', 0.1],
    ['broken', 0.3],
  ] as [string, number][]);
  if (forest === 'restored') {
    s.a1_forest_pact_proof = true;
    s.a1_wolf_den = 'cleared';
    s.a1_logger_saved = true;
  } else if (forest === 'partial') s.a1_wolf_den = 'cleared';
  else if (forest === 'expelled') s.a1_eastslope_expelled = true;
  if (forest === 'broken' && p(0.3)) s['a1_tide_prep.eastslope_in'] = true;
  // the witch trial
  const trial = pick(rng, [
    ['cleared', 0.5],
    ['convicted', 0.4],
    ['jailbreak', 0.1],
  ] as [string, number][]);
  if (trial === 'cleared') {
    s.a1_oola_fate = 'cleared';
    s['npc.cassian.doubt'] = 2;
  } else if (trial === 'convicted') {
    s.a1_oola_fate = 'convicted';
    s['npc.cassian.doubt'] = p(0.5) ? 1 : 0;
  } else {
    s.a1_oola_fate = 'fled';
    s.a1_oola_jailbroken = true;
  }
  // tax and bandits
  const moss = pick(rng, [
    ['exposed', 0.25],
    ['puppet', 0.15],
    ['in_power', 0.6],
  ] as [string, number][]);
  if (moss === 'exposed') {
    s.a1_moss_exposed = true;
    s.a1_moss_evidence = 3;
    s.a1_moss_fate = 'arrested';
  } else if (moss === 'puppet') s.a1_moss_fate = 'puppet';
  else {
    s.a1_moss_fate = 'in_power';
    if (p(0.3)) s['dispute.q_a1_d01_tax_and_bandits.choice.moss_cart'] = 'stay_put';
    if (p(0.3)) s.a1_moss_intercepted = true;
  }
  const band = pick(rng, [
    ['absorbed', 0.25],
    ['destroyed', 0.15],
    ['active', 0.6],
  ] as [string, number][]);
  s.a1_oneeye_fate = band;
  if (band === 'active' && p(0.4))
    s['dispute.q_a1_d01_tax_and_bandits.choice.viro_raid'] = 'lie_low';
  // the company, the guild, the tavern and the church
  s['npc.nera.stance'] = pick(rng, [
    ['partner', 0.25],
    ['neutral', 0.45],
    ['bought', 0.15],
    ['hostile', 0.15],
  ] as [string, number][]);
  s['npc.bron.story_level'] = rng.int(0, 3);
  const dris = pick(rng, [
    ['won', 0.3],
    ['yielded', 0.3],
    ['none', 0.4],
  ] as [string, number][]);
  if (dris !== 'none') s.a1_dris_face = dris;
  s['npc.martha.assessment'] = rng.int(-2, 8);
  s.church_suspicion = rng.int(0, 60);
  for (const [who, lo, hi] of [
    ['shiya', 30, 85],
    ['ron', 20, 80],
    ['barto', 30, 70],
    ['isa', 20, 80],
    ['greta', 20, 75],
    ['yeyu', 40, 90],
  ] as [string, number, number][])
    s[`trust.${who}`] = rng.int(lo, hi);
  if (p(0.9)) s['companion.yeyu.recruited'] = true;
  const post = pick(rng, [
    ['east_gate', 0.4],
    ['north_gate', 0.3],
    ['west_field', 0.2],
    ['south_gate', 0.1],
  ] as [string, number][]);
  return { state: s, post, away: !p(0.85) };
}

/** The night's numbers of a run, for the pacing report. */
export interface NightNumbers {
  civilians: number;
  survival: string;
  named: string[];
  injured: string[];
  credit: string;
  struck: boolean;
  weakest: string;
  prosperity: number;
  buildings: number;
}

export function numbers(t: T): NightNumbers {
  const st = night(t);
  const sum = st?.summary;
  return {
    civilians: sum?.civilians ?? -1,
    survival: sum?.survival ?? '',
    named: sum?.named ?? [],
    injured: sum?.injured ?? [],
    credit: sum?.credit ?? '',
    struck: !!st?.struck,
    weakest: st?.weakest ?? '',
    prosperity: sum?.prosperity ?? -1,
    buildings: sum?.buildings.length ?? 0,
  };
}

/** Counts of each value. */
export function tally(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort());
}

/** A one-line pacing summary of a batch of nights. */
export function report(label: string, runs: readonly NightNumbers[]): string {
  const civ = runs.map((r) => r.civilians).sort((a, b) => a - b);
  const median = civ[Math.floor(civ.length / 2)] ?? 0;
  return [
    `[tide] ${label} (${runs.length} seeds)`,
    `civilians min ${civ[0]} median ${median} max ${civ[civ.length - 1]}`,
    `survival ${JSON.stringify(tally(runs.map((r) => r.survival)))}`,
    `named dead ${JSON.stringify(tally(runs.flatMap((r) => r.named)))}`,
    `hurt ${JSON.stringify(tally(runs.flatMap((r) => r.injured)))}`,
    `credit ${JSON.stringify(tally(runs.map((r) => r.credit)))}`,
    `strike ${runs.filter((r) => r.struck).length}`,
    `weakest ${JSON.stringify(tally(runs.map((r) => r.weakest)))}`,
    `prosperity ${Math.min(...runs.map((r) => r.prosperity))} to ${Math.max(...runs.map((r) => r.prosperity))}`,
  ].join('; ');
}
