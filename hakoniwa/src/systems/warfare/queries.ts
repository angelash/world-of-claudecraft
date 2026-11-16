// Read-only queries for the client and the editor: the live battlefield view, the
// scenario list and recent results.

import type { ContentMap } from '../../core/contracts';
import { type TextParam, tr } from '../../core/text';
import { planName } from './ai';
import { isRanged, regimentRadius } from './combat_math';
import { kernelData, unitOf } from './data';
import type {
  BattleLogEntry,
  BattleResultRecord,
  BattleTerrain,
  Formation,
  ObjectiveKind,
  PlanId,
  Rect,
  RegimentStateName,
  Team,
  UnitOrder,
  UnitRole,
  Victor,
  WarfareSlice,
} from './types';

type WorldWithWarfare = { slices: { warfare: WarfareSlice } };

export interface RegimentView {
  id: string;
  team: Team;
  controller: 'player' | 'ai';
  typeId: string;
  typeName: TextParam;
  role: UnitRole;
  name: TextParam;
  count: number;
  maxCount: number;
  x: number;
  y: number;
  radius: number;
  facing: number;
  formation: Formation;
  formations: Formation[];
  state: RegimentStateName;
  morale: number;
  fatigue: number;
  order: UnitOrder | null;
  range: number;
  ranged: boolean;
  broken: boolean;
  general?: string;
}

export interface HeroView {
  id: string;
  name: string;
  team: Team;
  controller: 'player' | 'ai';
  ref?: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  down: boolean;
  auraRadius: number;
  abilities: {
    id: string;
    name: string;
    kind: string;
    ready: boolean;
    readyIn: number;
    range: number;
  }[];
}

export interface BattleView {
  id: string;
  scenarioId: string;
  name: TextParam;
  mode: 'manual' | 'auto';
  time: number;
  timeLimit: number;
  width: number;
  height: number;
  rows: string[];
  legend: Record<string, BattleTerrain>;
  regiments: RegimentView[];
  heroes: HeroView[];
  objectives: {
    id: string;
    team: Team;
    kind: ObjectiveKind;
    label: TextParam;
    progress: number;
    seconds?: number;
    status: 'active' | 'done' | 'failed';
    zone?: Rect;
    /** the hero a kill_hero objective names */
    heroId?: string;
  }[];
  plans: Partial<Record<Team, { planId: PlanId; name: TextParam }>>;
  zones: { id: string; name: string; rect: Rect }[];
  retreat: Record<Team, { x: number; y: number }>;
  log: BattleLogEntry[];
  outcome: { victor: Victor; reason: TextParam } | null;
}

/**
 * The battle on the field, or the one that just ended (its outcome set) until the next
 * battle begins, so the result can be shown.
 */
export function battleView(world: WorldWithWarfare, content: ContentMap): BattleView | null {
  const b = world.slices.warfare.battle ?? world.slices.warfare.last ?? null;
  if (!b) return null;
  const data = kernelData(content.regiment_types ?? [], content.hero_abilities ?? []);
  const plans: BattleView['plans'] = {};
  for (const team of ['player', 'enemy'] as Team[]) {
    const p = b.plans[team];
    if (p) plans[team] = { planId: p.planId, name: planName(p.planId) };
  }
  return {
    id: b.id,
    scenarioId: b.scenarioId,
    name: b.name,
    mode: b.mode,
    time: b.time,
    timeLimit: b.timeLimit,
    width: b.width,
    height: b.height,
    rows: b.rows,
    legend: b.legend,
    regiments: b.regiments.map((r) => {
      const u = unitOf(data, r.typeId);
      return {
        id: r.id,
        team: r.team,
        controller: r.controller,
        typeId: r.typeId,
        typeName: u.name,
        role: u.role,
        name: r.name,
        count: r.count,
        maxCount: r.maxCount,
        x: r.x,
        y: r.y,
        radius: regimentRadius(r.count),
        facing: r.facing,
        formation: r.formation,
        formations: u.formations,
        state: r.state,
        morale: Math.round(r.morale),
        fatigue: Math.round(r.fatigue),
        order: r.order,
        range: u.range,
        ranged: isRanged(u),
        broken: r.brokenUntil > b.time,
        general: r.general,
      };
    }),
    heroes: b.heroes.map((h) => ({
      id: h.id,
      name: h.name,
      team: h.team,
      controller: h.controller,
      ref: h.ref,
      x: h.x,
      y: h.y,
      hp: Math.max(0, Math.round(h.hp)),
      maxHp: h.maxHp,
      down: h.down,
      auraRadius: h.auraRadius,
      abilities: h.abilities.map((a) => {
        const def = data.abilities.get(a.id);
        return {
          id: a.id,
          name: def?.name ?? a.id,
          kind: def?.kind ?? 'strike',
          ready: a.readyAt <= b.time,
          readyIn: Math.max(0, Math.round((a.readyAt - b.time) * 10) / 10),
          range: def?.range ?? 0,
        };
      }),
    })),
    objectives: b.objectives.map((o) => ({
      id: o.id,
      team: o.team,
      kind: o.kind,
      label: o.label,
      progress: Math.round(o.progress * 10) / 10,
      seconds: o.seconds,
      status: o.status,
      zone: o.zone,
      heroId: o.heroId,
    })),
    plans,
    zones: b.zones ?? [],
    retreat: b.retreat,
    log: b.log.slice(-12),
    outcome: b.outcome,
  };
}

export function scenarioList(
  content: ContentMap,
): { id: string; name: string; scale: string; act?: string; desc: string }[] {
  return (content.battle_scenarios ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    scale: s.scale,
    act: s.act,
    desc: s.desc,
  }));
}

/** The battle waiting for the player's confirmation (flag `war.pending`), if any. */
export function pendingScenario(
  world: WorldWithWarfare & { meta: { flags: Record<string, unknown> } },
  content: ContentMap,
): { id: string; name: TextParam; desc: TextParam; scale: string } | null {
  const id = String(world.meta.flags['war.pending'] ?? '');
  if (!id) return null;
  const s = content.battle_scenarios?.find((x) => x.id === id);
  if (s) return { id, name: s.name, desc: s.desc, scale: s.scale };
  const custom = world.slices.warfare.custom[id];
  if (custom) {
    return {
      id,
      name: custom.name,
      desc: tr('sys.warfare.scenario.continental_desc'),
      scale: 'legion',
    };
  }
  return null;
}

export function recentResults(world: WorldWithWarfare): BattleResultRecord[] {
  return [...world.slices.warfare.results];
}
