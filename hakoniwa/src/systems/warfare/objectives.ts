// Objective tracking and the battle verdict (warfare_rts.md 6.3): annihilate, hold a zone
// for N seconds (lost after 15 s held by the enemy alone), kill a hero, survive; at the
// time limit the result is judged on objectives, then on remaining strength.

import { joinText, type TextParam, tr } from '../../core/text';
import { soldierDps, soldierEhp } from './combat_math';
import { active, heroById, inRect, type KernelData, other, unitOf } from './data';
import type { BattleState, ObjectiveState, Team, Victor } from './types';

export const HOLD_LOST_AFTER = 15;

export function teamStrength(state: BattleState, data: KernelData, team: Team): number {
  let s = 0;
  for (const r of state.regiments) {
    if (r.team !== team || !active(r)) continue;
    const u = unitOf(data, r.typeId);
    s += r.count * Math.sqrt(soldierDps(u) * soldierEhp(u)) * (0.5 + r.morale / 200);
  }
  for (const h of state.heroes) {
    if (h.team === team && !h.down) s += h.attack * 4 + h.hp / 20;
  }
  return s;
}

function pendingFor(state: BattleState, team: Team): boolean {
  return state.pending.some((p) => p.team === team && p.regiments.length > 0);
}

export function eliminated(state: BattleState, team: Team): boolean {
  if (pendingFor(state, team)) return false;
  return !state.regiments.some((r) => r.team === team && active(r));
}

function updateObjective(state: BattleState, o: ObjectiveState, dt: number): void {
  if (o.status !== 'active') return;
  const foe = other(o.team);
  switch (o.kind) {
    case 'annihilate':
      if (eliminated(state, foe)) o.status = 'done';
      break;
    case 'kill_hero': {
      const h = o.heroId ? heroById(state, o.heroId) : undefined;
      if (h?.down) o.status = 'done';
      break;
    }
    case 'survive':
      o.progress = state.time;
      if (eliminated(state, o.team)) o.status = 'failed';
      else if (state.time >= (o.seconds ?? 0)) o.status = 'done';
      break;
    case 'hold': {
      const zone = o.zone;
      if (!zone) break;
      const mine =
        state.regiments.some((r) => r.team === o.team && active(r) && inRect(r, zone)) ||
        state.heroes.some((h) => h.team === o.team && !h.down && inRect(h, zone));
      const theirs = state.regiments.some((r) => r.team === foe && active(r) && inRect(r, zone));
      if (theirs && !mine) o.lostFor = (o.lostFor ?? 0) + dt;
      else o.lostFor = 0;
      if ((o.lostFor ?? 0) >= HOLD_LOST_AFTER) {
        o.status = 'failed';
        break;
      }
      o.progress += dt;
      if (o.progress >= (o.seconds ?? 0)) o.status = 'done';
      break;
    }
  }
}

function required(state: BattleState, team: Team): ObjectiveState[] {
  return state.objectives.filter((o) => o.team === team && o.kind !== 'annihilate' && !o.decisive);
}

/** The verdict for the current state, or null while the battle goes on. */
export function verdict(
  state: BattleState,
  data: KernelData,
): { victor: Victor; reason: TextParam } | null {
  const pOut = eliminated(state, 'player');
  const eOut = eliminated(state, 'enemy');
  if (pOut && eOut) return { victor: 'draw', reason: tr('sys.warfare.outcome.both_routed') };
  if (eOut) return { victor: 'player', reason: tr('sys.warfare.outcome.enemy_out') };
  if (pOut) return { victor: 'enemy', reason: tr('sys.warfare.outcome.player_out') };
  for (const team of ['player', 'enemy'] as Team[]) {
    const decisive = state.objectives.find(
      (o) => o.team === team && o.status === 'done' && (o.kind === 'annihilate' || o.decisive),
    );
    if (decisive) {
      return {
        victor: team,
        reason: tr('sys.warfare.outcome.objective_done', { label: decisive.label }),
      };
    }
  }
  for (const team of ['player', 'enemy'] as Team[]) {
    const failed = state.objectives.find((o) => o.team === team && o.status === 'failed');
    if (failed) {
      return {
        victor: other(team),
        reason: tr('sys.warfare.outcome.objective_failed', { label: failed.label }),
      };
    }
  }
  for (const team of ['player', 'enemy'] as Team[]) {
    const req = required(state, team);
    if (req.length > 0 && req.every((o) => o.status === 'done')) {
      return {
        victor: team,
        reason: tr('sys.warfare.outcome.objective_done', {
          label: joinText(
            'list',
            req.map((o) => o.label),
          ),
        }),
      };
    }
  }
  if (state.time >= state.timeLimit) {
    const p = teamStrength(state, data, 'player');
    const e = teamStrength(state, data, 'enemy');
    const ratio = p / Math.max(1, e);
    if (ratio >= 1.5) return { victor: 'player', reason: tr('sys.warfare.outcome.time_up_player') };
    if (ratio <= 1 / 1.5)
      return { victor: 'enemy', reason: tr('sys.warfare.outcome.time_up_enemy') };
    return { victor: 'draw', reason: tr('sys.warfare.outcome.time_up_draw') };
  }
  return null;
}

export function updateObjectives(state: BattleState, data: KernelData, dt: number): void {
  for (const o of state.objectives) updateObjective(state, o, dt);
  if (!state.outcome) state.outcome = verdict(state, data);
}
