// Soft and hard enrage, and ramping (combat_and_classes.md 10.5). The soft enrage comes once
// by health line or fight time, and its aura stays: the difficulty moves it (16: the line
// times `soft_enrage`, story 0.7 and hard 1.15; a time by the mirror, story 1.3 and hard
// 0.85). The hard enrage (`aur_st_berserk`: damage +500%, attack speed +150%) is only for
// dungeon lords and above that are no story boss; its time defaults to 2.5 target kill
// times rounded to 5 seconds (17.4), and no difficulty moves it. A ramp lays one more stack
// of its aura every N seconds of the fight (Sasha's tempering).

import type { SystemContext } from '../../../core/system';
import { applyAura } from '../auras';
import { bossLayer } from '../control';
import { secs } from '../defs';
import { combatMod } from '../difficulty';
import { berserkSeconds } from '../formulas';
import type { Unit } from '../types';
import { BOSS_ORIGIN, bossSay, fightOf, healthFrac, mechOf, pastSec } from './fight';

/** The hard enrage aura (catalog_abilities_talents.md 7.4). */
export const BERSERK = 'aur_st_berserk';

/** When a boss's hard enrage comes, in fight seconds; null when it has none (10.5). */
export function berserkAt(ctx: SystemContext, u: Unit): number | null {
  const mm = mechOf(ctx, u);
  const b = mm?.m.berserk;
  if (!mm || !b) return null;
  if (mm.mon.tier === 'story' || mm.mon.tier === 'tutorial') return null;
  const layer = bossLayer(ctx.content, u);
  if (!layer || layer === 'lair') return null;
  return b.atSec ?? berserkSeconds(mm.mon.maxLevel, layer);
}

export function tickEnrage(ctx: SystemContext, u: Unit, maxHp: number): void {
  const mm = mechOf(ctx, u);
  const brain = u.ai;
  if (!mm || !brain) return;
  const m = mm.m;
  const fight = fightOf(ctx, u);
  if (m.enrage && !brain.enraged) {
    const line = combatMod(ctx.world, 'soft_enrage');
    const byHealth =
      m.enrage.belowPct !== undefined && healthFrac(u, maxHp) <= m.enrage.belowPct * line;
    const byTime = m.enrage.atSec !== undefined && pastSec(ctx, u, m.enrage.atSec * (2 - line));
    if (byHealth || byTime) {
      brain.enraged = true;
      applyAura(ctx, u, m.enrage.aura, u, { permanent: true, origin: BOSS_ORIGIN });
      bossSay(ctx, u, mm.mon, 'mechanics.enrage.say', m.enrage.say);
    }
  }
  if (!fight.berserk) {
    const at = berserkAt(ctx, u);
    if (at !== null && pastSec(ctx, u, at)) {
      fight.berserk = true;
      applyAura(ctx, u, m.berserk?.aura ?? BERSERK, u, {
        permanent: true,
        state: true,
        origin: BOSS_ORIGIN,
      });
    }
  }
  if (m.ramp && brain.rampAt > 0 && ctx.tick >= brain.rampAt) {
    brain.rampAt = ctx.tick + secs(m.ramp.every);
    applyAura(ctx, u, m.ramp.aura, u, { origin: BOSS_ORIGIN });
  }
}
