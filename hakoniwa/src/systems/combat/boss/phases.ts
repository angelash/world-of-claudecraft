// Boss phases (combat_and_classes.md 10.2): entered in data order and never left, each by
// its health line (`belowPct`) or its fight time (`atSec`, whatever the health). Entering
// swaps the ability list, lays the phase aura, speaks the line, makes the boss untargetable
// for `untargetable` seconds (its clocks run on) and runs `onEnter`.

import type { SystemContext } from '../../../core/system';
import { applyAura } from '../auras';
import { secs } from '../defs';
import type { Unit } from '../types';
import { runActions } from './actions';
import { BOSS_ORIGIN, bossSay, fightOf, healthFrac, mechOf, pastSec } from './fight';

/** Enter every phase that came; returns the current phase count. */
export function tickPhases(ctx: SystemContext, u: Unit, maxHp: number): number {
  const mm = mechOf(ctx, u);
  const brain = u.ai;
  if (!mm || !brain) return 0;
  const phases = mm.m.phases ?? [];
  const frac = healthFrac(u, maxHp);
  for (let i = brain.phase; i < phases.length; i++) {
    const p = phases[i];
    if (!p) break;
    const byTime = p.atSec !== undefined && pastSec(ctx, u, p.atSec);
    const byHealth = p.belowPct !== undefined && frac <= p.belowPct;
    if (!byTime && !byHealth) break;
    brain.phase = i + 1;
    if (p.abilities) u.phaseAbilities = [...p.abilities];
    if (p.aura) applyAura(ctx, u, p.aura, u, { origin: BOSS_ORIGIN });
    bossSay(ctx, u, mm.mon, `mechanics.phases.${i}.say`, p.say);
    if (p.untargetable && p.untargetable > 0)
      fightOf(ctx, u).untargetableUntil = ctx.tick + secs(p.untargetable);
    ctx.emit('combat.boss_phase', {
      entityId: u.id,
      bossId: mm.mon.id,
      phase: brain.phase,
      name: p.name,
    });
    if (p.onEnter) runActions(ctx, u, p.onEnter, `mechanics.phases.${i}.on_enter`);
  }
  return brain.phase;
}
