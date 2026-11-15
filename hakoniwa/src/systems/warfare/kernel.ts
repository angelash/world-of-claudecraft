// The battle kernel shared by manual and auto battles (warfare_rts.md 2.4): build the
// runtime state from a setup, then advance it one fixed step (0.2 battle seconds) at a
// time: reinforcements, AI orders, movement, contact resolution, morale, objectives.
// Pure over plain data; the only randomness is the battle's own Rng state.

import type { FlagValue } from '../../core/contracts';
import { chooseUtilityPlan, runHeroAi, runTeamAi } from './ai';
import { FORMATIONS, fatigueSpeedFactor, isRanged, regimentRadius } from './combat_math';
import { active, dist, flagsAllow, type KernelData, onField, pushLog, unitOf } from './data';
import { contactRange, HERO_RADIUS, meleeContact, resolveContacts, shootRange } from './engage';
import { heroFromSpec } from './heroes';
import { updateMorale } from './morale';
import { updateObjectives } from './objectives';
import {
  findBattlePath,
  lineClear,
  nearestPassable,
  passableTile,
  TERRAIN,
  terrainAt,
} from './terrain';
import type {
  BattleSetup,
  BattleState,
  HeroState,
  PlanId,
  RegimentSpec,
  RegimentState,
  Team,
} from './types';

/** Kernel step in battle seconds (regiments resolve at 5 Hz). */
export const STEP_SECONDS = 0.2;
/** AI re-targets every this many steps (2 battle seconds). */
export const AI_EVERY = 10;
export const HERO_SPEED = 2.4;

export interface CreateBattleOptions {
  id: string;
  scenarioId: string;
  seed: number;
  data: KernelData;
  mode: 'manual' | 'auto';
  flags?: Record<string, FlagValue>;
  playerLevel?: number;
  moraleBonus?: Partial<Record<Team, number>>;
}

function regimentFromSpec(
  spec: RegimentSpec,
  team: Team,
  data: KernelData,
  facing: number,
  baseMorale: number,
): RegimentState {
  const u = unitOf(data, spec.typeId);
  const formation = spec.formation ?? u.formations[0] ?? 'line';
  return {
    id: spec.id,
    typeId: spec.typeId,
    team,
    controller: team === 'enemy' ? 'ai' : (spec.controller ?? 'player'),
    name: spec.name ?? u.name,
    count: spec.count,
    maxCount: spec.count,
    x: spec.x,
    y: spec.y,
    facing,
    formation,
    state: 'idle',
    morale: Math.min(100, u.morale + (spec.general ? 5 : 0) + baseMorale),
    fatigue: 0,
    order: null,
    path: [],
    dmgAcc: 0,
    brokenUntil: 0,
    losses: [],
    general: spec.general,
  };
}

function facingToward(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function createBattleState(setup: BattleSetup, o: CreateBattleOptions): BattleState {
  const flags = o.flags;
  const playerLevel = o.playerLevel ?? 10;
  const pRetreat = setup.teams.player.retreat;
  const eRetreat = setup.teams.enemy.retreat;
  const facing: Record<Team, number> = {
    player: facingToward(pRetreat, eRetreat),
    enemy: facingToward(eRetreat, pRetreat),
  };
  const regiments: RegimentState[] = [];
  const heroes: HeroState[] = [];
  const moraleBonus: Partial<Record<Team, number>> = {
    player: (o.moraleBonus?.player ?? 0) + (setup.teams.player.morale ?? 0),
    enemy: (o.moraleBonus?.enemy ?? 0) + (setup.teams.enemy.morale ?? 0),
  };
  for (const team of ['player', 'enemy'] as Team[]) {
    const t = setup.teams[team];
    for (const spec of t.regiments) {
      if (!flagsAllow(spec.requiresFlags, flags)) continue;
      regiments.push(regimentFromSpec(spec, team, o.data, facing[team], moraleBonus[team] ?? 0));
    }
    for (const spec of t.heroes) {
      if (!flagsAllow(spec.requiresFlags, flags)) continue;
      heroes.push(heroFromSpec(spec, team, playerLevel));
    }
  }
  const pending = (setup.reinforcements ?? [])
    .filter((r) => flagsAllow(r.requiresFlags, flags))
    .map((r) => ({
      ...r,
      regiments: r.regiments.filter((x) => flagsAllow(x.requiresFlags, flags)),
      heroes: (r.heroes ?? []).filter((x) => flagsAllow(x.requiresFlags, flags)),
    }))
    .sort((a, b) => a.atSecond - b.atSecond);
  const state: BattleState = {
    id: o.id,
    scenarioId: o.scenarioId,
    name: setup.name,
    time: 0,
    step: 0,
    width: setup.width,
    height: setup.height,
    rows: setup.rows,
    legend: setup.legend,
    regiments,
    heroes,
    objectives: setup.objectives.map((x) => ({ ...x, progress: 0, status: 'active' })),
    pending,
    retreat: { player: { ...pRetreat }, enemy: { ...eRetreat } },
    generals: {
      ...(setup.teams.player.general ? { player: setup.teams.player.general } : {}),
      ...(setup.teams.enemy.general ? { enemy: setup.teams.enemy.general } : {}),
    },
    plans: {},
    timeLimit: setup.timeLimit,
    rng: { s: o.seed | 0 },
    revision: 1,
    mode: o.mode,
    log: [],
    outcome: null,
    zones: setup.zones,
    moraleBonus,
  };
  for (const team of ['player', 'enemy'] as Team[]) {
    state.plans[team] = { planId: chooseUtilityPlan(state, team, o.data), at: 0, source: 'rule' };
  }
  pushLog(state, `${setup.name}开战`);
  return state;
}

function arrivals(state: BattleState, data: KernelData): void {
  while (state.pending.length > 0 && (state.pending[0]?.atSecond ?? 0) <= state.time) {
    const r = state.pending.shift();
    if (!r) break;
    const facing = facingToward(
      state.retreat[r.team],
      state.retreat[r.team === 'player' ? 'enemy' : 'player'],
    );
    for (const spec of r.regiments) {
      if (state.regiments.some((x) => x.id === spec.id)) continue;
      state.regiments.push(
        regimentFromSpec(spec, r.team, data, facing, state.moraleBonus?.[r.team] ?? 0),
      );
    }
    for (const spec of r.heroes ?? []) {
      if (state.heroes.some((x) => x.id === spec.id)) continue;
      state.heroes.push(heroFromSpec(spec, r.team, 10));
    }
    pushLog(state, r.label ?? (r.team === 'player' ? '我方援军抵达' : '敌方援军抵达'));
  }
}

/** Move a point toward a goal along a cached path; returns true if it moved. */
function travel(
  state: BattleState,
  unit: { x: number; y: number; path?: { x: number; y: number }[] },
  goal: { x: number; y: number },
  speed: number,
  dt: number,
): boolean {
  if (Math.hypot(goal.x - unit.x, goal.y - unit.y) < 0.15) return false;
  let path = unit.path ?? [];
  const end = path[path.length - 1];
  if (!end || Math.hypot(end.x - goal.x, end.y - goal.y) > 1.5) {
    const g = nearestPassable(state, goal.x, goal.y);
    path = lineClear(state, unit, g) ? [g] : (findBattlePath(state, unit, g) ?? []);
    unit.path = path;
  }
  let budget = speed * dt;
  let moved = false;
  while (budget > 0 && path.length > 0) {
    const wp = path[0] as { x: number; y: number };
    const dx = wp.x - unit.x;
    const dy = wp.y - unit.y;
    const d = Math.hypot(dx, dy);
    if (d <= budget) {
      unit.x = wp.x;
      unit.y = wp.y;
      budget -= d;
      path.shift();
    } else {
      unit.x += (dx / d) * budget;
      unit.y += (dy / d) * budget;
      budget = 0;
    }
    moved = true;
  }
  return moved;
}

function inMeleeContact(state: BattleState, r: RegimentState): boolean {
  for (const o of state.regiments) {
    if (o.team === r.team || !active(o)) continue;
    if (meleeContact(state, o, r, contactRange(o, r))) return true;
  }
  for (const h of state.heroes) {
    if (h.team === r.team || h.down) continue;
    if (meleeContact(state, h, r, regimentRadius(r.count) + HERO_RADIUS + 0.3)) return true;
  }
  return false;
}

function targetPos(
  state: BattleState,
  id: string,
): { x: number; y: number; r: number } | undefined {
  const reg = state.regiments.find((x) => x.id === id);
  if (reg && onField(reg)) return { x: reg.x, y: reg.y, r: regimentRadius(reg.count) };
  const h = state.heroes.find((x) => x.id === id);
  if (h && !h.down) return { x: h.x, y: h.y, r: HERO_RADIUS };
  return undefined;
}

function moveRegiment(state: BattleState, data: KernelData, r: RegimentState, dt: number): boolean {
  const u = unitOf(data, r.typeId);
  const kind = terrainAt(state, r.x, r.y);
  const terrain = TERRAIN[kind];
  // forest folk (elves, hunters) and swamp ambushers move freely in their element
  const native = (u.tags ?? []).includes(
    kind === 'forest' ? 'forest' : kind === 'swamp' ? 'swamp' : '',
  );
  const speed =
    u.speed *
    (native ? 1 : Math.max(0.3, terrain.move)) *
    FORMATIONS[r.formation].move *
    fatigueSpeedFactor(r.fatigue);
  if (r.state === 'rout' || r.order?.kind === 'retreat') {
    const home = state.retreat[r.team];
    const moved = travel(state, r, home, speed * (r.state === 'rout' ? 1.15 : 1), dt);
    if (Math.hypot(home.x - r.x, home.y - r.y) < 1) {
      r.state = 'gone';
      r.path = [];
      pushLog(state, `${r.name}撤离了战场（余 ${r.count} 人）`);
    } else if (r.state !== 'rout') {
      r.state = 'march';
    }
    return moved;
  }
  const ranged = isRanged(u);
  const contact = inMeleeContact(state, r);
  if (contact) {
    r.state = 'engaged';
    r.path = [];
    return false;
  }
  const order = r.order;
  if (!order) {
    r.state = 'idle';
    return false;
  }
  if (order.kind === 'attack') {
    const t = targetPos(state, order.targetId);
    if (!t) {
      r.order = null;
      r.state = 'idle';
      return false;
    }
    const d = Math.hypot(t.x - r.x, t.y - r.y);
    if (ranged && d - t.r <= shootRange(state, u, r)) {
      r.state = 'engaged';
      r.path = [];
      r.facing = Math.atan2(t.y - r.y, t.x - r.x);
      return false;
    }
    const moved = travel(state, r, { x: t.x, y: t.y }, speed, dt);
    r.state = moved ? 'march' : 'idle';
    if (moved) r.facing = Math.atan2(t.y - r.y, t.x - r.x);
    return moved;
  }
  const goal = { x: order.x, y: order.y };
  const before = { x: r.x, y: r.y };
  const moved = travel(state, r, goal, speed, dt);
  if (moved) {
    r.facing = Math.atan2(r.y - before.y, r.x - before.x);
    r.state = 'march';
  } else {
    r.state = order.kind === 'hold' ? 'hold' : 'idle';
    if (order.kind === 'move') r.order = null;
  }
  return moved;
}

function moveHero(state: BattleState, h: HeroState, dt: number): void {
  if (h.down || !h.order) return;
  const moved = travel(state, h, h.order, HERO_SPEED, dt);
  if (!moved) {
    h.order = null;
    h.path = [];
  }
}

/** Keep friendly regiments from stacking on one spot. */
function separate(state: BattleState): void {
  const list = state.regiments.filter(onField);
  for (let i = 0; i < list.length; i++) {
    const a = list[i] as RegimentState;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j] as RegimentState;
      if (a.team !== b.team) continue;
      const need = (regimentRadius(a.count) + regimentRadius(b.count)) * 0.8;
      const d = dist(a, b);
      if (d >= need) continue;
      const ang = d > 1e-6 ? Math.atan2(b.y - a.y, b.x - a.x) : ((i * 7 + j * 13) % 628) / 100;
      const push = (need - d) / 2;
      const ax = a.x - Math.cos(ang) * push;
      const ay = a.y - Math.sin(ang) * push;
      const bx = b.x + Math.cos(ang) * push;
      const by = b.y + Math.sin(ang) * push;
      if (passableTile(state, Math.floor(ax), Math.floor(ay))) {
        a.x = ax;
        a.y = ay;
      }
      if (passableTile(state, Math.floor(bx), Math.floor(by))) {
        b.x = bx;
        b.y = by;
      }
    }
  }
}

/** Advance the battle by one kernel step. No-op once an outcome exists. */
export function stepBattle(state: BattleState, data: KernelData): void {
  if (state.outcome) return;
  state.flashes = [];
  state.step += 1;
  state.time = Math.round(state.step * STEP_SECONDS * 1000) / 1000;
  const dt = STEP_SECONDS;
  arrivals(state, data);
  if (state.step % AI_EVERY === 1) {
    const auto = state.mode === 'auto';
    runTeamAi(state, 'enemy', data, true);
    runTeamAi(state, 'player', data, auto);
    for (const h of state.heroes) {
      if (h.controller === 'ai' || auto) runHeroAi(state, h, data);
    }
  }
  const moved = new Set<string>();
  for (const r of state.regiments) {
    if (r.state === 'gone' || r.count <= 0) continue;
    if (moveRegiment(state, data, r, dt)) moved.add(r.id);
  }
  for (const h of state.heroes) moveHero(state, h, dt);
  separate(state);
  resolveContacts(state, data, dt);
  updateMorale(state, data, dt, moved);
  updateObjectives(state, data, dt);
}

/** Apply a new plan to a team (AI proposal, fallback or player delegation). */
export function setPlan(
  state: BattleState,
  team: Team,
  planId: PlanId,
  source: 'ai' | 'rule',
): void {
  state.plans[team] = { planId, at: state.time, source };
  state.revision += 1;
}
