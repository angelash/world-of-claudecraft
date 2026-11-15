// Daily national bookkeeping (grand_strategy_slg.md 2.2, 2.5, 5.7, 10): tax income, army
// upkeep with the superlinear standing-army surcharge, admin-capacity overextension,
// stability, war weariness, aggressive-expansion decay, coring and garrison recovery.

import type { SystemContext } from '../../core/system';
import { DAYS_PER_YEAR } from '../../core/time';
import { kernelData } from '../warfare/data';
import { provinceDef } from './map';
import { armiesOf, atAnyWar, populationOf, provincesOf, strat } from './state';
import type { NationState } from './types';

/** Copper per gold (treasuries are in gold). */
export const COPPER_PER_GOLD = 10000;
/** AE decays about 30 percent per game year. */
export const AE_DECAY_PER_DAY = 0.3 / DAYS_PER_YEAR;
/** Newly taken provinces pay half until cored. */
export const CORE_DAYS = 180;

export function adminCapacity(n: NationState, adminBase: number): number {
  return adminBase + Math.floor(n.legitimacy / 25);
}

export function dailyUpkeep(ctx: SystemContext, nationId: string): number {
  const s = strat(ctx);
  const units = kernelData(ctx.content.regiment_types ?? []).units;
  let gold = 0;
  let soldiers = 0;
  for (const a of armiesOf(s, nationId)) {
    for (const r of a.regiments) {
      soldiers += r.count;
      gold += (r.count * (units.get(r.typeId)?.upkeep ?? 2400)) / 30 / COPPER_PER_GOLD;
    }
  }
  const pop = Math.max(1, populationOf(s, nationId));
  const share = soldiers / pop;
  // each percent of population under arms above 2% raises pay by 15 percent
  const surcharge = share > 0.02 ? 1.15 ** ((share - 0.02) / 0.01) : 1;
  return gold * surcharge;
}

export function dailyIncome(ctx: SystemContext, nationId: string): number {
  const s = strat(ctx);
  const n = s.nations[nationId];
  if (!n) return 0;
  let gold = 0;
  for (const pid of provincesOf(s, nationId)) {
    const p = s.provinces[pid];
    const def = provinceDef(ctx.content, pid);
    if (!p || !def) continue;
    const core = p.heldDays >= CORE_DAYS || def.owner === nationId ? 1 : 0.5;
    gold += (def.tax / DAYS_PER_YEAR) * core * (1 - p.devastation) * (p.siege ? 0.3 : 1);
  }
  const stabilityFactor = 0.5 + n.stability / 200;
  const weariness = 1 - n.warWeariness / 200;
  return gold * stabilityFactor * weariness * (0.8 + n.taxRate * 2);
}

export function runNationDay(ctx: SystemContext, active: boolean): void {
  const s = strat(ctx);
  for (const n of Object.values(s.nations)) {
    if (!n.alive) continue;
    const def =
      n.id === 'player'
        ? ctx.content.slg_config?.playerNation
        : ctx.content.slg_nations?.find((x) => x.id === n.id);
    n.incomeToday = Math.round(dailyIncome(ctx, n.id) * 100) / 100;
    n.upkeepToday = Math.round(dailyUpkeep(ctx, n.id) * 100) / 100;
    n.treasury = Math.round((n.treasury + n.incomeToday - n.upkeepToday) * 100) / 100;
    const war = atAnyWar(s, n.id);
    if (n.treasury < 0) n.stability -= 0.5;
    if (active) {
      const over = provincesOf(s, n.id).length - adminCapacity(n, def?.adminBase ?? 5);
      if (over > 0) n.stability -= 0.05 * over;
      n.stability += war ? -0.05 : n.stability < 70 ? 0.05 : 0;
      // high autonomy slows weariness growth (grand_strategy_slg.md 5.7)
      n.warWeariness = war
        ? n.warWeariness + 0.2 * (1.2 - n.autonomy / 250)
        : Math.max(0, n.warWeariness - 0.3);
    }
    n.stability = Math.max(0, Math.min(100, Math.round(n.stability * 100) / 100));
    n.warWeariness = Math.max(0, Math.min(100, Math.round(n.warWeariness * 100) / 100));
    for (const k of Object.keys(n.ae).sort()) {
      const v = (n.ae[k] ?? 0) * (1 - AE_DECAY_PER_DAY);
      if (v < 0.5) delete n.ae[k];
      else n.ae[k] = Math.round(v * 100) / 100;
    }
  }
  for (const pid of Object.keys(s.provinces).sort()) {
    const p = s.provinces[pid];
    const def = provinceDef(ctx.content, pid);
    if (!p || !def) continue;
    p.heldDays += 1;
    p.devastation = Math.max(0, Math.round((p.devastation - 0.002) * 1000) / 1000);
    if (!p.siege && p.owner && p.garrison < def.garrison) {
      p.garrison = Math.min(
        def.garrison,
        p.garrison + Math.max(1, Math.round(def.garrison * 0.01)),
      );
    }
  }
}
