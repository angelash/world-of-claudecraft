// Morale and fatigue per kernel step (warfare_rts.md 3.4): baseline recovery, casualty
// shock, fatigue drain, the Dian-zone drain, rout below 15 with the nearby-rout penalty,
// and rallying near a hero or a living general.

import { active, dist, flash, type KernelData, pushLog, unitOf } from './data';
import { TERRAIN, terrainAt } from './terrain';
import type { BattleState, RegimentState } from './types';

export const ROUT_BELOW = 15;
export const RALLY_TO = 30;

export function moraleBaseline(state: BattleState, r: RegimentState, data: KernelData): number {
  const u = unitOf(data, r.typeId);
  return u.morale + (r.general && !r.leaderLost ? 5 : 0) + (state.moraleBonus?.[r.team] ?? 0);
}

function rout(state: BattleState, r: RegimentState): void {
  r.state = 'rout';
  r.order = { kind: 'retreat' };
  r.path = [];
  pushLog(state, `${r.name}溃退了`);
  flash(state, 'rout', r.id, r.team);
  for (const o of state.regiments) {
    if (o !== r && o.team === r.team && active(o) && dist(o, r) <= 5) {
      o.morale = Math.max(0, o.morale - 4);
    }
  }
}

export function updateMorale(
  state: BattleState,
  data: KernelData,
  dt: number,
  moved: Set<string>,
): void {
  for (const r of state.regiments) {
    if (r.state === 'gone' || r.count <= 0) continue;
    const u = unitOf(data, r.typeId);
    const tags = u.tags ?? [];
    const terrain = TERRAIN[terrainAt(state, r.x, r.y)];
    // fatigue
    const heavy = u.armorType === 'heavy' ? 1.2 : 1;
    if (r.busy) r.fatigue += 1.0 * dt * terrain.fatigue * heavy;
    else if (moved.has(r.id)) r.fatigue += 0.5 * dt * terrain.fatigue * heavy;
    else r.fatigue -= 1.5 * dt;
    r.fatigue = Math.max(0, Math.min(100, r.fatigue));
    if (r.fatigue > 80) r.morale -= 0.1 * dt;
    // Dian zone drains outsiders (not monsters, undead or Dian hunters)
    if (
      terrainAt(state, r.x, r.y) === 'dian' &&
      !tags.includes('dian') &&
      !tags.includes('undead') &&
      !tags.includes('anti_monster')
    ) {
      r.morale -= dt / 60;
    }
    // casualty shock: more than 10% lost within 30 s
    let recent = 0;
    r.losses = r.losses.filter((l) => state.time - l.t <= 30);
    for (const l of r.losses) recent += l.n;
    if (recent >= r.maxCount * 0.12 && (r.shockAt === undefined || state.time - r.shockAt >= 30)) {
      r.morale -= 12;
      r.shockAt = state.time;
    }
    // recovery toward baseline when out of contact
    const base = moraleBaseline(state, r, data);
    if (!r.busy && r.state !== 'rout') {
      if (r.morale < base) r.morale = Math.min(base, r.morale + 0.5 * dt);
      else if (r.morale > base) r.morale = Math.max(base, r.morale - 0.2 * dt);
    }
    if (tags.includes('never_rout')) r.morale = Math.max(ROUT_BELOW, r.morale);
    r.morale = Math.max(0, Math.min(100, r.morale));

    if (r.state !== 'rout' && r.morale < ROUT_BELOW) {
      rout(state, r);
      continue;
    }
    if (r.state === 'rout') {
      const enemyNear = state.regiments.some(
        (o) => o.team !== r.team && active(o) && dist(o, r) <= 6,
      );
      const helper =
        state.heroes.some((h) => h.team === r.team && !h.down && dist(h, r) <= 8) ||
        (!!r.general && !r.leaderLost);
      if (!enemyNear && helper) {
        r.morale = Math.min(100, r.morale + 1 * dt);
        if (r.morale >= RALLY_TO) {
          r.state = 'idle';
          r.order = null;
          r.path = [];
          pushLog(state, `${r.name}重整完毕`);
        }
      }
    }
  }
}
