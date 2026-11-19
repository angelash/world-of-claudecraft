// The door as a source of identity exposure (builtin_ai.md 5.6 `identity_door`: "玩家身体
// 消散进门、退回门内或从门里出来被目击"; PK-M1-18 routed it here). The player's body goes
// into a door where they fall (thousand_doors.md 6.3) and comes out of one where they
// reform: doors emits `identity.exposed` at both spots, and the NPC system lets the named
// onlookers within sight react (its reaction table and memory). Who sees it is the NPC
// system's: an exposure nobody stands near passes unseen.

import type { SystemContext } from '../../core/system';

function exposeAt(ctx: SystemContext, mapId: string, x: number, y: number): void {
  ctx.emit('identity.exposed', { kind: 'identity_door', mapId, x, y });
}

/** An entity died: when it is the player, the body went into a door where it fell. */
export function exposeOnDeath(
  ctx: SystemContext,
  d: { id: string; mapId: string; x: number; y: number },
): void {
  if (d.id !== ctx.world.slices.world.playerId) return;
  exposeAt(ctx, d.mapId, d.x, d.y);
}

/** The player reformed after a death (combat.player_returned): out of a door where they stand. */
export function exposeOnReturn(
  ctx: SystemContext,
  d: { toMap: string; toX: number; toY: number },
): void {
  exposeAt(ctx, d.toMap, d.toX, d.toY);
}
