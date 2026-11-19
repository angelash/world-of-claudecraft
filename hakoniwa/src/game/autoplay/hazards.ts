// Ground warnings are visible player information. Leave their actual cells with an
// ordinary move order and keep that safe position until the warning ends.
import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { telegraphsOn } from '../../systems/combat/telegraph';
import { isHostilePair } from '../../systems/combat/units';
import { inCells, safeSpotBy } from '../../systems/party/danger';
import { findPath, isWalkable, playerEntity, walkMap } from '../../systems/world';
import type { Waypoint } from '../../systems/world/types';

interface HazardHost {
  readonly world: World;
  readonly content: ContentMap;
  intent: { what: string };
  walkTo(mapId: string, x: number, y: number, radius?: number): 'here' | 'walking' | 'blocked';
  stopMoving(): void;
}

export class WarningAvoidance {
  private hold: { mapId: string; warnings: string[]; point: Waypoint | null } | null = null;

  /** True while escaping or holding out of a warning, before any combat approach. */
  avoid(bot: HazardHost): boolean {
    const { world } = bot;
    const player = playerEntity(world);
    const self = world.slices.combat.units[world.slices.world.playerId];
    if (!player?.alive || !self) {
      this.hold = null;
      return false;
    }
    const warnings = telegraphsOn(world, player.mapId).filter((warning) => {
      const caster = world.slices.combat.units[warning.casterId];
      return (
        !warning.mark &&
        (!caster || isHostilePair(caster, self)) &&
        (warning.pulse ? warning.pulse.until : warning.settle) > world.meta.tick
      );
    });
    const live = new Set(warnings.map((w) => w.id));
    if (
      this.hold &&
      (this.hold.mapId !== player.mapId || !this.hold.warnings.some((id) => live.has(id)))
    )
      this.hold = null;
    const danger = (x: number, y: number) => warnings.some((w) => inCells(w.cells, x, y));
    const inside = warnings.filter((w) => inCells(w.cells, player.x, player.y));
    if (inside.length === 0 && !this.hold) return false;
    const map = walkMap(bot, player.mapId);
    if (!map) return false;
    if (inside.length > 0) {
      const point = this.hold?.point;
      const usable =
        point &&
        isWalkable(map, point.x, point.y) &&
        !danger(point.x, point.y) &&
        findPath(map, player, point) !== null;
      this.hold = {
        mapId: player.mapId,
        warnings: [...new Set([...(this.hold?.warnings ?? []), ...inside.map((w) => w.id)])],
        point: usable
          ? point
          : safeSpotBy(
              (x, y) =>
                !isWalkable(map, x, y) || danger(x, y) || findPath(map, player, { x, y }) === null,
              player.x,
              player.y,
            ),
      };
    }
    bot.intent = { what: 'leave the ground warning' };
    const point = this.hold?.point;
    if (point && Math.hypot(point.x - player.x, point.y - player.y) > 0.3)
      bot.walkTo(player.mapId, point.x, point.y, 0.3);
    else bot.stopMoving();
    return true;
  }
}
