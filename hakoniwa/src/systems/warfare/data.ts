// Kernel lookups (regiment types, hero abilities) cached per content array, plus small
// shared helpers over the battle state. Content arrays are immutable at runtime.

import type { FlagValue } from '../../core/contracts';
import type {
  BattleState,
  HeroAbilityDef,
  HeroState,
  RegimentState,
  Team,
  UnitTypeDef,
} from './types';

export interface KernelData {
  units: Map<string, UnitTypeDef>;
  abilities: Map<string, HeroAbilityDef>;
}

const unitCache = new WeakMap<UnitTypeDef[], Map<string, UnitTypeDef>>();
const abilityCache = new WeakMap<HeroAbilityDef[], Map<string, HeroAbilityDef>>();
const EMPTY_ABILITIES: HeroAbilityDef[] = [];

export function kernelData(
  units: UnitTypeDef[],
  abilities: HeroAbilityDef[] = EMPTY_ABILITIES,
): KernelData {
  let u = unitCache.get(units);
  if (!u) {
    u = new Map(units.map((d) => [d.id, d]));
    unitCache.set(units, u);
  }
  let a = abilityCache.get(abilities);
  if (!a) {
    a = new Map(abilities.map((d) => [d.id, d]));
    abilityCache.set(abilities, a);
  }
  return { units: u, abilities: a };
}

/** Fallback soldier for unknown type ids (keeps the kernel total; content validation reports it). */
export const UNKNOWN_UNIT: UnitTypeDef = {
  id: 'unknown',
  name: '未知兵种',
  race: 'human',
  role: 'militia',
  quality: 'recruit',
  level: 1,
  hp: 80,
  armor: 0,
  armorType: 'none',
  dmgMin: 2,
  dmgMax: 4,
  dmgType: 'slash',
  attackInterval: 2,
  range: 1,
  hitBase: 0.8,
  dodgeBase: 0.05,
  speed: 1,
  morale: 40,
  formations: ['line'],
  cost: 0,
  upkeep: 0,
  desc: '',
};

export function unitOf(data: KernelData, typeId: string): UnitTypeDef {
  return data.units.get(typeId) ?? UNKNOWN_UNIT;
}

export function other(team: Team): Team {
  return team === 'player' ? 'enemy' : 'player';
}

export function flagsAllow(
  required: string[] | undefined,
  flags: Record<string, FlagValue> | undefined,
): boolean {
  if (!required || required.length === 0) return true;
  return required.every((f) => !!flags?.[f]);
}

/** Regiments still fighting (not routed, not off the field, not destroyed). */
export function active(r: RegimentState): boolean {
  return r.state !== 'gone' && r.state !== 'rout' && r.count > 0;
}

export function onField(r: RegimentState): boolean {
  return r.state !== 'gone' && r.count > 0;
}

export function heroUp(h: HeroState): boolean {
  return !h.down;
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function regimentById(state: BattleState, id: string): RegimentState | undefined {
  return state.regiments.find((r) => r.id === id);
}

export function heroById(state: BattleState, id: string): HeroState | undefined {
  return state.heroes.find((h) => h.id === id);
}

export function inRect(
  p: { x: number; y: number },
  r: { x: number; y: number; w: number; h: number },
): boolean {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}

export function pushLog(state: BattleState, text: string): void {
  state.log.push({ t: Math.round(state.time * 10) / 10, text });
  if (state.log.length > 80) state.log.splice(0, state.log.length - 80);
}

export function flash(
  state: BattleState,
  kind: 'rout' | 'hero_down' | 'ability',
  id: string,
  team: Team,
  extra?: { abilityId?: string; targetId?: string; felled?: number },
): void {
  if (!state.flashes) state.flashes = [];
  state.flashes.push({ kind, id, team, ...extra });
}
