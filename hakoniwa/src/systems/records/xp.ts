// Rewards are caused by facts, never a read getter. The saved settlement ledger prevents
// repeated visits, repeated deaths and loading the same cleared dungeon from paying again.
import type { EventMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { unitOf } from '../combat';
import { creditedToParty } from '../combat/rewards';
import { playerFloor } from '../dungeons/run';
import { readDungeons } from '../dungeons/slice';
import { getEntity, playerEntity } from '../world';
import { discoveredRewards } from '../world/discovery';
import { recordsSlice } from './slice';
import type { XpLedger, XpReward } from './xp_types';

export { xpRewardsProblems } from './xp_validation';

export function xpLedger(ctx: SystemContext): XpLedger {
  const s = recordsSlice(ctx.world);
  if (!s.xp) {
    s.xp = { settled: {} };
    // Old saves already paid their old clears. Do not grant a retroactive second first.
    for (const r of ctx.content.xpRewards?.entries ?? []) {
      const t = r.trigger;
      const key =
        t.kind === 'boss'
          ? `boss.${t.monsterId}.defeated`
          : t.kind === 'dungeon'
            ? `dg.${t.dungeonId}.cleared`
            : t.kind === 'nest'
              ? `dg.${t.nestId}.cleared`
              : null;
      // Regrowth resets a nest's current clear mirror, but never its saved clear tick.
      const clearedNest =
        t.kind === 'nest' && (readDungeons(ctx.world)?.nests[t.nestId]?.clearedTick ?? -1) >= 0;
      if ((key && ctx.flag(key)) || clearedNest) s.xp.settled[r.id] = { tick: ctx.tick, amount: 0 };
    }
  }
  return s.xp;
}

export function fadedXp(amount: number, playerLevel: number, entryLevel: number): number {
  const d = playerLevel - entryLevel;
  const factor = d <= 5 ? 1 : d === 6 ? 0.8 : d === 7 ? 0.6 : d === 8 ? 0.4 : d === 9 ? 0.2 : 0.1;
  return Math.round(amount * factor);
}

export function settleXpReward(ctx: SystemContext, row: XpReward, earned: boolean): boolean {
  const s = xpLedger(ctx);
  if (s.settled[row.id]) return false;
  const p = playerEntity(ctx.world);
  const u = p ? unitOf(ctx.world, p.id) : undefined;
  const amount = earned && u ? fadedXp(row.amount, u.level, row.level) : 0;
  s.settled[row.id] = { tick: ctx.tick, amount };
  if (amount > 0 && p) ctx.emit('xp.awarded', { entityId: p.id, amount, reason: row.id });
  return true;
}

export function tickDiscoveries(ctx: SystemContext): void {
  const rows = ctx.content.xpRewards?.entries;
  if (!rows?.length) return;
  const ledger = xpLedger(ctx);
  if (!/^act[1-6]$/.test(String(ctx.flag('act')))) {
    delete ledger.vista;
    delete ledger.position;
    return;
  }
  for (const row of discoveredRewards(ctx.world, ctx.content, rows, ledger))
    settleXpReward(ctx, row, true);
}

function credited(ctx: SystemContext, victimId: string, killerId?: string): boolean {
  const victim = unitOf(ctx.world, victimId);
  const e = getEntity(ctx.world, victimId);
  const p = playerEntity(ctx.world);
  return (
    !!victim &&
    !!e &&
    !!p?.alive &&
    !p.hidden &&
    p.mapId === e.mapId &&
    Math.hypot(p.x - e.x, p.y - e.y) <= 40 &&
    creditedToParty(ctx, victim, unitOf(ctx.world, killerId) ?? null)
  );
}

export function firstVictory(
  ctx: SystemContext,
  victimId: string,
  monsterId: string,
  killerId?: string,
): void {
  for (const row of ctx.content.xpRewards?.entries ?? []) {
    const t = row.trigger;
    if (t.kind === 'boss' && t.monsterId === monsterId)
      settleXpReward(ctx, row, credited(ctx, victimId, killerId));
  }
}

/** Dungeon clearing is only a reward after participating in its core's defeat, in its floor. */
export function firstDungeonClear(ctx: SystemContext, d: EventMap['dungeon.cleared']): void {
  const p = playerEntity(ctx.world);
  for (const row of ctx.content.xpRewards?.entries ?? []) {
    const t = row.trigger;
    if (
      (t.kind === 'dungeon' && d.kind === 'dungeon' && t.dungeonId === d.id) ||
      (t.kind === 'nest' && d.kind === 'nest' && t.nestId === d.id)
    ) {
      const floor =
        d.kind === 'dungeon' ? playerFloor(ctx)?.dungeon.id === d.id : p?.mapId === t.mapId;
      const earned = !!floor && !!d.victimId && credited(ctx, d.victimId, d.killerId);
      settleXpReward(ctx, row, earned);
    }
  }
}
